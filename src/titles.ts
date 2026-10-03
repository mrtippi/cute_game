import { CHAPTERS } from './story.ts';
import { FRIEND_CHAINS, LEVEL_TITLES, COLLECTION_TITLES, FISH_LOG_TITLES } from './side-stories.ts';
import { starsEarned, titansAtTier, type TierHolder } from './planet-tiers.ts';

/**
 * Titles: every name a player can earn, its rarity colour, and those earned by long-term and co-op play.
 * The worn title shows under the name on the HUD and above the explorer (main.ts); the attic's title board
 * and the character panel choose it. Rarity: bronze (early level marks), silver (friends, first fish pages,
 * habits, co-op), gold (story, collections, mastery), rainbow (the three crowning titles).
 */
export type Rarity = 'bronze' | 'silver' | 'gold' | 'rainbow';
export const RARITY_ORDER: Rarity[] = ['bronze', 'silver', 'gold', 'rainbow'];

/** Earned from play itself: checked whenever progress refreshes. */
interface EarnState extends TierHolder {
  forge?: Record<string, number>;
  progression: { totals: Record<string, number>; login: { streak: number }; bestStreak: number };
}
export const EARNED_TITLES: { title: string; rarity: Rarity; hint: string; done: (s: EarnState) => boolean }[] = [
  { title: 'Boss Hunter', rarity: 'gold', hint: 'Defeat 100 bosses', done: s => (s.progression.totals.boss ?? 0) >= 100 },
  { title: 'Village Courier', rarity: 'silver', hint: 'Deliver 1000 village orders', done: s => (s.progression.totals.order ?? 0) >= 1000 },
  { title: 'Legendary Smith', rarity: 'gold', hint: 'Forge a weapon to +15', done: s => Math.max(0, ...Object.values(s.forge ?? {})) >= 15 },
  { title: 'Ruler of the Stars', rarity: 'rainbow', hint: 'Earn all 81 planet stars', done: s => starsEarned(s) >= 81 },
  { title: 'Everyday Adventurer', rarity: 'silver', hint: 'Check in 30 days in a row', done: s => s.progression.login.streak >= 30 },
  { title: 'Titan Conqueror', rarity: 'gold', hint: 'Defeat a Titan on ★10', done: s => titansAtTier(s, 10) >= 1 },
  { title: 'Master Merchant', rarity: 'gold', hint: 'Earn 100000 energy at the market', done: s => (s.progression.totals.sell ?? 0) >= 100000 },
  { title: 'Challenge Champion', rarity: 'gold', hint: 'Win 12 quick challenges in a row', done: s => s.progression.bestStreak >= 12 },
  // Online co-op: these totals are recorded only by the server (progression.ts, recordCoopDefeat / recordGardenVisit).
  { title: 'Welcome Guest', rarity: 'bronze', hint: "Visit friends' gardens 10 times online", done: s => (s.progression.totals.gardenVisit ?? 0) >= 10 },
  { title: 'Trusted Companion', rarity: 'silver', hint: 'Defeat 10 bosses together online', done: s => (s.progression.totals.coopBoss ?? 0) >= 10 },
  { title: 'Party Leader', rarity: 'gold', hint: 'Defeat 50 bosses together online', done: s => (s.progression.totals.coopBoss ?? 0) >= 50 },
];

/** Every title with its rarity, in the order the title board lists them. */
export const TITLES: Record<string, Rarity> = {
  ...Object.fromEntries(Object.entries(LEVEL_TITLES).map(([level, title]) => [title, Number(level) >= 100 ? 'rainbow' : Number(level) >= 60 ? 'silver' : 'bronze'])),
  ...Object.fromEntries(FRIEND_CHAINS.map(c => [c.title!, 'silver'])),
  ...Object.fromEntries(FISH_LOG_TITLES.map((title, i) => [title, i < 2 ? 'silver' : 'gold'])),
  ...Object.fromEntries(CHAPTERS.flatMap(c => c.reward.title ? [[c.reward.title, c.reward.title === 'Keeper of the Starlight' ? 'rainbow' : 'gold']] : [])),
  ...Object.fromEntries(Object.values(COLLECTION_TITLES).map(title => [title, 'gold'])),
  ...Object.fromEntries(EARNED_TITLES.map(e => [e.title, e.rarity])),
} as Record<string, Rarity>;
export const rarityOf = (title: string): Rarity => TITLES[title] ?? 'bronze';
export const isTitle = (title: unknown): title is string => typeof title === 'string' && Object.hasOwn(TITLES, title);

/** Titles from long-term play not yet held: returns the new ones (added to `titles`). */
export function earnTitles(s: EarnState, titles: string[]) {
  const fresh = EARNED_TITLES.filter(e => !titles.includes(e.title) && e.done(s)).map(e => e.title);
  titles.push(...fresh); return fresh;
}

/** How a title is earned, for the title board's locked rows (English templates; params filled by the caller). */
export function titleHint(title: string): [string, Record<string, string | number>] {
  const earned = EARNED_TITLES.find(e => e.title === title); if (earned) return [earned.hint, {}];
  const level = Object.entries(LEVEL_TITLES).find(([, v]) => v === title)?.[0]; if (level) return ['Reach level {level}', { level }];
  if (FRIEND_CHAINS.some(c => c.title === title)) return ["Finish a friend's side story", {}];
  if (FISH_LOG_TITLES.includes(title)) return ['Fill a page of the fish log', {}];
  if (Object.values(COLLECTION_TITLES).includes(title)) return ['Complete a collection', {}];
  return ['Follow the main story', {}];
}
