// Opens the game in a real Chrome window with a persistent profile (the offline save lives in its
// localStorage), the drawn cursor, and the bot bridge enabled.
import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hands } from './hands.mjs';
import { Game } from './game.mjs';
import { assertLocal, ensureLoggedIn, ensureLoggedOut, reloadGame } from './online.mjs';

/**
 * The game window. This PC's screen works at 2048×1112 (125% Windows scaling), so a 1920×1080 page plus Chrome's
 * bars ran off the bottom. 1536×864 CSS pixels at scale 1.25 still renders 1920×1080 real pixels for the recording,
 * and the whole window (with the tab strip and the automation bar) fits on screen.
 */
export const WINDOW = { width: 1536, height: 864, scale: 1.25, chrome: 135 };
export const windowArgs = ({ width, height } = WINDOW, { x = 0, y = 0 } = {}) => [`--window-size=${width},${height + WINDOW.chrome}`, `--window-position=${x},${y}`];

/**
 * Which browser: the Chromium bundled with the desktop app (ZG_BROWSER=bundled, found through PLAYWRIGHT_BROWSERS_PATH:
 * a fixed version that no update can change), else the installed Google Chrome (development on this PC).
 */
export const BROWSER = process.env.ZG_BROWSER === 'bundled' ? {} : { channel: 'chrome' };
/** Chrome switches that keep its own pop-ups off the screen while the bots play (translate offer, crash bubble, infobars). */
export const QUIET_ARGS = ['--disable-features=Translate,TranslateUI,DownloadBubble,DownloadBubbleV2', '--hide-crash-restore-bubble', '--disable-session-crashed-bubble', '--noerrdialogs', '--disable-infobars', '--no-default-browser-check', '--no-first-run'];
/**
 * No window at all (the desktop app's default): Chrome's new headless mode still draws on the graphics card
 * (measured: GTX 1660 through ANGLE/D3D11, 60 fps, screencast 30 fps), so play and recording are the same.
 */
export const HEADLESS_ARGS = ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
/**
 * Before a launch: mark the profile as cleanly closed (no "Restore pages?" after a killed run) and switch the
 * translate offer off in its preferences.
 */
export function quietProfile(profile) {
  const file = `${profile}/Default/Preferences`; if (!existsSync(file)) return;
  try {
    const prefs = JSON.parse(readFileSync(file, 'utf8'));
    prefs.profile = { ...prefs.profile, exit_type: 'Normal', exited_cleanly: true };
    prefs.translate = { ...prefs.translate, enabled: false };
    writeFileSync(file, JSON.stringify(prefs));
  } catch { /* a profile being written by a running Chrome: leave it */ }
}

const CURSOR = readFileSync(fileURLToPath(new URL('./cursor.js', import.meta.url)), 'utf8');

/**
 * Several accounts can play at once (fleet.mjs): each has its own profile, debugging port and window position, and
 * the fleet mutes them (the recordings carry no sound; music is added afterwards).
 */
export async function openSession({ url = 'http://127.0.0.1:8787/', profile, rng, name = 'さくら', color, port = 9333, position, mute = false, fps = 0, headless = false, width = WINDOW.width, height = WINDOW.height, scale = WINDOW.scale, log = console.log, speed = 1, online = null, signOut = false }) {
  // online: a linked account (lib/online.mjs) — signed in on this PC's own server before the game starts.
  // signOut: a linked account playing offline again — its profile drops the server session.
  if (online) assertLocal(url);
  quietProfile(profile);
  const context = await chromium.launchPersistentContext(profile, {
    ...BROWSER, headless: false, chromiumSandbox: true, viewport: { width, height }, deviceScaleFactor: scale, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    // The debugging port lets bot/dev.mjs inspect a running session.
    args: [`--remote-debugging-port=${port}`, ...windowArgs({ width, height }, position), ...(mute ? ['--mute-audio'] : []), ...(headless ? HEADLESS_ARGS : []), ...QUIET_ARGS, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
    // No "controlled by automated test software" bar.
    ignoreDefaultArgs: ['--mute-audio', '--enable-automation'],
  });
  await context.addInitScript(CURSOR);
  // Japanese interface for the recording, chosen once like a player would in Settings.
  await context.addInitScript(() => { try { if (!localStorage.getItem('cute-game-language')) localStorage.setItem('cute-game-language', 'ja'); } catch {} });
  const page = context.pages()[0] ?? await context.newPage();
  page.on('pageerror', e => log('PAGE ERROR ' + e.message));
  // fps: the game draws at most this many frames a second (main.ts FRAME_CAP); 30 for recorded and parallel play.
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'bot' + (fps ? `&fps=${fps}` : ''));
  await page.waitForFunction(() => !!window.__zg, null, { timeout: 30000 });
  const hands = new Hands(page, rng, { speed }), game = new Game(page, hands, rng, log);
  await page.waitForTimeout(2500);
  // The game checks its session once while loading, so a new sign-in (or sign-out) needs a reload.
  if (online ? (await ensureLoggedIn(page, online, { log })).fresh : signOut && await ensureLoggedOut(page)) await reloadGame(page);
  await startGame({ page, hands, game, rng, name, color });
  return { context, page, hands, game };
}

/** First run: name the explorer on the welcome card. Later runs: continue the saved adventure. */
export async function startGame({ page, hands, game, rng, name = 'さくら', color }) {
  let s = await game.snap();
  if (!s.started) {
    const input = page.locator('.welcome-card input').first();
    if (await input.count() && !(await input.inputValue())) { await hands.clickElement(input); await hands.think(500); await page.keyboard.type(name, { delay: rng.between(90, 170) }); }
    // The account's colour (accounts.mjs), picked on the welcome card like a new player would.
    const swatch = color ? page.locator(`.welcome-card [data-action="color"][data-color="${color}"]`).first() : null;
    if (swatch && await swatch.count()) { await hands.think(400); await hands.clickElement(swatch); }
    await hands.think(600);
    const start = page.locator('[data-action="start"]').first();
    if (await start.count()) await hands.clickElement(start); else await page.keyboard.press('Enter');
    s = await game.waitFor(n => n.started && n, { timeout: 15000 });
  }
  return s;
}
