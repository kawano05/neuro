// =====================================================================
// fx/fxParticles.js — 粒の作り方と動き（純粋関数。描くのは fxEngine.js）
//
// 形: star（星）/ sparkle（きらきら）/ dot（丸）/ confetti（紙吹雪。ひらひら裏返る）/
//     streak（火花。速さの向きに尾を引く）/ drop（しぶき）/ ring（広がる輪）/ glow（やわらかい光）
// 単位は px と秒。y は下向きが正（画面と同じ）。
//
// 動きの考え方（モーションの決まり。docs/overall-design-2026-09-28.md §3）:
//   - はじける粒は、最初に速く、空気抵抗ですぐ減速して、ふわっと止まる（ease-out の弧）
//   - 紙吹雪は重力が弱く、左右にゆれて、裏返りながら落ちる
//   - 大きさは寿命の終わりに向けて小さく、透明度は最後の 40% で消える
// =====================================================================

const TAU = Math.PI * 2;

/** [min, max] か数から、1つの値を引く。 */
function pick(range, random) {
  if (Array.isArray(range)) return range[0] + (range[1] - range[0]) * random();
  return range;
}

/** 配列から1つ。 */
function choose(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/**
 * 粒を1つ作る。足りない値は既定で埋める。
 * @returns {object} 粒
 */
export function makeParticle(fields) {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 0,
    rot: 0,
    spin: 0,
    size: 8,
    sizeEnd: 0,
    age: 0,
    life: 1,
    color: "#FFC83D",
    shape: "sparkle",
    alpha: 1,
    // 紙吹雪の裏返り（位相と速さ）
    flip: 0,
    flipSpeed: 0,
    // 左右のゆれ（紙吹雪）
    wobble: 0,
    wobbleFreq: 0,
    phase: 0,
    // 輪: 半径の始めと終わり、線の太さ
    r0: 0,
    r1: 0,
    width: 0,
    // きらきらの瞬き（大きさの揺れ）
    twinkle: 0,
    // 出るまでの待ち（花火を順に上げるなど）
    delay: 0,
    // 動かない粒（端末の「動きを減らす」）。その場で現れて消える。大きさも変えない。
    still: false,
    ...fields,
  };
}

/** 動かない粒が置かれる、はじけ先の距離の上限（px）。遠くに散らばりすぎないように。 */
const STILL_REACH_PX = 140;

/**
 * 粒を「その場で現れて消える」形にする（端末の「動きを減らす」）。
 * はじけたら止まるはずの場所（初速 ÷ 空気抵抗。重力の分は数えない）に置き、速さ・重力・
 * 回転・ゆれ・裏返り・瞬きを外す。同じ演出が、動かない絵として同じ広がりで見える。
 * @param {object[]} particles spawnBurst などで作った粒
 */
export function settleInPlace(particles) {
  return particles.map((p) => {
    const drag = p.drag > 0 ? p.drag : 2.6;
    let dx = p.vx / drag;
    let dy = p.vy / drag;
    const reach = Math.hypot(dx, dy);
    if (reach > STILL_REACH_PX) {
      dx *= STILL_REACH_PX / reach;
      dy *= STILL_REACH_PX / reach;
    }
    return {
      ...p,
      x: p.x + dx,
      y: p.y + dy,
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 0,
      spin: 0,
      wobble: 0,
      flipSpeed: 0,
      twinkle: 0,
      still: true,
    };
  });
}

/**
 * 1点からはじける粒。
 * @param {object} options
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.count
 * @param {[number, number]|number} [options.speed] 初速（px/s）
 * @param {number} [options.angle] 真ん中の向き（ラジアン。0 = 右、-π/2 = 上）
 * @param {number} [options.spread] 広がり（ラジアン。TAU = 全方向）
 * @param {string[]} [options.shapes]
 * @param {string[]} [options.colors]
 * @param {[number, number]|number} [options.size]
 * @param {[number, number]|number} [options.life] 寿命（秒）
 * @param {number} [options.gravity]
 * @param {number} [options.drag]
 * @param {() => number} [options.random]
 */
export function spawnBurst({
  x,
  y,
  count,
  speed = [220, 520],
  angle = -Math.PI / 2,
  spread = TAU,
  shapes = ["sparkle"],
  colors = ["#FFC83D"],
  size = [6, 14],
  life = [0.55, 1.05],
  gravity = 260,
  drag = 2.6,
  spin = [-7, 7],
  twinkle = 0,
  delay = 0,
  random = Math.random,
  clip = null,
  originRadius = [0, 0],
  velocityScale = [1, 1],
}) {
  const particles = [];
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i += 1) {
    // 全方向のときは、角度を均等に割ってから少しずらす（片寄って見えないように）。
    const theta =
      spread >= TAU - 1e-6
        ? (i / Math.max(1, n)) * TAU + pick([-0.25, 0.25], random)
        : angle + (random() - 0.5) * spread;
    const v = pick(speed, random);
    const shape = choose(shapes, random);
    const s = pick(size, random);
    particles.push(
      makeParticle({
        x: x + Math.cos(theta) * originRadius[0],
        y: y + Math.sin(theta) * originRadius[1],
        vx: Math.cos(theta) * v * velocityScale[0],
        vy: Math.sin(theta) * v * velocityScale[1],
        gravity: shape === "confetti" ? gravity * 0.45 : gravity,
        drag: shape === "confetti" ? drag * 1.3 : drag,
        rot: random() * TAU,
        spin: pick(spin, random),
        size: s,
        sizeEnd: shape === "confetti" ? s * 0.85 : s * 0.3,
        life: pick(life, random),
        color: choose(colors, random),
        shape,
        flip: random() * TAU,
        flipSpeed: shape === "confetti" ? pick([6, 14], random) : 0,
        wobble: shape === "confetti" ? pick([20, 60], random) : 0,
        wobbleFreq: shape === "confetti" ? pick([3, 7], random) : 0,
        phase: random() * TAU,
        twinkle,
        delay: typeof delay === "number" ? delay : pick(delay, random),
        clip,
      })
    );
  }
  return particles;
}

/**
 * 画面の上から降る紙吹雪。一度に作り、上に積んでおく（落ちてくる順に見える）。
 * @param {{width: number, height: number, count: number, colors: string[], random?: () => number}} options
 */
export function spawnConfettiRain({ width, height, count, colors, random = Math.random }) {
  const particles = [];
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i += 1) {
    const s = pick([13, 24], random);
    particles.push(
      makeParticle({
        x: random() * width,
        y: -20 - random() * height * 0.9,
        vx: pick([-60, 60], random),
        vy: pick([140, 260], random),
        gravity: 120,
        drag: 0.6,
        rot: random() * TAU,
        spin: pick([-4, 4], random),
        size: s,
        sizeEnd: s * 0.9,
        // 画面の下まで届く長さ（上に積んだぶんも含めて）
        life: pick([2.6, 3.6], random),
        color: choose(colors, random),
        shape: choose(["confetti", "confetti", "confetti", "star"], random),
        flip: random() * TAU,
        flipSpeed: pick([5, 12], random),
        wobble: pick([25, 70], random),
        wobbleFreq: pick([2, 5], random),
        phase: random() * TAU,
      })
    );
  }
  return particles;
}

/** 広がる輪（押した場所の手応え・はじけた瞬間）。 */
export function spawnRing({ x, y, color = "#FFFFFF", r0 = 12, r1 = 90, width = 6, life = 0.45, delay = 0, clip = null }) {
  return makeParticle({ x, y, color, shape: "ring", r0, r1, width, life, delay, clip });
}

/** やわらかい光（放射状のぼかし）。明るさと消える速さは fxSafety の上限の中で渡すこと。 */
export function spawnGlow({ x, y, radius = 120, color = "#FFFFFF", alpha = 0.4, life = 0.4, delay = 0, clip = null }) {
  return makeParticle({ x, y, color, shape: "glow", size: radius, alpha, life, delay, clip });
}

/**
 * 1コマぶん進める。寿命が尽きたら false（取り除く）。
 * @param {object} p 粒
 * @param {number} dt 秒
 */
export function stepParticle(p, dt) {
  if (p.delay > 0) {
    p.delay -= dt;
    return true;
  }
  p.age += dt;
  if (p.age >= p.life) return false;
  const damping = Math.exp(-p.drag * dt);
  p.vx *= damping;
  p.vy *= damping;
  p.vy += p.gravity * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  if (p.wobble) p.x += Math.cos(p.age * p.wobbleFreq + p.phase) * p.wobble * dt;
  p.rot += p.spin * dt;
  if (p.flipSpeed) p.flip += p.flipSpeed * dt;
  return true;
}

/** 0〜1 の進み（寿命に対する年齢）。 */
export function progressOf(p) {
  return p.life > 0 ? Math.min(Math.max(p.age / p.life, 0), 1) : 1;
}

/** 透明度: 最後の 40% で消える。光は始めに少しふくらんでから消える。動かない粒は、ふわっと現れる。 */
export function alphaOf(p) {
  const t = progressOf(p);
  if (p.shape === "glow") return p.alpha * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
  if (p.still) return p.alpha * (t < 0.25 ? t / 0.25 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
  if (p.shape === "ring") return p.alpha * (1 - t) * (1 - t);
  return p.alpha * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
}

/**
 * 大きさ: 寿命の前半は大きいまま、後半でしぼむ（ease-in。早くしぼむと小さな点に
 * しか見えない）。きらきらは瞬く。
 */
export function sizeOf(p) {
  // 動かない粒は大きさも変えない（ふくらむ・しぼむも動きに見える）。
  if (p.still) return Math.max(0, p.size);
  const t = progressOf(p);
  let s = p.size + (p.sizeEnd - p.size) * t * t;
  if (p.twinkle) s *= 1 + Math.sin(p.age * 18 + p.phase) * p.twinkle;
  // はじけた瞬間は少し小さく始めて、すぐ大きくなる（ポンと出る感じ）
  if (t < 0.06 && p.shape !== "confetti") s *= 0.7 + (t / 0.06) * 0.3;
  return Math.max(0, s);
}

/** 輪の半径（ease-out で広がる）。動かない輪は広がらず、途中の大きさのまま現れて消える。 */
export function ringRadiusOf(p) {
  if (p.still) return p.r0 + (p.r1 - p.r0) * 0.6;
  const t = progressOf(p);
  const eased = 1 - Math.pow(1 - t, 3);
  return p.r0 + (p.r1 - p.r0) * eased;
}
