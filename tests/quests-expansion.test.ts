import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const start = Date.UTC(2026, 9, 2, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const total = (s: M.SaveState, event: string) => s.progression.totals[event] || 0;

test('daily and weekly lists gain twelve and six task types whose events are all counted', () => {
  assert.equal(Object.keys(P.TASK_SPECS.daily).length, 24);   // + village orders (hourly-orders.test.ts)
  assert.equal(Object.keys(P.TASK_SPECS.weekly).length, 18);   // + village orders, + planet stars
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
