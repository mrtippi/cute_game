// Fighting the way a careful player does: only creatures it can beat, skills when ready, back off
// early, and get up again after a fall.
import { dodge, dangersOf, inDanger, unstick } from '../lib/dodge.mjs';
import { pickSkill, useSkill, densest, gatherPack, around, burst } from '../lib/skills.mjs';
import { sleep } from '../lib/util.mjs';

/**
 * Health this fight would cost: time to defeat the creature times the damage it deals meanwhile,
 * plus a share for every other creature close enough to join in.
 */
export function fightCost(s, e) {
  const swing = .9, dps = Math.max(1, s.attack) / swing;
  const seconds = e.hp / dps;
  // The game's own reduction (main.ts onDamage): each hit lands as damage × 60 / (defense + 60).
  const hurt = Math.max(1, e.damage * 60 / (Math.max(0, s.defense) + 60)) / Math.max(.6, e.cooldown + .4);
  const crowd = s.enemies.filter(o => o.id !== e.id && Math.hypot(o.x - e.x, o.z - e.z) < 6).length;
  // Area skills (Q, E) ready: a crowd dies together, so it costs much less than fighting each one in turn.
  const aoe = (s.cooldowns?.[0] ?? 1) <= 0 || (s.cooldowns?.[2] ?? 1) <= 0;
  return seconds * hurt * (1 + crowd * (aoe ? .35 : .8));
}
/** Species that made the explorer back off recently are left alone for a while, as a player learns. */
const wary = new Map();
export const avoid = (type, ms = 600000) => wary.set(type, Date.now() + ms);
const avoided = type => (wary.get(type) ?? 0) > Date.now();
export function safeTargets(s, { type, budget = .45, range = 30 } = {}) {
  return s.enemies
    .filter(e => !e.boss && !avoided(e.type) && e.d < range && (!type || e.type === type) && e.level <= s.level + 2 && fightCost(s, e) < s.maxHp * budget)
    .sort((a, b) => a.d + fightCost(s, a) * .05 - (b.d + fightCost(s, b) * .05));
}

/** The "a little rest" panel after a fall, and the bag of loose items left where it happened. */
export async function handleFall(bot) {
  const { game, note } = bot;
  const s = await game.snap();
  if (s.modal === 'death') { await bot.hands.think(1200); await game.closePanel(); return true; }
  return false;
}
export async function recoverBag(bot) {
  const { game, note } = bot;
  const s = await game.snap(); if (!s.dropped || s.planet !== 'home') return false;
  const bag = s.entities.find(e => e.kind === 'dropped'); if (!bag) return false;
  // Not into a boss's den: a live boss next to the bag would knock the explorer out again. Wait for it to fall.
  if ((s.bosses ?? []).some(b => b.alive && Math.hypot(b.x - bag.x, b.z - bag.z) < 15)) return false;
  const done = await game.goTo(n => n.entities.find(e => e.kind === 'dropped'), { label: 'dropped bag', done: n => !n.dropped && n, timeout: 90000 });
  if (done) note('picked up the dropped bag', 'combat');
  return !!done;
}

export async function leaveHouse(bot) {
  const { game, hands, rng, note } = bot;
  let out = await game.goTo(n => n.entities.find(e => e.kind === 'house-door'), { label: 'cottage door', done: n => !game.indoors(n) && n, timeout: 30000 });
  // Fallback: walk toward the door with the arrow keys, then tap it again.
  for (let i = 0; !out && i < 3; i++) {
    const s = await game.snap(), door = s.entities.find(e => e.kind === 'house-door'); if (!door) { out = s; break; }
    const dx = door.x - s.player.x, dz = door.z - s.player.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dz > 0 ? 'ArrowDown' : 'ArrowUp');
    await hands.press(key, { hold: rng.between(700, 1400) });
    out = await game.goTo(n => n.entities.find(e => e.kind === 'house-door'), { label: 'cottage door', done: n => !game.indoors(n) && n, timeout: 15000 });
  }
  if (out) note('stepped outside', 'home');
  return !!out;
}

/** Low health: eat something healing if the bag has it, otherwise rest in the cottage. */
export async function recover(bot) {
  const { game, hands, rng, note } = bot;
  let s = await game.snap();
  // Eat outdoors, a few bites if needed; the cottage is only for when the bag has no food at all.
  for (let i = 0; i < 3 && s.hp < s.maxHp * .85 && await bot.page.evaluate(() => window.__zg.healingFood()); i++) {
    await hands.press('h'); await sleep(rng.between(700, 1100)); s = await game.snap();
  }
  if (s.hp >= s.maxHp * .7) { note('ate a snack to recover', 'combat'); return; }
  if (s.planet !== 'home') return;
  const rested = await game.goTo(n => n.entities.find(e => e.kind === 'home' || e.kind === 'house-door'), { label: 'cottage', done: n => (game.indoors(n) || n.hp >= n.maxHp * .95) && n, timeout: 90000 });
  if (rested) { await game.waitFor(n => n.hp >= n.maxHp * .9 && n, { timeout: 35000, every: 1000 }); note('rested in the cottage', 'combat'); }
  if (game.indoors(await game.snap())) await leaveHouse(bot);
}

/** Walk over the loot lying nearby so the pickup magnet takes it (drops vanish after 30 seconds). */
export async function collectLoot(bot, { range = 18, timeout = 15000 } = {}) {
  const { game, hands, rng } = bot;
  const end = Date.now() + timeout; let walked = 0;
  while (Date.now() < end) {
    const s = await game.snap();
    const drop = s.drops.find(d => d.d < range && d.d > 1.2); if (!drop) break;
    // Click the ground at the drop, or just short of it when its card covers the spot.
    let target = null;
    for (const back of [0, .8, 1.6]) {
      const k = back / Math.max(drop.d, .01), x = drop.x + (s.player.x - drop.x) * k, z = drop.z + (s.player.z - drop.z) * k;
      const p = await game.project(x, z); if (await game.safe(p, s) && await game.pick(p.x, p.y) === null && !await game.intoDoor(x, z, s)) { target = p; break; }
    }
    if (!target || !await game.tap(target.x, target.y)) await game.stepToward(drop.x, drop.z, s);
    walked++; await game.settle(); await new Promise(r => setTimeout(r, rng.between(150, 400)));
    if (walked > 8) break;
  }
  return walked;
}

/** Creatures it could not reach (behind trees, across water) are left alone for a while: rooted ones much longer. */
const unreachable = new Map();
/**
 * Whether the game's own route leads to the creature or to a spot beside it within `reach` (none: walled in by rocks,
 * trees or water). A rooted Snapping Flower never comes out, so one without a route is not worth a minute of rerouting.
 */
async function reachable(bot, e, reach) {
  return bot.page.evaluate(([x, z, r, reach]) => {
    const spots = [[x, z], ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => [x + Math.cos(i * Math.PI / 4) * Math.min(r + 1.2, reach), z + Math.sin(i * Math.PI / 4) * Math.min(r + 1.2, reach)])];
    return spots.some(([px, pz]) => { const route = window.__zg.route(px, pz), last = route[route.length - 1]; return !!last && Math.hypot(last.x - x, last.z - z) <= r + reach; });
  }, [e.x, e.z, e.r, reach]).catch(() => true);
}
/** The first of `list` (best first) that a route reaches; the ones without a route are remembered and skipped. */
async function firstReachable(bot, list, reach) {
  for (const e of list.slice(0, 5)) {
    if (await reachable(bot, e, reach)) return e;
    bot.log(`fight: no way to ${e.name}, skipped`); unreachable.set(e.id, Date.now() + 300000);
  }
  return undefined;
}
/** The creature being fought, kept across a rest so the fight is finished, not abandoned. */
let focus = null;

/** Defeat up to `count` creatures it can safely take on, preferring `type` (the bounty's species). */
/**
 * Open ground about 4.5 m away, as close to direction `angle` as possible: every point on the way clear of water,
 * trees and rocks (a step back into a pond would open its fishing card). Null when boxed in.
 */
async function openGround(bot, from, angle) {
  const tries = [0, .5, -.5, 1, -1, 1.5, -1.5, 2.1, -2.1].map(turn => [0, 1, 2].map(i => ({ x: from.x + Math.cos(angle + turn) * (1.5 + i * 1.5), z: from.z + Math.sin(angle + turn) * (1.5 + i * 1.5) })));
  const ponds = (await bot.game.snap()).entities.filter(e => e.kind === 'fish'), wet = p => ponds.some(o => Math.hypot(p.x - o.x, p.z - o.z) < o.r + 1.2);
  const flags = await bot.page.evaluate(paths => paths.map(path => path.some(p => window.__zg.blocked(p.x, p.z))), tries);
  const i = flags.findIndex((stuck, k) => !stuck && !tries[k].some(wet)); return i < 0 ? null : tries[i][2];
}
export async function fight(bot, { count = 3, type, timeout = 180000, range = 30 } = {}) {
  const { game, hands, rng, note, log } = bot;
  const end = Date.now() + timeout; let kills = 0;
  while (kills < count && Date.now() < end) {
    let s = await game.snap();
    if (await handleFall(bot)) return `knocked out after ${kills}`;
    // Hurt: recover first. If that could not help (no food, no cottage on this world), stop rather than loop.
    if (s.hp < s.maxHp * .7) { const before = s.hp; await recover(bot); if ((await game.snap()).hp <= before + 1) { log('fight: too hurt to fight, no way to heal here'); return `kills ${kills}, too hurt`; } continue; }
    if (game.indoors(s)) { if (!await leaveHouse(bot)) return `stuck indoors after ${kills}`; continue; }
    const usable = list => list.filter(e => !(unreachable.get(e.id) > Date.now()));
    // Finish what was started: the creature fought before a rest comes first, then any wounded one.
    const wounded = list => [...list].sort((a, b) => Number(b.hp < b.maxHp) - Number(a.hp < a.maxHp));
    const remembered = focus && s.enemies.find(e => e.id === focus && e.d < range + 25);
    // Bows and blasters fight from range (below): no pack gathering for the close-up burst.
    const ranged = s.weapon?.kind === 'gun' && s.gear.weapon !== 'harpoon', reach = ranged ? s.weapon.range : 3.2;
    let target = remembered ?? await firstReachable(bot, wounded(usable(safeTargets(s, { type, range }))), reach) ?? (type ? await firstReachable(bot, wounded(usable(safeTargets(s, { range }))), reach) : undefined);
    // With Q or E ready and health to spare, go for where the creatures stand thickest and gather them first.
    const aoeReady = s.cooldowns[0] <= 0 || s.cooldowns[2] <= 0;
    if (!remembered && !type && aoeReady && !ranged && s.hp > s.maxHp * .7) {
      const pack = densest(s, usable(safeTargets(s, { range })));
      if (pack && pack.crowd >= 3) { target = pack.e; if (await gatherPack(bot, { pack: pack.e })) { log(`fight: gathered a pack of ${around(await game.snap(), 4.4).length}`); await burst(bot); } }
    }
    if (!target) { log('fight: nothing safe to fight'); break; }
    const id = target.id; let engaged = false, reroutes = 0, keptAway = 0; focus = id;
    // Progress watch: the creature losing health or the explorer closing in. A quiet spell means stuck.
    let best = { hp: target.hp, d: target.d, at: Date.now() };
    const fightEnd = Date.now() + 60000;
    while (Date.now() < fightEnd) {
      s = await game.snap();
      if (s.modal === 'death') break;
      // A panel opened by a stray tap (a pond's fishing card, a shop) blocks every click: close it and carry on.
      if (s.modal || s.dialog) { await game.closePanel(); engaged = false; best.at = Date.now(); continue; }
      // A stray tap walked into the cottage: no creature can be reached from in there, so out first, then on.
      if (game.indoors(s)) { log('fight: indoors, stepping out'); if (!await leaveHouse(bot)) break; engaged = false; best.at = Date.now(); continue; }
      const e = s.enemies.find(x => x.id === id);
      if (!e) { kills++; focus = null; note(`defeated ${target.name}`, 'combat'); await new Promise(r => setTimeout(r, rng.between(300, 700))); await collectLoot(bot); break; }
      if (e.d > range + 25) { log('fight: it got away'); focus = null; break; }
      // Ordinary creatures telegraph too: step out of any circle under the explorer first.
      const dangers = dangersOf(s);
      if (dangers.length && inDanger(s.player, dangers)) { await dodge(bot, { away: e }); engaged = false; best.at = Date.now(); continue; }
      if (e.hp < best.hp - .5 || e.d < best.d - .8) best = { hp: Math.min(best.hp, e.hp), d: Math.min(best.d, e.d), at: Date.now() };
      else if (Date.now() - best.at > 6000) {
        // Not getting closer: take the game's route around (the gate, past the trees) before giving up.
        // First step clear of whatever holds the explorer (a rock among creatures), then try the game's route.
        if (reroutes === 0) await unstick(bot);
        if (reroutes++ < 3) { log(`fight: rerouting to ${target.name}`); await game.stepToward(e.x, e.z, s); best.at = Date.now(); engaged = false; await new Promise(r => setTimeout(r, rng.between(600, 1000))); continue; }
        // One that never moved is rooted (a Snapping Flower): it will still be out of reach long after a minute.
        const rooted = Math.hypot(e.x - target.x, e.z - target.z) < .5;
        log(`fight: cannot reach ${target.name}, trying another`); unreachable.set(id, Date.now() + (rooted ? 600000 : 60000)); focus = null; break;
      }
      // Ranged: keep the distance. A creature closer than 2.6 m means a few steps back (away from all close ones), then shoot again.
      if (ranged && Date.now() - keptAway > 1200) {
        const close = s.enemies.filter(x => x.d < 2.6);
        if (close.length) {
          const ax = close.reduce((n, x) => n + s.player.x - x.x, 0), az = close.reduce((n, x) => n + s.player.z - x.z, 0);
          keptAway = Date.now();
          const back = await openGround(bot, s.player, Math.atan2(az, ax));
          if (back) { log(`fight: stepping back from ${close.length} (bow)`); await game.stepToward(back.x, back.z, s).catch(() => {}); }
          await new Promise(r => setTimeout(r, rng.between(450, 750))); engaged = false; best.at = Date.now(); continue;
        }
      }
      if (s.hp < s.maxHp * .5) {
        // Back off and heal, then come back for this same creature (focus stays set).
        log('fight: backing off to recover'); if (e.hp > e.maxHp * .5) avoid(e.type);
        await game.stepToward(s.player.x * 2 - e.x, s.player.z * 2 - e.z, s).catch(() => {}); await recover(bot); break;
      }
      if (e.d > reach * .9 || !engaged) {
        if (e.d < 35 && await game.safe(e.screen, s) && await game.pick(e.screen.x, e.screen.y) === e.id && !await game.intoDoor(e.x, e.z, s) && await game.tap(e.screen.x, e.screen.y, e.id)) { engaged = true; await new Promise(r => setTimeout(r, rng.between(400, 800))); }
        else { await game.stepToward(e.x, e.z, s); await new Promise(r => setTimeout(r, rng.between(500, 900))); }
        continue;
      }
      // In reach the explorer swings by itself; spend skills where they hit the most creatures.
      const skill = pickSkill(s, { swordish: !ranged && /sword|hammer|scythe/.test(s.gear.weapon ?? ''), target: e, ranged, reach });
      if (skill >= 0) await useSkill(bot, skill);
      else if (rng.chance(.3)) { await hands.press(' '); await new Promise(r => setTimeout(r, rng.between(200, 450))); }
      else await new Promise(r => setTimeout(r, rng.between(250, 500)));
    }
  }
  await collectLoot(bot);
  return `kills ${kills}`;
}
