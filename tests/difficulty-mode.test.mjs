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
  endlessDifficultyStep,
  resolveEndlessMode,
  resolveRhythmDifficulty,
  resolveSlotDifficulty,
} from "../src/lib/difficultyMode.js";
import { resolveParams } from "../src/lib/games/rhythm.js";
import { cranePresets, rhythmPresets, slotPresets } from "../src/lib/content.js";
import { sanitizeState } from "../src/lib/state.js";

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
  slotCycleMs: 4200,
  slotToleranceMs: 180,
  slotL1Rounds: 9,
  slotL2Rounds: 7,
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

test("measurement runs fix every slot-v1 value and seed", () => {
  const settings = { ...TWEAKED, difficultyMode: "measure" };
  ["slot-l1", "slot-l2"].forEach((gameId) => {
    const resolved = resolveSlotDifficulty(gameId, settings, slotPresets[gameId], "random-practice-seed");
    assert.equal(resolved.cycleMs, MEASUREMENT_PROTOCOL.slot[gameId].cycleMs);
    assert.equal(resolved.toleranceMs, MEASUREMENT_PROTOCOL.slot[gameId].toleranceMs);
    assert.equal(resolved.rounds, MEASUREMENT_PROTOCOL.slot[gameId].rounds);
    assert.equal(resolved.seed, "slot-measure-01");
  });
});

test("practice slot runs keep supporter values and the recorded variable seed", () => {
  const resolved = resolveSlotDifficulty(
    "slot-l2",
    { ...TWEAKED, difficultyMode: "practice" },
    slotPresets["slot-l2"],
    "slot-practice-test"
  );
  assert.equal(resolved.cycleMs, 4200);
  assert.equal(resolved.toleranceMs, 180);
  assert.equal(resolved.rounds, 7);
  assert.equal(resolved.seed, "slot-practice-test");
});

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
  assert.notStrictEqual(MEASUREMENT_PROTOCOL.slot["slot-l1"], slotPresets["slot-l1"]);
  // そくていが返す値も、呼ぶたびに新しい object であること（呼び出し側が
  // 書き換えても protocol が汚れない）。
  const first = resolveRhythmDifficulty("rhythm-l1", { difficultyMode: "measure" }, rhythmPresets["rhythm-l1"]);
  first.bpm = 999;
  const second = resolveRhythmDifficulty("rhythm-l1", { difficultyMode: "measure" }, rhythmPresets["rhythm-l1"]);
  assert.equal(second.bpm, MEASUREMENT_PROTOCOL.rhythm["rhythm-l1"].bpm);
});

test("endless is chosen at the game entrance and never reaches a measurement run", () => {
  // れんしゅうでは、あそびの入口が渡した希望どおり。
  assert.equal(resolveEndlessMode({ difficultyMode: "practice" }, true), true);
  assert.equal(resolveEndlessMode({ difficultyMode: "practice" }, false), false);

  // そくていでは、入口から希望が来ても必ずOFFへ解決する。そくていは試行数と
  // パラメータを固定することが条件そのもので、難度が回の途中で動くと同じ回の
  // 中の試行すら同じ条件でなくなる（ホームにも出さないが、二重防御）。
  assert.equal(resolveEndlessMode({ ...TWEAKED, difficultyMode: "measure" }, true), false);

  // 希望が無い・壊れている呼び出しは既定（OFF）へ。
  assert.equal(resolveEndlessMode({}), false);
  assert.equal(resolveEndlessMode(null, undefined), false);
  assert.equal(resolveEndlessMode({}, "yes"), false);
});

test("endless difficulty rises by trial count, in fixed steps with a ceiling", () => {
  // 上げ方は試行数ごと。出来高制にすると、上達したから上がったのか
  // たまたま当たったから上がったのかが記録から分けられなくなる。
  assert.equal(endlessDifficultyStep(0, 3, 5), 0);
  assert.equal(endlessDifficultyStep(2, 3, 5), 0);
  assert.equal(endlessDifficultyStep(3, 3, 5), 1);
  assert.equal(endlessDifficultyStep(14, 3, 5), 4);
  // 天井を越えない（越えると、狙って押す練習ではなく偶然の当たりになる）。
  assert.equal(endlessDifficultyStep(15, 3, 5), 5);
  assert.equal(endlessDifficultyStep(999, 3, 5), 5);
  // 壊れた入力は0段（難度を勝手に上げない）。
  assert.equal(endlessDifficultyStep(-5, 3, 5), 0);
  assert.equal(endlessDifficultyStep(10, 0, 5), 0);
  assert.equal(endlessDifficultyStep(10, 3, 0), 0);
  assert.equal(endlessDifficultyStep(NaN, 3, 5), 0);
});

test("an endless run survives a reload as a completed practice run", () => {
  // config → sanitize → CSV の3経路。落とすと、回数が回ごとに違う理由が
  // あとから言えなくなる。
  const restored = sanitizeState({
    sessions: [
      {
        sessionId: "endless-1",
        taskType: "scan",
        gameId: "crane",
        participantId: "P1",
        startedAtIso: "2026-08-28T00:00:00.000Z",
        finished: true,
        aborted: false,
        device: {},
        // ゲーム側が終了時に実際の回数を書き戻す（games/crane.js の destroy）。
        config: { targetTrials: 1, endless: true, difficultyMode: "practice" },
        trials: [
          {
            index: 0,
            targetX: 10,
            targetY: 10,
            toleranceR: 15,
            selectedX: 10,
            selectedY: 10,
            dx: 0,
            dy: 0,
            distance: 0,
            xPhaseMs: 100,
            yPhaseMs: 100,
            judgment: "grip",
          },
        ],
      },
    ],
  }).sessions[0];
  assert.equal(restored.config.endless, true);
  // 完走扱いのまま残ること。aborted に倒れると、その回は成立確認の材料から
  // 外れる（readinessCheck.js の isUsable は aborted を使わない）——
  // れんしゅうを重ねているのに成立確認が通らない、という見えない詰まりになる。
  assert.equal(restored.aborted, false);
  assert.equal(restored.finished, true);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("difficulty mode tests passed");
