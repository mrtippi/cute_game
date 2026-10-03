import { CHAPTERS, ARCS, type StoryLine } from './story.ts';
import { esc } from './html.ts';

/**
 * Lumi's dialogue box: a speech panel at the bottom of the screen, one line at a time, that never pauses the game.
 * The queue holds what is still to be said; main.ts shows it and the "Next" button (data-action="lumi-next") advances.
 */
export const SPEAKERS: Record<StoryLine['who'], { name: string; icon: string }> = {
  lumi: { name: 'Lumi', icon: '💠' },
  sprout: { name: 'Sprout', icon: '🌱' },
  pepper: { name: 'Pepper', icon: '🌶️' },
  clover: { name: 'Clover', icon: '🍀' },
};

/** Lines for moving from chapter `from` to chapter `to`: the closing of the one finished, then the opening of the new one. */
export function chapterLines(from: number, to: number): StoryLine[] {
  const lines: StoryLine[] = [];
  if (from >= 0 && from < to && CHAPTERS[from]) lines.push(...CHAPTERS[from].outro);
  if (from !== to && CHAPTERS[to]) lines.push(...CHAPTERS[to].intro);
  return lines;
}

/** The chapter's heading as the journal and the dialogue show it: arc number and name, chapter number and title. */
export function chapterHeading(chapter: number, t: (text: string, params?: Record<string, string | number>) => string) {
  const c = CHAPTERS[chapter];
  if (!c) return { arc: '', title: t('Beyond the story'), number: chapter + 1 };
  return { arc: t('Arc {count}', { count: c.arc + 1 }) + ' · ' + t(ARCS[c.arc]), title: t(c.title), number: chapter + 1 };
}

/** One line in the box; `left` is how many lines follow it. */
export function lumiHtml(line: StoryLine, left: number, heading: string, t: (text: string) => string) {
  const who = SPEAKERS[line.who];
  return `<div class="lumi-portrait ${line.who}" aria-hidden="true">${who.icon}</div><div class="lumi-text"><small>${esc(heading)}</small><strong>${esc(t(who.name))}</strong><p>${esc(t(line.text))}</p></div><button class="primary lumi-next" data-action="lumi-next">${left ? esc(t('Next')) + ' ▸' : esc(t('OK'))}</button>`;
}
