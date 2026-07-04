// =====================================================================
// tests/judge.test.mjs — games/judge.js の単体テスト（detailed-design.md §11.1）
//
// node 実行の素朴なテストハーネス（node:assert/strict のみに依存。
// node:test ランナーには依存しない）。`npm run test:unit` から実行する。
// 8項目すべてに対応する:
//   1. 窓内入力の最近傍割り当て
//   2. 窓外入力 → extra
//   3. sweepExpired の境界（ちょうど）と Go→miss / No-Go→correctRejection
//   4. baselineOffsetMs 補正が判定に効き、raw には効かないこと
//   5. Go・No-Go の commission 判定と goHitRate / commissionRate の分母
//   6. 1ビート1入力の消費規則
//   7. 実効判定窓のクランプ（cued は W0 のまま、continuous/gonogo は
//      min(W0, 拍間隔×0.45)）
//   8. 入力 dedupe（utils.js の createInputDeduper、150ms 以内は1入力に潰れる）
// =====================================================================

import assert from "node:assert/strict";
import {
  judgeInput,
  sweepExpired,
  computeEffectiveWindowMs,
  generateGoNoGoSequence,
} from "../src/lib/games/judge.js";
import { createInputDeduper } from "../src/lib/utils.js";

/**
 * mulberry32: 決定的な擬似乱数生成器（32bit シード）。
 * generateGoNoGoSequence の純粋性（同じ rng 列なら同じ結果）と、
 * 3連続禁止制約の検証に使う（Math.random ではテストを再現できないため）。
 */
function mulberry32(seed) {
  let state = seed | 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 配列内に "nogo" が3つ以上連続する箇所が無いかを確認する。 */
function hasTripleNogoRun(sequence) {
  let run = 0;
  for (const kind of sequence) {
    run = kind === "nogo" ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}

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

// 1. 窓内入力の最近傍割り当て（2ビート近接時の帰属）
test("judgeInput assigns the input to the nearest unresolved beat among close beats", () => {
  const beats = [
    { index: 0, kind: "go", timeMs: 1000 },
    { index: 1, kind: "go", timeMs: 1300 },
  ];
  const W = 300;
  const C = 0;
  // tInput=1250: |diff to beat0|=250, |diff to beat1|=50 -> nearest is beat1
  const result = judgeInput(1250, beats, W, C);
  assert.equal(result.beatIndex, 1);
  assert.equal(result.judgment, "hit");
});

// 2. 窓外入力 → extra
test("judgeInput returns extra when the input falls outside every beat window", () => {
  const beats = [{ index: 0, kind: "go", timeMs: 1000 }];
  const result = judgeInput(2000, beats, 300, 0);
  assert.equal(result.judgment, "extra");
  assert.equal(result.beatIndex, null);
  assert.equal(result.raw, null);
  assert.equal(result.adj, null);
});

// 3. sweepExpired の境界（tBeat+W+C ちょうど）と Go→miss / No-Go→correctRejection
test("sweepExpired treats the exact boundary as still-in-window, and expires just after it", () => {
  const beats = [
    { index: 0, kind: "go", timeMs: 1000 },
    { index: 1, kind: "nogo", timeMs: 1000 },
  ];
  const W = 300;
  const C = 0;
  const boundary = 1000 + W + C;

  assert.deepEqual(sweepExpired(boundary, beats, W, C), []);

  const expired = sweepExpired(boundary + 1, beats, W, C);
  assert.equal(expired.length, 2);
  const goResult = expired.find((entry) => entry.beatIndex === 0);
  const nogoResult = expired.find((entry) => entry.beatIndex === 1);
  assert.equal(goResult.judgment, "miss");
  assert.equal(nogoResult.judgment, "correctRejection");
});

// 4. baselineOffsetMs 補正が判定に効き、raw には効かないこと
test("baselineOffsetMs shifts the judged window center but never alters the recorded raw offset", () => {
  const beats = [{ index: 0, kind: "go", timeMs: 1000 }];
  const W = 100;
  // 生オフセットは常に +150ms 遅め。C=150 で窓中心を合わせれば hit になる。
  const withCorrection = judgeInput(1150, beats, W, 150);
  assert.equal(withCorrection.judgment, "hit");
  assert.equal(withCorrection.raw, 150); // raw は補正前の値のまま
  assert.equal(withCorrection.adj, 0);

  // 補正なし（C=0）だと同じ入力は窓（±100ms）の外なので extra になる。
  const withoutCorrection = judgeInput(1150, beats, W, 0);
  assert.equal(withoutCorrection.judgment, "extra");
});

// 5. Go・No-Go の commission 判定と goHitRate / commissionRate の分母
test("commission is classified for No-Go beats, and hit/commission rates use kind-specific denominators", () => {
  const beats = [
    { index: 0, kind: "go", timeMs: 1000 },
    { index: 1, kind: "nogo", timeMs: 2000 },
  ];
  const commission = judgeInput(2000, beats, 300, 0);
  assert.equal(commission.judgment, "commission");
  assert.equal(commission.beatIndex, 1);

  // rhythm.js の summary 集計と同じ分母規則（detailed-design.md §5.2 規則5）を
  // ここでも直接確認する: 全ビートではなく Go/No-Go それぞれの数が分母。
  const trials = [
    { beatKind: "go", judgment: "hit" },
    { beatKind: "go", judgment: "miss" },
    { beatKind: "nogo", judgment: "commission" },
    { beatKind: "nogo", judgment: "correctRejection" },
  ];
  const goBeats = trials.filter((trial) => trial.beatKind === "go");
  const nogoBeats = trials.filter((trial) => trial.beatKind === "nogo");
  const goHitRate = goBeats.filter((trial) => trial.judgment === "hit").length / goBeats.length;
  const commissionRate =
    nogoBeats.filter((trial) => trial.judgment === "commission").length / nogoBeats.length;
  assert.equal(goHitRate, 0.5);
  assert.equal(commissionRate, 0.5);
});

// 6. 1ビート1入力の消費規則（呼び出し側が pendingBeats から取り除く前提）
test("a beat removed from pendingBeats after being consumed cannot be matched by a later input", () => {
  let pending = [
    { index: 0, kind: "go", timeMs: 1000 },
    { index: 1, kind: "go", timeMs: 1050 },
  ];
  const W = 100;
  const C = 0;

  const first = judgeInput(1010, pending, W, C);
  assert.equal(first.beatIndex, 0);

  // 消化済みビートを取り除いてから次の入力を判定する（judge.js 自体は変更しない）。
  pending = pending.filter((beat) => beat.index !== first.beatIndex);

  const second = judgeInput(1010, pending, W, C);
  // beat 0 はもう無いので、残る beat 1（|1010-1050|=40 <= 100）に割り当たる。
  assert.equal(second.beatIndex, 1);
});

// 7. 実効判定窓のクランプ
test("computeEffectiveWindowMs leaves cued windows unclamped and clamps continuous/gonogo to 45% of the beat interval", () => {
  const bpm = 60; // beatIntervalMs = 1000
  assert.equal(computeEffectiveWindowMs("cued", bpm, 600), 600);
  assert.equal(computeEffectiveWindowMs("continuous", bpm, 600), 450); // min(600, 1000*0.45)
  assert.equal(computeEffectiveWindowMs("gonogo", bpm, 300), 300); // min(300, 450) = 300
});

// 8. 入力 dedupe（utils.js の createInputDeduper、detailed-design.md §3.3）
test("createInputDeduper collapses events within the threshold into a single accepted input", () => {
  const shouldAccept = createInputDeduper(150);
  assert.equal(shouldAccept(1000), true);
  assert.equal(shouldAccept(1100), false); // 100ms後、閾値内なので棄却
  assert.equal(shouldAccept(1149), false); // 149ms後、まだ閾値内
  assert.equal(shouldAccept(1160), true); // 直前の受理(1000)から160ms後なので受理
});

// 9. gonogo の乱数列生成（generateGoNoGoSequence、detailed-design.md §6.4・§12 タスク12）
test("generateGoNoGoSequence returns the requested length with the go/nogo counts implied by goRatio", () => {
  const sequence = generateGoNoGoSequence(20, 0.6, mulberry32(1));
  assert.equal(sequence.length, 20);
  const goCount = sequence.filter((kind) => kind === "go").length;
  const nogoCount = sequence.filter((kind) => kind === "nogo").length;
  assert.equal(goCount, 12); // round(20*0.6)
  assert.equal(nogoCount, 8);
  assert.ok(sequence.every((kind) => kind === "go" || kind === "nogo"));
});

test("generateGoNoGoSequence never produces 3 or more consecutive No-Go beats", () => {
  // 複数のシードで確認する（構成的アルゴリズムなので毎回満たされるはず、MUST）。
  for (let seed = 0; seed < 20; seed += 1) {
    const sequence = generateGoNoGoSequence(20, 0.6, mulberry32(seed));
    assert.equal(hasTripleNogoRun(sequence), false, `seed=${seed}: ${sequence.join(",")}`);
  }
});

test("generateGoNoGoSequence is a pure function of its rng: same seed -> identical sequence", () => {
  const first = generateGoNoGoSequence(20, 0.6, mulberry32(42));
  const second = generateGoNoGoSequence(20, 0.6, mulberry32(42));
  assert.deepEqual(first, second);
});

test("generateGoNoGoSequence handles the goRatio=1 edge case (no No-Go at all)", () => {
  const sequence = generateGoNoGoSequence(10, 1, mulberry32(7));
  assert.equal(sequence.length, 10);
  assert.ok(sequence.every((kind) => kind === "go"));
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
