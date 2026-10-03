import * as T from 'three';
import { TROPHY_SPOTS } from './house.ts';
import { rarityOf, RARITY_ORDER, type Rarity } from './titles.ts';

/**
 * The memory room's moving parts (house.ts ATTIC): a trophy cup or a hung medal for every title held, coloured by
 * rarity, the title board and the locked gate shown before level 65. The room's floor, walls, pedestals and plaques
 * are part of the static interior (house-view.ts atticPieces).
 */
const shiny = (color: string, glow = 0) => new T.MeshStandardMaterial({ color, metalness: .25, roughness: .28, emissive: color, emissiveIntensity: glow });
const flat = (color: string) => new T.MeshStandardMaterial({ color, roughness: .8 });
const mesh = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; return o; };

/** Metal and ribbon colours per rarity. */
const METAL: Record<Rarity, string> = { bronze: '#d4874a', silver: '#d7dee6', gold: '#ffc93a', rainbow: '#ffffff' };
const RIBBON: Record<Rarity, [string, string]> = { bronze: ['#c8423a', '#f0d27a'], silver: ['#3d7fd6', '#ffffff'], gold: ['#d6303f', '#ffd84a'], rainbow: ['#8a5cff', '#ff7ac8'] };
const GLOW: Record<Rarity, number> = { bronze: .04, silver: .06, gold: .14, rainbow: .3 };
const RAINBOW = ['#ff6b8b', '#ffb84d', '#ffe45c', '#6fe3a0', '#5bb8ff', '#b78cff'];

/** Rainbow pieces: colour the vertices in bands by height. */
function rainbowColours(g: T.BufferGeometry) {
  g.computeBoundingBox(); const box = g.boundingBox!, pos = g.getAttribute('position'), colors = new Float32Array(pos.count * 3), c = new T.Color();
  for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) - box.min.y) / Math.max(1e-6, box.max.y - box.min.y); c.set(RAINBOW[Math.min(RAINBOW.length - 1, Math.floor(t * RAINBOW.length))]); colors.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new T.BufferAttribute(colors, 3)); return g;
}
const metal = (rarity: Rarity) => { const m = shiny(METAL[rarity], GLOW[rarity]); if (rarity === 'rainbow') { m.vertexColors = true; m.emissive.set('#ffffff'); m.emissiveIntensity = .12; } return m; };

/** The cup's outline, turned on a lathe: foot, stem, knot and a deep bowl with a lip. */
const CUP_PROFILE = [[0, 0], [.17, 0], [.17, .05], [.11, .075], [.05, .1], [.038, .18], [.062, .21], [.04, .24], [.07, .27], [.15, .31], [.205, .4], [.225, .52], [.21, .54], [.19, .53], [.17, .42], [.11, .35], [0, .33]].map(([x, y]) => new T.Vector2(x, y));

/** A trophy cup on a dark base with a rarity plate and two handles. */
export function trophyMesh(rarity: Rarity) {
  const g = new T.Group(), m = metal(rarity);
  g.add(mesh(new T.BoxGeometry(.32, .1, .32), flat('#4a3326'), 0, .05, 0));
  g.add(mesh(new T.BoxGeometry(.2, .05, .01), shiny(METAL[rarity === 'rainbow' ? 'gold' : rarity]), 0, .05, .165));
  const cup = new T.LatheGeometry(CUP_PROFILE, 28); if (rarity === 'rainbow') rainbowColours(cup);
  g.add(mesh(cup, m, 0, .1, 0));
  for (const s of [-1, 1]) { const handle = mesh(new T.TorusGeometry(.085, .018, 8, 18, Math.PI), m, s * .2, .53, 0); handle.rotation.set(0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); g.add(handle); }
  if (rarity === 'rainbow') g.add(mesh(new T.OctahedronGeometry(.07), shiny('#ffffff', .6), 0, .72, 0));
  g.scale.setScalar(1.35); return g;
}

/** A medal on a ribbon, hung flat on its wall plaque (+z out of the wall). */
export function medalMesh(rarity: Rarity) {
  const g = new T.Group(), [a, b] = RIBBON[rarity];
  for (const s of [-1, 1]) {
    const strip = mesh(new T.BoxGeometry(.075, .26, .012), flat(a), s * .055, .13, 0); strip.rotation.z = s * .32; g.add(strip);
    const stripe = mesh(new T.BoxGeometry(.022, .26, .014), flat(b), s * .055, .13, .001); stripe.rotation.z = s * .32; g.add(stripe);
  }
  const m = metal(rarity), disc = new T.CylinderGeometry(.13, .13, .035, 32); if (rarity === 'rainbow') rainbowColours(disc.rotateX(Math.PI / 2)); else disc.rotateX(Math.PI / 2);
  g.add(mesh(disc, m, 0, -.06, .01));
  g.add(mesh(new T.TorusGeometry(.13, .016, 8, 32), m, 0, -.06, .03));
  const star = new T.CylinderGeometry(.07, .07, .02, 5); star.rotateX(Math.PI / 2);
  g.add(mesh(star, shiny(rarity === 'rainbow' ? '#ffe45c' : METAL[rarity], GLOW[rarity] + .1), 0, -.06, .035));
  return g;
}

/** The titles given a place: all of them while they fit, else the rarest (the newest among equals), still in the order earned. */
export function shownTrophies(titles: readonly string[]) {
  if (titles.length <= TROPHY_SPOTS.length) return [...titles];
  const rank = (i: number) => RARITY_ORDER.indexOf(rarityOf(titles[i]));
  const keep = new Set([...titles.keys()].sort((a, b) => rank(b) - rank(a) || b - a).slice(0, TROPHY_SPOTS.length));
  return titles.filter((_, i) => keep.has(i));
}

/** The titles shown (shownTrophies), in the order earned: cups on the pedestals first, then medals on the wall plaques. */
export function buildTrophies(titles: readonly string[]) {
  const g = new T.Group(); g.name = 'attic-trophies';
  shownTrophies(titles).forEach((title, i) => {
    const spot = TROPHY_SPOTS[i], rarity = rarityOf(title), item = spot.y < 1 ? trophyMesh(rarity) : medalMesh(rarity);
    item.position.set(spot.x + (spot.y < 1 ? 0 : Math.sin(spot.face) * .05), spot.y, spot.z + (spot.y < 1 ? 0 : Math.cos(spot.face) * .05));
    item.rotation.y = spot.face; item.userData.title = title; g.add(item);
  });
  return g;
}

/** The title board: a framed cork board on legs, a medal of each rarity pinned on it. */
export function titleBoardMesh() {
  const g = new T.Group(), wood = flat('#7a4a2a');
  for (const x of [-.6, .6]) g.add(mesh(new T.BoxGeometry(.09, 1.25, .09), wood, x, .62, 0));
  g.add(mesh(new T.BoxGeometry(1.4, 1, .08), wood, 0, 1.3, 0));
  g.add(mesh(new T.BoxGeometry(1.24, .84, .03), flat('#d9a86a'), 0, 1.3, .05));
  g.add(mesh(new T.BoxGeometry(.7, .14, .03), shiny('#ffd84a', .1), 0, 1.86, .02));
  (['bronze', 'silver', 'gold', 'rainbow'] as Rarity[]).forEach((r, i) => { const medal = medalMesh(r); medal.position.set(-.45 + i * .3, 1.42, .07); medal.scale.setScalar(.85); g.add(medal); });
  return g;
}

/** The locked gate in the study's back doorway before level 65: a picket gate with a padlock. */
export function lockedGateMesh() {
  const g = new T.Group(), wood = flat('#a8693c');
  for (let i = 0; i < 6; i++) g.add(mesh(new T.BoxGeometry(.14, .95, .06), wood, -.62 + i * .25, .48, 0));
  for (const y of [.25, .75]) g.add(mesh(new T.BoxGeometry(1.55, .09, .07), flat('#8a5530'), 0, y, .03));
  g.add(mesh(new T.BoxGeometry(.22, .2, .08), shiny('#ffcf3a', .1), 0, .52, .09));
  g.add(mesh(new T.TorusGeometry(.07, .02, 8, 16, Math.PI), shiny('#c9d1da'), 0, .62, .09));
  return g;
}
