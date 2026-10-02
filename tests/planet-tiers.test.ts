import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { applyGameAction } from '../src/actions.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
// No experience from these defeats, so the explorer's level only changes where a test sets it.
const kill = (s: M.SaveState, type: string, boss = false) => M.grantDefeat(s, type, 0, boss, () => .99);

test('every world starts on ★1; higher stars scale health, damage, XP and luck up to ★10', () => {
  const s = M.newGame();
  assert.deepEqual(M.tierOf(s, 'home'), { open: 1, chosen: 1, kills: 0, bosses: 0, titan: 0 });
  assert.deepEqual(M.tierScale(1), { hp: 1, damage: 1, xp: 1, luck: 0 });
  const top = M.tierScale(10); assert.ok(top.hp > 4.5 && top.damage > 3.5 && top.xp > 4 && top.luck > .7);
  assert.equal(M.tierScale(99).hp, top.hp, 'capped at ★10');
});

test('conquering the highest star needs its creatures and a boss there, and enough level for the next', () => {
  const s = M.newGame(); s.level = 6;
  for (let i = 0; i < M.conquestKills(1); i++) kill(s, 'mushroom');
  assert.equal(M.tierOf(s).open, 1, 'no boss yet');
  kill(s, 'bear', true);
  assert.equal(M.tierOf(s).open, 1, 'level 6 is below ★2 on Clover Village (level 7)');
  s.level = 7; kill(s, 'mushroom');
  assert.equal(M.tierOf(s).open, 2); assert.equal(M.tierOf(s).chosen, 2, 'climbs to the new star');
  assert.equal(s.progression.totals.tierUp, 1);
  assert.equal(reload(s).tiers?.home?.open, 2);
});

test('playing an easier star never advances the conquest, and the chosen star sticks', () => {
  const s = M.newGame(); s.level = 40; s.tiers = { home: { open: 3, chosen: 3, kills: 0, bosses: 0, titan: 0 } };
  assert.equal(applyGameAction(s, { type: 'setTier', payload: { id: 'home', index: 1 } }, { now: Date.now(), random: () => .5 }), true);
  for (let i = 0; i < 200; i++) kill(s, 'wolf');
  kill(s, 'bear', true);
  assert.deepEqual(M.tierOf(s), { open: 3, chosen: 1, kills: 0, bosses: 0, titan: 0 });
  assert.equal(M.setTier(s, 'home', 4), false, 'not open yet');
  s.level = 5; assert.equal(M.setTier(s, 'home', 3), false, 'level too low for ★3');
  assert.throws(() => applyGameAction(s, { type: 'setTier', payload: { id: 'nowhere', index: 1 } }, { now: Date.now(), random: () => .5 }));
});

test('Titans remember the best star they were beaten on and drop gems from ★5', () => {
  const s = M.newGame(); s.level = 80; s.tiers = { home: { open: 6, chosen: 6, kills: 0, bosses: 0, titan: 0 } };
  const loot = kill(s, 'titan_turtle', true);
  assert.ok(loot.some(l => l.id === 'moonstone'));
  assert.equal(M.tierOf(s).titan, 6); assert.equal(M.titansAtTier(s, 5), 1);
});

test('stars count for quests: a weekly task, an achievement line and late story goals', () => {
  const s = M.newGame(); s.level = 50; s.tiers = { home: { open: 4, chosen: 4, kills: 0, bosses: 0, titan: 0 }, candy: { open: 2, chosen: 2, kills: 0, bosses: 0, titan: 0 } };
  assert.equal(M.starsEarned(s), 4);
  assert.ok(P.TASK_SPECS.weekly.tierUp);
  assert.equal(P.progressEntries(s, 'achievements').find(e => e.id === 'stars:0')!.progress, 1);
  assert.ok(M.STORY_STEPS.some(step => step.condition === 'stars'));
});

test('saves keep stars within bounds', () => {
  const s = M.newGame(); const raw = JSON.parse(JSON.stringify(s));
  raw.tiers = { home: { open: 99, chosen: 50, kills: -3, bosses: 2, titan: 40 }, nowhere: { open: 3 } };
  const r = M.parseSave(JSON.stringify(raw))!;
  assert.deepEqual(r.tiers, { home: { open: 10, chosen: 10, kills: 0, bosses: 2, titan: 10 } });
});

test('star wording is translated', () => {
  for (const language of ['vi', 'ja'] as const) {
    setLanguage(language);
    for (const w of ['PLANET STARS', 'Conquer planet stars', 'Star conqueror', 'All stars conquered']) assert.notEqual(t(w), w, `${language}: ${w}`);
    assert.ok(t('Conquer ★{tier}: {kills}/{need} creatures · boss {bosses}/1', { tier: 2, kills: 10, need: 50, bosses: 0 }).includes('10'));
  }
});
