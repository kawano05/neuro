// アプリに入れた読み上げの声（声のパック。src/lib/voicePack.js・src/assets/voice/）。
//
// 読み上げは、文のかたまりごとにパックの音を引く。作る側（scripts/voice/）と
// 引く側（audio.js の speak）でかたまりの切り方が1文字でも違うと引けず、黙って
// 端末の声に戻る——耳で聞かないと気づけない。ここで機械的に固定する:
//   - かたまりの切り方
//   - 文言を直したのに声を作り直していない（lines.json・パックが古い）
//   - パックの中身が壊れていない（どの音も mp3 の頭から始まる）
//   - speak が、音があればパックを、無ければ端末の声を使う
//
//   node tests/voice-pack.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAudio } from "../src/lib/audio.js";
import { toSpeechText } from "../src/lib/i18n.js";
import { SOUND_CREDITS } from "../src/lib/soundCredits.js";
import { chunkGapS, planVoiceClips, splitSpeechChunks, voiceLang } from "../src/lib/voicePack.js";
import { collectVoiceLines } from "../scripts/voice/lines.mjs";

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const readJson = (relative) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const readBytes = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)));

const index = readJson("../src/assets/voice/index.json");
const packs = { ja: readBytes("../src/assets/voice/ja.bin"), en: readBytes("../src/assets/voice/en.bin") };

test("cuts Japanese after 。！？ and keeps the mark with its sentence", () => {
  assert.deepEqual(splitSpeechChunks("パン！あと3個", "ja-JP"), ["パン！", "あと3個"]);
  assert.deepEqual(splitSpeechChunks("やったー！ふうせんが5個われたよ。", "ja-JP"), ["やったー！", "ふうせんが5個われたよ。"]);
  assert.deepEqual(splitSpeechChunks("ほんと？！すごい", "ja-JP"), ["ほんと？！", "すごい"]);
  // かっこの中の「！」では切らない（さかなつりの説明）。
  assert.deepEqual(splitSpeechChunks("大きな「！」が出たら、すぐ押します。", "ja-JP"), ["大きな「！」が出たら、すぐ押します。"]);
  assert.deepEqual(splitSpeechChunks("  ", "ja-JP"), []);
});

test("cuts English only where a sentence ends before a space", () => {
  assert.deepEqual(splitSpeechChunks("Pop! 3 left", "en-US"), ["Pop!", "3 left"]);
  assert.deepEqual(splitSpeechChunks("You did it! You won 3 prizes!", "en-US"), ["You did it!", "You won 3 prizes!"]);
  assert.deepEqual(splitSpeechChunks("It is 3.5 cm long. Nice!", "en-US"), ["It is 3.5 cm long.", "Nice!"]);
  assert.deepEqual(splitSpeechChunks("see the big “!”.", "en-US"), ["see the big “!”."]);
});

test("pauses longer after a full stop than after an exclamation", () => {
  assert.ok(chunkGapS("できた。") > chunkGapS("できた！"));
  assert.ok(chunkGapS("できた！") > chunkGapS("イルカ"));
  assert.equal(chunkGapS("Done."), chunkGapS("できた。"));
  assert.equal(voiceLang("ja-JP"), "ja");
  assert.equal(voiceLang("en_US"), "en");
});

test("reads the whole utterance from the pack, or none of it", () => {
  const fake = { clips: { ja: { "パン！": [0, 10], "あと3個": [10, 12] } } };
  assert.deepEqual(planVoiceClips(fake, "ja-JP", ["パン！", "あと3個"]), [[0, 10], [10, 12]]);
  // 1つでも無ければ端末の声で全部読む（途中で声が変わらないように）。
  assert.equal(planVoiceClips(fake, "ja-JP", ["パン！", "あと99個"]), null);
  assert.equal(planVoiceClips(fake, "en-US", ["Pop!"]), null);
  assert.equal(planVoiceClips(null, "ja-JP", ["パン！"]), null);
  assert.equal(planVoiceClips(fake, "ja-JP", []), null);
});

test("the voice lines are up to date with the app's words", () => {
  // 文言（i18n.js・content.js）を直したら、node scripts/voice/lines.mjs と
  // python scripts/voice/generate.py で声を作り直す（docs §3.20）。
  const current = collectVoiceLines();
  const committed = readJson("../scripts/voice/lines.json");
  for (const lang of ["ja", "en"]) {
    const want = current[lang].map((line) => line.text);
    const have = committed[lang].map((line) => line.text);
    const missing = want.filter((text) => !have.includes(text));
    const stale = have.filter((text) => !want.includes(text));
    assert.deepEqual({ missing, stale }, { missing: [], stale: [] }, `${lang}: scripts/voice/lines.json が古い`);
  }
});

test("the pack has a sound for every line, and every sound is a whole mp3", () => {
  const lines = readJson("../scripts/voice/lines.json");
  for (const lang of ["ja", "en"]) {
    const clips = index.clips[lang];
    const missing = lines[lang].map((line) => line.text).filter((text) => !clips[text]);
    assert.deepEqual(missing, [], `${lang}: 声の無い文（generate.py を走らせる）`);
    const bytes = packs[lang];
    let end = 0;
    for (const [text, [offset, length]] of Object.entries(clips)) {
      assert.ok(Number.isInteger(offset) && Number.isInteger(length) && length > 200, `${lang} ${text}: 位置が変`);
      assert.ok(offset + length <= bytes.length, `${lang} ${text}: パックの外`);
      // mp3 のフレームの頭（同期語 11 ビット）から始まる。ずれていると再生できない。
      assert.equal(bytes[offset], 0xff, `${lang} ${text}: mp3 の頭でない`);
      assert.equal(bytes[offset + 1] & 0xe0, 0xe0, `${lang} ${text}: mp3 の頭でない`);
      end = Math.max(end, offset + length);
    }
    assert.equal(end, bytes.length, `${lang}: パックに使われていない部分がある`);
  }
});

test("the voices are credited in the app", () => {
  for (const lang of ["ja", "en"]) {
    const credit = index.voices?.[lang]?.credit;
    assert.ok(credit, `${lang}: index.json に声のクレジットが無い`);
  }
  // VOICEVOX の声は「VOICEVOX:キャラクター名」の表記が使う条件。
  assert.match(index.voices.ja.credit, /^VOICEVOX:/);
  assert.ok(
    SOUND_CREDITS.some((credit) => credit.title === index.voices.ja.credit),
    `設定のクレジットに「${index.voices.ja.credit}」が無い（src/lib/soundCredits.js）`
  );
  assert.ok(SOUND_CREDITS.some((credit) => /Kokoro/.test(credit.title)), "設定のクレジットに Kokoro が無い");
});

/** audio.js を、偽の window・AudioContext・fetch の上で動かす。 */
async function withFakeAudio(settings, fn, { contextState = "running", missingDevice = false, failedPack = false } = {}) {
  const saved = {};
  for (const name of ["window", "SpeechSynthesisUtterance", "fetch", "CustomEvent"]) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  }
  const announcements = [];
  const events = [];
  const utterances = [];
  const started = [];
  const stopped = [];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  class FakeContext {
    constructor() {
      this.state = contextState;
      this.currentTime = 1;
      this.destination = {};
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const source = {
        buffer: null,
        connect() {},
        disconnect() {},
        start(at) {
          started.push({ at, duration: source.buffer.duration });
        },
        stop() {
          stopped.push(source);
        },
      };
      return source;
    }
    decodeAudioData(data) {
      return Promise.resolve({ duration: data.byteLength / 1000 });
    }
    resume() {
      return Promise.resolve();
    }
  }
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        AudioContext: FakeContext,
        speechSynthesis: missingDevice ? undefined : { cancel() {}, speak: (utterance) => utterances.push(utterance), getVoices: () => [] },
        dispatchEvent: (event) => events.push(event.detail),
        setTimeout,
        clearTimeout,
      },
    });
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: class {
        constructor(type, { detail }) {
          this.type = type;
          this.detail = detail;
        }
      },
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: missingDevice ? undefined : FakeUtterance });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (url) => {
        if (failedPack) throw Error("voice unavailable");
        const bytes = packs[url];
        return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) };
      },
    });
    const audio = createAudio(() => settings, text => announcements.push(text), { voicePack: { index, urls: { ja: "ja", en: "en" } } });
    await fn({ audio, events, utterances, started, stopped, announcements });
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test("speaks with the app voice when every sentence is in the pack", async () => {
  const settings = { speechEnabled: true, speechVolume: 0.6, textMode: "ruby" };
  await withFakeAudio(settings, async ({ audio, events, utterances, started, stopped }) => {
    assert.equal(audio.speak("パン！ あと 3こ"), true);
    await settle();
    assert.equal(utterances.length, 0, "パックにある文を端末の声で読んだ");
    assert.equal(events.at(-1).via, "voice-pack");
    assert.deepEqual(events.at(-1).chunks, ["パン！", "あと3個"]);
    assert.equal(started.length, 2);
    // 2つ目は、1つ目が終わって「！」の間を置いてから。
    const gap = started[1].at - (started[0].at + started[0].duration);
    assert.ok(Math.abs(gap - chunkGapS("パン！")) < 1e-9, `間 ${gap}`);
    audio.stopSpeech();
    assert.equal(stopped.length, 2, "止めたのに声のパックの音が残った");
  });
});

test("reads English with the English voice, and Japanese words in English mode with the Japanese one", async () => {
  const settings = { speechEnabled: true, textMode: "en" };
  await withFakeAudio(settings, async ({ audio, events, utterances }) => {
    audio.speak("Pop! 3 left");
    await settle();
    assert.equal(events.at(-1).via, "voice-pack");
    assert.equal(events.at(-1).lang, "en-US");
    audio.speak("りんご");
    await settle();
    assert.equal(events.at(-1).via, "voice-pack");
    assert.equal(events.at(-1).lang, "ja-JP");
    assert.equal(utterances.length, 0);
  });
});

test("falls back to the device voice for words the pack does not have, or when asked to", async () => {
  const settings = { speechEnabled: true, textMode: "ruby" };
  await withFakeAudio(settings, async ({ audio, events, utterances, started }) => {
    audio.speak("パックに 入っていない 文です");
    await settle();
    assert.equal(events.at(-1).via, "device");
    assert.equal(utterances.at(-1).text, toSpeechText("パックに 入っていない 文です", "ja-JP"));
    settings.speechVoice = "device";
    audio.speak("やったー！");
    await settle();
    assert.equal(events.at(-1).via, "device");
    assert.equal(started.length, 0);
    settings.speechEnabled = false;
    assert.equal(audio.speak("やったー！"), false);
  });
});

test("a newer utterance silences the one still loading", async () => {
  const settings = { speechEnabled: true, textMode: "ruby" };
  await withFakeAudio(settings, async ({ audio, started }) => {
    audio.speak("やったー！");
    audio.speak("せいかい！");
    await settle();
    // 先の「やったー！」は、読み込みを待つあいだに古くなったので鳴らさない。
    assert.equal(started.length, 1);
  });
});

test("reads with the device voice when the sound output cannot be resumed", async () => {
  // iOS で電話やほかのアプリのあと、音の出口が止まったまま残ることがある（戻せるのは
  // 操作の中だけ）。そこへ予約しても鳴らないので、黙らずに端末の声で読む。
  const settings = { speechEnabled: true, textMode: "ruby" };
  await withFakeAudio(
    settings,
    async ({ audio, events, utterances, started }) => {
      assert.equal(audio.speak("やったー！"), true);
      await settle(400);
      assert.equal(started.length, 0);
      assert.equal(utterances.at(-1)?.text, "やったー！");
      assert.equal(events.at(-1).via, "device");
      assert.equal(events.at(-1).fallback, true);
    },
    { contextState: "interrupted" }
  );
});

test("returns asynchronous double voice failures to the requested announcement", async () => {
  await withFakeAudio({ speechEnabled: true }, async ({ audio, announcements }) => {
    assert.equal(audio.speakOrAnnounce("やったー！", "文字の説明"), "app-tts");
    await settle();
    assert.deepEqual(announcements, ["文字の説明"]);
  }, { failedPack: true, missingDevice: true });
});

test("announces asynchronous local device errors but ignores canceled old utterances", async () => {
  await withFakeAudio({ speechEnabled: true, speechVoice: "device" }, async ({ audio, utterances, announcements }) => {
    audio.speakOrAnnounce("古い文", "古い文字");
    const old = utterances.at(-1);
    audio.speakOrAnnounce("新しい文", "新しい文字");
    old.onerror({ error: "audio-busy" });
    utterances.at(-1).onerror({ error: "canceled" });
    assert.deepEqual(announcements, []);
    utterances.at(-1).onerror({ error: "audio-busy" });
    assert.deepEqual(announcements, ["新しい文字"]);
  });
});

test("a remote device error after speech starts also returns ownership to text", async () => {
  await withFakeAudio({ speechEnabled: true, speechVoice: "device" }, async ({ audio, utterances, announcements }) => {
    window.speechSynthesis.getVoices = () => [{name:"remote", lang:"ja-JP", localService:false}];
    audio.speakOrAnnounce("やったー！", "文字で知らせる");
    const utterance = utterances.at(-1);
    assert.equal(utterance.voice.localService, false);
    utterance.onstart();
    utterance.onerror({error:"network"});
    assert.deepEqual(announcements, ["文字で知らせる"]);
  });
});

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}
console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
