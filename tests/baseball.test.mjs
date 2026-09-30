// ボールを打つ遊び（src/lib/games/baseball.js）の当たり方の決まり。
//
// この遊びは「振れば必ず当たる」ことが約束。タイミングで変わるのは飛び方だけで、
// 空振り（失敗）という結果は無い。ぴったりの幅の端は、ホームランの側に含める。
//
//   node tests/baseball.test.mjs

import assert from "node:assert/strict";
import { HIT_WINDOW_MS, HOMERUN_WINDOW_MS, judgeSwing } from "../src/lib/games/baseball.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

test("right on time is a home run, on both edges of the window", () => {
  assert.equal(judgeSwing(0), "homerun");
  assert.equal(judgeSwing(HOMERUN_WINDOW_MS), "homerun");
  assert.equal(judgeSwing(-HOMERUN_WINDOW_MS), "homerun");
});

test("a little off is a hit, early or late alike", () => {
  assert.equal(judgeSwing(HOMERUN_WINDOW_MS + 1), "hit");
  assert.equal(judgeSwing(-(HOMERUN_WINDOW_MS + 1)), "hit");
  assert.equal(judgeSwing(HIT_WINDOW_MS), "hit");
  assert.equal(judgeSwing(-HIT_WINDOW_MS), "hit");
});

test("far off still hits the ball (there is no miss)", () => {
  for (const delta of [HIT_WINDOW_MS + 1, -(HIT_WINDOW_MS + 1), 1500, -1500]) {
    assert.equal(judgeSwing(delta), "bunt");
  }
  const outcomes = new Set();
  for (let delta = -2000; delta <= 2000; delta += 7) outcomes.add(judgeSwing(delta));
  assert.deepEqual([...outcomes].sort(), ["bunt", "hit", "homerun"]);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("baseball tests passed");
