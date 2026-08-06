// リザルトに出す「同条件での自己最高」の選び方。
//
// 表示そのものより、何を比較対象に入れないかが本体なので、そこを固定する。
// 難度は支援者が設定画面から変えられる（settings の craneToleranceR /
// craneSweepMs）ため、条件の違う回と数を並べても上達を表さない。
// 中断した回は試行数が足りず不利になる。

import assert from "node:assert/strict";
import { bestRecordLine, personalBest } from "../src/lib/games/gameHost.js";

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

const CONFIG = { toleranceR: 15, sweepMs: 2200, targetTrials: 5 };
const pick = (session) => session.summary?.grips;
const best = (sessions) => personalBest(sessions, { gameId: "crane", config: CONFIG, pick });

function session(id, grips, overrides = {}) {
  return {
    sessionId: id,
    gameId: "crane",
    finished: true,
    aborted: false,
    config: { ...CONFIG },
    summary: { grips },
    ...overrides,
  };
}

test("returns null when there is nothing comparable yet", () => {
  assert.equal(best([]), null);
  assert.equal(best(undefined), null);
});

test("takes the highest value among comparable sessions", () => {
  assert.equal(best([session("a", 2), session("b", 4), session("c", 3)]), 4);
});

test("ignores sessions that did not run to completion", () => {
  // 中断した回は試行数が足りないので、最高記録の相手にならない。
  assert.equal(best([session("a", 5, { finished: false, aborted: true })]), null);
  assert.equal(best([session("a", 5, { finished: false, aborted: true }), session("b", 2)]), 2);
});

test("ignores sessions played at a different difficulty", () => {
  // 支援者が つかめる広さ / アームの速さ を変えた回と数を並べても上達を表さない。
  assert.equal(best([session("a", 5, { config: { ...CONFIG, toleranceR: 30 } })]), null);
  assert.equal(best([session("a", 5, { config: { ...CONFIG, sweepMs: 4000 } })]), null);
});

test("ignores sessions with a different number of trials", () => {
  // かいすう は取れる数の上限そのもの。9回で7こ取った回を5回の回の記録として
  // 出すと、達成できない目標を掲げることになる。
  assert.equal(best([session("a", 7, { config: { ...CONFIG, targetTrials: 9 } })]), null);
  assert.equal(
    best([session("a", 7, { config: { ...CONFIG, targetTrials: 9 } }), session("b", 2)]),
    2
  );
});

test("ignores other games", () => {
  assert.equal(best([session("a", 5, { gameId: "fishing" })]), null);
});

test("tolerates sessions with a missing summary or config", () => {
  // 永続化の過程で欠けた行があっても、比較が落ちるのではなく黙って除外する。
  assert.equal(best([session("a", 5, { summary: undefined })]), null);
  assert.equal(best([session("a", 5, { config: undefined })]), null);
  assert.equal(best([session("a", 5, { summary: { grips: null } })]), null);
  assert.equal(best([session("a", 5, { summary: undefined }), session("b", 1)]), 1);
});

test("says nothing when there is no comparable history", () => {
  assert.equal(bestRecordLine(3, null), null);
  assert.equal(bestRecordLine(0, null), null);
});

test("says nothing while the best is still zero", () => {
  // 実際に遊んで分かった。「これまでの さいこう 0こ」は目標にならず、
  // 失敗を復唱するだけになる。
  assert.equal(bestRecordLine(0, 0), null);
});

test("celebrates the first success even though the best was zero", () => {
  assert.deepEqual(bestRecordLine(1, 0), { text: "じぶんの さいこう記録！", isNew: true });
});

test("celebrates only when the record is actually beaten", () => {
  assert.deepEqual(bestRecordLine(4, 3), { text: "じぶんの さいこう記録！", isNew: true });
  assert.deepEqual(bestRecordLine(3, 3), { text: "これまでの さいこう 3こ", isNew: false });
});

test("never turns a worse session into a negative comparison", () => {
  const line = bestRecordLine(1, 4);
  assert.equal(line.isNew, false);
  assert.equal(line.text, "これまでの さいこう 4こ");
  assert.ok(!/すくない|へった|さがった/.test(line.text), "must not tell the user they did worse");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("personal best tests passed");
