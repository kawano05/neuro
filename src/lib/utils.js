// =====================================================================
// utils.js — 汎用ヘルパー（純粋関数のみ。DOM・状態に依存しない）
// =====================================================================

/** HTMLエスケープ（innerHTML へ流し込む文字列に必ず通す） */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

/**
 * CSVセルのエスケープ。
 *
 * 文字列セルの先頭（空白類を除く）が = / + / - / @ の場合、Excel等で
 * 数式として評価されないよう先頭へアポストロフィを付ける。数値型の負数は
 * 正当な数値としてそのまま出力する。
 */
export function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  const safeText =
    typeof value === "string" && /^[\s\ufeff]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

/** ISO文字列 → "HH:MM:SS"（ja-JP） */
export function formatTime(isoString) {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** ミリ秒 → "X分Y秒" / "Y秒" / "--" */
export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "--";
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

/**
 * スイッチ入力の多重発火（pointerdown → click 等、同一物理入力からの重複
 * イベント）を1入力に畳むためのヘルパー（detailed-design.md §3.3）。
 *
 * 閾値の根拠: 150ms は「同一イベントの重複除去」であり、利用者の連続入力を
 * 抑制するためのものではない。対象集団（重度肢体不自由等でスイッチ操作を
 * 行う利用者）が150ms以内に意図的な2連打を行うことは現実的に想定しづらく、
 * また NeuroNode 等のスイッチデバイス側にもチャタリング防止の信号処理がある
 * ため、この閾値は「入力の意図」ではなく「イベント配線の重複」だけを吸収する
 * 設計としている。
 *
 * DOM に依存しない純粋関数として切り出してあるため、tests/judge.test.mjs 等の
 * node 実行の単体テストから直接呼べる（detailed-design.md §11.1 の8番目）。
 *
 * @param {number} thresholdMs - 直前に受理した入力からこの時間未満の入力は棄却する
 * @returns {(t: number) => boolean} shouldAccept(t) - t（performance.now() 相当のms）を
 *   渡すと、受理するなら true を返し内部状態を更新する。棄却するなら false を返す
 *   （内部状態は更新しない）。
 */
export function createInputDeduper(thresholdMs) {
  let lastAcceptedAt = -Infinity;
  return function shouldAccept(t) {
    if (t - lastAcceptedAt < thresholdMs) return false;
    lastAcceptedAt = t;
    return true;
  };
}
