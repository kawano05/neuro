// =====================================================================
// games/registry.js — ゲームタイル定義（content.js）と create 実装の結合表
//
// content.js の gameTiles は純粋データ（タイル表示用）のみを持つ
// （detailed-design.md §4.1）。ここで各ゲームの create(ctx) を結合し、
// GameModule（契約は detailed-design.md §3.1）の配列として提供する。
//
// rhythm-l1/l2・gonogo・calibration は P2〜P4 で実装する。color-legacy は
// 継承（旧 views/switcher.js の「色変化」を games/colorLegacy.js へ移植）。
// gameTiles の enabled は仕様（§4.1）どおり true のままにし、未実装ゲームには
// createPlaceholderGame() を暫定 create として割り当てる（画面を壊さず
// 「じゅんびちゅう」を表示するだけ。おわる/Esc は gameHost がゲーム本体に
// 関わらずホスト側で処理するため、この段階でも安全に終了できる）。
// 実装が入り次第、creators の対応エントリを追加するだけでよい。
// =====================================================================

import { gameTiles } from "../content.js";
import { createColorLegacyGame } from "./colorLegacy.js";

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
