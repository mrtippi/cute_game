import type { Inventory, PlanetId } from './content.ts';
import type { StoryLine } from './story.ts';

/**
 * Side stories (docs/story-design.md, delivery 3), shown in the journal's "Side stories" tab next to the main story:
 * - friend chains: five steps for each rescued friend (Sprout's orchard, Pepper's star dish, Clover's four animals);
 * - planet tales: three steps on each discovered world, counted only while the explorer is on that world;
 * - level gifts: a gift box every five levels, with a title at 20, 40, 60, 80 and 100;
 * - collection rewards: a title and a keepsake when a collection (or a page of the fish log) is complete.
 * Text is English source; vi/ja live in locales/*-side.ts.
 */
export interface SideStep { title: string; event?: string; condition?: string; target: number; icon: string; line?: StoryLine; reward?: Inventory }
export interface SideChain { id: string; name: string; icon: string; friend?: 'sprout' | 'pepper' | 'clover'; planet?: PlanetId; steps: SideStep[]; title?: string; keepsake?: Inventory }

const step = (title: string, key: string, target: number, icon: string, line?: StoryLine, reward?: Inventory): SideStep =>
  ({ title, ...(['beds', 'dog', 'animals', 'animalKinds', 'pen'].includes(key) ? { condition: key } : { event: key }), target, icon, line, reward });

export const FRIEND_CHAINS: SideChain[] = [
  { id: 'sprout', friend: 'sprout', name: "Sprout's Orchard", icon: '🌱', title: 'Friend of the Garden', keepsake: { deco_fruittree: 1, seed_star: 3 }, steps: [
    step('Harvest 20 crops', 'harvest', 20, '🌾', { who: 'sprout', text: 'The garden missed you! Shall we fill every bed again?' }, { seed_fire: 2 }),
    step('Fertilize 5 crops', 'fertilize', 5, '🧪', { who: 'sprout', text: 'A little fertilizer and the plants grow so much faster. Try it!' }, { manure: 3 }),
    step('Harvest 5 fruit', 'fruit', 5, '🍎', { who: 'sprout', text: 'Fruit trees are my favourite. They give and give, every single day.' }, { seed_star: 2 }),
    step('Own 15 garden beds', 'beds', 15, '🌱', { who: 'sprout', text: 'More beds, more seeds, more smiles! Let us make the garden bigger.' }, { plot_kit: 1 }),
    step('Harvest 100 crops', 'harvest', 100, '🌻', { who: 'sprout', text: 'One last big harvest. Then this garden will be the best in the stars!' }),
  ] },
  { id: 'pepper', friend: 'pepper', name: "Pepper's Star Dish", icon: '🌶️', title: 'Star Chef', keepsake: { deco_table: 1, honey: 4 }, steps: [
    step('Cook 10 meals', 'cook', 10, '🔥', { who: 'pepper', text: 'I want to cook a dish that shines like a star. First, let us warm up the kitchen!' }, { honey: 2 }),
    step('Catch 10 fish', 'fish', 10, '🎣', { who: 'pepper', text: 'Fresh fish makes everything better. Will you bring me some?' }, { worm: 5 }),
    step('Eat 5 foods with bonus effects', 'eat', 5, '🍽️', { who: 'pepper', text: 'Taste-testing is important work! Eat a few special dishes for me.' }, { potion: 2 }),
    step('Collect 50 stardust', 'stardust', 50, '✨', { who: 'pepper', text: 'The secret ingredient… is a pinch of stardust from space!' }, { starshard: 1 }),
    step('Cook 40 meals', 'cook', 40, '⭐', { who: 'pepper', text: 'Now we cook for the whole village. The star dish is almost ready!' }),
  ] },
  { id: 'clover', friend: 'clover', name: "Clover's Four Animals", icon: '🍀', title: "Rancher's Friend", keepsake: { deco_nest: 1, seed_star: 3 }, steps: [
    step('Raise 3 animals', 'animals', 3, '🐔', { who: 'clover', text: 'Animals make a farm feel like home. Let us start with a few.' }, { seed_ice: 2 }),
    step('Collect 20 animal products', 'animal', 20, '🥚', { who: 'clover', text: 'Eggs and milk every day! Do not forget to collect them.' }, { honey: 2 }),
    step('Adopt a guard dog', 'dog', 1, '🐶', { who: 'clover', text: 'A good dog keeps the whole pen safe. Every farm needs one!' }, { potion: 2 }),
    step('Raise four kinds of animals', 'animalKinds', 4, '🐄', { who: 'clover', text: 'Chickens, ducks, cows and pigs… I dream of a pen with all four!' }, { starshard: 1 }),
    step('Collect 100 animal products', 'animal', 100, '🧺', { who: 'clover', text: 'The pen is full of life. One more big collection and we are real ranchers!' }),
  ] },
];

/** Planet tales: three steps on each world (creatures, its own activity, its bosses), told by Lumi. */
type TaleSpec = [PlanetId, string, [string, string], [string, number], StoryLine['text'], Inventory];
const TALES: TaleSpec[] = [
  ['home', 'The Old Village', ['Defeat {count} creatures in Clover Village', 'kill'], ['fish', 5], 'Long ago this village was a single garden bed. Let us learn its old paths again.', { deco_owlstatue: 1 }],
  ['candy', 'Sugar Hills', ['Defeat {count} creatures on Candy Planet', 'kill'], ['mine', 6], 'The Candy Planet hides sweets in its crystals. Can you find them?', { honey: 4, starshard: 1 }],
  ['ice', 'Frozen Echoes', ['Defeat {count} creatures on Frost Planet', 'kill'], ['mine', 6], 'On the Frost Planet the wind sings old songs. Listen, and dig where it is loudest.', { seed_ice: 4, starshard: 1 }],
  ['lava', 'Heart of Fire', ['Defeat {count} creatures on Volcano Planet', 'kill'], ['mine', 6], 'The Volcano Planet is angry, but its crystals glow warm. Be brave!', { deco_lamp: 1 }],
  ['toy', 'The Toy Parade', ['Defeat {count} creatures on Toybox Planet', 'kill'], ['mine', 6], 'The toys of Toybox Planet used to hold a parade every night. Help them remember!', { deco_musicbox: 1 }],
  ['jungle', 'Green Whispers', ['Defeat {count} creatures in Wild Jungle', 'kill'], ['mine', 6], 'The Wild Jungle grows a little every night. Even the trees are curious about you.', { deco_totem: 1 }],
  ['ocean', 'Song of the Tides', ['Defeat {count} creatures on Ocean Planet', 'kill'], ['fish', 8], 'The Ocean Planet sings with the tides. Its fish know every song.', { deco_shell: 1 }],
  ['cloud', 'Islands in the Sky', ['Defeat {count} creatures on Cloud Islands', 'kill'], ['mine', 6], 'The Cloud Islands float on dreams. Watch your step at the edges!', { deco_windchime: 1 }],
  ['shadow', 'Lanterns in the Night', ['Defeat {count} creatures on Night Planet', 'kill'], ['mine', 6], 'The Night Planet is dark, but every lantern you light makes it a little kinder.', { deco_ghostlantern: 1 }],
];
const ACTIVITY: Record<string, [string, string]> = { mine: ['Mine {count} deposits on {planet}', '⛏️'], fish: ['Catch {count} fish on {planet}', '🎣'] };
export const PLANET_TALES: SideChain[] = TALES.map(([planet, name, [killTitle], [activity, count], line, keepsake]) => ({
  id: planet, planet, name, icon: '📜', keepsake, steps: [
    { title: killTitle.replace('{count}', '20'), event: 'kill', target: 20, icon: '⚔️', line: { who: 'lumi', text: line } },
    { title: ACTIVITY[activity][0], event: activity, target: count, icon: ACTIVITY[activity][1] },
    { title: 'Defeat a boss on {planet}', event: 'boss', target: 1, icon: '👑' },
  ],
}));

/** Level gifts every five levels; titles at 20, 40, 60, 80 and 100. */
export const LEVEL_GIFT_STEP = 5;
export const LEVEL_TITLES: Record<number, string> = { 20: 'Seasoned Explorer', 40: 'Veteran Explorer', 60: 'Elite Explorer', 80: 'Master Explorer', 100: 'Legend of the Stars' };
const GIFT_ITEMS: Inventory[] = [{ potion: 2, seed_fire: 2 }, { spore: 3, honey: 2 }, { seed_star: 2, starshard: 1 }, { manure: 4, seed_ice: 2 }, { moonstone: 1, potion: 3 }];
export function levelGift(level: number): { items: Inventory; title?: string } {
  const big = level % 20 === 0, items: Inventory = { ...GIFT_ITEMS[(level / LEVEL_GIFT_STEP) % GIFT_ITEMS.length] };
  if (big) { items.starshard = (items.starshard ?? 0) + 2; items.moonstone = (items.moonstone ?? 0) + 1; }
  return { items, title: LEVEL_TITLES[level] };
}

/** Collections: a title and a keepsake for each completed set; the fish log has pages at 6, 12 and every species. */
export const COLLECTION_TITLES: Record<string, string> = { toy: 'Toy Collector', jungle: 'Jungle Collector', ocean: 'Ocean Collector', sky: 'Sky Collector', dark: 'Night Collector', lava: 'Volcano Collector' };
export const COLLECTION_KEEPSAKES: Record<string, Inventory> = { toy: { deco_teddy: 1 }, jungle: { deco_rafflesia: 1 }, ocean: { deco_aquarium: 1 }, sky: { deco_rainbow: 1 }, dark: { deco_nightcrystal: 1 }, lava: { deco_trophy: 1 } };
export const FISH_LOG_PAGES = [6, 12, 0] as const;   // 0: every species
export const FISH_LOG_TITLES = ['Junior Angler', 'Fish Scholar', 'Master of the Fish Log'];

/** Every title a save may hold besides the story's (progression.ts checks titles against this list). */
export const SIDE_TITLES = [...FRIEND_CHAINS.map(c => c.title!), ...Object.values(LEVEL_TITLES), ...Object.values(COLLECTION_TITLES), ...FISH_LOG_TITLES];
