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
  reelTrackOffset,
  summarizeSlotTrials,
} from "./slotJudge.js";
import { slotSymbolHtml, slotSymbolStripUrl } from "./slotArt.js";
import { fitMeasuredReels, reelCellPx } from "./slotFit.js";

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
      fx,
    } = ctx;

    let stageEl = null;
    // れんしゅうの回で、続けて「ぴったり」だった数（演出だけに使う。記録はしない）。
    let hitStreak = 0;
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
    let resizeFrame = null;
    // 画面に出している1コマの高さ（px）。始めたときと、向きを変えたときに測る
    // （押したときに測ると、押した直後にレイアウトの計算が走る）。
    let shownCellPx = null;

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
      const { centeredIndex, offsetCells } = reelTrackOffset(phase, config.symbolCount);
      if (view.centeredIndex !== centeredIndex || view.orderKey !== reelPlan.symbolOrder.join("|")) {
        view.track.innerHTML = buildTrackSymbols(reelPlan.symbolOrder, centeredIndex);
        view.centeredIndex = centeredIndex;
        view.orderKey = reelPlan.symbolOrder.join("|");
      }
      // ずれはコマ数で渡し、1コマの高さは CSS の --slot-cell-size が決める
      // （以前は 94px 決め打ちで、スマホの 82px のコマとずれていた）。
      view.track.style.setProperty("--slot-track-offset", offsetCells.toFixed(4));
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
      // ほかの遊びと同じ「のこり ○かい」（さかなつり・アーム）。
      setProgress(t("slot.progress", { n: Math.max(0, total - completed) }));
      if (statusEl && activeReelIndex !== null) {
        statusEl.textContent =
          config.reelCount === 1
            ? t("slot.status.stopOne")
            : t("slot.status.stopReel", { current: activeReelIndex + 1, total: config.reelCount });
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

    /**
     * 目標の絵で止められたときの演出（れんしゅうの回だけ）。
     *
     * 打ち合わせで「止まったときに当たったと分かる派手な演出がほしい」と
     * 言われた（docs/design-renewal-2026-09-25.md §1.5）。例に出たのは
     * 「メダルがパーンと出る」だったが、リールの遊びでメダルを出すと
     * スロットの払い出しに見える——この遊びは賭博の表現を使わない
     * （detailed-design.md §0A.5）。App Store の年齢区分でも「ギャンブルを
     * 模した表現」に数えられうる。星がはじけて「ぴったり！」と出し、明るい
     * 和音を鳴らす（同 §3.4, §3.10）。
     *
     * そくていの回は出さない。止めたあとの演出でも、次のリールを止める
     * ときに目に入る（L2 は3本を続けて止める）。刺激の見え方は測定の条件。
     */
    function cheerReel(reelIndex) {
      if (config.difficultyMode === "measure") return;
      const view = reelViews[reelIndex];
      if (!view) return;
      const burst = document.createElement("span");
      burst.className = "slot-cheer";
      burst.setAttribute("aria-hidden", "true");
      // 続けて当てたら「2かい れんぞく！」。続くほど星が大きく、多くなる
      // （だんだん盛り上がる。docs/overall-design-2026-09-28.md §3.1）。
      const streak =
        hitStreak >= 2 ? `<span class="slot-cheer-streak">${tHtml("slot.streak", { n: hitStreak })}</span>` : "";
      burst.innerHTML = `<span class="slot-cheer-word">${tHtml("slot.cheer")}</span>${streak}`;
      view.root.append(burst);
      // 星は演出エンジン（src/lib/fx/ の reelHit）が描く。以前は Font Awesome の星
      // 12個を DOM に並べていた（技術負債の返済）。
      fx?.reelHit(view.root, { streak: hitStreak });
      window.setTimeout(() => burst.remove(), 1100);
    }

    /**
     * 外したときの一言（れんしゅうの回だけ）。「おしい！」とだけ出して、すぐ次へ。
     * 打ち合わせで「間違っているときも、へこませずに、あっさり次のチャレンジが
     * できるように」「もう一回頑張ろう、のような前向きな言葉がいい」と言われた
     * （docs/design-renewal-2026-09-25.md §1.5）。押さずに止まったとき（時間切れ）は
     * 出さない——押していないのに「おしい」は合わない。
     */
    function nudgeReel(reelIndex) {
      if (config.difficultyMode === "measure") return;
      const view = reelViews[reelIndex];
      if (!view) return;
      const nudge = document.createElement("span");
      nudge.className = "slot-cheer is-nudge";
      nudge.setAttribute("aria-hidden", "true");
      nudge.innerHTML = `<span class="slot-cheer-word">${tHtml("slot.nudge")}</span>`;
      view.root.append(nudge);
      window.setTimeout(() => nudge.remove(), 1000);
    }

    /** 止めたときの音。れんしゅうで当たったときは、明るい和音（ソ・シ・レ）。 */
    function playStopSound(judgment) {
      if (judgment === "hit" && config.difficultyMode !== "measure") {
        // 続けて当てるほど、和音が全音ずつ高くなる（大きさは変えない）。
        const lift = Math.pow(2, (2 * Math.min(Math.max(hitStreak - 1, 0), 4)) / 12);
        [784, 987.77, 1174.66].forEach((frequency, index) => {
          audio.playChime(frequency * lift, { delayS: index * 0.07, durationS: 0.8 });
        });
        return;
      }
      audio.playTone(judgment === "hit" ? 660 : 440);
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
        // このとき画面に出ていた1コマの高さ（px）。途中で向きを変えると変わる。
        reelCellPx: shownCellPx,
      };
      session.trials.push(row);
      reelViews[reelIndex].stoppedPhase = result.stoppedPhase;
      paintReel(reelIndex, stoppedAtMs);
      hitStreak = result.judgment === "hit" ? hitStreak + 1 : 0;
      playStopSound(result.judgment);
      if (result.judgment === "hit") cheerReel(reelIndex);
      else if (source !== "timeout") nudgeReel(reelIndex);
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
        // ぴったりが0回のときに「0回 ぴったり」と言わない。
        voiceFeedback(t(session.summary.hits > 0 ? "slot.voice.finish" : "slot.voice.finishNone", {
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

    /**
     * そくていの回で、決まった大きさのリールが画面に入りきらないときだけ、収める
     * 見え方にする（games/slotFit.js）。れんしゅうの回はいつも画面いっぱい
     * （theme-hakkiri.css）なので、ここでは何もしない。
     */
    function fitReels() {
      if (stageEl && config?.difficultyMode === "measure") fitMeasuredReels(stageEl);
    }

    // 向きを変えたとき（スマホを横にした、など）に測り直す。1フレームに1回まで。
    function onResize() {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        if (destroyed) return;
        fitReels();
        shownCellPx = reelCellPx(stageEl);
      });
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
      // れんしゅうの回だけの見た目（明るい色の台。theme-hakkiri.css）。
      stageEl.classList.toggle("is-practice", config.difficultyMode !== "measure");
      stageEl.innerHTML = `
        <section class="slot-task" data-game-id="${gameId}" data-difficulty-mode="${config.difficultyMode}">
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
      hitStreak = 0;
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
          // 演出の強さ（そくていの回は常に none。src/lib/fx/）。
          fxLevel: ctx.fx?.level() ?? null,
          textMode: config.textMode,
          measurementReadiness: config.measurementReadiness,
          visualGuidance: false,
          // 1コマの高さ（px）。下で、画面に出した実際の大きさを入れる。
          reelCellPx: null,
        },
        device: audio.getDeviceInfo(),
        trials: [],
        summary: null,
      };
      beginRound(0, sessionStartPerfMs);
      // 目標の札とことばが入ってから測る（札の大きさも見え方に入る）。
      fitReels();
      // 画面に出した1コマの高さを記録に残す。そくていの回は、収める見え方に
      // なったときだけ決まった大きさ（94px、幅 620px 以下は 82px）と違う値になる。
      // れんしゅうの回は画面の大きさで決まる。止めた1回ごとにも残す（trial.reelCellPx）。
      shownCellPx = reelCellPx(stageEl);
      session.config.reelCellPx = shownCellPx;
      logTrial(session);
      window.addEventListener("resize", onResize);
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
      window.removeEventListener("resize", onResize);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
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
        stageEl.classList.remove("slot-stage", "is-practice", "is-fitted", "is-whole");
        stageEl.innerHTML = "";
      }
      reelViews = [];
      stageEl = null;
    }

    return { mount, handleInput, destroy };
  };
}
