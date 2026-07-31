// 変動前刺激間隔と単純反応時間課題の純粋関数。

/** 変動前刺激間隔（ms）の列を生成する。 */
export function generateForeperiods(count, minMs, maxMs, rng = Math.random) {
  const length = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
  const lower = Math.min(minMs, maxMs);
  const upper = Math.max(minMs, maxMs);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return [];

  return Array.from({ length }, () => {
    const sample = Number(rng());
    const normalized = Number.isFinite(sample) ? Math.max(0, Math.min(1, sample)) : 0;
    return Math.round(lower + (upper - lower) * normalized);
  });
}

/**
 * 1試行を判定する。入力なしは tInput=null で表す。
 * real は前刺激中の入力を falseStart、窓内入力を hit、それ以外を timeout とする。
 * fake は入力の有無だけで commission / correctRejection を分ける。
 */
export function judgeReaction(tInput, cueMs, limitMs, kind) {
  const hasInput = typeof tInput === "number" && Number.isFinite(tInput);
  if (kind === "fake") return hasInput ? "commission" : "correctRejection";
  if (!hasInput) return "timeout";
  if (tInput < cueMs) return "falseStart";
  return tInput <= cueMs + limitMs ? "hit" : "timeout";
}
