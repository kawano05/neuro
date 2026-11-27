// =====================================================================
// learnText.js — 学ぶ・伝える（どれかな？／文字を えらぶ／ことばで伝える）の、言語ごとの字
//
// 課題そのもの（content.js の matchingTasks・letterTasks・phraseCategories）は日本語で持ち、
// 記録（操作ログの label）と正解の判定も日本語のまま。画面の字と声だけを、言語に合わせる。
//   - 英語は content.js の表（promptEn・LEARN_LABEL_EN・PHRASE_EN・letterTasksEn）
//   - 3つ目からの言語は、その英語の文を鍵にして訳を引く（locales/ の phrases）。無ければ英語
//   - 「文字を えらぶ」だけは課題ごと違う（その字で始まる言葉が言語で違う）ので、言語のファイルが
//     letterTasks を持つ。無ければ英語の課題
// =====================================================================

import { LEARN_LABEL_EN, PHRASE_EN, letterTasks, letterTasksEn, matchingTasks } from "./content.js";
import { languageInfo, languageOfMode } from "./locales/index.js";
import { fromEnglish } from "./supporterText.js";

/** 表記の値（ctx.textMode()）→ 言語の名前。 */
export const learnLang = (mode) => languageOfMode(mode);

/** どれかな？の問い。日本語のときは null（呼ぶ側が ふりがな付きの問いを出す）。 */
export function matchingPrompt(task, lang) {
  return lang !== "ja" && task.promptEn ? fromEnglish(task.promptEn, lang) : null;
}

/** どれかな？の札の字。訳が無い札と、日本語のときは、元の字。 */
export function learnLabel(label, lang) {
  return lang !== "ja" && LEARN_LABEL_EN[label] ? fromEnglish(LEARN_LABEL_EN[label], lang) : label;
}

/** ことばで伝えるの、ことばと分類。日本語のときは null（呼ぶ側が ふりがな付きの字を出す）。 */
export function phraseText(text, lang) {
  return lang !== "ja" && PHRASE_EN[text] ? fromEnglish(PHRASE_EN[text], lang) : null;
}

/** 文字を えらぶ の課題。数は どの言語も日本語の課題と同じ（何問目かを state.letterIndex で共有する）。 */
export function letterTasksFor(lang) {
  if (lang === "ja") return letterTasks;
  if (lang === "en") return letterTasksEn;
  return languageInfo(lang).letterTasks ?? letterTasksEn;
}

/** 3つ目からの言語が訳す、学ぶ・伝えるの英語の文（tests/locales.test.mjs と scripts/i18n-todo.mjs が使う）。 */
export function learnPhrases() {
  return [...matchingTasks.map((task) => task.promptEn), ...Object.values(LEARN_LABEL_EN), ...Object.values(PHRASE_EN)];
}
