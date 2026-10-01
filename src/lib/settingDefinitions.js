// =====================================================================
// settingDefinitions.js — 支援者が変える設定の、名前・範囲・値の形の表（ただ1つ）
//
// 同じ保存キー（state.settings のキー）を、支援者の設定画面（settingsFields.js）と、
// 遊びの中の「この遊びの設定」（games/gameSettings.js）の2か所から変えられる。
// 名前・範囲・「そくていで固定されるか」を両方に書いていたので、片方だけ直すと
// 食い違う（2026-10-01 の見直しで見つかった）。ここを正本にして、画面はここから引く。
//
// ここに置くのは「どう見せるか」だけ。保存の形・既定値・読み込みの検査（sanitize）は
// state.js、そくていの値は difficultyMode.js の MEASUREMENT_PROTOCOL が正本のまま。
// 範囲が sanitize と合っていること、遊びの中の選択肢がこの範囲に入っていることは
// tests/settings-definitions.test.mjs が確かめる。
//
// 欄:
//   type     … checkbox / range / select
//   label    … 画面の名前（支援者の画面の言葉。i18n は通さない）
//   hint     … 名前の下の1文
//   min/max/step … range の範囲（sanitize と同じ）
//   options  … select の選択肢 [値, 名前]。nullable の "" は「あそびごとの既定」（null）
//   format   … 値を文にする形（FORMATS のキー）。画面の数字と読み上げ（aria-valuetext）の両方に使う
//   preset   … null のときに実際に使われる値（content.js のプリセット）
//   resolve  … 保存の値から、いま効いている値を決める関数（古い値を読み替えるもの）
//   measured … そくていの回は MEASUREMENT_PROTOCOL の値に固定される
//   protocol … そくていの回に実際に使われる値（画面に「そくていでは …」と添える）
//   inGame   … 遊びの中の「この遊びの設定」でも変えられる遊び（gameId）
// =====================================================================

import { ATMOSPHERES } from "./atmosphere.js";
import { cranePresets, fishingPresets, rhythmPresets, slotPresets } from "./content.js";
import { MEASUREMENT_PROTOCOL, resolveDifficultyMode } from "./difficultyMode.js";
import { resolveTextMode, translate } from "./i18n.js";

/** 値を文にする形。画面の数字と、スライダーの読み上げ（aria-valuetext）で同じものを使う。 */
const FORMATS = Object.freeze({
  seconds: (ms) => `${Number((ms / 1000).toFixed(2))}秒`,
  percent: (ratio) => `${Math.round(ratio * 100)}%`,
  times: (count) => `${count}回`,
  perMinute: (count) => `1分に${count}回`,
  onOff: (on) => (on ? "オン" : "オフ"),
  plain: (value) => String(value),
});

const PROTOCOL = MEASUREMENT_PROTOCOL;

/** 雰囲気の名前と説明は、遊びの舞台と同じ辞書のキー（atmosphere.js）。支援者の画面は漢字。 */
function atmosphereDescription(level) {
  const profile = Object.hasOwn(ATMOSPHERES, level) ? ATMOSPHERES[level] : ATMOSPHERES.none;
  return translate(profile.description, "kanji");
}

export const SETTING_DEFINITIONS = Object.freeze({
  fxLevel: {
    type: "select",
    label: "遊びの雰囲気",
    hint: "世界の動きや、押したとき・できたときのお祝いを選びます。",
    options: Object.values(ATMOSPHERES).map((profile) => [profile.level, translate(profile.label, "kanji")]),
    description: atmosphereDescription,
  },
  speechEnabled: { type: "checkbox", label: "声で読み上げる", hint: "説明やほめ言葉を声で読みます。", format: "onOff" },
  soundEnabled: { type: "checkbox", label: "効果音", hint: "押した音や拍手を鳴らします。遊びの合図は切れません。", format: "onOff" },
  scanInterval: {
    type: "range",
    label: "枠が動く速さ",
    hint: "次の遊びへ枠が移るまでの時間です。",
    min: 800,
    max: 3200,
    step: 100,
    format: "seconds",
  },
  largeText: { type: "checkbox", label: "大きい文字", hint: "画面の文字を大きくします。", format: "onOff" },
  hideVisualTasks: {
    type: "checkbox",
    label: "画面をよく見る遊びを隠す",
    hint: "「くるくる 止める」と「アームで つかむ」をホームから隠します。",
    format: "onOff",
  },

  switchControlMode: {
    type: "checkbox",
    label: "iPad のスイッチコントロールを使う",
    hint: "iPad 本体のスイッチコントロールを使うときだけオン。",
    format: "onOff",
  },
  autoScan: { type: "checkbox", label: "枠を自動で動かす", hint: "利用者の画面で、黄色い枠を自動で動かします。", format: "onOff" },
  scanFeedback: {
    type: "select",
    label: "枠が動いたときの音",
    hint: "枠が移るたびに音や遊びの名前で知らせます。",
    options: [
      ["none", "なし"],
      ["tick", "小さな音"],
      ["speak", "名前を読む"],
    ],
  },
  showScreenSwitch: {
    type: "checkbox",
    label: "画面に「おす」ボタンを出す",
    hint: "画面のボタンをスイッチのかわりに使います。",
    format: "onOff",
  },

  textMode: {
    type: "select",
    label: "文字づかい",
    hint: "遊びの文字を選びます。支援者の画面は日本語です。",
    options: [
      ["ruby", "漢字＋ふりがな"],
      ["en", "English"],
    ],
    // 以前の kanji / kana が保存された端末は、選べる表記（ruby）へ読み替える。
    resolve: resolveTextMode,
  },
  highContrast: { type: "checkbox", label: "くっきり表示", hint: "枠と文字の色の差を強くします。", format: "onOff" },
  speechVolume: {
    type: "range",
    label: "読み上げの声の大きさ",
    hint: "アプリの声だけの音量です。",
    min: 0.2,
    max: 1,
    step: 0.1,
    format: "percent",
  },
  speechVoice: {
    type: "select",
    label: "読み上げの声",
    hint: "アプリに入れた声か、端末の声を選びます。",
    options: [
      ["app", "アプリの声"],
      ["device", "端末の声"],
    ],
  },

  slotCycleMs: {
    type: "range",
    label: "絵が回る速さ",
    hint: "絵が1周する時間。長いほどゆっくりです。",
    min: 2800,
    max: 6000,
    step: 100,
    format: "seconds",
    preset: slotPresets["slot-l1"].cycleMs,
    measured: true,
    protocol: PROTOCOL.slot["slot-l1"].cycleMs,
    inGame: ["slot-l1", "slot-l2"],
  },
  slotToleranceMs: {
    type: "range",
    label: "「合った」にする広さ",
    hint: "目標の前後の広さ。広いほどやさしくなります。",
    min: 60,
    max: 220,
    step: 10,
    format: "seconds",
    preset: slotPresets["slot-l1"].toleranceMs,
    measured: true,
    protocol: PROTOCOL.slot["slot-l1"].toleranceMs,
    inGame: ["slot-l1", "slot-l2"],
  },
  slotL1Rounds: {
    type: "range",
    label: "「ひとつ止める」の回数",
    hint: "1列の絵を止める回数です。",
    min: 3,
    max: 20,
    step: 1,
    format: "times",
    preset: slotPresets["slot-l1"].rounds,
    measured: true,
    protocol: PROTOCOL.slot["slot-l1"].rounds,
  },
  slotL2Rounds: {
    type: "range",
    label: "「3つ止める」の回数",
    hint: "3本を順番に止める回数です。",
    min: 2,
    max: 12,
    step: 1,
    format: "times",
    preset: slotPresets["slot-l2"].rounds,
    measured: true,
    protocol: PROTOCOL.slot["slot-l2"].rounds,
  },

  // テンポと音の数は、設定画面では「高い音だけ」のまとまりに置く（ホームに出るリズムの遊びは
  // これだけ）。そくていの値も高い音だけ（gonogo）のもの。
  rhythmBpm: {
    type: "select",
    label: "音の速さ（テンポ）",
    hint: "1分に鳴る音の数。少ないほどゆっくりです。",
    options: [
      ["", "あそびごとの既定"],
      ["30", "30（とてもゆっくり）"],
      ["40", "40"],
      ["50", "50"],
      ["60", "60"],
      ["80", "80（はやめ）"],
    ],
    nullable: true,
    format: "perMinute",
    preset: rhythmPresets.gonogo.bpm,
    measured: true,
    protocol: PROTOCOL.rhythm.gonogo.bpm,
    inGame: ["gonogo"],
  },
  targetBeats: {
    type: "select",
    label: "1回に鳴る音の数",
    hint: "1回の遊びで鳴る音の数です。",
    options: [
      ["", "あそびごとの既定"],
      ["5", "5"],
      ["10", "10"],
      ["20", "20"],
      ["30", "30"],
    ],
    nullable: true,
    format: "times",
    preset: rhythmPresets.gonogo.targetBeats,
    measured: true,
    protocol: PROTOCOL.rhythm.gonogo.targetBeats,
  },
  visualGuidance: {
    type: "checkbox",
    label: "次の音が来る場所を画面に出す",
    hint: "次の拍を予告します。そくていでは出ません。",
    format: "onOff",
    measured: true,
    // difficultyMode.js の allowsVisualGuidance が、そくていでは必ず切る。
    protocol: false,
  },

  craneSweepMs: {
    type: "range",
    label: "アームの速さ",
    hint: "端から端までの時間。長いほどゆっくりです。",
    min: 800,
    max: 6000,
    step: 100,
    format: "seconds",
    preset: cranePresets.sweepMs,
    measured: true,
    protocol: PROTOCOL.crane.sweepMs,
    inGame: ["crane"],
  },
  craneToleranceR: {
    type: "range",
    label: "つかめる広さ",
    hint: "ねらいからのずれの許容幅です。",
    min: 4,
    max: 40,
    step: 1,
    format: "plain",
    preset: cranePresets.toleranceR,
    measured: true,
    protocol: PROTOCOL.crane.toleranceR,
    inGame: ["crane"],
  },
  craneTargetTrials: {
    type: "range",
    label: "1回にアームを下ろす回数",
    hint: "1回の遊びでアームを下ろす回数です。",
    min: 3,
    max: 15,
    step: 1,
    format: "times",
    preset: cranePresets.targetTrials,
    measured: true,
    protocol: PROTOCOL.crane.targetTrials,
  },
  craneAudioGuidance: {
    type: "checkbox",
    label: "ねらいの上で音を鳴らす",
    hint: "ねらいの上を通ると音が鳴り、耳でも狙えます。",
    format: "onOff",
    measured: true,
    // difficultyMode.js の resolveCraneDifficulty が、そくていでは必ず切る。
    protocol: false,
  },

  fishingLimitMs: {
    type: "select",
    label: "アタリが続く長さ",
    hint: "魚が逃げるまでの時間です。",
    options: [
      ["", "ふつう（2秒）"],
      ["3000", "ながい（3秒）"],
      ["4000", "とても ながい（4秒）"],
      ["1400", "みじかい（1.4秒）"],
    ],
    nullable: true,
    format: "seconds",
    preset: fishingPresets.fishing.limitMs,
    measured: true,
    protocol: PROTOCOL.fishing.fishing.limitMs,
    inGame: ["fishing", "fishing-gonogo"],
  },

  difficultyMode: {
    type: "select",
    label: "れんしゅう／そくてい",
    hint: "そくていでは、遊びの速さ・回数・手がかりが固定されます。",
    options: [
      ["practice", "れんしゅう（訓練・調整できる）"],
      ["measure", "そくてい（研究・固定）"],
    ],
    resolve: resolveDifficultyMode,
  },
});

/** 保存の値から、いま効いている値（null はプリセット、古い値は読み替え）。 */
export function effectiveSettingValue(key, settings) {
  const definition = SETTING_DEFINITIONS[key];
  if (definition.resolve) return definition.resolve(settings);
  const value = settings?.[key];
  // つまみは null（あそびごとの既定）を指せないので、実際に使われる値を指す。
  // 選択肢には「あそびごとの既定」があるので、null のまま渡す。
  return definition.type === "range" ? value ?? definition.preset : value;
}

/** 値を支援者の画面の文にする（「1.6秒」「60%」「なし」）。選択肢があれば、その名前。 */
export function describeSettingValue(key, value) {
  const definition = SETTING_DEFINITIONS[key];
  if (definition.options) {
    const found = definition.options.find(([optionValue]) => optionValue === String(value ?? ""));
    if (found) return found[1];
  }
  const shown = value ?? definition.preset;
  const format = FORMATS[definition.format] || FORMATS.plain;
  return shown == null ? "" : format(shown);
}

/** そくていの回に使われる値の文（「3.2秒」）。固定されない項目は ""。 */
export function protocolText(key) {
  const definition = SETTING_DEFINITIONS[key];
  if (!definition.measured) return "";
  const format = FORMATS[definition.format] || FORMATS.plain;
  return format(definition.protocol);
}
