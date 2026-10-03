// Test tool: patch the offline save of a bot profile before a trial run, the way a tester would set up a scene.
//   node patch-profile.mjs <profile dir> '{"level":30,"bag":{"bow_galaxy":1},"gear":{"weapon":"bow_galaxy"}}'
// bag, gear and progression are merged; other keys replace the save's value. Runs once per profile (sessionStorage guard).
// Offline saves are played only by a game server started with ZG_REQUIRE_LOGIN=0 (the default server requires login).
import { openSession, startGame } from './lib/session.mjs';
import { createRng } from './lib/rng.mjs';
const [profile, json] = process.argv.slice(2), patch = JSON.parse(json), rng = createRng('p');
const { page, context, hands, game } = await openSession({ profile, rng, log: () => {} });
await context.addInitScript(patch => { if (sessionStorage.getItem('patched')) return; sessionStorage.setItem('patched', '1');
  const key = 'cute-game-save-v1', s = JSON.parse(localStorage.getItem(key));
  for (const [k, v] of Object.entries(patch)) { if (k === 'bag') Object.assign(s.bag, v); else if (k === 'gear') Object.assign(s.gear, v); else if (k === 'progression') Object.assign(s.progression, v); else s[k] = v; }
  localStorage.setItem(key, JSON.stringify(s)); }, patch);
await page.reload(); await page.waitForFunction(() => !!window.__zg); await page.waitForTimeout(2500);
await startGame({ page, hands, game, rng }); await page.waitForTimeout(3000);
const s = await game.snap(); console.log('patched: Lv', s.level, 'weapon', s.gear.weapon, JSON.stringify(s.weapon));
await context.close();
