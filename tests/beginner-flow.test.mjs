// はじめの遊びの共通の流れ（src/lib/games/beginnerKit.js の createBeginnerFlow）。
//
// 3つの遊び（おすと でてくる・ふうせん わり・ぬりえ）が別々のタイマーで書いていた
// 流れを1か所へまとめた（docs/overall-design-2026-09-28.md §6.1）。まとめたことで
// 振る舞いが変わっていないことを、時計を差し替えて確かめる。
//
//   node tests/beginner-flow.test.mjs

import assert from "node:assert/strict";
import { BEGINNER_TARGET_PRESSES, createBeginnerFlow } from "../src/lib/games/beginnerKit.js";

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

/** 手で進める時計（window.setTimeout の代わり）。 */
function installClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  globalThis.window = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  return {
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

function makeCtx() {
  const calls = { spoken: [], logs: [], finished: [], stopSpeech: 0, sounds: [], applause: 0, laugh: 0 };
  const audio = {
    stopSpeech: () => (calls.stopSpeech += 1),
    playChime: (f) => calls.sounds.push(["chime", f]),
    playSweep: () => calls.sounds.push(["sweep"]),
    playNoise: () => calls.sounds.push(["noise"]),
    playCreature: (id) => calls.sounds.push(["creature", id]),
    playBoing: () => calls.sounds.push(["boing"]),
    playBoom: () => calls.sounds.push(["boom"]),
    playApplause: () => (calls.applause += 1),
    playLaugh: () => (calls.laugh += 1),
    speakOrAnnounceLater: (text, delay) => calls.spoken.push({ text, delay, later: true }),
  };
  const ctx = {
    settings: { speechEnabled: true, soundEnabled: true, textMode: "ruby", playPrefs: { balloon: { sound: "instrument", background: "light", cheer: "both" } } },
    audio,
    fx: { level: () => "normal" },
    voiceFeedback: (text) => calls.spoken.push({ text }),
    logEvent: (entry) => calls.logs.push(entry),
    finish: (summary) => calls.finished.push(summary),
    t: (key) => (key === "color.voice.cheer" ? "やったー！" : key),
  };
  return { ctx, calls };
}

test("five presses, one switch log each, then a single finish", () => {
  const clock = installClock();
  const { ctx, calls } = makeCtx();
  const pressed = [];
  let finales = 0;
  const flow = createBeginnerFlow(ctx, {
    gameId: "balloon",
    ttsDelayMs: 260,
    finishDelayMs: 1500,
    logLabel: "ふうせん わり",
    onPress: (index) => pressed.push(index),
    progressSpeech: (remaining) => `あと ${remaining}`,
    finishSpeech: () => "できた",
    finishSummary: () => ({ presses: BEGINNER_TARGET_PRESSES }),
    onFinale: () => (finales += 1),
  });
  for (let i = 0; i < 7; i += 1) {
    flow.handleInput();
    clock.advance(300);
  }
  assert.deepEqual(pressed, [0, 1, 2, 3, 4], "6回目・7回目は数えない");
  assert.equal(calls.logs.length, 5, "押した回だけ記録する");
  assert.ok(calls.logs.every((entry) => entry.type === "switch" && entry.label === "ふうせん わり"));
  assert.equal(finales, 1, "フィナーレは5回目の1回だけ");
  assert.equal(calls.finished.length, 0, "けっかは finishDelayMs のあと");
  clock.advance(1500);
  assert.deepEqual(calls.finished, [{ presses: BEGINNER_TARGET_PRESSES }]);
  assert.equal(calls.applause, 1, "けっかと同時に歓声と拍手");
  assert.equal(calls.laugh, 1, "笑い声も");
  // 「やったー」の声は、おいわいの音のあとへずらす。
  const cheer = calls.spoken.find((entry) => entry.later);
  assert.ok(cheer && cheer.delay > 0 && cheer.text.startsWith("やったー！"), JSON.stringify(calls.spoken));
});

test("a quick second press cancels the first remaining-count voice", () => {
  const clock = installClock();
  const { ctx, calls } = makeCtx();
  const flow = createBeginnerFlow(ctx, {
    gameId: "balloon",
    ttsDelayMs: 260,
    finishDelayMs: 1500,
    logLabel: "x",
    onPress: () => {},
    progressSpeech: (remaining) => `あと ${remaining}`,
    finishSpeech: () => "できた",
    finishSummary: () => ({}),
  });
  flow.handleInput();
  clock.advance(100);
  flow.handleInput();
  clock.advance(400);
  assert.deepEqual(
    calls.spoken.map((entry) => entry.text),
    ["あと 3"],
    "連打したら、残りの声は最後の1回だけ"
  );
  // 押すたびに、前の読み上げを止めてから音を鳴らす。
  assert.equal(calls.stopSpeech, 2);
});

test("the press sound climbs the pentatonic scale", () => {
  installClock();
  const { ctx, calls } = makeCtx();
  const flow = createBeginnerFlow(ctx, {
    gameId: "balloon",
    ttsDelayMs: 260,
    finishDelayMs: 1500,
    logLabel: "x",
    onPress: () => {},
    progressSpeech: () => "",
    finishSpeech: () => "",
    finishSummary: () => ({}),
  });
  for (let i = 0; i < 4; i += 1) flow.handleInput();
  const notes = calls.sounds.filter(([kind]) => kind === "chime").map(([, f]) => f);
  for (let i = 1; i < notes.length; i += 1) assert.ok(notes[i] > notes[i - 1], `音が上がっていない: ${notes.join(", ")}`);
});

test("leaving mid-game stops the voice; leaving after the finish lets it play", () => {
  const clock = installClock();
  const { ctx, calls } = makeCtx();
  const options = {
    gameId: "balloon",
    ttsDelayMs: 260,
    finishDelayMs: 1500,
    logLabel: "x",
    onPress: () => {},
    progressSpeech: () => "",
    finishSpeech: () => "",
    finishSummary: () => ({}),
  };
  const early = createBeginnerFlow(ctx, options);
  early.handleInput();
  const before = calls.stopSpeech;
  early.destroy();
  assert.equal(calls.stopSpeech, before + 1, "途中でやめたら、読み上げを止める");

  const done = createBeginnerFlow(ctx, options);
  for (let i = 0; i < 5; i += 1) done.handleInput();
  clock.advance(1500);
  const afterFinish = calls.stopSpeech;
  done.destroy();
  assert.equal(calls.stopSpeech, afterFinish, "できたあとは「やったー」を最後まで読ませる");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("beginner flow tests passed");
