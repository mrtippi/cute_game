// What the bot can see and do in Zoo Garden. Reading goes through window.__zg (src/bot-bridge.ts);
// doing always goes through Hands, i.e. real pointer and keyboard input on the page.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class Game {
  constructor(page, hands, rng, log) { this.page = page; this.hands = hands; this.rng = rng; this.log = log; }

  snap() { return this.page.evaluate(() => window.__zg.snapshot()); }
  quests() { return this.page.evaluate(() => window.__zg.quests()); }
  project(x, z, y = 0) { return this.page.evaluate(([x, z, y]) => window.__zg.project(x, z, y), [x, z, y]); }
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
    if (point.x < 70 || point.x > w - 70 || point.y < 90 || point.y > h - 90) return false;
    return this.worldAt(point.x, point.y);
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
    const dx = x - s.player.x, dz = z - s.player.z, d = Math.hypot(dx, dz) || 1;
    for (const len of [this.rng.between(6, 10), 4.5, 2.5]) for (const turn of [0, .35, -.35, .7, -.7]) {
      const a = Math.atan2(dz, dx) + turn, l = Math.min(len, d);
      const px = s.player.x + Math.cos(a) * l, pz = s.player.z + Math.sin(a) * l;
      const p = await this.project(px, pz);
      if (await this.safe(p, s)) { await this.hands.click(p.x, p.y); return true; }
    }
    return false;
  }

  /**
   * Walk to an entity and use it (open its panel, attack it, cast into it…). `find` picks the target from a
   * snapshot. Resolves with the latest snapshot once `done(s)` holds, or null when it could not get there.
   */
  async goTo(find, { done, timeout = 60000, label = 'target' } = {}) {
    const end = Date.now() + timeout; let tries = 0;
    while (Date.now() < end) {
      const s = await this.snap();
      if (s.modal || s.dialog) { if (done?.(s)) return s; await this.closePanel(); continue; }
      const e = find(s); if (!e) { this.log?.('goTo: no ' + label); return null; }
      if (done?.(s, e)) return s;
      const screen = e.screen ?? await this.project(e.x, e.z, .6);
      if (e.d < 40 && await this.safe(screen, s)) {
        await this.hands.click(screen.x, screen.y);
        const reached = await this.waitFor(n => {
          if (done?.(n, find(n))) return n;
          const t = find(n); return !n.player.moving && t && t.d <= t.r + 3 ? n : null;
        }, { timeout: Math.min(25000, 3000 + e.d * 700) });
        if (reached && done?.(reached, find(reached))) return reached;
        if (++tries > 6) { this.log?.('goTo: gave up on ' + label); return null; }
      } else {
        if (!await this.stepToward(e.x, e.z, s)) { await this.hands.wheel(this.rng.between(150, 300)); await sleep(300); }
        await this.waitFor(n => !n.player.moving && n, { timeout: 4000, every: 200 });
      }
    }
    return null;
  }
}
