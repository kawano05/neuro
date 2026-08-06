// リズム系の難易度をどこまで支援者に開放するか、の線引き。
//
// bpm・カウントイン拍数・目標拍数は設定画面から変えられる（訓練の3課題）。
// キャリブレーションだけは変えられない——基準オフセットの測定手順そのもので、
// ここで得た中央値は判定窓の中心補正として全セッションに効くため
// （basic-design.md §7.3）。支援者が「リズムを遅くした」つもりで測定手順まで
// 変えてしまえる状態にはしない。
//
// この線引きはコードを読んでも一目では分からず、壊しても画面上は普通に動く。
// だからテストで固定する。

import assert from "node:assert/strict";
import { resolveParams } from "../src/lib/games/rhythm.js";
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

/** 支援者が全部いじった状態の設定。 */
const OVERRIDES = { rhythmBpm: 33, countInBeats: 7, targetBeats: 44 };
/** 何も触っていない状態（既定）。 */
const UNTOUCHED = { rhythmBpm: null, countInBeats: null, targetBeats: null };

const TRAINING_GAME_IDS = ["rhythm-l1", "rhythm-l2", "gonogo"];

test("training tasks follow the supporter's difficulty settings", () => {
  TRAINING_GAME_IDS.forEach((gameId) => {
    const params = resolveParams(gameId, OVERRIDES);
    assert.equal(params.bpm, 33, `${gameId}: bpm must follow the setting`);
    assert.equal(params.countInBeats, 7, `${gameId}: countInBeats must follow the setting`);
    assert.equal(params.targetBeats, 44, `${gameId}: targetBeats must follow the setting`);
  });
});

test("calibration ignores every difficulty setting", () => {
  const preset = rhythmPresets.calibration;
  const params = resolveParams("calibration", OVERRIDES);
  assert.equal(params.bpm, preset.bpm, "calibration bpm is part of the measurement protocol");
  assert.equal(params.countInBeats, preset.countInBeats);
  assert.equal(params.targetBeats, preset.targetBeats);
  // 元から守られていた値も、引き続き守られること。
  assert.equal(params.excludedTrialCount, preset.excludedTrialCount);
  assert.ok(preset.excludedTrialCount > 0, "the calibration preset must still exclude warm-up trials");
});

test("untouched settings leave every task on its preset", () => {
  [...TRAINING_GAME_IDS, "calibration"].forEach((gameId) => {
    const preset = rhythmPresets[gameId];
    const params = resolveParams(gameId, UNTOUCHED);
    assert.equal(params.bpm, preset.bpm, `${gameId}: bpm`);
    assert.equal(params.countInBeats, preset.countInBeats, `${gameId}: countInBeats`);
    assert.equal(params.targetBeats, preset.targetBeats, `${gameId}: targetBeats`);
  });
});

test("the designed L1 -> L2 progression only holds while nobody overrides it", () => {
  // 設定は課題ごとではなく1つなので、上書きすると L1 と L2 が同じテンポになる。
  // 「この利用者のテンポ」を一律に当てる仕様であることを、意図として固定する。
  const untouchedL1 = resolveParams("rhythm-l1", UNTOUCHED);
  const untouchedL2 = resolveParams("rhythm-l2", UNTOUCHED);
  assert.ok(untouchedL1.bpm < untouchedL2.bpm, "L1 must start slower than L2 by default");

  const overriddenL1 = resolveParams("rhythm-l1", OVERRIDES);
  const overriddenL2 = resolveParams("rhythm-l2", OVERRIDES);
  assert.equal(overriddenL1.bpm, overriddenL2.bpm);
});

test("mode and goRatio never come from settings", () => {
  // 課題の種類そのものは設定で変わらない。
  const gonogo = resolveParams("gonogo", { ...OVERRIDES, mode: "cued", goRatio: 1 });
  assert.equal(gonogo.mode, rhythmPresets.gonogo.mode);
  assert.equal(gonogo.goRatio, rhythmPresets.gonogo.goRatio);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("rhythm params tests passed");
