import { ITEMS, CROPS, FISH, FISH_WEIGHTS, LOOT_TABLES, PLANETS, type ItemId } from './content.ts';
import { ANIMALS } from './farm.ts';
import type { SaveState } from './model.ts';

/**
 * Village orders at the harvest market: neighbours ask for something the explorer can make or find at
 * their level (a dish, crops, fish, animal produce, creature materials) and pay well above the market
 * price. A delivered order is replaced at once, so there is always something worth growing, cooking
 * or catching. Orders are derived from (name, order number), so client and server agree on them.
 */
export interface Order { id: number; item: ItemId; count: number; energy: number; xp: number; stars: number }
export interface OrdersState { next: number; list: Order[] }
export const ORDER_SLOTS = 3;
/** Orders pay this much more than selling the same items. */
export const ORDER_PREMIUM = 1.6;

function hash(text: string) { let value = 2166136261; for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; }

/** What a neighbour may ask for at this level, each with a weight. */
export function orderPool(s: SaveState): [ItemId, number][] {
  const pool: [ItemId, number][] = [];
  const add = (id: string, weight: number) => { if (Object.hasOwn(ITEMS, id) && ITEMS[id].sell > 0) pool.push([id, weight]); };
  for (const [id, crop] of Object.entries(CROPS)) {
    if (crop.level > s.level || crop.seed || crop.duration > 3600000) continue;   // short, seedless crops only
    add(id, 3); add(`cooked_${id}`, 4);
  }
  for (const [id] of FISH_WEIGHTS[s.planet] ?? FISH_WEIGHTS.home) if (FISH[id]?.rarity === 'common') { add(id, 2); add(`cooked_${id}`, 2); }
  if (s.farm?.built) for (const a of Object.values(ANIMALS)) if (a.level <= s.level && a.product && a.product !== 'guard') add(a.product, 3);
  // Materials dropped by creatures of the worlds the explorer can already land on.
  const types = new Set(Object.values(PLANETS).filter(p => p.level <= s.level).flatMap(p => p.spawns.map(([type]) => type)));
  for (const type of types) for (const [id, chance] of LOOT_TABLES[type] ?? []) if (chance >= .25) add(id, 1);
  return pool;
}

/** The order with this number for this explorer; its size grows with level. */
export function makeOrder(s: SaveState, id: number, xpNeeded: (level: number) => number): Order | null {
  const pool = orderPool(s); if (!pool.length) return null;
  const total = pool.reduce((n, [, w]) => n + w, 0); let draw = hash(`${s.name}:order:${id}`) % 10000 / 10000 * total, item = pool[0][0];
  for (const [candidate, weight] of pool) { draw -= weight; if (draw <= 0) { item = candidate; break; } }
  const sell = ITEMS[item].sell, budget = 80 + s.level * 14;
  // Creature materials come a few per fight, so their orders stay small.
  const cap = ITEMS[item].type === 'material' ? 6 : 15, count = Math.max(1, Math.min(cap, Math.round(budget / sell)));
  return { id, item, count, energy: Math.round(count * sell * ORDER_PREMIUM + 10), xp: Math.round(xpNeeded(s.level) * .05 + count * 2), stars: 5 };
}

/** Keep three open orders, numbering new ones in sequence. */
export function fillOrders(s: SaveState, orders: OrdersState, xpNeeded: (level: number) => number) {
  orders.list = orders.list.filter(o => Object.hasOwn(ITEMS, o.item));
  while (orders.list.length < ORDER_SLOTS) { const order = makeOrder(s, orders.next++, xpNeeded); if (!order) break; orders.list.push(order); }
}

export function parseOrders(raw: unknown): OrdersState {
  const result: OrdersState = { next: 0, list: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const r = raw as Record<string, unknown>, int = (v: unknown, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? Math.min(v, max) : 0;
  result.next = int(r.next, 1e9);
  if (Array.isArray(r.list)) for (const o of r.list.slice(0, ORDER_SLOTS)) {
    if (!o || typeof o !== 'object') continue;
    const v = o as Record<string, unknown>;
    if (typeof v.item !== 'string' || !Object.hasOwn(ITEMS, v.item)) continue;
    result.list.push({ id: int(v.id, 1e9), item: v.item, count: Math.max(1, int(v.count, 99)), energy: int(v.energy, 1e7), xp: int(v.xp, 1e7), stars: int(v.stars, 100) });
  }
  return result;
}
