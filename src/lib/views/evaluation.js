// =====================================================================
// views/evaluation.js — 効果測定セッション画面
//
// 研究計画（docs/research-summary.md）の評価項目を記録し、27列のCSVに
// 書き出す。logEvent から countEntry() が呼ばれ、教材操作が自動集計される。
//
// 注意: この画面はマークアップ上は存在するが、現状タブからは到達できない
// （content.js の visibleViews 参照、既知の制約）。
//
// P3-1（detailed-design.md §9.3・§9.4）: リズム計測CSV（state.sessions
// の trials を1試行1行に平坦化した18列）と、リズムセッション終了時の
// evaluation 連動（失敗系のみ。taskTimingMissed += misses、
// taskMistakes += commissions + extras。早め/遅めの hit は失敗ではないため
// taskTimingEarly/Late へは連動しない、MUST）を追加する。
// recordSessionOutcome() は games/gameHost.js の finishGame() から、
// 効果測定タスクが実行中のときだけ加算する（既存の countEntry() と同じ
// gating。研究計画セッション外の日常プレイまで taskMistakes に混ぜない）。
// =====================================================================

import { evaluationTasks, researchConditionProfiles, storageKey } from "../content.js";
import { cloneDefaultState, MAX_EVALUATION_SESSIONS, MAX_SESSIONS } from "../state.js";
import { escapeHtml, escapeCsv, formatDuration, toJstIso } from "../utils.js";
import { buildSlotCsvRows } from "../slotCsv.js";
export { buildSlotCsvRows };

function evaluationResultKey(result) {
  return JSON.stringify([
    result?.taskId ?? "",
    result?.startedAt ?? "",
    result?.endedAt ?? "",
    result?.participantId ?? "",
    result?.condition ?? "",
  ]);
}

/**
 * 進行中の結果と保存済みセッションをCSV用に平坦化する。
 *
 * 旧版はfinishSession後もevaluation.resultsを残していたため、同じ結果が
 * completedSessionsとの両方に存在し得る。タスクIDと計測時刻等が一致する行を
 * 1行に畳み、保存済み側のセッション情報を優先する。
 */
export function flattenEvaluationResults(evaluation) {
  const completed = [];
  const completedKeys = new Set();
  const sessions = Array.isArray(evaluation?.completedSessions)
    ? evaluation.completedSessions
    : [];

  sessions.forEach((session) => {
    const taskResults = Array.isArray(session?.taskResults) ? session.taskResults : [];
    taskResults.forEach((result) => {
      if (!result || typeof result !== "object" || Array.isArray(result)) return;
      const key = evaluationResultKey(result);
      if (completedKeys.has(key)) return;
      completedKeys.add(key);
      completed.push({
        ...result,
        sessionStartedAt: session.startedAt,
        sessionEndedAt: session.endedAt,
        effortRating: session.effortRating,
        easeRating: session.easeRating,
        engagementRating: session.engagementRating,
        observerNotes: session.observerNotes,
      });
    });
  });

  const active = [];
  const activeKeys = new Set();
  const results = Array.isArray(evaluation?.results) ? evaluation.results : [];
  results.forEach((result) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) return;
    const key = evaluationResultKey(result);
    if (completedKeys.has(key) || activeKeys.has(key)) return;
    activeKeys.add(key);
    active.push(result);
  });

  // 現在のセッションを先頭に出す既存の並び順は維持する。
  return [...active, ...completed];
}

const COMMON_TASK_HEADERS = [
  "sessionId",
  "taskType",
  "participantId",
  "gameId",
  // 日本時間（+09:00付き）。名前も Jst にして、UTCだった頃の書き出しと
  // 取り違えられないようにする。
  "startedAtJst",
  "aborted",
  "trialIndex",
];

/**
 * どの端末で測ったか（session.device / audio.js の getDeviceInfo）。
 *
 * 記録はしていたのに、どのCSVにも出していなかった。保存されているだけの値は
 * 解析に使えないので、実質「記録していない」のと同じ——visualGuidance を
 * sanitize から落としていたときと同じ型の穴。
 *
 * iPad とスマホの両方で動くようにした以上、端末は測定条件のひとつになる
 * （画面の大きさ・視距離・刺激の実寸・スピーカー特性・音の出力遅延が
 * まとめて変わる）。混ぜて集計してよいかを決めるのは解析側なので、
 * アプリは材料を曇りなく出すところまでを担う。
 *
 * 列は必ず**末尾**に足す（detailed-design.md §9.3 の既存列互換）。
 */
const DEVICE_HEADERS = [
  "deviceViewportWidth",
  "deviceViewportHeight",
  "devicePixelRatio",
  "deviceOutputLatencyS",
  "deviceBaseLatencyS",
  "deviceUserAgent",
];

function deviceColumns(session) {
  const device = session?.device || {};
  return [
    device.viewportWidth ?? "",
    device.viewportHeight ?? "",
    device.devicePixelRatio ?? "",
    device.outputLatencyS ?? "",
    device.baseLatencyS ?? "",
    device.userAgent ?? "",
  ];
}

/** scan / rt の課題別CSV行を作る。列意味が異なるため単一表には統合しない。 */
/**
 * リズム計測結果のCSV行（19列、ロング形式。detailed-design.md §9.3）。
 * 1試行1行。summary は含めない（解析側で再計算できるので二重管理を避ける）。
 * correctRejection / miss の行は inputMs / rawOffsetMs が空欄になる
 * （trials 側で null にしてあるため、そのまま escapeCsv に渡せば空欄になる）。
 *
 * 純粋関数として切り出してあるのは、これが研究の主要な出力だから。列の順序と
 * 内容をテストで固定できないと、解析側と静かに食い違ったまま卒論のデータが
 * 出る（tests/data-integrity.test.mjs）。
 */
export function buildRhythmCsvRows(sessions) {
  const rows = [
    [
      "sessionId",
      "participantId",
      "gameId",
      // 日本時間（+09:00付き）。列名も Iso から Jst へ変える——中身の意味を
      // 変えるのに名前を残すと、以前の書き出しをUTCとして読んでいる手元の
      // 集計が、黙って9時間ずれた値を受け取る。名前を変えれば、そこで
      // 止まって気づける。
      "startedAtJst",
      "aborted",
      "mode",
      "bpm",
      "countInBeats",
      "judgmentWindowMs",
      "effectiveWindowMs",
      "appliedBaselineMs",
      "beatIndex",
      "beatKind",
      "scheduledMs",
      "inputMs",
      "rawOffsetMs",
      "judgment",
      "excluded",
      // 19列目。その回、画面から拍の手がかり（予告の溜め＋ずれの目盛り）を
      // 出していたか。出していた回の入力は聴覚キューだけへの同期ではない
      // ので、解析でこの列を分けずに混ぜると、測っているものが違う行が
      // 同じ分布に入る（settings.visualGuidance / games/rhythm.js）。
      //
      // 既存18列の**後ろ**に足すこと自体が要件（detailed-design.md §9.3
      // 「この18列は既存データ互換のため変更しない」）。途中に挿すと
      // それ以降の列位置がずれ、位置で読んでいる解析側が黙って壊れる。
      "visualGuidance",
      // 20列目。そくてい（研究）かれんしゅう（訓練）か。解析ではまず
      // measure だけを見ればよい——主要測定の条件を固定するための列。
      "difficultyMode",
      ...DEVICE_HEADERS,
      // 端末列の**さらに後ろ**。成立確認（src/lib/readinessCheck.js）が
      // 通った状態で測ったか: met / overridden / n/a。
      //
      // overridden は「高低を聞き分けられるか等を確かめないまま測った回」。
      // 成績が低かったときに、抑制の失敗なのか、そもそも課題が成立して
      // いなかったのかを、この列が無いと後から分けられない。
      // 除外するかどうかを決めるのは解析側なので、アプリは測定を止めず
      // 記録する（測定条件は禁止せず記録する、という全体の方針）。
      "measurementReadiness",
    ],
  ];
  sessions.forEach((session) => {
    const config = session.config || {};
    (session.trials || []).forEach((trial) => {
      rows.push([
        session.sessionId,
        session.participantId || "",
        session.gameId,
        toJstIso(session.startedAtIso),
        session.aborted,
        config.mode ?? "",
        config.bpm ?? "",
        config.countInBeats ?? "",
        config.judgmentWindowMs ?? "",
        config.effectiveWindowMs ?? "",
        trial.appliedBaselineMs ?? "",
        trial.beatIndex ?? "",
        trial.beatKind ?? "",
        trial.scheduledMs ?? "",
        trial.inputMs ?? "",
        trial.rawOffsetMs ?? "",
        trial.judgment,
        trial.excluded,
        config.visualGuidance === true,
        config.difficultyMode ?? "practice",
        ...deviceColumns(session),
        config.measurementReadiness ?? "n/a",
      ]);
    });
  });
  return rows;
}

/**
 * セッション台帳CSV（1セッション1行、全 taskType 横断）。
 *
 * これまでの5本のCSVはすべて「1試行1行」のロング形式で、セッションそのものを
 * 数える手段が無かった。解析を始める前に必ず要るのは、試行の中身ではなく
 * 台帳のほう——誰の回が何回あり、どれがそくていで、どれが中断で、どれが
 * 成立確認を飛ばして測った回か。ロング形式から復元しようとすると、
 * 「試行が0件で保存された回」（中断・音が出なかった回）が最初から見えない。
 * 欠測を数えられないデータは、欠測が無いデータと区別がつかない。
 *
 * summary は課題ごとに形が違う。共通化して数個の指標に潰すと、潰した先が
 * 課題ごとに違う意味になるので、そのままJSONで1列に入れる（summaryJson）。
 * 解析側で必要な指標だけを開けばよく、アプリ側が意味を決めない。
 */
export const SESSION_LEDGER_HEADERS = Object.freeze([
  "sessionId",
  "participantId",
  "taskType",
  "gameId",
  "startedAtJst",
  "endedAtJst",
  "finished",
  "aborted",
  "difficultyMode",
  "measurementReadiness",
  // 「ずっとあそぶ」の回か。trialCount が回ごとに変わる理由がこれ。
  "endless",
  "trialCount",
  "excludedTrialCount",
  "protocolVersion",
  "engineVersion",
  ...DEVICE_HEADERS,
  "configJson",
  "summaryJson",
]);

export function buildSessionLedgerRows(sessions) {
  const rows = [[...SESSION_LEDGER_HEADERS]];
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    if (!session || typeof session !== "object") return;
    const trials = Array.isArray(session.trials) ? session.trials : [];
    rows.push([
      session.sessionId ?? "",
      session.participantId || "",
      session.taskType ?? "",
      session.gameId ?? "",
      toJstIso(session.startedAtIso),
      // 終端を立てないまま消えた回は空欄。終わった回と見分けられるようにする。
      toJstIso(session.endedAtIso),
      session.finished === true,
      session.aborted === true,
      session.config?.difficultyMode ?? "practice",
      session.config?.measurementReadiness ?? "n/a",
      session.config?.endless === true,
      trials.length,
      // 除外した試行の数。excluded を持たない課題では常に0になる。
      trials.filter((trial) => trial?.excluded === true).length,
      // slot だけが持つ版。他の課題では空欄——「無い」ことを空欄で表す。
      session.protocolVersion ?? "",
      session.engineVersion ?? "",
      ...deviceColumns(session),
      JSON.stringify(session.config ?? {}),
      JSON.stringify(session.summary ?? {}),
    ]);
  });
  return rows;
}

export function buildTaskCsvRows(sessions, taskType) {
  if (taskType === "scan") {
    const rows = [
      [
        ...COMMON_TASK_HEADERS,
        "targetX",
        "targetY",
        "toleranceR",
        "selectedX",
        "selectedY",
        "dx",
        "dy",
        "distance",
        "xPhaseMs",
        "yPhaseMs",
        "judgment",
        // その回、ねらいの通過音を鳴らしていたか（settings.craneAudioGuidance）。
        // 鳴らしていた回は画面を見ずに解けるので、視覚課題としての成績を
        // 混ぜてはいけない。既存列の後ろへ足す（列位置を動かさない）。
        "audioGuidance",
        // そくてい（研究）かれんしゅう（訓練）か。
        "difficultyMode",
        ...DEVICE_HEADERS,
        // 成立確認の状態（リズムCSVと同じ意味・同じ位置づけ）。
        "measurementReadiness",
        // その回が「ずっとあそぶ」だったか。回数が回ごとに変わるので、決まった
        // 回数の回と同じ分布に混ぜない（後半ほど疲れが乗る）。
        //
        // 末尾に足すこと。いちど audioGuidance と difficultyMode のあいだへ
        // 挿してしまい、それ以降の列が1つずつずれた——列位置で読んでいる
        // 解析側が黙って壊れる形（detailed-design.md §9.3）。テストが止めた。
        "endless",
        // その試行のアームの速さ。エンドレスでは試行ごとに変わるので、
        // toleranceR だけでは要求精度（grip圏の半径 × sweepMs/100）が出せない。
        "sweepMs",
      ],
    ];
    sessions
      .filter((session) => session.taskType === "scan")
      .forEach((session) => {
        (session.trials || []).forEach((trial) => {
          rows.push([
            session.sessionId,
            session.taskType,
            session.participantId || "",
            session.gameId,
            toJstIso(session.startedAtIso),
            session.aborted,
            trial.index,
            trial.targetX,
            trial.targetY,
            trial.toleranceR,
            trial.selectedX,
            trial.selectedY,
            trial.dx,
            trial.dy,
            trial.distance,
            trial.xPhaseMs,
            trial.yPhaseMs,
            trial.judgment,
            session.config?.audioGuidance === true,
            session.config?.difficultyMode ?? "practice",
            ...deviceColumns(session),
            session.config?.measurementReadiness ?? "n/a",
            session.config?.endless === true,
            trial.sweepMs ?? session.config?.sweepMs ?? "",
          ]);
        });
      });
    return rows;
  }

  if (taskType === "rt") {
    const rows = [
      [
        ...COMMON_TASK_HEADERS,
        "kind",
        "foreperiodMs",
        "cueMs",
        "inputMs",
        "reactionTimeMs",
        "judgment",
        "excluded",
        ...DEVICE_HEADERS,
        // 末尾に足す（既存列の位置を動かさない）。リズム・走査CSVには
        // 最初からあったのに、反応CSVだけ測定条件が1つも出ていなかった。
        "difficultyMode",
        "measurementReadiness",
        // その回が「ずっとあそぶ」だったか（走査CSVと同じ意味）。
        "endless",
      ],
    ];
    sessions
      .filter((session) => session.taskType === "rt")
      .forEach((session) => {
        (session.trials || []).forEach((trial) => {
          rows.push([
            session.sessionId,
            session.taskType,
            session.participantId || "",
            session.gameId,
            toJstIso(session.startedAtIso),
            session.aborted,
            trial.index,
            trial.kind,
            trial.foreperiodMs,
            trial.cueMs,
            trial.inputMs ?? "",
            trial.reactionTimeMs ?? "",
            trial.judgment,
            trial.excluded,
            ...deviceColumns(session),
            session.config?.difficultyMode ?? "practice",
            session.config?.measurementReadiness ?? "n/a",
            session.config?.endless === true,
          ]);
        });
      });
    return rows;
  }
  return [];
}

export function initEvaluation(ctx) {
  const { state, elements, save, announce, logEvent, switchView, notifySupporter } = ctx;

  // この画面で書き出しを押したか。参加者の切り替え（handOverToNextParticipant）
  // が、消す前に書き出しを求めるために使う。ファイルが保存されたかまでは
  // アプリからは知れないので、「押した」までしか主張しない。
  let exportedSinceLastReset = false;

  /** 現在実施中（または次に実施する）タスク */
  function activeTask() {
    return evaluationTasks[state.evaluation.activeTaskIndex] || null;
  }

  /** ログエントリをタスク計測に含めるべきかの判定 */
  function shouldCountEntry(entry) {
    return (
      state.evaluation.isActive &&
      state.evaluation.taskStartedAt &&
      !entry.skipEvaluation &&
      ["switch", "matching", "phrase", "letter", "operation"].includes(entry.type)
    );
  }

  /**
   * ログエントリからタスク中の入力・誤選択・距離を自動集計する。
   * logEvent（neuronodeApp.js）から毎回呼ばれる。
   */
  function countEntry(entry) {
    if (!shouldCountEntry(entry)) return;
    state.evaluation.taskInputs += 1;
    if (entry.correct === false) state.evaluation.taskMistakes += 1;
    if (typeof entry.distance === "number") state.evaluation.taskDistances.push(entry.distance);
  }

  /** セッションを開始し、タスク進行と計測カウンタを初期化する */
  function startSession() {
    state.evaluation.isActive = true;
    state.evaluation.sessionStartedAt = new Date().toISOString();
    state.evaluation.sessionEndedAt = null;
    state.evaluation.activeTaskIndex = 0;
    state.evaluation.taskStartedAt = null;
    state.evaluation.taskInputs = 0;
    state.evaluation.taskMistakes = 0;
    state.evaluation.taskBacks = 0;
    state.evaluation.taskTimingMissed = 0;
    state.evaluation.taskTimingEarly = 0;
    state.evaluation.taskTimingLate = 0;
    state.evaluation.taskAssists = 0;
    state.evaluation.taskDistances = [];
    state.evaluation.results = [];
    save();
    announce("効果測定セッションを開始しました");
    logEvent({ type: "measurement", label: "効果測定セッション開始", skipEvaluation: true });
    render();
  }

  /** セッションを終了し、結果を completedSessions に保存する */
  function finishSession() {
    if (!state.evaluation.isActive) {
      announce(
        state.evaluation.sessionEndedAt
          ? "この効果測定セッションはすでに終了しています"
          : "先に効果測定セッションを開始してください"
      );
      return;
    }
    if (state.evaluation.taskStartedAt) completeTask(false);
    const session = {
      participantId: state.evaluation.participantId,
      condition: state.evaluation.condition,
      startedAt: state.evaluation.sessionStartedAt,
      endedAt: new Date().toISOString(),
      effortRating: state.evaluation.effortRating,
      easeRating: state.evaluation.easeRating,
      engagementRating: state.evaluation.engagementRating,
      observerNotes: state.evaluation.observerNotes,
      taskResults: [...state.evaluation.results],
    };
    state.evaluation.completedSessions.unshift(session);
    state.evaluation.completedSessions = state.evaluation.completedSessions.slice(
      0,
      MAX_EVALUATION_SESSIONS
    );
    state.evaluation.isActive = false;
    state.evaluation.sessionEndedAt = session.endedAt;
    // 完了結果の正本はcompletedSessionsへ移したので、進行中バッファを空にする。
    // 旧実装のまま残すとCSVに同じタスクが2行出て、終了ボタンも再度反応していた。
    state.evaluation.results = [];
    state.evaluation.taskStartedAt = null;
    state.evaluation.taskInputs = 0;
    state.evaluation.taskMistakes = 0;
    state.evaluation.taskBacks = 0;
    state.evaluation.taskTimingMissed = 0;
    state.evaluation.taskTimingEarly = 0;
    state.evaluation.taskTimingLate = 0;
    state.evaluation.taskAssists = 0;
    state.evaluation.taskDistances = [];
    save();
    announce("効果測定セッションを終了しました");
    logEvent({ type: "measurement", label: "効果測定セッション終了", skipEvaluation: true });
    render();
  }

  /** 現在のタスクの計測を開始する（セッション未開始なら自動開始） */
  function startTask() {
    if (!state.evaluation.isActive) startSession();
    const task = activeTask();
    if (!task) {
      announce("すべての評価タスクが完了しています");
      return;
    }
    state.evaluation.taskStartedAt = new Date().toISOString();
    state.evaluation.taskInputs = 0;
    state.evaluation.taskMistakes = 0;
    state.evaluation.taskBacks = 0;
    state.evaluation.taskTimingMissed = 0;
    state.evaluation.taskTimingEarly = 0;
    state.evaluation.taskTimingLate = 0;
    state.evaluation.taskAssists = 0;
    state.evaluation.taskDistances = [];
    save();
    announce(`${task.title}を開始しました`);
    logEvent({ type: "measurement", label: `タスク開始: ${task.title}`, skipEvaluation: true });
    render();
  }

  /** タスクを成功/中止で確定し、結果オブジェクトを生成する */
  function completeTask(success) {
    const task = activeTask();
    if (!task || !state.evaluation.taskStartedAt) {
      announce("先にタスクを開始してください");
      return;
    }
    const endedAt = new Date().toISOString();
    // 端末時刻が計測中に巻き戻っても負の所要時間を保存しない。
    const durationMs = Math.max(
      0,
      new Date(endedAt).getTime() - new Date(state.evaluation.taskStartedAt).getTime()
    );
    const timingErrors =
      state.evaluation.taskTimingMissed +
      state.evaluation.taskTimingEarly +
      state.evaluation.taskTimingLate;
    const durationMinutes = durationMs > 0 ? durationMs / 60000 : 0;
    const averageTargetDistance = state.evaluation.taskDistances.length
      ? Math.round(
          state.evaluation.taskDistances.reduce((sum, value) => sum + value, 0) /
            state.evaluation.taskDistances.length
        )
      : "";
    const result = {
      participantId: state.evaluation.participantId,
      condition: state.evaluation.condition,
      taskId: task.id,
      taskTitle: task.title,
      success,
      startedAt: state.evaluation.taskStartedAt,
      endedAt,
      durationSeconds: Math.round(durationMs / 100) / 10,
      inputs: state.evaluation.taskInputs,
      mistakes: state.evaluation.taskMistakes,
      backs: state.evaluation.taskBacks,
      timingMissed: state.evaluation.taskTimingMissed,
      timingEarly: state.evaluation.taskTimingEarly,
      timingLate: state.evaluation.taskTimingLate,
      timingErrors,
      assists: state.evaluation.taskAssists,
      scanIntervalMs: state.settings.scanInterval,
      inputsPerMinute: durationMinutes
        ? Math.round((state.evaluation.taskInputs / durationMinutes) * 10) / 10
        : 0,
      averageTargetDistance,
      selectionErrorRate: state.evaluation.taskInputs
        ? Math.round((state.evaluation.taskMistakes / state.evaluation.taskInputs) * 1000) / 10
        : 0,
      totalScanningErrorRate: state.evaluation.taskInputs
        ? Math.round(((state.evaluation.taskMistakes + timingErrors) / state.evaluation.taskInputs) * 1000) / 10
        : 0,
      effortRating: state.evaluation.effortRating,
      easeRating: state.evaluation.easeRating,
      engagementRating: state.evaluation.engagementRating,
      observerNotes: state.evaluation.observerNotes,
    };
    state.evaluation.results.push(result);
    state.evaluation.activeTaskIndex = Math.min(state.evaluation.activeTaskIndex + 1, evaluationTasks.length);
    state.evaluation.taskStartedAt = null;
    state.evaluation.taskInputs = 0;
    state.evaluation.taskMistakes = 0;
    state.evaluation.taskBacks = 0;
    state.evaluation.taskTimingMissed = 0;
    state.evaluation.taskTimingEarly = 0;
    state.evaluation.taskTimingLate = 0;
    state.evaluation.taskAssists = 0;
    state.evaluation.taskDistances = [];
    save();
    announce(success ? "タスクを成功で記録しました" : "タスクを中止または失敗で記録しました");
    logEvent({
      type: "measurement",
      label: `${success ? "成功" : "中止/失敗"}: ${task.title}`,
      skipEvaluation: true,
    });
    render();
  }

  /** 現在のタスクの対象画面へ移動する */
  function openCurrentTaskView() {
    const task = activeTask();
    if (!task) {
      announce("すべての評価タスクが完了しています");
      return;
    }
    switchView(task.view);
  }

  /**
   * 手動カウンタの加算。
   * 早押し/遅押しは「入力した上でのエラー」なので taskInputs も +1、
   * 見逃しは「入力しなかった」エラーなので taskInputs は増やさない。
   */
  function adjustCounter(kind) {
    if (!state.evaluation.taskStartedAt) {
      announce("先にタスクを開始してください");
      return;
    }
    if (kind === "mistake") {
      state.evaluation.taskInputs += 1;
      state.evaluation.taskMistakes += 1;
      logEvent({ type: "measurement", label: "誤選択を手動加算", skipEvaluation: true });
    } else if (kind === "back") {
      state.evaluation.taskBacks += 1;
      logEvent({ type: "measurement", label: "戻り操作を手動加算", skipEvaluation: true });
    } else if (kind === "timingMissed") {
      state.evaluation.taskTimingMissed += 1;
      logEvent({ type: "measurement", label: "タイミングエラー: 見逃し", skipEvaluation: true });
    } else if (kind === "timingEarly") {
      state.evaluation.taskInputs += 1;
      state.evaluation.taskTimingEarly += 1;
      logEvent({ type: "measurement", label: "タイミングエラー: 早押し", skipEvaluation: true });
    } else if (kind === "timingLate") {
      state.evaluation.taskInputs += 1;
      state.evaluation.taskTimingLate += 1;
      logEvent({ type: "measurement", label: "タイミングエラー: 遅押し", skipEvaluation: true });
    } else if (kind === "assist") {
      state.evaluation.taskAssists += 1;
      logEvent({ type: "measurement", label: "介助を手動加算", skipEvaluation: true });
    }
    save();
    render();
  }

  /**
   * リズムセッション終了時の evaluation 連動（detailed-design.md §9.4、失敗系のみ、MUST）。
   * games/gameHost.js の finishGame() から、summary（judge.js の分類集計、
   * §9.2 の summary サブスキーマ）を渡して呼ばれる。
   *   - taskTimingMissed += misses
   *   - taskMistakes += commissions + extras
   *   - taskTimingEarly / taskTimingLate へは連動しない（窓内 hit の早め/遅めは
   *     失敗ではないため。傾向分析はリズムCSVの rawOffsetMs 側で行う）
   * 既存 countEntry() と同じく、効果測定タスクが実行中のときだけ加算する
   * （研究計画セッション外の日常プレイの成績を測定データに混ぜない）。
   */
  function recordSessionOutcome(taskType, summary) {
    if (!state.evaluation.isActive || !state.evaluation.taskStartedAt) return;
    if (taskType === "sms" || taskType === "gonogo") {
      state.evaluation.taskTimingMissed += summary.misses || 0;
      state.evaluation.taskMistakes += (summary.commissions || 0) + (summary.extras || 0);
    } else if (taskType === "slot") {
      state.evaluation.taskTimingMissed += summary.timeouts || 0;
      state.evaluation.taskMistakes += (summary.misses || 0) + (summary.extras || 0);
    } else if (taskType === "scan") {
      state.evaluation.taskTimingMissed += summary.misses || 0;
      state.evaluation.taskMistakes += summary.slips || 0;
    } else if (taskType === "rt") {
      state.evaluation.taskTimingMissed += summary.timeouts || 0;
      state.evaluation.taskMistakes +=
        (summary.falseStarts || 0) + (summary.commissions || 0);
    }
    save();
    render();
  }

  /** 測定データをリセットする（参加者IDと条件は保持） */
  function reset() {
    state.evaluation = {
      ...cloneDefaultState().evaluation,
      participantId: state.evaluation.participantId,
      condition: state.evaluation.condition,
    };
    save();
    announce("測定データをリセットしました");
    render();
  }

  /** 進行中の結果と保存済みセッションの結果を1つの配列に平坦化する */
  function flattenResults() {
    return flattenEvaluationResults(state.evaluation);
  }

  /** 測定結果をBOM付きCSV（27列）でダウンロードする */
  function exportCsv() {
    const results = flattenResults();
    if (results.length === 0) {
      announce("書き出す測定結果がありません");
      notifySupporter("書き出す測定結果がありません。効果測定のタスクを1つ終えると記録されます。");
      return;
    }
    exportedSinceLastReset = true;
    const rows = [
      [
        "participant_id",
        "condition",
        "task_id",
        "task_title",
        "success",
        "duration_sec",
        "inputs",
        "mistakes",
        "selection_error_rate_percent",
        "timing_missed",
        "timing_early",
        "timing_late",
        "timing_errors",
        "total_scanning_error_rate_percent",
        "backs",
        "assists",
        "inputs_per_minute",
        "average_target_distance",
        "scan_interval_ms",
        "effort_rating",
        "ease_rating",
        "engagement_rating",
        "observer_notes",
        // すべて日本時間（+09:00付き）。
        "task_started_at_jst",
        "task_ended_at_jst",
        "session_started_at_jst",
        "session_ended_at_jst",
      ],
      ...results.map((result) => [
        result.participantId || "",
        result.condition || "",
        result.taskId,
        result.taskTitle,
        result.success ? "success" : "fail",
        result.durationSeconds,
        result.inputs,
        result.mistakes,
        result.selectionErrorRate ?? "",
        result.timingMissed ?? "",
        result.timingEarly ?? "",
        result.timingLate ?? "",
        result.timingErrors ?? "",
        result.totalScanningErrorRate ?? "",
        result.backs,
        result.assists ?? "",
        result.inputsPerMinute ?? "",
        result.averageTargetDistance ?? "",
        result.scanIntervalMs ?? "",
        result.effortRating,
        result.easeRating,
        result.engagementRating ?? "",
        result.observerNotes ?? "",
        toJstIso(result.startedAt),
        toJstIso(result.endedAt),
        toJstIso(result.sessionStartedAt || state.evaluation.sessionStartedAt || ""),
        toJstIso(result.sessionEndedAt || state.evaluation.sessionEndedAt || ""),
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-evaluation-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * リズム計測結果をBOM付きCSV（19列、ロング形式）で書き出す
   * （detailed-design.md §9.3）。1試行1行。summary は含めない
   * （解析側で再計算可能なため、二重管理を避ける）。
   * correctRejection / miss の行は inputMs / rawOffsetMs が空欄になる
   * （trials 側で null にしてあるため、そのまま escapeCsv に渡せば空欄になる）。
   */
  function exportRhythmCsv() {
    const sessions = state.sessions.filter(
      (session) => session.taskType === "sms" || session.taskType === "gonogo"
    );
    if (!sessions.length) {
      announce("書き出すリズム計測データがありません");
      // announce の出力先 #liveRegion は .sr-only なので、読み上げを使わない
      // 支援者には何も届かない——押しても無反応に見え、壊れていると受け取られる。
      // 他の書き出しには notifySupporter を足してあったのに、ここだけ抜けていた
      // （2026-08-28、tests/web-smoke.mjs の checkExportButtonsAreWired が検出）。
      notifySupporter(
        "書き出すリズム計測データがありません。リズムまたはGo/No-Goを1回終えると記録されます。"
      );
      return;
    }
    exportedSinceLastReset = true;
    const rows = buildRhythmCsvRows(sessions);
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-rhythm-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * slot-v1を旧リズムと混ぜず、1停止1行の専用CSVとして書き出す。
   *
   * この関数は exportRhythmCsv の内側に入り込んでいた（2026-08-28に発見）。
   * 外側の addEventListener からは見えないはずだが、`id` を持つ要素は同名の
   * グローバル変数になるため、`exportSlotCsv` はボタン要素そのものに解決され、
   * addEventListener はそれを「handleEvent を持たないリスナ」として黙って
   * 受け取っていた——例外も警告も出ず、押しても何も起きないだけ。
   * リールCSVが1件も書き出せない状態が、テストにも実機確認にも映らなかった。
   */
  function exportSlotCsv() {
    const sessions = state.sessions.filter((session) => session.taskType === "slot");
    if (!sessions.length) {
      announce("書き出すリール停止データがありません");
      notifySupporter("書き出すリール停止データがありません。L1またはL2を1回終えると記録されます。");
      return;
    }
    exportedSinceLastReset = true;
    const rows = buildSlotCsvRows(sessions);
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-slot-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTaskCsv(taskType) {
    const sessions = state.sessions.filter((session) => session.taskType === taskType);
    if (!sessions.length) {
      const label = taskType === "scan" ? "走査課題" : "反応課題";
      announce(`書き出す${label}データがありません`);
      notifySupporter(
        `書き出す${label}データがありません。利用者が該当のあそびを1回終えると記録されます。`
      );
      return;
    }
    exportedSinceLastReset = true;
    const rows = buildTaskCsvRows(sessions, taskType);
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-${taskType}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** BOM付きUTF-8で書き出す共通処理（Excelが素で開ける形）。 */
  function downloadCsv(rows, filenameStem) {
    exportedSinceLastReset = true;
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filenameStem}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** 全課題のセッション台帳（1セッション1行）を書き出す。 */
  function exportSessionLedgerCsv() {
    if (!state.sessions.length) {
      announce("書き出すセッションがありません");
      notifySupporter(
        "書き出すセッションがありません。あそびを1回終えると1行ぶん記録されます。"
      );
      return;
    }
    downloadCsv(buildSessionLedgerRows(state.sessions), "neuronode-sessions");
  }

  /**
   * 保存されている状態を丸ごとJSONで書き出す（生データの控え）。
   *
   * CSVは列を選んだ派生物で、選ばなかったものは出ない。正本はこの端末の
   * localStorage だけにあり、端末を初期化すれば消える。研究データが
   * 1台のiPadの中にしか無い状態を、支援者が自分で解消できるようにする。
   *
   * 再解析・監査のときは、CSVの列を後から足すよりこの控えを読み直すほうが
   * 早い——書き出した時点でアプリが何を持っていたかがそのまま残る。
   */
  function exportRawJson() {
    exportedSinceLastReset = true;
    const payload = {
      // 控えの中身は state そのまま（保存はUTC）。読む人のために、
      // 書き出した時刻だけ日本時間も併記する。
      exportedAtIso: new Date().toISOString(),
      exportedAtJst: toJstIso(new Date().toISOString()),
      storageKey,
      // CSVの列は増えるが、この控えは state の形そのもの。読む側が形を
      // 判別できるように、書き出し時のキー名を添える。
      sessionCount: state.sessions.length,
      logCount: state.logs.length,
      state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-raw-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notifySupporter(
      `生データを書き出しました（セッション${state.sessions.length}件、ログ${state.logs.length}件）。`
    );
  }

  /**
   * セッションの保存上限に近づいたことを支援者へ知らせる。
   *
   * state.sessions は古い順に MAX_SESSIONS 件へ切り詰められる。研究データ
   * 本体がここに入っているのに、これまで何の表示も無かった——50件を超えた
   * 時点で最初の回から静かに消え、支援者が気づけるのは書き出したあと
   * （そのときには既に消えている）。操作ログには同じ趣旨の警告を出して
   * いたので、より重要なほうにだけ無かったことになる。
   *
   * 残り5件から出す。1回ぶんの測定を終える前に書き出せる猶予として。
   */
  function renderSessionRetention() {
    const warning = elements.sessionRetentionWarning;
    if (!warning) return;
    const count = state.sessions.length;
    const remaining = MAX_SESSIONS - count;
    if (remaining > 5) {
      warning.hidden = true;
      warning.textContent = "";
      return;
    }
    warning.hidden = false;
    warning.textContent =
      remaining > 0
        ? `セッションの保存上限（${MAX_SESSIONS}件）まであと${remaining}件です。` +
          "上限を超えると古い回から消えるので、先に「セッション台帳」と各CSV、" +
          "または「生データ(JSON)」を書き出してください。"
        : `セッションの保存上限（${MAX_SESSIONS}件）に達しています。` +
          "次の回を記録すると最も古い回が消えます。今すぐ書き出してください。";
  }

  /**
   * この端末に、いま何人ぶんの記録が入っているか。
   *
   * 参加者IDは支援者が打つ1つの文字列で、セッションにはその時点の値が
   * 焼き付く。切り替えを忘れたまま次の人を測ると、別人の回が同じIDで
   * 混ざる——それは記録からは見分けられない。せめて「いま何人ぶん入って
   * いるか」を出しておけば、切り替え忘れに気づく手がかりになる。
   */
  function recordedParticipants() {
    const ids = new Set();
    (state.sessions || []).forEach((session) => ids.add(session.participantId || ""));
    return [...ids];
  }

  /**
   * 参加者ひとりぶんを終える。
   *
   * 想定している運用は「1人終わったら書き出して、端末を空にして次の人へ」。
   * ところが、これまでどのボタンも state.sessions（研究データ本体）を
   * 消さなかった。測定リセットが消すのは evaluation だけ、ログ削除が消すのは
   * logs だけで、セッションは端末に残りつづける。
   *
   * 残ると何が起きるか:
   *   - 推移と自己最高が前の参加者の回と混ざる（誰の線か言えなくなる）
   *   - 成立確認は participantId で絞るので、IDを変えた瞬間に材料が0に戻る
   *     ——ここだけ挙動が違うので、支援者からは理由が見えない
   *   - 保持上限50件を前の人の回が食う（3人共用なら1人あたり来所4回ぶん）
   *
   * 消す前に必ず書き出させる。書き出しは取り返しがつくが、消去はつかない。
   * 「書き出した」の判定は、この画面で実際に書き出しを押したかで持つ
   * （ファイルが保存されたかは、アプリからは知りようがない——ダウンロードの
   * 成否はブラウザの外にある。だから「押した」までしか主張しない）。
   */
  function handOverToNextParticipant() {
    const sessionCount = state.sessions.length;
    const logCount = state.logs.length;
    if (sessionCount === 0 && logCount === 0) {
      notifySupporter("消すものがありません。この端末にはまだ記録が入っていません。");
      announce("消すものがありません");
      return;
    }
    if (!exportedSinceLastReset) {
      notifySupporter(
        `まだ書き出していません。セッション${sessionCount}件・ログ${logCount}件が消えます。` +
          "先に「セッション台帳」と各CSV、または「生データ(JSON)」を書き出してください。"
      );
      announce("先に書き出してください");
      return;
    }
    if (!window.confirm(
      `この端末の記録を消します。\n\n` +
        `　セッション ${sessionCount}件\n` +
        `　操作ログ ${logCount}件\n` +
        `　測定結果と観察メモ\n\n` +
        "書き出したファイルは消えません。消した記録は元に戻せません。"
    )) {
      announce("消すのをやめました");
      return;
    }

    const fresh = cloneDefaultState();
    state.sessions = [];
    state.logs = [];
    state.evaluation = { ...fresh.evaluation };
    state.arcade = { ...fresh.arcade };
    exportedSinceLastReset = false;
    save();
    ctx.renderAll();
    notifySupporter(
      `記録を消しました（セッション${sessionCount}件・ログ${logCount}件）。` +
        "次の参加者IDを入れてから始めてください。"
    );
    announce("記録を消しました。次の参加者IDを入れてください");
  }

  /** 効果測定画面全体の描画 */
  function render() {
    if (!elements.evaluationStatus) return;
    renderSessionRetention();
    const task = activeTask();
    const isRunningTask = Boolean(state.evaluation.taskStartedAt);
    const displayedResults =
      state.evaluation.results.length > 0 || state.evaluation.isActive
        ? state.evaluation.results
        : state.evaluation.completedSessions[0]?.taskResults || [];
    elements.participantId.value = state.evaluation.participantId;
    elements.evaluationCondition.value = state.evaluation.condition;
    elements.effortRating.value = state.evaluation.effortRating;
    elements.effortRatingValue.value = String(state.evaluation.effortRating);
    elements.easeRating.value = state.evaluation.easeRating;
    elements.easeRatingValue.value = String(state.evaluation.easeRating);
    elements.engagementRating.value = state.evaluation.engagementRating;
    elements.engagementRatingValue.value = String(state.evaluation.engagementRating);
    elements.observerNotes.value = state.evaluation.observerNotes;

    elements.evaluationStatus.textContent = isRunningTask
      ? "タスク計測中"
      : state.evaluation.isActive
        ? "セッション中"
        : "未開始";
    elements.currentTaskTitle.textContent = task ? task.title : "すべてのタスクが完了しました";
    elements.currentTaskGuide.textContent = task
      ? task.guide
      : "セッション終了を押すと、今回の測定を保存できます。";
    elements.taskElapsed.textContent = isRunningTask
      ? formatDuration(Date.now() - new Date(state.evaluation.taskStartedAt).getTime())
      : "--";
    elements.taskInputs.textContent = String(state.evaluation.taskInputs);
    elements.taskMistakes.textContent = String(state.evaluation.taskMistakes);
    elements.taskBacks.textContent = String(state.evaluation.taskBacks);
    elements.taskTimingErrors.textContent = String(
      state.evaluation.taskTimingMissed +
        state.evaluation.taskTimingEarly +
        state.evaluation.taskTimingLate
    );
    elements.taskAssists.textContent = String(state.evaluation.taskAssists);

    elements.evaluationTaskList.innerHTML = "";
    evaluationTasks.forEach((item, index) => {
      const done = displayedResults.some((result) => result.taskId === item.id);
      const card = document.createElement("article");
      card.className = "task-card";
      card.classList.toggle("is-current", index === state.evaluation.activeTaskIndex);
      card.classList.toggle("is-done", done);
      card.innerHTML = `
      <span class="metric-label">${done ? "完了" : index === state.evaluation.activeTaskIndex ? "現在" : "待機"}</span>
      <strong>${index + 1}. ${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.guide)}</p>
    `;
      elements.evaluationTaskList.append(card);
    });

    elements.evaluationResultList.innerHTML = "";
    const results = [...displayedResults].reverse();
    if (results.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent =
        "まだ測定結果はありません。タスクを開始して、成功または中止/失敗で終了すると記録されます。";
      elements.evaluationResultList.append(empty);
      return;
    }
    results.forEach((result) => {
      const item = document.createElement("article");
      item.className = "log-item";
      item.innerHTML = `
      <span class="metric-label">${result.success ? "成功" : "中止/失敗"}</span>
      <strong>${escapeHtml(result.taskTitle)}</strong>
      <span>${result.durationSeconds}秒 / 入力${result.inputs} / 誤${result.mistakes} / 走査誤${result.timingErrors || 0}</span>
    `;
      elements.evaluationResultList.append(item);
    });
  }

  // --- リスナー登録 ---
  elements.participantId.addEventListener("input", (event) => {
    state.evaluation.participantId = event.target.value.trim();
    save();
  });
  elements.evaluationCondition.addEventListener("change", (event) => {
    state.evaluation.condition = event.target.value;
    const profile = researchConditionProfiles.find((item) => item.evaluationValue === event.target.value);
    if (profile) state.research.conditionProfile = profile.id;
    save();
    render();
    ctx.views.research.render();
  });
  elements.startSession.addEventListener("click", startSession);
  elements.finishSession.addEventListener("click", finishSession);
  elements.startTask.addEventListener("click", startTask);
  elements.openTaskView.addEventListener("click", openCurrentTaskView);
  elements.markTaskSuccess.addEventListener("click", () => completeTask(true));
  elements.markTaskFail.addEventListener("click", () => completeTask(false));
  elements.addMistake.addEventListener("click", () => adjustCounter("mistake"));
  elements.addBack.addEventListener("click", () => adjustCounter("back"));
  elements.addTimingMissed.addEventListener("click", () => adjustCounter("timingMissed"));
  elements.addTimingEarly.addEventListener("click", () => adjustCounter("timingEarly"));
  elements.addTimingLate.addEventListener("click", () => adjustCounter("timingLate"));
  elements.addAssist.addEventListener("click", () => adjustCounter("assist"));
  elements.effortRating.addEventListener("input", (event) => {
    state.evaluation.effortRating = Number(event.target.value);
    save();
    render();
  });
  elements.easeRating.addEventListener("input", (event) => {
    state.evaluation.easeRating = Number(event.target.value);
    save();
    render();
  });
  elements.engagementRating.addEventListener("input", (event) => {
    state.evaluation.engagementRating = Number(event.target.value);
    save();
    render();
  });
  elements.observerNotes.addEventListener("input", (event) => {
    state.evaluation.observerNotes = event.target.value;
    save();
  });
  elements.exportEvaluationCsv.addEventListener("click", exportCsv);
  elements.exportRhythmCsv.addEventListener("click", exportRhythmCsv);
  elements.exportSlotCsv.addEventListener("click", exportSlotCsv);
  elements.exportScanCsv.addEventListener("click", () => exportTaskCsv("scan"));
  elements.exportRtCsv.addEventListener("click", () => exportTaskCsv("rt"));
  elements.exportSessionLedgerCsv.addEventListener("click", exportSessionLedgerCsv);
  elements.exportRawJson.addEventListener("click", exportRawJson);
  elements.resetEvaluation.addEventListener("click", reset);
  elements.handOverParticipant?.addEventListener("click", handOverToNextParticipant);

  return { render, countEntry, recordSessionOutcome };
}
