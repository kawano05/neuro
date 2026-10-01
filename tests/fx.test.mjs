// 演出エンジンの安全の決まりと、粒の動き（src/lib/fx/）。
//
// 光の点滅・揺れ・粒の数には上限がある（docs/overall-design-2026-09-28.md §4）。
// 打ち合わせで「強すぎる刺激で発作を起こす人もいる」と言われた。画面を見て
// 確かめるだけでは、上限が守られているかは分からないので、ここで固定する。
//
//   node tests/fx.test.mjs

import assert from "node:assert/strict";
import {
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
  resolveDecorationPolicy,
} from "../src/lib/fx/fxSafety.js";
import {
  alphaOf,
  sizeOf,
  spawnBurst,
  spawnConfettiRain,
  stepParticle,
} from "../src/lib/fx/fxParticles.js";
import { colorsForPress, createFxPresets, PALETTES } from "../src/lib/fx/fxPresets.js";
import { createFxEngine } from "../src/lib/fx/fxEngine.js";

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
  assert.equal(resolveFxLevel({}), "none");
  for (const value of ["nonsense", null, {}, "toString"]) {
    assert.equal(resolveFxLevel({ fxLevel: value }), "none");
    assert.equal(fxScale(value), fxScale("none"));
  }
  // そくていの回は何も足さない（どの強さを選んでいても）。
  for (const level of FX_LEVELS) assert.equal(resolveFxLevel({ fxLevel: level }, { measurement: true }), "none");
});

test("the device's reduce-motion setting is not used: the supporter's atmosphere decides", () => {
  // 端末の「動きを減らす」（prefers-reduced-motion）は見ない（2026-10-01、ユーザーの判断）。
  // 渡されても段は変わらない（以前は すっきり に下げ、9/30 からは全部止めていた）。
  for (const level of FX_LEVELS) {
    assert.equal(resolveFxLevel({ fxLevel: level }, { reducedMotion: true }), level);
  }
  // すっきり 以下では、揺らさない・寄らない（揺れや光が苦手な人には支援者がこの段を選ぶ）。
  for (const level of ["none", "subtle"]) {
    assert.equal(fxScale(level).shake, false);
    assert.equal(fxScale(level).camera, false);
  }
  assert.equal(fxScale("none").particles, 0, "なし では粒を出さない");
  assert.equal(fxScale("none").finale, "none");
});

test("decorative motion is separate from the recorded level and task motion", () => {
  for (const fxLevel of FX_LEVELS) {
    const policy = resolveDecorationPolicy({ fxLevel });
    assert.equal(policy.level, resolveFxLevel({ fxLevel }));
    assert.equal(policy.motion, fxLevel !== "none");
    assert.equal(policy.worldMotion, ["normal", "big"].includes(fxLevel));
    assert.equal(policy.scale, fxScale(policy.motion ? fxLevel : "none"));
    assert.deepEqual(resolveDecorationPolicy({ fxLevel }, { reducedMotion: true }), policy, "端末の設定では変わらない");
    const measured = resolveDecorationPolicy({ fxLevel }, { measurement: true });
    assert.equal(measured.motion, false, "そくていの回は演出を出さない");
    assert.equal(measured.worldMotion, false);
    assert.equal(measured.scale, fxScale("none"));
  }
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

// 窓を描画の枠に渡し、小さな画面でも大きな星を十分な数だけ残す。
test("リールの成功演出は窓内に収まり、連続成功で段階が増える", () => {
  for (const width of [32, 60, 120, 240]) {
    const height = width * 1.8;
    const calls = { bursts: [], rings: [], glows: [] };
    const windowEl = {};
    const fx = createFxPresets({
      engine: {
        pointOf(el) { assert.equal(el, windowEl); return { x: 0, y: 0, rect: { width, height } }; },
        burst: options => calls.bursts.push(options), ring: options => calls.rings.push(options), glow: options => calls.glows.push(options),
      },
      motion: { punch() {} },
    });
    for (const streak of [1, 2, 5, 99]) fx.reelHit({ querySelector: () => windowEl }, { streak });
    assert.ok(calls.bursts[1].count > calls.bursts[0].count);
    assert.ok(calls.rings[1].r1 > calls.rings[0].r1);
    assert.equal(calls.bursts[2].count, calls.bursts[3].count);
    for (const burst of calls.bursts) {
      assert.equal(burst.clip.element, windowEl);
      assert.ok(burst.count >= 20, "初回から星を十分に出す");
      assert.ok(burst.size[0] >= width * 0.18, "小さな点に戻さない");
      const particles = spawnBurst({ ...burst, random: seeded(27) });
      for (const at of [0.096, 0.24, 0.48]) {
        for (const p of particles) {
          while (p.age < at) stepParticle(p, 1 / 120);
          assert.equal(p.clip, burst.clip, "描画まで枠を保持する");
        }
        const visible = particles.filter(p => Math.abs(p.x) < width / 2 && Math.abs(p.y) < height / 2 && alphaOf(p) > 0.4);
        assert.ok(visible.length >= 6, `${at}秒でも複数の大きな星が窓内に見える`);
        if (at === 0.24) assert.ok(Math.max(...visible.map(p => Math.abs(p.y))) > width * 0.25, "窓の中心だけに集めない");
      }
    }
    calls.rings.forEach(r => {
      assert.equal(r.clip.element, windowEl);
      assert.ok(r.r1 >= Math.min(width, height / 3) / 2, "当たった1コマを囲む輪");
    });
    calls.glows.forEach(g => assert.equal(g.clip.element, windowEl));
  }
});

test("釣れたときは見えるしぶきと泡が魚に追従し、札を避ける", () => {
  for (const lengthCm of [10, 30, 80]) {
    const bursts = [];
    const labels = [{}, {}];
    const fish = { closest: () => ({ querySelectorAll: () => labels }) };
    const fx = createFxPresets({
      engine: {
        pointOf: () => ({ x: 0, y: 0, rect: { width: 60, height: 40 } }),
        burst: options => bursts.push(options),
        ring() { assert.fail("長さの札を隠す輪を出している"); },
        glow() { assert.fail("魚を隠す光を出している"); },
      }, motion: {},
    });
    fx.fishCatch(fish, { lengthCm });
    assert.equal(bursts.length, 1);
    assert.equal(bursts[0].count, 10);
    assert.deepEqual(bursts[0].shapes, ["drop", "drop", "bubble"]);
    assert.deepEqual(bursts[0].colors, PALETTES.sea);
    assert.equal(bursts[0].clip.element, fish);
    assert.equal(bursts[0].clip.scale, 1.5);
    assert.equal(bursts[0].clip.follow, true);
    assert.deepEqual(bursts[0].clip.exclude, labels);
    assert.ok(bursts[0].size[0] >= 4 && bursts[0].size[1] >= 8);
    for (const p of spawnBurst({ ...bursts[0], random: seeded(13) })) {
      while (p.age < 0.48) stepParticle(p, 1 / 120);
      assert.ok(alphaOf(p) > 0.5, "480msでもしぶきが消えない");
      assert.equal(p.clip, bursts[0].clip);
    }
  }
});

test("描画エンジンが窓・魚の枠と文字の除外を適用し、強さと測定の制約を守る", () => {
  for (const level of ["none", "subtle", "normal", "big"]) {
    let frame;
    const clips = [], rects = [], translations = [];
    const g = new Proxy({}, { get: (_, name) => (...args) => {
      if (name === "clip") clips.push(args);
      if (name === "rect") rects.push(args);
      if (name === "translate") translations.push(args);
    }, set: () => true });
    let canvases = 0;
    const doc = {
      createElement: () => { canvases++; return { dataset: {}, setAttribute() {}, getContext: () => g }; },
      body: { append() {} },
      defaultView: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, performance: { now: () => 0 }, requestAnimationFrame: cb => { frame = cb; return 1; } },
    };
    const engine = createFxEngine({ getLevel: () => level, doc });
    const element = { getBoundingClientRect: () => ({ left: 100, top: 200, width: 60, height: 40 }) };
    const label = { getBoundingClientRect: () => ({ left: 110, top: 180, width: 30, height: 20 }) };
    const clip = { element, scale: 1.5, follow: true, x: 120, y: 210, exclude: [label] };
    engine.burst({ x: 120, y: 210, count: 10, shapes: ["drop", "bubble"], clip });
    assert.equal(engine.count(), Math.round(10 * fxScale(level).particles));
    if (level === "none") { assert.equal(canvases, 0, "なし・測定はキャンバスも作らない"); continue; }
    frame(16);
    assert.ok(rects.some(r => JSON.stringify(r) === JSON.stringify([85, 190, 90, 60])), "魚の1.5倍の範囲");
    assert.ok(rects.some(r => JSON.stringify(r) === JSON.stringify([106, 176, 38, 28])), "文字の周囲4pxまでくり抜く");
    assert.ok(clips.some(args => args[0] === "evenodd"));
    assert.ok(translations.some(t => t[0] === 10 && t[1] === 10), "魚の移動分に追従する");
    rects.length = 0;
    engine.ring({ x: 130, y: 220, clip: { element } });
    frame(32);
    assert.ok(rects.some(r => JSON.stringify(r) === JSON.stringify([100, 200, 60, 40])), "輪もリールの窓内で切る");
    assert.equal(resolveFxLevel({ fxLevel: level }, { measurement: true }), "none");
  }
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("fx tests passed");
