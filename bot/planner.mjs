// Chooses what to do next the way a player reads the journal: unfinished daily, weekly and story
// goals pull toward the activities that complete them; chores keep the garden and bag in order;
// a weighted random pick among the best few keeps every day a little different.
import { claimable, claimRewards, tendGarden, sellProduce } from './tasks/basics.mjs';
import { fight, safeTargets, handleFall, recoverBag, recover, inside, leaveHouse } from './tasks/combat.mjs';
import { upgradeWeapon, crystalUpgrade, buyRod } from './tasks/shopping.mjs';
import { goFishing, hasRod } from './tasks/fishing.mjs';
import { cook, craftSomething, forgeOnce, tendAnimals, harpoonHunt, mine, fertilizeCrops, expandGarden } from './tasks/home.mjs';
import { travelTo, goHome, nextPlanet } from './tasks/travel.mjs';
import { flourish } from './tasks/flourish.mjs';

/** Which activities move a quest event forward. */
const EVENT_TASKS = {
  kill: ['fight'], bounty: ['fight'], skill: ['fight'], chal: ['fight'], hawk: ['fight'], boss: [], titan: [],
  harvest: ['garden'], fruit: ['garden'], expand: [], fertilize: ['fertilize'],
  sell: ['market'], cook: ['cook'], craft: ['craft', 'shop'], upgrade: ['crystal'],
  fish: ['fishing', 'harpoon'], fishrare: ['fishing'], legendFish: ['fishing'], mystery: ['fishing'], harpoon: ['harpoon'],
  animal: ['animals'], planet: ['travel'], stardust: ['travel'], mine: ['travel', 'mine'],
  order: ['market'], forge: ['forge'], forgeOk: ['forge'], eat: [], decorate: [], dailyDone: [], login: [],
};
const CONDITION_TASKS = { beds: ['expand'], upgrades: ['crystal'], fishSpecies: ['fishing'], collections: ['travel', 'fight'], level: ['fight'], equipped: ['shop'], visited: ['travel'], pen: ['animals'], animals: ['animals'], dog: ['animals'], forgeMax: ['forge'], harpoon: [] };
const CROPS = /^(radish|carrot|pumpkin|mint|chili|candy|bean|star|berry|coffee|moonflower|magnetmelon|melon|apple|grape|mango|pineapple|coconut|durian|lychee|peach)$/;
const count = (bag, test) => Object.entries(bag).filter(([id]) => test(id)).reduce((n, [, c]) => n + c, 0);

export function createPlanner(bot, { minutesLeft }) {
  const { game, rng, log } = bot;
  const lastRun = {}, until = {};
  const rest = (name, ms) => { until[name] = Date.now() + ms; };
  const ready = name => !(until[name] > Date.now());
  const ago = name => Date.now() - (lastRun[name] ?? 0);
  let awaySince = 0;

  /** Every activity: when it makes sense, how to do it, and how long to leave it after. */
  const TASKS = {
    garden: { can: s => s.planet === 'home' && s.plots.some(p => !p.crop || p.progress >= 1), run: () => tendGarden(bot, { minutesLeft: minutesLeft() }), cool: 30000, base: 6 },
    fertilize: { can: s => s.planet === 'home' && (s.bag.manure > 0 || s.bag.spore > 0) && s.plots.some(p => p.crop && p.progress < .9), run: () => fertilizeCrops(bot, { doses: rng.int(1, 3) }), cool: 240000, base: 1 },
    cook: { can: s => s.planet === 'home' && count(s.bag, id => CROPS.test(id) || id.startsWith('fish_')) >= 4, run: () => cook(bot, { kinds: rng.int(1, 3) }), cool: 300000, base: 2 },
    market: { can: s => s.planet === 'home' && (s.orders.some(o => o.have >= o.count) || count(s.bag, id => CROPS.test(id) || id.startsWith('fish_')) >= 5), run: () => sellProduce(bot), cool: 120000, base: 3 },
    shop: { can: s => s.planet === 'home' && s.energy >= 60, run: () => upgradeWeapon(bot), cool: 420000, base: 1 },
    crystal: { can: s => s.planet === 'home' && s.energy >= 150, run: () => crystalUpgrade(bot, { times: rng.int(1, 2) }), cool: 300000, base: 2 },
    animals: { can: s => s.planet === 'home' && (!s.farm.built ? s.energy >= 80 : s.farm.ready > 0 || (s.energy > 250 && s.farm.animals < 8)), run: () => tendAnimals(bot), cool: 240000, base: 2 },
    fishing: { can: s => s.planet === 'home' && (hasRod(s) || s.energy >= 30), run: async s => hasRod(s) ? goFishing(bot, { count: rng.int(2, 4), timeout: 240000 }) : buyRod(bot), cool: 180000, base: 2 },
    harpoon: { can: s => s.planet === 'home' && (s.bag.harpoon > 0 || s.gear.weapon === 'harpoon'), run: () => harpoonHunt(bot, { throws: rng.int(4, 7) }), cool: 300000, base: 0 },
    forge: { can: s => s.planet === 'home' && s.level >= 6, run: () => forgeOnce(bot), cool: 600000, base: 0 },
    craft: { can: s => s.planet === 'home', run: () => craftSomething(bot), cool: 600000, base: 0 },
    fight: { can: s => safeTargets(s, { range: s.planet === 'home' ? 30 : 70 }).length > 0, run: s => fight(bot, { count: rng.int(2, 4), type: s.bounty && s.bounty.progress < s.bounty.target ? s.bounty.type : undefined, range: s.planet === 'home' ? 30 : 70, timeout: 150000 }), cool: 20000, base: 4 },
    travel: { can: s => s.planet === 'home' && s.level >= 4 && s.energy >= 30 && minutesLeft() > 12 && !!nextPlanet(s, rng), run: async s => { const r = await travelTo(bot, nextPlanet(s, rng)); if (r.startsWith('landed')) awaySince = Date.now(); return r; }, cool: 900000, base: 1, limit: 300000 },
    mine: { can: s => s.planet !== 'home' && s.entities.some(e => e.kind === 'mine' && e.d < 80), run: () => mine(bot, { count: rng.int(2, 4) }), cool: 120000, base: 3 },
    // A bed pays for itself in minutes; keep a cushion of energy for food and repairs.
    expand: { can: s => s.planet === 'home' && s.plots.length < 33 && s.energy >= 300, run: () => expandGarden(bot), cool: 240000, base: 3 },
    browse: { can: () => true, run: () => flourish(bot), cool: 150000, base: 1.5 },
    home: { can: s => s.planet !== 'home' && (Date.now() - awaySince > rng.between(240000, 480000) || minutesLeft() < 6), run: () => goHome(bot), cool: 60000, base: 20 },
  };

  /** Points from what the journal asks for right now. */
  async function needs() {
    const g = await bot.page.evaluate(() => window.__zg.goals()), score = {};
    const add = (names, n) => { for (const name of names ?? []) score[name] = (score[name] ?? 0) + n; };
    // The hourly board frames each clip, so its tasks weigh most.
    for (const t of g.tasks) add(EVENT_TASKS[t.event], t.kind === 'hourly' ? 4 : t.kind === 'daily' ? 3 : 2);
    // Keep a stock of cooked food: it is what heals the explorer in the field.
    const s = await game.snap(), meals = count(s.bag, id => id.startsWith('cooked_'));
    if (meals < 6) add(['cook'], 4);
    // Village orders: deliver what is ready, and work toward what is missing.
    for (const o of s.orders) {
      if (o.have >= o.count) { add(['market'], 5); continue; }
      const raw = o.item.replace(/^cooked_/, '');
      if (o.item.startsWith('cooked_')) add(s.bag[raw] > 0 ? ['cook'] : raw.startsWith('fish_') ? ['fishing'] : ['garden'], 2);
      else if (o.item.startsWith('fish_')) add(['fishing'], 2);
      else if (CROPS.test(o.item)) add(['garden'], 2);
      else if (['egg', 'milk', 'duck_egg', 'truffle'].includes(o.item)) add(['animals'], 2);
      else add(['fight'], 1);
    }
    if (g.story.event) add(EVENT_TASKS[g.story.event], 4); else if (g.story.condition) add(CONDITION_TASKS[g.story.condition], 4);
    if (g.bounty) add(['fight'], 2);
    return { score, goals: g };
  }

  /** Urgent things first (falls, panels, health, rewards), then the best-scoring activity. */
  async function step() {
    if (await handleFall(bot)) return 'got up after a fall';
    let s = await game.snap();
    if (s.modal || s.dialog) { await game.closePanel(); return 'closed a panel'; }
    if (s.space) { await game.waitFor(n => !n.space && n, { timeout: 60000 }); return 'waited for landing'; }
    if (s.hp < s.maxHp * .6) { await recover(bot); return 'recovered'; }
    if (inside(s)) { await leaveHouse(bot); return 'left the cottage'; }
    if (s.dropped && s.planet === 'home' && s.hp >= s.maxHp * .9) { await recoverBag(bot); return 'picked up the bag'; }
    if (ago('claim') > 90000 && (await claimable(game)).length) { lastRun.claim = Date.now(); return 'rewards → ' + await claimRewards(bot); }

    const { score } = await needs();
    const options = Object.entries(TASKS).filter(([name, t]) => ready(name) && t.can(s)).map(([name, t]) => {
      const variety = Math.min(1, ago(name) / 600000);   // recently done → less appealing
      return { name, t, value: t.base + (score[name] ?? 0) * 1.5 + variety * 2 + rng.between(0, 2) };
    }).sort((a, b) => b.value - a.value);
    if (!options.length) return null;
    const top = options.slice(0, 3), total = top.reduce((n, o) => n + o.value, 0);
    let draw = rng.between(0, total), pick = top[0];
    for (const o of top) { draw -= o.value; if (draw <= 0) { pick = o; break; } }
    lastRun[pick.name] = Date.now();
    log(`plan: ${options.slice(0, 4).map(o => `${o.name}(${o.value.toFixed(1)})`).join(' ')} → ${pick.name}`);
    // A hard limit per activity: past it, game.snap() throws and the task stops wherever it is.
    game.deadline = Date.now() + (pick.t.limit ?? 240000);
    let result;
    try { result = await pick.t.run(s); }
    catch (error) { result = 'stopped: ' + error.message; await game.closePanel().catch(() => {}); }
    finally { game.deadline = 0; }
    // Nothing achieved: leave it longer, so one stuck activity cannot fill the session.
    const idle = /^(stopped|nothing|no |cannot|could not|.* not reached|kills 0|caught 0|harvested 0, planted false|fertilized 0|mined 0|harpoon hits 0|upgrades 0)/.test(String(result));
    rest(pick.name, idle ? Math.max(pick.t.cool, 180000) : pick.t.cool);
    return `${pick.name} → ${result}`;
  }
  return { step, needs, TASKS };
}
