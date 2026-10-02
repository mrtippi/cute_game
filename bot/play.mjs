// Plays one session of Zoo Garden like a person: node play.mjs --minutes 60 [--seed 2026-10-02] [--profile dir]
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createRng } from './lib/rng.mjs';
import { openSession } from './lib/session.mjs';
import { claimable, claimRewards, tendGarden, sellProduce } from './tasks/basics.mjs';
import { fight, safeTargets, handleFall, recoverBag, recover, inside, leaveHouse } from './tasks/combat.mjs';
import { upgradeWeapon, crystalUpgrade, buyRod } from './tasks/shopping.mjs';
import { goFishing, hasRod } from './tasks/fishing.mjs';

const { values: opt } = parseArgs({ options: {
  minutes: { type: 'string', default: '10' }, seed: { type: 'string' }, profile: { type: 'string', default: 'D:/autogame/bot-data/profile' },
  url: { type: 'string', default: 'http://127.0.0.1:8787/' }, out: { type: 'string', default: 'D:/autogame/bot-data/sessions' },
} });
const day = opt.seed ?? new Date().toISOString().slice(0, 10), rng = createRng(day);
const dir = `${opt.out}/${day}`; mkdirSync(dir, { recursive: true });
const started = Date.now(), minutes = Number(opt.minutes), deadline = started + minutes * 60000;
const clock = () => { const s = Math.floor((Date.now() - started) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const log = text => { const line = `[${clock()}] ${text}`; console.log(line); appendFileSync(`${dir}/session.log`, line + '\n'); };
const note = (text, tag = 'info') => { log(`★ ${text}`); appendFileSync(`${dir}/events.jsonl`, JSON.stringify({ t: (Date.now() - started) / 1000, tag, text }) + '\n'); };

const { context, page, hands, game } = await openSession({ profile: opt.profile, url: opt.url, rng, log });
const bot = { page, game, hands, rng, log, note };
game.onFall = () => note('knocked out, back home to rest', 'combat');
const minutesLeft = () => (deadline - Date.now()) / 60000;
const crops = new Set((await page.evaluate(() => window.__zg.seeds())).map(c => c.id));
let s = await game.snap();
note(`start · Lv.${s.level} · ϟ${s.energy} · ${s.planet}`, 'session');

const last = { claim: 0, shop: 0, crystal: 0, idle: 0, garden: 0 };
const ago = key => Date.now() - last[key];
// A task that achieved nothing rests for a while, so one stuck routine cannot loop all session.
const resting = {}; const rest = (key, ms) => { resting[key] = Date.now() + ms; }; const ready = key => !(resting[key] > Date.now());
while (Date.now() < deadline) {
  try {
    if (await handleFall(bot)) continue;
    s = await game.snap();
    if (s.modal || s.dialog) { await game.closePanel(); continue; }
    if (s.dropped && s.hp >= s.maxHp * .9 && rng.chance(.7)) { await recoverBag(bot); continue; }
    if (s.hp < s.maxHp * .6) { await recover(bot); continue; }
    if (inside(s)) { if (!await leaveHouse(bot)) await hands.sleep(3000); continue; }
    if (ago('claim') > 90000 && (await claimable(game)).length) { last.claim = Date.now(); log('task: rewards → ' + await claimRewards(bot)); continue; }
    if (ready('garden') && s.planet === 'home' && s.plots.some(p => !p.crop || p.progress >= 1)) { const r = await tendGarden(bot, { minutesLeft: minutesLeft() }); log('task: garden → ' + r); if (r.startsWith('harvested 0, planted false')) rest('garden', 60000); continue; }
    const produce = Object.entries(s.bag).filter(([id]) => crops.has(id)).reduce((n, [, c]) => n + c, 0);
    if (produce >= 6) { log('task: market → ' + await sellProduce(bot)); continue; }
    if (s.energy >= 40 && ago('shop') > 300000) { last.shop = Date.now(); log('task: shop → ' + await upgradeWeapon(bot)); continue; }
    if (s.energy >= 100 && ago('crystal') > 240000) { last.crystal = Date.now(); log('task: crystal → ' + await crystalUpgrade(bot)); continue; }
    const type = s.bounty && s.bounty.progress < s.bounty.target ? s.bounty.type : undefined;
    if (ready('fight') && (safeTargets(s, { type }).length || safeTargets(s).length)) { const r = await fight(bot, { count: rng.int(2, 4), type, timeout: Math.min(120000, minutesLeft() * 60000) }); log('task: fight → ' + r); if (r === 'kills 0') rest('fight', 45000); continue; }
    // Waiting for crops: a few casts at the pond, like a player passing the time.
    if (ready('fish') && s.planet === 'home') {
      if (!hasRod(s) && s.energy >= 30) { log('task: rod → ' + await buyRod(bot)); rest('fish', 20000); continue; }
      if (hasRod(s)) { const r = await goFishing(bot, { count: rng.int(2, 4), timeout: Math.min(240000, minutesLeft() * 60000) }); log('task: fishing → ' + r); rest('fish', r.startsWith('caught 0') ? 120000 : rng.between(60000, 150000)); continue; }
    }
    // Nothing worth doing yet: wander near the garden while the crops grow.
    if (ago('idle') > 20000) { last.idle = Date.now(); log('idle: waiting for crops'); }
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
