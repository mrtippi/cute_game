import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createGameServer } from '../server/server.mjs';
import * as Game from '../src/model.ts';
import { CHAMPION_TITLE } from '../src/titles.ts';

async function fixture(t, host = '127.0.0.1') {
  const directory = await mkdtemp(path.join(tmpdir(), 'cute-game-import-save-'));
  const app = await createGameServer({ host, port: 0, dataDir: directory, databaseUrl: '', databaseRequired: false });
  const base = `http://127.0.0.1:${app.port}`;
  t.after(async () => {
    await app.close();
    assert.ok(path.basename(directory).startsWith('cute-game-import-save-'));
    await rm(directory, { recursive: true, force: true });
  });
  async function request(cookie, route, data, headers = {}) {
    const response = await fetch(`${base}/api/${route}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, setCookie: response.headers.get('set-cookie'), body: await response.json() };
  }
  async function register(username) {
    const result = await request(null, 'auth/register', { username, password: 'Test-only-password-123', name: username });
    assert.equal(result.status, 200);
    return result.setCookie.split(';')[0];
  }
  // fetch() always sends its own Host header; a page rebound to this computer sends its own name.
  function rebound(cookie, route, data, host) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(data);
      const call = http.request({ host: '127.0.0.1', port: app.port, path: `/api/${route}`, method: 'POST', headers: { Host: host, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), cookie } }, response => {
        let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(text) }));
      });
      call.on('error', reject); call.end(payload);
    });
  }
  return { request, register, rebound };
}
const offlineSave = () => JSON.stringify({ ...Game.newGame('さくら', Game.COLORS[1]), level: 17, xp: 40 });

test('a fresh local account takes its offline save once, validated by parseSave', async t => {
  const f = await fixture(t), cookie = await f.register('sakura');
  const imported = await f.request(cookie, 'auth/import-save', { save: offlineSave() });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.profile.level, 17);
  assert.equal(imported.body.profile.name, 'さくら');
  assert.equal(imported.body.revision, 1);
  const session = await f.request(cookie, 'auth/session');
  assert.equal(session.body.profile.level, 17);
  assert.equal(session.body.revision, 1);
  // Once the account has a revision, nothing can replace it again.
  const again = await f.request(cookie, 'auth/import-save', { save: offlineSave() });
  assert.equal(again.status, 409);
  assert.equal((await f.request(cookie, 'auth/session')).body.revision, 1);
});

test('import rejects unreadable saves, signed-out callers and proxied requests', async t => {
  const f = await fixture(t), cookie = await f.register('haruto');
  assert.equal((await f.request(cookie, 'auth/import-save', { save: '{"version":1}' })).status, 400);
  assert.equal((await f.request(cookie, 'auth/import-save', { save: { level: 99 } })).status, 400);
  assert.equal((await f.request(null, 'auth/import-save', { save: offlineSave() })).status, 401);
  assert.equal((await f.request(cookie, 'auth/import-save', { save: offlineSave() }, { 'X-Forwarded-For': '203.0.113.9' })).status, 403);
  assert.equal((await f.request(cookie, 'auth/session')).body.profile.level, 1);
});

test('a server listening for other machines never imports saves', async t => {
  const f = await fixture(t, '0.0.0.0'), cookie = await f.register('mei');
  assert.equal((await f.request(cookie, 'auth/import-save', { save: offlineSave() })).status, 403);
  assert.equal((await f.request(cookie, 'auth/session')).body.profile.level, 1);
});

test('a page rebound to this computer (non-loopback Host) cannot import', async t => {
  const f = await fixture(t), cookie = await f.register('rin');
  assert.equal((await f.rebound(cookie, 'auth/import-save', { save: offlineSave() }, 'attacker.example:8787')).status, 403);
  assert.equal((await f.request(cookie, 'auth/session')).body.profile.level, 1);
  assert.equal((await f.rebound(cookie, 'auth/import-save', { save: offlineSave() }, 'localhost:8787')).status, 200, 'localhost is this computer');
});

test('an imported save keeps its progress but not the champion title or online co-op totals', async t => {
  const f = await fixture(t), cookie = await f.register('kaito');
  const save = { ...Game.newGame('かいと'), level: 40, xp: 12 };
  save.bag = { ...save.bag, carrot: 77 };
  save.progression.titles = ['Boss Hunter', CHAMPION_TITLE]; save.progression.title = CHAMPION_TITLE;
  save.progression.totals = { ...save.progression.totals, kill: 300, coopKill: 50, coopBoss: 20, gardenVisit: 99, shareLoot: 9 };
  const imported = await f.request(cookie, 'auth/import-save', { save: JSON.stringify(save) });
  assert.equal(imported.status, 200);
  const { profile } = imported.body, { progression } = profile;
  assert.equal(profile.level, 40); assert.equal(profile.bag.carrot, 77); assert.equal(progression.totals.kill, 300);
  assert.ok(!progression.titles.includes(CHAMPION_TITLE)); assert.ok(progression.titles.includes('Boss Hunter'));
  assert.equal(progression.title, ''); assert.equal(imported.body.account.title, '');
  for (const key of ['coopKill', 'coopBoss', 'gardenVisit', 'shareLoot']) assert.equal(progression.totals[key] ?? 0, 0, key);
});
