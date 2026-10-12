// =====================================================================
// fx/fxEngine.js — 演出エンジン（画面いっぱいのキャンバス1枚に粒を描く）
//
// docs/overall-design-2026-09-28.md §6。遊びの側は ctx.fx（fxPresets.js）だけを見る。
//
// 軽さの決まり:
//   - キャンバスは1枚だけ。粒が1つも無いあいだは requestAnimationFrame を止める
//     （遊んでいない時間に描き続けない）
//   - 粒は MAX_PARTICLES まで。超えたら古いものから消す
//   - 画素の密度は 1.5 まで（粒は網膜の細かさが要らない。描く面積を半分近くに抑える）
//   - やわらかい光は、色ごとに1度だけ描いた絵を拡大して使う（毎コマぼかしを作らない）
//   - 小さな粒は縁取りを省く
//   - 入力の計時には触れない（入力の時刻はシェルの入口で取っている）
// 安全の決まり（fxSafety.js）: 強さの係数、光の回数制限、光の明るさの上限。
// キャンバスは pointer-events: none・aria-hidden で、入力と読み上げには何も足さない。
// =====================================================================

import {
  MAX_PARTICLES,
  MIN_FIREWORK_GAP_S,
  clampGlow,
  createBrightLimiter,
  fxScale,
} from "./fxSafety.js";
import { presentation } from "../presentation.js";
import {
  alphaOf,
  ringRadiusOf,
  sizeOf,
  spawnBurst,
  spawnConfettiRain,
  spawnGlow,
  spawnRing,
  stepParticle,
} from "./fxParticles.js";

const TAU = Math.PI * 2;
/** キャンバスの画素の密度の上限。 */
const MAX_DPR = 1.5;
/** 縁取りをする大きさ（これより小さい粒は、縁が見分けられないので省く）。 */
const OUTLINE_MIN_SIZE = 9;
/** 遊びの形（drawThemeShape が描く）。 */
const THEME_SHAPES = new Set(["ribbon", "balloon", "ball", "fish", "splat", "note"]);

/**
 * 粒のふち。「はっきりした色」の絵柄（黒い縁の平らな絵。theme-hakkiri.css）に合わせ、
 * 明るい地（ふうせん・けっか）でも黄色や白の粒が消えないように縁を付ける。
 */
const OUTLINE = "rgba(26, 26, 26, 0.62)";

/** 星（5つの角）。 */
function pathStar(g, r) {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** きらきら（4つの角。細い）。 */
function pathSparkle(g, r) {
  const inner = r * 0.26;
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(inner * 0.35, -inner * 0.35, r, 0);
  g.quadraticCurveTo(inner * 0.35, inner * 0.35, 0, r);
  g.quadraticCurveTo(-inner * 0.35, inner * 0.35, -r, 0);
  g.quadraticCurveTo(-inner * 0.35, -inner * 0.35, 0, -r);
  g.closePath();
}

/** ハート（おおさわぎの粒）。 */
function pathHeart(g, r) {
  g.beginPath();
  g.moveTo(0, r * 0.9);
  g.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.6, -r * 0.95, 0, -r * 0.35);
  g.bezierCurveTo(r * 0.6, -r * 0.95, r * 1.25, r * 0.05, 0, r * 0.9);
  g.closePath();
}

/** 絵の具のしぶき（ふちが6つふくらんだ丸）。 */
function pathSplat(g, r) {
  g.beginPath();
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * TAU;
    const radius = r * (0.78 + 0.22 * Math.cos(a * 6) + 0.06 * Math.sin(a * 11));
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/** 黒いふちを付ける（小さな粒は省く）。 */
function outline(g, s, width = 0.07) {
  if (s < OUTLINE_MIN_SIZE) return;
  g.lineWidth = Math.max(1.2, s * width);
  g.lineJoin = "round";
  g.strokeStyle = OUTLINE;
  g.stroke();
}

/**
 * 遊びの形（src/lib/partyThemes.js）。原点が粒の真ん中、s が大きさ。
 * 紙テープ・ふうせん・ボール・魚・絵の具・音符。
 */
function drawThemeShape(g, p, s) {
  if (p.shape === "ribbon") {
    // 紙テープ: 波打つ細い帯。紙吹雪と同じく裏返りながら落ちる。
    const flip = Math.cos(p.flip);
    g.rotate(p.rot);
    g.scale(1, flip);
    g.beginPath();
    g.moveTo(-s * 0.8, 0);
    g.bezierCurveTo(-s * 0.45, -s * 0.38, -s * 0.15, s * 0.38, s * 0.15, 0);
    g.bezierCurveTo(s * 0.4, -s * 0.32, s * 0.6, s * 0.28, s * 0.8, 0);
    g.strokeStyle = p.color;
    g.lineCap = "round";
    g.lineWidth = Math.max(2, s * 0.2);
    g.stroke();
    return;
  }
  if (p.shape === "balloon") {
    // 小さなふうせん: 少しだけ左右にゆれて、ひもが下へ垂れる。
    g.rotate(Math.sin(p.age * 2.4 + p.phase) * 0.18);
    g.beginPath();
    g.moveTo(0, s * 0.5);
    g.quadraticCurveTo(-s * 0.12, s * 0.75, s * 0.04, s * 1.05);
    g.strokeStyle = "#5A6B7B";
    g.lineWidth = Math.max(1, s * 0.05);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0, s * 0.4, s * 0.48, 0, 0, TAU);
    g.fillStyle = p.color;
    g.fill();
    outline(g, s);
    g.beginPath();
    g.moveTo(-s * 0.07, s * 0.47);
    g.lineTo(s * 0.07, s * 0.47);
    g.lineTo(0, s * 0.56);
    g.closePath();
    g.fill();
    g.beginPath();
    g.ellipse(-s * 0.14, -s * 0.18, s * 0.08, s * 0.14, 0, 0, TAU);
    g.fillStyle = "rgba(255,255,255,0.6)";
    g.fill();
    return;
  }
  if (p.shape === "ball") {
    // 野球のボール: 白に赤い縫い目（回りながら飛ぶ）。
    g.rotate(p.rot);
    g.beginPath();
    g.arc(0, 0, s * 0.5, 0, TAU);
    g.fillStyle = "#FFFFFF";
    g.fill();
    outline(g, s, 0.08);
    g.beginPath();
    g.arc(-s * 0.62, 0, s * 0.42, -0.9, 0.9);
    g.moveTo(s * 0.62 - s * 0.42 * Math.cos(0.9), -s * 0.42 * Math.sin(0.9));
    g.arc(s * 0.62, 0, s * 0.42, Math.PI + 0.9, Math.PI - 0.9, true);
    g.strokeStyle = "#E03A3A";
    g.lineWidth = Math.max(1, s * 0.07);
    g.stroke();
    return;
  }
  if (p.shape === "fish") {
    // 小さな魚: 進む向きを向く（左へ進むときは裏返す）。
    const angle = Math.atan2(p.vy, p.vx);
    const left = Math.cos(angle) < 0;
    g.rotate(left ? angle + Math.PI : angle);
    if (left) g.scale(-1, 1);
    g.beginPath();
    g.moveTo(-s * 0.32, 0);
    g.lineTo(-s * 0.62, -s * 0.22);
    g.lineTo(-s * 0.62, s * 0.22);
    g.closePath();
    g.fillStyle = p.color;
    g.fill();
    outline(g, s);
    g.beginPath();
    g.ellipse(0, 0, s * 0.42, s * 0.26, 0, 0, TAU);
    g.fill();
    outline(g, s);
    g.beginPath();
    g.arc(s * 0.2, -s * 0.05, Math.max(1, s * 0.05), 0, TAU);
    g.fillStyle = "#1A1A1A";
    g.fill();
    return;
  }
  if (p.shape === "splat") {
    g.rotate(p.rot);
    pathSplat(g, s * 0.5);
    g.fill();
    outline(g, s);
    return;
  }
  if (p.shape === "note") {
    // 音符（8分音符）: 玉・棒・旗。回らずに少しだけ傾く。
    g.rotate(Math.sin(p.rot) * 0.35);
    g.beginPath();
    g.ellipse(-s * 0.14, s * 0.3, s * 0.22, s * 0.16, -0.4, 0, TAU);
    g.fill();
    outline(g, s);
    g.beginPath();
    g.rect(s * 0.03, -s * 0.48, Math.max(1.5, s * 0.08), s * 0.8);
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.07, -s * 0.48);
    g.quadraticCurveTo(s * 0.42, -s * 0.3, s * 0.36, -s * 0.02);
    g.quadraticCurveTo(s * 0.3, -s * 0.22, s * 0.07, -s * 0.24);
    g.closePath();
    g.fill();
  }
}

/** やわらかい光の絵（色ごとに1度だけ描いて使い回す）。 */
const glowSprites = new Map();
function glowSprite(color) {
  if (glowSprites.has(color)) return glowSprites.get(color);
  if (typeof document === "undefined") return null;
  const size = 128;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const sg = sprite.getContext("2d");
  if (!sg) return null;
  const gradient = sg.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  sg.fillStyle = gradient;
  sg.fillRect(0, 0, size, size);
  glowSprites.set(color, sprite);
  return sprite;
}

function drawParticle(g, p) {
  if (p.delay > 0) return;
  const alpha = alphaOf(p);
  if (alpha <= 0.01) return;
  g.globalAlpha = alpha;
  if (p.shape === "ring") {
    g.beginPath();
    g.arc(p.x, p.y, ringRadiusOf(p), 0, TAU);
    g.lineWidth = Math.max(1, p.width * (1 - p.age / p.life));
    g.strokeStyle = p.color;
    g.stroke();
    return;
  }
  if (p.shape === "glow") {
    const radius = sizeOf(p);
    const sprite = glowSprite(p.color);
    if (sprite) g.drawImage(sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
    return;
  }
  const s = sizeOf(p);
  if (s <= 0.2) return;
  g.fillStyle = p.color;
  if (p.shape === "streak") {
    // 火花: 速さの向きに尾を引く。
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const tail = Math.min(46, 6 + speed * 0.05);
    g.strokeStyle = p.color;
    g.lineCap = "round";
    g.lineWidth = Math.max(1, s * 0.35);
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x - (p.vx / speed) * tail, p.y - (p.vy / speed) * tail);
    g.stroke();
    return;
  }
  if (p.shape === "drop") {
    // しぶき: 進む向きに少しのびた丸。
    const angle = Math.atan2(p.vy, p.vx);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(angle);
    g.beginPath();
    g.ellipse(0, 0, s * 0.8, s * 0.5, 0, 0, TAU);
    g.fill();
    g.restore();
    return;
  }
  if (p.shape === "bubble") {
    g.beginPath();
    g.arc(p.x, p.y, s * 0.5, 0, TAU);
    g.lineWidth = Math.max(1.5, s * 0.14);
    g.strokeStyle = p.color;
    g.stroke();
    return;
  }
  if (p.shape === "dot") {
    g.beginPath();
    g.arc(p.x, p.y, s * 0.5, 0, TAU);
    g.fill();
    if (s >= OUTLINE_MIN_SIZE) {
      g.lineWidth = Math.max(1, s * 0.09);
      g.strokeStyle = OUTLINE;
      g.stroke();
    }
    return;
  }
  g.save();
  g.translate(p.x, p.y);
  if (THEME_SHAPES.has(p.shape)) {
    drawThemeShape(g, p, s);
    g.restore();
    return;
  }
  g.rotate(p.rot);
  if (p.shape === "confetti") {
    // 裏返りながら落ちる（縦をつぶすと裏返って見える）。裏は少し暗く。
    const flip = Math.cos(p.flip);
    g.scale(1, flip);
    g.fillRect(-s / 2, -s * 0.28, s, s * 0.56);
    if (s >= OUTLINE_MIN_SIZE) {
      g.lineWidth = Math.max(1, s * 0.07) / Math.max(0.2, Math.abs(flip));
      g.strokeStyle = OUTLINE;
      g.strokeRect(-s / 2, -s * 0.28, s, s * 0.56);
    }
    if (flip < 0) {
      g.globalAlpha = alpha * 0.25;
      g.fillStyle = "#1A1A1A";
      g.fillRect(-s / 2, -s * 0.28, s, s * 0.56);
    }
  } else {
    if (p.shape === "star") pathStar(g, s * 0.5);
    else if (p.shape === "heart") pathHeart(g, s * 0.5);
    else pathSparkle(g, s * 0.5);
    g.fill();
    if (s >= OUTLINE_MIN_SIZE) {
      g.lineWidth = Math.max(1.2, s * 0.07);
      g.lineJoin = "round";
      g.strokeStyle = OUTLINE;
      g.stroke();
    }
  }
  g.restore();
}

/**
 * @param {object} options
 * @param {() => string} options.getLevel いまの強さ（fxSafety の resolveFxLevel）
 * @param {Document} [options.doc]
 */
export function createFxEngine({ getLevel = () => "normal", getScale = () => fxScale(getLevel()), doc = typeof document !== "undefined" ? document : null } = {}) {
  let canvas = null;
  let g = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let particles = [];
  let rafId = null;
  let lastT = 0;
  let emitted = 0;
  // やわらかい光と花火をまとめて数える（どの1秒をとっても3回まで。fxSafety.js）。
  const brightLimiter = createBrightLimiter();

  function resize() {
    if (!canvas) return;
    const win = doc.defaultView;
    dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
    width = win.innerWidth;
    height = win.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }

  function ensureCanvas() {
    if (canvas || !doc) return Boolean(canvas);
    canvas = doc.createElement("canvas");
    canvas.className = "fx-layer";
    canvas.id = "fxLayer";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.active = "false";
    canvas.dataset.emitted = "0";
    doc.body.append(canvas);
    g = canvas.getContext("2d");
    resize();
    doc.defaultView.addEventListener("resize", resize);
    return Boolean(g);
  }

  function frame(t) {
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    particles = particles.filter((p) => stepParticle(p, dt));
    // 同じ演出の枠は1コマに1度だけ測る。弾む窓や巻き上がる魚にも枠を合わせ、
    // 粒を大きくしても、次の主役や文字の札へ描画が漏れないようにする。
    const regions = new Map();
    for (const p of particles) {
      if (!p.clip) { drawParticle(g, p); continue; }
      if (!regions.has(p.clip)) {
        const { element, scale = 1, exclude = [], follow = false, x, y } = p.clip;
        const rect = element.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        regions.set(p.clip, {
          left: cx - rect.width * scale / 2, top: cy - rect.height * scale / 2,
          width: rect.width * scale, height: rect.height * scale,
          dx: follow ? cx - x : 0, dy: follow ? cy - y : 0,
          excluded: exclude.map(el => el.getBoundingClientRect()),
        });
      }
      const region = regions.get(p.clip);
      g.save();
      g.beginPath();
      g.rect(region.left, region.top, region.width, region.height);
      g.clip();
      if (region.excluded.length) {
        g.beginPath();
        g.rect(region.left, region.top, region.width, region.height);
        // 札の縁にもかからない余白。偶奇規則で札の四角をくり抜く。
        for (const r of region.excluded) g.rect(r.left - 4, r.top - 4, r.width + 8, r.height + 8);
        g.clip("evenodd");
      }
      g.translate(region.dx, region.dy);
      drawParticle(g, p);
      g.restore();
    }
    g.globalAlpha = 1;
    if (particles.length) {
      rafId = doc.defaultView.requestAnimationFrame(safeFrame);
    } else {
      rafId = null;
      canvas.dataset.active = "false";
    }
  }

  function safeFrame(t) {
    if (!presentation.run("fx.frame", () => { frame(t); return true; }, false)) {
      particles = [];
      rafId = null;
      if (canvas) canvas.dataset.active = "false";
      presentation.run("fx.clear", () => g?.clearRect(0, 0, width, height));
    }
  }

  function start() {
    if (rafId !== null || !canvas) return;
    canvas.dataset.active = "true";
    lastT = doc.defaultView.performance.now();
    rafId = doc.defaultView.requestAnimationFrame(safeFrame);
  }

  function emit(list) {
    if (!list.length || !ensureCanvas()) return;
    particles.push(...list);
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    emitted += list.length;
    canvas.dataset.emitted = String(emitted);
    start();
  }

  function level() {
    return getLevel();
  }

  function scale() {
    return getScale();
  }

  /** 要素の真ん中（画面の座標）。要素が無ければ画面の真ん中。 */
  function pointOf(el, { dx = 0, dy = 0 } = {}) {
    const win = doc?.defaultView;
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return { x: (win?.innerWidth || 0) / 2 + dx, y: (win?.innerHeight || 0) / 2 + dy };
    }
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 + dx, y: rect.top + rect.height / 2 + dy, rect };
  }

  return {
    level,
    scale,
    pointOf,
    /** はじける粒（count は「ふつう」の数。強さの倍率はここで掛ける）。 */
    burst(options) {
      const s = scale();
      if (!s.particles) return;
      // 粒の大きさの倍率も段の表から（すっきり は小さく。src/lib/atmosphere.js）。
      const factor = s.particleSize ?? 1;
      const originalSize = options.size ?? [8, 16];
      const size = factor === 1
        ? options.size
        : Array.isArray(originalSize)
          ? originalSize.map((value) => value * factor)
          : originalSize * factor;
      emit(spawnBurst({ ...options, size, count: Math.round((options.count || 0) * s.particles) }));
    },
    /** 広がる輪。粒を出さない強さ（なし）では出さない。 */
    ring(options) {
      if (!scale().particles) return;
      emit([spawnRing(options)]);
    },
    /** やわらかい光。回数・明るさ・消える速さは安全の上限の中へ。 */
    glow({ x, y, radius = 140, color = "#FFFFFF", alpha = 0.4, lifeMs = 420, delay = 0, clip = null } = {}) {
      const s = scale();
      if (!s.glow || !brightLimiter.allowAt(doc.defaultView.performance.now() + Math.max(0, delay) * 1000)) return;
      const safe = clampGlow({ alpha: alpha * s.glow, lifeMs });
      emit([spawnGlow({ x, y, radius, color, alpha: safe.alpha, life: safe.lifeMs / 1000, delay, clip })]);
    },
    /** 上から降る紙吹雪（shapes で遊びの形を混ぜる）。 */
    confettiRain({ count = 110, colors, shapes } = {}) {
      const s = scale();
      if (s.finale !== "full") return;
      if (!ensureCanvas()) return;
      emit(spawnConfettiRain({ width, height, count: Math.round(count * s.particles), colors, ...(shapes ? { shapes } : {}) }));
    },
    /** 花火（「はで」だけ）。上がって、はじける。 */
    fireworks({ colors, bursts = 3 } = {}) {
      const s = scale();
      if (!s.fireworks || !ensureCanvas()) return;
      const t0 = doc.defaultView.performance.now();
      for (let i = 0; i < bursts; i += 1) {
        const x = width * (0.2 + 0.6 * ((i + 0.5) / bursts)) + (Math.random() - 0.5) * width * 0.1;
        const y = height * (0.18 + Math.random() * 0.2);
        const delay = MIN_FIREWORK_GAP_S * i;
        // 1発ごとに明るい出来事として数える。上限に当たった発は上げない。
        if (!brightLimiter.allowAt(t0 + delay * 1000)) continue;
        emit(
          spawnBurst({
            x,
            y,
            count: 36,
            speed: [260, 460],
            shapes: ["streak", "streak", "sparkle"],
            colors: [colors[i % colors.length], "#FFFFFF"],
            size: [6, 10],
            life: [0.8, 1.3],
            gravity: 320,
            drag: 1.6,
            delay,
          })
        );
        emit([spawnRing({ x, y, color: colors[i % colors.length], r0: 8, r1: 120, width: 5, life: 0.6, delay })]);
      }
    },
    /** いま粒が動いているか（テスト・確かめ用）。 */
    isActive: () => particles.length > 0,
    /** いまの粒の数（テスト・確かめ用）。 */
    count: () => particles.length,
    /** 全部消す（画面を離れるとき）。 */
    clear() {
      particles = [];
      if (canvas && g) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, canvas.width, canvas.height);
        canvas.dataset.active = "false";
      }
      if (rafId !== null) {
        doc.defaultView.cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}
