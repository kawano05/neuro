// =====================================================================
// settingsFields.js — 支援者の設定画面の並びと、画面の決まり（DOM に触れない）
//
// よく使う6項目だけを常設し、くわしい設定は目的別に畳む（docs/settings-simple-2026-09-30.md）。
// 項目の名前・範囲・値の形は settingDefinitions.js（遊びの中の設定と共有する表）から引く。
// ここで決めるのは、どのまとまりに置くか・DOM の id・いま変えられるか（とその理由）。
// 保存・既定値・そくていの解決は state.js / difficultyMode.js のまま。
// 見直しの記録: docs/settings-polish-2026-10-01.md。
// =====================================================================

import { isMeasurementMode } from "./difficultyMode.js";
import { SETTING_DEFINITIONS, describeSettingValue, effectiveSettingValue, protocolText } from "./settingDefinitions.js";

/**
 * いま変えられない理由の種類。
 *
 * 効かない操作子を黙って置かない（灰色にするだけでは、なぜ触れないのかが分からない）。
 * 理由は1つの関数（unavailableReason）で決め、行の中に字で出し、読み上げ（aria-describedby）
 * にも渡す。まとまりの注記だけに書くと、そのまとまりを閉じたまま使う人に届かない
 * （スイッチコントロール中の「枠が動く速さ」は、理由が閉じた「スイッチのくわしい設定」の中にあった）。
 */
const LOCKS = {
  // そくていの回は MEASUREMENT_PROTOCOL の値で遊ぶ。灰色のつまみには、れんしゅうの値が残って
  // いるので、実際に使う値を添える（例: つまみは 4.8秒でも、そくていでは 3.2秒）。
  measured: {
    active: (settings) => isMeasurementMode(settings),
    reason: (field) => `そくていの回は固定です（そくていでは ${protocolText(field.key)}）。`,
  },
  switchControl: {
    active: (settings) => settings?.switchControlMode === true,
    reason: () => "iPad のスイッチコントロールを使っているあいだは、アプリの枠を使いません。",
  },
  speech: {
    active: (settings) => settings?.speechEnabled === false,
    reason: () => "「声で読み上げる」がオフのあいだは使いません。",
  },
};

/** 項目ごとの「変えられないとき」。そくていで固定される項目には measured が自動で付く。 */
const FIELD_LOCKS = {
  scanInterval: ["switchControl"],
  autoScan: ["switchControl"],
  speechVolume: ["speech"],
  speechVoice: ["speech"],
};

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
  return Object.freeze({
    ...definition,
    key,
    id,
    group: group.id,
    locks: [...(definition.measured ? ["measured"] : []), ...(FIELD_LOCKS[key] || [])],
  });
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

function activeLocks(field, settings) {
  return field.locks.filter((kind) => LOCKS[kind].active(settings));
}

/** いま変えられない理由（行に出す文）。変えられるなら ""。 */
export function unavailableReason(field, settings) {
  const [kind] = activeLocks(field, settings);
  return kind ? LOCKS[kind].reason(field) : "";
}

/** 行の読み上げに渡す説明の id（名前の下の1文・選んだものの説明・注記・変えられない理由）。 */
export function describedByIds(field, settings) {
  return [
    `${field.id}Hint`,
    ...(field.description ? [`${field.id}Description`] : []),
    ...(field.key === "switchControlMode" && settings?.switchControlMode === true ? ["switchControlModeNotice"] : []),
    ...(unavailableReason(field, settings) ? [`${field.id}Reason`] : []),
  ].join(" ");
}
