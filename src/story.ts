import type { Inventory } from './content.ts';

/**
 * 星灯りの村 — the story (docs/story-design.md). The Wishing Crystal is fading; its light holds the village fence.
 * Nine Titans swallowed the stars' light and three friends were caged by bosses. Lumi, the crystal spirit, guides the
 * explorer through five arcs and twenty chapters; each arc ends by brightening the crystal (the village grows).
 *
 * Text is English source; vi/ja live in locales/*-story.ts. Goals reuse the existing quest events and conditions.
 */
export interface StoryLine { who: 'lumi' | 'sprout' | 'pepper' | 'clover'; text: string }
export interface ChapterReward { items?: Inventory; villageRank?: number; title?: string }
export interface StoryGoal { title: string; event?: string; condition?: string; target: number; icon: string }
export interface Chapter { title: string; arc: number; intro: StoryLine[]; outro: StoryLine[]; reward: ChapterReward; goals: StoryGoal[] }

const ev = (title: string, event: string, target: number, icon: string): StoryGoal => ({ title, event, target, icon });
const is = (title: string, condition: string, target: number, icon: string): StoryGoal => ({ title, condition, target, icon });
const lumi = (text: string): StoryLine => ({ who: 'lumi', text });

export const ARCS = ['A Little Light', 'Out to the Sea of Stars', 'Nine Shadows', 'Take Back the Stars', 'Keeper of the Starlight'];

export const CHAPTERS: Chapter[] = [
  // 一. 小さな灯り — Lumi wakes; the garden, the market, first fights; Sprout.
  { title: 'The Light Wakes', arc: 0,
    intro: [lumi('…Can you hear me? I am Lumi, the spirit of the Wishing Crystal.'), lumi('My light is growing weak. If it goes out, the village fence will fall. Please, help me!')],
    outro: [lumi('You are a natural! The village feels a little warmer already.')],
    reward: { items: { seed_star: 1, potion: 2 } },
    goals: [ev('Harvest three crops', 'harvest', 3, '🌾'), ev('Earn 20 energy at the market', 'sell', 20, '🧺'), ev('Buy or craft one item', 'craft', 1, '🗡️'), is('Equip a weapon', 'equipped', 1, '✋'), ev('Defeat five creatures', 'kill', 5, '⚔️')] },
  { title: 'Village Life', arc: 0,
    intro: [lumi('The crystal answers when you care for the village. Will you help the neighbours too?')],
    outro: [lumi('Every meal, every fish, every little job… I can feel it all.')],
    reward: { items: { spore: 2, plot_kit: 1 } },
    goals: [ev('Buy a crystal upgrade', 'upgrade', 1, '💎'), ev('Catch two fish', 'fish', 2, '🎣'), ev('Use ten skills', 'skill', 10, '🌀'), ev('Cook three meals', 'cook', 3, '🔥'), is('Reach level 5', 'level', 5, '⭐')] },
  { title: 'Shadows in the Forest', arc: 0,
    intro: [lumi('Someone went into the Mushroom Forest looking for the lost light… my friend Sprout.'), lumi('Sprout has not come back. Please be careful out there.')],
    outro: [lumi('I can feel Sprout! Near the oldest tree of the forest…')],
    reward: { items: { seed_fire: 2, claw: 2 } },
    goals: [ev('Defeat 25 creatures', 'kill', 25, '⚔️'), is('Place another garden bed', 'plots', 1, '🌱'), ev('Deliver two village orders', 'order', 2, '📦'), ev('Defeat a boss', 'boss', 1, '👑'), is('Reach level 8', 'level', 8, '⭐')] },
  { title: 'Rescue Sprout', arc: 0,
    intro: [lumi('The Ancient Treant has locked Sprout in a cage! Defeat it and open the cage.')],
    outro: [{ who: 'sprout', text: 'You saved me! Deep in the forest I saw a huge shadow drinking the light of the stars…' }, lumi('Light is coming back! Look, the fence is moving outward…!')],
    reward: { villageRank: 2, title: 'Saviour of the Forest', items: { seed_star: 2, spore: 3 } },
    goals: [is('Defeat the Ancient Treant', 'boss:home:treant', 1, '🌳'), is('Rescue Sprout', 'friend:sprout', 1, '🌱'), ev('Harvest a fruit crop', 'fruit', 1, '🍎'), is('Reach level 12', 'level', 12, '⭐')] },

  // 二. 星の海へ — the starship, Toybox and Pepper; the pen and the forge; King Bear and Clover.
  { title: 'Out to the Sea of Stars', arc: 1,
    intro: [lumi('Sprout says the shadow came from the sky. The old starship can still fly!'), lumi('Pepper flew to Toybox Planet to look. She has not written since.')],
    outro: [lumi('Toybox Planet… I feel Pepper there, and something big guarding her.')],
    reward: { items: { starshard: 1, potion: 3 } },
    goals: [ev('Visit another planet', 'planet', 1, '🚀'), is('Discover two planets', 'visited', 2, '🔭'), ev('Mine five deposits', 'mine', 5, '⛏️'), ev('Collect 30 stardust', 'stardust', 30, '✨'), is('Reach level 15', 'level', 15, '⭐')] },
  { title: 'Rescue Pepper', arc: 1,
    intro: [lumi('A giant toy robot keeps Pepper in a cage. Toys should be for playing, not for this!')],
    outro: [{ who: 'pepper', text: 'Thank you! I will cook for the whole village. The robot was full of stolen starlight, you know.' }, lumi('Another light returns to me!')],
    reward: { title: 'Hero of Toybox', items: { seed_star: 2, honey: 3 } },
    goals: [is('Defeat the Giant Toy Robot', 'boss:toy:robot', 1, '🤖'), is('Rescue Pepper', 'friend:pepper', 1, '🌶️'), ev('Cook ten meals', 'cook', 10, '🔥'), is('Reach level 20', 'level', 20, '⭐')] },
  { title: 'Pasture and Forge', arc: 1,
    intro: [lumi('Clover went after the biggest shadow of all, King Bear. To help her, you must grow strong.')],
    outro: [lumi('Your weapon shines like a little star. You are ready.')],
    reward: { items: { starshard: 2, moonstone: 1 } },
    goals: [is('Build the animal pen', 'pen', 1, '🐔'), is('Raise three animals', 'animals', 3, '🐄'), ev('Collect ten animal products', 'animal', 10, '🥚'), ev('Try weapon forging three times', 'forge', 3, '🔨'), is('Forge a weapon to +3', 'forgeMax', 3, '⚒️'), is('Reach level 28', 'level', 28, '⭐')] },
  { title: 'Showdown with King Bear', arc: 1,
    intro: [lumi('King Bear guards Clover in the red canyon. Its claws shake the ground. Stay out of the red circles!')],
    outro: [{ who: 'clover', text: 'You beat King Bear! The animals and I will take care of everything at home.' }, lumi('Three friends home, and my light grows again… The village is growing!')],
    reward: { villageRank: 3, title: 'Bear Breaker', items: { starshard: 3, moonstone: 1, thunderstone: 2 } },
    goals: [is('Own a weapon with 30 attack', 'weaponAttack', 30, '🗡️'), is('Reach 12 crystal upgrades', 'upgrades', 12, '💎'), is('Defeat King Bear', 'boss:home:bear', 1, '🐻'), is('Rescue Clover', 'friend:clover', 1, '🍀'), is('Reach level 45', 'level', 45, '⭐')] },

  // 三. 九つの影 — the Titans revealed; the first five; ★3 worlds.
  { title: 'Nine Shadows', arc: 2,
    intro: [lumi('Now I understand. Nine Titans swallowed the light of the stars, one on every world.'), lumi('The first sleeps near our own village: the Ancient Mountain Turtle.')],
    outro: [lumi('A whole star of light! I have never felt so warm.')],
    reward: { title: 'Titan Hunter', items: { moonstone: 2, seed_star: 3 } },
    goals: [is('Defeat your first Titan', 'titans', 1, '🗿'), is('Discover five planets', 'visited', 5, '🔭'), is('Earn 2 planet stars', 'stars', 2, '🌟'), is('Reach level 50', 'level', 50, '⭐')] },
  { title: "The Candy World's Sorrow", arc: 2,
    intro: [lumi('On the Candy Planet everything has lost its sweetness. A three-headed Titan is to blame.')],
    outro: [lumi('The sweetness is back! The children of the Candy Planet send their thanks.')],
    reward: { items: { starshard: 3, honey: 4 } },
    goals: [is('Defeat two different Titans', 'titans', 2, '🗿'), ev('Deliver 20 village orders', 'order', 20, '📦'), is('Earn 4 planet stars', 'stars', 4, '🌟'), is('Reach level 55', 'level', 55, '⭐')] },
  { title: 'Ice and Fire', arc: 2,
    intro: [lumi('The frost and volcano worlds are shaking. Their Titans are waking up.')],
    outro: [lumi('Ice and fire, both shining for us now.')],
    reward: { items: { thunderstone: 3, moonstone: 1 } },
    goals: [is('Defeat three different Titans', 'titans', 3, '🗿'), is('Forge a weapon to +6', 'forgeMax', 6, '⚒️'), is('Complete 1 collection', 'collections', 1, '📚'), is('Reach level 60', 'level', 60, '⭐')] },
  { title: 'The Light Returns', arc: 2,
    intro: [lumi('Two more shadows, and the crystal can wake fully for the first time in years.')],
    outro: [lumi('Look! The plaza is lit. Let us decorate it together.')],
    reward: { villageRank: 4, title: 'Bringer of Light', items: { moonstone: 2, starshard: 4 } },
    goals: [is('Defeat five different Titans', 'titans', 5, '🗿'), is('Earn 8 planet stars', 'stars', 8, '🌟'), ev('Open 10 hourly chests', 'hourChest', 10, '🎁'), is('Reach level 65', 'level', 65, '⭐')] },

  // 四. 星を取り戻せ — the last four Titans; Titans on ★5; forge +10; collections.
  { title: 'Take Back the Stars', arc: 3,
    intro: [lumi('Four Titans remain, and they have grown stronger by eating the light.')],
    outro: [lumi('Six stars shine again.')],
    reward: { items: { starshard: 4, seed_star: 4 } },
    goals: [is('Defeat six different Titans', 'titans', 6, '🗿'), is('Earn 12 planet stars', 'stars', 12, '🌟'), ev('Succeed at forging five times', 'forgeOk', 5, '⚒️'), is('Reach level 70', 'level', 70, '⭐')] },
  { title: 'The Deep Ocean', arc: 3,
    intro: [lumi('In the deepest sea, the Abyssal Kraken holds the light of the tides.')],
    outro: [lumi('The tides sing again. Seven stars!')],
    reward: { items: { moonstone: 2, thunderstone: 3 } },
    goals: [is('Defeat seven different Titans', 'titans', 7, '🗿'), ev('Catch 5 rare fish', 'fishrare', 5, '🐠'), is('Complete 2 collections', 'collections', 2, '📚'), is('Reach level 75', 'level', 75, '⭐')] },
  { title: 'Above the Clouds', arc: 3,
    intro: [lumi('High above the clouds swims a whale made of stolen starlight.')],
    outro: [lumi('Only one shadow left in the sky.')],
    reward: { items: { starshard: 5, moonstone: 2 } },
    goals: [is('Defeat eight different Titans', 'titans', 8, '🗿'), is('Forge a weapon to +10', 'forgeMax', 10, '⚒️'), is('Earn 18 planet stars', 'stars', 18, '🌟'), is('Reach level 80', 'level', 80, '⭐')] },
  { title: 'The Void Eye', arc: 3,
    intro: [lumi('The Night Planet hides the last Titan, the Void Eye. It watches everything.')],
    outro: [lumi('All nine stars are free! The village can grow as big as it dreams.')],
    reward: { villageRank: 5, title: 'Star Liberator', items: { moonstone: 3, thunderstone: 3, starshard: 5 } },
    goals: [is('Defeat all nine Titans', 'titans', 9, '👑'), is('Complete 3 collections', 'collections', 3, '📚'), is('Earn 24 planet stars', 'stars', 24, '🌟'), is('Reach level 85', 'level', 85, '⭐')] },

  // 五. 星灯りの守り人 — Titans on ★5 and ★8, worlds on ★8, forge +15; the star festival.
  { title: 'Brighter Stars', arc: 4,
    intro: [lumi('The Titans return on brighter stars, hungrier than before. Show them the village is not afraid!')],
    outro: [lumi('Three Titans beaten on bright stars. The crystal hums with joy.')],
    reward: { items: { moonstone: 3, seed_star: 5 } },
    goals: [is('Beat 3 Titans on ★5 or higher', 'titansAt5', 3, '🗿'), is('Earn 36 planet stars', 'stars', 36, '🌟'), is('Reach level 88', 'level', 88, '⭐')] },
  { title: 'The Titans Return', arc: 4,
    intro: [lumi('Every Titan must learn that the light belongs to everyone.')],
    outro: [lumi('All nine, on bright stars! You are becoming a legend.')],
    reward: { items: { thunderstone: 4, starshard: 6 } },
    goals: [is('Beat 9 Titans on ★5 or higher', 'titansAt5', 9, '🗿'), is('Complete 5 collections', 'collections', 5, '📚'), is('Reach level 92', 'level', 92, '⭐')] },
  { title: 'The Starforged Blade', arc: 4,
    intro: [lumi('The brightest light needs the strongest blade. Forge it to its limit.')],
    outro: [lumi('That blade shines like the crystal itself.')],
    reward: { items: { moonstone: 4, starshard: 8 } },
    goals: [is('Forge a weapon to +15', 'forgeMax', 15, '⚒️'), is('Beat 3 Titans on ★8 or higher', 'titansAt8', 3, '🗿'), is('Earn 54 planet stars', 'stars', 54, '🌟'), is('Reach level 96', 'level', 96, '⭐')] },
  { title: 'Keeper of the Starlight', arc: 4,
    intro: [lumi('One last step. Light every world, and the crystal will shine forever.')],
    outro: [lumi('The crystal is whole! Tonight, the whole village celebrates under the stars. Thank you, Keeper of the Starlight.')],
    reward: { title: 'Keeper of the Starlight', items: { moonstone: 5, thunderstone: 5, starshard: 10, seed_star: 10 } },
    goals: [is('Beat 9 Titans on ★8 or higher', 'titansAt8', 9, '👑'), is('Earn 63 planet stars', 'stars', 63, '🌟'), is('Complete 6 collections', 'collections', 6, '📚'), is('Reach level 100', 'level', 100, '⭐')] },
];

/** Steps in play order: each chapter's goals, the last one carrying the chapter's item reward. */
export function storySteps() {
  return CHAPTERS.flatMap((c, chapter) => c.goals.map((g, i) => ({ ...g, chapter, end: i === c.goals.length - 1 ? c.reward.items : undefined })));
}
/** The chapter a step belongs to and whether it closes it. */
export function chapterAt(index: number) {
  let first = 0;
  for (let c = 0; c < CHAPTERS.length; c++) { const n = CHAPTERS[c].goals.length; if (index < first + n) return { chapter: c, first, last: first + n - 1 }; first += n; }
  return null;
}
