// games/craneGeometry.js の単体テスト。
//
// ここで固定したいのは見た目ではなく「見えている範囲＝判定の範囲」という
// 公平性。床を横長の長方形として描いていた頃は、x の 1% と y の 1% が
// 画面上で別の長さだったため、許容円が横に潰れた楕円になり、景品の
// ど真ん中に見えていても縦に少しずれると miss になっていた。

import assert from "node:assert/strict";
import {
  CRANE_CHUTE,
  CRANE_GEOM,
  assistedToleranceR,
  floorCircleSize,
  floorCssVars,
  pickTarget,
  project,
} from "../src/lib/games/craneGeometry.js";

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

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );

test("project keeps the centre line centred at every depth", () => {
  for (const y of [0, 25, 50, 75, 100]) {
    close(project(50, y).left, 50);
  }
});

test("project maps the floor corners onto the trapezoid drawn by the CSS clip-path", () => {
  const vars = floorCssVars();
  const pct = (key) => Number.parseFloat(vars[key]);

  close(project(0, 0).left, pct("--crane-far-left"));
  close(project(100, 0).left, pct("--crane-far-right"));
  close(project(0, 100).left, pct("--crane-near-left"));
  close(project(100, 100).left, pct("--crane-near-right"));

  close(project(50, 0).top, pct("--crane-far-top"));
  close(
    project(50, 100).top,
    pct("--crane-far-top") + pct("--crane-floor-height")
  );
});

test("project is monotonic: bigger x goes right, bigger y comes forward and grows", () => {
  let previousLeft = -Infinity;
  for (const x of [0, 20, 40, 60, 80, 100]) {
    const { left } = project(x, 50);
    assert.ok(left > previousLeft, `left must increase with x (x=${x})`);
    previousLeft = left;
  }
  let previousTop = -Infinity;
  let previousScale = -Infinity;
  for (const y of [0, 20, 40, 60, 80, 100]) {
    const { top, scale } = project(50, y);
    assert.ok(top > previousTop, `top must increase with y (y=${y})`);
    assert.ok(scale > previousScale, `scale must increase with y (y=${y})`);
    previousTop = top;
    previousScale = scale;
  }
});

test("floorCircleSize matches the projection, so the drawn ring is the judged region", () => {
  // 床の上で半径 r の円は、画面では「その奥行きでの x 方向の伸び」と
  // 「奥行き方向の伸び」でそれぞれ潰れた楕円になる。描画がこの2つと
  // ずれると、見えている範囲と判定がずれる。
  const r = 6;
  for (const y of [0, 30, 60, 100]) {
    const { half } = project(0, y);
    const size = floorCircleSize(r, y);

    // 横: 目標から r だけ x をずらした点の画面上のずれの2倍
    const dxLeft = Math.abs(project(50 + r, y).left - project(50, y).left);
    close(size.width, dxLeft * 2);
    close(size.width, (r / 50) * half * 2);

    // 縦: 目標から r だけ y をずらした点の画面上のずれの2倍
    const dyTop = Math.abs(project(50, y + r).top - project(50, y).top);
    close(size.height, dyTop * 2);
  }
});

test("floorCircleSize grows with the tolerance and never inverts", () => {
  let previous = 0;
  for (const r of [3, 6, 9, 12]) {
    const { width, height } = floorCircleSize(r, 50);
    assert.ok(width > 0 && height > 0);
    assert.ok(width > previous, "width must grow with r");
    previous = width;
  }
});

test("floorCssVars exposes every value styles.css needs, as percentages", () => {
  const vars = floorCssVars();
  const keys = Object.keys(vars).sort();
  assert.deepEqual(keys, [
    "--crane-chute-left",
    "--crane-chute-top",
    "--crane-far-left",
    "--crane-far-right",
    "--crane-far-top",
    "--crane-floor-height",
    "--crane-near-left",
    "--crane-near-right",
  ]);
  Object.entries(vars).forEach(([key, value]) => {
    assert.match(value, /^-?\d+(\.\d+)?%$/, `${key} must be a percentage, got ${value}`);
  });
  assert.equal(vars["--crane-chute-left"], `${CRANE_CHUTE.left}%`);
  // 手前のほうが広い＝台形が手前に開く。逆になると床が奥向きに見える。
  assert.ok(CRANE_GEOM.nearHalf > CRANE_GEOM.farHalf);
});

test("assistedToleranceR widens with consecutive failures and stops at the cap", () => {
  const base = 12;
  close(assistedToleranceR(base, 0, 2, 0.35), base);
  close(assistedToleranceR(base, 1, 2, 0.35), base * 1.35);
  close(assistedToleranceR(base, 2, 2, 0.35), base * 1.7);
  // 上限を超えても広がり続けない
  close(assistedToleranceR(base, 9, 2, 0.35), base * 1.7);
});

test("assistedToleranceR is a no-op when the assist is switched off or inputs are odd", () => {
  const base = 12;
  close(assistedToleranceR(base, 3, 0, 0.35), base, 0);
  close(assistedToleranceR(base, 3, 2, 0), base, 0);
  close(assistedToleranceR(base, -1, 2, 0.35), base, 0);
  close(assistedToleranceR(base, Number.NaN, 2, 0.35), base, 0);
  assert.equal(assistedToleranceR(0, 3, 2, 0.35), 0);
});

test("pickTarget stays inside the reachable part of the floor", () => {
  // 端に寄りすぎると景品が筐体の枠や景品口に重なる。
  let random = 0;
  const sequence = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1];
  sequence.forEach((value) => {
    const target = pickTarget(null, () => value);
    assert.ok(target.x >= 20 && target.x <= 80, `x out of range: ${target.x}`);
    assert.ok(target.y >= 22 && target.y <= 78, `y out of range: ${target.y}`);
    random += 1;
  });
  assert.equal(random, sequence.length);
});

test("pickTarget does not repeat a spot close to the previous one", () => {
  // 1回目の抽選は直前と同じ点を返し、2回目で離れた点を返す乱数を与える。
  const draws = [0.5, 0.5, 0.1, 0.9];
  let index = 0;
  const random = () => draws[Math.min(index++, draws.length - 1)];
  const previous = pickTarget(null, () => 0.5);
  const next = pickTarget(previous, random);
  assert.ok(
    Math.hypot(next.x - previous.x, next.y - previous.y) > 22,
    `expected a distant retry, got ${JSON.stringify(next)}`
  );
});

test("pickTarget still returns a usable point when every retry is too close", () => {
  // 乱数が常に同じ値でも、無限ループせず床の中の点を返す。
  const previous = { x: 50, y: 50 };
  const target = pickTarget(previous, () => 0.5);
  assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y));
  assert.ok(target.x >= 20 && target.x <= 80);
  assert.ok(target.y >= 22 && target.y <= 78);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("crane geometry tests passed");
