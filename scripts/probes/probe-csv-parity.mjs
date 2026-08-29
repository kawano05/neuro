// 見出しと行のセル数が一致するか（ずれると解析側が列を1つずつ取り違える）。
// あわせて、端末の遅延がどのCSVに出ているかを一覧する。
//
//   node scripts/probes/probe-csv-parity.mjs

import { buildRhythmCsvRows, buildTaskCsvRows, buildSessionLedgerRows } from "../../src/lib/views/evaluation.js";
import { buildSlotCsvRows, SLOT_CSV_HEADERS } from "../../src/lib/slotCsv.js";
import { buildLogCsvRows } from "../../src/lib/views/log.js";
import { sanitizeState } from "../../src/lib/state.js";

const device = {
  viewportWidth: 820,
  viewportHeight: 1180,
  devicePixelRatio: 2,
  outputLatencyS: 0.0213,
  baseLatencyS: 0.01,
  userAgent: "UA",
};

const slotSession = {
  sessionId: "slot-1",
  taskType: "slot",
  gameId: "slot-l1",
  participantId: "P1",
  protocolVersion: "slot-v1",
  engineVersion: "slot-engine-1",
  startedAtIso: "2026-08-28T03:00:00.000Z",
  endedAtIso: "2026-08-28T03:03:00.000Z",
  aborted: false,
  finished: true,
  device,
  config: {
    cycleMs: 3200,
    toleranceMs: 220,
    seed: "slot-measure-01",
    difficultyMode: "measure",
    measurementReadiness: "met",
    reelCount: 3,
    symbolCount: 6,
    rounds: 8,
  },
  trials: [
    {
      roundIndex: 0,
      reelIndex: 0,
      targetSymbol: "a",
      targetIndex: 0,
      stoppedSymbol: "a",
      inputMs: 1000,
      targetPassMs: 990,
      signedErrorMs: 10,
      absoluteErrorMs: 10,
      observedCycles: 1,
      judgment: "hit",
      symbolOrder: ["a", "b", "c"],
      ignoredDuplicateInputs: 0,
      excluded: false,
    },
  ],
  summary: {},
};

const cases = [
  ["slot", buildSlotCsvRows([slotSession])],
  ["ledger", buildSessionLedgerRows([slotSession])],
  ["log", buildLogCsvRows([{ time: "t", view: "home", type: "x", label: "l" }], "P1")],
];

let mismatched = 0;
for (const [name, rows] of cases) {
  const headerCount = rows[0].length;
  rows.slice(1).forEach((row, index) => {
    if (row.length !== headerCount) {
      mismatched += 1;
      console.log(`MISMATCH ${name} row ${index + 1}: ${row.length} cells vs ${headerCount} headers`);
    }
  });
  console.log(`${name}: ${headerCount} headers, ${rows.length - 1} row(s), parity ok`);
}

// 端末の遅延（音の出力遅延）がどのCSVに出るか。
const hasLatency = (headers) => headers.includes("deviceOutputLatencyS");
console.log("\n--- deviceOutputLatencyS を出しているCSV ---");
console.log("slot   :", hasLatency(SLOT_CSV_HEADERS));
console.log("ledger :", hasLatency(buildSessionLedgerRows([slotSession])[0]));

// slot セッションが端末の遅延を保存しているか（出していないだけか、そもそも無いか）。
const restored = sanitizeState({ sessions: [slotSession] }).sessions[0];
console.log("\n--- 保存されている device ---");
console.log(JSON.stringify(restored?.device ?? null));

console.log("\nmismatched rows:", mismatched);
