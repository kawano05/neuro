// =====================================================================
// fx/fxMotion.js — DOM の動き（弾む・つぶれる・揺れる・寄る・ハンコ）
//
// Web Animations API で、個別の変形プロパティ（scale / rotate / translate）を動かす。
// transform そのものを動かすと、要素にもともと付いている CSS の動き（ふうせんの
// ゆらゆら など）を上書きして、がくっと跳ねる。個別のプロパティは transform と
// 重ねて効くので、元の動きの上に弾みを足せる。
//
// 動きの時間と曲線（モーションの決まり。docs/overall-design-2026-09-28.md §3）:
//   手応え 120ms 以内に動き始める / ポン 240〜520ms / フィナーレ 〜1.6s
//   ease-pop: cubic-bezier(0.34, 1.56, 0.64, 1)（行き過ぎて戻る）
// =====================================================================

import { clampShake } from "./fxSafety.js";

export const MOTION = Object.freeze({
  easePop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
});

function animate(el, keyframes, options) {
  if (!el || typeof el.animate !== "function") return null;
  try {
    return el.animate(keyframes, { fill: "none", ...options });
  } catch {
    // 個別の変形プロパティを動かせない古い環境では、動きを足さない（絵はそのまま出る）。
    return null;
  }
}

/**
 * @param {() => {motion: boolean, shake: boolean, camera: boolean}} getScale いまの強さの係数
 */
export function createMotion(getScale) {
  const on = () => Boolean(getScale().motion);
  return {
    /** 押したものが、つぶれて弾む（① 手応え）。power は 1〜2.4（だんだん盛り上がる）。 */
    squash(el, { power = 1, delayMs = 0 } = {}) {
      if (!on()) return null;
      const p = Math.min(Math.max(power, 0.6), 2.4);
      const a = 0.1 * p;
      return animate(
        el,
        [
          { scale: "1 1" },
          { scale: `${1 + a} ${1 - a}`, offset: 0.12 },
          { scale: `${1 - a * 0.6} ${1 + a * 0.7}`, offset: 0.36 },
          { scale: `${1 + a * 0.25} ${1 - a * 0.2}`, offset: 0.62 },
          { scale: "1 1" },
        ],
        { duration: 420, delay: delayMs, easing: "linear" }
      );
    },
    /** ポンと出る（小さく回りながら出て、行き過ぎて戻る）。 */
    popIn(el, { delayMs = 0, from = 0.2 } = {}) {
      if (!on()) return null;
      return animate(
        el,
        [
          { scale: `${from}`, rotate: "-10deg", opacity: 0 },
          { scale: "1.16", rotate: "4deg", opacity: 1, offset: 0.55 },
          { scale: "0.96", rotate: "-1deg", offset: 0.8 },
          { scale: "1", rotate: "0deg", opacity: 1 },
        ],
        { duration: 520, delay: delayMs, easing: "ease-out", fill: "backwards" }
      );
    },
    /** びくっと揺れる（まわりのものが、はじけた音に驚く）。 */
    jiggle(el, { delayMs = 0, deg = 6 } = {}) {
      if (!on()) return null;
      return animate(
        el,
        [
          { rotate: "0deg" },
          { rotate: `${deg}deg`, offset: 0.2 },
          { rotate: `${-deg * 0.7}deg`, offset: 0.45 },
          { rotate: `${deg * 0.35}deg`, offset: 0.7 },
          { rotate: "0deg" },
        ],
        { duration: 460, delay: delayMs, easing: "ease-out" }
      );
    },
    /** 画面の揺れ（上限の中。強さ「ひかえめ」以下と「動きを減らす」では揺らさない）。 */
    shake(el, { px = 5, ms = 260 } = {}) {
      if (!getScale().shake) return null;
      const { amplitude, duration } = clampShake(px, ms);
      if (!amplitude || !duration) return null;
      const steps = 6;
      const frames = Array.from({ length: steps + 1 }, (_, i) => {
        const decay = 1 - i / steps;
        const dx = i === steps ? 0 : (i % 2 === 0 ? 1 : -1) * amplitude * decay;
        const dy = i === steps ? 0 : (i % 3 === 0 ? -1 : 1) * amplitude * 0.4 * decay;
        return { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px` };
      });
      return animate(el, frames, { duration, easing: "linear" });
    },
    /** カメラの寄り（舞台全体が少し寄って戻る）。 */
    punch(el, { amount = 0.03 } = {}) {
      if (!getScale().camera) return null;
      return animate(el, [{ scale: "1" }, { scale: `${1 + amount}`, offset: 0.35 }, { scale: "1" }], {
        duration: 240,
        easing: MOTION.easeOut,
      });
    },
    /** ハンコ（大きく出て、押しつけられて止まる）。 */
    stamp(el, { delayMs = 0 } = {}) {
      if (!on()) return null;
      return animate(
        el,
        [
          { scale: "2.3", rotate: "-9deg", opacity: 0 },
          { scale: "0.9", rotate: "-2deg", opacity: 1, offset: 0.55 },
          { scale: "1.05", rotate: "0deg", offset: 0.78 },
          { scale: "1", rotate: "0deg", opacity: 1 },
        ],
        { duration: 460, delay: delayMs, easing: "ease-out", fill: "backwards" }
      );
    },
    /** 飛び込む（星: 大きく回りながら来て、弾んで止まる）。 */
    slamIn(el, { delayMs = 0 } = {}) {
      if (!on()) return null;
      return animate(
        el,
        [
          { scale: "3", rotate: "-40deg", opacity: 0 },
          { scale: "0.82", rotate: "8deg", opacity: 1, offset: 0.5 },
          { scale: "1.12", rotate: "-3deg", offset: 0.75 },
          { scale: "1", rotate: "0deg", opacity: 1 },
        ],
        { duration: 440, delay: delayMs, easing: "ease-out", fill: "backwards" }
      );
    },
    /** ぴょんと跳ねる（フィナーレの主役）。 */
    hop(el, { delayMs = 0, height = 22 } = {}) {
      if (!on()) return null;
      return animate(
        el,
        [
          { translate: "0 0", scale: "1 1" },
          { translate: "0 0", scale: "1.1 0.88", offset: 0.14 },
          { translate: `0 -${height}px`, scale: "0.94 1.08", offset: 0.45 },
          { translate: "0 0", scale: "1.08 0.92", offset: 0.78 },
          { translate: "0 0", scale: "1 1" },
        ],
        { duration: 560, delay: delayMs, easing: "ease-in-out" }
      );
    },
    /** 小さく弾む（進みの点・数字）。 */
    bump(el, { delayMs = 0, amount = 0.35 } = {}) {
      if (!on()) return null;
      return animate(el, [{ scale: "1" }, { scale: `${1 + amount}`, offset: 0.35 }, { scale: "1" }], {
        duration: 320,
        delay: delayMs,
        easing: MOTION.easePop,
      });
    },
  };
}
