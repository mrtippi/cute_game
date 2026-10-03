// Everyday things a player does besides quests: a quick timed challenge, tidying spare materials into
// the storage chest, and a stroll to a favourite spot to look around.
import { fight } from './combat.mjs';
import { flourish } from './flourish.mjs';
import { sleep } from '../lib/util.mjs';

/**
 * A quick challenge from the journal: "use skills" (8 in 45 s) or "defeat creatures" (a few in 75 s),
 * whichever suits where the explorer stands, then do it before the clock runs out.
 */
export async function quickChallenge(bot) {
  const { game, hands, rng, note } = bot;
  let s = await game.snap();
  const kind = s.enemies.some(e => !e.boss && e.d < 30) && rng.chance(.6) ? 'kill' : 'skill';
  await game.closePanel(); await hands.think(400); await hands.press('j');
  if (!await game.waitPanel('quests')) return 'journal did not open';
  await game.action('journal-tab', { kind: 'challenges' });
  const started = await game.action('start-challenge', { kind });
  await hands.think(500); await game.closePanel();
  if (!started) return 'no challenge available';
  note(`quick challenge: ${kind}`, 'challenge');
  if (kind === 'kill') return fight(bot, { count: 6, range: 35, timeout: 75000 });
  // Skills: use them as they come off cooldown, near creatures when there are any.
  const end = Date.now() + 44000; let used = 0;
  while (Date.now() < end && used < 10) {
    s = await game.snap();
    const ready = s.cooldowns.map((c, i) => c <= 0 ? i : -1).filter(i => i >= 0);
    if (ready.length) { await hands.press(['q', 'w', 'e', 'r'][rng.pick(ready)]); used++; await sleep(rng.between(350, 700)); }
    else await sleep(250);
  }
  await sleep(800);
  return `skills used ${used}`;
}

/** Store spare creature materials in the chest (kept safe if the explorer is knocked out). */
export async function tidyChest(bot, { keep = 12 } = {}) {
  const { game, rng, note } = bot;
  const s = await game.snap(); if (s.planet !== 'home') return 'not home';
  const info = await bot.page.evaluate(ids => window.__zg.items(ids), Object.keys(s.bag));
  const spare = Object.entries(s.bag).filter(([id, n]) => info[id]?.type === 'material' && n > keep).map(([id]) => id);
  if (!spare.length) return 'nothing to tidy';
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'chest'), { label: 'chest', done: n => n.modal && n });
  if (!opened) return 'chest not reached';
  let stored = 0;
  for (const id of rng.shuffle(spare).slice(0, 4)) if (await game.action('transfer', { item: id, direction: 'store' })) { stored++; await sleep(rng.between(250, 500)); }
  if (stored) note(`tidied ${stored} kinds of materials into the chest`, 'home');
  await bot.hands.think(500); await game.closePanel();
  return `stored ${stored}`;
}

/** Walk to a favourite spot (a pond, the crystal, the starship, a mine…), stop and enjoy the view. */
export async function sightsee(bot) {
  const { game, hands, rng, note } = bot;
  const s = await game.snap();
  const spots = s.entities.filter(e => ['fish', 'upgrade', 'travel', 'mine', 'cage', 'pen'].includes(e.kind) && e.d > 12 && e.d < 90);
  if (!spots.length) return 'nowhere to go';
  const spot = rng.pick(spots);
  for (let i = 0; i < 8; i++) {
    const n = await game.snap(), here = n.entities.find(e => e.id === spot.id); if (!here || here.d < here.r + 4) break;
    await game.stepToward(here.x, here.z, n);
    await game.waitFor(m => !m.player.moving && m, { timeout: 5000, every: 250 });
  }
  note(`stopped by the ${spot.name}`, 'stroll');
  await sleep(rng.between(1200, 2500));
  await flourish(bot);
  await sleep(rng.between(800, 2000));
  return `visited ${spot.name}`;
}
