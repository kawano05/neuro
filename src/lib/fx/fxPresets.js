// =====================================================================
// fx/fxPresets.js — 名前つきの演出（ごほうびの文法。docs/overall-design-2026-09-28.md §3）
//
// 遊びの側は「何が起きたか」を名前で呼ぶだけ（ctx.fx.balloonPop(...) など）。
// 粒の数・速さ・色・揺れは、ここと fxSafety の強さの係数で決まる。
// だんだん盛り上がる（§3.1）: 回の番号 k で escalation(k) を掛け、色も増やす。
// =====================================================================

import { escalation } from "./fxSafety.js";

/** 色の組（カラーユニバーサルデザイン推奨配色と、はっきりした色の黄・白）。 */
export const PALETTES = Object.freeze({
  rainbow: Object.freeze(["#FF4B00", "#F6AA00", "#FFC83D", "#03AF7A", "#4DC4FF", "#005AFF", "#990099", "#FF8082"]),
  gold: Object.freeze(["#FFC83D", "#F6AA00", "#FFE9A8", "#FFFFFF"]),
  sea: Object.freeze(["#4DC4FF", "#1FA2E0", "#D8F3FF", "#FFFFFF"]),
  night: Object.freeze(["#FFC83D", "#FFFFFF"]),
  // おおさわぎ（games/partyStage.js）。黄色（走査の枠の色）を入れない。
  party: Object.freeze(["#FF8082", "#03AF7A", "#F6AA00", "#4DC4FF", "#D65DB1", "#FF4B00", "#FFFFFF"]),
});

/** 回ごとに色が増える: 1回目は黄と白、5回目は虹（§3.1）。 */
export function colorsForPress(k, base = PALETTES.night) {
  const extra = Math.max(0, Math.min(PALETTES.rainbow.length, Math.floor(k) * 2));
  return [...base, ...PALETTES.rainbow.slice(0, extra)];
}

/** 要素のまとまり（複数の要素）を囲む四角の真ん中。 */
function centerOfAll(elements, fallback) {
  const rects = [...elements].map((el) => el.getBoundingClientRect()).filter((r) => r.width || r.height);
  if (!rects.length) return fallback;
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
}

/**
 * @param {{engine: object, motion: object}} parts fxEngine と fxMotion
 */
export function createFxPresets({ engine, motion }) {
  return {
    /** 当たった瞬間に止める長さ（ms、強さで変わる。§3.2）。 */
    hitStopMs: () => engine.scale().hitStopMs,

    /** ① 手応え: 押したものの真ん中から輪が広がり、押したものが弾む。 */
    pressRing(el, { color = "#FFFFFF", k = 0 } = {}) {
      const { x, y } = engine.pointOf(el);
      engine.ring({ x, y, color, r0: 14, r1: 70 + 12 * k, width: 6, life: 0.42 });
      motion.squash(el, { power: escalation(k) * 0.8 });
    },

    /** おすと でてくる: 動物がポンと出た（② 起きたこと）。 */
    popAppear(figureEl, { k = 0 } = {}) {
      if (!figureEl) return;
      const art = figureEl.querySelector("svg") || figureEl;
      const { x, y } = engine.pointOf(art);
      const e = escalation(k);
      engine.ring({ x, y, color: "#FFFFFF", r0: 24, r1: 110 + 26 * k, width: 7, life: 0.5 });
      if (k >= 2) engine.ring({ x, y, color: "#FFC83D", r0: 16, r1: 150 + 24 * k, width: 4, life: 0.66, delay: 0.08 });
      engine.burst({
        x,
        y,
        count: 18 * e,
        speed: [340 * Math.sqrt(e), 780 * Math.sqrt(e)],
        shapes: ["sparkle", "sparkle", "star", "star", "dot"],
        colors: colorsForPress(k),
        size: [18, 34],
        life: [0.8, 1.4],
        gravity: 170,
        drag: 2.6,
        twinkle: 0.18,
      });
      engine.glow({ x, y, radius: 170 + 30 * k, alpha: 0.26 + 0.04 * k, lifeMs: 460 });
      // 着地でつぶれて弾む（CSS の hk-pop が大きくしたあと）。
      motion.squash(art, { power: e * 0.7, delayMs: 240 });
    },

    /** ふうせん わり: ふうせんが割れた。まわりのふうせんが、びくっとする。 */
    balloonPop(balloonEl, { k = 0, color = "#FFC83D", neighbors = [] } = {}) {
      if (!balloonEl) return;
      const art = balloonEl.querySelector(".balloon-svg") || balloonEl;
      const rect = art.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height * 0.36;
      const e = escalation(k);
      engine.ring({ x, y, color: "#FFFFFF", r0: 10, r1: 70 + 18 * k, width: 6, life: 0.4 });
      engine.burst({
        x,
        y,
        count: 26 * e,
        speed: [320 * Math.sqrt(e), 760 * Math.sqrt(e)],
        shapes: ["confetti", "confetti", "confetti", "dot", "star"],
        colors: [color, color, "#FFFFFF", ...colorsForPress(k).slice(2)],
        size: [16, 28],
        life: [0.9, 1.5],
        gravity: 520,
        drag: 2.1,
      });
      engine.glow({ x, y, radius: 120 + 20 * k, color: "#FFFFFF", alpha: 0.3, lifeMs: 380 });
      neighbors.forEach((neighbor, index) => motion.jiggle(neighbor, { delayMs: 30 + index * 35, deg: 4 + k }));
    },

    /** ぬりえ: 色がついた場所からしぶきが飛ぶ。 */
    paintSplash(cardEl, { k = 0, color = "#FFC83D", parts = [] } = {}) {
      if (!cardEl) return;
      const fallback = engine.pointOf(cardEl);
      const { x, y } = centerOfAll(parts, fallback);
      const e = escalation(k);
      engine.burst({
        x,
        y,
        count: 22 * e,
        speed: [300, 700 * Math.sqrt(e)],
        shapes: ["drop", "drop", "dot"],
        colors: [color, color, "#FFFFFF"],
        size: [14, 26],
        life: [0.6, 1.05],
        gravity: 820,
        drag: 1.2,
      });
      engine.burst({ x, y, count: 8 * e, speed: [260, 560], shapes: ["sparkle", "star"], colors: colorsForPress(k), size: [18, 30], life: [0.7, 1.2], gravity: 90, twinkle: 0.22 });
      engine.ring({ x, y, color, r0: 10, r1: 90 + 16 * k, width: 6, life: 0.46 });
      motion.squash(cardEl, { power: 0.45 + 0.1 * k });
    },

    /**
     * ボールを打つ: 当たった瞬間の火花。ホームランは、止まって・揺れて・寄って・花火。
     * @param {{x:number,y:number}} point 当たった場所（画面の座標）
     */
    batHit(point, { quality = "hit", stageEl = null } = {}) {
      const { x, y } = point;
      const homerun = quality === "homerun";
      const count = homerun ? 30 : quality === "hit" ? 18 : 8;
      engine.ring({ x, y, color: "#FFFFFF", r0: 8, r1: homerun ? 130 : 80, width: homerun ? 8 : 5, life: 0.4 });
      engine.burst({
        x,
        y,
        count,
        speed: homerun ? [520, 1100] : [380, 760],
        shapes: ["streak", "streak", "sparkle"],
        colors: homerun ? PALETTES.gold : ["#FFFFFF", "#FFE9A8"],
        size: [12, 20],
        life: [0.4, 0.8],
        gravity: 500,
        drag: 2.4,
      });
      if (!homerun) return;
      engine.glow({ x, y, radius: 220, color: "#FFF4C2", alpha: 0.4, lifeMs: 520 });
      if (stageEl) {
        motion.shake(stageEl, { px: 5, ms: 260 });
        motion.punch(stageEl, { amount: 0.035 });
      }
    },

    /** ホームランの打球が消えた先（空）で、星と花火。 */
    homerunSky({ point = null, stageEl = null } = {}) {
      const p = point || engine.pointOf(stageEl, { dy: -80 });
      engine.burst({
        x: p.x,
        y: p.y,
        count: 32,
        speed: [420, 900],
        shapes: ["star", "sparkle"],
        colors: [...PALETTES.gold, ...PALETTES.rainbow.slice(3, 6)],
        size: [20, 36],
        life: [0.8, 1.3],
        gravity: 260,
        drag: 2,
        twinkle: 0.2,
      });
      engine.fireworks({ colors: PALETTES.rainbow, bursts: 3 });
    },

    /** 飛んでいる球の光の尾（1コマに1〜2粒。すぐ消える）。 */
    trail(point, { gold = false } = {}) {
      engine.burst({
        x: point.x,
        y: point.y,
        count: gold ? 2 : 1,
        speed: [10, 60],
        shapes: gold ? ["sparkle", "dot"] : ["dot"],
        colors: gold ? PALETTES.gold : ["#FFFFFF"],
        size: gold ? [6, 12] : [4, 7],
        life: [0.25, 0.45],
        gravity: 0,
        drag: 3,
      });
    },

    /** リール（れんしゅう）: 次のリールを隠さず、止めた窓の中だけで祝う。 */
    reelHit(reelEl, { streak = 1 } = {}) {
      if (!reelEl) return;
      const windowEl = reelEl.querySelector(".slot-reel-window") || reelEl;
      const { x, y, rect } = engine.pointOf(windowEl);
      const short = Math.min(rect.width, rect.height);
      if (!short) return;
      const e = escalation(Math.min(Math.max(0, streak - 1), 4));
      const clip = { element: windowEl };
      // 3コマの窓では中央の1コマを囲む。星は窓全体を使い、四角の端で切る。
      const cell = Math.min(rect.width, rect.height / 3);
      engine.ring({ x, y, color: "#FFFFFF", r0: cell * 0.3, r1: cell * (0.55 + 0.04 * (e - 1)), width: Math.max(3, cell * 0.055), life: 0.65, clip });
      engine.burst({
        x, y, clip,
        count: 20 * e,
        speed: [short * 1.2, short * 2.5],
        // 細長い窓でも、中央のコマだけでなく上下まで星が広がる。
        velocityScale: [1, Math.max(1, rect.height / rect.width * 0.75)],
        shapes: ["star", "star", "sparkle"],
        colors: ["#F6AA00", "#FFFFFF", "#D8F3FF", "#FF8082"],
        size: [short * 0.18, short * 0.3],
        life: [0.75, 0.95],
        gravity: 0,
        drag: 2.8,
        twinkle: 0.15,
      });
      engine.glow({ x, y, radius: short * 0.48, color: "#FFFFFF", alpha: 0.18, lifeMs: 420, clip });
      motion.punch(reelEl, { amount: 0.06 });
    },

    /** アーム（れんしゅう）: つかんだ瞬間のきらきら。 */
    craneGrip(prizeEl) {
      if (!prizeEl) return;
      const { x, y } = engine.pointOf(prizeEl);
      engine.ring({ x, y, color: "#FFC83D", r0: 12, r1: 90, width: 6, life: 0.42 });
      engine.burst({ x, y, count: 16, shapes: ["sparkle", "star"], colors: PALETTES.gold, size: [10, 18], gravity: 120, twinkle: 0.25 });
    },

    /** アーム（れんしゅう）: 景品が受け口に落ちた。 */
    craneWin(trayEl) {
      if (!trayEl) return;
      const { x, y } = engine.pointOf(trayEl);
      engine.burst({
        x,
        y,
        count: 26,
        speed: [320, 680],
        angle: -Math.PI / 2,
        spread: Math.PI * 0.9,
        shapes: ["confetti", "confetti", "star"],
        colors: PALETTES.rainbow,
        size: [9, 15],
        life: [0.9, 1.4],
        gravity: 560,
        drag: 1.8,
      });
      motion.bump(trayEl, { amount: 0.12 });
    },

    /** さかなつり（れんしゅう）: 魚に付いて巻き上がるしぶき。長さの札は避ける。 */
    fishCatch(fishEl, { lengthCm = 20 } = {}) {
      if (!fishEl) return;
      const { x, y, rect } = engine.pointOf(fishEl);
      const short = Math.min(rect.width, rect.height);
      if (!short) return;
      const power = Math.min(1.4, 0.8 + lengthCm / 80);
      const scene = fishEl.closest?.(".fishing-scene");
      const exclude = [...(scene?.querySelectorAll(".fishing-catch, .fishing-status") || [])];
      engine.burst({
        x,
        y,
        // 魚が縮んで舟へ移っても、魚の1.5倍の枠と文字の除外を毎コマ保つ。
        clip: { element: fishEl, scale: 1.5, follow: true, x, y, exclude },
        count: 10,
        // 顔の中心を覆う塊ではなく、魚の輪郭のまわりから水が散る。
        originRadius: [rect.width * 0.3, rect.height * 0.3],
        speed: [short * 0.2, short * 0.5 * power],
        angle: -Math.PI / 2,
        spread: Math.PI * 1.6,
        shapes: ["drop", "drop", "bubble"],
        colors: PALETTES.sea,
        size: [short * 0.12, short * 0.22],
        life: [0.7, 0.9],
        gravity: short * 1.4,
        drag: 2.6,
      });
    },

    /** 高い音だけ（れんしゅう）: 合った音符がはじける。 */
    noteHit(el, { color = "#FFC83D" } = {}) {
      if (!el) return;
      const { x, y } = engine.pointOf(el);
      engine.ring({ x, y, color, r0: 12, r1: 80, width: 6, life: 0.4 });
      engine.burst({ x, y, count: 12, shapes: ["sparkle", "dot"], colors: [color, "#FFFFFF"], size: [8, 14], gravity: 100 });
    },

    /**
     * おおさわぎ: 押したら動物がポンと出る（popAppear の代わり）。輪を2つ、ハートと星。
     * 回を追うごとに大きく、色が増える。黄色は使わない。
     */
    partyPress(figureEl, { k = 0 } = {}) {
      if (!figureEl) return;
      const art = figureEl.querySelector("svg") || figureEl;
      const { x, y } = engine.pointOf(art);
      const e = escalation(k);
      const colors = ["#FFFFFF", "#D8F6FF", ...PALETTES.party.slice(0, Math.min(PALETTES.party.length, 2 + k * 2))];
      engine.ring({ x, y, color: "#FFFFFF", r0: 24, r1: 120 + 28 * k, width: 8, life: 0.5 });
      engine.ring({ x, y, color: "#D8F6FF", r0: 16, r1: 160 + 26 * k, width: 5, life: 0.6, delay: 0.06 });
      engine.burst({
        x,
        y,
        count: 22 * e,
        speed: [340 * Math.sqrt(e), 800 * Math.sqrt(e)],
        shapes: ["sparkle", "star", "star", "heart", "heart"],
        colors,
        size: [18, 34],
        life: [0.8, 1.4],
        gravity: 170,
        drag: 2.6,
        twinkle: 0.18,
      });
      engine.glow({ x, y, radius: 180 + 30 * k, alpha: 0.28 + 0.04 * k, lifeMs: 460 });
      motion.squash(art, { power: e * 0.7, delayMs: 240 });
    },

    /** おおさわぎ: キラキラびんが「はんぶん」「いっぱい」になった（びんの下ではじける）。 */
    partyCheer(jarEl) {
      if (!jarEl) return;
      const { x, y, rect } = engine.pointOf(jarEl);
      engine.burst({
        x,
        y: y + (rect ? rect.height / 2 : 0),
        count: 24,
        speed: [260, 620],
        angle: Math.PI / 2,
        spread: Math.PI * 1.2,
        shapes: ["star", "heart", "sparkle"],
        colors: PALETTES.party,
        size: [14, 26],
        life: [0.7, 1.2],
        gravity: 320,
        drag: 2.2,
      });
    },

    /** おおさわぎ: 5回目、びんのふたが飛んで星があふれる。 */
    partyOverflow(jarEl) {
      if (!jarEl) return;
      const { x, y, rect } = engine.pointOf(jarEl);
      engine.burst({
        x,
        y: y - (rect ? rect.height * 0.35 : 0),
        count: 46,
        speed: [420, 900],
        angle: -Math.PI / 2,
        spread: Math.PI * 0.9,
        shapes: ["star", "star", "heart", "sparkle"],
        colors: PALETTES.party,
        size: [16, 30],
        life: [1, 1.7],
        gravity: 520,
        drag: 1.6,
      });
    },

    /** おおさわぎ: 5回目のお祝い（紙吹雪の雨と花火。花火の回数は光の上限の中）。 */
    partyFinale() {
      engine.confettiRain({ count: 140, colors: PALETTES.party });
      engine.fireworks({ colors: PALETTES.party, bursts: 4 });
    },

    /** おおさわぎ: けっかで、ラッコが服をもらった。 */
    partyReward(otterEl) {
      if (!otterEl) return;
      const { x, y, rect } = engine.pointOf(otterEl);
      engine.burst({
        x,
        y: y - (rect ? rect.height * 0.25 : 0),
        count: 30,
        speed: [260, 640],
        shapes: ["star", "heart", "sparkle"],
        colors: PALETTES.party,
        size: [14, 26],
        life: [0.8, 1.3],
        gravity: 300,
        drag: 2.2,
      });
    },

    /**
     * ⑤ フィナーレ（5回目・できたとき）。星の大きな輪、紙吹雪の雨、主役が跳ねる。
     * 強さ「ひかえめ」は星の輪だけ、「なし」は何もしない（fxSafety の finale）。
     */
    finale(stageEl, { hero = null, palette = PALETTES.rainbow } = {}) {
      const s = engine.scale();
      if (s.finale === "none") return;
      const { x, y } = engine.pointOf(hero?.querySelector?.("svg") || hero || stageEl);
      if (s.finale === "ring") {
        engine.ring({x,y,color:"#D8F3FF",r0:20,r1:100,width:4,life:0.5});
        engine.burst({x,y,count:12,speed:[100,180],shapes:["star"],colors:PALETTES.sea,size:[10,16],life:[0.4,0.6],gravity:0});
        return;
      }
      engine.ring({ x, y, color: "#FFFFFF", r0: 30, r1: 260, width: 10, life: 0.7 });
      engine.ring({ x, y, color: "#FFC83D", r0: 20, r1: 340, width: 6, life: 0.9, delay: 0.1 });
      engine.burst({
        x,
        y,
        count: 40,
        speed: [620, 1150],
        shapes: ["star", "star", "sparkle"],
        colors: [...PALETTES.gold, ...palette],
        size: [26, 46],
        life: [1, 1.7],
        gravity: 260,
        drag: 2,
        twinkle: 0.2,
      });
      engine.glow({ x, y, radius: 300, color: "#FFFFFF", alpha: 0.32, lifeMs: 720 });
      if (s.finale === "full") engine.confettiRain({ count: 120, colors: palette });
      engine.fireworks({ colors: palette, bursts: 4 });
      if (stageEl) motion.punch(stageEl, { amount: 0.03 });
      if (hero) motion.hop(hero, { delayMs: 100 });
    },

    /**
     * ⑥ けっかで星が飛び込む。星ごとに上がっていく音、最後に一言がハンコのように。
     * @param {Element} container 結果の面（#resultStats）
     * @param {{playStar?: (index:number, delayS:number) => void}} [sound]
     * @returns {number} 見せ終わるまでの時間（ms）
     */
    revealResult(container, { playStar = null } = {}) {
      if (!container) return 0;
      if (engine.scale().finale === "none") return 0;
      const stars = [...container.querySelectorAll(".hk-star, .hk-result-medal")];
      const lit = stars.filter((star) => !star.classList.contains("is-off"));
      const items = [...container.querySelectorAll(".hk-result-item, .hk-result-picture")];
      const title = container.querySelector(".hk-result-title");
      const STEP = 230;
      stars.forEach((star, index) => {
        const delayMs = 120 + index * STEP;
        if (engine.scale().finale === "ring") motion.popIn(star, {delayMs, from:0.8});
        else motion.slamIn(star, { delayMs });
        if (!star.classList.contains("is-off")) {
          playStar?.(index, (delayMs + 220) / 1000);
          window.setTimeout(() => {
            if (!star.isConnected) return;
            const { x, y } = engine.pointOf(star);
            engine.burst({ x, y, count: 14, speed: [260, 620], shapes: ["sparkle", "star"], colors: PALETTES.gold, size: [16, 28], life: [0.6, 1.1], gravity: 160, twinkle: 0.2 });
            engine.ring({ x, y, color: "#FFC83D", r0: 10, r1: 70, width: 5, life: 0.4 });
          }, delayMs + 220);
        }
      });
      const itemsStart = 120 + stars.length * STEP;
      items.forEach((item, index) => motion.popIn(item, { delayMs: itemsStart + index * 110 }));
      const titleAt = itemsStart + items.length * 110 + 80;
      if (title) motion.stamp(title, { delayMs: titleAt });
      // 星が2つ以上（または点の無い遊びの「できた」）なら、小さな紙吹雪も。
      if (engine.scale().finale === "full" && (lit.length >= 2 || container.querySelector(".completion-result"))) {
        window.setTimeout(() => {
          if (!container.isConnected) return;
          const p = engine.pointOf(title || container);
          engine.burst({
            x: p.x,
            y: p.y,
            count: 44,
            speed: [460, 900],
            angle: -Math.PI / 2,
            spread: Math.PI * 1.1,
            shapes: ["confetti", "confetti", "star"],
            colors: PALETTES.rainbow,
            size: [15, 26],
            life: [1, 1.6],
            gravity: 520,
            drag: 1.7,
          });
        }, titleAt + 200);
      }
      return titleAt + 500;
    },
  };
}
