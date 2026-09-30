// =====================================================================
// fx/fxSafety.js — 演出の強さと、安全の上限（docs/overall-design-2026-09-28.md §4）
//
// 打ち合わせで「強すぎる音ばかりだと発作を起こす人もいる」と言われた
// （docs/design-renewal-2026-09-25.md §1.7）。光と動きも同じ扱いにする。
// 上限はここで持ち、演出エンジン（fxEngine.js）が必ず通す——遊びの側で
// 破れないようにするため。DOM に触れない純粋関数（テストで固定する）。
// =====================================================================

/** 演出の強さ（支援者の設定「見え方・音」）。 */
export const FX_LEVELS = Object.freeze(["none", "subtle", "normal", "big"]);
export const DEFAULT_FX_LEVEL = "normal";

/**
 * 強さごとの係数。
 *   particles … 粒の数の倍率（0 なら粒を出さない）
 *   shake     … 画面を揺らすか
 *   camera    … 舞台が寄って戻るか
 *   glow      … やわらかい光の強さ
 *   finale    … できたときのおいわい: "none" | "ring"（星の輪だけ）| "full"（紙吹雪の雨まで）
 *   fireworks … 花火を足すか（展示会向けの「はで」だけ）
 *   hitStopMs … 当たった瞬間に止める長さ
 *   motion    … DOM の弾み・つぶれ（押したものが弾む）を出すか
 */
export const FX_SCALE = Object.freeze({
  none: Object.freeze({ particles: 0, shake: false, camera: false, glow: 0, finale: "none", fireworks: false, hitStopMs: 0, motion: false }),
  subtle: Object.freeze({ particles: 0.4, shake: false, camera: false, glow: 0.5, finale: "ring", fireworks: false, hitStopMs: 40, motion: true }),
  normal: Object.freeze({ particles: 1, shake: true, camera: true, glow: 1, finale: "full", fireworks: false, hitStopMs: 80, motion: true }),
  big: Object.freeze({ particles: 1.5, shake: true, camera: true, glow: 1, finale: "full", fireworks: true, hitStopMs: 90, motion: true }),
});

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
 * いま使う強さ。
 * @param {object} settings state.settings（fxLevel）
 * @param {{reducedMotion?: boolean, measurement?: boolean}} [context]
 *   reducedMotion … 端末の「動きを減らす」。入っていれば「ひかえめ」より強くしない
 *   measurement   … そくていの回。何も足さない（docs/overall-design §5）
 */
export function resolveFxLevel(settings, { reducedMotion = false, measurement = false } = {}) {
  if (measurement) return "none";
  // 保存の sanitize は既定の normal に戻す。実行中の未知値は装飾を足さない。
  const chosen = FX_LEVELS.includes(settings?.fxLevel) ? settings.fxLevel : "none";
  if (reducedMotion && (chosen === "normal" || chosen === "big")) return "subtle";
  return chosen;
}

/** 実行時の係数（未知値は none。保存の既定値とは別）。 */
export function fxScale(level) {
  return FX_LEVELS.includes(level) ? FX_SCALE[level] : FX_SCALE.none;
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
