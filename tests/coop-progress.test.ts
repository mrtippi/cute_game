import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { TITLES, rarityOf, titleHint } from '../src/titles.ts';
import { TROPHY_SPOTS } from '../src/house.ts';
import { buildTrophies } from '../src/attic-view.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const start = Date.UTC(2026, 9, 3, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const total = (s: M.SaveState, event: string) => s.progression.totals[event] || 0;
const achievement = (s: M.SaveState, id: string) => P.progressEntries(s, 'achievements', start).find(e => e.id.startsWith(id + ':'))!;

test('a defeat counts as co-op only with two or more contributors; bosses and Titans also count as co-op bosses', () => {
  const s = M.newGame();
  assert.equal(M.recordCoopDefeat(s, 'treant', true, 1, start), false);
  assert.equal(total(s, 'coopKill'), 0); assert.equal(total(s, 'coopBoss'), 0);
  assert.equal(M.recordCoopDefeat(s, 'mushroom', false, 2, start), true);
  assert.equal(total(s, 'coopKill'), 1); assert.equal(total(s, 'coopBoss'), 0);
  M.recordCoopDefeat(s, 'treant', true, 3, start); M.recordCoopDefeat(s, 'titan_turtle', false, 2, start);
  assert.equal(total(s, 'coopKill'), 3); assert.equal(total(s, 'coopBoss'), 2);
  assert.equal(reload(s).progression.totals.coopBoss, 2, 'co-op totals survive a reload');
});

test('ordinary offline play never moves the co-op totals', () => {
  const s = M.newGame(); s.level = 30;
  M.grantDefeat(s, 'treant', 100, true, () => .5); M.grantDefeat(s, 'mushroom', 10, false, () => .5);
  assert.equal(total(s, 'boss'), 1);
  for (const event of ['coopKill', 'coopBoss', 'gardenVisit', 'shareLoot']) assert.equal(total(s, event), 0, event);
  assert.equal(achievement(s, 'together').progress, 0); assert.equal(achievement(s, 'guest').progress, 0);
});

test('a garden visit counts once per friend per UTC day', () => {
  const s = M.newGame();
  let ledger = M.recordGardenVisit(s, undefined, 'alice', start)!; assert.deepEqual(ledger, { day: '2026-10-03', friends: ['alice'] });
  assert.equal(M.recordGardenVisit(s, ledger, 'alice', start + 3600_000), null);
  ledger = M.recordGardenVisit(s, ledger, 'bob', start)!; assert.deepEqual(ledger.friends, ['alice', 'bob']);
  assert.equal(total(s, 'gardenVisit'), 2);
  const tomorrow = M.recordGardenVisit(s, ledger, 'alice', start + 86400_000)!;
  assert.deepEqual(tomorrow, { day: '2026-10-04', friends: ['alice'] }); assert.equal(total(s, 'gardenVisit'), 3);
});

test('the Together and Garden guest achievement lines climb their tiers from the co-op totals', () => {
  const s = M.newGame();
  M.recordCoopDefeat(s, 'treant', true, 2, start);
  const first = achievement(s, 'together'); assert.equal(first.id, 'together:0'); assert.equal(first.complete, true);
  assert.equal(P.claimProgress(s, 'achievements', first.id, start), true); assert.equal(P.claimProgress(s, 'achievements', first.id, start), false);
  const next = achievement(reload(s), 'together'); assert.equal(next.target, 5); assert.equal(next.progress, 1);
  for (const friend of ['a', 'b', 'c', 'd', 'e']) M.recordGardenVisit(s, undefined, friend, start);
  assert.equal(achievement(s, 'guest').progress, 1, 'one claimable tier at a time');
  assert.equal(P.claimProgress(s, 'achievements', 'guest:0', start), true);
  assert.equal(achievement(s, 'guest').complete, true, 'five visits finish the second tier');
});

test('co-op titles: Welcome Guest at 10 visits, Trusted Companion at 10 co-op bosses, Party Leader at 50', () => {
  assert.equal(rarityOf('Welcome Guest'), 'bronze'); assert.equal(rarityOf('Trusted Companion'), 'silver'); assert.equal(rarityOf('Party Leader'), 'gold');
  const s = M.newGame();
  for (let day = 0; day < 9; day++) M.recordGardenVisit(s, undefined, 'alice', start + day * 86400_000);
  assert.ok(!s.progression.titles.includes('Welcome Guest'));
  M.recordGardenVisit(s, undefined, 'alice', start + 9 * 86400_000);
  assert.ok(s.progression.titles.includes('Welcome Guest'), 'held as soon as the tenth visit is recorded');
  assert.equal(s.progression.title, 'Welcome Guest', 'the first title is worn');
  for (let i = 0; i < 9; i++) M.recordCoopDefeat(s, 'treant', true, 2, start);
  assert.ok(!s.progression.titles.includes('Trusted Companion'));
  M.recordCoopDefeat(s, 'treant', true, 2, start); assert.ok(s.progression.titles.includes('Trusted Companion'));
  for (let i = 0; i < 40; i++) M.recordCoopDefeat(s, 'yeti', true, 4, start);
  assert.ok(s.progression.titles.includes('Party Leader'));
  assert.deepEqual(reload(s).progression.titles, ['Welcome Guest', 'Trusted Companion', 'Party Leader']);
  // Solo boss kills never earn them.
  const solo = M.newGame(); P.recordEvent(solo, 'boss', 60, undefined, start); P.refreshProgress(solo, start);
  assert.ok(!solo.progression.titles.some(x => ['Trusted Companion', 'Party Leader'].includes(x)));
});

test('co-op titles appear on the title board with hints and fit the memory room trophies', () => {
  for (const title of ['Welcome Guest', 'Trusted Companion', 'Party Leader']) {
    assert.ok(Object.hasOwn(TITLES, title), title); assert.match(titleHint(title)[0], /online/);
  }
  // More titles than pedestals now: the rarest keep a place (titles.test.ts); the co-op ones still fit beside them.
  assert.equal(buildTrophies(Object.keys(TITLES)).children.length, TROPHY_SPOTS.length, 'every pedestal used');
  const cups = buildTrophies(['Welcome Guest', 'Trusted Companion', 'Party Leader']);
  assert.deepEqual(cups.children.map(c => c.userData.title), ['Welcome Guest', 'Trusted Companion', 'Party Leader']);
});

test('co-op names read in Japanese and Vietnamese', () => {
  for (const language of ['ja', 'vi'] as const) {
    setLanguage(language);
    for (const text of ['Together', 'Garden guest', 'Welcome Guest', 'Trusted Companion', 'Party Leader']) {
      const out = t(text); assert.notEqual(out, text, `${language}: ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(out), `English left: ${out}`);
    }
  }
});

test('co-op tasks never enter the hourly, daily or weekly pools', () => {
  for (const pool of Object.values(P.TASK_SPECS))
    for (const spec of Object.values(pool)) assert.ok(!['coopKill', 'coopBoss', 'gardenVisit', 'shareLoot'].includes(spec.event), spec.title);
});
