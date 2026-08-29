// 参加者の取り違えが起きうる経路を数える。
//
// 端末は1台を複数の参加者で共用する想定（来所ごとに同じiPadを使う）。
// participantId は支援者が設定画面で打つ1つの文字列で、セッションには
// その時点の値が焼き付く。切り替え忘れがどう出るかを見る。
//
//   node scripts/probes/probe-participant-integrity.mjs

import { cloneDefaultState, sanitizeState } from "../../src/lib/state.js";
import { summariseSessionTrends } from "../../src/lib/sessionTrend.js";

const trial = (i, grip) => {
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
    xPhaseMs: 100,
    yPhaseMs: 200,
    judgment: grip ? "grip" : "miss",
  };
};

const craneRun = (id, participantId, day, grips) => ({
  sessionId: id,
  gameId: "crane",
  taskType: "scan",
  participantId,
  startedAtIso: `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  finished: true,
  aborted: false,
  device: {},
  config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5, difficultyMode: "measure", endless: false },
  trials: Array.from({ length: 5 }, (_, i) => trial(i, i < grips)),
  summary: {},
});

console.log("=== 1. participantId の切り替え忘れ ===");
const state = sanitizeState({
  ...cloneDefaultState(),
  sessions: [
    craneRun("s1", "P1", 10, 1),
    craneRun("s2", "P1", 11, 2),
    // 支援者が participantId を変えないまま、次の参加者を測ってしまった回
    craneRun("s3", "P1", 12, 5),
  ],
});
const trends = summariseSessionTrends(state.sessions);
console.log(`  推移の線: ${trends.length}本`);
for (const group of trends) {
  console.log(
    `    ${group.gameId} / ${group.conditions} … ${group.points.map((p) => p.value).join(" → ")}`
  );
}
console.log("  → 推移は participantId で分けていない（同じ線に載る）。");

console.log("\n=== 2. participantId が違うと線は分かれるか ===");
const mixed = sanitizeState({
  ...cloneDefaultState(),
  sessions: [
    craneRun("m1", "P1", 10, 1),
    craneRun("m2", "P2", 11, 2),
    craneRun("m3", "P1", 12, 3),
  ],
});
const mixedTrends = summariseSessionTrends(mixed.sessions);
console.log(`  推移の線: ${mixedTrends.length}本`);
for (const group of mixedTrends) {
  console.log(
    `    ${group.gameId} / ${group.conditions} … ${group.points.map((p) => p.value).join(" → ")}`
  );
}

console.log("\n=== 3. 空の participantId ===");
const blank = sanitizeState({
  ...cloneDefaultState(),
  sessions: [craneRun("b1", "", 10, 1), craneRun("b2", "", 11, 4)],
});
console.log(`  空IDの回も保存される: ${blank.sessions.length}件`);
console.log(`  participantId = ${JSON.stringify(blank.sessions[0].participantId)}`);
