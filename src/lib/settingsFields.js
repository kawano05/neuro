// =====================================================================
// settingsFields.js — 支援者の設定画面の並びと、画面の決まり（DOM に触れない）
//
// よく使う6項目だけを常設し、くわしい設定は目的別に畳む（docs/settings-simple-2026-09-30.md）。
// 項目の名前・範囲・値の形は settingDefinitions.js（遊びの中の設定と共有する表）から引く。
// ここで決めるのは、どのまとまりに置くかと DOM の id。
// 保存・既定値・そくていの解決は state.js / difficultyMode.js のまま。
// 見直しの記録: docs/settings-polish-2026-10-01.md。
// =====================================================================

import { SETTING_DEFINITIONS, describeSettingValue, effectiveSettingValue } from "./settingDefinitions.js";

/** 画面のまとまり。fields は保存キー（DOM の id が違うものだけ [キー, id]）。 */
const GROUPS = [
  {
    id: "common",
    title: "よく使う設定",
    fields: ["fxLevel", "speechEnabled", "soundEnabled", "scanInterval", "largeText", "hideVisualTasks"],
  },
  {
    id: "switch",
    title: "スイッチのくわしい設定",
    fields: ["switchControlMode", "autoScan", "scanFeedback", "showScreenSwitch"],
  },
  {
    id: "senses",
    title: "見え方・声のくわしい設定",
    fields: ["textMode", "highContrast", "speechVolume", "speechVoice"],
  },
  {
    id: "slot",
    title: "リールを止める",
    fields: ["slotCycleMs", "slotToleranceMs", "slotL1Rounds", "slotL2Rounds"],
  },
  {
    id: "rhythm",
    title: "高い音だけ",
    fields: ["rhythmBpm", ["targetBeats", "rhythmTargetBeats"], "visualGuidance"],
  },
  {
    id: "crane",
    title: "アームでつかむ",
    fields: ["craneSweepMs", "craneToleranceR", "craneTargetTrials", "craneAudioGuidance"],
  },
  {
    id: "fishing",
    title: "さかなつり",
    fields: ["fishingLimitMs"],
  },
  {
    id: "research",
    title: "研究（れんしゅう／そくてい）",
    fields: ["difficultyMode"],
  },
];

function buildField(entry, group) {
  const [key, id] = Array.isArray(entry) ? entry : [entry, entry];
  const definition = SETTING_DEFINITIONS[key];
  if (!definition) throw new Error(`settingsFields: ${key} は settingDefinitions.js に無い`);
  return Object.freeze({ ...definition, key, id, group: group.id });
}

export const SETTINGS_GROUPS = Object.freeze(
  GROUPS.map((group) =>
    Object.freeze({ ...group, fields: Object.freeze(group.fields.map((entry) => buildField(entry, group))) })
  )
);

export const SETTINGS_FIELDS = Object.freeze(SETTINGS_GROUPS.flatMap((group) => group.fields));

export function settingsGroup(id) {
  const group = SETTINGS_GROUPS.find((item) => item.id === id);
  if (!group) throw new Error(`settingsFields: まとまり ${id} は無い`);
  return group;
}

export function settingsField(key) {
  const field = SETTINGS_FIELDS.find((item) => item.key === key);
  if (!field) throw new Error(`settingsFields: 項目 ${key} は無い`);
  return field;
}

/** 入力に見せる値（null の範囲はプリセット、古い値は読み替えたもの）。 */
export function fieldValue(field, settings) {
  return effectiveSettingValue(field.key, settings);
}

/** 画面の数字と、スライダーの読み上げ（aria-valuetext）の文。同じものを使う。 */
export function formatFieldValue(field, value) {
  return describeSettingValue(field.key, value);
}

export function readFieldValue(field, control) {
  if (field.type === "checkbox") return control.checked;
  if (field.nullable) return control.value === "" ? null : Number(control.value);
  return field.type === "range" ? Number(control.value) : control.value;
}
