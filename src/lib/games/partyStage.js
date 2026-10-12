// =====================================================================
// games/partyStage.js — 全部の遊びが、出来事と主役だけを渡す共通の舞台
// 型と段で上限を決める。タイミングの試行中は静止し、研究の記録を扱わない。
// ゲームの終了時刻と保存はゲーム側が持ち、お祝いの待ちと表示はホストが持つ。
//
// 押すたびに、次のものが重なっていく（src/lib/party.js・docs/party-mode-2026-09-29.md）:
//   なかま   … ラッコが跳ねて、手をたたいて、回る
//   音楽     … 楽器が1つずつ重なり、最後の1回で音が上がって速くなる（partyMusic.js）
//   キラキラびん … 押したものから、その遊びのもの（星・ふうせん・絵の具・ボール・絵がら・景品・
//                魚・音符）が飛んで、びんにたまる（1→3→7→11→15）。はんぶん・いっぱいでお祝い。
//                最後はふたが飛んで中身があふれる
//   観客     … 2回目から集まって跳ねる（海の魚・空の小鳥・クレヨン・応援団）。3回目で旗
//   見せ場   … 最後は遊びごとに: ラッコが真ん中へ（押すと 出てくる）・くす玉（ふうせん）・
//                額縁と金の札（ぬりえ）・応援団と ジェット風船（ボール）・パレード（課題）
//   ごほうび … 遊ぶたびにラッコの服が1つもらえる（けっかで見せる）
// 遊びごとに何を出すかは src/lib/partyThemes.js の表、絵は art/partyThemeArt.js（2026-10-01、
// 「全部同じ演出になっている。それぞれのゲームにあった演出に」と言われて分けた）。
//
// 押した時刻・記録には触れない（見た目と音だけ）。光の回数・明るさの上限は
// 演出エンジン（fx）が必ず通す。黄色は走査の枠だけに使うので、ここでは使わない。
// =====================================================================

import { presentation } from "../presentation.js";
import { JAR_SLOTS, PARTY_FANS, buntingSvg, jarSvg, otterSvg, outfitClasses } from "../art/partyArt.js";
import {
  crowdSvg,
  jarItemHtml,
  jarItemsHtml,
  kusudamaHalfSvg,
  miniJarHtml,
  paradeItems,
  rosetteSvg,
  themeItemSvg,
} from "../art/partyThemeArt.js";
import { partyThemeFor } from "../partyThemes.js";
import {
  PARTY_FINAL_KEY_SHIFT,
  PARTY_JAR_CAPACITY,
  PARTY_MUSIC_LEVELS,
  PARTY_TEMPOS,
  jarMomentAt,
  starsAfter,
  timingStars,
} from "../party.js";
import { atmosphereFor } from "../atmosphere.js";

// 待ち時間の持ち主は atmosphere.js の表。遊びとテストがここから引けるよう、名前だけ渡す。
export { PARTY_FINISH_DELAY_MS, PARTY_RESULT_SCAN_DELAY_MS } from "../atmosphere.js";

/** 遊びの画面の上の帯（遊びの名前・この遊びの設定・おわる）の高さの目安。見せ場はこの下に置く。 */
const TOP_BAR_PX = 72;
/** 5回目を押してから、フィナーレ（ラッコが大きくなる・ふたが飛ぶ）が始まるまで。 */
const FINALE_AFTER_MS = 2300;
/** 星がびんに入りきってから「はんぶん」「いっぱい」を言うまでの、いちばん早い時刻。 */
const JAR_MOMENT_MIN_MS = 1600;
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
  if (el.ownerDocument?.body?.dataset.decorationMotion === "off") return null;
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

/** 応援の三三七拍子（ボールを打つ の見せ場）。 */
function playCheerClaps(audio, startS) {
  [0, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14].forEach((beat) =>
    [0, 0.012, 0.024].forEach((d) =>
      audio?.playNoise?.({ durationS: 0.03, gain: 0.03, filter: "bandpass", frequency: 1800, q: 1.2, delayS: startS + beat * 0.3 + d })
    )
  );
}

/**
 * 見せ場の決めの音（ファンファーレのあと）。later は舞台のタイマー（片づけで止まる）。
 * 押すと 出てくる は元のまま（ファンファーレとベルと拍手）。
 */
const FINALE_SOUNDS = {
  // くす玉が割れる「パカッ」と、上がる音。
  balloon: (audio, later) =>
    later(900, () => {
      audio?.playNoise?.({ durationS: 0.08, gain: 0.05, filter: "bandpass", frequency: 2400, q: 0.9 });
      audio?.playSweep?.({ fromHz: 600, toHz: 1600, durationS: 0.22, gain: 0.03 });
    }),
  // 額縁が付いたときの、きらきらの駆け上がり。
  coloring: (audio) =>
    [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => audio?.playChime?.(f, { delayS: 0.5 + i * 0.07, durationS: 0.6, level: 0.4 })),
  // 三三七拍子と、ジェット風船の「ピューッ」。
  baseball: (audio, later) => {
    playCheerClaps(audio, 0.9);
    [500, 760].forEach((ms) => later(ms, () => audio?.playSweep?.({ fromHz: 700, toHz: 2200, durationS: 0.7, gain: 0.025 })));
  },
  // リールが止まる「ピタッ」を3つ。
  slot: (audio) =>
    [1567.98, 1567.98, 2093].forEach((f, i) => audio?.playChime?.(f, { delayS: 0.9 + i * 0.16, durationS: 0.3, level: 0.45 })),
  // 景品がはねる「ぼよん」。
  crane: (audio, later) => [900, 1280, 1660].forEach((ms) => later(ms, () => audio?.playBoing?.())),
  // 魚が跳ねて、水に落ちる「ざぶん」。
  fishing: (audio, later) =>
    [900, 1800, 2700].forEach((ms) =>
      later(ms, () => audio?.playNoise?.({ durationS: 0.28, gain: 0.04, filter: "lowpass", frequency: 1400, sweepTo: 300 }))
    ),
  // 高い音へ駆け上がる旋律。
  gonogo: (audio) =>
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093].forEach((f, i) =>
      audio?.playChime?.(f, { delayS: 1 + i * 0.13, durationS: 0.45, level: 0.45 })
    ),
};

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
 * @param {"beginner"|"timing"} [options.kind] 遊びの型（atmosphere.js の atmosphereFor）
 * @param {string} [options.level] 雰囲気の段（既定は fx の今の段）
 * @param {string} [options.theme] 遊びの id（お祝いの型。src/lib/partyThemes.js）。押すと 出てくる
 *   （型 pop）は、動物の名前と配置・ラッコが真ん中へ出る見せ場を元のまま使う
 * @param {boolean} [options.audioCue] 合図が音の課題（高い音だけ・さかなつり）。節目の音を鳴らさない
 */
export function createPartyStage({
  host,
  t,
  tHtml,
  fx,
  audio,
  voiceFeedback,
  outfits = [],
  claim = null,
  kind = "beginner",
  level = fx?.level?.() || "none",
  theme = null,
  audioCue = false,
}) {
  const profile = atmosphereFor(level, kind, { audioCue });
  const look = partyThemeFor(theme) ?? partyThemeFor("pop");
  // 押すと 出てくる の元の配置（動物の名前のハンコ・びんの位置・ラッコが真ん中へ）。
  const legacy = look.id === "pop";
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  const timers = new Set();
  const later = (ms, fn) => {
    const id = win.setTimeout(() => {
      timers.delete(id);
      presentation.run("party.timer", fn);
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
  // 課題の予定回数（見せ場の札を選ぶ。半分より少ない回は「大漁！」などと言わない）。
  let plannedTotal = 5;
  let endlessRun = false;

  const layer = doc.createElement("span");
  layer.className = `party-layer${kind === "timing" ? " is-timing" : ""}${!legacy && kind === "beginner" ? " is-beginner" : ""}`;
  layer.dataset.theme = look.id;
  layer.setAttribute("aria-hidden", "true");
  const crowd = profile.crowd && look.crowd ? PARTY_FANS : [];
  layer.innerHTML = `
    ${profile.crowd ? buntingSvg() : ""}
    <span class="party-fans">${crowd.map(
      (fan, index) => `<span class="party-fan" data-i="${index}" style="--fan-i:${index};right:${fan.right}%;bottom:${fan.bottom}%">${crowdSvg(look.crowd, fan.color)}</span>`
    ).join("")}</span>
    <span class="party-otter ${outfitClasses(outfits)}">${otterSvg()}</span>
    <span class="party-jar" data-stars="0">${jarSvg()}<span class="party-jar-items"></span></span>
    <span class="party-callouts"></span>`;
  const q = (sel) => layer.querySelector(sel);
  const otter = q(".party-otter");
  const moves = otterMotion(otter);
  const jar = q(".party-jar");
  const jarItems = q(".party-jar-items");
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
      jarItems.innerHTML = jarItemsHtml(stars, look.id);
    }
  };
  // まばたきと、盛り上がってからの小さな跳ね（待っているあいだも生きているように）。
  const idle = () => {
    moves.blink();
    if (pressed >= 3 && !finishing) moves.hop(14);
    later(2400 + Math.random() * 1800, idle);
  };
  // ここから先は、面・窓・音楽に手を出す。部品の組み立て（上）が済んでから。
  if (profile.liveCompanions) {
    host.append(layer);
    fit();
    win.addEventListener("resize", fit);
    if (kind === "beginner") later(1600, idle);
  }
  if (profile.music) audio?.music?.start(0);

  function pointIn(el) {
    const box = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height, left: r.left - box.left, top: r.top - box.top };
  }

  /**
   * ハンコ（名前・はんぶん・いっぱい・最後の札）。x・y は面の中の px。
   * tilt=false は傾けずに置く（ぬりえの額縁の下の札）。
   */
  function stamp(html, { x, y, big = false, color = "#005AFF", holdMs = 1300, tilt = true, className = "" } = {}) {
    const el = doc.createElement("span");
    el.className = `party-stamp${big ? " is-big" : ""}${className ? ` ${className}` : ""}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--stamp-color", color);
    el.innerHTML = html;
    callouts.append(el);
    // 画面の端で切れないよう、横の位置を面の中へ収める（右上のびんの下など）。
    const hostWidth = host.getBoundingClientRect().width;
    const half = el.offsetWidth / 2 + 12;
    if (hostWidth > half * 2) el.style.left = `${Math.min(Math.max(x, half), hostWidth - half)}px`;
    const angle = tilt ? -8 : 0;
    animate(
      el,
      [
        { opacity: 0, scale: "2.4", rotate: `${angle * 2}deg` },
        { opacity: 1, scale: "0.92", rotate: `${angle}deg`, offset: 0.6 },
        { opacity: 1, scale: "1", rotate: `${angle}deg` },
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
   * 押したものから、その遊びのもの（星・ふうせん・魚…）が飛んで、びんに入る（from 番目から
   * to 番目の手前まで）。1つずつ少しずつずらして飛ばし、入るたびに音が少しずつ上がる。
   */
  function fillJar(from, to, sourceEl, quiet = false) {
    const box = host.getBoundingClientRect();
    const start = sourceEl?.isConnected ? pointIn(sourceEl) : { x: box.width / 2, y: box.height / 2 };
    const jarBox = jar.getBoundingClientRect();
    for (let i = from; i < to; i += 1) {
      const slot = JAR_SLOTS[i];
      const delayMs = quiet ? 0 : (i - from) * 110;
      const endX = jarBox.left - box.left + (jarBox.width * slot.left) / 100;
      const endY = jarBox.top - box.top + (jarBox.height * slot.top) / 100;
      const flyer = doc.createElement("span");
      flyer.className = "party-item-flyer";
      flyer.style.left = `${start.x}px`;
      flyer.style.top = `${start.y}px`;
      flyer.innerHTML = themeItemSvg(look.id, i);
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
        if (!jarItems.isConnected) return;
        jarItems.insertAdjacentHTML("beforeend", jarItemHtml(look.id, i));
        const item = jarItems.lastElementChild;
        if (!quiet) {
          animate(item, [{ scale: "1.5" }, { scale: "0.85", offset: 0.6 }, { scale: "1" }], { duration: 260, easing: "ease-out" });
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

  /**
   * 最後のパレード（型の parade）。
   *   march … はねながら横切る（押すと 出てくる は動物と魚。観客の魚は列に加わるので消す）
   *   rise  … 下から空へ上がる（ふうせん・ジェット風船）
   *   leap  … 水面から弧を描いて跳ぶ（さかなつり）。跳ぶところと落ちるところで しぶき
   */
  function parade(delayMs) {
    const row = doc.createElement("span");
    row.className = `party-parade is-${look.parade}`;
    row.dataset.theme = look.id;
    row.innerHTML = paradeItems(look.id)
      .map((item) => `<span class="party-parade-item${item.fish ? " is-fish" : ""}">${item.html}</span>`)
      .join("");
    callouts.append(row);
    const box = host.getBoundingClientRect();
    const items = [...row.children];
    if (look.parade === "march") {
      // 低い画面では、横切る列が遊びの言葉（ぬりえの「できあがり！」）にかかるので出さない。
      if (look.avoid && box.height < 480) {
        row.remove();
        return;
      }
      if (legacy) layer.querySelectorAll(".party-fan").forEach((el) => animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: delayMs, fill: "forwards" }));
      const rowWidth = row.getBoundingClientRect().width || box.width;
      animate(row, [{ translate: `${-rowWidth}px 0` }, { translate: `${box.width}px 0` }], { duration: 4600, delay: delayMs, easing: "linear", fill: "both" });
      return;
    }
    if (look.parade === "rise") {
      // 並びをまぜて、左右ばらばらに上がっていく。ジェット風船は速く、くねりながら。
      const fast = look.id === "baseball";
      items.forEach((el, index) => {
        const order = (index * 5) % items.length;
        const height = el.getBoundingClientRect().height || 120;
        const sway = (index % 2 ? 1 : -1) * (fast ? 18 : 40);
        el.style.left = `${box.width * ((index + 0.5) / items.length)}px`;
        animate(
          el,
          [
            { translate: "-50% 0", rotate: "0deg" },
            { translate: `calc(-50% + ${sway}px) ${-(box.height + height) * 0.5}px`, rotate: `${fast ? 12 : 5}deg`, offset: 0.5 },
            { translate: `-50% ${-(box.height + height * 1.6)}px`, rotate: `${fast ? -12 : -4}deg` },
          ],
          { duration: fast ? 1700 : 4200, delay: delayMs + order * (fast ? 110 : 260), easing: fast ? "cubic-bezier(.3,.6,.5,1)" : "ease-in", fill: "both" }
        );
      });
      return;
    }
    // leap: 魚が1匹ずつ、弧を描いて跳ぶ。
    const base = box.height * 0.84;
    const reach = box.width * 0.34;
    const peak = box.height * 0.5;
    const starts = [0.04, 0.3, 0.56, 0.16, 0.42, 0.62];
    items.forEach((el, index) => {
      const x0 = box.width * starts[index % starts.length];
      const wait = delayMs + index * 420;
      el.style.left = `${x0}px`;
      el.style.top = `${base}px`;
      const frames = Array.from({ length: 9 }, (_, step) => {
        const t = step / 8;
        return { translate: `${reach * t}px ${-4 * peak * t * (1 - t)}px`, rotate: `${(t - 0.5) * 70}deg`, offset: t };
      });
      animate(el, frames, { duration: 1300, delay: wait, easing: "linear", fill: "both" });
      [0, 1300].forEach((at, end) =>
        later(wait + at, () => {
          if (!host.isConnected) return;
          const now = host.getBoundingClientRect();
          fx?.engine?.burst?.({
            x: now.left + x0 + reach * end,
            y: now.top + base,
            count: 12,
            speed: [220, 460],
            angle: -Math.PI / 2,
            spread: Math.PI * 0.8,
            shapes: ["drop", "drop", "bubble"],
            colors: ["#4DC4FF", "#D8F3FF", "#FFFFFF"],
            size: [10, 18],
            life: [0.5, 0.8],
            gravity: 900,
            drag: 1.4,
          });
        })
      );
    });
  }

  /** ラッコが真ん中へ出て、2倍になる（押すと 出てくる の元の見せ場）。動物は消す。 */
  function otterTakesCenter(box) {
    const figure = host.querySelector(".pop-figure");
    if (figure) animate(figure, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
    const from = pointIn(otter);
    animate(
      otter,
      [
        { translate: "0 0", scale: "1" },
        { translate: `${box.width / 2 - from.x}px ${-box.height * 0.05}px`, scale: "2" },
      ],
      { duration: 700, easing: "cubic-bezier(.34,1.36,.64,1)", fill: "forwards" }
    );
    stamp(tHtml("party.bigParty"), { x: box.width / 2, y: box.height * 0.3, big: true, color: "#D65DB1", holdMs: 0 });
    return null;
  }

  /**
   * 遊びの大事なもの（型の avoid）にかぶらない、いちばん広い横の帯（面の中の px）。上の帯
   * （遊びの名前・おわる）の下から数える。avoid の無い型は null（決まった位置に置く）。
   */
  function freeBand(box) {
    if (!look.avoid) return null;
    const blocks = [...host.querySelectorAll(look.avoid)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => [r.top - box.top, r.bottom - box.top])
      .sort((a, b) => a[0] - b[0]);
    let best = null;
    let cursor = TOP_BAR_PX;
    for (const [top, bottom] of [...blocks, [box.height, box.height]]) {
      if (top - cursor > (best ? best.bottom - best.top : 0)) best = { top: cursor, bottom: top };
      cursor = Math.max(cursor, bottom);
    }
    return best;
  }

  /** 最後の札（課題で半分より少ないときは、どの遊びでも「おおさわぎ！」）。 */
  function stampKey() {
    const earned = kind !== "timing" || (endlessRun ? successes >= 5 : successes * 2 >= plannedTotal);
    return earned ? look.stamp : "party.bigParty";
  }

  /**
   * 札だけの見せ場。札の少し下から、その遊びの粒がはじける。はじめの遊びは、遊びの言葉や
   * やったことにかぶらない帯の真ん中へ（freeBand）。課題は遊び終えたあとなので、上の方へ。
   */
  function stampShow(box, color = "#D65DB1") {
    const band = freeBand(box);
    const y = band ? (band.top + band.bottom) / 2 : box.height * 0.3;
    stamp(tHtml(stampKey()), { x: box.width / 2, y, big: true, color, holdMs: 0 });
    return { x: box.left + box.width / 2, y: box.top + Math.min(box.height * 0.85, y + box.height * 0.12) };
  }

  /**
   * くす玉が下りてきて、割れる。中から紙吹雪・紙テープと「おめでとう！」の幕。割ったふうせんと
   * 言葉にかぶらないよう、あいた帯に収まる大きさで置く（玉と幕で、玉の約1.6倍の高さ）。
   */
  function kusudama(box) {
    const ball = doc.createElement("span");
    ball.className = "party-kusudama";
    const band = freeBand(box);
    ball.innerHTML = `<span class="kusu-cord"></span><span class="kusu-banner">${tHtml(look.stamp)}</span><span class="kusu-half is-left">${kusudamaHalfSvg()}</span><span class="kusu-half is-right">${kusudamaHalfSvg()}</span>`;
    callouts.append(ball);
    if (band) {
      // ひも（玉の 0.26）・玉の上半分（幕は玉の 0.46 から下がる）・幕の高さが、帯に収まる大きさ。
      const banner = ball.querySelector(".kusu-banner").offsetHeight || 60;
      const height = band.bottom - band.top - 16;
      const size = Math.min(250, Math.max(64, (height - banner) / 0.72));
      ball.style.width = `${size}px`;
      ball.style.top = `${band.top + 8 + size * 0.26 + Math.max(0, (height - banner - size * 0.72) / 2)}px`;
    }
    animate(ball, [{ translate: "-50% -160%" }, { translate: "-50% 0" }], { duration: 560, easing: "cubic-bezier(.34,1.36,.64,1)", fill: "both" });
    later(900, () => {
      const open = { duration: 460, easing: "cubic-bezier(.34,1.5,.64,1)", fill: "forwards" };
      animate(ball.querySelector(".is-left"), [{ rotate: "0deg" }, { rotate: "64deg" }], open);
      animate(ball.querySelector(".is-right"), [{ rotate: "0deg" }, { rotate: "-64deg" }], open);
      animate(ball.querySelector(".kusu-banner"), [{ scale: "1 0" }, { scale: "1 1" }], { duration: 420, delay: 80, easing: "ease-out", fill: "both" });
      const r = ball.getBoundingClientRect();
      fx?.partyFinale?.({ theme: look.id, point: { x: r.left + r.width / 2, y: r.top + r.height * 0.5 } });
    });
    return null;
  }

  /**
   * できた絵に額縁がはまり、金の札と「完成！」の札が付く（ぬりえ）。額縁は絵の札（カード）の白い
   * ふちの上に重ねる（絵はふちから離して描いてあるので隠れない。外へ広げると、すぐ下の遊びの言葉
   * 「できあがり！」にかかった）。
   */
  function frame(box) {
    const hero = look.hero ? host.querySelector(look.hero) : null;
    const target = hero?.getBoundingClientRect();
    if (!target?.width) return stampShow(box);
    const pad = Math.round(Math.min(Math.max(Math.min(target.width, target.height) * 0.05, 8), 18));
    const el = doc.createElement("span");
    el.className = "party-frame";
    el.style.setProperty("--frame", `${pad}px`);
    el.style.left = `${target.left - box.left}px`;
    el.style.top = `${target.top - box.top}px`;
    el.style.width = `${target.width}px`;
    el.style.height = `${target.height}px`;
    el.innerHTML = `<span class="party-frame-rosette">${rosetteSvg()}</span>`;
    callouts.append(el);
    animate(el, [{ opacity: 0, scale: "1.18" }, { opacity: 1, scale: "1" }], { duration: 420, easing: "cubic-bezier(.34,1.36,.64,1)", fill: "both" });
    fx?.motion?.popIn(el.querySelector(".party-frame-rosette"), { delayMs: 420, from: 0.2 });
    // 名札は額縁の上の辺に（下には遊びの言葉「できあがり！」がある）。
    later(260, () =>
      stamp(tHtml(look.stamp), {
        x: target.left - box.left + target.width / 2,
        y: Math.max(TOP_BAR_PX * 0.6, target.top - box.top),
        color: "#D98700",
        holdMs: 0,
        tilt: false,
        className: "is-plaque",
      })
    );
    return { x: target.left + target.width / 2, y: target.top + target.height / 2 };
  }

  /** 応援団（観客）が波のように跳ねる。札は「ナイス バッティング！」。 */
  function cheer(box) {
    showFans(4);
    const fans = [...layer.querySelectorAll(".party-fan")];
    [0, 1, 2, 3].forEach((round) =>
      fans.forEach((el, index) => fx?.motion?.hop(el, { delayMs: 300 + round * 720 + index * 90, height: 30 }))
    );
    return stampShow(box, "#005AFF");
  }

  /** 見せ場（型の show → 粒をはじかせる場所。null なら見せ場が自分ではじかせる）。 */
  const SHOWS = { otter: otterTakesCenter, kusudama, frame, cheer, stamp: stampShow };

  /**
   * ラッコも一緒に喜ぶ。押すと 出てくる 以外は角のまま（遊びの主役にかぶせない。真ん中へ
   * 出るのは見せ場 otter だけ）。三三七拍子の遊びでは、手拍子の音を重ねない。
   */
  function otterCheers() {
    otter.classList.add("is-cheering");
    moves.armsUp(1400);
    later(900, () => {
      moves.clap(4);
      if (look.id !== "baseball") playClaps(audio, 4);
    });
    later(2400, () => {
      moves.hop(60, { spin: true });
      moves.clap(3);
    });
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
      fx?.partyCheer?.(jar, { theme: look.id });
      voiceFeedback(t(text.voice));
    });
  }

  return {
    /** 遊びの側は、結果が確定したあとに主役と出来事だけを渡す。 */
    react({ index = pressed, source = null, name = null, success = true, total = 5, endless = false } = {}) {
      const pressIndex = index;
      const figure = source;
      pressed = pressIndex + 1;
      const previous = stars;
      if (success) successes += 1;
      plannedTotal = total;
      endlessRun = endless;
      const collected = kind === "timing" ? timingStars(successes, total, endless) : { stars: starsAfter(pressIndex), jars: pressIndex >= 4 ? 1 : 0 };
      stars = collected.stars;
      fullJars = collected.jars;
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
        if (stars < previous) jarItems.innerHTML = "";
        fillJar(stars < previous ? 0 : previous, stars, source, true);
        if ((previous < 7 && stars >= 7) || (previous < 15 && stars === 15)) {
          const c = pointIn(jar);
          const tag = stamp(tHtml(stars === 15 ? "party.full" : "party.half"), {x:c.x,y:c.top - 8,holdMs:0,color:"#D65DB1"});
          tag.classList.add("is-short");
          tag.getAnimations().forEach(animation => animation.cancel());
          later(200, () => tag.remove());
          // 合図が音の課題では鳴らさない（高い音の合図と取り違えうる。atmosphere.js）。
          if (profile.milestoneSound) audio?.playChime?.(1318.51, { durationS: 0.08, level: 0.2 });
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
      fx?.partyPress?.(figure, { k: pressIndex, theme: look.id });
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

    /**
     * 最後（はじめの遊びの5回目・課題の終わり）。びんに入り終わってから、遊びごとの見せ場へ
     * （型の show）。主役（塗った絵・止めたリール・判定の線）は、子どもの作ったもの・課題の絵
     * なので消さない。押すと 出てくる だけは元の作りで、動物を消してラッコが真ん中へ出る。
     */
    finale() {
      if (finishing) return;
      finishing = true;
      if (!profile.reward) return;
      // その日のびんの数と服を、ここで保存する（けっかの声と絵がそれを使う）。
      outcome = claim ? claim(fullJars) : null;
      // 狭い課題画面では、試行後に舞台を開いてから祝う。
      layer.classList.add("is-finale");
      jar.dataset.stars = String(stars);
      if (kind === "timing") jarItems.innerHTML = jarItemsHtml(stars, look.id);
      later(FINALE_AFTER_MS, () => {
        clearStamps();
        const box = host.getBoundingClientRect();
        otterCheers();
        const point = (SHOWS[look.show] ?? stampShow)(box);
        playFanfare(audio, PARTY_FINAL_KEY_SHIFT);
        FINALE_SOUNDS[look.id]?.(audio, later);
        fx?.motion?.shake(host, { px: 5, ms: 260 });
        // くす玉は割れたときに自分ではじかせる（point が null）。
        if (look.show !== "kusudama") fx?.partyFinale?.({ theme: look.id, point });
        parade(500);
        // びんのふたが飛んで、中身があふれる。
        later(700, () => {
          const lid = jar.querySelector(".jar-lid");
          if (stars === PARTY_JAR_CAPACITY) {
            animate(lid, [{ translate: "0 0", rotate: "0deg" }, { translate: "40px -120px", rotate: "40deg", opacity: 0 }], { duration: 700, easing: "ease-out", fill: "forwards" });
            fx?.partyOverflow?.(jar, { theme: look.id });
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
        theme: look.id,
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

/** けっかの大きなびん（その遊びのもので いっぱい）。 */
export function fullJarHtml(count = PARTY_JAR_CAPACITY, theme = "pop") {
  return `<span class="party-result-jar">${jarSvg()}<span class="party-jar-items">${jarItemsHtml(count, theme)}</span></span>`;
}

/**
 * けっか（results.js の party-result）を見せる。びんの星・動物・きょうのびん・ラッコ・ごほうび・花火の順。
 * @returns {number} 見せ終わるまで（ms）。この間は枠を動かさない（gameHost）。
 */
export function revealPartyResult(container, { fx, audio, isCurrent = null }) {
  if (fx?.policy?.().motion === false) return 0;
  const root = container?.querySelector?.(".party-result");
  if (!root) return 0;
  const profile = atmosphereFor(root.dataset.level);
  const win = root.ownerDocument.defaultView;
  const otter = root.querySelector(".party-result-otter");
  const reward = root.querySelector(".party-result-reward");
  const jarStars = [...root.querySelectorAll(".party-result-jar .party-item")];
  // 添える版の作品と評価は通常の revealResult が担当し、二重に動かさない。
  const items = root.classList.contains("is-added") ? [] : [...root.querySelectorAll(".hk-result-item")];
  const today = [...root.querySelectorAll(".party-today .party-mini-jar")];
  const moves = otterMotion(otter);
  // ごほうびの無い段（にぎやか）は、その回のびんとラッコが出てくるだけ。
  if (!profile.reward) {
    fx?.motion?.slamIn(root.querySelector(".party-result-jar"), { delayMs: 60 });
    jarStars.forEach((star, index) => fx?.motion?.popIn(star, { delayMs: 160 + index * 35 }));
    fx?.motion?.popIn(otter, { delayMs: 500 });
    presentation.later(650, () => {
      if (root.isConnected) moves.clap(2);
    }, win);
    return profile.resultRevealMs;
  }
  fx?.motion?.slamIn(root.querySelector(".party-result-jar"), { delayMs: 60 });
  jarStars.forEach((star, index) => {
    fx?.motion?.popIn(star, { delayMs: 260 + index * 55 });
    playStarLand(audio, index, (260 + index * 55) / 1000);
  });
  items.forEach((item, index) => fx?.motion?.popIn(item, { delayMs: 1100 + index * 110 }));
  today.forEach((jar, index) => fx?.motion?.popIn(jar, { delayMs: 1300 + index * 90 }));
  fx?.motion?.slamIn(otter, { delayMs: 1500 });
  presentation.later(1800, () => {
    if (!root.isConnected) return;
    playBell(audio);
    moves.hop(40, { spin: true });
    moves.clap(3);
  }, win);
  fx?.motion?.slamIn(reward, { delayMs: 2000 });
  presentation.later(2200, () => {
    if (!root.isConnected || !otter) return;
    fx?.partyReward?.(otter, { theme: root.dataset.theme });
  }, win);
  presentation.later(2300, () => { if (root.isConnected) fx?.engine?.fireworks?.({ colors: PARTY_COLORS, bursts: 2 }); }, win);
  // けっかの描き直しでも曲を止める。次の遊びへ移ったあとは、その曲を止めない。
  presentation.later(3200, () => {
    if (isCurrent ? isCurrent() : root.isConnected) audio?.music?.stop(RESULT_MUSIC_FADE_S);
  }, win);
  return profile.resultRevealMs;
}
