import assert from "node:assert/strict";
import { nextSlotPosition } from "../src/lib/games/slot.js";
import {
  SLOT_ENGINE_VERSION,
  SLOT_PROTOCOL_VERSION,
  createSeededSlotPlan,
  judgeSlotStop,
  nearestTargetPassMs,
  summarizeSlotTrials,
} from "../src/lib/games/slotJudge.js";
import { sanitizeSlotSession } from "../src/lib/games/slotState.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

function makeSession({ gameId = "slot-l2", rounds = 2, finished = true, aborted = false } = {}) {
  const reelCount = gameId === "slot-l2" ? 3 : 1;
  const cycleMs = 3200;
  const toleranceMs = 220;
  const seed = "slot-measure-01";
  const plan = createSeededSlotPlan({ seed, rounds, reelCount });
  const trials = [];

  plan.forEach((round, roundIndex) => {
    const reelStartMs = roundIndex * 20_000;
    round.reels.forEach((reel, reelIndex) => {
      const activeStartMs = reelStartMs + reelIndex * 1100;
      let targetPassMs = nearestTargetPassMs({
        inputMs: activeStartMs,
        reelStartMs,
        cycleMs,
        symbolCount: reel.symbolOrder.length,
        initialPhase: reel.initialPhase,
        targetIndex: reel.targetIndex,
      });
      while (targetPassMs < activeStartMs) targetPassMs += cycleMs;
      const result = judgeSlotStop({
        inputMs: targetPassMs,
        reelStartMs,
        activeStartMs,
        cycleMs,
        toleranceMs,
        symbolOrder: reel.symbolOrder,
        targetSymbol: round.targetSymbol,
        initialPhase: reel.initialPhase,
      });
      trials.push({
        index: trials.length,
        roundIndex,
        reelIndex,
        targetSymbol: round.targetSymbol,
        targetIndex: result.targetIndex,
        symbolOrder: [...reel.symbolOrder],
        initialPhase: reel.initialPhase,
        reelStartMs,
        activeStartMs,
        inputMs: targetPassMs,
        timeoutAtMs: null,
        targetPassMs: result.targetPassMs,
        signedErrorMs: result.signedErrorMs,
        absoluteErrorMs: result.absoluteErrorMs,
        stoppedPhase: result.stoppedPhase,
        stoppedIndex: result.stoppedIndex,
        stoppedSymbol: result.stoppedSymbol,
        observedCycles: result.observedCycles,
        judgment: result.judgment,
        inputSource: "keyboard",
        ignoredDuplicateInputs: 0,
      });
    });
  });

  const config = {
    difficultyMode: "measure",
    reelCount,
    symbolCount: 6,
    cycleMs,
    toleranceMs,
    rounds,
    maxCyclesPerReel: 4,
    seed,
    visualGuidance: false,
    textMode: "ruby",
    measurementReadiness: "met",
  };
  return {
    sessionId: "slot-test-session",
    taskType: "slot",
    gameId,
    protocolVersion: SLOT_PROTOCOL_VERSION,
    engineVersion: SLOT_ENGINE_VERSION,
    participantId: "P001",
    startedAtIso: "2026-08-20T00:00:00.000Z",
    endedAtIso: "2026-08-20T00:01:00.000Z",
    aborted,
    finished,
    config,
    device: { viewportWidth: 1024, viewportHeight: 768, devicePixelRatio: 2, userAgent: "test" },
    trials,
    summary: summarizeSlotTrials(trials, { reelCount, completionTimeMs: 60_000, extraInputCount: 0 }),
  };
}

test("one input advances exactly one reel and never skips the sequence", () => {
  assert.deepEqual(
    nextSlotPosition({ roundIndex: 0, reelIndex: 0, reelCount: 3, rounds: 4 }),
    { roundIndex: 0, reelIndex: 1, roundComplete: false, sessionComplete: false }
  );
  assert.deepEqual(
    nextSlotPosition({ roundIndex: 0, reelIndex: 1, reelCount: 3, rounds: 4 }),
    { roundIndex: 0, reelIndex: 2, roundComplete: false, sessionComplete: false }
  );
});

test("the last reel starts the next round and the last round completes", () => {
  assert.deepEqual(
    nextSlotPosition({ roundIndex: 0, reelIndex: 2, reelCount: 3, rounds: 4 }),
    { roundIndex: 1, reelIndex: 0, roundComplete: true, sessionComplete: false }
  );
  assert.equal(
    nextSlotPosition({ roundIndex: 3, reelIndex: 2, reelCount: 3, rounds: 4 }).sessionComplete,
    true
  );
});

test("a valid completed slot session round-trips through the sanitizer", () => {
  const source = makeSession();
  const restored = sanitizeSlotSession(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.finished, true);
  assert.equal(restored.aborted, false);
  assert.equal(restored.trials.length, 6);
  assert.equal(restored.summary.hits, 6);
  assert.equal(restored.protocolVersion, "slot-v1");
});

test("an invalid symbol removes only that trial and revokes completed status", () => {
  const source = makeSession();
  source.trials[2].symbolOrder[0] = "seven";
  const restored = sanitizeSlotSession(source);
  assert.equal(restored.trials.length, 5);
  assert.equal(restored.finished, false);
  assert.equal(restored.aborted, true);
});

test("invalid cycleMs is constrained and inconsistent trials cannot remain completed", () => {
  const source = makeSession();
  source.config.cycleMs = -100;
  const restored = sanitizeSlotSession(source);
  assert.equal(restored.config.cycleMs, 800);
  assert.equal(restored.finished, false);
  assert.ok(restored.trials.length < source.trials.length);
});

test("an interrupted session keeps valid rows but never becomes completed", () => {
  const source = makeSession({ finished: false, aborted: true });
  source.trials = source.trials.slice(0, 2);
  source.summary = summarizeSlotTrials(source.trials, {
    reelCount: 3,
    completionTimeMs: 12_000,
    extraInputCount: 1,
  });
  const restored = sanitizeSlotSession(source);
  assert.equal(restored.trials.length, 2);
  assert.equal(restored.finished, false);
  assert.equal(restored.aborted, true);
  assert.equal(restored.summary.trials, 2);
  assert.equal(restored.summary.extraInputCount, 1);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("slot session tests passed");
