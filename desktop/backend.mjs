// The control app's engine (runs in Electron's main process): accounts, runs, the schedule, the watchdog and the
// hardware check. It drives the bot's own scripts (bot/director.mjs per account, bot/play.mjs for the benchmark)
// as child processes, exactly as they run from a terminal. Installed (Setup.exe), everything comes from the app's
// resources: the game and bot (ZG_ROOT), Node (Electron's own, ELECTRON_RUN_AS_NODE), the bundled Chromium and ffmpeg;
// main.cjs sets those variables. On this development PC the defaults point at the repo and D:/autogame/tools.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, statfsSync, createWriteStream, renameSync } from 'node:fs';
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
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Settings and schedule: { settings: { autostart, maxParallel, clips, minutes }, schedule: { id: { enabled, days, start, clips, mix, group } }, lastRun: { id: date } }. */
export function control() {
  const c = readJson(CONTROL, {});
  return { settings: { autostart: true, maxParallel: 0, clips: 10, minutes: 60, sound: false, ...c.settings }, schedule: c.schedule ?? {}, lastRun: c.lastRun ?? {} };
}
function saveControl(c) { mkdirSync(DATA, { recursive: true }); writeFileSync(CONTROL, JSON.stringify(c, null, 1)); }
export function setSettings(patch) { const c = control(); Object.assign(c.settings, patch); saveControl(c); return c.settings; }
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
export function newAccount({ id, name, color, style }) { const a = createAccount(id, name, color, style ?? {}); setSchedule(a.id, { enabled: false }); return a.id; }
export function editAccount(id, patch) { updateAccount(id, patch); return true; }
/** Delete = move the folder to accounts/_deleted (videos and save stay recoverable). */
export function removeAccount(id) {
  if (runs.has(id)) throw new Error('Acc đang chạy, hãy dừng trước.');
  const a = loadAccount(id), bin = `${ACCOUNTS}/_deleted`; mkdirSync(bin, { recursive: true });
  renameSync(a.dir, `${bin}/${id}-${Date.now()}`);
  const c = control(); delete c.schedule[id]; saveControl(c); return true;
}

// ---- the game server ----------------------------------------------------------------------------------------
let server = null;
async function serverUp() { try { await fetch(GAME_URL, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; } }
export async function ensureServer() {
  if (await serverUp()) return true;
  if (!existsSync(join(REPO, 'dist'))) throw new Error('Chưa build game (npm run build trong cute_game).');
  // The server keeps its own data next to the accounts (DATA_DIR), never inside the installed app.
  server = spawn(NODE, ['server/server.mjs'], { cwd: REPO, stdio: 'ignore', windowsHide: true, env: { ...CHILD_ENV, DATA_DIR: `${DATA}/server` } });
  for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); if (await serverUp()) return true; }
  throw new Error('Server game không khởi động được.');
}
export function stopServer() { if (server) { kill(server.pid); server = null; } }

// ---- online play on this PC's server (bot/online.mjs) ---------------------------------------------------------
/** Link jobs by account id: { running, steps, error, result }. */
const linking = new Map();
export const linkState = id => linking.get(id) ?? null;
/**
 * Link an account (the button "Chơi online"): the server must be up and the account idle (its browser profile is
 * opened to read the offline save). Runs `node online.mjs link <id>`; the page follows linkState(id).
 */
export async function linkOnline(id) {
  if (runs.has(id)) throw new Error('Acc đang chạy, hãy dừng trước khi chuyển sang chơi online.');
  if (linking.get(id)?.running) return false;
  const a = loadAccount(id), job = { running: true, steps: ['Khởi động server game…'], error: null, result: null };
  linking.set(id, job);
  try { await ensureServer(); } catch (error) { Object.assign(job, { running: false, error: error.message }); throw error; }
  const child = spawn(NODE, [join(BOT, 'online.mjs'), 'link', id, '--url', GAME_URL], { cwd: BOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: CHILD_ENV });
  let out = '', errors = '';
  child.stdout.on('data', d => { out += d; for (const line of String(d).split('\n')) if (line.startsWith('· ')) job.steps.push(line.slice(2).trim()); });
  child.stderr.on('data', d => { errors += d; });
  child.on('exit', code => {
    job.running = false;
    if (code === 0) { try { job.result = JSON.parse(out.trim().split('\n').at(-1)); } catch {} say(`🌐 ${a.name} (${id}) đã chơi online trên server máy này`); }
    else { job.error = (errors.match(/Error: (.*)/)?.[1] ?? errors.trim().split('\n').at(-1)) || `lỗi ${code}`; say(`⚠ Liên kết online ${id} lỗi: ${job.error}`); }
  });
  return true;
}
/** Switch a linked account between online and offline play (from its next clip). */
export function setOnlinePlay(id, enabled) {
  if (!loadAccount(id).online?.linkedAt) throw new Error('Acc chưa liên kết online.');
  setOnline(id, { enabled: !!enabled });
  // Offline it can no longer play in a group.
  if (!enabled) { const c = control(); if (c.schedule[id]?.group) { delete c.schedule[id].group; saveControl(c); say(`${id} chơi offline: đã rời nhóm`); } }
  return true;
}

// ---- runs ---------------------------------------------------------------------------------------------------
/** Running directors by account id: { child, date, started, restarts, log }. */
const runs = new Map();
const kill = pid => new Promise(resolve => execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve()));
const events = [];
const say = text => { events.unshift({ at: Date.now(), text }); events.length = Math.min(events.length, 200); };
export const messages = () => events.slice(0, 50);

/**
 * Start an account's day (its director): today's plan, recorded, windowless unless the account shows its window.
 * `members`: the group it starts with (groups.mjs startUnits), so the director plans the group's shared day.
 */
export async function start(id, { clips, minutes, restarts = 0, members } = {}) {
  if (runs.has(id)) return false;
  if (linking.get(id)?.running) throw new Error(`${id} đang liên kết online, chạy lại sau ít phút.`);
  await ensureServer();
  const a = loadAccount(id), c = control(), date = today();
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
  const run = { child, date, started: Date.now(), restarts, stopping: false, members };
  runs.set(id, run); say(`▶ ${a.name} (${id}) bắt đầu`);
  child.on('exit', code => {
    runs.delete(id);
    if (run.stopping) { say(`■ ${a.name} đã dừng`); return; }
    const plan = readJson(`${a.days}/${date}/plan.json`, null), left = plan?.clips.filter(x => x.status !== 'done').length ?? 0;
    if (code !== 0 && left && run.restarts < 3) { say(`⚠ ${a.name} dừng bất thường, chạy lại (${run.restarts + 1}/3)`); setTimeout(() => start(id, { clips, minutes, restarts: run.restarts + 1, members }).catch(e => say('⚠ ' + e.message)), 5000); }
    else say(`■ ${a.name} xong ngày ${date}${left ? ` (${left} clip chưa xong)` : ''}`);
  });
  return true;
}
export async function stop(id) { const run = runs.get(id); if (!run) return false; run.stopping = true; await kill(run.child.pid); return true; }
export async function stopAll() { for (const id of [...runs.keys()]) await stop(id); return true; }
/** Start accounts now; an account in a group brings its whole group (groups.mjs startUnits), all or none of it. */
export async function startNow(ids) {
  const units = startUnits(ids, control().schedule, playsOnlineNow);
  for (const [i, unit] of units.entries()) {
    if (!fits(unit)) { say(`⏸ Đủ ${capacity()} acc đang chạy, ${unit.join(', ')} chờ lượt`); queue.push(unit); continue; }
    await startUnit(unit);
    if (i < units.length - 1) await new Promise(r => setTimeout(r, 20000));
  }
  return true;
}
/** A group starts only as a whole: room for every member not running yet (or, larger than the machine, an idle machine). */
const fits = unit => { const n = unit.filter(id => !runs.has(id)).length; return runs.size + n <= capacity() || (n > capacity() && !runs.size); };
/** Start one unit: an account alone, or a group a few seconds apart (each director gets the whole member list). */
async function startUnit(unit) {
  const members = unit.length > 1 ? unit : undefined;
  if (members) say(`👥 Nhóm ${groupOf(control().schedule[unit[0]])}: ${unit.join(', ')} chơi cùng nhau${unit.length > capacity() ? ` (nhiều hơn sức máy ${capacity()} acc)` : ''}`);
  for (const [i, id] of unit.entries()) { if (runs.has(id)) continue; await start(id, { members }); if (i < unit.length - 1) await new Promise(r => setTimeout(r, 5000)); }
}

/** Live state of the running accounts: plan progress, the clip's last lines, the preview still. */
export function live() {
  return [...runs.entries()].map(([id, run]) => {
    const a = loadAccount(id), plan = readJson(`${a.days}/${run.date}/plan.json`, null), clip = plan?.clips.find(c => c.status === 'playing');
    let tail = [], task = null;
    if (clip) {
      const dir = `${a.days}/${run.date}/${clip.seed}`;
      if (existsSync(`${dir}/session.log`)) tail = readFileSync(`${dir}/session.log`, 'utf8').trim().split('\n').slice(-4);
      if (existsSync(`${dir}/events.jsonl`)) { const lines = readFileSync(`${dir}/events.jsonl`, 'utf8').trim().split('\n'); for (let i = lines.length - 1; i >= 0 && !task; i--) { try { const e = JSON.parse(lines[i]); if (e.tag === 'task') task = e.task; } catch {} } }
    }
    const preview = `${a.dir}/preview.jpg`;
    return { id, name: a.name, color: a.color, show: !!a.show, date: run.date, started: run.started, clip: clip ? { index: clip.index, of: plan.clips.length, theme: clip.theme, title: clip.title, started: clip.started } : null,
      done: plan?.clips.filter(c => c.status === 'done').length ?? 0, total: plan?.clips.length ?? 0, task, tail, preview: existsSync(preview) ? `${pathToFileURL(preview).href}?t=${statSync(preview).mtimeMs}` : null };
  });
}

// ---- watchdog: a clip whose log has been silent for 6 minutes is stuck: restart the day from that clip ----------
setInterval(async () => {
  for (const [id, run] of runs) {
    const a = loadAccount(id), plan = readJson(`${a.days}/${run.date}/plan.json`, null), clip = plan?.clips.find(c => c.status === 'playing');
    if (!clip) continue;
    const logFile = `${a.days}/${run.date}/${clip.seed}/session.log`, since = existsSync(logFile) ? Date.now() - statSync(logFile).mtimeMs : Date.now() - run.started;
    if (since > 6 * 60000) { say(`⚠ ${a.name}: clip ${clip.index} đứng im ${Math.round(since / 60000)} phút, khởi động lại`); run.restarts++; await kill(run.child.pid); }
  }
}, 60000);

// ---- schedule: each minute, start what is due today (catching up after a late start), within the capacity ------
/** Units waiting for room: [[id], [member, member…]]. */
const queue = [];
let lastLaunch = 0;
setInterval(() => {
  const c = control(), now = new Date(), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, date = today(), due = [];
  for (const [id, entry] of Object.entries(c.schedule)) {
    if (!entry.enabled || !entry.days?.includes(now.getDay()) || hm < entry.start || c.lastRun[id] === date || runs.has(id) || queue.some(u => u.includes(id))) continue;
    try { if (loadAccount(id).archived) continue; } catch { continue; }
    due.push(id);
  }
  // A group is due as a whole (its members share the start time) and waits for room as one.
  for (const unit of startUnits(due, c.schedule, playsOnlineNow)) { queue.push(unit); for (const id of unit) c.lastRun[id] = date; say(`⏰ Đến giờ ${unit.join(', ')} (${c.schedule[unit[0]].start})`); }
  if (due.length) saveControl(c);
  // One start every 30 s at most, so the windows do not all load together.
  if (queue.length && fits(queue[0]) && Date.now() - lastLaunch > 30000) { const unit = queue.shift(); lastLaunch = Date.now(); startUnit(unit).catch(e => say('⚠ ' + e.message)); }
}, 15000);
export const waiting = () => queue.flat();

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

/** The quick check: what this PC has (a few seconds). */
export async function quickCheck() {
  const ps = await run('powershell', ['-NoProfile', '-Command', '$c=Get-CimInstance Win32_Processor|Select -First 1;$v=Get-CimInstance Win32_VideoController|Select -First 1;"$($c.Name)|$($c.NumberOfCores)|$($c.NumberOfLogicalProcessors)|$($v.Name)|$($v.DriverVersion)"']);
  const [cpu, cores, threads, gpuName] = ps.trim().split('|');
  const smi = (await run('nvidia-smi', ['--query-gpu=name,driver_version', '--format=csv,noheader'])).trim().split(',').map(s => s.trim());
  // The browser: the bundled Chromium when installed, else Google Chrome on this PC.
  const chrome = process.env.ZG_BROWSER === 'bundled' ? existsSync(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '') : ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`].some(existsSync);
  const ffmpeg6 = existsSync(process.env.FFMPEG ?? 'D:/autogame/tools/ffmpeg6/bin/ffmpeg.exe');
  const driver = Number((smi[1] ?? '0').split('.')[0]);
  // NVENC sessions on GeForce cards: 3 before driver 530, 5 up to 550, 8 after.
  const nvencSessions = driver >= 551 ? 8 : driver >= 530 ? 5 : driver ? 3 : 0;
  const ramGB = Math.round(totalmem() / 1e9), disk = diskFree();
  const info = { cpu, cores: Number(cores), threads: Number(threads), ramGB, gpu: smi[0] || gpuName, driver: smi[1] ?? null, nvenc: nvencWorks(), nvencSessions, chrome, ffmpeg6, diskFreeGB: disk };
  const warnings = [];
  if (!chrome) warnings.push(process.env.ZG_BROWSER === 'bundled' ? 'Thiếu trình duyệt đi kèm: hãy cài lại app.' : 'Chưa cài Google Chrome.');
  if (!info.nvenc) warnings.push('NVENC không dùng được: video sẽ nén bằng CPU (nặng hơn).');
  if (!ffmpeg6 && driver && driver < 570) warnings.push('Driver NVIDIA dưới 570: cần ffmpeg 6.1 (có sẵn trong bản cài).');
  if (disk !== null && disk < 100) warnings.push(`Ổ dữ liệu chỉ còn ${disk} GB.`);
  return { info, warnings };
}

/**
 * The real test: 1, 2, 3… windowless bots recording at once (throwaway accounts, about 2 minutes per step), measuring
 * CPU, graphics, RAM and the frames each recording got. Stops at the first step over the limits. Saves hardware.json.
 */
let bench = null;
export const benchmarkState = () => bench;
export async function benchmark({ maxSteps = 5, seconds = 120 } = {}) {
  if (bench?.running) return false;
  if (runs.size) throw new Error('Hãy dừng các acc đang chạy trước khi đo.');
  await ensureServer();
  const root = `${DATA}/benchmark`, steps = [], check = await quickCheck();
  bench = { running: true, step: 0, steps, note: 'Chuẩn bị…' };
  try {
    for (let k = 1; k <= maxSteps; k++) {
      bench.step = k; bench.note = `Đang chạy thử ${k} acc cùng lúc…`;
      const children = [], env = { ...CHILD_ENV, ZG_ACCOUNTS: `${root}/accounts` };
      for (let i = 0; i < k; i++) {
        const dir = `${root}/run${k}-${i}`; mkdirSync(dir, { recursive: true });
        children.push(spawn(NODE, [join(BOT, 'play.mjs'), '--minutes', String(seconds / 60), '--seed', `bench-${k}-${i}`, '--profile', `${root}/profile-${i}`, '--out', dir, '--record', `${dir}/bench.mp4`, '--headless', '--mute', '--clip', 'hunt', '--port', String(9400 + i)], { cwd: BOT, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, env }));
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
