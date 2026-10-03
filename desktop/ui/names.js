// Japanese explorer names for new accounts (hiragana reads well on the nameplate and in YouTube titles), and a
// hiragana → romaji converter that suggests the folder id from the name (さくら → sakura).
const JP_NAMES = {
  female: `あい あいか あいな あいり あおい あかね あかり あきな あさひ あずさ あすか あみ あやか あやね あやの あゆ あゆみ あやめ ありさ あんず
    いずみ いちか いちご いと いろは うた うみ うらら えま えみ えり えりか える おとは かえで かおり かすみ かな かなで かなこ かのん かほ
    かりん かれん きほ きょうか きらら くるみ ここな ここね こころ こと ことは ことね こなつ こはる こはく こまち こむぎ さあや さき さくら
    さほ さや さやか さら さわ しおり しずく しの しほ じゅり すず すずか すずね すみれ すもも せいら せな そよか たまき ちあき ちか ちさと
    ちな ちはる ちひろ つかさ つぐみ つばき つむぎ とわ ななか ななみ なぎさ なつみ なな なのか なほ なみ にこ ねね のあ のぞみ のどか のの
    はな はなこ はづき はるか はるな はるひ ひかり ひな ひなの ひまり ひめ ひより ふうか ふみ ほたる ほのか まい まお まどか まな まなみ
    まひろ まほ まゆ まりあ まりな みお みおり みく みさき みずほ みちる みどり みなみ みのり みはる みゆ みゆき みらい みれい むぎ めい
    めぐみ もえ もか もな もも ももか やよい ゆい ゆいか ゆうか ゆうな ゆかり ゆき ゆきな ゆず ゆずは ゆな ゆの ゆめ ゆら ゆり よしの
    らん りお りか りこ りさ りな りの りほ りん るい るか るな るり れい れいな れな わかな あやせ いおな うい えな かや きな こゆき
    さえ しずか すい ちよ ともえ なずな のりか はるの ひなこ ふゆ まいか みこ みつは もとこ ゆあ ゆうり よつば りえ るみ`,
  male: `あおと あきと あきら あさひ あつし あゆむ あらた いおり いさむ いつき いぶき えいた かい かいと かける かずき かずま かつき かなた
    かなと きいち きょう ぎん けい けいた けんじ けんた けんと げん こう こうき こうた こうへい こたろう こてつ ごう さく さすけ さとし
    しおん しゅう しゅうと しゅん しょう しょうた しん しんや じゅん じろう じん すばる せい せいじ せいや そう そうた そうま そら たいが
    たいき たいち たいよう たかし たくま たくみ たける たすく たろう ちから つばさ てつ てつや とうま とおる とき とし なお なおき なおと
    なぎ なつき のぶ のぞむ はくと はじめ はやて はやと はる はるき はると はるま ひかる ひでと ひなた ひびき ひゅうが ひろ ひろき ふうた
    ふうま ふみや へいた ほくと まこと まさき まさと まなと まなぶ みずき みつき みつる みなと むさし もとき もり やまと ゆう ゆうき ゆうご
    ゆうじ ゆうせい ゆうと ゆうま ゆきと ゆずる よう ようすけ ようた よしき らいと りく りくと りつ りゅう りゅうじ りゅうせい りょう
    りょうま るい れお れん れんと ろく わたる あんじ いちた うた えいと おうすけ かんた きょうへい くう けいご こはく さねと しき
    すい せな そうし たいと ちあき つかさ とあ ともや なぎと のあ はやせ ひいろ ふゆと ほまれ まひろ みのる ゆいと よしと らく りひと`,
};
for (const g of Object.keys(JP_NAMES)) JP_NAMES[g] = [...new Set(JP_NAMES[g].split(/\s+/).filter(Boolean))];

/** A random name of the gender ('female', 'male' or 'any'), avoiding the names in `taken` while any are left. */
function randomJapaneseName(gender = 'any', taken = []) {
  const pool = gender === 'any' ? [...JP_NAMES.female, ...JP_NAMES.male] : JP_NAMES[gender] ?? [];
  const used = new Set(taken), free = pool.filter(n => !used.has(n)), list = free.length ? free : pool;
  return list[Math.floor(Math.random() * list.length)];
}

const KANA = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho', ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo', りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo', ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu',
};
/** Hiragana (or katakana) to a folder-safe romaji id: さくら → sakura, しょうた → shouta, はっと → hatto. Unknown characters are dropped. */
function romajiId(name) {
  const s = String(name).replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/ー/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'っ') { const next = KANA[s.slice(i + 1, i + 3)] ?? KANA[s[i + 1]]; if (next) out += next[0]; continue; }
    const two = KANA[s.slice(i, i + 2)]; if (two) { out += two; i++; continue; }
    out += KANA[s[i]] ?? (/[a-z0-9_-]/i.test(s[i]) ? s[i].toLowerCase() : '');
  }
  return out.slice(0, 24);
}
