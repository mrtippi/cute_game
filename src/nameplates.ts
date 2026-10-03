import { t } from './i18n.ts';
import { isTitle, rarityOf } from './titles.ts';

/**
 * Nameplates over the explorers, like an MMO: the worn title on a plate dressed by its rarity (copper, brushed silver,
 * gold leaf with laurels, a holographic plate with wings and a little crown), the name under it, and the server
 * champion's red-velvet crown plate (server/champion.mjs) on top of it all. One for the local explorer and one for each
 * remote explorer in view. Plates of explorers standing close stack into tiers (stackPlates). Styles live in style.css
 * (.nameplate); each frame only moves them (transform).
 */
export interface PlateInfo { name: string; title: string; champion?: boolean }
interface PlateWorld {
  screen(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  position: { x: number; z: number };
  remotePlayers?: Map<string, { mesh: { visible: boolean; position: { x: number; y: number; z: number } }; pose: { name?: string; title?: string; champion?: boolean; visual?: { stealth?: boolean; size?: number } } }>;
}

const esc = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const round = (n: number) => Math.round(n * 10) / 10;
/** Pixels per metre at the explorer's head in the default 1080p view: plates are drawn at size 1 there. */
const PLATE_METRE = 42;
/** Where the plate stands: just over the explorer's head (the model stands about 1.93 m). */
const PLATE_Y = 2.2;

/** A point and its heading (degrees) along a quadratic curve. */
function along(P: number[][], s: number) {
  const at = (i: number) => (1 - s) ** 2 * P[0][i] + 2 * (1 - s) * s * P[1][i] + s * s * P[2][i];
  const d = (i: number) => 2 * (1 - s) * (P[1][i] - P[0][i]) + 2 * s * (P[2][i] - P[1][i]);
  return { x: at(0), y: at(1), deg: Math.atan2(d(1), d(0)) * 180 / Math.PI };
}
const leaf = (x: number, y: number, rx: number, ry: number, deg: number) => `<ellipse cx="${round(x)}" cy="${round(y)}" rx="${round(rx)}" ry="${round(ry)}" transform="rotate(${round(deg)} ${round(x)} ${round(y)})"/>`;

/** A laurel branch (left side; the right one is mirrored in CSS): pairs of leaves pointing up along a curved stem. */
const LAUREL = (() => {
  const P = [[26, 50], [0, 38], [13, 3]];
  const leaves = [.08, .22, .36, .5, .64, .78].flatMap(s => {
    const { x, y, deg } = along(P, s), size = 1.1 - s * .35, r = deg * Math.PI / 180;
    return [-1, 1].map(side => { const off = (side < 0 ? 4.2 : 3.2) * size, turn = r + side * .75;
      return leaf(x + Math.cos(turn) * off, y + Math.sin(turn) * off, 2.5 * size, 6 * size, deg - 90 + side * 34); });
  }).join('');
  return `<svg class="np-wing" viewBox="0 0 30 52" aria-hidden="true"><path class="np-stem" d="M${P[0]} Q${P[1]} ${P[2]}" fill="none"/>${leaves}${leaf(13.6, 2.8, 2.2, 4.6, -10)}</svg>`;
})();

/** An angel's wing for the rainbow plate (left side; mirrored in CSS): feathers hanging from an arched bone. */
const FEATHERS = (() => {
  const bone = [[40, 20], [26, -2], [3, 2]], box = [3, 2, 40, 20];
  const feathers = [1, .84, .68, .52, .36, .2].map(s => {
    const { x, y } = along(bone, s), length = 8 + 13 * s, deg = 100 + 38 * s, r = deg * Math.PI / 180;
    for (const [px, py] of [[x, y], [x + Math.cos(r) * length, y + Math.sin(r) * length]]) { box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py); }
    return leaf(x + Math.cos(r) * length * .48, y + Math.sin(r) * length * .48, length / 2, 2.3 + s * 1.2, deg);
  }).join('');
  const [x0, y0, w, h] = [box[0] - 3, box[1] - 4, box[2] - box[0] + 6, box[3] - box[1] + 7].map(round);
  return `<svg class="np-feathers" viewBox="${x0} ${y0} ${w} ${h}" width="${round(w * 1.05)}" height="${round(h * 1.05)}" aria-hidden="true">${feathers}<path d="M${bone[0]} Q${bone[1]} ${bone[2]}" fill="none" stroke="url(#np-feather)" stroke-width="4.5" stroke-linecap="round"/></svg>`;
})();

/** A crown: five points with pearls on a jewelled band. */
const CROWN = (cls: string) => `<svg class="${cls}" viewBox="0 0 40 28" aria-hidden="true"><path class="np-crown-body" d="M4 22 L2 7 L11 14 L15 3 L20 12 L25 3 L29 14 L38 7 L36 22 Z"/><rect class="np-crown-band" x="4" y="21" width="32" height="5" rx="1.5"/>${[[2, 7], [15, 3], [25, 3], [38, 7], [20, 11]].map(([x, y]) => `<circle class="np-pearl" cx="${x}" cy="${y}" r="2.1"/>`).join('')}<circle class="np-jewel" cx="20" cy="23.5" r="2.2"/><circle class="np-jewel np-jewel-side" cx="11" cy="23.5" r="1.5"/><circle class="np-jewel np-jewel-side" cx="29" cy="23.5" r="1.5"/></svg>`;

/** Gradients shared by every plate's SVG pieces (referenced by id from style.css), added once to the label layer. */
export const PLATE_DEFS = `<svg class="np-defs" width="0" height="0" aria-hidden="true"><defs>
<linearGradient id="np-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset=".45" stop-color="#ffd24a"/><stop offset=".55" stop-color="#e3a514"/><stop offset="1" stop-color="#a86e00"/></linearGradient>
<linearGradient id="np-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3cf"/><stop offset=".3" stop-color="#fff0a6"/><stop offset=".55" stop-color="#b6ffd9"/><stop offset=".8" stop-color="#a9d8ff"/><stop offset="1" stop-color="#d9c2ff"/></linearGradient>
<linearGradient id="np-feather" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f3ecff"/><stop offset="1" stop-color="#c9b6ff"/></linearGradient>
</defs></svg>`;

/** The plate's markup for a name, a worn title and the champion's crown (rebuilt only when one of them changes). */
export function plateHtml(info: PlateInfo) {
  const title = isTitle(info.title) ? info.title : '', rarity = title ? rarityOf(title) : '';
  const name = `<div class="np-name">${esc(info.name)}</div>`;
  if (info.champion) return `<div class="np-plate np-champion">${CROWN('np-crown np-crown-big')}${LAUREL}<div class="np-face"><b>${esc(t('Server Champion'))}</b>${title ? `<small>${esc(t(title))}</small>` : ''}</div>${LAUREL}<i class="np-spark"></i><i class="np-spark"></i><i class="np-spark"></i></div>${name}`;
  if (!title) return name;
  const wings = rarity === 'gold' ? LAUREL : rarity === 'rainbow' ? FEATHERS : '', extra = rarity === 'rainbow' ? CROWN('np-crown') : '', sparks = rarity === 'gold' || rarity === 'rainbow' ? '<i class="np-spark"></i><i class="np-spark"></i>' : '';
  return `<div class="np-plate">${extra}${wings}<div class="np-face"><span>${esc(t(title))}</span></div>${wings}${sparks}</div>${name}`;
}

/**
 * A plate on screen: its anchor (bottom centre, where it stands over the head) and its size in screen pixels, whole and
 * name-only (a crowded plate folds to its name).
 */
export interface PlateRect { id: string; x: number; y: number; w: number; h: number; nameW: number; nameH: number }
export interface PlateSpot { lift: number; compact: boolean }
const overlaps = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
/**
 * Plates of explorers standing close would cover each other: the one lowest on screen (nearest the camera) stays over its
 * head and the others climb into tiers above it, `gap` pixels apart. Past `crowd` plates on one spot, the farther ones fold
 * to their name. The order holds from frame to frame (`previous`) unless one plate drops `hold` pixels below another, so
 * plates of explorers walking side by side don't swap tiers back and forth. Pure: rects in, lifts (pixels up) out.
 */
export function stackPlates(rects: readonly PlateRect[], previous: readonly string[] = [], { gap = 4, crowd = 5, hold = 12 } = {}) {
  const rank = new Map(previous.map((id, i) => [id, i])), n = previous.length;
  const key = (r: PlateRect) => r.y + hold * (n - (rank.get(r.id) ?? n));
  const sorted = [...rects].sort((a, b) => key(b) - key(a) || (a.id < b.id ? -1 : 1));
  const spots = new Map<string, PlateSpot>(), placed: { l: number; r: number; t: number; b: number }[] = [], whole: { l: number; r: number; t: number; b: number }[] = [];
  for (const p of sorted) {
    const full = { l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h, b: p.y };
    const compact = whole.filter(o => overlaps(full, o)).length >= crowd; whole.push(full);
    const w = compact ? p.nameW : p.w, h = compact ? p.nameH : p.h, box = { l: p.x - w / 2, r: p.x + w / 2, t: p.y - h, b: p.y };
    // Climb over every placed plate in the way (each step only goes up, so it ends).
    for (let hit = placed.find(o => overlaps(box, o)); hit; hit = placed.find(o => overlaps(box, o))) { box.b = hit.t - gap; box.t = box.b - h; }
    placed.push(box); spots.set(p.id, { lift: p.y - box.b, compact });
  }
  return { order: sorted.map(p => p.id), spots };
}

/** Keeps a nameplate over each explorer: `local` gives the local explorer's plate, or null while it is hidden. */
export function createNameplates(layer: HTMLElement, world: PlateWorld, local: () => PlateInfo | null) {
  layer.insertAdjacentHTML('beforeend', PLATE_DEFS);
  // Each plate's size is measured once when its markup changes (no layout reads per frame); `lift` eases toward its tier.
  const plates = new Map<string, { node: HTMLElement; sig: string; at: string; w: number; h: number; nameW: number; nameH: number; lift: number; compact: boolean; measured: boolean }>(), seen = new Set<string>();
  const shown: { id: string; x: number; y: number; scale: number }[] = [];
  let order: string[] = [], last = 0;
  // Plates measured before the web fonts arrived are measured again.
  document.fonts?.addEventListener?.('loadingdone', () => { for (const plate of plates.values()) plate.measured = false; });
  // The online server tells who holds the champion's crown (online.ts → 'zg-champion'); offline there is none.
  // The champion's id once the server has told it (it also rides in each presence until then).
  let selfChampion = false, championId: string | null | undefined;
  addEventListener('zg-champion', event => { const detail = (event as CustomEvent<{ id?: string | null; self?: boolean }>).detail; selfChampion = !!detail?.self; championId = detail?.id ?? null; });

  function show(id: string, info: PlateInfo, x: number, y: number, z: number, seen: Set<string>) {
    const p = world.screen(x, y, z); if (!p.visible) return;
    // Scale gently with the camera: the screen size of one metre at the head, against the default view's.
    const up = world.screen(x, y + 1, z), scale = Math.max(.85, Math.min(1.2, Math.hypot(up.x - p.x, up.y - p.y) / PLATE_METRE));
    let plate = plates.get(id);
    if (!plate) { const node = document.createElement('div'); node.className = 'nameplate'; layer.append(node); plate = { node, sig: '', at: '', w: 0, h: 0, nameW: 0, nameH: 0, lift: 0, compact: false, measured: false }; plates.set(id, plate); }
    const title = isTitle(info.title) ? info.title : '', sig = `${info.name}|${title}|${!!info.champion}|${t('Server Champion')}`;
    if (plate.sig !== sig) {
      plate.sig = sig; plate.node.innerHTML = plateHtml({ ...info, title }); plate.measured = false;
      // The champion's plate is its own (red velvet): no rarity dressing over it.
      if (title && !info.champion) plate.node.dataset.rarity = rarityOf(title); else delete plate.node.dataset.rarity;
      plate.node.classList.toggle('champion', !!info.champion);
    }
    plate.node.hidden = false; seen.add(id); shown.push({ id, x: p.x, y: p.y, scale });
  }

  return {
    update() {
      seen.clear(); shown.length = 0; const mine = local();
      if (mine) show('self', { ...mine, champion: selfChampion }, world.position.x, PLATE_Y, world.position.z, seen);
      for (const [id, remote] of world.remotePlayers ?? []) {
        const pose = remote.pose; if (!remote.mesh.visible || pose.visual?.stealth || !pose.name) continue;
        const m = remote.mesh.position, size = Math.max(.2, Math.min(4, pose.visual?.size ?? 1));
        show(`remote:${id}`, { name: pose.name, title: pose.title ?? '', champion: championId === undefined ? pose.champion === true : championId === id }, m.x, m.y + PLATE_Y * size, m.z, seen);
      }
      for (const [id, plate] of plates) if (!seen.has(id)) { if (id.startsWith('remote:')) { plate.node.remove(); plates.delete(id); } else { plate.node.hidden = true; plate.lift = 0; } }
      // Sizes of new or changed plates, read once, unfolded (layout is forced only on those frames).
      for (const { id } of shown) {
        const plate = plates.get(id)!; if (plate.measured) continue;
        plate.node.classList.remove('compact'); plate.compact = false;
        const name = plate.node.querySelector<HTMLElement>('.np-name');
        plate.w = plate.node.offsetWidth; plate.h = plate.node.offsetHeight; plate.nameW = name?.offsetWidth ?? plate.w; plate.nameH = name?.offsetHeight ?? plate.h; plate.measured = plate.w > 0;
      }
      const stack = stackPlates(shown.map(({ id, x, y, scale }) => { const plate = plates.get(id)!; return { id, x, y, w: plate.w * scale, h: plate.h * scale, nameW: plate.nameW * scale, nameH: plate.nameH * scale }; }), order);
      order = stack.order;
      // Ease toward the tier (about a tenth of a second), frame-rate independent.
      const now = performance.now(), ease = last ? 1 - Math.exp(-Math.min(.1, (now - last) / 1000) * 14) : 1; last = now;
      for (const { id, x, y, scale } of shown) {
        const plate = plates.get(id)!, spot = stack.spots.get(id)!;
        plate.lift += (spot.lift - plate.lift) * ease; if (Math.abs(spot.lift - plate.lift) < .3) plate.lift = spot.lift;
        if (plate.compact !== spot.compact) { plate.compact = spot.compact; plate.node.classList.toggle('compact', spot.compact); }
        const at = `translate(${Math.round(x)}px,${Math.round(y - plate.lift)}px) translate(-50%,-100%) scale(${scale.toFixed(2)})`;
        if (plate.at !== at) { plate.at = at; plate.node.style.transform = at; }
      }
    },
  };
}
