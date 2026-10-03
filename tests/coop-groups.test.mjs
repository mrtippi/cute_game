import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planDay, SCENARIOS } from '../bot/clips.mjs';
import { createRng } from '../bot/lib/rng.mjs';
import { syncGroups, startUnits, oversized, groupSave, groupMembers, leaderOf } from '../bot/groups.mjs';
import { groupTargets } from '../bot/tasks/coop.mjs';

test('the together scenario opens only on a day planned for a group', () => {
  const save = { level: 30, discovered: ['home'] }, mix = { together: 2, hunt: 1 };
  assert.ok(!planDay(save, createRng('solo'), 10, {}, mix).includes('together'));
  assert.ok(!planDay(save, createRng('solo'), 10).includes('together'));
  const day = planDay(save, createRng('group'), 10, {}, mix, { group: 'A' });
  assert.ok(day.filter(id => id === 'together').length >= 6);
  // The automatic day draws it like any other theme: on most group days, on no solo day.
  const days = Array.from({ length: 20 }, (_, i) => i);
  assert.ok(days.filter(i => planDay(save, createRng('auto' + i), 10, {}, null, { group: 'A' }).includes('together')).length >= 10);
  assert.ok(days.every(i => !planDay(save, createRng('auto' + i), 10).includes('together')));
  assert.equal(SCENARIOS.find(s => s.id === 'together').need, 'khi acc ở trong một nhóm chơi online');
});

test('members of a group get the identical day from the director, planned for the weakest member', () => {
  const root = mkdtempSync(join(tmpdir(), 'zg-group-')), accounts = join(root, 'accounts'), groups = join(root, 'groups');
  const make = (id, level, online = true) => {
    mkdirSync(join(accounts, id, 'days', 'old', 'c'), { recursive: true });
    writeFileSync(join(accounts, id, 'account.json'), JSON.stringify({ id, name: id, color: '#4aa8ff', style: { hunt: 3 }, port: 9400, ...(online ? { online: { username: id, password: 'x', linkedAt: '2026-01-01', enabled: true } } : {}) }));
    writeFileSync(join(accounts, id, 'days', 'old', 'c', 'save.json'), JSON.stringify({ level, discovered: ['home', 'toy'] }));
  };
  make('ann', 60); make('ben', 20); make('cat', 60);
  const director = fileURLToPath(new URL('../bot/director.mjs', import.meta.url)), mix = JSON.stringify({ together: 2, titan: 1, hunt: 1 });
  const plan = (id, extra = []) => {
    const r = spawnSync(process.execPath, [director, 'plan', '--account', id, '--date', '2026-10-03', '--clips', '8', '--mix', mix, ...extra], { env: { ...process.env, ZG_ACCOUNTS: accounts, ZG_GROUPS: groups }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(readFileSync(join(accounts, id, 'days', '2026-10-03', 'plan.json'), 'utf8'));
  };
  const group = ['--group', 'A', '--members', 'ben,ann'];
  const ann = plan('ann', group), ben = plan('ben', group), cat = plan('cat');
  assert.deepEqual(ann.clips.map(c => c.theme), ben.clips.map(c => c.theme));
  assert.deepEqual(ann.clips.map(c => c.seed), ben.clips.map(c => c.seed));
  assert.deepEqual(ann.group, { id: 'A', members: ['ann', 'ben'], leader: 'ann' });
  assert.ok(ann.clips.some(c => c.theme === 'together'));
  // Ben (Lv20) cannot fight Titans yet, so the group's day has none; Cat plays alone: Titans, never together.
  assert.ok(!ann.clips.some(c => c.theme === 'titan'));
  assert.ok(!cat.clips.some(c => c.theme === 'together') && cat.clips.some(c => c.theme === 'titan') && !cat.group);
});

test('group members follow the leader (first id) for start, days, clips and scenarios', () => {
  const schedule = {
    zoe: { enabled: true, group: 'A', start: '10:00', days: [1], clips: 4, mix: { boss: 1 } },
    amy: { enabled: true, group: 'A', start: '08:00', days: [1, 2], clips: 6, mix: { together: 3 } },
    bob: { enabled: false, group: 'A', start: '08:00', days: [1, 2], clips: 6, mix: { together: 3 } },
    kim: { enabled: true, start: '09:00', days: [3], clips: 2 },
  };
  assert.deepEqual(groupMembers(schedule, 'A'), ['amy', 'bob', 'zoe']);
  assert.equal(leaderOf(['zoe', 'amy']), 'amy');
  const { schedule: next, followed } = syncGroups(schedule);
  assert.deepEqual(followed, [{ id: 'zoe', group: 'A', leader: 'amy' }]);
  assert.deepEqual({ start: next.zoe.start, days: next.zoe.days, clips: next.zoe.clips, mix: next.zoe.mix }, { start: '08:00', days: [1, 2], clips: 6, mix: { together: 3 } });
  assert.equal(next.zoe.enabled, true); assert.equal(schedule.zoe.start, '10:00');
  assert.deepEqual(next.kim, schedule.kim);
  assert.deepEqual(syncGroups(next).followed, []);
});

test('a group starts as one unit of its switched-on members; oversized groups are reported', () => {
  const schedule = { amy: { enabled: true, group: 'A' }, bob: { enabled: false, group: 'A' }, zoe: { enabled: true, group: 'A' }, kim: { enabled: true }, ivy: { enabled: true, group: 'B' } };
  assert.deepEqual(startUnits(['zoe', 'kim', 'amy'], schedule), [['amy', 'zoe'], ['kim']]);
  assert.deepEqual(startUnits(['bob'], schedule), [['amy', 'bob', 'zoe']]);
  assert.deepEqual(startUnits(['amy'], schedule, id => id !== 'zoe'), [['amy']]);
  assert.deepEqual(oversized(schedule, 1), [{ group: 'A', size: 2 }, { group: 'B', size: 1 }].filter(g => g.size > 1));
  assert.deepEqual(oversized(schedule, 2), []);
  assert.deepEqual(groupSave([{ level: 40, discovered: ['home', 'toy', 'ice'] }, { level: 12, discovered: ['home', 'ice'] }, null]), { level: 12, discovered: ['home', 'ice'] });
});

test('a group takes on a boss one explorer alone should not', () => {
  const s = { bosses: [{ id: 'b', name: 'Mushroom King', alive: true, titan: false, d: 40 }], enemies: [{ id: 'b', level: 20, hp: 4000, maxHp: 4000, damage: 60, cooldown: 2 }] };
  const one = { level: 20, attack: 60, defense: 20, maxHp: 700, food: 6 };
  assert.equal(groupTargets(s, [one]).length, 0);
  assert.equal(groupTargets(s, [one, { ...one }]).length, 1);
  // A much stronger friend makes the boss grow to its level: then it is too much for the weaker one.
  assert.equal(groupTargets(s, [one, { ...one, level: 70, attack: 200 }]).length, 0);
});
