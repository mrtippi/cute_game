import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/server.mjs';
import { serverChampion, holdChampion, CHAMPION_TITLE, CHAMPION_HOLD_MS } from '../server/champion.mjs';
import { newGame } from '../src/model.ts';

const explorer = (id, level, xp = 0) => { const profile = newGame(); profile.level = level; profile.xp = xp; return { id, profile }; };

test('the server champion: highest level, more XP breaks a tie, never alone, lost when overtaken', () => {
  assert.equal(serverChampion([]), null);
  assert.equal(serverChampion([explorer('a', 70)]), null, 'a server of one has no champion');
  const mio = explorer('mio', 70, 500), sora = explorer('sora', 68, 9000), haru = explorer('haru', 70, 200);
  assert.equal(serverChampion([sora, haru, mio]), 'mio');
  haru.profile.xp = 800; assert.equal(serverChampion([sora, haru, mio]), 'haru', 'more XP at the same level');
  sora.profile.level = 71; assert.equal(serverChampion(new Map([[1, mio], [2, sora], [3, haru]]).values()), 'sora', 'overtaken');
  assert.equal(serverChampion([explorer('b', 5, 10), explorer('a', 5, 10)]), 'a', 'equals: the smaller id, so the crown never flickers');
  assert.equal(serverChampion([explorer('a', 5), { id: 'broken' }]), null, 'records without a profile do not count');
});

test('an hour as champion in all leaves the rainbow title for good', () => {
  const account = explorer('mio', 70);
  assert.equal(holdChampion(account, CHAMPION_HOLD_MS / 2), false); assert.equal(account.championMs, CHAMPION_HOLD_MS / 2);
  assert.equal(holdChampion(account, -5000), false, 'time never runs back'); assert.equal(account.championMs, CHAMPION_HOLD_MS / 2);
  assert.equal(holdChampion(account, CHAMPION_HOLD_MS / 2), true);
  assert.ok(account.profile.progression.titles.includes(CHAMPION_TITLE)); assert.equal(account.profile.progression.title, CHAMPION_TITLE, 'worn when nothing was');
  assert.equal(holdChampion(account, 60000), false, 'given once');
  assert.equal(account.profile.progression.titles.filter(x => x === CHAMPION_TITLE).length, 1);
  const dressed = explorer('sora', 70); dressed.profile.progression.titles.push('Boss Hunter'); dressed.profile.progression.title = 'Boss Hunter';
  holdChampion(dressed, CHAMPION_HOLD_MS); assert.equal(dressed.profile.progression.title, 'Boss Hunter', 'a worn title stays worn');
});

function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace('http:', 'ws:') + '/socket', { headers: { Cookie: cookie } }), queue = [], waiters = [];
    socket.on('message', raw => { const item = JSON.parse(raw), waiter = waiters.find(w => w.predicate(item)); if (waiter) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(item); } else queue.push(item); });
    socket.once('error', reject);
    socket.once('open', () => resolve({ socket, next(predicate) { const i = queue.findIndex(predicate); if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]); return new Promise(done => waiters.push({ predicate, resolve: done })); } }));
  });
}

test('online: every explorer hears who the champion is, and presence carries the worn title and the crown', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'zoo-garden-champion-test-'));
  const game = await createGameServer({ port: 0, dataDir, databaseUrl: '', databaseRequired: false, requireLogin: false, championEvery: 40 });
  const sockets = []; t.after(async () => { for (const s of sockets) s.socket.terminate(); await game.close(); });
  const register = async (username, name) => { const response = await fetch(game.url + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'password-' + username, name }) }); return { data: await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] }; };
  const alice = await register('alice', 'Alice'), bob = await register('bob', 'Bob');
  const champion = [alice, bob].map(x => x.data.account.id).sort()[0];   // both level 1 with no XP: the smaller id
  assert.equal(alice.data.account.title, '', 'public account data carries the worn title');
  const a = await connect(game.url, alice.cookie); sockets.push(a);
  assert.equal((await a.next(m => m.type === 'champion' && m.id)).id, champion);
  const b = await connect(game.url, bob.cookie); sockets.push(b);
  assert.equal((await b.next(m => m.type === 'champion')).id, champion, 'told on arrival');
  const joined = await b.next(m => m.type === 'joined');
  for (const player of joined.players) { assert.equal(player.champion, player.id === champion); assert.equal(player.title, ''); }
});
