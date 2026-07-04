// =====================================================================
// games/registry.js — ゲームタイル定義（content.js）と create 実装の結合表
//
// content.js の gameTiles は純粋データ（タイル表示用）のみを持つ
// （detailed-design.md §4.1）。ここで各ゲームの create(ctx) を結合し、
// GameModule（契約は detailed-design.md §3.1）の配列として提供する。
//
// color-legacy は継承（旧 views/switcher.js の「色変化」を
// games/colorLegacy.js へ移植）。rhythm-l1/rhythm-l2/gonogo は
// games/rhythm.js の createRhythmGame(gameId)（パラメータ違いの同一エンジン、
// 基本設計書 §5）で結合する（P2-3・P4-1・P4-2、gonogo は games/gonogo.js の
// 薄いラッパ経由）。calibration は P4-3 でここに追加する。
// gameTiles の enabled は仕様（§4.1）どおり true のままにし、未実装ゲームには
// createPlaceholderGame() を暫定 create として割り当てる（画面を壊さず
// 「じゅんびちゅう」を表示するだけ。おわる/Esc は gameHost がゲーム本体に
// 関わらずホスト側で処理するため、この段階でも安全に終了できる）。実装が
// 入り次第、creators の対応エントリを追加するだけでよい。
// =====================================================================

import { gameTiles } from "../content.js";
import { createColorLegacyGame } from "./colorLegacy.js";
import { createRhythmGame } from "./rhythm.js";
import { createGonogoGame } from "./gonogo.js";

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
