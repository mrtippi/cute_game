// Fast inspection while developing the bot.
//   node dev.mjs open [profile]   start a game window that stays open, with a debugging port
//   node dev.mjs state            player, panel, gear, fishing and nearby things, read live
//   node dev.mjs shot [file]      screenshot of the live window
//   node dev.mjs eval "<js>"      run an expression in the page (window.__zg is available)
//   node dev.mjs run <module> <fn> [json-args]   run one bot task against the live window
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRng } from './lib/rng.mjs';
import { Hands } from './lib/hands.mjs';
import { Game } from './lib/game.mjs';
import { startGame } from './lib/session.mjs';

const PORT = 9333, GAME_URL = 'http://127.0.0.1:8787/?bot';
const [command = 'state', ...rest] = process.argv.slice(2);

if (command === 'open') {
  const profile = rest[0] ?? 'D:/autogame/bot-data/test-profile';
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: { width: 1920, height: 1080 }, locale: 'ja-JP',
    args: [`--remote-debugging-port=${PORT}`, '--window-size=1920,1220', '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  await context.addInitScript(readFileSync(new URL('./lib/cursor.js', import.meta.url), 'utf8'));
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(GAME_URL); await page.waitForFunction(() => !!window.__zg); await page.waitForTimeout(2500);
  const rng = createRng('dev'), hands = new Hands(page, rng);
  await startGame({ page, hands, game: new Game(page, hands, rng, console.log), rng });
  console.log(`open on port ${PORT}; leave this running`);
  await new Promise(() => {});
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = browser.contexts()[0].pages().find(p => p.url().includes('8787'));
const rng = createRng(String(Date.now())), log = t => console.log(t);
const hands = new Hands(page, rng), game = new Game(page, hands, rng, log);
try {
  if (command === 'state') {
    const s = await game.snap();
    const near = [...s.entities, ...s.enemies].filter(e => e.d < 25).sort((a, b) => a.d - b.d).slice(0, 12);
    console.log(JSON.stringify({ planet: s.planet, level: s.level, energy: s.energy, hp: `${s.hp}/${s.maxHp}`, atk: s.attack, def: s.defense, modal: s.modal, dialog: s.dialog, player: s.player, gear: s.gear, bag: s.bag, fishing: s.fishing, reel: s.reel, bounty: s.bounty }, null, 1));
    console.log(near.map(e => `${e.kind ?? 'enemy'}:${e.name} d=${e.d}${e.level ? ' lv' + e.level : ''}`).join('\n'));
  } else if (command === 'shot') {
    await page.screenshot({ path: rest[0] ?? 'C:/Users/Admin/AppData/Local/Temp/claude/d--autogame/8f73f40f-5ff7-43e1-a6b1-1a77299db25a/scratchpad/live.png' }); console.log('saved');
  } else if (command === 'eval') {
    console.log(JSON.stringify(await page.evaluate(rest[0]), null, 1));
  } else if (command === 'run') {
    const [file, fn, args] = rest, mod = await import(`./tasks/${file}.mjs`);
    const bot = { page, game, hands, rng, log, note: t => log('★ ' + t) };
    console.log(await mod[fn](bot, args ? JSON.parse(args) : undefined));
  }
} catch (error) { console.log("error:", error.message); }
// Exit without browser.close(): over CDP that could close the live window.

process.exit(0);
