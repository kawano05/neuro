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
import { fxScale, resolveFxLevel } from "./fxSafety.js";

export { FX_LEVELS, DEFAULT_FX_LEVEL, resolveFxLevel } from "./fxSafety.js";

/**
 * @param {{getSettings: () => object, doc?: Document}} options
 */
export function createFxSystem({ getSettings, doc = typeof document !== "undefined" ? document : null }) {
  let measurement = false;
  const reducedMotionQuery = doc?.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const level = () =>
    resolveFxLevel(getSettings(), {
      reducedMotion: Boolean(reducedMotionQuery?.matches),
      measurement,
    });
  const engine = createFxEngine({ getLevel: level, doc });
  const motion = createMotion(() => fxScale(level()));
  const presets = createFxPresets({ engine, motion });
  return {
    ...presets,
    engine,
    motion,
    /** いま効いている強さ（"none" | "subtle" | "normal" | "big"）。session.config.fxLevel に残す。 */
    level,
    /** そくていの回の遊びを始める／終える（gameHost）。 */
    setMeasurement(value) {
      measurement = Boolean(value);
      if (measurement) engine.clear();
    },
    /** 画面を離れるとき、残っている粒を消す。 */
    clear: () => engine.clear(),
  };
}
