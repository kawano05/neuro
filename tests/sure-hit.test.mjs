// 「押せば必ず当たる」（settings.sureHit、difficultyMode.js の resolveSureHit）の検査。
//
// 見るのは3つ:
//   1. そくていの回では必ず切れる（そくていの回を変えない決まり）。
//   2. どこで押しても当たりになる（数値が、その広さになっている）。
//   3. その回を保存して読み直しても、試行が1つも落ちない。
//      読み込みのたびに sanitize が判定を検算し直すので、広い数値を sanitize が受け取れないと、
//      遊べたのに、次に開いたときには「完走していない回」になる（がんばりの記録からも消える）。

import assert from "node:assert/strict";
import { cranePresets, fishingPresets, rhythmPresets, slotPresets } from "../src/lib/content.js";
import { buildRhythmCsvRows, buildSessionLedgerRows, buildTaskCsvRows } from "../src/lib/dataExport.js";
import {
  MEASUREMENT_PROTOCOL,
  SURE_HIT_CRANE_TOLERANCE_R,
  SURE_HIT_FISHING,
  SURE_HIT_GAMES,
  SURE_HIT_OVERRIDDEN_SETTINGS,
  resolveCraneDifficulty,
  resolveFishingDifficulty,
  resolveSlotDifficulty,
  resolveSureHit,
  sureHitRhythmWindowMs,
} from "../src/lib/difficultyMode.js";
import { assistedToleranceR } from "../src/lib/games/craneGeometry.js";
import { computeEffectiveWindowMs, judgeInput, sweepExpired } from "../src/lib/games/judge.js";
import { buildPlan, resolveParams } from "../src/lib/games/rhythm.js";
import { evaluatePick, graspOutcome } from "../src/lib/games/pointing.js";
import { judgeReaction } from "../src/lib/games/reaction.js";
import {
  SLOT_ENGINE_VERSION,
  SLOT_PROTOCOL_VERSION,
  createSeededSlotPlan,
  judgeSlotStop,
} from "../src/lib/games/slotJudge.js";
import { GAME_SETTINGS } from "../src/lib/games/gameSettings.js";
import { SETTING_DEFINITIONS } from "../src/lib/settingDefinitions.js";
import { describeReset, resetPlan, settingsField, settingsGroup, unavailableReason } from "../src/lib/settingsFields.js";
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

test("the settings it overrides are switched off with the reason in their own row", () => {
  // オンのあいだ、当たりの広さ・長さは決まった広い値で走る。変えても何も起きない操作子を、
  // 黙って置かない（docs/rules/supporter-settings.md）。
  const tweaked = { slotToleranceMs: 100, craneToleranceR: 9, fishingLimitMs: 1400 };
  const on = { ...PRACTICE_ON, ...tweaked };
  assert.equal(resolveSlotDifficulty("slot-l1", on, slotPresets["slot-l1"], "s").toleranceMs, on.slotCycleMs);
  assert.equal(resolveCraneDifficulty(on, cranePresets).toleranceR, SURE_HIT_CRANE_TOLERANCE_R);
  assert.equal(resolveFishingDifficulty("fishing", on, fishingPresets.fishing).limitMs, SURE_HIT_FISHING.limitMs);
  assert.deepEqual([...SURE_HIT_OVERRIDDEN_SETTINGS].sort(), Object.keys(tweaked).sort());

  SURE_HIT_OVERRIDDEN_SETTINGS.forEach((key) => {
    const field = settingsField(key);
    assert.equal(unavailableReason(field, on), "「押せば必ず当たる」がオンのあいだは使いません。", key);
    assert.equal(unavailableReason(field, { ...on, sureHit: false }), "", `${key} はオフなら変えられる`);
    // そくていの回は、そくていで固定される理由が先に出る（押せば必ず当たる は効いていない）。
    assert.match(unavailableReason(field, { ...on, difficultyMode: "measure" }), /^そくていの回は固定です/, key);
  });
  // 速さ・回数は、オンのあいだも効く。
  ["slotCycleMs", "slotL1Rounds", "craneSweepMs", "craneTargetTrials", "rhythmBpm", "targetBeats"].forEach((key) => {
    assert.equal(unavailableReason(settingsField(key), on), "", `${key} はオンでも変えられる`);
  });
  assert.match(unavailableReason(settingsField("sureHit"), MEASURE_ON), /そくていでは オフ/);

  // 既定に戻す: 使えない項目は戻さない。全部が使えない まとまり（さかなつり）は、理由を出して押せない。
  const fishing = settingsGroup("fishing");
  assert.equal(resetPlan(fishing, on).blockedReason, "「押せば必ず当たる」がオンのあいだは、戻せません。");
  const slotPlan = resetPlan(settingsGroup("slot"), { ...on, slotCycleMs: 4800 });
  assert.deepEqual(slotPlan.changes.map(({ field }) => field.key), ["slotCycleMs"]);
  assert.deepEqual(slotPlan.kept.map(({ field }) => field.key), ["slotToleranceMs"]);
  assert.match(describeReset(settingsGroup("slot"), slotPlan), /変えていないもの: 「合った」にする広さ（「押せば必ず当たる」がオンのあいだは使いません）/);
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

// ---------------------------------------------------------------------
// アーム
// ---------------------------------------------------------------------

/** 床の四すみ・まん中・ねらいの真上。ねらいは遊びが引く範囲（craneGeometry.js の pickTarget）の端。 */
const CRANE_PICKS = [
  { target: { x: 20, y: 22 }, selected: { x: 100, y: 100 } },
  { target: { x: 80, y: 78 }, selected: { x: 0, y: 0 } },
  { target: { x: 20, y: 78 }, selected: { x: 100, y: 0 } },
  { target: { x: 80, y: 22 }, selected: { x: 0, y: 100 } },
  { target: { x: 50, y: 50 }, selected: { x: 50, y: 50 } },
];

function makeSureHitCraneSession() {
  const config = resolveCraneDifficulty({ ...PRACTICE_ON, craneTargetTrials: CRANE_PICKS.length }, cranePresets);
  const trials = CRANE_PICKS.map(({ target, selected }, index) => {
    // 遊びと同じ道筋: アシストを通した広さで判定する（外しつづけても広がらない）。
    const toleranceR = assistedToleranceR(config.toleranceR, index, config.assistMaxSteps, config.assistStepRatio);
    const result = evaluatePick(selected, { ...target, r: toleranceR });
    return {
      index,
      targetX: target.x,
      targetY: target.y,
      toleranceR,
      sweepMs: config.sweepMs,
      selectedX: selected.x,
      selectedY: selected.y,
      dx: result.dx,
      dy: result.dy,
      distance: result.distance,
      xPhaseMs: 400 + index * 130,
      yPhaseMs: 900 + index * 70,
      judgment: graspOutcome(result.distance, toleranceR),
    };
  });
  return {
    sessionId: "sure-hit-crane",
    taskType: "scan",
    gameId: "crane",
    participantId: "P001",
    startedAtIso: "2026-11-24T00:00:00.000Z",
    endedAtIso: "2026-11-24T00:01:00.000Z",
    aborted: false,
    finished: true,
    endReason: "planned",
    config: {
      ...config,
      endless: false,
      endlessProtocolVersion: null,
      difficultyMode: "practice",
      measurementReadiness: "n/a",
      textMode: "ruby",
      targetSequence: CRANE_PICKS.map(({ target }) => target),
    },
    device: {},
    trials,
    summary: null,
  };
}

test("arm: the measured run keeps the protocol values and stays off", () => {
  const measured = resolveCraneDifficulty(MEASURE_ON, cranePresets);
  assert.equal(measured.sureHit, false);
  assert.equal(measured.toleranceR, MEASUREMENT_PROTOCOL.crane.toleranceR);
  assert.equal(measured.sweepMs, MEASUREMENT_PROTOCOL.crane.sweepMs);
  const ordinary = resolveCraneDifficulty({ ...PRACTICE_ON, sureHit: false, craneToleranceR: 24 }, cranePresets);
  assert.equal(ordinary.sureHit, false);
  assert.equal(ordinary.toleranceR, 24, "オフなら支援者の広さのまま");
});

test("arm: every stop is a grab, even from the far corner of the floor", () => {
  assert.ok(SURE_HIT_CRANE_TOLERANCE_R * 0.5 > Math.hypot(100, 100), "半分が、床の対角より大きい");
  const session = makeSureHitCraneSession();
  assert.equal(session.config.sureHit, true);
  assert.equal(session.config.toleranceR, SURE_HIT_CRANE_TOLERANCE_R);
  session.trials.forEach((trial) => {
    assert.equal(trial.judgment, "grip", `試行 ${trial.index}（距離 ${trial.distance.toFixed(1)}）`);
    assert.equal(trial.toleranceR, SURE_HIT_CRANE_TOLERANCE_R, "アシストで動かない");
  });
});

test("arm: a saved sure-hit run comes back whole, and the CSVs say so in the last column", () => {
  const source = makeSureHitCraneSession();
  const restored = reload(source);
  assert.equal(restored.trials.length, source.trials.length, "試行が落ちない");
  assert.equal(restored.finished, true);
  assert.equal(restored.aborted, false);
  assert.equal(restored.config.sureHit, true);
  assert.equal(restored.config.toleranceR, SURE_HIT_CRANE_TOLERANCE_R);
  assert.equal(restored.summary.grips, source.trials.length);
  // 止めた場所は、そのまま残る（ねらいへ寄せた値に書き換えない）。
  assert.deepEqual(
    restored.trials.map((trial) => [trial.selectedX, trial.selectedY]),
    CRANE_PICKS.map(({ selected }) => [selected.x, selected.y])
  );

  const rows = buildTaskCsvRows([restored], "scan");
  assert.equal(rows[0].at(-1), "sureHit");
  assert.ok(rows.slice(1).every((row) => row.at(-1) === true));
  const ledger = buildSessionLedgerRows([restored]);
  assert.equal(ledger[0].at(-1), "sureHit");
  assert.equal(ledger[1].at(-1), true);
});

test("arm: without the mark, the wide range is not accepted (an ordinary run cannot claim it)", () => {
  const source = makeSureHitCraneSession();
  delete source.config.sureHit;
  const restored = reload(source);
  assert.equal(restored.config.sureHit, false);
  assert.equal(restored.trials.length, 0, "広すぎる toleranceR の行は、印が無ければ通さない");
  assert.equal(restored.finished, false);
});

// ---------------------------------------------------------------------
// おとあそび（高い音だけ）
// ---------------------------------------------------------------------

/**
 * 遊びと同じ道筋で1回ぶんを回す。presses は、はじまりからの時刻（ミリ秒）。
 * 拍に入った押しは hit、入らない押し（同じ拍の2回目・はじまる前）は extra、押さなかった拍は miss。
 */
function playGonogo(settings, presses) {
  const params = resolveParams("gonogo", settings);
  const windowMs = params.sureHit
    ? sureHitRhythmWindowMs(params.bpm)
    : computeEffectiveWindowMs(params.mode, params.bpm, settings.judgmentWindowMs);
  const plan = buildPlan(params);
  let remaining = plan.judgedBeats.map((beat) => ({ index: beat.index, kind: beat.kind, timeMs: beat.timeS * 1000 }));
  const scheduled = new Map(remaining.map((beat) => [beat.index, beat.timeMs]));
  const kinds = new Map(remaining.map((beat) => [beat.index, beat.kind]));
  const trials = [];
  const expire = (nowMs) => {
    const expired = sweepExpired(nowMs, remaining, windowMs, 0);
    const gone = new Set(expired.map((entry) => entry.beatIndex));
    remaining = remaining.filter((beat) => !gone.has(beat.index));
    expired.forEach((entry) => {
      trials.push({
        index: trials.length,
        beatIndex: entry.beatIndex,
        beatKind: kinds.get(entry.beatIndex),
        scheduledMs: scheduled.get(entry.beatIndex),
        inputMs: null,
        rawOffsetMs: null,
        appliedBaselineMs: 0,
        judgment: entry.judgment,
        excluded: false,
      });
    });
  };
  [...presses].sort((a, b) => a - b).forEach((inputMs) => {
    expire(inputMs);
    const result = judgeInput(inputMs, remaining, windowMs, 0);
    if (result.beatIndex !== null) remaining = remaining.filter((beat) => beat.index !== result.beatIndex);
    trials.push({
      index: trials.length,
      beatIndex: result.beatIndex,
      beatKind: result.beatIndex !== null ? kinds.get(result.beatIndex) : null,
      scheduledMs: result.beatIndex !== null ? scheduled.get(result.beatIndex) : null,
      inputMs,
      rawOffsetMs: result.raw,
      appliedBaselineMs: 0,
      judgment: result.judgment,
      excluded: false,
    });
  });
  expire(Number.MAX_SAFE_INTEGER);
  return {
    params,
    windowMs,
    plan,
    session: {
      sessionId: "sure-hit-gonogo",
      taskType: "gonogo",
      gameId: "gonogo",
      participantId: "P001",
      startedAtIso: "2026-11-24T00:00:00.000Z",
      aborted: false,
      finished: true,
      config: {
        bpm: params.bpm,
        countInBeats: params.countInBeats,
        targetBeats: params.targetBeats,
        judgmentWindowMs: settings.judgmentWindowMs,
        effectiveWindowMs: windowMs,
        baselineOffsetMs: 0,
        mode: params.mode,
        goRatio: params.goRatio,
        visualGuidance: false,
        difficultyMode: "practice",
        textMode: "ruby",
        measurementReadiness: "n/a",
        seedSequence: plan.seedSequence,
        sureHit: params.sureHit,
      },
      device: {},
      trials,
    },
  };
}

test("tone game: the measured run keeps its window and its no-go tones", () => {
  const measured = resolveParams("gonogo", MEASURE_ON);
  assert.equal(measured.sureHit, false);
  assert.equal(measured.goRatio, rhythmPresets.gonogo.goRatio);
  assert.equal(measured.bpm, MEASUREMENT_PROTOCOL.rhythm.gonogo.bpm);
  // 基準をとる回（calibration）は、れんしゅうでも変えない。
  assert.equal(resolveParams("calibration", PRACTICE_ON).sureHit, false);
});

test("tone game: there is no tone to hold back on, and the windows of neighbouring beats touch", () => {
  const { params, windowMs, plan } = playGonogo(PRACTICE_ON, []);
  assert.equal(params.sureHit, true);
  assert.equal(params.goRatio, 1);
  assert.ok(plan.judgedBeats.every((beat) => beat.kind === "go"), "押さない合図（低い音）が無い");
  assert.equal(windowMs * 2, plan.beatIntervalS * 1000, "窓は拍の間隔の ちょうど半分");
});

test("tone game: a press anywhere between the beats is a hit, and a second press in the same beat is not a miss", () => {
  const { plan } = playGonogo(PRACTICE_ON, []);
  const interval = plan.beatIntervalS * 1000;
  const first = plan.judgedBeats[0].timeS * 1000;
  // 拍ごとに、違う場所で1回ずつ押す（拍のずっと前・ちょうど・ずっと後）。
  const fractions = [-0.49, -0.3, 0, 0.2, 0.49];
  const presses = plan.judgedBeats.map((beat, index) => beat.timeS * 1000 + fractions[index % fractions.length] * interval);
  // はじまる前（カウントのあいだ）と、同じ拍の2回目。
  const stray = [first - interval * 1.2, first + 0.05 * interval + 1];
  const { session } = playGonogo(PRACTICE_ON, [...presses, ...stray]);

  const judged = session.trials.filter((trial) => trial.beatIndex !== null);
  assert.equal(judged.length, plan.judgedBeats.length);
  judged.forEach((trial) => assert.equal(trial.judgment, "hit", `拍 ${trial.beatIndex}`));
  const others = session.trials.filter((trial) => trial.beatIndex === null);
  assert.equal(others.length, 2);
  others.forEach((trial) => assert.equal(trial.judgment, "extra", "拍に入らない押しは extra のまま記録する"));
  assert.ok(!session.trials.some((trial) => trial.judgment === "commission" || trial.judgment === "miss"));
});

test("tone game: a saved sure-hit run comes back whole, and the CSV says so in the last column", () => {
  const { plan } = playGonogo(PRACTICE_ON, []);
  const presses = plan.judgedBeats.map((beat, index) => beat.timeS * 1000 + (index % 2 ? 400 : -350));
  const { session: source, windowMs } = playGonogo(PRACTICE_ON, presses);
  const restored = reload(source);
  assert.equal(restored.trials.length, source.trials.length, "試行が落ちない");
  assert.equal(restored.aborted, false);
  assert.equal(restored.config.sureHit, true);
  assert.equal(restored.config.effectiveWindowMs, windowMs);
  assert.equal(restored.config.goRatio, 1);
  assert.equal(restored.summary.hits, plan.judgedBeats.length);

  const rows = buildRhythmCsvRows([restored]);
  assert.equal(rows[0].at(-1), "sureHit");
  assert.ok(rows.slice(1).every((row) => row.at(-1) === true));
});

// ---------------------------------------------------------------------
// さかなつり
// ---------------------------------------------------------------------

/**
 * 遊びと同じ決まりで1回ぶんを作る。魚ごとに、食いついてから reactionMs 後に押す（null は押さない）。
 * 釣れたら次の魚が前へ詰まるので、合図の時刻は等間隔にならない。
 */
function makeSureHitFishingSession(gameId, reactions) {
  const config = resolveFishingDifficulty(gameId, PRACTICE_ON, fishingPresets[gameId]);
  let cursorMs = 300;
  const trials = reactions.map((reactionMs, index) => {
    const cueMs = cursorMs + config.foreperiodMinMs;
    const inputMs = reactionMs === null ? null : cueMs + reactionMs;
    const judgment = judgeReaction(inputMs, cueMs, config.limitMs, "real");
    // 釣れたら 1.1 秒後に次の枠、逃げられたら受付の終わりから次の枠。
    cursorMs = judgment === "hit" ? inputMs + 1100 : cueMs + config.limitMs;
    return {
      index,
      kind: "real",
      foreperiodMs: config.foreperiodMinMs,
      cueMs,
      limitMs: config.limitMs,
      inputMs,
      reactionTimeMs: judgment === "hit" ? inputMs - cueMs : null,
      judgment,
      excluded: false,
    };
  });
  return {
    sessionId: `sure-hit-${gameId}`,
    taskType: "rt",
    gameId,
    participantId: "P001",
    startedAtIso: "2026-11-24T00:00:00.000Z",
    endedAtIso: "2026-11-24T00:01:00.000Z",
    aborted: false,
    finished: true,
    endReason: "planned",
    config: {
      ...config,
      targetTrials: trials.length,
      endless: false,
      endlessProtocolVersion: null,
      seedSequence: trials.map((trial) => trial.foreperiodMs),
      kindSequence: trials.map((trial) => trial.kind),
      difficultyMode: "practice",
      measurementReadiness: "n/a",
    },
    device: {},
    trials,
    summary: null,
  };
}

test("fishing: the measured run keeps the protocol values and its boots", () => {
  ["fishing", "fishing-gonogo"].forEach((gameId) => {
    const measured = resolveFishingDifficulty(gameId, MEASURE_ON, fishingPresets[gameId]);
    assert.equal(measured.sureHit, false);
    assert.equal(measured.limitMs, MEASUREMENT_PROTOCOL.fishing[gameId].limitMs);
    assert.equal(measured.fakeRatio, fishingPresets[gameId].fakeRatio);
    assert.equal(measured.foreperiodMinMs, fishingPresets[gameId].foreperiodMinMs);
    assert.equal(measured.sessionMs, fishingPresets[gameId].sessionMs);
    const ordinary = resolveFishingDifficulty(gameId, { ...PRACTICE_ON, sureHit: false, fishingLimitMs: 3000 }, fishingPresets[gameId]);
    assert.equal(ordinary.sureHit, false);
    assert.equal(ordinary.limitMs, 3000, "オフなら支援者の長さのまま");
  });
});

test("fishing: the fish bites almost at once, waits ten seconds, and no boot comes", () => {
  ["fishing", "fishing-gonogo"].forEach((gameId) => {
    const config = resolveFishingDifficulty(gameId, PRACTICE_ON, fishingPresets[gameId]);
    assert.equal(config.sureHit, true);
    assert.equal(config.fakeRatio, 0, "長靴は出ない");
    assert.equal(config.foreperiodMinMs, SURE_HIT_FISHING.foreperiodMs);
    assert.equal(config.foreperiodMaxMs, SURE_HIT_FISHING.foreperiodMs);
    assert.equal(config.approachMs, SURE_HIT_FISHING.foreperiodMs, "魚は、寄ってくる時間で糸まで来る");
    assert.equal(config.limitMs, 10_000);
    // 計画に入る魚の数（games/fishing.js の buildPlan と同じ数え方）。
    assert.equal(Math.floor(config.sessionMs / (config.foreperiodMinMs + config.limitMs)), SURE_HIT_FISHING.fishCount);
  });
  // 食いついてからなら、いつ押しても釣れる（すぐ・5秒後・10秒ちょうど）。
  [0, 1, 5_000, 10_000].forEach((reactionMs) => {
    assert.equal(judgeReaction(2_000 + reactionMs, 2_000, 10_000, "real"), "hit", `${reactionMs}ms 後`);
  });
});

test("fishing: a saved sure-hit run comes back whole, and the CSV says so in the last column", () => {
  ["fishing", "fishing-gonogo"].forEach((gameId) => {
    // 10ぴき。すぐ押す・ゆっくり押す・1ぴきは押さずに逃がす。
    const source = makeSureHitFishingSession(gameId, [120, 2_400, 9_900, 600, null, 4_000, 30, 7_500, 1_000, 300]);
    const restored = reload(source);
    assert.equal(restored.trials.length, source.trials.length, `${gameId}: 試行が落ちない`);
    assert.equal(restored.finished, true);
    assert.equal(restored.aborted, false);
    assert.equal(restored.config.sureHit, true);
    assert.equal(restored.config.limitMs, 10_000);
    assert.equal(restored.config.fakeRatio, 0);
    assert.equal(restored.summary.hits, 9);
    assert.equal(restored.summary.timeouts, 1, "押さなかった魚は、これまでどおり逃げる");
    assert.equal(restored.summary.falseStarts, 0);

    const rows = buildTaskCsvRows([restored], "rt");
    assert.equal(rows[0].at(-1), "sureHit");
    assert.ok(rows.slice(1).every((row) => row.at(-1) === true));
  });
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("sure-hit tests passed");
