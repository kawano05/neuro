// =====================================================================
// offsetDistribution.js — 記録済みリズムセッションから、入力オフセットの
// 分布を組み立てる（研究タブの図）
//
// なぜ要るか: このアプリの研究上の位置づけは「入力時刻のオフセットを全試行
// 記録する計測器」なのに、集めた値を通しで見る場所がアプリのどこにも無く、
// 支援者も学生も CSV を書き出して別のツールへ持っていくしかなかった。
// 平均やSDは1セッションぶんならリザルトに出るが、分布の形（左右に偏って
// いるのか、二山なのか、外れ値なのか）は数値2つでは分からない。
//
// 条件で分けること自体が要件。settings.visualGuidance が ON だった回は
// 画面が拍を予告し、押したあとのずれも見えている——聴覚キューだけへの同期
// ではないので、同じ分布に混ぜると測っているものが違う値が1つの山になる
// （games/rhythm.js の resolveVisualGuidance）。
//
// 値は rawOffsetMs（生値）を使う。表示用の displayOffsetMs（基準補正後）
// ではない——研究の図は記録そのものを見せる場所で、補正は解析側の判断。
//
// DOM に触れない純粋関数として置いてあるのは、ここが卒論の図の出どころに
// なるため。ビン分けと除外の規則をテストで固定する
// （tests/offset-distribution.test.mjs）。
// =====================================================================

/** 1ビンの幅（ms）。 */
export const BIN_WIDTH_MS = 50;

/** 図に収める範囲（ms）。これを外れた試行は両端のビンに寄せる。 */
export const RANGE_MS = 600;

const RHYTHM_TASK_TYPES = new Set(["sms", "gonogo"]);

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, average) {
  if (values.length < 2 || average === null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * 集計に入れる試行だけを取り出す。
 *
 * - hit 以外（miss / extra / commission / correctRejection）は、そもそも
 *   「拍からどれだけずれたか」が定義できないので入れない。
 * - excluded:true（キャリブレーションの最初の数試行）は除く。慣らしのぶんを
 *   混ぜると分布の裾が実際より広く見える。
 * - そくてい（calibration）のセッションも除く。基準オフセットを決めるための
 *   測定で、訓練課題の分布とは母集団が違う。
 * - 中断した回も除く。途中でやめた理由（体調・中断・機器トラブル）は
 *   記録に残らないので、完走した回と同じ重みで混ぜられない。
 *   評価ログの推移や自己最高と同じ線引き。
 */
function collectOffsets(sessions) {
  const offsets = [];
  (sessions || []).forEach((session) => {
    if (!RHYTHM_TASK_TYPES.has(session?.taskType)) return;
    if (session.gameId === "calibration") return;
    if (session.finished !== true || session.aborted !== false) return;
    (session.trials || []).forEach((trial) => {
      if (trial.excluded) return;
      if (trial.judgment !== "hit") return;
      if (typeof trial.rawOffsetMs !== "number" || !Number.isFinite(trial.rawOffsetMs)) return;
      offsets.push(trial.rawOffsetMs);
    });
  });
  return offsets;
}

/**
 * 同じ山に入れてよい回かどうかを決めるキー。
 *
 * 以前は「画面の手がかりの有無」だけで2系列に分け、それ以外——課題の種類
 * （rhythm-l1 / rhythm-l2 / gonogo）、テンポ、参加者——は全部ひとつの山に
 * 混ぜていた。cued（拍ごとに予告がある）と continuous（連続する拍）では
 * 課題そのものが違うし、テンポが違えば拍間隔＝要求される精度が違う。
 * 参加者が違えば当然母集団が違う。混ぜた山は、形に意味が無い。
 *
 * 端末（device）はここに入れていない。入れると iPad の回とスマホの回で
 * 山が割れ、ただでさえ少ない試行がさらに細かく分かれる。端末は
 * session.device に残してあるので、必要なら解析側で層別できる。
 * ——ここで分けるのは「課題として別物になる条件」までにとどめる。
 */
export function distributionKey(session) {
  const participant = session.participantId || "（IDなし）";
  const bpm = session.config?.bpm ?? "?";
  const guided = session.config?.visualGuidance === true;
  return `${session.gameId}|${bpm}|${participant}|${guided ? "guided" : "plain"}`;
}

/** 範囲外を両端へ寄せたビン番号。 */
function binIndexFor(offsetMs, binCount) {
  const shifted = (offsetMs + RANGE_MS) / BIN_WIDTH_MS;
  return Math.max(0, Math.min(binCount - 1, Math.floor(shifted)));
}

/**
 * 課題×テンポ×参加者ごとのオフセット分布。手がかりの有無だけは同じ図の
 * 中で2系列に並べる——並べて比べること自体がこの条件の目的だから。
 *
 * @param {Array} sessions state.sessions
 * @returns {Array<{
 *   key: string, gameId: string, bpm: number|string, participantId: string,
 *   binWidthMs: number, rangeMs: number,
 *   bins: Array<{from:number, to:number, plain:number, guided:number}>,
 *   maxCount: number,
 *   plain: {n:number, meanMs:number|null, sdMs:number|null},
 *   guided: {n:number, meanMs:number|null, sdMs:number|null},
 * }>}
 */
export function summariseOffsetDistribution(sessions) {
  const binCount = (RANGE_MS * 2) / BIN_WIDTH_MS;
  const groups = new Map();

  (sessions || []).forEach((session) => {
    const offsets = collectOffsets([session]);
    if (!offsets.length) return;
    const guided = session.config?.visualGuidance === true;
    // 手がかりの有無は同じ図の2系列にするので、束ねるキーからは外す。
    const key = distributionKey(session).replace(/\|(guided|plain)$/, "");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        gameId: session.gameId,
        bpm: session.config?.bpm ?? "?",
        participantId: session.participantId || "",
        binWidthMs: BIN_WIDTH_MS,
        rangeMs: RANGE_MS,
        bins: Array.from({ length: binCount }, (_, index) => ({
          from: -RANGE_MS + index * BIN_WIDTH_MS,
          to: -RANGE_MS + (index + 1) * BIN_WIDTH_MS,
          plain: 0,
          guided: 0,
        })),
        plainOffsets: [],
        guidedOffsets: [],
      });
    }
    const group = groups.get(key);
    const series = guided ? "guided" : "plain";
    offsets.forEach((value) => {
      group.bins[binIndexFor(value, binCount)][series] += 1;
      group[guided ? "guidedOffsets" : "plainOffsets"].push(value);
    });
  });

  return [...groups.values()].map((group) => {
    const { plainOffsets, guidedOffsets, ...rest } = group;
    const plainMean = mean(plainOffsets);
    const guidedMean = mean(guidedOffsets);
    return {
      ...rest,
      maxCount: rest.bins.reduce((max, bin) => Math.max(max, bin.plain, bin.guided), 0),
      plain: {
        n: plainOffsets.length,
        meanMs: plainMean,
        sdMs: standardDeviation(plainOffsets, plainMean),
      },
      guided: {
        n: guidedOffsets.length,
        meanMs: guidedMean,
        sdMs: standardDeviation(guidedOffsets, guidedMean),
      },
    };
  });
}
