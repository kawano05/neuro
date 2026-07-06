// =====================================================================
// games/registry.js — ゲームタイル定義（content.js）と create 実装の結合表
//
// content.js の gameTiles は純粋データ（タイル表示用）のみを持つ
// （detailed-design.md §4.1）。ここで各ゲームの create(ctx) を結合し、
// GameModule（契約は detailed-design.md §3.1）の配列として提供する。
//
// color-legacy は継承（旧 views/switcher.js の「色変化」を
// games/colorLegacy.js へ移植）。rhythm-l1/rhythm-l2/gonogo/calibration は
// すべて games/rhythm.js の createRhythmGame(gameId)（パラメータ違いの同一
// エンジン、基本設計書 §5）で、gonogo/calibration は games/gonogo.js /
// games/calibration.js の薄いラッパ経由で結合する（P2-3・P4-1〜P4-3）。
// future-slot は enabled:false（content.js の gameTiles 参照）なので
// createPlaceholderGame() を割り当てる（「じゅんびちゅう」表示のみ。
// おわる/Esc は gameHost がゲーム本体に関わらずホスト側で処理するため、
// この段階でも安全に終了できる）。
// =====================================================================

import { gameTiles } from "../content.js";
import { createColorLegacyGame } from "./colorLegacy.js";
import { createRhythmGame } from "./rhythm.js";
import { createGonogoGame } from "./gonogo.js";
import { createCalibrationGame } from "./calibration.js";

/**
 * 未実装ゲーム用の暫定 create。
 * P1-2 で color-legacy 用の実装（games/colorLegacy.js）に置き換える。
 */
function createPlaceholderGame() {
  return {
    mount(stageEl) {
      stageEl.innerHTML = `
        <span class="reaction-label">じゅんびちゅう</span>
        <span class="reaction-detail">このあそびは じゅんびちゅうです。「おわる」で もどれます。</span>
      `;
    },
    handleInput() {
      // 未実装。何もしない（安全なノーオペレーション）。
    },
    destroy() {
      // 後片付けするタイマー・音は無い。
    },
  };
}

/** id → create のひも付け。ここに無い id は createPlaceholderGame にフォールバックする。 */
const creators = {
  "color-legacy": createColorLegacyGame,
  "rhythm-l1": createRhythmGame("rhythm-l1"),
  "rhythm-l2": createRhythmGame("rhythm-l2"),
  gonogo: createGonogoGame,
  calibration: createCalibrationGame,
};

/** タイル情報（content.js）と create を結合した GameModule 配列（order 昇順）。 */
export const gameModules = [...gameTiles]
  .sort((a, b) => a.order - b.order)
  .map((tile) => ({
    ...tile,
    create: creators[tile.id] || createPlaceholderGame,
  }));

/** id からゲームモジュールを探す（gameHost.launch() 用）。無ければ null。 */
export function findGameModule(id) {
  return gameModules.find((module) => module.id === id) || null;
}
