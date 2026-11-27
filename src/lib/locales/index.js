// =====================================================================
// locales/index.js — 言語の一覧（ただ1つ）と、3つ目からの言語の訳
//
// 日本語と英語は、文を使う場所に書いてある（利用者の世界は i18n.js の辞書、支援者の世界は
// {ja, en} の組）。3つ目からの言語は、ここに1言語1ファイルで足す。足し方は docs/adding-a-language.md。
//
// 訳の引き方は2つ。
//   strings … 利用者の世界の辞書（i18n.js の STRINGS）の鍵 → 訳
//   phrases … 支援者の世界の英語の文 → 訳（英語の文そのものが鍵）
// 訳が無い文は、英語で出す（日本語へは落とさない。日本語を読めない人のための言語なので）。
//
// 抜けは tests/locales.test.mjs が落として知らせる。抜けている文の一覧は
// `node scripts/i18n-todo.mjs <言語>` で出る。
// =====================================================================

import de from "./de.js";
import es from "./es.js";
import fr from "./fr.js";
import pt from "./pt.js";

/**
 * @typedef {object} Language
 * @property {string} code      言語の名前（"ja" / "en" / "de" …）。支援者の画面の言語（supporterLang）はこれ
 * @property {string} mode      設定に保存する表記の値（settings.textMode）。日本語は "ruby"、ほかは code と同じ
 * @property {string} name      言語を選ぶ所に出す名前（その言語での呼び名）
 * @property {string} htmlLang  ページの lang（読み上げソフトが発音を選ぶ）
 * @property {string} speech    読み上げに渡す言語（audio.js の speak）
 * @property {string} dateLocale 日付の書き方
 * @property {boolean} voicePack 作り置きの声（src/assets/voice/）があるか。無い言語は端末の声で読む
 * @property {Record<string, string>} [strings]
 * @property {Record<string, string>} [phrases]
 * @property {Array<object>} [letterTasks] 「文字を えらぶ」の課題（言語ごとに、その字で始まる言葉が違う）
 */

/** @type {Language[]} */
const BUILT_IN = [
  { code: "ja", mode: "ruby", name: "日本語", htmlLang: "ja", speech: "ja-JP", dateLocale: "ja-JP", voicePack: true },
  { code: "en", mode: "en", name: "English", htmlLang: "en-GB", speech: "en-US", dateLocale: "en-GB", voicePack: true },
];

/** 3つ目からの言語。ファイルを足したら、ここに並べる（並べた順に、言語を選ぶ所へ出る）。 */
const CATALOGS = [de, es, fr, pt];

/**
 * 点検用の にせの言語（"xx"）。英語の文の英字を、全角の英字に置き換えて返すだけ。
 * この言語で画面を回して、半角の英字や日本語の字が出たら、そこは訳の仕組みを通っていない
 * （新しい言語を足しても英語か日本語のまま残る）。ふだんのビルドには入らない。
 */
const PSEUDO = { code: "xx", mode: "xx", name: "ｐｓｅｕｄｏ", htmlLang: "en", speech: "en-US", dateLocale: "en-GB", voicePack: false, pseudo: true };

const extras = [
  ...(import.meta.env?.VITE_PSEUDO_LOCALE === "1" ? [PSEUDO] : []),
  // 検査が、にせの訳を足すための口（tests/locales.test.mjs）。node で動く検査のときだけ読む
  // （Vite が組み立てたアプリには import.meta.env があるので、アプリの中では働かない）。
  ...(import.meta.env ? [] : (globalThis.__NN_EXTRA_LOCALES__ ?? [])),
];

/** いま使える言語（日本語・英語・足した言語の順）。 */
export const LANGUAGES = Object.freeze([...BUILT_IN, ...CATALOGS, ...extras]);

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));
const BY_MODE = new Map(LANGUAGES.map((language) => [language.mode, language]));

/** 表記の値（"ruby" / "kanji" / "kana" / "en" / "de" …）→ 言語の名前。知らない値は日本語。 */
export function languageOfMode(mode) {
  return BY_MODE.get(mode)?.code ?? "ja";
}

/** 言語の名前 → その言語の決まりごと。知らない名前は日本語。 */
export function languageInfo(code) {
  return BY_CODE.get(code) ?? BUILT_IN[0];
}

/**
 * 小数の書き方（1.6 と 1,6）。日本語と英語は そのまま。足した言語は、その言語の書き方にする
 * （ドイツ語・スペイン語・フランス語は小数点がコンマ）。
 */
export function localNumber(value, code) {
  const language = BY_CODE.get(code);
  return !language || BUILT_IN.includes(language) ? value : value.toLocaleString(language.dateLocale);
}

/**
 * 印刷用の説明書のファイル名（public/ の下）。日本語は前からの guide.html のまま
 * （配ったリンクと、ホーム画面に入れた端末の写しを変えない）。ほかは guide-<言語>.html。
 */
export function guideFileName(code) {
  const language = languageInfo(code);
  return language.code === "ja" ? "guide.html" : `guide-${language.code}.html`;
}

const fullWidth = (text) => text.replace(/[A-Za-z]/g, (letter) => String.fromCharCode(letter.charCodeAt(0) + 0xfee0));

/**
 * にせの言語の文。英字を全角にする。穴（{n}）・タグ（<strong>）・文字参照（&amp;）は そのまま残し、
 * 数で変わる言い方（{n:time|times}）は、選ぶ言葉だけを全角にする。
 */
export function pseudoText(text) {
  return String(text).replace(
    /\{(\w+):([^{}|]*)\|([^{}]*)\}|(\{[^{}]*\}|<[^<>]*>|&[a-z#0-9]+;)|([A-Za-z]+)/g,
    (match, name, one, other, kept, letters) =>
      name ? `{${name}:${fullWidth(one)}|${fullWidth(other)}}` : (kept ?? fullWidth(letters))
  );
}

/** 利用者の世界の辞書の訳。無ければ undefined（呼ぶ側が英語へ落とす）。 */
export function catalogString(code, key, english) {
  const language = BY_CODE.get(code);
  if (language?.pseudo && english != null) return pseudoText(english);
  return language?.strings?.[key];
}

/** 支援者の世界の文の訳（英語の文が鍵）。無ければ undefined（呼ぶ側が英語へ落とす）。 */
export function catalogPhrase(code, english) {
  const language = BY_CODE.get(code);
  if (language?.pseudo) return english ? pseudoText(english) : english;
  return language?.phrases?.[english];
}
