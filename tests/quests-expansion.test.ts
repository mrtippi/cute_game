import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const start = Date.UTC(2026, 9, 2, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const total = (s: M.SaveState, event: string) => s.progression.totals[event] || 0;

test('story grows to seven chapters of fixed steps, then endless rounds in chapter 8', () => {
  assert.equal(M.STORY_STEPS.length, 53);
  for (const chapter of [4, 5, 6]) assert.equal(M.STORY_STEPS.filter(step => step.chapter === chapter).length, 8, `chapter ${chapter + 1}`);
  for (const chapter of [4, 5, 6]) assert.ok(M.STORY_STEPS.filter(step => step.chapter === chapter).at(-1)!.end, `chapter ${chapter + 1} ends with a reward`);
  assert.equal(P.storyStep(53).chapter, 7);
  assert.equal(P.storyStep(53).event, 'kill');
});

test('daily and weekly lists gain twelve and six task types whose events are all counted', () => {
  assert.equal(Object.keys(P.TASK_SPECS.daily).length, 23);
  assert.equal(Object.keys(P.TASK_SPECS.weekly).length, 16);
  const s = M.newGame();
  for (const spec of [...Object.values(P.TASK_SPECS.daily), ...Object.values(P.TASK_SPECS.weekly)]) {
    const before = total(s, spec.event); P.recordEvent(s, spec.event, 1, undefined, start);
    assert.equal(total(s, spec.event), before + 1, `${spec.title}: event ${spec.event} must be accepted`);
  }
});

test('gameplay actions record the new quest events', () => {
  const s = M.newGame(); s.level = 45; s.energy = 1e6;
  // Fertilizer on a growing crop.
  assert.equal(M.plant(s, 0, 'carrot', start), true); s.bag.manure = 1;
  assert.equal(M.fertilize(s, 0, start + 1000, 'manure'), true); assert.equal(total(s, 'fertilize'), 1);
  // Food with a bonus effect counts; plain healing food does not.
  s.bag.carrot = 1; assert.equal(M.eat(s, 'carrot', start), true); assert.equal(total(s, 'eat'), 1);
  // Fruit harvest counts as harvest and fruit.
  s.plots[1].crop = 'apple'; s.plots[1].plantedAt = start - 30 * 3600_000;
  assert.equal(M.harvest(s, 1, start), 'apple'); assert.equal(total(s, 'fruit'), 1); assert.ok(total(s, 'harvest') >= 1);
  // Stardust, mysterious shadows, Titans and hawks.
  M.collectStardust(s, () => .5); assert.equal(total(s, 'stardust'), 1);
  assert.equal(M.grantMysteryCatch(s, 'fish_carp', 30, false), true); assert.equal(total(s, 'mystery'), 1);
  M.grantDefeat(s, 'titan_turtle', 10, true, () => .99); assert.equal(total(s, 'titan'), 1);
  M.grantDefeat(s, 'forest_raptor', 10, false, () => .99); assert.equal(total(s, 'hawk'), 1);
  // Forging: every attempt counts, successes count separately.
  const weapon = Object.keys(M.ITEMS).find(id => M.ITEMS[id].slot === 'weapon' && M.ITEMS[id].weapon && M.ITEMS[id].weapon!.kind !== 'rod')!;
  s.bag[weapon] = 1; for (const [id, n] of Object.entries(M.forgeCost(0).materials)) s.bag[id] = (s.bag[id] || 0) + n! * 4;
  assert.ok(M.forgeWeapon(s, weapon, () => .99)); assert.ok(M.forgeWeapon(s, weapon, () => .01));
  assert.equal(total(s, 'forge'), 2); assert.equal(total(s, 'forgeOk'), 1);
  // Animal products.
  M.buildPen(s); assert.ok(M.buyAnimal(s, 'chicken', start)); const collected = M.collectProducts(s, start + 6 * 3600_000);
  assert.ok(collected.length > 0); assert.equal(total(s, 'animal'), collected.length);
});

test('claiming daily tasks and the check-in feeds the weekly quest and the visitor achievement', () => {
  const s = M.newGame(); P.refreshProgress(s, start);
  const login = P.progressEntries(s, 'daily', start).find(e => e.id.endsWith(':login'))!;
  assert.equal(P.claimProgress(s, 'daily', login.id, start), true); assert.equal(total(s, 'login'), 1);
  const task = s.progression.daily.tasks[0]; P.recordEvent(s, P.TASK_SPECS.daily[task.type].event, task.target, undefined, start);
  assert.equal(P.claimProgress(s, 'daily', `${s.progression.daily.key}:0`, start), true); assert.equal(total(s, 'dailyDone'), 1);
  assert.equal(P.progressEntries(s, 'achievements', start).find(e => e.id === 'visitor:0')!.progress, 1);
});

test('story conditions read the pen, animals, dog, forge rank, harpoon and distinct Titans', () => {
  const s = M.newGame(); s.level = 45; s.energy = 1e6;
  const at = (index: number) => { s.progression.story = { index, progress: 0 }; return P.progressEntries(s, 'story', start)[0]; };
  const step = (title: string) => M.STORY_STEPS.findIndex(x => x.title === title);
  assert.equal(at(step('Build the animal pen')).progress, 0);
  M.buildPen(s); assert.equal(at(step('Build the animal pen')).complete, true);
  M.buyAnimal(s, 'chicken', start); assert.equal(at(step('Raise three animals')).progress, 1);
  s.forge = { sword_wood: 4 }; assert.equal(at(step('Forge a weapon to +3')).complete, true); assert.equal(at(step('Forge a weapon to +5')).progress, 4);
  assert.equal(at(step('Get a hunting harpoon')).complete, false); s.bag.harpoon = 1; assert.equal(at(step('Get a hunting harpoon')).complete, true);
  M.grantDefeat(s, 'titan_turtle', 1, true, () => .99); M.grantDefeat(s, 'titan_turtle', 1, true, () => .99);
  assert.equal(at(step('Defeat three different Titans')).progress, 1, 'the same Titan twice is one Titan');
  assert.equal(reload(s).bosses?.filter(key => key.includes(':titan_')).length, 1);
});

test('older saves in the endless rounds start chapter 5 instead of landing mid-chapter', () => {
  const old = M.newGame(), raw = JSON.parse(JSON.stringify(old));
  raw.progression.story = { index: 35, progress: 7 }; delete raw.progression.storySteps; raw.quest = 35;
  const migrated = M.parseSave(JSON.stringify(raw))!;
  assert.deepEqual(migrated.progression.story, { index: 29, progress: 0 }); assert.equal(migrated.quest, 29);
  assert.equal(migrated.progression.storySteps, 53);
  // A save still inside the original 29 steps keeps its place, and current saves are left alone.
  raw.progression.story = { index: 12, progress: 1 }; assert.deepEqual(M.parseSave(JSON.stringify(raw))!.progression.story, { index: 12, progress: 1 });
  const current = M.newGame(); current.progression.story = { index: 40, progress: 2 };
  assert.deepEqual(reload(current).progression.story, { index: 40, progress: 2 });
});

test('every quest title is translated into Vietnamese and Japanese', () => {
  const titles = [...Object.values(P.TASK_SPECS.daily), ...Object.values(P.TASK_SPECS.weekly)].map(spec => spec.title)
    .concat(P.ACHIEVEMENT_TITLES, M.STORY_STEPS.map(step => step.title));
  for (const language of ['vi', 'ja'] as const) {
    setLanguage(language);
    for (const title of titles) assert.notEqual(t(title), title, `${language}: ${title}`);
  }
  setLanguage('ja');
  for (const title of titles) assert.ok(!/[A-Za-z]{3,}/.test(t(title)), `English left in Japanese: ${t(title)}`);
});
