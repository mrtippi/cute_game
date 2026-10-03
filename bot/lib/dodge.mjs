// Getting out of red warning circles the way a player does: react, then run with the arrow keys until
// clear of every circle (they come in many sizes, from a slam at your feet to a quake around the boss).
// The way out must be open ground: rocks, trees and water are checked along the whole path, and if the
// explorer stops moving while running (caught on a rock), that direction is dropped and another taken.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MARGIN = .8;   // the explorer's own size, plus a little room
const DIRS = 16, STEP = .5, REACH = 14;

export const inDanger = (p, dangers) => dangers.some(d => Math.hypot(p.x - d.x, p.z - d.z) < d.r + MARGIN);
export const dangersOf = s => [...s.enemies.flatMap(e => e.danger ?? []), ...(s.hazards ?? [])];

/** Ground blocked along every candidate direction, asked of the game in one call. */
async function blockedRays(bot, p) {
  const points = [];
  for (let k = 0; k < DIRS; k++) { const a = k / DIRS * Math.PI * 2; for (let step = STEP; step <= REACH; step += STEP) points.push([p.x + Math.cos(a) * step, p.z + Math.sin(a) * step]); }
  const flags = await bot.page.evaluate(points => points.map(([x, z]) => window.__zg.blocked(x, z)), points);
  const perDir = REACH / STEP, rays = [];
  for (let k = 0; k < DIRS; k++) rays.push(flags.slice(k * perDir, (k + 1) * perDir));
  return rays;
}

/**
 * The nearest open point outside every circle. Each of sixteen directions is walked outward; a rock or
 * tree on the way closes that direction. `bad` holds directions that just got the explorer stuck.
 */
export function escapePoint(p, dangers, rays, { away, bad = new Set() } = {}) {
  let best = null;
  for (let k = 0; k < DIRS; k++) {
    if (bad.has(k)) continue;
    const a = k / DIRS * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    for (let i = 0; i < rays[k].length; i++) {
      if (rays[k][i]) break;   // blocked: no way out this direction
      const step = (i + 1) * STEP, q = { x: p.x + dx * step, z: p.z + dz * step };
      if (inDanger(q, dangers)) continue;
      const score = step + (away ? -.15 * Math.hypot(q.x - away.x, q.z - away.z) / 10 : 0);
      if (!best || score < best.score) best = { ...q, k, dx, dz, step, score };
      break;
    }
  }
  return best;
}

/** Arrow keys for a direction in world space (in this game → is +x and ↓ is +z). */
function keysFor(dx, dz) {
  const keys = [];
  if (dx > .38) keys.push('ArrowRight'); else if (dx < -.38) keys.push('ArrowLeft');
  if (dz > .38) keys.push('ArrowDown'); else if (dz < -.38) keys.push('ArrowUp');
  return keys;
}

/**
 * Run out of the warning circles. Returns true once the explorer stands clear (or the circles are gone),
 * false when no open way out was found.
 */
export async function dodge(bot, { away, maxMs = 2800 } = {}) {
  const { game, rng, page, log } = bot;
  // Reaction time: usually quick, now and then a beat late, as a person would be.
  await sleep(rng.chance(.12) ? rng.between(350, 600) : rng.between(90, 260));
  let s = await game.snap(), held = [], rays = await blockedRays(bot, s.player), from = s.player, still = 0, dir = -1;
  const bad = new Set(), end = Date.now() + maxMs;
  try {
    while (Date.now() < end) {
      const dangers = dangersOf(s);
      if (!dangers.length || !inDanger(s.player, dangers)) return true;
      const out = escapePoint(s.player, dangers, rays, { away, bad });
      if (!out) { log?.('dodge: no open way out'); return false; }
      if (out.k !== dir) { dir = out.k; still = 0; }
      const keys = keysFor(out.dx, out.dz);
      for (const k of held.filter(k => !keys.includes(k))) await page.keyboard.up(k);
      for (const k of keys.filter(k => !held.includes(k))) await page.keyboard.down(k);
      held = keys;
      await sleep(80);
      s = await game.snap();
      // Caught on something: drop this direction and its neighbours, look again from here.
      if (Math.hypot(s.player.x - from.x, s.player.z - from.z) < .06) {
        if (++still >= 3) { bad.add(dir); bad.add((dir + 1) % DIRS); bad.add((dir + DIRS - 1) % DIRS); rays = await blockedRays(bot, s.player); still = 0; }
      } else still = 0;
      from = s.player;
    }
    return !inDanger(s.player, dangersOf(s));
  } finally { for (const k of held) await page.keyboard.up(k); }
}

/**
 * Unstick: when the explorer has not moved for a while next to creatures, walk a few metres along the most
 * open direction (used by the fight loops).
 */
export async function unstick(bot) {
  const { game, page, rng } = bot;
  const s = await game.snap(), rays = await blockedRays(bot, s.player);
  const open = rays.map((ray, k) => ({ k, free: ray.findIndex(b => b) < 0 ? ray.length : ray.findIndex(b => b) })).sort((a, b) => b.free - a.free)[0];
  if (!open || !open.free) return false;
  const a = open.k / DIRS * Math.PI * 2, keys = keysFor(Math.cos(a), Math.sin(a));
  for (const k of keys) await page.keyboard.down(k);
  await sleep(rng.between(450, 750));
  for (const k of keys) await page.keyboard.up(k);
  return true;
}
