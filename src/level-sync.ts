import {tierScale,MAX_TIER} from './planet-tiers.ts';
/**
 * Creatures keep pace with the explorer: below the explorer's level, an unhurt creature rises to the explorer's level
 * -1 to +2 (fixed per creature id), with +12% health, +7% damage and +10% XP per level gained. One rule for offline play
 * (World.syncLevel) and the server (combat-authority.mjs), which uses the highest level among the room's explorers.
 * The Dragon is summoned at its own level and never syncs.
 */
export interface LevelBase {id:string;level:number;maxHp:number;damage:number;xp:number}
/**
 * Planet stars (planet-tiers.ts) raise a creature's ★1 stats (enemy-roster.ts) first: health, damage and XP by tierScale,
 * six levels per star. Level sync then works on top of the starred stats, the same way offline (World.spawnSpecies) and
 * on the server (combat-authority.mjs, at the room's tier).
 */
export function tierStats(base:LevelBase,tier:number):LevelBase{
  const star=tierScale(tier),t=Math.max(1,Math.min(MAX_TIER,tier));
  return {id:base.id,level:base.level+6*(t-1),maxHp:Math.round(base.maxHp*star.hp),damage:base.damage*star.damage,xp:Math.round(base.xp*star.xp)};
}
export const levelOffset=(id:string)=>{let h=0;for(const c of id)h=(h*31+c.charCodeAt(0))>>>0;return h%4-1;};
export function syncedStats(base:LevelBase,explorerLevel:number){
  const level=Math.max(base.level,explorerLevel+levelOffset(base.id)),gain=level-base.level;
  return {level,maxHp:Math.round(base.maxHp*(1+gain*.12)),damage:base.damage*(1+gain*.07),xp:Math.round(base.xp*(1+gain*.1))};
}
/** A boss that engages several explorers: +60% health and +10% damage per extra explorer, on top of its synced level. */
export const partyScale=(players:number)=>({hp:1+.6*Math.max(0,players-1),damage:1+.1*Math.max(0,players-1)});
