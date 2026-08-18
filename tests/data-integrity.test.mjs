// state復元・CSV安全化・評価結果重複除去の回帰テスト。
// npm run test:unit に含まれる。単独では次で実行できる:
//   node tests/data-integrity.test.mjs

import assert from "node:assert/strict";
import {
  cloneDefaultState,
  createStateSaver,
  loadState,
  MAX_LOG_ENTRIES,
  sanitizeState,
  summarizeRhythmTrials,
} from "../src/lib/state.js";
import { escapeCsv, formatTime } from "../src/lib/utils.js";
import {
  buildRhythmCsvRows,
  buildTaskCsvRows,
  flattenEvaluationResults,
} from "../src/lib/views/evaluation.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRIZE_ART } from "../src/lib/games/craneArt.js";
import {
  cranePresets,
  cranePrizes,
  fishingPresets,
  fishingSpecies,
  gameTiles,
  rhythmPresets,
} from "../src/lib/content.js";
import { gameCreators, gameModules } from "../src/lib/games/registry.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.shouldThrow = false;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (this.shouldThrow) throw new Error("quota exceeded");
    this.values.set(key, String(value));
  }
}

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("escapeCsv neutralizes spreadsheet formulas without changing numeric negatives", () => {
  assert.equal(escapeCsv("=1+1"), "'=1+1");
  assert.equal(escapeCsv("  +SUM(A1:A2)"), "'  +SUM(A1:A2)");
  assert.equal(escapeCsv("\t@cmd"), "'\t@cmd");
  assert.equal(escapeCsv("-10"), "'-10");
  assert.equal(escapeCsv(-10), "-10");
  assert.equal(escapeCsv("safe,value"), '"safe,value"');
  assert.equal(escapeCsv(null), "");
});

test("formatTime tolerates invalid persisted dates", () => {
  assert.equal(formatTime("not-a-date"), "--:--:--");
});

// UFOキャッチャーは、続けて掴めなかったときだけ許容半径を広げる
// （games/craneGeometry.js の assistedToleranceR）。効いた値は試行ごとの
// toleranceR として残る設計なので、セッション内で値が揃っていなくても
// 落とされないことを固定する。ここが壊れると、アシストが効いた試行だけ
// 静かに消えて成功率が実際より低く記録される。
// 支援者が設定画面から変えた難易度は、セッションの config としても保存される
// （games/crane.js の resolveCraneConfig）。設定側で許す範囲が
// sanitizeScanSession の許す範囲より広いと、「設定どおりに遊んだのに保存時に
// 別の値へ丸められる」という食い違いが静かに起きる。両者の関係を固定する。
test("crane difficulty settings stay inside the range the scan session schema accepts", () => {
  const sanitized = sanitizeState({
    settings: { craneSweepMs: 999_999, craneToleranceR: 999 },
  });
  const { craneSweepMs, craneToleranceR } = sanitized.settings;

  // 設定側の上限（clamp後の値）がそのまま session.config に入っても丸められない
  const session = sanitizeState({
    sessions: [
      {
        sessionId: "cfg-1",
        taskType: "scan",
        gameId: "crane",
        participantId: "",
        startedAtIso: "2026-07-10T00:00:00.000Z",
        aborted: true,
        finished: false,
        config: {
          sweepMs: craneSweepMs,
          toleranceR: craneToleranceR,
          targetTrials: 5,
          graspAnimMs: 1200,
        },
        device: { outputLatencyS: null, baseLatencyS: null, userAgent: "test" },
        trials: [],
      },
    ],
  }).sessions[0];

  assert.equal(session.config.sweepMs, craneSweepMs);
  assert.equal(session.config.toleranceR, craneToleranceR);

  // 既定は null（＝content.js の cranePresets を使う）
  assert.equal(sanitizeState({}).settings.craneSweepMs, null);
  assert.equal(sanitizeState({}).settings.craneToleranceR, null);
  assert.equal(sanitizeState({ settings: { craneSweepMs: null } }).settings.craneSweepMs, null);
  // 下限側も同じく丸められない
  const low = sanitizeState({ settings: { craneSweepMs: 0, craneToleranceR: 0 } }).settings;
  assert.ok(low.craneSweepMs >= 400 && low.craneSweepMs <= 10_000);
  assert.ok(low.craneToleranceR >= 1 && low.craneToleranceR <= 50);
});

test("sanitizeState keeps scan trials whose tolerance differs from the session default", () => {
  const base = {
    sessionId: "assist-1",
    taskType: "scan",
    gameId: "crane",
    participantId: "P001",
    startedAtIso: "2026-07-10T00:00:00.000Z",
    aborted: false,
    finished: true,
    config: { sweepMs: 2400, toleranceR: 12, targetTrials: 3, graspAnimMs: 1200 },
    device: { outputLatencyS: null, baseLatencyS: null, userAgent: "test" },
  };
  // 狙いのずれは 3 回とも同じ 8。grip 圏は toleranceR の半分なので、
  // 12 のときは slip（8 > 6）、広がった 16.2 と 20.4 では grip になる
  // ——同じ押し方が輪の広がりで届くようになる、というアシストそのもの。
  const trialAt = (index, toleranceR, judgment) => ({
    index,
    targetX: 30,
    targetY: 40,
    toleranceR,
    selectedX: 34.8,
    selectedY: 46.4,
    dx: 4.8,
    dy: 6.4,
    distance: 8,
    xPhaseMs: 500,
    yPhaseMs: 600,
    judgment,
  });

  const sanitized = sanitizeState({
    sessions: [
      {
        ...base,
        trials: [
          trialAt(0, 12, "slip"),
          trialAt(1, 16.2, "grip"),
          trialAt(2, 20.4, "grip"),
        ],
      },
    ],
  });

  const session = sanitized.sessions[0];
  assert.equal(session.trials.length, 3, "no trial may be dropped for widening tolerance");
  assert.deepEqual(
    session.trials.map((trial) => trial.toleranceR),
    [12, 16.2, 20.4]
  );
  assert.deepEqual(
    session.trials.map((trial) => trial.judgment),
    ["slip", "grip", "grip"]
  );
  // セッションの config は既定値のまま（広げた値は試行側にだけ残る）。
  assert.equal(session.config.toleranceR, 12);
  assert.equal(session.summary.grips, 2);
  assert.equal(session.summary.slips, 1);
});

// 画像素材の欠落は画面上で「絵が出ない」だけになり、ビルドも通ってしまう。
// content.js の asset 名と実ファイルの対応をここで固定しておく。
test("game art referenced by content.js exists on disk", () => {
  const assetPath = (relative) =>
    fileURLToPath(new URL(`../src/assets/${relative}`, import.meta.url));

  cranePrizes.forEach((prize) => {
    const file = assetPath(`crane/${prize.asset}.png`);
    assert.ok(existsSync(file), `missing crane prize art: ${prize.asset}.png`);
    // リザルトは PRIZE_ART[prize.asset] を引いて画像を並べる。ここが抜けると
    // 壊れた画像アイコンが並ぶだけで、ビルドもテストも通ってしまう。
    assert.ok(PRIZE_ART[prize.asset], `craneArt has no URL for ${prize.asset}`);
  });
  assert.deepEqual(
    Object.keys(PRIZE_ART).sort(),
    cranePrizes.map((prize) => prize.asset).sort(),
    "craneArt must map exactly the prizes content.js declares"
  );
  ["claw-open", "claw-closed"].forEach((name) => {
    assert.ok(existsSync(assetPath(`crane/${name}.png`)), `missing crane art: ${name}.png`);
  });
  fishingSpecies.forEach((species) => {
    const file = assetPath(`fishing/fish-${species.asset}.png`);
    assert.ok(existsSync(file), `missing fishing art: fish-${species.asset}.png`);
  });
});

test("sanitizeState rejects invalid shapes, enums and unsafe ranges item by item", () => {
  const validTime = "2026-07-10T00:00:00.000Z";
  const logs = Array.from({ length: MAX_LOG_ENTRIES + 5 }, (_, index) => ({
    time: validTime,
    view: "home",
    type: "switch",
    label: `log-${index}`,
  }));
  const sanitized = sanitizeState({
    currentView: "javascript:alert(1)",
    currentCategory: "存在しないカテゴリ",
    matchingIndex: 99,
    operation: {
      mode: "teleport",
      pointPhase: "z",
      selectedX: -50,
      selectedY: 500,
      trials: 2,
      successes: 99,
      distances: [10, Number.NaN, -4],
    },
    settings: {
      scanInterval: -1,
      autoScan: "true",
      judgmentWindowMs: 9_999,
      rhythmBpm: 0,
      countInBeats: 99,
      targetBeats: Number.POSITIVE_INFINITY,
    },
    logs,
    evaluation: {
      condition: "unknown",
      isActive: true,
      sessionStartedAt: "broken",
      taskStartedAt: validTime,
      activeTaskIndex: 999,
      effortRating: 0,
      easeRating: 9,
      results: {},
      completedSessions: [{ taskResults: {} }],
    },
    research: {
      conditionProfile: "bad",
      environment: "moon",
      readiness: { localRun: "yes" },
    },
    rhythm: {
      sessions: [
        {
          sessionId: "r-test",
          gameId: "rhythm-l1",
          startedAtIso: validTime,
          aborted: false,
          finished: false,
          config: {},
          summary: { hits: 999, extras: 999 },
          trials: [
            {
              beatIndex: null,
              beatKind: null,
              scheduledMs: null,
              inputMs: 100,
              rawOffsetMs: null,
              appliedBaselineMs: 0,
              judgment: "extra",
              excluded: false,
            },
            { judgment: "forged" },
          ],
        },
      ],
    },
  });

  assert.equal(sanitized.currentView, "start");
  assert.equal(sanitized.currentCategory, "基本");
  assert.equal(sanitized.matchingIndex, 2);
  assert.equal(sanitized.operation.mode, "item");
  assert.equal(sanitized.operation.pointPhase, "x");
  assert.equal(sanitized.operation.selectedX, 0);
  assert.equal(sanitized.operation.selectedY, 100);
  assert.equal(sanitized.operation.successes, 2);
  assert.deepEqual(sanitized.operation.distances, [10, 0]);
  assert.equal(sanitized.settings.scanInterval, 800);
  assert.equal(sanitized.settings.autoScan, true);
  assert.equal(sanitized.settings.judgmentWindowMs, 1500);
  assert.equal(sanitized.settings.rhythmBpm, 20);
  assert.equal(sanitized.settings.countInBeats, 16);
  assert.equal(sanitized.settings.targetBeats, null);
  assert.equal(sanitized.logs.length, MAX_LOG_ENTRIES);
  assert.equal(sanitized.evaluation.condition, "web");
  assert.equal(sanitized.evaluation.isActive, false);
  assert.equal(sanitized.evaluation.taskStartedAt, null);
  assert.equal(sanitized.evaluation.activeTaskIndex, 5);
  assert.equal(sanitized.evaluation.effortRating, 1);
  assert.equal(sanitized.evaluation.easeRating, 5);
  assert.deepEqual(sanitized.evaluation.results, []);
  assert.deepEqual(sanitized.evaluation.completedSessions[0].taskResults, []);
  assert.equal(sanitized.research.conditionProfile, "optimized");
  assert.equal(sanitized.research.environment, "hospital");
  assert.equal(sanitized.research.readiness.localRun, false);
  assert.equal(sanitized.sessions[0].taskType, "sms");
  assert.equal(sanitized.sessions[0].trials[0].beatIndex, null);
  assert.equal(sanitized.sessions[0].trials[0].beatKind, null);
  assert.equal(sanitized.sessions[0].trials[0].scheduledMs, null);
  assert.equal(sanitized.sessions[0].trials.length, 1);
  assert.equal(sanitized.sessions[0].summary.hits, 0);
  assert.equal(sanitized.sessions[0].summary.extras, 1);
  assert.equal(sanitized.sessions[0].finished, false);
  assert.equal(sanitized.sessions[0].aborted, true);
  assert.deepEqual(sanitized.rhythm.sessions, []);
});

test("sanitizeState downgrades a completed session when inconsistent trials are dropped", () => {
  const validTime = "2026-07-10T00:00:00.000Z";
  const beatTrial = (overrides) => ({
    beatIndex: 0,
    beatKind: "go",
    scheduledMs: 1_000,
    inputMs: null,
    rawOffsetMs: null,
    appliedBaselineMs: 0,
    judgment: "miss",
    excluded: false,
    ...overrides,
  });
  const extraTrial = (overrides = {}) => ({
    beatIndex: null,
    beatKind: null,
    scheduledMs: null,
    inputMs: 5_500,
    rawOffsetMs: null,
    appliedBaselineMs: 0,
    judgment: "extra",
    excluded: false,
    ...overrides,
  });

  const sanitized = sanitizeState({
    rhythm: {
      sessions: [
        {
          sessionId: "r-complete",
          gameId: "gonogo",
          startedAtIso: validTime,
          finished: true,
          aborted: false,
          config: {
            mode: "gonogo",
            targetBeats: 4,
            seedSequence: ["go", "go", "nogo", "nogo"],
          },
          trials: [
            beatTrial({ judgment: "hit", inputMs: 1_050, rawOffsetMs: 50 }),
            beatTrial({ beatIndex: 1, scheduledMs: 2_000, judgment: "miss" }),
            beatTrial({
              beatIndex: 2,
              beatKind: "nogo",
              scheduledMs: 3_000,
              inputMs: 3_020,
              rawOffsetMs: 20,
              judgment: "commission",
            }),
            beatTrial({
              beatIndex: 3,
              beatKind: "nogo",
              scheduledMs: 4_000,
              judgment: "correctRejection",
            }),
            extraTrial(),
            // 以下は実ゲームが生成しない判断値/列の組合せ。
            beatTrial({ beatKind: "nogo", judgment: "hit", inputMs: 1_000, rawOffsetMs: 0 }),
            beatTrial({ beatKind: "go", judgment: "commission", inputMs: 1_000, rawOffsetMs: 0 }),
            beatTrial({ judgment: "miss", inputMs: 1_000 }),
            beatTrial({ beatKind: "nogo", judgment: "correctRejection", rawOffsetMs: 0 }),
            extraTrial({ beatIndex: 9, beatKind: "go", scheduledMs: 9_000 }),
          ],
        },
      ],
    },
  });

  const session = sanitized.sessions[0];
  assert.equal(session.finished, false);
  assert.equal(session.aborted, true);
  assert.deepEqual(
    session.trials.map((trial) => trial.judgment),
    ["hit", "miss", "commission", "correctRejection", "extra"]
  );
  assert.deepEqual(session.summary, {
    hits: 1,
    misses: 1,
    extras: 1,
    commissions: 1,
    correctRejections: 1,
    goHitRate: 0.5,
    commissionRate: 0.5,
    meanRawOffsetMs: 50,
    sdRawOffsetMs: null,
    medianRawOffsetMs: 50,
  });
});

test("sanitizeState keeps an intact finished session completed only when its beat plan is complete", () => {
  const validTime = "2026-07-10T00:00:00.000Z";
  const common = {
    appliedBaselineMs: 0,
    excluded: false,
  };
  const sanitized = sanitizeState({
    rhythm: {
      sessions: [
        {
          sessionId: "r-intact",
          gameId: "gonogo",
          startedAtIso: validTime,
          finished: true,
          aborted: false,
          config: {
            mode: "gonogo",
            bpm: 50,
            countInBeats: 3,
            targetBeats: 2,
            judgmentWindowMs: 600,
            effectiveWindowMs: 540,
            baselineOffsetMs: 0,
            goRatio: 0.5,
            seedSequence: ["go", "nogo"],
          },
          trials: [
            {
              ...common,
              beatIndex: 0,
              beatKind: "go",
              scheduledMs: 1_000,
              inputMs: 1_050,
              rawOffsetMs: 50,
              judgment: "hit",
            },
            {
              ...common,
              beatIndex: 1,
              beatKind: "nogo",
              scheduledMs: 2_000,
              inputMs: null,
              rawOffsetMs: null,
              judgment: "correctRejection",
            },
            {
              ...common,
              beatIndex: null,
              beatKind: null,
              scheduledMs: null,
              inputMs: 2_500,
              rawOffsetMs: null,
              judgment: "extra",
            },
          ],
        },
        {
          sessionId: "r-duplicate-beat",
          gameId: "rhythm-l2",
          startedAtIso: validTime,
          finished: true,
          aborted: false,
          config: { mode: "continuous", targetBeats: 2 },
          trials: [
            {
              ...common,
              beatIndex: 0,
              beatKind: "go",
              scheduledMs: 1_000,
              inputMs: 1_020,
              rawOffsetMs: 20,
              judgment: "hit",
            },
            {
              ...common,
              beatIndex: 0,
              beatKind: "go",
              scheduledMs: 2_000,
              inputMs: null,
              rawOffsetMs: null,
              judgment: "miss",
            },
          ],
        },
      ],
    },
  });

  const intact = sanitized.sessions.find((session) => session.sessionId === "r-intact");
  assert.equal(intact.finished, true);
  assert.equal(intact.aborted, false);
  const duplicate = sanitized.sessions.find(
    (session) => session.sessionId === "r-duplicate-beat"
  );
  assert.equal(duplicate.finished, false);
  assert.equal(duplicate.aborted, true);
});

test("sanitizeState downgrades a completed session when the trial cap truncates rows", () => {
  const extraTrials = Array.from({ length: 1_000 }, (_, index) => ({
    beatIndex: null,
    beatKind: null,
    scheduledMs: null,
    inputMs: 2_000 + index,
    rawOffsetMs: null,
    appliedBaselineMs: 0,
    judgment: "extra",
    excluded: false,
  }));
  const sanitized = sanitizeState({
    rhythm: {
      sessions: [
        {
          sessionId: "r-truncated",
          gameId: "rhythm-l1",
          startedAtIso: "2026-07-10T00:00:00.000Z",
          finished: true,
          aborted: false,
          config: { mode: "cued", targetBeats: 1 },
          trials: [
            {
              beatIndex: 0,
              beatKind: "go",
              scheduledMs: 1_000,
              inputMs: null,
              rawOffsetMs: null,
              appliedBaselineMs: 0,
              judgment: "miss",
              excluded: false,
            },
            ...extraTrials,
          ],
        },
      ],
    },
  });

  const session = sanitized.sessions[0];
  assert.equal(session.trials.length, 1_000);
  assert.equal(session.finished, false);
  assert.equal(session.aborted, true);
});

test("summarizeRhythmTrials derives every metric from retained, non-excluded trials", () => {
  const summary = summarizeRhythmTrials([
    {
      beatIndex: 0,
      beatKind: "go",
      scheduledMs: 1_000,
      inputMs: 1_050,
      rawOffsetMs: 50,
      judgment: "hit",
      excluded: false,
    },
    {
      beatIndex: 1,
      beatKind: "go",
      scheduledMs: 2_000,
      inputMs: 2_150,
      rawOffsetMs: 150,
      judgment: "hit",
      excluded: false,
    },
    {
      beatIndex: 2,
      beatKind: "go",
      scheduledMs: 3_000,
      inputMs: null,
      rawOffsetMs: null,
      judgment: "miss",
      excluded: true,
    },
    {
      beatIndex: 3,
      beatKind: "nogo",
      scheduledMs: 4_000,
      inputMs: 4_000,
      rawOffsetMs: 0,
      judgment: "commission",
      excluded: false,
    },
    {
      beatIndex: 4,
      beatKind: "nogo",
      scheduledMs: 5_000,
      inputMs: null,
      rawOffsetMs: null,
      judgment: "correctRejection",
      excluded: false,
    },
    {
      beatIndex: null,
      beatKind: null,
      scheduledMs: null,
      inputMs: 5_500,
      rawOffsetMs: null,
      judgment: "extra",
      excluded: false,
    },
  ]);

  assert.deepEqual(summary, {
    hits: 2,
    misses: 0,
    extras: 1,
    commissions: 1,
    correctRejections: 1,
    goHitRate: 1,
    commissionRate: 0.5,
    meanRawOffsetMs: 100,
    sdRawOffsetMs: Math.sqrt(5_000),
    medianRawOffsetMs: 100,
  });
});

test("sanitizeState falls back cleanly for a non-object JSON root", () => {
  assert.deepEqual(sanitizeState(null), cloneDefaultState());
  assert.deepEqual(sanitizeState([]), cloneDefaultState());
});

test("loadState keeps v2 migration priority while sanitizing migrated values", () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  storage.values.set(
    "neuronode-prototype-state-v2",
    JSON.stringify({
      settings: { scanInterval: 50, autoScan: false, removedSetting: "ignored" },
      evaluation: { participantId: "P-v2", condition: "native" },
      logs: [{ time: "bad", view: "bad", type: "switch", label: "legacy" }],
    })
  );
  storage.values.set(
    "neuro-trainer-state-v1",
    JSON.stringify({ settings: { scanInterval: 3000 } })
  );

  const migrated = loadState();
  assert.equal(migrated.settings.scanInterval, 800);
  assert.equal(migrated.settings.autoScan, false);
  assert.equal(migrated.evaluation.participantId, "P-v2");
  assert.equal(migrated.evaluation.condition, "native");
  assert.equal(migrated.logs[0].type, "migration");
  assert.equal(migrated.logs[1].time, "");
});

test("createStateSaver notifies once per failure streak and re-arms after recovery", async () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const state = cloneDefaultState();
  let notifications = 0;
  let visibleMessage = "";
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const save = createStateSaver(state, () => {
      notifications += 1;
      visibleMessage = "保存失敗";
    });
    storage.shouldThrow = true;
    assert.equal(save(), false);
    assert.equal(save(), false);
    // 呼び出し元がsave()直後に成功文言を出しても、microtask側の失敗通知が最後に残る。
    visibleMessage = "操作完了";
    await Promise.resolve();
    assert.equal(notifications, 1);
    assert.equal(visibleMessage, "保存失敗");

    storage.shouldThrow = false;
    assert.equal(save(), true);

    storage.shouldThrow = true;
    assert.equal(save(), false);
    await Promise.resolve();
    assert.equal(notifications, 2);
  } finally {
    console.error = originalConsoleError;
  }
});

test("flattenEvaluationResults removes legacy active/completed and double-finish duplicates", () => {
  const result = {
    participantId: "P001",
    condition: "web",
    taskId: "switch-5",
    taskTitle: "task",
    startedAt: "2026-07-10T00:00:00.000Z",
    endedAt: "2026-07-10T00:00:01.000Z",
  };
  const uniqueActive = {
    ...result,
    taskId: "matching-1",
    startedAt: "2026-07-10T00:01:00.000Z",
    endedAt: "2026-07-10T00:01:01.000Z",
  };
  const flattened = flattenEvaluationResults({
    results: [result, uniqueActive, uniqueActive],
    completedSessions: [
      {
        startedAt: "session-new",
        endedAt: "session-new-end",
        observerNotes: "newest",
        taskResults: [result],
      },
      {
        startedAt: "session-duplicate",
        endedAt: "session-duplicate-end",
        observerNotes: "old duplicate",
        taskResults: [result],
      },
    ],
  });

  assert.equal(flattened.length, 2);
  assert.equal(flattened[0].taskId, "matching-1");
  assert.equal(flattened[1].taskId, "switch-5");
  assert.equal(flattened[1].sessionStartedAt, "session-new");
  assert.equal(flattened[1].observerNotes, "newest");
});

test("game registry, presets and persisted task types stay aligned", () => {
  const knownTaskTypes = new Set(["sms", "gonogo", "scan", "rt"]);
  assert.deepEqual(
    gameModules.map((game) => game.id),
    [...gameTiles].sort((a, b) => a.order - b.order).map((game) => game.id)
  );
  gameTiles
    .filter((game) => game.taskType !== null)
    .forEach((game) => assert(knownTaskTypes.has(game.taskType), `unknown taskType: ${game.id}`));
  gameTiles.forEach((game) => assert.equal(typeof gameCreators[game.id], "function"));
  assert.deepEqual(Object.keys(rhythmPresets).sort(), [
    "calibration",
    "gonogo",
    "rhythm-l1",
    "rhythm-l2",
  ]);
  assert.equal(cranePresets.targetTrials, 5);
  // さかなつりは試行数ではなく時間（1分）で1ゲームを区切るので、プリセットに
  // targetTrials は持たない。実際の試行数は前刺激間隔の乱数で毎回変わり、
  // games/fishing.js の mount() が計画した実数を config.targetTrials へ
  // 書き戻す（sanitizeReactionSession の完走判定が
  // trials.length === targetTrials を見るため）。
  // さかなつりは2種類（純粋な単純反応時間 / 抑制つき）で、rhythmPresets と
  // 同じく gameId をキーに持つ。違いは fakeRatio だけであることを固定する。
  assert.deepEqual(Object.keys(fishingPresets).sort(), ["fishing", "fishing-gonogo"]);
  assert.equal(fishingPresets.fishing.sessionMs, 60_000);
  assert.equal(fishingPresets.fishing.targetTrials, undefined);
  assert.equal(fishingPresets.fishing.fakeRatio, 0);
  assert.ok(fishingPresets["fishing-gonogo"].fakeRatio > 0);

  const migrated = sanitizeState({
    rhythm: {
      sessions: [
        {
          sessionId: "legacy-gonogo",
          gameId: "gonogo",
          startedAtIso: "2026-07-10T00:00:00.000Z",
          finished: false,
          aborted: true,
          config: { mode: "gonogo", targetBeats: 1, seedSequence: ["go"] },
          trials: [],
        },
      ],
    },
  });
  assert.equal(migrated.sessions[0].taskType, "gonogo");
  assert.deepEqual(migrated.rhythm.sessions, []);
});

test("scan and rt CSV builders keep task-specific column counts", () => {
  const base = {
    participantId: "P1",
    startedAtIso: "2026-07-10T00:00:00.000Z",
    aborted: false,
  };
  const scanRows = buildTaskCsvRows(
    [
      {
        ...base,
        sessionId: "s-1",
        taskType: "scan",
        gameId: "crane",
        trials: [
          {
            index: 0,
            targetX: 30,
            targetY: 40,
            toleranceR: 12,
            selectedX: 31,
            selectedY: 42,
            dx: 1,
            dy: 2,
            distance: Math.sqrt(5),
            xPhaseMs: 500,
            yPhaseMs: 600,
            judgment: "grip",
          },
        ],
      },
    ],
    "scan"
  );
  // 既存18列のうしろに audioGuidance（ねらいの通過音を鳴らしていた回か。
  // games/crane.js の maybePassTone）と、端末6列を足した。
  //
  // 列数だけでなく「末尾に足した」ことを固定する: 途中に挿すと既存列の位置が
  // ずれ、列位置で読んでいる解析側が黙って壊れる（detailed-design.md §9.3）。
  const DEVICE_COLUMNS = 6;
  // 既存18列 ＋ audioGuidance ＋ difficultyMode ＋ 端末6列 ＋ readiness。
  assert.equal(scanRows[0].length, 20 + DEVICE_COLUMNS + 1);
  assert.equal(scanRows[1].length, 20 + DEVICE_COLUMNS + 1);
  assert.equal(scanRows[0][17], "judgment");
  assert.equal(scanRows[1][17], "grip");
  assert.equal(scanRows[0][18], "audioGuidance");
  // config.audioGuidance を持たない回は false（true にはしない）。
  assert.equal(scanRows[1][18], false);
  // そくてい／れんしゅうのどちらの回か。列を持たない古い記録は practice。
  assert.equal(scanRows[0][19], "difficultyMode");
  assert.equal(scanRows[1][19], "practice");
  // 端末は「記録したのに書き出さない」状態が実際にあった。列として出ることを
  // 固定する——保存されているだけの値は解析に使えない。
  assert.deepEqual(scanRows[0].slice(20, 26), [
    "deviceViewportWidth",
    "deviceViewportHeight",
    "devicePixelRatio",
    "deviceOutputLatencyS",
    "deviceBaseLatencyS",
    "deviceUserAgent",
  ]);
  // 末尾に成立確認の状態（リズムCSVと同じ）。列を持たない古い記録は n/a。
  assert.equal(scanRows[0].at(-1), "measurementReadiness");
  assert.equal(scanRows[1].at(-1), "n/a");

  const rtRows = buildTaskCsvRows(
    [
      {
        ...base,
        sessionId: "t-1",
        taskType: "rt",
        gameId: "fishing",
        trials: [
          {
            index: 0,
            kind: "real",
            foreperiodMs: 1500,
            cueMs: 1800,
            inputMs: 2100,
            reactionTimeMs: 300,
            judgment: "hit",
            excluded: false,
          },
        ],
      },
    ],
    "rt"
  );
  assert.equal(rtRows[0].length, 14 + DEVICE_COLUMNS);
  assert.equal(rtRows[1].length, 14 + DEVICE_COLUMNS);
  assert.equal(rtRows[0][13], "excluded");
  assert.equal(rtRows[0].at(-1), "deviceUserAgent");
});

test("sanitizeState restores valid scan/rt sessions and rejects unknown task types", () => {
  const common = {
    participantId: "P1",
    startedAtIso: "2026-07-10T00:00:00.000Z",
    aborted: false,
    finished: true,
    device: {},
  };
  const sanitized = sanitizeState({
    sessions: [
      {
        ...common,
        sessionId: "s-valid",
        taskType: "scan",
        gameId: "crane",
        config: { sweepMs: 2400, toleranceR: 12, targetTrials: 1, graspAnimMs: 1200 },
        trials: [
          {
            index: 0,
            targetX: 30,
            targetY: 40,
            toleranceR: 12,
            selectedX: 30,
            selectedY: 40,
            dx: 999,
            dy: 999,
            distance: 999,
            xPhaseMs: 500,
            yPhaseMs: 600,
            judgment: "grip",
          },
        ],
      },
      {
        ...common,
        sessionId: "t-valid",
        taskType: "rt",
        gameId: "fishing",
        config: {
          foreperiodMinMs: 1500,
          foreperiodMaxMs: 5000,
          limitMs: 2000,
          targetTrials: 1,
          fakeRatio: 0,
          seedSequence: [1500],
          kindSequence: ["real"],
        },
        trials: [
          {
            index: 0,
            kind: "real",
            foreperiodMs: 1500,
            cueMs: 1800,
            inputMs: 2100,
            reactionTimeMs: 999,
            judgment: "hit",
            excluded: false,
          },
        ],
      },
      {
        ...common,
        sessionId: "x-forged",
        taskType: "unknown",
        gameId: "forged",
        config: {},
        trials: [],
      },
    ],
  });

  assert.equal(sanitized.sessions.length, 2);
  const scan = sanitized.sessions.find((session) => session.sessionId === "s-valid");
  assert.equal(scan.finished, true);
  assert.equal(scan.trials[0].distance, 0);
  assert.equal(scan.summary.gripRate, 1);
  const rt = sanitized.sessions.find((session) => session.sessionId === "t-valid");
  assert.equal(rt.finished, true);
  assert.equal(rt.trials[0].reactionTimeMs, 300);
  assert.equal(rt.summary.meanRtMs, 300);
});

// ---------------------------------------------------------------------
// 測定条件が「記録され、生き延び、書き出される」こと
//
// 支援者は画面から拍の手がかり（リズム）と ねらいの通過音（UFOキャッチャー）を
// 入れられる。どちらもONにすると、その回に測っているものが変わる——リズムは
// 聴覚だけへの同期でなくなり、UFOキャッチャーは画面を見ずに解ける。
//
// 記録の経路は3つあって、どれか1つでも欠けると条件が追えなくなる:
//   1. セッションへ書き込む（games/rhythm.js・games/crane.js）
//   2. 保存と復元を生き延びる（state.js の sanitize）
//   3. CSVの列として出る（views/evaluation.js）
// 2 と 3 は落としても画面上は何も壊れないので、ここで固定する。
// ---------------------------------------------------------------------

// 条件の有無だけを見たいので、それ以外は既定どおりの1セッション分。
const RHYTHM_CONFIG = {
  mode: "cued",
  bpm: 40,
  countInBeats: 3,
  targetBeats: 10,
  judgmentWindowMs: 600,
  effectiveWindowMs: 600,
  baselineOffsetMs: 0,
  goRatio: null,
  seedSequence: [],
};

test("a rhythm session keeps its visual-guidance condition across a reload", () => {
  const base = {
    sessionId: "r-1",
    taskType: "sms",
    gameId: "rhythm-l1",
    participantId: "P001",
    startedAtIso: "2026-08-16T00:00:00.000Z",
    aborted: false,
    finished: false,
    device: {},
    trials: [],
  };
  const guided = sanitizeState({
    version: 3,
    sessions: [{ ...base, config: { ...RHYTHM_CONFIG, visualGuidance: true } }],
  });
  assert.equal(guided.sessions[0].config.visualGuidance, true);

  const plain = sanitizeState({
    version: 3,
    sessions: [{ ...base, sessionId: "r-2", config: { ...RHYTHM_CONFIG } }],
  });
  // 条件を持たない記録を true と復元しない（手がかりの仕組みが無かった頃の
  // 記録を「支援者が意図してONにした回」と取り違えない）。
  assert.equal(plain.sessions[0].config.visualGuidance, false);
});

// 記録は3経路（session.config → sanitize → CSV）すべてを通らないと意味が
// ない。過去に2回、sanitize で落として「再読み込みしたら条件が消える」状態を
// 作っている。成立確認の状態についても同じ穴を開けないよう固定する。
test("a session keeps its readiness state across a reload", () => {
  const base = {
    taskType: "sms",
    gameId: "calibration",
    participantId: "P001",
    startedAtIso: "2026-08-17T00:00:00.000Z",
    aborted: false,
    finished: true,
    device: {},
    trials: [],
  };
  const restored = sanitizeState({
    version: 3,
    sessions: [
      {
        ...base,
        sessionId: "r-a",
        config: { ...RHYTHM_CONFIG, difficultyMode: "measure", measurementReadiness: "overridden" },
      },
      {
        ...base,
        sessionId: "r-b",
        config: { ...RHYTHM_CONFIG, difficultyMode: "measure", measurementReadiness: "met" },
      },
      // 成立確認の仕組みが無かった頃の記録。
      { ...base, sessionId: "r-c", config: { ...RHYTHM_CONFIG } },
      // 値が壊れている記録。知らない値を通すと、あとで意味を決められない。
      { ...base, sessionId: "r-d", config: { ...RHYTHM_CONFIG, measurementReadiness: "yes" } },
    ],
  });
  assert.equal(restored.sessions[0].config.measurementReadiness, "overridden");
  assert.equal(restored.sessions[1].config.measurementReadiness, "met");
  // 分からないものは分からないと残す。met と復元すると、確認を経た回と
  // 区別できなくなる。
  assert.equal(restored.sessions[2].config.measurementReadiness, "n/a");
  assert.equal(restored.sessions[3].config.measurementReadiness, "n/a");
});

test("a crane session keeps its pass-tone condition across a reload", () => {
  const craneSession = (sessionId, audioGuidance) => ({
    sessionId,
    taskType: "scan",
    gameId: "crane",
    participantId: "",
    startedAtIso: "2026-08-16T00:00:00.000Z",
    aborted: false,
    finished: false,
    device: {},
    trials: [],
    config: {
      sweepMs: 2200,
      toleranceR: 15,
      targetTrials: 5,
      graspAnimMs: 1200,
      targetSequence: [],
      ...(audioGuidance === undefined ? {} : { audioGuidance }),
    },
  });
  const withTone = sanitizeState({ version: 3, sessions: [craneSession("t-1", true)] });
  assert.equal(withTone.sessions[0].config.audioGuidance, true);
  const withoutTone = sanitizeState({ version: 3, sessions: [craneSession("t-2", undefined)] });
  assert.equal(withoutTone.sessions[0].config.audioGuidance, false);
});

test("the rhythm CSV appends visualGuidance without moving the existing 18 columns", () => {
  const rows = buildRhythmCsvRows([
    {
      sessionId: "r-1",
      taskType: "sms",
      gameId: "rhythm-l1",
      participantId: "P001",
      startedAtIso: "2026-08-16T00:00:00.000Z",
      aborted: false,
      config: { ...RHYTHM_CONFIG, visualGuidance: true },
      trials: [
        {
          index: 0,
          beatIndex: 0,
          beatKind: "go",
          scheduledMs: 4500,
          inputMs: 4550,
          rawOffsetMs: 50,
          appliedBaselineMs: 0,
          judgment: "hit",
          excluded: false,
        },
      ],
    },
  ]);
  // detailed-design.md §9.3「この18列は既存データ互換のため変更しない」。
  // 途中に挿すと、列位置で読んでいる解析側が黙って壊れる。
  // 既存18列 ＋ visualGuidance ＋ 端末6列。順序を固定する。
  // 既存18列 ＋ visualGuidance ＋ difficultyMode ＋ 端末6列 ＋ readiness。
  assert.equal(rows[0].length, 20 + 6 + 1);
  assert.equal(rows[0][16], "judgment");
  assert.equal(rows[0][17], "excluded");
  assert.equal(rows[0][18], "visualGuidance");
  assert.equal(rows[0][19], "difficultyMode");
  // 端末6列は位置ごと動かない。新しい列を足すときに端末列の前へ挿すと、
  // 位置で読んでいる解析側が黙って壊れる。
  assert.equal(rows[0][25], "deviceUserAgent");
  assert.equal(rows[1][15], 50, "rawOffsetMs は生値のまま");
  assert.equal(rows[1][18], true);

  // 末尾に成立確認の状態（src/lib/readinessCheck.js）。この列が無いと、
  // 成績の低い回について「そもそも課題が成立していたのか」を後から分けられない。
  assert.equal(rows[0].at(-1), "measurementReadiness");
  // 列を持たない古い記録は n/a。met と復元してしまうと、確認を経た回と
  // 区別できなくなる。
  assert.equal(rows[1].at(-1), "n/a");
});

test("the rhythm CSV carries the readiness state of a measurement run", () => {
  const rows = buildRhythmCsvRows([
    {
      sessionId: "r-2",
      taskType: "sms",
      gameId: "calibration",
      participantId: "P001",
      startedAtIso: "2026-08-17T00:00:00.000Z",
      aborted: false,
      config: { ...RHYTHM_CONFIG, difficultyMode: "measure", measurementReadiness: "overridden" },
      trials: [
        {
          index: 0,
          beatIndex: 0,
          beatKind: "go",
          scheduledMs: 4800,
          inputMs: 4750,
          rawOffsetMs: -50,
          appliedBaselineMs: 0,
          judgment: "hit",
          excluded: false,
        },
      ],
    },
  ]);
  // 成立確認を通さずに測った回。測定は止めない代わりに、必ずそう書き出す
  // ——保存されているだけで書き出されない値は、実質「記録していない」のと同じ。
  assert.equal(rows[1].at(-1), "overridden");
});

for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
