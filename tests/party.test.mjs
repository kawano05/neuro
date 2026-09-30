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
  ATMOSPHERES, atmosphereProfile, timingStars,
} from "../src/lib/party.js";

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
  assert.deepEqual(Object.values(ATMOSPHERES).map(p => p.finale), ["none", "ring", "confetti", "parade"]);
  assert.deepEqual(Object.values(ATMOSPHERES).map(p => p.resultCompanions), [false,false,true,true]);
  for (const level of Object.keys(ATMOSPHERES)) {
    const timing = atmosphereProfile(level, "timing");
    assert.equal(timing.music, false);
    assert.equal(timing.crowd, false);
  }
  assert.equal(atmosphereProfile("big").music, true);
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

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
else console.log("party tests passed");
