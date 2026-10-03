// Fishing like a patient player: cast, leave the nibbles alone, strike on the bite, then pull while
// the line is calm and give slack when the fish surges.
import { equip } from './shopping.mjs';
import { sleep } from '../lib/util.mjs';
const ROD = /rod/;

export const hasRod = s => Object.keys(s.bag).some(id => ROD.test(id) && s.bag[id] > 0) || ROD.test(s.gear.weapon ?? '');

/** Reel one hooked fish. Resolves 'caught', 'escaped' or 'lost' (the round ended some other way). */
async function playRound(bot) {
  const { game, hands, rng } = bot;
  let holding = false, struck = false;
  const end = Date.now() + 90000;
  try {
    while (Date.now() < end) {
      const s = await game.snap(), f = s.fishing;
      if (!f) return struck ? 'caught' : 'lost';
      if (f.phase === 'caught' || f.phase === 'escaped') return f.phase;
      if (f.phase === 'bite' && !struck) {
        await sleep(rng.between(180, 420)); await hands.down(' '); holding = true; struck = true; continue;
      }
      if (f.phase === 'hooked') {
        const ease = f.surge > 0 || f.tension > rng.between(.7, .8), pull = f.surge <= 0 && f.tension < rng.between(.45, .6);
        if (holding && ease) { await hands.up(' '); holding = false; await sleep(rng.between(120, 260)); continue; }
        if (!holding && pull) { await sleep(rng.between(60, 160)); await hands.down(' '); holding = true; continue; }
      }
      await sleep(70);
    }
    return 'lost';
  } finally { if (holding) await hands.up(' '); }
}

/** Catch up to `count` fish at the nearest pond. */
export async function goFishing(bot, { count = 3, timeout = 300000 } = {}) {
  const { game, hands, rng, note, log } = bot;
  const end = Date.now() + timeout; let caught = 0, casts = 0;
  while (caught < count && Date.now() < end && casts < count * 3) {
    const s = await game.snap();
    if (!hasRod(s)) return 'no rod';
    // Holding the harpoon turns a tap on the water into a throw; put a regular weapon in hand first.
    const pond = n => n.entities.filter(e => e.kind === 'fish').sort((a, b) => a.d - b.d)[0];
    // Reach the shore first: on the way the game re-arms its combat weapon (the harpoon, if owned).
    const shore = await game.goTo(pond, { label: 'pond', done: (n, e) => (n.fishing || e && e.d <= e.r + 2.5 && !n.player.moving) && n, timeout: 60000 });
    if (!shore) { log('fishing: could not reach the pond'); break; }
    // A held harpoon stays in hand at the water and a tap would throw it; take the rod from the backpack.
    if (!shore.fishing && shore.gear.weapon === 'harpoon') {
      const rod = Object.keys(shore.bag).filter(id => ROD.test(id) && shore.bag[id] > 0).sort().at(-1);
      if (!rod || !await equip(bot, rod)) return 'harpoon in hand';
    }
    // Tap the water: that casts the line.
    const cast = await game.goTo(pond, { label: 'water', done: n => n.fishing && n, timeout: 20000 });
    if (!cast) { log('fishing: could not cast'); break; }
    casts++;
    const result = await playRound(bot);
    if (result === 'caught') { caught++; note('caught a fish', 'fishing'); await sleep(rng.between(900, 1600)); }
    else log('fishing: ' + result);
    await game.closePanel();
    await hands.think(700);
  }
  return `caught ${caught} in ${casts} casts`;
}
