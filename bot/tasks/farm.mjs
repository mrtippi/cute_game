// The animal pen in depth: the guard dog and all four kinds of animals, a bigger pen and species shelters,
// the pen helper robot, and the farm dishes at the kitchen (and eating a food with a bonus effect now and then).
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = kind => n => n.entities.filter(e => e.kind === kind).sort((a, b) => a.d - b.d)[0];
const enabled = (bot, action, attr) => bot.page.$$eval(`#dialog [data-action="${action}"]:not([disabled])`, (bs, attr) => bs.map(b => b.dataset[attr]), attr);

// Prices and unlock levels from src/farm.ts (ANIMALS, SPECIES_PEN_COST, PEN_EXPANSIONS) and the helper's HELPER_COST.
const ANIMAL = { chicken: { price: 25, level: 2 }, cow: { price: 70, level: 5 }, duck: { price: 220, level: 3 }, pig: { price: 380, level: 6 }, dog: { price: 450, level: 3 } };
const LIVESTOCK = ['chicken', 'cow', 'duck', 'pig'];
const SHELTER = { chicken: 160, duck: 220, cow: 300, pig: 320, dog: 250 };
const EXPANSIONS = [140, 280], HELPER = 1000;
/** Foods whose bonus effect counts for "eat" goals: farm dishes first, then roasted buff crops, the truffle last (it sells well). */
const EFFECT_FOODS = ['omelette', 'pancake', 'milkshake', 'cheese', ...['carrot', 'mint', 'chili', 'bean', 'berry', 'coffee', 'moonflower', 'clover', 'glowshroom', 'iceberry', 'magnetmelon', 'dragonfruit', 'rainbowrose'].map(id => 'cooked_' + id), 'honey', 'nectar', 'bloom', 'truffle'];
export const DISHES = ['omelette', 'pancake', 'milkshake', 'cheese'];

/** The pen as the save has it: kinds owned, the dog, shelters, pen level, the helper. */
export async function penFacts(bot) {
  const farm = JSON.parse(await bot.game.saveJson()).farm ?? {}, animals = farm.animals ?? [];
  const count = Object.fromEntries([...LIVESTOCK, 'dog'].map(k => [k, animals.filter(a => a.kind === k).length]));
  return bot.pen = { built: !!farm.built, count, kinds: LIVESTOCK.filter(k => count[k] > 0), dog: count.dog > 0, level: farm.penLevel ?? 0, shelters: Object.keys(farm.speciesPens ?? {}), helper: { owned: false, autoFeed: false, ...farm.helper } };
}
/** What the journal wants from the pen right now: the dog, more kinds of animals, foods with effects. */
export async function farmWants(bot) {
  const g = await bot.page.evaluate(() => window.__zg.goals()), keys = [...g.tasks.map(t => t.event), g.story.event, g.story.condition];
  return { dog: keys.includes('dog'), kinds: keys.includes('animalKinds'), eat: keys.includes('eat') };
}
export const effectFoods = s => EFFECT_FOODS.filter(id => s.bag[id] > 0 && !s.orders.some(o => o.item === id));

/**
 * Which animal to buy (or null): the guard dog once, when there is energy to spare or a goal asks for it; then a kind
 * the pen does not have yet; otherwise any livestock it can afford. `kinds` are the buy buttons that are enabled.
 */
export function chooseAnimal(s, pen, wants, kinds, rng) {
  const afford = k => kinds.includes(k) && s.energy >= ANIMAL[k].price + (wants.kinds ? 30 : 120);
  if (!pen.dog && kinds.includes('dog') && s.energy >= ANIMAL.dog.price + (wants.dog ? 50 : 300)) return 'dog';
  const missing = LIVESTOCK.filter(k => !pen.count[k] && afford(k));
  if (missing.length) return missing.sort((a, b) => ANIMAL[a].price - ANIMAL[b].price)[0];
  const any = LIVESTOCK.filter(afford);
  return any.length ? rng.pick(any) : null;
}

/** Feed hungry animals one at a time, the way a player taps each row (fed animals grow and produce twice as fast). */
export async function feedEach(bot, { most = 3 } = {}) {
  const { game, rng } = bot; let fed = 0;
  for (let i = 0; i < most; i++) {
    const uids = await enabled(bot, 'feed-animal', 'id'); if (!uids.length) break;
    if (!await game.action('feed-animal', { id: rng.pick(uids) })) break;
    fed++; await sleep(rng.between(400, 800));
  }
  return fed;
}
/** Collect from one animal whose product waits in the open pen panel (the panel closes as the products fly home). */
export async function collectOne(bot) {
  const uids = await enabled(bot, 'collect-animal', 'id'); if (!uids.length) return false;
  return bot.game.action('collect-animal', { id: uids[0] });
}

/** Grow the pen: a bigger pen when a kind is full, a shelter for a kind with a few animals, the guard dog's house. */
export async function improvePen(bot) {
  const { game, rng, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  let pen = await penFacts(bot); if (!pen.built) return 'no pen yet';
  const opened = await game.goTo(near('pen'), { label: 'animal pen', done: n => n.modal === 'pen' && n }); if (!opened) return 'pen not reached';
  const did = [];
  // Products that ripened while the panel was open: collect them from one animal, then come back.
  if (await collectOne(bot)) { note('collected from one animal', 'farm'); did.push('collected one'); await sleep(900); if (!await game.goTo(near('pen'), { label: 'animal pen', done: n => n.modal === 'pen' && n })) return did.join(', '); }
  if (await feedEach(bot, { most: rng.int(1, 3) })) did.push('fed');
  s = await game.snap();
  // A kind is full when its buy button is off although the level allows it.
  const off = await bot.page.$$eval('#dialog [data-action="buy-animal"][disabled]', bs => bs.map(b => b.dataset.kind));
  const full = off.filter(k => k !== 'dog' && s.level >= ANIMAL[k].level), cost = EXPANSIONS[pen.level];
  if (full.length && cost && s.energy >= cost + 400 && await game.action('expand-pen')) { note(`made the animal pen bigger (${full.join(', ')} were full)`, 'farm'); did.push('expanded'); await sleep(800); }
  // One shelter a visit: the dog's house once the dog is here, else the kind with the most animals.
  s = await game.snap();
  const shelters = await enabled(bot, 'build-species-pen', 'kind');
  const kind = shelters.filter(k => k === 'dog' ? pen.dog : pen.count[k] >= 2).sort((a, b) => (b === 'dog') - (a === 'dog') || pen.count[b] - pen.count[a])[0];
  if (kind && s.energy >= SHELTER[kind] + 500 && await game.action('build-species-pen', { kind })) { note(`built a ${kind} shelter`, 'farm'); did.push(kind + ' shelter'); await sleep(800); }
  await bot.hands.think(500); await game.closePanel();
  await penFacts(bot);
  return did.join(', ') || 'nothing to improve';
}

/** Hire the pen helper robot when rich enough, and make sure it feeds the animals. */
export async function penHelper(bot) {
  const { game, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  let pen = await penFacts(bot); if (!pen.built) return 'no pen yet';
  if (pen.helper.owned && pen.helper.autoFeed) return 'nothing to do: helper already feeds';
  if (!pen.helper.owned && s.energy < HELPER + 800) return 'cannot afford the helper yet';
  const opened = await game.goTo(near('pen'), { label: 'animal pen', done: n => n.modal === 'pen' && n }); if (!opened) return 'pen not reached';
  const did = [];
  if (await game.action('farm-helper') && await game.waitPanel('farm-helper')) {
    if (!pen.helper.owned && await game.action('farm-helper-buy')) { await sleep(900); pen = await penFacts(bot); if (pen.helper.owned) { note('hired the animal pen helper', 'farm'); did.push('hired helper'); } }
    if (pen.helper.owned && !pen.helper.autoFeed && await game.action('farm-helper-feed')) { await sleep(600); if ((await penFacts(bot)).helper.autoFeed) { note('turned on automatic feeding', 'farm'); did.push('auto-feed on'); } }
  }
  await bot.hands.think(500); await game.closePanel();
  return did.join(', ') || 'nothing to do';
}

/** Cook farm dishes at the kitchen (omelette, pancakes, milkshake, cheese); they count as meals and carry effects. */
export async function cookDishes(bot, { most = 2 } = {}) {
  const { game, rng, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  const opened = await game.goTo(near('cook'), { label: 'kitchen', done: n => n.modal && n }); if (!opened) return 'kitchen not reached';
  // Leave eggs and milk an order asks for.
  const keep = new Set(s.orders.map(o => o.item)); let cooked = 0;
  for (let i = 0; i < most; i++) {
    const dishes = (await enabled(bot, 'cook-dish', 'item')).filter(id => !(keep.has('egg') && ['omelette', 'pancake'].includes(id)) && !(keep.has('milk') && id !== 'omelette'));
    if (!dishes.length || !await game.action('cook-dish', { item: rng.pick(dishes) })) break;
    cooked++; await sleep(rng.between(500, 900));
  }
  if (cooked) note(`cooked ${cooked} farm dish${cooked > 1 ? 'es' : ''}`, 'kitchen');
  await bot.hands.think(500); await game.closePanel();
  return cooked ? `cooked ${cooked} dishes` : 'nothing to cook';
}

/** Eat one food with a bonus effect from the backpack (counts for "eat" goals; the buff helps the next fight). */
export async function eatSpecial(bot) {
  const { game, hands, note } = bot;
  let s = await game.snap(); const food = effectFoods(s)[0]; if (!food) return 'no effect food';
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return 'backpack did not open';
  let ate = false;
  if (await game.action('inspect', { item: food, scope: '#dialog .inventory-grid' }) && await game.action('eat', { item: food })) {
    s = await game.waitFor(n => (n.bag[food] ?? 0) < (s.bag[food] ?? 0) && n, { timeout: 3000 }); ate = !!s;
  }
  if (ate) note(`ate some ${food.replace(/^cooked_/, 'roasted ')} for its effect`, 'kitchen');
  await hands.think(600); await game.closePanel();
  return ate ? `ate ${food}` : 'could not eat';
}
