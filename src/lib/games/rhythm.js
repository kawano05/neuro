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
  judgeInput,
  sweepExpired,
  computeEffectiveWindowMs,
  computeBeatIntervalMs,
  generateGoNoGoSequence,
} from "./judge.js";

// フィードバック音（detailed-design.md §5.3）: hit は既定音量、miss/extra は
// 小音量・短めにして罰的にしない。
const FEEDBACK_GAIN_HIT = 0.05;
const FEEDBACK_GAIN_MISS = 0.018;

// 試行間の休止は beatInterval の1.5倍（detailed-design.md §6.4）。
const TRIAL_GAP_BEATS = 1.5;

/** ステージの案内文言（gameId ごと、detailed-design.md §7.4）。 */
const STAGE_LABELS = {
  "rhythm-l1": "おとに あわせて おそう",
  "rhythm-l2": "おとに あわせて つづけて おそう",
  gonogo: "たかい おとの ときだけ おそう",
  calibration: "おとに あわせて おそう",
  default: "おとに あわせて おそう",
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

/** 優先順位: settings のリズム系設定（null 以外）＞ rhythmPresets（detailed-design.md §7.1）。 */
function resolveParams(gameId, settings) {
  const preset = rhythmPresets[gameId];
  return {
    mode: preset.mode,
    bpm: settings.rhythmBpm ?? preset.bpm,
    countInBeats: settings.countInBeats ?? preset.countInBeats,
    targetBeats: settings.targetBeats ?? preset.targetBeats,
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

  return { audioBeats, judgedBeats, beatIntervalS, trialPeriodS };
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

  return { audioBeats, judgedBeats, beatIntervalS };
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

  return { audioBeats, judgedBeats, beatIntervalS, seedSequence: sequence };
}

/** mode に応じてビート計画のビルダーを振り分ける（detailed-design.md §7.1、P4）。 */
function buildPlan(params) {
  if (params.mode === "continuous") return buildContinuousPlan(params);
  if (params.mode === "gonogo") return buildGonogoPlan(params);
  return buildCuedPlan(params);
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
    const { settings, audio, announce, logTrial, finish, setProgress } = ctx;

    let stageEl = null;
    let pulseEl = null;
    let rafId = null;
    let destroyed = false;
    let hitFlashTimer = null;

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

    function renderStageMarkup() {
      stageEl.innerHTML = `
        <div class="rhythm-pulse" aria-hidden="true"></div>
        <span class="reaction-label">${STAGE_LABELS[gameId] || STAGE_LABELS.default}</span>
      `;
      pulseEl = stageEl.querySelector(".rhythm-pulse");
    }

    function flashHit() {
      if (!pulseEl) return;
      pulseEl.classList.add("is-hit-flash");
      window.clearTimeout(hitFlashTimer);
      hitFlashTimer = window.setTimeout(() => {
        pulseEl?.classList.remove("is-hit-flash");
      }, 120);
    }

    function updatePulseVisual(nowAudioAbsMs) {
      if (!pulseEl || !plan) return;
      const elapsedS = nowAudioAbsMs / 1000 - plan.startAt;
      const interval = plan.beatIntervalS;
      const phase = (((elapsedS % interval) + interval) % interval) / interval;
      const scale = 0.85 + 0.15 * phase;
      pulseEl.style.transform = `scale(${scale.toFixed(3)})`;
    }

    function updateProgressText() {
      if (!session) return;
      setProgress(`のこり ${remainingBeats.length}`);
    }

    /** 1件の trial 行をセッションへ追加し、gameHost へ永続化を依頼する。 */
    function recordTrial(row) {
      session.trials.push(row);
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
      session.finished = true;
      session.summary = computeSummary(session.trials);
      logTrial(session);
      stopLoop();
      audio.scheduler.stop();
      const percent = Math.round((session.summary.goHitRate || 0) * 100);
      announce(`おわりました。たっせいりつ ${percent}パーセント`);
      finish(session.summary);
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
        });
      }

      updatePulseVisual(nowAudioAbsMs);
      updateProgressText();

      if (finalizeIfComplete()) return;
      rafId = window.requestAnimationFrame(loop);
    }

    function handleInput(t /* performance.now() ms */, _source) {
      if (destroyed || !session || session.finished) return;
      // §6.3: 入力時刻(performance.now()) → audio絶対時刻(ms) への変換をここに集約。
      const inputAbsMs = t - anchorPerfMs + sessionStartAudioMs;
      const baselineNow = settings.baselineOffsetMs;
      const result = judgeInput(inputAbsMs, remainingBeats, effectiveWindowMs, baselineNow);

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

      playFeedback(result.judgment);
      updateProgressText();
      finalizeIfComplete();
    }

    function mount(el) {
      stageEl = el;
      renderStageMarkup();

      params = resolveParams(gameId, settings);
      effectiveWindowMs = computeEffectiveWindowMs(params.mode, params.bpm, settings.judgmentWindowMs);
      plan = buildPlan(params);
      excludedTrialCount = params.excludedTrialCount || 0;
      // trialPeriodS は cued（buildCuedPlan）のみが返す。continuous/gonogo は
      // excludedTrialCount が常に0（content.js の rhythmPresets 参照）なので
      // この境界値は使われない。
      excludedBoundaryRelMs =
        excludedTrialCount > 0 && typeof plan.trialPeriodS === "number"
          ? excludedTrialCount * plan.trialPeriodS * 1000
          : -Infinity;

      // §6.3: 対応ペアの取得は「セッション開始時に1回」。perfMs/audioS を
      // 隣接する行で取得し、以降のずれ（クロックドリフト）は許容誤差内とする。
      anchorPerfMs = performance.now();
      const startAt = audio.scheduler.start({ beats: plan.audioBeats });
      sessionStartAudioMs = audio.scheduler.now() * 1000;
      plan.startAt = startAt;

      plan.judgedBeats.forEach((beat) => {
        beatKindByIndex.set(beat.index, beat.kind);
        scheduledMsByIndex.set(beat.index, (plan.startAt + beat.timeS) * 1000 - sessionStartAudioMs);
      });
      remainingBeats = plan.judgedBeats.map((beat) => ({
        index: beat.index,
        kind: beat.kind,
        timeMs: (plan.startAt + beat.timeS) * 1000,
      }));

      session = {
        sessionId: generateSessionId(),
        gameId,
        participantId: ctx.participantId || "",
        startedAtIso: new Date().toISOString(),
        aborted: false,
        // finished は §9.2 のスキーマに無い内部フラグ（destroy() が finish() 経由の
        // 正常終了と中断を区別するためだけに使う）。state.rhythm.sessions へは
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
          // gonogo のみ generateGoNoGoSequence() の結果を持つ（再現性、MUST）。
          seedSequence: plan.seedSequence || [],
        },
        device: audio.getDeviceInfo(),
        trials: [],
      };

      announce("リズムのれんしゅうを はじめます");
      updateProgressText();
      rafId = window.requestAnimationFrame(loop);
    }

    function destroy() {
      if (destroyed) return; // 冪等（detailed-design.md §3.2 MUST）
      destroyed = true;
      stopLoop();
      window.clearTimeout(hitFlashTimer);
      audio.scheduler.stop();

      // finish() を経由せずに destroy() が呼ばれた = 支援者操作/Esc/
      // visibilitychange による中断（detailed-design.md §7.3、MUST）。
      // 直前までの trials を aborted:true で確定させ、途中再開はしない。
      if (session && !session.finished) {
        session.aborted = true;
        session.summary = computeSummary(session.trials);
        logTrial(session);
      }

      if (stageEl) stageEl.innerHTML = "";
      stageEl = null;
      pulseEl = null;
    }

    return { mount, handleInput, destroy };
  };
}
