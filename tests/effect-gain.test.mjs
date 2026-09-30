// 効果音が測定の合図音を覆わないこと。
//
// クレーン（モーター・把持・落下）とさかなつり（水音・リール）の音を足した。
// これらは「押した結果」を伝えるためのもので、測定の合図——リズムの
// 440Hz/880Hz、さかなつりのアタリ音——より目立ってはいけない。合図が
// 聴き取りにくくなると、聴覚キューへの同期/反応という測定そのものが変わる。
//
// 音は耳で確かめられないので、少なくとも「合図より大きくならない」という
// 安全弁だけは機械で固定する。呼び出し側が大きな値を書いても頭が押さえられる。
//
//   node tests/effect-gain.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CUE_SOFT_GAIN,
  CUE_TONE_GAIN,
  DEFAULT_TONE_GAIN,
  DEFAULT_SPEECH_VOLUME,
  EFFECT_GAIN_CEILING,
  PLAY_EFFECT_BOOST_DB,
  clampEffectGain,
  clampSpeechVolume,
  createAudio,
  createBeatScheduler,
  effectOutputGain,
} from "../src/lib/audio.js";

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

test("the effect ceiling stays below the cue tone", () => {
  assert.ok(
    EFFECT_GAIN_CEILING < DEFAULT_TONE_GAIN,
    `効果音の上限 ${EFFECT_GAIN_CEILING} は合図音 ${DEFAULT_TONE_GAIN} より小さくなければならない`
  );
});

test("the cue tone is loud enough to hear next to the voice, and effects stay below it", () => {
  // 声は −15dBFS（scripts/voice/generate.py の TARGET_ST_DB）。0.05 のピッは
  // iPad のスピーカー相当で −36dBFS で、2026-09-30 の打ち合わせでは聞こえなかった。
  // 0.4 で −18dBFS。ここを下げると、また聞こえなくなる。
  assert.ok(CUE_TONE_GAIN >= 0.3, `合図音 ${CUE_TONE_GAIN} が小さすぎる（声より15dB以上小さくなる）`);
  // ほかの音と重なっても割れない高さ（合図＋当たりの音で 1 を越えない）。
  assert.ok(CUE_TONE_GAIN * 2 < 1, `合図音 ${CUE_TONE_GAIN} が大きすぎる（重なると割れる）`);
  assert.ok(CUE_SOFT_GAIN < CUE_TONE_GAIN);
  assert.ok(EFFECT_GAIN_CEILING < CUE_SOFT_GAIN, "効果音の上限は、外れの音よりも下に置く");
});

test("a scheduled cue starts at its full level at the moment it sounds", () => {
  // 以前は下げ始めが「予約した時刻」からだった（Web Audio では、前の予定が無い
  // ランプは呼んだ時刻から始まる）。先読みの分だけ、鳴る前にもう小さくなっていた。
  const calls = [];
  const param = (name) => ({
    value: 0,
    setValueAtTime: (v, t) => calls.push([name, "set", v, t]),
    exponentialRampToValueAtTime: (v, t) => calls.push([name, "exp", v, t]),
    linearRampToValueAtTime: (v, t) => calls.push([name, "lin", v, t]),
  });
  const ctx = {
    currentTime: 10,
    destination: {},
    createOscillator: () => ({
      frequency: { value: 0 },
      type: "",
      connect() {},
      start: (t) => calls.push(["osc", "start", null, t]),
      stop: (t) => calls.push(["osc", "stop", null, t]),
      disconnect() {},
    }),
    createGain: () => ({ gain: param("gain"), connect() {}, disconnect() {} }),
  };
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  let tick = null;
  globalThis.window = {
    setInterval: (fn) => {
      tick = fn;
      return 1;
    },
    clearInterval() {},
  };
  try {
    const scheduler = createBeatScheduler(ctx);
    const plan = { beats: [{ index: 0, timeS: 0, tone: 880, gain: CUE_TONE_GAIN }] };
    const at = scheduler.start(plan);
    // 先読み（0.1秒前）で予約される時刻まで進める。
    ctx.currentTime = at - 0.09;
    tick();
    const find = (kind) => calls.find(([name, k]) => name === "gain" && k === kind);
    assert.deepEqual(find("set"), ["gain", "set", CUE_TONE_GAIN, at], "鳴る時刻に、設定の大きさから始める");
    const [, , floor, decayAt] = find("exp");
    assert.ok(Math.abs(floor - CUE_TONE_GAIN / 50) < 1e-12, "形は以前と同じ（0.18秒で 1/50）");
    assert.ok(Math.abs(decayAt - (at + 0.18)) < 1e-9);
    const [, , end] = find("lin");
    assert.equal(end, 0, "止める前に0へ寄せる");
    scheduler.stop();
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  }
});

test("the cue games take their cue level from one place", () => {
  // 0.05 などの数字を各遊びに書き散らすと、大きさを直したときに取り残される。
  ["../src/lib/games/rhythm.js", "../src/lib/games/crane.js", "../src/lib/games/fishing.js"].forEach((relative) => {
    const text = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
    assert.match(text, /CUE_TONE_GAIN/, `${relative} が CUE_TONE_GAIN を使っていない`);
    assert.doesNotMatch(text, /const \w*GAIN\w* = 0\.0\d+;/, `${relative} に合図音の数字が直に書かれている`);
    assert.match(text, /cueGain:/, `${relative} が記録に cueGain を残していない`);
  });
});

test("clamps anything a caller passes", () => {
  assert.equal(clampEffectGain(0.02), 0.02);
  assert.equal(clampEffectGain(EFFECT_GAIN_CEILING), EFFECT_GAIN_CEILING);
  // 合図音と同じ大きさを渡されても、合図より下へ落とす。
  assert.equal(clampEffectGain(DEFAULT_TONE_GAIN), EFFECT_GAIN_CEILING);
  assert.equal(clampEffectGain(1), EFFECT_GAIN_CEILING);
  // 負や不正な値は無音に倒す（鳴らさないほうが安全側）。
  assert.equal(clampEffectGain(-1), 0);
  assert.equal(clampEffectGain(Number.NaN), 0);
  assert.equal(clampEffectGain(undefined), 0);
  assert.equal(clampEffectGain("0.03"), 0);
});

test("keeps app TTS volume adjustable without changing cue or effect gain", () => {
  assert.equal(DEFAULT_SPEECH_VOLUME, 1);
  assert.equal(clampSpeechVolume(0.2), 0.2);
  assert.equal(clampSpeechVolume(0.55), 0.6);
  assert.equal(clampSpeechVolume(9), 1);
  assert.equal(clampSpeechVolume(-1), 0.2);
  assert.equal(clampSpeechVolume(Number.NaN), DEFAULT_SPEECH_VOLUME);
  assert.equal(clampSpeechVolume("0.5"), DEFAULT_SPEECH_VOLUME);
  // TTS側を下げても、測定刺激と効果音の安全上限は動かさない。
  assert.equal(DEFAULT_TONE_GAIN, 0.05);
  assert.equal(EFFECT_GAIN_CEILING, 0.04);
});

test("applies TTS volume and gives each message one speech owner", () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
  const spoken = [];
  const announced = [];
  let cancelCount = 0;
  const settings = { speechEnabled: true, speechVolume: 0.4, textMode: "ruby" };

  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.volume = 1;
    }
  }

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        speechSynthesis: {
          cancel() { cancelCount += 1; },
          speak(utterance) { spoken.push(utterance); },
        },
      },
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });

    const audio = createAudio(() => settings, (message) => announced.push(message));
    assert.equal(audio.speak("テスト"), true);
    assert.equal(cancelCount, 1);
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].volume, 0.4);
    assert.equal(spoken[0].rate, 0.92);

    assert.equal(audio.speakOrAnnounce("アプリだけ", "OSだけ"), "app-tts");
    assert.equal(spoken.length, 2);
    assert.deepEqual(announced, []);

    settings.speechEnabled = false;
    assert.equal(audio.speak("読まない"), false);
    assert.equal(spoken.length, 2);
    assert.equal(audio.speakOrAnnounce("読まない", "OSだけ"), "live-region");
    assert.deepEqual(announced, ["OSだけ"]);
    audio.stopSpeech();
    assert.equal(cancelCount, 3);

    settings.speechEnabled = true;
    delete globalThis.window.speechSynthesis;
    assert.equal(
      audio.speakOrAnnounce("APIがない", "APIなしはOS側"),
      "live-region",
      "Speech Synthesis APIが無い端末でもlive regionへ戻る"
    );
    assert.equal(spoken.length, 2);
    assert.deepEqual(announced, ["OSだけ", "APIなしはOS側"]);

    globalThis.window.speechSynthesis = {
      cancel() { cancelCount += 1; },
      speak() { throw new Error("WKWebView speech failure"); },
    };
    assert.equal(
      audio.speakOrAnnounce("失敗するAPI", "例外時もOS側"),
      "live-region",
      "Speech Synthesisが例外を返してもlive regionへ戻る"
    );
    assert.deepEqual(announced, ["OSだけ", "APIなしはOS側", "例外時もOS側"]);
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
    if (oldUtterance) Object.defineProperty(globalThis, "SpeechSynthesisUtterance", oldUtterance);
    else delete globalThis.SpeechSynthesisUtterance;
  }
});

test("only scenes without a cue get louder effects", () => {
  // 合図のある遊び（"task"）の効果音は、この仕組みを入れる前と同じ大きさ。
  // 音ごとの持ち上げ（makeupDb）も効かない——測定の遊びの音を変えないため。
  assert.equal(effectOutputGain("task"), 1);
  assert.equal(effectOutputGain("task", 14), 1);
  assert.equal(effectOutputGain("anything-else", 14), 1, "知らない場面は安全側（持ち上げない）");
  // 合図の無い場面（はじめの遊び・ホームなど）は持ち上げる（声より少し小さいくらい）。
  const boost = Math.pow(10, PLAY_EFFECT_BOOST_DB / 20);
  assert.ok(Math.abs(effectOutputGain("play") - boost) < 1e-9);
  assert.ok(effectOutputGain("play", 6) > effectOutputGain("play"));
  // 持ち上げすぎない（呼び出し側が大きな値を書いても ±24dB で止める）。
  assert.equal(effectOutputGain("play", 99), effectOutputGain("play", 24));
  assert.equal(effectOutputGain("play", Number.NaN), effectOutputGain("play"));
});

test("the audio module starts in the play scene and switches on request", () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
    const audio = createAudio(() => ({ soundEnabled: true, speechEnabled: false }));
    assert.equal(audio.profile(), "play");
    audio.setProfile("task");
    assert.equal(audio.profile(), "task");
    audio.setProfile("nonsense");
    assert.equal(audio.profile(), "play");
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else delete globalThis.window;
  }
});

test("every effect call site asks for less than the cue tone", () => {
  // 上限で丸めてはいるが、丸めに頼って大きな値を書き散らすと、上限を
  // 動かした瞬間に全部が跳ね上がる。呼び出し側の値そのものを見ておく。
  const sources = ["../src/lib/games/crane.js", "../src/lib/games/fishing.js"];
  const found = [];
  sources.forEach((relative) => {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    const text = readFileSync(path, "utf8");
    // playNoise / playSweep へ渡している gain の実引数を拾う。
    const calls = text.matchAll(/play(?:Noise|Sweep)\(\{[^}]*?gain:\s*([0-9.]+)/gs);
    for (const match of calls) found.push({ relative, gain: Number(match[1]) });
  });

  assert.ok(found.length >= 6, `効果音の呼び出しが見つからない（${found.length}件）`);
  found.forEach(({ relative, gain }) => {
    assert.ok(
      gain <= EFFECT_GAIN_CEILING,
      `${relative} の gain ${gain} が効果音の上限 ${EFFECT_GAIN_CEILING} を超えている`
    );
    assert.ok(
      gain < DEFAULT_TONE_GAIN,
      `${relative} の gain ${gain} が合図音 ${DEFAULT_TONE_GAIN} 以上になっている`
    );
  });
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("effect gain tests passed");
