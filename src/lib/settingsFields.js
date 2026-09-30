// 支援者設定の表示と入力型を一か所で定義する。6項目だけを常設し、詳細は目的別に畳む。
// 保存・既定値・測定の解決規則は state.js / difficultyMode.js のまま。
// 理由と全項目の対応表: docs/settings-simple-2026-09-30.md。
import { cranePresets, slotPresets } from './content.js';
import { ATMOSPHERES } from "./atmosphere.js";
import { translate } from './i18n.js';

// 支援者の画面は日本語。雰囲気の名前と説明は舞台と同じ辞書のキーを使う。
const atmosphereField = {
  id: "fxLevel", key: "fxLevel", type: "select", label: "遊びの雰囲気",
  hint: "世界の動きや、押したとき・できたときのお祝いを選びます。",
  options: Object.values(ATMOSPHERES).map(profile => [profile.level, translate(profile.label, "kanji")]),
  description: value => translate((Object.hasOwn(ATMOSPHERES, value) ? ATMOSPHERES[value] : ATMOSPHERES.none).description, "kanji"),
};

export const SETTINGS_GROUPS = [
  { id: "common", title: "よく使う設定", fields: [
    atmosphereField,
    {"id":"speechEnabled","key":"speechEnabled","type":"checkbox","label":"声で読み上げる","hint":"説明やほめ言葉を声で読みます。"},
    {"id":"soundEnabled","key":"soundEnabled","type":"checkbox","label":"効果音","hint":"押した音や拍手を鳴らします。遊びの合図は切れません。"},
    {"id":"scanInterval","key":"scanInterval","type":"range","label":"枠が動く速さ","hint":"次の遊びへ枠が移るまでの時間です。","min":800,"max":3200,"step":100},
    {"id":"largeText","key":"largeText","type":"checkbox","label":"大きい文字","hint":"画面の文字を大きくします。"},
    {"id":"hideVisualTasks","key":"hideVisualTasks","type":"checkbox","label":"画面をよく見る遊びを隠す","hint":"リールとアームをホームから隠します。"},
  ] },
  { id: "switch", title: "スイッチのくわしい設定", fields: [
    {"id":"switchControlMode","key":"switchControlMode","type":"checkbox","label":"iPad のスイッチコントロールを使う","hint":"iPad 本体のスイッチコントロールを使うときだけオン。","describedBy":"switchControlModeNotice"},
    {"id":"autoScan","key":"autoScan","type":"checkbox","label":"枠を自動で動かす","hint":"利用者の画面で、黄色い枠を自動で動かします。"},
    {"id":"scanFeedback","key":"scanFeedback","type":"select","label":"枠が動いたときの音","hint":"枠が移るたびに音や遊びの名前で知らせます。","options":[["none","なし"],["tick","小さな音"],["speak","名前を読む"]]},
    {"id":"showScreenSwitch","key":"showScreenSwitch","type":"checkbox","label":"画面に「おす」ボタンを出す","hint":"画面のボタンをスイッチのかわりに使います。"},
  ] },
  { id: "senses", title: "見え方・声のくわしい設定", fields: [
    {"id":"textMode","key":"textMode","type":"select","label":"文字づかい","hint":"遊びの文字を選びます。支援者の画面は日本語です。","options":[["ruby","漢字＋ふりがな"],["en","English"]]},
    {"id":"highContrast","key":"highContrast","type":"checkbox","label":"くっきり表示","hint":"枠と文字の色の差を強くします。"},
    {"id":"speechVolume","key":"speechVolume","type":"range","label":"読み上げの声の大きさ","hint":"アプリの声だけの音量です。","min":0.2,"max":1,"step":0.1},
    {"id":"speechVoice","key":"speechVoice","type":"select","label":"読み上げの声","hint":"アプリに入れた声か、端末の声を選びます。","options":[["app","アプリの声"],["device","端末の声"]]},
  ] },
  { id: "slot", title: "リールを止める", fields: [
    {"id":"slotCycleMs","key":"slotCycleMs","type":"range","label":"リールの速さ","hint":"1周する時間。長いほどゆっくりです。","min":2800,"max":6000,"step":100,"measured":true},
    {"id":"slotToleranceMs","key":"slotToleranceMs","type":"range","label":"「合った」にする広さ","hint":"目標の前後の広さ。広いほどやさしくなります。","min":60,"max":220,"step":10,"measured":true},
    {"id":"slotL1Rounds","key":"slotL1Rounds","type":"range","label":"「ひとつ止める」の回数","hint":"1本のリールを止める回数です。","min":3,"max":20,"step":1,"measured":true},
    {"id":"slotL2Rounds","key":"slotL2Rounds","type":"range","label":"「3つ止める」の回数","hint":"3本を順番に止める回数です。","min":2,"max":12,"step":1,"measured":true},
  ] },
  { id: "rhythm", title: "高い音だけ", fields: [
    {"id":"rhythmBpm","key":"rhythmBpm","type":"select","label":"音の速さ（テンポ）","hint":"1分に鳴る音の数。少ないほどゆっくりです。","options":[["","あそびごとの既定"],["30","30（とてもゆっくり）"],["40","40"],["50","50"],["60","60"],["80","80（はやめ）"]],"nullable":true,"measured":true},
    {"id":"rhythmTargetBeats","key":"targetBeats","type":"select","label":"1回に鳴る音の数","hint":"1回の遊びで鳴る音の数です。","options":[["","あそびごとの既定"],["5","5"],["10","10"],["20","20"],["30","30"]],"nullable":true,"measured":true},
    {"id":"visualGuidance","key":"visualGuidance","type":"checkbox","label":"次の音が来る場所を画面に出す","hint":"次の拍を予告します。測定では出ません。","measured":true},
  ] },
  { id: "crane", title: "アームでつかむ", fields: [
    {"id":"craneSweepMs","key":"craneSweepMs","type":"range","label":"アームの速さ","hint":"端から端までの時間。長いほどゆっくりです。","min":800,"max":6000,"step":100,"measured":true},
    {"id":"craneToleranceR","key":"craneToleranceR","type":"range","label":"つかめる広さ","hint":"ねらいからのずれの許容幅です。","min":4,"max":40,"step":1,"measured":true},
    {"id":"craneTargetTrials","key":"craneTargetTrials","type":"range","label":"1回にアームを下ろす回数","hint":"1回の遊びでアームを下ろす回数です。","min":3,"max":15,"step":1,"measured":true},
    {"id":"craneAudioGuidance","key":"craneAudioGuidance","type":"checkbox","label":"ねらいの上で音を鳴らす","hint":"ねらいの上を通ると音が鳴り、耳でも狙えます。","measured":true},
  ] },
  { id: "fishing", title: "さかなつり", fields: [
    {"id":"fishingLimitMs","key":"fishingLimitMs","type":"select","label":"アタリが続く長さ","hint":"魚が逃げるまでの時間です。","options":[["","ふつう（2秒）"],["3000","ながい（3秒）"],["4000","とても ながい（4秒）"],["1400","みじかい（1.4秒）"]],"nullable":true,"measured":true},
  ] },
  { id: "research", title: "研究（練習／測定・成立確認）", fields: [
    {"id":"difficultyMode","key":"difficultyMode","type":"select","label":"練習／測定","hint":"測定では速さ・回数・手がかりが固定されます。","options":[["practice","練習（訓練・調整できる）"],["measure","測定（研究・固定）"]]},
  ] },
];

export const SETTINGS_FIELDS = SETTINGS_GROUPS.flatMap(group => group.fields);

export function formatSeconds(ms) {
  return `${Number((ms / 1000).toFixed(2))}秒`;
}

const fallbacks = {
 craneSweepMs: cranePresets.sweepMs, craneToleranceR: cranePresets.toleranceR, craneTargetTrials: cranePresets.targetTrials,
 slotCycleMs: slotPresets['slot-l1'].cycleMs, slotToleranceMs: slotPresets['slot-l1'].toleranceMs,
 slotL1Rounds: slotPresets['slot-l1'].rounds, slotL2Rounds: slotPresets['slot-l2'].rounds,
};
export function fieldValue(field, settings) {
 const value = settings[field.key];
 return field.type === 'range' ? value ?? fallbacks[field.key] : value;
}
export function formatFieldValue(field, value) {
 if (field.id === 'speechVolume') return `${Math.round(value * 100)}%`;
 return field.id.endsWith('Ms') || field.id === 'scanInterval' ? formatSeconds(value) : String(value);
}
export function readFieldValue(field, control) {
 if (field.type === 'checkbox') return control.checked;
 if (field.nullable) return control.value === '' ? null : Number(control.value);
 return field.type === 'range' ? Number(control.value) : control.value;
}
