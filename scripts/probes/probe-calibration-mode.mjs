// 使い捨ての計測スクリプト（test-results/ の流儀）。
//
// 問い: キャリブレーションを cued のままにするか continuous へ変えるか。
// 測るもの: baselineOffsetMs の推定量（有効試行 hit の生オフセット中央値）が、
//   同じ「その人の本当の同期のずれ μ」に対してどれだけ偏るか・ばらつくか。
//
// これはモデルによる検討であって実測ではない（実機・参加者が無い）。
// ただし比較しているのは「推定量の性質」なので、モデルの前提さえ書いてあれば
// 判断の材料になる。前提は2つだけ:
//
//   1. continuous（連続同期）… 位相修正のある1次過程。
//        A_{n+1} = A_n - α·A_n' + ε   （A' は μ からの偏差）
//      感覚運動同期の標準的な線形位相修正モデル。定常分布は μ を中心に単峰。
//   2. cued（毎回カウントインでリセット）… 試行ごとに独立。カウントインで
//      拍が完全に予告されるため「予測して押す」試行と、高音を聞いてから
//      「反応して押す」試行が混ざる。混合比 p は人・日・課題理解で変わる。
//
// 前提2が争点。混ざるなら中央値は μ の推定量ではなくなる。

import { judgeInput, computeEffectiveWindowMs } from "../../src/lib/games/judge.js";

// ---- 乱数（再現性のため決定的な線形合同法）----
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function gauss(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

const MU = -60; // その人の本当の同期のずれ（負の非同期。ms）
const SIGMA = 45; // 運動ノイズ（ms）
const ALPHA = 0.4; // 位相修正の強さ
const REACT_MEAN = 250; // 反応して押したときのずれ（ms）
const REACT_SD = 70;

function median(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** cued 1セッション: 試行独立、確率 p で反応押し。 */
function simulateCued(rng, { trials, excluded, p, windowMs }) {
  const raw = [];
  for (let i = 0; i < trials; i += 1) {
    const reacted = rng() < p;
    const offset = reacted ? REACT_MEAN + gauss(rng) * REACT_SD : MU + gauss(rng) * SIGMA;
    if (i < excluded) continue;
    // 判定窓の外は hit にならないので中央値の材料にも入らない（実装と同じ）。
    const res = judgeInput(offset, [{ index: i, kind: "go", timeMs: 0 }], windowMs, 0);
    if (res.judgment === "hit") raw.push(res.raw);
  }
  return raw;
}

/** continuous 1セッション: 位相修正つき連鎖。 */
function simulateContinuous(rng, { beats, excluded, windowMs }) {
  const raw = [];
  let dev = gauss(rng) * SIGMA; // μ からの偏差。初期は定常でない
  for (let i = 0; i < beats; i += 1) {
    const offset = MU + dev;
    if (i >= excluded) {
      const res = judgeInput(offset, [{ index: i, kind: "go", timeMs: 0 }], windowMs, 0);
      if (res.judgment === "hit") raw.push(res.raw);
    }
    dev = dev - ALPHA * dev + gauss(rng) * SIGMA;
  }
  return raw;
}

function summarize(label, estimates) {
  const n = estimates.length;
  const mean = estimates.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(estimates.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const sorted = [...estimates].sort((a, b) => a - b);
  const q = (r) => sorted[Math.floor(r * (n - 1))];
  console.log(
    `${label.padEnd(38)} bias=${(mean - MU).toFixed(1).padStart(7)}ms  sd=${sd
      .toFixed(1)
      .padStart(6)}ms  [5%,95%]=[${q(0.05).toFixed(0)}, ${q(0.95).toFixed(0)}]`
  );
}

const RUNS = 4000;
const W_CUED = computeEffectiveWindowMs("cued", 50, 600); // 600
const W_CONT = computeEffectiveWindowMs("continuous", 50, 600); // 540

console.log(`真値 μ = ${MU}ms / 運動SD = ${SIGMA}ms / 判定窓 cued=±${W_CUED} continuous=±${W_CONT}`);
console.log("");
console.log("【1】反応押しが混ざらない理想の場合（p=0）——どちらも不偏のはず");
for (const [label, fn] of [
  ["cued 12試行(先頭2除外)", (rng) => simulateCued(rng, { trials: 12, excluded: 2, p: 0, windowMs: W_CUED })],
  ["continuous 20拍(先頭4除外)", (rng) => simulateContinuous(rng, { beats: 20, excluded: 4, windowMs: W_CONT })],
]) {
  const est = [];
  for (let r = 0; r < RUNS; r += 1) {
    const m = median(fn(makeRng(r + 1)));
    if (m !== null) est.push(m);
  }
  summarize(label, est);
}

console.log("");
console.log("【2】反応押しが混ざる場合（cued のみ発生。continuous は連鎖が切れないので混ざらない）");
for (const p of [0.1, 0.2, 0.3, 0.4, 0.5]) {
  const est = [];
  for (let r = 0; r < RUNS; r += 1) {
    const m = median(simulateCued(makeRng(r + 1), { trials: 12, excluded: 2, p, windowMs: W_CUED }));
    if (m !== null) est.push(m);
  }
  summarize(`cued 12試行 反応押し ${(p * 100).toFixed(0)}%`, est);
}

console.log("");
console.log("【3】有効試行数を増やしたときの推定量のばらつき");
for (const n of [10, 16, 24]) {
  const est = [];
  for (let r = 0; r < RUNS; r += 1) {
    const m = median(simulateContinuous(makeRng(r + 1), { beats: n + 4, excluded: 4, windowMs: W_CONT }));
    if (m !== null) est.push(m);
  }
  summarize(`continuous 有効${n}拍`, est);
}

console.log("");
console.log("【4】1回にかかる時間（bpm50 = 拍間隔1200ms）");
const beatMs = 1200;
const cuedSec = ((4 + 1 + 1.5) * beatMs * 12) / 1000;
console.log(`  cued        countIn4 + 12試行 : ${cuedSec.toFixed(1)}秒  有効試行 10`);
for (const target of [16, 20, 24]) {
  const sec = ((4 + target) * beatMs) / 1000;
  console.log(`  continuous  countIn4 + ${target}拍     : ${sec.toFixed(1)}秒  有効試行 ${target - 4}`);
}
