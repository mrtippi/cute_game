// The clip themes the director (director.mjs) builds a day from: ten one-hour clips, each with a focus.
// A theme says which planner activities it leans on (focus: extra points per task), how the explorer dresses
// (wardrobe theme, title theme), when it is open (open(save)), and how the clip is titled for YouTube.
// The planner still handles urgent things first (falls, health, rewards) and keeps the garden going in any clip.

export const CLIPS = {
  morning: {
    ja: '朝の畑仕事と村の注文', icon: '🌅', wardrobe: 'farm', title: 'farm',
    focus: { garden: 8, market: 6, animals: 6, orchard: 6, fertilize: 4, cook: 3, expand: 2 },
    open: () => true,
  },
  fishing: {
    ja: 'のんびり釣りタイム', icon: '🎣', wardrobe: 'fishing', title: 'fishing',
    focus: { fishing: 10, harpoon: 6, cook: 3 },
    open: () => true,
  },
  hunt: {
    ja: 'モンスター狩りと討伐依頼', icon: '⚔️', wardrobe: 'combat', title: 'combat',
    focus: { fight: 9, challenge: 5, gather: 4, gearBuy: 3 },
    open: () => true,
  },
  boss: {
    ja: 'ボス討伐に挑戦！', icon: '👑', wardrobe: 'combat', title: 'combat',
    focus: { boss: 12, fight: 4, crystal: 3, shop: 2 },
    open: s => s.level >= 10,
  },
  space: {
    ja: '星の海へ ― 惑星めぐり', icon: '🚀', wardrobe: 'space', title: 'space',
    focus: { travel: 10, mine: 6, fight: 3 },
    open: s => s.level >= 4,
  },
  titan: {
    ja: 'タイタン決戦', icon: '🗿', wardrobe: 'combat', title: 'combat',
    focus: { boss: 12, travel: 5, crystal: 3, forge: 2 },
    open: s => s.level >= 45,
  },
  story: {
    ja: '物語を進めよう', icon: '📖', wardrobe: 'festival', title: 'festival', story: 3,
    focus: { rescue: 8 },
    open: () => true,
  },
  village: {
    ja: '村づくりと模様替え', icon: '🏡', wardrobe: 'cozy', title: 'farm',
    focus: { expand: 6, crystal: 5, wardrobe: 6, shop: 4, tidy: 4, orchard: 3, attic: 6 },
    open: s => s.level >= 8,
  },
  forge: {
    ja: '鍛冶と装備づくり', icon: '🔨', wardrobe: 'explore', title: 'fancy',
    focus: { forge: 9, gather: 6, gearBuy: 6, craft: 5, mine: 3 },
    open: s => s.level >= 15,
  },
  evening: {
    ja: '夕暮れの村でひと休み', icon: '🌙', wardrobe: 'cozy', title: 'fancy',
    focus: { cook: 6, sightsee: 8, tidy: 4, market: 4, wardrobe: 4, attic: 6, animals: 3 },
    open: () => true,
  },
};

/** Themes that may fill the middle of the day, with how often each is wanted (before availability). */
const MIDDLE = { fishing: 2, hunt: 3, boss: 2, space: 2, titan: 2, story: 2, village: 1.5, forge: 1.5 };

/**
 * The day's ten clips: the morning chores first and the quiet evening last; in between a weighted pick of the open
 * themes, never the same theme twice in a row and each at most twice a day. `save` is the latest save (level etc.).
 */
export function planDay(save, rng, count = 10) {
  const open = Object.entries(MIDDLE).filter(([id]) => CLIPS[id].open(save));
  const used = {}, middle = [];
  for (let i = 0; i < count - 2; i++) {
    const choices = open.filter(([id]) => id !== middle.at(-1) && (used[id] ?? 0) < 2);
    const total = choices.reduce((n, [, w]) => n + w, 0); let draw = rng.between(0, total), pick = choices[0][0];
    for (const [id, w] of choices) { draw -= w; if (draw <= 0) { pick = id; break; } }
    middle.push(pick); used[pick] = (used[pick] ?? 0) + 1;
  }
  return ['morning', ...middle, 'evening'].slice(0, count);
}

/** The YouTube title of a clip: series, day, level and the theme's line. */
export const clipTitle = (theme, { day, level, index }) => `【Zoo Garden 自動プレイ】${day}日目 #${index} ${CLIPS[theme].icon}${CLIPS[theme].ja}（Lv.${level}）`;
