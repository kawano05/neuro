// 「そくてい（研究）」と「れんしゅう（訓練）」の切り分け。
//
// この線引きは画面を見ても分からない。どちらのモードでもゲームは普通に遊べ、
// 記録も残る——違うのは「その回の数字を他の回と比べてよいか」だけ。
// 壊れても誰も気づかないまま、条件の違う回が混ざったデータで卒論が書かれる。
//
//   node tests/difficulty-mode.test.mjs

import assert from "node:assert/strict";
import {
  DEFAULT_DIFFICULTY_MODE,
  MEASUREMENT_PROTOCOL,
  allowsVisualGuidance,
  isMeasurementMode,
  resolveCraneDifficulty,
  resolveDifficultyMode,
  resolveRhythmDifficulty,
} from "../src/lib/difficultyMode.js";
import { resolveParams } from "../src/lib/games/rhythm.js";
import { cranePresets, rhythmPresets } from "../src/lib/content.js";

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

/** 支援者が全部いじった状態。そくていではこれが一切効かないことを見る。 */
const TWEAKED = {
  rhythmBpm: 30,
  countInBeats: 1,
  targetBeats: 200,
  craneSweepMs: 800,
  craneToleranceR: 40,
  craneTargetTrials: 15,
  craneAudioGuidance: true,
  visualGuidance: true,
};

test("defaults to practice, and only accepts the two known modes", () => {
  // ふだん使うのは訓練。測定は支援者が意図して選ぶもの。
  assert.equal(DEFAULT_DIFFICULTY_MODE, "practice");
  assert.equal(resolveDifficultyMode({}), "practice");
  assert.equal(resolveDifficultyMode({ difficultyMode: "measure" }), "measure");
  // 知らない値で「測定のつもりが練習だった」が起きないよう、既定へ倒す。
  assert.equal(resolveDifficultyMode({ difficultyMode: "kenkyu" }), "practice");
  assert.equal(resolveDifficultyMode(null), "practice");
  assert.equal(isMeasurementMode({ difficultyMode: "measure" }), true);
  assert.equal(isMeasurementMode({}), false);
});

test("measurement runs ignore every supporter tweak on rhythm", () => {
  const settings = { ...TWEAKED, difficultyMode: "measure" };
  ["rhythm-l1", "rhythm-l2", "gonogo"].forEach((gameId) => {
    const resolved = resolveRhythmDifficulty(gameId, settings, rhythmPresets[gameId]);
    assert.deepEqual(
      resolved,
      MEASUREMENT_PROTOCOL.rhythm[gameId],
      `${gameId}: measurement runs must use the protocol values`
    );
  });
});

test("practice runs keep the supporter's settings", () => {
  const settings = { ...TWEAKED, difficultyMode: "practice" };
  const resolved = resolveRhythmDifficulty("rhythm-l1", settings, rhythmPresets["rhythm-l1"]);
  assert.equal(resolved.bpm, 30);
  assert.equal(resolved.targetBeats, 200);
  // 設定していない項目はあそびごとの既定へ落ちる（従来の優先順位）。
  const partial = resolveRhythmDifficulty(
    "rhythm-l1",
    { difficultyMode: "practice", rhythmBpm: null, countInBeats: null, targetBeats: null },
    rhythmPresets["rhythm-l1"]
  );
  assert.equal(partial.bpm, rhythmPresets["rhythm-l1"].bpm);
  assert.equal(partial.targetBeats, rhythmPresets["rhythm-l1"].targetBeats);
});

test("the engine actually uses the protocol values, not just the resolver", () => {
  // 解決器が正しくても、ゲーム側が呼んでいなければ意味がない。
  const measured = resolveParams("rhythm-l1", { ...TWEAKED, difficultyMode: "measure" });
  assert.equal(measured.bpm, MEASUREMENT_PROTOCOL.rhythm["rhythm-l1"].bpm);
  assert.equal(measured.targetBeats, MEASUREMENT_PROTOCOL.rhythm["rhythm-l1"].targetBeats);

  const practised = resolveParams("rhythm-l1", { ...TWEAKED, difficultyMode: "practice" });
  assert.equal(practised.bpm, 30);
  assert.equal(practised.targetBeats, 200);
});

test("calibration stays on its own protocol in both modes", () => {
  // 基準オフセットの測定手順そのもの。ここが動くと、それを窓中心補正に使う
  // 全セッションの判定が影響を受ける。
  ["measure", "practice"].forEach((difficultyMode) => {
    const params = resolveParams("calibration", { ...TWEAKED, difficultyMode });
    assert.equal(params.bpm, rhythmPresets.calibration.bpm);
    assert.equal(params.countInBeats, rhythmPresets.calibration.countInBeats);
    assert.equal(params.targetBeats, rhythmPresets.calibration.targetBeats);
  });
});

test("measurement runs switch off every on-screen and audible hint", () => {
  const measuring = { ...TWEAKED, difficultyMode: "measure" };
  // 画面の手がかり（拍の予告＋ずれの目盛り）は出さない。
  assert.equal(allowsVisualGuidance(measuring), false);
  assert.equal(allowsVisualGuidance({ ...TWEAKED, difficultyMode: "practice" }), true);

  const crane = resolveCraneDifficulty(measuring, cranePresets);
  // ねらいの通過音は鳴らさない（鳴らすと画面を見ずに解けてしまう）。
  assert.equal(crane.audioGuidance, false);
  // アシストも切る。連続失敗で許容半径が広がると、同じセッションの中でも
  // 試行ごとに難度が変わり、「同じ課題を解いた回」でなくなる。
  assert.equal(crane.assistMaxSteps, 0);
  assert.equal(crane.sweepMs, MEASUREMENT_PROTOCOL.crane.sweepMs);
  assert.equal(crane.toleranceR, MEASUREMENT_PROTOCOL.crane.toleranceR);
  assert.equal(crane.targetTrials, MEASUREMENT_PROTOCOL.crane.targetTrials);
});

test("practice runs keep the assist and the supporter's crane settings", () => {
  const crane = resolveCraneDifficulty({ ...TWEAKED, difficultyMode: "practice" }, cranePresets);
  assert.equal(crane.sweepMs, 800);
  assert.equal(crane.toleranceR, 40);
  assert.equal(crane.targetTrials, 15);
  assert.equal(crane.audioGuidance, true);
  // アシストはプリセットのまま残る（切らない）。
  assert.equal(crane.assistMaxSteps, cranePresets.assistMaxSteps);
});

test("the protocol is held separately from the play presets", () => {
  // わざと別に持っている。プリセットを訓練の都合で調整したときに、測定の
  // 条件まで一緒に動いてしまわないようにするため。値が偶然一致していても、
  // 参照を共有していないことを確かめる。
  assert.notStrictEqual(MEASUREMENT_PROTOCOL.rhythm["rhythm-l1"], rhythmPresets["rhythm-l1"]);
  assert.notStrictEqual(MEASUREMENT_PROTOCOL.crane, cranePresets);
  // そくていが返す値も、呼ぶたびに新しい object であること（呼び出し側が
  // 書き換えても protocol が汚れない）。
  const first = resolveRhythmDifficulty("rhythm-l1", { difficultyMode: "measure" }, rhythmPresets["rhythm-l1"]);
  first.bpm = 999;
  const second = resolveRhythmDifficulty("rhythm-l1", { difficultyMode: "measure" }, rhythmPresets["rhythm-l1"]);
  assert.equal(second.bpm, MEASUREMENT_PROTOCOL.rhythm["rhythm-l1"].bpm);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("difficulty mode tests passed");
