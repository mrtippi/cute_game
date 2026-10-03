import { CHAMPION_TITLE, CHAMPION_HOLD_MS } from '../src/titles.ts';
export { CHAMPION_TITLE, CHAMPION_HOLD_MS };

/**
 * The server's champion (サーバーの覇者): the explorer with the highest level among every account on this server,
 * more XP breaking a tie, then the smaller account id so the crown never flickers between equals. A server with a
 * single explorer has no champion. server.mjs checks it every few seconds and shares it in each player's presence,
 * counting only explorers that `active` accepts (online now or seen within CHAMPION_ACTIVE_MS).
 */
const ahead = (a, b) => {
  const x = a.profile, y = b.profile;
  if (x.level !== y.level) return x.level > y.level;
  if ((x.xp || 0) !== (y.xp || 0)) return (x.xp || 0) > (y.xp || 0);
  return String(a.id) < String(b.id);
};
export const CHAMPION_ACTIVE_MS = 24 * 60 * 60 * 1000;
/** Seen within a day: its last own commit (seenAt), its creation, or a sign-in this server remembers. */
export const recentlyActive = (account, now = Date.now(), seenAt = 0) =>
  now - Math.max(Number(account.seenAt) || 0, Number(account.createdAt) || 0, Number(seenAt) || 0) < CHAMPION_ACTIVE_MS;
export function serverChampion(accounts, active = () => true) {
  let best = null, count = 0;
  for (const account of accounts) {
    if (!account?.profile || !active(account)) continue;
    count++; if (!best || ahead(account, best)) best = account;
  }
  return count >= 2 ? best.id : null;
}

/**
 * Time held online, kept on the account record beside the visit ledger. At an hour in all the account keeps the
 * rainbow title for good (worn at once when none is). Returns true when the title is new.
 */
export function holdChampion(account, ms) {
  account.championMs = Math.max(0, Number(account.championMs) || 0) + Math.max(0, Number(ms) || 0);
  const p = account.profile.progression;
  if (account.championMs < CHAMPION_HOLD_MS || p.titles.includes(CHAMPION_TITLE)) return false;
  p.titles.push(CHAMPION_TITLE); p.title ||= CHAMPION_TITLE;
  return true;
}
