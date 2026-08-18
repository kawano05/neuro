// 表記モード（漢字 / ひらがな / 英語）。
//
// 文言の取り違えは画面を見れば分かるが、「キーが抜けたとき何が出るか」
// 「3つの表記が揃っているか」は見ても分からない。片方の表記だけ抜けていても
// 既定へ落ちて日本語が出るだけなので、英語モードのつもりで日本語が混ざる。
//
//   node tests/i18n.test.mjs

import assert from "node:assert/strict";
import {
  DEFAULT_TEXT_MODE,
  SELECTABLE_TEXT_MODES,
  TEXT_MODES,
  allStringKeys,
  entryFor,
  resolveTextMode,
  rubyToHtml,
  rubyToPlain,
  speechLangFor,
  translate,
  translateHtml,
} from "../src/lib/i18n.js";
import {
  activityTiles,
  cranePrizes,
  gameHowTo,
  gameTiles,
  fishingCornerTile,
  learningCornerTile,
  rhythmCornerTile,
} from "../src/lib/content.js";

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

test("defaults to ruby and folds the retired modes into it", () => {
  // 漢字とかなを別モードにするのをやめ、総ルビ1つに畳んだ。どちらの利用者も
  // 同じ画面で読めるので、支援者が表記を当てにいく必要がなくなる。
  assert.equal(DEFAULT_TEXT_MODE, "ruby");
  assert.equal(resolveTextMode({}), "ruby");
  assert.equal(resolveTextMode({ textMode: "ruby" }), "ruby");
  assert.equal(resolveTextMode({ textMode: "en" }), "en");
  // 以前の設定が保存されている端末は、ルビ付き漢字へ倒す（どちらの利用者も
  // 読める表記なので、読めない画面には落ちない）。
  assert.equal(resolveTextMode({ textMode: "kanji" }), "ruby");
  assert.equal(resolveTextMode({ textMode: "kana" }), "ruby");
  // 知らない値で「英語のつもりが日本語」が起きないよう既定へ倒す。
  assert.equal(resolveTextMode({ textMode: "romaji" }), "ruby");
  assert.equal(resolveTextMode(null), "ruby");
});

test("the retired modes stay valid as recorded conditions", () => {
  // textMode は測定条件（その回をどの表記で回したか）。もう選べないからと
  // いって記録から捨てると、過去の回の条件が消える。「選べる値」と
  // 「記録として妥当な値」は別。
  assert.ok(TEXT_MODES.has("kana"), "過去の記録の kana を捨てない");
  assert.ok(TEXT_MODES.has("kanji"), "過去の記録の kanji を捨てない");
  assert.ok(!SELECTABLE_TEXT_MODES.has("kana"), "kana はもう選べない");
  assert.ok(!SELECTABLE_TEXT_MODES.has("kanji"), "kanji はもう選べない");
  [...SELECTABLE_TEXT_MODES].forEach((mode) =>
    assert.ok(TEXT_MODES.has(mode), `選べる値は記録としても妥当であること: ${mode}`)
  );
});

test("ruby renders to markup for the screen and plain text for speech", () => {
  // 1つの記法から画面用と読み上げ用の両方を作る。2つを別々に持つと、
  // 片方だけ直して食い違う。
  assert.equal(rubyToPlain("低[ひく]い音[おと]"), "低い音");
  assert.equal(
    rubyToHtml("低[ひく]い"),
    '<ruby>低<rt aria-hidden="true">ひく</rt></ruby>い'
  );
  // ふりがなが乗るのは直前の漢字だけ。送りがなや助詞を巻き込むと、
  // 「おと」が「と音」の2文字にまたがって乗る（実際に踏んだ）。
  assert.equal(
    rubyToHtml("色[いろ]と音[おと]"),
    '<ruby>色<rt aria-hidden="true">いろ</rt></ruby>と<ruby>音<rt aria-hidden="true">おと</rt></ruby>'
  );
  // 数字や記号も巻き込まない。
  assert.equal(
    rubyToHtml("1分間[ぷんかん]"),
    '1<ruby>分間<rt aria-hidden="true">ぷんかん</rt></ruby>'
  );
  // ルビの無い文字列はそのまま通す。
  assert.equal(rubyToPlain("アタリ！"), "アタリ！");
  assert.equal(rubyToHtml("アタリ！"), "アタリ！");

  // translate は必ずプレーン（読み上げ・aria-label へ渡る側）。
  const plain = translate("stage.rhythm-l1", "ruby");
  assert.ok(!plain.includes("["), `読み上げにルビの記法が漏れている: ${plain}`);
  assert.ok(!plain.includes("<"), `読み上げにタグが漏れている: ${plain}`);
  // translateHtml は <ruby> を出す。
  const html = translateHtml("stage.rhythm-l1", "ruby");
  assert.ok(html.includes("<ruby>"), "画面用にはルビが出ること");
  assert.ok(!html.includes("["), "記法が生のまま残らないこと");
});

test("every ruby reading is kana only, and drops back to the kanji text", () => {
  // 読みに漢字が混ざっていると、ふりがなとして役に立たない（読めない字の
  // 上に読めない字が乗る）。
  const bad = [];
  allStringKeys().forEach((key) => {
    const ruby = entryFor(key).ruby;
    for (const match of String(ruby).matchAll(/\[([^\]]+)\]/g)) {
      if (/[一-龠]/.test(match[1])) bad.push(`${key}: ${match[1]}`);
    }
    // ルビを外したものは、漢字表記と一致していなければならない。ここがずれると
    // 「画面に出ている文と読み上げる文が違う」状態になる。
    assert.equal(
      rubyToPlain(ruby),
      entryFor(key).kanji,
      `${key}: ルビを外した文が漢字表記と違う`
    );
  });
  assert.deepEqual(bad, [], `読みに漢字が混ざっている: ${bad.join(", ")}`);
});

test("every kanji in the user's world carries a reading", () => {
  // 総ルビが要件なので、漢字が1字でも裸で残っていたら読めない利用者が出る。
  const bare = [];
  allStringKeys().forEach((key) => {
    // ルビの外側に残っている漢字を探す（`漢字[よみ]` の部分を消してから見る）。
    // 消しかたは rubyToHtml と同じ規則にする——ここだけ別の正規表現にすると、
    // 「テストは通るが画面では乗り方が違う」状態を見逃す。
    const outside = String(entryFor(key).ruby).replace(/[一-龠々ヶ]+\[[^\[\]]+\]/g, "");
    if (/[一-龠]/.test(outside)) bare.push(`${key}: ${outside.trim()}`);
  });
  assert.deepEqual(bare, [], `ふりがなの無い漢字: ${bare.join(" / ")}`);
});

test("every string carries all three scripts", () => {
  // 片方だけ抜けていると既定へ落ちて日本語が出る。英語モードのつもりで
  // 日本語が混ざっていても、画面を見るまで分からない。
  const missing = [];
  allStringKeys().forEach((key) => {
    const entry = entryFor(key);
    [...TEXT_MODES].forEach((mode) => {
      if (typeof entry[mode] !== "string") missing.push(`${key}.${mode}`);
    });
  });
  assert.deepEqual(missing, [], `表記が抜けている: ${missing.join(", ")}`);
});

test("english strings contain no Japanese characters", () => {
  // 英語モードに日本語が残っていると、そこだけ読めない利用者が出る。
  // 記号（★ や ！）は許すが、かな・漢字は許さない。
  const japanese = /[ぁ-んァ-ヶ一-龠]/;
  const leaked = allStringKeys().filter((key) => japanese.test(entryFor(key).en));
  assert.deepEqual(leaked, [], `英語に日本語が残っている: ${leaked.join(", ")}`);
});

test("kanji and kana differ where the writing actually differs", () => {
  // 全部が同じなら、モードを足した意味がない。カタカナ語や記号だけの
  // 文言（「リズム」「アタリ！」）は同じで正しいので、全体の割合で見る。
  const keys = allStringKeys();
  const differing = keys.filter((key) => entryFor(key).kanji !== entryFor(key).kana);
  assert.ok(
    differing.length > keys.length * 0.4,
    `漢字表記がひらがなと違うキーが少なすぎる（${differing.length}/${keys.length}）`
  );
});

test("looks up text and fills in values", () => {
  assert.equal(translate("scale.early", "kana"), "はやい");
  assert.equal(translate("scale.early", "kanji"), "はやい");
  assert.equal(translate("scale.early", "en"), "Early");
  assert.equal(translate("crane.score", "kana", { n: 3 }), "つかんだ 3");
  assert.equal(translate("crane.score", "en", { n: 3 }), "Caught 3");
  assert.equal(
    translate("home.pageOf", "en", { n: 1, total: 2 }),
    "Page 1 of 2"
  );
});

test("shows the key itself when a string is missing", () => {
  // 空文字を返すと「文言が消えた」ことに気づけない。キーが画面に出れば、
  // 抜けている場所がその場で分かる。
  assert.equal(translate("no.such.key", "kana"), "no.such.key");
  // 表記だけ欠けている場合は既定へ落ちる（キーそのものよりは読める）。
  assert.equal(translate("scale.early", "zz"), "はやい");
});

test("speaks in the language the text is written in", () => {
  // 英語表記のまま日本語音声で読むと、意味の通らない発音になる。
  assert.equal(speechLangFor("kana"), "ja-JP");
  assert.equal(speechLangFor("kanji"), "ja-JP");
  assert.equal(speechLangFor("en"), "en-US");
  assert.equal(speechLangFor("zz"), "ja-JP");
});

test("covers every activity the user can choose", () => {
  // タイルを足したのに文言を足し忘れると、その行だけキーが出る。
  const ids = [
    ...gameTiles.map((tile) => tile.id),
    rhythmCornerTile.id,
    fishingCornerTile.id,
    learningCornerTile.id,
    ...activityTiles.map((tile) => tile.view),
  ];
  const missing = ids.filter(
    (id) => !entryFor(`tile.${id}.title`) || !entryFor(`tile.${id}.desc`)
  );
  assert.deepEqual(missing, [], `文言の無いタイル: ${missing.join(", ")}`);
});

test("every how-to step resolves to real text", () => {
  // gameHowTo が持つのは i18n のキーだけ（src/lib/content.js）。キーを
  // 間違えても例外にはならず、translate() がキー文字列をそのまま返すので、
  // レディ画面に "howto.crane.4" と表示されるだけになる——読み上げにも
  // そのまま流れる。壊れても動いてしまう型なので、ここで止める。
  const missing = [];
  Object.entries(gameHowTo).forEach(([gameId, keys]) => {
    assert.ok(Array.isArray(keys) && keys.length, `${gameId}: 手順が空`);
    keys.forEach((key) => {
      // 文言そのものを直に置いていないことも同時に見る（表記の切り替えが
      // 効かなくなるので、ここには必ずキーが入っていなければならない）。
      assert.match(key, /^howto\./, `${gameId}: 手順は i18n のキーで持つこと（${key}）`);
      if (!entryFor(key)) missing.push(key);
    });
  });
  assert.deepEqual(missing, [], `文言の無い手順: ${missing.join(", ")}`);
});

test("every in-game status line has text", () => {
  // crane / fishing の状態表示。ここが欠けると、遊んでいる最中の画面に
  // キー文字列が出る。
  const keys = [
    "crane.ready", "crane.movingX", "crane.movingY", "crane.dropping",
    "crane.slip", "crane.miss", "crane.carrying", "crane.got",
    "crane.tray", "crane.score", "crane.gotPrize", "crane.lifted",
    "fishing.wait", "fishing.bite", "fishing.tooEarly", "fishing.goodWait",
    "fishing.boot", "fishing.lost", "fishing.caught", "fishing.fast",
  ];
  const missing = keys.filter((key) => !entryFor(key));
  assert.deepEqual(missing, [], `文言の無い状態表示: ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------
// 文言を引く t を、ローカル変数が覆い隠していないか
//
// 実際に踏んだ欠陥（crane）: 進捗 0..1 を `const t` で持っているブロックの
// 中で t("crane.carrying") を呼んでいた。t は数値なので "t is not a function"
// で rAF ループが止まり、アームが景品口の手前で永久に固まる。
//
// 質が悪いのは、**掴めた試行でしか通らない経路**だったこと。スモークは
// 掴めるかどうかが乱数なので、落ちたり落ちなかったりした。同じブロックには
// `if (t >= 1)` もあり、そちらは例外も出さずに黙って偽になり続けていた。
//
// 静的に見れば確実に捕まる欠陥なので、ここで見る。
// ---------------------------------------------------------------------

test("no local binding shadows the translate function", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const files = [
    "../src/lib/games/crane.js",
    "../src/lib/games/fishing.js",
    "../src/lib/games/rhythm.js",
  ];
  // ローカルに t を作る書き方。関数の仮引数と宣言の両方を見る。
  const shadowPatterns = [
    /\b(?:const|let|var)\s+t\s*=/,
    /\bfunction\s+\w+\s*\([^)]*\bt\b[^)]*\)/,
    /\(\s*t\s*(?:,[^)]*)?\)\s*=>/,
  ];

  const offenders = [];
  for (const relative of files) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    const source = await readFile(path, "utf8");
    // ctx から t を受け取っているファイルだけが対象（受け取っていなければ
    // ローカルの t は何も隠していない）。
    const lines = source.split("\n");
    // ctx から t を取り出している行。ここより前（モジュール直下の
    // easeInOut(t) など）には文言の t がそもそも見えていないので、
    // 同じ名前でも何も隠していない。見るのはこの行より後だけ。
    const ctxLine = lines.findIndex((line) => /\bt\b[^=]*\}\s*=\s*ctx/.test(line));
    if (ctxLine < 0) continue;

    lines.slice(ctxLine + 1).forEach((line, offset) => {
      const code = line.replace(/\/\/.*$/, "");
      // 文言を引く行そのものは対象外。
      if (/\bt\(["'`]/.test(code)) return;
      if (shadowPatterns.some((pattern) => pattern.test(code))) {
        offenders.push(`${relative.replace("../", "")}:${ctxLine + offset + 2}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `文言の t をローカルの t が隠している:\n  ${offenders.join("\n  ")}`
  );
});


test("interpolated values are inserted literally, not re-parsed", () => {
  // 差し込む値は辞書の一部ではないので、辞書と同じ加工をしてはいけない。
  //
  // 1) ルビの展開は**テンプレート側だけ**。値に [ ] が入っても、ふりがなに
  //    解釈されない。順序を逆にすると、値が本文として <ruby> に巻き込まれる。
  assert.equal(translate("crane.score", "ruby", { n: "あ[い]" }), "つかんだ あ[い]");
  // 2) replaceAll に文字列を渡すと `$&` などが特別扱いされる（実測:
  //    "{n}".replaceAll("{n}", "$&x") は "{n}x" になる）。関数で止める。
  assert.equal(translate("crane.score", "ruby", { n: "$&" }), "つかんだ $&");
});

test("interpolated values are escaped in the HTML path", () => {
  // tHtml の結果は innerHTML に入る。辞書の固定部分だけが HTML で、値は
  // 常にただの文字、という境界を引いておく。
  const html = translateHtml("crane.score", "ruby", { n: "<img src=x onerror=1>" });
  assert.ok(!html.includes("<img"), `値がタグとして通っている: ${html}`);
  assert.ok(html.includes("&lt;img"), `値がエスケープされていない: ${html}`);
  // 知らないキーもエスケープして返す（動的キーの経路で穴にしない）。
  assert.equal(translateHtml("<b>x</b>", "ruby"), "&lt;b&gt;x&lt;/b&gt;");
});

test("prize names stay free of kanji", () => {
  // 景品名は tHtml の**差し込み値**として画面に出る。差し込み値はエスケープ
  // されるただの文字なので、名前に漢字があってもルビが乗らない——名前だけ
  // ふりがなの無い漢字になる。いまは全部かな・カタカナなので成り立って
  // いるが、静かに崩れる形なのでここで縛る。
  const kanji = /[一-龠]/;
  const bad = cranePrizes
    .map((prize) => entryFor(`prize.${prize.id}`)?.ruby ?? prize.label)
    .filter((name) => kanji.test(name));
  assert.deepEqual(bad, [], `景品名に漢字が入っている（ルビが乗らない）: ${bad.join(", ")}`);
  // 辞書側の取りこぼしも見る。content.js に景品を足して辞書を忘れると、
  // 英語表記でも日本語の名前が出る。
  const missing = cranePrizes.filter((prize) => !entryFor(`prize.${prize.id}`));
  assert.deepEqual(missing.map((p) => p.id), [], "辞書に無い景品がある");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("i18n tests passed");
