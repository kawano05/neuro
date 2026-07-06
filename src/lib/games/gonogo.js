// =====================================================================
// games/gonogo.js — Go・No-Go 課題（detailed-design.md §1 のファイル一覧）
//
// 判定エンジン（commission/correctRejection の分岐、実効判定窓のクランプ、
// Go/No-Go 乱数列の生成）はすべて games/rhythm.js（buildGonogoPlan）と
// games/judge.js（generateGoNoGoSequence・judgeInput・sweepExpired）に
// mode 非依存の形で実装済みで、gonogo 固有のパラメータ（bpm・countInBeats・
// targetBeats・goRatio）は content.js の rhythmPresets.gonogo が持つ（P0-1）。
//
// よってこのファイルは createRhythmGame("gonogo") をそのまま re-export する
// 薄いラッパに留める。詳細設計書 §1 のディレクトリ一覧が games/gonogo.js を
// 独立ファイルとして要求しているため、rhythm.js に隠さずここに置いている
// （実装（P4-2 タスク説明）の指示どおり）。
// =====================================================================

import { createRhythmGame } from "./rhythm.js";

export const createGonogoGame = createRhythmGame("gonogo");
