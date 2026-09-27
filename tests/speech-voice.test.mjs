// 読み上げの声の選び方（src/lib/speechVoice.js）。
//
// iPhone / iPad は、声を指定しないと機械的な声（Eloquence の Eddy・Flo… や、
// おもちゃの声の Bells・Zarvox…）を選ぶことがあり、読み上げがたどたどしかった。
// 声の一覧は端末ごとに違い、実機でしか見られないので、選び方の規則を固定する。
//
//   node tests/speech-voice.test.mjs

import assert from "node:assert/strict";
import { isNaturalVoice, pickVoice, scoreVoice } from "../src/lib/speechVoice.js";

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

const voice = (name, lang, extra = {}) => ({ name, lang, localService: true, default: false, ...extra });

// iPad（iOS 17 以降）で実際に並ぶ種類の声。
const IPAD_VOICES = [
  voice("Eddy (日本語（日本）)", "ja-JP", { default: true }),
  voice("Flo (日本語（日本）)", "ja-JP"),
  voice("Grandma (日本語（日本）)", "ja-JP"),
  voice("Kyoko", "ja-JP"),
  voice("Otoya", "ja-JP"),
  voice("Rocko (英語（米国）)", "en-US"),
  voice("Zarvox", "en-US"),
  voice("Bells", "en-US"),
  voice("Samantha", "en-US"),
  voice("Daniel", "en-GB"),
];

test("never picks the toy or Eloquence voices", () => {
  assert.equal(isNaturalVoice(voice("Eddy (日本語（日本）)", "ja-JP")), false);
  assert.equal(isNaturalVoice(voice("Zarvox", "en-US")), false);
  assert.equal(isNaturalVoice(voice("Kyoko", "ja-JP")), true);
  assert.equal(pickVoice(IPAD_VOICES, "ja-JP").name, "Kyoko");
  assert.equal(pickVoice(IPAD_VOICES, "en-US").name, "Samantha");
});

test("prefers an enhanced or premium voice when one is installed", () => {
  const voices = [...IPAD_VOICES, voice("Kyoko（拡張）", "ja-JP"), voice("O-Ren (Premium)", "ja-JP")];
  assert.equal(pickVoice(voices, "ja-JP").name, "O-Ren (Premium)");
  const enhancedOnly = [...IPAD_VOICES, voice("Samantha (Enhanced)", "en-US")];
  assert.equal(pickVoice(enhancedOnly, "en-US").name, "Samantha (Enhanced)");
});

test("keeps to the language, and prefers voices that work offline", () => {
  const desktop = [
    voice("Microsoft Haruka - Japanese (Japan)", "ja-JP"),
    voice("Google 日本語", "ja-JP", { localService: false }),
    voice("Microsoft Zira - English (United States)", "en-US"),
  ];
  // 病院・施設ではネットにつながらないことがあるので、端末の中の声を先に使う。
  assert.equal(pickVoice(desktop, "ja-JP").name, "Microsoft Haruka - Japanese (Japan)");
  assert.equal(pickVoice(desktop, "en-US").name, "Microsoft Zira - English (United States)");
  // 英語の声しか無い端末で、日本語に英語の声を当てない（既定に任せる）。
  assert.equal(pickVoice([voice("Samantha", "en-US")], "ja-JP"), null);
  assert.equal(pickVoice([], "ja-JP"), null);
  // 言語コードの書き方の違い（ja_JP）は同じ言語として扱う。
  assert.equal(pickVoice([voice("Kyoko", "ja_JP")], "ja-JP").name, "Kyoko");
});

test("an exact region beats another region of the same language", () => {
  const voices = [voice("Daniel", "en-GB"), voice("Karen", "en-AU"), voice("Tom", "en-US")];
  assert.ok(scoreVoice(voices[2], "en-US") > scoreVoice(voices[0], "en-US"));
  assert.equal(pickVoice(voices, "en-US").name, "Tom");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("speech voice tests passed");
