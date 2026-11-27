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
// 支援者の画面の言葉は、利用者の「言語」に合わせて日本語か英語（2026-10-02。supporterText.js）。
// 名前・説明・選択肢の名前は {ja, en} の組で持ち、描くときに say() で選ぶ。
//
// 欄:
//   type     … checkbox / range / select
//   label    … 画面の名前 {ja, en}
//   hint     … 名前の下の1文 {ja, en}
//   min/max/step … range の範囲（sanitize と同じ）
//   options  … select の選択肢 [値, 名前]。名前は文字列か {ja, en}。nullable の "" は「あそびごとの既定」（null）
//   format   … 値を文にする形（FORMATS のキー）。画面の数字と読み上げ（aria-valuetext）の両方に使う
//   preset   … null のときに実際に使われる値（content.js のプリセット）
//   resolve  … 保存の値から、いま効いている値を決める関数（古い値を読み替えるもの）
//   measured … そくていの回は MEASUREMENT_PROTOCOL の値に固定される
//   protocol … そくていの回に実際に使われる値（画面に「そくていでは …」と添える）
//   inGame   … 遊びの中の「この遊びの設定」でも変えられる遊び（gameId）
// =====================================================================

import { ATMOSPHERES } from "./atmosphere.js";
import { cranePresets, fishingPresets, rhythmPresets, slotPresets } from "./content.js";
import { MEASUREMENT_PROTOCOL, SURE_HIT_GAMES, resolveDifficultyMode } from "./difficultyMode.js";
import { resolveTextMode, translate } from "./i18n.js";
import { LANGUAGES, localNumber } from "./locales/index.js";
import { say } from "./supporterText.js";

/** 値を文にする形。画面の数字と、スライダーの読み上げ（aria-valuetext）で同じものを使う。 */
const FORMATS = Object.freeze({
  seconds: (ms, lang) => say({ ja: "{n}秒", en: "{n} s" }, lang, { n: localNumber(Number((ms / 1000).toFixed(2)), lang) }),
  percent: (ratio) => `${Math.round(ratio * 100)}%`,
  times: (count, lang) => say({ ja: "{n}回", en: "{n} {n:time|times}" }, lang, { n: count }),
  perMinute: (count, lang) => say({ ja: "1分に{n}回", en: "{n} per minute" }, lang, { n: count }),
  onOff: (on, lang) => say(on ? { ja: "オン", en: "On" } : { ja: "オフ", en: "Off" }, lang),
  plain: (value) => String(value),
});

const PROTOCOL = MEASUREMENT_PROTOCOL;

/**
 * 利用者の世界の辞書の文を、支援者の画面の言葉で（日本語は漢字の表記）。
 * key を付けておくと、3つ目からの言語は say が辞書のその言語の文を引く。
 */
function both(key) {
  return { ja: translate(key, "kanji"), en: translate(key, "en"), key };
}

/** 日本語の分かち書きの空白を詰めた組（「」の中に入れるとき）。 */
const tight = (pair) => ({ ...pair, ja: pair.ja.replace(/\s+/g, "") });

/** 雰囲気の名前と説明は、遊びの舞台と同じ辞書のキー（atmosphere.js）。 */
function atmosphereDescription(level, lang = "ja") {
  const profile = Object.hasOwn(ATMOSPHERES, level) ? ATMOSPHERES[level] : ATMOSPHERES.none;
  return say(both(profile.description), lang);
}

/** 「あそびごとの既定」（null）の選択肢の名前。 */
const GAME_DEFAULT = { ja: "あそびごとの既定", en: "Game default" };

const slotCorner = both("tile.slot-corner.title");
const craneCorner = both("tile.crane-corner.title");
const slotOne = both("tile.slot-l1.title");
const slotThree = both("tile.slot-l2.title");

export const SETTING_DEFINITIONS = Object.freeze({
  // 言語は「よく使う設定」の いちばん上（2026-10-02）。どちらの言葉の画面でも見つけられるよう、
  // 名前は2つの言葉を並べ、選択肢はそれぞれの言葉で書く。
  textMode: {
    type: "select",
    label: { ja: "言語 / Language", en: "Language / 言語" },
    hint: { ja: "遊びと支援者の画面の言葉を選びます。", en: "Choose the language for the games and the supporter screens." },
    // 選択肢は言語の一覧（locales/index.js）から。名前は、その言語での呼び名。
    options: LANGUAGES.map((language) => [language.mode, language.name]),
    // 以前の kanji / kana が保存された端末は、選べる表記（ruby）へ読み替える。
    resolve: resolveTextMode,
  },
  fxLevel: {
    type: "select",
    label: { ja: "遊びの雰囲気", en: "Play atmosphere" },
    hint: {
      ja: "世界の動きや、押したとき・できたときのお祝いを選びます。",
      en: "Choose how lively the world is and how pressing and finishing are celebrated.",
    },
    options: Object.values(ATMOSPHERES).map((profile) => [profile.level, both(profile.label)]),
    description: atmosphereDescription,
  },
  speechEnabled: {
    type: "checkbox",
    label: { ja: "声で読み上げる", en: "Read aloud" },
    hint: { ja: "説明やほめ言葉を声で読みます。", en: "Reads the instructions and praise aloud." },
    format: "onOff",
  },
  soundEnabled: {
    type: "checkbox",
    label: { ja: "効果音", en: "Sound effects" },
    hint: {
      ja: "押した音や拍手を鳴らします。遊びの合図は切れません。",
      en: "Plays press sounds and applause. The cues of the games are never muted.",
    },
    format: "onOff",
  },
  scanInterval: {
    type: "range",
    label: { ja: "枠が動く速さ", en: "Highlight speed" },
    hint: { ja: "次の遊びへ枠が移るまでの時間です。", en: "Time before the highlight moves to the next item." },
    min: 800,
    max: 3200,
    step: 100,
    format: "seconds",
  },
  largeText: {
    type: "checkbox",
    label: { ja: "大きい文字", en: "Large text" },
    hint: { ja: "画面の文字を大きくします。", en: "Makes the text on screen larger." },
    format: "onOff",
  },
  hideVisualTasks: {
    type: "checkbox",
    label: { ja: "画面をよく見る遊びを隠す", en: "Hide games that need close watching" },
    hint: {
      ja: "「{slot}」と「{crane}」をホームから隠します。",
      en: "Hides “{slot}” and “{crane}” from the home screen.",
      values: { slot: slotCorner, crane: craneCorner },
    },
    format: "onOff",
  },

  switchControlMode: {
    type: "checkbox",
    label: { ja: "iPad のスイッチコントロールを使う", en: "Use iPad Switch Control" },
    hint: {
      ja: "iPad 本体のスイッチコントロールを使うときだけオン。",
      en: "Turn on only when using the iPad's own Switch Control.",
    },
    format: "onOff",
  },
  autoScan: {
    type: "checkbox",
    label: { ja: "枠を自動で動かす", en: "Move the highlight automatically" },
    hint: {
      ja: "利用者の画面で、黄色い枠を自動で動かします。",
      en: "Moves the yellow highlight automatically on the player's screens.",
    },
    format: "onOff",
  },
  scanFeedback: {
    type: "select",
    label: { ja: "枠が動いたときの音", en: "Sound when the highlight moves" },
    hint: {
      ja: "枠が移るたびに音や遊びの名前で知らせます。",
      en: "Each move is announced with a sound or the name of the item.",
    },
    options: [
      ["none", { ja: "なし", en: "None" }],
      ["tick", { ja: "小さな音", en: "A small sound" }],
      ["speak", { ja: "名前を読む", en: "Read the name" }],
    ],
  },
  showScreenSwitch: {
    type: "checkbox",
    label: { ja: "画面に「おす」ボタンを出す", en: "Show an on-screen “Press” button" },
    hint: { ja: "画面のボタンをスイッチのかわりに使います。", en: "Use the button on the screen instead of a switch." },
    format: "onOff",
  },

  highContrast: {
    type: "checkbox",
    label: { ja: "くっきり表示", en: "High contrast" },
    hint: { ja: "枠と文字の色の差を強くします。", en: "Strengthens the colour difference of frames and text." },
    format: "onOff",
  },
  speechVolume: {
    type: "range",
    label: { ja: "読み上げの声の大きさ", en: "Voice volume" },
    hint: { ja: "アプリの声だけの音量です。", en: "The volume of the app's voice only." },
    min: 0.2,
    max: 1,
    step: 0.1,
    format: "percent",
  },
  speechVoice: {
    type: "select",
    label: { ja: "読み上げの声", en: "Voice" },
    hint: { ja: "アプリに入れた声か、端末の声を選びます。", en: "Choose the voice built into the app or the device's voice." },
    options: [
      ["app", { ja: "アプリの声", en: "App voice" }],
      ["device", { ja: "端末の声", en: "Device voice" }],
    ],
  },

  // 押せば必ず当たる（2026-11-04 に訪問先の学校で頼まれた段階）。どの遊びにも効く1つの切り替え。
  // 速さ・広さの項目より前に置く（遊びの中の「この遊びの設定」は、この表の順に出る）。
  sureHit: {
    type: "checkbox",
    label: { ja: "押せば必ず当たる", en: "Every press wins" },
    hint: {
      ja: "どこで押しても当たりになります。",
      en: "Any press counts as a win, whenever it is pressed.",
    },
    format: "onOff",
    measured: true,
    // difficultyMode.js の resolveSureHit が、そくていでは必ず切る。
    protocol: false,
    inGame: [...SURE_HIT_GAMES],
  },

  slotCycleMs: {
    type: "range",
    label: { ja: "絵が回る速さ", en: "Spin speed" },
    hint: { ja: "絵が1周する時間。長いほどゆっくりです。", en: "Time for one full turn. Longer is slower." },
    min: 2800,
    // 2026-10-21 に 6000 から広げた（施設の試用で「もっと遅くできる設定が欲しい」）。
    // 2026-11-25 に 9600 から広げた（タイミングの遊びを一段階遅く。src/lib/timingLevels.js）。
    // 記録の sanitize（games/slotState.js）が受け取るのも 12000 まで。
    max: 12000,
    step: 100,
    format: "seconds",
    preset: slotPresets["slot-l1"].cycleMs,
    measured: true,
    protocol: PROTOCOL.slot["slot-l1"].cycleMs,
    inGame: ["slot-l1", "slot-l2"],
  },
  slotToleranceMs: {
    type: "range",
    label: { ja: "「合った」にする広さ", en: "Match window" },
    hint: {
      ja: "目標の前後の広さ。広いほどやさしくなります。",
      en: "How far before and after the target still counts. Wider is easier.",
    },
    min: 60,
    // 2026-10-21 に 220 から広げた（「幅がさらに広くなる設定が欲しい」）。実際の広さは、
    // となりの絵と取り違えない上限（1周の 1/12。difficultyMode.js の resolveSlotDifficulty）
    // で頭を押さえる。ふつうの速さ（3.2秒）なら 266ms まで、ゆっくりにすると広がる。
    max: 600,
    step: 10,
    format: "seconds",
    preset: slotPresets["slot-l1"].toleranceMs,
    measured: true,
    protocol: PROTOCOL.slot["slot-l1"].toleranceMs,
    inGame: ["slot-l1", "slot-l2"],
  },
  slotL1Rounds: {
    type: "range",
    label: { ja: "「{game}」の回数", en: "Rounds of “{game}”", values: { game: tight(slotOne) } },
    hint: { ja: "1列の絵を止める回数です。", en: "How many times one column is stopped." },
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
    label: { ja: "「{game}」の回数", en: "Rounds of “{game}”", values: { game: tight(slotThree) } },
    hint: { ja: "3列を順番に止める回数です。", en: "How many times the three columns are stopped in order." },
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
    label: { ja: "音の速さ（テンポ）", en: "Tempo" },
    hint: { ja: "1分に鳴る音の数。少ないほどゆっくりです。", en: "Notes per minute. Fewer is slower." },
    options: [
      ["", GAME_DEFAULT],
      // 20 は 2026-11-25 に足した（タイミングの遊びを一段階遅く。src/lib/timingLevels.js）。
      ["20", { ja: "20（とてもゆっくり）", en: "20 (very slow)" }],
      ["30", "30"],
      ["40", "40"],
      ["50", "50"],
      ["60", "60"],
      ["80", { ja: "80（はやめ）", en: "80 (fast)" }],
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
    label: { ja: "1回に鳴る音の数", en: "Notes per round" },
    hint: { ja: "1回の遊びで鳴る音の数です。", en: "How many notes play in one round." },
    options: [
      ["", GAME_DEFAULT],
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
    label: { ja: "次の音が来る場所を画面に出す", en: "Show where the next note comes" },
    hint: { ja: "次の拍を予告します。そくていでは出ません。", en: "Previews the next beat. Never shown in measured runs." },
    format: "onOff",
    measured: true,
    // difficultyMode.js の allowsVisualGuidance が、そくていでは必ず切る。
    protocol: false,
  },

  craneSweepMs: {
    type: "range",
    label: { ja: "アームの速さ", en: "Claw speed" },
    hint: { ja: "端から端までの時間。長いほどゆっくりです。", en: "Time from one end to the other. Longer is slower." },
    min: 800,
    // 2026-11-25 に 6000 から広げた（「アームはいちばん遅くしても速い」）。記録の sanitize
    // （state.js の sanitizeScanSession）が受け取るのも 10000 まで。
    max: 10000,
    step: 100,
    format: "seconds",
    preset: cranePresets.sweepMs,
    measured: true,
    protocol: PROTOCOL.crane.sweepMs,
    inGame: ["crane"],
  },
  craneToleranceR: {
    type: "range",
    label: { ja: "つかめる広さ", en: "Grab range" },
    hint: { ja: "ねらいからのずれの許容幅です。", en: "How far off the target still counts as a grab." },
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
    label: { ja: "1回にアームを下ろす回数", en: "Grabs per round" },
    hint: { ja: "1回の遊びでアームを下ろす回数です。", en: "How many times the claw goes down in one round." },
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
    label: { ja: "ねらいの上で音を鳴らす", en: "Beep over the target" },
    hint: {
      ja: "ねらいの上を通ると音が鳴り、耳でも狙えます。",
      en: "A sound plays when the claw passes over the target, so it can be aimed by ear.",
    },
    format: "onOff",
    measured: true,
    // difficultyMode.js の resolveCraneDifficulty が、そくていでは必ず切る。
    protocol: false,
  },

  fishingLimitMs: {
    type: "select",
    label: { ja: "アタリが続く長さ", en: "Bite duration" },
    hint: { ja: "魚が逃げるまでの時間です。", en: "Time before the fish gets away." },
    options: [
      // 2026-11-25 に一段階ずつ長くした（タイミングの遊びを一段階遅く。src/lib/timingLevels.js）。
      ["", { ja: "ふつう（3秒）", en: "Normal (3 s)" }],
      ["4500", { ja: "ながい（4.5秒）", en: "Long (4.5 s)" }],
      ["6000", { ja: "とても ながい（6秒）", en: "Very long (6 s)" }],
      ["2000", { ja: "みじかい（2秒）", en: "Short (2 s)" }],
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
    label: { ja: "れんしゅう／そくてい", en: "Practice / Measure" },
    hint: {
      ja: "そくていでは、遊びの速さ・回数・手がかりが固定されます。",
      en: "In measured runs, the speed, rounds and cues of the games are fixed.",
    },
    options: [
      ["practice", { ja: "れんしゅう（訓練・調整できる）", en: "Practice (training, adjustable)" }],
      ["measure", { ja: "そくてい（研究・固定）", en: "Measure (research, fixed)" }],
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
export function describeSettingValue(key, value, lang = "ja") {
  const definition = SETTING_DEFINITIONS[key];
  if (definition.options) {
    const found = definition.options.find(([optionValue]) => optionValue === String(value ?? ""));
    if (found) return say(found[1], lang);
  }
  const shown = value ?? definition.preset;
  const format = FORMATS[definition.format] || FORMATS.plain;
  return shown == null ? "" : format(shown, lang);
}

/** そくていの回に使われる値の文（「3.2秒」）。固定されない項目は ""。 */
export function protocolText(key, lang = "ja") {
  const definition = SETTING_DEFINITIONS[key];
  if (!definition.measured) return "";
  const format = FORMATS[definition.format] || FORMATS.plain;
  return format(definition.protocol, lang);
}
