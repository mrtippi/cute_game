import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server/server.mjs';
import * as Game from '../src/model.ts';

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
  return { request, register };
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
