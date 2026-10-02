// Plays one session of Zoo Garden like a person: node play.mjs --minutes 60 [--seed 2026-10-02] [--profile dir]
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

const { values: opt } = parseArgs({ options: {
  minutes: { type: 'string', default: '10' }, seed: { type: 'string' }, profile: { type: 'string', default: 'D:/autogame/bot-data/profile' },
  url: { type: 'string', default: 'http://127.0.0.1:8787/' }, theme: { type: 'string' }, clip: { type: 'string' }, title: { type: 'string' },
  // An account (accounts.mjs) supplies the profile, the explorer's name and colour and its own debugging port.
  account: { type: 'string' }, record: { type: 'string' }, pos: { type: 'string' }, mute: { type: 'boolean', default: false }, out: { type: 'string', default: 'D:/autogame/bot-data/sessions' },
} });
const day = opt.seed ?? new Date().toISOString().slice(0, 10), rng = createRng(day);
const dir = `${opt.out}/${day}`; mkdirSync(dir, { recursive: true });
const started = Date.now(), minutes = Number(opt.minutes), deadline = started + minutes * 60000;
const clock = () => { const s = Math.floor((Date.now() - started) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const log = text => { const line = `[${clock()}] ${text}`; console.log(line); appendFileSync(`${dir}/session.log`, line + '\n'); };
const note = (text, tag = 'info') => { log(`★ ${text}`); appendFileSync(`${dir}/events.jsonl`, JSON.stringify({ t: (Date.now() - started) / 1000, tag, text }) + '\n'); };

const account = opt.account ? loadAccount(opt.account) : null;
const [px, py] = (opt.pos ?? '0,0').split(',').map(Number);
const { context, page, hands, game } = await openSession({ profile: account?.profile ?? opt.profile, url: opt.url, rng, log, name: account?.name, color: account?.color, port: account?.port, position: { x: px, y: py }, mute: opt.mute, fps: opt.record || account ? 30 : 0 });
// The clip's video (lib/recorder.mjs): from the first frame of play to the end of the session.
const recording = opt.record ? await startRecording(page, opt.record, { log }) : null;
// A clip from the director (clips.mjs): its focus steers the planner; its wardrobe and title themes dress the explorer.
const clip = opt.clip ? CLIPS[opt.clip] : null;
if (opt.clip && !clip) throw new Error('unknown clip theme ' + opt.clip);
const theme = opt.theme ?? clip?.wardrobe;
const bot = { page, game, hands, rng, log, note, theme, clip };
// Planets where the explorer was knocked out: the next visit picks one star lower.
bot.struggled = new Set();
game.onFall = () => { note('knocked out, back home to rest', 'combat'); if (bot.lastPlanet) bot.struggled.add(bot.lastPlanet); };
const minutesLeft = () => (deadline - Date.now()) / 60000;
let s = await game.snap();
note(`start · Lv.${s.level} · ϟ${s.energy} · ${s.planet}${opt.clip ? ' · clip ' + opt.clip : ''}${theme ? ' · theme ' + theme : ''}`, 'session');
if (opt.title) note(opt.title, 'clip');
if (theme) log('dress → ' + await dress(bot, theme).catch(e => e.message));
log('title → ' + await wearTitle(bot, clip?.title ?? theme ?? 'fancy').catch(e => e.message));

const planner = createPlanner(bot, { minutesLeft });
while (Date.now() < deadline) {
  try {
    const result = await planner.step();
    if (result) { log(result); continue; }
    // Nothing worth doing yet: wander near the garden while the crops grow.
    s = await game.snap();
    const bed = rng.pick(s.entities.filter(e => e.kind === 'plot'));
    if (bed && rng.chance(.35)) await game.stepToward(bed.x + rng.normal(0, 3), bed.z + rng.normal(0, 3), s);
    else await hands.fidget(s.viewport.w, s.viewport.h);
    await hands.sleep(rng.between(1500, 4000));
  } catch (error) { log('error: ' + (error?.stack ?? error).toString().split('\n').slice(0, 3).join(' | ')); await game.closePanel().catch(() => {}); }
}
s = await game.snap();
note(`end · Lv.${s.level} · ϟ${s.energy}`, 'session');
writeFileSync(`${dir}/save.json`, await game.saveJson());
if (recording) { const r = await recording.stop(); note(`video ${r.seconds}s → ${r.file}`, 'session'); }
await context.close();
