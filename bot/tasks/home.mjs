// Village chores beyond the garden: kitchen, workshop and forge, the animal pen, harpoon hunting.
import { equip } from './shopping.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const near = kind => n => n.entities.filter(e => e.kind === kind).sort((a, b) => a.d - b.d)[0];
const enabled = (bot, action, attr) => bot.page.$$eval(`#dialog [data-action="${action}"]:not([disabled])`, (bs, attr) => bs.map(b => b.dataset[attr]), attr);

/** Cook what the bag holds (cooked food sells for about twice as much and counts for cooking quests). */
export async function cook(bot, { kinds = 2 } = {}) {
  const { game, rng, note } = bot;
  const opened = await game.goTo(near('cook'), { label: 'kitchen', done: n => n.modal && n }); if (!opened) return 'kitchen not reached';
  const items = rng.shuffle(await enabled(bot, 'cook-all', 'item')).slice(0, kinds); let cooked = 0;
  for (const item of items) if (await game.action('cook-all', { item })) { cooked++; note(`cooked ${item}`, 'kitchen'); await sleep(rng.between(500, 900)); }
  await bot.hands.think(500); await game.closePanel();
  return `cooked ${cooked} kinds`;
}

/** Craft the cheapest recipe the bag allows, if any (counts for "craft or buy" quests). */
export async function craftSomething(bot) {
  const { game, note } = bot;
  const opened = await game.goTo(near('craft'), { label: 'workshop', done: n => n.modal === 'craft' && n }); if (!opened) return 'workshop not reached';
  const recipes = await bot.page.$$eval('#dialog [data-action="craft"]:not([disabled])', bs => bs.map(b => ({ index: b.dataset.index, cost: Number(b.textContent.replace(/[^0-9]/g, '')) || 0 })));
  const pick = recipes.sort((a, b) => a.cost - b.cost)[0]; let result = 'nothing craftable';
  if (pick && await game.action('craft', { index: pick.index })) { note(`crafted recipe ${pick.index}`, 'workshop'); result = 'crafted'; }
  await bot.hands.think(500); await game.closePanel();
  return result;
}

/** One forging attempt on the held weapon (30% success; materials are spent either way). */
export async function forgeOnce(bot) {
  const { game, note } = bot;
  const opened = await game.goTo(near('craft'), { label: 'workshop', done: n => n.modal === 'craft' && n }); if (!opened) return 'workshop not reached';
  await game.action('forge-menu');
  const weapons = await enabled(bot, 'forge', 'item'); let result = 'cannot forge yet';
  if (weapons.length) {
    const before = (await game.snap()).energy;
    if (await game.action('forge', { item: weapons[0] })) { await sleep(900); note(`forging attempt on ${weapons[0]} (ϟ${before - (await game.snap()).energy})`, 'forge'); result = 'forged'; }
  }
  await bot.hands.think(600); await game.closePanel();
  return result;
}

/** Build the pen, buy animals the energy allows, collect what is ready. */
export async function tendAnimals(bot, { spend = .4 } = {}) {
  const { game, rng, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  const opened = await game.goTo(near('pen'), { label: 'animal pen', done: n => n.modal && n }); if (!opened) return 'pen not reached';
  let did = [];
  if (await game.action('build-pen')) { note('built the animal pen', 'farm'); did.push('built'); await sleep(800); }
  if (await game.action('collect-farm')) { note('collected animal products', 'farm'); did.push('collected'); await sleep(700); }
  if (await game.action('feed-all')) { did.push('fed'); await sleep(500); }
  s = await game.snap();
  const kinds = await enabled(bot, 'buy-animal', 'kind');
  if (kinds.length && s.energy > 150) {
    const kind = rng.pick(kinds.filter(k => k !== 'dog').length ? kinds.filter(k => k !== 'dog') : kinds);
    const before = s.energy;
    if (await game.action('buy-animal', { kind })) { s = await game.snap(); if (before - s.energy > before * spend) note(`bought a ${kind} (a big spend)`, 'farm'); else note(`bought a ${kind}`, 'farm'); did.push('bought ' + kind); }
  }
  await bot.hands.think(500); await game.closePanel();
  return did.join(', ') || 'nothing to do';
}

/** Throw the harpoon at pond fish (each hit counts for harpoon quests). */
export async function harpoonHunt(bot, { throws = 5 } = {}) {
  const { game, hands, rng, note, log } = bot;
  let s = await game.snap(); if (!(s.bag.harpoon > 0) && s.gear.weapon !== 'harpoon') return 'no harpoon';
  const pond = near('fish');
  const shore = await game.goTo(pond, { label: 'pond', done: (n, e) => e && e.d <= e.r + 2.5 && !n.player.moving && n, timeout: 60000 });
  if (!shore) return 'pond not reached';
  if (shore.gear.weapon !== 'harpoon' && !await equip(bot, 'harpoon')) return 'could not equip harpoon';
  const before = Object.entries((await game.snap()).bag).filter(([id]) => id.startsWith('fish_')).reduce((n, [, c]) => n + c, 0);
  for (let i = 0; i < throws; i++) {
    const reel = bot.page.locator('#reel-button.hunt');
    if (!await reel.count() || !await reel.isVisible()) { log('harpoon: no hunt button here'); break; }
    await hands.clickElement(reel); await sleep(rng.between(1500, 2300));
  }
  s = await game.snap();
  const after = Object.entries(s.bag).filter(([id]) => id.startsWith('fish_')).reduce((n, [, c]) => n + c, 0);
  if (after > before) note(`harpooned ${after - before} fish`, 'fishing');
  return `harpoon hits ${after - before}`;
}

/** Tap crystal deposits on this planet (each counts for mining quests and gives crafting materials). */
export async function mine(bot, { count = 3 } = {}) {
  const { game, rng, note } = bot;
  let mined = 0; const seen = new Set();
  for (let i = 0; i < count; i++) {
    const s = await game.snap();
    const deposit = s.entities.filter(e => e.kind === 'mine' && !seen.has(e.id) && e.d < 80).sort((a, b) => a.d - b.d)[0]; if (!deposit) break;
    const before = JSON.stringify(s.bag);
    const done = await game.goTo(n => n.entities.find(e => e.id === deposit.id), { label: 'deposit', done: n => JSON.stringify(n.bag) !== before && n, timeout: 45000 });
    seen.add(deposit.id);
    if (done) { mined++; note('mined a crystal deposit', 'mining'); await sleep(rng.between(500, 1000)); } else break;
  }
  return `mined ${mined}`;
}

/** Use fertilizer from the bag on a growing crop (each dose counts for fertilizer quests). */
export async function fertilizeCrops(bot, { doses = 2 } = {}) {
  const { game, rng, note } = bot;
  let used = 0;
  for (let i = 0; i < doses; i++) {
    const s = await game.snap();
    if (!(s.bag.manure > 0 || s.bag.spore > 0)) break;
    const growing = s.plots.filter(p => p.crop && p.progress < .9).map(p => p.i); if (!growing.length) break;
    const bed = rng.pick(growing);
    const opened = await game.goTo(n => n.entities.find(e => e.kind === 'plot' && e.index === bed), { label: 'growing bed', done: n => n.modal === 'plot' && n });
    if (!opened) break;
    if (await game.action('fertilize-manure') || await game.action('fertilize')) { used++; note('fertilized a crop', 'garden'); }
    await bot.hands.think(400); await game.closePanel();
  }
  return `fertilized ${used}`;
}
