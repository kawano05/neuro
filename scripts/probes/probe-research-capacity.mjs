// 研究として必要な量が、いまの設計で取れるのかを数える。
//
// 「50件で古い順に消える」ことは分かっていても、それが何回ぶんの測定に
// あたるのかは、課題ごとの試行数と組み合わせないと言えない。
//
//   node scripts/probes/probe-research-capacity.mjs

import { MEASUREMENT_PROTOCOL } from "../../src/lib/difficultyMode.js";
import { MAX_SESSIONS, MAX_LOG_ENTRIES, MAX_EVALUATION_SESSIONS } from "../../src/lib/state.js";
import { cranePresets, fishingPresets, slotPresets, rhythmPresets } from "../../src/lib/content.js";

const rows = [];

// --- そくてい（protocol 固定）1回あたりの試行数 ---
for (const [gameId, p] of Object.entries(MEASUREMENT_PROTOCOL.rhythm)) {
  // 1試行1拍（trials は beat 単位で記録される）。
  rows.push({
    課題: gameId,
    taskType: gameId === "gonogo" ? "gonogo" : "sms",
    "1回の試行数": p.targetBeats,
    "1回の長さ(秒)": Math.round(((p.countInBeats + p.targetBeats) * 60) / p.bpm),
  });
}
for (const [gameId, p] of Object.entries(MEASUREMENT_PROTOCOL.slot)) {
  const preset = slotPresets?.[gameId] ?? {};
  const reels = preset.reelCount ?? (gameId === "slot-l2" ? 3 : 1);
  rows.push({
    課題: gameId,
    taskType: "slot",
    "1回の試行数": p.rounds * reels,
    "1回の長さ(秒)": Math.round((p.rounds * reels * p.cycleMs) / 1000),
  });
}
rows.push({
  課題: "crane",
  taskType: "scan",
  "1回の試行数": MEASUREMENT_PROTOCOL.crane.targetTrials,
  "1回の長さ(秒)": Math.round(
    (MEASUREMENT_PROTOCOL.crane.targetTrials * (MEASUREMENT_PROTOCOL.crane.sweepMs * 2 + 1200)) /
      1000
  ),
});
// fishing は protocol を持たない（時間で区切る）。計画の期待値を出す。
for (const [gameId, p] of Object.entries(fishingPresets)) {
  const meanForeperiod = (p.foreperiodMinMs + p.foreperiodMaxMs) / 2;
  rows.push({
    課題: gameId,
    taskType: "rt",
    "1回の試行数": Math.floor(p.sessionMs / (meanForeperiod + p.limitMs)),
    "1回の長さ(秒)": Math.round(p.sessionMs / 1000),
  });
}

console.log("=== そくてい1回あたり（protocol 固定。fishing は期待値）===");
console.table(rows);

// --- 保持上限が何回ぶんにあたるか ---
console.log("\n=== 端末が保持できる量 ===");
console.log(`セッション上限 MAX_SESSIONS = ${MAX_SESSIONS} 件（全課題の合計、古い順に消える）`);
console.log(`操作ログ上限   MAX_LOG_ENTRIES = ${MAX_LOG_ENTRIES} 件`);
console.log(`効果測定上限   MAX_EVALUATION_SESSIONS = ${MAX_EVALUATION_SESSIONS} 件`);

const tasksPerVisit = 4; // 1回の来所で回す課題数の想定
console.log(
  `\n1回の来所で ${tasksPerVisit} 課題を1回ずつ回すとすると、` +
    `${Math.floor(MAX_SESSIONS / tasksPerVisit)} 回の来所で上限に達する。`
);
console.log(
  `参加者3人で同じ端末を共用すると、1人あたり ${Math.floor(
    MAX_SESSIONS / tasksPerVisit / 3
  )} 回の来所ぶんしか残らない。`
);

// --- 推移が出るのに必要な回数 ---
console.log("\n=== 推移（回ごとのうつりかわり）が出る条件 ===");
console.log("同じ課題・同じ条件で completedNormally の回が2回以上。");
console.log("条件が1つでも変われば別の線になるため、支援者がつまみを触るたびに");
console.log("その条件の回数は1からやり直しになる。");

// --- 試行数の観点 ---
console.log("\n=== 1参加者あたりの試行数（そくていのみ、来所4回を想定）===");
const measureRows = rows.filter((row) => row.課題 !== "fishing" && row.課題 !== "fishing-gonogo");
for (const row of measureRows) {
  console.log(
    `  ${row.課題.padEnd(10)} 1回 ${String(row["1回の試行数"]).padStart(3)}試行 → 4回で ${
      row["1回の試行数"] * 4
    }試行`
  );
}
