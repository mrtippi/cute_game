// Online play for an account, on the game server of this PC only (never a public server).
//
//   node online.mjs link <id> [--url http://127.0.0.1:8787/] [--save-origin http://127.0.0.1:8787]
//   node online.mjs status <id>          linked or not, the server account's level
//   node online.mjs on|off <id>          play the director's clips online / offline again
//
// Linking makes a server account for the explorer (username from the folder id, a random password kept in
// account.json online) and gives it the offline save from the Chrome profile, so level and progress carry over.
// The server takes the save only on this PC, only into the caller's own brand-new account (revision 0), and checks
// it with the game's own parseSave (server/server.mjs auth/import-save). From then on progress lives on the local
// server; the offline save stays untouched in the profile as a backup. The profile keeps the session cookie.
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadAccount, setOnline } from './accounts.mjs';
import { BROWSER, QUIET_ARGS, quietProfile } from './lib/session.mjs';
import { assertLocal, pageApi, usernameFor } from './lib/online.mjs';

export const SAVE_KEY = 'cute-game-save-v1';
const STUB = '/__zg_link';

/** The newest save.json the account's clips wrote (used only when the profile holds no offline save). */
function latestClipSave(account) {
  let best = null;
  const walk = dir => { if (!existsSync(dir)) return; for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; const st = statSync(p); if (st.isDirectory()) walk(p); else if (n === 'save.json' && (!best || st.mtimeMs > best.t)) best = { p, t: st.mtimeMs }; } };
  walk(account.days); return best ? readFileSync(best.p, 'utf8') : null;
}

/**
 * Link an account: returns { username, level, source }. `url` is the local server; `saveOrigin` the address the
 * offline game was played at (its save is stored per address; the same as `url` normally). The account must not
 * be playing (its Chrome profile is opened here, windowless). progress(text) reports each step.
 */
export async function linkAccount(id, { url = 'http://127.0.0.1:8787/', saveOrigin, progress = () => {} } = {}) {
  assertLocal(url); const origin = new URL(url).origin; saveOrigin = new URL(saveOrigin ?? origin).origin; assertLocal(saveOrigin);
  let account = loadAccount(id);
  if (account.online?.linkedAt) { progress('đã liên kết từ trước'); return { username: account.online.username, already: true }; }
  progress('kiểm tra server game…');
  try { const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000) }); if (!health.ok) throw new Error(String(health.status)); }
  catch (error) { throw new Error(`the game server at ${origin} is not answering (${error.message})`); }

  progress('mở hồ sơ trình duyệt của acc…');
  quietProfile(account.profile);
  let context;
  try { context = await chromium.launchPersistentContext(account.profile, { ...BROWSER, headless: true, args: QUIET_ARGS }); }
  catch (error) { throw new Error(`the account's browser profile is in use (stop its bot first): ${error.message.split('\n')[0]}`); }
  try {
    // A blank page at the game's address: the profile's storage and cookies for that address, without starting
    // the game (which could change the save, or go online with an old session).
    await context.route(request => new URL(request).pathname === STUB, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>link</title>' }));
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(saveOrigin + STUB);
    let save = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), source = 'profile';
    if (!save) { save = latestClipSave(account); source = 'clip save.json'; }
    let level = null; try { level = save ? JSON.parse(save).level : null; } catch { save = null; }
    progress(save ? `đọc save offline: Lv.${level} (${source})` : 'không có save offline: bắt đầu online từ đầu');
    if (saveOrigin !== origin) await page.goto(origin + STUB);

    // Credentials first in account.json, so a run that stops halfway can finish with the same account.
    let { username, password } = account.online ?? {};
    if (!username || !password) {
      username = usernameFor(id); password = randomBytes(18).toString('base64url');
      account = setOnline(id, { username, password, linkedAt: null, enabled: false });
    }
    progress(`tạo tài khoản server ${username}…`);
    let session;
    for (let n = 2; ; n++) {
      const register = await pageApi(page, 'auth/register', { username, password, name: account.name, color: account.color });
      if (register.status === 200) { session = register.body; break; }
      if (register.status !== 409) throw new Error(`the server refused the account: ${register.body?.error ?? register.status}`);
      // Taken: ours from an earlier, unfinished link (the password matches), else someone else's name.
      const login = await pageApi(page, 'auth/login', { username, password });
      if (login.status === 200) { session = login.body; break; }
      if (n > 20) throw new Error('no free username for ' + id);
      username = usernameFor(id, '_' + n); account = setOnline(id, { username });
    }
    if (save && !session.revision) {
      progress('chuyển save offline lên server…');
      const imported = await pageApi(page, 'auth/import-save', { save });
      if (imported.status !== 200) throw new Error(`the server did not take the save: ${imported.body?.error ?? imported.status}`);
      session = imported.body;
    }
    const check = await pageApi(page, 'auth/session');
    if (check.body?.account?.username !== username) throw new Error('the profile did not keep the server session');
    account = setOnline(id, { linkedAt: new Date().toISOString(), enabled: true });
    progress(`xong: ${username} · Lv.${check.body.profile.level}`);
    return { username, level: check.body.profile.level, offlineLevel: level, source: save ? source : null };
  } finally { await context.close(); }
}

/** The server's view of a linked account (signs in from Node; no browser): { username, level, revision }. */
export async function onlineStatus(id, { url = 'http://127.0.0.1:8787/' } = {}) {
  assertLocal(url); const a = loadAccount(id), origin = new URL(url).origin;
  if (!a.online?.username) return { linked: false };
  const response = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a.online.username, password: a.online.password }) });
  const body = await response.json().catch(() => ({}));
  return { linked: !!a.online.linkedAt, enabled: !!a.online.enabled, username: a.online.username, party: a.online.party ?? null, server: response.ok ? { level: body.profile.level, revision: body.revision } : body.error ?? response.status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values: opt, positionals: [command, id] } = parseArgs({ allowPositionals: true, options: { url: { type: 'string', default: 'http://127.0.0.1:8787/' }, 'save-origin': { type: 'string' } } });
  if (!id || !['link', 'status', 'on', 'off'].includes(command)) { console.error('usage: node online.mjs link|status|on|off <account-id> [--url http://127.0.0.1:8787/] [--save-origin ...]'); process.exit(2); }
  if (command === 'link') console.log(JSON.stringify(await linkAccount(id, { url: opt.url, saveOrigin: opt['save-origin'], progress: text => console.log('· ' + text) })));
  else if (command === 'status') console.log(JSON.stringify(await onlineStatus(id, { url: opt.url })));
  else {
    if (!loadAccount(id).online?.linkedAt) { console.error(`${id} is not linked yet: node online.mjs link ${id}`); process.exit(1); }
    console.log(`${id}: online ${setOnline(id, { enabled: command === 'on' }).online.enabled ? 'on' : 'off'}`);
  }
}
