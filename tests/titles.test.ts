import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../src/world.ts';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { applyGameAction } from '../src/actions.ts';
import { EnvironmentSimulation, createEnvironmentLayout } from '../src/environments.ts';
import { TITLES, EARNED_TITLES, RARITY_ORDER, CHAMPION_TITLE, rarityOf, titleHint, isTitle } from '../src/titles.ts';
import { plateHtml } from '../src/nameplates.ts';
import { TITLE_THEMES } from '../bot/tasks/titles.mjs';
import { ATTIC, ATTIC_LEVEL, TROPHY_SPOTS, HOUSE, walkable, inAttic } from '../src/house.ts';
import { HouseSession, houseFocus } from '../src/house-session.ts';
import { buildTrophies, shownTrophies } from '../src/attic-view.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const now = Date.UTC(2026, 9, 3, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const act = (s: M.SaveState, type: string, payload: Record<string, unknown>) => applyGameAction(s, { type, payload }, { now, random: () => .5 });

test("46 titles in four rarities: eighteen from long-term play, three from online co-op, the champion's, six rainbow crowns", () => {
  assert.equal(Object.keys(TITLES).length, 46); assert.equal(EARNED_TITLES.length, 21);
  assert.deepEqual(Object.keys(TITLES).filter(x => TITLES[x] === 'rainbow').sort(), ['Bane of Bosses', 'Former Server Champion', 'Keeper of the Starlight', 'Legend of the Stars', 'Ruler of the Stars', 'Tycoon']);
  assert.equal(rarityOf(CHAMPION_TITLE), 'rainbow'); assert.ok(!EARNED_TITLES.some(e => e.title === CHAMPION_TITLE), "only the server gives the champion's title");
  for (const r of RARITY_ORDER) assert.ok(EARNED_TITLES.slice(11).some(e => e.rarity === r), `fun titles in ${r}`);
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

test('the fun titles come from the everyday counters, each at its own mark', () => {
  const marks: [string, string, number][] = [['Hungry Explorer', 'eat', 300], ['Hard Worker', 'questsDone', 500], ['Gale Traveller', 'skill', 10000], ['Kitchen Wizard', 'cook', 1000],
    ["Everyone's Favourite", 'gardenVisit', 100], ['Legendary Hunter', 'kill', 20000], ['Millionaire Farmer', 'harvest', 10000], ['Lord of the Sea', 'legendFish', 30], ['Tycoon', 'sell', 1000000], ['Bane of Bosses', 'boss', 1000]];
  for (const [title, total, mark] of marks) {
    const s = M.newGame(); s.progression.totals[total] = mark - 1; P.refreshProgress(s, now); assert.ok(!s.progression.titles.includes(title), `${title} not yet`);
    s.progression.totals[total] = mark; P.refreshProgress(s, now); assert.ok(s.progression.titles.includes(title), title);
    if (s.progression.titles.length === 1) assert.equal(s.progression.title, title, 'worn when nothing was');
  }
  // Played through the real events too: a snack counts towards the hungry explorer.
  const s = M.newGame(); s.progression.totals.eat = 299; P.recordEvent(s, 'eat', 1, 'apple', now); P.refreshProgress(s, now); assert.ok(s.progression.titles.includes('Hungry Explorer'));
  // The champion's title is kept by a save like any other.
  const c = M.newGame(); c.progression.titles.push(CHAMPION_TITLE); c.progression.title = CHAMPION_TITLE; assert.equal(reload(c).progression.title, CHAMPION_TITLE);
});

test("nameplates: name under the worn title, plates by rarity, the champion's crown; names are escaped", () => {
  const bronze = plateHtml({ name: 'Mio', title: 'Seasoned Explorer' }); assert.match(bronze, /np-face/); assert.match(bronze, /np-name">Mio</); assert.ok(!bronze.includes('np-wing'), 'bronze has no wings');
  assert.match(plateHtml({ name: 'Mio', title: 'Boss Hunter' }), /np-wing[\s\S]*np-spark/, 'gold: laurels and sparkles');
  const rainbow = plateHtml({ name: 'Mio', title: 'Tycoon' }); assert.match(rainbow, /np-feathers/); assert.match(rainbow, /np-crown/);
  assert.equal(plateHtml({ name: 'Mio', title: '' }), '<div class="np-name">Mio</div>', 'no title: the name alone');
  assert.equal(plateHtml({ name: 'Mio', title: 'Emperor of All' }), '<div class="np-name">Mio</div>', 'an unknown title is never shown');
  const crown = plateHtml({ name: 'Mio', title: 'Boss Hunter', champion: true }); assert.match(crown, /np-champion/); assert.match(crown, /np-crown-big/); assert.match(crown, /Server Champion<\/b><small>Boss Hunter</);
  assert.ok(!plateHtml({ name: '<img src=x>', title: '' }).includes('<img'));
  setLanguage('ja'); assert.match(plateHtml({ name: 'みお', title: 'Tycoon', champion: true }), /サーバーの覇者<\/b><small>大富豪</);
});

test('the bot wears only real titles, and the new ones suit its clip themes', () => {
  for (const [theme, list] of Object.entries(TITLE_THEMES)) for (const title of list) assert.ok(isTitle(title), `${theme}: ${title}`);
  const themed = new Set(Object.values(TITLE_THEMES).flat());
  for (const e of EARNED_TITLES.slice(11)) assert.ok(themed.has(e.title), e.title);
  assert.ok(themed.has(CHAMPION_TITLE));
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
  // Trophies: one per title held, coloured by rarity; with more titles than spots, the rarest (newest among equals).
  assert.equal(TROPHY_SPOTS.length, 36); assert.ok(Object.keys(TITLES).length > TROPHY_SPOTS.length);
  const all = Object.keys(TITLES), shown = shownTrophies(all); assert.equal(shown.length, 36);
  for (const title of all.filter(x => TITLES[x] === 'gold' || TITLES[x] === 'rainbow')) assert.ok(shown.includes(title), `${title} keeps its place`);
  assert.deepEqual(shown, all.filter(x => shown.includes(x)), 'still in the order earned');
  const rank = (x: string) => RARITY_ORDER.indexOf(TITLES[x]);
  for (const gone of all.filter(x => !shown.includes(x))) for (const kept of shown)
    assert.ok(rank(gone) < rank(kept) || rank(gone) === rank(kept) && all.indexOf(gone) < all.indexOf(kept), `${gone} steps aside before ${kept}: lower rarity, or older`);
  assert.equal(buildTrophies(all).children.length, 36);
  const cups = buildTrophies(w.state.progression.titles); assert.equal(cups.children.length, 3);
  assert.deepEqual(cups.children.map(c => c.userData.title), w.state.progression.titles);
  for (const spot of TROPHY_SPOTS) { assert.ok(spot.x > ATTIC.rect.x0 && spot.x < ATTIC.rect.x1 && spot.z > ATTIC.rect.z0 && spot.z < ATTIC.rect.z1); assert.ok(!walkable(spot), 'pedestals and plaques stand off the floor space'); }
  house.syncTrophies([...w.state.progression.titles, 'Boss Hunter']);
  assert.equal(house.view.root.getObjectByName('attic-trophies')!.children.length, 4);
});

test('every new title and the attic read in Japanese and Vietnamese', () => {
  for (const language of ['ja', 'vi'] as const) {
    setLanguage(language);
    for (const text of [...EARNED_TITLES.flatMap(e => [e.title, e.hint]), CHAMPION_TITLE, titleHint(CHAMPION_TITLE)[0], 'Server Champion', 'Title board', 'Memory room', 'Titles', 'Wear', 'Take off', 'Worn']) {
      const out = t(text); assert.notEqual(out, text, `${language}: ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(out), `English left: ${out}`);
    }
  }
});
