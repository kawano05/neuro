// =====================================================================
// games/beginnerKit.js — はじめの遊び（失敗の無い遊び）の共通部品
//
// 「おすと でてくる」「ふうせん わり」「ぬりえ」の3つが使う。どれも、
//   - いつ押しても必ず何かが起きる（失敗が無い、時間制限も無い）
//   - 5回で終わり、けっかは「できた！」と、起きたことを並べるだけ
//   - 見え方と音を遊びごとに選べる（settings.playPrefs、state.js）
// という約束で作っている（docs/design-renewal-2026-09-25.md §1.4, §1.7）。
// 打ち合わせで「失敗がほぼ無く、やったことが全部プラスになる遊びを増やして
// ほしい」「音はゲームによって選べるといい」と言われた。
//
// どれも測定の課題ではない（taskType なし）。押すたびに残すのは、評価ログの
// 集計に使われる logEvent({type:"switch"}) だけ。
// =====================================================================

import { DEFAULT_PLAY_PREFS } from "../state.js";

/** はじめの遊びは5回で終わる（colorLegacyPreset と同じ長さ）。 */
export const BEGINNER_TARGET_PRESSES = 5;

// 楽器の音: ペンタトニック（ドレミソラ）。どの順で鳴っても濁らない。
const INSTRUMENT_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];
// できたときの和音（ド・ミ・ソ・ド）。
const FINISH_CHORD = [523.25, 659.25, 783.99, 1046.5];

/** その遊びの見え方と音。保存に無ければ既定。 */
export function playPrefsFor(settings, gameId) {
  return settings?.playPrefs?.[gameId] ?? DEFAULT_PLAY_PREFS[gameId];
}

/**
 * 押したときの音（この遊びの設定で選ぶ）。
 * @param {object} [options]
 * @param {string} [options.creature] 「生きものの声」で鳴らす生きもの（出てきた絵の id）
 */
export function playPressSound(audio, style, pressIndex, { creature = null } = {}) {
  if (style === "none") return;
  if (style === "creature" && creature) {
    audio.playCreature(creature);
    return;
  }
  if (style === "boing") {
    audio.playBoing();
    return;
  }
  if (style === "pop" || style === "creature") {
    // 明るい効果音: 上がる「ポン」と、はじける音を少し。
    audio.playSweep({ fromHz: 300, toHz: 1100, durationS: 0.14, gain: 0.04 });
    audio.playNoise({ durationS: 0.08, gain: 0.018, filter: "bandpass", frequency: 2600, q: 1.4 });
    return;
  }
  if (style === "boom") {
    audio.playBoom();
    return;
  }
  audio.playChime(INSTRUMENT_NOTES[pressIndex % INSTRUMENT_NOTES.length]);
}

/** 5回目（できた）の音。 */
export function playFinishSound(audio, style) {
  if (style === "none") return;
  if (style === "pop" || style === "boom" || style === "boing") {
    [0, 0.12, 0.24].forEach((delayS, index) => {
      window.setTimeout(() => {
        audio.playSweep({
          fromHz: 400 + index * 120,
          toHz: 1300 + index * 200,
          durationS: 0.12,
          gain: 0.04,
        });
      }, delayS * 1000);
    });
    return;
  }
  FINISH_CHORD.forEach((frequency, index) => {
    audio.playChime(frequency, { delayS: 0.14 + index * 0.11, durationS: 1.1 });
  });
}

/**
 * できたときのおいわい。拍手（audio.playApplause）・笑い声（audio.playLaugh）と
 * 「やったー」。
 *
 * どれを出すかは、この遊びの設定の「できたときのおいわい」で選ぶ（state.js の
 * PLAY_CHEERS）。「なし」以外なら「やったー」の声も出す。読み上げの声は、支援者の
 * 設定で読み上げが入っているときだけ（切ってあるときは、この遊びの設定の画面に
 * そう書いてある。gameSettings.js）。
 *
 * @param {object} ctx ゲームの ctx（audio / voiceFeedback / t / settings）
 * @param {{cheer: string}} prefs この遊びの設定
 * @param {string} doneText 読み上げる「できた」の文（プレーン文）
 */
export function celebrate(ctx, prefs, doneText) {
  const cheer = prefs.cheer;
  if (cheer === "both" || cheer === "applause") ctx.audio.playApplause();
  if (cheer === "both" || cheer === "laugh") ctx.audio.playLaugh();
  if (!ctx.settings.speechEnabled) return;
  const parts = [doneText];
  if (cheer !== "none") parts.unshift(ctx.t("color.voice.cheer"));
  ctx.voiceFeedback(parts.join(" "));
}

/** 進みぐあいの点（押した数だけ色がつく）。 */
export function progressDotsHtml(done, total = BEGINNER_TARGET_PRESSES) {
  const dots = Array.from(
    { length: total },
    (_, index) => `<span class="pop-dot${index < done ? " is-done" : ""}"></span>`
  ).join("");
  return `<span class="pop-dots" aria-hidden="true" data-done="${done}" data-total="${total}">${dots}</span>`;
}
