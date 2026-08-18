// 入力オフセット分布（研究タブの図）の組み立て規則。
//
// ここは卒論の図の出どころなので、何を1つの山にまとめてよいかをテストで
// 固定する。壊しても画面には棒グラフが出たままになり、目視では気づけない
// ——母集団の違うものを混ぜても、山は必ず描けてしまう。
//
//   node tests/offset-distribution.test.mjs

import assert from "node:assert/strict";
import {
  BIN_WIDTH_MS,
  RANGE_MS,
  summariseOffsetDistribution,
} from "../src/lib/offsetDistribution.js";

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

let serial = 0;
function session(overrides = {}) {
  serial += 1;
  const { config, ...rest } = overrides;
  return {
    sessionId: `r-${serial}`,
    taskType: "sms",
    gameId: "rhythm-l1",
    participantId: "P001",
    startedAtIso: "2026-08-16T00:00:00.000Z",
    aborted: false,
    finished: true,
    config: { bpm: 40, visualGuidance: false, ...config },
    trials: [],
    ...rest,
  };
}

function hit(rawOffsetMs, extra = {}) {
  return { judgment: "hit", rawOffsetMs, excluded: false, ...extra };
}

/** ある値がどのビンに入ったか。 */
function binOf(group, key, value) {
  return group.bins.find((bin) => value >= bin.from && value < bin.to)?.[key] ?? 0;
}

const only = (groups) => {
  assert.equal(groups.length, 1, `1つの山を期待したが ${groups.length} 個できた`);
  return groups[0];
};

test("counts only hits, and never mixes the two guidance conditions", () => {
  const group = only(
    summariseOffsetDistribution([
      session({ trials: [hit(-120), hit(-100), hit(30)] }),
      session({ config: { visualGuidance: true }, trials: [hit(10), hit(20)] }),
    ])
  );
  assert.equal(group.plain.n, 3);
  assert.equal(group.guided.n, 2);
  const total = (key) => group.bins.reduce((sum, bin) => sum + bin[key], 0);
  assert.equal(total("plain"), 3);
  assert.equal(total("guided"), 2);
  assert.equal(binOf(group, "guided", 10), 2);
  assert.equal(binOf(group, "guided", -110), 0);
});

test("splits figures whose populations are not the same task", () => {
  // cued（拍ごとに予告がある rhythm-l1）と continuous（連続する rhythm-l2）は
  // 課題そのものが違う。同じ山に入れると形に意味が無くなる。
  const groups = summariseOffsetDistribution([
    session({ gameId: "rhythm-l1", trials: [hit(-100)] }),
    session({ gameId: "rhythm-l2", config: { bpm: 60 }, trials: [hit(-40)] }),
    session({ taskType: "gonogo", gameId: "gonogo", config: { bpm: 50 }, trials: [hit(20)] }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.gameId).sort(),
    ["gonogo", "rhythm-l1", "rhythm-l2"]
  );
});

test("splits figures by tempo and by participant", () => {
  // テンポが違えば拍間隔＝要求される精度が違う。参加者が違えば当然別の母集団。
  const byTempo = summariseOffsetDistribution([
    session({ trials: [hit(-100)] }),
    session({ config: { bpm: 80 }, trials: [hit(-30)] }),
  ]);
  assert.equal(byTempo.length, 2);

  const byParticipant = summariseOffsetDistribution([
    session({ participantId: "P001", trials: [hit(-100)] }),
    session({ participantId: "P002", trials: [hit(-30)] }),
  ]);
  assert.equal(byParticipant.length, 2);
  // 同じ人・同じ条件なら1つの山にまとまる。
  const together = summariseOffsetDistribution([
    session({ trials: [hit(-100)] }),
    session({ trials: [hit(-30)] }),
  ]);
  assert.equal(together.length, 1);
  assert.equal(together[0].plain.n, 2);
});

test("drops trials whose offset is not a measurement", () => {
  const group = only(
    summariseOffsetDistribution([
      session({
        trials: [
          hit(40),
          { judgment: "miss", rawOffsetMs: null, excluded: false },
          { judgment: "extra", rawOffsetMs: 500, excluded: false },
          { judgment: "commission", rawOffsetMs: 20, excluded: false },
          { judgment: "correctRejection", rawOffsetMs: null, excluded: false },
          hit(300, { excluded: true }),
        ],
      }),
    ])
  );
  assert.equal(group.plain.n, 1);
  assert.equal(binOf(group, "plain", 40), 1);
});

test("leaves calibration and aborted runs out", () => {
  // そくていは基準オフセットを決めるための測定で、訓練課題とは母集団が違う。
  // 中断した回は、やめた理由が記録に残らないので同じ重みで混ぜられない。
  assert.deepEqual(
    summariseOffsetDistribution([
      session({ gameId: "calibration", trials: [hit(80), hit(90)] }),
    ]),
    []
  );
  assert.deepEqual(
    summariseOffsetDistribution([
      session({ finished: false, aborted: true, trials: [hit(80), hit(90)] }),
    ]),
    []
  );
});

test("ignores sessions from other task types", () => {
  assert.deepEqual(
    summariseOffsetDistribution([
      { taskType: "scan", gameId: "crane", finished: true, aborted: false, config: {}, trials: [hit(50)] },
      { taskType: "rt", gameId: "fishing", finished: true, aborted: false, config: {}, trials: [hit(50)] },
    ]),
    []
  );
});

test("folds out-of-range trials into the end bins instead of dropping them", () => {
  // 大きく外れた入力も試行数には入る。落とすと n が実際と食い違う。
  const group = only(summariseOffsetDistribution([session({ trials: [hit(-5_000), hit(5_000)] })]));
  assert.equal(group.plain.n, 2);
  assert.equal(group.bins.at(0).plain, 1);
  assert.equal(group.bins.at(-1).plain, 1);
});

test("reports mean and SD from the same trials it plots", () => {
  const group = only(
    summariseOffsetDistribution([session({ trials: [hit(-100), hit(0), hit(100)] })])
  );
  assert.equal(group.plain.n, 3);
  assert.equal(group.plain.meanMs, 0);
  assert.equal(group.plain.sdMs, 100); // 標本SD: sqrt(20000/2)
  // 1試行だけならSDは出せない。0 と書かない。
  const single = only(summariseOffsetDistribution([session({ trials: [hit(42)] })]));
  assert.equal(single.plain.meanMs, 42);
  assert.equal(single.plain.sdMs, null);
});

test("keeps the bin grid aligned to zero", () => {
  // 0ms がビンの境目に来ていないと、「はやい側/おそい側」の数え分けが
  // 1ビンぶんずれる。
  const group = only(summariseOffsetDistribution([session({ trials: [hit(0)] })]));
  assert.equal(group.binWidthMs, BIN_WIDTH_MS);
  assert.equal(group.rangeMs, RANGE_MS);
  assert.ok(
    group.bins.some((bin) => bin.from === 0),
    "0ms must start a bin, not sit inside one"
  );
  assert.equal(group.bins.at(0).from, -RANGE_MS);
  assert.equal(group.bins.at(-1).to, RANGE_MS);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("offset distribution tests passed");
