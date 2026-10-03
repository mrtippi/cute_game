// Walking round the lava on the volcano world. The game lets the explorer cross lava (burning 7% of health every half
// second) and its own route (window.__zg.route) goes straight through it, so the bot plans the way itself, like a player
// who keeps to the rock: over the grid the bridge hands over (window.__zg.lavaGrid: '0' open ground, '1' lava, '2'
// blocked, '3' outside the world), the cheapest way with lava costing far more than a long walk round, then walked in
// legs from one point to the next. When there is no way round, the way found is the shortest lava crossing.
// Pure functions (tested in tests/bot-lava.test.mjs); bot/lib/game.mjs asks the page for the grid and walks the legs.

/** Cost of a metre: on open ground, next to rocks (the game's route goes round them), and in lava. */
const COST = { 0: 1, 2: 4, 1: 80 };
/** Lava along a straight line that is not worth a detour (a toe over the edge of a pool). */
export const LAVA_SLACK = .6;
/** How far ahead along the planned way a leg may reach (a tap within view, the game's route takes it from there). */
const REACH = 30;

const kindAt = (grid, ix, iz) => ix < 0 || iz < 0 || ix >= grid.w || iz >= grid.h ? '3' : grid.data[iz * grid.w + ix];
/** What the ground is at a world point: '0' open, '1' lava, '2' blocked, '3' outside. */
export const groundAt = (grid, x, z) => kindAt(grid, Math.floor((x - grid.x0) / grid.cell), Math.floor((z - grid.z0) / grid.cell));
const centre = (grid, ix, iz) => ({ x: grid.x0 + (ix + .5) * grid.cell, z: grid.z0 + (iz + .5) * grid.cell });

/** Metres of lava on the straight line from a to b (sampled every quarter cell). */
export function lavaAlong(grid, a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(d / (grid.cell / 4)));
  let lava = 0;
  for (let i = 0; i < steps; i++) { const t = (i + .5) / steps; if (groundAt(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) === '1') lava += d / steps; }
  return lava;
}

/**
 * The cheapest way from `from` to `to` over the grid (Dijkstra, eight neighbours): a list of points from the explorer to
 * the target, each with the lava walked so far (`lava`), and the lava of the whole way. Null when the target cannot be
 * reached at all (outside the world). The target's own cell counts as open: things to tap stand on blocked ground.
 */
export function lavaRoute(grid, from, to) {
  const { w, h } = grid, n = w * h;
  const cellOf = p => [Math.max(0, Math.min(w - 1, Math.floor((p.x - grid.x0) / grid.cell))), Math.max(0, Math.min(h - 1, Math.floor((p.z - grid.z0) / grid.cell)))];
  const [sx, sz] = cellOf(from), [gx, gz] = cellOf(to), start = sz * w + sx, goal = gz * w + gx;
  const dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  // A binary heap of [cost, cell].
  const heap = [];
  const push = (c, i) => { heap.push([c, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= c) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let m = k; const l = 2 * k + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const kind = i => i === goal || i === start ? (grid.data[i] === '1' ? '1' : '0') : grid.data[i];
  dist[start] = 0; push(0, start);
  while (heap.length) {
    const [c, i] = pop(); if (done[i]) continue; done[i] = 1;
    if (i === goal) break;
    const ix = i % w, iz = (i - ix) / w;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= w || jz >= h) continue;
      const j = jz * w + jx, k = kind(j); if (k === '3' || done[j]) continue;
      // No cutting a corner between two cells outside the world.
      if (dx && dz && (kindAt(grid, ix + dx, iz) === '3' || kindAt(grid, ix, iz + dz) === '3')) continue;
      const step = (dx && dz ? Math.SQRT2 : 1) * grid.cell, next = c + step * (COST[k] + COST[kind(i)]) / 2;
      if (next < dist[j]) { dist[j] = next; parent[j] = i; push(next, j); }
    }
  }
  if (!done[goal]) return null;
  const cells = []; for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
  cells.reverse();
  const points = cells.map((i, k) => k === 0 ? { ...from } : k === cells.length - 1 ? { ...to } : centre(grid, i % w, Math.floor(i / w)));
  if (points.length === 1) points.push({ ...to });
  let lava = 0; points[0].lava = 0;
  for (let k = 1; k < points.length; k++) { lava += lavaAlong(grid, points[k - 1], points[k]); points[k].lava = lava; }
  return { points, lava };
}

/** The planned point nearest the explorer (it walks on between plans). */
function nearest(points, from) {
  let first = 0, best = Infinity;
  points.forEach((p, k) => { const d = Math.hypot(p.x - from.x, p.z - from.z); if (d < best) { best = d; first = k; } });
  return first;
}

/**
 * The next point to walk to along a planned way: the furthest one within reach whose straight line from `from` takes
 * no more lava than the way itself does up to there (cutting a corner, never into a pool), on open ground.
 */
export function nextLeg(grid, from, points, { reach = REACH } = {}) {
  const first = nearest(points, from), base = points[first].lava;
  let leg = null, walked = 0;
  for (let k = first + 1; k < points.length; k++) {
    walked += Math.hypot(points[k].x - points[k - 1].x, points[k].z - points[k - 1].z);
    if (walked > reach) break;
    const p = points[k], last = k === points.length - 1;
    if ((last || groundAt(grid, p.x, p.z) === '0') && lavaAlong(grid, from, p) <= p.lava - base + LAVA_SLACK / 2) leg = p;
  }
  return leg ?? points[Math.min(first + 1, points.length - 1)];
}

/**
 * How to walk from `from` to `to`: `via` is the point to head for first (null: straight there is fine), `lava` the
 * metres of lava the best way still crosses (more than a little: there is no way round), `direct` the straight line's,
 * `leg` the lava on the way to `via` (or to `to`): more than a little means a crossing now. `route` (from an earlier
 * plan to the same target) is reused while the explorer is still on it.
 */
export function planLava(grid, from, to, route = null) {
  const direct = lavaAlong(grid, from, to);
  if (direct <= LAVA_SLACK) return { via: null, lava: direct, direct, leg: direct, route: null };
  if (!route || !route.points.some(p => Math.hypot(p.x - from.x, p.z - from.z) < 4)) route = lavaRoute(grid, from, to);
  // Unreachable, or the straight line is as good as any: walk straight.
  const lava = route ? route.lava - route.points[nearest(route.points, from)].lava : direct;
  if (!route || direct <= lava + LAVA_SLACK) return { via: null, lava, direct, leg: direct, route };
  const p = nextLeg(grid, from, route.points), via = { x: p.x, z: p.z };
  return { via, lava, direct, leg: lavaAlong(grid, from, via), route };
}
