// =====================================================================
// artVersion.js — 見え方の版（session.config.artVersion）の決まり
//
// タイミングの遊びは、れんしゅうの回だけ絵を作り直した（2026-09-30。リール・アーム・
// さかなつり、あとから高い音だけも）。絵は刺激そのものなので、どの絵を見せた回かを
// 記録に残し、CSV のいちばん後ろの列に出す（測定条件は禁止せず記録する）。
//
// 記録するのは「その回に画面へ出した絵の版」。そくていの回は元の絵のままなので、いつでも
// 版 1。以前は「その版のアプリで遊んだ回」の意味で、そくていの回にも 2 を入れていたが、
// それだと見え方の変わっていないそくていの記録が、版の列で2つに分かれて見えた。
// 各遊びの版の履歴は、それぞれの art/<遊び>WorldArt.js に書く。
// =====================================================================

/** 元の絵（作り直す前の絵）。そくていの回はずっとこれ。 */
export const ORIGINAL_ART_VERSION = 1;

/**
 * その回に画面へ出した絵の版。
 * @param {string} difficultyMode "measure" | "practice"
 * @param {number} practiceVersion れんしゅうの回の絵の版（各遊びの *_ART_VERSION）
 */
export function shownArtVersion(difficultyMode, practiceVersion) {
  return difficultyMode === "measure" ? ORIGINAL_ART_VERSION : practiceVersion;
}

/**
 * 保存から読むときの正規化。版は識別の値なので丸めない: 1 以上の整数だけを残し、
 * ほかは null（分からない。この列を持たない古い記録も null）。
 */
export function sanitizeArtVersion(value) {
  return Number.isInteger(value) && value >= 1 ? value : null;
}
