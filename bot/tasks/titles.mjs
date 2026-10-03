// Titles (src/titles.ts): the bot wears one that suits the clip's theme, and after a new title it walks to the
// memory room behind the study (level 65) to look at the trophy and pin the title on the board, like a proud player.
import { leaveHouse } from './combat.mjs';
import { sleep } from '../lib/util.mjs';

/** Preferred titles per clip theme (bot/tasks/wardrobe.mjs THEMES), best first; otherwise the rarest held. */
export const TITLE_THEMES = {
  fishing: ['Lord of the Sea', 'Master of the Fish Log', 'Fish Scholar', 'Junior Angler', 'Ocean Collector'],
  combat: ['Bane of Bosses', 'Titan Conqueror', 'Legendary Hunter', 'Boss Hunter', 'Bear Breaker', 'Titan Hunter', 'Saviour of the Forest', 'Gale Traveller'],
  space: ['Ruler of the Stars', 'Star Liberator', 'Bringer of Light', 'Sky Collector', 'Night Collector'],
  farm: ['Millionaire Farmer', 'Tycoon', "Rancher's Friend", 'Friend of the Garden', 'Master Merchant', 'Village Courier'],
  cozy: ['Kitchen Wizard', 'Star Chef', 'Friend of the Garden', 'Everyday Adventurer', 'Hungry Explorer', 'Toy Collector'],
  explore: ['Legend of the Stars', 'Master Explorer', 'Elite Explorer', 'Veteran Explorer', 'Seasoned Explorer', 'Gale Traveller', 'Hard Worker', 'Jungle Collector'],
  festival: ['Keeper of the Starlight', "Everyone's Favourite", 'Challenge Champion', 'Hero of Toybox', 'Volcano Collector'],
  fancy: ['Former Server Champion', 'Keeper of the Starlight', 'Tycoon', 'Legend of the Stars', 'Ruler of the Stars', 'Legendary Smith'],
};
const RANK = { rainbow: 3, gold: 2, silver: 1, bronze: 0 };

/** The title to wear for a theme: the first held from its list, else the rarest held (newest among equals). */
export function titleFor(s, theme) {
  const held = s.titles ?? []; if (!held.length) return null;
  for (const title of TITLE_THEMES[theme] ?? []) if (held.includes(title)) return title;
  return [...held].reverse().sort((a, b) => (RANK[s.titleRarity?.[b]] ?? 0) - (RANK[s.titleRarity?.[a]] ?? 0))[0];
}

/** Wear the theme's title through the HUD title tag and the title board, like a player. */
export async function wearTitle(bot, theme) {
  const { game, note } = bot;
  const s = await game.snap(), want = titleFor(s, theme);
  if (!want || want === s.title) return 'title kept';
  if (s.modal) await game.closePanel();
  if (!await game.action('titles', { scope: '#hud' })) return 'no title tag';
  if (!await game.waitPanel('titles')) return 'title board did not open';
  const worn = await game.action('wear-title', { id: want });
  await bot.hands.think(600); await game.closePanel();
  if (worn) note(`wearing the title ${want}`, 'title');
  return worn ? `wearing ${want}` : 'could not wear';
}

/** Into the memory room: walk past the trophies, pin the title on the board, then go back out. */
export async function visitAttic(bot, theme) {
  const { game, rng, note } = bot;
  let s = await game.snap();
  if (!game.indoors(s)) {
    const home = await game.goTo(n => n.entities.find(e => e.kind === 'home'), { label: 'cottage', done: n => game.indoors(n) && n, timeout: 40000 });
    if (!home) return 'cottage not reached';
  }
  if (!(await game.snap()).entities.some(e => e.kind === 'house-titleboard')) { await leaveHouse(bot); return 'memory room still locked'; }
  note('went into the memory room', 'title');
  // A slow look along the trophies.
  for (const [x, z] of rng.shuffle([[-2.5, -12], [0, -12.2], [2.5, -12]]).slice(0, 2)) {
    s = await game.snap(); await game.stepToward(x, z, s); await game.waitFor(n => !n.player.moving && n, { timeout: 6000, every: 250 }); await sleep(rng.between(1200, 2200));
  }
  const board = await game.goTo(n => n.entities.find(e => e.kind === 'house-titleboard'), { label: 'title board', done: n => n.modal === 'titles' && n, timeout: 20000 });
  if (board) { const want = titleFor(await game.snap(), theme); if (want) await game.action('wear-title', { id: want }); await bot.hands.think(900); await game.closePanel(); }
  bot.atticTitles = (await game.snap()).titles.length;
  await sleep(rng.between(800, 1400));
  await leaveHouse(bot);
  return 'visited the memory room';
}
