import type { Inventory } from './content.ts';

/**
 * Story chapters 8–20: the long climb from level 40 to 100 and beyond. Each chapter mixes seven goals
 * from different parts of the game (so a day of play touches the garden, the wilds, the pond, space and
 * the forge), then waits for a level. Targets grow with the chapter. Titles are English templates with
 * the number filled in; the locale catalogs translate them through their "{count}" templates.
 */
type Goal = { title: string; event?: string; condition?: string; icon: string; target: (c: number) => number };
const GOALS: Record<string, Goal> = {
  kill: { title: 'Defeat {count} creatures', event: 'kill', icon: '⚔️', target: c => 300 + 150 * c },
  boss: { title: 'Defeat {count} bosses', event: 'boss', icon: '👑', target: c => 5 + 2 * c },
  titan: { title: 'Defeat {count} Titans', event: 'titan', icon: '🗿', target: c => 2 + c },
  harvest: { title: 'Harvest {count} crops', event: 'harvest', icon: '🌾', target: c => 150 + 75 * c },
  cook: { title: 'Cook {count} meals', event: 'cook', icon: '🔥', target: c => 40 + 20 * c },
  order: { title: 'Deliver {count} village orders', event: 'order', icon: '📦', target: c => 8 + 4 * c },
  fish: { title: 'Catch {count} fish', event: 'fish', icon: '🎣', target: c => 30 + 15 * c },
  rare: { title: 'Catch {count} rare fish', event: 'fishrare', icon: '🐠', target: c => 3 + c },
  mystery: { title: 'Reel in {count} mysterious shadows', event: 'mystery', icon: '❓', target: c => 2 + c },
  stardust: { title: 'Collect {count} stardust', event: 'stardust', icon: '✨', target: c => 150 + 75 * c },
  mine: { title: 'Mine {count} deposits', event: 'mine', icon: '⛏️', target: c => 25 + 12 * c },
  forgeOk: { title: 'Succeed at forging {count} times', event: 'forgeOk', icon: '⚒️', target: c => 2 + c },
  animal: { title: 'Collect {count} animal products', event: 'animal', icon: '🥚', target: c => 80 + 40 * c },
  hourly: { title: 'Open {count} hourly chests', event: 'hourChest', icon: '🎁', target: c => 4 + 2 * c },
  bounty: { title: 'Complete {count} bounties', event: 'bounty', icon: '🎯', target: c => 4 + 2 * c },
  chal: { title: 'Win {count} quick challenges', event: 'chal', icon: '⏱️', target: c => 4 + 2 * c },
  beds: { title: 'Own {count} garden beds', condition: 'beds', icon: '🌱', target: c => Math.min(33, 13 + 2 * c) },
  forgeMax: { title: 'Forge a weapon to +{count}', condition: 'forgeMax', icon: '⚒️', target: c => Math.min(15, 9 + Math.floor(c / 2)) },
  upgrades: { title: 'Reach {count} crystal upgrades', condition: 'upgrades', icon: '💎', target: c => 12 + 5 * c },
  species: { title: 'Discover {count} kinds of fish', condition: 'fishSpecies', icon: '🐟', target: c => Math.min(20, 8 + 2 * c) },
  stars: { title: 'Earn {count} planet stars', condition: 'stars', icon: '🌟', target: c => Math.min(81, 2 + 5 * c) },
  collections: { title: 'Complete {count} collections', condition: 'collections', icon: '📚', target: c => Math.min(6, 1 + Math.floor(c / 2)) },
};
/** Seven goals per chapter, each from a different part of the game. */
const PLANS = [
  ['kill', 'harvest', 'order', 'fish', 'beds', 'upgrades', 'hourly'],
  ['boss', 'cook', 'mystery', 'mine', 'animal', 'stars', 'forgeMax'],
  ['kill', 'titan', 'harvest', 'stardust', 'bounty', 'species', 'rare'],
  ['order', 'fish', 'forgeOk', 'animal', 'hourly', 'beds', 'upgrades'],
  ['boss', 'harvest', 'cook', 'mystery', 'mine', 'collections', 'bounty'],
  ['kill', 'titan', 'order', 'rare', 'stardust', 'forgeMax', 'stars'],
  ['harvest', 'fish', 'forgeOk', 'animal', 'hourly', 'species', 'upgrades'],
  ['boss', 'cook', 'order', 'mystery', 'mine', 'beds', 'bounty'],
  ['kill', 'titan', 'rare', 'stardust', 'forgeOk', 'forgeMax', 'collections'],
  ['harvest', 'order', 'fish', 'animal', 'hourly', 'stars', 'species'],
  ['boss', 'titan', 'cook', 'mystery', 'mine', 'upgrades', 'bounty'],
  ['kill', 'order', 'rare', 'stars', 'forgeOk', 'forgeMax', 'hourly'],
] as const;
const CHAPTER_REWARDS: Inventory[] = [
  { starshard: 3, seed_star: 3 }, { moonstone: 1, spore: 5 }, { thunderstone: 2, starshard: 3 }, { seed_star: 4, moonstone: 1 },
  { starshard: 4, spore: 6 }, { moonstone: 2, thunderstone: 2 }, { seed_star: 5, starshard: 4 }, { moonstone: 2, spore: 8 },
  { thunderstone: 3, starshard: 5 }, { seed_star: 6, moonstone: 2 }, { starshard: 6, thunderstone: 3 }, { moonstone: 3, seed_star: 6, starshard: 6 },
];

export interface StoryStepDef { title: string; event?: string; condition?: string; target: number; chapter: number; icon: string; end?: Inventory }

const step = (key: keyof typeof GOALS, c: number, chapter: number): StoryStepDef => {
  const g = GOALS[key], target = g.target(c);
  return { title: g.title.replace('{count}', String(target)), ...(g.event ? { event: g.event } : { condition: g.condition }), target, chapter, icon: g.icon };
};

/** Chapters 8–19 (array chapter 7–18) end at levels 45…100; chapter 20 is the legend's final list. */
export function lateStory(): StoryStepDef[] {
  const steps: StoryStepDef[] = [];
  PLANS.forEach((plan, c) => {
    const chapter = 7 + c;
    for (const key of plan) steps.push(step(key, c, chapter));
    steps.push({ title: `Reach level ${45 + 5 * c}`, condition: 'level', target: 45 + 5 * c, chapter, icon: '⭐', end: CHAPTER_REWARDS[c] });
  });
  const legend = 19;
  steps.push(
    { ...step('forgeMax', 99, legend), title: 'Forge a weapon to +15', target: 15 },
    { ...step('collections', 99, legend), title: 'Complete 6 collections', target: 6 },
    { ...step('beds', 99, legend), title: 'Own 33 garden beds', target: 33 },
    { ...step('titan', 48, legend) },
    { ...step('order', 73, legend) },
    { ...step('upgrades', 10, legend) },
    { title: 'Catch 10 legendary fish', event: 'legendFish', target: 10, chapter: legend, icon: '🐋' },
    { ...step('hourly', 48, legend), end: { moonstone: 5, thunderstone: 5, starshard: 10, seed_star: 10 } },
  );
  return steps;
}
