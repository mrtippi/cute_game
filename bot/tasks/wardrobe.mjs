// The explorer's look: collect hats, outfits, boots and companions over time (try on, then buy; or craft),
// wear something new as soon as it arrives, and dress for what comes next (fishing, a fight, space…).
import { sleep } from '../lib/util.mjs';
const COSMETIC = ['hat', 'outfit', 'boots', 'pet'];

/** Outfits per theme, by slot preference. "hat_t_" style prefixes match every Titan piece. */
export const THEMES = {
  fishing: ['hat_straw', 'armor_hawaii', 'boots_flipper', 'pet_turtle', 'pet_parrot', 'hat_frog'],
  combat: ['hat_t_', 'hat_samurai', 'hat_viking', 'armor_knight', 'armor_wolf', 'armor_bone', 'boots_cowboy', 'pet_t_', 'pet_dragon'],
  space: ['hat_space', 'armor_space', 'boots_rocket', 'pet_robot', 'pet_firefly'],
  farm: ['hat_straw', 'hat_chef', 'armor_chef', 'armor_leaf', 'boots_cowboy', 'pet_sheep', 'bunny'],
  festival: ['hat_party', 'armor_kimono', 'hat_santa', 'armor_santa', 'pet_firefly', 'boots_cloud'],
  explore: ['hat_cowboy', 'hat_pirate', 'armor_pirate', 'armor_leather', 'boots_cowboy', 'pet_parrot'],
  cozy: ['hat_cat', 'hat_bunny', 'hat_frog', 'armor_hoodie', 'bunny', 'pet_sheep'],
  fancy: ['hat_halo', 'hat_graduate', 'armor_tux', 'armor_angel', 'armor_wings', 'armor_cloud', 'boots_cloud', 'pet_t_'],
};
/** Which theme suits an activity of the planner. */
export const ACTIVITY_THEME = { fishing: 'fishing', harpoon: 'fishing', fight: 'combat', travel: 'space', mine: 'explore', garden: 'farm', animals: 'farm', cook: 'farm', market: 'cozy' };

const matches = (id, pattern) => pattern.endsWith('_') ? id.startsWith(pattern) : id === pattern;
const owned = s => new Set([...Object.keys(s.bag).filter(id => s.bag[id] > 0), ...Object.values(s.gear)]);
async function facts(bot, ids) { return bot.page.evaluate(ids => window.__zg.items(ids), ids); }

/** Owned pieces of a theme, one per slot, that are not already worn. */
export async function themeOutfit(bot, theme) {
  const s = await bot.game.snap(), have = owned(s), list = THEMES[theme] ?? [];
  const info = await facts(bot, [...have]);
  const pick = {};
  for (const pattern of list) for (const id of have) {
    const slot = info[id]?.slot;
    if (COSMETIC.includes(slot) && !pick[slot] && matches(id, pattern)) pick[slot] = id;
  }
  return Object.entries(pick).filter(([slot, id]) => s.gear[slot] !== id).map(([, id]) => id);
}

/** Put on owned pieces from the backpack (I), one panel visit for all of them. */
export async function wear(bot, ids, why = '') {
  const { game, hands, rng, note } = bot;
  if (!ids.length) return 'already dressed';
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return 'backpack did not open';
  let worn = 0;
  for (const id of ids) {
    let ok = await game.action('equip', { item: id });
    if (!ok) { await game.action('inspect', { item: id }); ok = await game.action('equip', { item: id }); }
    if (ok) { worn++; await sleep(rng.between(400, 800)); }
  }
  await hands.think(700); await game.closePanel();
  if (worn) note(`changed clothes${why ? ' for ' + why : ''}: ${ids.slice(0, worn).join(', ')}`, 'style');
  return `wore ${worn}`;
}

export async function dress(bot, theme) { return wear(bot, await themeOutfit(bot, theme), theme); }

/** Visit the outfitters: try on something new (theme first, then the cheapest new piece), then buy it. */
export async function collectCosmetic(bot, { theme, share = .3 } = {}) {
  const { game, hands, rng, note } = bot;
  let s = await game.snap(); const have = owned(s), budget = s.energy * share;
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'shop'), { label: 'shop', done: n => n.modal === 'shop' && n });
  if (!opened) return 'shop not reached';
  const candidates = [];
  for (const tab of rng.shuffle(['Clothing', 'Pets'])) {
    await game.action('shop-tab', { kind: tab });
    const ids = await bot.page.$$eval('#dialog [data-action="buy"]:not([disabled])', bs => bs.map(b => b.dataset.item));
    const info = await facts(bot, ids);
    for (const id of ids) if (!have.has(id) && COSMETIC.includes(info[id]?.slot) && info[id].price <= budget) candidates.push({ id, tab, ...info[id] });
  }
  const themed = theme ? candidates.filter(c => (THEMES[theme] ?? []).some(p => matches(c.id, p))) : [];
  const pick = themed[0] ?? candidates.sort((a, b) => a.price - b.price)[0];
  let result = 'nothing new to buy';
  if (pick) {
    await game.action('shop-tab', { kind: pick.tab });
    // Try it on first: a moment in front of the mirror before deciding.
    if (await game.action('try-on', { item: pick.id })) { await sleep(rng.between(1800, 3200)); await hands.fidget(1920, 1080); }
    if (await game.action('buy', { item: pick.id })) { note(`new ${pick.slot}: ${pick.id} (ϟ${pick.price})`, 'style'); result = `bought ${pick.id}`; await sleep(800); }
  }
  await hands.think(500); await game.closePanel();
  return result;
}

/** At the workshop: craft a look not owned yet, then wear it straight away. */
export async function craftCosmetic(bot) {
  const { game, note } = bot;
  const s = await game.snap(), have = owned(s);
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'craft'), { label: 'workshop', done: n => n.modal === 'craft' && n });
  if (!opened) return 'workshop not reached';
  const recipes = await bot.page.evaluate(() => window.__zg.recipes());
  const enabled = await bot.page.$$eval('#dialog [data-action="craft"]:not([disabled])', bs => bs.map(b => Number(b.dataset.index)));
  const pick = recipes.find(r => enabled.includes(r.index) && COSMETIC.includes(r.slot) && !have.has(r.result));
  let result = 'no new look to craft';
  if (pick && await game.action('craft', { index: pick.index })) { note(`crafted ${pick.result}`, 'style'); result = `crafted ${pick.result}`; }
  await bot.hands.think(500); await game.closePanel();
  if (pick && result.startsWith('crafted')) await wear(bot, [pick.result], 'something new');
  return result;
}
