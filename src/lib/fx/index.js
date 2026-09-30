// =====================================================================
// fx/index.js — 演出のまとめ役（neuronodeApp.js が1つ作って ctx.fx に置く）
//
// docs/overall-design-2026-09-28.md §5・§6。強さは毎回その場で決める:
//   - 支援者の設定（settings.fxLevel）
//   - 端末の「動きを減らす」（prefers-reduced-motion）→ ひかえめより強くしない
//   - そくていの回の遊び → 何も足さない（gameHost が setMeasurement で知らせる）
// =====================================================================

import { createFxEngine } from "./fxEngine.js";
import { createMotion } from "./fxMotion.js";
import { createFxPresets } from "./fxPresets.js";
import { resolveDecorationPolicy } from "./fxSafety.js";

export { FX_LEVELS, DEFAULT_FX_LEVEL, resolveFxLevel } from "./fxSafety.js";

/**
 * @param {{getSettings: () => object, doc?: Document}} options
 */
export function createFxSystem({ getSettings, doc = typeof document !== "undefined" ? document : null }) {
  let measurement = false;
  const reducedMotionQuery = doc?.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const policy = () =>
    resolveDecorationPolicy(getSettings(), {
      reducedMotion: Boolean(reducedMotionQuery?.matches),
      measurement,
    });
  const level = () => policy().level;
  const engine = createFxEngine({ getLevel: level, getScale: () => policy().scale, doc });
  const motion = createMotion(() => policy().scale);
  const presets = createFxPresets({ engine, motion });
  const syncPolicy = () => {
    const current = policy();
    if (doc?.body) {
      doc.body.dataset.decorationMotion = current.motion ? "on" : "off";
      doc.body.dataset.worldMotion = current.worldMotion ? "on" : "off";
    }
    if (!current.motion) {
      engine.clear();
      for (const root of doc?.querySelectorAll?.(".module-pop, .module-balloon, .module-coloring, .module-baseball, .party-layer, #resultStats") || []) {
        root.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel());
      }
    }
    return current;
  };
  reducedMotionQuery?.addEventListener?.("change", syncPolicy);
  syncPolicy();
  return {
    ...presets,
    engine,
    motion,
    /** いま効いている強さ（"none" | "subtle" | "normal" | "big"）。session.config.fxLevel に残す。 */
    level,
    policy,
    syncPolicy,
    /** そくていの回の遊びを始める／終える（gameHost）。 */
    setMeasurement(value) {
      measurement = Boolean(value);
      if (measurement) engine.clear();
      syncPolicy();
    },
    /** 画面を離れるとき、残っている粒を消す。 */
    clear: () => engine.clear(),
  };
}
