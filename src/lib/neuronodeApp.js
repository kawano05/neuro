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
//   views/*.js   … 各画面（switcher / matching / voca / letters /
//                  operation / evaluation / research / log / settings）
//
// 各モジュールは共有コンテキスト ctx を介して連携する:
//   ctx = { state, elements, save, announce, speak, playTone,
//           scan, logEvent, switchView, renderAll, views }
//
// このファイルの責務は「ctx の構築」「ビューの初期化」「画面横断の
// イベント配線（タブ・スイッチ入力・キーボード・タイマー・SW登録）」のみ。
// =====================================================================

import { visibleViews, switchModules } from "./content.js";
import { loadState, createStateSaver } from "./state.js";
import { collectElements } from "./dom.js";
import { createAudio } from "./audio.js";
import { createScanEngine } from "./scan.js";
import { initSwitcher } from "./views/switcher.js";
import { initMatching } from "./views/matching.js";
import { initVoca } from "./views/voca.js";
import { initLetters } from "./views/letters.js";
import { initOperation } from "./views/operation.js";
import { initEvaluation } from "./views/evaluation.js";
import { initResearch } from "./views/research.js";
import { initLog } from "./views/log.js";
import { initSettings } from "./views/settings.js";

export function initNeuroNodeApp() {
  // --- 状態と要素 ---
  const elements = collectElements();
  const state = loadState();
  if (!visibleViews.has(state.currentView)) state.currentView = "switcher";
  if (!switchModules.some((module) => module.id === state.activeSwitchModule)) {
    state.activeSwitchModule = switchModules[0].id;
  }

  // --- 共有コンテキストの構築 ---
  const ctx = { state, elements, views: {} };

  ctx.announce = (message) => {
    elements.liveRegion.textContent = message;
  };

  ctx.save = createStateSaver(state, () =>
    ctx.announce("データの保存に失敗しました。端末の空き容量を確認してください。")
  );

  const audio = createAudio(() => state.settings);
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

  /** 画面の切り替え。visibleViews にない画面は switcher へフォールバックする。 */
  ctx.switchView = function switchView(viewName) {
    const nextView = visibleViews.has(viewName) ? viewName : "switcher";
    state.currentView = nextView;
    elements.tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === nextView);
      tab.setAttribute("aria-selected", String(tab.dataset.view === nextView));
    });
    elements.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === nextView);
    });
    ctx.save();
    ctx.renderAll();
    ctx.scan.restartIfNeeded();
  };

  // --- ビューの初期化（各ビューがリスナーを自前で張る） ---
  ctx.views.switcher = initSwitcher(ctx);
  ctx.views.matching = initMatching(ctx);
  ctx.views.voca = initVoca(ctx);
  ctx.views.letters = initLetters(ctx);
  ctx.views.operation = initOperation(ctx);
  ctx.views.evaluation = initEvaluation(ctx);
  ctx.views.research = initResearch(ctx);
  ctx.views.log = initLog(ctx);
  ctx.views.settings = initSettings(ctx);

  /** 全ビューの再描画（順序は旧 render() を踏襲） */
  ctx.renderAll = function renderAll() {
    ctx.views.switcher.render();
    ctx.views.matching.render();
    ctx.views.voca.render();
    ctx.views.letters.render();
    ctx.views.operation.render();
    ctx.views.evaluation.render();
    ctx.views.research.render();
    ctx.views.settings.render();
    ctx.views.log.render();
    ctx.views.settings.applyClasses();
  };

  // --- 画面横断のイベント配線 ---
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => ctx.switchView(tab.dataset.view));
  });
  elements.primarySwitch.addEventListener("click", () => ctx.scan.activate());
  elements.toggleScan.addEventListener("click", () => ctx.scan.toggle());

  document.addEventListener("keydown", (event) => {
    const tag = event.target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      ctx.scan.activate();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      ctx.scan.step();
    }
    if (event.key === "Escape") {
      ctx.scan.stop();
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
