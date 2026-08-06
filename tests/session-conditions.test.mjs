// 記録済みセッションを支援者向けに要約する一行の中身。
//
// 難易度を設定画面から開放したので、回ごとに条件が違いうる。何を出し、何を
// 出さないかは読みやすさの判断そのものなので、文言レベルで固定する。

import assert from "node:assert/strict";
import {
  describeSessionConditions,
  describeSessionOutcome,
} from "../src/lib/sessionConditions.js";

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

const craneSession = (overrides = {}) => ({
  taskType: "scan",
  gameId: "crane",
  finished: true,
  aborted: false,
  config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5 },
  trials: Array.from({ length: 5 }, (_, index) => ({ index })),
  ...overrides,
});

test("a crane session shows the three values a supporter can change", () => {
  assert.equal(describeSessionConditions(craneSession()), "はやさ 2200ms / ひろさ 15 / 5かい");
});

test("a rhythm session shows tempo and length", () => {
  const session = {
    taskType: "sms",
    gameId: "rhythm-l1",
    config: { bpm: 30, targetBeats: 10, judgmentWindowMs: 600 },
  };
  const text = describeSessionConditions(session);
  assert.equal(text, "テンポ 30 / 10はく");
  // 支援者が触れない値は並べない。読む量が増えるわりに、自分が何を変えたかを
  // 見分けにくくなる（追試に必要な全項目はCSV側にある）。
  assert.ok(!text.includes("600"), "must not list settings the supporter cannot change");
});

test("a fishing session shows only its trial count", () => {
  const session = {
    taskType: "rt",
    gameId: "fishing",
    config: { targetTrials: 14, foreperiodMinMs: 1800, limitMs: 2000 },
  };
  assert.equal(describeSessionConditions(session), "14かい");
});

test("a session without a config says nothing rather than guessing", () => {
  assert.equal(describeSessionConditions(undefined), "");
  assert.equal(describeSessionConditions({ taskType: "scan" }), "");
  assert.equal(describeSessionConditions({ taskType: "unknown", config: {} }), "");
});

test("partial configs list only the values that survived", () => {
  const session = craneSession({ config: { toleranceR: 15 } });
  assert.equal(describeSessionConditions(session), "ひろさ 15");
});

test("a completed session is labelled as completed", () => {
  assert.equal(describeSessionOutcome(craneSession()), "完走 5回");
});

test("an interrupted session shows how far it got", () => {
  // 中断した回を完走と並べて見せると、少ない試行数を成績の低さと取り違える。
  const session = craneSession({
    finished: false,
    aborted: true,
    trials: [{ index: 0 }, { index: 1 }],
  });
  assert.equal(describeSessionOutcome(session), "中断 2/5回");
});

test("an interrupted session without a plan still reports its trials", () => {
  const session = { finished: false, aborted: true, trials: [{ index: 0 }], config: {} };
  assert.equal(describeSessionOutcome(session), "中断 1回");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("session conditions tests passed");
