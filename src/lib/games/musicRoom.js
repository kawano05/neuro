// =====================================================================
// games/musicRoom.js — 音あそび「音楽室」（2026-11-25）
//
// 11/25 の打ち合わせで、音あそび（高い音のときだけ押す遊び）は「黒い背景に星が落ちてくる形は、
// 子どもには何をするのか伝わりにくい」「楽器の絵を出して、押すと楽器の音が鳴る形に」「押したら
// 派手に」と言われた。ユーザーが、音楽室に楽器が並ぶ遊びにすると決めた。遊び方は2つ:
//
//   すきな がっき（music-free）… 黄色い枠が楽器を順に回る。押すと、枠のある楽器が鳴る。
//                                 失敗は無い。10回でおしまい。
//   せんせいと（music-teacher）… 先生が「ピアノを ならしてね」と言う。枠がピアノに来たときに
//                                 押すと鳴って「せいかい」。ほかの楽器で押しても、その楽器が
//                                 鳴るだけ（へこませない）。5問でおしまい。
//
// 枠は遊びの中で回す（アームと同じく、押す時刻で選ぶ。scan.js の走査は遊んでいる最中は止まる）。
// 枠の速さは支援者の設定「枠が動く速さ」（settings.scanInterval）。枠が動いたときに名前を読むか・
// 音を鳴らすかも、設定「枠が動いたときの音」（settings.scanFeedback）に従う。
//
// 測定の課題ではない（taskType なし）。そくていの回のホームでは、音あそびの札は前の
// 「高い音だけ」（gonogo）を開く（views/home.js）。
// =====================================================================

import { MUSIC_INSTRUMENTS, musicInstrumentSvg, musicRoomBackdropSvg, musicTeacherSvg } from "../art/musicRoomArt.js";
import { atmosphereFor } from "../atmosphere.js";
import { celebrate, createBeginnerFlow, playFinishSound, playPrefsFor, progressDotsHtml } from "./beginnerKit.js";

export const MUSIC_FREE_ID = "music-free";
export const MUSIC_TEACHER_ID = "music-teacher";

/** すきな がっき は何回でおしまいか。 */
export const MUSIC_FREE_PRESSES = 10;
/** せんせいと は何問でおしまいか。 */
export const MUSIC_TEACHER_ROUNDS = 5;
/** 枠の速さの範囲（state.js の scanInterval の sanitize と同じ）。 */
const CURSOR_MIN_MS = 800;
const CURSOR_MAX_MS = 3200;
const CURSOR_DEFAULT_MS = 1600;
/** 楽器が鳴ってはずむ動き（CSS の music-instrument-play）。 */
export const MUSIC_PLAY_MS = 600;
/** 先生が言ってから枠が動きだすまで（言っているあいだは枠を止めて、名前の読み上げと重ねない）。 */
export const MUSIC_PROMPT_HOLD_MS = 1800;
/** せいかいのあと、次の問いまで。 */
export const MUSIC_NEXT_ROUND_MS = 1800;
/** 最後の問いのあと、けっかへ。 */
export const MUSIC_FINISH_DELAY_MS = 1600;
/** 「パーン」を鳴らす雰囲気（ひかえめ・なし では鳴らさない。強い音を選べるように、の約束）。 */
const FANFARE_LEVELS = new Set(["normal", "big"]);
/** 録音が読めないときの代わりの音（Hz。楽器ごとに高さを変える）。 */
const FALLBACK_HZ = { piano: 523.25, taiko: 196, bell: 1046.5, xylophone: 784, castanets: 880, trumpet: 659.25 };

/** 枠が1つ進むまでの時間（ms）。設定が壊れていたら既定。 */
export function musicCursorIntervalMs(settings) {
  const value = Number(settings?.scanInterval);
  if (!Number.isFinite(value)) return CURSOR_DEFAULT_MS;
  return Math.min(CURSOR_MAX_MS, Math.max(CURSOR_MIN_MS, value));
}

/**
 * 次に先生が言う楽器。前と同じ楽器は続けない。random は 0 以上 1 未満を返す関数（検査で固定する）。
 * @param {string|null} previous
 * @param {() => number} [random]
 */
export function pickMusicTarget(previous, random = Math.random) {
  const choices = MUSIC_INSTRUMENTS.filter((id) => id !== previous);
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length));
  return choices[Math.max(0, index)];
}

/**
 * 問いのはじめに枠を置く場所。ねらいの楽器の向かい側（半周先）から始める——すぐ押せば
 * 当たってしまう場所から始めると、「枠が来るまで待つ」を練習できない。
 */
export function musicCursorStart(target) {
  const index = MUSIC_INSTRUMENTS.indexOf(target);
  if (index < 0) return 0;
  return (index + Math.floor(MUSIC_INSTRUMENTS.length / 2)) % MUSIC_INSTRUMENTS.length;
}

/** 楽器を鳴らす。録音が鳴らせなければ代わりの音。 */
function playInstrumentSound(audio, id) {
  if (audio.playInstrument?.(id)) return;
  audio.playChime?.(FALLBACK_HZ[id] ?? 523.25, { durationS: 0.6 });
}

/**
 * @param {"free"|"teacher"} mode
 */
export function createMusicRoomGame(mode) {
  const gameId = mode === "teacher" ? MUSIC_TEACHER_ID : MUSIC_FREE_ID;
  const teacherMode = mode === "teacher";

  return function create(ctx) {
    const { settings, audio, t, tHtml, fx, voiceFeedback, logEvent, finish } = ctx;
    let stageEl = null;
    let cursor = 0;
    let cursorTimer = null;
    let holdTimer = null;
    let playTimers = new Set();
    // せんせいと: いまの問い・何問できたか・押した数・ちがう楽器で押した数・次の問いを待っているか。
    let target = null;
    let solved = 0;
    let presses = 0;
    let wrong = 0;
    let waiting = false;
    let finishTimer = null;
    let finished = false;
    // 鳴らした楽器（けっかに並べる）。すきな 楽器 は押した順、せんせいと は せいかいの順。
    let played = [];

    const instrumentName = (id) => t(`music.instrument.${id}`);

    // すきな がっき は、はじめの遊びと同じ流れ（押す → 音 → 進み → 10回目 → フィナーレ → けっか）。
    const flow = teacherMode
      ? null
      : createBeginnerFlow(ctx, {
          gameId,
          target: MUSIC_FREE_PRESSES,
          ttsDelayMs: 0,
          finishDelayMs: MUSIC_FINISH_DELAY_MS,
          logLabel: "音あそび（すきな がっき）",
          onPress() {
            const id = MUSIC_INSTRUMENTS[cursor];
            played.push(id);
            const card = playCard(id);
            update();
            return { source: card };
          },
          // 押したときの音は、枠のある楽器（はじめの遊びの「押したときの音」の設定は使わない）。
          pressSound: (soundAudio) => playInstrumentSound(soundAudio, MUSIC_INSTRUMENTS[cursor]),
          // 押すたびの「あと○かい」は読まない（楽器の音を聞かせる遊び）。
          progressSpeech: () => "",
          finishSpeech: () => t("music.free.finish"),
          // けっか（games/results.js）には、鳴らした楽器を1つずつ並べる（同じ楽器は1回）。
          finishSummary: () => ({ presses: MUSIC_FREE_PRESSES, music: { mode: "free", played: [...new Set(played)] } }),
          onFinale: () => fx?.finale?.(stageEl?.querySelector(".music-room") || stageEl, { theme: gameId }),
        });

    function cardFor(id) {
      return stageEl?.querySelector(`.music-instrument[data-instrument="${id}"]`) || null;
    }

    /** 押した楽器を、はずませる。 */
    function playCard(id) {
      const card = cardFor(id);
      if (!card) return null;
      card.classList.remove("is-playing");
      // 続けて押したときも、はじめから はずませる。
      void card.offsetWidth;
      card.classList.add("is-playing");
      const timer = window.setTimeout(() => {
        playTimers.delete(timer);
        card.classList.remove("is-playing");
      }, MUSIC_PLAY_MS);
      playTimers.add(timer);
      fx?.noteHit?.(card);
      return card;
    }

    /** 枠が動いたことを伝える（設定「枠が動いたときの音」）。 */
    function sayCursor() {
      const feedback = settings.scanFeedback;
      if (feedback === "speak") {
        if (!audio.speak?.(instrumentName(MUSIC_INSTRUMENTS[cursor]))) audio.playScanTick?.();
      } else if (feedback === "tick") {
        audio.playScanTick?.();
      }
    }

    function stopCursor() {
      window.clearInterval(cursorTimer);
      cursorTimer = null;
    }

    function startCursor() {
      stopCursor();
      cursorTimer = window.setInterval(() => {
        cursor = (cursor + 1) % MUSIC_INSTRUMENTS.length;
        update();
        sayCursor();
      }, musicCursorIntervalMs(settings));
    }

    /** せんせいと: 次の問いを出す。 */
    function askNext() {
      target = pickMusicTarget(target);
      cursor = musicCursorStart(target);
      waiting = false;
      stopCursor();
      update();
      const bubble = stageEl?.querySelector(".music-bubble");
      bubble?.classList.remove("is-shaking");
      voiceFeedback(t("music.teacher.prompt", { name: instrumentName(target) }));
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        if (!finished) startCursor();
      }, MUSIC_PROMPT_HOLD_MS);
    }

    /** せんせいと: 押した1回ぶん。 */
    function pressTeacher() {
      if (finished || waiting) return false;
      presses += 1;
      const id = MUSIC_INSTRUMENTS[cursor];
      audio.stopSpeech?.();
      playInstrumentSound(audio, id);
      const card = playCard(id);
      logEvent({ type: "switch", label: "音あそび（せんせいと）" });
      if (id !== target) {
        // ちがう楽器: その楽器が鳴るだけ。先生の吹き出しを ゆらして、もう一度 言う。
        wrong += 1;
        const bubble = stageEl?.querySelector(".music-bubble");
        bubble?.classList.remove("is-shaking");
        void bubble?.offsetWidth;
        bubble?.classList.add("is-shaking");
        ctx.party?.react({ success: false, source: card });
        return true;
      }
      // せいかい: 枠を止めて「パーン」と ほめる。
      solved += 1;
      played.push(id);
      waiting = true;
      stopCursor();
      window.clearTimeout(holdTimer);
      holdTimer = null;
      if (settings.soundEnabled !== false && FANFARE_LEVELS.has(ctx.fx?.level?.())) {
        const timer = window.setTimeout(() => {
          playTimers.delete(timer);
          audio.playFanfare?.();
        }, 90);
        playTimers.add(timer);
      }
      ctx.party?.react({ success: true, source: card, index: solved - 1, total: MUSIC_TEACHER_ROUNDS });
      update();
      if (solved >= MUSIC_TEACHER_ROUNDS) {
        finished = true;
        const prefs = playPrefsFor(settings, gameId);
        if (atmosphereFor(ctx.fx?.level?.()).quietFinish) audio.playChime?.(784, { durationS: 0.24 });
        else playFinishSound(audio, "instrument");
        fx?.finale?.(stageEl?.querySelector(".music-room") || stageEl, { theme: gameId });
        finishTimer = window.setTimeout(() => {
          finishTimer = null;
          celebrate(ctx, prefs, t("music.teacher.finish"));
          finish({ presses, rounds: MUSIC_TEACHER_ROUNDS, wrong, music: { mode: "teacher", played: [...played] } });
        }, MUSIC_FINISH_DELAY_MS);
        return true;
      }
      voiceFeedback(t("learn.correct"));
      const timer = window.setTimeout(() => {
        playTimers.delete(timer);
        if (!finished) askNext();
      }, MUSIC_NEXT_ROUND_MS);
      playTimers.add(timer);
      return true;
    }

    function topHtml() {
      if (!teacherMode) {
        const done = flow?.count() ?? 0;
        const word = done >= MUSIC_FREE_PRESSES ? tHtml("music.free.done") : tHtml("music.free.word");
        return `
          <span class="music-word">${word}</span>
          ${progressDotsHtml(done, MUSIC_FREE_PRESSES)}
        `;
      }
      const text = target
        ? waiting
          ? tHtml("learn.correct")
          : tHtml("music.teacher.prompt", { name: instrumentName(target) })
        : "";
      return `
        <span class="music-teacher">${musicTeacherSvg()}</span>
        <span class="music-bubble${waiting ? " is-correct" : ""}">
          ${target ? `<span class="music-bubble-art">${musicInstrumentSvg(target)}</span>` : ""}
          <strong class="music-bubble-text">${text}</strong>
        </span>
        ${progressDotsHtml(solved, MUSIC_TEACHER_ROUNDS)}
      `;
    }

    function build() {
      if (!stageEl) return;
      const cards = MUSIC_INSTRUMENTS.map(
        (id) => `
          <span class="music-instrument" data-instrument="${id}">
            <span class="music-instrument-frame">${musicInstrumentSvg(id)}</span>
            <span class="music-instrument-name">${tHtml(`music.instrument.${id}`)}</span>
          </span>
        `
      ).join("");
      stageEl.innerHTML = `
        <span class="music-room ${teacherMode ? "is-teacher" : "is-free"}" aria-hidden="true">
          <span class="music-room-backdrop">${musicRoomBackdropSvg()}</span>
          <span class="music-top"></span>
          <span class="music-shelf">${cards}</span>
        </span>
      `;
      update();
    }

    /** 枠・上の段（ことば・先生）を、いまの状態に合わせる。楽器の並びは作り直さない（はずむ動きを切らない）。 */
    function update() {
      if (!stageEl) return;
      stageEl.querySelectorAll(".music-instrument").forEach((card) => {
        const id = card.dataset.instrument;
        card.classList.toggle("is-cursor", MUSIC_INSTRUMENTS[cursor] === id && !finished && !(teacherMode && waiting));
        card.classList.toggle("is-target", teacherMode && id === target);
      });
      const top = stageEl.querySelector(".music-top");
      if (top) top.innerHTML = topHtml();
    }

    function handleInput() {
      if (teacherMode) return pressTeacher();
      if (!flow || flow.finishing()) return false;
      const accepted = flow.handleInput();
      if (flow.finishing()) {
        stopCursor();
        update();
      }
      return accepted;
    }

    return {
      mount(el) {
        stageEl = el;
        stageEl.classList.add("module-music");
        cursor = 0;
        solved = 0;
        presses = 0;
        wrong = 0;
        finished = false;
        target = null;
        played = [];
        flow?.reset();
        build();
        if (teacherMode) askNext();
        else startCursor();
      },
      handleInput,
      /** この遊びの設定を変えたあと（おいわいの選択だけ。枠の速さは支援者の設定）。 */
      applySettings() {
        if (cursorTimer) startCursor();
      },
      destroy() {
        stopCursor();
        window.clearTimeout(holdTimer);
        window.clearTimeout(finishTimer);
        holdTimer = null;
        finishTimer = null;
        playTimers.forEach((timer) => window.clearTimeout(timer));
        playTimers = new Set();
        flow?.destroy();
        if (!flow && !finished) audio.stopSpeech?.();
        if (stageEl) {
          stageEl.classList.remove("module-music");
          stageEl.innerHTML = "";
        }
        stageEl = null;
      },
    };
  };
}

/** 読み上げの文（lines.mjs が声のパックに入れる）。表記ごとに引く。 */
export function musicSpokenTexts(translate) {
  const name = (id) => translate(`music.instrument.${id}`);
  return [
    ...MUSIC_INSTRUMENTS.map((id) => ({ text: name(id), from: `music.instrument.${id}` })),
    ...MUSIC_INSTRUMENTS.map((id) => ({ text: translate("music.teacher.prompt", { name: name(id) }), from: "music.teacher.prompt" })),
  ];
}

