import test from 'node:test';
import assert from 'node:assert/strict';
import { planLava, lavaAlong, lavaRoute, groundAt, LAVA_SLACK } from '../bot/lib/lava.mjs';

/** A grid the way window.__zg.lavaGrid hands it over, 1 m cells from (-30, -30), `kind(x, z)` per cell centre. */
function grid(kind, size = 60) {
  let data = '';
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) data += kind(-size / 2 + ix + .5, -size / 2 + iz + .5);
  return { x0: -size / 2, z0: -size / 2, cell: 1, w: size, h: size, data };
}
const pool = (x, z) => Math.hypot(x, z) < 10 ? '1' : '0';

/** Walk a plan leg by leg (as stepToward does), counting the lava waded through and the distance. */
function walk(g, from, to) {
  let at = { ...from }, lava = 0, length = 0, route = null;
  for (let legs = 0; legs < 40 && Math.hypot(to.x - at.x, to.z - at.z) > .5; legs++) {
    const plan = planLava(g, at, to, route); route = plan.route;
    const next = plan.via ?? to;
    lava += lavaAlong(g, at, next); length += Math.hypot(next.x - at.x, next.z - at.z); at = { x: next.x, z: next.z };
  }
  return { lava, length, at };
}

test('a pool between the explorer and the target is walked round, not across', () => {
  const g = grid(pool), from = { x: -20, z: 1 }, to = { x: 20, z: -1 };
  assert.ok(lavaAlong(g, from, to) > 18, 'the straight line crosses the pool');
  const plan = planLava(g, from, to);
  assert.ok(plan.via, 'a detour point');
  assert.equal(groundAt(g, plan.via.x, plan.via.z), '0');
  assert.ok(lavaAlong(g, from, plan.via) <= LAVA_SLACK);
  const done = walk(g, from, to);
  assert.ok(Math.hypot(done.at.x - to.x, done.at.z - to.z) <= .5, 'arrives');
  assert.ok(done.lava <= 1, `lava walked ${done.lava}`);
  // Round the pool's half circle, not a wide loop.
  assert.ok(done.length < 40 + Math.PI * 10, `walked ${done.length}`);
});

test('open ground and a toe over the edge are walked straight', () => {
  assert.equal(planLava(grid(() => '0'), { x: -20, z: 0 }, { x: 20, z: 5 }).via, null);
  // Clipping the corner of a lava cell (0.4 m): under the slack, no detour.
  const g = grid((x, z) => x > 0 && x < 1 && z > 0 && z < 1 ? '1' : '0'), plan = planLava(g, { x: -20, z: -19.3 }, { x: 20, z: 20.7 });
  assert.ok(plan.direct > 0 && plan.direct <= LAVA_SLACK, `clipped ${plan.direct}`);
  assert.equal(plan.via, null);
});

test('with no way round, the shortest crossing is taken', () => {
  // A lava river six metres wide right across the world: no way round.
  const g = grid((x) => Math.abs(x) < 3 ? '1' : '0'), from = { x: -20, z: -25 }, to = { x: 20, z: 25 };
  const plan = planLava(g, from, to);
  assert.ok(plan.direct > 9, `straight ${plan.direct}`);
  assert.ok(plan.lava <= 7, `best crossing ${plan.lava}`);
  const done = walk(g, from, to);
  assert.ok(Math.hypot(done.at.x - to.x, done.at.z - to.z) <= .5, 'still arrives');
  assert.ok(done.lava <= 7.5, `lava walked ${done.lava}`);
});

test('the way keeps inside the world and reaches a target standing on blocked ground', () => {
  // A ring of world edge ('3') except a gap, rocks ('2') at the target.
  const g = grid((x, z) => Math.hypot(x, z) < 1.5 ? '2' : Math.abs(x) < 1 && z < -5 ? '3' : pool(x - 12, z));
  const route = lavaRoute(g, { x: -10, z: -20 }, { x: 0, z: 0 });
  assert.ok(route, 'reachable');
  assert.ok(route.points.every(p => groundAt(g, p.x, p.z) !== '3'));
  assert.equal(route.lava, 0);
  assert.deepEqual(route.points.at(-1), { x: 0, z: 0, lava: 0 });
});

test('the explorer standing in lava heads out by the nearest shore', () => {
  const g = grid(pool), from = { x: -8, z: 0 }, to = { x: 20, z: 0 };
  const plan = planLava(g, from, to);
  // Out to the west shore (2 m) rather than across (18 m).
  assert.ok(plan.lava < 4, `lava ${plan.lava}`);
});
