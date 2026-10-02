// Skill use for crowds, from the game's own numbers (src/combat.ts):
//   Q Whirlwind  cd 7 s: ten hits over 2.2 s around the explorer (3.4 m with a sword, else 2.8 m), and the
//                explorer can keep walking while it spins.
//   W Dash       cd 4 s: rush forward, striking each creature on the way once (good to close in or cut a line).
//   E Slam       cd 9 s: leap and land, 4.4 m shockwave at 2.3x attack, throwing creatures into the air.
//   R Special    the weapon's own skill.
// Cooldowns shrink with the attack-speed stat. Big area skills are worth most with several creatures packed
// close, so gather them first and then spend the skills on the pack.
import { dodge, dangersOf, inDanger, unstick } from './dodge.mjs';
const Q = 0, W = 1, E = 2, R = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Creatures within `r` metres of the explorer. */
export const around = (s, r) => s.enemies.filter(e => e.d <= r);

/** Where creatures stand thickest: the creature with the most others within 5 m. */
export function densest(s, candidates = s.enemies) {
  let best = null;
  for (const e of candidates) {
    const crowd = s.enemies.filter(o => Math.hypot(o.x - e.x, o.z - e.z) < 5).length;
    if (!best || crowd > best.crowd || crowd === best.crowd && e.d < best.e.d) best = { e, crowd };
  }
  return best;
}

/**
 * The skill to use now, or -1: slam the pack when two or more stand inside its 4.4 m ring, spin when
 * several are close, dash at a creature a few metres off, the special on anything in reach.
 */
export function pickSkill(s, { swordish = true, target } = {}) {
  const ready = i => (s.cooldowns[i] ?? 1) <= 0;
  const spin = swordish ? 3.4 : 2.8;
  const ring = around(s, 4.4).length, close = around(s, spin).length;
  if (ready(E) && ring >= 2) return E;
  if (ready(Q) && (close >= 2 || close >= 1 && target?.boss)) return Q;
  if (ready(W) && target && target.d > 3.2 && target.d < 8) return W;
  if (ready(R) && close >= 1) return R;
  if (ready(E) && ring >= 1 && target?.hp > (s.attack ?? 10) * 3) return E;
  return -1;
}

/** Press a skill like a player: the key, a short follow-through. */
export async function useSkill(bot, index) {
  await bot.hands.press(['q', 'w', 'e', 'r'][index]);
  await sleep(bot.rng.between(index === E ? 450 : 200, index === E ? 700 : 380));
}

/** Open ground on the straight line from a to b (trees, rocks and water block it), asked in one call. */
async function clearPath(bot, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.ceil(d / .5)), points = [];
  for (let i = 1; i <= n; i++) points.push([a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n]);
  const flags = await bot.page.evaluate(points => points.map(([x, z]) => window.__zg.blocked(x, z)), points);
  return !flags.some(Boolean);
}

/** Arrow keys for a direction in world space (in this game → is +x and ↓ is +z). */
function keysFor(dx, dz) {
  const keys = [];
  if (dx > .38) keys.push('ArrowRight'); else if (dx < -.38) keys.push('ArrowLeft');
  if (dz > .38) keys.push('ArrowDown'); else if (dz < -.38) keys.push('ArrowUp');
  return keys;
}

/**
 * Gather a pack the way players do: run circles around the group so every creature notices and chases,
 * bunching up behind the explorer; stop once three or more are close (or after about a lap and a half),
 * ready for the slam and the spin. Dodges warning circles on the way; gives up early if health drops.
 */
export async function gatherPack(bot, { pack, radius = 5, laps = 1.5 } = {}) {
  const { game, page, rng } = bot;
  let s = await game.snap();
  const anchor = pack ? s.enemies.find(e => e.id === pack.id) : densest(s)?.e;
  if (!anchor) return false;
  // Centre of the pack: the anchor and everything within 6 m of it.
  const group = s.enemies.filter(e => Math.hypot(e.x - anchor.x, e.z - anchor.z) < 6);
  const c = { x: group.reduce((n, e) => n + e.x, 0) / group.length, z: group.reduce((n, e) => n + e.z, 0) / group.length };
  const startHp = s.hp, turn = rng.chance(.5) ? 1 : -1, end = Date.now() + 14000;
  let angle = Math.atan2(s.player.z - c.z, s.player.x - c.x), travelled = 0, held = [], turnSign = turn, from = s.player, still = 0;
  try {
    while (Date.now() < end && travelled < laps * Math.PI * 2) {
      s = await game.snap();
      if (around(s, 3.5).length >= 3) return true;
      if (inDanger(s.player, dangersOf(s))) { for (const k of held) await page.keyboard.up(k); held = []; await dodge(bot, { away: c }); continue; }
      if (s.hp < Math.max(s.maxHp * .55, startHp - s.maxHp * .25)) return around(s, 4.4).length >= 2;
      // Caught on a tree or rock: step clear and circle the other way.
      if (Math.hypot(s.player.x - from.x, s.player.z - from.z) < .12) { if (++still >= 2) { for (const k of held) await page.keyboard.up(k); held = []; await unstick(bot); turnSign = -turnSign; still = 0; s = await game.snap(); } } else still = 0;
      from = s.player;
      // Next point on the circle, a little ahead; if a tree or rock is in the way, try a wider or tighter
      // circle or a little further round, so the explorer runs around obstacles instead of into them.
      angle += turnSign * .55; travelled += .55;
      let next = null;
      for (const [da, r] of [[0, radius], [0, radius + 1.5], [0, radius - 1.5], [turnSign * .4, radius], [turnSign * .4, radius + 2.5], [-turnSign * .3, radius + 1]]) {
        const q = { x: c.x + Math.cos(angle + da) * r, z: c.z + Math.sin(angle + da) * r };
        if (await clearPath(bot, s.player, q)) { next = q; break; }
      }
      if (!next) { turnSign = -turnSign; continue; }
      const dx = next.x - s.player.x, dz = next.z - s.player.z, d = Math.hypot(dx, dz) || 1;
      const keys = keysFor(dx / d, dz / d);
      for (const k of held.filter(k => !keys.includes(k))) await page.keyboard.up(k);
      for (const k of keys.filter(k => !held.includes(k))) await page.keyboard.down(k);
      held = keys;
      await sleep(rng.between(220, 320));
    }
  } finally { for (const k of held) await page.keyboard.up(k); }
  return around(await game.snap(), 4.4).length >= 2;
}

/** The burst on a gathered pack: slam them up, spin through them, then dash and the special for stragglers. */
export async function burst(bot) {
  const { game, rng } = bot;
  for (const index of [E, Q, R, W]) {
    const s = await game.snap();
    if ((s.cooldowns[index] ?? 1) > 0 || !around(s, index === W ? 8 : 4.4).length) continue;
    await useSkill(bot, index);
    if (index === Q) await sleep(rng.between(900, 1400));   // let the spin run through the pack
  }
}
