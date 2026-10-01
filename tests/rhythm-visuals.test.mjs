// リズム版面の選択と、見た目だけに使う移動・評価の純粋関数。
// 判定や rawOffsetMs は rhythm.js が正本であり、このテストでは変えない。

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ORIGINAL_ART_VERSION } from "../src/lib/artVersion.js";
import {
  GONOGO_ART_VERSION,
  gonogoIconSvg,
  gonogoNoteSvg,
  gonogoPadSvg,
  gonogoSceneryHtml,
  gonogoShieldSvg,
  gonogoStageHtml,
} from "../src/lib/art/gonogoWorldArt.js";
import {
  createRhythmVisuals,
  gradeRhythmOffset,
  noteTravelRatio,
  RHYTHM_NOTE_LEAD_MAX_MS,
  RHYTHM_NOTE_LEAD_MIN_MS,
  rhythmArtVersion,
  rhythmProfileLabelKey,
  rhythmSkin,
  rhythmVisualProfile,
} from "../src/lib/games/rhythmVisuals.js";

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

const PRACTICE_GAME_IDS = ["rhythm-l1", "rhythm-l2", "gonogo"];

test("guided practice uses the note lane and unguided practice uses the instrument", () => {
  PRACTICE_GAME_IDS.forEach((gameId) => {
    assert.equal(rhythmVisualProfile(gameId, true), "lane", `${gameId}: guided practice`);
    assert.equal(rhythmVisualProfile(gameId, false), "instrument", `${gameId}: unguided practice`);
  });
});

test("calibration never exposes a future-note lane", () => {
  assert.equal(rhythmVisualProfile("calibration", true), "instrument");
  assert.equal(rhythmVisualProfile("calibration", false), "instrument");
});

test("an unguided practice instrument is not mislabeled as a measurement", () => {
  assert.equal(rhythmProfileLabelKey("lane", false), "rhythm.profile.game");
  assert.equal(rhythmProfileLabelKey("instrument", false), "rhythm.profile.noPreview");
  assert.equal(rhythmProfileLabelKey("instrument", true), "rhythm.profile.measure");
});

test("note travel starts at zero, reaches the judgment surface, and stays clamped", () => {
  const leadMs = RHYTHM_NOTE_LEAD_MIN_MS;
  assert.ok(leadMs > 0);
  assert.ok(RHYTHM_NOTE_LEAD_MAX_MS >= leadMs);
  assert.equal(noteTravelRatio(leadMs, leadMs), 0);
  assert.equal(noteTravelRatio(leadMs / 2, leadMs), 0.5);
  assert.equal(noteTravelRatio(0, leadMs), 1);
  assert.equal(noteTravelRatio(leadMs * 2, leadMs), 0);
  assert.equal(noteTravelRatio(-100, leadMs), 1);
});

test("invalid travel inputs fail closed at the lane origin", () => {
  assert.equal(noteTravelRatio(Number.NaN, 1800), 0);
  assert.equal(noteTravelRatio(100, Number.NaN), 0);
  assert.equal(noteTravelRatio(100, 0), 0);
  assert.equal(noteTravelRatio(100, -1), 0);
});

test("visual grades use the inclusive exact-tolerance boundary", () => {
  assert.equal(gradeRhythmOffset(0, 80), "perfect");
  assert.equal(gradeRhythmOffset(-80, 80), "perfect");
  assert.equal(gradeRhythmOffset(80, 80), "perfect");
  assert.equal(gradeRhythmOffset(-80.001, 80), "good");
  assert.equal(gradeRhythmOffset(80.001, 80), "good");
});

test("missing offsets never invent a perfect grade", () => {
  assert.equal(gradeRhythmOffset(Number.NaN, 80), "good");
  assert.equal(gradeRhythmOffset(undefined, 80), "good");
});

// --- 見え方の版と絵（2026-10-01、高い音だけの れんしゅうの回に音楽会の世界） ---------

/** mount() に渡す面の代わり（innerHTML と印だけを持つ）。 */
function fakeStage() {
  const classes = new Set();
  return {
    dataset: {},
    classes,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function mountedMarkup(gameId, measurement, visualGuidance, practiceArt = undefined) {
  const stage = fakeStage();
  const visuals = createRhythmVisuals({
    gameId,
    visualGuidance,
    measurement,
    practiceArt,
    exactToleranceMs: 30,
    t: (key) => `[${key}]`,
  });
  visuals.mount(stage, {
    titleHtml: "TITLE",
    instructionHtml: "INSTRUCTION",
    offsetMarkup: '<div class="rhythm-offset"></div>',
  });
  return { stage, visuals, markup: stage.innerHTML };
}

const fingerprint = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("the shown art version is 2 only in gonogo practice and 1 everywhere else", () => {
  assert.equal(rhythmArtVersion("gonogo", false), GONOGO_ART_VERSION);
  assert.equal(rhythmArtVersion("gonogo", true), ORIGINAL_ART_VERSION);
  ["rhythm-l1", "rhythm-l2", "calibration"].forEach((gameId) => {
    assert.equal(rhythmArtVersion(gameId, false), ORIGINAL_ART_VERSION, gameId);
    assert.equal(rhythmArtVersion(gameId, true), ORIGINAL_ART_VERSION, gameId);
  });
  // 知らない組み合わせは元の絵（そくていと同じ見え方）へ倒す。
  assert.equal(rhythmSkin("gonogo", 99).world, false);
  assert.equal(rhythmSkin("rhythm-l1", GONOGO_ART_VERSION).world, false);
  assert.equal(rhythmSkin("gonogo", GONOGO_ART_VERSION).world, true);
});

test("measured and untouched rhythm screens build exactly the version-1 markup", () => {
  // そくていの回の画面は1pxも変えない。その土台として、組み立てる DOM の文字列が
  // 版 1（絵を足す前の f1a9ff2 の rhythmVisuals.js）と1文字も同じことを指紋で固定する。
  // 指紋が変わったら、そくていの回の見え方が変わっている——版を上げる判断が要る。
  const expected = {
    "gonogo/measure": "201fac3811bb94ed",
    "rhythm-l1/measure": "eaa61345aeeaeee1",
    "rhythm-l2/measure": "82b78a53f68958f4",
    "calibration/measure": "dca30ccbf68f26ca",
    // 絵を作り直していない れんしゅうの回も、今までのまま。
    "rhythm-l1/practice-guided": "42b9857dbfa811ae",
    "rhythm-l1/practice-unguided": "f82c37c8d7c1325c",
    "rhythm-l2/practice-guided": "b5b40f19031cb542",
    "rhythm-l2/practice-unguided": "9c6f42ebebdcaf64",
  };
  const actual = {
    "gonogo/measure": fingerprint(mountedMarkup("gonogo", true, false).markup),
    "rhythm-l1/measure": fingerprint(mountedMarkup("rhythm-l1", true, false).markup),
    "rhythm-l2/measure": fingerprint(mountedMarkup("rhythm-l2", true, false).markup),
    "calibration/measure": fingerprint(mountedMarkup("calibration", true, false).markup),
    "rhythm-l1/practice-guided": fingerprint(mountedMarkup("rhythm-l1", false, true).markup),
    "rhythm-l1/practice-unguided": fingerprint(mountedMarkup("rhythm-l1", false, false).markup),
    "rhythm-l2/practice-guided": fingerprint(mountedMarkup("rhythm-l2", false, true).markup),
    "rhythm-l2/practice-unguided": fingerprint(mountedMarkup("rhythm-l2", false, false).markup),
  };
  assert.deepEqual(actual, expected);
  const measured = mountedMarkup("gonogo", true, false);
  assert.equal(measured.visuals.artVersion, ORIGINAL_ART_VERSION);
  assert.equal(measured.stage.classes.has("is-practice"), false, "そくていの回に れんしゅうの印を付けない");
  assert.equal(measured.stage.classes.has("has-world-art"), false, "そくていの回に新しい絵の印を付けない");
  assert.doesNotMatch(measured.markup, /gonogo-/, "そくていの回に世界の絵を入れない");
});

test("gonogo practice keeps the same skeleton and only swaps pictures", () => {
  const world = mountedMarkup("gonogo", false, true);
  const original = mountedMarkup("gonogo", true, true);
  assert.equal(world.visuals.artVersion, GONOGO_ART_VERSION);
  assert.ok(world.stage.classes.has("is-practice"));
  assert.ok(world.stage.classes.has("has-world-art"));
  // 骨組み（rhythm.js・演出・テストが頼る rhythm-* の class）は同じものが同じ数だけある。
  // 位置と大きさは CSS のまま。
  const skeleton = (markup) =>
    (markup.match(/class="rhythm-[a-z-]+/g) || []).filter((cls) => cls !== 'class="rhythm-note-art').sort();
  assert.deepEqual(skeleton(world.markup), skeleton(original.markup));
  assert.match(world.markup, /class="rhythm-pulse"><svg class="gonogo-pad"/);
  assert.match(world.markup, /class="rhythm-shield"><svg class="gonogo-shield"/);
  assert.doesNotMatch(world.markup, /fa-solid/, "音楽会の世界は Font Awesome を使わない");
});

test("choosing the old pictures shows the original gonogo practice look and records version 1", () => {
  // 支援者の設定「タイミングの遊びの絵」が「前の絵」の れんしゅうの回は、そくていの回と同じ組み立て
  // （Font Awesome の絵、世界なし）で、れんしゅうの印だけが付く（2026-09-30 より前と同じ）。
  const classic = mountedMarkup("gonogo", false, true, "classic");
  assert.equal(classic.visuals.artVersion, ORIGINAL_ART_VERSION, "前の絵を見せた回は版 1");
  assert.ok(classic.stage.classes.has("is-practice"));
  assert.equal(classic.stage.classes.has("has-world-art"), false);
  assert.doesNotMatch(classic.markup, /gonogo-/, "前の絵の回に世界の絵を入れない");
  // 知らない値は新しい絵（既定）として扱う。
  assert.equal(mountedMarkup("gonogo", false, true, "sparkly").visuals.artVersion, GONOGO_ART_VERSION);
});

test("the practice notes differ only as much as the original visual cue did", () => {
  // 合図は音。手がかりを出す回の玉は、今までと同じ違い（丸＋星 / 四角＋立方体）だけにする。
  // 文字・顔・矢印などを足さない。
  const go = gonogoNoteSvg("go");
  const nogo = gonogoNoteSvg("nogo");
  [go, nogo].forEach((art) => {
    assert.match(art, /^<svg class="rhythm-note-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">/);
    ["rn-body", "rn-shade", "rn-shine", "rn-mark", "rn-edge"].forEach((part) => assert.match(art, new RegExp(`class="${part}`)));
    assert.doesNotMatch(art, /<text|<image|<use/);
  });
  assert.match(go, /<circle class="rn-body"/, "高い音は丸");
  assert.match(nogo, /<rect class="rn-body"/, "低い音は四角");
  // rhythmVisuals.js と同じく、nogo 以外はすべて高い音の玉。
  assert.equal(gonogoNoteSvg("unknown"), go);
});

test("every world picture is decorative, static SVG without the scan-frame yellow", () => {
  const pictures = [
    gonogoIconSvg(),
    gonogoNoteSvg("go"),
    gonogoNoteSvg("nogo"),
    gonogoPadSvg(),
    gonogoShieldSvg(),
    gonogoStageHtml(),
    gonogoSceneryHtml(),
  ];
  pictures.forEach((html) => {
    assert.doesNotMatch(html, /#FFC83D/i, "黄色は走査の枠の色");
    assert.doesNotMatch(html, /<animate|<script|<image|\.png/i, "動かない SVG だけ（画像を足さない）");
    (html.match(/<svg[^>]*>/g) || []).forEach((tag) => assert.match(tag, /aria-hidden="true"/, tag));
  });
  // 背景に音符の飾りを置かない（流れてくる玉と取り違えうる）。
  assert.doesNotMatch(gonogoSceneryHtml() + gonogoStageHtml(), /note|♪|♫/);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("rhythm visuals tests passed");
