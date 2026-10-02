// Several accounts playing side by side, each recording its own clips (accounts.mjs, director.mjs, lib/recorder.mjs).
//
//   node fleet.mjs new <folder-id> <日本語の名前> <colour> ['{"fishing":2}']   create an account (blue pink green orange purple red)
//   node fleet.mjs list                                                       accounts, levels and days played
//   node fleet.mjs run --accounts sakura,haruto [--date ...] [--clips 10] [--minutes 60] [--no-record]
//
// Each account runs its own director (its own day plan and Chrome window). The windows cascade so every one stays
// on screen (the game pauses in a hidden tab); the fleet mutes them; each clip is recorded to the account's videos
// folder as <id>_<date>_cNN.mp4. Starts are staggered so the windows do not all load at the same moment.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createAccount, listAccounts, loadAccount } from './accounts.mjs';

const { values: opt, positionals } = parseArgs({ allowPositionals: true, options: {
  accounts: { type: 'string' }, date: { type: 'string' }, clips: { type: 'string', default: '10' }, minutes: { type: 'string', default: '60' },
  'no-record': { type: 'boolean', default: false }, stagger: { type: 'string', default: '30' }, url: { type: 'string', default: 'http://127.0.0.1:8787/' },
} });
const [command = 'list', ...rest] = positionals;
const DIRECTOR = fileURLToPath(new URL('./director.mjs', import.meta.url));

/** The newest save.json in an account's days (level and name for the list). */
function latest(account) {
  let best = null;
  const walk = dir => { if (!existsSync(dir)) return; for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; if (statSync(p).isDirectory()) walk(p); else if (n === 'save.json' && (!best || statSync(p).mtimeMs > best.t)) best = { p, t: statSync(p).mtimeMs }; } };
  walk(account.days); try { return best ? JSON.parse(readFileSync(best.p, 'utf8')) : null; } catch { return null; }
}

if (command === 'new') {
  const [id, name, color = 'blue', style] = rest;
  if (!id || !name) { console.error('usage: node fleet.mjs new <folder-id> <名前> <colour> [style json]'); process.exit(2); }
  const a = createAccount(id, name, color, style ? JSON.parse(style) : {});
  console.log(`created ${a.id}: ${a.name} ${a.color} (port ${a.port}) → ${a.dir}`);
} else if (command === 'list') {
  for (const a of listAccounts()) {
    const save = latest(a), days = existsSync(a.days) ? readdirSync(a.days).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).length : 0;
    const videos = existsSync(a.videos) ? readdirSync(a.videos).filter(f => f.endsWith('.mp4')).length : 0;
    console.log(`${a.id.padEnd(12)} ${a.name.padEnd(8)} ${a.color}  Lv.${save?.level ?? 1}  ${days} days  ${videos} videos  since ${a.created}`);
  }
} else if (command === 'run') {
  const ids = (opt.accounts ?? listAccounts().map(a => a.id).join(',')).split(',').filter(Boolean);
  if (!ids.length) { console.error('no accounts: node fleet.mjs new <folder-id> <名前> <colour>'); process.exit(2); }
  const accounts = ids.map(loadAccount);
  try { await fetch(opt.url); } catch { console.error(`the game server is not answering at ${opt.url} (npm start in cute_game)`); process.exit(1); }
  const date = opt.date ?? new Date().toISOString().slice(0, 10);
  const runs = accounts.map((a, i) => new Promise(resolve => setTimeout(() => {
    mkdirSync(`${a.days}/${date}`, { recursive: true });
    const out = createWriteStream(`${a.days}/${date}/director.log`, { flags: 'a' });
    const args = [DIRECTOR, 'run', '--account', a.id, '--date', date, '--clips', opt.clips, '--minutes', opt.minutes, '--pos', `${i * 64},${i * 36}`, '--mute'];
    if (!opt['no-record']) args.push('--record');
    console.log(`▶ ${a.id} (${a.name}) starts`);
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(out); child.stderr.pipe(out);
    // A short live line per clip in the fleet's own console.
    child.stdout.on('data', d => { for (const line of String(d).split('\n')) if (/=== clip|recording saved|★ end/.test(line)) console.log(`[${a.id}] ${line.trim()}`); });
    child.on('exit', code => { console.log(`■ ${a.id} finished (exit ${code})`); resolve(code); });
  }, i * Number(opt.stagger) * 1000)));
  const codes = await Promise.all(runs);
  process.exit(codes.every(c => c === 0) ? 0 : 1);
} else { console.error('usage: node fleet.mjs new|list|run'); process.exit(2); }
