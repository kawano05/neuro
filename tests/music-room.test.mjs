// 音あそび「音楽室」（games/musicRoom.js、2026-11-25）の検査。
//
// 見るのは4つ:
//   1. 先生は同じ楽器を続けて言わず、枠は ねらいの楽器の向かい側から回りはじめる（待つ練習になる）。
//   2. 枠の速さは支援者の設定「枠が動く速さ」で、壊れた値は既定へ。
//   3. 測定の課題ではない（taskType なし）。音あそびの札は、れんしゅうの回だけ音楽室の入口になる。
//   4. 6つの楽器ぜんぶに、絵・音・名前・先生の言う文がある。

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MUSIC_INSTRUMENTS, musicInstrumentSvg } from "../src/lib/art/musicRoomArt.js";
import { gameHowTo, gameTiles, musicCornerTile } from "../src/lib/content.js";
import {
  MUSIC_FREE_PRESSES,
  MUSIC_TEACHER_ROUNDS,
  musicCursorIntervalMs,
  musicCursorStart,
  musicSpokenTexts,
  pickMusicTarget,
} from "../src/lib/games/musicRoom.js";
import { findGameModule } from "../src/lib/games/registry.js";
import { resultRenderers } from "../src/lib/games/results.js";
import { translate } from "../src/lib/i18n.js";
import { partyThemeFor } from "../src/lib/partyThemes.js";
import { SOUND_CREDITS } from "../src/lib/soundCredits.js";

const here = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

test("the teacher never names the same instrument twice in a row", () => {
  for (const previous of [null, ...MUSIC_INSTRUMENTS]) {
    for (const r of [0, 0.2, 0.5, 0.8, 0.999999]) {
      const next = pickMusicTarget(previous, () => r);
      assert.ok(MUSIC_INSTRUMENTS.includes(next), `${next} は並んでいる楽器`);
      assert.notEqual(next, previous, "前と同じ楽器は続けない");
    }
  }
});

test("the frame starts across from the named instrument, so the child waits for it", () => {
  MUSIC_INSTRUMENTS.forEach((id, index) => {
    const start = musicCursorStart(id);
    assert.notEqual(start, index, `${id}: ねらいの楽器から始めない`);
    assert.equal(start, (index + MUSIC_INSTRUMENTS.length / 2) % MUSIC_INSTRUMENTS.length, `${id}: 半周先から`);
  });
  assert.equal(musicCursorStart("unknown"), 0);
});

test("the frame moves at the supporter's highlight speed, within the saved range", () => {
  assert.equal(musicCursorIntervalMs({ scanInterval: 2000 }), 2000);
  assert.equal(musicCursorIntervalMs({ scanInterval: 100 }), 800);
  assert.equal(musicCursorIntervalMs({ scanInterval: 99999 }), 3200);
  assert.equal(musicCursorIntervalMs({ scanInterval: "fast" }), 1600);
  assert.equal(musicCursorIntervalMs({}), 1600);
});

test("the music room is not a measured task, and has its own entrance and celebration", () => {
  for (const id of ["music-free", "music-teacher"]) {
    const tile = gameTiles.find((entry) => entry.id === id);
    assert.ok(tile, `${id} が遊びの一覧にある`);
    assert.equal(tile.taskType, null, `${id} は測定の課題ではない`);
    assert.equal(typeof findGameModule(id)?.create, "function", `${id} に実装がある`);
    assert.ok(gameHowTo[id]?.length, `${id} に遊ぶ前の説明がある`);
    assert.ok(partyThemeFor(id), `${id} にお祝いの型がある`);
  }
  assert.equal(musicCornerTile.id, "music-corner");
  assert.equal(MUSIC_FREE_PRESSES, 10);
  assert.equal(MUSIC_TEACHER_ROUNDS, 5);
});

test("every instrument has a picture, a sound, a name and a teacher's line, with a credit", () => {
  const sounds = join(here, "..", "src", "assets", "sounds");
  const spoken = musicSpokenTexts((key, values) => translate(key, "ruby", values));
  for (const id of MUSIC_INSTRUMENTS) {
    assert.match(musicInstrumentSvg(id), new RegExp(`is-${id}`));
    assert.doesNotMatch(musicInstrumentSvg(id), /#FFC83D/i, "黄色は枠の色なので絵に使わない");
    assert.ok(existsSync(join(sounds, `instrument-${id}.wav`)), `instrument-${id}.wav がある`);
    const name = translate(`music.instrument.${id}`, "ruby");
    assert.notEqual(name, `music.instrument.${id}`, `${id} の名前がある`);
    assert.doesNotMatch(name, /[[\]]/, "名前は ふりがなの記法を持たない（先生の文に差し込む）");
    assert.ok(spoken.some((line) => line.text === `${name}を 鳴らしてね`), `先生が「${name}を 鳴らしてね」と言う`);
    assert.notEqual(translate(`music.instrument.${id}`, "en"), `music.instrument.${id}`, `${id} の英語の名前がある`);
  }
  const credit = SOUND_CREDITS.find((entry) => /FluidR3_GM/.test(entry.title));
  assert.ok(credit, "FluidR3_GM のクレジットがある");
  assert.equal(credit.license, "CC BY 3.0");
  assert.match(credit.author, /Frank Wen/);
});

test("the result shows the instruments played, not the animals of another game", () => {
  const t = (key, values) => translate(key, "ruby", values);
  const free = resultRenderers.completion(
    { presses: 10, music: { mode: "free", played: ["piano", "taiko", "bell"] } },
    { t, gameId: "music-free" }
  );
  assert.match(free, /10回 楽器を 鳴らしたよ/);
  assert.equal((free.match(/is-instrument/g) || []).length, 3, "鳴らした楽器を並べる");
  assert.doesNotMatch(free, /ひきに会えた/, "いないいない ばあ の文を出さない");
  const teacher = resultRenderers.completion(
    { presses: 7, rounds: 5, wrong: 2, music: { mode: "teacher", played: ["piano", "bell", "taiko", "trumpet", "castanets"] } },
    { t, gameId: "music-teacher" }
  );
  assert.match(teacher, /せんせいの 楽器を 5こ 鳴らせたよ/);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
console.log("music-room tests passed");
