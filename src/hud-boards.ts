import { ENEMY_TYPES } from './enemy-types.ts';
import { progressEntries, type ProgressKind } from './progression.ts';
import type { SaveState } from './model.ts';
import type { Enemy } from './world.ts';

/**
 * Two small HUD boards under the bounty tracker:
 * - Bosses on this world: out now (with distance), the respawn countdown, or waiting for the explorer to
 *   walk away (a defeated boss only returns when nobody is within 22 m of its den).
 * - The quest board: unfinished hourly, daily and weekly tasks with progress; finished ones disappear.
 */
type Translate = (text: string, params?: Record<string, string | number>) => string;
const esc = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const clock = (seconds: number) => { const s = Math.ceil(seconds); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export const trackedBosses = (enemies: readonly Enemy[]) => enemies.filter(e => e.boss && e.type !== 'dragon' && e.respawn < 999999);

export function bossTimesHtml(enemies: readonly Enemy[], player: { x: number; z: number }, t: Translate) {
  const bosses = trackedBosses(enemies);
  if (!bosses.length) return '';
  const rows = bosses.map(e => {
    const def = ENEMY_TYPES[e.type ?? ''], icon = def?.titan ? '🗿' : '👑', name = esc(t(def?.name ?? e.name));
    const status = e.hp > 0 ? `<b class="boss-live">${esc(t('Out now'))} · ${Math.round(Math.hypot(e.x - player.x, e.z - player.z))}m</b>`
      : e.respawn > 0 ? `<b class="boss-wait">⏳ ${clock(e.respawn)}</b>` : `<b class="boss-wait">${esc(t('Appears when you move away'))}</b>`;
    return `<div class="boss-time${e.hp > 0 ? ' live' : ''}"><span>${icon}</span><strong>${name}</strong>${status}</div>`;
  }).join('');
  return `<div class="eyebrow">${esc(t('BOSSES'))}</div>${rows}`;
}

/** Bosses that came back since the last call (for an announcement). */
export function bossArrivals(enemies: readonly Enemy[], seen: Map<string, boolean>) {
  const arrived: Enemy[] = [];
  for (const e of trackedBosses(enemies)) { const alive = e.hp > 0, before = seen.get(e.id); if (alive && before === false) arrived.push(e); seen.set(e.id, alive); }
  return arrived;
}

const BOARD: [ProgressKind, string, number][] = [['hourly', 'Hourly', 4], ['daily', 'Daily', 3], ['weekly', 'Weekly', 4]];
export function questBoardHtml(state: SaveState, t: Translate) {
  let ready = 0, open = 0;
  const sections = BOARD.map(([kind, label, limit]) => {
    const entries = progressEntries(state, kind).filter(e => !e.id.endsWith(':chest') && !e.id.endsWith(':login'));
    ready += entries.filter(e => e.complete && !e.claimed).length;
    const todo = entries.filter(e => !e.complete).slice(0, limit); open += todo.length;
    if (!todo.length) return '';
    return `<div class="board-kind">${esc(t(label))}</div>${todo.map(e => `<div class="board-task"><span>${e.icon ?? '📜'}</span><div><small>${esc(e.title)}</small><div class="board-meter"><i style="width:${Math.round(e.progress / e.target * 100)}%"></i></div></div><b>${e.progress}/${e.target}</b></div>`).join('')}`;
  }).join('');
  const claim = ready ? `<button class="board-claim" data-action="quests">🎁 ${esc(t('{count} rewards ready', { count: ready }))}</button>` : '';
  return `<div class="eyebrow">${esc(t("TODAY'S QUESTS"))}</div>${open ? sections : `<p class="board-done">✓ ${esc(t('All done for now!'))}</p>`}${claim}`;
}
