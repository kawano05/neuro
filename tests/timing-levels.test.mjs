// タイミングの遊びの速さの段階（src/lib/timingLevels.js、2026-11-25）の検査。
//
// 2026-11-25 に、遊びの中の札（とても ゆっくり／ゆっくり／ふつう／はやい）はそのままで、中身の値を
// 一段階ずつ遅くした。見るのは4つ:
//   1. 前の版で保存した設定を読み込むと、前の札の値が同じ札の新しい値へ1回だけ移る。
//      保存し直して読み込み直しても、2段目へは動かない。
//   2. 札の値でない数（支援者が目盛りで決めた値）は動かさない。
//   3. そくていの回は前の値のまま（MEASUREMENT_PROTOCOL が設定より優先する）。
//   4. 記録の画面の束（さかなつり）は、前の回も新しい回も、そくていの長さと比べて分ける。

import assert from "node:assert/strict";
import { cranePresets, fishingPresets, rhythmPresets, slotPresets } from "../src/lib/content.js";
import {
  MEASUREMENT_PROTOCOL,
  resolveCraneDifficulty,
  resolveFishingDifficulty,
  resolveRhythmDifficulty,
  resolveSlotDifficulty,
} from "../src/lib/difficultyMode.js";
import { PITCH_MS } from "../src/lib/games/baseball.js";
import { GAME_SETTINGS } from "../src/lib/games/gameSettings.js";
import { describeSessionConditions } from "../src/lib/sessionConditions.js";
import { SETTING_DEFINITIONS } from "../src/lib/settingDefinitions.js";
import { cloneDefaultState, sanitizeState } from "../src/lib/state.js";
import { LEGACY_TIMING_LEVELS, TIMING_LEVELS_VERSION, migrateTimingLevels } from "../src/lib/timingLevels.js";

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

/** 保存して読み直す（JSON を通す。実際の保存と同じ形）。 */
function reload(state) {
  return sanitizeState(JSON.parse(JSON.stringify(state)));
}

/** 前の版（timingLevels の無い版）で保存した状態。設定は全部そろっている。 */
function legacySave(overrides) {
  const state = cloneDefaultState();
  delete state.settings.timingLevels;
  Object.assign(state.settings, overrides);
  return state;
}

/** 遊びの中の選択肢の値（札の順）。 */
function inGameValues(gameId, key) {
  return GAME_SETTINGS[gameId].groups.find((group) => group.key === key).options.map(([value]) => value);
}

test("a new install starts on the current levels, and nothing moves on reload", () => {
  const fresh = cloneDefaultState();
  assert.equal(fresh.settings.timingLevels, TIMING_LEVELS_VERSION);
  assert.equal(fresh.settings.slotCycleMs, slotPresets["slot-l1"].cycleMs, "えあわせの既定は ふつう");
  const again = reload(fresh);
  for (const key of Object.keys(LEGACY_TIMING_LEVELS)) {
    assert.equal(again.settings[key], fresh.settings[key], `${key} は動かない`);
  }
});

test("each old level moves to the same level's new value, once", () => {
  const cases = [
    // [キー, 前の札の値, 新しい札の値]
    ["slotCycleMs", 3200, 4800], // ふつう（前の既定。全部の端末に数で保存されている）
    ["slotCycleMs", 4800, 7200], // ゆっくり
    ["slotCycleMs", 7200, 9600], // とても ゆっくり
    ["slotCycleMs", 2800, 3200], // はやい
    ["rhythmBpm", 40, 30], // ゆっくり
    ["rhythmBpm", 60, 50], // はやい
    ["craneSweepMs", 3200, 4800], // ゆっくり
    ["craneSweepMs", 1700, 2200], // はやい
    ["fishingLimitMs", 3000, 4500], // ながい
    ["fishingLimitMs", 4000, 6000], // とても ながい（支援者の設定画面）
    ["fishingLimitMs", 1400, 2000], // みじかい
  ];
  for (const [key, before, after] of cases) {
    const once = reload(legacySave({ [key]: before }));
    assert.equal(once.settings[key], after, `${key} ${before} → ${after}`);
    assert.equal(once.settings.timingLevels, TIMING_LEVELS_VERSION, "移したら版を書く");
    // 保存し直して読み直しても、2段目へは動かない（4800 → 7200 などへ続けて動かない）。
    const twice = reload(reload(once));
    assert.equal(twice.settings[key], after, `${key} は1回だけ動く`);
  }
});

test("the 'normal' choice keeps following the game's default (null stays null)", () => {
  const loaded = reload(legacySave({ rhythmBpm: null, craneSweepMs: null, fishingLimitMs: null }));
  assert.equal(loaded.settings.rhythmBpm, null);
  assert.equal(loaded.settings.craneSweepMs, null);
  assert.equal(loaded.settings.fishingLimitMs, null);
});

test("a value set on the slider (not one of the old levels) is left as the supporter set it", () => {
  const loaded = reload(legacySave({ slotCycleMs: 4100, craneSweepMs: 5000, rhythmBpm: 80 }));
  assert.equal(loaded.settings.slotCycleMs, 4100);
  assert.equal(loaded.settings.craneSweepMs, 5000);
  assert.equal(loaded.settings.rhythmBpm, 80, "80（はやめ）は今も選べるので動かさない");
});

test("the migration does not touch its input and ignores what is not settings", () => {
  const input = { slotCycleMs: 3200 };
  const moved = migrateTimingLevels(input);
  assert.equal(input.slotCycleMs, 3200, "入力は書き換えない");
  assert.equal(moved.slotCycleMs, 4800);
  const current = { timingLevels: TIMING_LEVELS_VERSION, slotCycleMs: 3200 };
  assert.equal(migrateTimingLevels(current), current, "今の版はそのまま返す");
  assert.equal(migrateTimingLevels(null), null);
});

test("every new value is a choice on screen and survives sanitize", () => {
  const choices = {
    slotCycleMs: inGameValues("slot-l1", "slotCycleMs"),
    rhythmBpm: [
      ...inGameValues("gonogo", "rhythmBpm"),
      ...SETTING_DEFINITIONS.rhythmBpm.options.map(([value]) => (value === "" ? null : Number(value))),
    ],
    craneSweepMs: inGameValues("crane", "craneSweepMs"),
    fishingLimitMs: [
      ...inGameValues("fishing", "fishingLimitMs"),
      ...SETTING_DEFINITIONS.fishingLimitMs.options.map(([value]) => (value === "" ? null : Number(value))),
    ],
  };
  const presets = {
    slotCycleMs: slotPresets["slot-l1"].cycleMs,
    rhythmBpm: rhythmPresets.gonogo.bpm,
    craneSweepMs: cranePresets.sweepMs,
    fishingLimitMs: fishingPresets.fishing.limitMs,
  };
  for (const [key, table] of Object.entries(LEGACY_TIMING_LEVELS)) {
    for (const value of Object.values(table)) {
      // 新しい値は、画面の札か、「ふつう」（null ＝ プリセット）のどちらかで選べる。
      const shown = choices[key].includes(value) || presets[key] === value;
      assert.ok(shown, `${key}=${value} は画面で選べる`);
      const kept = sanitizeState({ settings: { timingLevels: TIMING_LEVELS_VERSION, [key]: value } }).settings[key];
      assert.equal(kept, value, `${key}=${value} が保存で残る`);
    }
  }
});

test("every level is one step slower than before, and the slowest end got slower", () => {
  // えあわせ（1周の時間）とアーム（端から端の時間）は長いほど遅い。
  assert.deepEqual(inGameValues("slot-l1", "slotCycleMs"), [9600, 7200, 4800, 3200]);
  assert.deepEqual(inGameValues("crane", "craneSweepMs"), [7200, 4800, null, 2200]);
  assert.equal(cranePresets.sweepMs, 3200);
  assert.ok(SETTING_DEFINITIONS.craneSweepMs.max >= 10000, "アームの目盛りは前の上限（6秒）より遅くできる");
  // 音あそびのテンポは少ないほど遅い。
  assert.deepEqual(inGameValues("gonogo", "rhythmBpm"), [30, null, 50]);
  assert.equal(rhythmPresets.gonogo.bpm, 40);
  // さかなつり（アタリが続く長さ）は長いほど ゆっくり押せる。
  assert.deepEqual(inGameValues("fishing", "fishingLimitMs"), [4500, null, 2000]);
  assert.equal(fishingPresets.fishing.limitMs, 3000);
  // やきゅう（ボールが届くまで）は長いほど遅い。保存は札の名前なので、数だけ変えた。
  assert.deepEqual(PITCH_MS, { slow: 3000, normal: 2300, fast: 1750 });
});

test("measured runs keep the old values, whatever the new levels say", () => {
  const measuring = { ...cloneDefaultState().settings, difficultyMode: "measure" };
  const slot = resolveSlotDifficulty("slot-l1", measuring, slotPresets["slot-l1"], "seed");
  assert.equal(slot.cycleMs, MEASUREMENT_PROTOCOL.slot["slot-l1"].cycleMs);
  assert.equal(slot.cycleMs, 3200);
  assert.equal(resolveCraneDifficulty(measuring, cranePresets).sweepMs, 2200);
  assert.equal(resolveRhythmDifficulty("gonogo", measuring, rhythmPresets.gonogo).bpm, 50);
  assert.equal(resolveFishingDifficulty("fishing", measuring, fishingPresets.fishing).limitMs, 2000);
});

test("fishing records are grouped against the measured bite length, old and new alike", () => {
  const session = (limitMs) => ({ taskType: "rt", gameId: "fishing", config: { limitMs, difficultyMode: "practice" } });
  assert.equal(describeSessionConditions(session(2000)), "", "前の ふつう（2秒）の回は、今までどおり そくていと同じ束");
  assert.equal(describeSessionConditions(session(3000)), "アタリ 3000ms", "新しい ふつう（3秒）の回は別の束");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("timing-levels tests passed");
