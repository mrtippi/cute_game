import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLocal } from '../bot/lib/util.mjs';
import { assertLocal as onlineAssertLocal } from '../bot/lib/online.mjs';
import { IDLE } from '../bot/planner.mjs';
import { isCrop, foodCount } from '../bot/lib/items.mjs';
import { startRecording, nvencWorks } from '../bot/lib/recorder.mjs';

test('only a game server on this PC is accepted', () => {
  assert.equal(onlineAssertLocal, assertLocal);
  for (const url of ['http://127.0.0.1:8787/', 'http://localhost:8804/?bot', 'http://[::1]:8787/']) assert.equal(assertLocal(url), url);
  for (const url of ['https://example.com/', 'http://192.168.1.5:8787/', 'http://127.0.0.1.example.com/', 'http://localhost@evil.example/', 'not a url', '']) assert.throws(() => assertLocal(url), url);
});

test('results that achieved nothing rest the activity', () => {
  for (const idle of ['gathered (kills 0)', 'knocked out after 0', 'stuck indoors after 0', 'need food first', 'kills 0', 'kills 0, too hurt', 'no dragon to fight', 'nothing to do', 'stopped: task took too long', 'shop not reached', 'could not buy', 'cannot hire Bolt yet'])
    assert.ok(IDLE.test(idle), idle);
  for (const done of ['gathered (kills 2)', 'knocked out after 1', 'knocked out after 10', 'stuck indoors after 3', 'kills 3', 'defeated the volcano dragon', 'harvested 4, planted true'])
    assert.ok(!IDLE.test(done), done);
});

test('crops and healing food come from the game catalogue', () => {
  for (const id of ['radish', 'clover', 'glowshroom', 'iceberry', 'goldcorn', 'dragonfruit', 'rainbowrose', 'peach']) assert.ok(isCrop(id), id);
  for (const id of ['cooked_radish', 'fish_perch', 'egg', 'deco_lamp']) assert.ok(!isCrop(id), id);
  // Meals, potions, honey and farm dishes heal; raw produce and materials do not count.
  assert.equal(foodCount({ bag: { cooked_radish: 2, potion: 1, honey: 1, omelette: 1, cheese: 1, cooked_fish_perch: 1, radish: 9, fish_perch: 4, amber: 3 } }), 7);
});

/** A page stand-in for the recorder: the screencast hands over frames through `emit`. */
function fakePage() {
  const handlers = {};
  const cdp = { on: (name, fn) => { handlers[name] = fn; }, send: async () => {}, detach: async () => {} };
  return { emit: () => handlers['Page.screencastFrame']?.({ data: Buffer.from('frame').toString('base64'), sessionId: 1 }), context: () => ({ newCDPSession: async () => cdp }) };
}

test('a missing ffmpeg leaves the bot playing: no throw, stop() resolves', async () => {
  const ffmpeg = 'C:/nope/ffmpeg.exe', file = join(mkdtempSync(join(tmpdir(), 'zg-rec-')), 'clip.mp4'), lines = [];
  assert.equal(nvencWorks(ffmpeg), false);
  const page = fakePage();
  const recording = await startRecording(page, file, { ffmpeg, seconds: 5, log: line => lines.push(line) });
  page.emit();
  await new Promise(resolve => setTimeout(resolve, 300));
  page.emit();
  assert.equal(recording.broken, true);
  const stats = await recording.stop();
  assert.equal(stats.broken, true);
  assert.equal(stats.frames, 0);
  // Once stopped, always the same answer.
  assert.equal(await recording.stop(), stats);
  assert.ok(lines.some(line => /recording stopped: ffmpeg ENOENT/.test(line)), lines.join('\n'));
  assert.ok(!existsSync(file));
});
