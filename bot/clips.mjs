// The clip themes the director (director.mjs) builds a day from: ten one-hour clips, each with a focus.
// A theme says which planner activities it leans on (focus: extra points per task), how the explorer dresses
// (wardrobe theme, title theme), when it is open (open(save)), and how the clip is titled for YouTube.
// `vi` names the theme as a scenario in the control app (desktop/). The planner still handles urgent things first
// (falls, health, rewards) and keeps the garden going in any clip.

export const CLIPS = {
  morning: {
    ja: '朝の畑仕事と村の注文', vi: 'Trang trại – kinh tế', icon: '🌾', wardrobe: 'farm', title: 'farm',
    focus: { garden: 8, market: 6, animals: 6, orchard: 6, fertilize: 4, cook: 3, dish: 3, penUpgrade: 3, expand: 2 },
    open: () => true,
  },
  quests: {
    // The journal leads: hourly, daily and weekly tasks and village orders weigh three times as much.
    ja: '今日のクエストを片づけよう', vi: 'Làm nhiệm vụ', icon: '📋', wardrobe: 'explore', title: 'explore', quests: 3,
    focus: { market: 4, challenge: 4, reroll: 6 },
    open: () => true,
  },
  hunt: {
    ja: 'モンスター狩りと討伐依頼', vi: 'Train cày cấp', icon: '⚔️', wardrobe: 'combat', title: 'combat',
    focus: { fight: 9, challenge: 5, gather: 4, gearBuy: 3 },
    open: () => true,
  },
  boss: {
    ja: 'ボス討伐に挑戦！', vi: 'Săn boss', icon: '👑', wardrobe: 'combat', title: 'combat',
    focus: { boss: 12, fight: 4, crystal: 3, shop: 2 },
    open: s => s.level >= 10,
  },
  titan: {
    ja: 'タイタン決戦', vi: 'Đánh Titan', icon: '🗿', wardrobe: 'combat', title: 'combat',
    focus: { boss: 12, travel: 5, crystal: 3, forge: 2 },
    open: s => s.level >= 45,
  },
  story: {
    ja: '物語を進めよう', vi: 'Cốt truyện', icon: '📖', wardrobe: 'festival', title: 'festival', story: 3,
    focus: { rescue: 8 },
    open: () => true,
  },
  fishing: {
    ja: 'のんびり釣りタイム', vi: 'Câu cá – sưu tầm', icon: '🎣', wardrobe: 'fishing', title: 'fishing',
    focus: { fishing: 10, harpoon: 6, cook: 3 },
    open: () => true,
  },
  space: {
    ja: '星の海へ ― 惑星めぐり', vi: 'Khám phá vũ trụ', icon: '🚀', wardrobe: 'space', title: 'space',
    focus: { travel: 10, mine: 6, fight: 3 },
    open: s => s.level >= 4,
  },
  forge: {
    ja: '鍛冶と装備づくり', vi: 'Nâng trang bị', icon: '🔨', wardrobe: 'explore', title: 'fancy',
    focus: { forge: 9, gather: 6, gearBuy: 6, craft: 5, mine: 3 },
    open: s => s.level >= 15,
  },
  village: {
    ja: '村づくりと模様替え', vi: 'Xây làng & trang trí', icon: '🏡', wardrobe: 'cozy', title: 'farm',
    focus: { decorate: 12, expand: 5, crystal: 4, wardrobe: 5, shop: 3, tidy: 3, orchard: 3, attic: 6 },
    open: s => s.level >= 8,
  },
  helpers: {
    ja: 'なかまとお手伝いロボ', vi: 'Trợ thủ & bạn bè', icon: '🤖', wardrobe: 'cozy', title: 'farm',
    focus: { bolt: 10, penHelper: 9, dressFriend: 9, visitFriend: 7, animals: 5, penUpgrade: 4, dish: 3, attic: 3 },
    open: s => s.level >= 6,
  },
  events: {
    ja: '惑星イベント探検', vi: 'Sự kiện hành tinh', icon: '🌋', wardrobe: 'explore', title: 'explore', planets: ['lava', 'toy'],
    focus: { lava: 12, dragon: 12, gifts: 12, travel: 6, mine: 3, fight: 3 },
    open: s => (s.discovered ?? []).some(id => id === 'lava' || id === 'toy'),
  },
  evening: {
    ja: '夕暮れの村でひと休み', vi: 'Thư giãn', icon: '🌙', wardrobe: 'cozy', title: 'fancy',
    focus: { cook: 6, sightsee: 8, tidy: 4, market: 4, wardrobe: 4, attic: 6, animals: 3, disguise: 5, visitFriend: 3, snack: 2 },
    open: () => true,
  },
};

/** Themes that may fill the middle of an automatic day, with how often each is wanted (before availability). */
const MIDDLE = { quests: 1.5, fishing: 2, hunt: 3, boss: 2, space: 2, titan: 2, story: 2, village: 1.5, forge: 1.5, helpers: 1, events: 1.5 };

/**
 * The day's clips. With a `mix` ({ theme: weight }, the scenarios picked in the control app) each clip is one of
 * those themes, in proportion to the weights, the same theme never twice in a row when another is open; themes not
 * open yet (Titan below level 45…) are left out. Without a mix (or nothing in it open): the automatic day, the
 * morning chores first and the quiet evening last, in between a weighted pick of the open themes, each at most twice.
 * `save` is the latest save (level etc.).
 */
export function planDay(save, rng, count = 10, style = {}, mix = null) {
  const picked = Object.entries(mix ?? {}).filter(([id, w]) => CLIPS[id] && w > 0 && CLIPS[id].open(save));
  if (picked.length) return mixedDay(picked, rng, count);
  // An account's play style (accounts.mjs) weighs its favourite themes more.
  const open = Object.entries(MIDDLE).filter(([id]) => CLIPS[id].open(save)).map(([id, w]) => [id, w * (style[id] ?? 1)]);
  const used = {}, middle = [];
  for (let i = 0; i < count - 2; i++) {
    // Early on few themes are open: then a theme may come back more often (still never twice in a row).
    const fresh = open.filter(([id]) => id !== middle.at(-1) && (used[id] ?? 0) < 2), choices = fresh.length ? fresh : open.filter(([id]) => id !== middle.at(-1));
    const total = choices.reduce((n, [, w]) => n + w, 0); let draw = rng.between(0, total), pick = choices[0][0];
    for (const [id, w] of choices) { draw -= w; if (draw <= 0) { pick = id; break; } }
    middle.push(pick); used[pick] = (used[pick] ?? 0) + 1;
  }
  return ['morning', ...middle, 'evening'].slice(0, count);
}

/** Clips shared out by weight (largest remainder), then ordered so the same theme does not follow itself. */
function mixedDay(picked, rng, count) {
  const total = picked.reduce((n, [, w]) => n + w, 0);
  const shares = picked.map(([id, w]) => ({ id, exact: count * w / total })).map(p => ({ ...p, n: Math.floor(p.exact) }));
  for (const p of [...shares].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).slice(0, count - shares.reduce((n, p) => n + p.n, 0))) p.n++;
  const left = Object.fromEntries(shares.map(p => [p.id, p.n])), day = [];
  for (let i = 0; i < count; i++) {
    // Draw by what is left, the theme with the most left first among ties; avoid repeating the last one.
    const open = Object.keys(left).filter(id => left[id] > 0), choices = open.filter(id => id !== day.at(-1));
    const pool = choices.length ? choices : open, most = Math.max(...pool.map(id => left[id]));
    const pick = rng.pick(pool.filter(id => left[id] === most));
    day.push(pick); left[pick]--;
  }
  return day;
}

/** When a theme opens, in words for the control app (matches each `open`). */
const NEEDS = { boss: 'từ Lv10', titan: 'từ Lv45', space: 'từ Lv4', forge: 'từ Lv15', village: 'từ Lv8', helpers: 'từ Lv6', events: 'khi đã tới Hành tinh Dung nham hoặc Đồ chơi' };
/** Scenarios for the control app: id, Vietnamese name, icon, when it opens (the automatic mix first). */
export const SCENARIOS = [{ id: 'auto', vi: 'Tự động (trộn đa dạng)', icon: '🎲', need: null }, ...Object.entries(CLIPS).map(([id, c]) => ({ id, vi: c.vi, icon: c.icon, need: NEEDS[id] ?? null }))];

/** The YouTube title of a clip: series, day, level and the theme's line. */
export const clipTitle = (theme, { day, level, index, name }) => `【Zoo Garden 自動プレイ】${name ? name + ' ' : ''}${day}日目 #${index} ${CLIPS[theme].icon}${CLIPS[theme].ja}（Lv.${level}）`;
