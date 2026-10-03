import test from 'node:test';
import assert from 'node:assert/strict';
import { stackPlates, type PlateRect } from '../src/nameplates.ts';

// A titled plate 120×60 px with a 70×20 px name; anchors are where each plate stands over its explorer's head.
const plate = (id: string, x: number, y: number): PlateRect => ({ id, x, y, w: 120, h: 60, nameW: 70, nameH: 20 });
const lifts = (rects: PlateRect[], previous?: string[]) => Object.fromEntries([...stackPlates(rects, previous).spots].map(([id, s]) => [id, s.lift]));

test('plates apart stay over their heads', () => {
  assert.deepEqual(lifts([plate('a', 100, 300), plate('b', 400, 300), plate('c', 100, 500)]), { a: 0, b: 0, c: 0 });
});

test('overlapping plates climb into tiers: the lowest on screen stays, the others stack above it with a gap', () => {
  const { spots, order } = stackPlates([plate('far', 110, 290), plate('near', 100, 300), plate('mid', 95, 296)]);
  assert.deepEqual(order, ['near', 'mid', 'far']);
  assert.equal(spots.get('near')!.lift, 0);
  // mid stands 4 px higher; its bottom goes 4 px over near's top (300 - 60).
  assert.equal(296 - spots.get('mid')!.lift, 300 - 60 - 4);
  assert.equal(290 - spots.get('far')!.lift, 300 - 60 - 4 - 60 - 4);
  assert.ok([...spots.values()].every(s => !s.compact));
});

test('a plate only climbs as far as it must: touching just one tier, not the whole column', () => {
  // b overlaps a only a little at the side; c is above both and clear of them.
  const { spots } = stackPlates([plate('a', 100, 300), plate('b', 200, 290), plate('c', 60, 200)]);
  assert.equal(spots.get('b')!.lift, 290 - (300 - 60 - 4));
  assert.equal(spots.get('c')!.lift, 0, 'already clear above a');
});

test('the order holds between frames until one plate drops clearly below the other', () => {
  const first = stackPlates([plate('a', 100, 300), plate('b', 104, 296)]);
  assert.deepEqual(first.order, ['a', 'b']);
  // b drifts a few pixels lower than a: a keeps the bottom tier.
  assert.deepEqual(stackPlates([plate('a', 100, 300), plate('b', 104, 305)], first.order).order, ['a', 'b']);
  // b walks well in front: it takes the bottom tier.
  assert.deepEqual(stackPlates([plate('a', 100, 300), plate('b', 104, 330)], first.order).order, ['b', 'a']);
});

test('more than five plates on one spot: the farther ones fold to their name and stack smaller', () => {
  const rects = Array.from({ length: 8 }, (_, i) => plate(`p${i}`, 100, 300 - i));
  const { spots, order } = stackPlates(rects);
  assert.deepEqual(order, rects.map(r => r.id));
  assert.deepEqual(order.map(id => spots.get(id)!.compact), [false, false, false, false, false, true, true, true]);
  // The first folded plate sits on the fifth tier's top; the next one only a name's height (and a gap) higher.
  const bottom = (id: string, y: number) => y - spots.get(id)!.lift;
  assert.equal(bottom('p5', 295), 300 - 5 * 64);
  assert.equal(bottom('p6', 294), 300 - 5 * 64 - 24);
});

test('lifts come back to zero once the explorers separate', () => {
  const together = stackPlates([plate('a', 100, 300), plate('b', 100, 298)]);
  assert.ok(together.spots.get('b')!.lift > 0);
  const apart = stackPlates([plate('a', 100, 300), plate('b', 400, 298)], together.order);
  assert.deepEqual([...apart.spots.values()].map(s => s.lift), [0, 0]);
});
