import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.ts';
import * as P from '../src/progression.ts';
import * as Friends from '../src/friends.ts';
import { CHAPTERS, ARCS, chapterAt } from '../src/story.ts';
import { applyGameAction } from '../src/actions.ts';
import { chapterLines, chapterHeading, lumiHtml } from '../src/lumi.ts';
import { t, setLanguage } from '../src/i18n.ts';
afterEach(() => setLanguage('en'));

const start = Date.UTC(2026, 9, 2, 12);
const reload = (s: M.SaveState) => M.parseSave(JSON.stringify(s))!;
const firstOf = (chapter: number) => P.chapterStart(chapter);

test('星灯りの村: twenty chapters in five arcs, each with Lumi lines, goals and a reward; ranks grow at arc ends', () => {
  assert.equal(CHAPTERS.length, 20); assert.equal(ARCS.length, 5);
  CHAPTERS.forEach((c, i) => {
    assert.equal(c.arc, Math.floor(i / 4), `chapter ${i + 1} arc`);
    assert.ok(c.intro.length && c.outro.length, `chapter ${i + 1} has an opening and a closing`);
    assert.ok(c.goals.length >= 3 && c.goals.length <= 7, `chapter ${i + 1} goal count`);
  });
  assert.deepEqual(CHAPTERS.map(c => c.reward.villageRank ?? 0).filter(Boolean), [2, 3, 4, 5]);
  assert.deepEqual([3, 7, 11, 15].map(i => CHAPTERS[i].reward.villageRank), [2, 3, 4, 5]);
  assert.equal(CHAPTERS.at(-1)!.reward.title, 'Keeper of the Starlight');
  // Friends in the approved order: Sprout, then Pepper, then Clover (King Bear closes arc two).
  const rescues = M.STORY_STEPS.map(s => s.condition).filter(c => c?.startsWith('friend:'));
  assert.deepEqual(rescues, ['friend:sprout', 'friend:pepper', 'friend:clover']);
  assert.equal(M.STORY_STEPS.findIndex(s => s.condition === 'boss:home:bear') > M.STORY_STEPS.findIndex(s => s.condition === 'boss:toy:robot'), true);
  // Steps carry their chapter; the last step of each chapter carries its items; endless rounds follow.
  for (let c = 0; c < CHAPTERS.length; c++) { const steps = M.STORY_STEPS.filter(s => s.chapter === c); assert.equal(steps.length, CHAPTERS[c].goals.length); assert.ok(steps.at(-1)!.end); }
  assert.deepEqual(chapterAt(firstOf(3)), { chapter: 3, first: firstOf(3), last: firstOf(4) - 1 });
  assert.equal(P.storyStep(M.STORY_STEPS.length).chapter, 20); assert.equal(P.storyStep(M.STORY_STEPS.length).event, 'kill');
  assert.equal(M.STORY_STEPS.at(-1)!.condition, 'level'); assert.equal(M.STORY_STEPS.at(-1)!.target, 100);
});

test('arc one plays through with real farming, fishing, fights, orders, the Treant and Sprout, and raises the village', () => {
  const s = M.newGame('Story tester'); let clock = start;
  const farm = () => { const crop = s.level >= 6 ? 'star' : s.level >= 4 ? 'candy' : s.level >= 2 ? 'pumpkin' : 'radish'; M.plantAll(s, crop, clock); clock += M.CROPS[crop].duration; const items = M.harvestAll(s, clock); for (const id of new Set(items)) M.sell(s, id, M.looseQuantity(s, id)); };
  const fund = (amount: number) => { while (s.energy < amount) farm(); };
  const defeat = (type: string, boss = false, count = 1) => { for (let i = 0; i < count; i++) M.grantDefeat(s, type, boss ? 100 : 8, boss, () => 0); };
  const last = firstOf(4);
  for (let index = 0; index < last; index++) {
    const q = P.storyStep(index);
    if (q.event === 'harvest') farm();
    else if (q.event === 'sell') { while (P.progressEntries(s, 'story', clock)[0].progress < q.target) farm(); }
    else if (q.event === 'craft') { fund(30); assert.equal(M.buy(s, 'sword_wood'), true); }
    else if (q.condition === 'equipped') assert.equal(M.equip(s, 'sword_wood'), true);
    else if (q.event === 'kill') defeat('mushroom', false, q.target);
    else if (q.event === 'upgrade') { fund(M.upgradeCost(s, 'attack')); assert.equal(M.upgrade(s, 'attack'), true); }
    else if (q.event === 'fish') { fund(20); assert.equal(M.buy(s, 'rod'), true); M.equip(s, 'rod'); for (let i = 0; i < q.target; i++) assert.equal(M.grantCatch(s, 'fish_perch'), true); }
    else if (q.event === 'skill') for (let i = 0; i < q.target; i++) P.recordEvent(s, 'skill', 1, undefined, clock);
    else if (q.event === 'cook') { if ((s.bag.meat ?? 0) < 3) defeat('mushroom', false, 6); assert.equal(M.cook(s, 'meat', 3), true); }
    else if (q.condition === 'level') { while (s.level < q.target) farm(); }
    else if (q.condition === 'plots') assert.equal(M.expandGarden(s), true);
    else if (q.event === 'order') for (let i = 0; i < q.target; i++) { P.refreshProgress(s, clock); const o = s.progression.orders.list[0]; s.bag[o.item] = (s.bag[o.item] ?? 0) + o.count; assert.ok(P.deliverOrder(s, 0, clock)); }
    else if (q.event === 'boss') defeat('bear', true, q.target);
    else if (q.condition === 'boss:home:treant') { assert.equal(Friends.rescue(s, 'sprout', clock), false, 'the cage stays shut before the Treant falls'); defeat('treant', true); }
    else if (q.condition === 'friend:sprout') assert.equal(Friends.rescue(s, 'sprout', clock), true);
    else if (q.event === 'fruit') { fund(2000); while (s.level < 3) farm(); assert.equal(M.plant(s, 0, 'apple', clock), true); clock += 9 * 3600_000; assert.equal(M.harvest(s, 0, clock), 'apple'); }
    else assert.fail(`unplayed step ${index + 1}: ${q.title}`);
    const e = P.progressEntries(s, 'story', clock)[0];
    assert.equal(e.complete, true, `Step ${index + 1}: ${e.title}`);
    assert.equal(s.progression.villageRank, 1, 'the village grows only when the arc ends');
    assert.equal(P.claimProgress(s, 'story', e.id, clock), true); assert.equal(P.claimProgress(s, 'story', e.id, clock), false);
  }
  assert.equal(s.quest, last); assert.equal(P.storyStep(last).chapter, 4);
  assert.equal(s.progression.villageRank, 2); assert.deepEqual(s.progression.titles, ['Saviour of the Forest']);
  const r = reload(s); assert.equal(r.progression.villageRank, 2); assert.deepEqual(r.progression.titles, ['Saviour of the Forest']); assert.equal(r.quest, last);
});

test('story conditions: one named boss, one rescued friend, Titans on bright stars and the best weapon attack', () => {
  const s = M.newGame(); s.level = 90;
  const at = (condition: string) => { s.progression.story = { index: M.STORY_STEPS.findIndex(x => x.condition === condition), progress: 0 }; return P.progressEntries(s, 'story', start)[0]; };
  assert.equal(at('boss:toy:robot').progress, 0);
  M.grantDefeat(s, 'robot', 10, true, () => .99); assert.equal(at('boss:toy:robot').progress, 0, 'the robot at home is not the Toybox robot');
  s.planet = 'toy'; M.grantDefeat(s, 'robot', 10, true, () => .99); assert.equal(at('boss:toy:robot').complete, true);
  assert.equal(at('friend:pepper').complete, false); assert.equal(Friends.rescue(s, 'pepper', start), true); assert.equal(at('friend:pepper').complete, true);
  s.tiers = { home: { tier: 6, titan: 6 }, candy: { tier: 5, titan: 5 }, ice: { tier: 9, titan: 8 }, lava: { tier: 4, titan: 4 } } as never;
  assert.equal(at('titansAt5').progress, 3); assert.equal(at('titansAt8').progress, 1);
  assert.equal(at('weaponAttack').progress, 0); s.bag.harpoon = 1; assert.equal(at('weaponAttack').progress, 0, 'the harpoon is a hunting tool');
  s.bag.sword_wood = 1; assert.equal(at('weaponAttack').progress, M.ITEMS.sword_wood.attack);
  s.bag.bow_star = 1; assert.equal(at('weaponAttack').complete, M.ITEMS.bow_star.attack! >= 30);
});

test('older saves move to the chapter their level has reached, keeping the ranks and titles they passed', () => {
  const old = M.newGame(), raw = JSON.parse(JSON.stringify(old));
  delete raw.progression.storyVersion; delete raw.progression.villageRank; delete raw.progression.titles; delete raw.progression.lumiSeen;
  raw.progression.storySteps = 149; raw.progression.story = { index: 60, progress: 3 }; raw.level = 30; raw.quest = 60;
  const migrated = M.parseSave(JSON.stringify(raw))!;
  assert.equal(P.storyStep(migrated.progression.story.index).chapter, 7, 'level 30 has passed the level 28 gate of chapter 7');
  assert.deepEqual(migrated.progression.story, { index: firstOf(7), progress: 0 }); assert.equal(migrated.quest, firstOf(7));
  assert.equal(migrated.progression.villageRank, 2); assert.deepEqual(migrated.progression.titles, ['Saviour of the Forest', 'Hero of Toybox']);
  assert.equal(migrated.progression.lumiSeen, 6, "Lumi opens the chapter the player lands in");
  // A brand-new old save starts at the beginning; current saves are left alone.
  raw.level = 1; raw.progression.story = { index: 0, progress: 2 };
  assert.deepEqual(M.parseSave(JSON.stringify(raw))!.progression.story, { index: 0, progress: 0 });
  const current = M.newGame(); current.progression.story = { index: 12, progress: 2 }; current.progression.villageRank = 3; current.progression.lumiSeen = 2;
  const kept = reload(current); assert.deepEqual(kept.progression.story, { index: 12, progress: 2 }); assert.equal(kept.progression.villageRank, 3); assert.equal(kept.progression.lumiSeen, 2);
  // Junk in a save is ignored.
  const junk = JSON.parse(JSON.stringify(current)); junk.progression.villageRank = 99; junk.progression.titles = ['Emperor', 'Bear Breaker', 'Bear Breaker'];
  const clean = M.parseSave(JSON.stringify(junk))!; assert.equal(clean.progression.villageRank, 5); assert.deepEqual(clean.progression.titles, ['Bear Breaker']);
});

test('Lumi closes a finished chapter and opens the next; "seen" never runs ahead of the story', () => {
  assert.deepEqual(chapterLines(-1, 0), CHAPTERS[0].intro);
  assert.deepEqual(chapterLines(3, 4), [...CHAPTERS[3].outro, ...CHAPTERS[4].intro]);
  assert.deepEqual(chapterLines(2, 2), []);
  const s = M.newGame();
  assert.equal(P.markLumiSeen(s, 1), false); assert.equal(P.markLumiSeen(s, 0), true); assert.equal(s.progression.lumiSeen, 0);
  assert.equal(applyGameAction(s, { type: 'lumiSeen', payload: { index: 0 } }, { now: start, random: () => .5 }), true);
  assert.throws(() => applyGameAction(s, { type: 'lumiSeen', payload: { index: 5 } }, { now: start, random: () => .5 }));
  assert.equal(reload(s).progression.lumiSeen, 0);
  const html = lumiHtml(CHAPTERS[3].outro[0], 1, 'x', t); assert.match(html, /data-action="lumi-next"/); assert.match(html, /🌱/);
});

test('every story line, chapter, arc, goal and title reads in Japanese and Vietnamese', () => {
  const strings = new Set<string>(ARCS);
  for (const c of CHAPTERS) { strings.add(c.title); for (const l of [...c.intro, ...c.outro]) strings.add(l.text); for (const g of c.goals) strings.add(g.title); if (c.reward.title) strings.add(c.reward.title); }
  for (const language of ['ja', 'vi'] as const) {
    setLanguage(language);
    for (const text of strings) {
      const out = t(text);
      assert.notEqual(out, text, `${language}: ${text}`);
      if (language === 'ja') assert.ok(!/[A-Za-z]{3,}/.test(out), `English left: ${out}`);
    }
    const heading = chapterHeading(8, t); assert.ok(!heading.arc.includes('Arc') && !heading.title.includes('Nine'), `${language}: ${heading.arc} ${heading.title}`);
  }
});
