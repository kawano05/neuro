// 英語の画面に出す、記録まわりの言葉（評価ログ・学ぶ・伝える）。
//
// 英語が抜けても、日本語へ落ちて画面は出つづける。英語の画面に日本語が混ざるだけなので、
// 日本語の画面で確かめていると気づけない。ここは「英語を渡したら英語だけが返る」ことと、
// 「記録を束ねる鍵と操作ログの札は、言語で変わらない」ことを見る。
//
//   node tests/english-records.test.mjs

import assert from "node:assert/strict";
import { LEARN_LABEL_EN, letterTasks, letterTasksEn, matchingTasks } from "../src/lib/content.js";
import {
  describeSessionConditions,
  describeSessionOutcome,
  describeSessionResult,
} from "../src/lib/sessionConditions.js";
import { summariseSessionTrends, trendKey } from "../src/lib/sessionTrend.js";
import { logLabelForDisplay } from "../src/lib/views/log.js";

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

const JAPANESE = /[぀-ヿ一-龠]/;
const noJapanese = (text, what) => assert.ok(!JAPANESE.test(text), `${what}: 日本語が残っている「${text}」`);

const slotSession = (startedAtIso, medianAbsoluteErrorMs) => ({
  gameId: "slot-l1",
  taskType: "slot",
  participantId: "P001",
  startedAtIso,
  finished: true,
  aborted: false,
  trials: [{}, {}, {}],
  config: { cycleMs: 4800, toleranceMs: 220, rounds: 3, reelCount: 1, difficultyMode: "measure", measurementReadiness: "overridden" },
  summary: { hits: 2, medianAbsoluteErrorMs, timeoutCount: 1 },
});

const sessions = [
  slotSession("2026-11-25T01:00:00.000Z", 300),
  slotSession("2026-11-26T01:00:00.000Z", 200),
  {
    gameId: "crane",
    taskType: "scan",
    startedAtIso: "2026-11-26T02:00:00.000Z",
    finished: false,
    aborted: true,
    trials: [{}],
    config: { sweepMs: 3200, toleranceR: 0.2, targetTrials: 3, audioGuidance: true, sureHit: true },
    summary: { grips: 1 },
  },
  {
    gameId: "fishing",
    taskType: "rt",
    startedAtIso: "2026-11-26T03:00:00.000Z",
    finished: true,
    aborted: false,
    trials: [{}, {}],
    config: { limitMs: 1234 },
    summary: { hits: 2, meanRtMs: 512.4, falseStarts: 1 },
  },
  {
    gameId: "gonogo",
    taskType: "gonogo",
    startedAtIso: "2026-11-26T04:00:00.000Z",
    finished: true,
    aborted: false,
    trials: [{}, {}],
    config: { bpm: 80, targetBeats: 8, visualGuidance: true },
    summary: { hits: 3, commissions: 1 },
  },
  {
    gameId: "crane-endless",
    taskType: "scan",
    startedAtIso: "2026-11-26T05:00:00.000Z",
    finished: true,
    aborted: false,
    trials: [{}, {}],
    config: { endless: true },
    summary: { grips: 1, trials: 2 },
  },
];

test("session texts come back in English only when English is asked for", () => {
  for (const session of sessions) {
    for (const describe of [describeSessionOutcome, describeSessionResult, describeSessionConditions]) {
      noJapanese(describe(session, "en"), `${describe.name}(${session.gameId})`);
      // 言語を渡さなければ、今までどおり日本語（束ねる鍵と、日本語の画面）。
      assert.equal(describe(session), describe(session, "ja"));
    }
  }
  assert.equal(describeSessionOutcome(sessions[0], "en"), "Completed, 3 trials");
  assert.equal(describeSessionOutcome(sessions[2], "en"), "Stopped early, 1/3 trials");
  assert.equal(describeSessionResult(sessions[0], "en"), "Matched 2/3 / median error 300ms / timed out 1");
  assert.equal(
    describeSessionConditions(sessions[0], "en"),
    "Measure / cycle 4800ms / window ±220ms / 3 rounds / 1 reel / readiness not checked"
  );
  assert.equal(describeSessionConditions(sessions[5], "en"), "Endless");
});

test("the trend cards are in English, and the grouping does not depend on the language", () => {
  const ja = summariseSessionTrends(sessions, "P001");
  const en = summariseSessionTrends(sessions, "P001", "en");
  assert.equal(en.length, ja.length);
  assert.ok(en.length >= 1, "同じ条件の2回が1つの束になる");
  en.forEach((group, index) => {
    noJapanese(group.label, "指標の名前");
    noJapanese(group.conditions, "条件");
    // 束ねる鍵は言語で変わらない（英語の端末と日本語の端末で、同じ回が同じ束に入る）。
    assert.equal(group.key, ja[index].key);
    assert.equal(group.points.length, ja[index].points.length);
  });
  // 鍵に入る条件の文は、いつも日本語（既定）のほう。
  assert.ok(trendKey(sessions[0]).endsWith(describeSessionConditions(sessions[0])));
  assert.ok(!trendKey(sessions[0]).includes(describeSessionConditions(sessions[0], "en")));
});

test("log labels are translated for display and left alone in the record", () => {
  const cases = [
    [{ type: "switch", label: "スタート" }, "Start"],
    [{ type: "switch", label: "ふうせん わり" }, "Pop the balloons"],
    [{ type: "switch", label: "音あそび（せんせいと）" }, "Sound game (with the teacher)"],
    [{ type: "matching", label: "りんご", correct: true }, "Apple"],
    [{ type: "phrase", label: "ありがとう" }, "Thank you"],
    [{ type: "session", label: "slot-l1 終了 taskType=slot" }, "slot-l1 finished (taskType=slot)"],
    [{ type: "measurement", label: "キャリブレーション基準オフセットを更新 +0ms → -35ms" }, "Baseline offset updated: +0ms → -35ms"],
    [{ type: "settings", label: "難易度モードを measure に変更" }, "Difficulty mode changed to measure"],
    [{ type: "system", label: "旧保存(neuronode-prototype-state-v3)からv4へ移行しました。" }, "Migrated the earlier save (neuronode-prototype-state-v3) to v4."],
  ];
  for (const [entry, english] of cases) {
    const before = { ...entry };
    assert.equal(logLabelForDisplay(entry, "en"), english);
    assert.equal(logLabelForDisplay(entry, "ja"), entry.label);
    assert.deepEqual(entry, before, "記録そのものは書き換えない");
  }
  // 知らない札は、そのまま出す（黙って消さない）。
  assert.equal(logLabelForDisplay({ type: "switch", label: "あたらしい札" }, "en"), "あたらしい札");
  assert.equal(logLabelForDisplay({ type: "switch" }, "en"), "switch");
});

test("every card in Which one? has an English name", () => {
  for (const task of matchingTasks) {
    assert.ok(task.promptEn, `問いの英語: ${task.prompt}`);
    noJapanese(task.promptEn, "問い");
    for (const option of task.options) {
      assert.ok(LEARN_LABEL_EN[option.label], `札の英語: ${option.label}`);
    }
  }
});

test("the English letter tasks mirror the Japanese ones", () => {
  // 何問目か（state.letterIndex）を両方の言語で使うので、数をそろえる。
  assert.equal(letterTasksEn.length, letterTasks.length);
  for (const task of letterTasksEn) {
    noJapanese(task.prompt, "問い");
    assert.equal(task.options.length, 4);
    assert.equal(new Set(task.options).size, 4, "同じ文字を2つ並べない");
    assert.ok(task.options.includes(task.answer), `正解が選択肢にある: ${task.prompt}`);
    const word = task.prompt.match(/“([^”]+)”/)?.[1] ?? "";
    assert.equal(word[0]?.toUpperCase(), task.answer, `正解が ことばの はじめの文字: ${word}`);
  }
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("english records tests passed");
