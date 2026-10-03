import test from 'node:test';
import assert from 'node:assert/strict';
import { planDay, CLIPS, SCENARIOS } from '../bot/clips.mjs';
import { createRng } from '../bot/lib/rng.mjs';

const count = day => day.reduce((n, id) => ({ ...n, [id]: (n[id] ?? 0) + 1 }), {});

test('a scenario mix shares the clips out by weight, never the same theme twice in a row', () => {
  const day = planDay({ level: 50, discovered: [] }, createRng('mix'), 10, {}, { boss: 3, hunt: 2, quests: 1, titan: 2 });
  assert.equal(day.length, 10);
  const c = count(day);
  assert.equal(c.boss + c.hunt + c.quests + c.titan, 10);
  assert.ok(c.boss >= 3 && c.boss <= 4 && c.titan >= 2 && c.hunt >= 2 && c.quests >= 1);
  for (let i = 1; i < day.length; i++) assert.notEqual(day[i], day[i - 1]);
});

test('scenarios not open yet are left out; nothing open falls back to the automatic day', () => {
  const low = { level: 20, discovered: [] };
  assert.deepEqual(new Set(planDay(low, createRng('a'), 10, {}, { titan: 3, boss: 1 })), new Set(['boss']));
  const auto = planDay(low, createRng('b'), 10, {}, { titan: 3, events: 2 });
  assert.equal(auto[0], 'morning'); assert.equal(auto.at(-1), 'evening');
  assert.deepEqual(planDay(low, createRng('c'), 10), planDay(low, createRng('c'), 10, {}, {}));
});

test('every scenario has a Vietnamese name and an icon for the control app', () => {
  assert.equal(SCENARIOS[0].id, 'auto');
  assert.equal(SCENARIOS.length, Object.keys(CLIPS).length + 1);
  for (const s of SCENARIOS) assert.ok(s.vi && s.icon, s.id);
});
