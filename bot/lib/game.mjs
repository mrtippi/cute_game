// What the bot can see and do in Zoo Garden. Reading goes through window.__zg (src/bot-bridge.ts);
// doing always goes through Hands, i.e. real pointer and keyboard input on the page.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class Game {
  constructor(page, hands, rng, log) { this.page = page; this.hands = hands; this.rng = rng; this.log = log; }

  /** Every loop reads the screen through snap(), so a task past its deadline stops at its next look. */
  snap() { if (this.deadline && Date.now() > this.deadline) { this.deadline = 0; throw new Error('task took too long'); } return this.page.evaluate(() => window.__zg.snapshot()); }
  quests() { return this.page.evaluate(() => window.__zg.quests()); }
  project(x, z, y = 0) { return this.page.evaluate(([x, z, y]) => window.__zg.project(x, z, y), [x, z, y]); }
  pick(x, y) { return this.page.evaluate(([x, y]) => window.__zg.pick(x, y), [x, y]); }
  /** A point on the target that a tap would really select: another thing in front (the rocket over a bed) is avoided. */
  async aimAt(e, s) {
    const base = e.screen ?? await this.project(e.x, e.z, .6);
    for (const [dx, dy] of [[0, 0], [0, 14], [-14, 6], [14, 6], [0, 26], [-24, 14], [24, 14]]) {
      const p = { x: base.x + dx, y: base.y + dy, visible: base.visible };
      if (await this.safe(p, s) && await this.pick(p.x, p.y) === e.id) return p;
    }
    return null;
  }
  saveJson() { return this.page.evaluate(() => window.__zg.save()); }

  async waitFor(check, { timeout = 8000, every = 150 } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const s = await this.snap(); const v = await check(s); if (v) return v; await sleep(every); }
    return null;
  }

  /** True when a click at (x, y) would land on the 3D world, not on the HUD or a panel. */
  worldAt(x, y) {
    return this.page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && el.tagName === 'CANVAS' && !!el.closest('#world'); }, [x, y]);
  }
  async safe(point, s) {
    if (!point?.visible) return false;
    const { w, h } = s.viewport;
    // A thin edge only: worldAt() already rejects the HUD, so places near the bottom (the cottage door) stay reachable.
    if (point.x < 30 || point.x > w - 30 || point.y < 30 || point.y > h - 30) return false;
    return this.worldAt(point.x, point.y);
  }

  /**
   * Tap the world at (x, y) only if it still selects `expect` (null: open ground) when the finger comes down.
   * The game reads a tap where the button is released, and while the explorer walks (or the camera eases after a
   * stop or the cottage door) the world slides under a still pointer: a spot checked before the pointer travelled
   * there could be the cottage by then, and a tap on it walks inside. So the check runs again with the pointer in
   * place, and while the view moves the cottage must also be clear of the spot by a margin. False: not tapped.
   */
  async tap(x, y, expect = null) {
    await this.hands.move(x, y);
    await this.hands.sleep(this.rng.between(40, 130));
    const clear = await this.page.evaluate(async ([x, y, expect]) => {
      const zg = window.__zg, before = zg.project(0, 0);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const el = document.elementFromPoint(x, y);
      if (!el || el.tagName !== 'CANVAS' || !el.closest('#world') || zg.pick(x, y) !== expect) return false;
      const s = zg.snapshot(), after = zg.project(0, 0), home = s.entities.find(e => e.kind === 'home')?.id;
      if (!home || home === expect || (!s.player.moving && Math.hypot(after.x - before.x, after.y - before.y) < 1)) return true;
      const ring = [30, 60].flatMap(r => [0, 1, 2, 3, 4, 5, 6, 7].map(i => [x + Math.cos(i * Math.PI / 4) * r, y + Math.sin(i * Math.PI / 4) * r]));
      return !ring.some(([px, py]) => zg.pick(px, py) === home);
    }, [x, y, expect]);
    if (!clear) return false;
    await this.hands.mouseDown();
    await this.hands.sleep(this.rng.between(55, 115));
    await this.hands.mouseUp();
    return true;
  }
  /**
   * The spot in front of the cottage door (2.5 m south of the cottage, src/house.ts HOUSE.outdoorDoor), outdoors at home
   * only. Walking within 1.45 m of it with the face turned north takes the explorer inside (src/house-ui.ts), with no
   * tap on the cottage at all; sliding round the cottage's front turns the face north on the way past.
   */
  doorSpot(s) { const home = s.planet === 'home' && !s.visit && s.entities.find(e => e.kind === 'home'); return home ? { x: home.x, z: home.z + 2.5, home } : null; }
  /** True when the game's walk to (x, z) would pass the cottage door (heading south, away from it, is fine). */
  async intoDoor(x, z, s) {
    // Going to the cottage on purpose (a rest) is not a mistake.
    const door = this.doorSpot(s); if (!door || Math.hypot(x - door.home.x, z - door.home.z) < 4) return false;
    return this.page.evaluate(([x, z, dx, dz, px, pz]) => {
      let from = { x: px, z: pz };
      for (const p of window.__zg.route(x, z)) {
        const vx = p.x - from.x, vz = p.z - from.z, len = Math.hypot(vx, vz);
        if (len > .01 && !(vz / len > .3 && Math.hypot(from.x - dx, from.z - dz) < 2.2)) {
          const t = Math.max(0, Math.min(1, ((dx - from.x) * vx + (dz - from.z) * vz) / (len * len)));
          if (Math.hypot(from.x + vx * t - dx, from.z + vz * t - dz) < 2) return true;
        }
        from = p;
      }
      return false;
    }, [x, z, door.x, door.z, s.player.x, s.player.z]).catch(() => false);
  }
  /** After a tap: the walk starts on a later frame, so wait for it to begin before waiting for it to end. */
  async settle(timeout = 4000) {
    await this.waitFor(n => n.player.moving && n, { timeout: 600, every: 100 });
    return this.waitFor(n => !n.player.moving && n, { timeout, every: 200 });
  }
  /** Inside the cottage only the door, wardrobe, mirror and friends can be tapped. */
  indoors(s) { return s.entities.some(e => e.kind === 'house-door'); }
  /** Out through the cottage door (a stray tap walked the explorer in): true once outside. */
  async stepOutside() {
    const door = n => n.entities.find(e => e.kind === 'house-door');
    await this.goTo(door, { label: 'cottage door', done: n => !this.indoors(n) && n, timeout: 30000 });
    return !this.indoors(await this.snap());
  }

  // ---- panels -------------------------------------------------------------------------------
  dialog() { return this.page.locator('#dialog'); }
  async panelOpen() { const s = await this.snap(); return s.modal || s.dialog ? s : null; }
  async waitPanel(type, timeout = 6000) { return this.waitFor(s => (type ? s.modal === type : s.modal) && s, { timeout }); }
  /** Click an enabled button in the open panel by its data-action and any other data-* values ({ item: 'radish' }). */
  async action(action, { nth = 0, scope = '#dialog', ...data } = {}) {
    let selector = `${scope} [data-action="${action}"]`;
    for (const [key, value] of Object.entries(data)) if (value !== undefined) selector += `[data-${key}="${value}"]`;
    const button = this.page.locator(selector + ':not([disabled])').nth(nth);
    if (!await button.count()) return false;
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await this.hands.think(300);
    await this.hands.clickElement(button);
    await sleep(this.rng.between(250, 500));
    return true;
  }
  async has(selector) { return (await this.page.locator(selector).count()) > 0; }
  async closePanel() {
    for (let i = 0; i < 3; i++) {
      const s = await this.snap(); if (!s.modal && !s.dialog) return true;
      if (s.modal === 'death') this.onFall?.();
      const close = this.page.locator('#dialog [data-action="close"], dialog[open] [data-action="close"], dialog[open] .social-close').first();
      if (await close.count() && await close.isVisible()) { await this.hands.think(250); await this.hands.clickElement(close); }
      else await this.hands.press('Escape');
      await sleep(400);
    }
    return !(await this.panelOpen());
  }

  // ---- moving around ------------------------------------------------------------------------
  /** One step across open ground toward (x, z); picks a nearby clear spot when the HUD is in the way. */
  async stepToward(x, z, s) {
    // Standing at the cottage door (just stepped out): a few steps south first, as any way on from here could turn in.
    const door = this.doorSpot(s);
    if (door && Math.hypot(s.player.x - door.x, s.player.z - door.z) < 2.2 && Math.hypot(x - door.home.x, z - door.home.z) >= 4) {
      for (const dx of [0, -1.5, 1.5]) {
        const p = await this.project(s.player.x + dx, s.player.z + 3);
        if (await this.safe(p, s) && await this.pick(p.x, p.y) === null && await this.tap(p.x, p.y)) return true;
      }
    }
    // Follow the game's own route (around fences, through the village gate): tap the furthest waypoint
    // within reach that is open ground, so the explorer never walks into a fence toward a straight-line goal.
    const route = await this.page.evaluate(([x, z]) => window.__zg.route(x, z), [x, z]).catch(() => []);
    if (route.length) {
      const reach = []; let walked = 0, from = s.player;
      for (const p of route) { walked += Math.hypot(p.x - from.x, p.z - from.z); from = p; if (walked > 14) break; reach.push(p); }
      for (const p of reach.reverse()) {
        const screen = await this.project(p.x, p.z);
        if (await this.safe(screen, s) && await this.pick(screen.x, screen.y) === null && !await this.intoDoor(p.x, p.z, s) && await this.tap(screen.x, screen.y)) return true;
      }
    }
    const dx = x - s.player.x, dz = z - s.player.z, d = Math.hypot(dx, dz) || 1;
    for (const len of [this.rng.between(6, 10), 4.5, 2.5]) for (const turn of [0, .35, -.35, .7, -.7]) {
      const a = Math.atan2(dz, dx) + turn, l = Math.min(len, d);
      const px = s.player.x + Math.cos(a) * l, pz = s.player.z + Math.sin(a) * l;
      const p = await this.project(px, pz);
      // Open ground only: a tap on the cottage would walk inside, a tap on a stall would open it (and so would a
      // walk past the cottage door).
      if (await this.safe(p, s) && await this.pick(p.x, p.y) === null && !await this.intoDoor(px, pz, s) && await this.tap(p.x, p.y)) return true;
    }
    return false;
  }

  /**
   * Walk to an entity and use it (open its panel, attack it, cast into it…). `find` picks the target from a
   * snapshot. Resolves with the latest snapshot once `done(s)` holds, or null when it could not get there.
   */
  async goTo(find, { done, timeout = 60000, label = 'target' } = {}) {
    const end = Date.now() + timeout; let tries = 0, outings = 0;
    while (Date.now() < end) {
      const s = await this.snap();
      if (s.modal || s.dialog) { if (done?.(s)) return s; await this.closePanel(); continue; }
      const e = find(s);
      // Walked into the cottage by mistake (the target is outdoors): out through the door, then on to the target.
      if (!e && this.indoors(s) && outings++ < 2) { this.log?.(`goTo: indoors on the way to ${label}, stepping out`); await this.stepOutside(); continue; }
      if (!e) { this.log?.('goTo: no ' + label); return null; }
      if (done?.(s, e)) return s;
      // Tapped directly only when the game's walk there keeps clear of the cottage door; else step around first.
      const k = (e.r + 1.1) / Math.max(e.d, .01), near = { x: e.x + (s.player.x - e.x) * k, z: e.z + (s.player.z - e.z) * k };
      const screen = e.d < 40 && !await this.intoDoor(near.x, near.z, s) ? await this.aimAt(e, s) : null;
      if (screen) {
        if (!await this.tap(screen.x, screen.y, e.id)) { await sleep(250); continue; }
        const reached = await this.waitFor(n => {
          if (done?.(n, find(n))) return n;
          const t = find(n); return !n.player.moving && t && t.d <= t.r + 3 ? n : null;
        }, { timeout: Math.min(25000, 3000 + e.d * 700) });
        if (reached && done?.(reached, find(reached))) return reached;
        if (++tries > 6) { this.log?.('goTo: gave up on ' + label); return null; }
      } else {
        if (!await this.stepToward(e.x, e.z, s)) { await this.hands.wheel(this.rng.between(150, 300)); await sleep(300); }
        await this.settle();
      }
    }
    return null;
  }
}
