import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { applyGameAction } from '../src/actions.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { TITLES, EARNED_TITLES, RARITY_ORDER, rarityOf, titleHint } from '../src/titles.ts';
import { ATTIC, ATTIC_LEVEL, TROPHY_SPOTS, HOUSE, walkable, inAttic } from '../src/house.ts';
import { HouseSession, houseFocus } from '../src/house-session.ts';
import { buildTrophies } from '../src/attic-view.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const now = Date.UTC(2026, 9, 3, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown>) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

test('35 titles in four rarities: eight from long-term play, three from online co-op, three rainbow crowns', () => {
  assert.equal(Object.keys(TITLES).length, 35); assert.equal(EARNED_TITLES.length, 11);
  assert.deepEqual(Object.keys(TITLES).filter(x => TITLES[x] === 'rainbow').sort(), ['Keeper of the Starlight', 'Legend of the Stars', 'Ruler of the Stars']);
  for (const r of RARITY_ORDER) assert.ok(Object.values(TITLES).includes(r), r);
  assert.equal(rarityOf('Seasoned Explorer'), 'bronze'); assert.equal(rarityOf("Rancher's Friend"), 'silver'); assert.equal(rarityOf('Bear Breaker'), 'gold');
  for (const title of Object.keys(TITLES)) assert.ok(titleHint(title)[0].length > 5, title);
});

test('long-term play earns titles on its own; the first one is worn, then the player chooses', () => {
  const s = M.newGame();
  P.recordEvent(s, 'boss', 99, undefined, now); assert.ok(!s.progression.titles.includes('Boss Hunter'));
  P.recordEvent(s, 'boss', 1, undefined, now); P.refreshProgress(s, now);
  assert.ok(s.progression.titles.includes('Boss Hunter')); assert.equal(s.progression.title, 'Boss Hunter', 'worn when nothing was');
  s.forge = { sword_wood: 15 }; P.refreshProgress(s, now);
  assert.ok(s.progression.titles.includes('Legendary Smith')); assert.equal(s.progression.title, 'Boss Hunter', 'a later title does not replace the worn one');
  assert.equal(act(s, 'wearTitle', { id: 'Legendary Smith' }), true); assert.equal(s.progression.title, 'Legendary Smith');
  assert.throws(() => act(s, 'wearTitle', { id: 'Star Liberator' }), 'cannot wear a title not held');
  assert.equal(act(s, 'wearTitle', { id: '' }), true); assert.equal(s.progression.title, '');
  act(s, 'wearTitle', { id: 'Boss Hunter' });
  const r = reload(s); assert.equal(r.progression.title, 'Boss Hunter'); assert.deepEqual(r.progression.titles, s.progression.titles);
  const junk = JSON.parse(JSON.stringify(s)); junk.progression.title = 'Emperor of All'; junk.progression.titles.push('Emperor of All');
  const clean = M.parseSave(JSON.stringify(junk))!; assert.equal(clean.progression.title, ''); assert.ok(!clean.progression.titles.includes('Emperor of All'));
  // Story and side titles are worn the same way.
  const story = M.newGame(); story.level = 20; P.refreshProgress(story, now); assert.ok(P.claimProgress(story, 'side', 'gift:20', now));
  assert.equal(story.progression.title, 'Seasoned Explorer');
});

function homeWorld(level: number) {
  const state = M.newGame(); state.level = level; state.progression.titles = ['Seasoned Explorer', 'Bear Breaker', 'Keeper of the Starlight'];
  const w = Object.assign(Object.create(World.prototype), {
    state, scene: new T.Scene(), camera: new T.PerspectiveCamera(40, 1, .5, 300), root: new T.Group(), player: new T.Group(), companion: new T.Group(),
    position: new T.Vector3(0, 0, -4.4), destination: null, route: [], selected: null, obstacles: [], entities: [], enemies: [], plotMeshes: [], cropSignatures: [],
    particles: [], keys: new Set<string>(), facing: 0, time: 0, planet: 'home', hazardTimer: 0, zoom: 1, remoteRoot: new T.Group(),
    marker: new T.Mesh(), ring: new T.Mesh(), cameraTarget: new T.Vector3(), sun: new T.DirectionalLight(), raycaster: new T.Raycaster(),
    onInteract() {}, onAttackEnemy() {}, onDamage() {}, onZone() {}, resize() {},
  }) as World;
  w.environment = new EnvironmentSimulation(createEnvironmentLayout('home'));
  w.root.add(w.player, w.companion); w.scene.add(w.root, w.marker, w.ring, w.remoteRoot);
  return w;
}

test('the memory room joins the back of the cottage: locked below level 65, then trophies and the title board', () => {
  const low = homeWorld(ATTIC_LEVEL - 1), lowHouse = new HouseSession(); lowHouse.enter(low);
  assert.ok(low.entities.some(e => e.kind === 'house-attic-lock')); assert.ok(!low.entities.some(e => e.kind === 'house-titleboard'));
  assert.ok(low.blocked(ATTIC.door.x, ATTIC.door.z), 'the locked gate closes the doorway');
  const w = homeWorld(ATTIC_LEVEL), house = new HouseSession(); house.enter(w);
  assert.ok(w.entities.some(e => e.kind === 'house-titleboard')); assert.ok(!w.entities.some(e => e.kind === 'house-attic-lock'));
  // One walk from the study through the doorway into the room: every step on walkable floor, no gap between the rooms.
  for (let z = -5; z >= -10; z -= .25) assert.ok(walkable({ x: 4.05, z: Math.max(z, -8) }) && walkable({ x: z < -8 ? 4.05 - (-8 - z) : 4.05, z }), `step at z ${z}`);
  assert.ok(!w.blocked(ATTIC.door.x, ATTIC.door.z), 'the doorway is open');
  assert.ok(w.findPath(new T.Vector3(0, 0, -10.5)).length > 0, 'a route from the front door to the memory room');
  assert.ok(inAttic({ x: 0, z: -10 })); assert.ok(!inAttic(HOUSE.spawn));
  assert.ok(houseFocus({ x: 0, z: -11 }, 16 / 9, .9).z < houseFocus(HOUSE.spawn, 16 / 9, .9).z - 3, 'the camera slides back over the room');
  // Trophies: one per title held, coloured by rarity; room for every title.
  assert.ok(TROPHY_SPOTS.length >= Object.keys(TITLES).length);
  const cups = buildTrophies(w.state.progression.titles); assert.equal(cups.children.length, 3);
  assert.deepEqual(cups.children.map(c => c.userData.title), w.state.progression.titles);
  for (const spot of TROPHY_SPOTS) { assert.ok(spot.x > ATTIC.rect.x0 && spot.x < ATTIC.rect.x1 && spot.z > ATTIC.rect.z0 && spot.z < ATTIC.rect.z1); assert.ok(!walkable(spot), 'pedestals and plaques stand off the floor space'); }
  house.syncTrophies([...w.state.progression.titles, 'Boss Hunter']);
  assert.equal(house.view.root.getObjectByName('attic-trophies')!.children.length, 4);
});

test('every new title and the attic read in Japanese and Vietnamese', () => {
  for (const language of ['ja', 'vi'] as const) {
    setLanguage(language);
    for (const text of [...EARNED_TITLES.flatMap(e => [e.title, e.hint]), 'Title board', 'Memory room', 'Titles', 'Wear', 'Take off', 'Worn']) {
      const out = t(text); assert.notEqual(out, text, `${language}: ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(out), `English left: ${out}`);
    }
  }
});
