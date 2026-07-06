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

/**
 * gonogo（games/gonogo.js）用の Go/No-Go 乱数列生成（detailed-design.md §6.4）。
 * 純粋関数（DOM/AudioContext に非依存）として切り出してあるため、
 * tests/judge.test.mjs から直接検証できる（detailed-design.md §12 タスク12 の
 * SHOULD 事項）。呼び出し側（games/rhythm.js の buildGonogoPlan）が
 * セッション開始時に1回だけ呼び、結果の配列をそのまま
 * session.config.seedSequence に全量記録する（再現性、MUST）。
 * ここでいう「乱数列」は RNG の生シードではなく、確定した Go/No-Go の
 * 種類の列そのものを指す（記録して後から追跡できることが目的のため）。
 *
 * アルゴリズム: 「3連続禁止（＝最大2連続まで）」を、シャッフル→検査→
 * 再試行ではなく構成的に満たす。goCount 個の "go" が作る
 * goCount+1 個の隙間（先頭・go 同士の間・末尾）へ、隙間あたり最大2個までの
 * 制約付きでランダムに No-Go を配ることで、結果として「3連続以上」が
 * 原理的に発生しない（シャッフル＋再試行方式より単純で必ず停止する）。
 *
 * @param {number} length - 生成するビート数（targetBeats）
 * @param {number} goRatio - Go の比率（0〜1）
 * @param {() => number} [rng] - [0,1) を返す乱数源。既定は Math.random。
 *   単体テストでは決定的な rng を渡して再現性を検証する。
 * @returns {Array<"go"|"nogo">} 長さ length の配列
 */
export function generateGoNoGoSequence(length, goRatio, rng = Math.random) {
  const MAX_NOGO_RUN = 2; // 「3連続禁止」＝連続最大2まで（detailed-design.md §6.4）
  const goCount = Math.round(length * goRatio);
  const nogoCount = length - goCount;
  const gapCount = goCount + 1; // go の前・go 同士の間・go の後にできる隙間の数

  const gapSizes = distributeWithCap(nogoCount, gapCount, MAX_NOGO_RUN, rng);

  const sequence = [];
  gapSizes.forEach((size, index) => {
    for (let i = 0; i < size; i += 1) sequence.push("nogo");
    if (index < goCount) sequence.push("go");
  });
  return sequence;
}

/**
 * total 個を count 個の枠へランダムに1個ずつ配る。各枠は最大 cap 個までしか
 * 受け取れない（枠あたり上限つきのランダム分割）。
 *
 * count*cap < total（現行プリセットの goRatio では起こらない極端な設定）の
 * 場合は、全枠が上限に達してもなお余りが出る。この場合は制約より
 * 「全試行を記録すること」を優先し、余りを先頭の枠に積み増す
 * （3連続禁止の制約を諦めてでもビート数を優先するフォールバック。
 * gonogo のプリセット（goRatio 0.6）では発生しない経路）。
 */
function distributeWithCap(total, count, cap, rng) {
  const sizes = new Array(count).fill(0);
  for (let i = 0; i < total; i += 1) {
    const available = [];
    for (let gap = 0; gap < count; gap += 1) {
      if (sizes[gap] < cap) available.push(gap);
    }
    if (available.length === 0) {
      sizes[0] += 1;
      continue;
    }
    const pick = available[Math.floor(rng() * available.length)];
    sizes[pick] += 1;
  }
  return sizes;
}
