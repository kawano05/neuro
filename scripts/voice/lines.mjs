// =====================================================================
// scripts/voice/lines.mjs — アプリが声に出す文を、かたまりごとに全部あげる
//
//   node scripts/voice/lines.mjs          … scripts/voice/lines.json を書き直す
//
// 声のパック（src/assets/voice/。src/lib/voicePack.js）に入れる音の一覧。
// アプリの読み上げと同じ関数（translate → speechLangForText → toSpeechText →
// splitSpeechChunks）を通すので、ここに出たかたまりは、アプリでもそのまま引ける。
//
// 声に出るのは次のもの（audio.js の speak を通るものだけ。announce＝画面読み上げ
// 機能向けの文は、端末の読み上げ機能が読むので入れない）:
//   - 枠が動いたときの名前（設定「枠が動いたときの音」が「読み上げ」のとき）
//   - 遊びの前の説明（題名と手順。gameHost の renderReady）
//   - 遊びの中の声（voiceFeedback）と、できたときの「やったー」（celebrate）
//   - 学ぶ・伝える（せいかい・ことば）
// 数の入る文は、その数がとりうる範囲をぜんぶ作る（下の表）。範囲の外の数は、
// アプリが端末の声で読む（音が無いときの決まり）。
//
// 文言（src/lib/i18n.js・content.js）を直したら、これと generate.py を走らせる。
// tests/voice-pack.test.mjs が、ここで出る一覧とパックの中身が合っているかを見る。
// =====================================================================

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PHRASE_EN, cranePrizes, gameHowTo, letterTasks, matchingTasks, phraseCategories } from "../../src/lib/content.js";
import { BEGINNER_TARGET_PRESSES } from "../../src/lib/games/beginnerKit.js";
import { COLOR_TARGET_PRESSES } from "../../src/lib/games/colorLegacy.js";
import { allStringKeys, joinSpeech, speechLangForText, toSpeechText, translate } from "../../src/lib/i18n.js";
import { splitSpeechChunks, voiceLang } from "../../src/lib/voicePack.js";

/** 表記（利用者が選べるもの）。ふりがな付き漢字は日本語、English は英語で読む。 */
export const VOICE_TEXT_MODES = ["ruby", "en"];

/** 数の範囲（両端を含む）。 */
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

/**
 * 数の入る声の範囲。遊びの設定の上限に合わせる（state.js の sanitize）。
 *   アームでつかむ … 1回の遊びは最大15回。ずっと止める（エンドレス）はもっと続くので30まで
 *   さかなつり … 1回の遊びは最大30回
 *   リール … ひとつ止めるは最大20回
 */
export const VOICE_COUNT_LIMITS = {
  craneGrips: 30,
  fishingCatches: 30,
  slotHits: 20,
};

function animalNames(t) {
  return allStringKeys()
    .filter((key) => key.startsWith("animal."))
    .map((key) => t(key));
}

function prizeNames(t) {
  return cranePrizes.map((prize) => {
    const key = `prize.${prize.id}`;
    const name = t(key);
    return name === key ? prize.label : name;
  });
}

/**
 * ある表記で、アプリが speak に渡しうる文を全部あげる。
 * @returns {Array<{text: string, from: string}>}
 */
export function spokenTexts(mode) {
  const t = (key, values) => translate(key, mode, values);
  const out = [];
  const say = (text, from) => out.push({ text, from });
  const join = (parts, from) => say(joinSpeech(parts, mode), from);
  const keys = allStringKeys();

  // --- 枠が動いたときの名前（scan.js の sayTarget。名前は aria-label か、ふりがなを除いた字）
  keys.filter((key) => /^tile\..+\.title$/.test(key)).forEach((key) => say(t(key), key));
  ["home.back", "home.nextPage", "start.begin", "game.exit", "game.settings", "result.retry", "result.home", "learn.next", "learn.again"].forEach(
    (key) => say(t(key), key)
  );
  const english = mode === "en";
  Object.entries(phraseCategories).forEach(([category, phrases]) => {
    say((english && PHRASE_EN[category]) || category, "voca.category");
    // ことばは、選ぶと声で伝える（voca.js の spoken）。名前と同じ文。
    phrases.forEach((phrase) => say((english && PHRASE_EN[phrase]) || phrase, "voca.phrase"));
  });
  letterTasks.forEach((task) => task.options.forEach((letter) => say(letter, "letters.option")));
  matchingTasks.forEach((task) => task.options.forEach((option) => say(option.label, "matching.option")));

  // --- 遊びの前の説明（gameHost の renderReady: 題名と手順を joinSpeech でつなぐ）。
  // つないだ文のかたまりは、1つずつ joinSpeech したものと同じになる（文の終わりに
  // 句点を足してからつなぐため）。
  keys.filter((key) => /^tile\..+\.title$/.test(key)).forEach((key) => join([t(key)], `${key} (ready)`));
  const howtoKeys = new Set([
    ...Object.values(gameHowTo).flat(),
    ...keys.filter((key) => key.startsWith("howto.")),
  ]);
  howtoKeys.forEach((key) => join([t(key)], key));

  // --- 遊びの中の声
  const cheer = t("color.voice.cheer");
  const celebrateWith = (doneText, from) => {
    // celebrate（beginnerKit.js）: おいわいが「なし」なら done の文だけ、それ以外は「やったー！」から。
    join([doneText], from);
    join([cheer, doneText], `${from} + cheer`);
  };
  range(1, BEGINNER_TARGET_PRESSES - 1).forEach((n) => say(t("balloon.voice.progress", { n }), "balloon.voice.progress"));
  celebrateWith(t("balloon.voice.finish", { n: BEGINNER_TARGET_PRESSES }), "balloon.voice.finish");
  range(1, BEGINNER_TARGET_PRESSES - 1).forEach((n) => say(t("coloring.voice.progress", { n }), "coloring.voice.progress"));
  animalNames(t).forEach((name) => celebrateWith(t("coloring.voice.finish", { name }), "coloring.voice.finish"));
  animalNames(t).forEach((name) =>
    range(1, COLOR_TARGET_PRESSES - 1).forEach((n) => say(t("color.voice.progress", { name, n }), "color.voice.progress"))
  );
  celebrateWith(t("color.voice.finish", { n: COLOR_TARGET_PRESSES }), "color.voice.finish");
  keys.filter((key) => key.startsWith("baseball.word.")).forEach((key) => say(t(key), key));
  range(1, BEGINNER_TARGET_PRESSES).forEach((h) => celebrateWith(t("baseball.voice.finish", { h }), "baseball.voice.finish"));
  celebrateWith(t("baseball.voice.finishNoHomerun"), "baseball.voice.finishNoHomerun");

  prizeNames(t).forEach((name) => say(t("crane.voice.grip", { name }), "crane.voice.grip"));
  say(t("crane.voice.slip"), "crane.voice.slip");
  say(t("crane.voice.miss"), "crane.voice.miss");
  range(1, VOICE_COUNT_LIMITS.craneGrips).forEach((n) => say(t("crane.voice.finish", { n }), "crane.voice.finish"));
  say(t("crane.voice.finishNone"), "crane.voice.finishNone");
  range(1, VOICE_COUNT_LIMITS.fishingCatches).forEach((n) => say(t("fishing.voice.finish", { n }), "fishing.voice.finish"));
  say(t("fishing.voice.finishNone"), "fishing.voice.finishNone");
  range(0, 100).forEach((n) => say(t("rhythm.voice.finish", { n }), "rhythm.voice.finish"));
  range(1, VOICE_COUNT_LIMITS.slotHits).forEach((hits) => say(t("slot.voice.finish", { hits }), "slot.voice.finish"));
  say(t("slot.voice.finishNone"), "slot.voice.finishNone");

  // --- 学ぶ・伝える
  say(t("learn.correct"), "learn.correct");
  say(t("learn.tryNext"), "learn.tryNext");
  return out;
}

/**
 * 声のパックに入れるかたまりの一覧。
 * @returns {{ja: Array<{text: string, from: string[]}>, en: Array<{text: string, from: string[]}>}}
 */
export function collectVoiceLines() {
  const byLang = { ja: new Map(), en: new Map() };
  for (const mode of VOICE_TEXT_MODES) {
    for (const { text, from } of spokenTexts(mode)) {
      const lang = speechLangForText(text, mode);
      const chunks = splitSpeechChunks(toSpeechText(text, lang), lang);
      const bucket = byLang[voiceLang(lang)];
      for (const chunk of chunks) {
        if (!bucket.has(chunk)) bucket.set(chunk, new Set());
        bucket.get(chunk).add(from);
      }
    }
  }
  const list = (bucket) =>
    [...bucket.entries()]
      .map(([text, from]) => ({ text, from: [...from].sort() }))
      .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  return { ja: list(byLang.ja), en: list(byLang.en) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lines = collectVoiceLines();
  const outPath = join(dirname(fileURLToPath(import.meta.url)), "lines.json");
  writeFileSync(outPath, `${JSON.stringify(lines, null, 1)}\n`, "utf8");
  console.log(`wrote ${outPath}: ja ${lines.ja.length}, en ${lines.en.length}`);
}
