// Rescued friends and dressing up: now and then give a friend in the cottage a spare hat or outfit, look in on a
// friend at work (and send one back to work after a break), and play in a disguise for a while before changing back.
import { leaveHouse } from './combat.mjs';
import { THEMES, wear } from './wardrobe.mjs';
import { flourish } from './flourish.mjs';
import { sleep, readSave } from '../lib/util.mjs';

const COSMETIC = ['hat', 'outfit', 'boots', 'pet'];
/** Pieces the bot dresses itself in (wardrobe.mjs THEMES): only a second copy of these is spare. */
const favourite = id => Object.values(THEMES).some(list => list.some(p => p.endsWith('_') ? id.startsWith(p) : id === p));

/** The nicest spare piece for a friend with that slot still empty: not worn by the explorer, priciest first. */
export async function friendGift(bot) {
  const w = await readSave(bot), friends = (w.friends ?? []).filter(f => f.home);
  if (!friends.length) return null;
  const worn = new Set(Object.values(w.gear));
  const ids = Object.keys(w.bag).filter(id => w.bag[id] > 0 && !worn.has(id));
  const info = await bot.page.evaluate(ids => window.__zg.items(ids), ids);
  const spare = ids.filter(id => COSMETIC.includes(info[id]?.slot) && (w.bag[id] > 1 || !favourite(id)))
    .sort((a, b) => info[b].price - info[a].price);
  for (const id of spare) {
    const friend = bot.rng.shuffle(friends).find(f => !f.gear?.[info[id].slot]);
    if (friend) return { friend: friend.id, item: id, slot: info[id].slot };
  }
  return null;
}

/** Into the cottage, tap the friend, give the piece from the Dress panel, admire it, and back out. */
export async function dressFriend(bot) {
  const { game, page, hands, rng, note } = bot;
  if ((await game.snap()).planet !== 'home') return 'not home';
  const gift = await friendGift(bot); if (!gift) return 'nothing spare to give';
  if (!game.indoors(await game.snap())) {
    const home = await game.goTo(n => n.entities.find(e => e.kind === 'home'), { label: 'cottage', done: n => game.indoors(n) && n, timeout: 60000 });
    if (!home) return 'cottage not reached';
    await sleep(rng.between(900, 1500));
  }
  const opened = await game.goTo(n => n.entities.find(e => e.id === 'house:friend:' + gift.friend), { label: gift.friend, done: n => n.modal === 'dress' && n, timeout: 30000 });
  let result = 'friend not reached';
  if (opened) {
    await hands.think(900);
    const button = page.locator(`#dialog [data-house-action="give"][data-friend="${gift.friend}"][data-item="${gift.item}"]:not([disabled])`).first();
    result = 'cannot give ' + gift.item;
    if (await button.count()) {
      await button.scrollIntoViewIfNeeded().catch(() => {});
      await hands.clickElement(button);
      const given = await game.waitFor(async () => (await readSave(bot)).friends.find(f => f.id === gift.friend)?.gear?.[gift.slot] === gift.item, { timeout: 5000 });
      if (given) { note(`gave ${gift.friend} a ${gift.item}`, 'friends'); result = `gave ${gift.friend} ${gift.item}`; await sleep(rng.between(1800, 3000)); }
    }
    await hands.think(500); await game.closePanel();
  }
  await sleep(rng.between(600, 1200));
  await leaveHouse(bot);
  return result;
}

/** Look in on a friend at work outside; one on a break goes back to work. */
export async function visitFriend(bot) {
  const { game, rng, note } = bot;
  const s = await game.snap(); if (s.planet !== 'home' || game.indoors(s)) return 'not outside at home';
  const w = await readSave(bot), friends = (w.friends ?? []).filter(f => f.home);
  const pick = friends.find(f => f.paused) ?? (friends.length ? rng.pick(friends) : null);
  if (!pick) return 'no friends home';
  const opened = await game.goTo(n => n.entities.find(e => e.id === 'friend:' + pick.id), { label: pick.id, done: n => n.modal === 'friend' && n, timeout: 60000 });
  if (!opened) return 'friend not reached';
  await sleep(rng.between(1500, 2800));   // reading how the day went
  let result = `visited ${pick.id}`;
  if (pick.paused && await game.action('friend-pause', { kind: pick.id })) { note(`sent ${pick.id} back to work`, 'friends'); result = `${pick.id} back to work`; await sleep(rng.between(600, 1000)); }
  else note(`looked in on ${pick.id}`, 'friends');
  await bot.hands.think(500); await game.closePanel();
  return result;
}

// ---- disguises -----------------------------------------------------------------------------
/** Disguise suits in the bag (content.ts "dz_" items, slot "disguise"). */
export const disguises = s => Object.keys(s.bag).filter(id => id.startsWith('dz_') && s.bag[id] > 0);

/** Take the disguise off from the backpack's equipment row. */
export async function undisguise(bot) {
  const { game, hands } = bot;
  if (!(await game.snap()).gear.disguise) return 'not disguised';
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return 'backpack did not open';
  const ok = await game.action('unequip', { slot: 'disguise' });
  await hands.think(500); await game.closePanel();
  return ok ? 'changed back' : 'cannot take off the disguise';
}

/** For fun: put on a disguise, try its moves and wander a little, then change back. */
export async function playDisguise(bot, { seconds = 40 } = {}) {
  const { game, hands, rng, note } = bot;
  let s = await game.snap();
  const id = s.gear.disguise ?? rng.pick(disguises(s));
  if (!id) return 'no disguise';
  try {
    if (!s.gear.disguise) { await wear(bot, [id], 'fun'); s = await game.snap(); if (s.gear.disguise !== id) return 'cannot wear ' + id; }
    note(`dressed up as ${id.slice(3)}`, 'style');
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      s = await game.snap();
      const ready = s.cooldowns.map((c, i) => c <= 0 ? i : -1).filter(i => i >= 0);
      if (ready.length && rng.chance(.5)) await hands.press(['q', 'w', 'e', 'r'][rng.pick(ready)]);
      else if (rng.chance(.4)) await flourish(bot);
      else {
        const a = rng.between(0, Math.PI * 2), l = rng.between(4, 9);
        await game.stepToward(s.player.x + Math.cos(a) * l, s.player.z + Math.sin(a) * l, s);
      }
      await sleep(rng.between(1200, 2600));
    }
  } finally {
    // Change back even when the activity runs out of time.
    game.deadline = 0;
    await undisguise(bot).catch(() => {});
  }
  return `played as ${id}`;
}
