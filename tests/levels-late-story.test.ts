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

