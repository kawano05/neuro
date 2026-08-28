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
// crane/fishing は専用エンジンへ結合する。gameTiles の全IDに実装が必須で、
// data-integrity.test.mjs が未結線を検出する。
// =====================================================================

import { gameTiles } from "../content.js";
import { createColorLegacyGame } from "./colorLegacy.js";
import { createRhythmGame } from "./rhythm.js";
import { createSlotGame } from "./slot.js";
import { createGonogoGame } from "./gonogo.js";
import { createCalibrationGame } from "./calibration.js";
import { createCraneGame } from "./crane.js";
import { createFishingGame } from "./fishing.js";

/** id → create のひも付け。gameTiles の全idに実装を持たせる。 */
export const gameCreators = {
  "color-legacy": createColorLegacyGame,
  // 旧リズムcreatorは保存・互換確認用に残すが、gameTilesからは外して利用者導線に出さない。
  "rhythm-l1": createRhythmGame("rhythm-l1"),
  "rhythm-l2": createRhythmGame("rhythm-l2"),
  "slot-l1": createSlotGame("slot-l1"),
  "slot-l2": createSlotGame("slot-l2"),
  gonogo: createGonogoGame,
  crane: createCraneGame,
  fishing: createFishingGame("fishing"),
  "fishing-gonogo": createFishingGame("fishing-gonogo"),
  calibration: createCalibrationGame,
};

/** タイル情報（content.js）と create を結合した GameModule 配列（order 昇順）。 */
export const gameModules = [...gameTiles]
  .sort((a, b) => a.order - b.order)
  .map((tile) => ({
    ...tile,
    create: gameCreators[tile.id],
  }));

/** id からゲームモジュールを探す（gameHost.launch() 用）。無ければ null。 */
export function findGameModule(id) {
  return gameModules.find((module) => module.id === id) || null;
}
