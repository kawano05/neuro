// =====================================================================
// scan.js — 走査（スキャン）エンジン
//
// 画面上の [data-scan] 要素を一定間隔でハイライトし、単一スイッチ入力
// （入力ボタン / Space / Enter）で現在ハイライト中の要素を「押す」。
//
// 既知の制約（docs/refactoring-notes 参照）:
//   - 各ビューが innerHTML を全面再構築すると .scan-focus が消え、
//     走査位置が実質リセットされる（refresh() 内の index 補正のみ）。
//   - Web上の自前走査とiOS実機のSwitch Controlは同時に動かさない。
//     settings.switchControlMode=true のときは、このエンジンの全入口を
//     停止し、OS側だけへ走査所有権を委譲する。
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

  /** iPad Switch Controlへ走査所有権を委譲しているか。 */
  function usesNativeSwitchControl() {
    return Boolean(state.settings.switchControlMode);
  }

  /**
   * 支援者メニュー（設定画面）を開いているか。
   *
   * ここの操作子は支援者がタップ／キーボードで触るもので、スイッチ走査の
   * 対象にしない。走査で回しても利用者が選ぶ項目は1つもなく、輪が23個
   * 伸びるだけで、利用者が本当に押したいもの（ホームへもどる）に届くまでの
   * 待ち時間が延びる。
   *
   * 面の中身だけを外し、タブバー（#homeReturn を含む）と #toggleScan は
   * 輪に残す——ここまで断つと、利用者が誤って支援者の世界へ入ったときに
   * 走査だけでは home へ戻れなくなり、実機確認2026-07-04で見つけた
   * 「強制終了以外に戻れない」欠落が戻る（basic-design.md §3.2）。
   */
  function isSupporterMenu() {
    return state.currentView === "settings";
  }

  /** 残っている黄色い枠を消し、自前走査の位置を破棄する。 */
  function clearScanFocus() {
    scanIndex = -1;
    document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
  }

  /** 現在のアクティブビューから走査対象を再収集する */
  function refresh() {
    if (usesNativeSwitchControl()) {
      scanTargets = [];
      clearScanFocus();
      return;
    }
    const activeView = document.querySelector(".view.is-active");
    scanTargets = [
      ...document.querySelectorAll(".tabbar [data-scan]"),
      ...(activeView && !isSupporterMenu() ? [...activeView.querySelectorAll("[data-scan]")] : []),
      elements.toggleScan,
    ].filter((target) => {
      const rect = target.getBoundingClientRect();
      // 現在表示中のタブを再選択しても画面が再描画されるだけなので、
      // 自前走査からは除外する（通常のTab/VoiceOver操作はそのまま残る）。
      const isCurrentTab = target.matches?.(".tab.is-active");
      return !target.disabled && !isCurrentTab && rect.width > 0 && rect.height > 0;
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
    if (usesNativeSwitchControl()) {
      stop(true);
      return;
    }
    refresh();
    if (!scanTargets.length) return;
    scanIndex = (scanIndex + 1) % scanTargets.length;
    updateFocus();
  }

  /** 走査を開始する（既に動いていれば作り直す） */
  function start() {
    // 明示モード中は手動ボタンや将来の呼び出し元からも再開させない。
    if (usesNativeSwitchControl()) {
      stop(true);
      return;
    }
    // ゲーム中・スタート画面中は絶対に走査しない（不変条件、
    // detailed-design.md §8.4の二重防御をstartにも拡張）。
    // gameHost.launch() の scan.stop(true) が一次防御、これは二次防御。
    // start は「走査対象なし・全画面が入力」（detailed-design.md §2.1）のため、
    // タブバー等が誤って走査され続ける事故を防ぐ。
    if (state.currentView === "game" || state.currentView === "start") return;
    stop(false);
    refresh();
    scanIndex = scanTargets.length ? Math.max(0, scanIndex) : -1;
    updateFocus();
    scanTimer = window.setInterval(step, state.settings.scanInterval);
    elements.scanState.textContent = "走査中";
    elements.toggleScanLabel.textContent = "走査停止";
  }

  /** 走査を停止する。clearFocus=false ならハイライト位置を保持する。 */
  function stop(clearFocus = true) {
    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }
    elements.scanState.textContent = usesNativeSwitchControl() ? "iPad走査を使用" : "走査停止中";
    elements.toggleScanLabel.textContent = "走査開始";
    if (clearFocus) {
      clearScanFocus();
    }
  }

  /**
   * ビューの再描画後に走査を組み直す。
   * setTimeout(0) で再描画完了後に走査対象を収集し直す。
   */
  function restartIfNeeded() {
    if (usesNativeSwitchControl()) {
      stop(true);
      return;
    }
    // ゲーム中・スタート画面中は絶対に走査しない（不変条件、
    // detailed-design.md §8.4の二重防御をstartにも拡張、§2.1）。
    if (state.currentView === "game" || state.currentView === "start") return;
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
    if (usesNativeSwitchControl()) return;
    refresh();
    if (!scanTargets.length || scanIndex < 0) {
      if (state.currentView === "operation") ctx.views.operation.handlePrimary();
      return;
    }
    const target = scanTargets[scanIndex];
    if (target === elements.toggleScan) {
      // 走査で「走査停止」を選んだときは、ハイライトを残したまま止める。
      //
      // 位置まで捨てると scanIndex が -1 になり、そのあとは何度押しても
      // activate() の先頭で return するだけ——スイッチ1つの利用者が、
      // 自分で唯一の操作経路を閉じて、支援者がタップするまで戻れない
      // 状態になっていた（2026-08-29に発見。支援者メニューの輪を短く
      // したぶん、走査停止に当たる確率が上がって顕在化しやすくなった）。
      //
      // 位置を残せば、次の一押しは同じ項目（いまは「走査開始」）に当たり、
      // 自力で動き出せる。支援者がボタンを押して止める場合は従来どおり
      // 位置を捨てる（そちらは戻す手がある）。
      if (scanTimer) stop(false);
      else start();
      return;
    }
    target.click();
  }

  /** 走査の開始/停止をトグルする */
  function toggle() {
    if (usesNativeSwitchControl()) {
      stop(true);
      return;
    }
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
