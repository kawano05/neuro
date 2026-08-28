// =====================================================================
// games/rhythm.js — リズムL1/L2・Go/No-Go・キャリブレーションの共通エンジン
// （detailed-design.md §7）
//
// P2-3 で mode="cued"（rhythm-l1）を実装し、P4-1/P4-2/P4-3 で
// continuous（rhythm-l2）・gonogo・calibration の分岐を buildPlan() に
// 追加した（createRhythmGame(gameId) の gameId ごとに resolveParams() が
// rhythmPresets を切り替える構造のおかげで、パラメータ違いの3モードは
// buildXxxPlan() を1つずつ足すだけで済んだ）。gonogo.js / calibration.js は
// このファイルの createRhythmGame(gameId) を呼ぶだけの薄いラッパ
// （games/gonogo.js・games/calibration.js のコメント参照）。
//
// 計時の方針（detailed-design.md §6.3、MUST）:
//   - 内部判定（judgeInput/sweepExpired）は audio 絶対時刻（ms）で行う。
//   - 記録（trials / CSV）はセッション相対時刻（ms）にする。
//   - 変換はこのファイルの中の1箇所（toSessionRelativeMs 等）に集約する。
//
// 研究設計上の最重要規則（基本設計書 §7・detailed-design.md §8.3）:
//   baselineOffsetMs（C）は判定窓の中心シフトにのみ使い、記録する
//   rawOffsetMs からは絶対に差し引かない。適用した C は
//   trial.appliedBaselineMs に毎行残す。
//
// GameCtx の契約外拡張について（gameHost.js 側で実装、コメント参照）:
//   - ctx.participantId … state.evaluation.participantId のスナップショット
//     （セッション記録の participantId 用。GameCtx は本来 settings しか
//     状態を渡さないが、P1-3 の logEvent 同様の実用上のパススルー）。
//   - ctx.setProgress(text) … #gameProgress（gameHost 管轄のDOM）へ進捗文字列
//     を書き込む。ゲーム本体には gameStageContent しか渡らないため
//     （detailed-design.md §3.1 の mount(stageEl) 引数）、そこに無い
//     要素を更新するための小さな抜け道として追加した。
//   - ctx.logTrial(session) … 1回呼ぶごとに「セッションの現時点までの
//     全体スナップショット」（trials 配列を含む）を渡す設計にした
//     （GameCtx の型コメントは "1試行の記録" とだけ書いてあり record の
//     粒度は明記されていないため）。理由: 判定エンジン側 (rhythm.js) は
//     state / save を持たないため、途中終了（aborted）時にも直前までの
//     trials を確実に永続化するには、毎回フルスナップショットを渡して
//     gameHost 側で sessionId をキーに upsert するのが最も単純で
//     データを失わない実装だった。summary は §9.2 のとおり CSV には
//     出さないが、リザルト画面表示用に ctx.finish() の引数として別途渡す。
// =====================================================================

import { rhythmPresets, cueTones } from "../content.js";
import {
  allowsVisualGuidance,
  resolveDifficultyMode,
  resolveRhythmDifficulty,
} from "../difficultyMode.js";
import {
  judgeInput,
  sweepExpired,
  computeEffectiveWindowMs,
  computeBeatIntervalMs,
  generateGoNoGoSequence,
} from "./judge.js";
import { createRhythmVisuals } from "./rhythmVisuals.js";

// フィードバック音（detailed-design.md §5.3）: hit は既定音量、miss/extra は
// 小音量・短めにして罰的にしない。
const FEEDBACK_GAIN_HIT = 0.05;
const FEEDBACK_GAIN_MISS = 0.018;
// 最終判定も通常の判定と同じだけ画面へ残してから結果へ進む。
// 入力と音のスケジューラは判定直後に止めるので、待機中に6回目は入らない。
export const RHYTHM_FINAL_FEEDBACK_MS = 480;

// 試行間の休止は beatInterval の1.5倍（detailed-design.md §6.4）。
const TRIAL_GAP_BEATS = 1.5;

// ずれの目盛り（detailed-design.md §7.4）の表示だけに使う定数。判定には
// 一切関与しない。
//
// EXACT_TOLERANCE_MS は「ぴったり」と見なして色を分けない幅。判定窓
// （既定±600ms）よりずっと狭くしてあるのは、当たり判定の話ではなく
// 「早い/遅いと言うほどではない」の線だから。感覚運動同期の研究で報告される
// 同期の標準偏差はおおむね数十ms なので、その内側に置いている。
const EXACT_TOLERANCE_MS = 30;
// 目盛りに残す印の上限。拍数は支援者が最大200まで伸ばせる（state.js）ので、
// 全部残すと目盛りが潰れて読めなくなる。
const MAX_OFFSET_MARKS = 24;
// 平均の印を出しはじめる試行数。1〜2回の平均は「癖」ではなく、ただの
// 直近の値なので、出すと読み違いのもとになる。
const MIN_TRIALS_FOR_MEAN = 3;

/**
 * 拍位相（0=拍の瞬間、1=次の拍の直前）から円の倍率を返す。
 *
 * 以前は scale = 0.85 + 0.15 * phase の単純な鋸歯だった。これだと
 *   - 円がいちばん大きくなるのは拍の「直前」
 *   - 拍の瞬間は 1.0 から 0.85 へ一気に縮む
 * となり、拍が「縮む」ことで表現されるうえ、あいだは等速で伸び続ける
 * だけなので、拍ではなく単なる繰り返しの往復に見えていた。
 *
 * 訓練用の合図として読めるよう、拍のたびに「着地 → 沈む → 待つ →
 * 溜める → 着地」という一巡りにする。倍率が最大になるのは拍の瞬間で、
 * 直前の溜めが「つぎ来るぞ」を伝える。判定には一切使わない見た目だけの
 * 計算で、音のスケジュール（AudioContext 基準）とは独立している。
 *
 * ただし最後の「溜め」だけは、測定条件によって切る（allowAnticipation）。
 *
 * 経緯: この曲線は「つぎ来るぞ」を伝えることを目的に設計されている
 * （detailed-design.md §7.4 の表）。一方で同じ設計書は「拍に同期して
 * 動く視覚を増やさないこと自体が要件」とも書いている——溜めは拍が来る
 * 前に拍の位置を教えるので、この2つは両立しない。放置すると
 * rawOffsetMs は「聴覚キューへの入力」ではなく「聴覚＋視覚キューへの
 * 入力」を測ってしまい、研究上の位置づけ（basic-design.md §6 の聴覚優先）
 * が崩れる。
 *
 * 分けかたは「拍より前か、後か」で引ける。着地と沈みは拍が**起きたこと**
 * を伝えるだけなので予告にならず、常に出してよい。溜めだけが唯一
 * 予告として働くので、視覚の手がかりを出す回（visualGuidance）に限る。
 */
export function beatPulseScale(phase, allowAnticipation) {
  const base = 0.86;
  const peak = 1;
  const decayUntil = 0.34; // 着地後、ここまでの区間で基準へ沈む
  const anticipateFor = 0.28; // 次の拍のこの手前から溜めはじめる

  if (phase < decayUntil) {
    // 着地の直後。ease-out で勢いよく沈み、だんだんゆっくりになる。
    const t = phase / decayUntil;
    const eased = 1 - (1 - t) ** 3;
    return peak + (base - peak) * eased;
  }

  // 予告を出さない回は、着地の後はずっと静止したまま次の着地を待つ。
  if (!allowAnticipation) return base;

  const anticipateFrom = 1 - anticipateFor;
  // 拍と拍のあいだは動かさない。この「静止」があることで、
  // 動きが拍の前後だけの出来事になり、往復運動に見えなくなる。
  if (phase < anticipateFrom) return base;

  // 次の拍へ向けた溜め。ease-in で、最大までは上げきらない
  // （上げきると着地の瞬間に差が出ず、拍が見えなくなる）。
  const t = (phase - anticipateFrom) / anticipateFor;
  return base + (peak - base) * 0.55 * t ** 2;
}

/**
 * AudioContext に予約した実際の拍列から、現在の円の倍率を返す。
 *
 * cued は「カウントイン → 押しどころ → 1.5拍ぶん休む」を試行ごとに
 * 繰り返すため、セッション開始から beatInterval の単純な剰余を取ると、
 * 2試行目以降の円が音と半拍ずれる。直前／直後に本当に鳴る2拍の間を
 * 0..1へ正規化すれば、休止を含む計画でも着地は必ず音の時刻になる。
 * 最終拍の後は、存在しない次の拍を予告しない。
 */
export function scheduledBeatPulseScale(
  nowAudioS,
  startAtS,
  audioBeats,
  fallbackIntervalS,
  allowAnticipation
) {
  const intervalS = Number.isFinite(fallbackIntervalS) && fallbackIntervalS > 0
    ? fallbackIntervalS
    : 1;
  const beatTimes = Array.isArray(audioBeats)
    ? audioBeats
        .map((beat) => startAtS + beat.timeS)
        .filter((timeS) => Number.isFinite(timeS))
    : [];
  if (!Number.isFinite(nowAudioS) || !Number.isFinite(startAtS) || !beatTimes.length) {
    return beatPulseScale(0.5, false);
  }

  let previousTimeS = beatTimes[0] - intervalS;
  let nextTimeS = null;
  for (const beatTimeS of beatTimes) {
    if (beatTimeS > nowAudioS) {
      nextTimeS = beatTimeS;
      break;
    }
    previousTimeS = beatTimeS;
  }

  // 最終拍の後は着地後の沈みだけを出し、架空の次拍へ溜めない。
  if (nextTimeS === null) {
    const phase = Math.max(0, Math.min(0.999999, (nowAudioS - previousTimeS) / intervalS));
    return beatPulseScale(phase, false);
  }

  const spanS = Math.max(Number.EPSILON, nextTimeS - previousTimeS);
  const phase = Math.max(0, Math.min(0.999999, (nowAudioS - previousTimeS) / spanS));
  return beatPulseScale(phase, allowAnticipation);
}

/** ステージの案内文言（gameId ごと、detailed-design.md §7.4）。 */
const STAGE_LABEL_KEYS = {
  "rhythm-l1": "stage.rhythm-l1",
  "rhythm-l2": "stage.rhythm-l2",
  gonogo: "stage.gonogo",
  calibration: "stage.calibration",
  default: "stage.rhythm-l1",
};

/** "r-YYYYMMDD-HHMMSS-xx" 形式のセッションID（detailed-design.md §9.2）。 */
function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 4);
  return `r-${datePart}-${timePart}-${rand}`;
}

/**
 * キャリブレーションは測定プロトコルそのものなので、支援者の難易度設定を
 * 一切受け付けない。
 *
 * ここは excludedTrialCount と同じ線引きを、bpm・拍数へも広げたもの。
 * 以前は excludedTrialCount だけを守っていたが、bpm と拍数は素通りしていた。
 * 難易度設定を設定画面へ出した時点で、支援者が「リズムを遅くした」つもりで
 * 基準オフセット測定の手順まで変えてしまえる状態になる。基準値そのものが
 * 変わると、それを窓中心補正に使う全セッションの判定が影響を受ける
 * （basic-design.md §7.3）。
 */
const PROTOCOL_LOCKED_GAME_IDS = new Set(["calibration"]);

/**
 * その回、画面から次の拍を予告する手がかりを出すか。ONなら通常練習用の
 * ノートレーンとパルス円の「溜め」を出し、OFFなら予告のない計器盤にする。
 * 押したあとのずれの目盛りは事後フィードバックなので、どちらにも出す。
 *
 * 通常練習の既定は ON（state.js）。測定モードでは difficultyMode.js が
 * 強制的に OFF へ解決し、予告のない版面で聴覚キューへの同期を測る。
 *
 * そくていは設定に関わらず常に OFF——PROTOCOL_LOCKED_GAME_IDS と同じ理由で、
 * 基準オフセットの測定手順そのものだから。ここで得た中央値は判定窓の中心
 * 補正として全セッションに効く（basic-design.md §7.3）。
 *
 * 実際に効いた値は session.config.visualGuidance に残す。
 */
export function resolveVisualGuidance(gameId, settings) {
  if (PROTOCOL_LOCKED_GAME_IDS.has(gameId)) return false;
  // そくていの回は、支援者が設定していても手がかりを出さない
  // （src/lib/difficultyMode.js）。測る回に視覚から拍の情報を足すと、
  // それは聴覚キューへの同期を測った回ではなくなる。
  return allowsVisualGuidance(settings);
}

/**
 * 画面に出すずれ（ms）。記録する rawOffsetMs とは別物なので関数を分けてある。
 *
 * なぜ生値をそのまま出さないか: 判定窓の中心は baselineOffsetMs のぶん
 * ずらしてある（basic-design.md §7.3）。基準が +80ms の利用者に生値を見せると、
 * 判定は当たっているのに画面はいつも「おそい」と言う——判定と表示が食い違う。
 * 当たり外れを決めているのと同じ量、つまり補正後の中心からのずれを出す。
 *
 * この変換は表示だけのもので、trial.rawOffsetMs は常に生値のまま記録する
 * （研究設計上の最重要規則。このファイル冒頭のコメント参照）。
 */
export function displayOffsetMs(rawOffsetMs, appliedBaselineMs) {
  if (typeof rawOffsetMs !== "number" || !Number.isFinite(rawOffsetMs)) return null;
  const baseline = typeof appliedBaselineMs === "number" ? appliedBaselineMs : 0;
  return rawOffsetMs - baseline;
}

/** 優先順位: settings のリズム系設定（null 以外）＞ rhythmPresets（detailed-design.md §7.1）。 */
export function resolveParams(gameId, settings) {
  const preset = rhythmPresets[gameId];
  const overridable = !PROTOCOL_LOCKED_GAME_IDS.has(gameId);
  const override = (settingValue, presetValue) =>
    overridable ? settingValue ?? presetValue : presetValue;
  // そくていの回は protocol 固定、れんしゅうの回は支援者の設定 → 既定の順。
  // calibration は overridable=false なので、どちらの回でも preset のまま。
  const difficulty = overridable
    ? resolveRhythmDifficulty(gameId, settings, preset)
    : { bpm: preset.bpm, countInBeats: preset.countInBeats, targetBeats: preset.targetBeats };
  return {
    mode: preset.mode,
    bpm: override(difficulty.bpm, preset.bpm),
    countInBeats: override(difficulty.countInBeats, preset.countInBeats),
    targetBeats: override(difficulty.targetBeats, preset.targetBeats),
    goRatio: preset.goRatio ?? null,
    // キャリブレーション専用（detailed-design.md §8.2）。settings 側の上書きは
    // 用意しない（利用者が調整する値ではなく、測定プロトコル自体の一部のため）。
    excludedTrialCount: preset.excludedTrialCount ?? 0,
  };
}

/**
 * mode="cued" の1セッション分のビート計画を作る（detailed-design.md §6.4）。
 * 各試行: 低音 × countInBeats → 高音（押しどころ）1回 → 1.5×beatInterval の休止。
 *
 * @returns {{
 *   audioBeats: Array<{index:number, timeS:number, tone:number, gain:number}>,
 *   judgedBeats: Array<{index:number, kind:"go", timeS:number}>,
 *   beatIntervalS: number,
 * }}
 */
function buildCuedPlan({ bpm, countInBeats, targetBeats }) {
  const beatIntervalS = 60 / bpm;
  const trialPeriodS = (countInBeats + TRIAL_GAP_BEATS) * beatIntervalS;
  const audioBeats = [];
  const judgedBeats = [];
  let runningIndex = 0;

  for (let trial = 0; trial < targetBeats; trial += 1) {
    const trialStartS = trial * trialPeriodS;
    for (let k = 0; k < countInBeats; k += 1) {
      audioBeats.push({
        index: runningIndex,
        timeS: trialStartS + k * beatIntervalS,
        tone: cueTones.low,
        gain: FEEDBACK_GAIN_HIT,
      });
      runningIndex += 1;
    }
    const highTimeS = trialStartS + countInBeats * beatIntervalS;
    audioBeats.push({ index: runningIndex, timeS: highTimeS, tone: cueTones.high, gain: FEEDBACK_GAIN_HIT });
    runningIndex += 1;
    judgedBeats.push({ index: trial, kind: "go", timeS: highTimeS });
  }

  // 除外境界の「持ち分」（isExcludedTrial / excludedBoundaryRelMs）。
  // cued では1試行が「自分のカウントイン → 高音 → 休止」で、休止は前の試行の
  // 後始末なので、ある試行に属する区間は高音の countInBeats 拍前から始まる。
  return {
    audioBeats,
    judgedBeats,
    beatIntervalS,
    trialPeriodS,
    excludedLeadS: countInBeats * beatIntervalS,
  };
}

/**
 * mode="continuous" の1セッション分のビート計画を作る（detailed-design.md §6.4）。
 * カウントイン（低音 × countInBeats）は最初の1回のみ。以後は高音（押しどころ）が
 * beatInterval ごとに targetBeats 回連続する（試行間の休止はない、cued との違い）。
 *
 * @returns buildCuedPlan と同じ形（trialPeriodS は無し。試行の概念が無いため）。
 */
function buildContinuousPlan({ bpm, countInBeats, targetBeats }) {
  const beatIntervalS = 60 / bpm;
  const audioBeats = [];
  const judgedBeats = [];
  let runningIndex = 0;

  for (let k = 0; k < countInBeats; k += 1) {
    audioBeats.push({
      index: runningIndex,
      timeS: k * beatIntervalS,
      tone: cueTones.low,
      gain: FEEDBACK_GAIN_HIT,
    });
    runningIndex += 1;
  }

  for (let i = 0; i < targetBeats; i += 1) {
    const timeS = (countInBeats + i) * beatIntervalS;
    audioBeats.push({ index: runningIndex, timeS, tone: cueTones.high, gain: FEEDBACK_GAIN_HIT });
    runningIndex += 1;
    judgedBeats.push({ index: i, kind: "go", timeS });
  }

  // 拍が切れ目なく続くので、ある拍に属する区間はその拍の半拍前から
  // （隣り合う拍のちょうど中間で分ける）。
  return { audioBeats, judgedBeats, beatIntervalS, excludedLeadS: beatIntervalS / 2 };
}

/**
 * mode="gonogo" の1セッション分のビート計画を作る（detailed-design.md §6.4）。
 * カウントイン（低音 × countInBeats）は最初の1回のみ。以後、高音（Go）／
 * 低音330Hz（No-Go）を goRatio に従って targetBeats 回並べる。
 * 乱数列（Go/No-Go の種類の列）はここで1回だけ生成し、plan.seedSequence として
 * 返す（呼び出し側の mount() が session.config.seedSequence に全量記録する。
 * detailed-design.md §9.2、MUST）。連続 No-Go は2回まで
 * （judge.js の generateGoNoGoSequence が構成的に保証する。§5節参照）。
 *
 * @returns buildCuedPlan と同じ形 ＋ seedSequence（Array<"go"|"nogo">）
 */
function buildGonogoPlan({ bpm, countInBeats, targetBeats, goRatio }) {
  const beatIntervalS = 60 / bpm;
  const audioBeats = [];
  const judgedBeats = [];
  let runningIndex = 0;

  for (let k = 0; k < countInBeats; k += 1) {
    audioBeats.push({
      index: runningIndex,
      timeS: k * beatIntervalS,
      tone: cueTones.low,
      gain: FEEDBACK_GAIN_HIT,
    });
    runningIndex += 1;
  }

  const sequence = generateGoNoGoSequence(targetBeats, goRatio);
  sequence.forEach((kind, i) => {
    const timeS = (countInBeats + i) * beatIntervalS;
    const tone = kind === "go" ? cueTones.high : cueTones.noGo;
    audioBeats.push({ index: runningIndex, timeS, tone, gain: FEEDBACK_GAIN_HIT });
    runningIndex += 1;
    judgedBeats.push({ index: i, kind, timeS });
  });

  return {
    audioBeats,
    judgedBeats,
    beatIntervalS,
    seedSequence: sequence,
    excludedLeadS: beatIntervalS / 2,
  };
}

/** mode に応じてビート計画のビルダーを振り分ける（detailed-design.md §7.1、P4）。 */
export function buildPlan(params) {
  if (params.mode === "continuous") return buildContinuousPlan(params);
  if (params.mode === "gonogo") return buildGonogoPlan(params);
  return buildCuedPlan(params);
}

/**
 * 除外区間の終わり（セッション相対ms）。beatIndex を持たない extra を
 * 除外するかどうかの判定にだけ使う（isExcludedTrial）。
 *
 * 実際に鳴る拍の時刻から引く。以前は「除外試行数 × 試行の長さ」を直に
 * 掛けていたが、それだと (1) trialPeriodS を返す cued でしか値が出ず、
 * continuous では -Infinity ＝ extra が一度も除外されない、(2) 予約開始
 * （plan.startAt）と計時の基準（sessionStartAudioMs）のずれも落ちる。
 * 最初の非除外拍が「自分の区間」を持ちはじめる時刻が求める境界そのもの
 * なので、そこから持ち分（excludedLeadS）を引く。
 *
 * @param {number} excludedTrialCount 集計から外す先頭の拍数
 * @param {number|undefined} firstIncludedScheduledMs 最初の非除外拍の予定時刻
 *   （セッション相対ms）。除外数が拍数以上なら undefined になる
 * @param {number} excludedLeadMs その拍に属する区間が何ms手前から始まるか
 * @returns {number} これ未満のセッション相対時刻に来た extra を除外する
 */
export function computeExcludedBoundaryRelMs(
  excludedTrialCount,
  firstIncludedScheduledMs,
  excludedLeadMs
) {
  if (!(excludedTrialCount > 0)) return -Infinity; // 除外なし
  if (typeof firstIncludedScheduledMs !== "number" || !Number.isFinite(firstIncludedScheduledMs)) {
    // 除外数が拍数以上（設定ミス）。非除外の拍が1つも無いので「境界より前＝
    // 除外」の側へ倒す。黙って全部を有効試行にしない。
    return Infinity;
  }
  return firstIncludedScheduledMs - excludedLeadMs;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, mean) {
  if (values.length < 2 || mean === null) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * セッションの summary を trials から都度再計算する（detailed-design.md §9.2、規則5の分母）。
 * excluded:true の行（キャリブレーションの最初の数試行、detailed-design.md §8.2）は
 * 全指標から除外する。他モードは excluded が常に false のため挙動は変わらない。
 */
function computeSummary(trials) {
  const included = trials.filter((trial) => !trial.excluded);
  const hits = included.filter((trial) => trial.judgment === "hit");
  const misses = included.filter((trial) => trial.judgment === "miss").length;
  const extras = included.filter((trial) => trial.judgment === "extra").length;
  const commissions = included.filter((trial) => trial.judgment === "commission").length;
  const correctRejections = included.filter((trial) => trial.judgment === "correctRejection").length;
  const goCount = included.filter((trial) => trial.beatKind === "go").length;
  const nogoCount = included.filter((trial) => trial.beatKind === "nogo").length;
  const rawOffsets = hits
    .map((trial) => trial.rawOffsetMs)
    .filter((value) => typeof value === "number");
  const meanRawOffsetMs = average(rawOffsets);

  return {
    hits: hits.length,
    misses,
    extras,
    commissions,
    correctRejections,
    goHitRate: goCount ? hits.length / goCount : 0,
    commissionRate: nogoCount ? commissions / nogoCount : 0,
    meanRawOffsetMs,
    sdRawOffsetMs: standardDeviation(rawOffsets, meanRawOffsetMs),
    medianRawOffsetMs: median(rawOffsets),
  };
}

/**
 * @param {string} gameId - "rhythm-l1" | "rhythm-l2" | "gonogo" | "calibration"
 *   （rhythmPresets のキー。games/gonogo.js・games/calibration.js は
 *   このファクトリをそのまま呼ぶ薄いラッパ）
 * @returns {(ctx: import("./gameHost.js").GameCtx) => import("./gameHost.js").GameInstance}
 */
export function createRhythmGame(gameId) {
  return function create(ctx) {
    const { settings, audio, announce, voiceFeedback, logTrial, finish, setProgress, t, tHtml } = ctx;

    let stageEl = null;
    let pulseEl = null;
    let offsetTrackEl = null;
    let offsetMeanEl = null;
    let rhythmVisuals = null;
    let visualPresentation = "instrument";
    let rafId = null;
    let destroyed = false;
    let hitFlashTimer = null;
    let finishTimer = null;
    // 画面から拍の手がかりを出すか（resolveVisualGuidance）。mount() で
    // 1回だけ確定させ、セッションの途中では変えない——途中で切り替わると、
    // その回の記録がどちらの条件だったのか言えなくなる。
    let visualGuidance = false;
    // 動きを減らす設定。パルス円は rAF が毎フレーム transform を書くので、
    // CSS の @media prefers-reduced-motion では止まらない。
    let reduceMotion = false;

    // セッション文脈（mount() で1回だけ確定する。detailed-design.md §6.3）。
    let plan = null;
    let remainingBeats = [];
    let beatKindByIndex = new Map();
    let scheduledMsByIndex = new Map();
    let sessionStartAudioMs = 0;
    let anchorPerfMs = 0;
    let session = null;
    let params = null;
    let effectiveWindowMs = 0;
    // キャリブレーション専用（detailed-design.md §8.2）。0 なら常に非除外
    // （rhythm-l1/l2/gonogo は preset に excludedTrialCount が無いので常に0）。
    let excludedTrialCount = 0;
    let excludedBoundaryRelMs = -Infinity;

    /** 入力/現在時刻（audio絶対ms）→ セッション相対ms（記録用、§6.3）。 */
    function toSessionRelativeMs(absMs) {
      return absMs - sessionStartAudioMs;
    }

    /**
     * 最初の excludedTrialCount 試行を集計から除外する判定（キャリブレーション専用、
     * detailed-design.md §8.2）。beatIndex が確定している判定（hit/miss/
     * commission/correctRejection）は試行番号そのもので判定する。extra
     * （beatIndex=null）は「除外対象の試行区間内で起きた余分な入力か」を
     * セッション相対時刻の境界で判定する。
     */
    function isExcludedTrial(beatIndex, relativeMs) {
      if (excludedTrialCount <= 0) return false;
      if (beatIndex !== null && beatIndex !== undefined) return beatIndex < excludedTrialCount;
      return typeof relativeMs === "number" && relativeMs < excludedBoundaryRelMs;
    }

    /**
     * ずれの目盛り（detailed-design.md §7.4）。
     *
     * 「拍に同期して動く視覚を増やさない」という要件（basic-design.md §6）を
     * 破らずに、この課題が計測であることを画面に出すための版面。破らずに済む
     * のは、目盛りに現れるものが全部**押したあと**の出来事だからで、
     *   - 印が出るのは利用者が押した瞬間（拍の瞬間ではない）
     *   - 印は出たあと動かない
     *   - 次の拍がいつ来るかは、目盛りのどこにも書かれていない
     * ——予告として使える情報がひとつも無い。合図はあくまで音のまま。
     *
     * 目盛りの幅は判定窓（±effectiveWindowMs）そのものにしてある。枠の中に
     * 入っていれば当たり、外れれば枠の端。当たり外れの理由が位置で読める。
     */
    function renderOffsetScale() {
      return `
        <div class="rhythm-offset" aria-hidden="true">
          <div class="rhythm-offset-track">
            <span class="rhythm-offset-center"></span>
            <span class="rhythm-offset-mean" hidden></span>
          </div>
          <div class="rhythm-offset-legend">
            <span>${tHtml("scale.early")}</span>
            <span>${tHtml("scale.onTime")}</span>
            <span>${tHtml("scale.late")}</span>
          </div>
        </div>
      `;
    }

    /**
     * 音が出せない端末で、課題を始められない理由を画面に出す。
     *
     * 出す相手は支援者。利用者向けのひらがなだけで書くと「おとが でないよ」
     * にしかならず、どうすればいいかが伝わらない。この画面に来る時点で
     * 支援者が同席している前提なので、原因と次の手を書く。
     */
    function renderUnavailable(audioState) {
      if (!stageEl) return;
      rhythmVisuals?.destroy();
      rhythmVisuals = null;
      pulseEl = null;
      offsetTrackEl = null;
      offsetMeanEl = null;
      stageEl.classList.remove("module-rhythm");
      // 原因で次の手が変わるので書き分ける。音が「使えない端末」なら端末を
      // 変えるしかないが、「止まっている」だけなら消音スイッチや音量、
      // 割り込みを直せばその場で続けられる。
      const stopped = audioState === "suspended" || audioState === "interrupted";
      const why = stopped
        ? "音が止まっているため、リズムの課題は始められません。ほかのアプリの音や着信、消音スイッチ、音量を確認してください。"
        : "この端末では音を鳴らす機能が使えないため、リズムの課題は始められません。";
      stageEl.innerHTML = `
        <div class="game-unavailable">
          <strong>おとが ならせません</strong>
          <p>${why} 合図が音なので、続けても測定になりません。</p>
          <p class="game-unavailable-hint">
            右上の「おわる」で もどれます。${
              stopped ? "直したあと、もう一度えらんでください。" : "音の出る端末で もう一度おためしください。"
            }
          </p>
        </div>
      `;
      announce("音が鳴らせないため、リズムの課題を始められません");
    }

    function mountStageVisuals() {
      rhythmVisuals = createRhythmVisuals({
        gameId,
        visualGuidance,
        reduceMotion,
        measurement: gameId === "calibration" || resolveDifficultyMode(settings) === "measure",
        exactToleranceMs: EXACT_TOLERANCE_MS,
        t,
      });
      const mounted = rhythmVisuals.mount(stageEl, {
        titleHtml: tHtml(`tile.${gameId}.title`),
        instructionHtml: tHtml(STAGE_LABEL_KEYS[gameId] || STAGE_LABEL_KEYS.default),
        offsetMarkup: renderOffsetScale(),
      });
      pulseEl = mounted.pulseEl;
      offsetTrackEl = mounted.offsetTrackEl;
      offsetMeanEl = mounted.offsetMeanEl;
      visualPresentation = rhythmVisuals.profile;
    }

    /** 目盛りの上の位置（0=左端＝いちばん早い, 1=右端＝いちばん遅い）。 */
    function offsetToTrackRatio(offsetMs) {
      if (!effectiveWindowMs) return 0.5;
      const clamped = Math.max(-1, Math.min(1, offsetMs / effectiveWindowMs));
      return (clamped + 1) / 2;
    }

    /** 1回ぶんの入力を目盛りへ落とす。出したあとは動かさない。 */
    function addOffsetMark(offsetMs) {
      if (!offsetTrackEl) return;
      const mark = document.createElement("span");
      mark.className = "rhythm-offset-mark";
      // ずれの向きで色を分ける。--early / --late は支援者側のグラフでも同じ
      // 色を使い、2つの世界で同じ意味を持たせている（styles.css のトークン）。
      if (offsetMs < -EXACT_TOLERANCE_MS) mark.classList.add("is-early");
      else if (offsetMs > EXACT_TOLERANCE_MS) mark.classList.add("is-late");
      else mark.classList.add("is-exact");
      mark.style.left = `${(offsetToTrackRatio(offsetMs) * 100).toFixed(2)}%`;

      // 直前の印から「いちばん新しい」印を外す。新しいものだけが目立って
      // いれば、いま押したのがどれかが分かる。
      offsetTrackEl.querySelector(".rhythm-offset-mark.is-latest")?.classList.remove("is-latest");
      mark.classList.add("is-latest");
      offsetTrackEl.append(mark);

      // 拍数は支援者が設定で伸ばせる（最大200）。全部残すと目盛りが黒く
      // 潰れて読めなくなるので、古いものから落とす。
      const marks = offsetTrackEl.querySelectorAll(".rhythm-offset-mark");
      if (marks.length > MAX_OFFSET_MARKS) marks[0].remove();
      updateOffsetMean();
    }

    /**
     * これまでの平均のずれ。支援者が「この子は早めに出る癖がある」を
     * その場で読めるようにするための印で、利用者向けの表示ではない
     * （支援者が常に同席する前提。basic-design.md）。
     */
    function updateOffsetMean() {
      if (!offsetMeanEl || !session) return;
      const offsets = session.trials
        .filter((trial) => !trial.excluded && trial.judgment === "hit")
        .map((trial) => displayOffsetMs(trial.rawOffsetMs, trial.appliedBaselineMs))
        .filter((value) => typeof value === "number");
      if (offsets.length < MIN_TRIALS_FOR_MEAN) {
        offsetMeanEl.hidden = true;
        return;
      }
      offsetMeanEl.hidden = false;
      offsetMeanEl.style.left = `${(offsetToTrackRatio(average(offsets)) * 100).toFixed(2)}%`;
    }

    function flashHit() {
      if (!pulseEl) return;
      pulseEl.classList.add("is-hit-flash");
      window.clearTimeout(hitFlashTimer);
      // 120ms だと styles.css の波紋アニメーション（rhythm-hit-ripple、320ms）が
      // 途中で切れる。クラスが外れると animation も止まるため、波紋が
      // 一周する長さに合わせる。判定・記録には一切関与しない見た目だけの値で、
      // 最短の拍間隔（L2 の bpm 60 = 1000ms）より十分短い。
      hitFlashTimer = window.setTimeout(() => {
        pulseEl?.classList.remove("is-hit-flash");
      }, 340);
    }

    function updatePulseVisual(nowAudioAbsMs) {
      if (!pulseEl || !plan) return;
      // 計器盤は予告のない測定面なので、音の前後を含めて円を動かさない。
      // 動きを減らす設定も同じ静止表示にする。CSS の @media だけでは、rAF が
      // 毎フレーム書く transform を止められないためJS側で固定する。
      if (reduceMotion || visualPresentation === "instrument") {
        pulseEl.style.transform = "scale(0.93)";
        return;
      }
      const scale = scheduledBeatPulseScale(
        nowAudioAbsMs / 1000,
        plan.startAt,
        plan.audioBeats,
        plan.beatIntervalS,
        visualGuidance
      );
      pulseEl.style.transform = `scale(${scale.toFixed(3)})`;
    }

    function updateProgressText() {
      if (!session) return;
      // 単位を付ける。数字だけだと、残りの拍数なのか秒数なのか点数なのかが
      // 読み取れない（L1 は1回押すまでに4.2秒かかるので、秒と取り違えると
      // 「進んでいない」と見える）。
      //
      // 更新の起きる時刻は今までと同じ（拍が消化／期限切れになった瞬間）。
      // ここを拍の手前で動かすと予告になるので、表示の形だけを変える。
      setProgress(t("progress.remainingCount", { n: remainingBeats.length }));
    }

    /** 1件の trial 行をセッションへ追加し、gameHost へ永続化を依頼する。 */
    function recordTrial(row) {
      session.trials.push({ index: session.trials.length, ...row });
      session.summary = computeSummary(session.trials);
      logTrial(session);
    }

    function playFeedback(judgment) {
      const atTime = audio.scheduler.now();
      if (judgment === "hit") {
        audio.playToneAt(cueTones.hit, atTime, FEEDBACK_GAIN_HIT);
        flashHit();
      } else if (judgment === "miss" || judgment === "extra" || judgment === "commission") {
        // miss/extra は§5.3どおり小音量・短音。連続失敗でも音量を上げない（罰的にしない）。
        audio.playToneAt(cueTones.miss, atTime, FEEDBACK_GAIN_MISS);
      }
    }

    function finalizeIfComplete() {
      if (remainingBeats.length > 0) return false;
      if (session.finished) return true;
      session.finished = true;
      session.summary = computeSummary(session.trials);
      logTrial(session);
      stopLoop();
      audio.scheduler.stop();
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        if (destroyed) return;
        const percent = Math.round((session.summary.goHitRate || 0) * 100);
        voiceFeedback(t("rhythm.voice.finish", { n: percent }));
        finish(session.summary);
      }, RHYTHM_FINAL_FEEDBACK_MS);
      return true;
    }

    function stopLoop() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function loop() {
      if (destroyed || !session || session.finished) return;
      const nowAudioAbsMs = audio.scheduler.now() * 1000;
      const baselineNow = settings.baselineOffsetMs;

      const expired = sweepExpired(nowAudioAbsMs, remainingBeats, effectiveWindowMs, baselineNow);
      if (expired.length) {
        const expiredIndexes = new Set(expired.map((entry) => entry.beatIndex));
        remainingBeats = remainingBeats.filter((beat) => !expiredIndexes.has(beat.index));
        expired.forEach((entry) => {
          recordTrial({
            beatIndex: entry.beatIndex,
            beatKind: beatKindByIndex.get(entry.beatIndex),
            scheduledMs: scheduledMsByIndex.get(entry.beatIndex),
            inputMs: null,
            rawOffsetMs: null,
            appliedBaselineMs: baselineNow,
            judgment: entry.judgment,
            excluded: isExcludedTrial(entry.beatIndex, scheduledMsByIndex.get(entry.beatIndex)),
          });
          rhythmVisuals?.showJudgment({
            judgment: entry.judgment,
            beatIndex: entry.beatIndex,
            offsetMs: null,
          });
        });
      }

      rhythmVisuals?.tick(nowAudioAbsMs);
      updatePulseVisual(nowAudioAbsMs);
      updateProgressText();

      if (finalizeIfComplete()) return;
      rafId = window.requestAnimationFrame(loop);
    }

    // 引数名を t にしない: このスコープには文言を引く ctx.t がいる
    // （crane で実際に踏んだ。tests/i18n.test.mjs の shadow 検査を参照）。
    function handleInput(perfMs, _source) {
      if (destroyed || !session || session.finished) return;
      // §6.3: 入力時刻(performance.now()) → audio絶対時刻(ms) への変換をここに集約。
      const inputAbsMs = perfMs - anchorPerfMs + sessionStartAudioMs;
      const baselineNow = settings.baselineOffsetMs;
      const result = judgeInput(inputAbsMs, remainingBeats, effectiveWindowMs, baselineNow);
      const shownOffsetMs = result.judgment === "hit"
        ? displayOffsetMs(result.raw, baselineNow)
        : null;

      if (result.beatIndex !== null) {
        remainingBeats = remainingBeats.filter((beat) => beat.index !== result.beatIndex);
      }

      recordTrial({
        beatIndex: result.beatIndex,
        beatKind: result.beatIndex !== null ? beatKindByIndex.get(result.beatIndex) : null,
        scheduledMs: result.beatIndex !== null ? scheduledMsByIndex.get(result.beatIndex) : null,
        inputMs: toSessionRelativeMs(inputAbsMs),
        rawOffsetMs: result.raw, // 生値。baselineOffsetMsは差し引かない（研究設計上の最重要規則）
        appliedBaselineMs: baselineNow,
        judgment: result.judgment,
        excluded: isExcludedTrial(result.beatIndex, toSessionRelativeMs(inputAbsMs)),
      });

      // 当たった入力だけ目盛りへ落とす。
      //
      // extra（拍と結び付かない余分な入力）と commission（No-Go で押した）は
      // 除く。どちらも「どの拍からどれだけずれたか」が定義できないので、
      // 目盛りの上に置くと位置が意味を持たない印になる。数としては summary に
      // 出ているし、音でもその場で返している（playFeedback）。
      if (result.judgment === "hit") {
        if (shownOffsetMs !== null) addOffsetMark(shownOffsetMs);
      }

      rhythmVisuals?.showJudgment({
        judgment: result.judgment,
        beatIndex: result.beatIndex,
        offsetMs: shownOffsetMs,
      });
      playFeedback(result.judgment);
      updateProgressText();
      finalizeIfComplete();
    }

    function mount(el) {
      stageEl = el;
      // 版面（通常練習のノートレーンか、予告のない計器盤か）が
      // visualGuidance で変わるので、描くより先に確定させる。
      visualGuidance = resolveVisualGuidance(gameId, settings);
      reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      params = resolveParams(gameId, settings);
      effectiveWindowMs = computeEffectiveWindowMs(params.mode, params.bpm, settings.judgmentWindowMs);
      plan = buildPlan(params);
      excludedTrialCount = params.excludedTrialCount || 0;
      mountStageVisuals();

      // §6.3: 対応ペアの取得は「セッション開始時に1回」。perfMs/audioS を
      // 隣接する行で取得し、以降のずれ（クロックドリフト）は許容誤差内とする。
      anchorPerfMs = performance.now();
      const startAt = audio.scheduler.start({ beats: plan.audioBeats });

      // AudioContext が使えない環境では start() が null を返す（audio.js）。
      //
      // このとき now() も常に 0 を返すので、拍は一度も鳴らず、円も脈打たず、
      // 判定窓を過ぎた拍が期限切れにならない——remainingBeats が減らないので
      // finalizeIfComplete() が永久に成立せず、「のこり 10」のまま二度と
      // 終わらない画面になる。合図が音である課題なので、音が出ない時点で
      // 続行しても測定にならない。黙って壊れるのではなく、理由を出して
      // 支援者に判断を返す（画面が状態を伝える、という全体の方針）。
      // 合図が鳴らせない状態は2つある。どちらも「押した分だけがデータになる」
      // という同じ結果になるので、まとめてここで止める。
      //   1. AudioContext が無い（start() が null）
      //   2. AudioContext はあるが鳴らない（suspended / interrupted）
      // 2 は iOS でだけ起きる——他アプリの割り込みや着信、自動再生制限の
      // 解除しそこね。context は存在するので、有無だけを見るガードは
      // 素通りする。ヘッドレスでは再現しないので CI にも出てこない。
      if (startAt === null || !audio.scheduler.canSound()) {
        audio.scheduler.stop();
        renderUnavailable(audio.scheduler.state());
        return;
      }

      sessionStartAudioMs = audio.scheduler.now() * 1000;
      plan.startAt = startAt;

      plan.judgedBeats.forEach((beat) => {
        beatKindByIndex.set(beat.index, beat.kind);
        scheduledMsByIndex.set(beat.index, (plan.startAt + beat.timeS) * 1000 - sessionStartAudioMs);
      });
      excludedBoundaryRelMs = computeExcludedBoundaryRelMs(
        excludedTrialCount,
        scheduledMsByIndex.get(excludedTrialCount),
        plan.excludedLeadS * 1000
      );

      remainingBeats = plan.judgedBeats.map((beat) => ({
        index: beat.index,
        kind: beat.kind,
        timeMs: (plan.startAt + beat.timeS) * 1000,
      }));
      rhythmVisuals.setBeats(remainingBeats, plan.beatIntervalS);

      session = {
        sessionId: generateSessionId(),
        taskType: gameId === "gonogo" ? "gonogo" : "sms",
        gameId,
        participantId: ctx.participantId || "",
        startedAtIso: new Date().toISOString(),
        aborted: false,
        // finished は §9.2 のスキーマに無い内部フラグ（destroy() が finish() 経由の
        // 正常終了と中断を区別するためだけに使う）。state.sessions へは
        // そのまま保存されるが、CSV/リザルト表示は aborted/summary/trials しか
        // 参照しないため実害はない。
        finished: false,
        config: {
          bpm: params.bpm,
          countInBeats: params.countInBeats,
          targetBeats: params.targetBeats,
          judgmentWindowMs: settings.judgmentWindowMs,
          effectiveWindowMs,
          baselineOffsetMs: settings.baselineOffsetMs,
          mode: params.mode,
          goRatio: params.goRatio,
          // その回、画面から次の拍を予告していたか（ノートレーン＋溜め）。
          // 出していた回は聴覚だけへの同期ではないので、測定とは別条件になる。
          // 記録に残さないと、あとから2つの回を区別できない。
          visualGuidance,
          // 通常練習のノートレーンか、予告のない計器盤か。見た目を変えても
          // 同じ測定条件として混ぜないよう、実際に使った版面を保存する。
          visualPresentation,
          // そくてい／れんしゅうのどちらの回か（src/lib/difficultyMode.js）。
          // 解析ではまず measure だけを見ればよい——これが「主要測定の条件を
          // 固定する」ということ。
          difficultyMode: resolveDifficultyMode(settings),
          // そくていに入る前の成立確認が通っていたか（src/lib/readinessCheck.js）。
          // 通っていない状態でも測定は止めない代わりに、どちらだったかを必ず
          // 残す。成績が低かった回について「規則を理解していなかったのでは」を
          // 後から検討できるのは、この列があるときだけ。
          measurementReadiness: ctx.readiness || "n/a",
          // gonogo のみ generateGoNoGoSequence() の結果を持つ（再現性、MUST）。
          seedSequence: plan.seedSequence || [],
        },
        device: audio.getDeviceInfo(),
        trials: [],
      };

      announce(t("rhythm.voice.start"));
      updateProgressText();
      rafId = window.requestAnimationFrame(loop);
    }

    function destroy() {
      if (destroyed) return; // 冪等（detailed-design.md §3.2 MUST）
      destroyed = true;
      stopLoop();
      window.clearTimeout(hitFlashTimer);
      window.clearTimeout(finishTimer);
      finishTimer = null;
      audio.scheduler.stop();
      rhythmVisuals?.destroy();
      rhythmVisuals = null;

      // finish() を経由せずに destroy() が呼ばれた = 支援者操作/Esc/
      // visibilitychange による中断（detailed-design.md §7.3、MUST）。
      // 直前までの trials を aborted:true で確定させ、途中再開はしない。
      if (session && !session.finished) {
        session.aborted = true;
        session.summary = computeSummary(session.trials);
        logTrial(session);
      }

      if (stageEl) {
        // 次のゲームへ版面の印を持ち越さない（colorLegacy の module-color と同じ作法）。
        stageEl.classList.remove("module-rhythm");
        stageEl.innerHTML = "";
      }
      stageEl = null;
      pulseEl = null;
      offsetTrackEl = null;
      offsetMeanEl = null;
    }

    return { mount, handleInput, destroy };
  };
}
