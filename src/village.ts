/**
 * Village rank → the size of Clover Village (story.ts: the crystal's light holds the fence).
 * Rank 1 is the original 18 m village; every arc of the story pushes the fence outward and opens a new zone
 * in the ring of land it gains, on the diagonals between the four gate trails:
 *   rank 2 (22 m) the orchard (north-west), rank 3 (28 m) the pasture (south-east) and a second pond (south-west),
 *   rank 4 (34 m) the decoration plaza (north-east), rank 5 (40 m) the friends' houses (south-west) and the star deck (north-east).
 *
 * zoneAt() and the scenery read the radius of the home being shown (setVillageRank, called when the home world is
 * built); rules about one save (placement, decoration cap, pens, ponds) take the save's own rank.
 */
export const VILLAGE_RADII = [18, 22, 28, 34, 40] as const;
export const MAX_VILLAGE_RANK = VILLAGE_RADII.length;
export const clampRank = (rank: unknown) => typeof rank === 'number' && Number.isFinite(rank) ? Math.max(1, Math.min(MAX_VILLAGE_RANK, Math.floor(rank))) : 1;
export const villageRadius = (rank: unknown) => VILLAGE_RADII[clampRank(rank) - 1];
/** How far from the centre beds and decorations may stand (16.6 m in the original village). */
export const placementRadius = (rank: unknown) => villageRadius(rank) - 1.4;
/** Decorations allowed: the plaza (rank 4) doubles the original 40. */
export const decorationCap = (rank: unknown) => clampRank(rank) >= 4 ? 80 : 40;
/** Extra animals of each kind the pasture (rank 3) makes room for. */
export const pastureBonus = (rank: unknown) => clampRank(rank) >= 3 ? 2 : 0;

let shownRank = 1;
/** The rank of the home currently shown (and simulated) in this process. */
export function setVillageRank(rank: unknown) { shownRank = clampRank(rank); }
export const shownVillageRadius = () => VILLAGE_RADII[shownRank - 1];

export interface VillageZone { id: 'orchard' | 'pasture' | 'pond2' | 'plaza' | 'houses' | 'stardeck'; rank: number; name: string; icon: string; x: number; z: number; r: number }
const at = (deg: number, d: number) => ({ x: Math.round(Math.cos(deg * Math.PI / 180) * d * 100) / 100, z: Math.round(Math.sin(deg * Math.PI / 180) * d * 100) / 100 });
/** The new zones, each in the ring of land its rank adds (angles as atan2(z, x): +x east, +z south). */
export const VILLAGE_ZONES: VillageZone[] = [
  { id: 'orchard', rank: 2, name: 'Starlight Orchard', icon: '🍎', ...at(-135, 19.8), r: 1.8 },
  { id: 'pasture', rank: 3, name: 'Big Pasture', icon: '🐄', ...at(45, 24.2), r: 3.4 },
  { id: 'pond2', rank: 3, name: 'Moon Pond', icon: '🎣', ...at(135, 24.2), r: 3.4 },
  { id: 'plaza', rank: 4, name: 'Decoration Plaza', icon: '⛲', ...at(-45, 30.2), r: 3.4 },
  { id: 'houses', rank: 5, name: "Friends' Houses", icon: '🏘️', ...at(135, 35.6), r: 3.6 },
  { id: 'stardeck', rank: 5, name: 'Star Deck', icon: '🔭', ...at(-45, 36.8), r: 2.4 },
];
export const zonesOpen = (rank: unknown) => VILLAGE_ZONES.filter(z => z.rank <= clampRank(rank));
/** Orchard trees: five along the arc of the orchard zone. */
export const ORCHARD_TREES = [-150, -142, -135, -128, -120].map((deg, i) => ({ index: i, ...at(deg, i % 2 ? 20.6 : 19.2) }));
/** The second pond (rank 3): appended after the original home ponds so their ids stay the same. */
export const MOON_POND: [number, number, number] = [VILLAGE_ZONES[2].x, VILLAGE_ZONES[2].z, 3.4];

/** The orchard: each tree gives fruit once per UTC day; `orchard` keeps the day each tree was last shaken. */
export const ORCHARD_FRUITS = ['apple', 'peach', 'mango', 'lychee', 'grape'] as const;
export const utcDay = (now: number) => Math.floor(now / 86400000);
export function orchardReady(s: { orchard?: Record<string, number>; level?: number; progression?: { villageRank?: number } }, index: number, now = Date.now()) {
  return villageRankFor(s) >= 2 && Number.isInteger(index) && index >= 0 && index < ORCHARD_TREES.length && (s.orchard?.[index] ?? -1) < utcDay(now);
}
export function parseOrchard(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const [k, v] of Object.entries(raw)) if (/^[0-4]$/.test(k) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e6) out[k] = v;
  return out;
}

/**
 * The village only grows when the player is strong enough for it: a rank won in the story opens at its level
 * (rank 2 at level 20, 3 at 45, 4 at 65, 5 at 85). Until then the fence stays where it was.
 */
export const VILLAGE_LEVELS = [1, 20, 45, 65, 85] as const;
type RankHolder = { level?: number; progression?: { villageRank?: number } };
export const earnedRank = (s: RankHolder) => clampRank(s.progression?.villageRank);
export function villageRankFor(s: RankHolder) {
  let byLevel = 1; for (let r = 2; r <= MAX_VILLAGE_RANK; r++) if ((s.level ?? 1) >= VILLAGE_LEVELS[r - 1]) byLevel = r;
  return Math.min(earnedRank(s), byLevel);
}
/** The level at which a rank already won in the story will open, or null when nothing is waiting. */
export function waitingLevel(s: RankHolder) { const open = villageRankFor(s); return earnedRank(s) > open ? VILLAGE_LEVELS[open] : null; }
