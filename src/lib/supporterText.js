// =====================================================================
// supporterText.js — 支援者の画面の言葉（日本語・英語）
//
// 支援者の画面（設定・遊びの中の「この遊びの設定」・そこへの入口）は、利用者の画面と同じ
// 「言語」で出す（2026-10-02、ユーザーの判断「言語が変わったら、支援者設定の名称も変更される
// ように」。それまでは日本語だけだった）。
//
// 文は {ja, en} の組で、それを使う表（settingDefinitions.js・settingsFields.js・
// games/gameSettings.js）の中に置き、描くときに選ぶ。利用者の世界の辞書（i18n.js）には
// 入れない: あちらは ふりがな・かな・声のパックと結びついていて、支援者の文は漢字の日本語と
// 英語だけで、声にもしない。
// =====================================================================

import { writable } from "svelte/store";
import { resolveTextMode } from "./i18n.js";

/** 支援者の画面の言語。利用者の「言語」（settings.textMode）が English なら英語、ほかは日本語。 */
export function supporterLang(settings) {
  return resolveTextMode(settings) === "en" ? "en" : "ja";
}

/**
 * {ja, en} の組（またはただの文字列）から、その言語の文。英語が無ければ日本語。
 * @param {string|{ja: string, en?: string}|null|undefined} text
 * @param {"ja"|"en"} [lang]
 */
export function say(text, lang = "ja") {
  if (text && typeof text === "object") return (lang === "en" ? text.en : null) ?? text.ja ?? "";
  return text ?? "";
}

/**
 * いまの支援者の画面の言語（Svelte の画面が、切り替えのたびに描き直すための入れ物）。
 * 値を入れるのは views/settings.js（起動したとき・言語を変えたとき）。
 */
export const supporterLanguage = writable("ja");
