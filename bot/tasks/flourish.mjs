// The small things people do between tasks: zoom the camera, glance at the map, the journal or the
// backpack, then carry on. None of it changes the game; it makes a recording look lived-in.
import { sleep } from '../lib/util.mjs';

export async function flourish(bot) {
  const { game, hands, rng } = bot;
  const s = await game.snap(), { w, h } = s.viewport;
  const kind = rng.pick(['zoom', 'zoom', 'map', 'journal', 'bag', 'look']);
  if (kind === 'zoom') {
    // Scroll in for a closer look, then back out a little later.
    await hands.move(w * rng.between(.35, .65), h * rng.between(.35, .6));
    const amount = rng.between(120, 360) * (rng.chance(.5) ? 1 : -1);
    for (let i = 0; i < 3; i++) { await hands.wheel(amount / 3); await sleep(rng.between(60, 140)); }
    await sleep(rng.between(2500, 6000));
    for (let i = 0; i < 3; i++) { await hands.wheel(-amount / 3 * rng.between(.7, 1)); await sleep(rng.between(60, 140)); }
    return 'zoomed the camera';
  }
  if (kind === 'look') { for (let i = 0; i < rng.int(2, 4); i++) { await hands.fidget(w, h); await sleep(rng.between(400, 1200)); } return 'looked around'; }
  const key = { map: 'm', journal: 'j', bag: 'i' }[kind];
  await hands.think(300); await hands.press(key);
  await sleep(rng.between(1800, 4200));
  // Skim the panel: move over a few of its entries before closing it.
  const items = bot.page.locator('#dialog button:visible');
  const n = await items.count();
  for (let i = 0; i < Math.min(n, rng.int(1, 3)); i++) {
    const box = await items.nth(rng.int(0, n - 1)).boundingBox().catch(() => null);
    if (box) { await hands.move(box.x + box.width / 2, box.y + box.height / 2); await sleep(rng.between(400, 1100)); }
  }
  await game.closePanel();
  return `glanced at the ${kind}`;
}
