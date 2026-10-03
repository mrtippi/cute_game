import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChapters, clipText, readEvents, GROUPS } from '../bot/chapters.mjs';
import { createPlanner } from '../bot/planner.mjs';

const task = (at, name, planet = 'home') => ({ at, t: at, tag: 'task', task: name, planet });
/** YouTube's rules: the first at 0:00, at least three, each 10 s or longer, in order. */
function youtubeOk(chapters, duration) {
  assert.equal(chapters[0].at, 0);
  assert.ok(chapters.length >= 3, `only ${chapters.length} chapters`);
  chapters.forEach((c, i) => assert.ok((chapters[i + 1]?.at ?? duration) - c.at >= 10, `chapter ${i} under 10 s`));
}

test('every planner task has a chapter group', () => {
  const { TASKS } = createPlanner({ game: {}, rng: { int: () => 1, between: () => 1 }, log: () => {}, page: {} }, { minutesLeft: () => 60 });
  const grouped = new Set(Object.values(GROUPS).flatMap(g => g.tasks));
  // 'browse' and 'home' are the stroll on purpose (the default group).
  assert.deepEqual(Object.keys(TASKS).filter(name => !grouped.has(name) && !['browse', 'home'].includes(name)), []);
});

test('the new activities get their own Japanese chapters', () => {
  const events = [task(0, 'lava', 'lava'), task(700, 'decorate'), task(1400, 'bolt'), task(2100, 'dressFriend'), task(2800, 'disguise'), task(3300, 'reroll')];
  const titles = buildChapters(events, 3600).map(c => c.title);
  assert.deepEqual(titles, ['惑星イベントに挑戦', '村のかざりつけ', 'お手伝いロボと牧場づくり', '仲間とふれあいタイム', '変装してあそぼう', '今日のクエストをチェック']);
  // Farm dishes and a snack are farm work; Toybox presents a planet event.
  const farm = buildChapters([task(0, 'dish'), task(900, 'snack'), task(1800, 'gifts', 'toy')], 3600).map(c => c.title);
  assert.deepEqual(farm, ['畑と村のお仕事', '畑と村のお仕事（つづき）', '惑星イベントに挑戦']);
});

test('the volcano dragon and the highest level-up name their chapter', () => {
  const events = [task(0, 'dragon', 'lava'), { at: 300, tag: 'boss', text: 'defeated the volcano dragon! (4 dodges)' }, task(1200, 'garden'),
    { at: 1300, tag: 'level', level: 7 }, { at: 1500, tag: 'level', level: 8 }, task(2400, 'fishing')];
  const chapters = buildChapters(events, 3600);
  assert.match(chapters[0].title, /^ボス討伐：.+！$/);
  assert.equal(chapters[1].title, '畑と村のお仕事・Lv.8にアップ');
});

test('a short clip still has three chapters of 10 s or more', () => {
  // Three minutes, mostly one activity: the 2-minute minimum would leave a single chapter.
  youtubeOk(buildChapters([task(0, 'garden'), task(40, 'market'), task(70, 'fight')], 180), 180);
  // One activity only: the clip is cut in parts, the later ones marked as continued.
  const one = buildChapters([task(0, 'fishing')], 180);
  youtubeOk(one, 180);
  assert.ok(one.slice(1).every(c => c.title.endsWith('（つづき）')));
  // Too short for three chapters of 10 s: no crash, the first at 0:00.
  const tiny = buildChapters([task(0, 'garden'), task(5, 'fight')], 25);
  assert.equal(tiny[0].at, 0);
  // A full hour keeps the two-minute chapters.
  const hour = buildChapters([task(0, 'garden'), task(60, 'fight'), task(600, 'fishing'), task(1800, 'boss')], 3600);
  youtubeOk(hour, 3600);
  assert.ok(hour.every((c, i) => (hour[i + 1]?.at ?? 3600) - c.at >= 120));
});

test('a clip played again counts from its last recording only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zg-chapters-'));
  const lines = [{ t: 2, tag: 'record' }, { t: 3, tag: 'task', task: 'boss', planet: 'home' }, { t: 50, tag: 'failed' },
    { t: 4, tag: 'record' }, { t: 5, tag: 'info', text: 'start · Lv.12 · ϟ10 · home' }, { t: 9, tag: 'task', task: 'fishing', planet: 'home' }];
  writeFileSync(join(dir, 'events.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  const events = readEvents(dir);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(e => e.at), [0, 1, 5]);
  assert.ok(!events.some(e => e.task === 'boss'));
  const text = clipText({ dir, duration: 600 });
  assert.match(text.summary, /^Lv\.12/);
});

test('the description reads well with nothing known about the clip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zg-chapters-'));
  const bare = clipText({ dir, duration: 600 }).description;
  assert.ok(bare.startsWith('Zoo Garden を自動プレイでのんびり遊ぶシリーズです。'), bare);
  assert.ok(!/。です|の・|^・/.test(bare));
  assert.match(clipText({ dir, duration: 600, index: 2 }).description, /シリーズ。2本目です。/);
  assert.match(clipText({ dir, duration: 600, name: 'さくら', day: 3, index: 2, title: 'T' }).description, /^T\n\n.*さくらの3日目・2本目です。/);
  assert.match(clipText({ dir, duration: 600, name: 'さくら' }).description, /さくらのプレイです。/);
});
