// Making the village one's own: decorations made at the workshop and set out in tidy arrangements, a ring before
// the plaza fountain (village rank 4), a pair by the cottage door, rows along the stepping-stone trails.
import { leaveHouse } from './combat.mjs';
import { sleep, near } from '../lib/util.mjs';
const at = (deg, d) => ({ x: Math.cos(deg * Math.PI / 180) * d, z: Math.sin(deg * Math.PI / 180) * d });
/** village.ts: the fence radius per rank, and the zones decorations must keep off (the plaza paving included). */
const RADII = [18, 22, 28, 34, 40];
const ZONES = [{ rank: 3, ...at(45, 24.2), r: 3.4 }, { rank: 3, ...at(135, 24.2), r: 3.4 }, { rank: 4, ...at(-45, 30.2), r: 3.4 }, { rank: 5, ...at(135, 35.6), r: 3.6 }, { rank: 5, ...at(-45, 36.8), r: 2.4 }];
const PLAZA = ZONES[2];
/** farm.ts: the farmyard oval around the animal pen. */
const PEN = { x: -8.6, z: -5, rx: 4.3, rz: 2.9 };
const placed = s => s.entities.filter(e => e.kind === 'decoration');
const cap = s => s.villageRank >= 4 ? 80 : 40;

/** Decorations in the bag, by id (decor items are all named deco_*). */
export const decorInBag = s => Object.entries(s.bag).filter(([id, n]) => id.startsWith('deco_') && n > 0);

/**
 * Spots in the order they are filled, as groups: a pair stands mirrored across its line (the plaza axis, a trail),
 * a single sits on the line. The plaza ring faces the village (the outer side runs into the fence).
 */
function layouts(s) {
  const out = [];
  if (s.villageRank >= 4) {
    const d = Math.hypot(PLAZA.x, PLAZA.z), ux = -PLAZA.x / d, uz = -PLAZA.z / d;
    const ring = (r, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); return { x: PLAZA.x + r * (ux * c - uz * sn), z: PLAZA.z + r * (uz * c + ux * sn) }; };
    out.push({ name: 'the plaza', face: PLAZA, groups: [[ring(5.6, 0)], ...[24, 48, 72, 96].map(a => [ring(5.6, a), ring(5.6, -a)]), [ring(8.4, 0)], ...[30, 60].map(a => [ring(8.4, a), ring(8.4, -a)])] });
  }
  out.push({ name: 'the cottage', face: { x: 0, z: -8 }, groups: [[{ x: 2.2, z: -2.6 }, { x: -2.2, z: -2.6 }]] });
  // Rows lining each trail out to the fence: the south trail (toward the camera) first.
  const reach = RADII[Math.max(0, Math.min(4, s.villageRank - 1))] - 2.5;
  for (const [ax, az] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const groups = [];
    for (let along = 4.5; along <= reach; along += 3) groups.push([{ x: ax * along + az * 1.9, z: az * along + ax * 1.9 }, { x: ax * along - az * 1.9, z: az * along - ax * 1.9 }]);
    out.push({ name: 'the trail', groups });
  }
  // Then the gates: pairs either side of where each trail meets the fence, spreading along it.
  const rim = reach - .5;
  for (const deg of [90, 0, 180, -90]) out.push({ name: 'the gates', face: { x: 0, z: 0 }, groups: [8, 17, 26].map(off => [at(deg + off, rim), at(deg - off, rim)]) });
  return out;
}

/**
 * A spot that keeps paths, doors, beds, stalls and the farmyard clear, with open ground 3.5 m away to stand on while
 * placing (on screen, not underfoot); the stand is kept on the spot. The game's own check comes last, on the ghost.
 */
async function spotOk(bot, s, p) {
  const rank = s.villageRank ?? 1, limit = RADII[rank - 1] - 1.8;
  if (Math.hypot(p.x, p.z) > limit || Math.abs(p.x) < 1.6 || Math.abs(p.z) < 1.6) return false;
  if (((p.x - PEN.x) / (PEN.rx + 1)) ** 2 + ((p.z - PEN.z) / (PEN.rz + 1)) ** 2 < 1) return false;
  if (ZONES.some(z => z.rank <= rank && Math.hypot(p.x - z.x, p.z - z.z) < z.r + 2)) return false;
  const close = s.entities.filter(e => e.kind !== 'friend' && Math.hypot(e.x - p.x, e.z - p.z) < 12);
  for (const e of close) if (Math.hypot(e.x - p.x, e.z - p.z) < (e.kind === 'plot' ? 2.2 : e.kind === 'decoration' ? 2.1 : e.r + 1.4)) return false;
  // Where to stand: toward the village centre first, then turning aside; never on a bed or in a building.
  const inward = Math.atan2(-p.z, -p.x);
  const stands = [0, .8, -.8, 1.6, -1.6].map(turn => ({ x: p.x + Math.cos(inward + turn) * 3.5, z: p.z + Math.sin(inward + turn) * 3.5 }))
    .filter(q => Math.hypot(q.x, q.z) < limit && close.every(e => Math.hypot(e.x - q.x, e.z - q.z) >= (e.kind === 'plot' ? 1.4 : e.kind === 'decoration' ? 1.2 : e.r + 1)));
  // Trees, rocks and bushes: the spot and a little ring around it must be open ground, and so must the stand.
  const open = await bot.page.evaluate(([{ x, z }, stands]) => [[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]].some(([dx, dz]) => window.__zg.blocked(x + dx, z + dz)) ? -1 : stands.findIndex(q => !window.__zg.blocked(q.x, q.z)), [p, stands]);
  if (open < 0) return false;
  p.stand = stands[open]; return true;
}
const taken = (s, p) => placed(s).find(e => Math.hypot(e.x - p.x, e.z - p.z) < 1.2);

/** Walk to the spot's stand (stopping if a tap went into the cottage). */
async function walkNear(bot, p) {
  const { game } = bot, stand = p.stand;
  let d = 0;
  for (let i = 0; i < 12; i++) {
    const s = await game.snap(); d = Math.hypot(s.player.x - p.x, s.player.z - p.z);
    if (game.indoors(s)) { await leaveHouse(bot); return false; }
    if (d >= 2.5 && d < 6 && Math.hypot(s.player.x - stand.x, s.player.z - stand.z) < 2) return true;
    if (!await game.stepToward(stand.x, stand.z, s)) break;
    await game.waitFor(n => !n.player.moving && n, { timeout: 5000, every: 200 });
  }
  return d >= 2.5 && d < 8;
}

/** One item from the bag to the spot: backpack → Decorate → Place, tap the ground, turn it, ✔ Place. */
async function placeOne(bot, id, p, face) {
  const { game, hands, rng, log } = bot;
  if (!await walkNear(bot, p)) { log(`decor: could not get near ${p.x.toFixed(1)},${p.z.toFixed(1)}`); return false; }
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag')) return false;
  if (!await game.action('decorations') || !await game.waitPanel('decor')) { await game.closePanel(); return false; }
  if (!await game.action('place-decor', { item: id })) { await game.closePanel(); return false; }
  let s = await game.waitFor(n => n.placement && n, { timeout: 3000 });
  if (!s) { await game.closePanel(); return false; }
  const before = placed(s).length;
  // Tap the spot, nudging a little if the ghost turns red there.
  let ok = false, why = 'off screen';
  for (const [dx, dz] of [[0, 0], [.4, 0], [-.4, 0], [0, .4], [0, -.4]]) {
    const screen = await game.project(p.x + dx, p.z + dz);
    if (!await game.safe(screen, s)) continue;
    await hands.click(screen.x, screen.y); await sleep(rng.between(250, 450));
    s = await game.snap(); const g = s.placement;
    // A piece set down on the explorer traps them inside it.
    why = !g?.ok ? 'red' : Math.hypot(g.x - p.x, g.z - p.z) >= .8 ? 'missed' : Math.hypot(s.player.x - g.x, s.player.z - g.z) < 1.8 ? 'on the explorer' : '';
    if (!why) { ok = true; break; }
  }
  if (!ok) { log(`decor: no valid spot at ${p.x.toFixed(1)},${p.z.toFixed(1)} (${why})`); await hands.clickElement(bot.page.locator('#placement-bar [data-action="cancel-decor"]')).catch(() => hands.press('Escape')); return false; }
  // Turn it to face the fountain or the trail (only when the placement's turn can be read; else it keeps the explorer's facing).
  if (face && typeof s.placement.rotation === 'number') {
    const want = Math.atan2(face.x - p.x, face.z - p.z), step = Math.PI / 4;
    const turns = ((Math.round((want - s.placement.rotation) / step) % 8) + 8) % 8;
    for (let i = 0; i < turns; i++) { await hands.clickElement(bot.page.locator('#placement-bar [data-action="rotate-decor"]')); await sleep(rng.between(150, 300)); }
  }
  await hands.think(500);
  await hands.clickElement(bot.page.locator('#placement-bar [data-action="confirm-place"]'));
  const done = await game.waitFor(n => placed(n).length > before && n, { timeout: 4000 });
  if (!done) await hands.press('Escape');
  return !!done;
}

/** A decoration standing on the explorer holds them fast: pack it away from the Decorate panel. */
export async function freeExplorer(bot) {
  const { game, hands, note } = bot;
  const s = await game.snap(), under = placed(s).find(e => Math.hypot(e.x - s.player.x, e.z - s.player.z) < 1.2);
  if (!under) return false;
  await game.closePanel(); await hands.think(400); await hands.press('i');
  if (!await game.waitPanel('bag') || !await game.action('decorations') || !await game.waitPanel('decor')) { await game.closePanel(); return false; }
  const ok = await game.action('remove-decor', { id: under.id.replace('home:decoration:', '') });
  if (ok) note(`packed away the ${under.name} the explorer was stuck in`, 'home');
  await hands.think(400); await game.closePanel();
  return ok;
}

/**
 * Set out a few decorations from the bag where they look planned: mirrored pairs of the same piece, the plaza ring
 * before the trails. Each run carries on where the last arrangement stopped.
 */
export async function decorate(bot, { count = 4 } = {}) {
  const { game, rng, note, log } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  if (game.indoors(s)) await leaveHouse(bot);
  if (await freeExplorer(bot) || game.indoors(s)) s = await game.snap();
  if (!decorInBag(s).length) return 'no decorations in the bag';
  if (placed(s).length >= cap(s)) return 'cannot place more decorations';
  // Spots that failed stay skipped for the session (behind the cottage, out of reach).
  const done = {}, bad = bot.decorBad ??= new Set();
  const bag = Object.fromEntries(decorInBag(s));
  // The piece for a group: the twin of a half already standing, two of a kind for a pair, any for a lone spot (odd
  // ones first, so the rest still come in twos). No match: the group waits for a later run.
  const pieceFor = (group, partner) => {
    const left = Object.entries(bag).filter(([, n]) => n > 0);
    if (partner) return bag[partner] > 0 ? partner : null;
    if (group.length > 1) { const pairs = left.filter(([, n]) => n >= 2); return pairs.length ? rng.pick(pairs)[0] : null; }
    return left.sort((a, b) => b[1] % 2 - a[1] % 2 || b[1] - a[1])[0]?.[0] ?? null;
  };
  const key = p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
  let total = 0;
  for (const layout of layouts(s)) {
    for (const group of layout.groups) {
      if (total >= count || !Object.values(bag).some(n => n > 0) || placed(s).length >= cap(s)) break;
      // A pair is used only when both sides are fit, so the arrangement stays symmetric.
      const fit = [];
      for (const p of group) fit.push(!bad.has(key(p)) && (!!taken(s, p) || await spotOk(bot, s, p)));
      if (fit.includes(false)) continue;
      const open = group.filter(p => !taken(s, p)); if (!open.length) continue;
      const partner = open.length < group.length ? JSON.parse(await game.saveJson()).decorations.find(d => group.some(q => Math.hypot(d.x - q.x, d.z - q.z) < 1.2))?.id : null;
      const id = pieceFor(group, partner); if (!id) continue;
      const face = layout.face ?? { x: (group[0].x + group.at(-1).x) / 2, z: (group[0].z + group.at(-1).z) / 2 };
      for (const p of open) {
        if (total >= count || !(bag[id] > 0)) break;
        if (await placeOne(bot, id, p, face)) { bag[id]--; total++; done[layout.name] = (done[layout.name] ?? 0) + 1; await sleep(rng.between(600, 1200)); }
        else { bad.add(key(p)); log(`decor: skipped ${key(p)}`); break; }
        s = await game.snap();
      }
    }
    if (total >= count) break;
  }
  await game.closePanel();
  const where = Object.keys(done);
  if (total) note(`decorated ${where.join(' and ')} with ${total} piece${total > 1 ? 's' : ''}`, 'home');
  return total ? `placed ${total} by ${where.join(', ')}` : 'nothing placed';
}

/** At the workshop: make decorations the materials allow, two of a kind when possible (they stand in pairs). */
export async function craftDecor(bot, { most = 2, keep = .7 } = {}) {
  const { game, rng, note } = bot;
  const opened = await game.goTo(near('craft'), { label: 'workshop', done: n => n.modal === 'craft' && n });
  if (!opened) return 'workshop not reached';
  // Decorations sit under several tabs (the lava set, the toybox, the ocean and sky sets): look at them all.
  await game.action('craft-tab', { kind: 'All' });
  const recipes = (await bot.page.evaluate(() => window.__zg.recipes())).filter(r => r.result.startsWith('deco_'));
  // Materials a weapon goal still needs are not spent on ornaments (only checkable when recipes list materials).
  const wanted = new Set(Object.keys(bot.gear?.missing ?? {}));
  const usable = r => !r.materials ? !wanted.size : !Object.keys(r.materials).some(id => wanted.has(id));
  let made = 0, pick = null;
  for (let i = 0; i < most; i++) {
    const enabled = await bot.page.$$eval('#dialog [data-action="craft"]:not([disabled])', bs => bs.map(b => ({ index: Number(b.dataset.index), cost: Number(b.textContent.replace(/[^0-9]/g, '')) || 0 })));
    const s = await game.snap(), result = b => recipes.find(r => r.index === b.index).result;
    const options = enabled.filter(b => recipes.some(r => r.index === b.index && usable(r)) && b.cost <= s.energy * (1 - keep));
    // The same again, else the twin of a piece the bag holds alone.
    const twins = options.filter(b => (s.bag[result(b)] ?? 0) % 2 === 1);
    pick = options.find(b => b.index === pick?.index) ?? rng.pick(twins.length ? twins : options);
    if (!pick || !await game.action('craft', { index: pick.index })) break;
    made++; await sleep(rng.between(500, 900));
  }
  if (made) note(`made ${made} decoration${made > 1 ? 's' : ''} at the workshop`, 'workshop'); else bot.decorCraftAt = Date.now();
  await bot.hands.think(500); await game.closePanel();
  return made ? `crafted ${made} decorations` : 'nothing to craft';
}

/** Craft when the bag holds no pair to set out, then place what fits. */
export async function decorateHome(bot, opts = {}) {
  const s = await bot.game.snap(); if (s.planet !== 'home') return 'not home';
  const crafted = decorInBag(s).some(([, n]) => n >= 2) ? '' : await craftDecor(bot);
  const placedNow = await decorate(bot, opts);
  return crafted.startsWith('crafted') && /^(nothing|no )/.test(placedNow) ? crafted : placedNow;
}

/**
 * Worth a visit: room for more, and a pair to set out (any piece once the plaza has lone spots), or energy to craft
 * (after a workshop visit with nothing craftable, not again for half an hour).
 */
export const decorDue = (bot, s) => s.planet === 'home' && placed(s).length < cap(s) && (decorInBag(s).some(([, n]) => n >= 2) || s.villageRank >= 4 && decorInBag(s).length > 0 || s.energy >= 300 && Date.now() - (bot.decorCraftAt ?? 0) > 1800000);
