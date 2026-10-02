import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { t, localizeHtml, getLanguage, setLanguage, isLanguage, LANGUAGES, LANGUAGE_NAMES } from '../src/i18n.ts';
import { VI_CATALOG } from '../src/locales/vi-catalog.ts';
import { VI_GAMEPLAY } from '../src/locales/vi-gameplay.ts';
import { VI_ONLINE } from '../src/locales/vi-online.ts';
import { VI_UI } from '../src/locales/vi-ui.ts';
import { VI_FRIENDS } from '../src/locales/vi-friends.ts';
import { VI_HOUSE } from '../src/locales/vi-house.ts';
import { VI_QUESTS } from '../src/locales/vi-quests.ts';
import { JA_CATALOG } from '../src/locales/ja-catalog.ts';
import { JA_GAMEPLAY } from '../src/locales/ja-gameplay.ts';
import { JA_SOCIAL } from '../src/locales/ja-social.ts';
import { JA_UI } from '../src/locales/ja-ui.ts';
import { JA_QUESTS } from '../src/locales/ja-quests.ts';
afterEach(() => setLanguage('en'));

// Vietnamese is the reference: its own tests require every item, world, enemy and label.
// Japanese must cover the same English keys, so it inherits that coverage.
const vi: Record<string, string> = Object.assign({}, VI_CATALOG, VI_GAMEPLAY, VI_ONLINE, VI_UI, VI_FRIENDS, VI_HOUSE, VI_QUESTS);
const ja: Record<string, string> = Object.assign({}, JA_CATALOG, JA_GAMEPLAY, JA_SOCIAL, JA_UI, JA_QUESTS);
const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join(',');
const VIETNAMESE = /[ăâđêôơưạảãáàầấậẩẫằắặẳẵẹẻẽéèềếệểễịỉĩíìọỏõóòồốộổỗờớợởỡụủũúùừứựửữỵỷỹýỳ]/i;

test('Japanese translates every key the Vietnamese catalog translates', () => {
  const missing = Object.keys(vi).filter(key => !Object.hasOwn(ja, key));
  assert.deepEqual(missing, [], `${missing.length} English keys have no Japanese`);
});

test('Japanese values keep placeholders, edges and stay free of Vietnamese', () => {
  for (const [key, value] of Object.entries(ja)) {
    assert.ok(value.trim(), `empty Japanese for ${JSON.stringify(key)}`);
    assert.equal(placeholders(value), placeholders(key), `placeholders differ for ${JSON.stringify(key)}`);
    assert.ok(!VIETNAMESE.test(value), `Vietnamese left in ${JSON.stringify(key)}`);
    assert.equal(/^\s/.test(value), /^\s/.test(key), `leading space differs for ${JSON.stringify(key)}`);
    assert.equal(/\s$/.test(value), /\s$/.test(key), `trailing space differs for ${JSON.stringify(key)}`);
    assert.equal(value, value.normalize('NFC'), `not NFC: ${JSON.stringify(key)}`);
  }
});

test('Japanese is a selectable language that names itself', () => {
  assert.deepEqual([...LANGUAGES], ['en', 'vi', 'ja']);
  assert.equal(LANGUAGE_NAMES.ja, '日本語');
  assert.ok(isLanguage('ja') && !isLanguage('jp') && !isLanguage(null));
  setLanguage('ja'); assert.equal(getLanguage(), 'ja');
  setLanguage('xx' as never); assert.equal(getLanguage(), 'ja');
});

test('Japanese durations and composed labels translate without spaces between units', () => {
  setLanguage('ja');
  assert.equal(t('{minutes}m {seconds}s', { minutes: 2, seconds: 5 }), '2分5秒');
  assert.equal(t('{hours}h {minutes}m', { hours: 1, minutes: 30 }), '1時間30分');
  assert.equal(t('{count}s', { count: 9 }), '9秒');
  // A label composed in English is parsed back through its template, and the nested duration is translated too.
  const life = t('Life left: 2m 5s');
  assert.ok(life.includes('2分5秒'), life);
  assert.ok(!/[A-Za-z]{3,}/.test(life), life);
});

test('Japanese labels replace English while keeping numbers, icons and markup', () => {
  setLanguage('ja');
  for (const key of ['Backpack', 'Journal', 'Settings', 'Carrot', 'Harvest market']) {
    assert.notEqual(t(key), key, key);
    assert.match(t(key), /[぀-ヿ一-鿿]/, key);
  }
  const level = t('🔒 Level 27');
  assert.ok(level.includes('27') && level.startsWith('🔒'), level);
  const html = localizeHtml('<button data-action="bag" title="Backpack">Backpack</button><kbd>Space</kbd>');
  assert.match(html, /data-action="bag" title="[^"A-Za-z]+">[^<A-Za-z]+<\/button><kbd>Space<\/kbd>/);
  setLanguage('vi'); assert.equal(t('Carrot'), 'Cà Rốt Tốc Hành');
  setLanguage('en'); assert.equal(t('Carrot'), 'Carrot');
});
