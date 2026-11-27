// =====================================================================
// supporterText.js — 支援者の画面の言葉
//
// 支援者の画面（設定・遊びの中の「この遊びの設定」・そこへの入口）は、利用者の画面と同じ
// 「言語」で出す（2026-10-02、ユーザーの判断「言語が変わったら、支援者設定の名称も変更される
// ように」。それまでは日本語だけだった）。
//
// 文は {ja, en} の組で、それを使う表（settingDefinitions.js・settingsFields.js・
// games/gameSettings.js）の中に置き、描くときに選ぶ。利用者の世界の辞書（i18n.js）には
// 入れない: あちらは ふりがな・かな・声のパックと結びついていて、支援者の文は漢字の日本語と
// 英語だけで、声にもしない。
//
// 3つ目からの言語は、組の英語の文を鍵にして訳を引く（locales/ の phrases）。訳が無ければ英語。
// だから組の英語は、式で組み立てずに 決まった文字列で書く。数や名前が入る文は {name} の穴あきに
// して、値は say の3つ目か、組の values で渡す（語順が言語で違っても、訳の側で穴を動かせる）:
//   say({ ja: "中断 {done}/{planned}回", en: "Stopped early, {done}/{planned} trials" }, lang, { done, planned })
// 数で言い方が変わる所は {n:trial|trials}（n が 1 のとき前、ほかは後ろ。i18n.js の fill）。
// =====================================================================

import { writable } from "svelte/store";
import { fill, resolveTextMode, translate } from "./i18n.js";
import { catalogPhrase, languageInfo, languageOfMode } from "./locales/index.js";

/**
 * 支援者の画面の言語（"ja" / "en" / 足した言語の名前）。利用者の「言語」（settings.textMode）と同じ。
 * ルビ・漢字・かなは、どれも日本語。
 */
export function supporterLang(settings) {
  return languageOfMode(resolveTextMode(settings));
}

/** その言語の決まりごと（ページの lang・日付の書き方など。locales/index.js）。 */
export function supporterLanguageInfo(lang) {
  return languageInfo(lang);
}

/** 組の、その言語の文（穴は埋めていない）。 */
function textIn(text, lang) {
  if (lang === "ja") return text.ja ?? "";
  if (lang !== "en") {
    // 利用者の世界の辞書から作った組（key つき）は、辞書のその言語の文を引く。
    if (text.key) return translate(text.key, languageInfo(lang).mode);
    if (text.en != null) {
      const translated = catalogPhrase(lang, text.en);
      if (translated != null) return translated;
    }
  }
  return text.en ?? text.ja ?? "";
}

/**
 * {ja, en} の組（またはただの文字列）から、その言語の文。英語が無ければ日本語。
 * 3つ目からの言語は、訳 → 英語 → 日本語の順。
 *
 * @param {string|{ja: string, en?: string, key?: string, values?: object}|null|undefined} text
 * @param {string} [lang] "ja" / "en" / 足した言語の名前
 * @param {object} [values] 穴（{name}）に入れる値。値が組なら、その言語の文にしてから入れる
 */
export function say(text, lang = "ja", values) {
  if (!text || typeof text !== "object") return text ?? "";
  const all = text.values || values ? { ...text.values, ...values } : null;
  const out = textIn(text, lang);
  if (!all) return out;
  return fill(
    out,
    Object.fromEntries(
      Object.entries(all).map(([name, value]) => [name, value && typeof value === "object" ? say(value, lang) : value])
    )
  );
}

/**
 * 英語の文を、その言語の文に（訳が無ければ英語のまま）。英語を {ja, en} の組でなく、別の欄や表で
 * 持っている所のため（soundCredits.js の useEn、content.js の PHRASE_EN など）。
 */
export function fromEnglish(english, lang) {
  if (lang === "en" || english == null) return english;
  return catalogPhrase(lang, english) ?? english;
}

/**
 * いまの支援者の画面の言語（Svelte の画面が、切り替えのたびに描き直すための入れ物）。
 * 値を入れるのは views/settings.js（起動したとき・言語を変えたとき）。
 */
export const supporterLanguage = writable("ja");
