import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as Friends from '../src/friends.ts';
import { FRIEND_CHAINS, PLANET_TALES, SIDE_TITLES, LEVEL_TITLES } from '../src/side-stories.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const now = Date.UTC(2026, 9, 3, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const side = (s: M.SaveState) => P.progressEntries(s, 'side', now);
const find = (s: M.SaveState, prefix: string) => side(s).find(e => e.id.startsWith(prefix));

test('side stories: three friend chains of five steps, nine planet tales of three, gifts every five levels', () => {
  assert.deepEqual(FRIEND_CHAINS.map(c => [c.id, c.steps.length]), [['sprout', 5], ['pepper', 5], ['clover', 5]]);
  assert.equal(PLANET_TALES.length, 9); assert.ok(PLANET_TALES.every(c => c.steps.length === 3 && c.steps[2].event === 'boss'));
  for (const c of [...FRIEND_CHAINS, ...PLANET_TALES]) for (const st of c.steps) assert.ok(st.event || st.condition, `${c.id}: ${st.title}`);
  assert.deepEqual(Object.keys(LEVEL_TITLES).map(Number), [20, 40, 60, 80, 100]);
  for (const c of [...FRIEND_CHAINS, ...PLANET_TALES]) for (const id of Object.keys({ ...c.keepsake, ...Object.assign({}, ...c.steps.map(s => s.reward ?? {})) })) assert.ok(M.ITEMS[id], `${c.id} gives a real item: ${id}`);
});

test("a friend's chain opens on the rescue, counts from then on, and ends with a title and a keepsake", () => {
  const s = M.newGame(); s.level = 20; s.energy = 1e6;
  P.recordEvent(s, 'harvest', 50, undefined, now);
  assert.equal(find(s, 'friend:'), undefined, 'no chain before the rescue');
  M.grantDefeat(s, 'treant', 10, true, () => .99); assert.equal(Friends.rescue(s, 'sprout', now), true);
  assert.equal(P.sideLine(s, 'friend:sprout')?.who, 'sprout');
  let e = find(s, 'friend:sprout:0')!; assert.equal(e.progress, 0, 'harvests before the rescue do not count');
  P.recordEvent(s, 'harvest', 20, undefined, now); e = find(s, 'friend:sprout:0')!; assert.equal(e.complete, true);
  assert.equal(P.claimProgress(s, 'side', e.id, now), true); assert.equal(P.claimProgress(s, 'side', e.id, now), false);
  P.recordEvent(s, 'fertilize', 5, undefined, now); assert.ok(P.claimProgress(s, 'side', 'friend:sprout:1', now));
  P.recordEvent(s, 'fruit', 5, undefined, now); assert.ok(P.claimProgress(s, 'side', 'friend:sprout:2', now));
  // Step 4 is a condition (beds owned), read live.
  assert.equal(find(s, 'friend:sprout:3')!.progress, s.plots.length);
  while (s.plots.length < 15) assert.ok(M.expandGarden(s));
  assert.ok(P.claimProgress(s, 'side', 'friend:sprout:3', now));
  P.recordEvent(s, 'harvest', 100, undefined, now);
  const decor = s.bag.deco_fruittree ?? 0;
  assert.ok(P.claimProgress(s, 'side', 'friend:sprout:4', now));
  assert.ok(s.progression.titles.includes('Friend of the Garden')); assert.equal(s.bag.deco_fruittree, decor + 1);
  assert.equal(find(s, 'friend:sprout'), undefined, 'a finished chain leaves the list');
  const r = reload(s); assert.equal(r.progression.side['friend:sprout'].step, 5); assert.ok(r.progression.titles.includes('Friend of the Garden'));
});

test('a planet tale opens on discovery and counts only on its own world', () => {
  const s = M.newGame(); s.level = 10;
  assert.equal(find(s, 'tale:candy'), undefined);
  assert.ok(find(s, 'tale:home:0'), 'the home tale opens at level 5');
  s.discovered.push('candy');
  P.recordEvent(s, 'kill', 20, 'mushroom', now);
  assert.equal(find(s, 'tale:candy:0')!.progress, 0, 'kills at home do not count for the Candy Planet');
  assert.equal(find(s, 'tale:home:0')!.progress, 20);
  s.planet = 'candy'; P.recordEvent(s, 'kill', 20, 'gummy', now);
  assert.ok(P.claimProgress(s, 'side', 'tale:candy:0', now));
  P.recordEvent(s, 'mine', 6, undefined, now); assert.ok(P.claimProgress(s, 'side', 'tale:candy:1', now));
  P.recordEvent(s, 'boss', 1, undefined, now); assert.ok(P.claimProgress(s, 'side', 'tale:candy:2', now));
  assert.equal(P.sideGoals(s).some(g => g.key === 'tale:candy'), false);
  assert.equal(P.sideGoals(s).some(g => g.key === 'tale:home'), false, 'a finished step waits for its claim, not for more play');
  assert.ok(P.claimProgress(s, 'side', 'tale:home:0', now));
  assert.ok(P.sideGoals(s).some(g => g.key === 'tale:home' && g.planet === 'home' && g.event === 'fish'));
});

test('level gifts every five levels, with titles at 20 to 100; the next gift waits', () => {
  const s = M.newGame(); s.level = 23;
  const gifts = side(s).filter(e => e.id.startsWith('gift:'));
  assert.deepEqual(gifts.map(e => [e.id, e.complete]), [['gift:5', true], ['gift:10', true], ['gift:15', true], ['gift:20', true], ['gift:25', false]]);
  assert.equal(P.claimProgress(s, 'side', 'gift:25', now), false);
  assert.ok(P.claimProgress(s, 'side', 'gift:20', now)); assert.ok(s.progression.titles.includes('Seasoned Explorer'));
  assert.equal(P.claimProgress(s, 'side', 'gift:20', now), false);
  assert.deepEqual(reload(s).progression.gifts, [20]);
});

test('a complete collection or fish log page gives a title and a keepsake, once', () => {
  const s = M.newGame();
  const toy = () => P.progressEntries(s, 'collection', now).find(e => e.id === 'toy')!;
  assert.equal(toy().complete, false); assert.equal(P.claimProgress(s, 'collection', 'toy', now), false);
  for (const item of M.COLLECTIONS.toy.items) s.collection[item] = 1;
  assert.equal(toy().complete, true); assert.equal(toy().claimed, false);
  assert.ok(P.claimProgress(s, 'collection', 'toy', now)); assert.equal(toy().claimed, true);
  assert.equal(s.bag.deco_teddy, 1); assert.ok(s.progression.titles.includes('Toy Collector'));
  assert.equal(P.claimProgress(s, 'collection', 'toy', now), false);
  const fishIds = Object.keys(M.FISH).filter(id => M.FISH[id].rarity !== 'junk');
  for (const id of fishIds.slice(0, 6)) s.fishRecords[id] = 20;
  assert.ok(P.claimProgress(s, 'collection', 'fishlog:0', now)); assert.ok(s.progression.titles.includes('Junior Angler'));
  assert.equal(P.claimProgress(s, 'collection', 'fishlog:1', now), false);
  const r = reload(s); assert.deepEqual(r.progression.collected, ['toy', 'fishlog:0']);
  const junk = JSON.parse(JSON.stringify(s)); junk.progression.collected.push('nope', 'fishlog:9'); junk.progression.gifts.push(7, 500);
  const clean = M.parseSave(JSON.stringify(junk))!; assert.deepEqual(clean.progression.collected, ['toy', 'fishlog:0']); assert.deepEqual(clean.progression.gifts, []);
});

test('every side story text reads in Japanese and Vietnamese', () => {
  const strings = new Set<string>(['Side stories', 'Friends, worlds and gifts along the way.', ...SIDE_TITLES]);
  for (const c of [...FRIEND_CHAINS, ...PLANET_TALES]) { strings.add(c.name); for (const st of c.steps) { strings.add(st.title); if (st.line) strings.add(st.line.text); } }
  for (const language of ['ja', 'vi'] as const) {
    setLanguage(language);
    for (const text of strings) {
      const out = t(text, { count: 6, planet: t('Candy Planet'), step: 1, level: 20, name: 'x' });
      assert.notEqual(out, text, `${language}: ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(out), `English left: ${out}`);
    }
  }
});
