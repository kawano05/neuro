// =====================================================================
// games/slotJudge.js — スロット型逐次停止課題の純粋な判定・出題・集計
//
// 描画フレームを判定に使わない。シェルが取得した performance.now() と、
// セッション開始時に固定した周期・初期位相だけから停止位置を求める。
// =====================================================================

export const SLOT_PROTOCOL_VERSION = "slot-v1";
export const SLOT_ENGINE_VERSION = 1;

export const SLOT_SYMBOL_IDS = Object.freeze([
  "circle",
  "fish",
  "star",
  "flower",
  "bird",
  "square",
]);

export const SLOT_JUDGMENTS = Object.freeze(["hit", "miss", "timeout"]);

function finiteNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

/** JavaScript の負の剰余を 0..modulo 未満へ正規化する。 */
export function positiveModulo(value, modulo) {
  finiteNumber(value, "value");
  finiteNumber(modulo, "modulo");
  if (modulo <= 0) throw new RangeError("modulo must be greater than zero");
  return ((value % modulo) + modulo) % modulo;
}

/**
 * 任意時刻の論理位相。整数位置で絵柄の中心が停止線を通過する。
 * requestAnimationFrame の呼ばれた回数や間隔は一切参照しない。
 */
export function reelPhaseAt({ atMs, reelStartMs, cycleMs, symbolCount, initialPhase = 0 }) {
  finiteNumber(atMs, "atMs");
  finiteNumber(reelStartMs, "reelStartMs");
  finiteNumber(cycleMs, "cycleMs");
  positiveInteger(symbolCount, "symbolCount");
  finiteNumber(initialPhase, "initialPhase");
  if (cycleMs <= 0) throw new RangeError("cycleMs must be greater than zero");

  const elapsedMs = Math.max(0, atMs - reelStartMs);
  return positiveModulo(initialPhase + (elapsedMs / cycleMs) * symbolCount, symbolCount);
}

/** 停止線に最も近い絵柄の index。ちょうど半分なら進行方向側を採る。 */
export function centeredSymbolIndex(phase, symbolCount) {
  finiteNumber(phase, "phase");
  positiveInteger(symbolCount, "symbolCount");
  return positiveModulo(Math.floor(phase + 0.5), symbolCount);
}

/**
 * 入力時刻に最も近い、目標絵柄の中央通過時刻を返す。
 * 最初の通過より前の入力だけは、存在しない負の周回へ結び付けない。
 */
export function nearestTargetPassMs({
  inputMs,
  reelStartMs,
  cycleMs,
  symbolCount,
  initialPhase = 0,
  targetIndex,
}) {
  finiteNumber(inputMs, "inputMs");
  finiteNumber(reelStartMs, "reelStartMs");
  finiteNumber(cycleMs, "cycleMs");
  positiveInteger(symbolCount, "symbolCount");
  finiteNumber(initialPhase, "initialPhase");
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= symbolCount) {
    throw new RangeError("targetIndex is outside the reel");
  }
  if (cycleMs <= 0) throw new RangeError("cycleMs must be greater than zero");

  const symbolIntervalMs = cycleMs / symbolCount;
  const firstDelaySymbols = positiveModulo(targetIndex - initialPhase, symbolCount);
  const firstPassMs = reelStartMs + firstDelaySymbols * symbolIntervalMs;
  const nearestCycle = Math.max(0, Math.round((inputMs - firstPassMs) / cycleMs));
  return firstPassMs + nearestCycle * cycleMs;
}

/**
 * 1入力（またはタイムアウト）を1試行へ変換する。
 * inputMs=null は timeoutAtMs で論理停止したタイムアウト行を表す。
 */
export function judgeSlotStop({
  inputMs,
  timeoutAtMs = null,
  reelStartMs,
  activeStartMs = reelStartMs,
  cycleMs,
  toleranceMs,
  symbolOrder,
  targetSymbol,
  initialPhase = 0,
}) {
  if (!Array.isArray(symbolOrder) || symbolOrder.length < 2) {
    throw new RangeError("symbolOrder must contain at least two symbols");
  }
  if (new Set(symbolOrder).size !== symbolOrder.length) {
    throw new RangeError("symbolOrder must not contain duplicates");
  }
  const targetIndex = symbolOrder.indexOf(targetSymbol);
  if (targetIndex < 0) throw new RangeError("targetSymbol is not present in symbolOrder");
  finiteNumber(reelStartMs, "reelStartMs");
  finiteNumber(activeStartMs, "activeStartMs");
  finiteNumber(cycleMs, "cycleMs");
  finiteNumber(toleranceMs, "toleranceMs");
  if (cycleMs <= 0) throw new RangeError("cycleMs must be greater than zero");
  if (toleranceMs < 0 || toleranceMs > cycleMs / (symbolOrder.length * 2)) {
    throw new RangeError("toleranceMs must fit inside half a symbol interval");
  }

  const isTimeout = inputMs === null;
  const stopAtMs = isTimeout
    ? finiteNumber(timeoutAtMs, "timeoutAtMs")
    : finiteNumber(inputMs, "inputMs");
  const phase = reelPhaseAt({
    atMs: stopAtMs,
    reelStartMs,
    cycleMs,
    symbolCount: symbolOrder.length,
    initialPhase,
  });
  const stoppedIndex = centeredSymbolIndex(phase, symbolOrder.length);
  const targetPassMs = nearestTargetPassMs({
    inputMs: stopAtMs,
    reelStartMs,
    cycleMs,
    symbolCount: symbolOrder.length,
    initialPhase,
    targetIndex,
  });
  const signedErrorMs = isTimeout ? null : inputMs - targetPassMs;
  const absoluteErrorMs = signedErrorMs === null ? null : Math.abs(signedErrorMs);

  return {
    targetIndex,
    stoppedIndex,
    stoppedPhase: phase,
    stoppedSymbol: symbolOrder[stoppedIndex],
    targetPassMs,
    signedErrorMs,
    absoluteErrorMs,
    observedCycles: Math.max(0, Math.floor((stopAtMs - activeStartMs) / cycleMs)),
    judgment: isTimeout ? "timeout" : absoluteErrorMs <= toleranceMs ? "hit" : "miss",
  };
}

/** FNV-1a 32bit。文字列 seed を実行環境に依存しない整数へする。 */
function hashSeed(seed) {
  let hash = 0x811c9dc5;
  const text = String(seed);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 同じ seed なら同じ列を返す、小さな決定的PRNG。 */
export function createSeededRandom(seed) {
  let value = hashSeed(seed);
  return function random() {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates。元配列は変更しない。 */
export function seededShuffle(items, seed) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  const shuffled = [...items];
  const random = createSeededRandom(seed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * 測定条件を再現するための出題表。目標、絵柄順、初期位相をすべて固定する。
 */
export function createSeededSlotPlan({
  seed,
  rounds,
  reelCount,
  symbols = SLOT_SYMBOL_IDS,
}) {
  positiveInteger(rounds, "rounds");
  positiveInteger(reelCount, "reelCount");
  if (!Array.isArray(symbols) || symbols.length < 2 || new Set(symbols).size !== symbols.length) {
    throw new RangeError("symbols must be a unique array with at least two entries");
  }
  const random = createSeededRandom(`${seed}:targets`);

  return Array.from({ length: rounds }, (_, roundIndex) => {
    const targetSymbol = symbols[Math.floor(random() * symbols.length)];
    const reels = Array.from({ length: reelCount }, (_, reelIndex) => {
      const symbolOrder = seededShuffle(symbols, `${seed}:order:${roundIndex}:${reelIndex}`);
      const targetIndex = symbolOrder.indexOf(targetSymbol);
      let initialPhase = Math.floor(random() * symbols.length);
      // 開始瞬間が目標中央だと、見てから押す前に最初の機会が終わる。
      if (initialPhase === targetIndex) initialPhase = (initialPhase + 1) % symbols.length;
      return { symbolOrder, initialPhase, targetIndex };
    });
    return { roundIndex, targetSymbol, reels };
  });
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function standardDeviation(values, mean = average(values)) {
  if (values.length < 2 || mean === null) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  );
}

function timingMetrics(trials) {
  const signed = trials
    .map((trial) => trial.signedErrorMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const absolute = trials
    .map((trial) => trial.absoluteErrorMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const meanSignedErrorMs = average(signed);
  return {
    medianAbsoluteErrorMs: median(absolute),
    meanSignedErrorMs,
    sdSignedErrorMs: standardDeviation(signed, meanSignedErrorMs),
  };
}

/** trials を正本にして、利用者表示・支援者表示・CSV連動用の summary を作る。 */
export function summarizeSlotTrials(
  trials,
  { reelCount = null, completionTimeMs = null, extraInputCount = null } = {}
) {
  const rows = Array.isArray(trials) ? trials : [];
  const hits = rows.filter((trial) => trial.judgment === "hit").length;
  const misses = rows.filter((trial) => trial.judgment === "miss").length;
  const timeouts = rows.filter((trial) => trial.judgment === "timeout").length;
  const judgedCount = hits + misses + timeouts;
  const observed = rows
    .map((trial) => trial.observedCycles)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const inferredExtras = rows.reduce(
    (sum, trial) => sum + (Number.isInteger(trial.ignoredDuplicateInputs) ? trial.ignoredDuplicateInputs : 0),
    0
  );
  const perReelIndexes = [...new Set(rows.map((trial) => trial.reelIndex).filter(Number.isInteger))]
    .sort((a, b) => a - b);
  const reelStats = perReelIndexes.map((reelIndex) => {
    const reelTrials = rows.filter((trial) => trial.reelIndex === reelIndex);
    const reelHits = reelTrials.filter((trial) => trial.judgment === "hit").length;
    return {
      reelIndex,
      trials: reelTrials.length,
      hits: reelHits,
      hitRate: reelTrials.length ? reelHits / reelTrials.length : 0,
      ...timingMetrics(reelTrials),
    };
  });

  const roundIndexes = [...new Set(rows.map((trial) => trial.roundIndex).filter(Number.isInteger))]
    .sort((a, b) => a - b);
  let allHitRoundCount = 0;
  let anyHitRoundCount = 0;
  const reelInputIntervalsMs = [];
  roundIndexes.forEach((roundIndex) => {
    const roundTrials = rows
      .filter((trial) => trial.roundIndex === roundIndex)
      .sort((a, b) => a.reelIndex - b.reelIndex);
    if (roundTrials.some((trial) => trial.judgment === "hit")) anyHitRoundCount += 1;
    if (
      Number.isInteger(reelCount) &&
      roundTrials.length === reelCount &&
      roundTrials.every((trial) => trial.judgment === "hit")
    ) {
      allHitRoundCount += 1;
    }
    for (let index = 1; index < roundTrials.length; index += 1) {
      const before = roundTrials[index - 1].inputMs;
      const after = roundTrials[index].inputMs;
      if (typeof before === "number" && typeof after === "number" && after >= before) {
        reelInputIntervalsMs.push(after - before);
      }
    }
  });

  const lastRoundIndex = roundIndexes.at(-1);
  const lastRoundSymbols = Number.isInteger(lastRoundIndex)
    ? rows
        .filter((trial) => trial.roundIndex === lastRoundIndex)
        .sort((a, b) => a.reelIndex - b.reelIndex)
        .map((trial) => trial.stoppedSymbol)
    : [];

  return {
    trials: rows.length,
    hits,
    misses,
    timeouts,
    extras: extraInputCount ?? inferredExtras,
    ...timingMetrics(rows),
    hitRate: judgedCount ? hits / judgedCount : 0,
    completionTimeMs:
      typeof completionTimeMs === "number" && Number.isFinite(completionTimeMs)
        ? Math.max(0, completionTimeMs)
        : null,
    extraInputCount: extraInputCount ?? inferredExtras,
    timeoutCount: timeouts,
    meanObservedCycles: average(observed),
    reelStats,
    reelInputIntervalsMs,
    meanReelInputIntervalMs: average(reelInputIntervalsMs),
    allHitRoundCount,
    anyHitRoundCount,
    lastRoundSymbols,
  };
}
