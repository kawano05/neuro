// =====================================================================
// games/judge.js — 判定ロジック（純粋関数、DOM/AudioContext に非依存）
//
// detailed-design.md §5 の判定規則を実装する。テストは tests/judge.test.mjs
// （node 実行、単体テスト対象）。この節の関数はすべて「状態を持たない」
// （pendingBeats を破壊的に変更しない）。1ビート1入力の消費規則は、
// judgeInput() の戻り値 beatIndex を見て「呼び出し側（rhythm.js）が
// pendingBeats から取り除く」ことで担保する（§5.2 規則1・規則6）。
//
// pendingBeats の形: [{ index: number, kind: "go"|"nogo", timeMs: number }]
//   timeMs は呼び出し側で統一した時間軸（rhythm.js では audio 絶対時刻の
//   ミリ秒、§6.3）であればどの軸でもよい。judgeInput/sweepExpired は
//   軸の意味を問わない純粋な数値比較のみ行う。
// =====================================================================

/**
 * 拍間隔（ms）。bpm（1分あたりの拍数）から算出する。
 * rhythm.js のプラン生成と、下記 computeEffectiveWindowMs の両方から使うため
 * ここに1箇所だけ置く（式のズレ防止）。
 */
export function computeBeatIntervalMs(bpm) {
  return 60000 / bpm;
}

/**
 * 実効判定窓半幅 W の算出（detailed-design.md §5.1）。
 * cued モード（L1・キャリブレーション）は試行間休止があるため設定値 W0 のまま。
 * continuous / gonogo は隣接ビートとの窓重複を禁止するため
 * W = min(W0, 拍間隔 × 0.45) にクランプする（MUST）。
 * @param {"cued"|"continuous"|"gonogo"} mode
 * @param {number} bpm
 * @param {number} judgmentWindowMs - 設定判定窓半幅 W0
 * @returns {number} 実効判定窓半幅 W
 */
export function computeEffectiveWindowMs(mode, bpm, judgmentWindowMs) {
  if (mode === "cued") return judgmentWindowMs;
  const beatIntervalMs = computeBeatIntervalMs(bpm);
  return Math.min(judgmentWindowMs, beatIntervalMs * 0.45);
}

/**
 * セッション中の1入力を、未消化ビート列に対して判定する（detailed-design.md §5.2）。
 *
 * 規則:
 *   1. |adj| ≤ W を満たす最近傍の未消化ビートに割り当てる（adj = raw − C）。
 *      Go ビートなら hit、No-Go ビートなら commission。
 *   2. どのビートにも入らない入力は extra（beatIndex = null）。
 *   6. ビートは1入力までしか消費できない。呼び出し側が pendingBeats から
 *      消化済みビートを取り除いてから次の入力を判定すること（このファイルは
 *      pendingBeats を変更しない）。
 *
 * @param {number} tInput - 入力時刻（呼び出し側の統一時間軸、ms）
 * @param {Array<{index:number, kind:"go"|"nogo", timeMs:number}>} pendingBeats - 未消化ビートのみ
 * @param {number} W - 実効判定窓半幅（ms）
 * @param {number} C - 窓中心補正（baselineOffsetMs、ms）
 * @returns {{judgment:"hit"|"commission"|"extra", beatIndex:number|null, raw:number|null, adj:number|null}}
 */
export function judgeInput(tInput, pendingBeats, W, C) {
  let best = null;
  let bestAbsAdj = Infinity;

  for (const beat of pendingBeats) {
    const raw = tInput - beat.timeMs;
    const adj = raw - C;
    const absAdj = Math.abs(adj);
    if (absAdj <= W && absAdj < bestAbsAdj) {
      bestAbsAdj = absAdj;
      best = { beat, raw, adj };
    }
  }

  if (!best) {
    return { judgment: "extra", beatIndex: null, raw: null, adj: null };
  }

  const judgment = best.beat.kind === "nogo" ? "commission" : "hit";
  return { judgment, beatIndex: best.beat.index, raw: best.raw, adj: best.adj };
}

/**
 * 時刻 now までに判定窓を通過した未消化ビートを確定する（detailed-design.md §5.2 規則3）。
 * tBeat + W + C を now が超えた未消化ビートは、Go なら miss、No-Go なら
 * correctRejection（No-Go を正しく見送った成功、入力行なし）とする。
 *
 * 窓は judgeInput 側と同じく閉区間 [tBeat+C−W, tBeat+C+W] として扱う。
 * つまり now がちょうど境界（tBeat+W+C）のときはまだ「窓内」であり、
 * 期限切れにはしない（境界を厳密に超えたときのみ確定する）。
 *
 * @param {number} now - 現在時刻（judgeInput と同じ時間軸、ms）
 * @param {Array<{index:number, kind:"go"|"nogo", timeMs:number}>} pendingBeats - 未消化ビートのみ
 * @param {number} W - 実効判定窓半幅（ms）
 * @param {number} C - 窓中心補正（ms）
 * @returns {{beatIndex:number, judgment:"miss"|"correctRejection"}[]}
 */
export function sweepExpired(now, pendingBeats, W, C) {
  const expired = [];
  for (const beat of pendingBeats) {
    const boundary = beat.timeMs + W + C;
    if (now > boundary) {
      expired.push({
        beatIndex: beat.index,
        judgment: beat.kind === "nogo" ? "correctRejection" : "miss",
      });
    }
  }
  return expired;
}
