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
import { BEGINNER_TARGET_PRESSES, createBeginnerFlow, playPrefsFor } from "./beginnerKit.js";

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
  const { settings, t, tHtml, fx } = ctx;

  let stageEl = null;
  // いま割れている途中のふうせん（-1 なら無し）。
  let poppingIndex = -1;
  let popTimer = null;

  // 押す → 音 → 進み → 5回目 → フィナーレ → けっか（beginnerKit.js の共通の流れ）。
  const flow = createBeginnerFlow(ctx, {
    gameId: GAME_ID,
    ttsDelayMs: BALLOON_TTS_DELAY_MS,
    finishDelayMs: BALLOON_FINISH_DELAY_MS,
    // 評価ログの集計（入力の回数）は、ほかのはじめの遊びと同じ switch で残す。
    logLabel: "ふうせん わり",
    onPress(pressIndex) {
      window.clearTimeout(popTimer);
      poppingIndex = pressIndex;
      update();
      // ② 起きたこと: そのふうせんの色の紙吹雪と輪。残りのふうせんが、びくっとする。
      const balloons = [...(stageEl?.querySelectorAll(".balloon") || [])];
      fx?.balloonPop(balloons[pressIndex], {
        k: pressIndex,
        color: BALLOON_COLORS[pressIndex % BALLOON_COLORS.length],
        neighbors: balloons.slice(pressIndex + 1),
      });
      fx?.motion.stamp(stageEl?.querySelector(".balloon-word"), { delayMs: 80 });
      popTimer = window.setTimeout(() => {
        popTimer = null;
        poppingIndex = -1;
        update();
      }, BALLOON_POP_MS);
    },
    progressSpeech: (remaining) => t("balloon.voice.progress", { n: remaining }),
    finishSpeech: () => t("balloon.voice.finish", { n: BEGINNER_TARGET_PRESSES }),
    finishSummary: () => ({ presses: BEGINNER_TARGET_PRESSES, balloons: [...BALLOON_COLORS] }),
    onFinale: () => fx?.finale(stageEl?.querySelector(".balloon-stage") || stageEl, {}),
  });

  function wordKey() {
    const popped = flow.count();
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
    // 割れたときの紙吹雪は演出エンジン（fx.balloonPop）が描く。以前は CSS の
    // 小片8枚をふうせんごとに持っていた（技術負債の返済）。
    const balloons = BALLOON_COLORS.map(
      (color, index) => `
        <span class="balloon" style="--balloon:${color};--i:${index}">
          ${artSvg(BALLOON_ART, { className: "balloon-svg" })}
          <span class="balloon-mark">${burstSvg(color)}</span>
        </span>
      `
    ).join("");
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
    const popped = flow.count();
    stageEl.querySelectorAll(".balloon").forEach((balloon, index) => {
      balloon.classList.toggle("is-popping", index === poppingIndex);
      balloon.classList.toggle("is-popped", index < popped && index !== poppingIndex);
    });
    const word = stageEl.querySelector(".balloon-word");
    if (word) word.innerHTML = tHtml(wordKey());
  }

  /** スイッチ入力1回ぶん。いつ押しても次のふうせんが割れる（失敗が無い）。 */
  function handleInput() {
    flow.handleInput();
  }

  return {
    mount(el) {
      stageEl = el;
      flow.reset();
      poppingIndex = -1;
      stageEl.classList.add("module-balloon");
      build();
    },
    handleInput,
    /** この遊びの設定を変えたあと（games/gameSettings.js）。割った数はそのまま。 */
    applySettings() {
      update();
    },
    destroy() {
      window.clearTimeout(popTimer);
      popTimer = null;
      flow.destroy();
      if (stageEl) {
        stageEl.classList.remove("module-balloon", "is-light");
        stageEl.innerHTML = "";
      }
      stageEl = null;
    },
  };
}
