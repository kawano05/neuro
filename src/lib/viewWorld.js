// 利用者の世界の一覧を、見た目と走査の境界で共有する。
// デザイン「はっきりした色」（src/theme-hakkiri.css）は利用者の画面に当て、
// 支援者の世界（評価ログ・設定）は業務画面のままにする
// （docs/design-renewal-2026-09-25.md §3.1）。
export const USER_ACTIVITY_VIEWS = new Set(["matching", "voca", "letters"]);
export const USER_WORLD_VIEWS = new Set(["start", "home", "game", "result", ...USER_ACTIVITY_VIEWS]);

// 一覧の外側は支援者の世界。支援者画面を増やすたびに停止対象を追加する
// 方式だと追加漏れで走査が復活するため、利用者の画面だけを明示的に許可する。
export function isSupporterView(viewName) {
  return !USER_WORLD_VIEWS.has(viewName);
}
