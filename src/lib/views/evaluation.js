// =====================================================================
// views/evaluation.js — 効果測定セッション画面
//
// 研究計画（docs/research-summary.md）の評価項目を記録し、27列のCSVに
// 書き出す。logEvent から countEntry() が呼ばれ、教材操作が自動集計される。
//
// 注意: この画面はマークアップ上は存在するが、現状タブからは到達できない
// （content.js の visibleViews 参照、既知の制約）。
//
// P3-1（detailed-design.md §9.3・§9.4）: リズム計測CSV（state.rhythm.sessions
// の trials を1試行1行に平坦化した18列）と、リズムセッション終了時の
// evaluation 連動（失敗系のみ。taskTimingMissed += misses、
// taskMistakes += commissions + extras。早め/遅めの hit は失敗ではないため
// taskTimingEarly/Late へは連動しない、MUST）を追加する。
// recordRhythmSessionOutcome() は games/gameHost.js の finishGame() から、
// 効果測定タスクが実行中のときだけ加算する（既存の countEntry() と同じ
// gating。研究計画セッション外の日常プレイまで taskMistakes に混ぜない）。
// =====================================================================

import { evaluationTasks, researchConditionProfiles } from "../content.js";
import { cloneDefaultState } from "../state.js";
import { escapeHtml, escapeCsv, formatDuration } from "../utils.js";

export function initEvaluation(ctx) {
  const { state, elements, save, announce, logEvent, switchView } = ctx;

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
    if (!state.evaluation.isActive && state.evaluation.results.length === 0) return;
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
    state.evaluation.completedSessions = state.evaluation.completedSessions.slice(0, 20);
    state.evaluation.isActive = false;
    state.evaluation.sessionEndedAt = session.endedAt;
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
    const durationMs = new Date(endedAt).getTime() - new Date(state.evaluation.taskStartedAt).getTime();
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
  function recordRhythmSessionOutcome(summary) {
    if (!state.evaluation.isActive || !state.evaluation.taskStartedAt) return;
    state.evaluation.taskTimingMissed += summary.misses || 0;
    state.evaluation.taskMistakes += (summary.commissions || 0) + (summary.extras || 0);
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
    const completed = state.evaluation.completedSessions.flatMap((session) =>
      session.taskResults.map((result) => ({
        ...result,
        sessionStartedAt: session.startedAt,
        sessionEndedAt: session.endedAt,
        effortRating: session.effortRating,
        easeRating: session.easeRating,
        engagementRating: session.engagementRating,
        observerNotes: session.observerNotes,
      }))
    );
    return [...state.evaluation.results, ...completed];
  }

  /** 測定結果をBOM付きCSV（27列）でダウンロードする */
  function exportCsv() {
    const results = flattenResults();
    if (results.length === 0) {
      announce("書き出す測定結果がありません");
      return;
    }
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
        "task_started_at",
        "task_ended_at",
        "session_started_at",
        "session_ended_at",
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
        result.startedAt,
        result.endedAt,
        result.sessionStartedAt || state.evaluation.sessionStartedAt || "",
        result.sessionEndedAt || state.evaluation.sessionEndedAt || "",
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
   * リズム計測結果をBOM付きCSV（18列、ロング形式）で書き出す
   * （detailed-design.md §9.3）。1試行1行。summary は含めない
   * （解析側で再計算可能なため、二重管理を避ける）。
   * correctRejection / miss の行は inputMs / rawOffsetMs が空欄になる
   * （trials 側で null にしてあるため、そのまま escapeCsv に渡せば空欄になる）。
   */
  function exportRhythmCsv() {
    const sessions = state.rhythm.sessions;
    if (!sessions.length) {
      announce("書き出すリズム計測データがありません");
      return;
    }
    const rows = [
      [
        "sessionId",
        "participantId",
        "gameId",
        "startedAtIso",
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
      ],
    ];
    sessions.forEach((session) => {
      const config = session.config || {};
      (session.trials || []).forEach((trial) => {
        rows.push([
          session.sessionId,
          session.participantId || "",
          session.gameId,
          session.startedAtIso,
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
        ]);
      });
    });
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-rhythm-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** 効果測定画面全体の描画 */
  function render() {
    if (!elements.evaluationStatus) return;
    const task = activeTask();
    const isRunningTask = Boolean(state.evaluation.taskStartedAt);
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
      const done = state.evaluation.results.some((result) => result.taskId === item.id);
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
    const results = [...state.evaluation.results].reverse();
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
  elements.resetEvaluation.addEventListener("click", reset);

  return { render, countEntry, recordRhythmSessionOutcome };
}
