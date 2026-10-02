import { PLANETS, type PlanetId } from './content.ts';

/**
 * Planet stars ★1–★10: every world can be replayed harder. A tier makes its creatures tougher and more
 * rewarding; conquering the highest open tier (enough creatures plus one of its bosses, at that tier)
 * opens the next, each also needing a higher explorer level. The explorer picks the tier to play on the
 * star map; it starts at the highest open one. Titans grow with the tier, and the best tier each Titan
 * was beaten on is remembered for quests.
 *
 * Tiers are personal: shared online worlds keep their usual strength (the server roster ignores them).
 */
export const MAX_TIER = 10;
export interface PlanetTier { open: number; chosen: number; kills: number; bosses: number; titan: number }
export type PlanetTiers = Partial<Record<PlanetId, PlanetTier>>;
interface TierHolder { level: number; planet: PlanetId; tiers?: PlanetTiers }

const fresh = (): PlanetTier => ({ open: 1, chosen: 1, kills: 0, bosses: 0, titan: 0 });
export const tierOf = (s: TierHolder, planet: PlanetId = s.planet) => s.tiers?.[planet] ?? fresh();
/** The tier the explorer is fighting on right now. */
export const activeTier = (s: TierHolder, planet: PlanetId = s.planet) => Math.min(tierOf(s, planet).chosen, tierOf(s, planet).open);

/** How much stronger and more rewarding a tier is than ★1. */
export function tierScale(tier: number) {
  const t = Math.max(1, Math.min(MAX_TIER, tier)) - 1;
  return { hp: 1 + .45 * t, damage: 1 + .3 * t, xp: 1 + .35 * t, luck: .08 * t };
}
/** Explorer level needed to play a tier: the planet's landing level, then six more per star. */
export const tierLevel = (planet: PlanetId, tier: number) => (PLANETS[planet]?.level ?? 1) + 6 * (tier - 1);
/** Creatures to defeat on a tier (besides one boss) before the next one opens. */
export const conquestKills = (tier: number) => 30 + 10 * tier;

/**
 * A creature defeated on this planet at the active tier. Counts toward conquering the highest open tier
 * (only when playing it), remembers Titans; returns the newly opened tier, or 0.
 */
export function recordTierKill(s: TierHolder, type: string, boss: boolean): number {
  const planet = s.planet; if (!PLANETS[planet]) return 0;
  const t = { ...tierOf(s, planet) }, tier = activeTier(s, planet);
  if (type.startsWith('titan_')) t.titan = Math.max(t.titan, tier);
  let opened = 0;
  if (tier === t.open && t.open < MAX_TIER) {
    if (boss) t.bosses++; else t.kills++;
    if (t.kills >= conquestKills(tier) && t.bosses >= 1 && s.level >= tierLevel(planet, tier + 1)) {
      t.open++; opened = t.open; t.kills = 0; t.bosses = 0;
      if (t.chosen === tier) t.chosen = t.open;    // keep climbing unless the explorer chose an easier tier
    }
  }
  (s.tiers ??= {})[planet] = t;
  return opened;
}

/** Choose the tier to play on a planet: any open tier the explorer's level allows. */
export function setTier(s: TierHolder, planet: PlanetId, tier: number) {
  const t = tierOf(s, planet);
  if (!PLANETS[planet] || !Number.isInteger(tier) || tier < 1 || tier > t.open || s.level < tierLevel(planet, tier)) return false;
  (s.tiers ??= {})[planet] = { ...t, chosen: tier };
  return true;
}

/** Stars earned across all worlds (★1 everywhere counts as none). */
export const starsEarned = (s: TierHolder) => Object.values(s.tiers ?? {}).reduce((n, t) => n + (t ? t.open - 1 : 0), 0);
/** Titans beaten on at least this tier. */
export const titansAtTier = (s: TierHolder, tier: number) => Object.values(s.tiers ?? {}).filter(t => t && t.titan >= tier).length;

export function parseTiers(raw: unknown): PlanetTiers {
  const out: PlanetTiers = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const int = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isInteger(v) ? Math.max(min, Math.min(max, v)) : fallback;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Object.hasOwn(PLANETS, id) || !v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>, open = int(r.open, 1, MAX_TIER, 1);
    out[id as PlanetId] = { open, chosen: int(r.chosen, 1, open, open), kills: int(r.kills, 0, 1e6, 0), bosses: int(r.bosses, 0, 1e6, 0), titan: int(r.titan, 0, MAX_TIER, 0) };
  }
  return out;
}
