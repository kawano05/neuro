// 2軸ポイント走査の判定を、DOMや描画から切り離した純粋関数として提供する。

/**
 * 走査カーソル位置（0..100）を経過時間から求める。
 * sweepMs は端から端までの所要時間で、カーソルは三角波として往復する。
 */
export function scanPercentAt(elapsedMs, sweepMs) {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(sweepMs) || sweepMs <= 0) return 0;
  const periodMs = sweepMs * 2;
  const phaseMs = ((elapsedMs % periodMs) + periodMs) % periodMs;
  const outwardMs = phaseMs <= sweepMs ? phaseMs : periodMs - phaseMs;
  return (outwardMs / sweepMs) * 100;
}

/** 2軸選択の結果を目標に対して評価する。 */
export function evaluatePick(selected, target) {
  const dx = selected.x - target.x;
  const dy = selected.y - target.y;
  const distance = Math.hypot(dx, dy);
  return {
    dx,
    dy,
    distance,
    success: distance <= target.r,
  };
}

/** 距離だけから、決定的に掴み成否を返す。 */
export function graspOutcome(distance, toleranceR) {
  if (distance <= toleranceR * 0.5) return "grip";
  if (distance <= toleranceR) return "slip";
  return "miss";
}
