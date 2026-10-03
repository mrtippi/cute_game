// Online play on the game server of this PC. An account linked with online.mjs has account.json
// online: { username, password, linkedAt, enabled, party }; its Chrome profile then carries the server's session
// cookie. Signing in happens inside the page (so the cookie lands in that profile); everything a player does
// (the party, joining a friend's party, chat) goes through the 👥 dialog with real clicks and typing.
// Only a server on this machine is ever used: every call checks the page's host first.
import { setOnline, loadAccount } from '../accounts.mjs';
import { startGame } from './session.mjs';
import { sleep, assertLocal } from './util.mjs';
export { assertLocal };

/** The server username for an account folder id: lower case, [a-z0-9_], 3-24 characters. */
export function usernameFor(id, suffix = '') {
  const base = id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return (base.padEnd(3, '_').slice(0, 24 - suffix.length) + suffix);
}

/** A call to the game server from inside the page (same origin, its cookies): { status, body }, or status 0 offline. */
export async function pageApi(page, path, data) {
  assertLocal(page.url());
  return page.evaluate(async ([path, data]) => {
    try {
      const response = await fetch(new URL('/api/' + path, location.origin), { method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
      let body = null; try { body = await response.json(); } catch {}
      return { status: response.status, body };
    } catch (error) { return { status: 0, body: { error: String(error) } }; }
  }, [path, data ?? null]);
}

/**
 * Make sure this page's profile is signed in as the account (online.username). Retries while the server is
 * unreachable; a refused password stops at once. Returns { fresh } — fresh: a new sign-in, so the game, which
 * checks the session only when it loads, must be reloaded to start online.
 */
export async function ensureLoggedIn(page, account, { tries = 6, log = () => {} } = {}) {
  const { username, password } = account.online ?? {};
  if (!username || !password) throw new Error(`account ${account.id} is not linked for online play (node online.mjs link ${account.id})`);
  for (let attempt = 1; ; attempt++) {
    const session = await pageApi(page, 'auth/session');
    if (session.status === 200) {
      if (session.body?.account?.username === username) return { fresh: false, account: session.body.account };
      if (session.body?.account) await pageApi(page, 'auth/logout', {});
      const login = await pageApi(page, 'auth/login', { username, password });
      if (login.status === 200) { log(`online: signed in as ${username}`); return { fresh: true, account: login.body.account }; }
      if (login.status === 401 || login.status === 400) throw new Error(`online: the server refused ${username} (${login.body?.error ?? login.status}); link the account again`);
    }
    if (attempt >= tries) throw new Error(`online: the game server is not answering (${session.body?.error ?? session.status})`);
    log(`online: server not ready, retrying (${attempt}/${tries})`); await sleep(5000);
  }
}

/**
 * Before a linked account plays (its profile not open yet): a server that refuses its password (401) has lost its
 * account (a new data folder, a reset database). Then the link is cleared and made again once (online.mjs
 * linkAccount: a new server account with the account's save). Returns the account as it is now.
 */
let relinked = false;
export async function relinkIfLost(account, { url, log = () => {} } = {}) {
  const { username, password, linkedAt } = account.online ?? {};
  if (!linkedAt || !username || !password || relinked) return account;
  const origin = new URL(assertLocal(url)).origin;
  let status;
  try { status = (await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(5000) })).status; }
  catch { return account; }
  if (status !== 401) return account;
  relinked = true;
  log(`online: the server no longer knows ${username}; linking the account again`);
  setOnline(account.id, { linkedAt: null });
  // Loaded here only: online.mjs imports this file.
  const { linkAccount } = await import('../online.mjs');
  await linkAccount(account.id, { url, progress: text => log('online link: ' + text) });
  return loadAccount(account.id);
}

/**
 * Whether this page's game server requires login (server.mjs requireLogin, the default): its game then has no
 * offline play. False for a server elsewhere (the static edition) or one that does not answer.
 */
export async function requiresLogin(page) {
  try { assertLocal(page.url()); } catch { return false; }
  return (await pageApi(page, 'auth/session')).body?.requireLogin === true;
}

/** Sign the profile out (an account switched back to offline play): returns true when it had a session. */
export async function ensureLoggedOut(page) {
  const session = await pageApi(page, 'auth/session');
  if (!session.body?.account) return false;
  await pageApi(page, 'auth/logout', {}); return true;
}

/** The online flags the page shows (bot bridge): { signedIn, status, party }; null while the page is loading. */
export async function onlineState(page) {
  return page.evaluate(() => window.__zg?.snapshot().online ?? null).catch(() => null);
}
const connected = o => !!o?.signedIn && /^(Online|Party)/.test(o.status);
export async function waitOnline(page, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const o = await onlineState(page); if (connected(o)) return o; await sleep(400); }
  return null;
}
/** Reload the game page and wait for the bridge (after a new sign-in the game starts online). */
export async function reloadGame(page) {
  await page.reload(); await page.waitForFunction(() => !!window.__zg, null, { timeout: 30000 }); await sleep(2500);
}

/** The party code this explorer is in (null: the public world or offline). */
export async function myParty(page) { return (await onlineState(page))?.party ?? null; }

// ---- the 👥 dialog, by hand -------------------------------------------------------------------------------------
async function openDialog(bot) {
  const { page, hands, game } = bot;
  if (!await page.locator('#online-dialog[open]').count()) {
    await game.closePanel();
    const button = page.locator('#online-button');
    if (!await button.isVisible()) throw new Error('the 👥 button is not on screen right now');
    await hands.think(400); await hands.clickElement(button);
    await page.locator('#online-dialog[open]').waitFor({ timeout: 5000 });
  }
  // The first tab is the world (party buttons, the party code box, chat).
  const world = page.locator('#online-dialog .social-tabs button').first();
  if (await world.count() && await world.getAttribute('aria-pressed') !== 'true') { await hands.think(300); await hands.clickElement(world); }
}
async function closeDialog(bot) { await bot.hands.think(500); await bot.game.closePanel(); }
async function waitParty(page, check, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const party = await myParty(page); if (check(party)) return party; await sleep(300); }
  return null;
}
function remember(bot, patch) {
  bot.online ??= {}; Object.assign(bot.online, patch);
  if (bot.online.account && patch.ownParty) bot.online.account.online = setOnline(bot.online.account.id, { party: patch.ownParty }).online;
}

/** "Create private party" in the dialog: a new party of its own for solo clips. Returns the code (or null). */
export async function createParty(bot) {
  const before = await myParty(bot.page);
  await openDialog(bot);
  await bot.hands.think(500); await bot.hands.clickElement(bot.page.locator('#online-dialog .social-actions button').first());
  const code = await waitParty(bot.page, party => party && party !== before);
  await closeDialog(bot);
  if (code) { remember(bot, { ownParty: code, room: code }); bot.log?.(`online: private party ${code}`); }
  return code;
}

/** Type a party code into the dialog and join it (the party must be on this explorer's planet). True when joined. */
export async function joinParty(bot, code) {
  code = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(code)) throw new Error('party codes are letters and digits: ' + code);
  if (await myParty(bot.page) === code) return true;
  await openDialog(bot);
  const { page, hands, rng } = bot, input = page.locator('#online-dialog input[name="party-code"]');
  await hands.think(400); await hands.clickElement(input);
  await page.keyboard.press('Control+A'); await page.keyboard.type(code, { delay: rng.between(90, 170) });
  await hands.think(300); await hands.clickElement(page.locator('#online-dialog form:has(input[name="party-code"]) button[type="submit"]'));
  const joined = await waitParty(page, party => party === code);
  await closeDialog(bot);
  if (joined) { remember(bot, { room: code }); bot.log?.(`online: joined party ${code}`); }
  else bot.log?.(`online: could not join party ${code}`);
  return !!joined;
}

/** Back to this explorer's own party (a new one when the server no longer has it, e.g. after a restart). */
export async function leaveToOwnParty(bot) {
  const own = bot.online?.ownParty;
  if (own && await joinParty(bot, own)) { remember(bot, { room: own }); return own; }
  return createParty(bot);
}

/** Say something in the room chat (the dialog's chat box). True when the server confirmed it. */
export async function sendChat(bot, text) {
  text = String(text).slice(0, 160); if (!text.trim()) return false;
  await openDialog(bot);
  const { page, hands, rng } = bot, input = page.locator('#online-dialog .social-chat-input');
  await hands.think(400); await hands.clickElement(input);
  await page.keyboard.press('Control+A'); await page.keyboard.type(text, { delay: rng.between(70, 150) });
  await hands.think(300); await hands.clickElement(page.locator('#online-dialog .social-chat-send'));
  // A confirmed message empties the box.
  let sent = false;
  for (let i = 0; i < 25 && !sent; i++) { await sleep(400); sent = (await input.inputValue().catch(() => text)) === ''; }
  await closeDialog(bot);
  return sent;
}

// ---- playing with friends (tasks/coop.mjs) ----------------------------------------------------------------------
/** This explorer's server account: { id, username, name } (name: the explorer's name in the online save; null when signed out). */
export async function whoAmI(page) { const r = await pageApi(page, 'auth/session'), a = r.body?.account; return a ? { id: a.id, username: a.username, name: a.name } : null; }

/**
 * Become friends with these usernames (both sides must ask: a request from one is accepted by the other). Safe to
 * repeat: a pending request from them is accepted, otherwise a request is sent once. Returns the usernames that are
 * friends now.
 */
export async function befriend(page, usernames) {
  const list = await pageApi(page, 'friends'); if (list.status !== 200) return [];
  let { friends = [], requests = [] } = list.body;
  for (const username of usernames) {
    if (friends.some(f => f.username === username)) continue;
    const asked = requests.some(f => f.username === username);
    const r = await pageApi(page, `friends/${asked ? 'accept' : 'request'}`, { username });
    if (r.status === 200) ({ friends = [], requests = [] } = r.body);
  }
  return usernames.filter(u => friends.some(f => f.username === u));
}

/** Protected loot of this explorer lying within `range` of it (another explorer cannot pick it up yet). */
export async function ownLootNear(bot, me, range = 12) {
  const [r, s] = [await pageApi(bot.page, 'drops'), await bot.game.snap()], now = Date.now();
  return (r.body?.drops ?? []).filter(d => d.owner === me && d.releaseAt > now && d.expiresAt > now && Math.hypot(d.x - s.player.x, d.z - s.player.z) <= range);
}

/** "Share nearby loot" in the 👥 dialog: this explorer's protected drops nearby become free for the others. */
export async function shareLoot(bot) {
  if ((await bot.game.snap()).visit) return false;
  await openDialog(bot);
  // World tab actions: create party, public world, then Share nearby loot (Return to my garden while visiting).
  const share = bot.page.locator('#online-dialog .social-actions button').nth(2);
  if (!await share.count()) { await closeDialog(bot); return false; }
  await bot.hands.think(500); await bot.hands.clickElement(share);
  await sleep(1200); await closeDialog(bot);
  return true;
}

/** Visit a friend's garden from the friends tab (the friend must have accepted). True once the garden is on screen. */
export async function visitGarden(bot, username) {
  const { page, hands, game } = bot;
  // The tab lists friends in the server's order, by their names in the game (two may share a name).
  const friends = (await pageApi(page, 'friends')).body?.friends ?? [], index = friends.findIndex(f => f.username === username);
  if (index < 0) return false;
  await openDialog(bot);
  await hands.think(400); await hands.clickElement(page.locator('#online-dialog .social-tabs button').nth(1));
  // Friend rows end with "Remove friend" (a link-style button); requests have Accept / Decline instead.
  const row = page.locator('#online-dialog .social-person').filter({ has: page.locator('button.social-link') }).nth(index);
  if (!await row.count() || !(await row.textContent()).includes(friends[index].name)) { await closeDialog(bot); return false; }
  await hands.think(700); await hands.clickElement(row.locator('button:not(.social-link)').first());
  const there = await game.waitFor(s => !!s.visit && s, { timeout: 12000, every: 300 });
  if (await page.locator('#online-dialog[open]').count()) await closeDialog(bot);
  return !!there;
}

/** "Return to my garden" in the 👥 dialog while visiting. */
export async function leaveGarden(bot) {
  const { page, hands, game } = bot;
  if (!(await game.snap()).visit) return true;
  await openDialog(bot);
  await hands.think(500); await hands.clickElement(page.locator('#online-dialog .social-actions button').nth(2));
  const back = await game.waitFor(s => !s.visit && s, { timeout: 12000, every: 300 });
  if (await page.locator('#online-dialog[open]').count()) await closeDialog(bot);
  return !!back;
}

/**
 * Start of a session (lib/session.mjs has signed in): into the explorer's own private party, so no other bot walks
 * into the clip. bot.online keeps the account, its own party and the room to return to after a reconnect.
 */
export async function startOnline(bot, account) {
  bot.online = { account, ownParty: null, room: null, downSince: 0, lastTry: 0, relogins: 0 };
  if (!await waitOnline(bot.page)) throw new Error('online: the game did not connect to the server');
  const code = await createParty(bot);
  if (!code) bot.log?.('online: no private party (staying in the public world)');
  return code;
}

/**
 * Called between tasks: notices a lost connection (the server restarted: the session is gone and the game fell back
 * to the offline save; or it stays "Reconnecting"), signs in again, reloads once and goes back to the room it was in.
 * Returns a line for the log when it acted, else null.
 */
export async function keepOnline(bot) {
  const o = bot.online; if (!o) return null;
  const state = await onlineState(bot.page);
  if (connected(state)) {
    o.downSince = 0;
    if (o.room && state.party !== o.room && !o.restoring) { o.restoring = true; try { await (o.room === o.ownParty ? leaveToOwnParty(bot) : joinParty(bot, o.room)); } finally { o.restoring = false; } return `online: back in party ${(await myParty(bot.page)) ?? '(public)'}`; }
    return null;
  }
  o.downSince ||= Date.now();
  // A signed-in game reconnects by itself every few seconds; give it a little time first.
  if (state?.signedIn && Date.now() - o.downSince < 20000) return null;
  if (Date.now() - o.lastTry < 30000) return null;
  o.lastTry = Date.now();
  try { await ensureLoggedIn(bot.page, o.account, { tries: 1 }); }
  catch (error) { return `online: still disconnected (${error.message})`; }
  await reloadGame(bot.page);
  // Past the welcome card again (the HUD with the 👥 button shows only in a started game).
  await startGame({ page: bot.page, hands: bot.hands, game: bot.game, rng: bot.rng, name: o.account.name, color: o.account.color });
  if (!await waitOnline(bot.page)) return 'online: signed in again, the game has not connected yet';
  o.relogins++; o.downSince = 0;
  if (o.room) await (o.room === o.ownParty ? leaveToOwnParty(bot) : joinParty(bot, o.room));
  return `online: signed in again after the connection dropped (party ${(await myParty(bot.page)) ?? 'public'})`;
}
