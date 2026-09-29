// 遊びの雰囲気「おおさわぎ」の決まり（src/lib/party.js）と、明るい出来事の回数制限
// （src/lib/fx/fxSafety.js の createBrightLimiter）。
//
// おおさわぎは刺激を強める雰囲気なので、「強めても越えない線」をここで固定する:
//   - 光（やわらかい光・花火）は、どの1秒をとっても3回まで
//   - 数は増えるだけで減らない。服は取り上げない（失敗を罰しない）
//
//   node tests/party.test.mjs

import assert from "node:assert/strict";
import { MAX_GLOWS_PER_SECOND, MIN_FIREWORK_GAP_S, createBrightLimiter } from "../src/lib/fx/fxSafety.js";
import {
  PARTY_FINAL_BONUS,
  PARTY_MILESTONES,
  PARTY_MUSIC_LEVELS,
  PARTY_OUTFITS,
  PARTY_SPARKLES,
  PARTY_TEMPOS,
  applyPartyResult,
  crossedMilestones,
  formatSparkles,
  isPartyLevel,
  localDayKey,
  nextOutfit,
  sanitizeParty,
  sparklesAfter,
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

test("every press adds sparkles, the music builds, and the tempo only goes up", () => {
  for (let i = 1; i < PARTY_SPARKLES.length; i += 1) {
    assert.ok(PARTY_SPARKLES[i] > PARTY_SPARKLES[i - 1]);
    assert.ok(PARTY_MUSIC_LEVELS[i] > PARTY_MUSIC_LEVELS[i - 1]);
    assert.ok(PARTY_TEMPOS[i] > PARTY_TEMPOS[i - 1]);
  }
  assert.equal(PARTY_MUSIC_LEVELS.at(-1), 9, "最後は全部の楽器");
  assert.equal(sparklesAfter(-3), PARTY_SPARKLES[0]);
  assert.equal(sparklesAfter(99), PARTY_SPARKLES.at(-1));
  // 5回押しきると、ボーナスでちょうど最後の節目（1000まん）に届く。
  assert.equal(PARTY_SPARKLES.at(-1) * PARTY_FINAL_BONUS, PARTY_MILESTONES.at(-1));
});

test("milestones are celebrated once, on the press that crosses them", () => {
  assert.deepEqual(crossedMilestones(0, 1500), []);
  assert.deepEqual(crossedMilestones(1500, 20000), [10000]);
  assert.deepEqual(crossedMilestones(300000, 5000000), [1000000]);
  assert.deepEqual(crossedMilestones(0, 10000000), PARTY_MILESTONES);
  assert.deepEqual(crossedMilestones(10000, 10000), []);
});

test("big numbers read as まん in japanese and with separators in english", () => {
  assert.equal(formatSparkles(1500, "ruby"), "1,500");
  assert.equal(formatSparkles(20000, "ruby"), "2まん");
  assert.equal(formatSparkles(10000000, "kana"), "1,000まん");
  // 数え上げの途中も「まん」の単位だけ（端数まで出すと長くなり、上の帯にぶつかる）。
  assert.equal(formatSparkles(8331654, "ruby"), "833まん");
  assert.equal(formatSparkles(10000000, "en"), "10,000,000");
  assert.equal(formatSparkles(-5, "en"), "0");
  assert.equal(formatSparkles(Number.NaN, "ruby"), "0");
});

test("each finished play gives the next outfit, and never takes one away", () => {
  assert.equal(nextOutfit([]), "hat");
  assert.equal(nextOutfit(["hat"]), "bow");
  assert.equal(nextOutfit(PARTY_OUTFITS), null);
  let party = sanitizeParty(null);
  const got = [];
  for (let i = 0; i < 4; i += 1) {
    const outcome = applyPartyResult(party, 10000000, "2026-09-29");
    got.push(outcome.unlocked);
    party = outcome.party;
  }
  assert.deepEqual(got, ["hat", "bow", "crown", null]);
  assert.deepEqual(party.outfits, ["hat", "bow", "crown"]);
});

test("the day total adds up and starts again on a new day", () => {
  const first = applyPartyResult({ day: "", sparkles: 0, outfits: [] }, 10000000, "2026-09-29");
  assert.equal(first.dayTotal, 10000000);
  const second = applyPartyResult(first.party, 10000000, "2026-09-29");
  assert.equal(second.dayTotal, 20000000);
  const nextDay = applyPartyResult(second.party, 10000000, "2026-09-30");
  assert.equal(nextDay.dayTotal, 10000000, "日付が変わったら数え直す");
  assert.deepEqual(nextDay.party.outfits, ["hat", "bow", "crown"], "服は日をまたいでも残る");
});

test("the saved party state is cleaned up", () => {
  assert.deepEqual(sanitizeParty({ day: "2026-09-29", sparkles: -8, outfits: ["crown", "hat", "cape"] }), {
    day: "2026-09-29",
    sparkles: 0,
    outfits: ["hat", "crown"],
  });
  assert.deepEqual(sanitizeParty({ sparkles: 500 }), { day: "", sparkles: 0, outfits: [] }, "日付の無い合計は捨てる");
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
