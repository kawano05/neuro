// =====================================================================
// partyMusic.js — おおさわぎの音楽（押すたびに楽器が1つずつ重なる）
//
// 重なりの段（level 0〜9）:
//   0 マリンバの分散和音 → 1 キック → 2 ベース → 3 4つ打ちと手拍子 → 4 ハイハット
//   → 5 きらきらの16分 → 6 和音 → 7 4小節目の盛り上げ → 8 旋律 → 9 シンバルと声の和音
// 段ごとに楽器を足す条件（play の中の「L >= n なら」の並び）は、算数ドリル「ドパドリル」の
// app/js/audio.js を元に書いた（下の MIT License）。コード進行と旋律は、このアプリで作ったもの。
// 録音は使わず、Web Audio で合成する（オフラインで動く）。
//
// Portions adapted from dopa-drill (https://github.com/grmchn/dopa-drill):
//   MIT License
//   Copyright (c) 2026 gear_machine
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// 大きさ: 効果音の出口（audio.js の effectOut。合図の無い場面の持ち上げが効く）の
// 手前に、音楽だけの出口とコンプレッサーを置く。声が出るあいだは下げる（duck）。
// 音楽は、音が合図にならない遊び（はじめの遊び）だけで鳴らす。合図のある遊びで
// 鳴らすと、測定そのものが変わる。
// =====================================================================

/** 音楽の出口の大きさ。楽器の音（playChime）より少し小さく聞こえるように。 */
export const PARTY_MUSIC_VOLUME = 0.15;
/** 声が出ているあいだの大きさ（PARTY_MUSIC_VOLUME に掛ける）。 */
export const PARTY_MUSIC_DUCK = 0.4;

const PROGRESSION = [
  { tones: [60, 64, 67], bass: 48 },
  { tones: [59, 62, 67], bass: 55 },
  { tones: [57, 60, 64], bass: 57 },
  { tones: [57, 60, 65], bass: 53 },
];
const HOOK = [
  [72, 76, 79, 76, 84, null, 79, null],
  [74, 79, 83, 79, 81, null, 79, 74],
  [72, 76, 81, 76, 79, 81, 84, null],
  [77, 81, 84, 81, 79, null, 76, 74],
];
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
/** 先に予約しておく長さ（秒）と、予約を見直す間隔（ミリ秒）。 */
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

/**
 * @param {object} options
 * @param {() => AudioContext|null} options.getContext
 * @param {(ctx: AudioContext) => AudioNode} options.getOutput 効果音の出口（1回ごとに作る）
 * @param {() => boolean} options.enabled 効果音が入っているか
 */
export function createPartyMusic({ getContext, getOutput, enabled }) {
  let bus = null;
  let noise = null;
  let timer = null;
  let playing = false;
  let level = 0;
  let key = 0;
  let tempo = 112;
  let step = 0;
  let next = 0;

  function ensure() {
    if (!enabled()) return null;
    const ctx = getContext();
    if (!ctx) return null;
    if (!bus) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      bus = ctx.createGain();
      bus.gain.value = 0.0001;
      bus.connect(comp);
      comp.connect(getOutput(ctx));
    }
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  function osc(ctx, type, frequency, at, peak, { attack = 0.005, decay = 0.2 } = {}) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(frequency, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g);
    g.connect(bus);
    o.start(at);
    o.stop(at + decay + 0.05);
    return o;
  }

  function hiss(ctx, at, durationS, peak, { type = "highpass", frequency = 6000, q = 0.7 } = {}) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + durationS);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(at, Math.random() * 0.5, durationS + 0.05);
  }

  function kick(ctx, at, peak) {
    const o = osc(ctx, "sine", 150, at, peak, { attack: 0.002, decay: 0.28 });
    o.frequency.exponentialRampToValueAtTime(48, at + 0.12);
  }

  /** 16分音符1つぶん。i は 0〜63（4小節）。 */
  function play(ctx, i, at, sixteenth) {
    const s = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const L = level;
    const chord = PROGRESSION[bar];
    if (s % 2 === 0 && L <= 7) {
      const f = hz(chord.tones[[0, 1, 2, 1][(s >> 1) % 4]] + 12 + key);
      osc(ctx, "sine", f, at, 0.13 * (1 - L / 10) + 0.03, { decay: 0.28 });
      osc(ctx, "sine", f * 4, at, 0.02, { decay: 0.05 });
    }
    if ((L >= 3 && s % 4 === 0) || (L >= 1 && (s === 0 || s === 8))) kick(ctx, at, L < 3 ? 0.5 : 0.7);
    if (L >= 2 && s % 4 === 0) osc(ctx, "triangle", hz(chord.bass + key + (s % 8 ? 7 : 0)), at, 0.3, { decay: sixteenth * 3 });
    if (L >= 3 && (s === 4 || s === 12)) {
      [0, 0.01, 0.022].forEach((d) => hiss(ctx, at + d, 0.05, 0.26, { type: "bandpass", frequency: 1600, q: 1.2 }));
    }
    if (L >= 4 && s % 4 === 2) hiss(ctx, at, 0.04, 0.12, { frequency: 7500 });
    if (L >= 6 && s % 2 === 1) hiss(ctx, at, 0.025, 0.05, { frequency: 8000 });
    if (L >= 5) osc(ctx, "triangle", hz(chord.tones[s % 3] + 24 + key), at, 0.03, { decay: sixteenth * 0.9 });
    if (L >= 6 && (s === 2 || s === 10)) {
      chord.tones.forEach((m) => osc(ctx, "triangle", hz(m + 12 + key), at, 0.045, { decay: sixteenth * 1.5 }));
    }
    if (L >= 7 && bar === 3 && s >= 8) hiss(ctx, at, 0.08, 0.06 + (s - 8) * 0.025, { type: "bandpass", frequency: 1900, q: 0.9 });
    if (L >= 8 && s % 2 === 0) {
      const m = HOOK[bar][s / 2];
      if (m) {
        osc(ctx, "square", hz(m + key), at, 0.03, { decay: sixteenth * 1.7 });
        osc(ctx, "triangle", hz(m + key), at, 0.06, { decay: sixteenth * 1.7 });
      }
    }
    if (L >= 9 && s === 0 && bar % 2 === 0) hiss(ctx, at, 1.1, 0.07, { frequency: 5000 });
    if (L >= 9 && s === 0) {
      chord.tones.forEach((m) => osc(ctx, "sine", hz(m + 12 + key), at, 0.028, { attack: 0.2, decay: sixteenth * 15 }));
    }
  }

  function tick() {
    const ctx = getContext();
    if (!ctx || !bus) return;
    const sixteenth = 60 / tempo / 4;
    while (next < ctx.currentTime + LOOKAHEAD_S) {
      try {
        play(ctx, step, next, sixteenth);
      } catch {
        // 1音作れなかっても、次の拍へ進む（止まったままにしない）。
      }
      next += sixteenth;
      step = (step + 1) % 64;
    }
  }

  function clearTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  return {
    /** 最初の段で鳴らしはじめる（鳴っていれば頭から）。 */
    start(startLevel = 0) {
      const ctx = ensure();
      if (!ctx) return false;
      clearTimer();
      const t = ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(0.0001, t);
      bus.gain.exponentialRampToValueAtTime(PARTY_MUSIC_VOLUME, t + 0.8);
      level = Math.min(Math.max(Math.round(startLevel), 0), 9);
      key = 0;
      tempo = 112;
      step = 0;
      next = t + 0.1;
      playing = true;
      timer = window.setInterval(tick, TICK_MS);
      return true;
    },
    /** 段・調・速さを変える（次の16分から効く）。 */
    set(nextLevel, { keyShift = null, bpm = null } = {}) {
      level = Math.min(Math.max(Math.round(nextLevel), 0), 9);
      if (Number.isFinite(keyShift)) key = keyShift;
      if (Number.isFinite(bpm) && bpm >= 60 && bpm <= 180) tempo = bpm;
    },
    /** 小さくしてから止める。 */
    stop(fadeS = 1) {
      const wasPlaying = playing;
      playing = false;
      const ctx = getContext();
      if (!wasPlaying || !ctx || !bus) {
        clearTimer();
        return;
      }
      const t = ctx.currentTime;
      const fade = Math.max(0.05, fadeS);
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
      bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      const ending = timer;
      timer = null;
      window.setTimeout(() => {
        // フェードのあいだに start() が呼ばれていれば、その新しい時計は止めない。
        if (ending !== null) window.clearInterval(ending);
      }, fade * 1000 + 150);
    },
    /** 声が出るあいだ下げる。 */
    duck(seconds) {
      const ctx = getContext();
      if (!playing || !ctx || !bus || !(seconds > 0)) return;
      const t = ctx.currentTime;
      const low = PARTY_MUSIC_VOLUME * PARTY_MUSIC_DUCK;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), t);
      bus.gain.linearRampToValueAtTime(low, t + 0.06);
      bus.gain.setValueAtTime(low, t + seconds);
      bus.gain.linearRampToValueAtTime(PARTY_MUSIC_VOLUME, t + seconds + 0.35);
    },
    isPlaying: () => playing,
    level: () => level,
  };
}
