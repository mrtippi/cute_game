// The everyday routines: rewards, garden, market, and fighting. Each takes the bot context
// ({ game, hands, rng, log, note }) and returns a short result for the session log.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const JOURNAL_TABS = ['story', 'side', 'hourly', 'daily', 'weekly', 'achievements', 'bounties', 'pass', 'collection'];

/** Anything waiting to be collected in the journal, as the quests() view reports it. */
export async function claimable(game) {
  const q = await game.quests();
  return Object.entries(q).flatMap(([kind, list]) => list.filter(e => e.complete && !e.claimed).map(e => ({ kind, ...e })));
}

export async function claimRewards(bot) {
  const { game, hands, rng, note } = bot;
  const ready = await claimable(game); if (!ready.length) return 'nothing to claim';
  await game.closePanel();
  await hands.think(400); await hands.press('j');
  if (!await game.waitPanel('quests')) return 'journal did not open';
  let claimed = 0;
  const tabs = [...new Set(ready.map(r => r.kind))].sort((a, b) => JOURNAL_TABS.indexOf(a) - JOURNAL_TABS.indexOf(b));
  for (const tab of tabs) {
    await game.action('journal-tab', { kind: tab });
    // Story steps are claimed one at a time; each claim can reveal the next.
    for (let i = 0; i < 12; i++) {
      const done = await game.action('progress-claim') || await game.action('claim');
      if (!done) break; claimed++; await sleep(rng.between(350, 700));
    }
  }
  if (claimed) note(`claimed ${claimed} rewards (${tabs.join(', ')})`, 'reward');
  await hands.think(700); await game.closePanel();
  return `claimed ${claimed}`;
}

/** The best seed for this session: most XP per minute among unlocked seeds that ripen before the end. */
function bestSeed(s, minutesLeft) {
  const crops = s.cropInfo?.filter(c => c.unlocked && c.seconds / 60 < Math.max(3, minutesLeft - 4)) ?? [];
  return crops.sort((a, b) => b.xp / b.seconds - a.xp / a.seconds)[0]?.id;
}

export async function tendGarden(bot, { minutesLeft = 60 } = {}) {
  const { game, rng, note } = bot;
  let s = await game.snap(); if (s.planet !== 'home') return 'not home';
  let harvested = 0, planted = false;
  // A tap on one ripe bed gathers every ripe bed around it.
  for (let i = 0; i < 4; i++) {
    s = await game.snap();
    const ripe = s.plots.filter(p => p.crop && p.progress >= 1).map(p => p.i); if (!ripe.length) break;
    const target = rng.pick(ripe), before = ripe.length;
    await game.goTo(n => n.entities.find(e => e.kind === 'plot' && e.index === target), { label: 'ripe bed', done: n => !n.plots[target].crop, timeout: 30000 });
    s = await game.snap(); harvested += before - s.plots.filter(p => p.crop && p.progress >= 1).length;
  }
  if (harvested) note(`harvested ${harvested} crops`, 'garden');
  s = await game.snap();
  const empty = s.plots.filter(p => !p.crop).map(p => p.i);
  if (empty.length) {
    const target = rng.pick(empty);
    const opened = await game.goTo(n => n.entities.find(e => e.kind === 'plot' && e.index === target), { label: 'empty bed', done: n => n.modal === 'plant' && n });
    if (opened) {
      const seeds = await bot.page.$$eval('#dialog [data-action="plant-all"]:not([disabled])', bs => bs.map(b => b.dataset.item));
      const info = await bot.page.evaluate(() => window.__zg.seeds());
      // A crop a village order asks for (raw or cooked) comes first, then the best for the time left.
      const ordered = s.orders.map(o => o.item.replace(/^cooked_/, '')).filter(id => seeds.includes(id) && s.orders.some(o => o.item.replace(/^cooked_/, '') === id && o.have < o.count));
      const pick = ordered[0] ?? bestSeed({ cropInfo: info.filter(c => seeds.includes(c.id)) }, minutesLeft) ?? seeds[0];
      if (pick && await game.action('plant-all', { item: pick })) { planted = true; note(`planted ${pick} in ${empty.length} beds`, 'garden'); }
      await game.closePanel();
    }
  }
  return `harvested ${harvested}, planted ${planted}`;
}

/** Raw produce sells; cooked meals stay as the explorer's healing food. */
const PRODUCE = id => /^fish_/.test(id) || CROP_IDS.test(id);
const CROP_IDS = /^(radish|carrot|pumpkin|mint|chili|candy|bean|star|berry|coffee|moonflower|magnetmelon|melon|clover|glowshroom|iceberry|goldcorn|dragonfruit|rainbowrose|apple|grape|mango|pineapple|coconut|durian|lychee|peach)$/;

/** At the market: deliver every village order the bag can fill, then sell produce no open order still needs. */
export async function sellProduce(bot) {
  const { game, rng, note } = bot;
  const start = await game.snap();
  const opened = await game.goTo(n => n.entities.find(e => e.kind === 'sell'), { label: 'market', done: n => n.modal === 'sell' && n });
  if (!opened) return 'market not reached';
  let delivered = 0;
  for (let i = 0; i < 3; i++) {
    if (!await game.action('deliver-order')) break;
    delivered++; note('delivered a village order', 'market'); await sleep(rng.between(500, 900));
  }
  const s = await game.snap(), wanted = new Set(s.orders.filter(o => o.have < o.count * 2).map(o => o.item));
  const sellable = await bot.page.$$eval('#dialog [data-action="sell-all"]:not([disabled])', bs => bs.map(b => b.dataset.item));
  let kinds = 0;
  for (const item of sellable.filter(id => PRODUCE(id) && !wanted.has(id))) if (await game.action('sell-all', { item })) { kinds++; await sleep(rng.between(250, 500)); }
  const after = (await game.snap()).energy;
  if (kinds) note(`sold ${kinds} kinds of produce for ${after - start.energy} energy`, 'market');
  await bot.hands.think(500); await game.closePanel();
  return delivered || kinds ? `delivered ${delivered}, sold ${kinds} kinds, +${after - start.energy} energy` : 'nothing to sell';
}

