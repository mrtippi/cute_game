// Getting stronger with the energy the explorer has: aim for the best weapon it can afford, work out the
// materials still missing and which creatures drop them, hunt those, then buy. Crystal upgrades and
// forging soak up what is left over.
import { fight } from './combat.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

import { weaponPower } from '../lib/weapons.mjs';
const bestOwnedAttack = (s, weapons) => Math.max(0, ...weapons.filter(w => w.id !== 'harpoon' && (s.bag[w.id] > 0 || s.gear.weapon === w.id)).map(weaponPower));

/**
 * The next weapon worth working toward: clearly stronger than any owned, affordable now, with every
 * missing material droppable by creatures on worlds already discovered. Closest to done first.
 */
export async function gearGoal(bot) {
  const s = await bot.game.snap();
  const weapons = await bot.page.evaluate(() => window.__zg.weapons());
  const have = bestOwnedAttack(s, weapons);
  const mats = [...new Set(weapons.flatMap(w => Object.keys(w.materials)))];
  const sources = await bot.page.evaluate(ids => window.__zg.lootSources(ids), mats);
  const plans = [];
  for (const w of weapons) {
    if (w.id === 'harpoon' || weaponPower(w) < Math.max(have * 1.15, have + 3) || w.price > s.energy * .85) continue;
    const missing = {}; let reachable = true, effort = 0;
    for (const [id, need] of Object.entries(w.materials)) {
      const short = need - (s.bag[id] ?? 0); if (short <= 0) continue;
      const from = (sources[id] ?? []).filter(src => src.planets.some(p => s.discovered.includes(p)) && src.chance >= .05);
      if (!from.length) { reachable = false; break; }
      missing[id] = { short, from };
      effort += short / Math.max(...from.map(f => f.chance));
    }
    if (reachable) plans.push({ ...w, missing, effort, gain: weaponPower(w) - have });
  }
  plans.sort((a, b) => (a.effort - a.gain * 2) - (b.effort - b.gain * 2));
  return plans[0] ?? null;
}

/** Creatures here that drop what the goal still needs. */
export function huntTypes(goal, s) {
  if (!goal) return [];
  const types = new Set(Object.values(goal.missing).flatMap(m => m.from.filter(f => f.planets.includes(s.planet)).map(f => f.type)));
  return [...types].filter(type => s.enemies.some(e => e.type === type));
}

/** Hunt the creatures that drop the goal's missing materials. */
export async function gatherForGoal(bot, { goal } = {}) {
  const { game, note } = bot;
  goal ??= await gearGoal(bot); if (!goal) return 'no gear goal';
  const s = await game.snap(), types = huntTypes(goal, s);
  if (!types.length) return `materials for ${goal.id} are on another world`;
  note(`gathering ${Object.keys(goal.missing).join(', ')} for ${goal.id}`, 'gear');
  let kills = 0;
  for (const type of types) {
    const r = await fight(bot, { count: 3, type, range: 70, timeout: 90000 });
    kills += Number(r.match(/kills (\d+)/)?.[1] ?? 0);
  }
  return `gathered (kills ${kills})`;
}

/** Buy a specific weapon at the outfitters (it is equipped at once). */
export async function buyWeapon(bot, id) {
  const { game, note } = bot;
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'shop'), { label: 'shop', done: n => n.modal === 'shop' && n });
  if (!opened) return 'shop not reached';
  await game.action('shop-tab', { kind: 'Weapons' });
  if (await game.action('try-on', { item: id })) await sleep(1500);
  const ok = await game.action('buy', { item: id });
  if (ok) note(`bought a stronger weapon: ${id}`, 'gear');
  await bot.hands.think(500); await game.closePanel();
  return ok ? `bought ${id}` : 'could not buy';
}
