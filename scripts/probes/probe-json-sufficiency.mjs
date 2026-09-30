// 生データJSONだけで解析できるか——CSVを1列も落とさず再構成できるかを確かめる。
//
// 「JSONに全部入っています」と言うだけなら簡単だが、実際には CSV 側でしか
// 計算していない値が混じりうる。書き出したJSONを読み直して同じ関数へ通し、
// 元のCSVと1文字も違わないことを見る。違えば、その列はJSONから作れない。
//
//   node scripts/probes/probe-json-sufficiency.mjs

import { sanitizeState, cloneDefaultState } from "../../src/lib/state.js";
import {
  buildRhythmCsvRows,
  buildTaskCsvRows,
  buildSessionLedgerRows,
  buildLogCsvRows,
} from "../../src/lib/dataExport.js";
import { buildSlotCsvRows } from "../../src/lib/slotCsv.js";
import { escapeCsv } from "../../src/lib/utils.js";

const device = {
  viewportWidth: 820,
  viewportHeight: 1180,
  devicePixelRatio: 2,
  outputLatencyS: 0.0213,
  baseLatencyS: 0.01,
  userAgent: "iPad UA",
  inputMethod: "ios-switch-control",
};

const scanTrial = (i, grip) => {
  const dx = grip ? 2 : 30;
  return {
    index: i,
    targetX: 40,
    targetY: 40,
    toleranceR: 15,
    selectedX: 40 + dx,
    selectedY: 40,
    dx,
    dy: 0,
    distance: dx,
    xPhaseMs: 100 + i,
    yPhaseMs: 200 + i,
    judgment: grip ? "grip" : "miss",
    sweepMs: 2200,
  };
};

const raw = {
  ...cloneDefaultState(),
  evaluation: { ...cloneDefaultState().evaluation, participantId: "P1" },
  logs: [
    {
      time: "2026-08-29T00:00:00.000Z",
      view: "home",
      type: "select",
      label: "あか",
      correct: true,
      success: true,
      skipEvaluation: false,
      distance: 12.5,
    },
  ],
  sessions: [
    // 走査（エンドレス、失敗で終了）
    {
      sessionId: "scan-1",
      taskType: "scan",
      gameId: "crane",
      participantId: "P1",
      startedAtIso: "2026-08-29T00:00:00.000Z",
      endedAtIso: "2026-08-29T00:03:00.000Z",
      endReason: "failure",
      finished: true,
      aborted: false,
      device,
      config: {
        sweepMs: 2200,
        toleranceR: 15,
        targetTrials: 3,
        difficultyMode: "practice",
        endless: true,
        endlessProtocolVersion: "endless-v2",
        measurementReadiness: "n/a",
      },
      trials: [scanTrial(0, true), scanTrial(1, true), scanTrial(2, false)],
      summary: {},
    },
    // 反応（試行ごとに受付時間が変わる）
    {
      sessionId: "rt-1",
      taskType: "rt",
      gameId: "fishing",
      participantId: "P1",
      startedAtIso: "2026-08-29T01:00:00.000Z",
      endedAtIso: "2026-08-29T01:01:00.000Z",
      endReason: "manual",
      finished: true,
      aborted: false,
      device,
      config: {
        foreperiodMinMs: 1800,
        foreperiodMaxMs: 4200,
        limitMs: 2000,
        targetTrials: 2,
        fakeRatio: 0,
        endless: true,
        endlessProtocolVersion: "endless-v2",
        difficultyMode: "practice",
      },
      trials: [
        {
          index: 0,
          kind: "real",
          foreperiodMs: 1800,
          cueMs: 1800,
          limitMs: 2000,
          inputMs: 2100,
          reactionTimeMs: 300,
          judgment: "hit",
          excluded: false,
        },
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
      summary: {},
    },
    // リズム
    {
      sessionId: "sms-1",
      taskType: "sms",
      gameId: "rhythm-l2",
      participantId: "P1",
      startedAtIso: "2026-08-29T02:00:00.000Z",
      finished: true,
      aborted: false,
      device,
      config: {
        mode: "continuous",
        bpm: 50,
        countInBeats: 4,
        targetBeats: 4,
        judgmentWindowMs: 540,
        effectiveWindowMs: 540,
        difficultyMode: "measure",
        visualGuidance: true,
        measurementReadiness: "met",
      },
      trials: [0, 1, 2, 3].map((i) => ({
        beatIndex: i,
        beatKind: "go",
        scheduledMs: 1200 * (i + 1),
        inputMs: 1200 * (i + 1) + 30,
        rawOffsetMs: 30,
        judgment: "hit",
        excluded: false,
        appliedBaselineMs: 0,
      })),
      summary: {},
    },
  ],
};

// アプリが保存している形（sanitize を通ったもの）＝生データJSONの中身。
const state = sanitizeState(raw);

// 実際に書き出す JSON と同じ形にして、文字列化 → 読み直す。
const payload = {
  exportedAtIso: new Date().toISOString(),
  storageKey: "neuronode-prototype-state-v4",
  sessionCount: state.sessions.length,
  logCount: state.logs.length,
  state,
};
const restored = JSON.parse(JSON.stringify(payload)).state;

const toCsv = (rows) => rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

const cases = [
  ["セッション台帳", (s) => buildSessionLedgerRows(s.sessions)],
  ["走査CSV", (s) => buildTaskCsvRows(s.sessions, "scan")],
  ["反応CSV", (s) => buildTaskCsvRows(s.sessions, "rt")],
  ["リズムCSV", (s) => buildRhythmCsvRows(s.sessions.filter((x) => x.taskType === "sms"))],
  ["リールCSV", (s) => buildSlotCsvRows(s.sessions)],
  ["操作ログCSV", (s) => buildLogCsvRows(s.logs, s.evaluation.participantId)],
];

let mismatch = 0;
for (const [name, build] of cases) {
  const fromApp = toCsv(build(state));
  const fromJson = toCsv(build(restored));
  const same = fromApp === fromJson;
  if (!same) mismatch += 1;
  const rows = build(state).length - 1;
  console.log(`${same ? "一致" : "不一致"}  ${name.padEnd(12)} 見出しを除いて ${rows} 行`);
}

console.log("\n不一致:", mismatch, "件");
console.log(
  mismatch === 0
    ? "→ 生データJSONだけで、すべてのCSVを1文字も違わず再構成できる。"
    : "→ JSONから作れない列がある。上の不一致を見ること。"
);

// 参考: JSONにしか無いもの
console.log("\n参考: JSONにあってCSVに出ていないもの");
console.log("  settings:", Object.keys(restored.settings).length, "項目（そのときの設定一式）");
console.log("  evaluation.participantId:", JSON.stringify(restored.evaluation.participantId));
console.log("  各セッションの summary（要約）は台帳の summaryJson にのみ出る");
