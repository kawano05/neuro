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
import { MAX_GLOWS_PER_SECOND, MIN_FIREWORK_GAP_S, createBrightLimiter } from "../src/lib/fx/fxSafety.js";
import {
  PARTY_JAR_CAPACITY,
  PARTY_MUSIC_LEVELS,
  PARTY_OUTFITS,
  PARTY_STARS,
  PARTY_TEMPOS,
  applyPartyResult,
  isPartyLevel,
  jarMomentAt,
  localDayKey,
  nextOutfit,
  sanitizeParty,
  starsAfter,
} from "../src/lib/party.js";

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

test("only the loudest atmosphere turns the party on", () => {
  assert.equal(isPartyLevel("big"), true);
  ["none", "subtle", "normal", undefined, "party"].forEach((level) => assert.equal(isPartyLevel(level), false));
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
