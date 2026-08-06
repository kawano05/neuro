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
// 毎回渡してもらい、ここで sessionId をキーに state.sessions へ
// upsert する（同一セッション内の複数回呼び出しは同じ session オブジェクトを
// 指すため、実質的には「最新状態で置き換える」だけで良い）。この方式なら
// 支援者操作/Esc/visibilitychange による中断（destroy() 経由、finish() を
// 経由しない）でも、直前までの trials が確実に永続化される
// （detailed-design.md §7.3 の aborted:true 確定要件）。
// =====================================================================

import { findGameModule } from "./registry.js";
import { PRIZE_ART } from "./craneArt.js";
import { MAX_SESSIONS } from "../state.js";
import { gameHowTo } from "../content.js";

/** 符号付きms表記（"+62ms" 等）。値が無ければ "--"。 */
function formatSignedMs(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}ms`;
}

/**
 * P4-3（detailed-design.md §8.2）: キャリブレーション結果から候補となる
 * baselineOffsetMs（有効試行 hit の生オフセットの中央値、四捨五入）を取り出す。
 * summary が無い、または medianRawOffsetMs が数値でない（hit が0件）場合は null。
 */
function candidateBaselineMsFromSummary(summary) {
  if (!summary || typeof summary.medianRawOffsetMs !== "number") return null;
  return Math.round(summary.medianRawOffsetMs);
}

/** オフセットの符号を「はやめ/おそめ」に言い換える（detailed-design.md §2.5・§5.2規則4）。 */
function offsetDirectionLabel(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  if (value < 0) return "（はやめに おせたよ）";
  if (value > 0) return "（おそめに おせたよ）";
  return "（ぴったり！）";
}

/** 同期課題のリザルト。 */
function renderSmsResult(summary) {
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

function renderGonogoResult(summary) {
  const goTrials = summary.hits + summary.misses;
  const nogoTrials = summary.commissions + summary.correctRejections;
  const hitRate = goTrials ? Math.round((summary.hits / goTrials) * 100) : 0;
  const commissionRate = nogoTrials
    ? Math.round((summary.commissions / nogoTrials) * 100)
    : 0;
  return `
    <div class="summary-grid">
      <div class="summary-tile"><span class="metric-label">Go せいこう</span><strong>${hitRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">No-Go まちがい</span><strong>${commissionRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">みのがし</span><strong>${summary.misses}</strong></div>
      <div class="summary-tile"><span class="metric-label">よぶんな入力</span><strong>${summary.extras}</strong></div>
    </div>
  `;
}

/**
 * 走査課題のリザルト。
 *
 * 以前は4枠のうち2枠が「へいきん きょり」「ちゅうおう きょり」という同じ量の
 * 統計違いで、しかも単位が％——利用者に読める情報がひとつも無かった。
 * 先頭を「いくつ取れたか」にして、狙いのずれは1枠に絞る。
 * bestStreak は state.js の scan スキーマ外なので、永続化された session を
 * 描くときは出ない（games/crane.js の computeSummary のコメント参照）。
 */
/**
 * 同じ難度で完走した過去セッションのうち、いちばん良かった値を返す。
 *
 * なぜ「前回」ではなく「これまでの最高」か: 前回と比べると、体調で下がった
 * 日に「まえより すくない」と突きつけることになる。訓練の課題でそれをやる
 * 理由がない。最高記録なら常に目標として働き、負の比較が出ない。
 *
 * なぜ条件で絞るか: 支援者が つかめる広さ・アームの速さ・1回のかいすう を
 * 変えられる（settings の craneToleranceR / craneSweepMs / craneTargetTrials）。
 * とくに かいすう は取れる数の上限そのものなので、5回の回と9回の回を並べると
 * 比較にならない。同じ条件の回だけを見る。
 *
 * 中断した回は試行数が足りず不利なので、完走した回だけを対象にする。
 */
export function personalBest(sessions, { gameId, config, pick }) {
  const sameSetup = (sessions || []).filter(
    (session) =>
      session.gameId === gameId &&
      session.finished === true &&
      session.aborted === false &&
      session.config?.toleranceR === config?.toleranceR &&
      session.config?.sweepMs === config?.sweepMs &&
      session.config?.targetTrials === config?.targetTrials
  );
  const values = sameSetup.map(pick).filter((value) => typeof value === "number");
  return values.length ? Math.max(...values) : null;
}

/**
 * 自己最高の行を出すかどうか、出すなら何と出すか。
 *
 * 実際に遊んで分かったこと: 0こしか取れていない段階で「これまでの さいこう
 * 0こ」と出ると、目標にもならず失敗を復唱するだけになる。記録として意味を
 * 持つのは1こ以上からなので、0のときは何も出さない。
 *
 * ただし 0 → 1 は本人にとって最初の成功なので、そこは祝う。
 * 下回った回に「まえより すくない」は出さない（personalBest 参照）。
 *
 * @param {number} grips いま取れた数
 * @param {number|null} best 同条件での過去最高（比較対象が無ければ null）
 * @returns {{text:string, isNew:boolean}|null} null なら何も出さない
 */
export function bestRecordLine(grips, best) {
  if (typeof grips !== "number") return null;
  if (typeof best !== "number") return null;
  if (grips > best && grips > 0) return { text: "じぶんの さいこう記録！", isNew: true };
  if (best > 0) return { text: `これまでの さいこう ${best}こ`, isNew: false };
  return null;
}

/**
 * @param {object} summary  いま終わったセッションの集計
 * @param {object} [context] { best } 同条件での自己最高。無ければ null
 */
function renderScanResult(summary, context = {}) {
  const distance =
    typeof summary.meanDistance === "number" ? summary.meanDistance.toFixed(1) : "--";
  const streakTile =
    typeof summary.bestStreak === "number"
      ? `<div class="summary-tile"><span class="metric-label">れんぞく さいこう</span><strong>${summary.bestStreak}</strong></div>`
      : "";
  // 取れた景品を並べる。数だけより「なにが取れたか」が見えるほうが、
  // もう一度やる理由になる。永続化された session を描くときは collected が
  // 無いので出ない（summary の遊び用フィールドは scan スキーマ外）。
  const prizeRow = Array.isArray(summary.collected) && summary.collected.length
    ? `<div class="summary-prizes" role="img" aria-label="とれた けいひん ${summary.collected.length}こ">${summary.collected
        .map((prize) => `<img src="${PRIZE_ART[prize.asset]}" alt="" />`)
        .join("")}</div>`
    : "";
  // 続ける理由が画面に無かった。1回ぶんの結果しか出ないので、良くなって
  // いるのかどうかが利用者に分からない。同条件の自己最高だけを出す
  // （下がった回に「まえより すくない」とは言わない。personalBest 参照）。
  const record = bestRecordLine(summary.grips, context.best);
  const bestLine = record
    ? `<p class="summary-best${record.isNew ? " is-new" : ""}">${record.text}</p>`
    : "";
  return `
    <div class="summary-grid">
      <div class="summary-tile is-headline">
        <span class="metric-label">とれた</span>
        <strong>${summary.grips}<small>こ</small></strong>
        <p>${summary.trials}かい ちゅう</p>
        ${bestLine}
        ${prizeRow}
      </div>
      <div class="summary-tile"><span class="metric-label">おしかった（すべった）</span><strong>${summary.slips}</strong></div>
      ${streakTile}
      <div class="summary-tile"><span class="metric-label">ねらいの ずれ</span><strong>${distance}%</strong></div>
    </div>
  `;
}

function renderReactionResult(summary) {
  const hitRate = Math.round((summary.hitRate || 0) * 100);
  const commissionRate = Math.round((summary.commissionRate || 0) * 100);
  const meanRt =
    typeof summary.meanRtMs === "number" ? `${Math.round(summary.meanRtMs)}ms` : "--";

  // 釣果（さかなつりの遊びの手応え）。state.js の rt スキーマには無い値なので
  // 永続化された session からは復元されない。ここに来る summary は
  // ctx.finish() でゲームから直接渡されたものなので、その回だけ表示できる
  // （games/fishing.js 冒頭のコメント参照）。
  const catchTiles =
    typeof summary.scoreCm === "number"
      ? `
      <div class="summary-tile is-headline">
        <span class="metric-label">スコア</span>
        <strong>${summary.scoreCm}<small>cm</small></strong>
        <p>${summary.catches ?? 0} ひき / ${summary.totalLengthCm ?? 0}cm ぶん</p>
      </div>
      <div class="summary-tile">
        <span class="metric-label">いちばん おおきい</span>
        <strong>${typeof summary.longestCm === "number" ? `${summary.longestCm}cm` : "--"}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">れんぞく さいこう</span>
        <strong>${summary.bestStreak ?? 0}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">すばやい キャッチ</span>
        <strong>${summary.speedBonuses ?? 0}</strong>
      </div>`
      : "";

  return `
    <div class="summary-grid">
      ${catchTiles}
      <div class="summary-tile"><span class="metric-label">つれた</span><strong>${hitRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">へいきん はんのう</span><strong>${meanRt}</strong></div>
      <div class="summary-tile"><span class="metric-label">フライング</span><strong>${summary.falseStarts}</strong></div>
      <div class="summary-tile"><span class="metric-label">にせアタリで入力</span><strong>${commissionRate}%</strong></div>
    </div>
  `;
}

const resultRenderers = {
  sms: renderSmsResult,
  gonogo: renderGonogoResult,
  scan: renderScanResult,
  rt: renderReactionResult,
};

export function createGameHost(ctx) {
  const { state, elements, scan, announce, save, logEvent } = ctx;

  let activeInstance = null;
  let activeGameId = null;
  let lastResultSummary = null;
  // レディ画面（「やりかた」）を表示中のモジュール。null でなければ、
  // 次のスイッチ入力はゲームへ渡さずセッション開始に使う。
  let pendingModule = null;
  // P4-3: 今回のリザルトで既に候補値を保存したか（同一リザルト画面での
  // 二重保存を防ぎ、保存後は確認文言に切り替える。launch() のたびにリセット）。
  let calibrationOffsetSaved = false;

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
   * 課題横断セッションのスナップショットを state.sessions へ upsert する
   * （sessionId をキーに置き換え。直近 MAX_SESSIONS 件のみ保持、§9.1）。
   */
  function persistSession(session) {
    if (!session || !session.sessionId) return;
    const sessions = state.sessions;
    const index = sessions.findIndex((existing) => existing.sessionId === session.sessionId);
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    state.sessions = sessions.slice(-MAX_SESSIONS);
    save();
  }

  /**
   * いま終わった回を除いた、同条件での自己最高（UFOキャッチャーのみ）。
   *
   * persistSession は末尾へ push するので、いま遊んだ回は該当 gameId の
   * 最後の要素。それを基準の条件（config）として使い、かつ比較対象からは
   * 外す——含めてしまうと、記録を更新した回に「これまでの さいこう」が
   * 今回と同じ値になり、更新したこと自体が見えなくなる。
   */
  function bestBeforeCurrentSession() {
    if (activeGameId !== "crane") return null;
    const craneSessions = (state.sessions || []).filter((session) => session.gameId === "crane");
    const current = craneSessions.at(-1);
    if (!current) return null;
    return personalBest(craneSessions.slice(0, -1), {
      gameId: "crane",
      config: current.config,
      pick: (session) => session.summary?.grips,
    });
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
        persistSession(session);
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

  /**
   * レディ画面（「やりかた」）を描く。
   *
   * 以前はタイルを押した瞬間に mount() が走り、先読みスケジューラが即座に
   * 拍を鳴らしはじめていた。利用者にも支援者にも、その課題で何をするのかを
   * 伝える場所がどこにも無い状態だった（とくに gonogo は、高音は押す・低音は
   * 見送るというルールを知らなければ音だけからは推測できない）。
   *
   * 説明を課題の最中ではなく開始前に置くのは、進行中の視覚が拍のキューとして
   * 働くと聴覚キューに対する入力という測定の前提が崩れるため
   * （basic-design.md §6）。開始前ならまだ計測が始まっていないので、図も
   * 手順も自由に使える。
   */
  function renderReady(module, steps) {
    const items = steps.map((line) => `<li>${line}</li>`).join("");
    const icon = module.iconClass
      ? `<span class="game-ready-icon" aria-hidden="true"><i class="${module.iconClass}"></i></span>`
      : "";
    elements.gameStageContent.classList.add("is-ready");
    elements.gameStageContent.innerHTML = `
      <div class="game-ready">
        ${icon}
        <strong class="game-ready-title">${module.title}</strong>
        <ol class="game-ready-steps">${items}</ol>
        <span class="game-ready-go">がめんの どこでも おすと はじまります</span>
      </div>
    `;

    // #gameStageContent は aria-hidden なので、説明は読み上げ経路で伝える。
    // 画面注視が困難な利用者にも届かせる必要がある（basic-design.md §1.2）。
    const spoken = [module.title, ...steps].join(" ");
    announce(spoken);
    ctx.audio.speak(spoken);
  }

  /** レディ画面のひと押しを受けて、実際にゲームを開始する。 */
  function beginSession() {
    const module = pendingModule;
    pendingModule = null;
    if (!module) return;
    // 案内の読み上げを途中で打ち切る。読み終わるのを待たずに始められる以上、
    // 放っておくと課題の合図音（低音・高音）に人の声が重なる。合図音を
    // 聴き取ることがこの課題そのものなので、確実に黙らせてから始める。
    ctx.audio.stopSpeech();
    elements.gameStageContent.classList.remove("is-ready");
    activeInstance = module.create(buildGameCtx());
    activeInstance.mount(elements.gameStageContent);
  }

  /** ゲームを起動する（detailed-design.md §3.2）。 */
  function launch(gameId) {
    const module = findGameModule(gameId);
    if (!module || module.enabled === false) return;
    destroyActive(); // 多重起動防止（MUST）: 前回 instance の destroy() を必ず呼ぶ
    scan.stop(true);
    activeGameId = gameId;
    lastResultSummary = null;
    pendingModule = null;
    calibrationOffsetSaved = false;
    state.currentView = "game";
    save();
    ctx.renderAll();
    announce(`${module.title}を はじめます`);

    // content.js に「やりかた」を持つ課題は、レディ画面を挟んでから始める。
    // 持たない課題（crane / fishing のように画面を見て操作するもの）は
    // 説明の作り方が別なので、従来どおり即開始する。
    const steps = gameHowTo[gameId];
    if (steps && steps.length) {
      pendingModule = module;
      renderReady(module, steps);
      return;
    }

    activeInstance = module.create(buildGameCtx());
    activeInstance.mount(elements.gameStageContent);
  }

  /**
   * ゲーム側の正常終了（規定試行数の完了等）。リザルトへ遷移する。
   *
   * リズム系ゲームの summary（judge.js の分類を集計した §9.2 の summary
   * サブスキーマ、goHitRate 等を持つ）が渡された場合のみ、evaluation 連動
   * （detailed-design.md §9.4、失敗系のみ）・操作ログ・読み上げを行う。
   * color-legacy のように finish() を呼ばないゲームはこのブロックには来ない。
   */
  function finishGame(summary) {
    lastResultSummary = summary || null;
    const activeModule = activeGameId ? findGameModule(activeGameId) : null;
    const taskType = activeModule?.taskType;
    if (summary && taskType) {
      ctx.views.evaluation.recordSessionOutcome(taskType, summary);
      logEvent({
        type: "game",
        label: `${activeGameId} 終了 taskType=${taskType}`,
      });
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
    // レディ画面から「おわる」/Esc で抜けた場合は instance がまだ無い。
    // 保留を落とし、読み上げも黙らせる（ホームに戻ってから喋り続けない）。
    pendingModule = null;
    ctx.audio.stopSpeech();
    elements.gameStageContent.classList.remove("is-ready");
    destroyActive();
    ctx.views.home?.showLobby();
    state.currentView = "home";
    save();
    ctx.renderAll();
    scan.restartIfNeeded();
  }

  /** シェルが計時した入力を現在のゲームへ渡す（入力ファネル経由。§3.3）。 */
  function dispatchInput(t, source) {
    // レディ画面のひと押しは「説明を読み終えた合図」であって課題の入力では
    // ないので、ゲームへは渡さず、logEvent にも残さない。これを渡すと
    // セッション開始前の入力が1件目の試行として記録されてしまう。
    if (pendingModule) {
      beginSession();
      return;
    }
    if (!activeInstance) return;
    activeInstance.handleInput(t, source);
  }

  /** リザルト画面「もういちど」: 同一ゲームを再起動する。 */
  function retry() {
    if (!activeGameId) return;
    launch(activeGameId);
  }

  /**
   * P4-3（detailed-design.md §8.2 手順4）: キャリブレーションの候補値を
   * settings.baselineOffsetMs へ保存する。支援者のタップ専用ボタンからのみ
   * 呼ばれる（走査対象外・stopPropagation でファネル外、§8.2）。
   * 旧値→新値を logEvent に残す（MUST）。
   */
  function saveCalibrationOffset() {
    if (activeGameId !== "calibration") return;
    const candidate = candidateBaselineMsFromSummary(lastResultSummary);
    if (candidate === null) return;
    const previous = state.settings.baselineOffsetMs;
    state.settings.baselineOffsetMs = candidate;
    calibrationOffsetSaved = true;
    save();
    logEvent({
      type: "measurement",
      label: `キャリブレーション基準オフセットを更新 ${formatSignedMs(previous)} → ${formatSignedMs(candidate)}`,
      skipEvaluation: true,
    });
    announce(`基準オフセットを ${formatSignedMs(candidate)} に保存しました`);
    ctx.renderAll();
  }

  elements.gameExit.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.gameExit.addEventListener("click", (event) => {
    event.stopPropagation(); // ファネルに入れない（detailed-design.md §3.3）
    returnHome();
  });
  elements.resultRetry.addEventListener("click", () => retry());
  elements.resultHome.addEventListener("click", () => returnHome());
  elements.calibrationSaveOffset.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.calibrationSaveOffset.addEventListener("click", (event) => {
    event.stopPropagation(); // ファネルに入れない・走査対象外（detailed-design.md §8.2）
    saveCalibrationOffset();
  });

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

      const resultRenderer = activeModule?.taskType
        ? resultRenderers[activeModule.taskType]
        : null;
      if (lastResultSummary && resultRenderer) {
        elements.resultStats.innerHTML = resultRenderer(lastResultSummary, {
          best: bestBeforeCurrentSession(),
        });
      } else if (lastResultSummary) {
        elements.resultStats.innerHTML = '<p class="panel-note">このあそびには せいせき表示がありません。</p>';
      } else {
        elements.resultStats.innerHTML = '<p class="panel-note">まだ けっかがありません。</p>';
      }

      // P4-3（detailed-design.md §8.2）: キャリブレーションの結果でのみ、
      // 候補値の保存導線を出す（他ゲームでは常に hidden）。
      const candidate =
        activeGameId === "calibration" ? candidateBaselineMsFromSummary(lastResultSummary) : null;
      if (candidate === null) {
        elements.calibrationOffer.hidden = true;
      } else if (calibrationOffsetSaved) {
        elements.calibrationOffer.hidden = false;
        elements.calibrationOfferText.textContent = `基準オフセットを ${formatSignedMs(candidate)} に保存しました`;
        elements.calibrationSaveOffset.hidden = true;
      } else {
        elements.calibrationOffer.hidden = false;
        elements.calibrationOfferText.textContent = `候補値 ${formatSignedMs(candidate)} を設定に保存しますか`;
        elements.calibrationSaveOffset.hidden = false;
      }
    },
  };
}
