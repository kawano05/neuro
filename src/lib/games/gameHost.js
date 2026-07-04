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
// ログ関数）も GameCtx に含めて渡す。
//
// P2-3 で logTrial を実装した（それまでは no-op スタブ）。GameCtx にはさらに
// 2つの実用上のパススルーを追加した（games/rhythm.js 冒頭のコメント参照）:
//   - participantId … state.evaluation.participantId のスナップショット
//     （リズムセッション記録の participantId 用）。
//   - setProgress(text) … #gameProgress（gameHost 管轄のDOM）を更新する。
//     mount(stageEl) で渡るのは gameStageContent だけなので、そこに無い
//     兄弟要素を更新するための小さな抜け道。
//
// logTrial(session) の設計判断: rhythm.js は state / save を持たないため、
// 「セッションの現時点までの全体スナップショット（trials 配列を含む）」を
// 毎回渡してもらい、ここで sessionId をキーに state.rhythm.sessions へ
// upsert する（同一セッション内の複数回呼び出しは同じ session オブジェクトを
// 指すため、実質的には「最新状態で置き換える」だけで良い）。この方式なら
// 支援者操作/Esc/visibilitychange による中断（destroy() 経由、finish() を
// 経由しない）でも、直前までの trials が確実に永続化される
// （detailed-design.md §7.3 の aborted:true 確定要件）。
// =====================================================================

import { findGameModule } from "./registry.js";
import { MAX_RHYTHM_SESSIONS } from "../state.js";

/** 符号付きms表記（"+62ms" 等）。値が無ければ "--"。 */
function formatSignedMs(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}ms`;
}

/** オフセットの符号を「はやめ/おそめ」に言い換える（detailed-design.md §2.5・§5.2規則4）。 */
function offsetDirectionLabel(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  if (value < 0) return "（はやめに おせたよ）";
  if (value > 0) return "（おそめに おせたよ）";
  return "（ぴったり！）";
}

/** リザルト画面の成績表示（detailed-design.md §2.5）。 */
function renderResultStats(summary) {
  const totalGoBeats = summary.hits + summary.misses;
  const hitRatePercent = totalGoBeats ? Math.round((summary.hits / totalGoBeats) * 100) : 0;
  const sdLabel = typeof summary.sdRawOffsetMs === "number" ? `${Math.round(summary.sdRawOffsetMs)}ms` : "--";
  return `
    <div class="summary-grid">
      <div class="summary-tile">
        <span class="metric-label">たっせいりつ</span>
        <strong>${hitRatePercent}% <small>(${summary.hits}/${totalGoBeats})</small></strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">へいきんオフセット</span>
        <strong>${formatSignedMs(summary.meanRawOffsetMs)}</strong>
        <p>${offsetDirectionLabel(summary.meanRawOffsetMs)}</p>
      </div>
      <div class="summary-tile">
        <span class="metric-label">ばらつき（SD）</span>
        <strong>${sdLabel}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">よぶんな入力</span>
        <strong>${summary.extras}</strong>
      </div>
    </div>
  `;
}

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

  /**
   * リズム系セッションのスナップショットを state.rhythm.sessions へ upsert する
   * （sessionId をキーに置き換え。直近 MAX_RHYTHM_SESSIONS 件のみ保持、§9.1）。
   */
  function persistRhythmSession(session) {
    if (!session || !session.sessionId) return;
    const sessions = state.rhythm.sessions;
    const index = sessions.findIndex((existing) => existing.sessionId === session.sessionId);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    state.rhythm.sessions = sessions.slice(-MAX_RHYTHM_SESSIONS);
    save();
  }

  /** ゲームに渡す共有コンテキスト（detailed-design.md §3.1、上記コメントの拡張含む）。 */
  function buildGameCtx() {
    return {
      settings: state.settings,
      audio: ctx.audio,
      announce,
      participantId: state.evaluation.participantId,
      setProgress(text) {
        elements.gameProgress.textContent = text;
      },
      logTrial(session) {
        persistRhythmSession(session);
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

  /**
   * ゲーム側の正常終了（規定試行数の完了等）。リザルトへ遷移する。
   *
   * リズム系ゲームの summary（judge.js の分類を集計した §9.2 の summary
   * サブスキーマ、goHitRate 等を持つ）が渡された場合のみ、操作ログと
   * 読み上げを行う。color-legacy のように finish() を呼ばないゲームは
   * このブロックには来ない。evaluation への失敗系連動（detailed-design.md
   * §9.4）は P3-1（views/evaluation.js）で追加する。
   */
  function finishGame(summary) {
    lastResultSummary = summary || null;
    if (summary && typeof summary.goHitRate === "number") {
      const percent = Math.round(summary.goHitRate * 100);
      logEvent({ type: "game", label: `${activeGameId} 終了 go命中率${percent}%` });
      ctx.audio.speak(`たっせいりつ ${percent}パーセントでした`);
    }
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

      if (lastResultSummary && typeof lastResultSummary.goHitRate === "number") {
        elements.resultStats.innerHTML = renderResultStats(lastResultSummary);
      } else if (lastResultSummary) {
        elements.resultStats.innerHTML = '<p class="panel-note">このあそびには せいせき表示がありません。</p>';
      } else {
        elements.resultStats.innerHTML = '<p class="panel-note">まだ けっかがありません。</p>';
      }
    },
  };
}
