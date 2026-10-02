import * as T from 'three';
import { cropKit } from './assets.ts';
import { farmKit } from './farm-view.ts';
import { FRIENDS, FRIEND_IDS, type FriendId } from './friends-state.ts';
import { ORCHARD_TREES, VILLAGE_ZONES, villageRankFor, orchardReady, type VillageZone } from './village.ts';
import type { SaveState } from './model.ts';

/**
 * The zones a growing village opens (village.ts), built into the home world: the orchard's fruit trees, the pasture,
 * the decoration plaza, the friends' houses and the star deck. The Moon Pond is a regular pond (World.makePond).
 * Everything here is fixed geometry with no randomness, so the wild creatures and scenery placed after it stay put.
 */
export interface VillageHost {
  root: T.Group; state: SaveState;
  addEntity(kind: string, name: string, icon: string, model: T.Group, x: number, z: number, radius?: number, index?: number): unknown;
  obstacle(x: number, z: number, r: number): void;
  kit(name: string): T.Group | null;
  house(): T.Group;
}

const mat = (color: string) => new T.MeshStandardMaterial({ color, roughness: .85 });
const mesh = (g: T.BufferGeometry, color: string, x = 0, y = 0, z = 0) => { const m = new T.Mesh(g, mat(color)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const box = (color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0) => mesh(new T.BoxGeometry(w, h, d), color, x, y, z);
const cyl = (color: string, top: number, bottom: number, h: number, x = 0, y = 0, z = 0, sides = 12) => mesh(new T.CylinderGeometry(top, bottom, h, sides), color, x, y, z);
const ball = (color: string, r: number, x = 0, y = 0, z = 0) => mesh(new T.IcosahedronGeometry(r, 1), color, x, y, z);
const group = (...children: T.Object3D[]) => { const g = new T.Group(); if (children.length) g.add(...children); return g; };
const place = (host: VillageHost, model: T.Object3D | null, x: number, z: number, rotation = 0, scale = 1) => { if (!model) return; model.position.set(x, 0, z); model.rotation.y = rotation; model.scale.setScalar(scale); host.root.add(model); };
const zone = (id: VillageZone['id']) => VILLAGE_ZONES.find(z => z.id === id)!;
const FRUITS = ['apple', 'peach', 'mango', 'lychee', 'grape'];

/** A fruit tree of the orchard: the fruit-crop model grown tall, or a round tree with fruit on it. */
function fruitTree(index: number, ready: boolean) {
  const model = cropKit.ready ? cropKit.instance('crop_' + FRUITS[index % FRUITS.length]) : null;
  if (model) { model.scale.setScalar(ready ? 1.7 : 1.5); return group(model); }
  const g = group(cyl('#9a6a3f', .16, .22, 1.5, 0, .75), ball('#6cc24a', 1.05, 0, 2.05));
  // Fruit hangs on the outside of the crown (marked so a shake can drop it: main.ts hides userData.fruit).
  if (ready) for (let i = 0; i < 8; i++) { const a = i * .785 + index, y = 1.75 + (i % 3) * .3, r = Math.sqrt(Math.max(0, 1.12 ** 2 - (y - 2.05) ** 2)); const fruit = ball(['#ff4d4d', '#ffa63d', '#9b59d0', '#ff7aa8', '#ffd84a'][index % 5], .17, Math.cos(a) * r, y, Math.sin(a) * r); fruit.userData.fruit = true; g.add(fruit); }
  return g;
}

export function buildVillageZones(host: VillageHost, now = Date.now()) {
  const rank = villageRankFor(host.state);
  if (rank >= 2) {
    // The orchard: five fruit trees to shake once a day, around a little sign.
    for (const t of ORCHARD_TREES) { host.addEntity('orchard', 'Fruit tree', '🍎', fruitTree(t.index, orchardReady(host.state, t.index, now)), t.x, t.z, 1.2, t.index); host.obstacle(t.x, t.z, .55); }
    const o = zone('orchard'); place(host, host.kit('flowers'), o.x + 1.1, o.z + 1.1, 0, 1.2); place(host, host.kit('tuft'), o.x - 1, o.z + 1.4);
  }
  if (rank >= 3) {
    // The pasture: a fenced meadow with hay and troughs (the animals' extra room, village.ts pastureBonus).
    const p = zone('pasture');
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2; if (i === 9) continue;   // the opening faces the village centre
      const fence = farmKit.ready ? farmKit.instance('pen_fence') : group(box('#c79a5e', .12, .8, .12, -.7, .4), box('#c79a5e', .12, .8, .12, .7, .4), box('#e8c27c', 1.6, .1, .08, 0, .55));
      place(host, fence, p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r, -a - Math.PI / 2, farmKit.ready ? .9 : 1);
      host.obstacle(p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r, .45);
    }
    const hay = () => farmKit.ready ? farmKit.instance('hay_bale') : group(cyl('#e7c35a', .45, .45, .8, 0, .45));
    place(host, hay(), p.x - 1.2, p.z - .6, .4); place(host, hay(), p.x - .3, p.z - 1.4, 1.2); host.obstacle(p.x - .8, p.z - 1, .8);
    place(host, farmKit.ready ? farmKit.instance('water_trough') : group(box('#8a6a45', 1.4, .45, .6, 0, .25), box('#6cc8f0', 1.2, .05, .45, 0, .48)), p.x + 1.2, p.z + .4, .8); host.obstacle(p.x + 1.2, p.z + .4, .6);
    place(host, farmKit.ready ? farmKit.instance('cow') : null, p.x + .2, p.z + 1.3, 2.2, .9);
  }
  if (rank >= 4) {
    // The decoration plaza: a round paved square with a fountain and lamp posts (the decoration cap doubles).
    const q = zone('plaza');
    const paving = cyl('#e9dcc0', q.r, q.r, .06, 0, .03, 0, 28); paving.receiveShadow = true; place(host, group(paving), q.x, q.z);
    place(host, group(cyl('#b9c4cf', 1.1, 1.25, .5, 0, .25, 0, 16), cyl('#7fd3f5', .95, .95, .05, 0, .52, 0, 16), cyl('#b9c4cf', .18, .25, 1.1, 0, .9), ball('#9fe3ff', .28, 0, 1.55)), q.x, q.z); host.obstacle(q.x, q.z, 1.25);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = q.x + Math.cos(a) * (q.r - .5), z = q.z + Math.sin(a) * (q.r - .5);
      place(host, group(cyl('#4c5560', .07, .09, 2, 0, 1), ball('#fff1a8', .2, 0, 2.1)), x, z); host.obstacle(x, z, .2); }
  }
  if (rank >= 5) {
    // The friends' houses: one small cottage for each friend brought home.
    const h = zone('houses'), home = new Set((host.state.friends ?? []).map(f => f.id));
    (['sprout', 'pepper', 'clover'] as FriendId[]).forEach((id, i) => {
      if (!home.has(id)) return;
      const a = Math.atan2(h.z, h.x) + (i - 1) * .2, dist = Math.hypot(h.x, h.z), x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      const cottage = host.house(); cottage.scale.setScalar(.42); cottage.rotation.y = -a - Math.PI / 2 + Math.PI;
      const tint = new T.Color(FRIENDS[id].tint); cottage.traverse(o => { if (o instanceof T.Mesh && o.position.y > 1.5 && o.material instanceof T.MeshStandardMaterial) { o.material = o.material.clone(); o.material.color.lerp(tint, .45); } });
      host.addEntity('friendhouse', `${FRIENDS[id].name}'s house`, '🏠', cottage, x, z, 1.4, FRIEND_IDS.indexOf(id)); host.obstacle(x, z, 1.2);
    });
    // The star deck: a raised wooden platform with a telescope that opens the star map.
    const d = zone('stardeck');
    const deck = group(cyl('#a87a4d', d.r, d.r, .4, 0, .2, 0, 10), cyl('#c99a63', d.r - .15, d.r - .15, .06, 0, .43, 0, 10), cyl('#5a6170', .06, .06, 1.2, 0, 1.05), cyl('#3d4656', .16, .22, 1.3, .3, 1.75), ball('#ffe48a', .12, .82, 2.05));
    deck.children[3].rotation.z = -.9;
    host.addEntity('stardeck', 'Star deck', '🔭', deck, d.x, d.z, d.r); host.obstacle(d.x, d.z, d.r - .3);
  }
}
