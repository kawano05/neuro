// =====================================================================
// homeTheme.js — ホームのタイルの色・絵・札（デザイン「はっきりした色」）
//
// docs/design-renewal-2026-09-25.md §2。遊びごとに色を分け、見分けやすくする。
// 色はカラーユニバーサルデザイン推奨配色（アクセントカラー）から取っている
// ——色の見え方が違う利用者・支援者にも区別がつく組み合わせ。
//
// 帯（band）の文字色は、帯の色とのコントラスト比 4.5 以上で選んだ:
//   #005AFF / 白 5.4   #FF4B00 / 黒 5.2   #990099 / 白 7.5
//   #804000 / 白 7.9   #4DC4FF / 黒 8.8   #03AF7A / 黒 6.1
//   #FF8082 / 黒 7.2   #F6AA00 / 黒 8.8
// （黒は #1A1A1A。赤橙と空色に白を載せると 3.4 / 2.0 で読めない）
//
// content.js のタイル定義（研究の taskType などを持つ純粋データ）とは分けて
// 持つ。見た目を差し替えても、記録の意味に関わる定義へ触らずに済むように。
// =====================================================================

/** 遊びの系統ごとの色。子のタイル（コーナーの中）は親の色を継ぐ。 */
const PALETTE = {
  pop: { band: "#005AFF", ink: "#FFFFFF", thumb: "#12305E" },
  balloon: { band: "#FF8082", ink: "#1A1A1A", thumb: "#FFF3CC" },
  coloring: { band: "#F6AA00", ink: "#1A1A1A", thumb: "#FFF6E0" },
  reel: { band: "#FF4B00", ink: "#1A1A1A", thumb: "#FFE5DA" },
  high: { band: "#990099", ink: "#FFFFFF", thumb: "#F6DDF6" },
  arm: { band: "#804000", ink: "#FFFFFF", thumb: "#F3E4D6" },
  fish: { band: "#4DC4FF", ink: "#1A1A1A", thumb: "#D9F3FF" },
  learn: { band: "#03AF7A", ink: "#1A1A1A", thumb: "#D6F5EA" },
};

/**
 * タイルID → 見た目。
 *   palette … 上の系統
 *   art     … art/hakkiriArt.js の SCENE_ART のキー
 *   level   … 札（i18n の level.*）。null なら札を出さない
 */
export const TILE_THEME = {
  // ロビー（1画面に並ぶ7つ＋べつの遊び）。左上がいちばん簡単。
  // はじめの3つ（失敗の無い遊び）は「かんたん」、その先頭の1番だけ
  // 「はじめは ここから」。打ち合わせで「初級、初級、初級……と並んでいて、
  // そこから中級・上級」という1画面の並びを言われた。
  "color-legacy": { palette: "pop", art: "pop", level: "first" },
  balloon: { palette: "balloon", art: "balloon", level: "easy" },
  coloring: { palette: "coloring", art: "coloring", level: "easy" },
  "slot-corner": { palette: "reel", art: "reel", level: "used" },
  gonogo: { palette: "high", art: "high", level: "used" },
  "crane-corner": { palette: "arm", art: "arm", level: "challenge" },
  "fishing-corner": { palette: "fish", art: "fish", level: "challenge" },
  "learning-corner": { palette: "learn", art: "learn", level: "other" },

  // コーナーの中（遊びかたを選ぶ画面）
  "slot-l1": { palette: "reel", art: "reelOne", level: "used" },
  "slot-l2": { palette: "reel", art: "reelThree", level: "challenge" },
  crane: { palette: "arm", art: "arm", level: "challenge" },
  "crane-endless": { palette: "arm", art: "arm", level: "endless" },
  fishing: { palette: "fish", art: "fish", level: "challenge" },
  "fishing-gonogo": { palette: "fish", art: "fish", level: "challenge" },
  "fishing-endless": { palette: "fish", art: "fish", level: "endless" },
  matching: { palette: "learn", art: "learn", level: null },
  voca: { palette: "learn", art: "learn", level: null },
  letters: { palette: "learn", art: "learn", level: null },
};

/**
 * タイルIDの見た目を引く。無ければ null（戻る・ページ送りなど、遊びではない項目）。
 * @param {string} tileId
 */
export function tileThemeFor(tileId) {
  const theme = TILE_THEME[tileId];
  if (!theme) return null;
  return { ...theme, colors: PALETTE[theme.palette] };
}

/** ゲーム画面の上の帯などで、遊びの色を使いたいときに（gameId から引く）。 */
export function gamePalette(gameId) {
  return tileThemeFor(gameId)?.colors ?? null;
}
