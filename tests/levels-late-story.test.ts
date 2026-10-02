import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const now = Date.UTC(2026, 9, 2, 12);

test('the level curve is unchanged up to the knee and steeper after it', () => {
  for (let level = 1; level <= M.XP_CURVE.knee; level++) assert.equal(M.xpNeeded(level), M.xpReward(level));
  for (const level of [20, 40, 70, 99]) assert.ok(M.xpNeeded(level) > M.xpReward(level) * 1.5, `level ${level} needs more than the reward curve`);
  for (let level = 2; level < M.MAX_LEVEL; level++) assert.ok(M.xpNeeded(level) > M.xpNeeded(level - 1), `level ${level} rises`);
});

test('quest rewards stay on the gentle curve, so late levels take real play', () => {
  const s = M.newGame(); s.level = 60; P.refreshProgress(s, now);
  const hourly = P.progressEntries(s, 'hourly', now)[0];
  assert.match(hourly.rewardLabel, new RegExp(`${Math.round(M.xpReward(60) * .08)} XP`));
  assert.ok(Math.round(M.xpReward(60) * .08) < M.xpNeeded(60) * .03, 'one hourly task is a small step of a late level');
});

test('levels stop at 100 and saves cannot claim more', () => {
  const s = M.newGame(); s.level = 99; s.xp = 0;
  M.gainXp(s, M.xpNeeded(99) * 50, now);
  assert.equal(s.level, M.MAX_LEVEL);
  const raw = JSON.parse(JSON.stringify(s)); raw.level = 5000;
  assert.equal(M.parseSave(JSON.stringify(raw))!.level, M.MAX_LEVEL);
});

test('chapters 8–19 each mix seven goals and wait for a level from 45 to 100; chapter 20 is the legend list', () => {
  const late = M.STORY_STEPS.slice(53);
  for (let c = 0; c < 12; c++) {
    const chapter = late.filter(step => step.chapter === 7 + c);
    assert.equal(chapter.length, 8, `chapter ${8 + c}`);
    const gate = chapter.at(-1)!;
    assert.equal(gate.condition, 'level'); assert.equal(gate.target, 45 + 5 * c); assert.ok(gate.end, 'a reward closes the chapter');
    assert.equal(new Set(chapter.slice(0, 7).map(step => step.event ?? step.condition)).size, 7, `chapter ${8 + c} has seven different goals`);
  }
  const legend = late.filter(step => step.chapter === 19);
  assert.equal(legend.length, 8); assert.ok(legend.at(-1)!.end);
  assert.ok(legend.some(step => step.condition === 'forgeMax' && step.target === 15));
  assert.equal(new Set(M.STORY_STEPS.map(step => step.chapter)).size, 20);
});

test('late story conditions read beds, crystal upgrades, fish species, collections and hourly chests', () => {
  const s = M.newGame(); s.level = 50;
  // The first late step with this condition (the numbers in titles grow by chapter).
  const at = (condition: string) => { s.progression.story = { index: M.STORY_STEPS.findIndex((step, i) => i >= 53 && step.condition === condition), progress: 0 }; return P.progressEntries(s, 'story', now)[0]; };
  assert.equal(at('beds').progress, s.plots.length);
  s.healthUp = 5; s.attackUp = 4; s.defenseUp = 2; s.critUp = 1; assert.equal(at('upgrades').progress, 12);
  s.fishRecords = { fish_perch: 20, fish_carp: 30 }; assert.equal(at('fishSpecies').progress, 2);
  const group = Object.values(M.COLLECTIONS)[0]; for (const item of group.items) s.collection[item] = 1;
  assert.equal(at('collections').progress, 1);
  // Opening the hourly chest counts for "Open {count} hourly chests".
  P.refreshProgress(s, now);
  for (const task of s.progression.hourly.tasks) P.recordEvent(s, P.TASK_SPECS.hourly[task.type].event, task.target, undefined, now);
  for (let i = 0; i < 4; i++) P.claimProgress(s, 'hourly', `${s.progression.hourly.key}:${i}`, now);
  P.claimProgress(s, 'hourly', `${s.progression.hourly.key}:chest`, now);
  assert.equal(s.progression.totals.hourChest, 1);
});

test('every late story title reads naturally in Vietnamese and Japanese', () => {
  for (const language of ['vi', 'ja'] as const) {
    setLanguage(language);
    for (const step of M.STORY_STEPS.slice(53)) {
      const text = t(step.title);
      assert.notEqual(text, step.title, `${language}: ${step.title}`);
      assert.ok(text.includes(String(step.target)), `${language}: the number stays in ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(text), `English left: ${text}`);
    }
  }
});
