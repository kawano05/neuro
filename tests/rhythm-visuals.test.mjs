// リズム版面の選択と、見た目だけに使う移動・評価の純粋関数。
// 判定や rawOffsetMs は rhythm.js が正本であり、このテストでは変えない。

import assert from "node:assert/strict";
import {
  gradeRhythmOffset,
  noteTravelRatio,
  RHYTHM_NOTE_LEAD_MAX_MS,
  RHYTHM_NOTE_LEAD_MIN_MS,
  rhythmProfileLabelKey,
  rhythmVisualProfile,
} from "../src/lib/games/rhythmVisuals.js";

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

const PRACTICE_GAME_IDS = ["rhythm-l1", "rhythm-l2", "gonogo"];

test("guided practice uses the note lane and unguided practice uses the instrument", () => {
  PRACTICE_GAME_IDS.forEach((gameId) => {
    assert.equal(rhythmVisualProfile(gameId, true), "lane", `${gameId}: guided practice`);
    assert.equal(rhythmVisualProfile(gameId, false), "instrument", `${gameId}: unguided practice`);
  });
});

test("calibration never exposes a future-note lane", () => {
  assert.equal(rhythmVisualProfile("calibration", true), "instrument");
  assert.equal(rhythmVisualProfile("calibration", false), "instrument");
});

test("an unguided practice instrument is not mislabeled as a measurement", () => {
  assert.equal(rhythmProfileLabelKey("lane", false), "rhythm.profile.game");
  assert.equal(rhythmProfileLabelKey("instrument", false), "rhythm.profile.noPreview");
  assert.equal(rhythmProfileLabelKey("instrument", true), "rhythm.profile.measure");
});

test("note travel starts at zero, reaches the judgment surface, and stays clamped", () => {
  const leadMs = RHYTHM_NOTE_LEAD_MIN_MS;
  assert.ok(leadMs > 0);
  assert.ok(RHYTHM_NOTE_LEAD_MAX_MS >= leadMs);
  assert.equal(noteTravelRatio(leadMs, leadMs), 0);
  assert.equal(noteTravelRatio(leadMs / 2, leadMs), 0.5);
  assert.equal(noteTravelRatio(0, leadMs), 1);
  assert.equal(noteTravelRatio(leadMs * 2, leadMs), 0);
  assert.equal(noteTravelRatio(-100, leadMs), 1);
});

test("invalid travel inputs fail closed at the lane origin", () => {
  assert.equal(noteTravelRatio(Number.NaN, 1800), 0);
  assert.equal(noteTravelRatio(100, Number.NaN), 0);
  assert.equal(noteTravelRatio(100, 0), 0);
  assert.equal(noteTravelRatio(100, -1), 0);
});

test("visual grades use the inclusive exact-tolerance boundary", () => {
  assert.equal(gradeRhythmOffset(0, 80), "perfect");
  assert.equal(gradeRhythmOffset(-80, 80), "perfect");
  assert.equal(gradeRhythmOffset(80, 80), "perfect");
  assert.equal(gradeRhythmOffset(-80.001, 80), "good");
  assert.equal(gradeRhythmOffset(80.001, 80), "good");
});

test("missing offsets never invent a perfect grade", () => {
  assert.equal(gradeRhythmOffset(Number.NaN, 80), "good");
  assert.equal(gradeRhythmOffset(undefined, 80), "good");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("rhythm visuals tests passed");
