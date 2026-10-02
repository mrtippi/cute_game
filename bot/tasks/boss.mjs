// Boss hunting: pick a boss the explorer can beat, get ready (full health, food, a fighting outfit),
// then fight it like a player: close in between its attacks, step out of the red warning circles before
// they land, use skills when ready, back off to eat when health runs low, and collect the loot.
import { fightCost, recover, collectLoot } from './combat.mjs';
import { dress } from './wardrobe.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const foodCount = s => Object.entries(s.bag).filter(([id]) => id.startsWith('cooked_') || ['potion', 'honey', 'omelette', 'pancake', 'milkshake', 'cheese'].includes(id)).reduce((n, [, c]) => n + c, 0);

/** Health the fight would cost (boss skills hit harder than their basic damage), against health plus food. */
export function bossReady(s, boss) {
  const live = s.enemies.find(e => e.id === boss.id);
  if (!live) return false;
  const cost = fightCost(s, { ...live, damage: live.damage * 1.6 });
  const reserve = Math.min(foodCount(s), 6) * s.maxHp * .25;
  return live.level <= s.level + (boss.titan ? 0 : 4) && cost < (s.maxHp + reserve) * (boss.titan ? .5 : .7);
}
/** Live bosses on this world worth fighting now, easiest first. */
export function huntable(s) {
  return (s.bosses ?? []).filter(b => b.alive && b.d < 160 && bossReady(s, b))
    .sort((a, b) => Number(a.titan) - Number(b.titan) || a.d - b.d);
}

/** Inside a warning circle (with a little margin for the explorer's size)? */
const inDanger = (p, dangers) => dangers.some(d => Math.hypot(p.x - d.x, p.z - d.z) < d.r + .7);

/** Step to the nearest spot outside every warning circle, staying close to the boss. */
async function dodge(bot, s, boss, dangers) {
  const { game, hands, rng } = bot;
  // A human reaction: usually quick, now and then a beat late.
  await sleep(rng.chance(.12) ? rng.between(450, 750) : rng.between(120, 350));
  const spots = [];
  for (const dist of [2.5, 3.5, 5, 6.5]) for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, p = { x: s.player.x + Math.cos(a) * dist, z: s.player.z + Math.sin(a) * dist };
    if (!inDanger(p, dangers)) spots.push({ ...p, score: dist + Math.abs(Math.hypot(p.x - boss.x, p.z - boss.z) - 3) * .4 });
  }
  for (const p of spots.sort((a, b) => a.score - b.score).slice(0, 6)) {
    const screen = await game.project(p.x, p.z);
    if (await game.safe(screen, s) && await game.pick(screen.x, screen.y) === null) { await hands.click(screen.x, screen.y); return true; }
  }
  return false;
}

export async function huntBoss(bot, { id, timeout = 240000 } = {}) {
  const { game, hands, rng, note, log } = bot;
  let s = await game.snap();
  const target = id ? s.bosses.find(b => b.id === id) : huntable(s)[0];
  if (!target) return 'no boss to fight';
  // Get ready: full health, food in the bag, dressed for a fight.
  if (s.hp < s.maxHp * .95) await recover(bot);
  if (foodCount(await game.snap()) < 4) return 'need food first';
  await dress(bot, 'combat').catch(() => {});
  note(`going after ${target.name}`, 'boss');
  const end = Date.now() + timeout; let engaged = false, dodges = 0, retreats = 0;
  while (Date.now() < end) {
    s = await game.snap();
    if (s.modal === 'death') return 'knocked out by the boss';
    const boss = s.enemies.find(e => e.id === target.id);
    if (!boss) {
      const gone = s.bosses.find(b => b.id === target.id);
      if (gone && !gone.alive) { note(`defeated the boss ${target.name}!`, 'boss'); await sleep(rng.between(600, 1200)); await collectLoot(bot, { range: 22 }); return `defeated ${target.name}`; }
      return 'boss vanished';
    }
    const dangers = s.enemies.flatMap(e => e.danger ?? []);
    if (dangers.length && inDanger(s.player, dangers)) { if (await dodge(bot, s, boss, dangers)) dodges++; await sleep(rng.between(250, 450)); continue; }
    if (s.hp < s.maxHp * .4) {
      // Back off, eat, come back. No food left: retreat for good.
      if (retreats++ >= 4 || !foodCount(s)) { log('boss: retreating'); await game.stepToward(s.player.x * 2 - boss.x, s.player.z * 2 - boss.z, s).catch(() => {}); await recover(bot); return 'retreated'; }
      await game.stepToward(s.player.x + (s.player.x - boss.x) * 1.5, s.player.z + (s.player.z - boss.z) * 1.5, s).catch(() => {});
      await sleep(rng.between(500, 900));
      for (let i = 0; i < 3 && (await game.snap()).hp < s.maxHp * .8; i++) { await hands.press('h'); await sleep(rng.between(600, 900)); }
      engaged = false; continue;
    }
    if (boss.d > 3.4 || !engaged) {
      if (boss.d < 35 && await game.safe(boss.screen, s) && await game.pick(boss.screen.x, boss.screen.y) === boss.id) { await hands.click(boss.screen.x, boss.screen.y); engaged = true; }
      else await game.stepToward(boss.x, boss.z, s);
      await sleep(rng.between(300, 600)); continue;
    }
    const ready = s.cooldowns.map((c, i) => c <= 0 ? i : -1).filter(i => i >= 0);
    if (ready.length && rng.chance(.6)) await hands.press(['q', 'w', 'e', 'r'][rng.pick(ready)]);
    else if (rng.chance(.4)) await hands.press(' ');
    await sleep(rng.between(180, 380));
  }
  log(`boss: out of time (${dodges} dodges)`);
  return 'boss fight timed out';
}
