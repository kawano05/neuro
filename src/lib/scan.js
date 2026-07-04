// =====================================================================
// scan.js — 走査（スキャン）エンジン
//
// 画面上の [data-scan] 要素を一定間隔でハイライトし、単一スイッチ入力
// （入力ボタン / Space / Enter）で現在ハイライト中の要素を「押す」。
//
// 既知の制約（docs/refactoring-notes 参照）:
//   - 各ビューが innerHTML を全面再構築すると .scan-focus が消え、
//     走査位置が実質リセットされる（refresh() 内の index 補正のみ）。
//   - これは Web 上で Switch Control を「模擬」するための自前走査であり、
//     iOS 実機の Switch Control とは二重走査になる。iOS 版では自前走査を
//     OFF にする運用（autoScan=false + 走査UI非表示）を検討すること。
// =====================================================================

/**
 * @param {object} ctx - アプリ共有コンテキスト
 *   使用するもの: ctx.state / ctx.elements / ctx.views（遅延参照）
 */
export function createScanEngine(ctx) {
  const { state, elements } = ctx;

  let scanTargets = [];
  let scanIndex = -1;
  let scanTimer = null;

  /** 現在のアクティブビューから走査対象を再収集する */
  function refresh() {
    const activeView = document.querySelector(".view.is-active");
    scanTargets = [
      ...document.querySelectorAll(".tabbar [data-scan]"),
      ...(activeView ? [...activeView.querySelectorAll("[data-scan]")] : []),
      elements.toggleScan,
    ].filter((target) => {
      const rect = target.getBoundingClientRect();
      return !target.disabled && rect.width > 0 && rect.height > 0;
    });
    if (scanIndex >= scanTargets.length) scanIndex = 0;
    updateFocus();
  }

  /** 走査フォーカスの見た目を現在の index に同期する */
  function updateFocus() {
    document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
    if (!scanTargets.length || scanIndex < 0) return;
    const target = scanTargets[scanIndex];
    target.classList.add("scan-focus");
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /** ハイライトを1つ進める（自動走査のタイマー、または → キー） */
  function step() {
    refresh();
    if (!scanTargets.length) return;
    scanIndex = (scanIndex + 1) % scanTargets.length;
    updateFocus();
  }

  /** 走査を開始する（既に動いていれば作り直す） */
  function start() {
    // ゲーム中は絶対に走査しない（不変条件、detailed-design.md §8.4の二重防御）。
    // gameHost.launch() の scan.stop(true) が一次防御、これは二次防御。
    if (state.currentView === "game") return;
    stop(false);
    refresh();
    scanIndex = scanTargets.length ? Math.max(0, scanIndex) : -1;
    updateFocus();
    scanTimer = window.setInterval(step, state.settings.scanInterval);
    elements.scanState.textContent = "走査中";
    elements.toggleScan.textContent = "走査停止";
  }

  /** 走査を停止する。clearFocus=false ならハイライト位置を保持する。 */
  function stop(clearFocus = true) {
    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }
    elements.scanState.textContent = "走査停止中";
    elements.toggleScan.textContent = "走査開始";
    if (clearFocus) {
      scanIndex = -1;
      document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
    }
  }

  /**
   * ビューの再描画後に走査を組み直す。
   * setTimeout(0) で再描画完了後に走査対象を収集し直す。
   */
  function restartIfNeeded() {
    // ゲーム中は絶対に走査しない（不変条件、detailed-design.md §8.4の二重防御）。
    if (state.currentView === "game") return;
    window.setTimeout(() => {
      refresh();
      if (state.settings.autoScan) start();
    }, 0);
  }

  /**
   * 単一スイッチ入力（入力ボタン / Space / Enter）の本体。
   * 走査中なら現在ハイライト中の要素をクリック、走査していなければ
   * 現在のビューに応じた既定アクションへフォールバックする。
   */
  function activate() {
    refresh();
    if (!scanTargets.length || scanIndex < 0) {
      if (state.currentView === "operation") ctx.views.operation.handlePrimary();
      return;
    }
    const target = scanTargets[scanIndex];
    if (target === elements.toggleScan) {
      toggle();
      return;
    }
    target.click();
  }

  /** 走査の開始/停止をトグルする */
  function toggle() {
    if (scanTimer) {
      stop();
    } else {
      start();
    }
  }

  /** 走査タイマーが動いているか（設定変更時の再起動判定に使用） */
  function isRunning() {
    return Boolean(scanTimer);
  }

  return { refresh, step, start, stop, restartIfNeeded, activate, toggle, isRunning };
}
