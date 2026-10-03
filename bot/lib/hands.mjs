// Mouse and keyboard the way a person uses them: curved, slightly uneven paths, reaction delays,
// the odd overshoot and correction. Every random choice comes from the session's seeded rng.
import { sleep } from './util.mjs';

export class Hands {
  constructor(page, rng, { speed = 1 } = {}) {
    this.page = page; this.rng = rng; this.speed = speed;
    this.x = 800; this.y = 450;
  }
  sleep(ms) { return sleep(ms / this.speed); }
  /** A short pause before acting: reading the screen, deciding. */
  think(median = 420) { return this.sleep(Math.min(4000, this.rng.logNormal(median, .5))); }

  async move(x, y, { precise = false } = {}) {
    const { rng } = this, dx = x - this.x, dy = y - this.y, distance = Math.hypot(dx, dy);
    if (distance < 2) return;
    // Fitts-like duration, then a cubic Bezier bowed to one side.
    const duration = (170 + 120 * Math.log2(1 + distance / 28)) * rng.between(.8, 1.25);
    const overshoot = !precise && distance > 280 && rng.chance(.14);
    const tx = overshoot ? x + dx * rng.between(.03, .07) + rng.normal(0, 4) : x, ty = overshoot ? y + dy * rng.between(.03, .07) + rng.normal(0, 4) : y;
    const bow = rng.normal(0, .16) * distance, nx = -dy / distance, ny = dx / distance;
    const c1 = { x: this.x + dx * rng.between(.2, .4) + nx * bow, y: this.y + dy * rng.between(.2, .4) + ny * bow };
    const c2 = { x: this.x + dx * rng.between(.6, .85) + nx * bow * .5, y: this.y + dy * rng.between(.6, .85) + ny * bow * .5 };
    const steps = Math.max(6, Math.round(duration / 16)), from = { x: this.x, y: this.y };
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, t = u < .5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2, k = 1 - t;
      const px = k ** 3 * from.x + 3 * k * k * t * c1.x + 3 * k * t * t * c2.x + t ** 3 * tx;
      const py = k ** 3 * from.y + 3 * k * k * t * c1.y + 3 * k * t * t * c2.y + t ** 3 * ty;
      await this.page.mouse.move(px, py); await this.sleep(duration / steps);
    }
    this.x = tx; this.y = ty;
    if (overshoot) { await this.sleep(rng.between(60, 160)); await this.move(x, y, { precise: true }); }
  }

  async click(x, y, { hold } = {}) {
    await this.move(x, y);
    await this.sleep(this.rng.between(40, 130));
    await this.page.mouse.down();
    await this.sleep(hold ?? this.rng.between(55, 115));
    await this.page.mouse.up();
  }

  /** Click a DOM element somewhere inside its middle, not dead centre every time. */
  async clickElement(locator) {
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    const box = await locator.boundingBox(); if (!box) throw new Error('element has no box');
    const x = box.x + box.width * this.rng.between(.3, .7), y = box.y + box.height * this.rng.between(.35, .65);
    await this.click(x, y);
  }

  async press(key, { hold } = {}) {
    await this.page.keyboard.down(key);
    await this.sleep(hold ?? this.rng.between(50, 120));
    await this.page.keyboard.up(key);
  }
  async down(key) { await this.page.keyboard.down(key); }
  async up(key) { await this.page.keyboard.up(key); }
  async mouseDown() { await this.page.mouse.down(); }
  async mouseUp() { await this.page.mouse.up(); }
  async wheel(deltaY) { await this.page.mouse.wheel(0, deltaY); }

  /** Idle hand movement while waiting, so the pointer is not frozen on screen. */
  async fidget(width, height) {
    const { rng } = this;
    const x = Math.min(width - 60, Math.max(60, this.x + rng.normal(0, 70))), y = Math.min(height - 60, Math.max(60, this.y + rng.normal(0, 50)));
    await this.move(x, y);
  }
}
