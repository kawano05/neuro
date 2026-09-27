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
import { createBeginnerFlow, playPrefsFor, progressDotsHtml } from "./beginnerKit.js";

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
  const { settings, t, tHtml, fx } = ctx;
  const legacyModule = switchModules.find((module) => module.id === "color") || switchModules[0];

  let stageEl = null;
  // いま出ている動物（押した回の番号）。-1 なら真っ暗。
  let shownIndex = -1;
  let fading = false;
  let hideTimer = null;
  let fadeTimer = null;

  function clearTimers() {
    window.clearTimeout(hideTimer);
    window.clearTimeout(fadeTimer);
    hideTimer = null;
    fadeTimer = null;
  }

  // 押す → 音 → 進み → 5回目 → フィナーレ → けっか（beginnerKit.js の共通の流れ）。
  // この遊びが書くのは「押したら動物がポンと出る」ことだけ。
  const flow = createBeginnerFlow(ctx, {
    gameId: GAME_ID,
    target: COLOR_TARGET_PRESSES,
    ttsDelayMs: COLOR_TTS_DELAY_MS,
    finishDelayMs: COLOR_FINISH_DELAY_MS,
    // 既存の評価/ログ連動（views/evaluation.js の countEntry が entry.type を見て
    // 自動集計する仕組み）を維持するため、旧 switcher.js と同じ label を残す。
    logLabel: legacyModule.name,
    onPress(pressIndex) {
      clearTimers();
      shownIndex = pressIndex;
      fading = false;
      render();
      // ② 起きたこと: 動物がポンと出て、輪ときらきら（回を追うごとに大きく）。
      const figure = stageEl?.querySelector(".pop-figure");
      fx?.popAppear(figure, { k: pressIndex });
      fx?.motion.stamp(figure?.querySelector(".pop-word"), { delayMs: 150 });
      // ③ 進みぐあい: 埋まった点が弾む。
      const done = stageEl?.querySelectorAll(".pop-dot.is-done");
      fx?.motion.bump(done?.[done.length - 1], { delayMs: 120 });
      if (pressIndex + 1 < COLOR_TARGET_PRESSES) scheduleHide();
      return { creature: popAnimalFor(pressIndex).id };
    },
    // 動物の名前を言う（ことばを覚える入口にもなる）。読み上げが OFF なら
    // live region へ回る（audio.speakOrAnnounce）。
    progressSpeech: (remaining, pressIndex) =>
      t("color.voice.progress", { name: t(`animal.${popAnimalFor(pressIndex).id}`), n: remaining }),
    finishSpeech: () => t("color.voice.finish", { n: COLOR_TARGET_PRESSES }),
    finishSummary: () => ({
      presses: COLOR_TARGET_PRESSES,
      animals: Array.from({ length: COLOR_TARGET_PRESSES }, (_, index) => popAnimalFor(index).id),
    }),
    // ⑤ フィナーレ: 最後の動物が跳ねて、星の輪と紙吹雪。
    onFinale: () => fx?.finale(stageEl, { hero: stageEl?.querySelector(".pop-figure") }),
  });

  function render() {
    if (!stageEl) return;
    stageEl.classList.toggle("is-light", playPrefsFor(settings, GAME_ID).background === "light");

    const step = flow.count();
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
    flow.handleInput();
  }

  return {
    mount(el) {
      stageEl = el;
      flow.reset();
      shownIndex = -1;
      fading = false;
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
      flow.destroy();
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
