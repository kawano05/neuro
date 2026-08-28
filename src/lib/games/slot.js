// =====================================================================
// games/slot.js — 1スイッチ・スロット型逐次停止課題
//
// 入力時刻の正本はシェルから渡される performance.now() 値。rAF は表示更新と
// 固定期限の検出にだけ使い、フレーム落ちで判定結果が変わらないようにする。
// =====================================================================

import { slotPresets } from "../content.js";
import { resolveDifficultyMode, resolveSlotDifficulty } from "../difficultyMode.js";
import {
  SLOT_ENGINE_VERSION,
  SLOT_PROTOCOL_VERSION,
  SLOT_SYMBOL_IDS,
  createSeededSlotPlan,
  judgeSlotStop,
  positiveModulo,
  reelPhaseAt,
  summarizeSlotTrials,
} from "./slotJudge.js";
import { slotSymbolHtml, slotSymbolStripUrl } from "./slotArt.js";

const INPUT_GUARD_MS = 300;
const ROUND_HOLD_MS = 560;
const FINISH_HOLD_MS = 620;

function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `slot-${datePart}-${timePart}-${Math.random().toString(36).slice(2, 6)}`;
}

/** 逐次停止の次位置。ゲーム本体と単体テストが同じ遷移規則を使う。 */
export function nextSlotPosition({ roundIndex, reelIndex, reelCount, rounds }) {
  if (reelIndex + 1 < reelCount) {
    return { roundIndex, reelIndex: reelIndex + 1, roundComplete: false, sessionComplete: false };
  }
  if (roundIndex + 1 < rounds) {
    return { roundIndex: roundIndex + 1, reelIndex: 0, roundComplete: true, sessionComplete: false };
  }
  return { roundIndex, reelIndex, roundComplete: true, sessionComplete: true };
}

/**
 * registry の create(ctx) 契約へ合わせたファクトリ。
 * @param {"slot-l1"|"slot-l2"} gameId
 */
export function createSlotGame(gameId) {
  const preset = slotPresets[gameId];
  if (!preset) throw new Error(`Unknown slot game: ${gameId}`);

  return function create(ctx) {
    const {
      settings,
      audio,
      announce,
      voiceFeedback,
      logTrial,
      finish,
      setProgress,
      t,
      tHtml,
    } = ctx;

    let stageEl = null;
    let reelsEl = null;
    let targetEl = null;
    let statusEl = null;
    let session = null;
    let config = null;
    let plan = null;
    let reelViews = [];
    let roundIndex = 0;
    let activeReelIndex = null;
    let sessionStartPerfMs = 0;
    let roundStartPerfMs = 0;
    let activeStartPerfMs = 0;
    let inputLockUntilPerfMs = 0;
    let extraInputCount = 0;
    let rafId = null;
    let transitionTimer = null;
    let finishTimer = null;
    let destroyed = false;
    let finishing = false;

    const toRelativeMs = (absoluteMs) => Math.max(0, absoluteMs - sessionStartPerfMs);

    function symbolLabel(symbolId) {
      return t(`slot.symbol.${symbolId}`);
    }

    function currentRound() {
      return plan?.[roundIndex] || null;
    }

    function activeDeadlineMs() {
      return activeStartPerfMs + config.maxCyclesPerReel * config.cycleMs;
    }

    function buildTrackSymbols(symbolOrder, centeredIndex) {
      return [-2, -1, 0, 1, 2]
        .map((offset) => {
          const symbolId = symbolOrder[positiveModulo(centeredIndex + offset, symbolOrder.length)];
          return `<span class="slot-track-cell">${slotSymbolHtml(symbolId)}</span>`;
        })
        .join("");
    }

    function paintReel(reelIndex, atMs) {
      const view = reelViews[reelIndex];
      const reelPlan = currentRound()?.reels[reelIndex];
      if (!view || !reelPlan) return;

      const phase = view.stoppedPhase ?? reelPhaseAt({
        atMs,
        reelStartMs: roundStartPerfMs,
        cycleMs: config.cycleMs,
        symbolCount: config.symbolCount,
        initialPhase: reelPlan.initialPhase,
      });
      const centeredIndex = positiveModulo(Math.floor(phase + 0.5), config.symbolCount);
      if (view.centeredIndex !== centeredIndex || view.orderKey !== reelPlan.symbolOrder.join("|")) {
        view.track.innerHTML = buildTrackSymbols(reelPlan.symbolOrder, centeredIndex);
        view.centeredIndex = centeredIndex;
        view.orderKey = reelPlan.symbolOrder.join("|");
      }
      const fractionalOffset = centeredIndex - phase;
      view.track.style.setProperty("--slot-track-offset", `${(fractionalOffset * 94).toFixed(2)}px`);
    }

    function updateReelClasses() {
      reelViews.forEach((view, reelIndex) => {
        const active = reelIndex === activeReelIndex;
        view.root.classList.toggle("is-active", active);
        view.root.classList.toggle("is-stopped", view.stoppedPhase !== null);
        view.root.setAttribute("aria-current", active ? "step" : "false");
        view.badge.textContent = view.stoppedPhase !== null
          ? t("slot.reel.stopped")
          : active
            ? t("slot.reel.active")
            : t("slot.reel.waiting");
      });
    }

    function updateTarget() {
      const round = currentRound();
      if (!round || !targetEl) return;
      targetEl.innerHTML = `
        <span class="slot-target-label">${tHtml("slot.target")}</span>
        ${slotSymbolHtml(round.targetSymbol, {
          label: symbolLabel(round.targetSymbol),
          decorative: false,
        })}
        <strong>${tHtml(`slot.symbol.${round.targetSymbol}`)}</strong>
      `;
    }

    function updateProgress() {
      if (!session || finishing) return;
      const completed = session.trials.length;
      const total = config.rounds * config.reelCount;
      setProgress(t("slot.progress", { current: Math.min(completed + 1, total), total }));
      if (statusEl && activeReelIndex !== null) {
        statusEl.textContent = t("slot.status.stopReel", {
          current: activeReelIndex + 1,
          total: config.reelCount,
        });
      }
    }

    function persist() {
      if (!session) return;
      session.summary = summarizeSlotTrials(session.trials, {
        reelCount: config.reelCount,
        completionTimeMs: toRelativeMs(performance.now()),
        extraInputCount,
      });
      logTrial(session);
    }

    function addExtraInput() {
      extraInputCount += 1;
      const lastTrial = session?.trials.at(-1);
      if (lastTrial) {
        lastTrial.ignoredDuplicateInputs = (lastTrial.ignoredDuplicateInputs || 0) + 1;
      }
      persist();
    }

    function recordStop({ inputMs, timeoutAtMs = null, source = "timeout" }) {
      const round = currentRound();
      if (!round || activeReelIndex === null || session.finished) return null;
      const reelIndex = activeReelIndex;
      const reelPlan = round.reels[reelIndex];
      const result = judgeSlotStop({
        inputMs,
        timeoutAtMs,
        reelStartMs: roundStartPerfMs,
        activeStartMs: activeStartPerfMs,
        cycleMs: config.cycleMs,
        toleranceMs: config.toleranceMs,
        symbolOrder: reelPlan.symbolOrder,
        targetSymbol: round.targetSymbol,
        initialPhase: reelPlan.initialPhase,
      });
      const stoppedAtMs = inputMs ?? timeoutAtMs;
      const row = {
        index: session.trials.length,
        roundIndex,
        reelIndex,
        targetSymbol: round.targetSymbol,
        targetIndex: result.targetIndex,
        symbolOrder: [...reelPlan.symbolOrder],
        initialPhase: reelPlan.initialPhase,
        reelStartMs: toRelativeMs(roundStartPerfMs),
        activeStartMs: toRelativeMs(activeStartPerfMs),
        inputMs: inputMs === null ? null : toRelativeMs(inputMs),
        timeoutAtMs: timeoutAtMs === null ? null : toRelativeMs(timeoutAtMs),
        targetPassMs: toRelativeMs(result.targetPassMs),
        signedErrorMs: result.signedErrorMs,
        absoluteErrorMs: result.absoluteErrorMs,
        stoppedPhase: result.stoppedPhase,
        stoppedIndex: result.stoppedIndex,
        stoppedSymbol: result.stoppedSymbol,
        observedCycles: result.observedCycles,
        judgment: result.judgment,
        inputSource: source,
        ignoredDuplicateInputs: 0,
      };
      session.trials.push(row);
      reelViews[reelIndex].stoppedPhase = result.stoppedPhase;
      paintReel(reelIndex, stoppedAtMs);
      audio.playTone(result.judgment === "hit" ? 660 : 440);
      persist();
      return row;
    }

    function stopLoop() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function finalize(atMs) {
      if (finishing || !session) return;
      finishing = true;
      activeReelIndex = null;
      session.finished = true;
      session.aborted = false;
      session.endedAtIso = new Date().toISOString();
      session.summary = summarizeSlotTrials(session.trials, {
        reelCount: config.reelCount,
        completionTimeMs: toRelativeMs(atMs),
        extraInputCount,
      });
      updateReelClasses();
      setProgress(t("slot.progress.complete"));
      if (statusEl) statusEl.textContent = t("slot.status.complete");
      logTrial(session);
      stopLoop();
      audio.playTone(784);
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        if (destroyed) return;
        voiceFeedback(t("slot.voice.finish", {
          hits: session.summary.hits,
          total: session.summary.trials,
        }));
        finish(session.summary);
      }, FINISH_HOLD_MS);
    }

    function beginRound(nextRoundIndex, atMs) {
      roundIndex = nextRoundIndex;
      roundStartPerfMs = atMs;
      activeStartPerfMs = atMs;
      inputLockUntilPerfMs = atMs + INPUT_GUARD_MS;
      activeReelIndex = 0;
      reelViews.forEach((view) => {
        view.stoppedPhase = null;
        view.centeredIndex = null;
        view.orderKey = "";
      });
      updateTarget();
      updateReelClasses();
      updateProgress();
      announce(t("slot.voice.round", { current: roundIndex + 1, total: config.rounds }));
    }

    function advanceAfterStop(atMs) {
      const next = nextSlotPosition({
        roundIndex,
        reelIndex: activeReelIndex,
        reelCount: config.reelCount,
        rounds: config.rounds,
      });
      inputLockUntilPerfMs = atMs + INPUT_GUARD_MS;

      if (next.sessionComplete) {
        finalize(atMs);
        return;
      }
      if (!next.roundComplete) {
        activeReelIndex = next.reelIndex;
        activeStartPerfMs = atMs;
        updateReelClasses();
        updateProgress();
        announce(t("slot.voice.nextReel", { current: activeReelIndex + 1 }));
        return;
      }

      activeReelIndex = null;
      updateReelClasses();
      if (statusEl) statusEl.textContent = t("slot.status.roundComplete");
      transitionTimer = window.setTimeout(() => {
        transitionTimer = null;
        if (destroyed || finishing) return;
        beginRound(next.roundIndex, performance.now());
      }, ROUND_HOLD_MS);
    }

    function loop() {
      if (destroyed || !session || session.finished) return;
      const now = performance.now();
      reelViews.forEach((_, reelIndex) => paintReel(reelIndex, now));

      if (activeReelIndex !== null && now >= activeDeadlineMs()) {
        const deadline = activeDeadlineMs();
        recordStop({ inputMs: null, timeoutAtMs: deadline, source: "timeout" });
        advanceAfterStop(deadline);
      }

      if (!destroyed && !session.finished) rafId = window.requestAnimationFrame(loop);
    }

    function mount(el) {
      stageEl = el;
      const difficultyMode = resolveDifficultyMode(settings);
      const practiceSeed = `slot-practice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      config = {
        ...resolveSlotDifficulty(gameId, settings, preset, practiceSeed),
        difficultyMode,
        textMode: settings.textMode || "ruby",
        measurementReadiness: ctx.readiness || "n/a",
        visualGuidance: false,
      };
      plan = createSeededSlotPlan({
        seed: config.seed,
        rounds: config.rounds,
        reelCount: config.reelCount,
        symbols: SLOT_SYMBOL_IDS,
      });

      stageEl.classList.add("slot-stage");
      stageEl.innerHTML = `
        <section class="slot-task" data-game-id="${gameId}">
          <div class="slot-target" data-slot-target></div>
          <p class="slot-status" data-slot-status aria-live="polite"></p>
          <div class="slot-reels is-${config.reelCount}-reel" data-slot-reels></div>
          <figure class="slot-symbol-guide">
            <img src="${slotSymbolStripUrl}" alt="${t("slot.symbolGuide.alt")}" />
            <figcaption>${tHtml("slot.symbolGuide.caption")}</figcaption>
          </figure>
        </section>
      `;
      reelsEl = stageEl.querySelector("[data-slot-reels]");
      targetEl = stageEl.querySelector("[data-slot-target]");
      statusEl = stageEl.querySelector("[data-slot-status]");
      reelsEl.innerHTML = Array.from({ length: config.reelCount }, (_, reelIndex) => `
        <div class="slot-reel" data-slot-reel="${reelIndex}" aria-label="${t("slot.reel.label", { n: reelIndex + 1 })}">
          <span class="slot-reel-number" aria-hidden="true">${reelIndex + 1}</span>
          <div class="slot-reel-window" aria-hidden="true">
            <span class="slot-stop-line is-top"></span>
            <span class="slot-stop-line is-bottom"></span>
            <div class="slot-reel-track"></div>
          </div>
          <span class="slot-reel-badge"></span>
        </div>
      `).join("");
      reelViews = [...reelsEl.querySelectorAll("[data-slot-reel]")].map((root) => ({
        root,
        track: root.querySelector(".slot-reel-track"),
        badge: root.querySelector(".slot-reel-badge"),
        stoppedPhase: null,
        centeredIndex: null,
        orderKey: "",
      }));

      sessionStartPerfMs = performance.now();
      session = {
        sessionId: generateSessionId(),
        taskType: "slot",
        protocolVersion: SLOT_PROTOCOL_VERSION,
        engineVersion: SLOT_ENGINE_VERSION,
        gameId,
        participantId: ctx.participantId || "",
        startedAtIso: new Date().toISOString(),
        endedAtIso: null,
        aborted: false,
        finished: false,
        config: {
          reelCount: config.reelCount,
          symbolCount: config.symbolCount,
          cycleMs: config.cycleMs,
          toleranceMs: config.toleranceMs,
          rounds: config.rounds,
          maxCyclesPerReel: config.maxCyclesPerReel,
          seed: config.seed,
          difficultyMode: config.difficultyMode,
          textMode: config.textMode,
          measurementReadiness: config.measurementReadiness,
          visualGuidance: false,
        },
        device: audio.getDeviceInfo(),
        trials: [],
        summary: null,
      };
      logTrial(session);
      beginRound(0, sessionStartPerfMs);
      rafId = window.requestAnimationFrame(loop);
    }

    // perfMs は入力ファネルがイベント受信時に取得した値。ここで再計時しない。
    function handleInput(perfMs, source) {
      if (destroyed || finishing || !session || session.finished) return;
      if (typeof perfMs !== "number" || !Number.isFinite(perfMs)) return;
      if (activeReelIndex === null || perfMs < inputLockUntilPerfMs) {
        addExtraInput();
        return;
      }
      const deadline = activeDeadlineMs();
      if (perfMs >= deadline) {
        recordStop({ inputMs: null, timeoutAtMs: deadline, source: "timeout" });
        advanceAfterStop(deadline);
        // 期限後の押下を次リールへ転用しない。余分な入力として明示的に残す。
        addExtraInput();
        return;
      }
      recordStop({ inputMs: perfMs, source });
      advanceAfterStop(perfMs);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopLoop();
      window.clearTimeout(transitionTimer);
      window.clearTimeout(finishTimer);
      transitionTimer = null;
      finishTimer = null;
      if (session && !session.finished) {
        session.aborted = true;
        session.finished = false;
        session.endedAtIso = new Date().toISOString();
        session.summary = summarizeSlotTrials(session.trials, {
          reelCount: config.reelCount,
          completionTimeMs: toRelativeMs(performance.now()),
          extraInputCount,
        });
        logTrial(session);
      }
      if (stageEl) {
        stageEl.classList.remove("slot-stage");
        stageEl.innerHTML = "";
      }
      reelViews = [];
      stageEl = null;
    }

    return { mount, handleInput, destroy };
  };
}
