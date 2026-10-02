import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';

function world(level: number) {
  const state = M.newGame(); state.level = level;
  return Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 4 / 3, .5, 300),
    root: new T.Group(), player: new T.Group(), companion: new T.Group(), position: new T.Vector3(),
    destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0,
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {},
  }) as World;
}

test('creatures keep pace with the explorer: level -1..+2, with health, damage and XP to match', () => {
  const w = world(40); w.build('home'); w.syncLevels();
  const regular = w.enemies.filter(e => !e.boss && e.type !== 'dragon');
  assert.ok(regular.length > 50);
  for (const e of regular) {
    assert.ok(e.level! >= 39 && e.level! <= 42, `${e.type} Lv${e.level}`);
    const gain = e.level! - e.baseLevel!;
    assert.equal(e.maxHp, Math.round(e.baseMaxHp! * (1 + gain * .12)));
    assert.equal(e.xp, Math.round(e.baseXp! * (1 + gain * .1)));
  }
  assert.ok(new Set(regular.map(e => e.level)).size >= 3, 'the offsets vary from creature to creature');
  // Bosses and Titans rise too; a creature already above the explorer keeps its own level.
  for (const e of w.enemies.filter(e => e.boss)) assert.ok(e.level! >= Math.min(39, e.baseLevel!));
  const low = world(1); low.build('home'); low.syncLevels();
  for (const e of low.enemies) assert.ok(e.level! >= e.baseLevel! && e.level! <= Math.max(e.baseLevel!, 3));
});

test('a level-up lifts unhurt creatures at once; a hurt one keeps its stats until it respawns', () => {
  const w = world(20); w.build('home'); w.syncLevels();
  const hurt = w.enemies.find(e => !e.boss)!, fresh = w.enemies.find(e => !e.boss && e !== hurt)!;
  hurt.hp -= 1; const hurtLevel = hurt.level;
  w.state.level = 30; w.syncLevels();
  assert.ok(fresh.level! >= 29); assert.equal(hurt.level, hurtLevel);
  hurt.hp = 0; hurt.respawn = 0; w.position.set(hurt.homeX + 40, 0, hurt.homeZ); w.update(.016, false, false, true);
  assert.ok(hurt.level! >= 29, 'resynced on respawn');
});
