// Plays one session of Zoo Garden like a person: node play.mjs --minutes 60 [--seed 2026-10-02] [--profile dir]
// --profile without --account plays offline: only on a game server started with ZG_REQUIRE_LOGIN=0 (the default server
// requires login). With --account on a login-required server the account is linked and plays online by itself.
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createRng } from './lib/rng.mjs';
import { openSession } from './lib/session.mjs';
import { wearTitle } from './tasks/titles.mjs';
import { createPlanner } from './planner.mjs';
import { dress } from './tasks/wardrobe.mjs';
import { CLIPS } from './clips.mjs';
import { loadAccount } from './accounts.mjs';
import { startRecording } from './lib/recorder.mjs';
import { startOnline, keepOnline, relinkIfLost } from './lib/online.mjs';
import { sleep, assertLocal } from './lib/util.mjs';
import { ensureOnline, serverRequiresLogin } from './online.mjs';
import { createCoop, startTogether, fallBack, coopTick, coopIdle } from './tasks/coop.mjs';

const { values: opt } = parseArgs({ options: {
  minutes: { type: 'string', default: '10' }, seed: { type: 'string' }, profile: { type: 'string', default: 'D:/autogame/bot-data/profile' },
  url: { type: 'string', default: 'http://127.0.0.1:8787/' }, theme: { type: 'string' }, clip: { type: 'string' }, title: { type: 'string' },
  // An account (accounts.mjs) supplies the profile, the explorer's name and colour and its own debugging port;
  // its show switch (desktop app) opens a real window even when the run is windowless.
  account: { type: 'string' }, record: { type: 'string' }, pos: { type: 'string' }, mute: { type: 'boolean', default: false }, sound: { type: 'boolean', default: false }, headless: { type: 'boolean', default: false }, port: { type: 'string' }, out: { type: 'string', default: 'D:/autogame/bot-data/sessions' },
  // Online on this PC's own server (an account linked with online.mjs), in the explorer's own private party.
  online: { type: 'boolean', default: false },
  // A group (director.mjs): its letter and members; a together clip meets them (tasks/coop.mjs).
  group: { type: 'string' }, members: { type: 'string' },
} });
// Only ever this PC's own game server.
assertLocal(opt.url);
const day = opt.seed ?? new Date().toISOString().slice(0, 10), rng = createRng(day);
const dir = `${opt.out}/${day}`; mkdirSync(dir, { recursive: true });
const started = Date.now(), minutes = Number(opt.minutes), deadline = started + minutes * 60000;
const clock = () => { const s = Math.floor((Date.now() - started) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
// The clip's video (lib/recorder.mjs), once it has started.
let recording = null;
// A full disk (or a folder gone) must not end the session: the log and marks stop growing, the recording ends cleanly.
let cannotWrite = null;
const append = (file, text) => {
  try { appendFileSync(file, text); }
  catch (error) { if (!cannotWrite) { cannotWrite = error.code ?? error.message; console.log(`[${clock()}] cannot write ${file} (${cannotWrite}): no more log lines or marks${recording ? ', recording stopped' : ''}`); recording?.stop(); } }
};
const log = text => { const line = `[${clock()}] ${text}`; console.log(line); append(`${dir}/session.log`, line + '\n'); };
// Structured marks for the YouTube chapters (chapters.mjs): task switches, level-ups, the recording start.
// A clip played again starts its marks afresh (chapters.mjs also reads only from the last recording start).
try { writeFileSync(`${dir}/events.jsonl`, ''); } catch {}
const mark = (tag, data = {}) => append(`${dir}/events.jsonl`, JSON.stringify({ t: (Date.now() - started) / 1000, tag, ...data }) + '\n');
const note = (text, tag = 'info') => { log(`★ ${text}`); append(`${dir}/events.jsonl`, JSON.stringify({ t: (Date.now() - started) / 1000, tag, text }) + '\n'); };

let account = opt.account ? loadAccount(opt.account) : null;
// A login-required server (the default) has no offline play: the account is linked first (its offline progress goes
// with it, online.mjs) and plays online. Without --account only a server started with ZG_REQUIRE_LOGIN=0 can be played.
if (account && await serverRequiresLogin(opt.url)) { account = await ensureOnline(account.id, { url: opt.url, progress: text => log('online link: ' + text) }); opt.online = true; }
// A server that lost the account (a new data folder) gets it linked again, once (lib/online.mjs).
if (opt.online && account) account = await relinkIfLost(account, { url: opt.url, log });
if (opt.online && !account?.online?.linkedAt) throw new Error('--online needs a linked account (node online.mjs link <id>)');
const [px, py] = (opt.pos ?? '0,0').split(',').map(Number);
const { context, page, hands, game } = await openSession({ profile: account?.profile ?? opt.profile, url: opt.url, rng, log, name: account?.name, color: account?.color, port: opt.port ? Number(opt.port) : account?.port, position: { x: px, y: py }, // Silent unless asked (--sound): bots play next to other work on the same PC.
  mute: opt.mute || !opt.sound, headless: opt.headless && !account?.show, fps: opt.record || account ? 30 : 0,
  online: opt.online ? account : null, signOut: !opt.online && !!account?.online?.linkedAt });
// Online: into the explorer's own private party before the first recorded frame (lib/online.mjs).
const online = opt.online ? { page, game, hands, rng, log } : null;
if (online) await startOnline(online, account);
// The clip's video (lib/recorder.mjs): from the first frame of play to the end of the session.
recording = opt.record ? await startRecording(page, opt.record, { log, seconds: minutes * 60, preview: account ? `${account.dir}/preview.jpg` : undefined }) : null;
if (recording) mark('record', { file: opt.record });
// A recorded clip plays for exactly its length from the first recorded frame.
const clipEnd = recording ? recording.started + minutes * 60000 : deadline;
// A clip from the director (clips.mjs): its focus steers the planner; its wardrobe and title themes dress the explorer.
const clip = opt.clip ? CLIPS[opt.clip] : null;
if (opt.clip && !clip) throw new Error('unknown clip theme ' + opt.clip);
const theme = opt.theme ?? clip?.wardrobe;
const bot = { page, game, hands, rng, log, note, mark, theme, clip, online: online?.online ?? null };
// Planets where the explorer was knocked out: the next visit picks one star lower.
bot.struggled = new Set();
game.onFall = () => { note('knocked out, back home to rest', 'combat'); if (bot.lastPlanet) bot.struggled.add(bot.lastPlanet); };
const minutesLeft = () => (clipEnd - Date.now()) / 60000;
let s = await game.snap();
note(`start · Lv.${s.level} · ϟ${s.energy} · ${s.planet}${opt.clip ? ' · clip ' + opt.clip : ''}${theme ? ' · theme ' + theme : ''}${bot.online ? ` · online party ${bot.online.ownParty ?? '-'}` : ''}`, 'session');
if (opt.title) note(opt.title, 'clip');
if (theme) log('dress → ' + await dress(bot, theme).catch(e => e.message));
log('title → ' + await wearTitle(bot, clip?.title ?? theme ?? 'fancy').catch(e => e.message));
// A together clip: meet the group (online, in a group), or play a solo theme when that cannot happen.
if (opt.clip === 'together') {
  const members = (opt.members ?? '').split(',').filter(Boolean);
  if (!bot.online || !opt.group || members.length < 2 || !members.includes(account?.id)) await fallBack(bot, !bot.online ? 'not playing online' : 'not in a group');
  else {
    bot.coop = createCoop({ group: opt.group, members, seed: day, account }); Object.assign(bot.coop, { minutes: minutesLeft(), minutesLeft });
    const met = await startTogether(bot).catch(error => { bot.coop.why = 'meeting failed: ' + error.message; return false; });
    if (!met) await fallBack(bot, bot.coop.why ?? 'the group did not meet');
  }
}

const planner = createPlanner(bot, { minutesLeft });
let lastLevel = s.level;
// A clip whose game cannot go on (the browser closed or crashed, the page stuck on an error, the same error again and
// again) stops early and is marked failed; the director plays it again later. A slip now and then is retried.
const MAX_ERRORS = 8;
let errors = 0, lastError = '', repeats = 0, failed = null;
let browserGone = false; context.on('close', () => { browserGone = true; });
const pageGone = () => browserGone || page.isClosed();
while (Date.now() < clipEnd && !failed) {
  try {
    // A dropped connection (a server restart) is noticed between tasks: sign in again, reload once, same party.
    if (bot.online) { const line = await keepOnline(bot).catch(error => 'online: ' + error.message); if (line) log(line); }
    if (bot.coop) { const line = await coopTick(bot, { minutesLeft }).catch(error => 'together: ' + error.message); if (line) log(line); }
    const result = await planner.step();
    const level = (await game.snap()).level; if (level > lastLevel) { mark('level', { level }); lastLevel = level; }
    errors = 0;
    if (result) { log(result); continue; }
    // Nothing worth doing yet: wander near the garden while the crops grow (with the group: near the others).
    if (bot.coop?.met && !bot.coop.ended) { await coopIdle(bot); continue; }
    s = await game.snap();
    const bed = rng.pick(s.entities.filter(e => e.kind === 'plot'));
    if (bed && rng.chance(.35)) await game.stepToward(bed.x + rng.normal(0, 3), bed.z + rng.normal(0, 3), s);
    else await hands.fidget(s.viewport.w, s.viewport.h);
    await hands.sleep(rng.between(1500, 4000));
  } catch (error) {
    errors++;
    const text = (error?.stack ?? error).toString().split('\n').slice(0, 3).join(' | ');
    // The same error over and over is written once more every 20 times, so a stuck clip keeps its log small.
    repeats = text === lastError ? repeats + 1 : 0; lastError = text;
    if (repeats === 0) log('error: ' + text); else if (repeats % 20 === 0) log(`error (the same, ${repeats + 1} times): ${text}`);
    const where = pageGone() ? '' : page.url();
    if (pageGone()) failed = 'the browser or the game page closed';
    else if (errors >= MAX_ERRORS) failed = `${errors} errors in a row${where.startsWith('chrome-error://') ? ' (the page shows a browser error: is the game server running?)' : ''}`;
    else { await game.closePanel().catch(() => {}); await sleep(Math.min(5000, 500 * errors)); }
  }
}
if (failed) { log(`clip failed: ${failed}`); mark('failed', { why: failed }); }
// The end of the session: the last look and the save, when the game is still there to ask.
try {
  s = await game.snap();
  note(`end · Lv.${s.level} · ϟ${s.energy}`, 'session');
  writeFileSync(`${dir}/save.json`, await game.saveJson());
} catch (error) { log('end: the game could not be read (' + String(error?.message ?? error).split('\n')[0] + ')'); }
if (recording) {
  const r = await recording.stop();
  if (r.broken) note(`no video: the recording failed (${r.errors || 'ffmpeg stopped'})`, 'session');
  else note(`video ${r.seconds}s → ${r.file}`, 'session');
}
await context.close().catch(() => {});
if (failed) process.exitCode = 1;
