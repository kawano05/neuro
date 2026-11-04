// 遊びの記録（家族向けの「がんばりの記録」の元。src/lib/playRecords.js）。
//
// 研究の記録（state.sessions）とは別に持つ。壊れた件は読み込みで捨て、上限を超えたら
// 古い順に捨てる。まとめ方は「はじめ・さいきん・いちばん」と、この7日。
//
//   node tests/play-records.test.mjs

import assert from "node:assert/strict";
import {
  MAX_PLAY_RECORDS,
  appendPlayRecord,
  playRecordFrom,
  sanitizePlayRecords,
  summarizePlayRecords,
} from "../src/lib/playRecords.js";
import { sanitizeState } from "../src/lib/state.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`not ok - ${name}`);
    console.log(error);
  }
}

const day = (d, h = 10) => new Date(2026, 9, d, h, 0, 0);

test("a record keeps what each kind of game can tell", () => {
  const baseball = playRecordFrom({
    gameId: "baseball",
    participantId: "P01",
    summary: { presses: 5, baseball: { homeruns: 3, hits: 1 } },
    at: day(20),
  });
  assert.equal(baseball.homeruns, 3);
  assert.equal(baseball.done, null, "はじめの遊びは できた数／回数 を持たない");
  assert.equal(baseball.day, "2026-10-20");

  const slot = playRecordFrom({ gameId: "slot-l1", score: { done: 6, total: 8 }, difficultyMode: "measure", at: day(21) });
  assert.deepEqual([slot.done, slot.total, slot.homeruns, slot.difficultyMode], [6, 8, null, "measure"]);
});

test("loading drops broken records and keeps the newest when over the cap", () => {
  const good = playRecordFrom({ gameId: "balloon", at: day(20) });
  const cleaned = sanitizePlayRecords([
    good,
    null,
    { ...good, gameId: "<script>" },
    { ...good, atIso: "yesterday" },
    { ...good, done: 9, total: 8 },
    { ...good, extra: "x" },
  ]);
  assert.equal(cleaned.length, 3);
  assert.equal(cleaned[1].done, null, "できた数が回数を超えた件は、数を捨てる");
  assert.ok(!("extra" in cleaned[2]), "知らない項目は残さない");

  let list = [];
  for (let i = 0; i < MAX_PLAY_RECORDS + 5; i += 1) {
    list = appendPlayRecord(list, playRecordFrom({ gameId: "balloon", at: new Date(2026, 0, 1, 0, i) }));
  }
  assert.equal(list.length, MAX_PLAY_RECORDS);
  assert.equal(list[0].atIso, new Date(2026, 0, 1, 0, 5).toISOString(), "古い順に捨てる");
});

test("the records live beside the research sessions, not inside them", () => {
  const record = playRecordFrom({ gameId: "baseball", summary: { baseball: { homeruns: 2 } }, at: day(20) });
  const state = sanitizeState({ playRecords: [record], sessions: [] });
  assert.equal(state.playRecords.length, 1);
  assert.equal(state.sessions.length, 0, "研究の記録には入らない");
  assert.deepEqual(sanitizeState({}).playRecords, []);
});

test("the summary compares first, latest and best, and counts the last 7 days", () => {
  const records = [
    playRecordFrom({ gameId: "baseball", participantId: "P01", summary: { baseball: { homeruns: 1 } }, at: day(10) }),
    playRecordFrom({ gameId: "baseball", participantId: "P01", summary: { baseball: { homeruns: 4 } }, at: day(18) }),
    playRecordFrom({ gameId: "baseball", participantId: "P01", summary: { baseball: { homeruns: 3 } }, at: day(21) }),
    playRecordFrom({ gameId: "balloon", participantId: "P01", at: day(21, 11) }),
    playRecordFrom({ gameId: "slot-l1", participantId: "P02", score: { done: 8, total: 8 }, at: day(21) }),
  ];
  const mine = summarizePlayRecords(records, { participantId: "P01", today: day(21) });
  assert.equal(mine.plays, 4, "ほかの参加者の記録は数えない");
  assert.equal(mine.days, 3);
  assert.equal(mine.playsThisWeek, 3, "10/15〜10/21 の3回（10/10 は入らない）");
  assert.equal(mine.daysThisWeek, 2);
  assert.equal(mine.week.length, 7);
  assert.equal(mine.week[6].day, "2026-10-21");
  assert.equal(mine.week[6].plays, 2);

  const baseball = mine.games.find((game) => game.gameId === "baseball");
  assert.equal(mine.games[0].gameId, "baseball", "よく遊んだ遊びから");
  assert.deepEqual(baseball.first, { value: 1, of: 5 });
  assert.deepEqual(baseball.latest, { value: 3, of: 5 });
  assert.deepEqual(baseball.best, { value: 4, of: 5 });
  assert.equal(baseball.recent.length, 3);

  const balloon = mine.games.find((game) => game.gameId === "balloon");
  assert.equal(balloon.scored, false, "ふうせん わり は数えない（5回で必ず終わる）");

  const everyone = summarizePlayRecords(records, { today: day(21) });
  assert.equal(everyone.plays, 5, "参加者IDが無ければ全部");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("play record tests passed");
