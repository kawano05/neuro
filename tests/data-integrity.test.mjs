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
import { escapeCsv, formatTime, toJstIso } from "../src/lib/utils.js";
import {
  buildSessionLedgerRows,
  buildSlotCsvRows,
  buildRhythmCsvRows,
  buildTaskCsvRows,
  flattenEvaluationResults,
  SESSION_LEDGER_HEADERS,
} from "../src/lib/views/evaluation.js";
import { buildLogCsvRows } from "../src/lib/views/log.js";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PRIZE_ART } from "../src/lib/games/craneArt.js";
import {
  colorLegacyPreset,
  cranePresets,
  cranePrizes,
  fishingPresets,
  fishingSpecies,
  gameTiles,
  rhythmPresets,
  slotPresets,
} from "../src/lib/content.js";
import { gameCreators, gameModules } from "../src/lib/games/registry.js";
import { slotSymbolStripUrl } from "../src/lib/games/slotArt.js";

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

test("Switch Control mode owns shell scanning and speech volume stays in range", () => {
  const delegated = sanitizeState({
    settings: {
      switchControlMode: true,
      autoScan: true,
      speechEnabled: false,
      speechVolume: 9,
    },
  }).settings;
  assert.equal(delegated.switchControlMode, true);
  assert.equal(delegated.autoScan, false, "native and app scanning must never restore together");
  assert.equal(delegated.speechEnabled, false);
  assert.equal(delegated.speechVolume, 1);

  const quiet = sanitizeState({ settings: { speechVolume: -1 } }).settings;
  assert.equal(quiet.speechVolume, 0.2);

  const stepped = sanitizeState({ settings: { speechVolume: 0.55 } }).settings;
  assert.equal(stepped.speechVolume, 0.6);

  const invalid = sanitizeState({
    settings: { switchControlMode: "true", speechVolume: "0.4" },
  }).settings;
  assert.equal(invalid.switchControlMode, false);
  assert.equal(invalid.speechVolume, 1);
  assert.equal(invalid.autoScan, true);
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
  assert.ok(existsSync(fileURLToPath(slotSymbolStripUrl)), "missing generated slot symbol strip");
  assert.match(slotSymbolStripUrl, /slot-symbol-strip-v1\.png$/);
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

test("loadState migrates the complete v3 state to v4 without converting old rhythm sessions", () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  storage.values.set(
    "neuronode-prototype-state-v3",
    JSON.stringify({
      settings: { scanInterval: 2800, rhythmBpm: 50, hideVisualTasks: true },
      sessions: [
        {
          sessionId: "legacy-rhythm-v3",
          taskType: "sms",
          gameId: "rhythm-l1",
          participantId: "P-v3",
          startedAtIso: "2026-08-19T00:00:00.000Z",
          finished: false,
          aborted: true,
          config: { mode: "cued", targetBeats: 1 },
          device: {},
          trials: [],
        },
      ],
      logs: [],
    })
  );
  storage.values.set(
    "neuronode-prototype-state-v2",
    JSON.stringify({ settings: { scanInterval: 900 }, evaluation: { participantId: "P-v2" } })
  );

  const migrated = loadState();
  assert.equal(migrated.settings.scanInterval, 2800, "v3 must win over v2");
  assert.equal(migrated.settings.rhythmBpm, 50, "legacy rhythm settings stay for one version");
  assert.equal(migrated.settings.slotCycleMs, 3200, "new v4 settings receive safe defaults");
  assert.equal(migrated.sessions.length, 1);
  assert.equal(migrated.sessions[0].gameId, "rhythm-l1");
  assert.equal(migrated.sessions[0].taskType, "sms");
  assert.match(migrated.logs[0].label, /state-v3.*v4/);
});

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
  const knownTaskTypes = new Set(["sms", "gonogo", "scan", "rt", "slot"]);
  const knownResultTypes = new Set(["completion"]);
  assert.deepEqual(
    gameModules.map((game) => game.id),
    [...gameTiles].sort((a, b) => a.order - b.order).map((game) => game.id)
  );
  gameTiles
    .filter((game) => game.taskType !== null)
    .forEach((game) => assert(knownTaskTypes.has(game.taskType), `unknown taskType: ${game.id}`));
  gameTiles
    .filter((game) => game.resultType !== undefined)
    .forEach((game) => assert(knownResultTypes.has(game.resultType), `unknown resultType: ${game.id}`));
  const colorTile = gameTiles.find((game) => game.id === "color-legacy");
  assert.equal(colorTile.taskType, null);
  assert.equal(colorTile.resultType, "completion");
  assert.equal(colorLegacyPreset.targetPresses, 5);
  gameTiles.forEach((game) => assert.equal(typeof gameCreators[game.id], "function"));
  assert.deepEqual(Object.keys(rhythmPresets).sort(), [
    "calibration",
    "gonogo",
    "rhythm-l1",
    "rhythm-l2",
  ]);
  assert.deepEqual(Object.keys(slotPresets).sort(), ["slot-l1", "slot-l2"]);
  assert.equal(slotPresets["slot-l1"].reelCount, 1);
  assert.equal(slotPresets["slot-l2"].reelCount, 3);
  assert.equal(slotPresets["slot-l1"].cycleMs, slotPresets["slot-l2"].cycleMs);
  assert.equal(slotPresets["slot-l1"].toleranceMs, slotPresets["slot-l2"].toleranceMs);
  assert.ok(gameTiles.every((game) => !["rhythm-l1", "rhythm-l2"].includes(game.id)));
  assert.ok(gameTiles.filter((game) => game.taskType === "slot").every((game) => game.visualRequired));
  assert.equal(typeof gameCreators["rhythm-l1"], "function", "legacy creator stays for old data support");
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

test("slot CSV uses the fixed slot-v1 columns and remains formula-safe", () => {
  const expectedHeaders = [
    "sessionId", "participantId", "gameId", "protocolVersion", "engineVersion",
    "startedAtJst", "aborted", "difficultyMode", "roundIndex", "reelIndex",
    "targetSymbol", "targetIndex", "stoppedSymbol", "cycleMs", "toleranceMs",
    "inputMs", "targetPassMs", "signedErrorMs", "absoluteErrorMs", "observedCycles",
    "judgment", "seed", "symbolOrder", "deviceViewportWidth", "deviceViewportHeight",
    "devicePixelRatio", "deviceUserAgent", "measurementReadiness",
  ];
  const rows = buildSlotCsvRows([
    {
      sessionId: "slot-1",
      participantId: "=FORMULA()",
      taskType: "slot",
      gameId: "slot-l2",
      protocolVersion: "slot-v1",
      engineVersion: 1,
      startedAtIso: "2026-08-20T00:00:00.000Z",
      aborted: false,
      config: {
        difficultyMode: "measure",
        cycleMs: 3200,
        toleranceMs: 220,
        seed: "slot-measure-01",
        measurementReadiness: "met",
      },
      device: {
        viewportWidth: 1024,
        viewportHeight: 768,
        devicePixelRatio: 2,
        userAgent: "@unsafe",
      },
      trials: [
        {
          roundIndex: 0,
          reelIndex: 0,
          targetSymbol: "star",
          targetIndex: 2,
          stoppedSymbol: "star",
          inputMs: 4380,
          targetPassMs: 4200,
          signedErrorMs: 180,
          absoluteErrorMs: 180,
          observedCycles: 1,
          judgment: "hit",
          symbolOrder: ["circle", "fish", "star", "flower", "bird", "square"],
        },
      ],
    },
  ]);
  // 既存28列の**うしろ**に端末の遅延2列を足した（2026-08-28）。保存はして
  // いたのにリールCSVだけ出していなかった。位置を動かさないことも固定する。
  assert.deepEqual(rows[0].slice(0, 28), expectedHeaders);
  assert.deepEqual(rows[0].slice(28), ["deviceOutputLatencyS", "deviceBaseLatencyS"]);
  assert.equal(rows[0].length, 30);
  assert.equal(rows[1].length, 30);
  assert.equal(rows[1][22], JSON.stringify(["circle", "fish", "star", "flower", "bird", "square"]));
  // 遅延を持たない端末の記録は空欄（0にしない——測っていないことと、
  // 遅延が0だったことは違う）。
  assert.equal(rows[1][28], "");
  assert.equal(rows[1][29], "");
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  assert.ok(csv.includes("'=FORMULA()"), "participant IDs cannot become spreadsheet formulas");
  assert.ok(csv.includes("'@unsafe"), "device strings cannot become spreadsheet formulas");
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
  // 既存18列 ＋ audioGuidance ＋ difficultyMode ＋ 端末6列 ＋ readiness
  // ＋ endless ＋ sweepMs。
  assert.equal(scanRows[0].length, 20 + DEVICE_COLUMNS + 3);
  assert.equal(scanRows[1].length, 20 + DEVICE_COLUMNS + 3);
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
  // 成立確認の状態（リズムCSVと同じ）。列を持たない古い記録は n/a。
  // 位置を固定する: endless を足したときに、ここへ挿し込んで既存列を
  // 1つずつずらしかけた（このテストが止めた）。
  assert.equal(scanRows[0][26], "measurementReadiness");
  assert.equal(scanRows[1][26], "n/a");
  // エンドレスの回か。config に無い古い記録は false。
  assert.equal(scanRows[0][27], "endless");
  assert.equal(scanRows[1][27], false);
  // その試行のアームの速さ。エンドレスでは試行ごとに変わるので、toleranceR
  // だけでは要求精度（grip圏の半径 × sweepMs/100）が出せない。
  assert.equal(scanRows[0].at(-1), "sweepMs");
  assert.equal(scanRows[1].at(-1), "");

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
  // 反応課題だけ測定条件が1列も出ていなかった（2026-08-28）。リズム・走査と
  // 同じ2列を、既存列の**うしろ**に足す。
  assert.equal(rtRows[0].length, 14 + DEVICE_COLUMNS + 3);
  assert.equal(rtRows[1].length, 14 + DEVICE_COLUMNS + 3);
  assert.equal(rtRows[0][13], "excluded");
  assert.equal(rtRows[0][14 + DEVICE_COLUMNS - 1], "deviceUserAgent");
  assert.equal(rtRows[0][14 + DEVICE_COLUMNS], "difficultyMode");
  assert.equal(rtRows[0][14 + DEVICE_COLUMNS + 1], "measurementReadiness");
  assert.equal(rtRows[0].at(-1), "endless");
  // 列を持たない古い記録は practice / n/a / false に倒す（scan と同じ既定）。
  assert.equal(rtRows[1][14 + DEVICE_COLUMNS], "practice");
  assert.equal(rtRows[1][14 + DEVICE_COLUMNS + 1], "n/a");
  assert.equal(rtRows[1].at(-1), false);
});

test("a reaction session keeps difficultyMode and readiness across a reload", () => {
  // config → sanitize → CSV の3経路すべてを通ること。さかなつりは成立確認の
  // 「いしを もって おせる」の根拠にも使うので、そくてい／れんしゅうを
  // 分けられないと成立確認の材料そのものが層別できない。
  const sanitized = sanitizeState({
    sessions: [
      {
        sessionId: "rt-mode",
        taskType: "rt",
        gameId: "fishing",
        participantId: "P9",
        startedAtIso: "2026-08-28T00:00:00.000Z",
        aborted: false,
        finished: true,
        device: {},
        config: {
          foreperiodMinMs: 1500,
          foreperiodMaxMs: 5000,
          limitMs: 2000,
          targetTrials: 1,
          fakeRatio: 0.25,
          difficultyMode: "measure",
          measurementReadiness: "overridden",
        },
        trials: [
          {
            index: 0,
            kind: "real",
            foreperiodMs: 1500,
            cueMs: 1800,
            inputMs: 2100,
            reactionTimeMs: 300,
            limitMs: 2000,
            judgment: "hit",
            excluded: false,
          },
        ],
      },
    ],
  });
  const restored = sanitized.sessions[0];
  assert.equal(restored.config.difficultyMode, "measure");
  assert.equal(restored.config.measurementReadiness, "overridden");
  const rows = buildTaskCsvRows(sanitized.sessions, "rt");
  assert.equal(rows[1][rows[0].indexOf("difficultyMode")], "measure");
  assert.equal(rows[1][rows[0].indexOf("measurementReadiness")], "overridden");
  // 不正値は既定へ倒す（列が消えるのではなく、値が既定になる）。
  const bogus = sanitizeState({
    sessions: [
      {
        sessionId: "rt-bogus",
        taskType: "rt",
        gameId: "fishing",
        startedAtIso: "2026-08-28T00:00:00.000Z",
        aborted: true,
        finished: false,
        device: {},
        config: { difficultyMode: "hard", measurementReadiness: "yes" },
        trials: [],
      },
    ],
  });
  assert.equal(bogus.sessions[0].config.difficultyMode, "practice");
  assert.equal(bogus.sessions[0].config.measurementReadiness, "n/a");
});

test("the session ledger lists one row per session, including runs with no trials", () => {
  // ロング形式の5本は「1試行1行」なので、試行が0件で終わった回（中断、
  // 音が出せなかった回）はどのCSVにも1行も現れない。欠測を数えられない
  // データは、欠測が無いデータと区別がつかない。台帳はそこを埋める。
  const sessions = [
    {
      sessionId: "led-1",
      taskType: "slot",
      gameId: "slot-l1",
      participantId: "P1",
      startedAtIso: "2026-08-28T00:00:00.000Z",
      endedAtIso: "2026-08-28T00:04:10.000Z",
      finished: true,
      aborted: false,
      protocolVersion: "slot-v1",
      engineVersion: "slot-engine-1",
      device: { viewportWidth: 820, viewportHeight: 1180 },
      config: { difficultyMode: "measure", measurementReadiness: "met", cycleMs: 3200 },
      trials: [{ roundIndex: 0, excluded: false }, { roundIndex: 1, excluded: true }],
      summary: { rounds: 2 },
    },
    {
      // 中断してtrialsが空のまま保存された回。
      sessionId: "led-2",
      taskType: "rt",
      gameId: "fishing",
      participantId: "P1",
      startedAtIso: "2026-08-28T01:00:00.000Z",
      finished: false,
      aborted: true,
      device: {},
      config: {},
      trials: [],
      summary: {},
    },
  ];
  const rows = buildSessionLedgerRows(sessions);
  assert.deepEqual(rows[0], [...SESSION_LEDGER_HEADERS]);
  assert.equal(rows.length, 3, "1セッション1行（見出しを除いて2行）");

  const header = rows[0];
  const first = rows[1];
  assert.equal(first[header.indexOf("sessionId")], "led-1");
  assert.equal(first[header.indexOf("difficultyMode")], "measure");
  assert.equal(first[header.indexOf("measurementReadiness")], "met");
  assert.equal(first[header.indexOf("trialCount")], 2);
  assert.equal(first[header.indexOf("excludedTrialCount")], 1);
  assert.equal(first[header.indexOf("protocolVersion")], "slot-v1");
  // summary は課題ごとに形が違うのでJSONのまま1列に入れる。
  assert.equal(first[header.indexOf("summaryJson")], JSON.stringify({ rounds: 2 }));

  const aborted = rows[2];
  assert.equal(aborted[header.indexOf("sessionId")], "led-2");
  assert.equal(aborted[header.indexOf("aborted")], true);
  assert.equal(aborted[header.indexOf("finished")], false);
  assert.equal(aborted[header.indexOf("trialCount")], 0);
  // 版を持たない課題は空欄。「無い」ことを空欄で表し、他課題の値を借りない。
  assert.equal(aborted[header.indexOf("protocolVersion")], "");
  // 記録が無い回も既定へ倒して必ず値を出す。
  assert.equal(aborted[header.indexOf("difficultyMode")], "practice");
  assert.equal(aborted[header.indexOf("measurementReadiness")], "n/a");
  // 終端の時刻。押されている回は出し、押されないまま消えた回は空欄にする
  // ——「終わらなかった回」を、終わった回のように見せない。
  assert.equal(first[header.indexOf("endedAtJst")], "2026-08-28T09:04:10.000+09:00");
  assert.equal(aborted[header.indexOf("endedAtJst")], "");

  // ロング形式では消えていることの対比（この回はrt CSVに1行も出ない）。
  const rtRows = buildTaskCsvRows(sessions, "rt");
  assert.equal(rtRows.length, 1, "見出しだけで、中断した回の行は無い");
});

test("a reaction trial keeps the response window it was actually judged against", () => {
  // エンドレスでは受付時間が試行ごとに短くなる（games/fishing.js の
  // endlessLimitMs）。以前は sanitize が config の limitMs を全試行へ
  // 上書きしていたので、短い窓で時間切れになった試行を「まだ間に合って
  // いた」として再判定し、判定が食い違った行を**丸ごと捨てて**いた
  // （sanitizeReactionTrial は合わない行を null にする）。難しくした回ほど
  // データが消える、といういちばん困る壊れ方をする。
  const session = {
    sessionId: "rt-window",
    taskType: "rt",
    gameId: "fishing",
    participantId: "P1",
    startedAtIso: "2026-08-28T00:00:00.000Z",
    finished: true,
    aborted: false,
    device: {},
    config: {
      foreperiodMinMs: 1800,
      foreperiodMaxMs: 4200,
      limitMs: 2000,
      targetTrials: 2,
      fakeRatio: 0,
      endless: true,
    },
    trials: [
      // 窓 2000ms、cue から 900ms で押した → hit。
      {
        index: 0,
        kind: "real",
        foreperiodMs: 1800,
        cueMs: 1800,
        limitMs: 2000,
        inputMs: 2700,
        reactionTimeMs: 900,
        judgment: "hit",
        excluded: false,
      },
      // 窓が 1250ms まで狭まった試行。cue から 1400ms は**時間切れ**。
      // config の 2000ms で再判定すると hit になってしまい、行が落ちる。
      {
        index: 1,
        kind: "real",
        foreperiodMs: 2000,
        cueMs: 6000,
        limitMs: 1250,
        inputMs: null,
        reactionTimeMs: null,
        judgment: "timeout",
        excluded: false,
      },
    ],
  };
  const restored = sanitizeState({ sessions: [session] }).sessions[0];
  assert.equal(restored.trials.length, 2, "狭い窓の試行が捨てられてはいけない");
  assert.equal(restored.trials[0].limitMs, 2000);
  assert.equal(restored.trials[1].limitMs, 1250);
  assert.equal(restored.trials[1].judgment, "timeout");
  // 完走扱いのまま残る（落ちると成立確認の材料からも外れる）。
  assert.equal(restored.aborted, false);

  // limitMs を持たない古い記録は、これまでどおり config の値で補う。
  const legacy = sanitizeState({
    sessions: [
      {
        ...session,
        sessionId: "rt-legacy",
        config: { ...session.config, targetTrials: 1, endless: false },
        trials: [{ ...session.trials[0], limitMs: undefined }],
      },
    ],
  }).sessions[0];
  assert.equal(legacy.trials.length, 1);
  assert.equal(legacy.trials[0].limitMs, 2000);
});

test("exported timestamps are Japan time with the offset kept", () => {
  // 記録はUTC。書き出しだけを日本時間にする。
  assert.equal(toJstIso("2026-08-28T15:00:00.000Z"), "2026-08-29T00:00:00.000+09:00");
  // 日本時間の夕方はUTCでは同じ日の朝。日ごとの集計はここでずれる。
  assert.equal(toJstIso("2026-08-28T09:30:00.000Z"), "2026-08-28T18:30:00.000+09:00");
  // オフセットを必ず残す。落とすとUTCの値と見分けがつかなくなる。
  assert.ok(toJstIso("2026-08-28T00:00:00.000Z").endsWith("+09:00"));
  // 端末のタイムゾーン設定に依存させない（固定 +09:00）。
  assert.equal(toJstIso("2026-01-15T12:00:00.000Z"), "2026-01-15T21:00:00.000+09:00");
  // 読めない値・空値は空欄にする（0時や現在時刻をでっち上げない）。
  assert.equal(toJstIso(""), "");
  assert.equal(toJstIso("not a date"), "");
  assert.equal(toJstIso(undefined), "");
  assert.equal(toJstIso(null), "");

  // 各CSVが実際に日本時間で出ること。
  const session = {
    sessionId: "jst-1",
    taskType: "scan",
    gameId: "crane",
    participantId: "P1",
    startedAtIso: "2026-08-28T15:30:00.000Z",
    aborted: false,
    finished: true,
    device: {},
    config: {},
    trials: [
      {
        index: 0,
        targetX: 1,
        targetY: 1,
        toleranceR: 10,
        selectedX: 1,
        selectedY: 1,
        dx: 0,
        dy: 0,
        distance: 0,
        xPhaseMs: 1,
        yPhaseMs: 1,
        judgment: "grip",
      },
    ],
  };
  const scanRows = buildTaskCsvRows([session], "scan");
  assert.equal(scanRows[0][4], "startedAtJst");
  assert.equal(scanRows[1][4], "2026-08-29T00:30:00.000+09:00");

  const ledgerRows = buildSessionLedgerRows([session]);
  assert.equal(
    ledgerRows[1][ledgerRows[0].indexOf("startedAtJst")],
    "2026-08-29T00:30:00.000+09:00"
  );

  const logRows = buildLogCsvRows([{ time: "2026-08-28T15:30:00.000Z", view: "home", type: "x" }], "P1");
  assert.equal(logRows[0][0], "time_jst");
  assert.equal(logRows[1][0], "2026-08-29T00:30:00.000+09:00");
});

test("the log CSV exports the fields the log already stored", () => {
  // success / skipEvaluation / distance は sanitizeLogEntry がずっと保持して
  // いたのに、どのCSVにも出していなかった。保存されているだけの値は解析に
  // 使えない＝実質「記録していない」のと同じ。
  const rows = buildLogCsvRows(
    [
      {
        time: "2026-08-28T00:00:00.000Z",
        view: "home",
        type: "select",
        label: "あか",
        correct: true,
        success: true,
        skipEvaluation: false,
        distance: 12.5,
      },
      { time: "2026-08-28T00:00:01.000Z", view: "home", type: "input", label: "" },
    ],
    "P7"
  );
  const header = rows[0];
  assert.deepEqual(header.slice(0, 5), ["time_jst", "view", "type", "label", "correct"]);
  assert.deepEqual(header.slice(5), [
    "success",
    "skip_evaluation",
    "distance",
    // 行ごとの帰属ではないことを名前で示す。ログは参加者をまたいでたまる。
    "exported_participant_id",
  ]);
  assert.equal(rows[1][header.indexOf("success")], true);
  assert.equal(rows[1][header.indexOf("skip_evaluation")], false);
  assert.equal(rows[1][header.indexOf("distance")], 12.5);
  // 参加者IDは書き出し全体に共通の値として全行に入る。
  assert.equal(rows[1][header.indexOf("exported_participant_id")], "P7");
  assert.equal(rows[2][header.indexOf("exported_participant_id")], "P7");
  // 値を持たない古いエントリは空欄（false や 0 を作らない）。
  assert.equal(rows[2][header.indexOf("success")], "");
  assert.equal(rows[2][header.indexOf("distance")], "");
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

test("fresh state enables the guided practice lane by default", () => {
  assert.equal(cloneDefaultState().settings.visualGuidance, true);
  assert.equal(sanitizeState({}).settings.visualGuidance, true);
});

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
    sessions: [
      {
        ...base,
        config: {
          ...RHYTHM_CONFIG,
          visualGuidance: true,
          visualPresentation: "lane",
        },
      },
    ],
  });
  assert.equal(guided.sessions[0].config.visualGuidance, true);
  assert.equal(guided.sessions[0].config.visualPresentation, "lane");

  const oldGuided = sanitizeState({
    version: 3,
    sessions: [
      {
        ...base,
        sessionId: "r-old-guided",
        config: { ...RHYTHM_CONFIG, visualGuidance: true },
      },
    ],
  });
  // visualPresentation 導入前のガイドあり記録は、当時の条件から lane と復元する。
  assert.equal(oldGuided.sessions[0].config.visualPresentation, "lane");

  const plain = sanitizeState({
    version: 3,
    sessions: [{ ...base, sessionId: "r-2", config: { ...RHYTHM_CONFIG } }],
  });
  // 条件を持たない記録を true と復元しない（手がかりの仕組みが無かった頃の
  // 記録を「支援者が意図してONにした回」と取り違えない）。
  assert.equal(plain.sessions[0].config.visualGuidance, false);
  assert.equal(plain.sessions[0].config.visualPresentation, "instrument");

  const oldCalibration = sanitizeState({
    version: 3,
    sessions: [
      {
        ...base,
        sessionId: "r-old-calibration",
        gameId: "calibration",
        config: { ...RHYTHM_CONFIG, visualGuidance: true },
      },
    ],
  });
  // そくていは古い記録に誤って true があっても、未来ノートありへ復元しない。
  assert.equal(oldCalibration.sessions[0].config.visualPresentation, "instrument");
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
