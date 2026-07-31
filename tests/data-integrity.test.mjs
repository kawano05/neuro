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
  buildTaskCsvRows,
  flattenEvaluationResults,
} from "../src/lib/views/evaluation.js";
import {
  cranePresets,
  fishingPresets,
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
  assert.equal(fishingPresets.targetTrials, 8);

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
  assert.equal(scanRows[0].length, 18);
  assert.equal(scanRows[1].length, 18);

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
  assert.equal(rtRows[0].length, 14);
  assert.equal(rtRows[1].length, 14);
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
