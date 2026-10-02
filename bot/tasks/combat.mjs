// Fighting the way a careful player does: only creatures it can beat, skills when ready, back off
// early, and get up again after a fall.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Health this fight would cost: time to defeat the creature times the damage it deals meanwhile,
 * plus a share for every other creature close enough to join in.
 */
export function fightCost(s, e) {
  const swing = .9, dps = Math.max(1, s.attack) / swing;
  const seconds = e.hp / dps;
  const hurt = Math.max(1, e.damage - s.defense * .5) / Math.max(.6, e.cooldown + .4);
  const crowd = s.enemies.filter(o => o.id !== e.id && Math.hypot(o.x - e.x, o.z - e.z) < 6).length;
  return seconds * hurt * (1 + crowd * .8);
}
/** Species that made the explorer back off recently are left alone for a while, as a player learns. */
const wary = new Map();
export const avoid = (type, ms = 600000) => wary.set(type, Date.now() + ms);
const avoided = type => (wary.get(type) ?? 0) > Date.now();
export function safeTargets(s, { type, budget = .45 } = {}) {
  return s.enemies
    .filter(e => !e.boss && !avoided(e.type) && e.d < 30 && (!type || e.type === type) && e.level <= s.level + 2 && fightCost(s, e) < s.maxHp * budget)
    .sort((a, b) => a.d + fightCost(s, a) * .05 - (b.d + fightCost(s, b) * .05));
}

/** The "a little rest" panel after a fall, and the bag of loose items left where it happened. */
export async function handleFall(bot) {
  const { game, note } = bot;
  const s = await game.snap();
  if (s.modal === 'death') { await bot.hands.think(1200); await game.closePanel(); return true; }
  return false;
}
export async function recoverBag(bot) {
  const { game, note } = bot;
  const s = await game.snap(); if (!s.dropped || s.planet !== 'home') return false;
  const bag = s.entities.find(e => e.kind === 'dropped'); if (!bag) return false;
  const done = await game.goTo(n => n.entities.find(e => e.kind === 'dropped'), { label: 'dropped bag', done: n => !n.dropped && n, timeout: 90000 });
  if (done) note('picked up the dropped bag', 'combat');
  return !!done;
}

/** Inside the cottage only the door, wardrobe, mirror and friends can be tapped. */
export const inside = s => s.entities.some(e => e.kind === 'house-door');
export async function leaveHouse(bot) {
  const { game, note } = bot;
  const out = await game.goTo(n => n.entities.find(e => e.kind === 'house-door'), { label: 'cottage door', done: n => !inside(n) && n, timeout: 40000 });
  if (out) note('stepped outside', 'home');
  return !!out;
}

/** Low health: eat something healing if the bag has it, otherwise rest in the cottage. */
export async function recover(bot) {
  const { game, hands, note } = bot;
  let s = await game.snap();
  if (await bot.page.evaluate(() => window.__zg.healingFood())) {
    await hands.press('h'); await sleep(900); s = await game.snap();
    if (s.hp >= s.maxHp * .7) { note('ate a snack to recover', 'combat'); return; }
  }
  if (s.planet !== 'home') return;
  const rested = await game.goTo(n => n.entities.find(e => e.kind === 'home' || e.kind === 'house-door'), { label: 'cottage', done: n => (inside(n) || n.hp >= n.maxHp * .95) && n, timeout: 90000 });
  if (rested) { await game.waitFor(n => n.hp >= n.maxHp * .9 && n, { timeout: 35000, every: 1000 }); note('rested in the cottage', 'combat'); }
  if (inside(await game.snap())) await leaveHouse(bot);
}

/** Defeat up to `count` creatures it can safely take on, preferring `type` (the bounty's species). */
export async function fight(bot, { count = 3, type, timeout = 180000 } = {}) {
  const { game, hands, rng, note, log } = bot;
  const end = Date.now() + timeout; let kills = 0;
  while (kills < count && Date.now() < end) {
    let s = await game.snap();
    if (await handleFall(bot)) return `knocked out after ${kills}`;
    if (s.hp < s.maxHp * .7) { await recover(bot); continue; }
    const target = safeTargets(s, { type })[0] ?? (type ? safeTargets(s)[0] : undefined);
    if (!target) { log('fight: nothing safe to fight'); break; }
    const id = target.id; let engaged = false;
    const fightEnd = Date.now() + 40000;
    while (Date.now() < fightEnd) {
      s = await game.snap();
      if (s.modal === 'death') break;
      const e = s.enemies.find(x => x.id === id);
      if (e && e.d > 40) { log('fight: it got away'); break; }
      if (!e) { kills++; note(`defeated ${target.name}`, 'combat'); await sleep(rng.between(300, 900)); break; }
      if (s.hp < s.maxHp * .5) { log('fight: backing off to recover'); avoid(e.type); await game.stepToward(s.player.x * 2 - e.x, s.player.z * 2 - e.z, s).catch(() => {}); await recover(bot); break; }
      if (e.d > 3.2 || !engaged) {
        if (e.d < 35 && await game.safe(e.screen, s)) { await hands.click(e.screen.x, e.screen.y); engaged = true; await sleep(rng.between(400, 800)); }
        else { await game.stepToward(e.x, e.z, s); await sleep(rng.between(500, 900)); }
        continue;
      }
      // In reach the explorer swings by itself; add a skill when one is ready, like a player would.
      const ready = s.cooldowns.map((c, i) => c <= 0 ? i : -1).filter(i => i >= 0);
      if (ready.length && rng.chance(.5)) { await hands.press(['q', 'w', 'e', 'r'][rng.pick(ready)]); await sleep(rng.between(250, 600)); }
      else if (rng.chance(.3)) { await hands.press(' '); await sleep(rng.between(200, 450)); }
      else await sleep(rng.between(250, 500));
    }
  }
  return `kills ${kills}`;
}
