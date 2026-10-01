// 支援者向けの説明書（設定画面の「はじめての方へ」と、印刷用の public/guide.html）。
//
// 2か所に手で書いていたので、設定画面を作り直したあとも印刷用だけが消えた4つのタブで
// 説明していた。いまは src/lib/supporterGuide.js の1か所から作る。ここでは、
//   - 印刷用のファイルが作り直し忘れで古いままになっていないこと
//   - 説明書が、いまの設定画面の名前・並び・雰囲気の説明をそのまま使っていること
//   - 消えたタブの名前で道順を書いていないこと
// を確かめる。
//
//   node tests/supporter-guide.test.mjs

import assert from "node:assert/strict";
import { ATMOSPHERE_LEVELS, ATMOSPHERES } from "../src/lib/atmosphere.js";
import { translate } from "../src/lib/i18n.js";
import { PLAY_DETAILS, SETTINGS_GROUPS, settingPath, settingsGroup } from "../src/lib/settingsFields.js";
import { supporterGuideHtml } from "../src/lib/supporterGuide.js";
import { readCommittedGuide, renderPrintableGuide } from "../scripts/generate-guide.mjs";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const questions = (html) => [...html.matchAll(/<dt>(.*?)<\/dt>/g)].map((match) => match[1]);

await test("the printable guide is regenerated from the shared guide", async () => {
  assert.equal(
    await readCommittedGuide(),
    await renderPrintableGuide(),
    "public/guide.html が古い。node scripts/generate-guide.mjs で作り直す"
  );
});

await test("the app guide and the printable guide say the same things", () => {
  const app = supporterGuideHtml();
  const print = supporterGuideHtml({ print: true });
  assert.deepEqual(questions(app), questions(print), "こまったときの問いが同じ");
  assert.ok(questions(app).length >= 8);
  // 絵と表は印刷用だけ。文は同じ。
  assert.ok(print.includes('class="screen'), "印刷用には画面の絵がある");
  assert.ok(!app.includes('class="screen'), "アプリの中には絵を入れない");
  // 段落・項目・問いと答えの1つずつが、印刷用にも同じ字で入っている（見出しの番号・絵・
  // 遊びの表と一覧の組み方だけが違う）。
  const blocks = (html) =>
    [...html.replace(/<ol class="guide-games">[\s\S]*?<\/ol>/, "").matchAll(/<(p|li|dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .map((match) => textOf(match[2]).trim())
      .filter(Boolean);
  const printText = textOf(print);
  const appBlocks = blocks(app);
  assert.ok(appBlocks.length > 20);
  appBlocks.forEach((block) => assert.ok(printText.includes(block), `印刷用にもある: ${block}`));
});

await test("the guide uses the settings screen's own names, order and atmosphere texts", () => {
  const text = textOf(supporterGuideHtml());
  const common = settingsGroup("common");
  common.fields.forEach((field) => {
    assert.ok(text.includes(field.label), `よく使う設定: ${field.label}`);
    assert.ok(text.includes(field.hint), `よく使う設定の説明: ${field.hint}`);
  });
  SETTINGS_GROUPS.filter((group) => !PLAY_DETAILS.groups.includes(group.id)).forEach((group) => {
    assert.ok(text.includes(group.title), `見出し: ${group.title}`);
  });
  assert.ok(text.includes(PLAY_DETAILS.title));
  ATMOSPHERE_LEVELS.forEach((level) => {
    assert.ok(text.includes(translate(ATMOSPHERES[level].label, "kanji")), `雰囲気の名前: ${level}`);
    assert.ok(text.includes(translate(ATMOSPHERES[level].description, "kanji")), `雰囲気の説明: ${level}`);
  });
  ["autoScan", "scanInterval", "scanFeedback", "fxLevel", "soundEnabled", "speechEnabled", "speechVolume", "difficultyMode"].forEach((key) => {
    assert.ok(text.includes(settingPath(key)), `こまったときの道順: ${settingPath(key)}`);
  });
  assert.ok(text.includes("既定に戻す"), "元に戻す方法を書く");
});

await test("no directions through the four tabs that are gone", () => {
  const text = textOf(supporterGuideHtml({ print: true }));
  for (const old of ["「スイッチ」→", "「見え方・音」→", "「むずかしさ」", "そくてい（研究）", "研究者モード"]) {
    assert.ok(!text.includes(old), `古い道順が残っている: ${old}`);
  }
  assert.ok(!/練習／測定|測定（研究/.test(text), "回の名前は れんしゅう／そくてい");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("supporter guide tests passed");
