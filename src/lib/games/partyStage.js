// =====================================================================
// games/partyStage.js — 全部の遊びが、出来事と主役だけを渡す共通の舞台
// 型と段で上限を決める。タイミングの試行中は静止し、研究の記録を扱わない。
// ゲームの終了時刻と保存はゲーム側が持ち、お祝いの待ちと表示はホストが持つ。
//
// 押すたびに、次のものが重なっていく（src/lib/party.js・docs/party-mode-2026-09-29.md）:
//   なかま   … ラッコが跳ねて、手をたたいて、回る。5回目は大きくなって真ん中へ
//   音楽     … 楽器が1つずつ重なり、最後の1回で音が上がって速くなる（partyMusic.js）
//   キラキラびん … 出てきた動物から星が飛んで、びんにたまる（1→3→7→11→15）。
//                はんぶん・いっぱいでお祝い。5回目はふたが飛んで星があふれる
//   観客     … 2回目から魚が集まって跳ねる。3回目で旗、5回目はパレードと花火
//   ごほうび … 遊ぶたびにラッコの服が1つもらえる（けっかで見せる）
//
// 押した時刻・記録には触れない（見た目と音だけ）。光の回数・明るさの上限は
// 演出エンジン（fx）が必ず通す。黄色は走査の枠だけに使うので、ここでは使わない。
// =====================================================================

import { POP_ANIMALS, artSvg } from "../art/hakkiriArt.js";
import {
  JAR_SLOTS,
  PARTY_FANS,
  STAR_COLORS,
  buntingSvg,
  fishSvg,
  jarStarsHtml,
  jarSvg,
  miniJarHtml,
  otterSvg,
  outfitClasses,
  starSvg,
} from "../art/partyArt.js";
import { PARTY_FINAL_KEY_SHIFT, PARTY_JAR_CAPACITY, PARTY_MUSIC_LEVELS, PARTY_TEMPOS, atmosphereProfile, jarMomentAt, starsAfter, timingStars } from "../party.js";

/** 5回目を押してから、けっかへ進むまで（星が入りきって「いっぱい！」→ フィナーレとパレード）。 */
export const PARTY_FINISH_DELAY_MS = 7200;
/** 5回目を押してから、フィナーレ（ラッコが大きくなる・ふたが飛ぶ）が始まるまで。 */
const FINALE_AFTER_MS = 2300;
/** 星がびんに入りきってから「はんぶん」「いっぱい」を言うまでの、いちばん早い時刻。 */
const JAR_MOMENT_MIN_MS = 1600;
/** けっかで、お祝いが終わって枠が動き出すまで。紙吹雪の下で枠を進めない。 */
export const PARTY_RESULT_SCAN_DELAY_MS = 3400;
/** けっかの見せ終わりから、音楽を小さくして止めるまで。 */
const RESULT_MUSIC_FADE_S = 1.6;
/** 「きょうの びん」をいくつまで並べるか（それより多いと「+n」）。 */
const MAX_MINI_JARS = 8;

/** びんが「はんぶん」「いっぱい」になった回の、ハンコと声（i18n）。 */
const JAR_MOMENT_TEXT = {
  half: { stamp: "party.half", voice: "party.voice.half" },
  full: { stamp: "party.full", voice: "party.voice.full" },
};
/** おおさわぎの粒の色（黄色を入れない）。 */
export const PARTY_COLORS = Object.freeze(["#FF8082", "#03AF7A", "#F6AA00", "#4DC4FF", "#D65DB1", "#FF4B00", "#FFFFFF"]);

// ---------------------------------------------------------------- ラッコの動き
// 個別の変形（translate / rotate / scale）で動かすので、CSS の息づかいと重なっても消し合わない。

function animate(el, frames, options) {
  if (!el || typeof el.animate !== "function") return null;
  try {
    return el.animate(frames, options);
  } catch {
    return null;
  }
}

/** ラッコ1匹ぶんの動き（遊びの画面と、けっかの画面で同じものを使う）。 */
export function otterMotion(root) {
  const q = (sel) => root?.querySelector(sel) || null;
  return {
    hop(height = 30, { spin = false } = {}) {
      const turn = spin ? 360 : 0;
      animate(
        q(".o-jump"),
        [
          { translate: "0 0", rotate: "0deg" },
          { translate: `0 -${height}px`, rotate: `${turn / 2}deg`, offset: 0.45 },
          { translate: "0 0", rotate: `${turn}deg`, scale: "1.06 0.94", offset: 0.85 },
          { translate: "0 0", rotate: `${turn}deg`, scale: "1 1" },
        ],
        { duration: spin ? 640 : 520, easing: "ease-out" }
      );
    },
    clap(times = 2) {
      const options = { duration: 140, iterations: times * 2, direction: "alternate", easing: "ease-in-out" };
      animate(q(".o-arm-l"), [{ rotate: "0deg" }, { rotate: "-58deg" }], options);
      animate(q(".o-arm-r"), [{ rotate: "0deg" }, { rotate: "58deg" }], options);
    },
    armsUp(ms = 900) {
      const up = (deg) => [
        { rotate: "0deg" },
        { rotate: `${deg}deg`, offset: 0.2 },
        { rotate: `${deg * 0.88}deg`, offset: 0.5 },
        { rotate: `${deg}deg`, offset: 0.8 },
        { rotate: "0deg" },
      ];
      animate(q(".o-arm-l"), up(145), { duration: ms });
      animate(q(".o-arm-r"), up(-145), { duration: ms });
    },
    blink() {
      animate(q(".o-eyes"), [{ scale: "1 1" }, { scale: "1 0.12" }, { scale: "1 1" }], { duration: 140 });
    },
  };
}

/** 手拍子の音（短い雑音を3つ重ねる）。 */
function playClaps(audio, times) {
  for (let i = 0; i < times; i += 1) {
    [0, 0.012, 0.024].forEach((d) =>
      audio?.playNoise?.({ durationS: 0.03, gain: 0.03, filter: "bandpass", frequency: 1800, q: 1.2, delayS: 0.14 + i * 0.28 + d })
    );
  }
}

/** 星がびんに入る音（入るたびに少しずつ高く）。 */
function playStarLand(audio, index, delayS) {
  audio?.playChime?.(1046.5 * Math.pow(2, (Math.min(index, 14) * 1.5) / 12), { delayS, durationS: 0.22, level: 0.4 });
}

/** お祝いのベル。 */
function playBell(audio) {
  [1318.51, 1975.53, 2637.02].forEach((f, i) => audio?.playChime?.(f, { delayS: i * 0.06, durationS: 0.9, level: 0.45 }));
}

/** ファンファーレ（音楽に合わせて上げた調で）。 */
function playFanfare(audio, semitones = 0) {
  const r = Math.pow(2, semitones / 12);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => audio?.playChime?.(f * r, { delayS: 0.06 + i * 0.1, durationS: 0.45, level: 0.7 }));
  [523.25, 659.25, 783.99, 1046.5].forEach((f) => audio?.playChime?.(f * r, { delayS: 0.46, durationS: 1.5, level: 0.42 }));
}

/**
 * 遊びの画面に「おおさわぎ」を重ねる。
 * @param {object} options
 * @param {HTMLElement} options.host 遊びの面（#gameStageContent）
 * @param {(key: string, values?: object) => string} options.t プレーン文
 * @param {(key: string, values?: object) => string} options.tHtml 画面用（ルビ）
 * @param {object} options.fx 演出（ctx.fx）
 * @param {object} options.audio 音（ctx.audio）
 * @param {(text: string) => void} options.voiceFeedback 声（読み上げが切れていれば画面読み上げへ）
 * @param {string[]} [options.outfits] いま持っているラッコの服
 * @param {() => ({unlocked: string|null, jarsToday: number, party: object})|null} [options.claim]
 *   遊び終えたときに、その日のびんの数と服を保存する（gameHost）
 */
export function createPartyStage({ host, t, tHtml, fx, audio, voiceFeedback, outfits = [], claim = null, kind = "beginner", level = fx?.level?.() || "normal", legacy = false }) {
  const profile = atmosphereProfile(level, kind);
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const timers = new Set();
  const later = (ms, fn) => {
    const id = win.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  let stars = 0;
  let pressed = 0;
  let outcome = null;
  let banner = null;
  let finishing = false;
  let successes = 0;
  let fullJars = 0;
  let lastSource = null;

  const layer = doc.createElement("span");
  layer.className = `party-layer${kind === "timing" ? " is-timing" : ""}${!legacy && kind === "beginner" ? " is-beginner" : ""}`;
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    ${profile.crowd ? buntingSvg() : ""}
    <span class="party-fans">${(profile.crowd ? PARTY_FANS : []).map(
      (fan, index) => `<span class="party-fan" data-i="${index}" style="--fan-i:${index};right:${fan.right}%;bottom:${fan.bottom}%">${fishSvg(fan.color)}</span>`
    ).join("")}</span>
    <span class="party-otter ${outfitClasses(outfits)}">${otterSvg()}</span>
    <span class="party-jar" data-stars="0">${jarSvg()}<span class="party-jar-stars"></span></span>
    <span class="party-callouts"></span>`;
  if (profile.liveCompanions) host.append(layer);
  const q = (sel) => layer.querySelector(sel);
  const otter = q(".party-otter");
  const moves = otterMotion(otter);
  const jar = q(".party-jar");
  const jarStars = q(".party-jar-stars");
  const callouts = q(".party-callouts");

  // 面を縮めて飾りの席を作らない。空いている角だけを使い、無ければけっかへ回す。
  const fit = () => {
    if (kind !== "timing" || finishing || !profile.liveCompanions) return;
    const box = host.getBoundingClientRect();
    const obstacles = [...host.querySelectorAll(".slot-reels, .slot-target, .slot-status, .crane-stage, .crane-status, .fishing-scene, .fishing-status, .rhythm-cabinet, .rhythm-stage-instruction")].map(el => el.getBoundingClientRect());
    const width = 150, height = 100;
    const candidates = [12, box.width - width - 12].map(x => ({ left: box.left + x, right: box.left + x + width, top: box.bottom - height - 12, bottom: box.bottom - 12, x }));
    const free = box.height >= 400 && box.width >= 900 && candidates.find(c => obstacles.every(r => r.width === 0 || r.height === 0 || c.right + 8 <= r.left || c.left - 8 >= r.right || c.bottom + 8 <= r.top || c.top - 8 >= r.bottom));
    layer.classList.toggle("is-hidden-live", !free);
    if (free) {
      otter.style.left = `${free.x}px`;
      jar.style.left = `${free.x + 78}px`;
      jar.dataset.stars = String(stars);
      jarStars.innerHTML = jarStarsHtml(stars);
    }
  };
  fit();
  win.addEventListener("resize", fit);

  // まばたきと、盛り上がってからの小さな跳ね（待っているあいだも生きているように）。
  const idle = () => {
    moves.blink();
    if (pressed >= 3 && !finishing) moves.hop(14);
    later(2400 + Math.random() * 1800, idle);
  };
  if (profile.liveCompanions && kind === "beginner") later(1600, idle);
  if (profile.music) audio?.music?.start(0);

  function pointIn(el) {
    const box = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height, left: r.left - box.left, top: r.top - box.top };
  }

  /** ハンコ（名前・はんぶん・いっぱい・おおさわぎ！）。x・y は面の中の px。 */
  function stamp(html, { x, y, big = false, color = "#005AFF", holdMs = 1300 } = {}) {
    const el = doc.createElement("span");
    el.className = `party-stamp${big ? " is-big" : ""}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--stamp-color", color);
    el.innerHTML = html;
    callouts.append(el);
    // 画面の端で切れないよう、横の位置を面の中へ収める（右上のびんの下など）。
    const hostWidth = host.getBoundingClientRect().width;
    const half = el.offsetWidth / 2 + 12;
    if (hostWidth > half * 2) el.style.left = `${Math.min(Math.max(x, half), hostWidth - half)}px`;
    animate(
      el,
      [
        { opacity: 0, scale: "2.4", rotate: "-16deg" },
        { opacity: 1, scale: "0.92", rotate: "-8deg", offset: 0.6 },
        { opacity: 1, scale: "1", rotate: "-8deg" },
      ],
      { duration: 260, easing: "ease-out", fill: "both" }
    );
    if (holdMs > 0) {
      later(holdMs, () => {
        const fade = animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
        if (fade) fade.onfinish = () => el.remove();
        else el.remove();
      });
    }
    return el;
  }

  function clearStamps() {
    callouts.querySelectorAll(".party-stamp").forEach((el) => el.remove());
  }

  /**
   * 出てきた動物から星が飛んで、びんに入る（from 番目から to 番目の手前まで）。
   * 星は1つずつ少しずつずらして飛ばし、入るたびに音が少しずつ上がる。
   */
  function fillJar(from, to, sourceEl, quiet = false) {
    const box = host.getBoundingClientRect();
    const start = sourceEl?.isConnected ? pointIn(sourceEl) : { x: box.width / 2, y: box.height / 2 };
    const jarBox = jar.getBoundingClientRect();
    for (let i = from; i < to; i += 1) {
      const slot = JAR_SLOTS[i];
      const color = STAR_COLORS[i % STAR_COLORS.length];
      const delayMs = quiet ? 0 : (i - from) * 110;
      const endX = jarBox.left - box.left + (jarBox.width * slot.left) / 100;
      const endY = jarBox.top - box.top + (jarBox.height * slot.top) / 100;
      const flyer = doc.createElement("span");
      flyer.className = "party-star-flyer";
      flyer.style.left = `${start.x}px`;
      flyer.style.top = `${start.y}px`;
      flyer.innerHTML = starSvg(color);
      callouts.append(flyer);
      const dx = endX - start.x;
      const dy = endY - start.y;
      const flight = animate(
        flyer,
        [
          { translate: "0 0", scale: "1.6", rotate: "0deg", opacity: 0 },
          { translate: `${dx * 0.4}px ${dy * 0.4 - 90}px`, scale: "1.3", rotate: "180deg", opacity: 1, offset: 0.45 },
          { translate: `${dx}px ${dy}px`, scale: "1", rotate: "360deg", opacity: 1 },
        ],
        { duration: quiet ? 220 : 620, delay: delayMs, easing: "cubic-bezier(.45,0,.55,1)", fill: "both" }
      );
      const land = () => {
        flyer.remove();
        if (!jarStars.isConnected) return;
        const star = doc.createElement("span");
        star.className = "party-star";
        star.style.left = `${slot.left.toFixed(2)}%`;
        star.style.top = `${slot.top.toFixed(2)}%`;
        star.innerHTML = starSvg(color);
        jarStars.append(star);
        if (!quiet) {
          animate(star, [{ scale: "1.5" }, { scale: "0.85", offset: 0.6 }, { scale: "1" }], { duration: 260, easing: "ease-out" });
          fx?.motion?.bump(jar, { amount: 0.08 });
        }
      };
      if (flight) flight.onfinish = land;
      else later(delayMs + (quiet ? 220 : 620), land);
      if (!quiet) playStarLand(audio, i, (delayMs + 600) / 1000);
    }
    jar.dataset.stars = String(to);
  }

  function showFans(k) {
    const n = k >= 3 ? 6 : k >= 2 ? 4 : k >= 1 ? 2 : 0;
    layer.querySelectorAll(".party-fan").forEach((el, index) => {
      if (index >= n || el.classList.contains("is-on")) return;
      el.classList.add("is-on");
      fx?.motion?.popIn(el, { delayMs: (index % 2) * 120 });
    });
    layer.querySelectorAll(".party-fan.is-on").forEach((el, index) => fx?.motion?.hop(el, { delayMs: 90 + index * 70, height: 24 }));
  }

  function dropBunting() {
    const bunting = q(".party-bunting");
    if (!bunting || bunting.classList.contains("is-on")) return;
    bunting.classList.add("is-on");
    animate(bunting, [{ translate: "0 -120%" }, { translate: "0 0" }], { duration: 620, easing: "cubic-bezier(.34,1.36,.64,1)" });
  }

  function showBanner(html) {
    const el = doc.createElement("span");
    el.className = "party-banner";
    el.innerHTML = html;
    callouts.append(el);
    animate(el, [{ opacity: 0, translate: "60vw 0" }, { opacity: 1, translate: "0 0" }], { duration: 340, easing: "cubic-bezier(.34,1.36,.64,1)", fill: "both" });
    return el;
  }

  function parade(delayMs) {
    const row = doc.createElement("span");
    row.className = "party-parade";
    row.innerHTML =
      POP_ANIMALS.map((animal) => `<span class="party-parade-item">${artSvg(animal)}</span>`).join("") +
      PARTY_FANS.map((fan) => `<span class="party-parade-item is-fish">${fishSvg(fan.color)}</span>`).join("");
    callouts.append(row);
    layer.querySelectorAll(".party-fan").forEach((el) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: delayMs, fill: "forwards" }));
    const width = host.getBoundingClientRect().width;
    const rowWidth = row.getBoundingClientRect().width || width;
    animate(row, [{ translate: `${-rowWidth}px 0` }, { translate: `${width}px 0` }], { duration: 4600, delay: delayMs, easing: "linear", fill: "both" });
  }

  /** びんが「はんぶん」「いっぱい」になったお祝い（星が入り終わってから。声もそこで）。 */
  function celebrateJar(moment, afterMs) {
    const text = JAR_MOMENT_TEXT[moment];
    if (!text) return;
    later(afterMs, () => {
      const c = pointIn(jar);
      // 新しい遊びでは右の主役へかぶせず、左下の余白で節目を知らせる。
      const box = host.getBoundingClientRect();
      const position = legacy ? {x:c.x,y:c.top+c.h+36} : {x:box.width*0.25,y:box.height-50};
      stamp(tHtml(text.stamp), { ...position, color: "#D65DB1", holdMs: 1500 });
      playBell(audio);
      fx?.partyCheer?.(jar);
      voiceFeedback(t(text.voice));
    });
  }

  return {
    /** 遊びの側は、結果が確定したあとに主役と出来事だけを渡す。 */
    react({ index = pressed, source = null, name = null, success = true, total = 5, endless = false } = {}) {
      const pressIndex = index;
      const figure = source;
      lastSource = source;
      pressed = pressIndex + 1;
      const previous = stars;
      if (success) successes += 1;
      const collected = kind === "timing" ? timingStars(successes, total, endless) : { stars: starsAfter(pressIndex), jars: pressIndex >= 4 ? 1 : 0 };
      stars = collected.stars;
      fullJars = collected.jars;
      if (level === "none" && kind === "beginner" && source) animate(source, [{scale:"1"},{scale:"1.03 .97"},{scale:"1"}], {duration:180});
      if (!profile.liveCompanions) return;
      if (kind === "timing") {
        // 合図の間へ長い音や声を持ち越さない。成功の反応は220msで閉じる。
        if (getComputedStyle(layer).display === "none") return;
        if (!success) {
          animate(otter.querySelector(".o-jump"), [{rotate:"0deg"},{rotate:"4deg"},{rotate:"0deg"}], {duration:180});
          return;
        }
        animate(otter.querySelector(".o-jump"), [{translate:"0 0"},{translate:"0 -8px"},{translate:"0 0"}], {duration:220});
        animate(otter.querySelector(".o-arm-l"), [{rotate:"0deg"},{rotate:"-58deg"},{rotate:"0deg"}], {duration:220});
        animate(otter.querySelector(".o-arm-r"), [{rotate:"0deg"},{rotate:"58deg"},{rotate:"0deg"}], {duration:220});
        if (stars < previous) jarStars.innerHTML = "";
        fillJar(stars < previous ? 0 : previous, stars, source, true);
        if ((previous < 7 && stars >= 7) || (previous < 15 && stars === 15)) {
          const c = pointIn(jar);
          const tag = stamp(tHtml(stars === 15 ? "party.full" : "party.half"), {x:c.x,y:c.top - 8,holdMs:0,color:"#D65DB1"});
          tag.classList.add("is-short");
          tag.getAnimations().forEach(animation => animation.cancel());
          later(200, () => tag.remove());
          audio?.playChime?.(1318.51, {durationS:0.08,level:0.2});
        }
        return;
      }
      if (banner) {
        banner.remove();
        banner = null;
      }
      const music = audio?.music;
      if (music && !music.isPlaying()) music.start(PARTY_MUSIC_LEVELS[Math.min(pressIndex, 4)]);
      music?.set(PARTY_MUSIC_LEVELS[Math.min(pressIndex, 4)], {
        bpm: PARTY_TEMPOS[Math.min(pressIndex, 4)],
        keyShift: pressIndex >= 4 ? PARTY_FINAL_KEY_SHIFT : 0,
      });
      fx?.partyPress?.(figure, { k: pressIndex });
      if (name) later(110, () => {
        const art = figure?.querySelector("svg") || figure;
        if (!art?.isConnected) return;
        const p = pointIn(art);
        stamp(tHtml("party.nameStamp", { name }), { x: p.left + p.w * 0.92, y: p.top + p.h * 0.1 });
      });
      // 出てきた動物から星が飛んで、びんに入る。
      const from = previous;
      const to = stars;
      later(260, () => fillJar(from, to, figure?.querySelector("svg") || figure));
      const moment = jarMomentAt(pressIndex);
      if (moment) celebrateJar(moment, Math.max(JAR_MOMENT_MIN_MS, 260 + (stars - from - 1) * 110 + 720));
      if (pressIndex === 0) {
        moves.hop(24);
        moves.armsUp(700);
      } else if (pressIndex === 1) {
        moves.hop(30);
        moves.clap(2);
        playClaps(audio, 2);
      } else if (pressIndex === 2) {
        moves.hop(46, { spin: true });
        moves.clap(3);
        playClaps(audio, 3);
      } else if (pressIndex === 3) {
        moves.hop(52);
        moves.clap(4);
        playClaps(audio, 4);
      } else {
        moves.hop(72, { spin: true });
        moves.armsUp(1200);
      }
      otter.classList.add("is-cheering");
      later(1000, () => otter.classList.remove("is-cheering"));
      showFans(pressIndex);
      if (pressIndex >= 2) dropBunting();
      if (pressIndex === 3) {
        later(700, () => {
          if (pressed !== 4) return;
          banner = showBanner(tHtml("party.oneMore"));
          audio?.playSweep?.({ fromHz: 523, toHz: 1046, durationS: 0.6, gain: 0.03 });
          later(900, () => {
            if (pressed === 4) voiceFeedback(t("party.voice.oneMore"));
          });
        });
      }
    },

    /**
     * 押した回の声（はじめの遊びの progressSpeech の代わり）。動物の名前とほめる言葉。
     * 「はんぶん」「いっぱい」は、星が入りきったときに別に言う（celebrateJar）。
     */
    pressSpeech(pressIndex, name) {
      return name ? t("party.voice.press", { name, praise: t(`party.praise.${pressIndex % 4}`) }) : t(`party.praise.${pressIndex % 4}`);
    },

    /** 5回目（はじめの遊びの onFinale から）。星が入り終わってから大きなお祝いへ。 */
    finale() {
      if (finishing) return;
      finishing = true;
      if (!profile.reward) return;
      // その日のびんの数と服を、ここで保存する（けっかの声と絵がそれを使う）。
      outcome = claim ? claim(fullJars) : null;
      // 狭い課題画面では、試行後に舞台を開いてから祝う。
      layer.classList.add("is-finale");
      jar.dataset.stars = String(stars);
      if (kind === "timing") jarStars.innerHTML = jarStarsHtml(stars);
      later(FINALE_AFTER_MS, () => {
        clearStamps();
        const figure = legacy ? host.querySelector(".pop-figure") : lastSource;
        if (figure) animate(figure, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
        const from = pointIn(otter);
        const box = host.getBoundingClientRect();
        animate(
          otter,
          [
            { translate: "0 0", scale: "1" },
            { translate: `${box.width / 2 - from.x}px ${-box.height * 0.05}px`, scale: "2" },
          ],
          { duration: 700, easing: "cubic-bezier(.34,1.36,.64,1)", fill: "forwards" }
        );
        otter.classList.add("is-cheering");
        moves.armsUp(1400);
        later(900, () => {
          moves.clap(4);
          playClaps(audio, 4);
        });
        later(2400, () => {
          moves.hop(60, { spin: true });
          moves.clap(3);
        });
        stamp(tHtml("party.bigParty"), { x: box.width / 2, y: box.height * 0.3, big: true, color: "#D65DB1", holdMs: 0 });
        playFanfare(audio, PARTY_FINAL_KEY_SHIFT);
        fx?.motion?.shake(host, { px: 5, ms: 260 });
        fx?.partyFinale?.();
        parade(500);
        // びんのふたが飛んで、星があふれる。
        later(700, () => {
          const lid = jar.querySelector(".jar-lid");
          if (stars === PARTY_JAR_CAPACITY) {
            animate(lid, [{ translate: "0 0", rotate: "0deg" }, { translate: "40px -120px", rotate: "40deg", opacity: 0 }], { duration: 700, easing: "ease-out", fill: "forwards" });
            fx?.partyOverflow?.(jar);
          }
          playBell(audio);
          if (stars === PARTY_JAR_CAPACITY) voiceFeedback(t("party.voice.overflow"));
        });
        later(2300, () => voiceFeedback(t("party.voice.everyone")));
      });
    },

    /** けっかで言うこと（はじめの遊びの finishSpeech の代わり）。もらった服か、いっぱいになったこと。 */
    rewardSpeech() {
      return outcome?.unlocked ? t(`party.voice.outfit.${outcome.unlocked}`) : t(stars === PARTY_JAR_CAPACITY ? "party.voice.full" : "color.voice.cheer");
    },

    /** けっかへ渡すもの（results.js が描く）。 */
    summary() {
      return {
        level,
        stars,
        unlocked: outcome?.unlocked ?? null,
        jarsToday: outcome?.jarsToday ?? 0,
        outfits: outcome?.party?.outfits ?? outfits,
      };
    },

    /**
     * 片づけ。けっかへ進んだとき（keepMusic）は音楽を残し、けっかのお祝いが
     * 終わってから止める（revealPartyResult）。中断のときはすぐ止める。
     */
    destroy({ keepMusic = false } = {}) {
      timers.forEach((id) => win.clearTimeout(id));
      timers.clear();
      win.removeEventListener("resize", fit);
      layer.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
      if (!keepMusic && profile.music) audio?.music?.stop(0.4);
      layer.remove();
    },
    profile,
    finishing: () => finishing,
  };
}

/** けっかに並べる「きょうの びん」（いっぱいにした数だけ。多ければ「+n」）。 */
export function todayJarsHtml(count) {
  const n = Math.max(0, Math.round(count || 0));
  const shown = Math.min(n, MAX_MINI_JARS);
  const more = n - shown;
  return `${Array.from({ length: shown }, () => miniJarHtml()).join("")}${more > 0 ? `<span class="party-more-jars">+${more}</span>` : ""}`;
}

/** けっかの大きなびん（星でいっぱい）。 */
export function fullJarHtml(count = PARTY_JAR_CAPACITY) {
  return `<span class="party-result-jar">${jarSvg()}<span class="party-jar-stars">${jarStarsHtml(count)}</span></span>`;
}

/**
 * けっか（results.js の party-result）を見せる。びんの星・動物・きょうのびん・ラッコ・ごほうび・花火の順。
 * @returns {number} 見せ終わるまで（ms）。この間は枠を動かさない（gameHost）。
 */
export function revealPartyResult(container, { fx, audio, isCurrent = null }) {
  const root = container?.querySelector?.(".party-result");
  if (!root) return 0;
  const win = root.ownerDocument.defaultView;
  const otter = root.querySelector(".party-result-otter");
  const reward = root.querySelector(".party-result-reward");
  const jarStars = [...root.querySelectorAll(".party-result-jar .party-star")];
  const items = [...root.querySelectorAll(".hk-result-item")];
  const today = [...root.querySelectorAll(".party-today .party-mini-jar")];
  const moves = otterMotion(otter);
  if (root.dataset.level === "normal") {
    fx?.motion?.slamIn(root.querySelector(".party-result-jar"), { delayMs: 60 });
    jarStars.forEach((star, index) => fx?.motion?.popIn(star, { delayMs: 160 + index * 35 }));
    fx?.motion?.popIn(otter, { delayMs: 500 });
    win.setTimeout(() => { if (root.isConnected) moves.clap(2); }, 650);
    return 1400;
  }
  fx?.motion?.slamIn(root.querySelector(".party-result-jar"), { delayMs: 60 });
  jarStars.forEach((star, index) => {
    fx?.motion?.popIn(star, { delayMs: 260 + index * 55 });
    playStarLand(audio, index, (260 + index * 55) / 1000);
  });
  items.forEach((item, index) => fx?.motion?.popIn(item, { delayMs: 1100 + index * 110 }));
  today.forEach((jar, index) => fx?.motion?.popIn(jar, { delayMs: 1300 + index * 90 }));
  fx?.motion?.slamIn(otter, { delayMs: 1500 });
  win.setTimeout(() => {
    if (!root.isConnected) return;
    playBell(audio);
    moves.hop(40, { spin: true });
    moves.clap(3);
  }, 1800);
  fx?.motion?.slamIn(reward, { delayMs: 2000 });
  win.setTimeout(() => {
    if (!root.isConnected || !otter) return;
    fx?.partyReward?.(otter);
  }, 2200);
  win.setTimeout(() => { if (root.isConnected) fx?.engine?.fireworks?.({ colors: PARTY_COLORS, bursts: 2 }); }, 2300);
  // けっかの描き直しでも曲を止める。次の遊びへ移ったあとは、その曲を止めない。
  win.setTimeout(() => { if (isCurrent ? isCurrent() : root.isConnected) audio?.music?.stop(RESULT_MUSIC_FADE_S); }, 3200);
  return PARTY_RESULT_SCAN_DELAY_MS;
}
