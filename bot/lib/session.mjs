// Opens the game in a real Chrome window with a persistent profile (the offline save lives in its
// localStorage), the drawn cursor, and the bot bridge enabled.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hands } from './hands.mjs';
import { Game } from './game.mjs';

const CURSOR = readFileSync(fileURLToPath(new URL('./cursor.js', import.meta.url)), 'utf8');

export async function openSession({ url = 'http://127.0.0.1:8787/', profile, rng, name = 'さくら', width = 1920, height = 1080, log = console.log, speed = 1 }) {
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, viewport: { width, height }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    args: [`--window-size=${width},${height + 140}`, '--window-position=0,0', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
    ignoreDefaultArgs: ['--mute-audio'],
  });
  await context.addInitScript(CURSOR);
  // Japanese interface for the recording, chosen once like a player would in Settings.
  await context.addInitScript(() => { try { if (!localStorage.getItem('cute-game-language')) localStorage.setItem('cute-game-language', 'ja'); } catch {} });
  const page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', e => log('PAGE ERROR ' + e.message));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'bot');
  await page.waitForFunction(() => !!window.__zg, null, { timeout: 30000 });
  const hands = new Hands(page, rng, { speed }), game = new Game(page, hands, rng, log);
  await page.waitForTimeout(2500);
  await startGame({ page, hands, game, rng, name });
  return { context, page, hands, game };
}

/** First run: name the explorer on the welcome card. Later runs: continue the saved adventure. */
export async function startGame({ page, hands, game, rng, name = 'さくら' }) {
  let s = await game.snap();
  if (!s.started) {
    const input = page.locator('.welcome-card input').first();
    if (await input.count() && !(await input.inputValue())) { await hands.clickElement(input); await hands.think(500); await page.keyboard.type(name, { delay: rng.between(90, 170) }); }
    await hands.think(600);
    const start = page.locator('[data-action="start"]').first();
    if (await start.count()) await hands.clickElement(start); else await page.keyboard.press('Enter');
    s = await game.waitFor(n => n.started && n, { timeout: 15000 });
  }
  return s;
}
