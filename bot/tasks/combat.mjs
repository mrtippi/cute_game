// Fighting the way a careful player does: only creatures it can beat, skills when ready, back off
// early, and get up again after a fall.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Health this fight would cost: time to defeat the creature times the damage it deals meanwhile,
 * plus a share for every other creature close enough to join in.
 */
export function fightCost(s, e) {
  const swing = .9, dps = Math.max(1, s.attack) / swing;
  const seconds = e.hp / dps;
  const hurt = Math.max(1, e.damage - s.defense * .5) / Math.max(.6, e.cooldown + .4);
  const crowd = s.enemies.filter(o => o.id !== e.id && Math.hypot(o.x - e.x, o.z - e.z) < 6).length;
  return seconds * hurt * (1 + crowd * .8);
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
  const done = await game.goTo(n => n.entities.find(e => e.kind === 'dropped'), { label: 'dropped bag', done: n => !n.dropped && n, timeout: 90000 });
  if (done) note('picked up the dropped bag', 'combat');
  return !!done;
}

/** Inside the cottage only the door, wardrobe, mirror and friends can be tapped. */
export const inside = s => s.entities.some(e => e.kind === 'house-door');
export async function leaveHouse(bot) {
  const { game, hands, rng, note } = bot;
  let out = await game.goTo(n => n.entities.find(e => e.kind === 'house-door'), { label: 'cottage door', done: n => !inside(n) && n, timeout: 30000 });
  // Fallback: walk toward the door with the arrow keys, then tap it again.
  for (let i = 0; !out && i < 3; i++) {
    const s = await game.snap(), door = s.entities.find(e => e.kind === 'house-door'); if (!door) { out = s; break; }
    const dx = door.x - s.player.x, dz = door.z - s.player.z;
    const key = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dz > 0 ? 'ArrowDown' : 'ArrowUp');
    await hands.press(key, { hold: rng.between(700, 1400) });
    out = await game.goTo(n => n.entities.find(e => e.kind === 'house-door'), { label: 'cottage door', done: n => !inside(n) && n, timeout: 15000 });
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
  const rested = await game.goTo(n => n.entities.find(e => e.kind === 'home' || e.kind === 'house-door'), { label: 'cottage', done: n => (inside(n) || n.hp >= n.maxHp * .95) && n, timeout: 90000 });
  if (rested) { await game.waitFor(n => n.hp >= n.maxHp * .9 && n, { timeout: 35000, every: 1000 }); note('rested in the cottage', 'combat'); }
  if (inside(await game.snap())) await leaveHouse(bot);
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
      const p = await game.project(x, z); if (await game.safe(p, s) && await game.pick(p.x, p.y) === null) { target = p; break; }
    }
    if (target) await hands.click(target.x, target.y); else await game.stepToward(drop.x, drop.z, s);
    walked++; await game.waitFor(n => !n.player.moving && n, { timeout: 4000, every: 200 }); await new Promise(r => setTimeout(r, rng.between(150, 400)));
    if (walked > 8) break;
  }
  return walked;
}

/** Creatures it could not reach (behind trees, across water) are left alone for a minute. */
const unreachable = new Map();
/** The creature being fought, kept across a rest so the fight is finished, not abandoned. */
let focus = null;

/** Defeat up to `count` creatures it can safely take on, preferring `type` (the bounty's species). */
export async function fight(bot, { count = 3, type, timeout = 180000, range = 30 } = {}) {
  const { game, hands, rng, note, log } = bot;
  const end = Date.now() + timeout; let kills = 0;
  while (kills < count && Date.now() < end) {
    let s = await game.snap();
    if (await handleFall(bot)) return `knocked out after ${kills}`;
    if (s.hp < s.maxHp * .7) { await recover(bot); continue; }
    if (inside(s)) { if (!await leaveHouse(bot)) return `stuck indoors after ${kills}`; continue; }
    const usable = list => list.filter(e => !(unreachable.get(e.id) > Date.now()));
    // Finish what was started: the creature fought before a rest comes first, then any wounded one.
    const wounded = list => [...list].sort((a, b) => Number(b.hp < b.maxHp) - Number(a.hp < a.maxHp));
    const remembered = focus && s.enemies.find(e => e.id === focus && e.d < range + 25);
    const target = remembered ?? wounded(usable(safeTargets(s, { type, range })))[0] ?? (type ? wounded(usable(safeTargets(s, { range })))[0] : undefined);
    if (!target) { log('fight: nothing safe to fight'); break; }
    const id = target.id; let engaged = false, reroutes = 0; focus = id;
    // Progress watch: the creature losing health or the explorer closing in. A quiet spell means stuck.
    let best = { hp: target.hp, d: target.d, at: Date.now() };
    const fightEnd = Date.now() + 60000;
    while (Date.now() < fightEnd) {
      s = await game.snap();
      if (s.modal === 'death') break;
      const e = s.enemies.find(x => x.id === id);
      if (!e) { kills++; focus = null; note(`defeated ${target.name}`, 'combat'); await new Promise(r => setTimeout(r, rng.between(300, 700))); await collectLoot(bot); break; }
      if (e.d > range + 25) { log('fight: it got away'); focus = null; break; }
      if (e.hp < best.hp - .5 || e.d < best.d - .8) best = { hp: Math.min(best.hp, e.hp), d: Math.min(best.d, e.d), at: Date.now() };
      else if (Date.now() - best.at > 6000) {
        // Not getting closer: take the game's route around (the gate, past the trees) before giving up.
        if (reroutes++ < 3) { log(`fight: rerouting to ${target.name}`); await game.stepToward(e.x, e.z, s); best.at = Date.now(); engaged = false; await new Promise(r => setTimeout(r, rng.between(600, 1000))); continue; }
        log(`fight: cannot reach ${target.name}, trying another`); unreachable.set(id, Date.now() + 60000); focus = null; break;
      }
      if (s.hp < s.maxHp * .5) {
        // Back off and heal, then come back for this same creature (focus stays set).
        log('fight: backing off to recover'); if (e.hp > e.maxHp * .5) avoid(e.type);
        await game.stepToward(s.player.x * 2 - e.x, s.player.z * 2 - e.z, s).catch(() => {}); await recover(bot); break;
      }
      if (e.d > 3.2 || !engaged) {
        if (e.d < 35 && await game.safe(e.screen, s) && await game.pick(e.screen.x, e.screen.y) === e.id) { await hands.click(e.screen.x, e.screen.y); engaged = true; await new Promise(r => setTimeout(r, rng.between(400, 800))); }
        else { await game.stepToward(e.x, e.z, s); await new Promise(r => setTimeout(r, rng.between(500, 900))); }
        continue;
      }
      // In reach the explorer swings by itself; add a skill when one is ready, like a player would.
      const ready = s.cooldowns.map((c, i) => c <= 0 ? i : -1).filter(i => i >= 0);
      if (ready.length && rng.chance(.5)) { await hands.press(['q', 'w', 'e', 'r'][rng.pick(ready)]); await new Promise(r => setTimeout(r, rng.between(250, 600))); }
      else if (rng.chance(.3)) { await hands.press(' '); await new Promise(r => setTimeout(r, rng.between(200, 450))); }
      else await new Promise(r => setTimeout(r, rng.between(250, 500)));
    }
  }
  await collectLoot(bot);
  return `kills ${kills}`;
}
