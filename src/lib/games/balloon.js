// =====================================================================
// games/balloon.js — はじめの遊び「ふうせん わり」
//
// ふうせんが5つ浮かんでいて、押すたびに1つずつ「パン！」と割れる。
// 失敗は無い——いつ押しても、押せば必ず次のふうせんが割れる。時間制限も無い。
//
// 打ち合わせで出た例そのまま（docs/design-renewal-2026-09-25.md §1.4）:
// 「最初にいっぱい風船があって、やった分だけ風船がどんどん割れていく」。
// 押した回数が、残りのふうせんの数としてそのまま目に見える。
//
// 共通の約束（5回で終わる・遊びごとの見え方と音・できたときのおいわい）は
// beginnerKit.js。測定の課題ではない（taskType なし）。
// =====================================================================

import { BALLOON_ART, artSvg, burstSvg } from "../art/hakkiriArt.js";
import {
  BEGINNER_TARGET_PRESSES,
  celebrate,
  playFinishSound,
  playPrefsFor,
  playPressSound,
} from "./beginnerKit.js";

const GAME_ID = "balloon";

/** ふうせんの色（カラーユニバーサルデザイン推奨配色）。左から割れる。 */
export const BALLOON_COLORS = ["#FF4B00", "#F6AA00", "#03AF7A", "#005AFF", "#990099"];

// 割れる動き（CSS の balloon-pop）が終わるまで。
export const BALLOON_POP_MS = 520;
// 読み上げは「パン」の音が終わってから。
export const BALLOON_TTS_DELAY_MS = 260;
// 最後のふうせんが割れて「ぜんぶ われた！」を見せてから結果へ。
export const BALLOON_FINISH_DELAY_MS = 1500;

export function createBalloonGame(ctx) {
  const { settings, audio, voiceFeedback, logEvent, finish, t, tHtml } = ctx;

  let stageEl = null;
  let popped = 0;
  // いま割れている途中のふうせん（-1 なら無し）。
  let poppingIndex = -1;
  let popTimer = null;
  let speechTimer = null;
  let finishTimer = null;
  let finishDelivered = false;

  function wordKey() {
    if (popped >= BEGINNER_TARGET_PRESSES) return "balloon.complete";
    if (popped === 0) return "color.prompt";
    return "balloon.pop";
  }

  /**
   * ふうせんを並べる（開いたときに1回だけ）。押すたびに作り直すと、浮かんで
   * ゆれる動きが全部のふうせんで最初からやり直しになり、画面ががくつく。
   */
  function build() {
    if (!stageEl) return;
    const balloons = BALLOON_COLORS.map((color, index) => {
      const confetti = Array.from(
        { length: 8 },
        (_, piece) => `<i style="--piece:${piece}"></i>`
      ).join("");
      return `
        <span class="balloon" style="--balloon:${color};--i:${index}">
          ${artSvg(BALLOON_ART, { className: "balloon-svg" })}
          <span class="balloon-mark">${burstSvg(color)}</span>
          <span class="balloon-burst">${confetti}</span>
        </span>
      `;
    }).join("");
    stageEl.innerHTML = `
      <span class="balloon-stage" aria-hidden="true">
        <span class="balloon-word"></span>
        <span class="balloon-row">${balloons}</span>
      </span>
    `;
    update();
  }

  /** 割れた・割れている途中・ことばを、いまの状態に合わせる。 */
  function update() {
    if (!stageEl) return;
    stageEl.classList.toggle("is-light", playPrefsFor(settings, GAME_ID).background === "light");
    stageEl.querySelectorAll(".balloon").forEach((balloon, index) => {
      balloon.classList.toggle("is-popping", index === poppingIndex);
      balloon.classList.toggle("is-popped", index < popped && index !== poppingIndex);
    });
    const word = stageEl.querySelector(".balloon-word");
    if (word) word.innerHTML = tHtml(wordKey());
  }

  /** スイッチ入力1回ぶん。いつ押しても次のふうせんが割れる（失敗が無い）。 */
  function handleInput() {
    if (popped >= BEGINNER_TARGET_PRESSES || finishTimer !== null) return;
    window.clearTimeout(speechTimer);
    window.clearTimeout(popTimer);
    audio.stopSpeech();
    const pressIndex = popped;
    popped += 1;
    poppingIndex = pressIndex;
    playPressSound(audio, playPrefsFor(settings, GAME_ID).sound, pressIndex);
    update();
    popTimer = window.setTimeout(() => {
      popTimer = null;
      poppingIndex = -1;
      update();
    }, BALLOON_POP_MS);

    const remaining = BEGINNER_TARGET_PRESSES - popped;
    if (remaining > 0) {
      speechTimer = window.setTimeout(() => {
        speechTimer = null;
        voiceFeedback(t("balloon.voice.progress", { n: remaining }));
      }, BALLOON_TTS_DELAY_MS);
    } else {
      playFinishSound(audio, playPrefsFor(settings, GAME_ID).sound);
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        finishDelivered = true;
        celebrate(ctx, playPrefsFor(settings, GAME_ID), t("balloon.voice.finish", { n: BEGINNER_TARGET_PRESSES }));
        finish({ presses: BEGINNER_TARGET_PRESSES, balloons: [...BALLOON_COLORS] });
      }, BALLOON_FINISH_DELAY_MS);
    }
    // 評価ログの集計（入力の回数）は、ほかのはじめの遊びと同じ switch で残す。
    logEvent({ type: "switch", label: "ふうせん わり" });
  }

  return {
    mount(el) {
      stageEl = el;
      popped = 0;
      poppingIndex = -1;
      finishDelivered = false;
      stageEl.classList.add("module-balloon");
      build();
    },
    handleInput,
    /** この遊びの設定を変えたあと（games/gameSettings.js）。割った数はそのまま。 */
    applySettings() {
      update();
    },
    destroy() {
      window.clearTimeout(speechTimer);
      window.clearTimeout(popTimer);
      window.clearTimeout(finishTimer);
      speechTimer = null;
      popTimer = null;
      finishTimer = null;
      if (!finishDelivered) audio.stopSpeech();
      if (stageEl) {
        stageEl.classList.remove("module-balloon", "is-light");
        stageEl.innerHTML = "";
      }
      stageEl = null;
    },
  };
}
