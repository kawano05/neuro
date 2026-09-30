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
import { buildSlotCsvRows } from "../src/lib/slotCsv.js";
import { SLOT_ART_VERSION } from "../src/lib/art/slotWorldArt.js";
import { buildSessionLedgerRows } from "../src/lib/dataExport.js";
import { sanitizeState } from "../src/lib/state.js";

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

test("the shown reel cell size survives config -> sanitize -> CSV", () => {
  // 画面に出した1コマの高さ（games/slotFit.js）は刺激の大きさ。そくていの回でも、
  // 画面に入りきらないときは決まった大きさより小さくなる。sanitize が落とすと、
  // 再読み込みしただけで消える（このリポジトリで何度も踏んだ形）。
  const source = makeSession();
  source.config.reelCellPx = 62.7;
  source.trials.forEach((trial) => {
    trial.reelCellPx = 62.7;
  });
  // 途中で向きを変えると、そのあとの回は大きさが変わる。止めた1回ごとの値を出す。
  source.trials.at(-1).reelCellPx = 75.3;
  const restored = sanitizeSlotSession(JSON.parse(JSON.stringify(source)));
  assert.equal(restored.config.reelCellPx, 62.7);
  assert.equal(restored.trials.at(-1).reelCellPx, 75.3);
  const rows = buildSlotCsvRows([restored]);
  assert.equal(rows[0].at(-2), "reelCellPx");
  assert.ok(rows.slice(1, -1).every((row) => row.at(-2) === 62.7));
  assert.equal(rows.at(-1).at(-2), 75.3);
  // 1回ごとの値を持たない記録は、回の始めの値で埋める。
  const startOnly = makeSession();
  startOnly.config.reelCellPx = 82;
  assert.ok(buildSlotCsvRows([sanitizeSlotSession(startOnly)]).slice(1).every((row) => row.at(-2) === 82));
  // 無い値・おかしな値は null（分からない）。0 や負の値を大きさとして残さない。
  assert.equal(sanitizeSlotSession(makeSession()).config.reelCellPx, null);
  for (const bogus of [0, -5, Number.NaN, "94", 1e9]) {
    const session = makeSession();
    session.config.reelCellPx = bogus;
    assert.equal(sanitizeSlotSession(session).config.reelCellPx, null, `reelCellPx ${bogus}`);
  }
});

test("slot art version survives config -> reload -> slot CSV and ledger without retiring version 5", () => {
  // 絵だけの更新で、端末に残る版5の測定記録を解析の表から外さない。
  assert.equal(SLOT_ENGINE_VERSION, 5);
  const source = makeSession();
  source.config.artVersion = SLOT_ART_VERSION;
  const restored = sanitizeState(JSON.parse(JSON.stringify({ sessions: [source] }))).sessions[0];
  assert.equal(restored.config.artVersion, SLOT_ART_VERSION);
  assert.notEqual(restored.legacyVersion, true);
  assert.equal(restored.trials.length, source.trials.length);
  const rows = buildSlotCsvRows([restored]);
  assert.equal(rows[0].at(-1), "artVersion");
  assert.ok(rows.slice(1).every(row => row.at(-1) === SLOT_ART_VERSION));
  const ledger = buildSessionLedgerRows([restored]);
  assert.equal(ledger[0].at(-1), "artVersion");
  assert.equal(ledger[1].at(-1), SLOT_ART_VERSION);

  const old = sanitizeSlotSession(makeSession());
  assert.equal(old.config.artVersion, null);
  assert.notEqual(old.legacyVersion, true);
  assert.equal(buildSlotCsvRows([old]).length, old.trials.length + 1);
  assert.ok(buildSlotCsvRows([old]).slice(1).every(row => row.at(-1) === ""));
  assert.equal(buildSessionLedgerRows([old])[1].at(-1), "");
  const invalid = makeSession();
  invalid.config.artVersion = "two";
  assert.equal(sanitizeSlotSession(invalid).config.artVersion, null);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("slot session tests passed");
