// 変動前刺激間隔つき単純反応時間課題「さかなつり」。
// 入力は GameCtx.handleInput 経由、時間軸は AudioContext 絶対時刻に統一する。

import { cueTones, fishingPresets } from "../content.js";
import { generateGoNoGoSequence } from "./judge.js";
import { generateForeperiods, judgeReaction } from "./reaction.js";

const FEEDBACK_GAIN = 0.05;
const MISS_GAIN = 0.018;

function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `t-${datePart}-${timePart}-${Math.random().toString(36).slice(2, 4)}`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values, mean) {
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

function computeSummary(trials) {
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

export function createFishingGame(ctx) {
  const { audio, announce, logTrial, finish, setProgress } = ctx;
  const config = { ...fishingPresets };
  let stageEl = null;
  let statusEl = null;
  let bobberEl = null;
  let rafId = null;
  let destroyed = false;
  let finished = false;
  let sessionStartAudioMs = 0;
  let anchorPerfMs = 0;
  let trialsPlan = [];
  let currentIndex = 0;
  let session = null;

  function toAudioAbsMs(perfMs) {
    return perfMs - anchorPerfMs + sessionStartAudioMs;
  }

  function toSessionRelativeMs(audioAbsMs) {
    return audioAbsMs - sessionStartAudioMs;
  }

  function renderMarkup() {
    stageEl.innerHTML = `
      <div class="fishing-scene" aria-hidden="true">
        <div class="fishing-sky"></div>
        <div class="fishing-water">
          <span class="fishing-bobber"></span>
          <span class="fishing-fish">🐟</span>
        </div>
      </div>
      <span class="reaction-label fishing-status">しずかに まとう</span>
      <span class="reaction-detail">たかい アタリのおとで おそう</span>
    `;
    statusEl = stageEl.querySelector(".fishing-status");
    bobberEl = stageEl.querySelector(".fishing-bobber");
  }

  function updateProgress() {
    setProgress(`のこり ${Math.max(0, config.targetTrials - currentIndex)}`);
  }

  function recordCurrent(judgment, inputMs = null) {
    if (finished || currentIndex >= trialsPlan.length) return;
    const planned = trialsPlan[currentIndex];
    const normalizedInput =
      judgment === "timeout" || judgment === "correctRejection" ? null : inputMs;
    const row = {
      index: currentIndex,
      kind: planned.kind,
      foreperiodMs: planned.foreperiodMs,
      cueMs: planned.cueMs,
      inputMs: normalizedInput,
      reactionTimeMs:
        judgment === "hit" && normalizedInput !== null
          ? normalizedInput - planned.cueMs
          : null,
      judgment,
      excluded: false,
    };
    session.trials.push(row);
    session.summary = computeSummary(session.trials);
    logTrial(session);

    const now = audio.scheduler.now();
    if (judgment === "hit") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      statusEl.textContent = "つれた！";
      bobberEl?.classList.add("is-caught");
      announce("さかなが つれました");
    } else if (judgment === "correctRejection") {
      statusEl.textContent = "よく まてたね";
      announce("にせアタリを みわけました");
    } else if (judgment === "falseStart") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "まだ まとう";
      announce("まだ アタリではありません");
    } else if (judgment === "commission") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "にせアタリ";
      announce("にせアタリでした");
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "つぎは だいじょうぶ";
      announce("アタリを みのがしました");
    }

    currentIndex += 1;
    updateProgress();
    if (currentIndex >= trialsPlan.length) finalize();
  }

  function finalize() {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    session.summary = computeSummary(session.trials);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const percent = Math.round((session.summary.hitRate || 0) * 100);
    audio.speak(`おわりました。つれた わりあいは ${percent}パーセントです`);
    announce(`さかなつりが おわりました。${percent}パーセント つれました`);
    finish(session.summary);
  }

  function updateVisual(nowRelativeMs) {
    const planned = trialsPlan[currentIndex];
    if (!planned || !statusEl) return;
    const beforeCue = nowRelativeMs < planned.cueMs;
    const withinWindow = nowRelativeMs <= planned.cueMs + config.limitMs;
    statusEl.textContent = beforeCue
      ? "しずかに まとう"
      : withinWindow
        ? "アタリ！"
        : "つぎの さかなへ";
    bobberEl?.classList.toggle("is-biting", !beforeCue && withinWindow);
    bobberEl?.classList.remove("is-caught");
  }

  function loop() {
    if (destroyed || finished || !session) return;
    const nowRelativeMs = toSessionRelativeMs(audio.scheduler.now() * 1000);
    const planned = trialsPlan[currentIndex];
    if (planned && nowRelativeMs > planned.cueMs + config.limitMs) {
      recordCurrent(
        planned.kind === "real" ? "timeout" : "correctRejection",
        null
      );
      if (finished || destroyed) return;
    }
    updateVisual(nowRelativeMs);
    rafId = window.requestAnimationFrame(loop);
  }

  function handleInput(t) {
    if (destroyed || finished || !session) return;
    const inputMs = toSessionRelativeMs(toAudioAbsMs(t));
    let planned = trialsPlan[currentIndex];

    // rAFの境界直前に入力が来ても、期限切れ試行を正常に確定してから
    // 次の前刺激区間の入力として扱う。
    while (planned && inputMs > planned.cueMs + config.limitMs) {
      recordCurrent(
        planned.kind === "real" ? "timeout" : "correctRejection",
        null
      );
      if (finished) return;
      planned = trialsPlan[currentIndex];
    }
    if (!planned) return;
    const judgment = judgeReaction(inputMs, planned.cueMs, config.limitMs, planned.kind);
    recordCurrent(judgment, inputMs);
  }

  function mount(el) {
    stageEl = el;
    renderMarkup();

    const foreperiods = generateForeperiods(
      config.targetTrials,
      config.foreperiodMinMs,
      config.foreperiodMaxMs
    );
    const kindSequence = generateGoNoGoSequence(
      config.targetTrials,
      1 - config.fakeRatio
    ).map((kind) => (kind === "go" ? "real" : "fake"));
    let cursorMs = 0;
    const beats = [];
    trialsPlan = foreperiods.map((foreperiodMs, index) => {
      cursorMs += foreperiodMs;
      const kind = kindSequence[index];
      const cueMs = cursorMs;
      beats.push({
        index,
        timeS: cueMs / 1000,
        tone: kind === "real" ? cueTones.high : cueTones.noGo,
        gain: FEEDBACK_GAIN,
      });
      cursorMs += config.limitMs;
      return { index, kind, foreperiodMs, cueMs };
    });

    const startAt = audio.scheduler.start({ beats });
    anchorPerfMs = performance.now();
    sessionStartAudioMs = audio.scheduler.now() * 1000;
    const startOffsetMs = startAt * 1000 - sessionStartAudioMs;
    trialsPlan = trialsPlan.map((trial) => ({
      ...trial,
      cueMs: trial.cueMs + startOffsetMs,
    }));

    session = {
      sessionId: generateSessionId(),
      taskType: "rt",
      gameId: "fishing",
      participantId: ctx.participantId || "",
      startedAtIso: new Date().toISOString(),
      aborted: false,
      finished: false,
      config: {
        ...config,
        seedSequence: foreperiods,
        kindSequence,
      },
      device: audio.getDeviceInfo(),
      trials: [],
      summary: computeSummary([]),
    };
    logTrial(session);
    updateProgress();
    audio.speak("さかなつりを はじめます。アタリの おとを まってください");
    rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    audio.scheduler.stop();
    if (session && !finished) {
      session.aborted = true;
      session.summary = computeSummary(session.trials);
      logTrial(session);
    }
    if (stageEl) stageEl.innerHTML = "";
    stageEl = null;
    statusEl = null;
    bobberEl = null;
  }

  return { mount, handleInput, destroy };
}
