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

/** CSVセルのエスケープ */
export function escapeCsv(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** ISO文字列 → "HH:MM:SS"（ja-JP） */
export function formatTime(isoString) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoString));
}

/** ミリ秒 → "X分Y秒" / "Y秒" / "--" */
export function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return "--";
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}
