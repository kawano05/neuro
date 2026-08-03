// =====================================================================
// state.js — アプリ状態の初期値・読み込み・保存
//
// 変更点（旧 neuronodeApp.js からの改善）:
//   saveState が try/catch で保護され、localStorage への書き込み失敗
//   （容量不足・プライベートブラウズ等）が黙って握り潰されなくなった。
//   失敗時は console.error と onError コールバック（連続失敗の初回のみ）で通知する。
// =====================================================================

import {
  storageKey,
  readinessItems,
  visibleViews,
  switchModules,
  phraseCategories,
  matchingTasks,
  letterTasks,
  operationModes,
  operationItemTasks,
  operationPointTargets,
  evaluationTasks,
  researchConditionProfiles,
  environmentLabels,
} from "./content.js";
import { graspOutcome } from "./games/pointing.js";
import { judgeReaction } from "./games/reaction.js";

/**
 * 旧保存キー（P0-0 移行元、detailed-design.md §9.5）。
 * v2 … src/lib 分割版（リファクタリングノート2026-06-10時点）。
 * v1 … App.svelte モノリス版（P0-0 で起動経路を一本化する前の実装）。
 * どちらも削除はせず、v3 が空のときの移行元としてのみ参照する。
 */
const legacyStorageKeyV2 = "neuronode-prototype-state-v2";
const legacyStorageKeyV1 = "neuro-trainer-state-v1";

/** 状態の初期値。localStorage が空・壊れている場合のフォールバック。 */
export const defaultState = {
  // P1-2（detailed-design.md §2.1）: 利用者向けフローの入口は常に "start"。
  // loadState() 呼び出し側（neuronodeApp.js）が読み込み後に必ず "start" へ
  // 上書きするため実質的にはこの初期値は上書きされるが、defaultState 自体も
  // 現行フローと矛盾しない値にしておく。
  currentView: "start",
  activeSwitchModule: "color",
  switchStep: 0,
  hitCount: 0,
  hitTimes: [],
  matchingIndex: 0,
  letterIndex: 0,
  currentPhrase: "",
  currentCategory: "基本",
  operation: {
    mode: "item",
    itemIndex: 0,
    pointIndex: 0,
    pointPhase: "x",
    pointStartedAt: null,
    selectedX: null,
    selectedY: null,
    dragPhase: "start",
    trials: 0,
    successes: 0,
    distances: [],
  },
  settings: {
    scanInterval: 1600,
    autoScan: true,
    speechEnabled: true,
    soundEnabled: true,
    largeText: true,
    highContrast: false,
    // 視覚を必要とする課題（現在は crane）をロビーから隠す。
    hideVisualTasks: false,
    // 既定OFF。ONで操作訓練/効果測定/研究タブを表示する（P0-0, detailed-design.md §0.2）。
    researcherMode: false,
    // P0-2（ゲーム系設定、detailed-design.md §9.1）。judgmentWindowMs は判定窓の
    // 設定半幅（既定600・範囲200〜1500）、baselineOffsetMs はキャリブレーション由来の
    // 窓中心補正（既定0）。rhythmBpm/countInBeats/targetBeats は null のとき
    // content.js の rhythmPresets の値を使う（games/rhythm.js が優先順位を解決する。
    // P2-3 で実装）。
    judgmentWindowMs: 600,
    baselineOffsetMs: 0,
    rhythmBpm: null,
    countInBeats: null,
    targetBeats: null,
  },
  logs: [],
  evaluation: {
    participantId: "",
    condition: "web",
    isActive: false,
    sessionStartedAt: null,
    sessionEndedAt: null,
    activeTaskIndex: 0,
    taskStartedAt: null,
    taskInputs: 0,
    taskMistakes: 0,
    taskBacks: 0,
    taskTimingMissed: 0,
    taskTimingEarly: 0,
    taskTimingLate: 0,
    taskAssists: 0,
    taskDistances: [],
    effortRating: 3,
    easeRating: 3,
    engagementRating: 3,
    observerNotes: "",
    results: [],
    completedSessions: [],
  },
  research: {
    conditionProfile: "optimized",
    environment: "hospital",
    deploymentNotes: "",
    readiness: readinessItems.reduce((items, item) => ({ ...items, [item.id]: false }), {}),
  },
  // 旧v3データとの読み書き互換用。中立UIでは新規付与・表示を行わない。
  arcade: {
    medals: 0,
    history: [],
  },
  // 課題横断のセッション正本。taskType ごとに config/summary の形を分ける。
  sessions: [],
  // v3旧構造の切り戻し口。実データは上の sessions へ移送する。
  rhythm: {
    // v3 旧データの移送元としてキーを残す。新規保存は state.sessions を使う。
    sessions: [],
  },
};

/**
 * 全 taskType 合計の保持件数上限（detailed-design.md §9.1）。
 * セッションを追加する側（games/gameHost.js）も保存時にこの定数で
 * 古い順に破棄する想定。
 */
export const MAX_SESSIONS = 50;

/** 操作ログの保持件数上限。配列先頭が最新。 */
export const MAX_LOG_ENTRIES = 300;

/** 効果測定セッションの保持件数上限。配列先頭が最新。 */
export const MAX_EVALUATION_SESSIONS = 20;

const MAX_COUNTER_VALUE = 1_000_000_000;
const MAX_EVALUATION_DISTANCES = 1_000;
const MAX_BASELINE_OFFSET_MS = 5_000;
const MAX_TRIALS_PER_SESSION = 1_000;
const MAX_ARCADE_HISTORY = 100;
const TASK_TYPES = new Set(["sms", "gonogo", "scan", "rt"]);
const RHYTHM_GAME_IDS = new Set(["rhythm-l1", "rhythm-l2", "gonogo", "calibration"]);
const SCAN_GAME_IDS = new Set(["crane"]);
const RT_GAME_IDS = new Set(["fishing", "fishing-gonogo"]);
const RHYTHM_MODES = new Set(["cued", "continuous", "gonogo"]);
const RHYTHM_MODE_BY_GAME_ID = new Map([
  ["rhythm-l1", "cued"],
  ["rhythm-l2", "continuous"],
  ["gonogo", "gonogo"],
  ["calibration", "cued"],
]);
const RHYTHM_BEAT_KINDS = new Set(["go", "nogo"]);
const RHYTHM_JUDGMENTS = new Set([
  "hit",
  "miss",
  "extra",
  "commission",
  "correctRejection",
]);
const SWITCH_MODULE_IDS = new Set(switchModules.map((module) => module.id));
const PHRASE_CATEGORIES = new Set(Object.keys(phraseCategories));
const OPERATION_MODE_IDS = new Set(operationModes.map((mode) => mode.id));
const EVALUATION_CONDITIONS = new Set(
  researchConditionProfiles.map((profile) => profile.evaluationValue)
);
const RESEARCH_PROFILE_IDS = new Set(researchConditionProfiles.map((profile) => profile.id));
const RESEARCH_ENVIRONMENTS = new Set(Object.keys(environmentLabels));
const POINT_PHASES = new Set(["x", "y"]);
const DRAG_PHASES = new Set(["start", "end"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOr(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function enumOr(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function numberInRange(value, fallback, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(max, Math.max(min, value));
  return integer ? Math.trunc(bounded) : bounded;
}

function nullableNumberInRange(value, fallback, min, max, integer = false) {
  if (value === null) return null;
  return numberInRange(value, fallback, min, max, integer);
}

function isoStringOr(value, fallback = null) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value))
    ? value
    : fallback;
}

function sanitizeNumberArray(value, { min = -Infinity, max = Infinity, limit = 1_000 } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "number" && Number.isFinite(item))
    .map((item) => Math.min(max, Math.max(min, item)))
    .slice(-limit);
}

function sanitizeLogEntry(entry) {
  if (!isRecord(entry)) return null;
  const sanitized = {
    // 不正日時は空欄で保持する。formatTime() は空欄を "--:--:--" として描画する。
    time: isoStringOr(entry.time, ""),
    view:
      visibleViews.has(entry.view) || entry.view === "legacy-v1" || entry.view === "system"
        ? entry.view
        : "system",
    type: stringOr(entry.type, "legacy"),
    label: stringOr(entry.label),
  };
  if (typeof entry.correct === "boolean") sanitized.correct = entry.correct;
  if (typeof entry.success === "boolean") sanitized.success = entry.success;
  if (typeof entry.skipEvaluation === "boolean") sanitized.skipEvaluation = entry.skipEvaluation;
  if (typeof entry.distance === "number" && Number.isFinite(entry.distance)) {
    sanitized.distance = Math.max(0, entry.distance);
  }
  return sanitized;
}

function sanitizeEvaluationResult(result) {
  if (!isRecord(result)) return null;
  const fallback = defaultState.evaluation;
  return {
    participantId: stringOr(result.participantId),
    condition: enumOr(result.condition, EVALUATION_CONDITIONS, fallback.condition),
    taskId: stringOr(result.taskId, "unknown"),
    taskTitle: stringOr(result.taskTitle, "不明なタスク"),
    success: booleanOr(result.success, false),
    startedAt: isoStringOr(result.startedAt, ""),
    endedAt: isoStringOr(result.endedAt, ""),
    durationSeconds: numberInRange(result.durationSeconds, 0, 0, MAX_COUNTER_VALUE),
    inputs: numberInRange(result.inputs, 0, 0, MAX_COUNTER_VALUE, true),
    mistakes: numberInRange(result.mistakes, 0, 0, MAX_COUNTER_VALUE, true),
    backs: numberInRange(result.backs, 0, 0, MAX_COUNTER_VALUE, true),
    timingMissed: numberInRange(result.timingMissed, 0, 0, MAX_COUNTER_VALUE, true),
    timingEarly: numberInRange(result.timingEarly, 0, 0, MAX_COUNTER_VALUE, true),
    timingLate: numberInRange(result.timingLate, 0, 0, MAX_COUNTER_VALUE, true),
    timingErrors: numberInRange(result.timingErrors, 0, 0, MAX_COUNTER_VALUE, true),
    assists: numberInRange(result.assists, 0, 0, MAX_COUNTER_VALUE, true),
    scanIntervalMs: numberInRange(result.scanIntervalMs, defaultState.settings.scanInterval, 800, 3200, true),
    inputsPerMinute: numberInRange(result.inputsPerMinute, 0, 0, MAX_COUNTER_VALUE),
    averageTargetDistance:
      result.averageTargetDistance === ""
        ? ""
        : numberInRange(result.averageTargetDistance, "", 0, MAX_COUNTER_VALUE),
    selectionErrorRate: numberInRange(result.selectionErrorRate, 0, 0, MAX_COUNTER_VALUE),
    totalScanningErrorRate: numberInRange(
      result.totalScanningErrorRate,
      0,
      0,
      MAX_COUNTER_VALUE
    ),
    effortRating: numberInRange(result.effortRating, fallback.effortRating, 1, 5, true),
    easeRating: numberInRange(result.easeRating, fallback.easeRating, 1, 5, true),
    engagementRating: numberInRange(
      result.engagementRating,
      fallback.engagementRating,
      1,
      5,
      true
    ),
    observerNotes: stringOr(result.observerNotes),
  };
}

function sanitizeCompletedSession(session) {
  if (!isRecord(session)) return null;
  const fallback = defaultState.evaluation;
  return {
    participantId: stringOr(session.participantId),
    condition: enumOr(session.condition, EVALUATION_CONDITIONS, fallback.condition),
    startedAt: isoStringOr(session.startedAt, ""),
    endedAt: isoStringOr(session.endedAt, ""),
    effortRating: numberInRange(session.effortRating, fallback.effortRating, 1, 5, true),
    easeRating: numberInRange(session.easeRating, fallback.easeRating, 1, 5, true),
    engagementRating: numberInRange(
      session.engagementRating,
      fallback.engagementRating,
      1,
      5,
      true
    ),
    observerNotes: stringOr(session.observerNotes),
    taskResults: Array.isArray(session.taskResults)
      ? session.taskResults.map(sanitizeEvaluationResult).filter(Boolean).slice(-100)
      : [],
  };
}

function sanitizeRhythmTrial(trial, rowIndex) {
  if (!isRecord(trial)) return null;
  // 判定値が壊れた行を miss 等へ読み替えると研究結果そのものを捏造するため、
  // 必須列や判断値別の組合せが不正な試行は捨てる。
  if (!RHYTHM_JUDGMENTS.has(trial.judgment)) return null;
  if (typeof trial.excluded !== "boolean") return null;
  if (
    typeof trial.appliedBaselineMs !== "number" ||
    !Number.isFinite(trial.appliedBaselineMs) ||
    Math.abs(trial.appliedBaselineMs) > MAX_BASELINE_OFFSET_MS
  ) return null;

  const hasBeatIndex =
    Number.isInteger(trial.beatIndex) &&
    trial.beatIndex >= 0 &&
    trial.beatIndex <= MAX_COUNTER_VALUE;
  const hasScheduledMs =
    typeof trial.scheduledMs === "number" &&
    Number.isFinite(trial.scheduledMs) &&
    trial.scheduledMs >= 0 &&
    trial.scheduledMs <= MAX_COUNTER_VALUE;
  const hasInputMs =
    typeof trial.inputMs === "number" &&
    Number.isFinite(trial.inputMs) &&
    trial.inputMs >= 0 &&
    trial.inputMs <= MAX_COUNTER_VALUE;
  const hasRawOffsetMs =
    typeof trial.rawOffsetMs === "number" &&
    Number.isFinite(trial.rawOffsetMs) &&
    Math.abs(trial.rawOffsetMs) <= MAX_COUNTER_VALUE;

  if (trial.judgment === "extra") {
    // 窓外入力はどのビートにも帰属せず、入力時刻だけを持つ。
    if (
      trial.beatIndex !== null ||
      trial.beatKind !== null ||
      trial.scheduledMs !== null ||
      !hasInputMs ||
      trial.rawOffsetMs !== null
    ) return null;
  } else {
    if (!hasBeatIndex || !hasScheduledMs) return null;
    const expectedBeatKind =
      trial.judgment === "hit" || trial.judgment === "miss" ? "go" : "nogo";
    if (trial.beatKind !== expectedBeatKind) return null;

    const judgmentHasInput = trial.judgment === "hit" || trial.judgment === "commission";
    if (judgmentHasInput) {
      if (!hasInputMs || !hasRawOffsetMs) return null;
    } else if (trial.inputMs !== null || trial.rawOffsetMs !== null) {
      // miss / correctRejection は入力が発生していない確定行。
      return null;
    }
  }

  return {
    index: numberInRange(trial.index, rowIndex, 0, MAX_COUNTER_VALUE, true),
    beatIndex: trial.beatIndex,
    beatKind: trial.beatKind,
    scheduledMs: trial.scheduledMs,
    inputMs: trial.inputMs,
    rawOffsetMs: trial.rawOffsetMs,
    appliedBaselineMs: trial.appliedBaselineMs,
    judgment: trial.judgment,
    excluded: trial.excluded,
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values, mean = average(values)) {
  if (values.length < 2 || mean === null) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  );
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * sanitized trials からリズム集計を再計算する。
 * games/rhythm.js の computeSummary() と同じ規則を保存復元時にも適用し、
 * 破損trialを除外した後のCSV行とsummaryが矛盾しないようにする。
 */
export function summarizeRhythmTrials(trials) {
  const included = trials.filter((trial) => !trial.excluded);
  const hits = included.filter((trial) => trial.judgment === "hit");
  const misses = included.filter((trial) => trial.judgment === "miss").length;
  const extras = included.filter((trial) => trial.judgment === "extra").length;
  const commissions = included.filter((trial) => trial.judgment === "commission").length;
  const correctRejections = included.filter(
    (trial) => trial.judgment === "correctRejection"
  ).length;
  const goCount = included.filter((trial) => trial.beatKind === "go").length;
  const nogoCount = included.filter((trial) => trial.beatKind === "nogo").length;
  const rawOffsets = hits
    .map((trial) => trial.rawOffsetMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const meanRawOffsetMs = rawOffsets.length
    ? rawOffsets.reduce((sum, value) => sum + value, 0) / rawOffsets.length
    : null;
  const sdRawOffsetMs =
    rawOffsets.length >= 2 && meanRawOffsetMs !== null
      ? Math.sqrt(
          rawOffsets.reduce((sum, value) => sum + (value - meanRawOffsetMs) ** 2, 0) /
            (rawOffsets.length - 1)
        )
      : null;
  const sortedOffsets = [...rawOffsets].sort((a, b) => a - b);
  const middle = Math.floor(sortedOffsets.length / 2);
  const medianRawOffsetMs = sortedOffsets.length
    ? sortedOffsets.length % 2
      ? sortedOffsets[middle]
      : (sortedOffsets[middle - 1] + sortedOffsets[middle]) / 2
    : null;

  return {
    hits: hits.length,
    misses,
    extras,
    commissions,
    correctRejections,
    goHitRate: goCount ? hits.length / goCount : 0,
    commissionRate: nogoCount ? commissions / nogoCount : 0,
    meanRawOffsetMs,
    sdRawOffsetMs,
    medianRawOffsetMs,
  };
}

/** 正常完了セッションに必要な、1ビート1行の計画整合性を確認する。 */
function hasCompleteRhythmPlan(trials, config) {
  const primaryTrials = trials.filter((trial) => trial.judgment !== "extra");
  if (primaryTrials.length !== config.targetBeats) return false;

  const seenBeatIndexes = new Set();
  for (const trial of primaryTrials) {
    if (trial.beatIndex >= config.targetBeats || seenBeatIndexes.has(trial.beatIndex)) {
      return false;
    }
    seenBeatIndexes.add(trial.beatIndex);

    if (config.mode === "gonogo") {
      if (config.seedSequence[trial.beatIndex] !== trial.beatKind) return false;
    } else if (trial.beatKind !== "go") {
      return false;
    }
  }
  return seenBeatIndexes.size === config.targetBeats;
}

function sanitizeRhythmSession(session, taskType) {
  if (!isRecord(session)) return null;
  const config = isRecord(session.config) ? session.config : {};
  const device = isRecord(session.device) ? session.device : {};
  const sanitizedConfig = {
    mode: enumOr(config.mode, RHYTHM_MODES, "cued"),
    bpm: numberInRange(config.bpm, 40, 20, 240, true),
    countInBeats: numberInRange(config.countInBeats, 3, 1, 16, true),
    targetBeats: numberInRange(config.targetBeats, 10, 1, 200, true),
    judgmentWindowMs: numberInRange(config.judgmentWindowMs, 600, 200, 1500, true),
    effectiveWindowMs: numberInRange(config.effectiveWindowMs, 600, 1, 1500),
    baselineOffsetMs: numberInRange(
      config.baselineOffsetMs,
      0,
      -MAX_BASELINE_OFFSET_MS,
      MAX_BASELINE_OFFSET_MS
    ),
    goRatio: nullableNumberInRange(config.goRatio, null, 0, 1),
    seedSequence: Array.isArray(config.seedSequence)
      ? config.seedSequence
          .filter((kind) => RHYTHM_BEAT_KINDS.has(kind))
          .slice(0, 200)
      : [],
  };
  const rawTrials = Array.isArray(session.trials) ? session.trials : null;
  const sanitizedTrialSlots =
    rawTrials?.map((trial, index) => sanitizeRhythmTrial(trial, index)) || [];
  const allTrialsRetained =
    rawTrials !== null &&
    rawTrials.length <= MAX_TRIALS_PER_SESSION &&
    sanitizedTrialSlots.every(Boolean);
  const trials = sanitizedTrialSlots.filter(Boolean).slice(0, MAX_TRIALS_PER_SESSION);

  const planConfigIsValid =
    RHYTHM_GAME_IDS.has(session.gameId) &&
    taskType === (session.gameId === "gonogo" ? "gonogo" : "sms") &&
    RHYTHM_MODE_BY_GAME_ID.get(session.gameId) === config.mode &&
    Number.isInteger(config.targetBeats) &&
    config.targetBeats >= 1 &&
    config.targetBeats <= 200 &&
    (config.mode !== "gonogo" ||
      (Array.isArray(config.seedSequence) &&
        config.seedSequence.length === config.targetBeats &&
        config.seedSequence.every((kind) => RHYTHM_BEAT_KINDS.has(kind))));
  // 実ゲームは正常終了時に finished:true / aborted:false を同時保存する。
  // それ以外（リロード・クラッシュ中の途中snapshotを含む）は再開不能なので、
  // 復元時に中断セッションへ倒し、正常完了データとしてCSVへ混入させない。
  // trialが1件でも除外/切詰めされた場合や、primary beat計画が不完全な場合も
  // 完了扱いにはしない（欠落した研究データを静かに正常群へ混ぜない）。
  const completedNormally =
    session.finished === true &&
    session.aborted === false &&
    allTrialsRetained &&
    planConfigIsValid &&
    hasCompleteRhythmPlan(trials, sanitizedConfig);
  return {
    sessionId: stringOr(session.sessionId, "unknown"),
    taskType,
    gameId: enumOr(session.gameId, RHYTHM_GAME_IDS, "rhythm-l1"),
    participantId: stringOr(session.participantId),
    startedAtIso: isoStringOr(session.startedAtIso, ""),
    aborted: !completedNormally,
    finished: completedNormally,
    config: sanitizedConfig,
    device: {
      outputLatencyS: nullableNumberInRange(device.outputLatencyS, null, 0, 60),
      baseLatencyS: nullableNumberInRange(device.baseLatencyS, null, 0, 60),
      userAgent: stringOr(device.userAgent),
    },
    trials,
    // 保存済みsummaryは派生値。破損・改変されていても採用せずtrialを正本にする。
    summary: summarizeRhythmTrials(trials),
  };
}

function sanitizeDevice(device) {
  const value = isRecord(device) ? device : {};
  return {
    outputLatencyS: nullableNumberInRange(value.outputLatencyS, null, 0, 60),
    baseLatencyS: nullableNumberInRange(value.baseLatencyS, null, 0, 60),
    userAgent: stringOr(value.userAgent),
  };
}

function sanitizeScanTrial(trial, rowIndex) {
  if (!isRecord(trial)) return null;
  const judgment = enumOr(trial.judgment, new Set(["grip", "slip", "miss"]), null);
  if (!judgment) return null;
  const numericKeys = [
    "targetX",
    "targetY",
    "toleranceR",
    "selectedX",
    "selectedY",
    "xPhaseMs",
    "yPhaseMs",
  ];
  if (numericKeys.some((key) => typeof trial[key] !== "number" || !Number.isFinite(trial[key]))) {
    return null;
  }
  if (
    trial.targetX < 0 ||
    trial.targetX > 100 ||
    trial.targetY < 0 ||
    trial.targetY > 100 ||
    trial.selectedX < 0 ||
    trial.selectedX > 100 ||
    trial.selectedY < 0 ||
    trial.selectedY > 100 ||
    trial.toleranceR <= 0 ||
    trial.toleranceR > 100 ||
    trial.xPhaseMs < 0 ||
    trial.yPhaseMs < 0
  ) return null;

  const dx = trial.selectedX - trial.targetX;
  const dy = trial.selectedY - trial.targetY;
  const distance = Math.hypot(dx, dy);
  if (graspOutcome(distance, trial.toleranceR) !== judgment) return null;

  return {
    index: numberInRange(trial.index, rowIndex, 0, MAX_COUNTER_VALUE, true),
    targetX: trial.targetX,
    targetY: trial.targetY,
    toleranceR: trial.toleranceR,
    selectedX: trial.selectedX,
    selectedY: trial.selectedY,
    dx,
    dy,
    distance,
    xPhaseMs: trial.xPhaseMs,
    yPhaseMs: trial.yPhaseMs,
    judgment,
  };
}

function summarizeScanTrials(trials) {
  const distances = trials.map((trial) => trial.distance);
  const xPhases = trials.map((trial) => trial.xPhaseMs);
  const yPhases = trials.map((trial) => trial.yPhaseMs);
  const grips = trials.filter((trial) => trial.judgment === "grip").length;
  const slips = trials.filter((trial) => trial.judgment === "slip").length;
  const misses = trials.filter((trial) => trial.judgment === "miss").length;
  const meanDistance = average(distances);
  return {
    trials: trials.length,
    grips,
    slips,
    misses,
    gripRate: trials.length ? grips / trials.length : 0,
    meanDistance,
    sdDistance: standardDeviation(distances, meanDistance),
    medianDistance: median(distances),
    meanXPhaseMs: average(xPhases),
    meanYPhaseMs: average(yPhases),
  };
}

function sanitizeScanSession(session) {
  if (!isRecord(session) || !SCAN_GAME_IDS.has(session.gameId)) return null;
  const config = isRecord(session.config) ? session.config : {};
  const sanitizedConfig = {
    sweepMs: numberInRange(config.sweepMs, 2400, 400, 10_000, true),
    toleranceR: numberInRange(config.toleranceR, 12, 1, 50),
    targetTrials: numberInRange(config.targetTrials, 5, 1, 100, true),
    graspAnimMs: numberInRange(config.graspAnimMs, 1200, 100, 10_000, true),
    targetSequence: Array.isArray(config.targetSequence)
      ? config.targetSequence
          .filter(
            (target) =>
              isRecord(target) &&
              typeof target.x === "number" &&
              Number.isFinite(target.x) &&
              target.x >= 0 &&
              target.x <= 100 &&
              typeof target.y === "number" &&
              Number.isFinite(target.y) &&
              target.y >= 0 &&
              target.y <= 100
          )
          .map((target) => ({ x: target.x, y: target.y }))
          .slice(0, 100)
      : [],
  };
  const rawTrials = Array.isArray(session.trials) ? session.trials : null;
  const slots = rawTrials?.map((trial, index) => sanitizeScanTrial(trial, index)) || [];
  const trials = slots.filter(Boolean).slice(0, MAX_TRIALS_PER_SESSION);
  const completedNormally =
    session.finished === true &&
    session.aborted === false &&
    rawTrials !== null &&
    rawTrials.length <= MAX_TRIALS_PER_SESSION &&
    slots.every(Boolean) &&
    trials.length === sanitizedConfig.targetTrials;
  return {
    sessionId: stringOr(session.sessionId, "unknown"),
    taskType: "scan",
    gameId: session.gameId,
    participantId: stringOr(session.participantId),
    startedAtIso: isoStringOr(session.startedAtIso, ""),
    aborted: !completedNormally,
    finished: completedNormally,
    config: sanitizedConfig,
    device: sanitizeDevice(session.device),
    trials,
    summary: summarizeScanTrials(trials),
  };
}

function sanitizeReactionTrial(trial, rowIndex) {
  if (!isRecord(trial)) return null;
  const kind = enumOr(trial.kind, new Set(["real", "fake"]), null);
  const judgment = enumOr(
    trial.judgment,
    new Set(["hit", "timeout", "falseStart", "commission", "correctRejection"]),
    null
  );
  if (!kind || !judgment || typeof trial.excluded !== "boolean") return null;
  if (
    typeof trial.foreperiodMs !== "number" ||
    !Number.isFinite(trial.foreperiodMs) ||
    trial.foreperiodMs < 0 ||
    typeof trial.cueMs !== "number" ||
    !Number.isFinite(trial.cueMs) ||
    trial.cueMs < 0
  ) return null;
  const inputMs =
    typeof trial.inputMs === "number" && Number.isFinite(trial.inputMs) && trial.inputMs >= 0
      ? trial.inputMs
      : null;
  const inferredLimitMs =
    typeof trial.limitMs === "number" && Number.isFinite(trial.limitMs) && trial.limitMs >= 0
      ? trial.limitMs
      : Number.MAX_SAFE_INTEGER;
  if (judgeReaction(inputMs, trial.cueMs, inferredLimitMs, kind) !== judgment) return null;
  const reactionTimeMs = judgment === "hit" ? inputMs - trial.cueMs : null;
  return {
    index: numberInRange(trial.index, rowIndex, 0, MAX_COUNTER_VALUE, true),
    kind,
    foreperiodMs: trial.foreperiodMs,
    cueMs: trial.cueMs,
    inputMs,
    reactionTimeMs,
    judgment,
    excluded: trial.excluded,
  };
}

function summarizeReactionTrials(trials) {
  const included = trials.filter((trial) => !trial.excluded);
  const hits = included.filter((trial) => trial.judgment === "hit");
  const timeouts = included.filter((trial) => trial.judgment === "timeout").length;
  const falseStarts = included.filter((trial) => trial.judgment === "falseStart").length;
  const commissions = included.filter((trial) => trial.judgment === "commission").length;
  const correctRejections = included.filter(
    (trial) => trial.judgment === "correctRejection"
  ).length;
  const realCount = included.filter((trial) => trial.kind === "real").length;
  const fakeCount = included.filter((trial) => trial.kind === "fake").length;
  const reactionTimes = hits.map((trial) => trial.reactionTimeMs);
  const meanRtMs = average(reactionTimes);
  return {
    trials: included.length,
    hits: hits.length,
    timeouts,
    falseStarts,
    commissions,
    correctRejections,
    hitRate: realCount ? hits.length / realCount : 0,
    commissionRate: fakeCount ? commissions / fakeCount : 0,
    falseStartRate: included.length ? falseStarts / included.length : 0,
    meanRtMs,
    sdRtMs: standardDeviation(reactionTimes, meanRtMs),
    medianRtMs: median(reactionTimes),
  };
}

function sanitizeReactionSession(session) {
  if (!isRecord(session) || !RT_GAME_IDS.has(session.gameId)) return null;
  const config = isRecord(session.config) ? session.config : {};
  const targetTrials = numberInRange(config.targetTrials, 8, 1, 200, true);
  const limitMs = numberInRange(config.limitMs, 2000, 100, 10_000, true);
  const sanitizedConfig = {
    foreperiodMinMs: numberInRange(config.foreperiodMinMs, 1500, 100, 60_000, true),
    foreperiodMaxMs: numberInRange(config.foreperiodMaxMs, 5000, 100, 60_000, true),
    limitMs,
    targetTrials,
    fakeRatio: numberInRange(config.fakeRatio, 0.25, 0, 1),
    seedSequence: Array.isArray(config.seedSequence)
      ? config.seedSequence
          .filter((value) => typeof value === "number" && Number.isFinite(value))
          .map((value) => numberInRange(value, 1500, 0, 60_000, true))
          .slice(0, 200)
      : [],
    kindSequence: Array.isArray(config.kindSequence)
      ? config.kindSequence.filter((kind) => kind === "real" || kind === "fake").slice(0, 200)
      : [],
  };
  const rawTrials = Array.isArray(session.trials) ? session.trials : null;
  const withLimit =
    rawTrials?.map((trial) => (isRecord(trial) ? { ...trial, limitMs } : trial)) || [];
  const slots = withLimit.map((trial, index) => sanitizeReactionTrial(trial, index));
  const trials = slots.filter(Boolean).slice(0, MAX_TRIALS_PER_SESSION);
  const completedNormally =
    session.finished === true &&
    session.aborted === false &&
    rawTrials !== null &&
    rawTrials.length <= MAX_TRIALS_PER_SESSION &&
    slots.every(Boolean) &&
    trials.length === targetTrials;
  return {
    sessionId: stringOr(session.sessionId, "unknown"),
    taskType: "rt",
    gameId: session.gameId,
    participantId: stringOr(session.participantId),
    startedAtIso: isoStringOr(session.startedAtIso, ""),
    aborted: !completedNormally,
    finished: completedNormally,
    config: sanitizedConfig,
    device: sanitizeDevice(session.device),
    trials,
    summary: summarizeReactionTrials(trials),
  };
}

function inferredTaskType(session) {
  if (TASK_TYPES.has(session?.taskType)) return session.taskType;
  if (session?.gameId === "gonogo") return "gonogo";
  if (RHYTHM_GAME_IDS.has(session?.gameId)) return "sms";
  if (SCAN_GAME_IDS.has(session?.gameId)) return "scan";
  if (RT_GAME_IDS.has(session?.gameId)) return "rt";
  return null;
}

function sanitizeSession(session) {
  const taskType = inferredTaskType(session);
  if (taskType === "sms" || taskType === "gonogo") {
    return sanitizeRhythmSession(session, taskType);
  }
  if (taskType === "scan") return sanitizeScanSession(session);
  if (taskType === "rt") return sanitizeReactionSession(session);
  return null;
}

function sanitizeSessions(currentSessions, legacyRhythmSessions) {
  const candidates = [
    ...(Array.isArray(currentSessions) ? currentSessions : []),
    ...(Array.isArray(legacyRhythmSessions) ? legacyRhythmSessions : []),
  ];
  const seen = new Set();
  return candidates
    .map(sanitizeSession)
    .filter((session) => {
      if (!session || seen.has(session.sessionId)) return false;
      seen.add(session.sessionId);
      return true;
    })
    .slice(-MAX_SESSIONS);
}

/** defaultState の深いコピーを返す。 */
export function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

/**
 * JSONから復元した値を、現在のstateスキーマへ防御的に正規化する。
 *
 * 欠落キーを補うだけでなく、画面分岐に使う列挙値、タイマー/配列添字に使う
 * 数値範囲、描画時に配列として扱う入れ子を検証する。未知のキーは保存状態へ
 * 持ち込まず、壊れた1項目だけを既定値へ戻すことで他の有効データは維持する。
 */
export function sanitizeState(candidate) {
  const fallback = cloneDefaultState();
  if (!isRecord(candidate)) return fallback;

  const settings = isRecord(candidate.settings) ? candidate.settings : {};
  const operation = isRecord(candidate.operation) ? candidate.operation : {};
  const evaluation = isRecord(candidate.evaluation) ? candidate.evaluation : {};
  const research = isRecord(candidate.research) ? candidate.research : {};
  const readiness = isRecord(research.readiness) ? research.readiness : {};
  const arcade = isRecord(candidate.arcade) ? candidate.arcade : {};
  const rhythm = isRecord(candidate.rhythm) ? candidate.rhythm : {};

  const operationTrials = numberInRange(
    operation.trials,
    fallback.operation.trials,
    0,
    MAX_COUNTER_VALUE,
    true
  );
  const sessionStartedAt = isoStringOr(evaluation.sessionStartedAt, null);
  const isActive =
    booleanOr(evaluation.isActive, fallback.evaluation.isActive) && Boolean(sessionStartedAt);

  return {
    currentView: enumOr(candidate.currentView, visibleViews, fallback.currentView),
    activeSwitchModule: enumOr(
      candidate.activeSwitchModule,
      SWITCH_MODULE_IDS,
      fallback.activeSwitchModule
    ),
    switchStep: numberInRange(
      candidate.switchStep,
      fallback.switchStep,
      0,
      MAX_COUNTER_VALUE,
      true
    ),
    hitCount: numberInRange(candidate.hitCount, fallback.hitCount, 0, MAX_COUNTER_VALUE, true),
    hitTimes: sanitizeNumberArray(candidate.hitTimes, {
      min: 0,
      max: MAX_COUNTER_VALUE,
      limit: 1_000,
    }),
    matchingIndex: numberInRange(
      candidate.matchingIndex,
      fallback.matchingIndex,
      0,
      Math.max(0, matchingTasks.length - 1),
      true
    ),
    letterIndex: numberInRange(
      candidate.letterIndex,
      fallback.letterIndex,
      0,
      Math.max(0, letterTasks.length - 1),
      true
    ),
    currentPhrase: stringOr(candidate.currentPhrase, fallback.currentPhrase),
    currentCategory: enumOr(
      candidate.currentCategory,
      PHRASE_CATEGORIES,
      fallback.currentCategory
    ),
    operation: {
      mode: enumOr(operation.mode, OPERATION_MODE_IDS, fallback.operation.mode),
      itemIndex: numberInRange(
        operation.itemIndex,
        fallback.operation.itemIndex,
        0,
        Math.max(0, operationItemTasks.length - 1),
        true
      ),
      pointIndex: numberInRange(
        operation.pointIndex,
        fallback.operation.pointIndex,
        0,
        Math.max(0, operationPointTargets.length - 1),
        true
      ),
      pointPhase: enumOr(operation.pointPhase, POINT_PHASES, fallback.operation.pointPhase),
      pointStartedAt: nullableNumberInRange(
        operation.pointStartedAt,
        null,
        0,
        MAX_COUNTER_VALUE * 10_000,
        true
      ),
      selectedX: nullableNumberInRange(operation.selectedX, null, 0, 100),
      selectedY: nullableNumberInRange(operation.selectedY, null, 0, 100),
      dragPhase: enumOr(operation.dragPhase, DRAG_PHASES, fallback.operation.dragPhase),
      trials: operationTrials,
      successes: Math.min(
        operationTrials,
        numberInRange(
          operation.successes,
          fallback.operation.successes,
          0,
          MAX_COUNTER_VALUE,
          true
        )
      ),
      distances: sanitizeNumberArray(operation.distances, {
        min: 0,
        max: MAX_COUNTER_VALUE,
        limit: 40,
      }),
    },
    settings: {
      scanInterval: numberInRange(
        settings.scanInterval,
        fallback.settings.scanInterval,
        800,
        3200,
        true
      ),
      autoScan: booleanOr(settings.autoScan, fallback.settings.autoScan),
      speechEnabled: booleanOr(settings.speechEnabled, fallback.settings.speechEnabled),
      soundEnabled: booleanOr(settings.soundEnabled, fallback.settings.soundEnabled),
      largeText: booleanOr(settings.largeText, fallback.settings.largeText),
      highContrast: booleanOr(settings.highContrast, fallback.settings.highContrast),
      hideVisualTasks: booleanOr(
        settings.hideVisualTasks,
        fallback.settings.hideVisualTasks
      ),
      researcherMode: booleanOr(settings.researcherMode, fallback.settings.researcherMode),
      judgmentWindowMs: numberInRange(
        settings.judgmentWindowMs,
        fallback.settings.judgmentWindowMs,
        200,
        1500,
        true
      ),
      baselineOffsetMs: numberInRange(
        settings.baselineOffsetMs,
        fallback.settings.baselineOffsetMs,
        -MAX_BASELINE_OFFSET_MS,
        MAX_BASELINE_OFFSET_MS,
        true
      ),
      rhythmBpm: nullableNumberInRange(settings.rhythmBpm, null, 20, 240, true),
      countInBeats: nullableNumberInRange(settings.countInBeats, null, 1, 16, true),
      targetBeats: nullableNumberInRange(settings.targetBeats, null, 1, 200, true),
    },
    logs: Array.isArray(candidate.logs)
      ? candidate.logs.map(sanitizeLogEntry).filter(Boolean).slice(0, MAX_LOG_ENTRIES)
      : [],
    evaluation: {
      participantId: stringOr(evaluation.participantId, fallback.evaluation.participantId),
      condition: enumOr(
        evaluation.condition,
        EVALUATION_CONDITIONS,
        fallback.evaluation.condition
      ),
      isActive,
      // 終了後も直前セッションの開始・終了時刻は履歴表示/CSVの補助値として保持する。
      sessionStartedAt,
      sessionEndedAt: isoStringOr(evaluation.sessionEndedAt, null),
      activeTaskIndex: numberInRange(
        evaluation.activeTaskIndex,
        fallback.evaluation.activeTaskIndex,
        0,
        evaluationTasks.length,
        true
      ),
      taskStartedAt: isActive ? isoStringOr(evaluation.taskStartedAt, null) : null,
      taskInputs: numberInRange(
        evaluation.taskInputs,
        fallback.evaluation.taskInputs,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskMistakes: numberInRange(
        evaluation.taskMistakes,
        fallback.evaluation.taskMistakes,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskBacks: numberInRange(
        evaluation.taskBacks,
        fallback.evaluation.taskBacks,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskTimingMissed: numberInRange(
        evaluation.taskTimingMissed,
        fallback.evaluation.taskTimingMissed,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskTimingEarly: numberInRange(
        evaluation.taskTimingEarly,
        fallback.evaluation.taskTimingEarly,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskTimingLate: numberInRange(
        evaluation.taskTimingLate,
        fallback.evaluation.taskTimingLate,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskAssists: numberInRange(
        evaluation.taskAssists,
        fallback.evaluation.taskAssists,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      taskDistances: sanitizeNumberArray(evaluation.taskDistances, {
        min: 0,
        max: MAX_COUNTER_VALUE,
        limit: MAX_EVALUATION_DISTANCES,
      }),
      effortRating: numberInRange(
        evaluation.effortRating,
        fallback.evaluation.effortRating,
        1,
        5,
        true
      ),
      easeRating: numberInRange(
        evaluation.easeRating,
        fallback.evaluation.easeRating,
        1,
        5,
        true
      ),
      engagementRating: numberInRange(
        evaluation.engagementRating,
        fallback.evaluation.engagementRating,
        1,
        5,
        true
      ),
      observerNotes: stringOr(evaluation.observerNotes, fallback.evaluation.observerNotes),
      results: Array.isArray(evaluation.results)
        ? evaluation.results.map(sanitizeEvaluationResult).filter(Boolean).slice(-100)
        : [],
      completedSessions: Array.isArray(evaluation.completedSessions)
        ? evaluation.completedSessions
            .map(sanitizeCompletedSession)
            .filter(Boolean)
            .slice(0, MAX_EVALUATION_SESSIONS)
        : [],
    },
    research: {
      conditionProfile: enumOr(
        research.conditionProfile,
        RESEARCH_PROFILE_IDS,
        fallback.research.conditionProfile
      ),
      environment: enumOr(
        research.environment,
        RESEARCH_ENVIRONMENTS,
        fallback.research.environment
      ),
      deploymentNotes: stringOr(research.deploymentNotes, fallback.research.deploymentNotes),
      readiness: readinessItems.reduce((items, item) => {
        items[item.id] = booleanOr(readiness[item.id], fallback.research.readiness[item.id]);
        return items;
      }, {}),
    },
    arcade: {
      medals: numberInRange(
        arcade.medals,
        fallback.arcade.medals,
        0,
        MAX_COUNTER_VALUE,
        true
      ),
      history: Array.isArray(arcade.history)
        ? arcade.history
            .filter((entry) => isRecord(entry))
            .map((entry) => ({
              at: isoStringOr(entry.at, ""),
              gameId: stringOr(entry.gameId),
              medalsAdded: numberInRange(entry.medalsAdded, 0, 0, MAX_COUNTER_VALUE, true),
            }))
            .slice(-MAX_ARCADE_HISTORY)
        : [],
    },
    sessions: sanitizeSessions(candidate.sessions, rhythm.sessions),
    rhythm: {
      // 旧v3データは上の sessions へ移送済み。キー自体は切り戻し用に残す。
      sessions: [],
    },
  };
}

/** localStorage の生値を読み、JSON として壊れていれば null を返す。 */
function readLegacyState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 旧 settings から、現行 defaultState.settings に「同名キーのみ」を写す。
 * v1 の inputLockMs / buttonScale のように v3 に対応先がないキーは無視する
 * （detailed-design.md §9.5 手順3）。
 */
function migrateSettingsKeys(sourceSettings) {
  if (!isRecord(sourceSettings)) return {};
  const migrated = {};
  Object.keys(defaultState.settings).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sourceSettings, key)) {
      migrated[key] = sourceSettings[key];
    }
  });
  return migrated;
}

/**
 * v1（App.svelte モノリス版）のログ1件を v3 のログ形状へ写す。
 * v1 は時刻キーが `at`（v3 は `time`）で、`view` を持たないなど形が異なるため、
 * そのまま複製すると views/log.js の formatTime(entry.time) 等が
 * undefined を渡されて壊れる。ここで安全な形へ正規化する。
 */
function migrateLegacyLogEntryV1(entry) {
  return {
    time: typeof entry?.at === "string" ? entry.at : new Date().toISOString(),
    view: "legacy-v1",
    type: typeof entry?.type === "string" ? entry.type : "legacy",
    label: typeof entry?.label === "string" ? entry.label : "",
    success: entry?.success,
  };
}

/**
 * v3 が空のときに、v2 → v1 の順で旧保存を読み、移行できる範囲を v3 へ写す
 * （detailed-design.md §9.5）。移行できるのは settings（同名キーのみ）・logs・
 * evaluation（v2 のみ保有、participantId・completedSessions 等）まで。
 * v1 の metrics 構造は v3 に対応先がないため移行しない。移行元・移行範囲は
 * logs の先頭に記録する（旧キー自体は削除しない）。
 * @returns {object|null} 移行後の state。移行元が1つも無ければ null。
 */
function migrateLegacyState() {
  const v2 = readLegacyState(legacyStorageKeyV2);
  if (v2) {
    const migrated = cloneDefaultState();
    migrated.settings = { ...migrated.settings, ...migrateSettingsKeys(v2.settings) };
    migrated.logs = Array.isArray(v2.logs) ? v2.logs.slice(0, MAX_LOG_ENTRIES - 1) : [];
    if (isRecord(v2.evaluation)) {
      migrated.evaluation = {
        ...migrated.evaluation,
        ...v2.evaluation,
        results: Array.isArray(v2.evaluation.results) ? v2.evaluation.results : [],
        completedSessions: Array.isArray(v2.evaluation.completedSessions)
          ? v2.evaluation.completedSessions
          : [],
      };
    }
    migrated.logs.unshift({
      time: new Date().toISOString(),
      view: "system",
      type: "migration",
      label: `旧保存(${legacyStorageKeyV2})から移行しました（settings/logs/evaluationのみ）。`,
      success: true,
    });
    return sanitizeState(migrated);
  }

  const v1 = readLegacyState(legacyStorageKeyV1);
  if (v1) {
    const migrated = cloneDefaultState();
    migrated.settings = { ...migrated.settings, ...migrateSettingsKeys(v1.settings) };
    migrated.logs = Array.isArray(v1.logs)
      ? v1.logs.slice(0, MAX_LOG_ENTRIES - 1).map(migrateLegacyLogEntryV1)
      : [];
    // v1 から移行・metrics は引き継ぎ対象外（v3 に対応するスキーマがないため）。
    migrated.logs.unshift({
      time: new Date().toISOString(),
      view: "system",
      type: "migration",
      label: `旧保存(${legacyStorageKeyV1})から移行しました。metricsは引き継ぎ対象外です。`,
      success: true,
    });
    return sanitizeState(migrated);
  }

  return null;
}

/**
 * localStorage から状態を読み込む。
 * 保存形式の差分（古い保存・欠落キー）は defaultState とマージして吸収する。
 * v3 キーが空の場合は v2 → v1 の順で旧保存からの移行を試みる（§9.5）。
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return migrateLegacyState() || cloneDefaultState();
    const parsed = JSON.parse(raw);
    return sanitizeState(parsed);
  } catch {
    return cloneDefaultState();
  }
}

/**
 * 保存関数を生成する。
 * @param {object} state - 保存対象の状態（参照を保持する）
 * @param {(error: Error) => void} [onError] - 連続する保存失敗の「初回のみ」呼ばれる通知
 * @returns {() => boolean} saveState - 保存成功なら true、失敗なら false
 */
export function createStateSaver(state, onError) {
  let notified = false;
  let notificationVersion = 0;
  return function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      // 一度保存できた後に再び失敗した場合は、新しい障害として再通知する。
      notified = false;
      notificationVersion += 1;
      return true;
    } catch (error) {
      // 旧実装ではここで例外がそのまま伝播し、以降の描画処理が
      // 中断される可能性があった（localStorage黙落ち問題）。
      console.error("[neuro] 状態の保存に失敗しました", error);
      if (!notified) {
        notified = true;
        const version = ++notificationVersion;
        // 多くの呼び出し元は save() 直後に成功メッセージをannounceする。
        // 同期通知だと保存失敗が即座に上書きされるため、現在のイベント処理が
        // 終わった直後に通知する。後続saveが成功済みなら通知は取り消す。
        queueMicrotask(() => {
          if (!notified || version !== notificationVersion) return;
          try {
            onError?.(error);
          } catch (notificationError) {
            // 通知UI側の例外でも、呼び出し元の描画や入力処理を止めない。
            console.error("[neuro] 保存失敗の通知処理に失敗しました", notificationError);
          }
        });
      }
      return false;
    }
  };
}
