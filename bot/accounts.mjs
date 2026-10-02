// Accounts: each one is a folder under bot-data/accounts/<id>/ (the id names the folder and the clip files) with
// account.json (the explorer's Japanese name, colour, play style, debugging port), its own Chrome profile (the save),
// its days of clips and its videos. The explorer's name in the game stays Japanese; the folder id tells the clips apart.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

export const ACCOUNTS = process.env.ZG_ACCOUNTS ?? 'D:/autogame/bot-data/accounts';
/** The six explorer colours of the game (src/model.ts COLORS), in its order. */
export const COLORS = { blue: '#4aa8ff', pink: '#ff7ab0', green: '#6fd35a', orange: '#ffb13d', purple: '#a07bff', red: '#ff5a5a' };

export const paths = id => ({ dir: `${ACCOUNTS}/${id}`, profile: `${ACCOUNTS}/${id}/profile`, days: `${ACCOUNTS}/${id}/days`, videos: `${ACCOUNTS}/${id}/videos`, file: `${ACCOUNTS}/${id}/account.json` });
export const listAccounts = () => existsSync(ACCOUNTS) ? readdirSync(ACCOUNTS).filter(id => existsSync(paths(id).file)).map(loadAccount) : [];
export function loadAccount(id) {
  const p = paths(id); if (!existsSync(p.file)) throw new Error(`no account "${id}" (create it: node fleet.mjs new ${id} <名前> <colour>)`);
  return { ...JSON.parse(readFileSync(p.file, 'utf8')), ...p };
}

/**
 * A new account: folder id (letters, digits, - and _), the explorer's Japanese name, a colour (a COLORS key or #hex)
 * and an optional play style (extra weight for clip themes, e.g. { fishing: 2 }). Each gets its own debugging port.
 */
export function createAccount(id, name, color = 'blue', style = {}) {
  if (!/^[a-z0-9_-]{2,24}$/i.test(id)) throw new Error('the folder id takes 2-24 letters, digits, - or _');
  const p = paths(id); if (existsSync(p.file)) throw new Error(`account "${id}" exists already`);
  const hex = COLORS[color] ?? color; if (!Object.values(COLORS).includes(hex)) throw new Error(`colour must be one of ${Object.keys(COLORS).join(', ')}`);
  const port = 9340 + listAccounts().length;
  for (const dir of [p.dir, p.profile, p.days, p.videos]) mkdirSync(dir, { recursive: true });
  const account = { id, name: name.slice(0, 20), color: hex, style, port, created: new Date().toISOString().slice(0, 10) };
  writeFileSync(p.file, JSON.stringify(account, null, 1));
  return { ...account, ...p };
}
