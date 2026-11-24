// 「押せば必ず当たる」（settings.sureHit、difficultyMode.js の resolveSureHit）の検査。
//
// 見るのは3つ:
//   1. そくていの回では必ず切れる（そくていの回を変えない決まり）。
//   2. どこで押しても当たりになる（数値が、その広さになっている）。
//   3. その回を保存して読み直しても、試行が1つも落ちない。
//      読み込みのたびに sanitize が判定を検算し直すので、広い数値を sanitize が受け取れないと、
//      遊べたのに、次に開いたときには「完走していない回」になる（がんばりの記録からも消える）。

import assert from "node:assert/strict";
import { slotPresets } from "../src/lib/content.js";
import {
  MEASUREMENT_PROTOCOL,
  SURE_HIT_GAMES,
  resolveSlotDifficulty,
  resolveSureHit,
} from "../src/lib/difficultyMode.js";
import {
  SLOT_ENGINE_VERSION,
  SLOT_PROTOCOL_VERSION,
  createSeededSlotPlan,
  judgeSlotStop,
} from "../src/lib/games/slotJudge.js";
import { GAME_SETTINGS } from "../src/lib/games/gameSettings.js";
import { SETTING_DEFINITIONS } from "../src/lib/settingDefinitions.js";
import { buildSlotCsvRows } from "../src/lib/slotCsv.js";
import { defaultState, sanitizeState } from "../src/lib/state.js";

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

const PRACTICE_ON = { ...defaultState.settings, difficultyMode: "practice", sureHit: true };
const MEASURE_ON = { ...defaultState.settings, difficultyMode: "measure", sureHit: true };

/** 保存して読み直す（JSON を通す。実際の保存と同じ形）。 */
function reload(session) {
  return sanitizeState(JSON.parse(JSON.stringify({ sessions: [session] }))).sessions[0];
}

test("the default is off, and the setting survives a reload", () => {
  assert.equal(defaultState.settings.sureHit, false);
  assert.equal(sanitizeState({ settings: { sureHit: true } }).settings.sureHit, true);
  assert.equal(sanitizeState({ settings: { sureHit: "yes" } }).settings.sureHit, false, "壊れた値は既定のオフ");
});

test("a measured run never uses it, for any game", () => {
  SURE_HIT_GAMES.forEach((gameId) => {
    assert.equal(resolveSureHit(gameId, PRACTICE_ON), true, `${gameId} のれんしゅう`);
    assert.equal(resolveSureHit(gameId, MEASURE_ON), false, `${gameId} のそくてい`);
    assert.equal(resolveSureHit(gameId, { ...PRACTICE_ON, sureHit: false }), false, `${gameId} のオフ`);
  });
  assert.equal(resolveSureHit("calibration", PRACTICE_ON), false, "入れていない遊びには効かない");
  assert.equal(resolveSureHit("slot-l1", null), false);
});

test("the in-game settings offer it for exactly the games that implement it", () => {
  const offered = Object.entries(GAME_SETTINGS)
    .filter(([, definition]) => definition.groups.some((group) => group.key === "sureHit"))
    .map(([gameId]) => gameId)
    .sort();
  assert.deepEqual(offered, [...SURE_HIT_GAMES].sort());
  assert.deepEqual([...SETTING_DEFINITIONS.sureHit.inGame].sort(), [...SURE_HIT_GAMES].sort());
  assert.equal(SETTING_DEFINITIONS.sureHit.measured, true, "そくていでは固定（オフ）と画面に出る");
});

// ---------------------------------------------------------------------
// えあわせ（リール）
// ---------------------------------------------------------------------

/** どこで押しても当たる回を、エンジンと同じ形で作る。押す時刻は、わざと ばらばらにする。 */
function makeSureHitSlotSession(gameId) {
  const config = resolveSlotDifficulty(gameId, PRACTICE_ON, slotPresets[gameId], "sure-hit-test-seed");
  const plan = createSeededSlotPlan({ seed: config.seed, rounds: config.rounds, reelCount: config.reelCount });
  const trials = [];
  // 1周の中の、いろいろな場所（押してすぐ・となりの絵・ちょうど反対側・ほぼ1周あと）。
  const offsets = [5, 0.21, 0.5, 0.77, 0.98, 1.4, 2.6];
  plan.forEach((round, roundIndex) => {
    const reelStartMs = roundIndex * 30_000;
    round.reels.forEach((reel, reelIndex) => {
      const activeStartMs = reelStartMs + reelIndex * 900;
      const offset = offsets[trials.length % offsets.length];
      const inputMs = activeStartMs + (offset > 3 ? offset : offset * config.cycleMs);
      const result = judgeSlotStop({
        inputMs,
        reelStartMs,
        activeStartMs,
        cycleMs: config.cycleMs,
        toleranceMs: config.toleranceMs,
        symbolOrder: reel.symbolOrder,
        targetSymbol: round.targetSymbol,
        initialPhase: reel.initialPhase,
        wideTolerance: config.sureHit,
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
        inputMs,
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
  return {
    sessionId: `sure-hit-${gameId}`,
    taskType: "slot",
    gameId,
    protocolVersion: SLOT_PROTOCOL_VERSION,
    engineVersion: SLOT_ENGINE_VERSION,
    participantId: "P001",
    startedAtIso: "2026-11-24T00:00:00.000Z",
    endedAtIso: "2026-11-24T00:01:00.000Z",
    aborted: false,
    finished: true,
    config: {
      reelCount: config.reelCount,
      symbolCount: config.symbolCount,
      cycleMs: config.cycleMs,
      toleranceMs: config.toleranceMs,
      rounds: config.rounds,
      maxCyclesPerReel: config.maxCyclesPerReel,
      seed: config.seed,
      difficultyMode: "practice",
      textMode: "ruby",
      measurementReadiness: "n/a",
      visualGuidance: false,
      sureHit: config.sureHit,
    },
    device: {},
    trials,
    summary: null,
  };
}

test("reel: the measured run keeps the protocol values", () => {
  ["slot-l1", "slot-l2"].forEach((gameId) => {
    const measured = resolveSlotDifficulty(gameId, MEASURE_ON, slotPresets[gameId], "ignored");
    assert.equal(measured.sureHit, false);
    assert.equal(measured.toleranceMs, MEASUREMENT_PROTOCOL.slot[gameId].toleranceMs);
    assert.equal(measured.cycleMs, MEASUREMENT_PROTOCOL.slot[gameId].cycleMs);
    assert.equal(measured.seed, MEASUREMENT_PROTOCOL.slot[gameId].seed);
  });
});

test("reel: every press is a hit, wherever the reel is", () => {
  ["slot-l1", "slot-l2"].forEach((gameId) => {
    const session = makeSureHitSlotSession(gameId);
    assert.equal(session.config.sureHit, true);
    assert.equal(session.config.toleranceMs, session.config.cycleMs, "広さは1周ぶん");
    assert.ok(session.trials.length > 0);
    session.trials.forEach((trial) => assert.equal(trial.judgment, "hit", `試行 ${trial.index}`));
    // 止めた絵は実際のまま（ねらいと違う絵で止めた試行が入っている）。
    assert.ok(session.trials.some((trial) => trial.stoppedSymbol !== trial.targetSymbol));
  });
});

test("reel: the wide tolerance is refused unless the run says it is a sure-hit run", () => {
  const args = {
    inputMs: 1000,
    reelStartMs: 0,
    cycleMs: 3200,
    toleranceMs: 3200,
    symbolOrder: ["circle", "fish", "star"],
    targetSymbol: "star",
  };
  assert.throws(() => judgeSlotStop(args), RangeError);
  assert.equal(judgeSlotStop({ ...args, wideTolerance: true }).judgment, "hit");
  assert.throws(() => judgeSlotStop({ ...args, toleranceMs: 3201, wideTolerance: true }), RangeError);
});

test("reel: a saved sure-hit run comes back whole, and the CSV says so in the last column", () => {
  ["slot-l1", "slot-l2"].forEach((gameId) => {
    const source = makeSureHitSlotSession(gameId);
    const restored = reload(source);
    assert.equal(restored.trials.length, source.trials.length, `${gameId}: 試行が落ちない`);
    assert.equal(restored.finished, true);
    assert.equal(restored.aborted, false);
    assert.equal(restored.config.sureHit, true);
    assert.equal(restored.config.toleranceMs, source.config.toleranceMs);
    assert.equal(restored.summary.hits, source.trials.length);

    const rows = buildSlotCsvRows([restored]);
    assert.equal(rows[0].at(-1), "sureHit");
    assert.ok(rows.slice(1).every((row) => row.at(-1) === true));
  });
});

test("reel: an ordinary run is stored as before (sureHit false, the narrow limit)", () => {
  const source = makeSureHitSlotSession("slot-l1");
  // 印の無い記録は、これまでどおり半コマ幅で頭を押さえる。広い許容幅のまま通さない。
  delete source.config.sureHit;
  const restored = reload(source);
  assert.equal(restored.config.sureHit, false);
  assert.ok(restored.config.toleranceMs <= restored.config.cycleMs / 12);
  assert.equal(buildSlotCsvRows([restored])[1]?.at(-1) ?? false, false);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("sure-hit tests passed");
