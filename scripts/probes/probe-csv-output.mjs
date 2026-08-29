// 出力データそのものの点検。
//
// 列が揃っているかは tests/data-integrity.test.mjs が見ている。ここで見るのは
// 「セルの中身が解析に耐えるか」——数値の精度、空欄と0の区別、真偽値の綴り、
// 引用符の往復、そして端末や自由記述に何が混ざって出ていくか。
//
//   node scripts/probes/probe-csv-output.mjs

import { escapeCsv } from "../../src/lib/utils.js";
import { buildRhythmCsvRows, buildTaskCsvRows, buildSessionLedgerRows } from "../../src/lib/dataExport.js";
import { buildSlotCsvRows } from "../../src/lib/slotCsv.js";
import { buildLogCsvRows } from "../../src/lib/views/log.js";

const toCsv = (rows) => rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

const device = {
  viewportWidth: 820,
  viewportHeight: 1180,
  devicePixelRatio: 2,
  outputLatencyS: 0.0213333333333333,
  baseLatencyS: 0.01,
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
};

// --- リズム: 実際に出る浮動小数がどう見えるか ---
const rhythm = [
  {
    sessionId: "sms-1",
    taskType: "sms",
    participantId: "P1",
    gameId: "rhythm-l2",
    startedAtIso: "2026-08-28T03:00:00.000Z",
    aborted: false,
    device,
    config: {
      mode: "continuous",
      bpm: 60,
      countInBeats: 4,
      judgmentWindowMs: 540,
      effectiveWindowMs: 540,
      visualGuidance: false,
      difficultyMode: "measure",
      measurementReadiness: "met",
    },
    trials: [
      {
        appliedBaselineMs: 21.333333333333332,
        beatIndex: 0,
        beatKind: "go",
        scheduledMs: 1000.0000000000002,
        inputMs: 1032.7000000000003,
        rawOffsetMs: 32.70000000000027,
        judgment: "hit",
        excluded: false,
      },
      {
        appliedBaselineMs: 21.333333333333332,
        beatIndex: 1,
        beatKind: "go",
        scheduledMs: 2000,
        inputMs: null,
        rawOffsetMs: null,
        judgment: "miss",
        excluded: false,
      },
    ],
  },
];

// --- 走査: 距離の平方根がそのまま出るか ---
const scan = [
  {
    sessionId: "scan-1",
    taskType: "scan",
    participantId: "P1",
    gameId: "crane",
    startedAtIso: "2026-08-28T03:10:00.000Z",
    aborted: false,
    device,
    config: { audioGuidance: false, difficultyMode: "measure", measurementReadiness: "met" },
    trials: [
      {
        index: 0,
        targetX: 30,
        targetY: 40,
        toleranceR: 15,
        selectedX: 31,
        selectedY: 42,
        dx: 1,
        dy: 2,
        distance: Math.sqrt(5),
        xPhaseMs: 512.3999999999999,
        yPhaseMs: 600,
        judgment: "grip",
      },
    ],
  },
];

// --- 自由記述・記号入りの値が往復するか ---
const nastyLog = [
  {
    time: "2026-08-28T03:20:00.000Z",
    view: "home",
    type: "select",
    label: '=SUM(A1:A9)',
    correct: true,
    success: true,
    skipEvaluation: false,
    distance: 0.1 + 0.2,
  },
  {
    time: "2026-08-28T03:20:01.000Z",
    view: "home",
    type: "note",
    label: 'ひだり、みぎ "つよく" おした\n2行目',
    correct: false,
  },
  { time: "2026-08-28T03:20:02.000Z", view: "home", type: "input", label: "" },
];

const ledger = [
  {
    sessionId: "led-1",
    taskType: "sms",
    gameId: "rhythm-l2",
    participantId: "P1",
    startedAtIso: "2026-08-28T03:00:00.000Z",
    endedAtIso: "2026-08-28T03:04:00.000Z",
    finished: true,
    aborted: false,
    device,
    config: rhythm[0].config,
    summary: { trials: 2, hits: 1, meanRawOffsetMs: 32.70000000000027 },
    trials: rhythm[0].trials,
  },
];

const sections = [
  ["rhythm", toCsv(buildRhythmCsvRows(rhythm))],
  ["scan", toCsv(buildTaskCsvRows(scan, "scan"))],
  ["log", toCsv(buildLogCsvRows(nastyLog, "P1"))],
  ["ledger", toCsv(buildSessionLedgerRows(ledger))],
];

for (const [name, csv] of sections) {
  console.log(`\n===== ${name} =====`);
  console.log(csv);
}

// --- 往復（書いたものを読み戻せるか）の最小確認 ---
function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

const ledgerCsv = toCsv(buildSessionLedgerRows(ledger));
const ledgerLines = ledgerCsv.split("\n");
console.log("\n===== ledger round-trip =====");
console.log("physical lines:", ledgerLines.length);
const parsed = parseCsvLine(ledgerLines[1]);
console.log("parsed cell count:", parsed.length, "header count:", parseCsvLine(ledgerLines[0]).length);
const headers = parseCsvLine(ledgerLines[0]);
console.log("configJson round-trips:", parsed[headers.indexOf("configJson")] === JSON.stringify(ledger[0].config));
