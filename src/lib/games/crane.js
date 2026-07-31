// 2軸ポイント走査課題「UFOキャッチャー」。
// 掴み成否は距離だけから決まり、乱数や物理エンジンは使わない。

import { cranePresets, cueTones } from "../content.js";
import { evaluatePick, graspOutcome, scanPercentAt } from "./pointing.js";

const TARGETS = [
  { x: 24, y: 32 },
  { x: 70, y: 38 },
  { x: 45, y: 70 },
  { x: 78, y: 73 },
  { x: 31, y: 64 },
];
const COUNT_IN_STEP_S = 0.55;
const FEEDBACK_GAIN = 0.05;
const MISS_GAIN = 0.018;
const RESULT_HOLD_MS = 900;

function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `s-${datePart}-${timePart}-${Math.random().toString(36).slice(2, 4)}`;
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
  const distances = trials.map((trial) => trial.distance);
  const grips = trials.filter((trial) => trial.judgment === "grip").length;
  const slips = trials.filter((trial) => trial.judgment === "slip").length;
  const misses = trials.filter((trial) => trial.judgment === "miss").length;
  const meanDistance = average(distances);
  return {
    trials: trials.length,
    grips,
    slips,
    misses,
    gripRate: trials.length ? grips / trials.length : 0,
    meanDistance,
    sdDistance: standardDeviation(distances, meanDistance),
    medianDistance: median(distances),
    meanXPhaseMs: average(trials.map((trial) => trial.xPhaseMs)),
    meanYPhaseMs: average(trials.map((trial) => trial.yPhaseMs)),
  };
}

export function createCraneGame(ctx) {
  const { audio, announce, logTrial, finish, setProgress } = ctx;
  const config = { ...cranePresets };
  let stageEl = null;
  let statusEl = null;
  let verticalEl = null;
  let horizontalEl = null;
  let armEl = null;
  let rafId = null;
  let destroyed = false;
  let finished = false;
  let phase = "countIn";
  let countInEndAudioMs = 0;
  let phaseStartedPerfMs = 0;
  let graspStartedPerfMs = 0;
  let resultStartedPerfMs = 0;
  let selectedX = null;
  let selectedY = null;
  let xPhaseMs = 0;
  let yPhaseMs = 0;
  let currentIndex = 0;
  let session = null;

  function targetForCurrentTrial() {
    return TARGETS[currentIndex % TARGETS.length];
  }

  function renderMarkup() {
    const target = targetForCurrentTrial();
    stageEl.innerHTML = `
      <div class="crane-cabinet">
        <div class="crane-board">
          <span class="crane-prize" style="left:${target.x}%;top:${target.y}%">⭐</span>
          <span class="crane-scan-line vertical"></span>
          <span class="crane-scan-line horizontal"></span>
          <span class="crane-arm" aria-hidden="true">⌄</span>
        </div>
      </div>
      <span class="reaction-label crane-status">じゅんび</span>
      <span class="reaction-detail">たて → よこの じゅんに とめよう</span>
    `;
    statusEl = stageEl.querySelector(".crane-status");
    verticalEl = stageEl.querySelector(".crane-scan-line.vertical");
    horizontalEl = stageEl.querySelector(".crane-scan-line.horizontal");
    armEl = stageEl.querySelector(".crane-arm");
    horizontalEl.style.top = "0%";
  }

  function updateProgress() {
    setProgress(`のこり ${Math.max(0, config.targetTrials - currentIndex)}`);
  }

  function startXPhase(perfMs = performance.now()) {
    phase = "x";
    phaseStartedPerfMs = perfMs;
    selectedX = null;
    selectedY = null;
    statusEl.textContent = "たての せんを とめよう";
    verticalEl.style.left = "0%";
    horizontalEl.style.top = "0%";
    horizontalEl.classList.remove("is-active");
    verticalEl.classList.add("is-active");
    armEl.className = "crane-arm";
    armEl.style.left = "0%";
    armEl.style.top = "0%";
  }

  function startYPhase(perfMs) {
    phase = "y";
    phaseStartedPerfMs = perfMs;
    statusEl.textContent = "よこの せんを とめよう";
    verticalEl.classList.remove("is-active");
    horizontalEl.classList.add("is-active");
  }

  function startGrasp(perfMs) {
    phase = "grasp";
    graspStartedPerfMs = perfMs;
    statusEl.textContent = "アームが おりるよ";
    verticalEl.classList.remove("is-active");
    horizontalEl.classList.remove("is-active");
    armEl.style.left = `${selectedX}%`;
    armEl.style.top = `${selectedY}%`;
    armEl.classList.add("is-dropping");
  }

  function finishTrial() {
    const target = targetForCurrentTrial();
    const result = evaluatePick(
      { x: selectedX, y: selectedY },
      { x: target.x, y: target.y, r: config.toleranceR }
    );
    const judgment = graspOutcome(result.distance, config.toleranceR);
    const row = {
      index: currentIndex,
      targetX: target.x,
      targetY: target.y,
      toleranceR: config.toleranceR,
      selectedX,
      selectedY,
      dx: result.dx,
      dy: result.dy,
      distance: result.distance,
      xPhaseMs,
      yPhaseMs,
      judgment,
    };
    session.trials.push(row);
    session.summary = computeSummary(session.trials);
    logTrial(session);

    const now = audio.scheduler.now();
    if (judgment === "grip") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      statusEl.textContent = "しっかり つかめた！";
      armEl.classList.add("is-grip");
      audio.speak("しっかり つかめました");
      announce("けいひんを しっかり つかめました");
    } else if (judgment === "slip") {
      audio.playToneAt(cueTones.noGo, now, FEEDBACK_GAIN);
      statusEl.textContent = "おしい！ すべった";
      armEl.classList.add("is-slip");
      audio.speak("おしい。つかんだけど すべりました");
      announce("つかみましたが すべりました");
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "つぎは だいじょうぶ";
      armEl.classList.add("is-miss");
      audio.speak("つぎは だいじょうぶ");
      announce("アームが けいひんから はずれました");
    }

    currentIndex += 1;
    updateProgress();
    if (currentIndex >= config.targetTrials) {
      finalize();
      return;
    }
    phase = "result";
    resultStartedPerfMs = performance.now();
  }

  function finalize() {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    session.summary = computeSummary(session.trials);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const percent = Math.round((session.summary.gripRate || 0) * 100);
    announce(`UFOキャッチャーが おわりました。${percent}パーセント つかめました`);
    finish(session.summary);
  }

  function updateCursor(nowPerfMs) {
    if (phase === "x") {
      const percent = scanPercentAt(nowPerfMs - phaseStartedPerfMs, config.sweepMs);
      verticalEl.style.left = `${percent}%`;
    } else if (phase === "y") {
      const percent = scanPercentAt(nowPerfMs - phaseStartedPerfMs, config.sweepMs);
      horizontalEl.style.top = `${percent}%`;
    }
  }

  function loop() {
    if (destroyed || finished || !session) return;
    const nowPerfMs = performance.now();
    if (phase === "countIn" && audio.scheduler.now() * 1000 >= countInEndAudioMs) {
      startXPhase(nowPerfMs);
    }
    updateCursor(nowPerfMs);
    if (phase === "grasp" && nowPerfMs - graspStartedPerfMs >= config.graspAnimMs) {
      finishTrial();
      if (destroyed || finished) return;
    }
    if (phase === "result" && nowPerfMs - resultStartedPerfMs >= RESULT_HOLD_MS) {
      renderMarkup();
      startXPhase(nowPerfMs);
    }
    rafId = window.requestAnimationFrame(loop);
  }

  function handleInput(t) {
    if (destroyed || finished || !session) return;
    if (phase === "x") {
      xPhaseMs = Math.max(0, t - phaseStartedPerfMs);
      selectedX = scanPercentAt(xPhaseMs, config.sweepMs);
      verticalEl.style.left = `${selectedX}%`;
      startYPhase(t);
    } else if (phase === "y") {
      yPhaseMs = Math.max(0, t - phaseStartedPerfMs);
      selectedY = scanPercentAt(yPhaseMs, config.sweepMs);
      horizontalEl.style.top = `${selectedY}%`;
      startGrasp(t);
    }
  }

  function mount(el) {
    stageEl = el;
    renderMarkup();
    updateProgress();

    const beats = [0, 1, 2, 3].map((index) => ({
      index,
      timeS: index * COUNT_IN_STEP_S,
      tone: index === 3 ? cueTones.high : cueTones.low,
      gain: FEEDBACK_GAIN,
    }));
    const startAt = audio.scheduler.start({ beats });
    countInEndAudioMs = (startAt + 3 * COUNT_IN_STEP_S) * 1000;
    session = {
      sessionId: generateSessionId(),
      taskType: "scan",
      gameId: "crane",
      participantId: ctx.participantId || "",
      startedAtIso: new Date().toISOString(),
      aborted: false,
      finished: false,
      config: {
        ...config,
        targetSequence: TARGETS.slice(0, config.targetTrials),
      },
      device: audio.getDeviceInfo(),
      trials: [],
      summary: computeSummary([]),
    };
    logTrial(session);
    audio.speak("UFOキャッチャーを はじめます");
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
    verticalEl = null;
    horizontalEl = null;
    armEl = null;
  }

  return { mount, handleInput, destroy };
}
