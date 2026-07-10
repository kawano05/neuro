// =====================================================================
// views/log.js — 評価ログ画面（操作ログの集計・一覧・CSV書き出し）
// =====================================================================

import { escapeHtml, escapeCsv, formatTime } from "../utils.js";
import { MAX_LOG_ENTRIES } from "../state.js";

export function initLog(ctx) {
  const { state, elements, save, announce } = ctx;

  /** 集計値とログ一覧（直近32件）の描画 */
  function render() {
    const total = state.logs.filter((entry) => entry.type !== "system").length;
    // 正答率の母数は正誤判定がある matching / letter のみ
    const graded = state.logs.filter((entry) => entry.type === "matching" || entry.type === "letter");
    const mistakes = graded.filter((entry) => !entry.correct).length;
    const correct = graded.filter((entry) => entry.correct).length;
    elements.totalInputs.textContent = String(total);
    elements.mistakeCount.textContent = String(mistakes);
    elements.accuracyRate.textContent = graded.length
      ? `${Math.round((correct / graded.length) * 100)}%`
      : "--";

    elements.logList.innerHTML = "";
    if (state.logs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "まだログはありません。教材、マッチング、VOCA、文字学習で入力すると記録されます。";
      elements.logList.append(empty);
      return;
    }

    if (state.logs.length >= MAX_LOG_ENTRIES) {
      const retentionWarning = document.createElement("div");
      retentionWarning.className = "empty-state";
      retentionWarning.textContent =
        `保存上限の直近${MAX_LOG_ENTRIES}件に達しています。` +
        "次の入力から最も古いログが置き換わるため、必要なら先にCSVを書き出してください。";
      elements.logList.append(retentionWarning);
    }

    state.logs.slice(0, 32).forEach((entry) => {
      const item = document.createElement("article");
      item.className = "log-item";
      const result = entry.correct === true ? "正答" : entry.correct === false ? "誤選択" : "";
      item.innerHTML = `
      <span class="metric-label">${formatTime(entry.time)}</span>
      <strong>${escapeHtml(entry.label || entry.type)}</strong>
      <span>${result}</span>
    `;
      elements.logList.append(item);
    });
  }

  /** 全ログをBOM付きCSVでダウンロードする */
  function exportCsv() {
    if (!state.logs.length) {
      announce("書き出すログがありません");
      return;
    }
    const rows = [
      ["time", "view", "type", "label", "correct"],
      ...state.logs.map((entry) => [
        entry.time,
        entry.view,
        entry.type,
        entry.label || "",
        entry.correct ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  elements.exportCsv.addEventListener("click", exportCsv);
  elements.clearLog.addEventListener("click", () => {
    state.logs = [];
    save();
    render();
    announce("ログを削除しました");
  });

  return { render };
}
