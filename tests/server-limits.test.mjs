import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'cute-game-limits-'));
  const app = await createGameServer({ port: 0, dataDir: directory, databaseUrl: '', databaseRequired: false });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const auth = async (route, username, password = 'password-' + username) => {
    const response = await fetch(`${app.url}/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  return { app, auth };
}
function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }), queue = [], waiters = [];
    socket.on('message', raw => { const item = JSON.parse(raw), waiter = waiters.find(w => w.predicate(item)); if (waiter) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(item); } else queue.push(item); });
    socket.once('error', reject);
    socket.once('open', () => resolve({ socket, send: value => socket.send(JSON.stringify(value)), next(predicate) { const i = queue.findIndex(predicate); if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]); return new Promise(done => waiters.push({ predicate, resolve: done })); } }));
  });
}

test('bots on one computer: failed logins lock out only that username, successful ones never', async t => {
  const f = await fixture(t);
  assert.equal((await f.auth('register', 'victim')).status, 200);
  assert.equal((await f.auth('register', 'busy_bot')).status, 200);
  const codes = [];
  for (let i = 0; i < 12; i++) codes.push((await f.auth('login', 'nobody', 'wrong-password')).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(401)); assert.equal(codes.at(-1), 429, 'that username is locked out');
  assert.equal((await f.auth('login', 'victim')).status, 200, 'another account from the same address still signs in');
  for (let i = 0; i < 15; i++) assert.equal((await f.auth('login', 'busy_bot')).status, 200, 'successful sign-ins do not count');
  for (let i = 0; i < 10; i++) assert.equal((await f.auth('login', 'victim', 'wrong-password')).status, 401);
  assert.equal((await f.auth('login', 'victim')).status, 429, 'its own failures lock that username');
  assert.equal((await f.auth('login', 'busy_bot')).status, 200);
});

test('a new party replaces the owner\'s previous code', async t => {
  const f = await fixture(t), host = await f.auth('register', 'host'), guest = await f.auth('register', 'guest');
  const a = await connect(f.app.url, host.cookie), b = await connect(f.app.url, guest.cookie);
  t.after(() => { a.socket.terminate(); b.socket.terminate(); });
  await a.next(m => m.type === 'joined'); await b.next(m => m.type === 'joined');
  a.send({ type: 'party' }); const first = (await a.next(m => m.type === 'party')).code;
  a.send({ type: 'party' }); const second = (await a.next(m => m.type === 'party')).code;
  assert.notEqual(first, second);
  b.send({ type: 'join', planet: 'home', party: first });
  assert.equal((await b.next(m => m.type === 'error')).message, 'That party code was not found.');
  b.send({ type: 'join', planet: 'home', party: second });
  assert.equal((await b.next(m => m.type === 'joined' && m.party)).party, second);
});
