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
  groupTrendsByGame,
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

test("endless runs form their own trend instead of vanishing or mixing in", () => {
  // エンドレスを入れた直後、この束ね方は静かに壊れていた（2026-08-28、実測）。
  //   1. 束ねるキーに試行数が入るのに、エンドレスは実際にやった数を
  //      targetTrials へ書き戻す。回ごとにキーが変わり、線は**1本も**
  //      出なかった（点が1つずつに割れて MIN_SESSIONS_FOR_TREND に届かない）。
  //   2. たまたま回数が一致すると、決まった回数の回と同じ線に載った。
  // 線が引けないことも、間違った線が引けることも、画面を見ても気づけない。
  const craneRun = (id, day, { targetTrials, grips, endless }) => ({
    sessionId: id,
    taskType: "scan",
    gameId: "crane",
    startedAtIso: `2026-08-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    finished: true,
    aborted: false,
    config: { sweepMs: 2200, toleranceR: 15, targetTrials, endless },
    trials: Array.from({ length: targetTrials }, (_, index) => ({ index })),
    summary: { trials: targetTrials, grips },
  });

  // 回数が毎回違っても1本にまとまる。
  const endlessRuns = [
    craneRun("e1", 1, { targetTrials: 7, grips: 6, endless: true }),
    craneRun("e2", 2, { targetTrials: 13, grips: 12, endless: true }),
    craneRun("e3", 3, { targetTrials: 22, grips: 21, endless: true }),
  ];
  const groups = summariseSessionTrends(endlessRuns);
  assert.equal(groups.length, 1, "エンドレスの回が推移から消えてはいけない");
  // キーの区切りは NUL（条件文字列に空白が入っても衝突しないため）なので、
  // 文字列そのものではなく中身で見る。
  assert.equal(groups[0].gameId, "crane");
  assert.equal(groups[0].conditions, "エンドレス");
  // 並べるのは「どこまで続いたか」。とれた数（scan の主要指標）は、1回失敗で
  // 終わる遊びではほぼ「続いた数 - 1」になり、上限の違う数字を同じ線に
  // 載せることになる。
  assert.equal(groups[0].label, "つづいた かず");
  assert.deepEqual(groups[0].points.map((point) => point.value), [7, 13, 22]);
  assert.equal(groups[0].higherIsBetter, true);

  // 決まった回数の回とは混ざらない（回数がたまたま一致しても）。
  const mixed = summariseSessionTrends([
    craneRun("m1", 1, { targetTrials: 7, grips: 6, endless: true }),
    craneRun("m2", 2, { targetTrials: 7, grips: 3, endless: false }),
  ]);
  assert.equal(mixed.length, 0, "エンドレスと決まった回数の回を1本にしてはいけない");

  // さかなつりでも同じ。平均反応時間で並べてはいけない——続くほど受付時間が
  // 短くなり、遅い反応は時間切れで平均から外れるので、長く続いた回ほど
  // 平均が良く見える（上達していなくても線が下がる）。
  const fishingRun = (id, day, { targetTrials, meanRtMs }) => ({
    sessionId: id,
    taskType: "rt",
    gameId: "fishing",
    startedAtIso: `2026-08-${String(day).padStart(2, "0")}T01:00:00.000Z`,
    finished: true,
    aborted: false,
    config: { targetTrials, limitMs: 2000, endless: true },
    trials: Array.from({ length: targetTrials }, (_, index) => ({ index })),
    summary: { trials: targetTrials, meanRtMs },
  });
  const fishingGroups = summariseSessionTrends([
    fishingRun("f1", 1, { targetTrials: 9, meanRtMs: 620 }),
    fishingRun("f2", 2, { targetTrials: 14, meanRtMs: 580 }),
  ]);
  assert.equal(fishingGroups.length, 1);
  assert.equal(fishingGroups[0].gameId, "fishing");
  assert.equal(fishingGroups[0].conditions, "エンドレス");
  assert.equal(fishingGroups[0].label, "つづいた かず");
  assert.deepEqual(fishingGroups[0].points.map((point) => point.value), [9, 14]);
});

test("trends are grouped by game, in the order the games are listed", () => {
  // 束ねる単位は「課題 × 条件」なので、条件を変えた回があると同じあそびの線が
  // 複数できる。一列に並べると別のあそびの線と交互に出て、「このあそびは
  // どうなっているか」を読むのに画面を往復することになる。
  const group = (gameId, conditions, lastIso) => ({
    key: `${gameId}\u0000${conditions}`,
    gameId,
    conditions,
    points: [
      { value: 1, startedAtIso: "2026-08-01T00:00:00.000Z" },
      { value: 2, startedAtIso: lastIso },
    ],
  });

  const grouped = groupTrendsByGame(
    [
      group("fishing", "エンドレス", "2026-08-05T00:00:00.000Z"),
      group("crane", "はやさ 2200ms / ひろさ 15 / 5かい", "2026-08-02T00:00:00.000Z"),
      group("crane", "エンドレス", "2026-08-09T00:00:00.000Z"),
    ],
    ["crane", "fishing"]
  );

  assert.deepEqual(grouped.map((section) => section.gameId), ["crane", "fishing"]);
  assert.equal(grouped[0].trends.length, 2, "同じあそびの条件は1つの節にまとまる");
  // あそびの中は「最後に遊んだ回が新しい順」。いま使っている条件が上に来る。
  assert.deepEqual(
    grouped[0].trends.map((trend) => trend.conditions),
    ["エンドレス", "はやさ 2200ms / ひろさ 15 / 5かい"]
  );

  // 並びに無いあそびは後ろへ回す（順番の正本は content.js。ここで決めない）。
  const unknownLast = groupTrendsByGame(
    [
      group("mystery", "既定", "2026-08-20T00:00:00.000Z"),
      group("crane", "既定", "2026-08-01T00:00:00.000Z"),
    ],
    ["crane", "fishing"]
  );
  assert.deepEqual(unknownLast.map((section) => section.gameId), ["crane", "mystery"]);

  // 空でも落ちない。
  assert.deepEqual(groupTrendsByGame([], ["crane"]), []);
  assert.deepEqual(groupTrendsByGame(null), []);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("session trend tests passed");
