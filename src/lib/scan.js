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
//   - 支援者の世界（評価ログ・設定）でも全入口を停止する。理由と、その代償
//     （利用者が迷い込むと自力で戻れない）は scanningIsOff() に書いた。
// =====================================================================

import { isSupporterView } from "./viewWorld.js";

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
   * この画面では自前走査を動かさないか。
   *
   * 支援者の世界（評価ログ・設定）では自前走査を**一切**動かさない。ここの
   * 操作子は支援者がタップ／キーボードで触るもので、走査で回しても利用者が
   * 選ぶ項目は1つもない。輪が伸びるだけで、黄色い枠が支援者の操作の上を
   * うろつく。
   *
   * 引き換えに何を失うかを明記しておく。以前は面の中身だけを外し、
   * タブバー（#homeReturn を含む）と #toggleScan は輪に残していた。
   * それは、スイッチだけの利用者が誤って支援者の世界へ入ったときの
   * 唯一の帰り道だったから——ここを断つと、実機確認2026-07-04で見つけた
   * 「強制終了以外に戻れない」状態（basic-design.md §3.2）が評価ログにも
   * 広がる。支援者が「ホームへ」をタップして戻す運用で引き受ける、という
   * 判断のうえで断っている。緩めるときは運用ごと見直すこと。
   *
   * 委譲中（iPad Switch Control）と支援者の世界は、理由は違うが結論が
   * 同じ——タイマーも黄色い枠もスイッチ入力の受理も止める。入口ごとに
   * 条件を書き分けると、どこか1つ書き忘れて枠だけが生き残る。
   */
  function scanningIsOff() {
    return usesNativeSwitchControl() || isSupporterView(state.currentView);
  }

  /** 残っている黄色い枠を消し、自前走査の位置を破棄する。 */
  function clearScanFocus() {
    scanIndex = -1;
    document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
  }

  /**
   * 遊びの画面のうち、走査してよい範囲（セレクタ）。null なら走査しない。
   * 決めるのは gameHost（いまどの段階か）。遊んでいる最中・遊ぶ前の説明の画面は
   * null（スイッチの押下は課題の入力か「はじめる」。games/readyScreen.js）。
   */
  function gameScope() {
    return ctx.gameHost?.scanScope?.() ?? null;
  }

  /**
   * いまの画面では走査しないか（遊びの画面で走査の範囲が無い・スタート画面）。
   * gameHost.launch() の scan.stop(true) が一次防御、これは二次防御
   * （detailed-design.md §8.4 を start にも広げた。§2.1）。
   */
  function screenHasNoScan() {
    return (state.currentView === "game" && !gameScope()) || state.currentView === "start";
  }

  /** 現在のアクティブビューから走査対象を再収集する */
  function refresh() {
    if (scanningIsOff()) {
      scanTargets = [];
      stop(true);
      return;
    }
    // 輪が変わっても、枠のあった要素に枠を残す（番号のままだと、見えている枠と
    // 押して選ばれるものが食い違う）。
    const focused = scanTargets[scanIndex] || null;
    scanTargets = collectTargets();
    const kept = focused ? scanTargets.indexOf(focused) : -1;
    if (kept >= 0) scanIndex = kept;
    else if (scanIndex >= scanTargets.length) scanIndex = scanTargets.length ? 0 : -1;
    if (scanIndex >= 0) updateFocus();
  }

  function collectTargets() {
    if (state.currentView === "game") {
      const scope = gameScope();
      return scope ? [...document.querySelectorAll(`${scope} [data-scan]`)].filter(isShown) : [];
    }
    const activeView = document.querySelector(".view.is-active");
    return [
      ...document.querySelectorAll(".tabbar [data-scan]"),
      ...(activeView ? [...activeView.querySelectorAll("[data-scan]")] : []),
      elements.toggleScan,
    ].filter((target) => {
      const rect = target.getBoundingClientRect();
      // 現在表示中のタブを再選択しても画面が再描画されるだけなので、
      // 自前走査からは除外する（通常のTab/VoiceOver操作はそのまま残る）。
      const isCurrentTab = target.matches?.(".tab.is-active");
      return !target.disabled && !isCurrentTab && rect.width > 0 && rect.height > 0;
    });
  }

  function isShown(target) {
    const rect = target.getBoundingClientRect();
    return !target.hidden && !target.disabled && rect.width > 0 && rect.height > 0;
  }

  /** 走査フォーカスの見た目を現在の index に同期する */
  function updateFocus() {
    document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
    if (!scanTargets.length || scanIndex < 0) return;
    const target = scanTargets[scanIndex];
    target.classList.add("scan-focus");
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /**
   * 枠が動いたことを音で伝える（設定の「枠が動いたときの音」）。画面を見続けるのが
   * 難しい利用者のため（打ち合わせ「画面を見なくても、音なら届く」§1.7）。
   *
   * 鳴らすのは枠が「動いた」とき（step）だけ。画面を描き直したときにも鳴らすと、
   * 選んだ直後の「せいかい！」などの声を、次の項目の名前が打ち消してしまう。
   * 利用者の画面（body.user-world）でだけ鳴らし、支援者の画面では鳴らさない。
   */
  function sayTarget(target) {
    const mode = state.settings.scanFeedback;
    const audio = ctx.audio;
    if (!mode || mode === "none" || !audio || !target) return;
    if (!document.body.classList.contains("user-world")) return;
    if (mode === "speak") {
      // 名前は読み上げ名（aria-label）を優先。無ければ、ふりがな（rt）を除いた字。
      let name = target.getAttribute("aria-label") || "";
      if (!name) {
        const copy = target.cloneNode(true);
        copy.querySelectorAll("rt").forEach((reading) => reading.remove());
        name = copy.textContent || "";
      }
      name = name.replace(/\s+/g, " ").trim();
      if (name && audio.speak(name)) return;
    }
    audio.playScanTick?.();
  }

  /** ハイライトを1つ進める（自動走査のタイマー、または → キー） */
  function step() {
    if (scanningIsOff()) {
      stop(true);
      return;
    }
    refresh();
    if (!scanTargets.length) return;
    scanIndex = (scanIndex + 1) % scanTargets.length;
    updateFocus();
    sayTarget(scanTargets[scanIndex]);
  }

  /** 走査を開始する（既に動いていれば作り直す） */
  function start() {
    // 委譲中と支援者の世界では、手動ボタンや将来の呼び出し元からも
    // 再開させない。
    if (scanningIsOff()) {
      stop(true);
      return;
    }
    if (screenHasNoScan()) return;
    stop(false);
    refresh();
    scanIndex = scanTargets.length ? Math.max(0, scanIndex) : -1;
    updateFocus();
    scanTimer = window.setInterval(step, state.settings.scanInterval);
    // 画面に出る言葉は「走査」を使わない（打ち合わせで、ふだん目にしない言葉は
    // 難しく感じると言われた。docs/design-renewal-2026-09-25.md §1.2）。
    elements.scanState.textContent = "枠が動いています";
    elements.toggleScanLabel.textContent = "枠を止める";
  }

  /** 走査を停止する。clearFocus=false ならハイライト位置を保持する。 */
  function stop(clearFocus = true) {
    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }
    elements.scanState.textContent = usesNativeSwitchControl() ? "iPad で操作中" : "枠は止まっています";
    elements.toggleScanLabel.textContent = "枠を動かす";
    if (clearFocus) {
      clearScanFocus();
    }
  }

  /**
   * ビューの再描画後に走査を組み直す。
   * setTimeout(0) で再描画完了後に走査対象を収集し直す。
   */
  function restartIfNeeded() {
    if (scanningIsOff()) {
      stop(true);
      return;
    }
    if (screenHasNoScan()) return;
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
    // 支援者の世界では輪が空なので、押しても何も起きない。ここで先に
    // 返すのは、refresh() を通して黄色い枠を触らせないため。
    if (scanningIsOff()) return;
    refresh();
    if (!scanTargets.length || scanIndex < 0) {
      // 対象が無いときの入力では何も起こさない（隠れた動作を作らない）。
      // 以前は操作訓練ビューだけ既定の動作へ落としていたが、その画面は
      // 別紙の手順書へ置き換えて削除した（2026-08-29）。
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
    if (scanningIsOff()) {
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
