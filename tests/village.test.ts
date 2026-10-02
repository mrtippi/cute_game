import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';
import { zoneAt } from '../src/environments.ts';
import { huntingPonds } from '../src/fish-hunting.ts';
import { applyGameAction } from '../src/actions.ts';
import { villageRankFor, waitingLevel, VILLAGE_RADII, villageRadius, placementRadius, decorationCap, VILLAGE_ZONES, ORCHARD_TREES, setVillageRank, MOON_POND } from '../src/village.ts';
afterEach(() => setVillageRank(1));

const start = Date.UTC(2026, 9, 2, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
function world(rank: number) {
  const state = M.newGame(); state.progression.villageRank = rank; state.level = 100;
  return Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300),
    root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as World;
}

test('village ranks 1–5 set the fence at 18, 22, 28, 34 and 40 m; rank 1 keeps the original numbers', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(villageRadius), [...VILLAGE_RADII]);
  assert.equal(placementRadius(1), 16.6); assert.equal(M.bedReach(1), M.BED_REACH);
  assert.equal(decorationCap(1), 40); assert.equal(decorationCap(4), 80);
  assert.equal(villageRadius(0), 18); assert.equal(villageRadius(99), 40); assert.equal(villageRadius('x'), 18);
  // Every zone lies in the ring of land its rank adds, clear of the fence.
  for (const z of VILLAGE_ZONES) {
    const d = Math.hypot(z.x, z.z);
    assert.ok(d - z.r > villageRadius(z.rank - 1) - 2.5 && d + z.r < villageRadius(z.rank) - .3, `${z.id} at ${d.toFixed(1)} m`);
  }
  for (const t of ORCHARD_TREES) assert.ok(Math.hypot(t.x, t.z) < 22 - 1, 'orchard trees inside the rank 2 fence');
});

test('the home world grows with the rank: fence, safe zone, zones and creatures kept 9 m outside', () => {
  for (const rank of [1, 2, 3, 4, 5]) {
    const w = world(rank); w.build('home'); const R = villageRadius(rank);
    const ring = w.obstacles.filter(o => Math.abs(Math.hypot(o.x, o.z) - R) < .7 && o.r === .42);
    assert.ok(ring.length >= 100 * R / 18, `rank ${rank}: fence colliders along ${R} m (${ring.length})`);
    assert.equal(zoneAt({ x: R - .5, z: .3 }), 'home'); assert.equal(zoneAt({ x: R + .5, z: .3 }), 'canyon');
    for (const e of w.enemies.filter(e => !e.boss)) assert.ok(Math.hypot(e.homeX, e.homeZ) >= Math.max(27, R + 9) - .01, `rank ${rank}: ${e.type} spawns outside`);
    const kinds = (k: string) => w.entities.filter(e => e.kind === k).length;
    assert.equal(kinds('orchard'), rank >= 2 ? 5 : 0);
    assert.equal(kinds('fish'), rank >= 3 ? 6 : 5);
    assert.equal(kinds('stardeck'), rank >= 5 ? 1 : 0);
    // A walk from the cottage door out through the east gate still finds its way.
    w.position.set(0, 0, -4.8); assert.ok(w.findPath(new T.Vector3(R + 6, 0, 0)).length > 0, `rank ${rank}: east gate reachable`);
  }
  // Rank 1 is the original village: 44 fence pieces, creatures from 27 m.
  const w = world(1); w.build('home');
  assert.equal(w.obstacles.filter(o => Math.abs(Math.hypot(o.x, o.z) - 18) < .7 && o.r === .42).length, 44 * 3);
});

test('a bigger village lets beds and decorations reach the new fence, but not onto its zones', () => {
  const s = M.newGame(); s.energy = 1e6; s.bag.deco_traincar = 3; s.level = 50;
  assert.equal(M.placeDecoration(s, 'deco_traincar', 20, 4), false, 'outside the rank 1 fence');
  s.progression.villageRank = 3;
  assert.equal(M.placeDecoration(s, 'deco_traincar', 20, 4), true);
  const pasture = VILLAGE_ZONES.find(z => z.id === 'pasture')!;
  assert.equal(M.placeDecoration(s, 'deco_traincar', pasture.x, pasture.z), false, 'not on the pasture');
  assert.equal(M.bedSpotOk(s, 21, 6), true); assert.equal(M.bedClear(21, 6, 0, 1), false);
  // Saves keep far decorations and beds (ranks never drop).
  const r = reload(s); assert.equal(r.decorations.length, 1); assert.equal(r.progression.villageRank, 3);
});

test('the orchard gives two fruit per tree once a day; the pasture adds room; the Moon Pond joins the fishing waters', () => {
  const s = M.newGame(); s.level = 50;
  assert.equal(M.shakeTree(s, 0, start), null, 'no orchard before rank 2');
  s.progression.villageRank = 2;
  const fruit = M.shakeTree(s, 0, start)!; assert.equal(fruit.count, 2); assert.equal(s.bag[fruit.item], 2);
  assert.equal(M.shakeTree(s, 0, start + 3600_000), null, 'once a day');
  assert.ok(M.shakeTree(s, 1, start));
  assert.equal(s.progression.totals.fruit, 4); assert.equal(s.progression.totals.harvest, 4);
  assert.ok(M.shakeTree(s, 0, start + 86400_000), 'ready again the next day');
  assert.equal(M.shakeTree(s, 5, start), null);
  assert.deepEqual(reload(s).orchard, s.orchard);
  assert.equal(applyGameAction(s, { type: 'shakeTree', payload: { index: 2 } }, { now: start, random: () => .5 }) !== null, true);
  // Pasture: two more chickens fit at rank 3.
  const base = M.penCapacity(s, 'chicken'); s.progression.villageRank = 3; assert.equal(M.penCapacity(s, 'chicken'), base + 2);
  // Moon Pond: a home water from rank 3, after the original ponds.
  assert.equal(huntingPonds('home', 2).length, 5);
  const ponds = huntingPonds('home', 3); assert.equal(ponds.length, 6);
  assert.deepEqual([ponds[5].x, ponds[5].z, ponds[5].rx], MOON_POND); assert.equal(ponds[5].waterId, 'home'); assert.equal(ponds[5].id, 'home:fish:5');
});

test('a rank won in the story opens only at its level: 20, 45, 65 and 85', () => {
  const s = M.newGame(); s.progression.villageRank = 5;
  for (const [level, rank, wait] of [[12, 1, 20], [19, 1, 20], [20, 2, 45], [44, 2, 45], [45, 3, 65], [70, 4, 85], [85, 5, null], [100, 5, null]] as const) {
    s.level = level; assert.equal(villageRankFor(s), rank, `level ${level}`); assert.equal(waitingLevel(s), wait);
  }
  s.level = 100; s.progression.villageRank = 2; assert.equal(villageRankFor(s), 2, 'never above the rank won in the story');
  // Below its level the village keeps the old fence: no orchard, placement stays inside 16.6 m.
  s.level = 15; assert.equal(M.shakeTree(s, 0, start), null); s.bag.deco_traincar = 1; assert.equal(M.placeDecoration(s, 'deco_traincar', 19, 4), false);
  s.level = 20; assert.ok(M.shakeTree(s, 0, start)); assert.equal(M.placeDecoration(s, 'deco_traincar', 19, 4), true);
});
