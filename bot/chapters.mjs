// YouTube chapters and the upload text for one recorded clip, from its events.jsonl (play.mjs marks and notes).
//
//   node chapters.mjs <clip folder> --video <file.mp4> [--title ...] [--name さくら] [--day 3] [--index 2]
//
// Writes <video>.txt (title, description with chapters, hashtags; ready to paste) and <video>.json (the same as data).
// Chapters follow YouTube's rules: the first at 0:00, at least three, each 10 s or longer, in order. They are built
// from the planner's task switches (grouped into activities), at least two minutes each and at most fifteen per
// hour, named in Japanese with the clip's highlights (a boss beaten, a new world, a level-up, a friend rescued).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { t, setLanguage } from '../src/i18n.ts';
import { PLANETS } from '../src/content.ts';

setLanguage('ja');
/** Planner tasks grouped into the activities a viewer recognises, with their Japanese chapter names. */
export const GROUPS = {
  farm: { tasks: ['garden', 'fertilize', 'orchard', 'animals', 'market', 'cook', 'expand', 'dish', 'snack'], ja: '畑と村のお仕事' },
  helpers: { tasks: ['bolt', 'penUpgrade', 'penHelper'], ja: 'お手伝いロボと牧場づくり' },
  events: { tasks: ['lava', 'dragon', 'gifts'], ja: '惑星イベントに挑戦' },
  decor: { tasks: ['decorate'], ja: '村のかざりつけ' },
  quests: { tasks: ['reroll'], ja: '今日のクエストをチェック' },
  friends: { tasks: ['dressFriend', 'visitFriend'], ja: '仲間とふれあいタイム' },
  fun: { tasks: ['disguise'], ja: '変装してあそぼう' },
  hunt: { tasks: ['fight', 'gather', 'challenge'], ja: 'モンスター狩り' },
  boss: { tasks: ['boss'], ja: 'ボスに挑戦' },
  travel: { tasks: ['travel', 'mine'], ja: '星の旅' },
  fishing: { tasks: ['fishing', 'harpoon'], ja: '釣りタイム' },
  gear: { tasks: ['shop', 'crystal', 'gearBuy', 'forge', 'craft'], ja: '装備と強化' },
  style: { tasks: ['wardrobe'], ja: 'おしゃれタイム' },
  stroll: { tasks: ['sightsee', 'tidy', 'browse', 'home'], ja: '村をおさんぽ' },
  story: { tasks: ['rescue'], ja: '仲間を助けに' },
  attic: { tasks: ['attic'], ja: '思い出の部屋へ' },
  together: { tasks: ['groupBoss', 'follow', 'groupTrip'], ja: '仲間といっしょに冒険' },
  visit: { tasks: ['visitMate', 'host'], ja: '友だちの畑におじゃま' },
};
const groupOf = task => Object.keys(GROUPS).find(g => GROUPS[g].tasks.includes(task)) ?? 'stroll';
const planetJa = id => t(PLANETS[id]?.name ?? id);
const MIN_CHAPTER = 120, MAX_CHAPTERS = 15;
/** YouTube's own rules: at least three chapters, each at least 10 s long. */
const YT_COUNT = 3, YT_MIN = 10;
export const stamp = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };

/**
 * Events of a clip, on the video's clock (seconds since the first recorded frame). A file holding more than one run
 * (a clip played again) counts from its last recording start only.
 */
export function readEvents(dir) {
  const file = `${dir}/events.jsonl`; if (!existsSync(file)) return [];
  const all = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const from = all.findLastIndex(e => e.tag === 'record'), events = from >= 0 ? all.slice(from) : all;
  const start = from >= 0 ? all[from].t : 0;
  return events.map(e => ({ ...e, at: e.t - start }));
}

/** Highlights inside [from, to): their Japanese phrases, best first. */
function highlights(events, from, to) {
  const inside = events.filter(e => e.at >= from && e.at < to), out = [];
  for (const e of inside) {
    const boss = /defeated the boss (.+?)!/.exec(e.text ?? ''); if (boss) out.push({ rank: 5, ja: `ボス討伐：${t(boss[1])}！` });
    if (/^defeated the volcano dragon/.test(e.text ?? '')) out.push({ rank: 5, ja: `ボス討伐：${t('Volcano Dragon')}！` });
    const rescued = /^rescued (.+?)!/.exec(e.text ?? ''); if (rescued) out.push({ rank: 5, ja: `${t(rescued[1])}を救出！` });
    const landed = /^landed on (\w+)/.exec(e.text ?? ''); if (landed) out.push({ rank: 4, ja: `${planetJa(landed[1])}へ` });
    if (e.text === 'flew home') out.push({ rank: 4, ja: '村へ帰還' });
    if (e.tag === 'level') out.push({ rank: 3, ja: `Lv.${e.level}にアップ`, level: e.level });
    const title = /wearing the title (.+)$/.exec(e.text ?? ''); if (title) out.push({ rank: 1, ja: `称号「${t(title[1])}」` });
    if (e.text === 'Lumi speaks') out.push({ rank: 2, ja: 'ルミのお話' });
  }
  // Among level-ups the highest (the last) one.
  return out.sort((a, b) => b.rank - a.rank || (b.level ?? 0) - (a.level ?? 0));
}

/** The chapter list for a clip of `duration` seconds. */
export function buildChapters(events, duration) {
  // Activity segments from the task switches; the first one starts at 0:00.
  let segments = [];
  for (const e of events.filter(e => e.tag === 'task' && e.at < duration)) {
    const group = groupOf(e.task), at = Math.max(0, e.at);
    const last = segments.at(-1);
    if (last && last.group === group) continue;
    if (last && at - last.at < 1) { last.group = group; last.planet = e.planet; continue; }
    segments.push({ at, group, planet: e.planet });
  }
  if (!segments.length) segments = [{ at: 0, group: 'farm' }];
  segments[0].at = 0;
  // A short clip (a test, a few minutes) takes chapters of a third of its length, never under YouTube's 10 s.
  const least = Math.max(YT_MIN, Math.min(MIN_CHAPTER, Math.floor(duration / YT_COUNT)));
  // The bot switches activity every minute or two: runs of short activities are gathered into chapters of about a
  // twelfth of the clip (3 min at least, 8 at most), each named after the activity that filled most of it. An
  // activity long enough on its own keeps its own chapter. (Folding every short one into the one before left a
  // 90-minute clip with three chapters, one per planet.)
  const target = Math.max(least, Math.min(480, Math.max(180, duration / 12)));
  const spanEnd = i => i + 1 < segments.length ? segments[i + 1].at : duration;
  const raw = segments.map((s, i) => ({ ...s, len: spanEnd(i) - s.at }));
  const gathered = [];
  let acc = null;
  /** The activity (and its world) that took most of a gathered run's time. */
  const dominant = parts => { const time = {}; for (const p of parts) time[p.group] = (time[p.group] ?? 0) + p.len; const group = Object.entries(time).sort((a, b) => b[1] - a[1])[0][0]; return { group, planet: parts.filter(p => p.group === group).sort((a, b) => b.len - a.len)[0].planet }; };
  const flush = () => { if (!acc) return; gathered.push({ at: acc.at, ...dominant(acc.parts), len: acc.len, parts: acc.parts }); acc = null; };
  for (const r of raw) {
    if (r.len >= target) {
      // A gathered run too short for a chapter of its own joins this long activity.
      if (acc && acc.len < least) { const parts = [...acc.parts, r]; gathered.push({ at: acc.at, ...dominant(parts), len: acc.len + r.len, parts }); acc = null; continue; }
      flush(); gathered.push({ ...r, parts: [r] }); continue;
    }
    acc ??= { at: r.at, len: 0, parts: [] }; acc.parts.push(r); acc.len += r.len;
    if (acc.len >= target) flush();
  }
  // What is left at the end: a chapter if long enough, else part of the one before.
  if (acc) { const last = gathered.at(-1); if (acc.len < least && last) { last.parts.push(...acc.parts); last.len += acc.len; Object.assign(last, dominant(last.parts)); acc = null; } else flush(); }
  segments = gathered.map(({ at, group, planet }) => ({ at, group, planet }));
  segments[0].at = 0;
  const end = i => i + 1 < segments.length ? segments[i + 1].at : duration, length = i => end(i) - segments[i].at;
  // Neighbours of the same activity become one, unless that makes a chapter much longer than the target.
  for (let i = 1; i < segments.length; i++) if (segments[i].group === segments[i - 1].group && segments[i].planet === segments[i - 1].planet && length(i - 1) + length(i) <= target * 1.5) { segments.splice(i, 1); i--; }
  while (segments.length > MAX_CHAPTERS) { let k = 1; for (let i = 1; i < segments.length; i++) if (length(i) < length(k)) k = i; segments.splice(k, 1); }
  // YouTube shows chapters only from three on: the longest stretch is cut in halves until there are three (while
  // each half still lasts 10 s).
  while (segments.length < YT_COUNT) {
    let k = 0; for (let i = 1; i < segments.length; i++) if (length(i) > length(k)) k = i;
    if (length(k) < 2 * YT_MIN) break;
    segments.splice(k + 1, 0, { ...segments[k], at: segments[k].at + length(k) / 2 });
  }
  const chapters = segments.map((s, i) => {
    const best = highlights(events, s.at, end(i))[0];
    const where = s.planet && s.planet !== 'home' && ['hunt', 'travel'].includes(s.group) ? `${planetJa(s.planet)}で` : '';
    return { at: Math.round(s.at), title: best && best.rank >= 4 ? best.ja : `${where}${GROUPS[s.group].ja}${best ? '・' + best.ja : ''}` };
  });
  // The second half of a cut stretch, or the same name twice in a row: "(つづき)".
  for (let i = 1; i < chapters.length; i++) if (chapters[i].title.replace(/（つづき）$/, '') === chapters[i - 1].title.replace(/（つづき）$/, '')) chapters[i].title = chapters[i].title.replace(/（つづき）$/, '') + '（つづき）';
  return chapters;
}

/** The upload text and data for one clip. */
export function clipText({ dir, video, title, name, day, index, duration = 3600 }) {
  const events = readEvents(dir), chapters = buildChapters(events, duration);
  const levels = events.filter(e => e.tag === 'level').map(e => e.level);
  const start = /start · Lv\.(\d+)/.exec(events.find(e => /^start ·/.test(e.text ?? ''))?.text ?? '')?.[1];
  const bosses = events.filter(e => e.at >= 0 && e.at < duration && /defeated the boss/.test(e.text ?? '')).length;
  const worlds = [...new Set(events.filter(e => e.at >= 0 && e.at < duration).map(e => /^landed on (\w+)/.exec(e.text ?? '')?.[1]).filter(Boolean))].map(planetJa);
  const summary = [start ? `Lv.${start}${levels.length ? ` → Lv.${levels.at(-1)}` : ''}` : '', bosses ? `ボス討伐 ${bosses}回` : '', worlds.length ? `訪れた星：${worlds.join('、')}` : ''].filter(Boolean).join(' ・ ');
  // Whatever is known of the clip (the explorer, the day of the series, the clip of the day); the series alone otherwise.
  const which = [day ? `${day}日目` : '', index ? `${index}本目` : ''].filter(Boolean).join('・');
  const series = name || which ? `Zoo Garden を自動プレイでのんびり遊ぶシリーズ。${name ? `${name}の` : ''}${which || 'プレイ'}です。` : 'Zoo Garden を自動プレイでのんびり遊ぶシリーズです。';
  const description = [
    title ?? '', '',
    series,
    summary ? `この回：${summary}` : '', '',
    '▼ チャプター', ...chapters.map(c => `${stamp(c.at)} ${c.title}`), '',
    '#ZooGarden #自動プレイ #ゲーム #のんびりゲーム',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n').replace(/^\n+/, '');
  const data = { title, description, chapters, tags: ['Zoo Garden', '自動プレイ', 'ゲーム', 'のんびりゲーム'], video, account: name, day, index, summary };
  if (video) { writeFileSync(video.replace(/\.mp4$/, '.txt'), description + '\n'); writeFileSync(video.replace(/\.mp4$/, '.json'), JSON.stringify(data, null, 1)); }
  return data;
}

if (process.argv[1]?.endsWith('chapters.mjs')) {
  const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { video: { type: 'string' }, title: { type: 'string', default: '' }, name: { type: 'string' }, day: { type: 'string' }, index: { type: 'string' }, duration: { type: 'string', default: '3600' } } });
  const data = clipText({ dir: positionals[0], video: o.video, title: o.title, name: o.name, day: o.day, index: o.index, duration: Number(o.duration) });
  console.log(data.description);
}
