// Small helpers shared by the bot's tasks and scripts: waiting, the nearest thing of a kind, the enabled buttons of
// the open panel, the save, counting the bag, and the check that keeps every game address on this PC.
// No Playwright here: accounts.mjs (loaded by the control app's main process) uses assertLocal too.

export const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));

/** A goTo target: the nearest entity of a kind in a snapshot. */
export const near = kind => n => n.entities.filter(e => e.kind === kind).sort((a, b) => a.d - b.d)[0];
/** One data-* value of every enabled `action` button in the open panel. */
export const enabled = (bot, action, attr) => bot.page.$$eval(`#dialog [data-action="${action}"]:not([disabled])`, (bs, attr) => bs.map(b => b.dataset[attr]), attr);
/** The game's save as an object (bot bridge). */
export const readSave = bot => bot.page.evaluate(() => JSON.parse(window.__zg.save()));

/** How many items in the bag pass `test(id)`. */
export const count = (bag, test) => Object.entries(bag).filter(([id]) => test(id)).reduce((n, [, c]) => n + c, 0);
/** Every item in the bag. */
export const bagTotal = s => Object.values(s.bag).reduce((n, v) => n + v, 0);

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);
/** Throws unless the address is a server on this machine (127.0.0.1 / localhost). */
export function assertLocal(url) {
  let host; try { host = new URL(url).hostname; } catch { throw new Error(`not a game address: ${url}`); }
  if (!LOCAL.has(host)) throw new Error(`online play only on this PC's own server (127.0.0.1), not ${host}`);
  return url;
}
