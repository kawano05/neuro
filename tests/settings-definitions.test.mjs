// 支援者の設定の定義（settingDefinitions.js）と、設定画面の決まり（settingsFields.js）。
//
// 同じ保存キーを、設定画面と遊びの中の「この遊びの設定」（games/gameSettings.js）の
// 2か所から変えられる。名前・範囲・「そくていで固定されるか」が片方だけ変わると、
// 画面どうしで食い違うか、sanitize が黙って別の値に丸める（記録と食い違う）。
// ここで、定義が sanitize・遊びの中の選択肢・そくていの値と合っていることを固定する。
//
//   node tests/settings-definitions.test.mjs

import assert from "node:assert/strict";
import { ATMOSPHERE_LEVELS } from "../src/lib/atmosphere.js";
import { MEASUREMENT_PROTOCOL } from "../src/lib/difficultyMode.js";
import { GAME_SETTINGS } from "../src/lib/games/gameSettings.js";
import { SETTING_DEFINITIONS, inGameSettingKeys, protocolText } from "../src/lib/settingDefinitions.js";
import {
  SETTINGS_FIELDS,
  SETTINGS_GROUPS,
  describedByIds,
  fieldValue,
  formatFieldValue,
  settingsField,
  unavailableReason,
} from "../src/lib/settingsFields.js";
import { defaultState, sanitizeState } from "../src/lib/state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

/** 設定1つだけを入れて読み込み直したときの値（state.js の sanitize を通す）。 */
function sanitized(key, value) {
  return sanitizeState({ settings: { [key]: value } }).settings[key];
}

test("every field on the screen comes from the shared definitions, once", () => {
  const keys = SETTINGS_FIELDS.map((field) => field.key);
  assert.equal(new Set(keys).size, keys.length, "同じキーを2か所に置かない");
  assert.deepEqual([...keys].sort(), Object.keys(SETTING_DEFINITIONS).sort(), "定義と画面の項目が一致する");
  const ids = SETTINGS_FIELDS.map((field) => field.id);
  assert.equal(new Set(ids).size, ids.length, "DOM の id は重ならない");
  SETTINGS_FIELDS.forEach((field) => assert.ok(field.label && field.hint, `${field.key} に名前と説明がある`));
  assert.equal(SETTINGS_GROUPS[0].fields.length, 6, "よく使う設定は6つ");
  assert.equal(SETTINGS_FIELDS.some((field) => field.key === "researcherMode"), false, "効かない研究者モードは画面に出さない");
});

test("range limits are the same as the ones sanitize keeps", () => {
  SETTINGS_FIELDS.filter((field) => field.type === "range").forEach((field) => {
    assert.equal(sanitized(field.key, field.min), field.min, `${field.key} の下限が保存で残る`);
    assert.equal(sanitized(field.key, field.max), field.max, `${field.key} の上限が保存で残る`);
    assert.notEqual(sanitized(field.key, field.min - field.step), field.min - field.step, `${field.key} の下限より下は残らない`);
    assert.notEqual(sanitized(field.key, field.max + field.step), field.max + field.step, `${field.key} の上限より上は残らない`);
  });
});

test("every select option survives sanitize, and the empty choice means null", () => {
  SETTINGS_FIELDS.filter((field) => field.type === "select").forEach((field) => {
    field.options.forEach(([value]) => {
      const stored = field.nullable ? (value === "" ? null : Number(value)) : value;
      assert.equal(sanitized(field.key, stored), stored, `${field.key}=${value} が保存で残る`);
    });
    if (field.nullable) assert.equal(field.options[0][0], "", `${field.key} の最初は「あそびごとの既定」`);
  });
  assert.deepEqual(settingsField("fxLevel").options.map(([value]) => value), ATMOSPHERE_LEVELS, "雰囲気の段は atmosphere.js の表のまま");
});

test("in-game settings use the same keys, names, measured flags and ranges", () => {
  const seen = new Map();
  Object.entries(GAME_SETTINGS).forEach(([gameId, { groups }]) => {
    groups
      .filter((group) => !group.key.startsWith("playPrefs."))
      .forEach((group) => {
        const definition = SETTING_DEFINITIONS[group.key];
        assert.ok(definition, `${gameId} の ${group.key} が共有の定義にある`);
        assert.equal(group.label, definition.label, `${group.key} の名前が同じ`);
        assert.equal(Boolean(group.measured), Boolean(definition.measured), `${group.key} の measured が同じ`);
        assert.ok(definition.inGame?.includes(gameId), `${group.key} の inGame に ${gameId} がある`);
        group.options.forEach(([value]) => {
          if (value === null) {
            assert.equal(defaultState.settings[group.key], null, `${group.key} は null（あそびごとの既定）を持てる`);
          } else if (definition.type === "range") {
            assert.ok(value >= definition.min && value <= definition.max, `${group.key}=${value} が範囲の中`);
          } else {
            assert.ok(definition.options.some(([option]) => option === String(value)), `${group.key}=${value} が選択肢にある`);
          }
          assert.equal(sanitized(group.key, value), value, `${group.key}=${value} が保存で残る`);
        });
        seen.set(`${gameId}:${group.key}`, true);
      });
  });
  Object.entries(SETTING_DEFINITIONS).forEach(([key, definition]) => {
    (definition.inGame || []).forEach((gameId) => {
      assert.ok(seen.has(`${gameId}:${key}`), `${key} は ${gameId} の「この遊びの設定」にある`);
    });
  });
  assert.deepEqual(inGameSettingKeys("crane"), ["craneSweepMs", "craneToleranceR"]);
});

test("the protocol value shown for a measured field is the one the games use", () => {
  // 画面に出すそくていの値は1つ。遊びごとに違う値になったら、出し方を変える必要がある。
  const slot = MEASUREMENT_PROTOCOL.slot;
  assert.equal(slot["slot-l1"].cycleMs, slot["slot-l2"].cycleMs);
  assert.equal(slot["slot-l1"].toleranceMs, slot["slot-l2"].toleranceMs);
  assert.equal(MEASUREMENT_PROTOCOL.fishing.fishing.limitMs, MEASUREMENT_PROTOCOL.fishing["fishing-gonogo"].limitMs);
  assert.equal(protocolText("slotCycleMs"), "3.2秒");
  assert.equal(protocolText("slotL2Rounds"), `${slot["slot-l2"].rounds}回`);
  assert.equal(protocolText("craneSweepMs"), "2.2秒");
  assert.equal(protocolText("fishingLimitMs"), "2秒");
  assert.equal(protocolText("rhythmBpm"), `1分に${MEASUREMENT_PROTOCOL.rhythm.gonogo.bpm}回`);
  assert.equal(protocolText("visualGuidance"), "オフ");
  assert.equal(protocolText("scanInterval"), "", "固定されない項目には出さない");
  SETTINGS_FIELDS.filter((field) => field.measured).forEach((field) => {
    assert.notEqual(field.protocol, undefined, `${field.key} にそくていの値がある`);
  });
});

test("values read as the same sentence on screen and in VoiceOver", () => {
  const read = (key, value) => formatFieldValue(settingsField(key), value);
  assert.equal(read("scanInterval", 1600), "1.6秒");
  assert.equal(read("speechVolume", 0.6), "60%");
  assert.equal(read("slotL1Rounds", 8), "8回");
  assert.equal(read("craneToleranceR", 15), "15");
  assert.equal(read("craneSweepMs", null), "2.2秒", "null はプリセットの値で読む");
  assert.equal(read("rhythmBpm", null), "あそびごとの既定");
  assert.equal(read("fishingLimitMs", 3000), "ながい（3秒）");
  assert.equal(read("largeText", true), "オン");
  // つまみは生の値（1600）を読ませない。どの range にも文の形がある。
  SETTINGS_FIELDS.filter((field) => field.type === "range").forEach((field) => {
    assert.ok(field.format, `${field.key} に format がある`);
  });
  assert.equal(fieldValue(settingsField("craneSweepMs"), { craneSweepMs: null }), 2200);
  assert.equal(fieldValue(settingsField("rhythmBpm"), { rhythmBpm: null }), null, "選択肢の null は「あそびごとの既定」のまま");
  assert.equal(fieldValue(settingsField("textMode"), { textMode: "kana" }), "ruby", "選べなくなった表記は読み替える");
  assert.equal(fieldValue(settingsField("difficultyMode"), { difficultyMode: "???" }), "practice");
});

test("a control that cannot be changed says why in its own row, from one function", () => {
  const practice = { ...defaultState.settings };
  SETTINGS_FIELDS.forEach((field) => {
    assert.equal(unavailableReason(field, practice), "", `${field.key} は既定のままなら変えられる`);
    assert.ok(!describedByIds(field, practice).includes("Reason"), `${field.key} は理由を読ませない`);
  });

  // iPad のスイッチコントロール中: 枠の速さ（よく使う設定）にも理由が出る。
  const delegated = { ...practice, switchControlMode: true, autoScan: false };
  const scanInterval = settingsField("scanInterval");
  assert.match(unavailableReason(scanInterval, delegated), /スイッチコントロール/);
  assert.equal(describedByIds(scanInterval, delegated), "scanIntervalHint scanIntervalReason");
  assert.match(unavailableReason(settingsField("autoScan"), delegated), /スイッチコントロール/);
  assert.ok(describedByIds(settingsField("switchControlMode"), delegated).includes("switchControlModeNotice"));
  assert.equal(unavailableReason(settingsField("switchControlMode"), delegated), "", "戻すスイッチ自体は使える");

  // 読み上げがオフ: 声の大きさ・声の選択。
  const silent = { ...practice, speechEnabled: false };
  assert.match(unavailableReason(settingsField("speechVolume"), silent), /声で読み上げる/);
  assert.match(unavailableReason(settingsField("speechVoice"), silent), /声で読み上げる/);

  // そくていの回: 固定される項目だけ。れんしゅうの値ではなく、そくていで使う値を添える。
  const measuring = { ...practice, difficultyMode: "measure", slotCycleMs: 4800 };
  SETTINGS_FIELDS.forEach((field) => {
    const reason = unavailableReason(field, measuring);
    if (field.measured) {
      assert.ok(reason.includes(`そくていでは ${protocolText(field.key)}`), `${field.key}: ${reason}`);
      assert.ok(describedByIds(field, measuring).endsWith(`${field.id}Reason`));
    } else {
      assert.equal(reason, "", `${field.key} はそくていでも変えられる`);
    }
  });
  assert.equal(unavailableReason(settingsField("slotCycleMs"), measuring), "そくていの回は固定です（そくていでは 3.2秒）。");
  assert.equal(describedByIds(settingsField("fxLevel"), practice), "fxLevelHint fxLevelDescription");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("settings definition tests passed");
