// Bolt, the garden robot: hired from a garden bed's panel once energy allows, kept at work, and told which seed to
// plant (what a village order asks for, else the most XP per minute the bag can keep supplied).
import { sleep } from '../lib/util.mjs';
/** helper-state.ts HELPER_COST. */
export const HELPER_COST = 1000;
/** Energy left over after hiring, for food and repairs. */
const CUSHION = 500;

/** Bolt as the save holds it: { owned, paused, seed } (null before hiring). */
export async function boltState(bot) { const h = JSON.parse(await bot.game.saveJson()).helper; return h?.owned ? h : null; }

/** The seed Bolt should plant now, or 'same' when nothing beats replanting what grew last. */
export async function boltSeed(bot, s) {
  const seeds = (await bot.page.evaluate(() => window.__zg.seeds())).filter(c => c.unlocked && (!c.seed || s.bag[c.seed] > 0));
  // An open village order for a crop comes first (raw or for cooking).
  const wanted = s.orders.filter(o => o.have < o.count).map(o => o.item.replace(/^cooked_/, ''));
  const ordered = seeds.find(c => wanted.includes(c.id)); if (ordered) return ordered.id;
  // Bought seeds run out: only pick one while the bag holds a seed for every bed.
  const lasting = seeds.filter(c => !c.seed || s.bag[c.seed] >= s.plots.length);
  return lasting.sort((a, b) => b.xp / b.seconds - a.xp / a.seconds)[0]?.id ?? 'same';
}

/** Hire Bolt when there is energy to spare; then keep it working on the best seed. */
export async function tendBolt(bot) {
  const { game, rng, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  let h = await boltState(bot);
  if (!h && s.energy < HELPER_COST + CUSHION) { bot.bolt = { owned: false, at: Date.now() }; return 'cannot hire Bolt yet'; }
  const seed = await boltSeed(bot, s);
  if (h && !h.paused && h.seed === seed) { bot.bolt = { owned: true, at: Date.now() }; return 'nothing to change for Bolt'; }
  const opened = await game.goTo(n => n.entities.filter(e => e.kind === 'plot').sort((a, b) => a.d - b.d)[0], { label: 'garden bed', done: n => (n.modal === 'plant' || n.modal === 'plot') && n });
  if (!opened) return 'garden not reached';
  if (!await game.action('helper') || !await game.waitPanel('helper')) { await game.closePanel(); return 'no helper button'; }
  const did = [];
  if (!h) {
    if (!await game.action('helper-buy')) { await game.closePanel(); return 'cannot hire Bolt'; }
    h = await game.waitFor(async () => await boltState(bot), { timeout: 4000 });
    if (!h) { await game.closePanel(); return 'cannot hire Bolt'; }
    note(`hired Bolt the garden robot (ϟ${HELPER_COST})`, 'garden'); did.push('hired Bolt'); await sleep(rng.between(1200, 2000));
  }
  if (h.paused && await game.action('helper-pause')) did.push('back to work');
  if (h.seed !== seed && await game.action('helper-seed', { item: seed })) { note(`Bolt now plants ${seed}`, 'garden'); did.push(`seed ${seed}`); }
  await bot.hands.think(600); await game.closePanel();
  bot.bolt = { owned: true, at: Date.now() };
  return did.join(', ') || 'nothing to change for Bolt';
}

/** Worth a visit: never asked yet, Bolt affordable, or the seed choice is a while old (orders and levels change). */
export const boltDue = (bot, s) => s.planet === 'home' && (!bot.bolt || (bot.bolt.owned ? Date.now() - bot.bolt.at > 900000 : s.energy >= HELPER_COST + CUSHION));
