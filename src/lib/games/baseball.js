// =====================================================================
// games/baseball.js — 「ボールを 打つ」（野球盤のような、押すだけの遊び）
//
// ボールが投げられて、手前のバットへ転がってくる。押すとバットを振る。
// ボールが出ているあいだに振れば、いつでも必ず当たる（失敗が無い）。
// タイミングが合うほど遠くへ飛ぶ:
//   ぴったり（前後 0.12 秒）   … ホームラン（スタンドへ。はなびと歓声）
//   すこし ずれる（0.3 秒まで）… ヒット（外野へ）
//   大きく ずれる            … ころころ（「あたった！」。これも当たり）
// 振らずに見送ったボールは数えず、もう一度投げる（へこませない）。5回打てば終わり。
//
// 打ち合わせで「誰でも野球盤……クリックだけでバットを振ってボールが飛んでいく。
// これをアプリの中に入れておいてもいい」と例に出た（docs/design-renewal-2026-09-25.md
// §1.9）。はじめの遊び（どこで押してもよい）と、リールのようなタイミングの遊びの
// あいだの一段として、ホームの④に置く。展示会で大勢に試してもらう遊びにもなる。
//
// 測定の課題ではない（taskType なし）。記録は押した回数（logEvent の switch）だけ。
// 判定の時刻は、シェルが入力の入口で取った performance.now()（handleInput の t）。
// 描画のフレームには頼らない。
// =====================================================================

import { BALL_FIELD_ART } from "../art/hakkiriArt.js";
import { BEGINNER_TARGET_PRESSES, celebrate, playPrefsFor } from "./beginnerKit.js";
import { PARTY_FINISH_DELAY_MS, atmosphereFor } from "../atmosphere.js";

const GAME_ID = "baseball";

/** 投げてからバットに届くまでの時間（ミリ秒）。この遊びの設定で選ぶ。 */
export const PITCH_MS = { slow: 2300, normal: 1750, fast: 1300 };
/** 構えてから投げるまで。 */
export const WINDUP_MS = 900;
/** ぴったり（ホームラン）の幅と、ヒットの幅（到着時刻から前後）。 */
export const HOMERUN_WINDOW_MS = 120;
export const HIT_WINDOW_MS = 300;
/** バットを通り過ぎてから、見送りにするまで。 */
export const PASS_GRACE_MS = 320;
/** 打った球が飛んでいる時間。 */
export const FLIGHT_MS = 1300;
/** 見送ったあと、次を投げるまで。 */
export const RETRY_PAUSE_MS = 900;
/** 5本目のあと、けっかへ移るまで。 */
export const FINISH_DELAY_MS = 900;

/**
 * 打った時刻から、当たり方を決める（描画にも時刻にも依存しない純粋関数）。
 * @param {number} deltaMs 押した時刻 − ボールがバットに届く時刻（早いと負）
 * @returns {"homerun"|"hit"|"bunt"}
 */
export function judgeSwing(deltaMs) {
  const miss = Math.abs(deltaMs);
  if (miss <= HOMERUN_WINDOW_MS) return "homerun";
  if (miss <= HIT_WINDOW_MS) return "hit";
  return "bunt";
}

// 盤の上の位置（BALL_FIELD_ART の viewBox 0 0 600 600）。
const MOUND = { x: 300, y: 405 };
const PLATE = { x: 300, y: 548 };
const PAST = { x: 300, y: 640 };

const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) * (1 - k);

export function createBaseballGame(ctx) {
  const { settings, audio, voiceFeedback, logEvent, finish, t, tHtml, fx } = ctx;

  let stageEl = null;
  let boardEl = null;
  let trailFrame = 0;
  let ballEl = null;
  let batEl = null;
  let wordEl = null;
  let slotsEl = null;
  let phase = "idle"; // windup | pitching | flying | missed | done
  let releaseAt = 0;
  let arrivalAt = 0;
  let pitchMs = PITCH_MS.normal;
  let flight = null;
  let rafId = null;
  let timer = null;
  let batTimer = null;
  let finishDelivered = false;
  const results = [];

  const prefs = () => playPrefsFor(settings, GAME_ID);

  function setWord(key) {
    if (wordEl) wordEl.innerHTML = key ? tHtml(key) : "";
    if (wordEl) wordEl.dataset.word = key || "";
  }

  function placeBall(x, y, scale = 1, opacity = 1) {
    if (!ballEl) return;
    ballEl.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`);
    ballEl.style.opacity = String(opacity);
  }

  function renderSlots() {
    if (!slotsEl) return;
    slotsEl.innerHTML = Array.from({ length: BEGINNER_TARGET_PRESSES }, (_, index) => {
      const result = results[index];
      return `<span class="bb-slot${result ? ` is-${result}` : ""}"></span>`;
    }).join("");
  }

  function schedule(fn, ms) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  }

  /** 次の1球。構えて、少し待ってから投げる。 */
  function windup() {
    if (!stageEl) return;
    phase = "windup";
    pitchMs = PITCH_MS[prefs().speed] || PITCH_MS.normal;
    stageEl.classList.remove("is-homerun");
    placeBall(MOUND.x, MOUND.y, 0.9, 1);
    setWord("baseball.word.ready");
    schedule(release, WINDUP_MS);
  }

  function release() {
    if (!stageEl) return;
    phase = "pitching";
    releaseAt = performance.now();
    arrivalAt = releaseAt + pitchMs;
    audio.playThrow?.();
    // 投げる音が到着の手がかりなので、その1球のあいだは音楽を下げる。
    if (ctx.party?.isBig()) audio.music?.duck?.(pitchMs / 1000 + 0.25);
    setWord(null);
    startLoop();
  }

  function startLoop() {
    if (rafId !== null) return;
    const tick = () => {
      rafId = null;
      if (!stageEl) return;
      const now = performance.now();
      if (phase === "pitching") {
        const k = (now - releaseAt) / pitchMs;
        if (k <= 1) {
          placeBall(lerp(MOUND.x, PLATE.x, k), lerp(MOUND.y, PLATE.y, k), 0.9 + 0.2 * k);
        } else {
          const past = Math.min(1, (k - 1) * 3);
          placeBall(lerp(PLATE.x, PAST.x, past), lerp(PLATE.y, PAST.y, past), 1.1);
        }
        if (now > arrivalAt + PASS_GRACE_MS) {
          letItGo();
          return;
        }
      } else if (phase === "flying" && flight) {
        // ヒットストップ（当たった瞬間に少し止める）のあいだは、k が 0 のまま。
        const k = Math.max(0, Math.min(1, (now - flight.start) / flight.duration));
        const e = easeOut(k);
        const x = lerp(flight.from.x, flight.to.x, e);
        // 放物線（高く上がって落ちる）を、上から見た盤では大きさで見せる。
        const lift = Math.sin(Math.PI * Math.min(1, k * flight.arc)) * flight.height;
        const scale = flight.scale0 + lift - (flight.shrink * e);
        placeBall(x, lerp(flight.from.y, flight.to.y, e), Math.max(0.2, scale), k > 0.85 ? (1 - k) / 0.15 : 1);
        // 光の尾（ホームランは金色）。1コマおきに少しだけ出す。
        trailFrame += 1;
        if (k > 0 && k < 0.9 && trailFrame % 2 === 0 && flight.quality !== "bunt") {
          fx?.trail(fx.engine.pointOf(ballEl), { gold: flight.quality === "homerun" });
        }
        if (k >= 1) {
          const landed = flight;
          flight = null;
          // ホームランは、球が消えた空で星と花火。
          if (landed.quality === "homerun") fx?.homerunSky({ point: fx.engine.pointOf(ballEl), stageEl: boardEl });
          afterFlight();
          return;
        }
      } else {
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
  }

  /** 振らずに通り過ぎた。数えずに、もう一度。 */
  function letItGo() {
    phase = "missed";
    placeBall(PAST.x, PAST.y, 1, 0);
    setWord("baseball.word.again");
    schedule(windup, RETRY_PAUSE_MS);
  }

  function swingBat() {
    if (!batEl) return;
    window.clearTimeout(batTimer);
    batEl.classList.remove("is-swinging");
    // 同じ振りを続けて出すため、いったん外してから付け直す。
    void batEl.getBoundingClientRect();
    batEl.classList.add("is-swinging");
    batTimer = window.setTimeout(() => batEl?.classList.remove("is-swinging"), 360);
  }

  const FLIGHTS = {
    homerun: { to: { x: 250, y: -40 }, height: 0.9, shrink: 0.9, arc: 1, duration: FLIGHT_MS },
    hit: { to: { x: 420, y: 170 }, height: 0.6, shrink: 0.2, arc: 1, duration: FLIGHT_MS * 0.85 },
    bunt: { to: { x: 245, y: 470 }, height: 0.05, shrink: 0, arc: 1, duration: FLIGHT_MS * 0.7 },
  };

  function hit(inputMs) {
    const now = performance.now();
    const k = Math.max(0, Math.min(1.15, (inputMs - releaseAt) / pitchMs));
    const from = k <= 1
      ? { x: lerp(MOUND.x, PLATE.x, k), y: lerp(MOUND.y, PLATE.y, k) }
      : { x: PLATE.x, y: PLATE.y + 20 };
    const result = judgeSwing(inputMs - arrivalAt);
    results.push(result);
    renderSlots();
    // ③ 進みぐあい: 埋まった枠が弾む。
    fx?.motion.bump(slotsEl?.children[results.length - 1], { amount: 0.5 });
    phase = "flying";
    const shape = FLIGHTS[result];
    // ヒットストップ（docs/overall-design-2026-09-28.md §3.2）: ホームランは当たった
    // 瞬間に少しだけ止めてから飛ばす。判定は押した時刻で済んでいる（見た目だけ）。
    const stop = result === "homerun" ? fx?.hitStopMs() || 0 : 0;
    flight = { ...shape, from, start: now + stop, scale0: 1, quality: result };
    trailFrame = 0;
    audio.playBatHit?.(result, prefs().sound);
    setWord(`baseball.word.${result}`);
    // ② 起きたこと: 当たった場所の火花。ホームランは揺れて、寄る。
    fx?.batHit(fx.engine.pointOf(ballEl), { quality: result, stageEl: boardEl });
    ctx.party?.react({ index: results.length - 1, source: ballEl });
    fx?.motion.stamp(wordEl, { delayMs: stop });
    if (result === "homerun") {
      stageEl.classList.add("is-homerun");
      audio.playApplause?.({ durationS: 1.4, sample: "homerun-cheer" });
    }
    voiceFeedback(t(`baseball.word.${result}`));
    startLoop();
  }

  function afterFlight() {
    if (!stageEl) return;
    if (results.length >= BEGINNER_TARGET_PRESSES) {
      phase = "done";
      setWord("baseball.word.done");
      // ⑤ フィナーレ（5本打てた）。
      if (ctx.party?.isBig()) ctx.party.finale();
      else fx?.finale(boardEl, {});
      if (atmosphereFor(fx?.level?.()).quietFinish) audio.playChime(784, { durationS: 0.24 });
      fx?.motion.stamp(wordEl, {});
      schedule(() => {
        finishDelivered = true;
        const homeruns = results.filter((result) => result === "homerun").length;
        const hits = results.filter((result) => result === "hit").length;
        celebrate(
          ctx,
          prefs(),
          // ホームランが0回のときに「ホームランは 0かい」と言わない。
          ctx.party?.isBig() ? ctx.party.rewardSpeech() : t(homeruns > 0 ? "baseball.voice.finish" : "baseball.voice.finishNoHomerun", { h: homeruns, k: hits })
        );
        finish({ presses: results.length, baseball: { results: [...results], homeruns, hits } });
      }, ctx.party?.isBig() ? PARTY_FINISH_DELAY_MS : FINISH_DELAY_MS);
      return;
    }
    schedule(windup, 500);
  }

  /** スイッチ入力1回ぶん。t はシェルが入口で取った時刻。 */
  function handleInput(inputMs) {
    if (!stageEl || phase === "done") return;
    const at = Number.isFinite(inputMs) ? inputMs : performance.now();
    swingBat();
    logEvent({ type: "switch", label: "ボールを 打つ" });
    if (phase === "pitching" && at >= releaseAt && at <= arrivalAt + PASS_GRACE_MS) {
      hit(at);
      return;
    }
    // 構えているあいだ・飛んでいるあいだの振りは、素振り（数えない）。押せば
    // バットは必ず動くので、「押したのに何も起きない」にはならない。
    audio.playSwing?.();
    // ① 手応え: バットのところに小さな輪。
    if (batEl && fx) {
      const at = fx.engine.pointOf(batEl);
      fx.engine.ring({ x: at.x, y: at.y, color: "#FFFFFF", r0: 8, r1: 46, width: 4, life: 0.32 });
    }
  }

  return {
    mount(el) {
      stageEl = el;
      results.length = 0;
      finishDelivered = false;
      stageEl.classList.add("module-baseball");
      stageEl.innerHTML = `
        <span class="bb-stage" aria-hidden="true">
          <span class="bb-word"></span>
          <svg class="bb-field" viewBox="${BALL_FIELD_ART.viewBox}" preserveAspectRatio="xMidYMid meet" focusable="false">
            ${BALL_FIELD_ART.body}
            <g class="bb-bat"><rect x="256" y="553" width="96" height="14" rx="7" fill="#A0622D" stroke="#1A1A1A" stroke-width="3"></rect><rect x="256" y="553" width="26" height="14" rx="6" fill="#1A1A1A"></rect></g>
            <g class="bb-ball"><circle r="13" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="3"></circle><path d="M-6 -9 Q 1 0 -6 9 M6 -9 Q -1 0 6 9" fill="none" stroke="#E0302D" stroke-width="2.4"></path></g>
          </svg>
          <span class="bb-slots"></span>
        </span>
      `;
      boardEl = stageEl.querySelector(".bb-stage");
      ballEl = stageEl.querySelector(".bb-ball");
      batEl = stageEl.querySelector(".bb-bat");
      wordEl = stageEl.querySelector(".bb-word");
      slotsEl = stageEl.querySelector(".bb-slots");
      renderSlots();
      windup();
    },
    handleInput,
    /** この遊びの設定を変えたあと。速さは次の1球から効く。 */
    applySettings() {},
    destroy() {
      window.clearTimeout(timer);
      window.clearTimeout(batTimer);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = null;
      timer = null;
      if (!finishDelivered) audio.stopSpeech();
      if (stageEl) {
        stageEl.classList.remove("module-baseball", "is-homerun");
        stageEl.innerHTML = "";
      }
      stageEl = null;
      boardEl = null;
      ballEl = null;
      batEl = null;
      wordEl = null;
      slotsEl = null;
    },
  };
}
