// Spending energy like a sensible player: a better weapon when it is a real step up, crystal
// upgrades with what is left over.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function info(bot, ids) { return bot.page.evaluate(ids => window.__zg.items(ids), ids); }

/** The strongest affordable weapon in the shop, if it beats the current one by a fair margin. */
export async function upgradeWeapon(bot, { keep = .2 } = {}) {
  const { game, note } = bot;
  let s = await game.snap();
  const owned = Object.keys(s.bag).filter(id => s.bag[id] > 0), facts0 = await info(bot, owned);
  // The harpoon and rods are tools; compare against the best real weapon owned.
  const now = Math.max(0, ...owned.filter(id => id !== 'harpoon' && facts0[id]?.slot === 'weapon' && facts0[id]?.weapon !== 'rod').map(id => facts0[id].attack));
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'shop'), { label: 'shop', done: n => n.modal === 'shop' && n });
  if (!opened) return 'shop not reached';
  await game.action('shop-tab', { kind: 'Weapons' });
  const ids = await bot.page.$$eval('#dialog [data-action="buy"]:not([disabled])', bs => bs.map(b => b.dataset.item));
  const facts = await info(bot, ids); s = await game.snap();
  const best = ids.map(id => ({ id, ...facts[id] }))
    .filter(w => w.slot === 'weapon' && w.weapon !== 'rod' && w.id !== 'harpoon' && w.price <= s.energy * (1 - keep) && w.attack >= Math.max(now * 1.25, now + 3))
    .sort((a, b) => b.attack - a.attack)[0];
  let result = 'no better weapon yet';
  if (best && await game.action('buy', { item: best.id })) { await sleep(500); note(`bought weapon ${best.id} (ATK ${best.attack})`, 'shop'); result = `bought ${best.id}`; }
  await bot.hands.think(600); await game.closePanel();
  return result;
}

/** A fishing rod, the first time one is needed. */
export async function buyRod(bot) {
  const { game, note } = bot;
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'shop'), { label: 'shop', done: n => n.modal === 'shop' && n });
  if (!opened) return 'shop not reached';
  await game.action('shop-tab', { kind: 'Weapons' });
  const ids = await bot.page.$$eval('#dialog [data-action="buy"]:not([disabled])', bs => bs.map(b => b.dataset.item));
  const facts = await info(bot, ids);
  const rod = ids.filter(id => facts[id]?.weapon === 'rod').sort((a, b) => facts[a].price - facts[b].price)[0];
  let result = 'no affordable rod';
  if (rod && await game.action('buy', { item: rod })) { note(`bought fishing rod ${rod}`, 'shop'); result = `bought ${rod}`; }
  await bot.hands.think(500); await game.closePanel();
  return result;
}

/** Crystal upgrades: health first while it is low, then attack, defense, critical. */
export async function crystalUpgrade(bot, { times = 2 } = {}) {
  const { game, rng, note } = bot;
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'upgrade'), { label: 'crystal', done: n => n.modal === 'upgrade' && n });
  if (!opened) return 'crystal not reached';
  let bought = 0;
  for (let i = 0; i < times; i++) {
    const order = rng.chance(.6) ? ['health', 'attack', 'defense', 'crit'] : ['attack', 'health', 'defense', 'crit'];
    let done = false;
    for (const kind of order) if (await game.action('upgrade', { kind })) { note(`crystal upgrade: ${kind}`, 'shop'); bought++; done = true; await sleep(rng.between(400, 800)); break; }
    if (!done) break;
  }
  await bot.hands.think(500); await game.closePanel();
  return `upgrades ${bought}`;
}

/** Equip an owned item from the backpack (I), as a player swaps gear. */
export async function equip(bot, id) {
  const { game, hands } = bot;
  if ((await game.snap()).gear.weapon === id) return true;
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return false;
  let ok = await game.action('equip', { item: id });
  if (!ok) { await game.action('inspect', { item: id }); ok = await game.action('equip', { item: id }); }
  await hands.think(500); await game.closePanel();
  return ok;
}

/** The best owned combat weapon (not a rod, not the harpoon). */
export async function bestWeapon(bot) {
  const s = await bot.game.snap(), owned = Object.keys(s.bag).filter(id => s.bag[id] > 0), facts = await info(bot, owned);
  return owned.filter(id => id !== 'harpoon' && facts[id]?.slot === 'weapon' && facts[id]?.weapon !== 'rod').sort((a, b) => facts[b].attack - facts[a].attack)[0] ?? null;
}

/** Put the weapon away (bare fists), from the backpack's weapon slot. */
export async function unequipWeapon(bot) {
  const { game, hands } = bot;
  if (!(await game.snap()).gear.weapon) return true;
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return false;
  const ok = await game.action('unequip');
  await hands.think(500); await game.closePanel();
  return ok;
}
