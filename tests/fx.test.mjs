// 演出エンジンの安全の決まりと、粒の動き（src/lib/fx/）。
//
// 光の点滅・揺れ・粒の数には上限がある（docs/overall-design-2026-09-28.md §4）。
// 打ち合わせで「強すぎる刺激で発作を起こす人もいる」と言われた。画面を見て
// 確かめるだけでは、上限が守られているかは分からないので、ここで固定する。
//
//   node tests/fx.test.mjs

import assert from "node:assert/strict";
import {
  DEFAULT_FX_LEVEL,
  FX_LEVELS,
  MAX_GLOWS_PER_SECOND,
  MAX_GLOW_ALPHA,
  MAX_SHAKE_MS,
  MAX_SHAKE_PX,
  MIN_GLOW_FADE_MS,
  clampGlow,
  clampShake,
  createGlowLimiter,
  escalation,
  fxScale,
  resolveFxLevel,
} from "../src/lib/fx/fxSafety.js";
import {
  alphaOf,
  sizeOf,
  spawnBurst,
  spawnConfettiRain,
  stepParticle,
} from "../src/lib/fx/fxParticles.js";
import { colorsForPress, PALETTES } from "../src/lib/fx/fxPresets.js";

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

/** 決まった順に数を返す乱数（テストで同じ粒を作る）。 */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test("the chosen strength is respected, and a measured run adds nothing", () => {
  assert.equal(resolveFxLevel({ fxLevel: "big" }), "big");
  assert.equal(resolveFxLevel({ fxLevel: "subtle" }), "subtle");
  assert.equal(resolveFxLevel({}), DEFAULT_FX_LEVEL);
  assert.equal(resolveFxLevel({ fxLevel: "nonsense" }), DEFAULT_FX_LEVEL);
  // そくていの回は何も足さない（どの強さを選んでいても）。
  for (const level of FX_LEVELS) assert.equal(resolveFxLevel({ fxLevel: level }, { measurement: true }), "none");
});

test("the device's reduce-motion setting caps the strength at subtle", () => {
  assert.equal(resolveFxLevel({ fxLevel: "big" }, { reducedMotion: true }), "subtle");
  assert.equal(resolveFxLevel({ fxLevel: "normal" }, { reducedMotion: true }), "subtle");
  assert.equal(resolveFxLevel({ fxLevel: "none" }, { reducedMotion: true }), "none");
  // ひかえめ以下では、揺らさない・寄らない。
  for (const level of ["none", "subtle"]) {
    assert.equal(fxScale(level).shake, false);
    assert.equal(fxScale(level).camera, false);
  }
  assert.equal(fxScale("none").particles, 0, "なし では粒を出さない");
  assert.equal(fxScale("none").finale, "none");
});

test("shakes and glows stay inside the safety limits", () => {
  assert.deepEqual(clampShake(40, 5000), { amplitude: MAX_SHAKE_PX, duration: MAX_SHAKE_MS });
  assert.deepEqual(clampShake(-3, Number.NaN), { amplitude: 0, duration: 0 });
  const glow = clampGlow({ alpha: 5, lifeMs: 10 });
  assert.equal(glow.alpha, MAX_GLOW_ALPHA, "面を白く光らせない");
  assert.equal(glow.lifeMs, MIN_GLOW_FADE_MS, "光は 250ms 以上かけて消える");
});

test("no more than three soft glows in any one second", () => {
  let now = 0;
  const limiter = createGlowLimiter(() => now);
  const allowed = [];
  for (let i = 0; i < 10; i += 1) {
    allowed.push(limiter.allow());
    now += 100; // 100ms ごとに頼む（1秒に10回）
  }
  assert.equal(allowed.filter(Boolean).length, MAX_GLOWS_PER_SECOND, "最初の1秒は3回まで");
  now = 2000;
  assert.equal(limiter.allow(), true, "1秒あければまた出せる");
  // どの1秒の窓でも3回を超えない（ずらしながら確かめる）。
  let t = 0;
  const limiter2 = createGlowLimiter(() => t);
  const times = [];
  for (let i = 0; i < 60; i += 1) {
    if (limiter2.allow()) times.push(t);
    t += 70;
  }
  for (const start of times) {
    const inWindow = times.filter((at) => at >= start && at < start + 1000).length;
    assert.ok(inWindow <= MAX_GLOWS_PER_SECOND, `1秒に ${inWindow} 回光っている`);
  }
});

test("each press is bigger than the last, up to a ceiling", () => {
  const values = [0, 1, 2, 3, 4].map(escalation);
  for (let i = 1; i < values.length; i += 1) assert.ok(values[i] > values[i - 1]);
  assert.equal(values[0], 1);
  assert.ok(Math.abs(values[4] - 2.4) < 1e-9, "5回目は 2.4 倍");
  assert.equal(escalation(99), escalation(8), "上は止まる");
  assert.equal(escalation(Number.NaN), 1);
  // 色も回ごとに増え、5回目は虹になる。
  assert.equal(colorsForPress(0).length, PALETTES.night.length);
  assert.ok(colorsForPress(4).length > colorsForPress(1).length);
});

test("burst particles fly out, slow down, fall and disappear", () => {
  const random = seeded(7);
  const [p] = spawnBurst({ x: 100, y: 100, count: 1, speed: 400, angle: 0, spread: 0, gravity: 300, drag: 2.5, life: 1, random });
  assert.ok(p.vx > 0, "右へ飛ぶ");
  const startSpeed = Math.hypot(p.vx, p.vy);
  let alive = true;
  let steps = 0;
  while (alive && steps < 200) {
    alive = stepParticle(p, 1 / 60);
    steps += 1;
    if (steps === 20) assert.ok(Math.abs(p.vx) < startSpeed * 0.6, "空気抵抗で横の速さが落ちる");
  }
  assert.equal(alive, false, "寿命で消える");
  assert.ok(steps >= 58 && steps <= 62, `寿命 1 秒で消える（${steps} コマ）`);
  assert.ok(p.y > 100, "重力で下へ落ちる");
});

test("particles fade out at the end of their life and never go negative", () => {
  const [p] = spawnBurst({ x: 0, y: 0, count: 1, life: 1, random: seeded(3) });
  p.age = 0.3;
  assert.equal(alphaOf(p), 1);
  p.age = 0.8;
  assert.ok(alphaOf(p) < 1 && alphaOf(p) > 0);
  p.age = 1;
  assert.equal(alphaOf(p), 0);
  for (const age of [0, 0.01, 0.5, 0.99, 1]) {
    p.age = age;
    assert.ok(sizeOf(p) >= 0);
  }
});

test("a burst spreads evenly around the point", () => {
  const particles = spawnBurst({ x: 0, y: 0, count: 12, speed: 300, random: seeded(11) });
  assert.equal(particles.length, 12);
  // 全方向のときは、上下左右のどの側にも粒がある（片寄って見えない）。
  const quadrants = new Set(particles.map((p) => `${Math.sign(p.vx)}${Math.sign(p.vy)}`));
  assert.ok(quadrants.size >= 4, `片寄っている: ${[...quadrants].join(",")}`);
});

test("confetti rain starts above the screen and falls in", () => {
  const rain = spawnConfettiRain({ width: 1000, height: 800, count: 50, colors: ["#FF4B00"], random: seeded(5) });
  assert.equal(rain.length, 50);
  assert.ok(rain.every((p) => p.y < 0), "画面の上から始まる");
  assert.ok(rain.every((p) => p.vy > 0), "下へ落ちる");
  assert.ok(rain.every((p) => p.x >= 0 && p.x <= 1000), "画面の幅の中");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("fx tests passed");
