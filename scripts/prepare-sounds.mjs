// =====================================================================
// prepare-sounds.mjs — 効果音の録音を、アプリに入れる形へ切り出す
//
//   node scripts/prepare-sounds.mjs [元の音のフォルダ]   （既定 test-results/sounds-src）
//
// 元の音（下の SOUNDS の url）を手で落としてフォルダに置き、これを走らせると
// src/assets/sounds/ に短く切った版ができる。やること:
//   1. 使う区間だけ切り出し、ffmpeg のフィルタ（高域・低域・雑音取り）を掛ける
//   2. 頭の無音を削る（押した瞬間に鳴らすため。数十ms の遅れも手応えを鈍らせる）
//   3. 最後をなめらかに消す
//   4. 大きさをそろえる: iPad の内蔵スピーカー相当（300Hz より下が出ない）で、
//      いちばん大きい 100ms の RMS が TARGET_DB になるように。アプリ側は、この
//      大きさを前提に鳴らす（src/lib/audio.js の SAMPLE_LEVEL）
//   5. 短い音は WAV（mp3 は頭に数十ms の無音が入る）、長い音は mp3 で書き出す
//
// 使ってよい権利とクレジットは src/lib/soundCredits.js（アプリの設定画面にも出す）。
// ffmpeg が要る。
// =====================================================================

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const sourceDir = resolve(process.argv[2] || "test-results/sounds-src");
const outDir = resolve("src/assets/sounds");
const TARGET_DB = -18;
const PEAK_LIMIT = 0.89; // −1dBFS

/**
 * name   … アプリでの名前（audio.js の trySample(name)）
 * file   … 元の音のファイル名（sourceDir の中）
 * start / end … 使う区間（秒）
 * filters … ffmpeg の -af に足すもの
 */
const SOUNDS = [
  {
    name: "cheer",
    file: "otologic-Cheer-Yay02-5(High-Long-Applause).mp3",
    url: "https://otologic.jp/free/se/applause-cheer01.html",
    start: 0,
    end: 3.0,
    fadeOut: 0.9,
    format: "mp3",
  },
  {
    name: "homerun-cheer",
    file: "otologic-SNES-Baseball01-09(Cheer).mp3",
    url: "https://otologic.jp/free/se/game-sports01.html",
    start: 0.12,
    end: 2.3,
    fadeOut: 0.8,
    format: "mp3",
  },
  {
    name: "bat-homerun",
    file: "otologic-SNES-Baseball01-01(Metal_Bat).mp3",
    url: "https://otologic.jp/free/se/game-sports01.html",
    start: 0,
    end: 0.75,
    fadeOut: 0.12,
    format: "wav",
  },
  {
    name: "bat-hit",
    file: "otologic-SNES-Baseball01-03(Wood_Bat).mp3",
    url: "https://otologic.jp/free/se/game-sports01.html",
    start: 0,
    end: 0.7,
    fadeOut: 0.12,
    format: "wav",
  },
  {
    name: "boing",
    file: "commons-Boing_raw.ogg",
    url: "https://commons.wikimedia.org/wiki/File:Boing_raw.ogg",
    start: 0,
    end: 1.5,
    filters: ["highpass=f=180", "afftdn=nr=10:nf=-45"],
    fadeOut: 0.45,
    format: "wav",
  },
  {
    name: "creature-whale",
    file: "commons-Humpbackwhale2.ogg",
    url: "https://commons.wikimedia.org/wiki/File:Humpbackwhale2.ogg",
    // 下がってから伸びる「ウォーン」ひとつ（31.3 秒あたり、780Hz とその倍音）。
    start: 31.28,
    end: 32.95,
    filters: ["highpass=f=320", "lowpass=f=3600", "afftdn=nr=18:nf=-28"],
    fadeIn: 0.06,
    fadeOut: 0.45,
    format: "wav",
  },
  {
    name: "creature-dolphin",
    file: "commons-161691_felixblume_dolphin-screaming-underwater-in-caribbean-sea-mexico.wav",
    url: "https://commons.wikimedia.org/wiki/File:161691_felixblume_dolphin-screaming-underwater-in-caribbean-sea-mexico.wav",
    // 高い声が「キュイー」と下がっていくところ（12.0 秒から。倍音が 14kHz まで
    // あるので、ここだけ 32kHz で書き出す）。
    start: 12.0,
    end: 13.2,
    filters: ["highpass=f=900", "afftdn=nr=12:nf=-40"],
    fadeIn: 0.03,
    fadeOut: 0.3,
    rate: 32000,
    format: "wav",
  },
];

function ffmpeg(args, input) {
  const result = spawnSync("ffmpeg", ["-v", "error", ...args], { input, maxBuffer: 1 << 28 });
  if (result.status !== 0) throw new Error(`ffmpeg ${args.join(" ")}\n${result.stderr}`);
  return result.stdout;
}

/** RBJ の2次高域通過（iPad の内蔵スピーカーの代わり）。 */
function speakerFilter(samples, rate) {
  const w0 = (2 * Math.PI * 300) / rate;
  const alpha = Math.sin(w0) / (2 * 0.7);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const out = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** いちばん大きい 100ms の RMS（dBFS）。 */
function shortTermDb(samples, rate) {
  const win = Math.round(rate * 0.1);
  const step = Math.round(win / 4);
  let best = 0;
  for (let start = 0; start < Math.max(1, samples.length - win + 1); start += step) {
    let sum = 0;
    const stop = Math.min(samples.length, start + win);
    for (let i = start; i < stop; i += 1) sum += samples[i] * samples[i];
    best = Math.max(best, Math.sqrt(sum / win));
  }
  return 20 * Math.log10(best || 1e-9);
}

mkdirSync(outDir, { recursive: true });
const rows = [];
for (const sound of SOUNDS) {
  const src = join(sourceDir, sound.file);
  if (!existsSync(src)) {
    console.warn(`（なし）${sound.file} — ${sound.url} から落として ${sourceDir} に置く`);
    continue;
  }
  const rate = sound.rate ?? (sound.format === "mp3" ? 44100 : 22050);
  const af = [...(sound.filters || [])];
  const raw = ffmpeg([
    "-ss", String(sound.start),
    "-to", String(sound.end),
    "-i", src,
    ...(af.length ? ["-af", af.join(",")] : []),
    "-ac", "1",
    "-ar", String(rate),
    "-f", "f32le",
    "-",
  ]);
  let samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4)).slice();

  // 頭の無音を削る（いちばん大きい山から 40dB 下を越えたところの 3ms 手前から）。
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const onset = samples.findIndex((value) => Math.abs(value) > peak * 0.01);
  samples = samples.slice(Math.max(0, onset - Math.round(rate * 0.003)));

  // 入りと終わりをなめらかに（余弦の山）。
  const fadeIn = Math.round(rate * (sound.fadeIn ?? 0.004));
  for (let i = 0; i < Math.min(fadeIn, samples.length); i += 1) {
    samples[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  }
  const fadeOut = Math.round(rate * (sound.fadeOut ?? 0.05));
  for (let i = 0; i < Math.min(fadeOut, samples.length); i += 1) {
    samples[samples.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
  }

  // 大きさをそろえる。山が −1dBFS を越えるなら、そこで止める。
  const before = shortTermDb(speakerFilter(samples, rate), rate);
  let gain = Math.pow(10, (TARGET_DB - before) / 20);
  peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak * gain > PEAK_LIMIT) gain = PEAK_LIMIT / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
  const after = shortTermDb(speakerFilter(samples, rate), rate);

  const outPath = join(outDir, `${sound.name}.${sound.format}`);
  const codec = sound.format === "mp3" ? ["-c:a", "libmp3lame", "-q:a", "4"] : ["-c:a", "pcm_s16le"];
  ffmpeg(
    ["-y", "-f", "f32le", "-ar", String(rate), "-ac", "1", "-i", "-", ...codec, outPath],
    Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
  );
  rows.push({
    name: sound.name,
    seconds: Number((samples.length / rate).toFixed(2)),
    speakerDb: Number(after.toFixed(1)),
    peakDb: Number((20 * Math.log10(peak * gain)).toFixed(1)),
    kb: Math.round(statSync(outPath).size / 1024),
  });
}
console.table(rows);
