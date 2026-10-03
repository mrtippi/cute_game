// Boss hunting: pick a boss the explorer can beat, get ready (full health, food, a fighting outfit),
// then fight it like a player: close in between its attacks, step out of the red warning circles before
// they land, use skills when ready, back off to eat when health runs low, and collect the loot.
import { fightCost, recover, collectLoot } from './combat.mjs';
import { dress } from './wardrobe.mjs';
import { dodge, dangersOf, inDanger } from '../lib/dodge.mjs';
import { pickSkill, useSkill } from '../lib/skills.mjs';
import { sleep } from '../lib/util.mjs';
import { foodCount } from '../lib/items.mjs';

/** Health the fight would cost (boss skills hit harder than their basic damage), against health plus food. */
export function bossReady(s, boss) {
  const live = s.enemies.find(e => e.id === boss.id);
  if (!live) return false;
  // A fresh boss grows when the explorer outlevels it (world.ts: +12% health, +7% damage per level of difference).
  const diff = live.hp === live.maxHp ? Math.max(0, s.level - live.level) : 0;
  const cost = fightCost(s, { ...live, hp: live.hp * (1 + diff * .12), damage: live.damage * (1 + diff * .07) * 1.6 });
  const reserve = Math.min(foodCount(s), 6) * s.maxHp * .25;
  return live.level <= s.level + (boss.titan ? 0 : 4) && cost < (s.maxHp + reserve) * (boss.titan ? .5 : .7);
}
/** Live bosses on this world worth fighting now, easiest first. */
export function huntable(s) {
  return (s.bosses ?? []).filter(b => b.alive && b.d < 160 && bossReady(s, b))
    .sort((a, b) => Number(a.titan) - Number(b.titan) || a.d - b.d);
}

/** loot: false leaves the drops lying (tasks/coop.mjs shares them with the group first). */
export async function huntBoss(bot, { id, timeout = 240000, loot = true } = {}) {
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
    // A panel opened by a stray tap on the way (the pen, a stall) blocks every click: close it and carry on.
    if (s.modal || s.dialog) { await game.closePanel(); engaged = false; continue; }
    const boss = s.enemies.find(e => e.id === target.id);
    if (!boss) {
      const gone = s.bosses.find(b => b.id === target.id);
      if (gone && !gone.alive) { note(`defeated the boss ${target.name}! (${dodges} dodges)`, 'boss'); await sleep(rng.between(600, 1200)); if (loot) await collectLoot(bot, { range: 22 }); return `defeated ${target.name}`; }
      return 'boss vanished';
    }
    const dangers = dangersOf(s);
    // A red circle under the explorer: run out of it now, whatever else is going on.
    if (dangers.length && inDanger(s.player, dangers)) {
      if (await dodge(bot, { away: boss })) { dodges++; log(`boss: dodged (${dangers.length} circles, hp ${s.hp}/${s.maxHp})`); }
      engaged = false; continue;
    }
    if (s.hp < s.maxHp * .4) {
      // Back off, eat, come back. No food left: retreat for good.
      if (retreats++ >= 4 || !foodCount(s)) { log('boss: retreating'); await game.stepToward(s.player.x * 2 - boss.x, s.player.z * 2 - boss.z, s).catch(() => {}); await recover(bot); return 'retreated'; }
      await game.stepToward(s.player.x + (s.player.x - boss.x) * 1.5, s.player.z + (s.player.z - boss.z) * 1.5, s).catch(() => {});
      await sleep(rng.between(500, 900));
      for (let i = 0; i < 3 && (await game.snap()).hp < s.maxHp * .8; i++) { await hands.press('h'); await sleep(rng.between(600, 900)); }
      engaged = false; continue;
    }
    // Circles close by: wait at their edge until the blow lands, rather than walking back in.
    if (dangers.some(d => Math.hypot(s.player.x - d.x, s.player.z - d.z) < d.r + 4)) { await sleep(rng.between(80, 140)); continue; }
    if (boss.d > 3.4 || !engaged) {
      if (boss.d < 35 && await game.safe(boss.screen, s) && await game.pick(boss.screen.x, boss.screen.y) === boss.id && !await game.lavaStep(boss.x, boss.z, s)) { if (await game.tap(boss.screen.x, boss.screen.y, boss.id)) engaged = true; }
      else await game.stepToward(boss.x, boss.z, s);
      await sleep(rng.between(300, 600)); continue;
    }
    // Spin and slam on the boss (and anything with it); the special whenever ready.
    const skill = pickSkill(s, { swordish: /sword|hammer|scythe/.test(s.gear.weapon ?? ''), target: boss });
    if (skill >= 0) await useSkill(bot, skill);
    else if (rng.chance(.4)) await hands.press(' ');
    await sleep(rng.between(90, 160));
  }
  log(`boss: out of time (${dodges} dodges)`);
  return 'boss fight timed out';
}
