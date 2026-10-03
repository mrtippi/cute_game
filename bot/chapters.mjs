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
const GROUPS = {
  farm: { tasks: ['garden', 'fertilize', 'orchard', 'animals', 'market', 'cook', 'expand'], ja: '畑と村のお仕事' },
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
export const stamp = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`; };

/** Events of a clip, on the video's clock (seconds since the first recorded frame). */
export function readEvents(dir) {
  const file = `${dir}/events.jsonl`; if (!existsSync(file)) return [];
  const events = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const start = events.find(e => e.tag === 'record')?.t ?? 0;
  return events.map(e => ({ ...e, at: e.t - start }));
}

/** Highlights inside [from, to): their Japanese phrases, best first. */
function highlights(events, from, to) {
  const inside = events.filter(e => e.at >= from && e.at < to), out = [];
  for (const e of inside) {
    const boss = /defeated the boss (.+?)!/.exec(e.text ?? ''); if (boss) out.push({ rank: 5, ja: `ボス討伐：${t(boss[1])}！` });
    const rescued = /^rescued (.+?)!/.exec(e.text ?? ''); if (rescued) out.push({ rank: 5, ja: `${t(rescued[1])}を救出！` });
    const landed = /^landed on (\w+)/.exec(e.text ?? ''); if (landed) out.push({ rank: 4, ja: `${planetJa(landed[1])}へ` });
    if (e.text === 'flew home') out.push({ rank: 4, ja: '村へ帰還' });
    if (e.tag === 'level') out.push({ rank: 3, ja: `Lv.${e.level}にアップ` });
    const title = /wearing the title (.+)$/.exec(e.text ?? ''); if (title) out.push({ rank: 1, ja: `称号「${t(title[1])}」` });
    if (e.text === 'Lumi speaks') out.push({ rank: 2, ja: 'ルミのお話' });
  }
  return out.sort((a, b) => b.rank - a.rank);
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
  const end = i => i + 1 < segments.length ? segments[i + 1].at : duration;
  // Too short to be worth a chapter: fold into the one before (the first into the next).
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < segments.length; i++) if (segments.length > 1 && end(i) - segments[i].at < MIN_CHAPTER) {
      if (i === 0) segments[1].at = 0;
      segments.splice(i, 1); changed = true; break;
    }
    // Neighbours of the same activity become one.
    for (let i = 1; i < segments.length; i++) if (segments[i].group === segments[i - 1].group) { segments.splice(i, 1); changed = true; break; }
  }
  while (segments.length > MAX_CHAPTERS) { let k = 1; for (let i = 1; i < segments.length; i++) if (end(i) - segments[i].at < end(k) - segments[k].at) k = i; segments.splice(k, 1); }
  return segments.map((s, i) => {
    const best = highlights(events, s.at, end(i))[0];
    const where = s.planet && s.planet !== 'home' && ['hunt', 'travel'].includes(s.group) ? `${planetJa(s.planet)}で` : '';
    return { at: Math.round(s.at), title: best && best.rank >= 4 ? best.ja : `${where}${GROUPS[s.group].ja}${best ? '・' + best.ja : ''}` };
  });
}

/** The upload text and data for one clip. */
export function clipText({ dir, video, title, name, day, index, duration = 3600 }) {
  const events = readEvents(dir), chapters = buildChapters(events, duration);
  const levels = events.filter(e => e.tag === 'level').map(e => e.level);
  const start = /start · Lv\.(\d+)/.exec(events.find(e => /^start ·/.test(e.text ?? ''))?.text ?? '')?.[1];
  const bosses = events.filter(e => e.at >= 0 && e.at < duration && /defeated the boss/.test(e.text ?? '')).length;
  const worlds = [...new Set(events.filter(e => e.at >= 0 && e.at < duration).map(e => /^landed on (\w+)/.exec(e.text ?? '')?.[1]).filter(Boolean))].map(planetJa);
  const summary = [start ? `Lv.${start}${levels.length ? ` → Lv.${levels.at(-1)}` : ''}` : '', bosses ? `ボス討伐 ${bosses}回` : '', worlds.length ? `訪れた星：${worlds.join('、')}` : ''].filter(Boolean).join(' ・ ');
  const description = [
    title, '',
    `Zoo Garden を自動プレイでのんびり遊ぶシリーズ。${name ? `${name}の` : ''}${day ? `${day}日目` : ''}${index ? `・${index}本目` : ''}です。`,
    summary ? `この回：${summary}` : '', '',
    '▼ チャプター', ...chapters.map(c => `${stamp(c.at)} ${c.title}`), '',
    '#ZooGarden #自動プレイ #ゲーム #のんびりゲーム',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
  const data = { title, description, chapters, tags: ['Zoo Garden', '自動プレイ', 'ゲーム', 'のんびりゲーム'], video, account: name, day, index, summary };
  if (video) { writeFileSync(video.replace(/\.mp4$/, '.txt'), description + '\n'); writeFileSync(video.replace(/\.mp4$/, '.json'), JSON.stringify(data, null, 1)); }
  return data;
}

if (process.argv[1]?.endsWith('chapters.mjs')) {
  const { values: o, positionals } = parseArgs({ allowPositionals: true, options: { video: { type: 'string' }, title: { type: 'string', default: '' }, name: { type: 'string' }, day: { type: 'string' }, index: { type: 'string' }, duration: { type: 'string', default: '3600' } } });
  const data = clipText({ dir: positionals[0], video: o.video, title: o.title, name: o.name, day: o.day, index: o.index, duration: Number(o.duration) });
  console.log(data.description);
}
