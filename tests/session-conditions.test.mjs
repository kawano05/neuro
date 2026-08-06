// 記録済みセッションを支援者向けに要約する一行の中身。
//
// 難易度を設定画面から開放したので、回ごとに条件が違いうる。何を出し、何を
// 出さないかは読みやすさの判断そのものなので、文言レベルで固定する。

import assert from "node:assert/strict";
import {
  describeSessionConditions,
  describeSessionOutcome,
  describeSessionResult,
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

// 条件だけ出しても「その条件でどうだったか」にならない。条件と結果は
// 並べて初めて支援者の判断材料になる。何を出すかは basic-design.md §1.2 の
// 主要指標に合わせ、詳細（SD・中央値・個々の試行）はCSV側に残す。

test("a crane session reports how many prizes were taken", () => {
  const session = { taskType: "scan", summary: { trials: 5, grips: 2 } };
  assert.equal(describeSessionResult(session), "とれた 2/5");
});

test("a rhythm session reports hits and the direction of the offset", () => {
  // ずれは早い/遅いの向きが意味を持つので符号を落とさない。
  const late = { taskType: "sms", summary: { hits: 8, meanRawOffsetMs: 124.4 } };
  assert.equal(describeSessionResult(late), "あった 8 / ずれ 平均 +124ms");
  const early = { taskType: "sms", summary: { hits: 8, meanRawOffsetMs: -37.5 } };
  assert.ok(describeSessionResult(early).includes("-38ms"), "early offsets must stay negative");
});

test("rounding treats early and late offsets the same way", () => {
  // Math.round は半数値を常に +∞ 方向へ丸めるので、素直に使うと +37.5 は +38、
  // -37.5 は -37 になり、0 を挟んで丸めの向きが変わる。符号のある測定値で
  // 早い側と遅い側の扱いを変える理由が無い。
  const at = (value) => describeSessionResult({ taskType: "sms", summary: { hits: 1, meanRawOffsetMs: value } });
  assert.ok(at(37.5).includes("+38ms"));
  assert.ok(at(-37.5).includes("-38ms"));
});

test("a rhythm session with no hits does not invent an offset of zero", () => {
  // hit が1つも無いと平均は出せない。出せないものを 0ms と書くと、
  // ぴったり合っていたように読める。
  const session = { taskType: "sms", summary: { hits: 0, meanRawOffsetMs: null } };
  assert.equal(describeSessionResult(session), "あった 0");
});

test("a gonogo session reports the presses that should not have happened", () => {
  // 抑制課題の主要指標は commissionRate。
  const session = { taskType: "gonogo", summary: { hits: 9, commissions: 3 } };
  assert.equal(describeSessionResult(session), "あった 9 / つい おした 3");
});

test("a fishing session reports speed, catches and only real false starts", () => {
  const clean = { taskType: "rt", summary: { meanRtMs: 421.6, hits: 12, falseStarts: 0 } };
  assert.equal(describeSessionResult(clean), "はやさ 平均 422ms / つれた 12");
  const withFalseStart = { taskType: "rt", summary: { meanRtMs: 400, hits: 5, falseStarts: 2 } };
  assert.ok(describeSessionResult(withFalseStart).includes("フライング 2"));
});

test("a session without a summary says nothing rather than guessing", () => {
  assert.equal(describeSessionResult(undefined), "");
  assert.equal(describeSessionResult({ taskType: "scan" }), "");
  assert.equal(describeSessionResult({ taskType: "unknown", summary: {} }), "");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("session conditions tests passed");
