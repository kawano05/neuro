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
 * れんしゅうの回の絵（遊びの中の「この遊びの設定」の「絵」。settings.practiceArts）。
 *   world   … 新しい絵（世界つき。各遊びの art/<遊び>WorldArt.js と world-<遊び>.css）
 *   classic … 前の絵（2026-09-30 より前の、れんしゅうの回の見た目）
 * 「品質が下がった」と言われ、前の絵と見比べたうえで、ユーザーが「設定できるように」
 * 「ゲーム内のこの遊びの設定から」と決めた（2026-10-01）。そくていの回は、どちらを選んでも前の絵のまま。
 */
export const PRACTICE_ARTS = Object.freeze(["world", "classic"]);
export const DEFAULT_PRACTICE_ART = "world";

/** 絵を選ぶ単位（同じ絵を使う遊びは一緒に変わる。ひとつ止める・3つ止める は同じリールの絵）。 */
export const ART_FAMILIES = Object.freeze({
  "slot-l1": "slot",
  "slot-l2": "slot",
  crane: "crane",
  fishing: "fishing",
  "fishing-gonogo": "fishing",
  gonogo: "gonogo",
});

/** 保存の既定（settings.practiceArts）。 */
export const DEFAULT_PRACTICE_ARTS = Object.freeze(
  Object.fromEntries([...new Set(Object.values(ART_FAMILIES))].map((family) => [family, DEFAULT_PRACTICE_ART]))
);

/** この遊びの れんしゅうの回に選ばれている絵。絵を選べない遊び・知らない値は既定。 */
export function practiceArtFor(settings, gameId) {
  const chosen = settings?.practiceArts?.[ART_FAMILIES[gameId]];
  return PRACTICE_ARTS.includes(chosen) ? chosen : DEFAULT_PRACTICE_ART;
}

/** 保存の正規化（state.js の sanitize から呼ぶ）。知らない値は既定へ。 */
export function sanitizePracticeArts(value) {
  return Object.fromEntries(
    Object.keys(DEFAULT_PRACTICE_ARTS).map((family) => {
      const chosen = value && typeof value === "object" ? value[family] : undefined;
      return [family, PRACTICE_ARTS.includes(chosen) ? chosen : DEFAULT_PRACTICE_ART];
    })
  );
}

/**
 * この回に新しい絵（世界つき）を出すか。そくていの回はいつも出さない。
 * 知らない値は新しい絵（既定）として扱う（保存の sanitize が既定へ戻すのと同じ）。
 * @param {string} difficultyMode "measure" | "practice"
 * @param {string} [practiceArt] この遊びの絵（practiceArtFor）
 */
export function showsWorldArt(difficultyMode, practiceArt = DEFAULT_PRACTICE_ART) {
  return difficultyMode !== "measure" && practiceArt !== "classic";
}

/**
 * その回に画面へ出した絵の版。
 * @param {string} difficultyMode "measure" | "practice"
 * @param {number} practiceVersion れんしゅうの回の新しい絵の版（各遊びの *_ART_VERSION）
 * @param {string} [practiceArt] この遊びの絵（practiceArtFor）。前の絵なら版 1
 */
export function shownArtVersion(difficultyMode, practiceVersion, practiceArt = DEFAULT_PRACTICE_ART) {
  return showsWorldArt(difficultyMode, practiceArt) ? practiceVersion : ORIGINAL_ART_VERSION;
}

/**
 * 保存から読むときの正規化。版は識別の値なので丸めない: 1 以上の整数だけを残し、
 * ほかは null（分からない。この列を持たない古い記録も null）。
 */
export function sanitizeArtVersion(value) {
  return Number.isInteger(value) && value >= 1 ? value : null;
}
