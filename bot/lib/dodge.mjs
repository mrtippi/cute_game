// Getting out of red warning circles the way a player does: react, then run with the arrow keys until
// clear of every circle (they come in many sizes, from a slam at your feet to a quake around the boss),
// checking the ground again every few frames while running.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MARGIN = .8;   // the explorer's own size, plus a little room

export const inDanger = (p, dangers) => dangers.some(d => Math.hypot(p.x - d.x, p.z - d.z) < d.r + MARGIN);
export const dangersOf = s => s.enemies.flatMap(e => e.danger ?? []);

/** The nearest point outside every circle: try sixteen directions, step outward until clear, keep the shortest. */
export function escapePoint(p, dangers, away) {
  let best = null;
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    for (let step = .5; step <= 14; step += .5) {
      const q = { x: p.x + dx * step, z: p.z + dz * step };
      if (inDanger(q, dangers)) continue;
      // A small preference for running away from the boss when two ways are equally short.
      const score = step + (away ? -.15 * Math.hypot(q.x - away.x, q.z - away.z) / 10 : 0);
      if (!best || score < best.score) best = { ...q, dx, dz, step, score };
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
 * false when no way out was found.
 */
export async function dodge(bot, { away, maxMs = 2600 } = {}) {
  const { game, rng, page } = bot;
  // Reaction time: usually quick, now and then a beat late, as a person would be.
  await sleep(rng.chance(.12) ? rng.between(350, 600) : rng.between(90, 260));
  let s = await game.snap(), held = [];
  const end = Date.now() + maxMs;
  try {
    while (Date.now() < end) {
      const dangers = dangersOf(s);
      if (!dangers.length || !inDanger(s.player, dangers)) return true;
      const out = escapePoint(s.player, dangers, away);
      if (!out) return false;
      const keys = keysFor(out.dx, out.dz);
      // Change direction only when the way out changed: release what no longer applies, press what is new.
      for (const k of held.filter(k => !keys.includes(k))) await page.keyboard.up(k);
      for (const k of keys.filter(k => !held.includes(k))) await page.keyboard.down(k);
      held = keys;
      await sleep(80);
      s = await game.snap();
    }
    return !inDanger(s.player, dangersOf(s));
  } finally { for (const k of held) await page.keyboard.up(k); }
}
