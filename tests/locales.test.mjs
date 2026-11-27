// 3つ目からの言語（src/lib/locales/）の仕組みと、訳の抜け。
//
// 訳が抜けても画面は出つづける（英語に落ちる）ので、その言語を読めない人が画面を見ていても
// 気づけない。ここは次の3つを見る。
//   1. 訳が無い文は英語で出る（日本語へは落ちない）
//   2. 支援者の世界の文は、どれも {ja, en} の組の「決まった英語の文」で書いてある
//      （式で組み立てた英語は、訳を鍵で引けない）
//   3. 足した言語のファイルに、抜け・使っていない訳・穴（{n}）の食い違いが無い
//
//   node tests/locales.test.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 検査用の にせの言語（訳は一部だけ）。言語の一覧は読み込むときに決まるので、読み込む前に足す。
globalThis.__NN_EXTRA_LOCALES__ = [
  {
    code: "zz",
    mode: "zz",
    name: "Zzz",
    htmlLang: "zz",
    speech: "zz-ZZ",
    dateLocale: "en-GB",
    voicePack: false,
    strings: { "home.title": "ZZ pick" },
    phrases: {
      "Highlight speed": "ZZ speed",
      "{n} {n:time|times}": "{n}× ZZ",
      "Reset “{title}”": "ZZ reset «{title}»",
      "“{text}”": "«{text}»",
      Apple: "ZZ apple",
    },
    letterTasks: [{ prompt: "ZZ?", answer: "Z", options: ["Z", "Y"] }],
  },
];

const { LANGUAGES, guideFileName, languageOfMode } = await import("../src/lib/locales/index.js");
const { SELECTABLE_TEXT_MODES, TEXT_MODES, resolveTextMode, speechLangFor, translate } = await import("../src/lib/i18n.js");
const { say, supporterLang } = await import("../src/lib/supporterText.js");
const { SETTING_DEFINITIONS, describeSettingValue } = await import("../src/lib/settingDefinitions.js");
const { SETTINGS_GROUPS, settingPath } = await import("../src/lib/settingsFields.js");
const { learnLabel, letterTasksFor, matchingPrompt, phraseText } = await import("../src/lib/learnText.js");
const { matchingTasks } = await import("../src/lib/content.js");
const { describeSessionConditions } = await import("../src/lib/sessionConditions.js");
const { auditCatalog, collectPairs, placeholderNames, translationSource } = await import("../scripts/i18n-source.mjs");

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

const JAPANESE = /[぀-ヿ一-龠]/;
const source = await translationSource();

test("足した言語は、選べる表記・記録の表記・読み上げの言語に入る", () => {
  assert.ok(SELECTABLE_TEXT_MODES.has("zz"));
  assert.ok(TEXT_MODES.has("zz"));
  assert.equal(resolveTextMode({ textMode: "zz" }), "zz");
  assert.equal(supporterLang({ textMode: "zz" }), "zz");
  assert.equal(speechLangFor("zz"), "zz-ZZ");
  assert.equal(guideFileName("zz"), "guide-zz.html");
  assert.equal(guideFileName("ja"), "guide.html");
  assert.deepEqual(SETTING_DEFINITIONS.textMode.options.map(([mode]) => mode), LANGUAGES.map((language) => language.mode));
});

test("ルビ・漢字・かな・知らない値は日本語", () => {
  for (const mode of ["ruby", "kanji", "kana", "??", undefined]) assert.equal(languageOfMode(mode), "ja");
  assert.equal(supporterLang({ textMode: "kana" }), "ja");
  assert.equal(supporterLang({ textMode: "??" }), "ja");
});

test("利用者の世界の辞書: 訳があれば訳、無ければ英語（日本語へは落ちない）", () => {
  assert.equal(translate("home.title", "zz"), "ZZ pick");
  assert.equal(translate("home.eyebrow", "zz"), translate("home.eyebrow", "en"));
  for (const key of Object.keys(source.strings)) {
    const text = translate(key, "zz");
    // 英語の文そのものが日本語を含む鍵（言語の名前など）は除く。
    if (!JAPANESE.test(source.strings[key])) assert.ok(!JAPANESE.test(text), `${key}: 日本語が出た「${text}」`);
  }
});

test("支援者の世界の文: 訳 → 英語 → 日本語の順", () => {
  assert.equal(say({ ja: "枠が動く速さ", en: "Highlight speed" }, "zz"), "ZZ speed");
  assert.equal(say({ ja: "効果音", en: "Sound effects" }, "zz"), "Sound effects");
  assert.equal(say({ ja: "日本語だけ" }, "zz"), "日本語だけ");
  assert.equal(say({ ja: "効果音", en: "Sound effects" }, "ja"), "効果音");
  assert.equal(say({ ja: "効果音", en: "Sound effects" }, "en"), "Sound effects");
});

test("穴あきの文: 訳の側で語順を変えられ、値が組なら その言語の文になる", () => {
  assert.equal(describeSettingValue("slotL1Rounds", 3, "zz"), "3× ZZ");
  assert.equal(describeSettingValue("slotL1Rounds", 1, "en"), "1 time");
  // 辞書から作った組（key つき）は、辞書のその言語の文（ここでは訳が無いので英語）。
  const slot = SETTINGS_GROUPS.find((group) => group.id === "slot");
  assert.equal(say(slot.reset, "zz"), `ZZ reset «${translate("tile.slot-corner.title", "en")}»`);
  assert.match(settingPath("scanInterval", "zz"), /^«.+» → «ZZ speed»$/);
});

test("学ぶ・伝える: 札と問いは訳 → 英語、文字の課題は その言語のもの", () => {
  assert.equal(learnLabel("りんご", "zz"), "ZZ apple");
  assert.equal(learnLabel("そら", "zz"), "Sky");
  assert.equal(learnLabel("りんご", "ja"), "りんご");
  assert.equal(matchingPrompt(matchingTasks[0], "zz"), matchingTasks[0].promptEn);
  assert.equal(matchingPrompt(matchingTasks[0], "ja"), null);
  assert.equal(phraseText("はい", "zz"), "Yes");
  assert.equal(phraseText("はい", "ja"), null);
  assert.equal(letterTasksFor("zz")[0].answer, "Z");
  assert.equal(letterTasksFor("en")[0].answer, "A");
  assert.equal(letterTasksFor("ja")[0].answer, "あ");
});

test("記録を束ねる鍵は、言語を足しても日本語のまま", () => {
  const session = { taskType: "slot", gameId: "slot-l1", config: { cycleMs: 4800, toleranceMs: 220, rounds: 3, reelCount: 1 } };
  assert.equal(describeSessionConditions(session), "1周 4800ms / 合う幅 ±220ms / 3ラウンド / 1本");
  assert.ok(!JAPANESE.test(describeSessionConditions(session, "zz")));
});

test("支援者の世界の英語は、式で組み立てていない（訳を鍵で引けるように）", () => {
  const { dynamic } = collectPairs();
  assert.deepEqual(
    dynamic.map((pair) => `${pair.file}:${pair.line} ${pair.text}`),
    [],
    "英語を `…${x}…` や条件式で作っている組がある。{name} の穴あきの文にして、値は say の3つ目か values で渡す"
  );
});

test("「英語のとき」で分かれる所が無い（足した言語が日本語へ落ちないように）", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  // 英語そのものを扱う所だけは別（組から英語を取り出す・英語の課題を返す）。
  const allowed = new Set(["lib/supporterText.js", "lib/learnText.js", "lib/readinessCheck.js"]);
  const hits = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(js|svelte)$/.test(entry.name)) {
        const file = path.slice(root.length + 1).replaceAll("\\", "/");
        if (allowed.has(file)) continue;
        readFileSync(path, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (/[!=]==\s*"en"/.test(line)) hits.push(`${file}:${index + 1} ${line.trim()}`);
          });
      }
    }
  };
  visit(root);
  assert.deepEqual(hits, [], '`=== "en"` で分かれている。{ja, en} の組にするか、`lang === "ja"` で分ける');
});

test("抜けを見つける道具は、抜け・使っていない訳・穴の食い違いを見つける", () => {
  assert.deepEqual(placeholderNames("{n} {n:time|times} {title}"), ["n", "title"]);
  const [firstKey, secondKey] = Object.keys(source.strings);
  const [firstPhrase] = source.phrases;
  const holed = source.phrases.find((english) => placeholderNames(english).length > 0);
  const complete = {
    strings: { ...source.strings },
    phrases: Object.fromEntries(source.phrases.map((english) => [english, english])),
  };
  assert.deepEqual(
    auditCatalog(complete, source),
    { missingStrings: [], extraStrings: [], missingPhrases: [], extraPhrases: [], placeholderMismatch: [] },
    "抜けの無いファイルを、抜けがあると言っている"
  );
  const broken = structuredClone(complete);
  delete broken.strings[firstKey];
  broken.strings["no.such.key"] = "x";
  delete broken.phrases[firstPhrase === holed ? source.phrases[1] : firstPhrase];
  broken.phrases["An English sentence nobody uses"] = "x";
  broken.phrases[holed] = "the holes are gone";
  const audit = auditCatalog(broken, source);
  assert.deepEqual(audit.missingStrings, [firstKey]);
  assert.deepEqual(audit.extraStrings, ["no.such.key"]);
  assert.deepEqual(audit.missingPhrases, [firstPhrase === holed ? source.phrases[1] : firstPhrase]);
  assert.deepEqual(audit.extraPhrases, ["An English sentence nobody uses"]);
  assert.deepEqual(audit.placeholderMismatch, [holed]);
  assert.ok(secondKey);
});

// 足した言語（日本語・英語・検査用の にせの言語のほか）のファイル。
for (const catalog of LANGUAGES.filter((language) => !["ja", "en", "zz"].includes(language.code) && !language.pseudo)) {
  test(`${catalog.code}: 訳の抜け・使っていない訳・穴の食い違いが無い`, () => {
    const audit = auditCatalog(catalog, source);
    const hint = `node scripts/i18n-todo.mjs ${catalog.code} で、足りない文が出る`;
    assert.deepEqual(audit.missingStrings, [], `辞書の訳が足りない。${hint}`);
    assert.deepEqual(audit.missingPhrases, [], `文の訳が足りない。${hint}`);
    assert.deepEqual(audit.extraStrings, [], "辞書に無い鍵の訳がある（鍵が変わったか、消えた）");
    assert.deepEqual(audit.extraPhrases, [], "もう使っていない英語の文の訳がある（英語の文が変わったか、消えた）");
    assert.deepEqual(audit.placeholderMismatch, [], "訳の穴（{n} など）が、英語の文と合っていない");
  });

  test(`${catalog.code}: 文字を えらぶ の課題は、日本語の課題と同じ数で、答えが選択肢の中にある`, () => {
    const tasks = letterTasksFor(catalog.code);
    assert.equal(tasks.length, letterTasksFor("ja").length);
    for (const task of tasks) {
      assert.ok(task.prompt && !JAPANESE.test(task.prompt), `問い: ${task.prompt}`);
      assert.ok(task.options.includes(task.answer), `答えが選択肢に無い: ${task.prompt}`);
    }
  });

  test(`${catalog.code}: 決まりごと（名前・ページの lang・読み上げ・日付）がそろっている`, () => {
    for (const field of ["code", "mode", "name", "htmlLang", "speech", "dateLocale"]) {
      assert.equal(typeof catalog[field], "string", field);
    }
    assert.equal(catalog.mode, catalog.code, "日本語のほかは、表記の値と言語の名前を同じにする");
    assert.equal(typeof catalog.voicePack, "boolean");
  });
}

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
