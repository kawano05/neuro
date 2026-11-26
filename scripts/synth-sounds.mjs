// =====================================================================
// synth-sounds.mjs — 録音が手に入らない効果音を、合成して WAV に書く
//
//   node scripts/synth-sounds.mjs [出力のフォルダ]   （既定 test-results/sounds-src/synth）
//
// ここで書いた WAV は、録音と同じく scripts/prepare-sounds.mjs で切り出しと大きさのそろえをして
// src/assets/sounds/ に置く。乱数は種を決めてあるので、何度走らせても同じ音になる。
//
//   jingle.wav … 音あそびの「すず」（2026-11-26）。小さな鈴が いくつも重なって「シャン、シャン」と
//                鳴る音。FluidR3_GM の tinkle_bell は1音の「チーン」で、もっきんと同じに聞こえると
//                言われた。FluidR3 の楽器（128 の旋律の音色）には鈴を振る音が無いので合成する。
// =====================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.argv[2] || "test-results/sounds-src/synth");
const RATE = 44100;

/** 種つきの乱数（mulberry32）。0 以上 1 未満。 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ の2次高域通過（その場で書き換える）。 */
function highpass(samples, cutoff, q = 0.7) {
  const w0 = (2 * Math.PI * cutoff) / RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0;
  const b1 = -(1 + cos) / a0;
  const b2 = (1 + cos) / 2 / a0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    samples[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return samples;
}

/**
 * 「シャン」1回ぶんを out の at 秒から足す。小さな鈴（5つ）が 70ms ほどのあいだに ばらばらに当たり、
 * それぞれが金属らしい倍音（整数倍ではない）を響かせる。鈴の中の玉が擦れる「シャッ」は、高い帯の雑音。
 */
function addShake(out, at, gain, random) {
  const bells = [3150, 3900, 4620, 5480, 6350];
  const ratios = [1, 1.53, 2.17, 2.79];
  const levels = [1, 0.55, 0.36, 0.22];
  const hits = 9;
  for (let h = 0; h < hits; h += 1) {
    const start = at + random() * 0.075;
    const bell = bells[Math.floor(random() * bells.length)] * (0.985 + random() * 0.03);
    const hitGain = gain * (0.55 + random() * 0.45);
    const first = Math.floor(start * RATE);
    ratios.forEach((ratio, p) => {
      const freq = bell * ratio;
      if (freq > RATE / 2 - 1000) return;
      const tau = (0.15 - p * 0.03) * (0.8 + random() * 0.4);
      const phase = random() * Math.PI * 2;
      const length = Math.min(out.length - first, Math.floor(tau * 6 * RATE));
      for (let i = 0; i < length; i += 1) {
        const t = i / RATE;
        // 立ち上がりは 1ms（金属が当たる音）。
        const attack = Math.min(1, t / 0.001);
        out[first + i] += hitGain * levels[p] * attack * Math.exp(-t / tau) * Math.sin(2 * Math.PI * freq * t + phase);
      }
    });
  }
  // 「シャッ」: 高い帯の雑音を、2ms で立ち上げて 60ms ほどで消す。
  const noise = new Float32Array(Math.floor(0.4 * RATE));
  for (let i = 0; i < noise.length; i += 1) {
    const t = i / RATE;
    noise[i] = (random() * 2 - 1) * Math.min(1, t / 0.002) * Math.exp(-t / 0.06);
  }
  highpass(noise, 5200);
  highpass(noise, 5200);
  const first = Math.floor(at * RATE);
  for (let i = 0; i < noise.length && first + i < out.length; i += 1) out[first + i] += gain * 0.9 * noise[i];
}

/** 16bit の WAV（モノラル）にする。山を peak にそろえる。 */
function toWav(samples, peak = 0.8) {
  let max = 0;
  for (const value of samples) max = Math.max(max, Math.abs(value));
  const scale = max > 0 ? peak / max : 1;
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * scale * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function jingle() {
  const random = seeded(20261126);
  const out = new Float32Array(Math.floor(1.0 * RATE));
  // 「シャン、シャン」: 2回振る。2回目は少し弱く。
  addShake(out, 0.0, 1, random);
  addShake(out, 0.3, 0.85, random);
  // 終わりの 0.2 秒を なめらかに消す。
  const fade = Math.floor(0.2 * RATE);
  for (let i = 0; i < fade; i += 1) out[out.length - 1 - i] *= i / fade;
  return out;
}

mkdirSync(outDir, { recursive: true });
const path = join(outDir, "jingle.wav");
writeFileSync(path, toWav(jingle()));
console.log(`wrote ${path}`);
