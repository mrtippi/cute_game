// Special events on the worlds: on the lava planet break the obsidian cave gate, empty the cave chest once a day,
// carry fire crystals to the three braziers and take on the volcano dragon when the explorer is strong enough;
// on Toybox open the mystery presents. Also the once-a-day reroll of a daily task the bot cannot do.
import { fightCost, recover, collectLoot } from './combat.mjs';
import { dress } from './wardrobe.mjs';
import { dodge, dangersOf, inDanger } from '../lib/dodge.mjs';
import { pickSkill, useSkill } from '../lib/skills.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readSave = bot => bot.page.evaluate(() => JSON.parse(window.__zg.save()));
/** The game's day for the cave chest (model.ts claimCaveChest: the UTC date). */
const utcDay = now => new Date(now).toISOString().slice(0, 10);
const foodCount = s => Object.entries(s.bag).filter(([id]) => id.startsWith('cooked_') || ['potion', 'honey', 'omelette', 'pancake', 'milkshake', 'cheese'].includes(id)).reduce((n, [, c]) => n + c, 0);
const hurt = s => s.hp < s.maxHp * .5;

/** Walk up to a thing. Lava, eruptions and meteors hurt on the way: stop to eat, and give up without food or after a fall. */
async function walkTo(bot, id, label) {
  const { game } = bot, find = n => n.entities.find(e => e.id === id), planet = (await game.snap()).planet;
  for (let i = 0; i < 4; i++) {
    const s = await game.goTo(find, { label, done: (n, e) => n.modal === 'death' || n.planet !== planet || hurt(n) || e && !n.player.moving && e.d <= e.r + 2.5 ? n : null, timeout: 90000 });
    if (!s || s.modal === 'death' || s.planet !== planet) return false;
    if (!hurt(s)) return true;
    // Food heals over a few seconds: wait for it to work before deciding to give up.
    await recover(bot);
    if (!await game.waitFor(n => !hurt(n) && n, { timeout: 10000, every: 500 })) return false;
  }
  return false;
}

/** Walk to a thing and tap it until `done` holds: the gate takes eight blows, a crystal vein two. */
async function tapUntil(bot, id, done, { taps = 6, label = 'target' } = {}) {
  const { game, hands, rng } = bot;
  const find = n => n.entities.find(e => e.id === id);
  if (!await walkTo(bot, id, label)) return false;
  for (let i = 0; i < taps; i++) {
    const s = await game.snap();
    if (await done(s)) return true;
    if (s.modal === 'death' || hurt(s)) return false;
    if (s.modal || s.dialog) await game.closePanel();
    const e = find(s); if (!e) return done(s);
    const p = await game.aimAt(e, s); if (!p) return false;
    // Re-checked under the pointer at press time (the view may slide while walking).
    await game.tap(p.x, p.y, e.id);
    await sleep(rng.between(450, 800));
  }
  return done(await game.snap());
}

// ---- the lava world ----------------------------------------------------------------------
/** True while the lava world still has something for today (the gate, the chest, an unlit brazier). */
export const lavaPending = (bot, s) => s.planet === 'lava' && bot.lavaDone !== utcDay(s.now);

export async function lavaEvents(bot) {
  const { game, note, log } = bot;
  let s = await game.snap(); if (s.planet !== 'lava') return 'not on the lava world';
  if (s.hp < s.maxHp * .7) await recover(bot);
  const did = [];
  // The obsidian gate: eight blows and it breaks open for good.
  const gate = s.entities.find(e => e.kind === 'cave-gate');
  if (gate) {
    if (!await tapUntil(bot, gate.id, n => !n.entities.some(e => e.kind === 'cave-gate'), { taps: 14, label: 'cave gate' })) return 'cannot break the cave gate';
    note('broke open the obsidian cave gate', 'lava'); did.push('gate');
  }
  // The ancient chest inside the cave refills every day.
  let w = await readSave(bot); s = await game.snap();
  const chest = s.entities.find(e => e.kind === 'cave-chest');
  if (w.worldRewards.lava.gateOpen && chest && w.worldRewards.lava.caveChestDay !== utcDay(s.now)) {
    const before = s.bag.obsidian ?? 0;
    if (await tapUntil(bot, chest.id, n => (n.bag.obsidian ?? 0) > before, { taps: 3, label: 'cave chest' })) { note('opened the ancient cave chest', 'lava'); did.push('chest'); }
    else log('lava: cave chest gave nothing');
  }
  // Fire crystals from the veins by the cave, one for each unlit brazier.
  w = await readSave(bot);
  const unlit = [0, 1, 2].filter(i => !w.worldRewards.lava.braziers.includes(i));
  for (let i = 0; i < 5 && unlit.length > ((await game.snap()).bag.fcrystal ?? 0); i++) {
    s = await game.snap(); if (s.planet !== 'lava') break; w = await readSave(bot);
    const vein = s.entities.filter(e => e.kind === 'fire-crystal' && (w.worldRewards.resourceReadyAt[e.id] ?? 0) <= s.now).sort((a, b) => a.d - b.d)[0];
    if (!vein) break;
    const before = s.bag.fcrystal ?? 0;
    if (await tapUntil(bot, vein.id, n => (n.bag.fcrystal ?? 0) > before, { taps: 4, label: 'fire crystal' })) did.push('crystal');
  }
  // Each brazier takes one crystal; the third wakes the ancient furnace.
  for (const index of unlit) {
    s = await game.snap(); if (s.planet !== 'lava' || !(s.bag.fcrystal > 0)) break;
    const brazier = s.entities.find(e => e.kind === 'brazier' && e.index === index); if (!brazier) continue;
    const before = s.bag.fcrystal;
    if (await tapUntil(bot, brazier.id, n => (n.bag.fcrystal ?? 0) < before, { taps: 3, label: 'brazier' })) { did.push('brazier'); note(`lit brazier ${index + 1} of 3`, 'lava'); }
  }
  w = await readSave(bot); s = await game.snap();
  if (s.planet !== 'lava') return 'knocked out on the lava world';
  if (w.worldRewards.lava.braziers.length === 3 && unlit.length) note('all three braziers burn: the ancient furnace is awake!', 'lava');
  const lava = w.worldRewards.lava;
  if (lava.gateOpen && lava.braziers.length === 3 && lava.caveChestDay === utcDay(s.now)) bot.lavaDone = utcDay(s.now);
  const crystals = did.filter(d => d === 'crystal').length, braziers = did.filter(d => d === 'brazier').length;
  const parts = [did.includes('gate') && 'gate opened', did.includes('chest') && 'chest opened', crystals && `crystals ${crystals}`, braziers && `braziers ${braziers}`].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing to do on the lava world';
}

// ---- the volcano dragon --------------------------------------------------------------------
/** The dragon only shows up during the "Dragon invasion" weather, at its nest; it is not on the boss board. */
export const dragonOf = s => s.planet === 'lava' ? s.enemies.find(e => e.type === 'dragon') : null;
/**
 * Worth fighting: boss.mjs bossReady's test (the fight's cost, its skills hitting 1.6x, against health plus food), without
 * the growth for an outlevelled boss: the dragon never grows (world.ts skips it).
 */
export function dragonReady(s) {
  const d = dragonOf(s); if (!d) return false;
  const cost = fightCost(s, { ...d, damage: d.damage * 1.6 }), reserve = Math.min(foodCount(s), 6) * s.maxHp * .25;
  return d.level <= s.level + 4 && cost < (s.maxHp + reserve) * .7;
}

export async function fightDragon(bot, { timeout = 200000 } = {}) {
  const { game, hands, rng, note, log } = bot;
  let s = await game.snap();
  if (!dragonReady(s)) return 'no dragon to fight';
  if (s.hp < s.maxHp * .95) await recover(bot);
  if (foodCount(await game.snap()) < 4) return 'need food first';
  await dress(bot, 'combat').catch(() => {});
  note('the volcano dragon has landed: going after it', 'boss');
  // The journal's boss count (model.ts grantDefeat) tells a win from the invasion ending with the dragon flying off.
  const bossesBefore = (await readSave(bot)).progression.totals.boss ?? 0;
  const end = Date.now() + timeout; let engaged = false, dodges = 0, retreats = 0;
  while (Date.now() < end) {
    s = await game.snap();
    if (s.modal === 'death') return 'knocked out by the dragon';
    // A panel opened by a stray tap on the way blocks every click: close it and carry on.
    if (s.modal || s.dialog) { await game.closePanel(); engaged = false; continue; }
    const dragon = dragonOf(s);
    if (!dragon) {
      const won = await game.waitFor(async () => ((await readSave(bot)).progression.totals.boss ?? 0) > bossesBefore, { timeout: 2000, every: 250 });
      if (won) { note(`defeated the volcano dragon! (${dodges} dodges)`, 'boss'); await sleep(rng.between(600, 1200)); await collectLoot(bot, { range: 22 }); return 'defeated the volcano dragon'; }
      return 'the dragon flew away';
    }
    const dangers = dangersOf(s);
    if (dangers.length && inDanger(s.player, dangers)) {
      if (await dodge(bot, { away: dragon })) dodges++;
      engaged = false; continue;
    }
    if (s.hp < s.maxHp * .4) {
      if (retreats++ >= 4 || !foodCount(s)) { log('dragon: retreating'); await game.stepToward(s.player.x * 2 - dragon.x, s.player.z * 2 - dragon.z, s).catch(() => {}); await recover(bot); return 'retreated from the dragon'; }
      await game.stepToward(s.player.x + (s.player.x - dragon.x) * 1.5, s.player.z + (s.player.z - dragon.z) * 1.5, s).catch(() => {});
      await sleep(rng.between(500, 900));
      for (let i = 0; i < 3 && (await game.snap()).hp < s.maxHp * .8; i++) { await hands.press('h'); await sleep(rng.between(600, 900)); }
      engaged = false; continue;
    }
    if (dangers.some(d => Math.hypot(s.player.x - d.x, s.player.z - d.z) < d.r + 4)) { await sleep(rng.between(80, 140)); continue; }
    if (dragon.d > 3.4 || !engaged) {
      if (dragon.d < 35 && await game.safe(dragon.screen, s) && await game.pick(dragon.screen.x, dragon.screen.y) === dragon.id) { if (await game.tap(dragon.screen.x, dragon.screen.y, dragon.id)) engaged = true; }
      else await game.stepToward(dragon.x, dragon.z, s);
      await sleep(rng.between(300, 600)); continue;
    }
    const skill = pickSkill(s, { swordish: /sword|hammer|scythe/.test(s.gear.weapon ?? ''), target: dragon });
    if (skill >= 0) await useSkill(bot, skill);
    else if (rng.chance(.4)) await hands.press(' ');
    await sleep(rng.between(90, 160));
  }
  log(`dragon: out of time (${dodges} dodges)`);
  return 'dragon fight timed out';
}

// ---- Toybox presents -----------------------------------------------------------------------
/** Presents on Toybox that are wrapped again (model.ts giftAvailable: their regrow time has passed). */
async function readyGifts(bot, s) {
  const w = await readSave(bot), at = w.worldRewards.giftReadyAt?.toy ?? [];
  return s.entities.filter(e => e.kind === 'gift' && (at[e.index] ?? 0) <= s.now).sort((a, b) => a.d - b.d);
}

export async function openGifts(bot, { max = 6 } = {}) {
  const { game, note, rng } = bot;
  let s = await game.snap(); if (s.planet !== 'toy') return 'not on Toybox';
  let opened = 0, stuck = false;
  for (let i = 0; i < max; i++) {
    s = await game.snap();
    const gift = (await readyGifts(bot, s))[0]; if (!gift) break;
    const ok = await tapUntil(bot, gift.id, async n => !(await readyGifts(bot, n)).some(g => g.id === gift.id), { taps: 2, label: 'present' });
    if (!ok) { stuck = true; break; }
    opened++; await sleep(rng.between(700, 1300));   // the toast says what was inside
  }
  if (opened) note(`opened ${opened} mystery present${opened > 1 ? 's' : ''}`, 'toy');
  return opened ? `opened ${opened} presents` : stuck ? 'cannot reach a present' : 'no presents ready';
}

// ---- the daily reroll ----------------------------------------------------------------------
/** Daily tasks the bot has no activity for (planner EVENT_TASKS maps them to nothing). */
const CANNOT = new Set(['eat', 'decorate']);
/** Daily tasks that are a long shot when they have barely started: the boss, hawks, a mystery fish, mining. */
const HARD = new Set(['boss', 'hawk', 'mystery', 'mine']);

/** The daily task worth swapping, if any: one the bot cannot do, else a hard one still near zero. */
export async function rerollPick(bot) {
  const w = await readSave(bot), entries = (await bot.page.evaluate(() => window.__zg.quests())).daily;
  const key = entries.find(e => /:\d+$/.test(e.id))?.id.split(':')[0];
  // The save still holds yesterday's tasks until the game refreshes it: ask again later.
  if (!key || w.progression.daily.key !== key) return 'later';
  if (w.progression.daily.rerolled) return null;
  const open = w.progression.daily.tasks.map((t, index) => ({ ...t, index })).filter(t => !t.claimed && t.progress < t.target);
  return open.find(t => CANNOT.has(t.type)) ?? open.find(t => HARD.has(t.type) && t.progress / t.target < .2) ?? null;
}

/** Once a day: open the journal's daily tab and reroll a task the bot cannot finish. */
export async function rerollDaily(bot) {
  const { game, hands, note } = bot;
  const pick = await rerollPick(bot);
  if (pick === 'later') return 'nothing to reroll yet';
  if (!pick) { bot.rerollDay = utcDay(Date.now()); return 'nothing to reroll'; }
  await game.closePanel(); await hands.think(400); await hands.press('j');
  if (!await game.waitPanel('quests')) return 'journal did not open';
  await game.action('journal-tab', { kind: 'daily' });
  await hands.think(900);   // reading the list first
  const ok = await game.action('reroll-daily', { index: pick.index });
  await hands.think(1200); await game.closePanel();
  if (!ok) return 'cannot reroll';
  bot.rerollDay = utcDay(Date.now());
  const after = (await readSave(bot)).progression.daily.tasks[pick.index];
  note(`rerolled the daily task ${pick.type} → ${after?.type}`, 'quest');
  return `rerolled ${pick.type} → ${after?.type}`;
}
