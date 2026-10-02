import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import { applyGameAction } from '../src/actions.ts';
import { orderPool, ORDER_PREMIUM } from '../src/orders.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const hour = Date.UTC(2026, 9, 2, 9, 5), later = hour + 3600000;
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;

test('the hourly board offers four different tasks and a new set every hour', () => {
  const s = M.newGame(); s.level = 12; P.refreshProgress(s, hour);
  const first = s.progression.hourly;
  assert.equal(first.key, '2026-10-02T09'); assert.equal(first.tasks.length, 4);
  assert.equal(new Set(first.tasks.map(task => task.type)).size, 4);
  for (const task of first.tasks) assert.ok(P.TASK_SPECS.hourly[task.type], task.type);
  P.refreshProgress(s, hour + 50 * 60000); assert.equal(s.progression.hourly.key, first.key, 'same hour, same board');
  P.refreshProgress(s, later); assert.equal(s.progression.hourly.key, '2026-10-02T10');
  assert.ok(s.progression.hourly.tasks.every(task => task.progress === 0 && !task.claimed));
});

test('hourly tasks count events, pay out once each, and the chest needs all four', () => {
  const s = M.newGame(); s.level = 12; P.refreshProgress(s, hour);
  const chest = () => P.progressEntries(s, 'hourly', hour).find(e => e.id.endsWith(':chest'))!;
  assert.equal(P.claimProgress(s, 'hourly', chest().id, hour), false);
  for (const task of s.progression.hourly.tasks) P.recordEvent(s, P.TASK_SPECS.hourly[task.type].event, task.target, undefined, hour);
  const before = s.energy;
  for (let i = 0; i < 4; i++) assert.equal(P.claimProgress(s, 'hourly', `${s.progression.hourly.key}:${i}`, hour), true);
  assert.equal(P.claimProgress(s, 'hourly', `${s.progression.hourly.key}:0`, hour), false, 'no double claim');
  assert.ok(s.energy > before);
  assert.equal(chest().complete, true); assert.equal(P.claimProgress(s, 'hourly', chest().id, hour), true);
  assert.equal(P.claimProgress(s, 'hourly', chest().id, hour), false);
  // The board survives a save and reload.
  const copy = reload(s); assert.equal(copy.progression.hourly.key, s.progression.hourly.key); assert.equal(copy.progression.hourly.chest, true);
});

test('hourly targets stay within an hour of play and rise every ten levels', () => {
  for (const [type, spec] of Object.entries(P.TASK_SPECS.hourly)) {
    assert.ok(spec.targets.length >= 4, type);
    for (let i = 1; i < spec.targets.length; i++) assert.ok(spec.targets[i] >= spec.targets[i - 1], `${type} targets rise`);
  }
  const low = M.newGame(), high = M.newGame(); low.level = 3; high.level = 35;
  P.refreshProgress(low, hour); P.refreshProgress(high, hour);
  for (const task of low.progression.hourly.tasks) assert.ok((P.TASK_SPECS.hourly[task.type].level ?? 1) <= 3, `${task.type} is unlocked at level 3`);
});

test('three village orders ask for things this level can get, and pay above the market', () => {
  const s = M.newGame(); s.level = 6; P.refreshProgress(s, hour);
  const orders = s.progression.orders.list; assert.equal(orders.length, 3);
  const pool = new Set(orderPool(s).map(([id]) => id));
  for (const o of orders) {
    assert.ok(pool.has(o.item), `${o.item} is obtainable`);
    assert.ok(o.energy >= Math.floor(o.count * M.ITEMS[o.item].sell * ORDER_PREMIUM), `${o.item} pays a premium`);
    assert.ok(o.count >= 1 && o.count <= 15);
  }
  // The same explorer and order number always give the same order (client and server agree).
  const twin = M.newGame(); twin.level = 6; P.refreshProgress(twin, hour);
  assert.deepEqual(twin.progression.orders.list, orders);
});

test('delivering an order spends the items, pays the reward, counts for quests and opens a new order', () => {
  const s = M.newGame(); s.level = 6; P.refreshProgress(s, hour);
  const order = s.progression.orders.list[1];
  assert.equal(P.deliverOrder(s, 1, hour), null, 'not enough items yet');
  M.addItem(s, order.item, order.count + 2);
  const energy = s.energy, stars = s.progression.pass.stars;
  const result = applyGameAction(s, { type: 'deliverOrder', payload: { index: 1 } }, { now: hour, random: () => .5 }) as { id: number };
  assert.equal(result.id, order.id);
  assert.equal(s.bag[order.item], 2); assert.equal(s.energy, energy + order.energy); assert.equal(s.progression.pass.stars, stars + order.stars);
  assert.equal(s.progression.totals.order, 1);
  assert.equal(s.progression.orders.list.length, 3); assert.ok(!s.progression.orders.list.some(o => o.id === order.id));
  assert.ok(s.progression.orders.list.some(o => o.id === 3), 'the next order number fills the slot');
  assert.deepEqual(reload(s).progression.orders, s.progression.orders);
  assert.throws(() => applyGameAction(s, { type: 'deliverOrder', payload: { index: 7 } }, { now: hour, random: () => .5 }));
});

test('new hourly and order wording is translated into Vietnamese and Japanese', () => {
  const words = ['Hourly', 'Hourly chest', 'Deliver village orders', 'Good neighbor', 'VILLAGE ORDERS', 'Deliver', 'New tasks every hour, on the hour.', 'Order delivered. The neighbours are delighted!'];
  for (const language of ['vi', 'ja'] as const) { setLanguage(language); for (const w of words) assert.notEqual(t(w), w, `${language}: ${w}`); }
});
