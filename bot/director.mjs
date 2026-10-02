// The director: one day of ten one-hour clips (clips.mjs), planned from the latest save and played one after another.
//
//   node director.mjs plan [--date 2026-10-03]            plan the day and print it (writes plan.json)
//   node director.mjs run  [--date ...] [--from 1] [--clips 10] [--minutes 60]
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
import { loadAccount } from './accounts.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  date: { type: 'string' }, from: { type: 'string', default: '1' }, clips: { type: 'string', default: '10' }, minutes: { type: 'string', default: '60' },
  profile: { type: 'string', default: 'D:/autogame/bot-data/profile' }, root: { type: 'string', default: 'D:/autogame/bot-data/director' },
  pause: { type: 'string', default: '20' },
  // An account (accounts.mjs): its profile, its days folder, its videos (recorded per clip), its window spot.
  account: { type: 'string' }, record: { type: 'boolean', default: false }, pos: { type: 'string', default: '0,0' }, mute: { type: 'boolean', default: false },
} });
const account = opt.account ? loadAccount(opt.account) : null;
if (account) { opt.profile = account.profile; opt.root = account.days; }
const command = positionals[0] ?? 'plan', date = opt.date ?? new Date().toISOString().slice(0, 10);
const dayDir = `${opt.root}/${date}`; mkdirSync(dayDir, { recursive: true });
const PLAY = fileURLToPath(new URL('./play.mjs', import.meta.url));

/** The newest save.json written by any session (director clips or hand-run sessions); level 1 when none. */
function latestSave() {
  const found = [];
  const walk = dir => { if (!existsSync(dir)) return; for (const name of readdirSync(dir)) { const p = `${dir}/${name}`; if (statSync(p).isDirectory()) walk(p); else if (name === 'save.json') found.push({ p, t: statSync(p).mtimeMs }); } };
  walk(opt.root); if (!account) walk('D:/autogame/bot-data/sessions');
  found.sort((a, b) => b.t - a.t);
  try { return found.length ? JSON.parse(readFileSync(found[0].p, 'utf8')) : { level: 1 }; } catch { return { level: 1 }; }
}

/** Day number of the series: the position of this date among the days played (days.json). */
function seriesDay() {
  const file = `${opt.root}/days.json`, days = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (!days.includes(date)) { days.push(date); days.sort(); writeFileSync(file, JSON.stringify(days, null, 1)); }
  return days.indexOf(date) + 1;
}

function loadPlan() {
  const file = `${dayDir}/plan.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const save = latestSave(), day = seriesDay(), rng = createRng(`director:${account?.id ?? ''}:${date}`);
  const themes = planDay(save, rng, Number(opt.clips), account?.style);
  const plan = { date, day, startLevel: save.level ?? 1, clips: themes.map((theme, i) => ({ index: i + 1, theme, seed: `${date}-c${String(i + 1).padStart(2, '0')}`, status: 'planned' })) };
  writeFileSync(file, JSON.stringify(plan, null, 1));
  return plan;
}
const savePlan = plan => writeFileSync(`${dayDir}/plan.json`, JSON.stringify(plan, null, 1));

function show(plan) {
  console.log(`Day ${plan.day} · ${plan.date} · from Lv.${plan.startLevel}`);
  for (const c of plan.clips) console.log(`  #${String(c.index).padStart(2)} ${CLIPS[c.theme].icon} ${c.theme.padEnd(8)} ${c.status.padEnd(8)} ${c.title ?? ''}${c.levelAfter ? ` → Lv.${c.levelAfter}` : ''}`);
}

/** One clip: play.mjs with the clip's theme and title, the clip folder under the day folder. */
function playClip(clip, title) {
  return new Promise(resolve => {
    const args = [PLAY, '--minutes', opt.minutes, '--seed', clip.seed, '--clip', clip.theme, '--title', title, '--profile', opt.profile, '--out', dayDir, '--pos', opt.pos];
    if (account) args.push('--account', account.id);
    if (opt.mute) args.push('--mute');
    // Videos: <account>_<date>_cNN.mp4 in the account's videos folder (or the day folder without an account).
    if (opt.record) { clip.video = `${account?.videos ?? dayDir}/${account ? account.id + '_' : ''}${clip.seed}.mp4`; args.push('--record', clip.video); }
    const child = spawn(process.execPath, args, { stdio: 'inherit' });
    child.on('exit', code => resolve(code ?? 1));
  });
}

const plan = loadPlan();
if (command === 'plan') show(plan);
else if (command === 'run') {
  for (const clip of plan.clips.filter(c => c.index >= Number(opt.from))) {
    if (clip.status === 'done') continue;
    const before = latestSave().level ?? 1;
    clip.title = clipTitle(clip.theme, { day: plan.day, level: before, index: clip.index, name: account?.name }); clip.levelBefore = before; clip.status = 'playing'; clip.started = new Date().toISOString(); savePlan(plan);
    console.log(`\n=== clip ${clip.index}/${plan.clips.length}: ${clip.title}`);
    const code = await playClip(clip, clip.title);
    const after = existsSync(`${dayDir}/${clip.seed}/save.json`) ? JSON.parse(readFileSync(`${dayDir}/${clip.seed}/save.json`, 'utf8')) : null;
    Object.assign(clip, { status: code === 0 ? 'done' : 'failed', exit: code, ended: new Date().toISOString(), levelAfter: after?.level ?? null });
    savePlan(plan);
    if (clip.index < plan.clips.length) await new Promise(r => setTimeout(r, Number(opt.pause) * 1000));
  }
  show(plan);
} else { console.error('usage: node director.mjs plan|run [--date YYYY-MM-DD] [--from n] [--clips n] [--minutes n]'); process.exit(2); }
