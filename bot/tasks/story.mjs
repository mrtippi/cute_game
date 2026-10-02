// The story (星灯りの村): Lumi's lines are read at a reading pace and moved on with the "Next" button, and an
// open cage (its boss beaten) is walked to and opened, the way a player answers the story.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Read Lumi's dialogue line by line: a pause that fits each line's length, then "Next". */
export async function readLumi(bot) {
  const { game, page, hands, rng, note } = bot;
  for (let i = 0; i < 12; i++) {
    const s = await game.snap(); if (s.lumi == null) return i;
    if (i === 0) note('Lumi speaks', 'story');
    await sleep(Math.min(6000, 1200 + s.lumi.length * rng.between(28, 45)));
    const next = page.locator('#lumi .lumi-next').first();
    if (await next.count() && await next.isVisible()) await hands.clickElement(next); else return i;
    await sleep(rng.between(250, 500));
  }
  return 12;
}

/** Cages whose boss has been beaten show the friend's name; walk there and open the door. */
export const openCages = s => s.entities.filter(e => e.kind === 'cage' && e.name !== 'Locked cage');

export async function rescueFriend(bot) {
  const { game, note } = bot;
  const before = (await game.snap()).friends.length;
  const cage = openCages(await game.snap())[0]; if (!cage) return 'no open cage';
  const done = await game.goTo(n => n.entities.find(e => e.id === cage.id), { label: 'cage', done: n => n.friends.length > before && n });
  if (!done) return 'cage not reached';
  note(`rescued ${cage.name}!`, 'story');
  await sleep(2500);   // the friend steps out cheering
  return `rescued ${cage.name}`;
}

/** The orchard (village rank 2): walk along the fruit trees that still have fruit today and shake each one. */
export async function shakeOrchard(bot) {
  const { game, note, rng } = bot;
  let shaken = 0;
  for (const index of rng.shuffle((await game.snap()).orchard)) {
    const done = await game.goTo(n => n.entities.find(e => e.kind === 'orchard' && e.index === index), { label: 'fruit tree', done: n => !n.orchard.includes(index) && n });
    if (!done) break;
    shaken++; await sleep(rng.between(500, 1100));
  }
  if (shaken) note(`shook ${shaken} orchard trees`, 'garden');
  return `shook ${shaken}`;
}
