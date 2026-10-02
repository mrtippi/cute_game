// Flying between planets the way a player does: launch from the starship station, hold the pointer
// toward where the ship should go, pick up stardust when the tank runs low, press L over the planet.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const LEVELS = { home: 1, toy: 4, candy: 6, jungle: 8, ice: 10, ocean: 12, lava: 14, cloud: 16, shadow: 20 };

/** The next planet worth visiting: undiscovered ones first (in level order), then a random discovered one. */
export function nextPlanet(s, rng) {
  const open = Object.entries(LEVELS).filter(([id, level]) => id !== 'home' && level <= s.level);
  const fresh = open.filter(([id]) => !s.discovered.includes(id)).sort((a, b) => a[1] - b[1]);
  if (fresh.length) return fresh[0][0];
  return open.length ? rng.pick(open)[0] : null;
}

async function launch(bot, target) {
  const { game, note } = bot;
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'travel'), { label: 'starship', done: n => n.modal === 'travel' && n });
  if (!opened) return false;
  // A discovered planet can be chosen on the star map; the ship then flies itself there.
  if (opened.discovered.includes(target) && await game.action('fly-to', { kind: target })) { note(`autopilot to ${target}`, 'travel'); return 'autopilot'; }
  if (!await game.action('launch')) { await game.closePanel(); return false; }
  note(`launched toward ${target}`, 'travel');
  return 'manual';
}

/** Steer by holding the pointer ahead of the ship in the wanted direction. */
async function pilot(bot, target, { timeout = 150000 } = {}) {
  const { game, hands, rng, log, note } = bot;
  const end = Date.now() + timeout; let held = false, dustRun = null;
  try {
    while (Date.now() < end) {
      const s = await game.snap();
      if (!s.space) { if (s.planet === target) return true; await sleep(300); continue; }
      const sp = s.space, goal = sp.planets.find(p => p.id === target);
      if (sp.landing) { if (held) { await hands.mouseUp(); held = false; } await sleep(400); continue; }
      if (sp.over === target) {
        if (held) { await hands.mouseUp(); held = false; }
        await hands.think(350); await hands.press('l'); await sleep(1500); continue;
      }
      // Low on fuel: detour to the nearest stardust.
      if (sp.fuel < 30 && sp.dust[0] && sp.dust[0].d < 140) dustRun = sp.dust[0].id;
      if (sp.fuel > 70) dustRun = null;
      const dust = dustRun !== null ? sp.dust.find(d => d.id === dustRun) : null;
      const aim = dust ?? goal;
      const dx = aim.x - sp.x, dz = aim.z - sp.z, d = Math.hypot(dx, dz) || 1;
      // A point a short way ahead, with a little hand wobble.
      const ahead = Math.min(d, rng.between(22, 34)), wobble = rng.normal(0, .06), a = Math.atan2(dz, dx) + wobble;
      const p = await game.project(sp.x + Math.cos(a) * ahead, sp.z + Math.sin(a) * ahead);
      const x = Math.min(s.viewport.w - 40, Math.max(40, p.x)), y = Math.min(s.viewport.h - 40, Math.max(40, p.y));
      if (!held) { await hands.move(x, y); await hands.mouseDown(); held = true; }
      else await hands.move(x, y, { precise: true });
      await sleep(rng.between(250, 600));
    }
    log('pilot: timed out'); return false;
  } finally { if (held) await hands.mouseUp(); }
}

/** Fly to `target` and land; resolves once standing on it. */
export async function travelTo(bot, target) {
  const { game, note, log } = bot;
  const s = await game.snap(); if (s.planet === target) return 'already there';
  const how = await launch(bot, target); if (!how) return 'could not launch';
  await game.waitFor(n => (n.space || n.planet === target) && n, { timeout: 20000 });
  const ok = await pilot(bot, target);
  const after = await game.waitFor(n => !n.space && n.planet === target && n.started && n, { timeout: 30000 });
  if (ok && after) { note(`landed on ${target}`, 'travel'); return `landed on ${target}`; }
  log('travel: did not land'); return 'did not land';
}

/** Back to Clover Village with the Home button (free, flies home by itself). */
export async function goHome(bot) {
  const { game, hands, note } = bot;
  if ((await game.snap()).planet === 'home') return 'home';
  const button = bot.page.locator('[data-action="return-home"]:visible').first();
  if (!await button.count()) return 'no home button';
  await hands.think(400); await hands.clickElement(button);
  const s = await game.waitFor(n => n.planet === 'home' && !n.space && n.started && n, { timeout: 90000, every: 400 });
  if (s) note('flew home', 'travel');
  return s ? 'home' : 'still away';
}
