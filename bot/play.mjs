// Plays one session of Zoo Garden like a person: node play.mjs --minutes 60 [--seed 2026-10-02] [--profile dir]
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createRng } from './lib/rng.mjs';
import { openSession } from './lib/session.mjs';
import { wearTitle } from './tasks/titles.mjs';
import { createPlanner } from './planner.mjs';
import { dress } from './tasks/wardrobe.mjs';

const { values: opt } = parseArgs({ options: {
  minutes: { type: 'string', default: '10' }, seed: { type: 'string' }, profile: { type: 'string', default: 'D:/autogame/bot-data/profile' },
  url: { type: 'string', default: 'http://127.0.0.1:8787/' }, theme: { type: 'string' }, out: { type: 'string', default: 'D:/autogame/bot-data/sessions' },
} });
const day = opt.seed ?? new Date().toISOString().slice(0, 10), rng = createRng(day);
const dir = `${opt.out}/${day}`; mkdirSync(dir, { recursive: true });
const started = Date.now(), minutes = Number(opt.minutes), deadline = started + minutes * 60000;
const clock = () => { const s = Math.floor((Date.now() - started) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const log = text => { const line = `[${clock()}] ${text}`; console.log(line); appendFileSync(`${dir}/session.log`, line + '\n'); };
const note = (text, tag = 'info') => { log(`★ ${text}`); appendFileSync(`${dir}/events.jsonl`, JSON.stringify({ t: (Date.now() - started) / 1000, tag, text }) + '\n'); };

const { context, page, hands, game } = await openSession({ profile: opt.profile, url: opt.url, rng, log });
const bot = { page, game, hands, rng, log, note, theme: opt.theme };
// Planets where the explorer was knocked out: the next visit picks one star lower.
bot.struggled = new Set();
game.onFall = () => { note('knocked out, back home to rest', 'combat'); if (bot.lastPlanet) bot.struggled.add(bot.lastPlanet); };
const minutesLeft = () => (deadline - Date.now()) / 60000;
let s = await game.snap();
note(`start · Lv.${s.level} · ϟ${s.energy} · ${s.planet}${opt.theme ? ' · theme ' + opt.theme : ''}`, 'session');
if (opt.theme) log('dress → ' + await dress(bot, opt.theme).catch(e => e.message));
log('title → ' + await wearTitle(bot, opt.theme ?? 'fancy').catch(e => e.message));

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
await context.close();
