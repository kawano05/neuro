// =====================================================================
// settingsFields.js — 支援者の設定画面の並びと、画面の決まり（DOM に触れない）
//
// よく使う7項目（言語を含む）だけを常設し、くわしい設定は目的別に畳む（docs/rules/supporter-settings.md）。
// 項目の名前・範囲・値の形は settingDefinitions.js（遊びの中の設定と共有する表）から引く。
// 画面の言葉は、利用者の「言語」に合わせた日本語か英語（supporterText.js。文は {ja, en} の組）。
// ここで決めるのは、どのまとまりに置くか・DOM の id・いま変えられるか（とその理由）・
// 既定に戻すときに何を戻すか。
// 保存・既定値・そくていの解決は state.js / difficultyMode.js のまま。
// 見直しの記録: docs/reports/2026-10-01/settings-polish.md。
// =====================================================================

import { isMeasurementMode } from "./difficultyMode.js";
import { translate } from "./i18n.js";
import { SETTING_DEFINITIONS, describeSettingValue, effectiveSettingValue, protocolText } from "./settingDefinitions.js";
import { defaultState } from "./state.js";
import { say, supporterLang } from "./supporterText.js";

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
    reason: (field, lang) =>
      lang === "en"
        ? `Fixed in measured runs (measured runs use ${protocolText(field.key, "en")}).`
        : `そくていの回は固定です（そくていでは ${protocolText(field.key)}）。`,
    resetReason: { ja: "そくていの回は固定なので、戻せません。", en: "Fixed in measured runs, so it cannot be reset." },
  },
  switchControl: {
    active: (settings) => settings?.switchControlMode === true,
    reason: (field, lang) =>
      say(
        {
          ja: "iPad のスイッチコントロールを使っているあいだは、アプリの枠を使いません。",
          en: "While iPad Switch Control is in use, the app's highlight is not used.",
        },
        lang
      ),
    resetReason: {
      ja: "iPad のスイッチコントロールを使っているあいだは、戻せません。",
      en: "Cannot be reset while iPad Switch Control is in use.",
    },
  },
  speech: {
    active: (settings) => settings?.speechEnabled === false,
    reason: (field, lang) =>
      say({ ja: "「声で読み上げる」がオフのあいだは使いません。", en: "Not used while “Read aloud” is off." }, lang),
    resetReason: { ja: "「声で読み上げる」がオフのあいだは、戻せません。", en: "Cannot be reset while “Read aloud” is off." },
  },
};

/** 項目ごとの「変えられないとき」。そくていで固定される項目には measured が自動で付く。 */
const FIELD_LOCKS = {
  scanInterval: ["switchControl"],
  autoScan: ["switchControl"],
  speechVolume: ["speech"],
  speechVoice: ["speech"],
};

/** 遊びの名前（利用者の世界の辞書。日本語は漢字の表記）と、その遊びを既定に戻すボタンの文字。 */
function gameGroup(titleKey) {
  const title = { ja: translate(titleKey, "kanji"), en: translate(titleKey, "en") };
  return { title, reset: { ja: `「${title.ja}」を既定に戻す`, en: `Reset “${title.en}”` } };
}

/**
 * 画面のまとまり。fields は保存キー（DOM の id が違うものだけ [キー, id]）。
 *   title … 見出し {ja, en}
 *   reset … 既定に戻すボタンの文字 {ja, en}。くわしい設定のまとまりごとに置く（よく使う設定と研究には置かない）
 *   keep  … 既定に戻さない項目と、その理由 {ja, en}
 */
const GROUPS = [
  {
    id: "common",
    title: { ja: "よく使う設定", en: "Common settings" },
    // 言語は いちばん上（2026-10-02、「言語の選択を よく使う設定に」）。英語にしてしまっても、
    // 開いてすぐのところで戻せる。
    fields: ["textMode", "fxLevel", "speechEnabled", "soundEnabled", "scanInterval", "largeText", "hideVisualTasks"],
  },
  {
    id: "switch",
    title: { ja: "スイッチのくわしい設定", en: "Switch settings" },
    fields: ["switchControlMode", "autoScan", "scanFeedback", "showScreenSwitch"],
    // iPad 本体の設定と合わせるもの。アプリだけ既定（オフ）に戻すと、iPad 本体の
    // スイッチコントロールがオンのまま、アプリの黄色い枠も動き出す（枠が2つ出る）。
    keep: { switchControlMode: { ja: "iPad 本体の設定と合わせるため", en: "it must match the iPad's own setting" } },
    reset: { ja: "スイッチの設定を既定に戻す", en: "Reset switch settings" },
  },
  {
    id: "senses",
    title: { ja: "見え方・声のくわしい設定", en: "Display and voice settings" },
    fields: ["highContrast", "speechVolume", "speechVoice"],
    reset: { ja: "見え方・声の設定を既定に戻す", en: "Reset display and voice settings" },
  },
  { id: "slot", ...gameGroup("tile.slot-corner.title"), fields: ["slotCycleMs", "slotToleranceMs", "slotL1Rounds", "slotL2Rounds"] },
  {
    id: "rhythm",
    ...gameGroup("tile.gonogo.title"),
    fields: ["rhythmBpm", ["targetBeats", "rhythmTargetBeats"], "visualGuidance"],
  },
  {
    id: "crane",
    ...gameGroup("tile.crane-corner.title"),
    fields: ["craneSweepMs", "craneToleranceR", "craneTargetTrials", "craneAudioGuidance"],
  },
  { id: "fishing", ...gameGroup("tile.fishing-corner.title"), fields: ["fishingLimitMs"] },
  {
    id: "research",
    title: { ja: "研究（れんしゅう／そくてい）", en: "Research (practice / measure)" },
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
  title: Object.freeze({ ja: "遊びごとの難しさ", en: "Difficulty of each game" }),
  groups: Object.freeze(["slot", "rhythm", "crane", "fishing"]),
});

/**
 * 画面での道順（「スイッチのくわしい設定」→「枠を自動で動かす」）。説明書（supporterGuide.js）が使う。
 * 遊びごとのまとまりは「遊びごとの難しさ」の中にあるので、それも頭に付ける。
 */
export function settingPath(key, lang = "ja") {
  const field = settingsField(key);
  const steps = [settingsGroup(field.group).title, field.label];
  if (PLAY_DETAILS.groups.includes(field.group)) steps.unshift(PLAY_DETAILS.title);
  return lang === "en"
    ? steps.map((step) => `“${say(step, "en")}”`).join(" → ")
    : steps.map((step) => `「${say(step)}」`).join("→");
}

/** 入力に見せる値（null の範囲はプリセット、古い値は読み替えたもの）。 */
export function fieldValue(field, settings) {
  return effectiveSettingValue(field.key, settings);
}

/** 画面の数字と、スライダーの読み上げ（aria-valuetext）の文。同じものを使う。 */
export function formatFieldValue(field, value, lang = "ja") {
  return describeSettingValue(field.key, value, lang);
}

export function readFieldValue(field, control) {
  if (field.type === "checkbox") return control.checked;
  if (field.nullable) return control.value === "" ? null : Number(control.value);
  return field.type === "range" ? Number(control.value) : control.value;
}

function activeLocks(field, settings) {
  return field.locks.filter((kind) => LOCKS[kind].active(settings));
}

/** いま変えられない理由（行に出す文。支援者の画面の言語で）。変えられるなら ""。 */
export function unavailableReason(field, settings) {
  const [kind] = activeLocks(field, settings);
  return kind ? LOCKS[kind].reason(field, supporterLang(settings)) : "";
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
  const lang = supporterLang(settings);
  const changes = [];
  const kept = [];
  let resettable = 0;
  group.fields.forEach((field) => {
    const reason = say(field.keepReason, lang) || unavailableReason(field, settings);
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
    blockedReason = say(kind ? LOCKS[kind].resetReason : { ja: "戻せる項目がありません。", en: "Nothing can be reset." }, lang);
  }
  return { changes, kept, blockedReason };
}

/**
 * 既定に戻したあとの知らせ（画面にも読み上げにも同じ文）。lang は resetPlan と同じ言語
 * （残した理由の文は、resetPlan がその言語で作っている）。
 */
export function describeReset(group, plan, lang = "ja") {
  if (plan.blockedReason) return plan.blockedReason;
  const en = lang === "en";
  const title = say(group.title, lang);
  // 残した理由ごとにまとめる（「そくていの回は固定です」を項目の数だけ繰り返さない）。
  const byReason = new Map();
  plan.kept.forEach(({ field, reason }) => {
    byReason.set(reason, [...(byReason.get(reason) || []), say(field.label, lang)]);
  });
  const kept = [...byReason]
    .map(([reason, labels]) =>
      en
        ? ` Not changed: ${labels.join(", ")} (${reason.replace(/\.$/, "")}).`
        : `変えていないもの: ${labels.join("、")}（${reason.replace(/。$/, "")}）。`
    )
    .join("");
  if (!plan.changes.length) return en ? `“${title}” is already at the defaults.${kept}` : `「${title}」は、もう既定のままです。${kept}`;
  const changed = plan.changes
    .map(({ field, from, to }) => {
      const values = `${formatFieldValue(field, from, lang)} → ${formatFieldValue(field, to, lang)}`;
      return en ? `${say(field.label, lang)} (${values})` : `${say(field.label)}（${values}）`;
    })
    .join(en ? ", " : "、");
  return en ? `Reset “${title}” to the defaults: ${changed}.${kept}` : `「${title}」を既定に戻しました: ${changed}。${kept}`;
}
