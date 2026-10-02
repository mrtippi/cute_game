import type { SaveState } from './model.ts';
import type { World, Entity, Enemy } from './world.ts';
import type { SpaceFlight } from './space.ts';
import { STAR_MAP } from './space.ts';
import { Vector3, type Camera } from 'three';
import { cropProgress, maxHp, readyAnimals, attack, defense, looseQuantity, CROPS, ITEMS } from './model.ts';
import { progressEntries, refreshProgress, storyStep, TASK_SPECS, type ProgressKind } from './progression.ts';

/**
 * A read-only window for the auto-play bot (bot/), enabled only by `?bot` in the page URL.
 * The bot plays through real mouse and keyboard input like a person; this only tells it what a
 * player would see: where things are on screen, which panel is open, how the fishing line feels.
 * Nothing here changes the game.
 */
export const BOT_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('bot');

export interface BotSources {
  state(): SaveState; world(): World; modal(): string; started(): boolean; uiBlocked(): boolean;
  flight(): boolean; shipBusy(): boolean; cooldowns(): readonly number[];
  fishing(): { phase: string; tension: number; surge: number; progress: number } | null;
  /** The ship and the space camera while flying between planets. */
  space(): { flight: SpaceFlight; camera: Camera } | null;
  /** Loot lying on the ground; the pickup magnet takes it when the explorer walks close. */
  drops(): readonly { x: number; z: number; item: string; count: number; age: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;
const KINDS: readonly ProgressKind[] = ['story', 'hourly', 'daily', 'weekly', 'achievements', 'pass', 'bounties', 'challenges'];

export function installBotBridge(src: BotSources) {
  if (!BOT_MODE) return;
  const view = (w: World, x: number, y: number, z: number) => { const p = w.screen(x, y, z); return { x: Math.round(p.x), y: Math.round(p.y), visible: p.visible }; };
  const spaceView = (camera: Camera, x: number, z: number) => { const v = new Vector3(x, 0, z).project(camera); return { x: Math.round((v.x + 1) * innerWidth / 2), y: Math.round((1 - v.y) * innerHeight / 2), visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 }; };
  const space = () => { const sp = src.space(); if (!sp) return null; const f = sp.flight;
    return { x: round(f.x), z: round(f.z), vx: round(f.vx), vz: round(f.vz), speed: round(f.speed), fuel: round(f.fuel), over: f.over?.id ?? null, landing: !!f.landing, autopilot: f.autopilot?.id ?? null, discovered: [...f.discovered],
      screen: spaceView(sp.camera, f.x, f.z),
      planets: Object.values(STAR_MAP).map(p => ({ id: p.id, x: p.x, z: p.z, r: p.r, d: round(Math.hypot(p.x - f.x, p.z - f.z) - p.r) })),
      dust: f.layout.dust.map(d => ({ id: d.id, x: round(d.x), z: round(d.z), d: round(Math.hypot(d.x - f.x, d.z - f.z)) })).sort((a, b) => a.d - b.d).slice(0, 6) }; };
  const entity = (w: World, e: Entity, near: boolean) => ({
    id: e.id, kind: e.kind, name: e.name, x: round(e.x), z: round(e.z), r: round(e.radius), index: e.index, animalUid: e.animalUid, waterId: e.waterId,
    d: round(Math.hypot(e.x - w.position.x, e.z - w.position.z)), screen: near ? view(w, e.x, e.mesh.position.y + .6, e.z) : null,
  });
  const api = {
    snapshot() {
      const s = src.state(), w = src.world(), now = Date.now();
      const dialog = document.querySelector('dialog[open]');
      const reel = document.querySelector<HTMLElement>('#reel-button');
      return {
        now, started: src.started(), modal: src.modal(), dialog: dialog?.id ?? null, uiBlocked: src.uiBlocked(), flight: src.flight(), shipBusy: src.shipBusy(),
        viewport: { w: innerWidth, h: innerHeight },
        planet: s.planet, level: s.level, xp: s.xp, energy: s.energy, hp: Math.round(s.hp), maxHp: Math.round(maxHp(s)), attack: round(attack(s)), defense: round(defense(s)), dropped: !!s.dropped, name: s.name,
        player: { x: round(w.position.x), z: round(w.position.z), moving: w.moving, screen: view(w, w.position.x, 1, w.position.z) },
        selected: w.selected?.id ?? null,
        bag: { ...s.bag }, gear: { ...s.gear }, visited: [...s.visited], discovered: [...s.discovered],
        plots: s.plots.map((p, i) => ({ i, crop: p.crop, progress: round(cropProgress(p, now)) })),
        farm: { built: !!s.farm?.built, animals: s.farm?.animals.length ?? 0, ready: readyAnimals(s, now).length },
        entities: w.entities.filter(e => e.kind !== 'enemy').map(e => entity(w, e, Math.hypot(e.x - w.position.x, e.z - w.position.z) < 60)),
        enemies: w.enemies.filter((e: Enemy) => e.hp > 0).map((e: Enemy) => ({ ...entity(w, e, true), type: e.type, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), boss: e.boss, level: (e as Enemy & { level?: number }).level ?? 1, damage: round(e.damage), cooldown: e.definition?.cooldown ?? 1.5 })),
        fishing: src.fishing(),
        reel: reel && !reel.hidden ? (reel.classList.contains('hunt') ? 'hunt' : reel.classList.contains('cast') ? 'cast' : 'reel') : null,
        cooldowns: src.cooldowns().map(round),
        space: space(),
        orders: (s.progression.orders?.list ?? []).map((o, index) => ({ index, item: o.item, count: o.count, have: looseQuantity(s, o.item), type: ITEMS[o.item]?.type ?? null, energy: o.energy })),
        drops: src.drops().map(d => ({ x: round(d.x), z: round(d.z), item: d.item, count: d.count, age: round(d.age), d: round(Math.hypot(d.x - src.world().position.x, d.z - src.world().position.z)) })).sort((a, b) => a.d - b.d).slice(0, 12),
        bounty: s.progression.bounty ? { type: s.progression.bounty.type, progress: s.progression.bounty.progress, target: s.progression.bounty.target, claimed: s.progression.bounty.claimed } : null,
      };
    },
    /** Journal entries as the player would read them in each tab (claimable ones included). */
    quests() { const s = structuredClone(src.state()); return Object.fromEntries(KINDS.map(kind => [kind, progressEntries(s, kind)])); },
    /** What the journal asks for, as quest events: unfinished daily/weekly tasks and the current story step. */
    goals() {
      const s = structuredClone(src.state()); refreshProgress(s); const p = s.progression, step = storyStep(p.story.index);
      const task = (kind: 'hourly' | 'daily' | 'weekly') => p[kind].tasks.filter(t => !t.claimed && t.progress < t.target).map(t => ({ kind, type: t.type, event: TASK_SPECS[kind][t.type]?.event ?? t.type, progress: t.progress, target: t.target }));
      return { tasks: [...task('hourly'), ...task('daily'), ...task('weekly')], story: { index: p.story.index, event: step.event ?? null, condition: step.condition ?? null, target: step.target, progress: p.story.progress, title: step.title },
        bounty: p.bounty && !p.bounty.claimed ? { type: p.bounty.type, left: p.bounty.target - p.bounty.progress } : null, totals: p.totals };
    },
    /** The game's own walking route to a point (around fences, through the gate), as waypoints. */
    route(x: number, z: number) { const w = src.world(); return w.findPath(new Vector3(x, 0, z)).map(p => ({ x: round(p.x), z: round(p.z) })); },
    /** What a tap at this screen point would select, the way the game picks (id, or null for open ground). */
    pick(x: number, y: number) { const sp = src.space(); if (sp) return null; return src.world().pickEntity(x, y)?.id ?? null; },
    /** Screen position of a world point, for walking toward places outside the view. */
    project(x: number, z: number, y = 0) { const sp = src.space(); return sp ? spaceView(sp.camera, x, z) : view(src.world(), x, y, z); },
    /** Seeds as the planting panel describes them: level, growing time and EXP. */
    seeds() { const s = src.state(); return Object.entries(CROPS).map(([id, c]) => ({ id, level: c.level, unlocked: s.level >= c.level, seconds: c.duration / 1000, xp: c.xp, seed: c.seed ?? null })); },
    /** A healing food in the bag, which the quick-eat button (H) would use. */
    healingFood() { const s = src.state(); return Object.keys(s.bag).find(id => (s.bag[id] ?? 0) > 0 && (ITEMS[id]?.heal ?? 0) > 0 && ITEMS[id]?.type !== 'material') ?? null; },
    /** Shop facts for the given items: price, level, slot and the attack/defense they give. */
    items(ids: string[]) { return Object.fromEntries(ids.filter(id => ITEMS[id]).map(id => { const i = ITEMS[id]; return [id, { price: i.price ?? 0, weapon: i.weapon?.kind ?? null, slot: i.slot ?? null, type: i.type, attack: i.attack ?? 0, defense: i.defense ?? 0, heal: i.heal ?? 0 }]; })); },
    /** A copy of the save, for the bot's daily backup. */
    save() { return JSON.stringify(src.state()); },
  };
  (globalThis as unknown as { __zg: typeof api }).__zg = api;
}
