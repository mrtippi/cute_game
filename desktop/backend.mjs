// The control app's engine (runs in Electron's main process): accounts, runs, the schedule, the watchdog and the
// hardware check. It drives the bot's own scripts (bot/director.mjs per account, bot/play.mjs for the benchmark)
// as child processes, exactly as they run from a terminal. Installed (Setup.exe), everything comes from the app's
// resources: the game and bot (ZG_ROOT), Node (Electron's own, ELECTRON_RUN_AS_NODE), the bundled Chromium and ffmpeg;
// main.cjs sets those variables. On this development PC the defaults point at the repo and D:/autogame/tools.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, statfsSync, createWriteStream, renameSync } from 'node:fs';
import { connect } from 'node:net';
import { cpus, totalmem, freemem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = process.env.ZG_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const BOT = join(REPO, 'bot');
export const DATA = process.env.ZG_DATA ?? 'D:/autogame/bot-data';
process.env.ZG_ACCOUNTS ??= `${DATA}/accounts`;
// Node for the bots and the game server: Electron's own when installed (ZG_NODE + ELECTRON_RUN_AS_NODE), else the
// portable Node 24 of this PC.
const NODE = process.env.ZG_NODE ?? (existsSync('D:/autogame/tools/node24/node.exe') ? 'D:/autogame/tools/node24/node.exe' : 'node');
const CHILD_ENV = { ...process.env, ...(process.env.ZG_NODE ? { ELECTRON_RUN_AS_NODE: '1' } : {}) };
const GAME_URL = 'http://127.0.0.1:8787/';
const { listAccounts, loadAccount, createAccount, updateAccount, setOnline, COLORS, ACCOUNTS } = await import(pathToFileURL(join(BOT, 'accounts.mjs')).href);
const { CLIPS, SCENARIOS } = await import(pathToFileURL(join(BOT, 'clips.mjs')).href);
const { nvencWorks } = await import(pathToFileURL(join(BOT, 'lib/recorder.mjs')).href);
const { GROUPS, groupOf, syncGroups, startUnits, oversized } = await import(pathToFileURL(join(BOT, 'groups.mjs')).href);

const CONTROL = `${DATA}/control.json`, HARDWARE = `${DATA}/hardware.json`;
const readJson = (file, fallback) => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback; } catch { return fallback; } };
const dayOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayOf(new Date());
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Settings and schedule: { settings: { autostart, maxParallel, clips, minutes }, schedule: { id: { enabled, days, start, clips, mix, group } },
 * lastRun: { id: date } (days over), active: { id: { date, members, clips, minutes } } (days playing), queue: [{ ids, date }] (waiting for room) }.
 * active and queue survive a restart of the app (resume).
 */
export function control() {
  const c = readJson(CONTROL, {});
  return { settings: { autostart: true, maxParallel: 0, clips: 10, minutes: 60, sound: false, ...c.settings }, schedule: c.schedule ?? {}, lastRun: c.lastRun ?? {}, active: c.active ?? {}, queue: c.queue ?? [] };
}
function saveControl(c) { mkdirSync(DATA, { recursive: true }); writeFileSync(CONTROL, JSON.stringify(c, null, 1)); }
export function setSettings(patch) {
  const c = control(); Object.assign(c.settings, patch);
  if ('maxParallel' in patch) c.settings.maxParallel = Math.max(0, Math.floor(Number(patch.maxParallel)) || 0);
  saveControl(c); return c.settings;
}
/** One account's schedule; members of a group then follow their leader (groups.mjs syncGroups). */
export function setSchedule(id, entry) { return saveSchedule({ [id]: entry }).schedule[id]; }
/**
 * Several rows at once (the schedule page's Save): a group (Nhóm A–D) only for accounts playing online; afterwards
 * every member takes the start, days, clip count and scenarios of its group's leader. Returns { schedule, followed }.
 */
export function saveSchedule(rows) {
  const c = control();
  for (const [id, entry] of Object.entries(rows)) {
    const next = { enabled: true, days: [1, 2, 3, 4, 5, 6, 0], start: '08:00', clips: c.settings.clips, ...c.schedule[id], ...entry };
    if (!GROUPS.includes(next.group)) delete next.group;
    else if (!playsOnlineNow(id)) throw new Error(`${id}: chỉ acc đã bật Chơi online mới vào nhóm được.`);
    c.schedule[id] = next;
  }
  const synced = syncGroups(c.schedule); c.schedule = synced.schedule; saveControl(c);
  return { schedule: c.schedule, followed: synced.followed };
}
const playsOnlineNow = id => { try { const a = loadAccount(id); return !!(a.online?.linkedAt && a.online.enabled); } catch { return false; } };
export const hardware = () => readJson(HARDWARE, null);
/**
 * Before any measurement: about 5.5 CPU threads per playing, recording account (measured on an i9-10900F: ~27% of 20
 * threads each), at most the NVENC sessions of the driver. The real test (benchmark) replaces it.
 */
export function estimate() { const threads = cpus().length; return Math.max(1, Math.min(Math.floor(threads * .85 / 5.5), 5)); }
/** How many accounts may play at once: the setting, else the measured capacity, else the estimate. */
export const capacity = () => control().settings.maxParallel || hardware()?.capacity || estimate();

// ---- accounts -----------------------------------------------------------------------------------------------
/** The newest save.json of an account, for its level and progress. */
function latestSave(a) {
  let best = null;
  const walk = dir => { if (!existsSync(dir)) return; for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; const st = statSync(p); if (st.isDirectory()) walk(p); else if (n === 'save.json' && (!best || st.mtimeMs > best.t)) best = { p, t: st.mtimeMs }; } };
  walk(a.days); return best ? { save: readJson(best.p, null), at: best.t } : null;
}
export function accounts() {
  return listAccounts().map(a => {
    const latest = latestSave(a), s = latest?.save, days = existsSync(a.days) ? readdirSync(a.days).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).sort() : [];
    const videos = existsSync(a.videos) ? readdirSync(a.videos).filter(f => f.endsWith('.mp4')) : [];
    return { id: a.id, name: a.name, color: a.color, dir: a.dir, videosDir: a.videos, style: a.style ?? {}, show: !!a.show, archived: !!a.archived, created: a.created, port: a.port,
      level: s?.level ?? 1, energy: s?.energy ?? 0, villageRank: s?.progression?.villageRank ?? 1, title: s?.progression?.title ?? '', story: s?.progression?.story?.index ?? 0,
      days: days.length, lastDay: days.at(-1) ?? null, lastPlayed: latest?.at ?? null, videos: videos.length, running: runs.has(a.id), schedule: control().schedule[a.id] ?? null,
      // Online play on this PC's server (never the password).
      online: a.online?.linkedAt ? { enabled: !!a.online.enabled, username: a.online.username, linkedAt: a.online.linkedAt } : null, linking: linking.get(a.id)?.running ?? false };
  });
}
export const colors = () => COLORS;
export const themes = () => Object.fromEntries(Object.entries(CLIPS).map(([id, c]) => [id, { ja: c.ja, vi: c.vi, icon: c.icon }]));
/** The scenarios a schedule can mix (clips.mjs): 'auto' plus every clip theme. */
export const scenarios = () => SCENARIOS;
/**
 * A new account. The game server requires login (no offline play), so it is linked for online play right away, in the
 * background: the page follows linkState(id). If that fails it is linked again before its first run (start).
 */
export async function newAccount({ id, name, color, style }) {
  const a = await createAccount(id, name, color, style ?? {}, { link: false }); setSchedule(a.id, { enabled: false });
  linkOnline(a.id).catch(error => say(`⚠ Liên kết online ${a.id} lỗi: ${error.message}`));
  return a.id;
}
export function editAccount(id, patch) { updateAccount(id, patch); return true; }
/** Delete = move the folder to accounts/_deleted (videos and save stay recoverable). */
export function removeAccount(id) {
  if (busy(id)) throw new Error('Acc đang chạy, hãy dừng trước.');
  const a = loadAccount(id), bin = `${ACCOUNTS}/_deleted`; mkdirSync(bin, { recursive: true });
  renameSync(a.dir, `${bin}/${id}-${Date.now()}`);
  const c = control(); delete c.schedule[id]; saveControl(c); return true;
}

// ---- the game server ----------------------------------------------------------------------------------------
let server = null, serverStarting = null;
const PORT_TAKEN = 'Cổng 8787 đang bị một chương trình khác dùng (không phải server game Zoo Garden). Hãy tắt chương trình đó hoặc khởi động lại máy, rồi thử lại.';
const portOpen = () => new Promise(resolve => {
  const socket = connect(8787, '127.0.0.1'), done = open => { socket.destroy(); resolve(open); };
  socket.setTimeout(1500); socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false));
});
/** What answers on port 8787: 'game' (a Zoo Garden server: its session call says whether it requires login), 'other' (another program), null (nothing). */
async function serverState() {
  try {
    const response = await fetch(`${GAME_URL}api/auth/session`, { signal: AbortSignal.timeout(2000) });
    const body = await response.json().catch(() => null);
    return typeof body?.requireLogin === 'boolean' ? 'game' : 'other';
  } catch { return await portOpen() ? 'other' : null; }
}
/** The game server up on 8787 (started once even when several accounts ask at the same moment). */
export function ensureServer() { return serverStarting ??= startServer().finally(() => { serverStarting = null; }); }
async function startServer() {
  const state = await serverState();
  if (state === 'game') return true;
  if (state === 'other') throw new Error(PORT_TAKEN);
  if (!existsSync(join(REPO, 'dist'))) throw new Error('Chưa build game (npm run build trong cute_game).');
  // The server keeps its own data next to the accounts (DATA_DIR), never inside the installed app. It requires login
  // (no offline play in the game), listens on this PC only, port 8787, and keeps accounts in its own files, whatever
  // this PC's environment says (no database).
  const env = { ...CHILD_ENV, PORT: '8787', HOST: '127.0.0.1', DATA_DIR: `${DATA}/server`, ZG_REQUIRE_LOGIN: '1' };
  delete env.DATABASE_URL; delete env.DATABASE_REQUIRED;
  const child = server = spawn(NODE, ['server/server.mjs'], { cwd: REPO, stdio: 'ignore', windowsHide: true, env });
  let exited = false; child.on('exit', () => { exited = true; if (server === child) server = null; });
  for (let i = 0; i < 20 && !exited; i++) { await sleep(500); if (await serverState() === 'game') return true; }
  if (!exited) { stopServer(); throw new Error('Server game không khởi động được.'); }
  // It stopped at once: usually another program took the port in the meantime.
  throw new Error(await portOpen() ? PORT_TAKEN : 'Server game không khởi động được.');
}
export function stopServer() { if (server) { kill(server.pid); server = null; } }

// ---- online play on this PC's server (bot/online.mjs) ---------------------------------------------------------
/** Link jobs by account id: { running, steps, error, result }. */
const linking = new Map();
export const linkState = id => { const job = linking.get(id); if (!job) return null; const { done, child, ...state } = job; return state; };
/**
 * Link an account (the button "Chơi online", a new account, or an unlinked one before its first run): the server must
 * be up and the account idle (its browser profile is opened to read the offline save). Runs `node online.mjs link <id>`;
 * the page follows linkState(id); job.done settles when the link has finished (job.error tells how).
 */
export async function linkOnline(id) {
  if (runs.has(id)) throw new Error('Acc đang chạy, hãy dừng trước khi chuyển sang chơi online.');
  if (linking.get(id)?.running) return false;
  if (closing) throw new Error('App đang thoát.');
  let finished; const a = loadAccount(id), job = { running: true, steps: ['Khởi động server game…'], error: null, result: null, done: new Promise(resolve => { finished = resolve; }) };
  linking.set(id, job);
  try { await ensureServer(); } catch (error) { Object.assign(job, { running: false, error: error.message }); finished(); throw error; }
  const child = job.child = spawn(NODE, [join(BOT, 'online.mjs'), 'link', id, '--url', GAME_URL], { cwd: BOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: CHILD_ENV });
  let out = '', errors = '';
  child.stdout.on('data', d => { out += d; for (const line of String(d).split('\n')) if (line.startsWith('· ')) job.steps.push(line.slice(2).trim()); });
  child.stderr.on('data', d => { errors += d; });
  child.on('exit', code => {
    job.running = false;
    if (code === 0) { try { job.result = JSON.parse(out.trim().split('\n').at(-1)); } catch {} say(`🌐 ${a.name} (${id}) đã chơi online trên server máy này`); }
    else { job.error = (errors.match(/Error: (.*)/)?.[1] ?? errors.trim().split('\n').at(-1)) || `lỗi ${code}`; say(`⚠ Liên kết online ${id} lỗi: ${job.error}`); }
    finished();
  });
  return true;
}
/** Switch a linked account to online play (from its next clip). Back to offline is refused: the server requires login. */
export function setOnlinePlay(id, enabled) {
  if (!loadAccount(id).online?.linkedAt) throw new Error('Acc chưa liên kết online.');
  if (!enabled) throw new Error('Server game yêu cầu đăng nhập: acc không thể quay về chơi offline.');
  setOnline(id, { enabled: true });
  return true;
}

// ---- runs ---------------------------------------------------------------------------------------------------
/** Running directors by account id: { child, account, date, started, restarts, members, clips, minutes }. */
const runs = new Map();
/**
 * Places taken before a director runs, by account id: { date, members, cancelled }, while the server starts and the
 * account links, and between a crash and its restart. They count against the capacity like running accounts.
 */
const pending = new Map();
const busy = id => runs.has(id) || pending.has(id);
/** The app is quitting: nothing new starts (shutdown). */
let closing = false;
const kill = pid => new Promise(resolve => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve()));
const events = [];
const say = text => { events.unshift({ at: Date.now(), text }); events.length = Math.min(events.length, 200); };
export const messages = () => events.slice(0, 50);

/** The day an account is playing, kept in control.json until it ends, so a restart of the app resumes it. */
function setActive(id, entry) { const c = control(); c.active[id] = entry; saveControl(c); }
/** An account's day is over (finished, stopped or not startable): the schedule does not start it again that date. */
function endDay(id, date) { const c = control(); delete c.active[id]; if (!(c.lastRun[id] > date)) c.lastRun[id] = date; saveControl(c); }

/** Before an account's day: the server up and the account linked (the server requires login: no offline play). */
async function prepare(id) {
  if (linking.get(id)?.running) throw new Error(`${id} đang liên kết online, chạy lại sau ít phút.`);
  await ensureServer();
  // An account not linked yet is linked first, its progress going with it.
  const before = loadAccount(id);
  if (!before.online?.linkedAt) {
    say(`🌐 ${before.name} (${id}): liên kết online trước lần chạy đầu`);
    await linkOnline(id); const job = linking.get(id); await job.done;
    if (job.error) throw new Error(`${id}: chưa liên kết online được (${job.error}), chưa chạy.`);
  } else if (!before.online.enabled) setOnline(id, { enabled: true });
}
/**
 * Start the director of an account whose place is reserved (pending): the plan of `date`, recorded, windowless unless
 * the account shows its window. `members`: the group it starts with (groups.mjs startUnits), so the director plans
 * the group's shared day. A crash restarts it on the same date (also past midnight), at most 3 times.
 */
function launch(id, { clips, minutes, restarts = 0, members, date }) {
  const a = loadAccount(id), c = control();
  mkdirSync(`${a.days}/${date}`, { recursive: true });
  const log = createWriteStream(`${a.days}/${date}/director.log`, { flags: 'a' });
  const args = [join(BOT, 'director.mjs'), 'run', '--account', id, '--date', date, '--clips', String(clips ?? c.schedule[id]?.clips ?? c.settings.clips), '--minutes', String(minutes ?? c.settings.minutes), '--record', '--headless', '--pause', '10'];
  // Muted unless "Âm thanh của bot" is on (Cài đặt or the tray menu); applies from the next clip of each account.
  args.push(c.settings.sound ? '--sound' : '--mute');
  // The scenarios picked for this account ({ theme: weight }); none = the automatic day.
  const mix = Object.fromEntries(Object.entries(c.schedule[id]?.mix ?? {}).filter(([k, w]) => CLIPS[k] && w > 0));
  if (Object.keys(mix).length) args.push('--mix', JSON.stringify(mix));
  const group = groupOf(c.schedule[id]);
  if (group && members?.length > 1) args.push('--group', group, '--members', members.join(','));
  const child = spawn(NODE, args, { cwd: BOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: CHILD_ENV });
  child.stdout.pipe(log); child.stderr.pipe(log);
  const run = { child, account: a, date, started: Date.now(), restarts, stopping: false, keep: false, members, clips, minutes };
  runs.set(id, run); pending.delete(id); setActive(id, { date, members: members ?? null, clips: clips ?? null, minutes: minutes ?? null });
  say(`▶ ${a.name} (${id}) bắt đầu${restarts ? ` (chạy lại ${restarts}/3)` : ''}`);
  child.on('exit', code => {
    runs.delete(id);
    // Stopped by hand: the day is over; stopped because the app quits (keep): it resumes at the next start.
    if (run.stopping) { if (!run.keep) endDay(id, date); say(`■ ${a.name} đã dừng`); return; }
    const plan = readJson(`${a.days}/${date}/plan.json`, null), left = plan?.clips.filter(x => x.status !== 'done').length ?? 0;
    if (closing) return;
    if (code !== 0 && left && run.restarts < 3) {
      say(`⚠ ${a.name} dừng bất thường, chạy lại (${run.restarts + 1}/3)`);
      pending.set(id, { date, members, cancelled: false });
      setTimeout(() => relaunch(id, { clips, minutes, restarts: run.restarts + 1, members, date }), 5000);
    } else { endDay(id, date); say(`■ ${a.name} xong ngày ${date}${left ? ` (${left} clip chưa xong)` : ''}`); }
  });
  return true;
}
/** After a crash or a stuck clip: the same day again (the director carries on from plan.json), its place kept. */
async function relaunch(id, options) {
  try {
    if (closing || pending.get(id)?.cancelled) return;
    await prepare(id);
    if (closing || pending.get(id)?.cancelled) return;
    launch(id, options);
  } catch (error) { endDay(id, options.date); say('⚠ ' + error.message); }
  finally { if (!runs.has(id) && !closing) pending.delete(id); }
}
/** Start one account's day now (alone). */
export async function start(id, { clips, minutes, members, date = today() } = {}) {
  if (busy(id)) return false;
  await startUnit([id], { date, clips, minutes, members });
  return runs.has(id);
}
/** Stop an account (by hand: its day is over; keep: the app quits and the day resumes at the next start). */
export async function stop(id, { keep = false } = {}) {
  const wait = pending.get(id);
  if (wait && !keep) { wait.cancelled = true; endDay(id, wait.date); }
  const run = runs.get(id); if (!run) return !!wait;
  run.stopping = true; run.keep = keep; await kill(run.child.pid); return true;
}
export async function stopAll() { for (const id of new Set([...runs.keys(), ...pending.keys()])) await stop(id); return true; }
/**
 * The app quits (tray, Windows shutting down, an update): every director, link and test stops with its browsers, but
 * the days playing or waiting stay in control.json and resume at the next start (resume). Then the game server stops.
 */
export async function shutdown() {
  closing = true;
  // Starting, not running yet: back to the front of the queue.
  const active = control().active, units = [];
  for (const [id, p] of pending) if (!active[id] && !units.some(u => u.ids.includes(id))) units.push({ ids: p.members?.length > 1 ? p.members : [id], date: p.date });
  queue.unshift(...units); saveQueue();
  await Promise.all([...[...runs.keys()].map(id => stop(id, { keep: true })),
    ...[...linking.values()].filter(job => job.running && job.child).map(job => kill(job.child.pid)),
    ...benchChildren.filter(child => child.exitCode === null).map(child => kill(child.pid))]);
  stopServer();
  return true;
}
/** Start accounts now; an account in a group brings its whole group (groups.mjs startUnits), all or none of it. */
export async function startNow(ids) {
  if (closing) return false;
  const date = today(), errors = [];
  // Already playing, starting or waiting: not twice.
  const units = startUnits(ids, control().schedule, playsOnlineNow).filter(unit => unit.some(id => !busy(id)) && !queued(unit));
  for (const [i, unit] of units.entries()) {
    if (!fits(unit)) { say(`⏸ Đủ ${capacity()} acc đang chạy, ${unit.join(', ')} chờ lượt`); queue.push({ ids: unit, date }); saveQueue(); continue; }
    try { await startUnit(unit, { date }); } catch (error) { errors.push(error); say('⚠ ' + error.message); }
    if (i < units.length - 1) await sleep(20000);
  }
  if (errors.length) throw errors[0];
  return true;
}
const queued = unit => queue.some(u => u.ids.some(id => unit.includes(id)));
/** A group starts only as a whole: room for every member not running yet (or, larger than the machine, an idle machine). */
const fits = unit => { const n = unit.filter(id => !busy(id)).length, used = runs.size + pending.size; return used + n <= capacity() || (n > capacity() && !used); };
/**
 * Start one unit: an account alone, or a group a few seconds apart (each director gets the whole member list). Its
 * places are taken at once (pending), so nothing else squeezes in while the server starts or an account links. All
 * or nothing: every member ready (server, online link) before any director starts; if one cannot start, the others
 * stop again and the day is reported as not started.
 */
async function startUnit(unit, { date = today(), clips, minutes, members: given } = {}) {
  const ids = unit.filter(id => !busy(id)), members = given ?? (unit.length > 1 ? unit : undefined);
  if (!ids.length || closing) return;
  for (const id of ids) pending.set(id, { date, members, cancelled: false });
  const started = [];
  try {
    if (unit.length > 1) say(`👥 Nhóm ${groupOf(control().schedule[unit[0]])}: ${unit.join(', ')} chơi cùng nhau${unit.length > capacity() ? ` (nhiều hơn sức máy ${capacity()} acc)` : ''}`);
    for (const id of ids) await prepare(id);
    for (const [i, id] of ids.entries()) {
      if (closing) return;
      if (pending.get(id)?.cancelled) continue;
      launch(id, { clips, minutes, members, date }); started.push(id);
      if (i < ids.length - 1) await sleep(5000);
    }
  } catch (error) {
    if (closing) return;
    for (const id of started) await stop(id);
    for (const id of ids) if (!started.includes(id)) endDay(id, date);
    throw new Error(unit.length > 1 ? `Nhóm ${unit.join(', ')} chưa chạy: ${error.message}` : error.message);
  } finally { if (!closing) for (const id of ids) if (!runs.has(id)) pending.delete(id); }
}

/** Live state of the running accounts: plan progress, the clip's last lines, the preview still. */
export function live() {
  return [...runs.entries()].map(([id, run]) => {
    // account.json gone or broken while it plays: shown from what it was at the start, flagged.
    let a = run.account, broken = false; try { a = loadAccount(id); } catch { broken = true; }
    const plan = readJson(`${a.days}/${run.date}/plan.json`, null), clip = plan?.clips.find(c => c.status === 'playing');
    let tail = [], task = null;
    if (clip) {
      const dir = `${a.days}/${run.date}/${clip.seed}`;
      try {
        if (existsSync(`${dir}/session.log`)) tail = readFileSync(`${dir}/session.log`, 'utf8').trim().split('\n').slice(-4);
        if (existsSync(`${dir}/events.jsonl`)) { const lines = readFileSync(`${dir}/events.jsonl`, 'utf8').trim().split('\n'); for (let i = lines.length - 1; i >= 0 && !task; i--) { try { const e = JSON.parse(lines[i]); if (e.tag === 'task') task = e.task; } catch {} } }
      } catch { /* a log being written: next time */ }
    }
    if (broken) tail = [...tail.slice(-1), '⚠ Thiếu account.json của acc này'];
    const preview = `${a.dir}/preview.jpg`;
    let previewUrl = null; try { if (existsSync(preview)) previewUrl = `${pathToFileURL(preview).href}?t=${statSync(preview).mtimeMs}`; } catch {}
    return { id, name: a.name, color: a.color, show: !!a.show, date: run.date, started: run.started, broken, clip: clip ? { index: clip.index, of: plan.clips.length, theme: clip.theme, title: clip.title, started: clip.started } : null,
      done: plan?.clips.filter(c => c.status === 'done').length ?? 0, total: plan?.clips.length ?? 0, task, tail, preview: previewUrl };
  });
}

// ---- watchdog: a clip whose log has been silent for 6 minutes is stuck: restart the day from that clip ----------
// The kill makes the director exit abnormally; its exit handler restarts it and counts the restart (once).
setInterval(async () => {
  for (const [id, run] of runs) {
    try {
      if (run.stopping || run.stuck) continue;
      const a = run.account, plan = readJson(`${a.days}/${run.date}/plan.json`, null), clip = plan?.clips.find(c => c.status === 'playing');
      if (!clip) continue;
      const logFile = `${a.days}/${run.date}/${clip.seed}/session.log`, since = existsSync(logFile) ? Date.now() - statSync(logFile).mtimeMs : Date.now() - run.started;
      if (since > 6 * 60000) { say(`⚠ ${a.name}: clip ${clip.index} đứng im ${Math.round(since / 60000)} phút, khởi động lại`); run.stuck = true; await kill(run.child.pid); }
    } catch (error) { say(`⚠ Theo dõi ${id}: ${error.message}`); }
  }
}, 60000);

// ---- schedule: each minute, start what is due today (catching up after a late start), within the capacity ------
/** Units waiting for room: [{ ids: [id] or [member, member…], date, clips?, minutes? }], kept in control.json. */
const queue = [];
function saveQueue() { const c = control(); c.queue = queue; saveControl(c); }
let lastLaunch = 0;
setInterval(() => {
  if (closing) return;
  try {
    const c = control(), now = new Date(), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, date = today(), due = [];
    for (const [id, entry] of Object.entries(c.schedule)) {
      if (!entry.enabled || !entry.days?.includes(now.getDay()) || hm < entry.start || c.lastRun[id] === date || c.active[id] || busy(id) || queued([id])) continue;
      try { if (loadAccount(id).archived) continue; } catch { continue; }
      due.push(id);
    }
    // A group is due as a whole (its members share the start time) and waits for room as one.
    for (const unit of startUnits(due, c.schedule, playsOnlineNow)) { queue.push({ ids: unit, date }); say(`⏰ Đến giờ ${unit.join(', ')} (${c.schedule[unit[0]].start})`); }
    if (due.length) saveQueue();
    // One start every 30 s at most, so the windows do not all load together.
    if (queue.length && fits(queue[0].ids) && Date.now() - lastLaunch > 30000) {
      const { ids, date: day, clips, minutes } = queue.shift(); saveQueue(); lastLaunch = Date.now();
      startUnit(ids, { date: day, clips, minutes }).catch(e => say('⚠ ' + e.message));
    }
  } catch (error) { say('⚠ Lịch chạy: ' + error.message); }
}, 15000);
export const waiting = () => queue.flatMap(u => u.ids);
/**
 * At the app's start (after the first-run setup): the days that were playing or waiting when it closed (or Windows
 * shut down) wait for room again, the playing ones first; each director carries on from its plan.json. Days older
 * than yesterday are given up.
 */
export function resume() {
  const c = control(), oldest = dayOf(new Date(Date.now() - 864e5)), back = [];
  for (const [id, e] of Object.entries(c.active)) {
    if (busy(id) || queued([id]) || back.some(u => u.ids.includes(id))) continue;
    if (!e?.date || e.date < oldest || !existsSync(`${ACCOUNTS}/${id}/account.json`)) { endDay(id, e?.date ?? today()); continue; }
    back.push({ ids: e.members?.length > 1 ? e.members : [id], date: e.date, clips: e.clips ?? undefined, minutes: e.minutes ?? undefined });
  }
  for (const u of c.queue) if (Array.isArray(u?.ids) && u.ids.length && !queued(u.ids) && !back.some(b => b.ids.some(id => u.ids.includes(id)))) back.push(u);
  queue.unshift(...back); saveQueue();
  for (const u of back) say(`↻ ${u.ids.join(', ')}: tiếp tục ngày ${u.date} sau khi app khởi động lại`);
  return back.length;
}
/** Nothing going on: no account playing, starting or waiting, no hardware test, no link (an update installs then). */
export const idle = () => !runs.size && !pending.size && !queue.length && !bench?.running && ![...linking.values()].some(job => job.running);

/** The day's waves for a schedule: which accounts run together, given the capacity (for the schedule page). */
export function waves(day = new Date().getDay()) {
  const c = control(), due = Object.entries(c.schedule).filter(([, e]) => e.enabled && e.days?.includes(day)).sort((a, b) => a[1].start.localeCompare(b[1].start));
  const cap = capacity(), out = [];
  // Each clip takes its length plus ~3 minutes (opening the game, the unrecorded finish, the pause).
  for (const [id, e] of due) { const hours = (e.clips ?? c.settings.clips) * (c.settings.minutes + 3) / 60; out.push({ id, start: e.start, hours: +hours.toFixed(1) }); }
  const overlap = Math.max(0, ...out.map(w => out.filter(x => x.start <= w.start && toMin(x.start) + x.hours * 60 > toMin(w.start)).length));
  // Groups start whole: one bigger than the machine runs only while nothing else does.
  return { capacity: cap, entries: out, overlap, overloaded: overlap > cap, groups: oversized(c.schedule, cap) };
}
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

// ---- machine load and the hardware check --------------------------------------------------------------------
let lastCpu = cpus();
export function cpuNow() {
  const now = cpus(); let idle = 0, total = 0;
  now.forEach((c, i) => { const p = lastCpu[i]?.times ?? c.times; for (const k of Object.keys(c.times)) total += c.times[k] - p[k]; idle += c.times.idle - p.idle; });
  lastCpu = now; return total ? Math.round(100 * (1 - idle / total)) : 0;
}
const run = (cmd, args) => new Promise(resolve => execFile(cmd, args, { windowsHide: true, timeout: 20000 }, (e, out) => resolve(e ? '' : String(out))));
export async function gpuNow() {
  const out = await run('nvidia-smi', ['--query-gpu=utilization.gpu,utilization.encoder,memory.used,memory.total,encoder.stats.sessionCount', '--format=csv,noheader,nounits']);
  const [gpu, enc, used, total, sessions] = out.split(',').map(v => Number(v.trim()));
  return out ? { gpu, enc, memUsed: used, memTotal: total, sessions } : null;
}
/** Free space where the data goes (the nearest existing folder above it before the first run creates it). */
export function diskFree() { let dir = DATA; while (dir && !existsSync(dir)) { const up = dirname(dir); if (up === dir) break; dir = up; } try { const s = statfsSync(dir); return Math.round(s.bavail * s.bsize / 1e9); } catch { return null; } }
export async function load() { return { cpu: cpuNow(), ram: Math.round((1 - freemem() / totalmem()) * 100), gpu: await gpuNow(), disk: diskFree(), running: runs.size, capacity: capacity(), waiting: waiting() }; }

/**
 * Whether the bot's browser really starts, the way the bot opens it (bot/lib/session.mjs: the bundled Chromium when
 * installed, else Google Chrome; Chrome's new headless mode): null when it does, else Playwright's reason.
 */
function browserProbe() {
  const code = `const { BROWSER, HEADLESS_ARGS } = await import(${JSON.stringify(pathToFileURL(join(BOT, 'lib/session.mjs')).href)}); const { chromium } = await import('playwright');
    const browser = await chromium.launch({ ...BROWSER, headless: false, args: [...HEADLESS_ARGS, '--no-first-run'] }); await browser.close();`;
  return new Promise(resolve => execFile(NODE, ['--input-type=module', '-e', code], { cwd: BOT, env: CHILD_ENV, windowsHide: true, timeout: 60000 },
    (error, _out, err) => resolve(error ? (String(err).match(/Error: (.*)/)?.[1] ?? error.message).trim().slice(0, 300) : null)));
}
/** The quick check: what this PC has (a few seconds). */
export async function quickCheck() {
  const [ps, smiOut, browserError] = await Promise.all([
    run('powershell', ['-NoProfile', '-Command', '$c=Get-CimInstance Win32_Processor|Select -First 1;$v=Get-CimInstance Win32_VideoController|Select -First 1;"$($c.Name)|$($c.NumberOfCores)|$($c.NumberOfLogicalProcessors)|$($v.Name)|$($v.DriverVersion)"']),
    run('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader']), browserProbe()]);
  const [cpu, cores, threads, gpuName] = ps.trim().split('|');
  const smi = smiOut.trim().split(',').map(s => s.trim());
  // The browser: the bundled Chromium when installed, else Google Chrome on this PC; started once to be sure.
  const bundled = process.env.ZG_BROWSER === 'bundled', chrome = !browserError;
  const ffmpeg6 = existsSync(process.env.FFMPEG ?? 'D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe');
  const driver = Number((smi[1] ?? '0').split('.')[0]);
  // NVENC sessions on GeForce cards: 3 before driver 530, 5 up to 550, 8 after.
  const nvencSessions = driver >= 551 ? 8 : driver >= 530 ? 5 : driver ? 3 : 0;
  const ramGB = Math.round(totalmem() / 1e9), disk = diskFree();
  const info = { cpu, cores: Number(cores), threads: Number(threads), ramGB, gpu: smi[0] || gpuName, driver: smi[1] ?? null, nvenc: nvencWorks(), nvencSessions, chrome, browser: bundled ? 'bundled' : 'chrome', browserError, ffmpeg6, diskFreeGB: disk };
  const warnings = [];
  if (!chrome) warnings.push(bundled ? `Trình duyệt kèm theo không mở được (${browserError}): hãy cài lại app.` : `Không mở được Google Chrome (${browserError}): hãy cài Google Chrome.`);
  if (!info.nvenc) warnings.push('NVENC không dùng được: video sẽ nén bằng CPU (nặng hơn).');
  if (!ffmpeg6 && driver && driver < 570) warnings.push('Driver NVIDIA dưới 570: cần ffmpeg 6.1 (có sẵn trong bản cài).');
  if (disk !== null && disk < 100) warnings.push(`Ổ dữ liệu chỉ còn ${disk} GB.`);
  return { info, warnings };
}

/**
 * The real test: 1, 2, 3… windowless bots recording at once (throwaway accounts, about 2 minutes per step), measuring
 * CPU, graphics, RAM and the frames each recording got. Stops at the first step over the limits. Saves hardware.json.
 */
let bench = null, benchChildren = [];
export const benchmarkState = () => bench;
/**
 * A throwaway account for the test (its own accounts folder): the server requires login, so the test plays online too.
 * Created and linked once (fleet.mjs new); play.mjs links it again itself if that did not finish.
 */
async function benchAccount(root, i) {
  const id = `bench-${i}`;
  if (existsSync(`${root}/accounts/${id}/account.json`)) return id;
  await new Promise(resolve => spawn(NODE, [join(BOT, 'fleet.mjs'), 'new', id, `テスト${i + 1}`, Object.keys(COLORS)[i % 6], '--url', GAME_URL], { cwd: BOT, stdio: 'ignore', windowsHide: true, env: { ...CHILD_ENV, ZG_ACCOUNTS: `${root}/accounts` } }).on('exit', resolve));
  if (!existsSync(`${root}/accounts/${id}/account.json`)) throw new Error(`Không tạo được acc thử ${id}.`);
  return id;
}
export async function benchmark({ maxSteps = 5, seconds = 120 } = {}) {
  if (bench?.running) return false;
  if (runs.size || pending.size) throw new Error('Hãy dừng các acc đang chạy trước khi đo.');
  if (closing) return false;
  await ensureServer();
  const root = `${DATA}/benchmark`, steps = [], check = await quickCheck();
  bench = { running: true, step: 0, steps, note: 'Chuẩn bị…' };
  try {
    for (let k = 1; k <= maxSteps; k++) {
      bench.step = k; bench.note = `Đang chạy thử ${k} acc cùng lúc…`;
      const children = benchChildren = [], env = { ...CHILD_ENV, ZG_ACCOUNTS: `${root}/accounts` };
      for (let i = 0; i < k; i++) {
        const dir = `${root}/run${k}-${i}`, id = await benchAccount(root, i); mkdirSync(dir, { recursive: true });
        children.push(spawn(NODE, [join(BOT, 'play.mjs'), '--minutes', String(seconds / 60), '--seed', `bench-${k}-${i}`, '--account', id, '--out', dir, '--record', `${dir}/bench.mp4`, '--headless', '--mute', '--clip', 'hunt', '--port', String(9400 + i)], { cwd: BOT, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env }));
      }
      const outputs = children.map(c => { let s = ''; c.stdout.on('data', d => { s += d; }); return () => s; });
      await new Promise(r => setTimeout(r, 45000)); cpuNow();
      const samples = [];
      for (let t = 0; t < (seconds - 50) / 5; t++) { await new Promise(r => setTimeout(r, 5000)); samples.push({ cpu: cpuNow(), ram: Math.round((1 - freemem() / totalmem()) * 100), gpu: await gpuNow() }); }
      await Promise.all(children.map(c => new Promise(r => c.exitCode !== null ? r() : c.on('exit', r))));
      const fps = outputs.map(o => { const m = /recording saved: (\d+)s, \d+ frames written, (\d+) drawn/.exec(o()); return m ? Number(m[2]) / Number(m[1]) : 0; });
      const avg = key => Math.round(samples.reduce((n, s) => n + (key(s) ?? 0), 0) / Math.max(1, samples.length));
      const step = { accounts: k, cpu: avg(s => s.cpu), ram: avg(s => s.ram), gpu: avg(s => s.gpu?.gpu), encoder: avg(s => s.gpu?.enc), fps: Math.round(Math.min(...fps) * 10) / 10 };
      // RAM: what is left matters, not the share (other programs already hold most of it): keep 3 GB free.
      step.ramFreeGB = Math.round((1 - step.ram / 100) * totalmem() / 1e9 * 10) / 10;
      step.ok = step.cpu <= 85 && step.gpu <= 90 && step.ramFreeGB >= 3 && step.fps >= 26 && k <= (check.info.nvencSessions || k);
      steps.push(step);
      if (!step.ok) break;
    }
    const ok = steps.filter(s => s.ok), capacityFound = ok.length ? ok.at(-1).accounts : 1;
    const last = steps.at(-1), limit = !last.ok ? (last.cpu > 85 ? 'CPU' : last.gpu > 90 ? 'card đồ hoạ' : last.ramFreeGB < 3 ? 'RAM' : last.fps < 26 ? 'tốc độ khung hình' : 'NVENC') : `đã thử tới ${last.accounts} acc`;
    const result = { at: new Date().toISOString(), capacity: capacityFound, limit, steps, info: check.info };
    writeFileSync(HARDWARE, JSON.stringify(result, null, 1));
    bench = { running: false, step: 0, steps, note: `Xong: máy này chạy được ${capacityFound} acc (giới hạn: ${limit}).`, result };
    say(`🔧 Đo sức máy: ${capacityFound} acc song song`);
    return result;
  } catch (error) { bench = { running: false, steps, note: 'Lỗi: ' + error.message }; throw error; }
}
