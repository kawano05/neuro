// 遊びの雰囲気「おおさわぎ」の決まり（src/lib/party.js）と、明るい出来事の回数制限
// （src/lib/fx/fxSafety.js の createBrightLimiter）。
//
// おおさわぎは刺激を強める雰囲気なので、「強めても越えない線」をここで固定する:
//   - 光（やわらかい光・花火）は、どの1秒をとっても3回まで
//   - びんの星は増えるだけで減らない。服は取り上げない（失敗を罰しない）
//
//   node tests/party.test.mjs

import assert from "node:assert/strict";
import { JAR_SLOTS } from "../src/lib/art/partyArt.js";
import { revealPartyResult } from "../src/lib/games/partyStage.js";
import { renderPartyResult, renderPraise, resultRenderers } from "../src/lib/games/results.js";
import { MAX_GLOWS_PER_SECOND, MIN_FIREWORK_GAP_S, createBrightLimiter } from "../src/lib/fx/fxSafety.js";
import {
  PARTY_JAR_CAPACITY,
  PARTY_MUSIC_LEVELS,
  PARTY_OUTFITS,
  PARTY_STARS,
  PARTY_TEMPOS,
  applyPartyResult,
  jarMomentAt,
  localDayKey,
  nextOutfit,
  sanitizeParty,
  starsAfter,
  timingStars,
} from "../src/lib/party.js";
import { ATMOSPHERES, ATMOSPHERE_LEVELS, DEFAULT_ATMOSPHERE, atmosphereFor, atmosphereLevel } from "../src/lib/atmosphere.js";
import { FX_SCALE } from "../src/lib/fx/fxSafety.js";
import { PARTY_THEMES, PARTY_THEME_OF, partyThemeFor } from "../src/lib/partyThemes.js";
import { crowdSvg, jarItemsHtml, paradeItems, themeItemSvg } from "../src/lib/art/partyThemeArt.js";
import { gameTiles } from "../src/lib/content.js";
import { entryFor } from "../src/lib/i18n.js";

let passed = 0;
let failed = 0;

test("result music stops after a repaint but never stops the next game's music", () => {
  for (const current of [true, false]) {
    const callbacks = new Map();
    const root = {dataset:{level:"big"},classList:{contains:()=>false},isConnected:false,querySelector:()=>null,querySelectorAll:()=>[],ownerDocument:{defaultView:{setTimeout:(fn,ms)=>callbacks.set(ms,fn)}}};
    let stops = 0;
    revealPartyResult({querySelector:()=>root}, {audio:{music:{stop:()=>stops++}}, isCurrent:()=>current});
    callbacks.get(3200)();
    assert.equal(stops, current ? 1 : 0);
  }
});

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

test("every atmosphere retains the same score, praise, and three-star rating", () => {
  const context = {t:(key, values) => `${key}${values ? JSON.stringify(values) : ""}`};
  for (const [done, stars, key] of [[0,1,"tried"],[3,2,"good"],[5,3,"great"]]) {
    const primary = renderPraise({done,total:5}, context);
    for (const level of ["none","subtle","normal","big"]) {
      const party = ["normal","big"].includes(level) ? {level,stars:done*3,outfits:[],jarsToday:0} : null;
      const html = renderPartyResult(party, primary, context);
      assert.ok(html.includes(primary), `${level}: 通常の評価をそのまま残す`);
      assert.ok(html.includes(`data-praise="result.praise.${key}"`));
      assert.equal((html.match(/class="fa-solid fa-star hk-star"/g)||[]).length, stars);
      assert.equal((html.match(/hk-star is-off/g)||[]).length, 3-stars);
      assert.ok(html.includes(`result.score{"n":${done},"total":5}`));
      if(party) assert.ok(html.indexOf('data-praise=') < html.indexOf('class="party-result-main"'));
    }
  }
});

test("beginner celebrations keep the completion message and star, with the legacy pop exception", () => {
  const context = {gameId:"balloon",t:key=>key};
  for (const level of ["none","subtle","normal","big"]) {
    const party = ["normal","big"].includes(level) ? {level,stars:15,outfits:[],jarsToday:1} : undefined;
    const html = resultRenderers.completion({presses:5,balloons:["#FF8082"],party}, context);
    assert.equal((html.match(/result.completion.title/g)||[]).length,1);
    assert.equal((html.match(/class="hk-result-medal"/g)||[]).length,1);
  }
  const legacy = resultRenderers.completion({presses:5,animals:["dolphin"],party:{level:"big",stars:15,outfits:[],jarsToday:1}}, {...context,gameId:"color-legacy"});
  assert.ok(legacy.includes('class="hk-result completion-result party-result"'));
  assert.ok(!legacy.includes('is-added'));
  assert.ok(!legacy.includes('result.completion.title'));
});

test("four atmospheres have distinct grammar, with a quiet timing ceiling", () => {
  assert.deepEqual(Object.keys(ATMOSPHERES), ["none", "subtle", "normal", "big"]);
  assert.deepEqual(ATMOSPHERE_LEVELS, ["none", "subtle", "normal", "big"]);
  assert.equal(DEFAULT_ATMOSPHERE, "normal", "保存の既定は変えない");
  // 段ごとに、何が出るかが目で分かるほど違う（粒の数だけの違いにしない）。
  assert.deepEqual(ATMOSPHERE_LEVELS.map((level) => ATMOSPHERES[level].finale), ["none", "ring", "confetti", "parade"]);
  assert.deepEqual(ATMOSPHERE_LEVELS.map((level) => ATMOSPHERES[level].companions), ["none", "none", "result", "live"]);
  assert.deepEqual(ATMOSPHERE_LEVELS.map((level) => ATMOSPHERES[level].worldMotion), [false, false, true, true]);
  assert.deepEqual(ATMOSPHERE_LEVELS.map((level) => ATMOSPHERES[level].reward), [false, false, false, true]);
  for (const level of ATMOSPHERE_LEVELS) {
    const timing = atmosphereFor(level, "timing");
    assert.equal(timing.music, false, "タイミングの遊びでは音楽を鳴らさない");
    assert.equal(timing.crowd, false, "タイミングの遊びでは観客・旗を出さない");
    assert.equal(atmosphereFor(level, "timing", { audioCue: true }).milestoneSound, false, "音の課題では節目の音を鳴らさない");
  }
  assert.equal(atmosphereFor("big").music, true);
  assert.equal(atmosphereLevel("strobe"), "none", "分からない値は何も足さない側へ");
});

test("the effects engine reads its scale from the one atmosphere table", () => {
  for (const level of ATMOSPHERE_LEVELS) {
    const row = ATMOSPHERES[level];
    for (const [key, value] of Object.entries(row.effects)) {
      assert.equal(FX_SCALE[level][key], value, `${level}.${key} は表の値`);
    }
    assert.equal(FX_SCALE[level].motion, row.pressMotion);
  }
  // 待ち時間も表から。にぎやかのけっかは短く、おおさわぎは見せ終わるまで長く待つ。
  assert.ok(ATMOSPHERES.normal.resultRevealMs < ATMOSPHERES.big.resultRevealMs);
  assert.equal(ATMOSPHERES.none.finaleWaitMs, 0);
});

test("timing jars count successes, preserve zero, and start a new endless jar", () => {
  for (const total of [5, 7, 15, 20]) {
    assert.equal(timingStars(total, total).stars, 15);
    assert.equal(timingStars(0, total).stars, 0);
    assert.equal(timingStars(total - 1, total).jars, 0);
  }
  assert.deepEqual(timingStars(16, 0, true), {earned:16,jars:1,stars:1});
  assert.deepEqual(timingStars(30, 0, true), {earned:30,jars:2,stars:15});
  const partial = applyPartyResult({day:"2026-09-30",jars:2,outfits:[]}, "2026-09-30", 0);
  assert.equal(partial.jarsToday, 2);
  assert.equal(partial.unlocked, "hat");
});

test("every press adds stars to the jar, the music builds, and the tempo only goes up", () => {
  for (let i = 1; i < PARTY_STARS.length; i += 1) {
    assert.ok(PARTY_STARS[i] > PARTY_STARS[i - 1]);
    assert.ok(PARTY_MUSIC_LEVELS[i] > PARTY_MUSIC_LEVELS[i - 1]);
    assert.ok(PARTY_TEMPOS[i] > PARTY_TEMPOS[i - 1]);
  }
  assert.equal(PARTY_MUSIC_LEVELS.at(-1), 9, "最後は全部の楽器");
  assert.equal(PARTY_STARS.at(-1), PARTY_JAR_CAPACITY, "5回目でちょうどいっぱい");
  assert.equal(JAR_SLOTS.length, PARTY_JAR_CAPACITY, "びんの中の置き場は、いっぱいの数と同じ");
  assert.equal(starsAfter(-3), PARTY_STARS[0]);
  assert.equal(starsAfter(99), PARTY_JAR_CAPACITY);
});

test("the jar is celebrated when it is half full and when it is full", () => {
  const moments = PARTY_STARS.map((_, index) => jarMomentAt(index));
  assert.deepEqual(moments, [null, null, "half", null, "full"]);
});

test("the stars sit inside the jar, filling it from the bottom", () => {
  JAR_SLOTS.forEach((slot) => {
    assert.ok(slot.left > 10 && slot.left < 90, "横はびんの中");
    assert.ok(slot.top > 25 && slot.top < 95, "縦はびんの中（ふたより下）");
  });
  for (let i = 1; i < JAR_SLOTS.length; i += 1) assert.ok(JAR_SLOTS[i].top <= JAR_SLOTS[i - 1].top, "下の段から");
});

test("each finished play gives the next outfit, and never takes one away", () => {
  assert.equal(nextOutfit([]), "hat");
  assert.equal(nextOutfit(["hat"]), "bow");
  assert.equal(nextOutfit(PARTY_OUTFITS), null);
  let party = sanitizeParty(null);
  const got = [];
  for (let i = 0; i < 4; i += 1) {
    const outcome = applyPartyResult(party, "2026-09-29");
    got.push(outcome.unlocked);
    party = outcome.party;
  }
  assert.deepEqual(got, ["hat", "bow", "crown", null]);
  assert.deepEqual(party.outfits, ["hat", "bow", "crown"]);
});

test("the jars filled today add up and start again on a new day", () => {
  const first = applyPartyResult({ day: "", jars: 0, outfits: [] }, "2026-09-29");
  assert.equal(first.jarsToday, 1);
  const second = applyPartyResult(first.party, "2026-09-29");
  assert.equal(second.jarsToday, 2);
  const nextDay = applyPartyResult(second.party, "2026-09-30");
  assert.equal(nextDay.jarsToday, 1, "日付が変わったら数え直す");
  assert.deepEqual(nextDay.party.outfits, ["hat", "bow", "crown"], "服は日をまたいでも残る");
});

test("the saved party state is cleaned up", () => {
  assert.deepEqual(sanitizeParty({ day: "2026-09-29", jars: -8, outfits: ["crown", "hat", "cape"] }), {
    day: "2026-09-29",
    jars: 0,
    outfits: ["hat", "crown"],
  });
  assert.deepEqual(sanitizeParty({ jars: 5 }), { day: "", jars: 0, outfits: [] }, "日付の無い数は捨てる");
  assert.match(localDayKey(new Date(2026, 8, 9)), /^2026-09-09$/);
});

test("glows and fireworks together stay within three bright events in any second", () => {
  let now = 0;
  const limiter = createBrightLimiter(() => now);
  // 花火は MIN_FIREWORK_GAP_S おきなら、4発続けても上限の中。
  const gapMs = MIN_FIREWORK_GAP_S * 1000;
  assert.ok(gapMs >= 1000 / MAX_GLOWS_PER_SECOND, "花火の間は、1秒に3回に収まる長さ");
  [0, 1, 2, 3].forEach((i) => assert.equal(limiter.allowAt(i * gapMs), true, `花火 ${i + 1} 発目`));
  // そこへ光を足すと、どこかの1秒で4回目になるので出さない。
  assert.equal(limiter.allowAt(200), false);
  // 1秒あけば、また出せる。
  now = 2500;
  assert.equal(limiter.allow(), true);
});

test("a finale that used to fire four bright bursts in a second is now capped", () => {
  const limiter = createBrightLimiter(() => 0);
  // 以前のフィナーレ: 光1つ＋花火4発（0.25秒おき）＝1秒に5回。
  const allowed = [0, 0, 250, 500, 750].filter((at) => limiter.allowAt(at)).length;
  assert.equal(allowed, MAX_GLOWS_PER_SECOND);
});

// --- 遊びごとのお祝いの型（src/lib/partyThemes.js）。2026-10-01 に「全部同じ演出になっている。
// それぞれのゲームにあった演出に」と言われて分けた。同じに戻らないように、型ごとの違いを固定する。

test("every playable game has its own celebration theme", () => {
  const playable = gameTiles.map((tile) => tile.id).filter((id) => id !== "calibration");
  for (const id of playable) assert.ok(partyThemeFor(id), `${id}: お祝いの型が無い`);
  // 遊びの種類ごとに、びんにたまるもの・最後の札が違う（ひとつ止める と 3つ止める、
  // さかなつり の2つは同じ遊びの仲間なので同じ型）。
  const themes = Object.values(PARTY_THEMES);
  assert.equal(new Set(themes.map((theme) => theme.item)).size, themes.length, "びんにたまるものが遊びごとに違う");
  assert.equal(new Set(themes.map((theme) => theme.stamp)).size, themes.length, "最後の札が遊びごとに違う");
  assert.equal(PARTY_THEME_OF["slot-l1"], PARTY_THEME_OF["slot-l2"]);
  assert.equal(PARTY_THEME_OF.fishing, PARTY_THEME_OF["fishing-gonogo"]);
  // 押すと 出てくる は元の見せ場（ラッコが真ん中へ・動物と魚のパレード・おおさわぎ！）のまま。
  assert.deepEqual(
    [PARTY_THEMES.pop.show, PARTY_THEMES.pop.parade, PARTY_THEMES.pop.stamp, PARTY_THEMES.pop.crowd],
    ["otter", "march", "party.bigParty", "fish"]
  );
});

test("theme colours never use the scan-ring yellow", () => {
  for (const theme of Object.values(PARTY_THEMES)) {
    for (const color of [...theme.particles.colors, ...theme.itemColors]) {
      assert.notEqual(color.toUpperCase(), "#FFC83D", `${theme.id}: 走査の枠の黄色を使っている`);
    }
  }
});

test("each theme names only known shapes, shows, parades, and translated stamps", () => {
  const SHAPES = new Set(["star", "sparkle", "dot", "confetti", "streak", "drop", "heart", "bubble", "ribbon", "balloon", "ball", "fish", "splat", "note"]);
  for (const theme of Object.values(PARTY_THEMES)) {
    for (const shape of [...theme.particles.shapes, ...(theme.particles.finaleShapes || []), ...theme.rain]) assert.ok(SHAPES.has(shape), `${theme.id}: 知らない粒の形 ${shape}`);
    assert.ok(["otter", "kusudama", "frame", "cheer", "stamp"].includes(theme.show), `${theme.id}: 見せ場 ${theme.show}`);
    assert.ok(["march", "rise", "leap"].includes(theme.parade), `${theme.id}: パレード ${theme.parade}`);
    const text = entryFor(theme.stamp);
    assert.ok(text && ["ruby", "kanji", "kana", "en"].every((mode) => text[mode]), `${theme.id}: 札の4つの表記`);
  }
});

test("each theme draws its own jar contents, parade, and (for beginner games) crowd", () => {
  for (const theme of Object.values(PARTY_THEMES)) {
    const html = jarItemsHtml(15, theme.id);
    assert.equal((html.match(/class="party-item"/g) || []).length, 15, `${theme.id}: びんの中身が15`);
    assert.ok(themeItemSvg(theme.id, 3).startsWith("<svg"), `${theme.id}: びんの中身の絵`);
    assert.ok(paradeItems(theme.id).length >= 6, `${theme.id}: パレード`);
    if (theme.crowd) assert.ok(crowdSvg(theme.crowd, "#FF8082").startsWith("<svg"), `${theme.id}: 観客の絵`);
  }
  // 中身の絵は遊びごとに違う（同じ絵が並ぶと「全部同じ」に戻る）。
  const first = Object.keys(PARTY_THEMES).map((id) => themeItemSvg(id, 0));
  assert.equal(new Set(first).size, first.length);
  // けっかのびんも、その遊びのもので いっぱいになる。
  const result = renderPartyResult({ level: "normal", theme: "fishing", stars: 15 }, "", { t: (key) => key });
  assert.ok(result.includes('data-theme="fishing"'));
  assert.equal(result, renderPartyResult({ level: "normal", theme: "fishing", stars: 15 }, "", { t: (key) => key }));
  assert.notEqual(result.replace('data-theme="fishing"', ""), renderPartyResult({ level: "normal", theme: "pop", stars: 15 }, "", { t: (key) => key }).replace('data-theme="pop"', ""));
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
else console.log("party tests passed");
