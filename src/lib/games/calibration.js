// =====================================================================
// games/calibration.js — キャリブレーション（detailed-design.md §8）
//
// continuous モード（rhythm-l2 と同じ判定エンジン）を bpm50/countIn4/target24 で
// 走らせるだけの課題であり、games/rhythm.js の createRhythmGame("calibration")
// がそのまま契約を満たす。
//
// cued ではなく continuous である理由は content.js の rhythmPresets に書いた
// （要約: cued は試行ごとに位相修正の連鎖が切れるので、予測押しと反応押しが
// 同じ分布に混ざり、中央値が baselineOffsetMs の推定量でなくなる）。
//
// calibration 固有の2点は、gameId 分岐をエンジン側に持ち込まずデータ駆動で
// 実装した:
//
//   - 最初の4拍の除外（detailed-design.md §8.2 手順2）:
//     content.js の rhythmPresets.calibration.excludedTrialCount = 4 を
//     games/rhythm.js の resolveParams()/isExcludedTrial() が読む。
//     達成率・平均オフセット等の集計（computeSummary）も excluded を
//     除外して計算するため、リザルト画面の数字は最初から「有効試行のみ」になる。
//   - 候補値（有効試行 hit の生オフセットの中央値、detailed-design.md §8.2
//     手順3）は summary.medianRawOffsetMs としてそのまま利用できる
//     （rhythm.js の computeSummary が既に算出している）。
//   - 「候補値 XXXms を設定に保存しますか」の支援者導線（手順4）は
//     games/gameHost.js が activeGameId === "calibration" のときだけ
//     リザルト画面に出し、保存操作（走査対象外・タップ専用ボタン）で
//     settings.baselineOffsetMs を更新する。ゲーム本体（このファイル）は
//     保存導線を一切知らない（UI 配線はホスト側の責務、detailed-design.md §3）。
//
// よってこのファイルも games/gonogo.js と同じ薄いラッパに留める。
// =====================================================================

import { createRhythmGame } from "./rhythm.js";

export const createCalibrationGame = createRhythmGame("calibration");
