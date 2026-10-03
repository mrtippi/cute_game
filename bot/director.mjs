// The director: one day of ten one-hour clips (clips.mjs), planned from the latest save and played one after another.
//
//   node director.mjs plan [--date 2026-10-03]            plan the day and print it (writes plan.json)
//   node director.mjs run  [--date ...] [--from 1] [--clips 10] [--minutes 60] [--group A --members id1,id2]
//
// Each clip runs play.mjs in its own browser session (seed <date>-c01 …) with the clip's theme and YouTube title, so
// every clip has its own folder with session.log, events.jsonl (chapters) and save.json. The day folder keeps
// plan.json up to date (status, level before and after each clip); days.json numbers the days of the series.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRng } from './lib/rng.mjs';
import { CLIPS, planDay, clipTitle } from './clips.mjs';
import { loadAccount, playsOnline } from './accounts.mjs';
import { groupDir, groupSave, leaderOf, readJson } from './groups.mjs';
import { clipText } from './chapters.mjs';
import { ensureOnline } from './online.mjs';
import { assertLocal } from './lib/util.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  date: { type: 'string' }, from: { type: 'string', default: '1' }, clips: { type: 'string', default: '10' }, minutes: { type: 'string', default: '60' },
  profile: { type: 'string', default: 'D:/autogame/bot-data/profile' }, root: { type: 'string', default: 'D:/autogame/bot-data/director' },
  pause: { type: 'string', default: '20' },
  // An account (accounts.mjs): its profile, its days folder, its videos (recorded per clip), its window spot.
  account: { type: 'string' }, record: { type: 'boolean', default: false }, pos: { type: 'string', default: '0,0' }, mute: { type: 'boolean', default: false }, sound: { type: 'boolean', default: false }, headless: { type: 'boolean', default: false },
  // The scenarios picked in the control app, as JSON { theme: weight } (clips.mjs); none = the automatic day.
  mix: { type: 'string' },
  // The game's address (this PC's server); an account linked for online play signs in there (play.mjs --online).
  url: { type: 'string', default: 'http://127.0.0.1:8787/' },
  // A group (the control app's Nhóm): its letter and every member's account id. The members plan one shared day.
  group: { type: 'string' }, members: { type: 'string' },
} });
// Only ever this PC's own game server.
assertLocal(opt.url);
const account = opt.account ? loadAccount(opt.account) : null;
if (account) { opt.profile = account.profile; opt.root = account.days; }
const command = positionals[0] ?? 'plan', date = opt.date ?? new Date().toISOString().slice(0, 10);
const dayDir = `${opt.root}/${date}`; mkdirSync(dayDir, { recursive: true });
const PLAY = fileURLToPath(new URL('./play.mjs', import.meta.url));

/** The newest save.json written by any session (director clips or hand-run sessions); level 1 when none. */
function latestSave(root = opt.root) {
  const found = [];
  const walk = dir => { if (!existsSync(dir)) return; for (const name of readdirSync(dir)) { const p = `${dir}/${name}`; if (statSync(p).isDirectory()) walk(p); else if (name === 'save.json') found.push({ p, t: statSync(p).mtimeMs }); } };
  walk(root); if (!account) walk('D:/autogame/bot-data/sessions');
  found.sort((a, b) => b.t - a.t);
  try { return found.length ? JSON.parse(readFileSync(found[0].p, 'utf8')) : { level: 1 }; } catch { return { level: 1 }; }
}

/** Day number of the series: the position of this date among the days played (days.json). */
function seriesDay() {
  const file = `${opt.root}/days.json`, days = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (!days.includes(date)) { days.push(date); days.sort(); writeFileSync(file, JSON.stringify(days, null, 1)); }
  return days.indexOf(date) + 1;
}

/**
 * A group's day: every member gets the same themes in the same order (one seed for the group, planned from the
 * weakest member's save), so clip N is `together` for all of them. The first member to plan writes the group's plan
 * file and the others take it from there.
 */
function groupThemes(group, mix) {
  const file = `${groupDir(group.id)}/${date}-plan.json`, count = Number(opt.clips), shared = readJson(file);
  if (shared && shared.members.join() === group.members.join() && shared.clips.length === count && JSON.stringify(shared.mix) === JSON.stringify(mix)) return shared.clips;
  const save = groupSave(group.members.map(id => { try { return latestSave(loadAccount(id).days); } catch { return null; } }));
  const themes = planDay(save, createRng(`director:group:${group.id}:${group.members.join(',')}:${date}`), count, {}, mix, { group: group.id });
  mkdirSync(groupDir(group.id), { recursive: true });
  try { writeFileSync(file, JSON.stringify({ members: group.members, mix, clips: themes, at: new Date().toISOString() }, null, 1), { flag: shared ? 'w' : 'wx' }); }
  catch { const other = readJson(file); if (other?.members.join() === group.members.join() && other.clips.length === count) return other.clips; }
  return themes;
}
/** The group this account plays with today: { id, members, leader }, or null (alone, or not playing online). */
function playGroup() {
  const members = [...new Set((opt.members ?? '').split(',').map(id => id.trim()).filter(Boolean))].sort();
  if (!opt.group || !account || members.length < 2 || !members.includes(account.id)) return null;
  if (!playsOnline(account)) { console.log(`group ${opt.group}: ${account.id} does not play online, playing alone`); return null; }
  return { id: opt.group, members, leader: leaderOf(members) };
}

function loadPlan() {
  const file = `${dayDir}/plan.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const save = latestSave(), day = seriesDay(), rng = createRng(`director:${account?.id ?? ''}:${date}`), group = playGroup();
  const mix = opt.mix ? JSON.parse(opt.mix) : null, themes = group ? groupThemes(group, mix) : planDay(save, rng, Number(opt.clips), account?.style, mix);
  const plan = { date, day, startLevel: save.level ?? 1, mix, ...(group ? { group } : {}), clips: themes.map((theme, i) => ({ index: i + 1, theme, seed: `${date}-c${String(i + 1).padStart(2, '0')}`, status: 'planned' })) };
  writeFileSync(file, JSON.stringify(plan, null, 1));
  return plan;
}
const savePlan = plan => writeFileSync(`${dayDir}/plan.json`, JSON.stringify(plan, null, 1));

function show(plan) {
  console.log(`Day ${plan.day} · ${plan.date} · from Lv.${plan.startLevel}${plan.group ? ` · group ${plan.group.id} (${plan.group.members.join(', ')})` : ''}`);
  for (const c of plan.clips) console.log(`  #${String(c.index).padStart(2)} ${CLIPS[c.theme].icon} ${c.theme.padEnd(8)} ${c.status.padEnd(8)} ${c.title ?? ''}${c.levelAfter ? ` → Lv.${c.levelAfter}` : ''}`);
}

/** One clip: play.mjs with the clip's theme and title, the clip folder under the day folder. */
function playClip(clip, title) {
  return new Promise(resolve => {
    const args = [PLAY, '--minutes', opt.minutes, '--seed', clip.seed, '--clip', clip.theme, '--title', title, '--profile', opt.profile, '--out', dayDir, '--pos', opt.pos, '--url', opt.url];
    if (account) args.push('--account', account.id);
    // Read again for every clip: the control app can switch online play on or off between clips.
    if (account && playsOnline(loadAccount(account.id))) args.push('--online');
    // A group's clips: who plays together (tasks/coop.mjs meets them in a `together` clip).
    if (plan.group) args.push('--group', plan.group.id, '--members', plan.group.members.join(','));
    if (opt.mute) args.push('--mute'); if (opt.sound) args.push('--sound');
    if (opt.headless) args.push('--headless');
    // Videos: <account>_<date>_cNN.mp4 in the account's videos folder (or the day folder without an account).
    if (opt.record) { clip.video = `${account?.videos ?? dayDir}/${account ? account.id + '_' : ''}${clip.seed}.mp4`; args.push('--record', clip.video); }
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('exit', code => resolve(code ?? 1));
  });
}

// A login-required server (the default) has no offline play: an account not linked yet is linked (keeping its offline
// progress) before its day is planned, so it plays every clip online and can join its group.
if (command === 'run' && account) await ensureOnline(account.id, { url: opt.url, progress: text => console.log('online link: ' + text) });
const plan = loadPlan();
if (command === 'plan') show(plan);
else if (command === 'run') {
  const pause = () => new Promise(r => setTimeout(r, Number(opt.pause) * 1000));
  /** Play one clip and write down how it went (plan.json, the upload text). */
  async function runClip(clip, again = false) {
    const before = latestSave().level ?? 1;
    clip.title = clipTitle(clip.theme, { day: plan.day, level: before, index: clip.index, name: account?.name }); clip.levelBefore = before; clip.status = 'playing'; clip.started = new Date().toISOString(); savePlan(plan);
    console.log(`\n=== clip ${clip.index}/${plan.clips.length}${again ? ' (again)' : ''}: ${clip.title}`);
    const code = await playClip(clip, clip.title);
    const after = existsSync(`${dayDir}/${clip.seed}/save.json`) ? JSON.parse(readFileSync(`${dayDir}/${clip.seed}/save.json`, 'utf8')) : null;
    Object.assign(clip, { status: code === 0 ? 'done' : 'failed', exit: code, ended: new Date().toISOString(), levelAfter: after?.level ?? null });
    // G5: the upload text with YouTube chapters next to the video (<video>.txt / .json).
    if (clip.video && existsSync(clip.video)) {
      try { const text = clipText({ dir: `${dayDir}/${clip.seed}`, video: clip.video, title: clip.title, name: account?.name, day: plan.day, index: clip.index, duration: Number(opt.minutes) * 60 }); clip.chapters = text.chapters.length; clip.text = clip.video.replace(/\.mp4$/, '.txt'); }
      catch (error) { console.log('chapters: ' + error.message); }
    }
    savePlan(plan);
  }
  const todo = plan.clips.filter(c => c.index >= Number(opt.from));
  for (const clip of todo) {
    if (clip.status === 'done') continue;
    await runClip(clip);
    if (clip.index < plan.clips.length) await pause();
  }
  // A clip that failed (the browser closed, the game stopped answering) is played once more at the end of the day.
  for (const clip of todo.filter(c => c.status === 'failed')) {
    await pause();
    await runClip(clip, true);
  }
  show(plan);
  const failed = todo.filter(c => c.status === 'failed');
  if (failed.length) { console.log(`failed clips: ${failed.map(c => '#' + c.index).join(', ')}`); process.exitCode = 1; }
} else { console.error('usage: node director.mjs plan|run [--date YYYY-MM-DD] [--from n] [--clips n] [--minutes n]'); process.exit(2); }
