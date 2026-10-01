// =====================================================================
// games/gameHost.js — ゲームの起動・入力振り分け・終了処理
//
// 遊びの画面の流れは「段階（phase）」ひとつで持つ。スイッチの押下の意味・走査の
// 範囲・「この遊びの設定」を開けるか・後片付けは、この段階だけを見て決める
// （以前は pendingModule・DOM の有無・タイマーの有無をあちこちで問い合わせていて、
// お祝いの待ちのあいだに設定を開くと、けっかを飛ばしてしまっていた）:
//
//   idle        … 遊びの画面にいない（ホーム・けっか）
//   ready       … 遊ぶ前の説明（games/readyScreen.js）。押下は「声を止める／始める」
//   playing     … 遊んでいる最中。押下は課題の入力。走査しない
//   unavailable … 音が出せず始められない画面（ゲームが ctx.markUnavailable で知らせる）。押下でホームへ
//   finale      … 遊び終えてから、けっかへ移る前のお祝いの待ち。押下は受けない
//   exitChoice  … エンドレスで押さずに待ったときの「もういちど／おわる」。ここだけ走査する
//
// detailed-design.md §3.2 のライフサイクル:
//   launch(id):    scan.stop(true) → currentView="game" → ready（説明のある遊び）か playing
//   finish(summary) (ゲーム側から呼ばれる正常終了): finale（お祝いの待ち。段の表
//                  src/lib/atmosphere.js の finaleWaitMs）→ destroy → currentView="result"
//                  → scan.restartIfNeeded()（お祝いのけっかは resultRevealMs 待ってから）
//   abort()（ホスト側の強制終了。おわる/Esc/visibilitychange）:
//                  destroy → currentView="home" 直帰 → scan.restartIfNeeded()
//
// お祝いはホストの一時的な表示情報で持つ。研究の summary を書き換えず、
// ゲームが終了と判定して保存したあとにだけ、共通舞台のフィナーレを待つ。
//
// destroy() は冪等（二重呼び出し許容）。launch() は「前回 instance の
// destroy() を必ず呼ぶ」（多重起動防止、MUST）。
//
// GameCtx の拡張について: detailed-design.md §3.1 の GameCtx 型は
// { settings, audio, logTrial, announce, finish, abort } を最小契約として
// 定義しているが、既存のログ連動（logEvent が
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
import { presentation } from "../presentation.js";
import { MAX_SESSIONS } from "../state.js";
import { gameHowTo } from "../content.js";
import { entryFor, joinSpeech, resolveTextMode } from "../i18n.js";
import { isMeasurementMode } from "../difficultyMode.js";
import { createReadyScreen } from "./readyScreen.js";

/** けっかの星が飛び込むときの音（1つ目から順に上がる。G5・B5・D6・G6）。 */
const RESULT_STAR_NOTES = [783.99, 987.77, 1174.66, 1567.98];
import { SCENE_ART, artSvg } from "../art/hakkiriArt.js";
// けっかの画面の組み立て（遊びごとの renderer と、一言と星）は results.js。
import {
  candidateBaselineMsFromSummary,
  formatSignedMs,
  personalBest,
  renderPraise, renderPartyResult,
  resultRenderers,
  resultScore,
} from "./results.js";

import { tileThemeFor } from "../homeTheme.js";
import { createGameSettings } from "./gameSettings.js";
import { resolveReadinessState } from "../readinessCheck.js";
import { applyPartyResult, localDayKey } from "../party.js";
import { atmosphereFor } from "../atmosphere.js";
import { createPartyStage, revealPartyResult } from "./partyStage.js";
import { READY_GUARD_MS } from "./readyScreen.js";

/**
 * エンドレスでスイッチを押さずにこれだけ待つと、「もういちど／おわる」を出す（点検 U4）。
 * エンドレスには終わりが無く、遊んでいる最中は走査を止めている（押下は課題の入力）ので、
 * スイッチ1つの人が自分で終われる道がほかに無い。説明の画面でもこの長さを知らせる。
 */
export const EXIT_CHOICE_IDLE_MS = 20_000;

/** 合図が音の課題（taskType）。おおさわぎでも、試行のあいだに節目の音を鳴らさない。 */
const AUDIO_CUE_TASKS = new Set(["rt", "gonogo", "rhythm", "sms"]);

/** 「この遊びの設定」を開いてよい段階（お祝いの待ち・終わりの選択では開かない）。 */
const SETTINGS_PHASES = new Set(["ready", "playing", "unavailable"]);

export function createGameHost(ctx) {
  const { state, elements, scan, announce, save, logEvent } = ctx;
  const feedback = (...args) => presentation.run("voice.feedback", () => ctx.voiceFeedback(...args));

  let activeInstance = null;
  let activeGameId = null;
  let lastResultSummary = null;
  let lastAtmosphereLevel = null;
  let atmosphere = null;
  // 遊びの画面の段階（冒頭の説明）。
  let phase = "idle";
  let finaleTimer = null;
  let resultScanTimer = null;
  // けっかの星を飛び込ませるのは、けっかへ来た最初の1回だけ（描き直しのたびに
  // 最初からやり直さない。docs/overall-design-2026-09-28.md §6.1）。
  let revealPending = false;
  // レディ画面（「やりかた」）を表示中のモジュール。null でなければ、
  // 次のスイッチ入力はゲームへ渡さずセッション開始に使う。
  let pendingModule = null;
  // 直近の launch() で選ばれた遊び方。レディ画面を挟む課題でも、
  // 実際に create() するのは押されたあとなので、ここで持ち越す。
  let requestedEndless = false;
  // P4-3: 今回のリザルトで既に候補値を保存したか（同一リザルト画面での
  // 二重保存を防ぎ、保存後は確認文言に切り替える。launch() のたびにリセット）。
  let calibrationOffsetSaved = false;
  const readyScreen = createReadyScreen(ctx, beginSession);
  /**
   * 「そくてい」の札（上の帯・説明・けっか）を出すか。出すのは、そくていの回（と基準をとる回）の
   * タイミングの遊びだけ。支援者が測る回を ふだんの回と取り違えないため（UD の B3）。
   * れんしゅうの回には出さない（2026-10-01、ユーザーの判断「れんしゅうの回の表記いらない」）。
   * はじめの遊びには そくていの回が無いので出さない（出すと、測っていない遊びを測ったと取り違える）。
   */
  const showsMeasureLabel = (module) =>
    Boolean(module?.taskType) && (activeGameId === "calibration" || isMeasurementMode(state.settings));

  /**
   * 段階を変える（phase を書き換えるのはここだけ）。「この遊びの設定」のボタンを出すかは
   * 段階で決まるので、ここで合わせる（画面の描き直しを待つと、段階が変わったあとも
   * 前の段階の見え方が残った）。
   */
  function setPhase(next) {
    phase = next;
    syncSettingsButton();
  }

  /** 変えられる項目のある遊びで、開いてよい段階のときだけ出す。 */
  function syncSettingsButton() {
    elements.gameSettings.hidden = !(
      state.currentView === "game" &&
      activeGameId &&
      SETTINGS_PHASES.has(phase) &&
      gameSettings.available(activeGameId)
    );
  }

  /**
   * 上の帯の進みぐあい。「そくてい」の札と、のこり・遊びの名前を別の部品にする。狭い画面では
   * 2段に積み、のこりの数を省略記号で切らない（以前は「れんしゅう · の…」になって、のこりが
   * 読めなかった）。
   */
  function renderProgress(text) {
    const body = document.createElement("span");
    body.className = "game-progress-text";
    body.textContent = text;
    const module = activeGameId ? findGameModule(activeGameId) : null;
    if (!showsMeasureLabel(module)) {
      elements.gameProgress.replaceChildren(body);
      return;
    }
    const mode = document.createElement("span");
    mode.className = "game-progress-mode";
    mode.textContent = ctx.t("session.measureShort");
    elements.gameProgress.replaceChildren(mode, body);
  }

  const {
    gameSwitchMenu: switchMenu,
    gameSwitchMenuTitle: switchMenuTitle,
    gameSwitchAgain: switchAgain,
    gameSwitchEnd: switchEnd,
  } = elements;
  let exitChoiceTimer = null;
  let exitChoiceGuardUntil = 0;

  function closeSwitchMenu() {
    window.clearTimeout(exitChoiceTimer);
    exitChoiceTimer = null;
    switchMenu.hidden = true;
    elements.gameStage.hidden = false;
  }

  /**
   * エンドレスで押さずに待ったら「もういちど／おわる」を出す（点検 U4）。押すたびに数え直す。
   * 測定の試行に待ち・長押し・走査を混ぜないので、れんしゅうのエンドレスを自前の走査で
   * 遊んでいるときだけ。いまの回は manual 終了で閉じる（再開は新しい回）。
   */
  function armExitChoice() {
    window.clearTimeout(exitChoiceTimer);
    exitChoiceTimer = null;
    if (
      phase !== "playing" ||
      !requestedEndless ||
      isMeasurementMode(state.settings) ||
      !state.settings.autoScan ||
      state.settings.switchControlMode ||
      !activeInstance
    ) {
      return;
    }
    exitChoiceTimer = window.setTimeout(openExitChoice, EXIT_CHOICE_IDLE_MS);
  }

  function openExitChoice() {
    exitChoiceTimer = null;
    if (phase !== "playing" || gameSettings.isOpen() || !activeInstance) return;
    ctx.audio.stopSpeech();
    // 研究の記録では、支援者の「おわる」と同じ manual 終了になる。区別できるよう、
    // 押さずに待ったことを操作ログに残す（保存の形は変えない）。
    logEvent({
      type: "game",
      label: `${activeGameId} エンドレス 無入力${Math.round(EXIT_CHOICE_IDLE_MS / 1000)}秒で「もういちど／おわる」を出した`,
    });
    destroyActive();
    elements.gameStageContent.innerHTML = "";
    elements.gameStage.hidden = true;
    switchMenuTitle.innerHTML = ctx.tHtml("game.switchMenuTitle");
    switchAgain.innerHTML = ctx.tHtml("result.retry");
    switchEnd.innerHTML = ctx.tHtml("game.exit");
    switchMenu.hidden = false;
    setPhase("exitChoice");
    // 出た瞬間のひと押し（待っていた最中の押下が遅れて届いたもの）で選ばない。
    exitChoiceGuardUntil = performance.now() + READY_GUARD_MS;
    elements.gameSettings.hidden = true;
    feedback(ctx.t("game.switchMenuTitle"));
    scan.restartIfNeeded();
  }
  switchAgain.addEventListener("click", (event) => {
    event.stopPropagation();
    if (performance.now() < exitChoiceGuardUntil) return;
    launch(activeGameId, { endless: true });
  });
  switchEnd.addEventListener("click", (event) => {
    event.stopPropagation();
    if (performance.now() < exitChoiceGuardUntil) return;
    returnHome();
  });

  // この遊びの設定（遊んでいる最中に支援者が変える。games/gameSettings.js）。
  // 関数宣言は巻き上がるので、ここで launch / destroyActive を渡してよい。
  const gameSettings = createGameSettings(ctx, {
    activeGameId: () => activeGameId,
    sessionRunning: () => phase === "playing",
    abortSession: () => destroyActive(),
    relaunch: () => {
      if (activeGameId) launch(activeGameId, { endless: requestedEndless });
    },
    applyLive: () => activeInstance?.applySettings?.(),
    canOpen: () => SETTINGS_PHASES.has(phase),
  });

  /**
   * いまの遊びを片づける（例外を握りつぶし、activeInstance を必ずクリアする）。
   * keepCelebration … けっかへ進むとき。おおさわぎの音楽と、けっかへ持ち越す声・演出を残す。
   */
  function destroyActive({ keepCelebration = false } = {}) {
    closeSwitchMenu();
    window.clearTimeout(finaleTimer);
    window.clearTimeout(resultScanTimer);
    finaleTimer = resultScanTimer = null;
    atmosphere?.destroy({ keepMusic: keepCelebration });
    if (!keepCelebration) ctx.audio.music?.stop(0.4);
    atmosphere = null;
    delete elements.gameStageContent.dataset.atmosphere;
    elements.gameStageContent.classList.remove("is-party");
    if (activeInstance) {
      try {
        activeInstance.destroy();
      } catch (error) {
        console.error("[neuro] ゲームの後片付けに失敗しました", error);
      }
    }
    activeInstance = null;
    if (!keepCelebration) stopPresentation();
  }

  /** 中断・画面離脱の共通入口。正常終了の声は結果へ持ち越せる。 */
  function stopPresentation() {
    window.clearTimeout(resultScanTimer);
    resultScanTimer = null;
    presentation.cancelTimers();
    ctx.audio.stopAll();
    ctx.fx.clear();
    for (const root of [elements.gameStageContent, elements.resultStats]) {
      root.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel());
    }
  }

  /**
   * 課題横断セッションのスナップショットを state.sessions へ upsert する
   * （sessionId をキーに置き換え。直近 MAX_SESSIONS 件のみ保持、§9.1）。
   */
  function persistSession(session) {
    if (!session || !session.sessionId) return;
    // その回が終わった時刻。slot だけが自前で持っていたので、全課題へ広げる
    // （2026-08-28）。開始時刻しか無いと、1回にどれだけ掛かったか、途中で
    // 止まったのがいつかを、あとから言えない。
    //
    // ここで押すのは、finished / aborted を立てるのが各ゲーム、保存を通すのが
    // この1か所だから。ゲームごとに押すと押し忘れが起きる（slot 以外の3本が
    // 実際そうなっていた）。
    //
    // 既に値があれば上書きしない（slot が finalize で押した時刻を、あとの
    // 保存で塗り替えない）。終端を立てないまま消えた回は空欄のまま——
    // 「終わらなかった回」を、終わった回のように見せない。
    if (!session.endedAtIso && (session.finished === true || session.aborted === true)) {
      session.endedAtIso = new Date().toISOString();
    }
    // その回の入力経路。endedAtIso と同じ理由でここ1か所に置く
    // （device を作るのは各ゲーム、保存を通すのはここだけ）。
    // 途中で切り替わることは想定しないが、切り替わったら最後の値が残る
    // ——回の途中で経路が変わった回は、そもそも測定として使えない。
    if (session.device && typeof session.device === "object") {
      session.device.inputMethod = state.settings.switchControlMode
        ? "ios-switch-control"
        : "direct";
    }
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
  /**
   * いま終わった回そのもの（リザルトで trials を読むため）。
   *
   * ctx.finish(summary) には summary しか渡らない（GameCtx の契約、§3.1）。
   * ずれの帯を描くには1試行ずつの値が要るので、persistSession が末尾へ
   * push した「その gameId の最後の回」を引き当てる。crane の自己最高で
   * 使っている bestBeforeCurrentSession と同じ引き当てかた。
   */
  function currentSession() {
    if (!activeGameId) return null;
    const sameGame = (state.sessions || []).filter(
      (session) => session.gameId === activeGameId
    );
    return sameGame.at(-1) || null;
  }

  function bestBeforeCurrentSession() {
    if (activeGameId !== "crane") return null;
    const craneSessions = (state.sessions || []).filter((session) => session.gameId === "crane");
    const current = craneSessions.at(-1);
    if (!current) return null;
    return personalBest(craneSessions.slice(0, -1), {
      gameId: "crane",
      config: current.config,
      participantId: current.participantId || "",
      pick: (session) => session.summary?.grips,
    });
  }

  /** ゲームに渡す共有コンテキスト（detailed-design.md §3.1、上記コメントの拡張含む）。 */
  function buildGameCtx() {
    return {
      settings: state.settings,
      // あそびの入口が選んだ遊び方（ホームのコーナー）。ゲーム側は
      // resolveEndlessMode(settings, ctx.endless) で最終判断する
      // ——そくてい中は設定側が必ず打ち消す。
      endless: requestedEndless,
      audio: ctx.audio,
      // 演出（src/lib/fx/）。遊びは「何が起きたか」を名前で呼ぶだけ。
      fx: ctx.fx,
      announce,
      voiceFeedback: feedback,
      // 利用者向け文言の表記解決（src/lib/i18n.js）。ゲームは自前で文言を
      // 持たず、必ずここを通す——表記は設定で変わるので定数にできない。
      //
      // 2つとも渡す。t はプレーン文（読み上げ・aria）、tHtml はルビを
      // 展開した HTML（画面）。ここで tHtml を渡し忘れると、ゲーム側の
      // tHtml(...) が未定義の呼び出しになって mount() ごと落ちる——
      // 画面はレディ表示のまま固まり、押しても始まらない。
      t: ctx.t,
      tHtml: ctx.tHtml,
      participantId: state.evaluation.participantId,
      // その回、成立確認（src/lib/readinessCheck.js）がどうなっていた状態で
      // 測ったか。"met" / "overridden" / "n/a"。
      //
      // ここで解決するのは、判定に state.sessions（全課題ぶんの記録）が要る
      // ため。ゲーム本体には settings しか渡らない契約なので、participantId と
      // 同じパススルーにする。セッション開始時に1回だけ確定させ、config へ
      // 残す——あとから「確認できている状態で測ったのか」を言えるように。
      readiness: resolveReadinessState(
        state.settings,
        state.sessions || [],
        state.evaluation.participantId
      ),
      // 遊びの雰囲気「おおさわぎ」の、もらったラッコの服と、その日にいっぱいにしたびんの数
      // （src/lib/party.js）。遊び終えたとき（5回目）に claim して保存する。研究の記録には入れない。
      party: {
        outfits: () => [...(state.party?.outfits || [])],
        claim(jars = 1) {
          const outcome = applyPartyResult(state.party, localDayKey(), jars);
          state.party = outcome.party;
          save();
          return outcome;
        },
        react: (event) => atmosphere?.react(event),
        isBig: () => atmosphere?.profile.liveCompanions || false,
        pressSpeech: (index, name) => atmosphere?.pressSpeech(index, name),
        rewardSpeech: () => atmosphere?.rewardSpeech(),
        finale: () => atmosphere?.finale(),
      },
      setProgress(text) {
        renderProgress(text);
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
      /** 音が出せず、この回を始められない画面を出した（次のひと押しでホームへ）。 */
      markUnavailable() {
        if (phase !== "playing") return;
        setPhase("unavailable");
        armExitChoice();
      },
    };
  }

  /** mountで主役を置いたあとに舞台を添える。測定では属性もDOMも音も足さない。 */
  function mountAtmosphere(module) {
    if (module.id === "calibration" || (module.taskType && isMeasurementMode(state.settings))) return;
    const gameCtx = buildGameCtx();
    atmosphere = presentation.run(
      "party.mount",
      () =>
        presentation.protect(
          createPartyStage({
            host: elements.gameStageContent,
            t: ctx.t,
            tHtml: ctx.tHtml,
            fx: ctx.fx,
            audio: ctx.audio,
            voiceFeedback: feedback,
            outfits: gameCtx.party.outfits(),
            claim: gameCtx.party.claim,
            kind: module.taskType ? "timing" : "beginner",
            // 遊びごとのお祝いの型（src/lib/partyThemes.js）。
            theme: module.id,
            audioCue: AUDIO_CUE_TASKS.has(module.taskType),
          }),
          "party"
        ),
      null
    );
    if (!atmosphere) return;
    elements.gameStageContent.dataset.atmosphere = atmosphere.profile.level;
    elements.gameStageContent.classList.toggle("is-party", atmosphere.profile.liveCompanions);
  }

  /** 課題を始める（説明の画面のあと・説明の無い遊びは開いてすぐ）。 */
  function startPlaying(module) {
    setPhase("playing");
    activeInstance = module.create(buildGameCtx());
    activeInstance.mount(elements.gameStageContent);
    mountAtmosphere(module);
    armExitChoice();
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
  /**
   * あそびの名前。
   *
   * registry.js の title は日本語のまま（content.js の gameTiles 由来）なので、
   * そこを直に出すと英語表記でもレディ画面と読み上げだけ日本語になる。
   * タイルと同じ辞書（tile.<id>.title）から引く——ロビーとレディ画面で
   * 名前が食い違わないという利点もある。
   *
   * @param {object} module registry のゲーム定義
   * @param {boolean} html 画面へ出すならルビ付き、読み上げならプレーン
   */
  function moduleTitle(module, html = false) {
    const key = `tile.${module.id}.title`;
    const value = html ? ctx.tHtml(key) : ctx.t(key);
    return value === key ? module.title : value;
  }

  /**
   * エンドレスのときに差し替える「やりかた」の最後の行。
   * gameId ごとに難しくなる中身が違うので、ゲーム別に持つ。
   */
  const ENDLESS_HOWTO_KEYS = {
    fishing: "howto.endless.fishing",
    "fishing-gonogo": "howto.endless.fishing",
    crane: "howto.endless.crane",
  };

  function renderReady(module, stepKeys) {
    // content.js の gameHowTo が持つのは並びだけで、中身は i18n のキー。
    // 表記（漢字／ひらがな／英語）は設定で変わるので、ここで引く。
    // 画面にはルビ付き、読み上げにはプレーン文を渡す。同じキーから両方を
    // 作るので、片方だけ直して食い違うことがない。
    // エンドレスは終わり方の約束が違う（「1分間」「5回」ではなく、やめるまで
    // 続く／続けるほど難しくなる）。押し方の説明は同じなので、最後の1行だけを
    // 差し替える。ここを直さないと、画面は「1分間」と言っているのに終わらない
    // ——説明と挙動が食い違ったまま遊ばせることになる。
    const endlessKey = requestedEndless ? ENDLESS_HOWTO_KEYS[activeGameId] : null;
    // れんしゅうの回だけの見え方（さかなつりの大きな「！」など）がある行は、
    // れんしゅうでは説明もそれに合わせる（キー + ".practice"）。そくていは元の行。
    const practice = !isMeasurementMode(state.settings);
    const resolvedKeys = (endlessKey ? [...stepKeys.slice(0, -1), endlessKey] : stepKeys).map((key) =>
      practice && entryFor(`${key}.practice`) ? `${key}.practice` : key
    );
    const steps = resolvedKeys.map((key) => ctx.tHtml(key));
    const spokenSteps = resolvedKeys.map((key) => ctx.t(key));
    // 行は「番号の丸（::before）＋文」を flex で並べる。文を1つの箱にまとめないと、
    // ふりがなと字が1つずつ別の箱になり「上 の 目標 の 絵 を 見 ます」と
    // 字のあいだが空き、行の途中でも折り返していた。
    const items = steps.map((line) => `<li><span class="game-ready-step">${line}</span></li>`).join("");
    // ホームで押したタイルと同じ絵を出す（docs/design-renewal-2026-09-25.md）。
    // 絵の無い遊びは、これまでどおりアイコン。
    const theme = tileThemeFor(module.id);
    const icon = theme
      ? `<span class="game-ready-art" aria-hidden="true" style="--tile-thumb:${theme.colors.thumb}">${artSvg(SCENE_ART[theme.art], { slice: true })}</span>`
      : module.iconClass
        ? `<span class="game-ready-icon" aria-hidden="true"><i class="${module.iconClass}"></i></span>`
        : "";
    elements.gameStageContent.classList.add("is-ready");
    elements.gameStageContent.dataset.readyWorld = theme?.palette || "high";
    elements.gameStageContent.innerHTML = `
      <div class="game-ready">
        <div class="game-ready-info">
        ${showsMeasureLabel(module) ? `<span class="session-mode">${ctx.tHtml("session.measure")}</span>` : ""}
        ${icon}
        <strong class="game-ready-title">${moduleTitle(module, true)}</strong>
        </div>
        <ol class="game-ready-steps">${items}</ol>
        <span class="game-ready-go"><span class="game-ready-instruction">${ctx.tHtml("ready.go")}</span></span>
      </div>
    `;

    // #gameStageContent は aria-hidden なので、説明は読み上げ経路で伝える。
    // 画面注視が困難な利用者にも届かせる必要がある（basic-design.md §1.2）。
    // 題名と手順は文として区切って読む（句点が無いと、分かち書きを外したときに
    // 題名と1行目が1語のようにつながる。i18n.js の joinSpeech）。
    const spoken = joinSpeech([moduleTitle(module), ...spokenSteps], resolveTextMode(state.settings));
    // エンドレスは終わりが無い。スイッチだけで終わる道（しばらく押さずに待つと
    // 「もういちど／おわる」が出る）を、始める前に知らせておく。
    if (requestedEndless && !isMeasurementMode(state.settings) && state.settings.autoScan && !state.settings.switchControlMode) {
      const hint = document.createElement("span");
      hint.className = "game-ready-endless";
      hint.innerHTML = ctx.tHtml("ready.endlessExit", { n: Math.round(EXIT_CHOICE_IDLE_MS / 1000) });
      elements.gameStageContent.querySelector(".game-ready-go").append(hint);
    }
    setPhase("ready");
    ctx.voiceFeedback(spoken);
    readyScreen.open();
  }

  /** レディ画面のひと押しを受けて、実際にゲームを開始する。 */
  function beginSession() {
    const module = pendingModule;
    pendingModule = null;
    if (!module || phase !== "ready") return;
    readyScreen.close();
    // 案内の読み上げを途中で打ち切る。読み終わるのを待たずに始められる以上、
    // 放っておくと課題の合図音（低音・高音）に人の声が重なる。合図音を
    // 聴き取ることがこの課題そのものなので、確実に黙らせてから始める。
    ctx.audio.stopSpeech();
    elements.gameStageContent.classList.remove("is-ready");
    delete elements.gameStageContent.dataset.readyWorld;
    scan.stop(true);
    startPlaying(module);
    ctx.renderAll();
  }

  /** ゲームを起動する（detailed-design.md §3.2）。 */
  /**
   * @param {string} gameId
   * @param {{endless?: boolean}} [options] あそびの入口が決める遊び方。
   *   エンドレスは支援者の設定ではなくホームのコーナーから選ぶので、
   *   ここを通してゲームへ渡す（src/lib/difficultyMode.js）。
   */
  function launch(gameId, options = {}) {
    const module = findGameModule(gameId);
    if (!module || module.enabled === false) return;
    ctx.audio.music?.stop(0.3);
    // 効果音の場面（src/lib/audio.js の effectOutputGain）。合図のある遊び
    // （taskType あり）は今までどおりの大きさ、測定の課題でない遊びは持ち上げる。
    ctx.audio.setProfile?.(module.taskType ? "task" : "play");
    // そくていの回の遊びでは、演出を何も足さない（docs/overall-design §5）。
    // キャリブレーション（支援者と使う基準の測定）は、モードによらず測定の扱い。
    ctx.fx?.setMeasurement(
      Boolean(module.taskType) && (isMeasurementMode(state.settings) || module.id === "calibration")
    );
    requestedEndless = options.endless === true;
    readyScreen.close();
    destroyActive(); // 多重起動防止（MUST）: 前回 instance の destroy() を必ず呼ぶ
    ctx.fx?.clear(); // 前の画面の粒を、次の合図より前へ持ち越さない。
    scan.stop(true);
    setPhase("idle");
    activeGameId = gameId;
    lastResultSummary = null;
    lastAtmosphereLevel = null;
    pendingModule = null;
    calibrationOffsetSaved = false;
    state.currentView = "game";
    save();
    ctx.renderAll();

    // content.js に「やりかた」を持つ課題は、レディ画面を挟んでから始める。
    // renderReady() がゲーム名と説明を1つの所有者から通知するので、ここで
    // 別の「ゲームを始めます」を重ねない。
    // 持たない課題（crane / fishing のように画面を見て操作するもの）は
    // 説明の作り方が別なので、従来どおり即開始する。
    const steps = gameHowTo[gameId];
    if (steps && steps.length) {
      pendingModule = module;
      renderReady(module, steps);
      return;
    }

    announce(ctx.t("voice.gameStart", { name: moduleTitle(module) }));
    startPlaying(module);
  }

  /**
   * ゲーム側の正常終了（規定試行数の完了等）。リザルトへ遷移する。
   *
   * リズム系ゲームの summary（judge.js の分類を集計した §9.2 の summary
   * サブスキーマ、goHitRate 等を持つ）が渡された場合のみ、evaluation 連動
   * （detailed-design.md §9.4、失敗系のみ）・操作ログ・読み上げを行う。
   */
  function finishGame(summary) {
    if (phase === "finale" || phase === "idle") return;
    const profile = atmosphere?.profile ?? null;
    // タイミングの遊びは、ゲームが終わりの声（「できた！ 3こ…」）を言ってから finish を
    // 呼ぶ。ここで「やったー」を重ねると、その声が消えて何回できたかが届かない。
    // 静かな段（なし・すっきり）の音は、ここで鳴らす（段の表の finishCue）。
    if (profile?.kind === "timing" && profile.quietFinish) {
      ctx.audio.playChime(784, { durationS: 0.24 });
      if (profile.finishCue === "chimeApplause") ctx.audio.playApplause({ durationS: 0.35 });
    }
    // お祝いの待ち（段の表の finaleWaitMs）。はじめの遊びは自分の流れで待つので、
    // ホストが待つのは、タイミングの遊びと、まだフィナーレを始めていないおおさわぎだけ。
    const hostFinale =
      profile && !atmosphere.finishing() && (profile.reward || (profile.kind === "timing" && profile.finaleWaitMs > 0));
    if (hostFinale) {
      setPhase("finale");
      armExitChoice();
      atmosphere.finale();
      // 粒の形と色は、その遊びのもの（リールは星と紙吹雪、高い音だけは音符…）。
      if (!profile.reward) ctx.fx?.finale(elements.gameStageContent, { theme: activeGameId });
      finaleTimer = window.setTimeout(() => {
        finaleTimer = null;
        showResult(summary);
      }, profile.finaleWaitMs);
      return;
    }
    showResult(summary);
  }

  /** お祝いの待ちのあと（または待たずに）、けっかの画面へ移る。 */
  function showResult(summary) {
    const profile = atmosphere?.profile ?? null;
    const party = profile?.resultCompanions ? atmosphere.summary() : null;
    lastAtmosphereLevel = profile?.level ?? null;
    if (profile?.kind === "timing" && profile.reward) feedback(atmosphere.rewardSpeech());
    lastResultSummary = party ? { ...summary, party } : summary || null;
    const activeModule = activeGameId ? findGameModule(activeGameId) : null;
    const taskType = activeModule?.taskType;
    if (summary && taskType) {
      // 効果測定セッション（手動カウンタ・評定・観察メモ）は別紙の手順書へ
      // 置き換えて削除した（2026-08-29）。研究データ本体は state.sessions に
      // 集約されているので、ここでの連動は要らない。
      logEvent({
        type: "game",
        label: `${activeGameId} 終了 taskType=${taskType}`,
      });
    }
    destroyActive({ keepCelebration: true });
    setPhase("idle");
    ctx.audio.setProfile?.("play");
    ctx.fx?.setMeasurement(false);
    revealPending = true;
    state.currentView = "result";
    save();
    ctx.renderAll();
    // お祝いのけっか（ラッコ・びん）は、見せ終わってから枠を動かす（紙吹雪の下で枠を
    // 進めない。docs/party-mode-2026-09-29.md）。長さは段の表の resultRevealMs、
    // 動きを止めているときは待たない。
    const revealMs = party && ctx.fx?.policy?.().motion ? atmosphereFor(party.level).resultRevealMs : 0;
    if (revealMs > 0) {
      resultScanTimer = window.setTimeout(() => {
        resultScanTimer = null;
        if (state.currentView === "result") scan.restartIfNeeded();
      }, revealMs);
    } else {
      scan.restartIfNeeded();
    }
  }

  /**
   * ホスト側の強制終了・支援者操作による終了（おわる／Esc／
   * visibilitychange／「メニューへ」）。リザルトを経由せず home へ直帰する
   * （detailed-design.md §2.4「aborted の場合は home へ直帰」）。
   */
  function returnHome() {
    // 設定を開いたまま抜けた（おわる・画面が隠れた）ときは、変更を捨てて閉じる。
    gameSettings.dismiss();
    // レディ画面から「おわる」/Esc で抜けた場合は instance がまだ無い。
    // 保留を落とし、読み上げも黙らせる（ホームに戻ってから喋り続けない）。
    pendingModule = null;
    readyScreen.close();
    ctx.audio.stopSpeech();
    ctx.audio.music?.stop(0.3);
    elements.gameStageContent.classList.remove("is-ready");
    delete elements.gameStageContent.dataset.readyWorld;
    destroyActive();
    setPhase("idle");
    ctx.audio.setProfile?.("play");
    ctx.fx?.setMeasurement(false);
    ctx.fx?.clear();
    revealPending = false;
    ctx.views.home?.showLobby();
    state.currentView = "home";
    save();
    ctx.renderAll();
    scan.restartIfNeeded();
  }

  /** シェルが計時した入力を現在のゲームへ渡す（入力ファネル経由。§3.3）。 */
  function dispatchInput(t, source) {
    // 支援者が設定を開いているあいだは、スイッチを押しても遊びは進まない
    // （時間で進む遊びは、開いた時点でその回を止めてある。gameSettings.js）。
    if (gameSettings.isOpen()) return;
    switch (phase) {
      case "ready":
        // 説明の画面のひと押しは「声を止める／始める」。課題の入力ではないので、
        // ゲームへは渡さず、logEvent にも残さない（渡すと、始まる前の押下が
        // 1件目の試行として記録されてしまう）。
        readyScreen.press();
        return;
      case "playing":
        activeInstance?.handleInput(t, source);
        armExitChoice();
        return;
      case "unavailable":
        // 音が出ず課題が始まらない画面には試行がない。次のひと押しで戻れる。
        returnHome();
        return;
      case "exitChoice":
        scan.activate();
        return;
      default:
        // finale（お祝いの待ち）・idle では受けない。
        return;
    }
  }

  /** リザルト画面「もういちど」: 同一ゲームを、同じ遊び方（エンドレスかどうか）で再起動する。 */
  function retry() {
    if (!activeGameId) return;
    launch(activeGameId, { endless: requestedEndless });
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

  // 「おわる」は #gameStage の兄弟なので、いまはバブリングでファネルへ
  // 入ることはない（App.svelte のコメント参照）。それでも止めておくのは、
  // 入れ子へ戻したときに黙って1入力が混ざるのを防ぐため——混ざっても
  // 画面には何も出ず、記録の中でしか気づけない（detailed-design.md §3.3）。
  elements.gameExit.addEventListener("pointerdown", (event) => event.stopPropagation());
  elements.gameExit.addEventListener("click", (event) => {
    event.stopPropagation();
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
    /** 遊びの画面で走査してよい範囲（セレクタ）。null なら走査しない（scan.js）。 */
    scanScope: () => (phase === "exitChoice" ? "#gameSwitchMenu" : null),
    /** いまの段階（テスト・診断用）。 */
    phase: () => phase,
    dispatchInput,
    retry,
    abort: returnHome,
    stopPresentation,
    /** 設定が開いていれば閉じる（変更は捨てる）。閉じたら true（Esc 用）。 */
    closeSettings: () => gameSettings.close({ apply: false }),
    getActiveGameId: () => activeGameId,
    getLastSummary: () => lastResultSummary,
    /** gameProgress / resultStats の表示更新（ctx.renderAll() から呼ばれる）。 */
    render() {
      const activeModule = activeGameId ? findGameModule(activeGameId) : null;
      // レディ画面のあいだは、進捗の枠にあそびの名前を出す（まだ試行が
      // 始まっていないので「のこり」は書けない）。名前は辞書から引く
      // ——registry の title は日本語のままなので、直に出すと英語表記でも
      // ここだけ日本語になる。
      if (activeModule) renderProgress(moduleTitle(activeModule));
      else elements.gameProgress.replaceChildren();
      elements.resultMode.innerHTML = showsMeasureLabel(activeModule) ? ctx.tHtml("session.measure") : "";
      elements.resultMode.hidden = !showsMeasureLabel(activeModule);
      elements.resultView.dataset.world = tileThemeFor(activeGameId)?.palette || "pop";
      // 変えられる項目のある遊びでだけ出す（そくていの回で速さしか無い遊びは出さない）。
      // お祝いの待ち・終わりの選択では出さない（開くと、けっかを飛ばしてしまう）。
      syncSettingsButton();

      // 正常終了の要約をアプリTTSが所有する場合、同じ遷移で結果DOMまで
      // VoiceOverへ読ませない。TTSがOFFなら従来どおりpolite live regionが所有する。
      elements.resultStats.setAttribute(
        "aria-live",
        state.settings.speechEnabled ? "off" : "polite"
      );
      const rendererType = activeModule?.resultType || activeModule?.taskType;
      elements.resultStats.classList.toggle(
        "is-completion-result",
        rendererType === "completion"
      );
      elements.resultStats.classList.toggle("has-party-result", Boolean(lastResultSummary?.party));
      if (lastAtmosphereLevel) elements.resultStats.dataset.atmosphere = lastAtmosphereLevel;
      else delete elements.resultStats.dataset.atmosphere;
      const resultRenderer = rendererType
        ? resultRenderers[rendererType]
        : null;
      if (lastResultSummary && resultRenderer) {
        const session = currentSession();
        const context = {
          gameId: activeGameId,
          best: bestBeforeCurrentSession(),
          trials: session?.trials,
          config: session?.config,
          // 表記モードは設定で変わるので、描画のたびに引き直す（i18n.js）。
          //
          // リザルトの描画結果は innerHTML に入るので、ルビを展開する側
          // （tHtml）を渡す。この renderer 群が引く文言はすべて画面へ出す
          // ものだけで、読み上げ・aria へ渡るものは1つもない。
          t: ctx.tHtml,
          // aria-label と、textContent へ入る文字（自己最高の行）は
          // プレーン文でなければならない。同じ context に両方を入れておく。
          tPlain: ctx.t,
        };
        const detailed = resultRenderer(lastResultSummary, context);
        const score = resultScore(rendererType, lastResultSummary);
        if (score && score.total > 0) {
          // 利用者に見せるのは一言と「何回のうち何回」だけ。数値の表は
          // 支援者のもので、畳んでおく（docs/design-renewal-2026-09-25.md §1.6）。
          // 走査の輪には入れない（summary に data-scan を付けない）。
          // キャリブレーションは支援者と一緒に使う測定なので、開いたまま出す。
          const open = activeGameId === "calibration" ? " open" : "";
          elements.resultStats.innerHTML = `
            ${renderPartyResult(lastResultSummary.party, renderPraise(score, context), context)}
            <details class="result-details"${open}>
              <summary>${ctx.tHtml("result.details")}</summary>
              ${detailed}
            </details>
          `;
        } else {
          elements.resultStats.innerHTML = detailed;
        }
        if (revealPending && state.currentView === "result") {
          revealPending = false;
          const shownSummary = lastResultSummary;
          // 描いた次のコマで、星を飛び込ませる（位置が決まってから）。
          presentation.frame(() => {
            if (document.hidden || state.currentView !== "result" || lastResultSummary !== shownSummary) return;
            if (elements.resultStats.querySelector(".party-result")) {
              presentation.run("party.result", () => revealPartyResult(elements.resultStats, { fx: ctx.fx, audio: ctx.audio,
                isCurrent: () => state.currentView === "result" && lastResultSummary === shownSummary,
              }));
              if (!elements.resultStats.querySelector(".party-result.is-added")) return;
            }
            ctx.fx?.revealResult(elements.resultStats, {
              playStar: (index, delayS) =>
                ctx.audio.playChime(RESULT_STAR_NOTES[index] ?? RESULT_STAR_NOTES.at(-1), { delayS, durationS: 0.9 }),
            });
          });
        }
      } else if (lastResultSummary) {
        elements.resultStats.innerHTML = `<p class="panel-note">${ctx.tHtml("result.none")}</p>`;
      } else {
        elements.resultStats.innerHTML = `<p class="panel-note">${ctx.tHtml("result.empty")}</p>`;
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
