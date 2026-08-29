// 「回ごとの推移」が本当に出るのかを、実際のセッション形で確かめる。
//
//   node scripts/probes/probe-session-trend.mjs

import { summariseSessionTrends, trendKey } from "../../src/lib/sessionTrend.js";

const craneRun = (id, day, { targetTrials, grips, endless = false }) => ({
  sessionId: id,
  taskType: "scan",
  gameId: "crane",
  participantId: "P1",
  startedAtIso: `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  finished: true,
  aborted: false,
  device: {},
  config: {
    sweepMs: 2200,
    toleranceR: 15,
    targetTrials,
    difficultyMode: "practice",
    measurementReadiness: "n/a",
    endless,
  },
  trials: Array.from({ length: targetTrials }, (_, i) => ({ index: i })),
  summary: { trials: targetTrials, grips },
});

const fishingRun = (id, day, { targetTrials, meanRtMs, endless = false }) => ({
  sessionId: id,
  taskType: "rt",
  gameId: "fishing",
  participantId: "P1",
  startedAtIso: `2026-08-${String(day).padStart(2, "0")}T01:00:00.000Z`,
  finished: true,
  aborted: false,
  device: {},
  config: { targetTrials, limitMs: 2000, difficultyMode: "practice", endless },
  trials: Array.from({ length: targetTrials }, (_, i) => ({ index: i })),
  summary: { trials: targetTrials, meanRtMs },
});

console.log("=== A. 決まった回数のれんしゅう（条件が揃っている） ===");
const fixed = [
  craneRun("c1", 1, { targetTrials: 5, grips: 2 }),
  craneRun("c2", 2, { targetTrials: 5, grips: 3 }),
  craneRun("c3", 3, { targetTrials: 5, grips: 4 }),
];
for (const group of summariseSessionTrends(fixed)) {
  console.log(`  key="${group.key}"`);
  console.log(`  点の数=${group.points.length} 値=${group.points.map((p) => p.value).join(" → ")}`);
}

console.log("\n=== B. エンドレスのUFOキャッチャーを3回 ===");
const endlessCrane = [
  craneRun("e1", 1, { targetTrials: 7, grips: 6, endless: true }),
  craneRun("e2", 2, { targetTrials: 13, grips: 12, endless: true }),
  craneRun("e3", 3, { targetTrials: 22, grips: 21, endless: true }),
];
console.log("  それぞれのキー:");
for (const s of endlessCrane) console.log(`    "${trendKey(s)}"`);
const endlessGroups = summariseSessionTrends(endlessCrane);
console.log(`  → まとまった線の数: ${endlessGroups.length}`);

console.log("\n=== C. エンドレスと、同じ回数の通常回が混ざったら ===");
const mixed = [
  craneRun("m1", 1, { targetTrials: 7, grips: 6, endless: true }),
  craneRun("m2", 2, { targetTrials: 7, grips: 3, endless: false }),
];
console.log("  キー:");
for (const s of mixed) console.log(`    "${trendKey(s)}"  endless=${s.config.endless}`);
const mixedGroups = summariseSessionTrends(mixed);
console.log(`  → まとまった線の数: ${mixedGroups.length}`);
for (const g of mixedGroups) {
  console.log(`    "${g.key}" に ${g.points.length}点: ${g.points.map((p) => p.value).join(" → ")}`);
}

console.log("\n=== D. さかなつり（エンドレス3回） ===");
const endlessFishing = [
  fishingRun("f1", 1, { targetTrials: 9, meanRtMs: 620, endless: true }),
  fishingRun("f2", 2, { targetTrials: 14, meanRtMs: 580, endless: true }),
  fishingRun("f3", 3, { targetTrials: 21, meanRtMs: 540, endless: true }),
];
console.log("  キー:");
for (const s of endlessFishing) console.log(`    "${trendKey(s)}"`);
console.log(`  → まとまった線の数: ${summariseSessionTrends(endlessFishing).length}`);
