// =====================================================================
// games/gameHost.js — ゲームの起動・入力振り分け・終了処理
//
// detailed-design.md §3.2 のライフサイクルを実装する:
//   launch(id):    scan.stop(true) → currentView="game" → create → mount
//   finish(summary) (ゲーム側から呼ばれる正常終了): destroy → currentView="result"
//                  → scan.restartIfNeeded()
//   abort()（ホスト側の強制終了。おわる/Esc/visibilitychange）:
//                  destroy → currentView="home" 直帰 → scan.restartIfNeeded()
//
// destroy() は冪等（二重呼び出し許容）。launch() は「前回 instance の
// destroy() を必ず呼ぶ」（多重起動防止、MUST）。
//
// GameCtx の拡張について: detailed-design.md §3.1 の GameCtx 型は
// { settings, audio, logTrial, announce, finish, abort } を最小契約として
// 定義しているが、既存の評価/ログ連動（views/evaluation.js の countEntry が
// entry.type を見て自動集計する仕組み、基本設計書 §1.3 の「継承」領域）を
// ゲーム契約の外から壊さずに使えるよう、ここでは logEvent（アプリ全体の
// ログ関数）も GameCtx に含めて渡す。logTrial（§9.2 のリズム試行スキーマ）は
// P2-3（games/rhythm.js）で実装するまでの間はプレースホルダーとして
// no-op にしてある。
// =====================================================================

import { findGameModule } from "./registry.js";
import { escapeHtml } from "../utils.js";

export function createGameHost(ctx) {
  const { state, elements, scan, announce, save, logEvent } = ctx;

  let activeInstance = null;
  let activeGameId = null;
  let lastResultSummary = null;

  /** instance.destroy() を安全に呼ぶ（例外を握りつぶし、activeInstance を必ずクリアする）。 */
  function destroyActive() {
    if (activeInstance) {
      try {
        activeInstance.destroy();
      } catch (error) {
        console.error("[neuro] ゲームの後片付けに失敗しました", error);
      }
    }
    activeInstance = null;
  }

  /** ゲームに渡す共有コンテキスト（detailed-design.md §3.1、上記コメントの拡張含む）。 */
  function buildGameCtx() {
    return {
      settings: state.settings,
      audio: ctx.audio,
      announce,
      logTrial() {
        // P1-3 時点では未実装（P2-3 で games/rhythm.js が §9.2 のスキーマで実装する）。
      },
      logEvent,
      finish(summary) {
        finishGame(summary);
      },
      abort() {
        returnHome();
      },
    };
  }

  /** ゲームを起動する（detailed-design.md §3.2）。 */
  function launch(gameId) {
    const module = findGameModule(gameId);
    if (!module || module.enabled === false) return;
    destroyActive(); // 多重起動防止（MUST）: 前回 instance の destroy() を必ず呼ぶ
    scan.stop(true);
    activeGameId = gameId;
    lastResultSummary = null;
    state.currentView = "game";
    save();
    ctx.renderAll();
    activeInstance = module.create(buildGameCtx());
    activeInstance.mount(elements.gameStageContent);
  }

  /** ゲーム側の正常終了（規定試行数の完了等）。リザルトへ遷移する。 */
  function finishGame(summary) {
    lastResultSummary = summary || null;
    destroyActive();
    state.currentView = "result";
    save();
    ctx.renderAll();
    scan.restartIfNeeded();
  }

  /**
   * ホスト側の強制終了・支援者操作による終了（おわる／Esc／
   * visibilitychange／「メニューへ」）。リザルトを経由せず home へ直帰する
   * （detailed-design.md §2.4「aborted の場合は home へ直帰」）。
   */
  function returnHome() {
    destroyActive();
    state.currentView = "home";
    save();
    ctx.renderAll();
    scan.restartIfNeeded();
  }

  /** シェルが計時した入力を現在のゲームへ渡す（入力ファネル経由。§3.3）。 */
  function dispatchInput(t, source) {
    if (!activeInstance) return;
    activeInstance.handleInput(t, source);
  }

  /** リザルト画面「もういちど」: 同一ゲームを再起動する。 */
  function retry() {
    if (!activeGameId) return;
    launch(activeGameId);
  }

  elements.gameExit.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.gameExit.addEventListener("click", (event) => {
    event.stopPropagation(); // ファネルに入れない（detailed-design.md §3.3）
    returnHome();
  });
  elements.resultRetry.addEventListener("click", () => retry());
  elements.resultHome.addEventListener("click", () => returnHome());

  return {
    launch,
    dispatchInput,
    retry,
    abort: returnHome,
    getActiveGameId: () => activeGameId,
    getLastSummary: () => lastResultSummary,
    /** gameProgress / resultStats の表示更新（ctx.renderAll() から呼ばれる）。 */
    render() {
      const activeModule = activeGameId ? findGameModule(activeGameId) : null;
      elements.gameProgress.textContent = activeModule ? activeModule.title : "";

      if (lastResultSummary) {
        elements.resultStats.innerHTML = `<p>けっか: ${escapeHtml(JSON.stringify(lastResultSummary))}</p>`;
      } else {
        elements.resultStats.innerHTML =
          '<p class="panel-note">せいせきの表示は次のフェーズ（リズム実装時）で追加します。</p>';
      }
    },
  };
}
