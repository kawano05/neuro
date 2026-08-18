// そくていに入る前の成立確認（src/lib/readinessCheck.js）。
//
// ここで固定したいのは「何を根拠に成立と言うか」であって、画面の見た目では
// ない。壊しても測定は普通に始まって普通に数字が出るので、テストで固定する。
//
// いちばん壊れやすいのは「達成率が高ければ成立」に書き換えられること。
// 連続系では判定窓が時間の9割を覆うので、でたらめに押しても達成率は9割出る
// ——達成率で構えた条件は、何も確かめていないのに必ず通る条件になる。

import assert from "node:assert/strict";
import {
  evaluateReadiness,
  resolveReadinessState,
  uniformOffsetSdMs,
  windowCoverage,
} from "../src/lib/readinessCheck.js";
import { computeEffectiveWindowMs } from "../src/lib/games/judge.js";
import { rhythmPresets } from "../src/lib/content.js";

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

/** 完走したれんしゅうの回を1件つくる。 */
function run(taskType, summary, config = {}) {
  return {
    taskType,
    participantId: "p1",
    finished: true,
    aborted: false,
    summary,
    config: { difficultyMode: "practice", bpm: 50, ...config },
    trials: Array.from({ length: 20 }, (_, index) => ({ index, excluded: false })),
  };
}

/** 3つとも通る状態の記録一式。 */
function readyRuns() {
  return [
    run("gonogo", { goHitRate: 0.9, commissionRate: 0.2 }),
    run("gonogo", { goHitRate: 0.85, commissionRate: 0.15 }),
    run("rt", { meanRtMs: 620 }),
    run("rt", { meanRtMs: 700 }),
    // 一様分布の SD は bpm50 で 346ms。その 6割（208ms）より小さいこと。
    run("sms", { sdRawOffsetMs: 120 }),
    run("sms", { sdRawOffsetMs: 150 }),
  ];
}

function checkById(result, id) {
  return result.checks.find((check) => check.id === id);
}

// ---------------------------------------------------------------------
// 達成率を条件にしてはいけない理由（windowCoverage）
// ---------------------------------------------------------------------

test("the judgment window covers most of a continuous session", () => {
  // そくてい（continuous・bpm50）の実効窓は 540ms、拍間隔は 1200ms。
  const preset = rhythmPresets.calibration;
  const w = computeEffectiveWindowMs(preset.mode, preset.bpm, 600);
  const coverage = windowCoverage(preset.mode, preset.bpm, w, preset.countInBeats);
  assert.ok(
    coverage > 0.85,
    `連続系では窓が時間の ${(coverage * 100).toFixed(0)}% を覆う——達成率は能力の証拠にならない`
  );

  // cued（L1）は試行間に休止があるので、同じ窓でも覆う割合はずっと低い。
  const l1 = rhythmPresets["rhythm-l1"];
  const cuedCoverage = windowCoverage("cued", l1.bpm, 600, l1.countInBeats);
  assert.ok(cuedCoverage < 0.35, "cued では達成率にまだ意味がある");
  assert.ok(coverage > cuedCoverage * 2, "両者を同じ基準で読んではいけない");
});

test("random pressing sits at the uniform spread", () => {
  // 合図を無視して等間隔に押しているだけの人のずれの SD。bpm50 で 346ms。
  assert.ok(Math.abs(uniformOffsetSdMs(50) - 346.4) < 1);
  // テンポが速いほど一様分布の幅も狭くなる（比較は必ず bpm ごとに）。
  assert.ok(uniformOffsetSdMs(100) < uniformOffsetSdMs(50));
});

// ---------------------------------------------------------------------
// 3つの確認
// ---------------------------------------------------------------------

test("all three checks pass on ordinary practice records", () => {
  const result = evaluateReadiness(readyRuns(), "p1");
  assert.equal(result.allMet, true, result.checks.map((c) => c.reason).join(" / "));
});

test("pressing at every beat is not discrimination", () => {
  // 全部押す人。達成率は満点（goHitRate 1.0）だが、押してはいけない拍でも
  // 同じだけ押しているので、高低を聞き分けた証拠はひとつも無い。
  // 達成率だけを見る条件だと、この人が最高得点で通る。
  const runs = readyRuns().filter((session) => session.taskType !== "gonogo");
  runs.push(run("gonogo", { goHitRate: 1, commissionRate: 1 }));
  runs.push(run("gonogo", { goHitRate: 1, commissionRate: 0.95 }));

  const result = evaluateReadiness(runs, "p1");
  assert.equal(checkById(result, "discrimination").met, false, "全部押す人を弁別できたことにしない");
  assert.equal(result.allMet, false);
});

test("pressing at nothing is not discrimination either", () => {
  const runs = readyRuns().filter((session) => session.taskType !== "gonogo");
  runs.push(run("gonogo", { goHitRate: 0, commissionRate: 0 }));
  runs.push(run("gonogo", { goHitRate: 0.05, commissionRate: 0 }));
  assert.equal(checkById(evaluateReadiness(runs, "p1"), "discrimination").met, false);
});

test("presses that beat the cue are not volitional", () => {
  const runs = readyRuns().filter((session) => session.taskType !== "rt");
  // 合図より前から押しはじめている（随意運動としてありえない速さ）。
  runs.push(run("rt", { meanRtMs: 60 }));
  runs.push(run("rt", { meanRtMs: 640 }));
  const check = checkById(evaluateReadiness(runs, "p1"), "volition");
  assert.equal(check.met, false);
  assert.match(check.reason, /先に押しはじめている/);
});

test("presses unlinked from the cue are not volitional", () => {
  const runs = readyRuns().filter((session) => session.taskType !== "rt");
  runs.push(run("rt", { meanRtMs: 640 }));
  runs.push(run("rt", { meanRtMs: 2400 }));
  assert.equal(checkById(evaluateReadiness(runs, "p1"), "volition").met, false);
});

test("offsets as wide as chance are not rule execution", () => {
  const runs = readyRuns().filter((session) => session.taskType !== "sms");
  // 一様分布そのもの（346ms）。合図に合わせている証拠がひとつも無い。
  runs.push(run("sms", { sdRawOffsetMs: 346 }));
  runs.push(run("sms", { sdRawOffsetMs: 330 }));
  const result = evaluateReadiness(runs, "p1");
  assert.equal(checkById(result, "ruleExecution").met, false, "でたらめに押した回を成立と言わない");
});

test("the sd criterion is read against the session's own tempo", () => {
  // 同じ SD でも、テンポが速ければ一様分布の幅も狭いので意味が変わる。
  // bpm 200 の一様 SD は 86.6ms。150ms はそれより広い＝合わせていない。
  const runs = readyRuns().filter((session) => session.taskType !== "sms");
  runs.push(run("sms", { sdRawOffsetMs: 150 }, { bpm: 200 }));
  runs.push(run("sms", { sdRawOffsetMs: 150 }, { bpm: 200 }));
  assert.equal(
    checkById(evaluateReadiness(runs, "p1"), "ruleExecution").met,
    false,
    "bpm を無視して固定の ms で判定すると、速いテンポで必ず通ってしまう"
  );
});

// ---------------------------------------------------------------------
// 何を根拠にしてよいか
// ---------------------------------------------------------------------

test("one session is not enough for any check", () => {
  const once = [
    run("gonogo", { goHitRate: 0.9, commissionRate: 0.1 }),
    run("rt", { meanRtMs: 600 }),
    run("sms", { sdRawOffsetMs: 100 }),
  ];
  const result = evaluateReadiness(once, "p1");
  assert.equal(result.allMet, false, "1回だけでは、その日の調子と区別がつかない");
  result.checks.forEach((check) => assert.match(check.reason, /あと1回/));
});

test("aborted runs are not evidence", () => {
  const runs = readyRuns().map((session) =>
    session.taskType === "gonogo" ? { ...session, aborted: true, finished: false } : session
  );
  assert.equal(checkById(evaluateReadiness(runs, "p1"), "discrimination").met, false);
});

test("measurement runs cannot be their own evidence", () => {
  // そくていの回を根拠にすると、「成立を確かめる前に測った回」で成立を
  // 主張することになり、循環する。
  const runs = readyRuns().map((session) =>
    session.taskType === "gonogo"
      ? { ...session, config: { ...session.config, difficultyMode: "measure" } }
      : session
  );
  assert.equal(checkById(evaluateReadiness(runs, "p1"), "discrimination").met, false);
});

test("another participant's records are not evidence", () => {
  const runs = readyRuns().map((session) => ({ ...session, participantId: "p2" }));
  assert.equal(evaluateReadiness(runs, "p1").allMet, false, "別の人の記録で成立を判断しない");
  assert.equal(evaluateReadiness(runs, "p2").allMet, true);
});

// ---------------------------------------------------------------------
// 記録される値（session.config.readiness）
// ---------------------------------------------------------------------

test("the readiness state recorded on a session says which it was", () => {
  const ready = readyRuns();
  // れんしゅうの回は成立確認の対象外。
  assert.equal(resolveReadinessState({ difficultyMode: "practice" }, ready, "p1"), "n/a");
  // そくていで、3つとも確認できている。
  assert.equal(resolveReadinessState({ difficultyMode: "measure" }, ready, "p1"), "met");
  // そくていだが、確認できていない——測定は止めず、そう記録する。
  assert.equal(resolveReadinessState({ difficultyMode: "measure" }, [], "p1"), "overridden");
});

console.log("");
console.log(`${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("readiness check tests passed");
