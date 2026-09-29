// =====================================================================
// games/partyStage.js — 遊びの雰囲気「おおさわぎ」の舞台（押すと 出てくる の上に重ねる）
//
// 押すたびに、次のものが重なっていく（src/lib/party.js・docs/party-mode-2026-09-29.md）:
//   なかま … ラッコが跳ねて、手をたたいて、回る。5回目は大きくなって真ん中へ
//   音楽   … 楽器が1つずつ重なり、最後の1回で音が上がって速くなる（partyMusic.js）
//   キラキラ … 100 → 1,500 → 2まん → 30まん → 500まん。節目を越えるとお祝い。最後はボーナス2倍
//   観客   … 2回目から魚が集まって跳ねる。3回目で旗、5回目はパレードと花火
//   ごほうび … 遊ぶたびにラッコの服が1つもらえる（けっかで見せる）
//
// 押した時刻・記録には触れない（見た目と音だけ）。光の回数・明るさの上限は
// 演出エンジン（fx）が必ず通す。黄色は走査の枠だけに使うので、ここでは使わない。
// =====================================================================

import { POP_ANIMALS, artSvg } from "../art/hakkiriArt.js";
import { PARTY_FANS, buntingSvg, fishSvg, otterSvg, outfitClasses } from "../art/partyArt.js";
import {
  PARTY_FINAL_BONUS,
  PARTY_FINAL_KEY_SHIFT,
  PARTY_MUSIC_LEVELS,
  PARTY_TEMPOS,
  crossedMilestones,
  formatSparkles,
  sparklesAfter,
} from "../party.js";

/** 5回目を押してから、けっかへ進むまで（フィナーレとパレードを見せる）。 */
export const PARTY_FINISH_DELAY_MS = 6200;
/** けっかで、お祝いが終わって枠が動き出すまで。紙吹雪の下で枠を進めない。 */
export const PARTY_RESULT_SCAN_DELAY_MS = 3400;
/** けっかの見せ終わりから、音楽を小さくして止めるまで。 */
const RESULT_MUSIC_FADE_S = 1.6;

/** 節目 → 声（i18n の party.voice.milestone.*）。1000まんはフィナーレの声に入っている。 */
const MILESTONE_VOICE = {
  10000: "party.voice.milestone.1",
  100000: "party.voice.milestone.2",
  1000000: "party.voice.milestone.3",
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

/** 数が増えるときの、上がっていく小さな音。 */
function playRollup(audio) {
  for (let i = 0; i < 6; i += 1) audio?.playChime?.(1046.5 * Math.pow(2, (i * 2) / 12), { delayS: i * 0.07, durationS: 0.16, level: 0.35 });
}

/** 節目のベル。 */
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
 * @param {string} options.mode 表記（数の書き方に使う）
 * @param {object} options.fx 演出（ctx.fx）
 * @param {object} options.audio 音（ctx.audio）
 * @param {(text: string) => void} options.voiceFeedback 声（読み上げが切れていれば画面読み上げへ）
 * @param {string[]} [options.outfits] いま持っているラッコの服
 * @param {(sparkles: number) => ({unlocked: string|null, dayTotal: number, party: object})|null} [options.claim]
 *   遊び終えたときに、その日の合計と服を保存する（gameHost）
 */
export function createPartyStage({ host, t, tHtml, mode, fx, audio, voiceFeedback, outfits = [], claim = null }) {
  const doc = host.ownerDocument;
  const timers = new Set();
  const later = (ms, fn) => {
    const id = doc.defaultView.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  let score = 0;
  let pressed = 0;
  let outcome = null;
  let banner = null;
  let finishing = false;

  const layer = doc.createElement("span");
  layer.className = "party-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    ${buntingSvg()}
    <span class="party-fans">${PARTY_FANS.map(
      (fan, index) => `<span class="party-fan" data-i="${index}" style="right:${fan.right}%;bottom:${fan.bottom}%">${fishSvg(fan.color)}</span>`
    ).join("")}</span>
    <span class="party-otter ${outfitClasses(outfits)}">${otterSvg()}</span>
    <span class="party-counter"><span class="party-counter-label">${tHtml("party.counter")}</span><b class="party-counter-num">${formatSparkles(0, mode)}</b><span class="party-counter-x" hidden>×2</span></span>
    <span class="party-callouts"></span>`;
  host.append(layer);
  const q = (sel) => layer.querySelector(sel);
  const otter = q(".party-otter");
  const moves = otterMotion(otter);
  const counter = q(".party-counter");
  const counterNum = q(".party-counter-num");
  const callouts = q(".party-callouts");

  // まばたきと、盛り上がってからの小さな跳ね（待っているあいだも生きているように）。
  const idle = () => {
    moves.blink();
    if (pressed >= 3 && !finishing) moves.hop(14);
    later(2400 + Math.random() * 1800, idle);
  };
  later(1600, idle);

  function pointIn(el) {
    const box = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height, left: r.left - box.left, top: r.top - box.top };
  }

  /** ハンコ（名前・節目・おおさわぎ！）。x・y は面の中の px。 */
  function stamp(html, { x, y, big = false, color = "#005AFF", holdMs = 1300 } = {}) {
    const el = doc.createElement("span");
    el.className = `party-stamp${big ? " is-big" : ""}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--stamp-color", color);
    el.innerHTML = html;
    callouts.append(el);
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

  function countUp(from, to, ms = 650) {
    const start = doc.defaultView.performance.now();
    const step = (now) => {
      if (!counterNum.isConnected) return;
      const p = Math.min(1, (now - start) / ms);
      counterNum.textContent = formatSparkles(from + (to - from) * (1 - Math.pow(1 - p, 3)), mode);
      if (p < 1) doc.defaultView.requestAnimationFrame(step);
    };
    doc.defaultView.requestAnimationFrame(step);
    playRollup(audio);
  }

  /** キラキラを増やす。越えた節目を返す（ハンコとベルは少しあとに）。 */
  function addScore(target, { stampY = null } = {}) {
    const from = score;
    score = target;
    countUp(from, target);
    counter.style.setProperty("--party-counter-step", String(Math.min(pressed, 4)));
    animate(counter, [{ scale: "1" }, { scale: "1.16", offset: 0.3 }, { scale: "1" }], { duration: 420, easing: "ease-out" });
    const crossed = crossedMilestones(from, target);
    if (crossed.length) {
      const top = crossed[crossed.length - 1];
      later(520, () => {
        const c = pointIn(counter);
        stamp(tHtml("party.milestone", { n: formatSparkles(top, mode) }), { x: c.x, y: stampY ?? c.y + c.h * 1.4, color: "#D65DB1", holdMs: 1500 });
        playBell(audio);
        fx?.partyCheer?.(counter);
      });
    }
    return crossed;
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

  return {
    /** 押したとき（押すと 出てくる の onPress から）。figure は出てきた動物。 */
    press(pressIndex, figure, animalId) {
      pressed = pressIndex + 1;
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
      later(110, () => {
        const art = figure?.querySelector("svg") || figure;
        if (!art?.isConnected) return;
        const p = pointIn(art);
        stamp(tHtml("party.nameStamp", { name: t(`animal.${animalId}`) }), { x: p.left + p.w * 0.92, y: p.top + p.h * 0.1 });
      });
      addScore(sparklesAfter(pressIndex));
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
      if (pressIndex >= 4) later(220, () => voiceFeedback(t(MILESTONE_VOICE[1000000])));
    },

    /**
     * 押した回の声（はじめの遊びの progressSpeech の代わり）。節目を越えた回は節目を、
     * それ以外は動物の名前とほめる言葉を言う。
     */
    pressSpeech(pressIndex, animalId) {
      const crossed = crossedMilestones(pressIndex > 0 ? sparklesAfter(pressIndex - 1) : 0, sparklesAfter(pressIndex));
      const top = crossed[crossed.length - 1];
      if (top && MILESTONE_VOICE[top]) return t(MILESTONE_VOICE[top]);
      return t("party.voice.press", { name: t(`animal.${animalId}`), praise: t(`party.praise.${pressIndex % 4}`) });
    },

    /** 5回目（はじめの遊びの onFinale から）。少し待ってから大きなお祝いへ。 */
    finale() {
      finishing = true;
      const final = sparklesAfter(4) * PARTY_FINAL_BONUS;
      // その日の合計と服を、ここで保存する（けっかの声と絵がそれを使う）。
      outcome = claim ? claim(final) : null;
      later(900, () => {
        clearStamps();
        const figure = host.querySelector(".pop-figure");
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
        later(3800, () => {
          moves.hop(40);
          moves.armsUp(1000);
        });
        stamp(tHtml("party.bigParty"), { x: box.width / 2, y: box.height * 0.22, big: true, color: "#D65DB1", holdMs: 0 });
        playFanfare(audio, PARTY_FINAL_KEY_SHIFT);
        fx?.motion?.shake(host, { px: 5, ms: 260 });
        fx?.partyFinale?.();
        parade(700);
        later(1500, () => {
          const x = q(".party-counter-x");
          if (x) {
            x.hidden = false;
            fx?.motion?.slamIn(x);
          }
          addScore(score * PARTY_FINAL_BONUS, { stampY: box.height * 0.38 });
          voiceFeedback(t("party.voice.bonus"));
        });
        later(3000, () => voiceFeedback(t("party.voice.finale")));
      });
    },

    /** けっかで言うこと（はじめの遊びの finishSpeech の代わり）。もらった服か、ぜんぶそろったか。 */
    rewardSpeech() {
      return outcome?.unlocked ? t(`party.voice.outfit.${outcome.unlocked}`) : t("party.voice.full");
    },

    /** けっかへ渡すもの（results.js が描く）。 */
    summary() {
      return {
        sparkles: score || sparklesAfter(4) * PARTY_FINAL_BONUS,
        unlocked: outcome?.unlocked ?? null,
        dayTotal: outcome?.dayTotal ?? score,
        outfits: outcome?.party?.outfits ?? outfits,
      };
    },

    /**
     * 片づけ。けっかへ進んだとき（keepMusic）は音楽を残し、けっかのお祝いが
     * 終わってから止める（revealPartyResult）。中断のときはすぐ止める。
     */
    destroy({ keepMusic = false } = {}) {
      timers.forEach((id) => doc.defaultView.clearTimeout(id));
      timers.clear();
      if (!keepMusic) audio?.music?.stop(0.4);
      layer.remove();
    },
  };
}

/**
 * けっか（results.js の party-result）を見せる。数え上げ・動物・ラッコ・ごほうび・花火の順。
 * @returns {number} 見せ終わるまで（ms）。この間は枠を動かさない（gameHost）。
 */
export function revealPartyResult(container, { fx, audio }) {
  const root = container?.querySelector?.(".party-result");
  if (!root) return 0;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const mode = root.dataset.mode || "ruby";
  const to = Number(root.dataset.sparkles) || 0;
  const num = root.querySelector(".party-result-num");
  const otter = root.querySelector(".party-result-otter");
  const reward = root.querySelector(".party-result-reward");
  const items = [...root.querySelectorAll(".hk-result-item")];
  const moves = otterMotion(otter);
  if (num) {
    num.textContent = formatSparkles(0, mode);
    const start = win.performance.now() + 200;
    const step = (now) => {
      if (!num.isConnected) return;
      const p = Math.min(1, Math.max(0, (now - start) / 1200));
      num.textContent = formatSparkles(to * (1 - Math.pow(1 - p, 3)), mode);
      if (p < 1) win.requestAnimationFrame(step);
    };
    win.requestAnimationFrame(step);
    win.setTimeout(() => playRollup(audio), 200);
  }
  items.forEach((item, index) => fx?.motion?.popIn(item, { delayMs: 320 + index * 150 }));
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
  win.setTimeout(() => fx?.engine?.fireworks?.({ colors: PARTY_COLORS, bursts: 2 }), 2300);
  win.setTimeout(() => audio?.music?.stop(RESULT_MUSIC_FADE_S), 3200);
  return PARTY_RESULT_SCAN_DELAY_MS;
}
