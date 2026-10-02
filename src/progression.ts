import { t } from './i18n.ts';
import { ITEMS, PLANETS, COLLECTIONS, STORY_STEPS, type Inventory } from './content.ts';
import { addItem, gainXp, xpReward as xpNeeded, removeItem, looseQuantity, type SaveState } from './model.ts';
import { fillOrders, parseOrders, type OrdersState, type Order } from './orders.ts';
import { starsEarned, titansAtTier } from './planet-tiers.ts';
import { CHAPTERS, chapterAt } from './story.ts';
import { FRIEND_CHAINS, PLANET_TALES, LEVEL_GIFT_STEP, levelGift, COLLECTION_TITLES, COLLECTION_KEEPSAKES, FISH_LOG_PAGES, FISH_LOG_TITLES, SIDE_TITLES, type SideChain } from './side-stories.ts';
import { FISH } from './content.ts';
import { earnTitles, isTitle } from './titles.ts';
/** 2: 星灯りの村 (story.ts). */
export const STORY_VERSION = 2;
import { ENEMY_TYPES } from './enemy-types.ts';
export { STORY_STEPS } from './content.ts';
export type ProgressKind = 'story' | 'side' | 'hourly' | 'daily' | 'weekly' | 'achievements' | 'pass' | 'bounties' | 'collection' | 'challenges';
export interface ProgressEntry {
    id: string;
    title: string;
    description: string;
    progress: number;
    target: number;
    complete: boolean;
    claimed: boolean;
    rewardLabel: string;
    icon?: string;
}
export interface Reward {
    energy?: number;
    xp?: number;
    items?: Inventory;
    stars?: number;
}
interface Task {
    type: string;
    target: number;
    progress: number;
    claimed: boolean;
    bonus: string;
}
export interface ProgressionState {
    story: {
        index: number;
        progress: number;
    };
    /** Which story the index counts in: 2 is 星灯りの村 (story.ts); older saves are placed by level. */
    storyVersion: number;
    /** Village rank 1–5: grows as the crystal's light returns (arc ends). */
    villageRank: number;
    /** Titles earned (story, side stories, long-term play: titles.ts), in order. */
    titles: string[];
    /** The title worn under the name and above the explorer ('' for none). */
    title: string;
    /** The last chapter whose Lumi opening was shown (-1: none yet). */
    lumiSeen: number;
    /** Side stories (side-stories.ts): the current step of each friend chain and planet tale, by "friend:id" / "tale:planet". */
    side: Record<string, { step: number; progress: number }>;
    /** Level gifts claimed (levels, multiples of 5). */
    gifts: number[];
    /** Collection rewards claimed (collection ids, "fishlog:<page>"). */
    collected: string[];
    totals: Record<string, number>;
    daily: {
        key: string;
        tasks: Task[];
        chest: boolean;
        rerolled: boolean;
    };
    weekly: {
        key: string;
        tasks: Task[];
        chest: boolean;
    };
    /** The hourly board: four tasks and a chest, new every hour on the hour (UTC). */
    hourly: {
        key: string;
        tasks: Task[];
        chest: boolean;
    };
    /** Open village orders at the harvest market. */
    orders: OrdersState;
    pass: {
        season: string;
        stars: number;
        claimed: number[];
    };
    achievements: Record<string, number>;
    login: {
        day: string;
        streak: number;
    };
    bounty: {
        key: string;
        type: string;
        target: number;
        progress: number;
        claimed: boolean;
        ends: number;
    } | null;
    challenge: {
        type: string;
        target: number;
        progress: number;
        ends: number;
        claimed: boolean;
    } | null;
    streak: number;
    bestStreak: number;
}
type TaskSpec = {
    event: string;
    targets: number[];
    title: string;
    icon: string;
    level?: number;
};
const DAILY: Record<string, TaskSpec> = {
    kill: { event: 'kill', targets: [12, 25, 40], title: 'Defeat creatures', icon: '⚔️' }, boss: { event: 'boss', targets: [1], title: 'Defeat a boss', icon: '👑', level: 4 }, harvest: { event: 'harvest', targets: [6, 10, 16], title: 'Harvest crops', icon: '🌾' }, fish: { event: 'fish', targets: [3, 5, 8], title: 'Catch fish', icon: '🎣' }, rare: { event: 'fishrare', targets: [1], title: 'Catch a rare fish', icon: '🐠', level: 3 }, cook: { event: 'cook', targets: [3, 6, 10], title: 'Cook meals', icon: '🔥', level: 5 }, mine: { event: 'mine', targets: [5, 10], title: 'Mine deposits', icon: '⛏️', level: 14 }, sell: { event: 'sell', targets: [100, 250, 500], title: 'Earn energy from sales', icon: '🧺' }, skill: { event: 'skill', targets: [20, 40], title: 'Use skills', icon: '🌀' }, craft: { event: 'craft', targets: [1, 2], title: 'Craft or buy items', icon: '🔨' }, planet: { event: 'planet', targets: [1], title: 'Visit another planet', icon: '🚀', level: 6 },
    animal: { event: 'animal', targets: [4, 8, 12], title: 'Collect animal products', icon: '🥚', level: 2 }, fertilize: { event: 'fertilize', targets: [2, 3, 5], title: 'Fertilize crops', icon: '🧪', level: 2 }, upgrade: { event: 'upgrade', targets: [1, 2], title: 'Buy a crystal upgrade', icon: '💎', level: 2 }, eat: { event: 'eat', targets: [1, 2, 3], title: 'Eat food with a bonus effect', icon: '🍽️', level: 2 },
    mystery: { event: 'mystery', targets: [1], title: 'Reel in a mysterious shadow', icon: '❓', level: 3 }, fruit: { event: 'fruit', targets: [1, 2], title: 'Harvest fruit crops', icon: '🍎', level: 3 }, decorate: { event: 'decorate', targets: [1], title: 'Place a decoration', icon: '🏡', level: 4 }, hawk: { event: 'hawk', targets: [1, 2, 3], title: 'Defeat Great Forest Hawks', icon: '🦅', level: 5 },
    stardust: { event: 'stardust', targets: [10, 20, 30], title: 'Collect stardust in space', icon: '✨', level: 6 }, forge: { event: 'forge', targets: [1, 2, 3], title: 'Try weapon forging', icon: '⚒️', level: 6 }, harpoon: { event: 'harpoon', targets: [3, 5, 8], title: 'Hunt fish with the harpoon', icon: '🔱', level: 8 }, legendFish: { event: 'legendFish', targets: [1], title: 'Catch a legendary fish', icon: '🐋', level: 10 },
    order: { event: 'order', targets: [2, 3, 5], title: 'Deliver village orders', icon: '📦', level: 2 },
};
const WEEKLY: Record<string, TaskSpec> = {
    kill: { ...DAILY.kill, targets: [150, 300, 500] }, boss: { ...DAILY.boss, targets: [4, 8, 12] }, harvest: { ...DAILY.harvest, targets: [60, 120, 200] }, fish: { ...DAILY.fish, targets: [20, 40, 60] }, cook: { ...DAILY.cook, targets: [15, 30] }, mine: { ...DAILY.mine, targets: [30, 60] }, planet: { ...DAILY.planet, targets: [4, 8] }, sell: { ...DAILY.sell, targets: [1500, 4000, 8000] }, bounty: { event: 'bounty', targets: [3, 5], title: 'Complete bounties', icon: '🎯' }, chal: { event: 'chal', targets: [10, 20], title: 'Win quick challenges', icon: '⏱️' },
    dailyDone: { event: 'dailyDone', targets: [10, 15], title: 'Complete daily quests', icon: '📅' }, animal: { ...DAILY.animal, targets: [30, 60, 90] }, mystery: { event: 'mystery', targets: [3, 5], title: 'Reel in mysterious shadows', icon: '❓', level: 3 },
    stardust: { ...DAILY.stardust, targets: [100, 200, 300] }, forgeOk: { event: 'forgeOk', targets: [2, 3, 5], title: 'Forge successfully', icon: '⚒️', level: 6 }, titan: { event: 'titan', targets: [1, 2, 3], title: 'Defeat Titans', icon: '🗿', level: 12 },
    order: { ...DAILY.order, targets: [15, 30, 50] },
    tierUp: { event: 'tierUp', targets: [1, 2, 3], title: 'Conquer planet stars', icon: '🌟', level: 8 },
};
/** One hour of play: targets a player can finish within the hour, rising every ten levels. */
const HOURLY: Record<string, TaskSpec> = {
    kill: { ...DAILY.kill, targets: [8, 15, 25, 35, 45] }, harvest: { ...DAILY.harvest, targets: [9, 18, 30, 45, 60] }, fish: { ...DAILY.fish, targets: [3, 4, 6, 8, 10] },
    sell: { ...DAILY.sell, targets: [150, 400, 900, 1800, 3000] }, cook: { event: 'cook', targets: [3, 6, 10, 14, 18], title: 'Cook meals', icon: '🔥', level: 2 }, skill: { ...DAILY.skill, targets: [15, 25, 40, 55, 70] },
    bounty: { event: 'bounty', targets: [1, 1, 2, 2, 3], title: 'Complete bounties', icon: '🎯' }, order: { ...DAILY.order, targets: [1, 2, 3, 4, 5] },
    animal: { ...DAILY.animal, targets: [4, 8, 12, 18, 24] }, fertilize: { ...DAILY.fertilize, targets: [2, 3, 4, 5, 6] }, upgrade: { ...DAILY.upgrade, targets: [1, 1, 2, 2, 3] },
    mystery: { ...DAILY.mystery, targets: [1, 1, 1, 2, 2] }, hawk: { ...DAILY.hawk, targets: [1, 2, 3, 4, 5] }, chal: { event: 'chal', targets: [1, 2, 2, 3, 3], title: 'Win quick challenges', icon: '⏱️', level: 2 },
    craft: { ...DAILY.craft, targets: [1, 1, 2, 2, 3] }, stardust: { ...DAILY.stardust, targets: [10, 15, 25, 35, 45] }, mine: { ...DAILY.mine, level: 6, targets: [3, 5, 8, 10, 12] },
    planet: { ...DAILY.planet, targets: [1, 1, 1, 2, 2] }, forge: { ...DAILY.forge, targets: [1, 1, 2, 2, 3] }, harpoon: { ...DAILY.harpoon, targets: [3, 5, 7, 9, 12] },
    boss: { ...DAILY.boss, level: 12, targets: [1, 1, 1, 2, 2] },
};
/** Every daily and weekly task type and achievement line, read-only (for listings and tests). */
export const TASK_SPECS: Readonly<{ daily: Readonly<Record<string, TaskSpec>>; weekly: Readonly<Record<string, TaskSpec>>; hourly: Readonly<Record<string, TaskSpec>> }> = { daily: DAILY, weekly: WEEKLY, hourly: HOURLY };
const BONUS = ['potion', 'spore', 'honey', 'worm', 'seed_ice', 'seed_fire', 'claw', 'nectar', 'plot_kit'];
const ENDLESS: [
    string,
    number,
    string,
    string
][] = [['kill', 120, 'Defeat creatures', '⚔️'], ['boss', 4, 'Defeat bosses', '👑'], ['harvest', 60, 'Harvest crops', '🌾'], ['fish', 25, 'Catch fish', '🎣'], ['bounty', 3, 'Complete bounties', '🎯'], ['chal', 8, 'Win quick challenges', '⏱️']];
export const PASS_REWARDS: Reward[] = [{ items: { potion: 3 } }, { energy: 100 }, { items: { worm: 10 } }, { items: { spore: 2 } }, { items: { plot_kit: 1 } }, { energy: 200 }, { items: { seed_fire: 2 } }, { items: { honey: 3 } }, { items: { seed_ice: 2 } }, { items: { pet_parrot: 1 } }, { energy: 300 }, { items: { spore: 3 } }, { items: { starshard: 1 } }, { items: { seed_star: 1 } }, { items: { hat_wizard: 1 } }, { energy: 400 }, { items: { claw: 3 } }, { items: { nectar: 3 } }, { items: { plot_kit: 2 } }, { items: { boots_cloud: 1 } }, { energy: 500 }, { items: { starshard: 2 } }, { items: { seed_star: 2 } }, { items: { spore: 5 } }, { items: { pet_firefly: 1 } }, { energy: 600 }, { items: { moonstone: 1 } }, { items: { thunderstone: 2 } }, { items: { starshard: 3 } }, { items: { dz_superhero: 1 } }];
const ACHIEVEMENTS: [
    string,
    string,
    number[],
    string,
    string
][] = [['kills', 'kill', [50, 200, 1000, 5000], 'Creature hunter', '⚔️'], ['boss', 'boss', [1, 10, 50, 200], 'Boss hunter', '👑'], ['farm', 'harvest', [20, 100, 500, 2000], 'Gardener', '🌾'], ['fish', 'fish', [10, 50, 200, 1000], 'Angler', '🎣'], ['legend', 'legendFish', [1, 3, 10], 'Legendary angler', '🐋'], ['cook', 'cook', [10, 50, 200], 'Volcano chef', '🔥'], ['mine', 'mine', [20, 100, 500], 'Space miner', '⛏️'], ['planets', 'visited', [2, 3, 5, 9], 'Explorer', '🔭'], ['decor', 'decor', [3, 10, 25], 'Decorator', '🏡'], ['quests', 'questsDone', [5, 30, 100, 300], 'Helpful neighbor', '📜'], ['bounty', 'bounty', [1, 10, 50, 150], 'Bounty hunter', '🎯'], ['chal', 'chal', [5, 30, 100, 300], 'Challenge champion', '⏱️'], ['streak', 'bestStreak', [3, 5, 8, 12], 'Winning streak', '🔥'], ['story', 'story', [9, 15, 21, 29, 53, 100, 150], 'Storyteller', '🧭'], ['level', 'level', [5, 10, 20, 30, 50, 75, 100], 'Growing stronger', '⭐'],
    ['rancher', 'animal', [25, 100, 500, 2000], 'Rancher', '🥚'], ['orchard', 'fruit', [1, 10, 50, 200], 'Orchard keeper', '🍎'], ['smith', 'forgeOk', [1, 10, 30, 60], 'Blacksmith', '⚒️'], ['harpoon', 'harpoon', [10, 50, 200, 1000], 'Harpoon hunter', '🔱'],
    ['shadow', 'mystery', [1, 10, 30, 100], 'Shadow seeker', '❓'], ['pilot', 'stardust', [50, 300, 1000, 5000], 'Stardust pilot', '✨'], ['titan', 'titans', [1, 3, 6, 9], 'Titan slayer', '🗿'], ['visitor', 'login', [7, 30, 100, 365], 'Regular visitor', '🗓️'], ['neighbor', 'order', [5, 25, 100, 500], 'Good neighbor', '📦'], ['stars', 'stars', [1, 5, 15, 40, 81], 'Star conqueror', '🌟']];
export const ACHIEVEMENT_TITLES: readonly string[] = ACHIEVEMENTS.map(a => a[3]);
const CHALLENGES: Record<string, {
    target: number;
    seconds: number;
}> = { kill: { target: 4, seconds: 75 }, skill: { target: 8, seconds: 45 }, harvest: { target: 4, seconds: 100 }, fish: { target: 2, seconds: 120 }, boss: { target: 1, seconds: 150 } };
export function createProgression(): ProgressionState { return { story: { index: 0, progress: 0 }, storyVersion: STORY_VERSION, villageRank: 1, titles: [], title: '', lumiSeen: -1, side: {}, gifts: [], collected: [], totals: {}, daily: { key: '', tasks: [], chest: false, rerolled: false }, weekly: { key: '', tasks: [], chest: false }, hourly: { key: '', tasks: [], chest: false }, orders: { next: 0, list: [] }, pass: { season: '', stars: 0, claimed: [] }, achievements: {}, login: { day: '', streak: 0 }, bounty: null, challenge: null, streak: 0, bestStreak: 0 }; }
function day(now: number) { return new Date(now).toISOString().slice(0, 10); }
function week(now: number) { const d = new Date(now); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function hash(text: string) { let value = 2166136261; for (const c of text)
    value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; }
function tasks(specs: Record<string, TaskSpec>, count: number, seed: number, tier: number, level: number): Task[] { const eligible = Object.keys(specs).filter(k => level >= (specs[k].level || 1)), result: Task[] = []; for (let i = 0; i < 80 && result.length < count; i++) {
    const type = eligible[(seed + i * 7919) % eligible.length];
    if (result.some(t => t.type === type))
        continue;
    const spec = specs[type];
    result.push({ type, target: spec.targets[Math.min(tier, spec.targets.length - 1)], progress: 0, claimed: false, bonus: BONUS[(seed + i * 31) % BONUS.length] });
} return result; }
export function refreshProgress(s: SaveState, now = Date.now()) {
    const p = s.progression, today = day(now), monday = week(now), season = today.slice(0, 7);
    if (p.daily.key !== today)
        p.daily = { key: today, tasks: tasks(DAILY, 3, hash(today + s.name), Math.floor(s.level / 7), s.level), chest: false, rerolled: false };
    if (p.weekly.key !== monday)
        p.weekly = { key: monday, tasks: tasks(WEEKLY, 4, hash(monday + 'w' + s.name), Math.floor(s.level / 10), s.level), chest: false };
    const hour = new Date(now).toISOString().slice(0, 13);
    if (p.hourly.key !== hour)
        p.hourly = { key: hour, tasks: tasks(HOURLY, 4, hash(hour + 'h' + s.name), Math.floor(s.level / 10), s.level), chest: false };
    fillOrders(s, p.orders, xpNeeded);
    for (const title of earnTitles(s, p.titles)) p.title ||= title;
    if (p.pass.season !== season)
        p.pass = { season, stars: 0, claimed: [] };
    const key = `${s.planet}:${Math.floor(now / 1800000)}`;
    if (p.bounty?.key !== key) {
        const choices = [...new Set(PLANETS[s.planet].spawns.map(([id]) => id))].sort();
        p.bounty = choices.length ? { key, type: choices[hash(key + s.name) % choices.length], target: 3 + hash(key) % 3, progress: 0, claimed: false, ends: (Math.floor(now / 1800000) + 1) * 1800000 } : null;
    }
    if (p.challenge && !p.challenge.claimed && now > p.challenge.ends) {
        p.challenge = null;
        p.streak = 0;
    }
}
export function storyStep(index: number) { if (index < STORY_STEPS.length)
    return STORY_STEPS[index]; const round = index - STORY_STEPS.length, [event, base, title, icon] = ENDLESS[round % ENDLESS.length]; return { event, target: Math.round(base * (1 + Math.floor(round / ENDLESS.length) * .5)), title, icon, chapter: STORY_STEPS[STORY_STEPS.length - 1].chapter + 1, condition: undefined, end: undefined }; }
function condition(s: SaveState, key: string) {
    // Story goals naming one boss ("boss:home:treant") or one friend ("friend:sprout").
    if (key.startsWith('boss:'))
        return Number((s.bosses ?? []).includes(key.slice(5)));
    if (key.startsWith('friend:'))
        return Number((s.friends ?? []).some(f => f.id === key.slice(7)));
    switch (key) {
    case 'level': return s.level;
    case 'visited': return s.visited.length;
    case 'equipped': return Number(!!(s.gear.weapon || s.gear.disguise));
    case 'disguise': return Number(!!s.gear.disguise);
    case 'plots': return Math.max(0, s.plots.length - 9);
    case 'decor': return s.decorations.length;
    case 'story': return s.progression.story.index;
    case 'bestStreak': return s.progression.bestStreak;
    case 'pen': return Number(!!s.farm?.built);
    case 'animals': return s.farm?.animals.filter(a => a.kind !== 'dog').length ?? 0;
    case 'dog': return Number(!!s.farm?.animals.some(a => a.kind === 'dog'));
    case 'forgeMax': return Math.max(0, ...Object.values(s.forge ?? {}));
    case 'harpoon': return Number((s.bag.harpoon ?? 0) > 0 || s.gear.weapon === 'harpoon');
    // Distinct Titans, from the defeated-boss list ("planet:titan_turtle").
    case 'beds': return s.plots.length;
    case 'upgrades': return s.healthUp + s.attackUp + s.defenseUp + s.critUp;
    case 'fishSpecies': return Object.keys(s.fishRecords).length;
    case 'collections': return Object.values(COLLECTIONS).filter(group => group.items.every(item => s.collection[item])).length;
    case 'stars': return starsEarned(s);
    case 'animalKinds': return new Set(s.farm?.animals.filter(a => a.kind !== 'dog').map(a => a.kind) ?? []).size;
    case 'titansAt5': return titansAtTier(s, 5);
    case 'titansAt8': return titansAtTier(s, 8);
    case 'weaponAttack': return Math.max(0, ...[s.gear.weapon, ...Object.keys(s.bag).filter(id => (s.bag[id] ?? 0) > 0)].map(id => id && ITEMS[id]?.slot === 'weapon' && id !== 'harpoon' ? ITEMS[id].attack ?? 0 : 0));
    case 'titans': return new Set((s.bosses ?? []).map(key => key.split(':')[1]).filter(type => type?.startsWith('titan_'))).size;
    default: return s.progression.totals[key] || 0;
} }
export function recordEvent(s: SaveState, event: string, amount = 1, detail?: string, now = Date.now()) {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(now) || !Object.hasOwn({ kill: 1, harvest: 1, sell: 1, craft: 1, fish: 1, skill: 1, upgrade: 1, boss: 1, fishrare: 1, legendFish: 1, cook: 1, mine: 1, planet: 1, expand: 1, decorate: 1, bounty: 1, chal: 1, order: 1, hourChest: 1, tierUp: 1, animal: 1, fertilize: 1, eat: 1, mystery: 1, fruit: 1, hawk: 1, stardust: 1, forge: 1, forgeOk: 1, harpoon: 1, titan: 1, dailyDone: 1, login: 1 }, event))
        return;
    refreshProgress(s, now);
    const p = s.progression;
    p.totals[event] = (p.totals[event] || 0) + amount;
    const counters: Record<string, keyof SaveState['counters']> = { kill: 'kills', harvest: 'harvests', sell: 'sold', craft: 'bought', fish: 'fish', skill: 'skills', upgrade: 'upgrades' };
    if (counters[event])
        s.counters[counters[event]] += amount;
    for (const [list, specs] of [[p.daily.tasks, DAILY], [p.weekly.tasks, WEEKLY], [p.hourly.tasks, HOURLY]] as const)
        for (const task of list)
            if (specs[task.type]?.event === event)
                task.progress = Math.min(task.target, task.progress + amount);
    for (const chain of openChains(s)) {
        const at = sideState(p, chain), current = chain.steps[at.step];
        if (current?.event === event && (!chain.planet || chain.planet === s.planet))
            at.progress = Math.min(current.target, at.progress + amount);
    }
    const step = storyStep(p.story.index);
    if (step.event === event)
        p.story.progress = Math.min(step.target, p.story.progress + amount);
    if (event === 'kill' && p.bounty && p.bounty.type === detail && !p.bounty.claimed)
        p.bounty.progress = Math.min(p.bounty.target, p.bounty.progress + amount);
    if (p.challenge?.type === event && !p.challenge.claimed)
        p.challenge.progress = Math.min(p.challenge.target, p.challenge.progress + amount);
}
function rewardLabel(r: Reward) { return [r.energy ? t('{count} energy', { count: r.energy }) : '', r.xp ? `${r.xp} XP` : '', r.stars ? t('{count} stars', { count: r.stars }) : '', ...Object.entries(r.items || {}).map(([id, n]) => `${t(ITEMS[id]?.name || id)} ×${n}`)].filter(Boolean).join(' · '); }
function give(s: SaveState, r: Reward, now: number) { s.energy += r.energy || 0; if (r.xp)
    gainXp(s, r.xp, now); for (const [id, n] of Object.entries(r.items || {}))
    addItem(s, id, n); refreshProgress(s, now); s.progression.pass.stars += r.stars || 0; }
function storyReward(s: SaveState): Reward { const index = s.progression.story.index, step = storyStep(index); return { energy: 30 + s.level * 6 + Math.min(index, 40) * 4, xp: Math.round(xpNeeded(s.level) * (index >= 29 ? .3 : .25)), items: step.end, stars: 15 + (step.end ? 40 : 0) }; }
function taskReward(s: SaveState, t: Task, weekly = false): Reward { if (weekly) {
    const bonus = ['seed_star', 'spore', 'seed_fire', 'seed_ice'][hash(t.type) % 4];
    return { energy: 150 + s.level * 20, xp: Math.round(xpNeeded(s.level) * .35), items: { starshard: 1, [bonus]: 2 }, stars: 30 };
} return { energy: Math.round(20 + s.level * 6 + t.target * (t.type === 'sell' ? .2 : 1.5)), xp: 15 + s.level * 8, items: { [t.bonus]: 1 }, stars: 10 }; }
function dailyChest(s: SaveState, now: number): Reward { const ids = ['seed_star', 'starshard', 'honey', 'fish_golden', 'seed_fire', 'seed_ice']; return { energy: 60 + s.level * 10, xp: 40 + s.level * 12, items: { [ids[hash(day(now) + 'x') % ids.length]]: 1, spore: 2 }, stars: 20 }; }
function hourlyReward(s: SaveState): Reward { return { energy: 30 + s.level * 6, xp: Math.round(xpNeeded(s.level) * .08), stars: 8 }; }
function hourlyChest(s: SaveState, key: string): Reward { const ids = ['potion', 'spore', 'manure', 'honey', 'seed_fire', 'seed_ice']; return { energy: 120 + s.level * 15, xp: Math.round(xpNeeded(s.level) * .3), items: { [ids[hash(key + s.name) % ids.length]]: 1, potion: 1 }, stars: 20 }; }
function weeklyChest(s: SaveState): Reward { return { energy: 400 + s.level * 30, xp: Math.round(xpNeeded(s.level) * .8), items: { seed_star: 2, spore: 4, starshard: 2, moonstone: 1 }, stars: 60 }; }
function loginReward(s: SaveState, now: number): Reward { const streak = s.progression.login.day === day(now - 86400000) ? s.progression.login.streak + 1 : 1; return { energy: 25 + Math.min(streak, 30) * 5 + (streak % 7 === 0 ? 150 : 0), xp: 10 + s.level * 3, items: streak % 7 === 0 ? { seed_star: 1, spore: 2 } : { potion: 1 }, stars: 5 }; }
function bountyReward(s: SaveState): Reward { return { energy: 40 + s.level * 8, xp: Math.round(xpNeeded(s.level) * .15), items: { [BONUS[hash(s.progression.bounty?.key || '') % BONUS.length]]: 1 }, stars: 15 }; }
function achievementReward(tier: number, target: number): Reward { return { energy: 40 * (tier + 1) + Math.min(300, Math.round(target / 10)), xp: 30 * (tier + 1), stars: 10 }; }
/** Player-facing name of a challenge type (the daily task titles), never the internal id. */
export function challengeTitle(type: string): string { return t(DAILY[type]?.title ?? type); }
function entry(id: string, title: string, progress: number, target: number, claimed: boolean, reward: Reward = {}, icon = '📜', description = ''): ProgressEntry { return { id, title: t(title), description: t(description), progress: Math.min(progress, target), target, complete: progress >= target, claimed, rewardLabel: rewardLabel(reward), icon }; }
/** Side chains open to this save: a friend's chain once rescued, a planet's tale once discovered (home's from level 5). */
const chainKey = (c: SideChain) => (c.friend ? 'friend:' : 'tale:') + c.id;
function openChains(s: SaveState) {
    const friends = new Set((s.friends ?? []).map(f => f.id));
    return [...FRIEND_CHAINS.filter(c => friends.has(c.friend!)), ...PLANET_TALES.filter(c => c.planet === 'home' ? s.level >= 5 : s.discovered.includes(c.planet!))];
}
function sideState(p: ProgressionState, chain: SideChain) { return p.side[chainKey(chain)] ??= { step: 0, progress: 0 }; }
const chainByKey = (key: string) => [...FRIEND_CHAINS, ...PLANET_TALES].find(c => chainKey(c) === key);
function sideStepTitle(chain: SideChain, i: number) { const st = chain.steps[i]; return t(st.title, { count: st.target, planet: chain.planet ? t(PLANETS[chain.planet].name) : '' }); }
function sideReward(s: SaveState, chain: SideChain, i: number): Reward {
    const last = i === chain.steps.length - 1, items: Inventory = { ...chain.steps[i].reward };
    if (last) for (const [id, n] of Object.entries(chain.keepsake ?? {})) items[id] = (items[id] ?? 0) + n!;
    return { energy: 60 + s.level * 10 + (last ? 200 : 0), xp: Math.round(xpNeeded(s.level) * (last ? .3 : .12)), items, stars: last ? 30 : 12 };
}
function giftReward(s: SaveState, level: number): Reward { const g = levelGift(level); return { energy: 100 + level * 15, xp: Math.round(xpNeeded(s.level) * .15), items: g.items, stars: 20 }; }
const fishSpecies = () => Object.values(FISH).filter(f => f.rarity !== 'junk').length;
function collectionReward(s: SaveState, id: string): Reward { return { energy: 300 + s.level * 20, xp: Math.round(xpNeeded(s.level) * .25), items: { ...COLLECTION_KEEPSAKES[id], moonstone: 1 }, stars: 40 }; }
function fishLogReward(s: SaveState, page: number): Reward { return { energy: 150 + s.level * 10 + page * 150, xp: Math.round(xpNeeded(s.level) * (.12 + page * .08)), items: page === 2 ? { deco_aquarium: 1, moonstone: 1 } : { worm: 10, starshard: 1 }, stars: 25 }; }
/** A new title; worn at once when none is worn yet. */
const giveTitle = (p: ProgressionState, title?: string) => { if (title && !p.titles.includes(title)) { p.titles.push(title); p.title ||= title; } };
/** Wear a held title ('' takes it off). */
export function wearTitle(s: SaveState, title: string) { const p = s.progression; if (title !== '' && !p.titles.includes(title)) return false; p.title = title; return true; }
/** Unfinished side steps (for the bot's planner): the event or condition, the world it counts on, progress. */
export function sideGoals(s: SaveState) {
    return openChains(s).flatMap(chain => { const at = sideState(s.progression, chain), st = chain.steps[at.step]; return st ? [{ key: chainKey(chain), event: st.event, condition: st.condition, planet: chain.planet, progress: st.condition ? condition(s, st.condition) : at.progress, target: st.target }] : []; }).filter(g => g.progress < g.target);
}
/** The line a friend or Lumi says when this side step opens (shown by main.ts after a claim and on a rescue). */
export function sideLine(s: SaveState, key: string) { const chain = chainByKey(key); return chain ? chain.steps[s.progression.side[key]?.step ?? 0]?.line : undefined; }
export function progressEntries(s: SaveState, kind: ProgressKind, now = Date.now()): ProgressEntry[] {
    refreshProgress(s, now);
    const p = s.progression;
    if (kind === 'story') {
        const step = storyStep(p.story.index);
        return [entry(`story:${p.story.index}`, step.title, step.condition ? condition(s, step.condition) : p.story.progress, step.target, false, storyReward(s), step.icon, t('Chapter {chapter} · Step {step}', { chapter: step.chapter + 1, step: p.story.index + 1 }))];
    }
    if (kind === 'hourly') {
        const state = p.hourly;
        const result = state.tasks.map((task, i) => entry(`${state.key}:${i}`, HOURLY[task.type].title, task.progress, task.target, task.claimed, hourlyReward(s), HOURLY[task.type].icon));
        result.push(entry(`${state.key}:chest`, 'Hourly chest', state.tasks.filter(t => t.claimed).length, state.tasks.length, state.chest, hourlyChest(s, state.key), '🎁'));
        return result;
    }
    if (kind === 'daily' || kind === 'weekly') {
        const weekly = kind === 'weekly', state = weekly ? p.weekly : p.daily, specs = weekly ? WEEKLY : DAILY;
        const result = state.tasks.map((task, i) => entry(`${state.key}:${i}`, specs[task.type].title, task.progress, task.target, task.claimed, taskReward(s, task, weekly), specs[task.type].icon));
        result.push(entry(`${state.key}:chest`, weekly ? 'Weekly chest' : 'Daily chest', state.tasks.filter(t => t.claimed).length, state.tasks.length, state.chest, weekly ? weeklyChest(s) : dailyChest(s, now), '🎁'));
        if (!weekly)
            result.unshift(entry(`${day(now)}:login`, 'Daily check-in', 1, 1, p.login.day === day(now), loginReward(s, now), '🗓️', t('{count} consecutive days', { count: p.login.streak })));
        return result;
    }
    if (kind === 'achievements')
        return ACHIEVEMENTS.map(([id, key, targets, title, icon]) => { const tier = p.achievements[id] || 0, target = targets[Math.min(tier, targets.length - 1)], done = tier >= targets.length; return entry(`${id}:${tier}`, `${t(title)} · ${Math.min(tier + 1, targets.length)}/${targets.length}`, condition(s, key), target, done, done ? {} : achievementReward(tier, target), icon); });
    if (kind === 'pass')
        return PASS_REWARDS.map((reward, i) => entry(`${p.pass.season}:${i}`, t('Star pass · Tier {tier}', { tier: i + 1 }), p.pass.stars, (i + 1) * 50, p.pass.claimed.includes(i), reward, '⭐', t('Season {season}', { season: p.pass.season })));
    if (kind === 'bounties') {
        const b = p.bounty;
        return b ? [entry(b.key, t('Wanted: {name}', { name: t(ENEMY_TYPES[b.type]?.name ?? b.type) }), b.progress, b.target, b.claimed, bountyReward(s), '🎯', t('{count} minutes remaining', { count: Math.max(0, Math.ceil((b.ends - now) / 60000)) }))] : [];
    }
    if (kind === 'side') {
        const list: ProgressEntry[] = [];
        for (const chain of openChains(s)) {
            const at = sideState(p, chain), st = chain.steps[at.step]; if (!st) continue;
            const where = chain.planet ? t(chain.name) + ' · ' + t(PLANETS[chain.planet].name) : t(chain.name);
            list.push(entry(`${chainKey(chain)}:${at.step}`, sideStepTitle(chain, at.step), st.condition ? condition(s, st.condition) : at.progress, st.target, false, sideReward(s, chain, at.step), chain.friend ? chain.icon : st.icon, `${where} · ${t('Step {step} of {count}', { step: at.step + 1, count: chain.steps.length })}`));
        }
        // Level gifts: every one reached and not yet opened, then the next one.
        for (let level = LEVEL_GIFT_STEP; level <= 100; level += LEVEL_GIFT_STEP) {
            if (p.gifts.includes(level)) continue;
            const title = levelGift(level).title;
            list.push(entry(`gift:${level}`, t('Level {level} gift', { level }), s.level, level, false, giftReward(s, level), '🎁', title ? t('Title: {name}', { name: t(title) }) : t('A gift box from the village')));
            if (level > s.level) break;
        }
        return list.sort((a, b) => Number(b.complete) - Number(a.complete));   // ready rewards first
    }
    if (kind === 'collection')
        return [...Object.entries(COLLECTIONS).map(([id, group]) => { const found = group.items.filter(item => s.collection[item]).length; return entry(id, group.name, found, group.items.length, p.collected.includes(id), collectionReward(s, id), group.emoji, group.items.map(item => `${s.collection[item] ? '✓' : '?'} ${t(ITEMS[item].name)}`).join(' · ')); }), ...FISH_LOG_PAGES.map((size, page) => { const target = size || fishSpecies(); return entry(`fishlog:${page}`, t('Fish log · page {count}', { count: page + 1 }), Object.keys(s.fishRecords).filter(id => FISH[id] && FISH[id].rarity !== 'junk').length, target, p.collected.includes(`fishlog:${page}`), fishLogReward(s, page), '🐟', t('Title: {name}', { name: t(FISH_LOG_TITLES[page]) })); })];
    const c = p.challenge;
    if (!c)
        return [];
    const mult = 1 + Math.min(p.streak, 8) * .25;
    return [entry(`challenge:${c.ends}`, t('Quick challenge: {name}', { name: challengeTitle(c.type) }), c.progress, c.target, c.claimed, { energy: Math.round((15 + s.level * 4) * mult), xp: Math.round(xpNeeded(s.level) * .07 * mult), stars: 6 }, '⏱️', t('{count} seconds remaining', { count: Math.ceil((c.ends - now) / 1000) }))];
}
/** A chapter's last step: the village rank and title it unlocks (items come with the step reward). */
function closeChapter(p: ProgressionState, index: number) {
    const at = chapterAt(index);
    if (!at || at.last !== index)
        return;
    const reward = CHAPTERS[at.chapter].reward;
    if (reward.villageRank)
        p.villageRank = Math.max(p.villageRank, reward.villageRank);
    giveTitle(p, reward.title);
}
/** Index of the first step of a chapter. */
export function chapterStart(chapter: number) { return CHAPTERS.slice(0, chapter).reduce((n, c) => n + c.goals.length, 0); }
/** Lumi's opening for this chapter has been seen (kept so it is not shown twice). */
export function markLumiSeen(s: SaveState, chapter: number) { const current = storyStep(s.progression.story.index).chapter; if (!Number.isInteger(chapter) || chapter < 0 || chapter > current) return false; s.progression.lumiSeen = Math.max(s.progression.lumiSeen, chapter); return true; }
/** Chapter a save from an older story starts at: the first chapter whose level gate it has not passed. */
function chapterForLevel(level: number) { let c = 0, gate = 2; while (c < CHAPTERS.length - 1) { gate = CHAPTERS[c].goals.find(g => g.condition === 'level')?.target ?? gate; if (level < gate) break; c++; } return c; }
/** Place a save from an older story: chapter by level, with the ranks and titles of the chapters skipped. */
function migrateStory(p: ProgressionState, s: SaveState) {
    const chapter = p.story.index > 0 || s.level > 1 ? chapterForLevel(s.level) : 0;
    p.story = { index: chapterStart(chapter), progress: 0 };
    for (let c = 0; c < chapter; c++) closeChapter(p, chapterStart(c + 1) - 1);
    p.lumiSeen = chapter - 1;
    p.storyVersion = STORY_VERSION;
}
export function claimProgress(s: SaveState, kind: ProgressKind, id: string, now = Date.now()): boolean {
    const available = progressEntries(s, kind, now).find(e => e.id === id);
    if (!available?.complete || available.claimed)
        return false;
    const p = s.progression;
    let reward: Reward = {};
    if (kind === 'story') {
        reward = storyReward(s);
        closeChapter(p, p.story.index);
        p.story = { index: p.story.index + 1, progress: 0 };
        s.quest = p.story.index;
        p.totals.questsDone = (p.totals.questsDone || 0) + 1;
    }
    else if (kind === 'side') {
        const [head, key, n] = id.split(':');
        if (head === 'gift') { const level = Number(key); p.gifts.push(level); reward = giftReward(s, level); giveTitle(p, levelGift(level).title); }
        else {
            const chain = chainByKey(head + ':' + key)!, at = sideState(p, chain); if (Number(n) !== at.step) return false;
            reward = sideReward(s, chain, at.step); if (at.step === chain.steps.length - 1) giveTitle(p, chain.title);
            p.side[chainKey(chain)] = { step: at.step + 1, progress: 0 };
        }
        p.totals.questsDone = (p.totals.questsDone || 0) + 1;
    }
    else if (kind === 'collection') {
        p.collected.push(id);
        if (id.startsWith('fishlog:')) { const page = Number(id.slice(8)); reward = fishLogReward(s, page); giveTitle(p, FISH_LOG_TITLES[page]); }
        else { reward = collectionReward(s, id); giveTitle(p, COLLECTION_TITLES[id]); }
    }
    else if (kind === 'hourly') {
        const tail = id.split(':').at(-1)!;
        if (tail === 'chest') { p.hourly.chest = true; reward = hourlyChest(s, p.hourly.key); recordEvent(s, 'hourChest', 1, undefined, now); }
        else { p.hourly.tasks[Number(tail)].claimed = true; reward = hourlyReward(s); p.totals.questsDone = (p.totals.questsDone || 0) + 1; }
    }
    else if (kind === 'daily' || kind === 'weekly') {
        const weekly = kind === 'weekly', state = weekly ? p.weekly : p.daily, tail = id.split(':').at(-1)!;
        if (tail === 'login') {
            reward = loginReward(s, now);
            p.login = { day: day(now), streak: p.login.day === day(now - 86400000) ? p.login.streak + 1 : 1 };
            recordEvent(s, 'login', 1, undefined, now);
        }
        else if (tail === 'chest') {
            state.chest = true;
            reward = weekly ? weeklyChest(s) : dailyChest(s, now);
        }
        else {
            const task = state.tasks[Number(tail)];
            task.claimed = true;
            reward = taskReward(s, task, weekly);
            p.totals.questsDone = (p.totals.questsDone || 0) + 1;
            if (!weekly)
                recordEvent(s, 'dailyDone', 1, undefined, now);
        }
    }
    else if (kind === 'pass') {
        const index = Number(id.split(':').at(-1));
        p.pass.claimed.push(index);
        reward = PASS_REWARDS[index];
    }
    else if (kind === 'achievements') {
        const [key, tierText] = id.split(':'), tier = Number(tierText), spec = ACHIEVEMENTS.find(a => a[0] === key)!;
        p.achievements[key] = tier + 1;
        reward = achievementReward(tier, spec[2][tier]);
    }
    else if (kind === 'bounties') {
        p.bounty!.claimed = true;
        reward = bountyReward(s);
        recordEvent(s, 'bounty', 1, undefined, now);
    }
    else if (kind === 'challenges') {
        p.challenge!.claimed = true;
        const mult = 1 + Math.min(p.streak, 8) * .25;
        reward = { energy: Math.round((15 + s.level * 4) * mult), xp: Math.round(xpNeeded(s.level) * .07 * mult), stars: 6, items: p.streak % 3 === 2 ? { [BONUS[hash(id) % BONUS.length]]: 1 } : undefined };
        p.streak++;
        p.bestStreak = Math.max(p.bestStreak, p.streak);
        recordEvent(s, 'chal', 1, undefined, now);
    }
    give(s, reward, now);
    return true;
}
export function rerollDaily(s: SaveState, index: number, now = Date.now()): boolean { refreshProgress(s, now); const d = s.progression.daily, old = d.tasks[index]; if (d.rerolled || !old || old.claimed)
    return false; const choices = Object.keys(DAILY).filter(k => s.level >= (DAILY[k].level || 1) && !d.tasks.some(t => t.type === k)); if (!choices.length)
    return false; const type = choices[hash(d.key + s.name) % choices.length], spec = DAILY[type]; d.tasks[index] = { type, target: spec.targets[Math.min(Math.floor(s.level / 7), spec.targets.length - 1)], progress: 0, claimed: false, bonus: old.bonus }; d.rerolled = true; return true; }
export function startChallenge(s: SaveState, type = 'kill', now = Date.now()): boolean { refreshProgress(s, now); const spec = Object.hasOwn(CHALLENGES, type) ? CHALLENGES[type] : undefined; if (!spec || s.level < 2 || s.progression.challenge && !s.progression.challenge.claimed)
    return false; s.progression.challenge = { type, target: spec.target + (type === 'kill' ? Math.floor(s.level / 8) : 0), progress: 0, ends: now + spec.seconds * 1000, claimed: false }; return true; }
export function normalizeProgression(raw: unknown, s: SaveState): ProgressionState {
    const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
    const number = (v: unknown, max = 1e12) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0;
    const text = (v: unknown) => typeof v === 'string' ? v.slice(0, 100) : '';
    const p = createProgression();
    if (!record(raw)) {
        p.story.index = Math.min(s.quest, 29);
        migrateStory(p, s);
        const old: Record<string, number> = { kill: s.counters.kills, harvest: s.counters.harvests, sell: s.counters.sold, craft: s.counters.bought, fish: s.counters.fish, skill: s.counters.skills, upgrade: s.counters.upgrades };
        p.totals = old;
        return p;
    }
    if (record(raw.story))
        p.story = { index: number(raw.story.index, 1e6), progress: number(raw.story.progress) };
    p.villageRank = Math.min(5, Math.max(1, number(raw.villageRank, 5)));
    if (Array.isArray(raw.titles))
        p.titles = [...new Set(raw.titles.filter(isTitle))];
    p.title = isTitle(raw.title) && p.titles.includes(raw.title) ? raw.title : '';
    if (record(raw.side))
        for (const [key, v] of Object.entries(raw.side)) { const chain = chainByKey(key); if (chain && record(v)) p.side[key] = { step: Math.min(number(v.step), chain.steps.length), progress: number(v.progress) }; }
    if (Array.isArray(raw.gifts))
        p.gifts = [...new Set(raw.gifts.filter((v: unknown) => typeof v === 'number' && v > 0 && v <= 100 && v % LEVEL_GIFT_STEP === 0) as number[])];
    if (Array.isArray(raw.collected))
        p.collected = [...new Set(raw.collected.filter((v: unknown) => typeof v === 'string' && (Object.hasOwn(COLLECTION_TITLES, v) || /^fishlog:[0-2]$/.test(v))) as string[])];
    p.lumiSeen = typeof raw.lumiSeen === 'number' && Number.isInteger(raw.lumiSeen) ? Math.max(-1, Math.min(raw.lumiSeen, CHAPTERS.length)) : -1;
    if (raw.storyVersion !== STORY_VERSION)
        migrateStory(p, s);
    if (record(raw.totals))
        for (const [k, v] of Object.entries(raw.totals))
            if (/^[a-zA-Z]{1,30}$/.test(k) && !['constructor', 'prototype', '__proto__'].includes(k))
                p.totals[k] = number(v);
    for (const [key, specs] of [['daily', DAILY], ['weekly', WEEKLY], ['hourly', HOURLY]] as const) {
        const r = raw[key];
        if (!record(r))
            continue;
        const list: Array<Task> = [];
        if (Array.isArray(r.tasks))
            for (const t of r.tasks.slice(0, key === 'daily' ? 3 : 4))
                if (record(t) && typeof t.type === 'string' && Object.hasOwn(specs, t.type) && specs[t.type].targets.includes(t.target))
                    list.push({ type: t.type, target: t.target, progress: Math.min(number(t.progress), t.target), claimed: t.claimed === true, bonus: typeof t.bonus === 'string' && BONUS.includes(t.bonus) ? t.bonus : 'potion' });
        Object.assign(p[key], { key: text(r.key), tasks: list, chest: r.chest === true });
        if (list.length !== (key === 'daily' ? 3 : 4) || new Set(list.map(t => t.type)).size !== list.length)
            p[key].key = '';
        if (key === 'daily')
            p.daily.rerolled = r.rerolled === true;
    }
    p.orders = parseOrders(raw.orders);
    if (record(raw.pass))
        p.pass = { season: text(raw.pass.season), stars: number(raw.pass.stars), claimed: Array.isArray(raw.pass.claimed) ? [...new Set<number>(raw.pass.claimed.filter((x: any) => Number.isInteger(x) && x >= 0 && x < PASS_REWARDS.length))] : [] };
    if (record(raw.achievements))
        for (const [id, , tiers] of ACHIEVEMENTS)
            if (Object.hasOwn(raw.achievements, id))
                p.achievements[id] = number(raw.achievements[id], tiers.length);
    if (record(raw.login))
        p.login = { day: text(raw.login.day), streak: number(raw.login.streak) };
    const b = raw.bounty;
    if (record(b) && typeof b.type === 'string' && Object.values(PLANETS).some(p => p.spawns.some(([type]) => type === b.type)))
        p.bounty = { key: text(b.key), type: b.type, target: Math.max(3, Math.min(5, number(b.target))), progress: Math.min(number(b.progress), number(b.target)), claimed: b.claimed === true, ends: number(b.ends, Number.MAX_SAFE_INTEGER) };
    const c = raw.challenge;
    if (record(c) && typeof c.type === 'string' && Object.hasOwn(CHALLENGES, c.type))
        p.challenge = { type: c.type, target: Math.max(1, number(c.target, 1e6)), progress: number(c.progress), ends: number(c.ends, Number.MAX_SAFE_INTEGER), claimed: c.claimed === true };
    p.streak = number(raw.streak);
    p.bestStreak = Math.max(p.streak, number(raw.bestStreak));
    return p;
}

/** Hand over a village order from the bag (equipped items stay); pays its reward and opens a new order. */
export function deliverOrder(s: SaveState, index: number, now = Date.now()): Order | null {
    refreshProgress(s, now);
    const p = s.progression, order = p.orders.list[index];
    if (!order || looseQuantity(s, order.item) < order.count || !removeItem(s.bag, order.item, order.count)) return null;
    p.orders.list.splice(index, 1);
    give(s, { energy: order.energy, xp: order.xp, stars: order.stars }, now);
    recordEvent(s, 'order', 1, order.item, now);
    fillOrders(s, p.orders, xpNeeded);
    return order;
}
