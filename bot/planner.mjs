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
import { huntBoss, huntable } from './tasks/boss.mjs';
import { gearGoal, huntTypes, gatherForGoal, buyWeapon } from './tasks/gear.mjs';
import { quickChallenge, tidyChest, sightsee } from './tasks/routine.mjs';
import { readLumi, rescueFriend, openCages, shakeOrchard } from './tasks/story.mjs';
import { wearTitle, visitAttic } from './tasks/titles.mjs';
import { collectCosmetic, craftCosmetic, dress, ACTIVITY_THEME } from './tasks/wardrobe.mjs';
import { improvePen, penHelper, cookDishes, eatSpecial, effectFoods, DISHES } from './tasks/farm.mjs';
import { decorateHome, decorDue } from './tasks/decor.mjs';
import { tendBolt, boltDue } from './tasks/helpers.mjs';
import { lavaPending, lavaEvents, dragonReady, fightDragon, openGifts, rerollDaily } from './tasks/events.mjs';
import { dressFriend, visitFriend, playDisguise, disguises } from './tasks/friends.mjs';
import { coopTasks } from './tasks/coop.mjs';

/** Which activities move a quest event forward. */
const EVENT_TASKS = {
  kill: ['fight'], bounty: ['fight'], skill: ['fight'], chal: ['challenge', 'fight'], hawk: ['fight'], boss: ['boss', 'dragon'], titan: ['boss'], tierUp: ['boss', 'fight', 'travel', 'dragon'],
  harvest: ['garden', 'orchard'], fruit: ['garden', 'orchard'], expand: [], fertilize: ['fertilize'],
  sell: ['market'], cook: ['cook', 'dish'], craft: ['craft', 'shop'], upgrade: ['crystal'],
  fish: ['fishing', 'harpoon'], fishrare: ['fishing'], legendFish: ['fishing'], mystery: ['fishing'], harpoon: ['harpoon'],
  animal: ['animals'], planet: ['travel'], stardust: ['travel'], mine: ['travel', 'mine', 'lava'],
  order: ['market'], forge: ['forge'], forgeOk: ['forge'], eat: ['snack', 'dish'], decorate: ['decorate'], dailyDone: [], login: [],
};
const CONDITION_TASKS = { titans: ['boss'], stars: ['boss', 'fight', 'travel'], beds: ['expand'], upgrades: ['crystal'], fishSpecies: ['fishing'], collections: ['travel', 'fight'], level: ['fight'], equipped: ['shop'], visited: ['travel'], pen: ['animals'], animals: ['animals'], dog: ['animals'], forgeMax: ['forge'], harpoon: [], animalKinds: ['animals'], titansAt5: ['boss', 'travel'], titansAt8: ['boss', 'travel'], weaponAttack: ['gearBuy', 'gather', 'shop'] };
/** Story goals naming one boss ("boss:home:bear") or one friend ("friend:sprout") go to the hunt and the cages. */
const conditionTasks = c => c.startsWith('boss:') ? ['boss'] : c.startsWith('friend:') ? ['rescue', 'boss'] : CONDITION_TASKS[c];
const CROPS = /^(radish|carrot|pumpkin|mint|chili|candy|bean|star|berry|coffee|moonflower|magnetmelon|melon|apple|grape|mango|pineapple|coconut|durian|lychee|peach)$/;
const count = (bag, test) => Object.entries(bag).filter(([id]) => test(id)).reduce((n, [, c]) => n + c, 0);

export function createPlanner(bot, { minutesLeft }) {
  const { game, rng, log } = bot;
  const lastRun = {}, until = {};
  const rest = (name, ms) => { until[name] = Date.now() + ms; };
  const ready = name => !(until[name] > Date.now());
  const ago = name => Date.now() - (lastRun[name] ?? 0);
  let awaySince = 0, awayFor = 300000, gearAt = 0, idleAt = 0;
  // Energy kept back from the crystal for flights, the helpers, decorations and repairs (more at higher levels).
  const reserve = s => Math.min(3000, 200 + s.level * 15);
  const mealsIn = s => count(s.bag, id => id.startsWith('cooked_'));
  // A boss clip remembers when this world's bosses return: one due within two minutes keeps the explorer here.
  // An event clip stays on its world while the world still has its event to do (presents, the lava cave).
  const eventsHere = s => !!bot.clip?.planets?.includes(s.planet) && (lavaPending(bot, s) || toyGifts(s));
  // Toybox presents stay on the map once opened (they rewrap later): after 'no presents ready', leave them 10 minutes.
  const toyGifts = s => s.planet === 'toy' && s.entities.some(e => e.kind === 'gift') && Date.now() - (bot.toyDone ?? 0) > 600000;
  // The worlds an event clip still has something on (the lava cave once a day, Toybox presents every few minutes).
  const eventWorlds = s => (bot.clip?.planets ?? []).filter(p => p === 'lava' ? lavaPending(bot, { ...s, planet: 'lava' }) : p === 'toy' ? Date.now() - (bot.toyDone ?? 0) > 600000 : true);
  const bossSoon = s => !!bot.clip?.focus?.boss && (s.bosses ?? []).some(b => !b.alive && b.respawn < 120);

  /** Every activity: when it makes sense, how to do it, and how long to leave it after. */
  const TASKS = {
    garden: { can: s => s.planet === 'home' && s.plots.some(p => !p.crop || p.progress >= 1), run: () => tendGarden(bot, { minutesLeft: minutesLeft() }), cool: 30000, base: 6 },
    fertilize: { can: s => s.planet === 'home' && (s.bag.manure > 0 || s.bag.spore > 0) && s.plots.some(p => p.crop && p.progress < .9), run: () => fertilizeCrops(bot, { doses: rng.int(1, 3) }), cool: 240000, base: 1 },
    cook: { can: s => s.planet === 'home' && count(s.bag, id => CROPS.test(id) || id.startsWith('fish_')) >= 4, run: () => cook(bot, { kinds: rng.int(1, 3) }), cool: 300000, base: 2 },
    market: { can: s => s.planet === 'home' && (s.orders.some(o => o.have >= o.count) || count(s.bag, id => CROPS.test(id) || id.startsWith('fish_')) >= 5), run: () => sellProduce(bot), cool: 120000, base: 3 },
    shop: { can: s => s.planet === 'home' && s.energy >= 60, run: () => upgradeWeapon(bot), cool: 420000, base: 1 },
    // Spare energy goes into the crystal: more upgrades per visit the richer the explorer is.
    crystal: { can: s => s.planet === 'home' && s.energy >= reserve(s) + 150, run: s => crystalUpgrade(bot, { times: s.energy - reserve(s) > 2000 ? 4 : s.energy - reserve(s) > 800 ? 3 : 2, keep: reserve(s) }), cool: 240000, base: 2, boost: s => s.energy - reserve(s) > 1000 ? 4 : s.energy - reserve(s) > 500 ? 2 : 0 },
    // A stronger weapon: buy it as soon as the materials are in the bag, otherwise hunt what drops them.
    gearBuy: { can: s => s.planet === 'home' && !!bot.gear && !Object.keys(bot.gear.missing).length && s.energy >= bot.gear.price, run: async () => { const r = await buyWeapon(bot, bot.gear.id); bot.gear = null; gearAt = 0; return r; }, cool: 60000, base: 9 },
    gather: { can: s => !!bot.gear && huntTypes(bot.gear, s).length > 0, run: () => gatherForGoal(bot, { goal: bot.gear }), cool: 120000, base: 4, limit: 300000 },
    challenge: { can: s => s.level >= 2 && !s.space, run: () => quickChallenge(bot), cool: 600000, base: 2 },
    tidy: { can: s => s.planet === 'home', run: () => tidyChest(bot), cool: 900000, base: 1 },
    sightsee: { can: () => true, run: () => sightsee(bot), cool: 420000, base: 1.5 },
    // Also when the pen is full but still lacks the guard dog or a kind (Clover's side story).
    animals: { can: s => s.planet === 'home' && (!s.farm.built ? s.energy >= 80 : s.farm.ready > 0 || (s.energy > 250 && (s.farm.animals < 8 || !!bot.pen && (!bot.pen.dog || bot.pen.kinds.length < 4)))), run: () => tendAnimals(bot), cool: 240000, base: 2 },
    fishing: { can: s => s.planet === 'home' && (hasRod(s) || s.energy >= 30), run: async s => hasRod(s) ? goFishing(bot, { count: rng.int(2, 4), timeout: 240000 }) : buyRod(bot), cool: 180000, base: 2 },
    harpoon: { can: s => s.planet === 'home' && (s.bag.harpoon > 0 || s.gear.weapon === 'harpoon'), run: () => harpoonHunt(bot, { throws: rng.int(4, 7) }), cool: 300000, base: 0 },
    forge: { can: s => s.planet === 'home' && s.level >= 6, run: () => forgeOnce(bot), cool: 300000, base: 0, boost: s => s.energy > 1500 ? 3 : 0 },
    // A new look comes first at the workshop; otherwise any recipe the bag allows.
    craft: { can: s => s.planet === 'home', run: async () => { const r = await craftCosmetic(bot); return r.startsWith('crafted') ? r : craftSomething(bot); }, cool: 600000, base: 0 },
    wardrobe: { can: s => s.planet === 'home' && s.energy >= 400, run: () => collectCosmetic(bot, { theme: bot.theme }), cool: 600000, base: 2 },
    fight: { can: s => (s.hp >= s.maxHp * .7 || mealsIn(s) > 0 || s.planet === 'home') && safeTargets(s, { range: s.planet === 'home' ? 30 : 70 }).length > 0, run: s => fight(bot, { count: rng.int(2, 4), type: s.bounty && s.bounty.progress < s.bounty.target ? s.bounty.type : undefined, range: s.planet === 'home' ? 30 : 70, timeout: 150000 }), cool: 20000, base: 4 },
    travel: { can: s => s.planet === 'home' && !bossSoon(s) && s.level >= 4 && s.energy >= 30 && minutesLeft() > 12 && !!nextPlanet(s, rng, eventWorlds(s)), run: async s => { const r = await travelTo(bot, nextPlanet(s, rng, eventWorlds(s))); if (r.startsWith('landed')) { awaySince = Date.now(); awayFor = rng.between(240000, 420000); } return r; }, get cool() { return bot.clip?.planets ? 240000 : 900000; }, base: 1, limit: 300000 },
    mine: { can: s => s.planet !== 'home' && s.entities.some(e => e.kind === 'mine' && e.d < 80), run: () => mine(bot, { count: rng.int(2, 4) }), cool: 120000, base: 3 },
    // A bed pays for itself in minutes; keep a cushion of energy for food and repairs.
    expand: { can: s => s.planet === 'home' && s.plots.length < 33 && s.energy >= 300, run: () => expandGarden(bot), cool: 240000, base: 3 },
    // A boss the explorer can beat, with food in the bag: the highlight of a session.
    orchard: { can: s => s.planet === 'home' && s.orchard?.length > 0, run: () => shakeOrchard(bot), cool: 600000, base: 5 },
    // A new title (level 65+): climb to the attic memory room to see its trophy.
    attic: { can: s => s.planet === 'home' && s.level >= 65 && s.titles.length > (bot.atticTitles ?? s.titles.length - 1), run: () => visitAttic(bot, bot.theme ?? 'fancy'), cool: 900000, base: 8, limit: 240000 },
    rescue: { can: s => openCages(s).length > 0, run: () => rescueFriend(bot), cool: 60000, base: 12 },
    boss: { can: s => huntable(s).length > 0, run: () => huntBoss(bot), cool: 180000, base: 3, limit: 300000 },
    // The pen grows: shelters per kind, a bigger pen, the pen helper with automatic feeding.
    penUpgrade: { can: s => s.planet === 'home' && s.farm.built && s.energy >= 700, run: () => improvePen(bot), cool: 600000, base: 1 },
    penHelper: { can: s => s.planet === 'home' && s.farm.built && (bot.pen ? !(bot.pen.helper.owned && bot.pen.helper.autoFeed) && (bot.pen.helper.owned || s.energy >= 1800) : s.energy >= 1800), run: () => penHelper(bot), cool: 900000, base: 2 },
    // Farm dishes from eggs and milk, and now and then a dish with an effect eaten (Pepper's side story, eat quests).
    dish: { can: s => s.planet === 'home' && (s.bag.egg >= 2 || s.bag.milk >= 2 || s.bag.egg > 0 && s.bag.milk > 0), run: () => cookDishes(bot, { most: rng.int(1, 3) }), cool: 300000, base: 1 },
    snack: { can: s => !s.space && effectFoods(s).length > 0, run: () => eatSpecial(bot), cool: 420000, base: 0 },
    // Decorations from the bag, set out in mirrored pairs (the plaza ring first at rank 4); crafted when the bag has no pair.
    decorate: { can: s => s.level >= 4 && decorDue(bot, s), run: () => decorateHome(bot, { count: rng.int(2, 4) }), cool: 600000, base: 1.5, limit: 300000 },
    // Bolt the garden robot: hired once energy allows, kept working on the best seed.
    bolt: { can: s => boltDue(bot, s), run: () => tendBolt(bot), cool: 300000, base: 3 },
    // Planet events: the lava cave (gate, daily chest, braziers), the volcano dragon, Toybox presents.
    lava: { can: s => lavaPending(bot, s), run: () => lavaEvents(bot), cool: 240000, base: 6, limit: 300000 },
    dragon: { can: s => dragonReady(s), run: () => fightDragon(bot), cool: 60000, base: 10, limit: 260000 },
    gifts: { can: s => toyGifts(s), run: async () => { const r = await openGifts(bot, { max: rng.int(2, 5) }); if (r.startsWith('no presents')) bot.toyDone = Date.now(); return r; }, cool: 240000, base: 5, limit: 300000 },
    // Once a day: swap a daily task the bot cannot do (or a hard one barely started).
    reroll: { can: s => !s.space && bot.rerollDay !== new Date(s.now).toISOString().slice(0, 10), run: () => rerollDaily(bot), cool: 900000, base: 4 },
    // Friends at home: a spare hat or outfit for one of them, a look in on the one resting.
    dressFriend: { can: s => s.planet === 'home' && s.friends.length > 0, run: () => dressFriend(bot), cool: 1800000, base: 1, limit: 180000 },
    visitFriend: { can: s => s.planet === 'home' && s.friends.length > 0, run: () => visitFriend(bot), cool: 900000, base: 1 },
    disguise: { can: s => s.planet === 'home' && disguises(s).length > 0, run: () => playDisguise(bot, { seconds: rng.int(30, 60) }), cool: 1500000, base: 1 },
    browse: { can: () => true, run: () => flourish(bot), cool: 150000, base: 1.5 },
    // Back home when the stay is up, the session ends soon, or the explorer is hurt with no food left.
    home: { can: s => s.planet !== 'home' && (Date.now() - awaySince > awayFor && !bossSoon(s) && !eventsHere(s) || minutesLeft() < 6 || !mealsIn(s) && s.hp < s.maxHp * .8), run: () => goHome(bot), cool: 60000, base: 20 },
    // Playing with a group (the together clip): group bosses, following the leader, garden visits (tasks/coop.mjs).
    ...coopTasks(bot, { minutesLeft }),
  };

  /** Points from what the journal asks for right now. */
  async function needs() {
    const g = await bot.page.evaluate(() => window.__zg.goals()), score = {};
    const add = (names, n) => { for (const name of names ?? []) score[name] = (score[name] ?? 0) + n; };
    // The hourly board frames each clip, so its tasks weigh most; a quest clip (clips.mjs) weighs the journal more.
    const quests = bot.clip?.quests ?? 1;
    for (const t of g.tasks) {
      // Side stories: a planet tale only counts on its own world; elsewhere it is a reason to fly there.
      if (t.kind === 'side' && t.planet && t.planet !== bot.lastPlanet) { add(['travel'], 1); continue; }
      add(EVENT_TASKS[t.event] ?? conditionTasks(t.event ?? ''), (t.kind === 'hourly' ? 4 : t.kind === 'daily' ? 3 : 2) * quests);
    }
    // Keep a stock of cooked food: it is what heals the explorer in the field.
    const s = await game.snap(), meals = count(s.bag, id => id.startsWith('cooked_'));
    if (meals < 6) add(['cook'], 4);
    // Bosses wanted but none beatable yet: get stronger and stock up on food first.
    const bossWanted = g.tasks.some(t => ['boss', 'titan', 'tierUp'].includes(t.event)) || ['boss', 'titan'].includes(g.story.event) || ['titans', 'stars', 'titansAt5', 'titansAt8'].includes(g.story.condition) || !!g.story.condition?.startsWith('boss:');
    if (bossWanted && !huntable(s).length) { add(['crystal'], 3); add(['shop'], 2); add(['garden', 'cook'], 2); }
    // Village orders: deliver what is ready, and work toward what is missing.
    for (const o of s.orders) {
      if (o.have >= o.count) { add(['market'], 5 * quests); continue; }
      const raw = o.item.replace(/^cooked_/, '');
      if (o.item.startsWith('cooked_')) add(s.bag[raw] > 0 ? ['cook'] : raw.startsWith('fish_') ? ['fishing'] : ['garden'], 2);
      else if (o.item.startsWith('fish_')) add(['fishing'], 2);
      else if (CROPS.test(o.item)) add(['garden'], 2);
      else if (['egg', 'milk', 'duck_egg', 'truffle'].includes(o.item)) add(['animals'], 2);
      else if (DISHES.includes(o.item)) add(['dish'], 2);
      else add(['fight'], 1);
    }
    // The story weighs more in a story clip (clips.mjs).
    const storyWeight = 4 * (bot.clip?.story ?? 1);
    if (g.story.event) add(EVENT_TASKS[g.story.event], storyWeight); else if (g.story.condition) add(conditionTasks(g.story.condition), storyWeight);
    if (g.bounty) add(['fight'], 2);
    return { score, goals: g };
  }

  /** Urgent things first (falls, panels, health, rewards), then the best-scoring activity. */
  async function step() {
    if (await handleFall(bot)) return 'got up after a fall';
    let s = await game.snap();
    // Where the explorer is before anything happens (a fall moves it home).
    if (s.started && s.modal !== 'death') bot.lastPlanet = s.planet;
    // A session that opens on another world starts its stay there now.
    if (s.planet !== 'home' && !awaySince) { awaySince = Date.now(); awayFor = rng.between(240000, 420000); }
    if (s.modal || s.dialog) { await game.closePanel(); return 'closed a panel'; }
    if (s.lumi != null) { await readLumi(bot); return 'listened to Lumi'; }
    if (s.space) { await game.waitFor(n => !n.space && n, { timeout: 60000 }); return 'waited for landing'; }
    if (s.hp < s.maxHp * .6) { await recover(bot); return 'recovered'; }
    if (inside(s)) { await leaveHouse(bot); return 'left the cottage'; }
    // The dropped bag, unless it lies by a live boss (then try again in a few minutes).
    if (s.dropped && s.planet === 'home' && s.hp >= s.maxHp * .9 && ready('bag')) { if (await recoverBag(bot)) return 'picked up the bag'; rest('bag', 240000); }
    if (ago('claim') > 90000 && (await claimable(game)).length) { lastRun.claim = Date.now(); return 'rewards → ' + await claimRewards(bot); }

    // The weapon goal is worked out again every few minutes (energy and materials change).
    if (Date.now() - gearAt > 180000) { gearAt = Date.now(); bot.gear = await gearGoal(bot).catch(() => null); if (bot.gear) log(`gear goal: ${bot.gear.id} (ATK ${bot.gear.attack}), missing ${JSON.stringify(Object.fromEntries(Object.entries(bot.gear.missing).map(([k, v]) => [k, v.short])))}`); }
    const { score } = await needs();
    // A together clip keeps each role to its own activities (clip.only).
    const options = Object.entries(TASKS).filter(([name, t]) => (!bot.clip?.only || bot.clip.only.includes(name)) && ready(name) && t.can(s)).map(([name, t]) => {
      const variety = Math.min(1, ago(name) / 600000);   // recently done → less appealing
      // The clip's focus (clips.mjs) leans the hour toward its theme.
      const value = t.base + (t.boost?.(s) ?? 0) + (score[name] ?? 0) * 1.5 + variety * 2 + rng.between(0, 2), focus = bot.clip?.focus?.[name] ?? 0;
      return { name, t, value: bot.clip ? (focus ? value + focus * 1.5 : value * .75) : value };
    }).sort((a, b) => b.value - a.value);
    if (!options.length) {
      // Nothing to do on another world: fly home rather than stand around.
      if (s.planet !== 'home') return 'home → ' + await goHome(bot);
      if (Date.now() - idleAt > 30000) { idleAt = Date.now(); log('idle: nothing worth doing right now'); }
      return null;
    }
    const top = options.slice(0, 3), total = top.reduce((n, o) => n + o.value, 0);
    let draw = rng.between(0, total), pick = top[0];
    for (const o of top) { draw -= o.value; if (draw <= 0) { pick = o; break; } }
    // Some tasks answer someone else and cannot wait for the draw (now(s): a mate arriving, a boss the group called).
    pick = options.find(o => o.t.now?.(s)) ?? pick;
    lastRun[pick.name] = Date.now(); bot.mark?.('task', { task: pick.name, planet: s.planet });
    // Now and then, change into something that suits the activity (owned pieces only).
    const theme = ACTIVITY_THEME[pick.name];
    if (theme && !bot.clip && ago('dress') > 300000 && rng.chance(.45)) { lastRun.dress = Date.now(); game.deadline = Date.now() + 60000; await dress(bot, theme).catch(() => {}); await wearTitle(bot, bot.theme ?? theme).catch(() => {}); game.deadline = 0; }
    log(`plan: ${options.slice(0, 4).map(o => `${o.name}(${o.value.toFixed(1)})`).join(' ')} → ${pick.name}`);
    // A hard limit per activity: past it, game.snap() throws and the task stops wherever it is.
    // bot.taskCap: a shorter limit when the clip needs the explorer soon (a together clip's goodbye, tasks/coop.mjs).
    // No task outlives the clip: it stops when the clip ends (a few seconds of grace to finish the step in hand).
    game.deadline = Date.now() + Math.min(pick.t.limit ?? 240000, bot.taskCap?.() ?? Infinity, Math.max(10000, minutesLeft() * 60000 + 5000));
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
