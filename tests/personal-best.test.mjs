// リザルトに出す「同条件での自己最高」の選び方。
//
// 表示そのものより、何を比較対象に入れないかが本体なので、そこを固定する。
// 難度は支援者が設定画面から変えられる（settings の craneToleranceR /
// craneSweepMs）ため、条件の違う回と数を並べても上達を表さない。
// 中断した回は試行数が足りず不利になる。

import assert from "node:assert/strict";
import { bestRecordLine, personalBest } from "../src/lib/games/gameHost.js";
import { resolveTextMode, translate } from "../src/lib/i18n.js";

// 文言は表記モードで変わるので、テスト側も辞書を通して引く。
// ここを固定文字列に戻すと、辞書を直したときにテストだけが古い文言を
// 主張して落ちる（あるいは辞書の抜けを見逃す）。
const t = (key, values) => translate(key, resolveTextMode({}), values);

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
  assert.equal(bestRecordLine(3, null, t), null);
  assert.equal(bestRecordLine(0, null, t), null);
});

test("says nothing while the best is still zero", () => {
  // 実際に遊んで分かった。「これまでの さいこう 0こ」は目標にならず、
  // 失敗を復唱するだけになる。
  assert.equal(bestRecordLine(0, 0, t), null);
});

test("celebrates the first success even though the best was zero", () => {
  assert.deepEqual(bestRecordLine(1, 0, t), { text: t("best.new"), isNew: true });
});

test("celebrates only when the record is actually beaten", () => {
  assert.deepEqual(bestRecordLine(4, 3, t), { text: t("best.new"), isNew: true });
  assert.deepEqual(bestRecordLine(3, 3, t), { text: t("best.previous", { n: 3 }), isNew: false });
});

test("never turns a worse session into a negative comparison", () => {
  const line = bestRecordLine(1, 4, t);
  assert.equal(line.isNew, false);
  assert.equal(line.text, "これまでの さいこう 4こ");
  assert.ok(!/すくない|へった|さがった/.test(line.text), "must not tell the user they did worse");
});

test("personal best keeps endless runs in their own pool", () => {
  // エンドレスは1回失敗で終わるので、取れた数はほぼ「続いた数 - 1」。
  // 決まった回数の回と同じ束にすると、越えられない目標が出つづける。
  const run = ({ id, targetTrials, grips, endless }) => ({
    sessionId: id,
    gameId: "crane",
    taskType: "scan",
    finished: true,
    aborted: false,
    config: { sweepMs: 2200, toleranceR: 15, targetTrials, endless },
    summary: { trials: targetTrials, grips },
  });
  const pick = (session) => session.summary?.grips;

  // 5回で終わったエンドレス（4こ）が、5回設定の通常回の最高になってはいけない。
  const mixedHistory = [
    run({ id: "n1", targetTrials: 5, grips: 2, endless: false }),
    run({ id: "e1", targetTrials: 5, grips: 4, endless: true }),
  ];
  assert.equal(
    personalBest(mixedHistory, {
      gameId: "crane",
      config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5, endless: false },
      pick,
    }),
    2
  );

  // 逆向きも。通常回はエンドレスの最高に混ざらない。
  assert.equal(
    personalBest(mixedHistory, {
      gameId: "crane",
      config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5, endless: true },
      pick,
    }),
    4
  );

  // エンドレスどうしは、続いた回数が違っても比べる。難度の上がり方は
  // コードに固定されていて回ごとに変わらないので、同じ物差しになる。
  // （終了時に実際の回数を targetTrials へ書き戻すため、ここを束ねる条件に
  //   入れると回ごとに束が割れ、いつまでも比較対象なしになる。）
  const endlessHistory = [
    run({ id: "x1", targetTrials: 7, grips: 6, endless: true }),
    run({ id: "x2", targetTrials: 13, grips: 12, endless: true }),
  ];
  assert.equal(
    personalBest(endlessHistory, {
      gameId: "crane",
      config: { sweepMs: 2200, toleranceR: 15, targetTrials: 22, endless: true },
      pick,
    }),
    12
  );
});

test("personal best is scoped to the participant in front of the device", () => {
  // 共用端末では、他の子が出した記録が「これまでの さいこう」として本人に
  // 提示されていた（2026-08-29に発見）。越えられない目標を出しつづける。
  const run = (id, participantId, grips) => ({
    sessionId: id,
    gameId: "crane",
    taskType: "scan",
    participantId,
    finished: true,
    aborted: false,
    config: { sweepMs: 2200, toleranceR: 15, targetTrials: 5, endless: false },
    summary: { grips },
  });
  const pick = (session) => session.summary?.grips;
  const history = [run("a", "P1", 5), run("b", "P2", 1)];
  const config = { sweepMs: 2200, toleranceR: 15, targetTrials: 5, endless: false };

  assert.equal(personalBest(history, { gameId: "crane", config, pick, participantId: "P2" }), 1);
  assert.equal(personalBest(history, { gameId: "crane", config, pick, participantId: "P1" }), 5);
  // IDが空のときは絞らない（1人しか使わない端末の運用を壊さない）。
  assert.equal(personalBest(history, { gameId: "crane", config, pick }), 5);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("personal best tests passed");
