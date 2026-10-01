// =====================================================================
// settingsFields.js — 支援者の設定画面の並びと、画面の決まり（DOM に触れない）
//
// よく使う6項目だけを常設し、くわしい設定は目的別に畳む（docs/rules/supporter-settings.md）。
// 項目の名前・範囲・値の形は settingDefinitions.js（遊びの中の設定と共有する表）から引く。
// ここで決めるのは、どのまとまりに置くか・DOM の id・いま変えられるか（とその理由）・
// 既定に戻すときに何を戻すか。
// 保存・既定値・そくていの解決は state.js / difficultyMode.js のまま。
// 見直しの記録: docs/reports/2026-10-01/settings-polish.md。
// =====================================================================

import { isMeasurementMode } from "./difficultyMode.js";
import { SETTING_DEFINITIONS, describeSettingValue, effectiveSettingValue, protocolText } from "./settingDefinitions.js";
import { defaultState } from "./state.js";

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
    resetReason: "そくていの回は固定なので、戻せません。",
  },
  switchControl: {
    active: (settings) => settings?.switchControlMode === true,
    reason: () => "iPad のスイッチコントロールを使っているあいだは、アプリの枠を使いません。",
    resetReason: "iPad のスイッチコントロールを使っているあいだは、戻せません。",
  },
  speech: {
    active: (settings) => settings?.speechEnabled === false,
    reason: () => "「声で読み上げる」がオフのあいだは使いません。",
    resetReason: "「声で読み上げる」がオフのあいだは、戻せません。",
  },
};

/** 項目ごとの「変えられないとき」。そくていで固定される項目には measured が自動で付く。 */
const FIELD_LOCKS = {
  scanInterval: ["switchControl"],
  autoScan: ["switchControl"],
  speechVolume: ["speech"],
  speechVoice: ["speech"],
};

/**
 * 画面のまとまり。fields は保存キー（DOM の id が違うものだけ [キー, id]）。
 *   reset … 既定に戻すボタンの文字。くわしい設定のまとまりごとに置く（よく使う設定と研究には置かない）
 *   keep  … 既定に戻さない項目と、その理由
 */
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
    // iPad 本体の設定と合わせるもの。アプリだけ既定（オフ）に戻すと、iPad 本体の
    // スイッチコントロールがオンのまま、アプリの黄色い枠も動き出す（枠が2つ出る）。
    keep: { switchControlMode: "iPad 本体の設定と合わせるため" },
    reset: "スイッチの設定を既定に戻す",
  },
  {
    id: "senses",
    title: "見え方・声のくわしい設定",
    fields: ["textMode", "highContrast", "speechVolume", "speechVoice"],
    reset: "見え方・声の設定を既定に戻す",
  },
  {
    id: "slot",
    title: "リールを止める",
    fields: ["slotCycleMs", "slotToleranceMs", "slotL1Rounds", "slotL2Rounds"],
    reset: "「リールを止める」を既定に戻す",
  },
  {
    id: "rhythm",
    title: "高い音だけ",
    fields: ["rhythmBpm", ["targetBeats", "rhythmTargetBeats"], "visualGuidance"],
    reset: "「高い音だけ」を既定に戻す",
  },
  {
    id: "crane",
    title: "アームでつかむ",
    fields: ["craneSweepMs", "craneToleranceR", "craneTargetTrials", "craneAudioGuidance"],
    reset: "「アームでつかむ」を既定に戻す",
  },
  {
    id: "fishing",
    title: "さかなつり",
    fields: ["fishingLimitMs"],
    reset: "「さかなつり」を既定に戻す",
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
    keepReason: group.keep?.[key] || "",
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

/** 遊びごとのまとまりを1つの折り畳み（「遊びごとの難しさ」）にまとめて置く。 */
export const PLAY_DETAILS = Object.freeze({
  title: "遊びごとの難しさ",
  groups: Object.freeze(["slot", "rhythm", "crane", "fishing"]),
});

/**
 * 画面での道順（「スイッチのくわしい設定」→「枠を自動で動かす」）。説明書（supporterGuide.js）が使う。
 * 遊びごとのまとまりは「遊びごとの難しさ」の中にあるので、それも頭に付ける。
 */
export function settingPath(key) {
  const field = settingsField(key);
  const steps = [settingsGroup(field.group).title, field.label];
  if (PLAY_DETAILS.groups.includes(field.group)) steps.unshift(PLAY_DETAILS.title);
  return steps.map((step) => `「${step}」`).join("→");
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

/** state.js の既定値（保存の既定）。画面で「既定」と言うのはこれ。 */
function defaultFieldValue(field) {
  return defaultState.settings[field.key];
}

/**
 * まとまりを既定に戻すと何が変わるか（確かめ表 B3「設定を変えたら元に戻せる」）。
 *
 * 戻さないもの: いま変えられない項目（そくていで固定・スイッチコントロール中など。触れない
 * ものを裏で書き換えない）と、keep の項目。どちらも理由を添えて返す（押した人に「何を
 * 戻して、何を残したか」を知らせるため）。
 *
 * @returns {{changes: Array<{field, from, to}>, kept: Array<{field, reason}>, blockedReason: string}}
 *   blockedReason … 戻せる項目が1つも無いときの理由（ボタンを使えなくし、この文を出す）
 */
export function resetPlan(group, settings) {
  const changes = [];
  const kept = [];
  let resettable = 0;
  group.fields.forEach((field) => {
    const reason = field.keepReason || unavailableReason(field, settings);
    if (reason) {
      kept.push({ field, reason });
      return;
    }
    resettable += 1;
    const to = defaultFieldValue(field);
    const from = settings?.[field.key];
    if (!Object.is(from, to)) changes.push({ field, from, to });
  });
  let blockedReason = "";
  if (resettable === 0) {
    const [kind] = group.fields.flatMap((field) => activeLocks(field, settings));
    blockedReason = kind ? LOCKS[kind].resetReason : "戻せる項目がありません。";
  }
  return { changes, kept, blockedReason };
}

/** 既定に戻したあとの知らせ（画面にも読み上げにも同じ文）。 */
export function describeReset(group, plan) {
  if (plan.blockedReason) return plan.blockedReason;
  // 残した理由ごとにまとめる（「そくていの回は固定です」を項目の数だけ繰り返さない）。
  const byReason = new Map();
  plan.kept.forEach(({ field, reason }) => {
    byReason.set(reason, [...(byReason.get(reason) || []), field.label]);
  });
  const kept = [...byReason]
    .map(([reason, labels]) => `変えていないもの: ${labels.join("、")}（${reason.replace(/。$/, "")}）。`)
    .join("");
  if (!plan.changes.length) return `「${group.title}」は、もう既定のままです。${kept}`;
  const changed = plan.changes
    .map(({ field, from, to }) => `${field.label}（${formatFieldValue(field, from)} → ${formatFieldValue(field, to)}）`)
    .join("、");
  return `「${group.title}」を既定に戻しました: ${changed}。${kept}`;
}
