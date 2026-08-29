// slot セッションの防御的サニタイズ。
// 保存済み summary は信用せず、検証済み trials を正本として再計算する。

import {
  SLOT_ENGINE_VERSION,
  SLOT_JUDGMENTS,
  SLOT_PROTOCOL_VERSION,
  SLOT_SYMBOL_IDS,
  judgeSlotStop,
  summarizeSlotTrials,
} from "./slotJudge.js";

const SLOT_GAME_IDS = new Set(["slot-l1", "slot-l2"]);
const SYMBOL_IDS = new Set(SLOT_SYMBOL_IDS);
const JUDGMENTS = new Set(SLOT_JUDGMENTS);
const DIFFICULTY_MODES = new Set(["measure", "practice"]);
const TEXT_MODES = new Set(["ruby", "kanji", "kana", "en"]);
const READINESS_STATES = new Set(["met", "overridden", "n/a"]);
const MAX_COUNTER = 1_000_000_000;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function bounded(value, fallback, min, max, integer = false) {
  if (!finite(value)) return fallback;
  const result = Math.min(max, Math.max(min, value));
  return integer ? Math.trunc(result) : result;
}

function nullable(value, min = 0, max = MAX_COUNTER) {
  return finite(value) && value >= min && value <= max ? value : null;
}

function closeEnough(left, right, epsilon = 0.01) {
  if (left === null || right === null) return left === right;
  return finite(left) && finite(right) && Math.abs(left - right) <= epsilon;
}

function sanitizeDevice(device) {
  const value = isRecord(device) ? device : {};
  return {
    outputLatencyS: nullable(value.outputLatencyS, 0, 60),
    baseLatencyS: nullable(value.baseLatencyS, 0, 60),
    userAgent: typeof value.userAgent === "string" ? value.userAgent.slice(0, 2_000) : "",
    viewportWidth: nullable(value.viewportWidth, 0, 20_000),
    viewportHeight: nullable(value.viewportHeight, 0, 20_000),
    devicePixelRatio: nullable(value.devicePixelRatio, 0, 16),
  };
}

function sanitizeConfig(gameId, rawConfig) {
  const value = isRecord(rawConfig) ? rawConfig : {};
  const reelCount = gameId === "slot-l2" ? 3 : 1;
  const symbolCount = SLOT_SYMBOL_IDS.length;
  const cycleMs = bounded(value.cycleMs, 3200, 800, 12_000, true);
  const toleranceMaximum = cycleMs / (symbolCount * 2);
  return {
    reelCount,
    symbolCount,
    cycleMs,
    toleranceMs: bounded(value.toleranceMs, 220, 0, toleranceMaximum),
    rounds: bounded(value.rounds, gameId === "slot-l2" ? 4 : 8, 1, 100, true),
    maxCyclesPerReel: bounded(value.maxCyclesPerReel, 4, 1, 20, true),
    seed: typeof value.seed === "string" ? value.seed.slice(0, 128) : "slot-measure-01",
    visualGuidance: false,
    difficultyMode: DIFFICULTY_MODES.has(value.difficultyMode)
      ? value.difficultyMode
      : "practice",
    textMode: TEXT_MODES.has(value.textMode) ? value.textMode : "ruby",
    measurementReadiness: READINESS_STATES.has(value.measurementReadiness)
      ? value.measurementReadiness
      : "n/a",
  };
}

function sanitizeTrial(trial, rowIndex, config) {
  if (!isRecord(trial)) return null;
  const symbolOrder = Array.isArray(trial.symbolOrder) ? [...trial.symbolOrder] : [];
  if (
    symbolOrder.length !== config.symbolCount ||
    new Set(symbolOrder).size !== config.symbolCount ||
    symbolOrder.some((symbol) => !SYMBOL_IDS.has(symbol)) ||
    !SYMBOL_IDS.has(trial.targetSymbol) ||
    !SYMBOL_IDS.has(trial.stoppedSymbol) ||
    !JUDGMENTS.has(trial.judgment)
  ) return null;

  const roundIndex = bounded(trial.roundIndex, -1, 0, config.rounds - 1, true);
  const reelIndex = bounded(trial.reelIndex, -1, 0, config.reelCount - 1, true);
  if (roundIndex < 0 || reelIndex < 0 || !finite(trial.initialPhase)) return null;
  if (
    !finite(trial.reelStartMs) || trial.reelStartMs < 0 ||
    !finite(trial.activeStartMs) || trial.activeStartMs < trial.reelStartMs
  ) return null;

  const timeout = trial.judgment === "timeout";
  const inputMs = timeout ? null : nullable(trial.inputMs, 0, MAX_COUNTER);
  const timeoutAtMs = timeout ? nullable(trial.timeoutAtMs, 0, MAX_COUNTER) : null;
  if ((!timeout && inputMs === null) || (timeout && timeoutAtMs === null)) return null;

  let judged;
  try {
    judged = judgeSlotStop({
      inputMs,
      timeoutAtMs,
      reelStartMs: trial.reelStartMs,
      activeStartMs: trial.activeStartMs,
      cycleMs: config.cycleMs,
      toleranceMs: config.toleranceMs,
      symbolOrder,
      targetSymbol: trial.targetSymbol,
      initialPhase: trial.initialPhase,
    });
  } catch {
    return null;
  }

  if (
    judged.judgment !== trial.judgment ||
    judged.targetIndex !== trial.targetIndex ||
    judged.stoppedSymbol !== trial.stoppedSymbol ||
    !closeEnough(trial.targetPassMs, judged.targetPassMs) ||
    !closeEnough(trial.signedErrorMs, judged.signedErrorMs) ||
    !closeEnough(trial.absoluteErrorMs, judged.absoluteErrorMs)
  ) return null;

  return {
    index: bounded(trial.index, rowIndex, 0, MAX_COUNTER, true),
    roundIndex,
    reelIndex,
    targetSymbol: trial.targetSymbol,
    targetIndex: judged.targetIndex,
    symbolOrder,
    initialPhase: trial.initialPhase,
    reelStartMs: trial.reelStartMs,
    activeStartMs: trial.activeStartMs,
    inputMs,
    timeoutAtMs,
    targetPassMs: judged.targetPassMs,
    signedErrorMs: judged.signedErrorMs,
    absoluteErrorMs: judged.absoluteErrorMs,
    stoppedPhase: judged.stoppedPhase,
    stoppedIndex: judged.stoppedIndex,
    stoppedSymbol: judged.stoppedSymbol,
    observedCycles: judged.observedCycles,
    judgment: judged.judgment,
    inputSource: typeof trial.inputSource === "string" ? trial.inputSource.slice(0, 64) : "",
    ignoredDuplicateInputs: bounded(trial.ignoredDuplicateInputs, 0, 0, 10_000, true),
  };
}

function hasEveryExpectedPosition(trials, config) {
  if (trials.length !== config.rounds * config.reelCount) return false;
  const positions = new Set(trials.map((trial) => `${trial.roundIndex}:${trial.reelIndex}`));
  if (positions.size !== trials.length) return false;
  for (let roundIndex = 0; roundIndex < config.rounds; roundIndex += 1) {
    for (let reelIndex = 0; reelIndex < config.reelCount; reelIndex += 1) {
      if (!positions.has(`${roundIndex}:${reelIndex}`)) return false;
    }
  }
  return true;
}

export function sanitizeSlotSession(session) {
  if (!isRecord(session) || !SLOT_GAME_IDS.has(session.gameId)) return null;
  if (session.taskType !== "slot") return null;

  // 版が違う回は「捨てる」のではなく「そのまま残す」。
  //
  // 以前はここで null を返していた。sanitize は読み込みのたびに走るので、
  // SLOT_ENGINE_VERSION を上げたビルドを配ると、その端末に溜まっていた
  // リールの回は次の起動で消えた——警告も、書き出しの猶予も無く。研究の
  // データ収集期間中に更新を配ると、それまでの回が失われる（実測で確認、
  // 2026-08-29）。
  //
  // 混ぜてはいけないのは確かだが、それは解析で分けるべきことで、削除で
  // 果たすことではない。版は protocolVersion / engineVersion として台帳と
  // CSVに出ているので、解析側は現行版だけを選べる。
  //
  // 古い版の回は中身を作り直さない（当時の判定規則で作られた値を、いまの
  // 規則で検証し直すと、通らなかった行だけが消えて残りが残る——いちばん
  // たちの悪い壊れ方になる）。保存された形のまま、読み取り専用で残す。
  if (
    session.protocolVersion !== SLOT_PROTOCOL_VERSION ||
    session.engineVersion !== SLOT_ENGINE_VERSION
  ) {
    return {
      ...session,
      taskType: "slot",
      // いまの版で検証していないことを、記録自体に持たせる。これが true の
      // 回を現行版の回と同じ分布に混ぜてはいけない。
      legacyVersion: true,
      trials: Array.isArray(session.trials) ? session.trials : [],
      summary: isRecord(session.summary) ? session.summary : {},
    };
  }

  const config = sanitizeConfig(session.gameId, session.config);
  const rawTrials = Array.isArray(session.trials) ? session.trials.slice(0, 1_000) : [];
  const slots = rawTrials.map((trial, index) => sanitizeTrial(trial, index, config));
  const trials = slots.filter(Boolean);
  const completedNormally =
    session.finished === true &&
    session.aborted === false &&
    Array.isArray(session.trials) &&
    session.trials.length <= 1_000 &&
    slots.every(Boolean) &&
    hasEveryExpectedPosition(trials, config);
  const extraInputCount = bounded(
    session.summary?.extraInputCount,
    trials.reduce((sum, trial) => sum + trial.ignoredDuplicateInputs, 0),
    0,
    MAX_COUNTER,
    true
  );
  const completionTimeMs = nullable(session.summary?.completionTimeMs, 0, MAX_COUNTER);

  return {
    sessionId: typeof session.sessionId === "string" ? session.sessionId : "unknown",
    taskType: "slot",
    gameId: session.gameId,
    protocolVersion: SLOT_PROTOCOL_VERSION,
    engineVersion: SLOT_ENGINE_VERSION,
    participantId: typeof session.participantId === "string" ? session.participantId : "",
    startedAtIso: typeof session.startedAtIso === "string" ? session.startedAtIso : "",
    endedAtIso: typeof session.endedAtIso === "string" ? session.endedAtIso : null,
    aborted: !completedNormally,
    finished: completedNormally,
    config,
    device: sanitizeDevice(session.device),
    trials,
    summary: summarizeSlotTrials(trials, {
      reelCount: config.reelCount,
      completionTimeMs,
      extraInputCount,
    }),
  };
}
