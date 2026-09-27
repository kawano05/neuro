// =====================================================================
// games/colorLegacy.js — はじめの遊び「おすと でてくる」（旧「色と音」）
//
// 真っ暗な画面で、押すと動物が音といっしょに「ポン」と出てくる。
// 5回で終わり。失敗は無い——いつ押しても、押せば必ず出てくる。
//
// なぜこの形か（docs/design-renewal-2026-09-25.md §1.4）:
//   打ち合わせで「真っ暗な画面から、押すと絵がポンと出てくるだけでいい」
//   「力を入れたら画面が反応する、だけのものがまず要る」と言われた。
//   NeuroNode では押した感覚そのものが無いので、「何をしたら何が起きたか」を
//   最初に分かってもらうための遊び。旧「色と音」は色が変わるだけで、変化が
//   分かりにくかった（スピーカーの絵も要らない、と言われた）。
//
// 変えていないもの:
//   - gameId は color-legacy、5回で終わること（colorLegacyPreset）、
//     1回ごとに logEvent({type:"switch"}) を残すこと。評価ログの集計
//     （views/evaluation.js の countEntry）と、これまでの記録をつなげるため。
//   - 得点・正誤は作らない。結果は「何回遊んだか」と「会えた動物」だけ。
//   - 強制終了（おわる／Esc）は結果を経由せずホームへ戻る。
//
// 見え方と音は、遊びの中の「この遊びの設定」で変えられる（games/gameSettings.js、
// settings.playPrefs["color-legacy"]）。はじめの遊び3つの共通部品は beginnerKit.js。
// 測定の課題ではないので記録の条件には入れない。
// =====================================================================

import { colorLegacyPreset, switchModules } from "../content.js";
import { POP_ANIMALS, artSvg } from "../art/hakkiriArt.js";
import {
  celebrate,
  playFinishSound,
  playPrefsFor,
  playPressSound,
  progressDotsHtml,
} from "./beginnerKit.js";

const GAME_ID = "color-legacy";

// 音が鳴り終わってから短い読み上げを出す。連打時は最後の1回だけ。
export const COLOR_TTS_DELAY_MS = 240;
// 出てきた動物を見せておく時間。消えたら、また真っ暗な画面に戻る
// （「イルカが出て、消えて、次はカメ」。同 §1.4）。
export const POP_SHOW_MS = 2600;
export const POP_FADE_MS = 500;
// 5回目の動物と「できた！」を見せてから結果へ進む。
export const COLOR_FINISH_DELAY_MS = 1600;
export const COLOR_TARGET_PRESSES = colorLegacyPreset.targetPresses;

/** 何回目に出てくる動物か（5匹を順に。6回目以降は最初に戻る）。 */
export function popAnimalFor(pressIndex) {
  return POP_ANIMALS[((pressIndex % POP_ANIMALS.length) + POP_ANIMALS.length) % POP_ANIMALS.length];
}

export function createColorLegacyGame(ctx) {
  const { settings, audio, voiceFeedback, logEvent, finish, t, tHtml } = ctx;
  const legacyModule = switchModules.find((module) => module.id === "color") || switchModules[0];

  let stageEl = null;
  let step = 0;
  // いま出ている動物（押した回の番号）。-1 なら真っ暗。
  let shownIndex = -1;
  let fading = false;
  let speechTimer = null;
  let hideTimer = null;
  let fadeTimer = null;
  let finishTimer = null;
  let finishDelivered = false;

  function clearTimers() {
    window.clearTimeout(speechTimer);
    window.clearTimeout(hideTimer);
    window.clearTimeout(fadeTimer);
    speechTimer = null;
    hideTimer = null;
    fadeTimer = null;
  }

  function render() {
    if (!stageEl) return;
    stageEl.classList.toggle("is-light", playPrefsFor(settings, GAME_ID).background === "light");

    let center;
    if (shownIndex >= 0) {
      const animal = popAnimalFor(shownIndex);
      const complete = step >= COLOR_TARGET_PRESSES;
      const wordKey = complete ? "color.pop.4" : `color.pop.${Math.min(shownIndex, 3)}`;
      center = `
        <span class="pop-figure${fading ? " is-gone" : ""}" data-animal="${animal.id}">
          ${artSvg(animal)}
          <span class="pop-word">${tHtml(wordKey)}</span>
        </span>
      `;
    } else if (step === 0) {
      center = `
        <span class="pop-prompt">
          <span class="pop-prompt-ring"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i></span>
          <span class="pop-word">${tHtml("color.prompt")}</span>
        </span>
      `;
    } else {
      center = `<span class="pop-count">${tHtml("color.count", { n: step })}</span>`;
    }

    stageEl.innerHTML = `
      <span class="pop-stage" aria-hidden="true">${center}</span>
      ${progressDotsHtml(step, COLOR_TARGET_PRESSES)}
    `;
  }

  /** 見せていた動物を消して、真っ暗な画面に戻す。 */
  function scheduleHide() {
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      fading = true;
      render();
      fadeTimer = window.setTimeout(() => {
        fadeTimer = null;
        fading = false;
        shownIndex = -1;
        render();
      }, POP_FADE_MS);
    }, POP_SHOW_MS);
  }

  /** スイッチ入力1回ぶん。いつ押しても出てくる（失敗が無い）。 */
  function handleInput() {
    if (step >= COLOR_TARGET_PRESSES || finishTimer !== null) return;
    clearTimers();
    // 前の読み上げが次の音に重ならないよう、押した瞬間に音へ所有権を戻す。
    audio.stopSpeech();
    const pressIndex = step;
    step += 1;
    shownIndex = pressIndex;
    fading = false;
    playPressSound(audio, playPrefsFor(settings, GAME_ID).sound, pressIndex);
    render();

    const remaining = COLOR_TARGET_PRESSES - step;
    if (remaining > 0) {
      scheduleHide();
      // 動物の名前を言う（ことばを覚える入口にもなる）。読み上げが OFF なら
      // live region へ回る（audio.speakOrAnnounce）。
      const name = t(`animal.${popAnimalFor(pressIndex).id}`);
      speechTimer = window.setTimeout(() => {
        speechTimer = null;
        voiceFeedback(t("color.voice.progress", { name, n: remaining }));
      }, COLOR_TTS_DELAY_MS);
    } else {
      playFinishSound(audio, playPrefsFor(settings, GAME_ID).sound);
      // 最後の動物と「できた！」を見せてから共通結果へ進む。けっかの画面が
      // 出るのと同時に拍手と「やったー」（この遊びの設定で切れる）。
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        finishDelivered = true;
        celebrate(ctx, playPrefsFor(settings, GAME_ID), t("color.voice.finish", { n: COLOR_TARGET_PRESSES }));
        finish({
          presses: COLOR_TARGET_PRESSES,
          animals: Array.from({ length: COLOR_TARGET_PRESSES }, (_, index) => popAnimalFor(index).id),
        });
      }, COLOR_FINISH_DELAY_MS);
    }
    // 既存の評価/ログ連動（views/evaluation.js の countEntry が entry.type
    // を見て自動集計する仕組み）を維持するため、旧 switcher.js と同じ
    // {type:"switch", label} を記録する。
    logEvent({ type: "switch", label: legacyModule.name });
  }

  return {
    mount(el) {
      stageEl = el;
      step = 0;
      shownIndex = -1;
      fading = false;
      finishDelivered = false;
      stageEl.classList.add("module-pop");
      render();
    },
    handleInput,
    /**
     * この遊びの設定を変えたあと（games/gameSettings.js）。回数はそのまま、
     * 見え方だけを描き直す。音は次に押したときから変わる。
     */
    applySettings() {
      render();
    },
    destroy() {
      clearTimers();
      window.clearTimeout(finishTimer);
      finishTimer = null;
      // 正常終了の完了案内は、結果画面へ遷移しても最後まで読ませる。
      // 中断時は gameHost.returnHome() が先に stopSpeech() する。
      if (!finishDelivered) audio.stopSpeech();
      // 出ていた動物も消す。中断（おわる／Esc）のあとに、見えない画面へ
      // 絵を残しておかない（次に開いたとき一瞬だけ前の絵が出る）。
      if (stageEl) {
        stageEl.classList.remove("module-pop", "is-light");
        stageEl.innerHTML = "";
      }
      stageEl = null;
    },
  };
}
