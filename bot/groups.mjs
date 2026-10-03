// Groups of accounts that play together online (the control app's "Nhóm" column, A–D). Members of a group share the
// start time, days, clip count and scenario mix of the group's leader (the first member id in sort order), start
// together as one unit, and plan the same day (director.mjs: one seed, one plan file), so their `together` clips
// line up by index. While playing, the members meet through small files in the group's folder (tasks/coop.mjs),
// next to the accounts folder: <ZG_ACCOUNTS>/../groups/<group>/.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ACCOUNTS } from './accounts.mjs';

export const GROUPS = ['A', 'B', 'C', 'D'];
/** What every member takes from the group's leader. */
export const SHARED = ['start', 'days', 'clips', 'mix'];
export const GROUPS_DIR = process.env.ZG_GROUPS ?? join(dirname(ACCOUNTS), 'groups');

/** The group of a schedule entry, or null. */
export const groupOf = entry => GROUPS.includes(entry?.group) ? entry.group : null;
/** The members of group `g` in a schedule ({ id: entry }), sorted: the first one leads. */
export const groupMembers = (schedule, g) => Object.keys(schedule).filter(id => groupOf(schedule[id]) === g).sort();
export const leaderOf = members => [...members].sort()[0] ?? null;

/**
 * Members follow their leader: SHARED settings copied from the leader's entry. Returns a new schedule and the members
 * whose settings changed ({ id, group, leader }), for the control app to tell the user.
 */
export function syncGroups(schedule) {
  const out = structuredClone(schedule), followed = [];
  for (const g of GROUPS) {
    const [leader, ...rest] = groupMembers(out, g);
    for (const id of rest) {
      const changed = SHARED.filter(key => JSON.stringify(out[id][key] ?? null) !== JSON.stringify(out[leader][key] ?? null));
      if (!changed.length) continue;
      for (const key of changed) { if (out[leader][key] === undefined) delete out[id][key]; else out[id][key] = structuredClone(out[leader][key]); }
      followed.push({ id, group: g, leader });
    }
  }
  return { schedule: out, followed };
}

/**
 * The accounts to start, as units: an account alone, or with the rest of its group (the members switched on in the
 * schedule; `playing(id)` can leave out more, e.g. accounts no longer playing online). Each account once, in order.
 */
export function startUnits(ids, schedule, playing = () => true) {
  const seen = new Set(), units = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const g = groupOf(schedule[id]);
    const unit = g ? groupMembers(schedule, g).filter(m => m === id || (schedule[m].enabled && playing(m))) : [id];
    unit.forEach(m => seen.add(m)); units.push(unit);
  }
  return units;
}

/** Groups with more members than the machine can run at once: [{ group, size }]. */
export const oversized = (schedule, capacity) => GROUPS.map(g => ({ group: g, size: groupMembers(schedule, g).filter(id => schedule[id].enabled).length })).filter(x => x.size > capacity);

/** The save a group plans its day from: the lowest level and the worlds every member has found (clips.mjs open()). */
export function groupSave(saves) {
  const list = saves.filter(Boolean); if (!list.length) return { level: 1, discovered: ['home'] };
  return { level: Math.min(...list.map(s => s.level ?? 1)), discovered: (list[0].discovered ?? ['home']).filter(id => list.every(s => (s.discovered ?? ['home']).includes(id))) };
}

// ---- the group's folder ---------------------------------------------------------------------------------------
export const groupDir = g => join(GROUPS_DIR, g);
export function readJson(file) { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; } }
/** Written whole (a temporary file, then renamed), so a member reading at the same moment never sees half of it. */
export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value, null, 1)); renameSync(tmp, file);
  return value;
}
