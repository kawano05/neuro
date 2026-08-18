// セッションの推移（評価ログの「かいごとの うつりかわり」）。
//
// どの回を同じ線に載せるかの規則は、画面を見ても壊れたことに気づけない
// ——線は必ず引けてしまうし、点も並ぶ。条件の違う回を1本にまとめると、
// 支援者は「良くなった」を測定条件の違いと取り違える。
//
//   node tests/session-trend.test.mjs

import assert from "node:assert/strict";
import {
  MIN_SESSIONS_FOR_TREND,
  summariseSessionTrends,
  trendDirection,
} from "../src/lib/sessionTrend.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

function rhythm(sd, overrides = {}) {
  return {
    sessionId: `r-${sd}-${Math.random()}`,
    taskType: "sms",
    gameId: "rhythm-l1",
    startedAtIso: "2026-08-10T00:00:00.000Z",
    finished: true,
    aborted: false,
    config: { bpm: 40, targetBeats: 10 },
    summary: { sdRawOffsetMs: sd },
    ...overrides,
  };
}

function crane(grips, overrides = {}) {
  return {
    sessionId: `t-${grips}-${Math.random()}`,
    taskType: "scan",
    gameId: "crane",
    startedAtIso: "2026-08-10T00:00:00.000Z",
    finished: true,
    aborted: false,
    config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5 },
    summary: { grips },
    ...overrides,
  };
}

test("keeps different conditions on different lines", () => {
  // テンポを変えた回を同じ線に載せると、「ばらつきが減った」が上達なのか
  // 課題が易しくなっただけなのか言えなくなる。
  const groups = summariseSessionTrends([
    rhythm(160, { startedAtIso: "2026-08-10T00:00:00.000Z" }),
    rhythm(140, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
    rhythm(90, { config: { bpm: 30, targetBeats: 10 }, startedAtIso: "2026-08-12T00:00:00.000Z" }),
    rhythm(80, { config: { bpm: 30, targetBeats: 10 }, startedAtIso: "2026-08-13T00:00:00.000Z" }),
  ]);
  assert.equal(groups.length, 2);
  const tempos = groups.map((group) => group.conditions).sort();
  assert.deepEqual(tempos, ["テンポ 30 / 10はく", "テンポ 40 / 10はく"]);
  groups.forEach((group) => assert.equal(group.points.length, 2));
});

test("separates runs that had on-screen guidance from plain measurement", () => {
  // 手がかりありの回は聴覚だけへの同期ではない。混ぜると母集団が違う値が
  // 1本の線になる（sessionConditions が「手がかりあり」を条件へ出す）。
  const groups = summariseSessionTrends([
    rhythm(150),
    rhythm(140, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
    rhythm(70, { config: { bpm: 40, targetBeats: 10, visualGuidance: true } }),
    rhythm(60, {
      config: { bpm: 40, targetBeats: 10, visualGuidance: true },
      startedAtIso: "2026-08-11T00:00:00.000Z",
    }),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.some((group) => group.conditions.includes("手がかりあり")));
});

test("leaves out aborted runs and runs without the metric", () => {
  const groups = summariseSessionTrends([
    crane(3),
    crane(4, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
    // 中断した回は試行数が足りず、取れた数が不利になる。
    crane(1, { finished: false, aborted: true, startedAtIso: "2026-08-12T00:00:00.000Z" }),
    // 指標が無い回は点にできない。0 と書かない。
    crane(undefined, { summary: {}, startedAtIso: "2026-08-13T00:00:00.000Z" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].points.length, 2);
});

test("needs at least two runs before drawing anything", () => {
  assert.equal(MIN_SESSIONS_FOR_TREND, 2);
  assert.deepEqual(summariseSessionTrends([rhythm(120)]), []);
  assert.deepEqual(summariseSessionTrends([]), []);
  assert.deepEqual(summariseSessionTrends(null), []);
});

test("orders points oldest first, whatever order they were stored in", () => {
  const groups = summariseSessionTrends([
    crane(5, { startedAtIso: "2026-08-13T00:00:00.000Z" }),
    crane(2, { startedAtIso: "2026-08-10T00:00:00.000Z" }),
    crane(3, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
  ]);
  assert.deepEqual(groups[0].points.map((point) => point.value), [2, 3, 5]);
  assert.equal(groups[0].first, 2);
  assert.equal(groups[0].last, 5);
});

test("knows which direction counts as better for each metric", () => {
  // 取れた数は多いほうが良い。
  const scan = summariseSessionTrends([
    crane(2, { startedAtIso: "2026-08-10T00:00:00.000Z" }),
    crane(4, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
  ])[0];
  assert.equal(scan.higherIsBetter, true);
  assert.equal(scan.best, 4);
  assert.equal(trendDirection(scan), "better");

  // ばらつきは小さいほうが良い。ここを取り違えると、上達を「さがった」と
  // 表示することになる。
  const sms = summariseSessionTrends([
    rhythm(180, { startedAtIso: "2026-08-10T00:00:00.000Z" }),
    rhythm(90, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
  ])[0];
  assert.equal(sms.higherIsBetter, false);
  assert.equal(sms.best, 90);
  assert.equal(trendDirection(sms), "better");
});

test("says nothing changed instead of inventing a direction", () => {
  const flat = summariseSessionTrends([
    crane(3, { startedAtIso: "2026-08-10T00:00:00.000Z" }),
    crane(3, { startedAtIso: "2026-08-11T00:00:00.000Z" }),
  ])[0];
  assert.equal(trendDirection(flat), "same");
  assert.equal(trendDirection(null), "same");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("session trend tests passed");
