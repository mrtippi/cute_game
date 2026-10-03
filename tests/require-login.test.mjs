import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../server/server.mjs';

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cute-game-require-login-'));
  const app = await createGameServer({ host: '127.0.0.1', port: 0, dataDir: directory, databaseUrl: '', databaseRequired: false, ...options });
  const base = `http://127.0.0.1:${app.port}`;
  t.after(async () => {
    await app.close();
    assert.ok(path.basename(directory).startsWith('cute-game-require-login-'));
    await rm(directory, { recursive: true, force: true });
  });
  async function request(cookie, route, data) {
    const response = await fetch(`${base}/api/${route}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, setCookie: response.headers.get('set-cookie'), body: await response.json() };
  }
  return { request };
}

async function withEnv(value, run) {
  const previous = process.env.ZG_REQUIRE_LOGIN;
  if (value === undefined) delete process.env.ZG_REQUIRE_LOGIN; else process.env.ZG_REQUIRE_LOGIN = value;
  try { return await run(); } finally { if (previous === undefined) delete process.env.ZG_REQUIRE_LOGIN; else process.env.ZG_REQUIRE_LOGIN = previous; }
}

test('the server requires login by default and says so to signed-out and signed-in callers', async t => {
  const f = await withEnv(undefined, () => fixture(t));
  const signedOut = await f.request(null, 'auth/session');
  assert.equal(signedOut.status, 200);
  assert.deepEqual(signedOut.body, { account: null, requireLogin: true });
  const registered = await f.request(null, 'auth/register', { username: 'locked_in', password: 'Test-only-password-123', name: 'Fern' });
  assert.equal(registered.status, 200, 'registration keeps working while login is required');
  const cookie = registered.setCookie.split(';')[0], session = await f.request(cookie, 'auth/session');
  assert.equal(session.body.account.username, 'locked_in');
  assert.equal(session.body.requireLogin, true);
  const login = await f.request(null, 'auth/login', { username: 'locked_in', password: 'Test-only-password-123' });
  assert.equal(login.status, 200);
});

test('ZG_REQUIRE_LOGIN=0 or requireLogin:false keeps the optional sign-in', async t => {
  const fromEnv = await withEnv('0', () => fixture(t));
  assert.deepEqual((await fromEnv.request(null, 'auth/session')).body, { account: null, requireLogin: false });
  const fromOption = await withEnv(undefined, () => fixture(t, { requireLogin: false }));
  assert.equal((await fromOption.request(null, 'auth/session')).body.requireLogin, false);
  const forced = await withEnv('0', () => fixture(t, { requireLogin: true }));
  assert.equal((await forced.request(null, 'auth/session')).body.requireLogin, true, 'an explicit option wins over the environment');
});
