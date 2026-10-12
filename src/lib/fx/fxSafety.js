// =====================================================================
// fx/fxSafety.js — 演出の係数と、安全の上限（docs/overall-design-2026-09-28.md §4）
//
// 打ち合わせで「強すぎる音ばかりだと発作を起こす人もいる」と言われた
// （docs/design-renewal-2026-09-25.md §1.7）。光と動きも同じ扱いにする。
// 上限はここで持ち、演出エンジン（fxEngine.js）が必ず通す——遊びの側で
// 破れないようにするため。DOM に触れない純粋関数（テストで固定する）。
//
// 段（遊びの雰囲気）ごとの中身は src/lib/atmosphere.js の表がただ1つの持ち主。
// ここはその表から、演出エンジンが使う係数だけを引き出す。
// =====================================================================

import { ATMOSPHERES, ATMOSPHERE_LEVELS } from "../atmosphere.js";

/** 段（支援者の設定「遊びの雰囲気」。保存の値 settings.fxLevel）。 */
export const FX_LEVELS = ATMOSPHERE_LEVELS;

/** 演出エンジンに渡すおいわいの種類（紙吹雪とパレードは、エンジンから見れば同じ「full」）。 */
const ENGINE_FINALE = { none: "none", ring: "ring", confetti: "full", parade: "full" };

/**
 * 段ごとの係数（atmosphere.js の表から作る）。
 *   particles / particleSize / shake / camera / glow / fireworks / hitStopMs … 表の effects
 *   finale … "none" | "ring"（星の輪だけ）| "full"（紙吹雪の雨まで）
 *   motion … DOM の弾み・つぶれ（押したものが弾む）を出すか（表の pressMotion）
 */
export const FX_SCALE = Object.freeze(
  Object.fromEntries(
    ATMOSPHERE_LEVELS.map((level) => {
      const row = ATMOSPHERES[level];
      return [level, Object.freeze({ ...row.effects, finale: ENGINE_FINALE[row.finale], motion: row.pressMotion })];
    })
  )
);

/** 同時に出す粒の上限（画面が埋まって何が起きたか分からなくならないように。重さの上限も兼ねる）。 */
export const MAX_PARTICLES = 320;
/** 揺れの上限（px・ms）。 */
export const MAX_SHAKE_PX = 6;
export const MAX_SHAKE_MS = 300;
/** やわらかい光は1秒に3回まで（WCAG 2.3.1 の「3回の点滅」）。1回は 250ms 以上かけて消す。 */
export const MAX_GLOWS_PER_SECOND = 3;
export const MIN_GLOW_FADE_MS = 250;
/** 光の明るさ（不透明度）の上限。面を白く光らせない。 */
export const MAX_GLOW_ALPHA = 0.55;

/**
 * いま使う段。
 * @param {object} settings state.settings（fxLevel）
 * @param {{measurement?: boolean}} [context]
 *   measurement … そくていの回。何も足さない（docs/overall-design §5）
 *
 * 端末の「動きを減らす」（prefers-reduced-motion）は見ない（2026-10-01、ユーザーの判断）。
 * 演出の量は支援者の設定「遊びの雰囲気」だけで決める。揺れや光が苦手な利用者には、支援者が
 * 「なし」か「すっきり」を選ぶ。以前は端末の設定で弱め（9/28）、さらに全部止めていた（9/30）。
 * Windows の「アニメーション効果」がオフの PC などでは、遊んでも何も起きないように見えた。
 */
export function resolveFxLevel(settings, { measurement = false } = {}) {
  if (measurement) return "none";
  // 保存の sanitize は既定の normal に戻す。実行中の未知値は装飾を足さない。
  return FX_LEVELS.includes(settings?.fxLevel) ? settings.fxLevel : "none";
}

/** 実行時の係数（未知値は none。保存の既定値とは別）。 */
export function fxScale(level) {
  return FX_LEVELS.includes(level) ? FX_SCALE[level] : FX_SCALE.none;
}

/**
 * 装飾の動きの唯一の判定。課題に必要な移動と、記録する強さとは分ける。
 *   motion      … 弾み・粒・ハンコなど、押したもの・おいわいの演出を出すか（表の pressMotion）
 *   worldMotion … 世界のゆっくりした動き（海の光・泡・雲。表の worldMotion）
 * そくていの回は、どちらも出さない（何も足さない）。
 */
export function resolveDecorationPolicy(settings, context = {}) {
  const level = resolveFxLevel(settings, context);
  const motion = !context.measurement && ATMOSPHERES[level].pressMotion;
  return {
    level,
    motion,
    worldMotion: motion && ATMOSPHERES[level].worldMotion,
    scale: fxScale(motion ? level : "none"),
  };
}

/**
 * だんだん盛り上がる係数（docs/overall-design §3.1）。回の番号 k（0 から）で
 * 1 + 0.35k。5回目（k=4）で 2.4 倍。上は 8 回目で止める。
 */
export function escalation(pressIndex) {
  const k = Number.isFinite(pressIndex) ? Math.min(Math.max(Math.floor(pressIndex), 0), 8) : 0;
  return 1 + 0.35 * k;
}

/** 揺れを上限の中へ。 */
export function clampShake(amplitudePx, durationMs) {
  const amplitude = Number.isFinite(amplitudePx) ? Math.min(Math.max(amplitudePx, 0), MAX_SHAKE_PX) : 0;
  const duration = Number.isFinite(durationMs) ? Math.min(Math.max(durationMs, 0), MAX_SHAKE_MS) : 0;
  return { amplitude, duration };
}

/**
 * やわらかい光の回数制限。直近1秒に3回出していたら、4回目は出さない。
 * @param {() => number} [now] ミリ秒の時計（テストで差し替える）
 */
export function createGlowLimiter(now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
  const recent = [];
  return {
    allow() {
      const at = now();
      while (recent.length && at - recent[0] >= 1000) recent.shift();
      if (recent.length >= MAX_GLOWS_PER_SECOND) return false;
      recent.push(at);
      return true;
    },
  };
}

/** 花火どうしの間（秒）。1発ごとに明るくはじけるので、1秒に3回に収まる間をあける。 */
export const MIN_FIREWORK_GAP_S = 0.4;

/**
 * 明るい出来事（やわらかい光・花火）をまとめて数える回数制限。どの1秒をとっても
 * MAX_GLOWS_PER_SECOND 回まで。花火のように少し先にはじけるものは、その時刻で予約する。
 * 以前は光だけを数えていて、フィナーレで光と花火4発（0.25秒おき）が重なると、
 * 1秒に5回の明るい出来事になっていた。
 * @param {() => number} [now] ミリ秒の時計（テストで差し替える）
 */
export function createBrightLimiter(now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())) {
  let events = [];
  return {
    /** atMs の時刻に1回足してよいか（よければ数える）。 */
    allowAt(atMs) {
      const t = now();
      events = events.filter((at) => at > t - 1000);
      const trial = [...events, atMs].sort((a, b) => a - b);
      for (let i = 0; i < trial.length; i += 1) {
        let inWindow = 0;
        for (let j = i; j < trial.length && trial[j] - trial[i] < 1000; j += 1) inWindow += 1;
        if (inWindow > MAX_GLOWS_PER_SECOND) return false;
      }
      events.push(atMs);
      return true;
    },
    /** いま1回足してよいか。 */
    allow() {
      return this.allowAt(now());
    },
  };
}

/** 光の設定を上限の中へ（明るさ・消える速さ）。 */
export function clampGlow({ alpha = 0.4, lifeMs = 400 } = {}) {
  return {
    alpha: Math.min(Math.max(Number.isFinite(alpha) ? alpha : 0, 0), MAX_GLOW_ALPHA),
    lifeMs: Math.max(Number.isFinite(lifeMs) ? lifeMs : MIN_GLOW_FADE_MS, MIN_GLOW_FADE_MS),
  };
}
