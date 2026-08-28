import assert from "node:assert/strict";
import {
  SLOT_SYMBOL_IDS,
  centeredSymbolIndex,
  createSeededSlotPlan,
  judgeSlotStop,
  nearestTargetPassMs,
  reelPhaseAt,
  summarizeSlotTrials,
} from "../src/lib/games/slotJudge.js";

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

const order = [...SLOT_SYMBOL_IDS];
const base = {
  reelStartMs: 1000,
  activeStartMs: 1000,
  cycleMs: 6000,
  toleranceMs: 220,
  symbolOrder: order,
  targetSymbol: "star",
  initialPhase: 0,
};

test("phase zero places symbol zero at the centre", () => {
  const phase = reelPhaseAt({ atMs: 1000, reelStartMs: 1000, cycleMs: 6000, symbolCount: 6 });
  assert.equal(phase, 0);
  assert.equal(centeredSymbolIndex(phase, 6), 0);
});

test("the phase wraps cleanly at a full cycle", () => {
  assert.ok(reelPhaseAt({ atMs: 6999.999, reelStartMs: 1000, cycleMs: 6000, symbolCount: 6 }) > 5.99);
  assert.equal(reelPhaseAt({ atMs: 7000, reelStartMs: 1000, cycleMs: 6000, symbolCount: 6 }), 0);
});

test("early input is negative and late input is positive across a cycle boundary", () => {
  const targetAtZero = { ...base, targetSymbol: "circle" };
  const early = judgeSlotStop({ ...targetAtZero, inputMs: 6900 });
  const late = judgeSlotStop({ ...targetAtZero, inputMs: 7100 });
  assert.equal(early.targetPassMs, 7000);
  assert.equal(early.signedErrorMs, -100);
  assert.equal(late.targetPassMs, 7000);
  assert.equal(late.signedErrorMs, 100);
});

test("the exact tolerance boundary is a hit on both sides", () => {
  // star(index 2) passes at 3000ms with this setup.
  const early = judgeSlotStop({ ...base, inputMs: 2780 });
  const late = judgeSlotStop({ ...base, inputMs: 3220 });
  assert.equal(early.signedErrorMs, -220);
  assert.equal(late.signedErrorMs, 220);
  assert.equal(early.judgment, "hit");
  assert.equal(late.judgment, "hit");
  assert.equal(judgeSlotStop({ ...base, inputMs: 3220.01 }).judgment, "miss");
});

test("timeout is explicit and never invents an input error", () => {
  const result = judgeSlotStop({ ...base, inputMs: null, timeoutAtMs: 25_000 });
  assert.equal(result.judgment, "timeout");
  assert.equal(result.signedErrorMs, null);
  assert.equal(result.absoluteErrorMs, null);
  assert.equal(result.observedCycles, 4);
});

test("the closest target pass is reproducible without animation frames", () => {
  const pass = nearestTargetPassMs({
    inputMs: 12_980,
    reelStartMs: 1000,
    cycleMs: 6000,
    symbolCount: 6,
    initialPhase: 0,
    targetIndex: 0,
  });
  assert.equal(pass, 13_000);
  const inputMs = 12_930;
  // A 30fps renderer and a 120fps renderer both deliver the same funnel timestamp.
  const at30Fps = judgeSlotStop({ ...base, targetSymbol: "circle", inputMs });
  const at120Fps = judgeSlotStop({ ...base, targetSymbol: "circle", inputMs });
  assert.deepEqual(at30Fps, at120Fps);
});

test("the same seed reproduces every target, order and initial phase", () => {
  const first = createSeededSlotPlan({ seed: "slot-measure-01", rounds: 8, reelCount: 3 });
  const second = createSeededSlotPlan({ seed: "slot-measure-01", rounds: 8, reelCount: 3 });
  const different = createSeededSlotPlan({ seed: "slot-measure-02", rounds: 8, reelCount: 3 });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, different);
});

test("summary keeps signed timing, timeout, extras and per-reel values separate", () => {
  const trials = [
    { roundIndex: 0, reelIndex: 0, judgment: "hit", signedErrorMs: -100, absoluteErrorMs: 100, observedCycles: 0, inputMs: 1000, stoppedSymbol: "circle", ignoredDuplicateInputs: 1 },
    { roundIndex: 0, reelIndex: 1, judgment: "miss", signedErrorMs: 300, absoluteErrorMs: 300, observedCycles: 1, inputMs: 2200, stoppedSymbol: "fish", ignoredDuplicateInputs: 0 },
    { roundIndex: 0, reelIndex: 2, judgment: "timeout", signedErrorMs: null, absoluteErrorMs: null, observedCycles: 4, inputMs: null, stoppedSymbol: "star", ignoredDuplicateInputs: 0 },
  ];
  const summary = summarizeSlotTrials(trials, { reelCount: 3, completionTimeMs: 9000 });
  assert.equal(summary.hits, 1);
  assert.equal(summary.misses, 1);
  assert.equal(summary.timeoutCount, 1);
  assert.equal(summary.extraInputCount, 1);
  assert.equal(summary.medianAbsoluteErrorMs, 200);
  assert.equal(summary.meanSignedErrorMs, 100);
  assert.equal(summary.reelStats.length, 3);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("slot judge tests passed");
