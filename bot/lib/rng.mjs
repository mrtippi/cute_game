// Seeded randomness for the bot. One seed per day replays a whole session's choices and timings.
export function createRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(String(seed));
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = {
    next,
    between: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: p => next() < p,
    pick: list => list[Math.floor(next() * list.length)],
    /** Gaussian via Box-Muller. */
    normal: (mean = 0, sd = 1) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
    /** Human reaction-style delays: mostly near the median, sometimes much longer. */
    logNormal: (median, spread = .45) => median * Math.exp(spread * rng.normal()),
    shuffle: list => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; },
  };
  return rng;
}
export function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
