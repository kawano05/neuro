// =====================================================================
// neuronodeApp.js — アプリのブートストラップ（配線役）
//
// 旧バージョンではこのファイルに全ロジック（約1,100行）が入っていたが、
// 現在は以下のモジュールに分割されている:
//
//   content.js   … 教材・タスク・研究条件の純粋データ（ゲーム追加の起点）
//   state.js     … 状態の初期値・読み込み・保存（保存失敗の通知付き）
//   utils.js     … escapeHtml / escapeCsv / formatTime / formatDuration
//   dom.js       … DOM要素レジストリ
//   audio.js     … 効果音・読み上げ（音バリエーション対応の集約先）
//   scan.js      … 走査エンジン
//   games/*.js   … ゲーム基盤（registry / gameHost / colorLegacy 等）
//   views/*.js   … 各画面（home / matching / voca / letters /
//                  operation / evaluation / research / log / settings）
//
// 各モジュールは共有コンテキスト ctx を介して連携する:
//   ctx = { state, elements, save, announce, speak, playTone, audio,
//           scan, logEvent, switchView, renderAll, views, gameHost }
//
// このファイルの責務は「ctx の構築」「ビューの初期化」「画面横断の
// イベント配線（タブ・スイッチ入力・キーボード・タイマー・SW登録）」のみ。
// =====================================================================

import { visibleViews } from "./content.js";
import { loadState, createStateSaver } from "./state.js";
import { collectElements } from "./dom.js";
import { createAudio } from "./audio.js";
import { createScanEngine } from "./scan.js";
import { createInputDeduper } from "./utils.js";
import { createGameHost } from "./games/gameHost.js";
import { initHome } from "./views/home.js";
import { initMatching } from "./views/matching.js";
import { initVoca } from "./views/voca.js";
import { initLetters } from "./views/letters.js";
import { initOperation } from "./views/operation.js";
import { initEvaluation } from "./views/evaluation.js";
import { initResearch } from "./views/research.js";
import { initLog } from "./views/log.js";
import { initSettings } from "./views/settings.js";

// 同一物理入力（pointerdown → click 等）の多重発火を1入力に畳む閾値
// （detailed-design.md §3.3）。根拠は utils.js の createInputDeduper 参照。
const SWITCH_INPUT_DEDUPE_MS = 150;

// 既存ビュー（switcher/matching/...）は currentView の値と .view の id が
// 完全一致するが、P1-1 で追加した4ビューは detailed-design.md §10 の指定で
// id に "View" が付く（例: currentView "home" → id="homeView"）。
// renderAll() の表示切り替えではこのマップで id を解決する。
const VIEW_ELEMENT_IDS = {
  start: "startView",
  home: "homeView",
  game: "gameView",
  result: "resultView",
};

// 支援者の世界（タブ群）を構成するビュー名（basic-design.md §3.2）。
// #homeReturn（「← ホームへ」導線）はこの集合に属するビューでだけ表示する。
// 利用者の世界（start/home/game/result）では、home 自体も含めて非表示にする
// （実機確認2026-07-04：タブビューから戻れない導線欠落の修正、detailed-design.md §10）。
const TAB_WORLD_VIEWS = new Set([
  "matching",
  "voca",
  "letters",
  "operation",
  "evaluation",
  "research",
  "log",
  "settings",
]);

export function initNeuroNodeApp() {
  // --- 状態と要素 ---
  const elements = collectElements();
  const state = loadState();
  // MUST（detailed-design.md §2.1）: 再訪時でも必ず start から始める。
  // AudioContext のアンロックと入力導通確認を毎回保証するため、保存されていた
  // 画面に関わらず無条件で上書きする（旧「visibleViews にない場合 switcher へ」
  // という一部フォールバックの分岐をこれで置換した）。
  state.currentView = "start";

  // --- 共有コンテキストの構築 ---
  const ctx = { state, elements, views: {} };

  ctx.announce = (message) => {
    elements.liveRegion.textContent = message;
  };

  ctx.save = createStateSaver(state, () =>
    ctx.announce("データの保存に失敗しました。端末の空き容量を確認してください。")
  );

  const audio = createAudio(() => state.settings);
  ctx.audio = audio;
  ctx.speak = audio.speak;
  ctx.playTone = audio.playTone;

  ctx.scan = createScanEngine(ctx);

  /**
   * 操作ログの追加。直近300件を保持し、効果測定の自動集計、
   * ログ画面・効果測定画面の再描画まで行う。
   */
  ctx.logEvent = function logEvent(entry) {
    state.logs.unshift({
      time: new Date().toISOString(),
      view: state.currentView,
      ...entry,
    });
    state.logs = state.logs.slice(0, 300);
    ctx.views.evaluation.countEntry(entry);
    ctx.save();
    ctx.views.log.render();
    ctx.views.evaluation.render();
  };

  /** 画面の切り替え。visibleViews にない画面は start へフォールバックする。 */
  ctx.switchView = function switchView(viewName) {
    const nextView = visibleViews.has(viewName) ? viewName : "start";
    state.currentView = nextView;
    ctx.save();
    ctx.renderAll();
    ctx.scan.restartIfNeeded();
  };

  // ゲームの起動・入力振り分け・終了処理（detailed-design.md §3.2）。
  // logEvent・save・announce・scan がすでに ctx にあることが前提なので、
  // それらの定義より後に構築する。
  ctx.gameHost = createGameHost(ctx);

  // --- ビューの初期化（各ビューがリスナーを自前で張る） ---
  ctx.views.home = initHome(ctx);
  ctx.views.matching = initMatching(ctx);
  ctx.views.voca = initVoca(ctx);
  ctx.views.letters = initLetters(ctx);
  ctx.views.operation = initOperation(ctx);
  ctx.views.evaluation = initEvaluation(ctx);
  ctx.views.research = initResearch(ctx);
  ctx.views.log = initLog(ctx);
  ctx.views.settings = initSettings(ctx);

  /**
   * 全ビューの再描画（順序は旧 render() を踏襲）。
   * state.currentView に応じたタブ／ビューの表示切り替えと
   * body.game-mode の同期（detailed-design.md §10）もここで行う。
   * switchView() と gameHost / home の画面遷移の双方から呼ばれる共通経路。
   */
  ctx.renderAll = function renderAll() {
    const nextView = state.currentView;
    const nextViewElementId = VIEW_ELEMENT_IDS[nextView] || nextView;
    elements.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === nextView);
      tab.setAttribute("aria-selected", String(tab.dataset.view === nextView));
    });
    elements.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === nextViewElementId);
    });
    document.body.classList.toggle("game-mode", nextView === "game");
    // スタート画面では支援者向けシェル（ヘッダ・タブバー）を CSS で隠し、
    // 「はじめる」への集中を保つ（styles.css の body.start-mode ルール参照）。
    // 支援者のタップ導線は #startSettingsLink（せってい）が残る。
    document.body.classList.toggle("start-mode", nextView === "start");
    elements.homeReturn.hidden = !TAB_WORLD_VIEWS.has(nextView);

    ctx.views.home.render();
    ctx.views.matching.render();
    ctx.views.voca.render();
    ctx.views.letters.render();
    ctx.views.operation.render();
    ctx.views.evaluation.render();
    ctx.views.research.render();
    ctx.views.settings.render();
    ctx.views.log.render();
    ctx.gameHost.render();
    ctx.views.settings.applyClasses();
  };

  // --- 入力ファネル（シェル側一元計時、detailed-design.md §3.3） ---
  const shouldAcceptSwitchInput = createInputDeduper(SWITCH_INPUT_DEDUPE_MS);

  /** t（シェルが計時した performance.now() 値）を現在の画面に応じて振り分ける。 */
  function onSwitchInput(t, source) {
    if (state.currentView === "game") {
      ctx.gameHost.dispatchInput(t, source);
      return;
    }
    if (state.currentView === "start") {
      ctx.views.home.leaveStart(t);
      return;
    }
    ctx.scan.activate();
  }

  /** 入力イベントの入口。最初の1行で計時し、dedupe を通してから振り分ける（MUST）。 */
  function acceptSwitchEvent(source) {
    const t = performance.now(); // dedupe判定より前に計時（MUST, §3.3）
    if (!shouldAcceptSwitchInput(t)) return;
    onSwitchInput(t, source);
  }

  // --- 画面横断のイベント配線 ---
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => ctx.switchView(tab.dataset.view));
  });

  // 「← ホームへ」: 支援者の世界（タブ群）から利用者の世界（home）へ戻る唯一の
  // 導線。data-scan を付けているため、スイッチ利用者が誤ってタブ世界に入っても
  // 走査で自力到達できる（実機確認2026-07-04で発覚した欠落の修正）。
  elements.homeReturn.addEventListener("click", () => {
    ctx.switchView("home");
    ctx.announce("メニューにもどります");
  });

  // 入力ファネルの対象要素: 通常の入力ボタン、スタート画面のステージ、
  // ゲームステージ（全画面スイッチ）。pointerdown と click の両方を受ける
  // （iOS Switch Control 等では synthetic click のみが届く環境があるため
  // pointerdown 単独に寄せない。§3.3）。同一物理入力からの重複発火は
  // dedupe が吸収する。
  [elements.primarySwitch, elements.startStage, elements.gameStage].forEach((target) => {
    target.addEventListener("pointerdown", () => acceptSwitchEvent("pointer"));
    target.addEventListener("click", () => acceptSwitchEvent("pointer"));
  });

  elements.toggleScan.addEventListener("click", () => ctx.scan.toggle());

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (event.key === "Escape") {
      // ゲーム中の Esc はホスト側の強制終了（home へ直帰）。
      // それ以外は従来どおり走査停止（detailed-design.md §2.4）。
      if (state.currentView === "game") {
        ctx.gameHost.abort();
      } else {
        ctx.scan.stop();
      }
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return; // 押しっぱなしの連続 keydown は無視する（MUST, §3.3）
      acceptSwitchEvent("keyboard");
    }
    if (event.key === "ArrowRight" && state.currentView !== "game") {
      event.preventDefault();
      ctx.scan.step();
    }
  });

  // ゲーム中にタブが非アクティブ化したらセッションを中断して home へ直帰する
  // （detailed-design.md §2.4 終了条件3。計時汚染防止のため再開はしない）。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.currentView === "game") {
      ctx.gameHost.abort();
    }
  });

  window.addEventListener("resize", () => ctx.scan.refresh());

  // Service Worker は本番ビルド時のみ登録（開発時のキャッシュ事故防止）
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  // タスク計測中の経過時間表示（1秒）とポイントスキャンのカーソル（200ms）
  window.setInterval(() => {
    if (state.evaluation.taskStartedAt) ctx.views.evaluation.render();
  }, 1000);
  window.setInterval(() => ctx.views.operation.updatePointCursor(), 200);

  // --- 初期描画 ---
  ctx.renderAll();
  ctx.switchView(state.currentView);
}
