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
// 流れ（押す → 音 → 進み → 5回目 → フィナーレ → けっか）は createBeginnerFlow が
// 1か所で持つ。以前は3つの遊びが同じ流れを別々のタイマーで書いていた
// （技術負債の返済。docs/overall-design-2026-09-28.md §6.1）。遊びの側は
// 「押したら何が起きるか」と「何と言うか」だけを書く。
//
// どれも測定の課題ではない（taskType なし）。押すたびに残すのは、評価ログの
// 集計に使われる logEvent({type:"switch"}) だけ。
// =====================================================================

import { joinSpeech, resolveTextMode } from "../i18n.js";
import { DEFAULT_PLAY_PREFS } from "../state.js";

/** はじめの遊びは5回で終わる（colorLegacyPreset と同じ長さ）。 */
export const BEGINNER_TARGET_PRESSES = 5;

// 「明るい効果音」の持ち上げ（dB）。短い音なので、楽器の音と同じ大きさに
// 聞こえるように足す（src/lib/audio.js の effectOutputGain。合図の無い場面だけ）。
const POP_MAKEUP_DB = 5;

// できたときの順番（docs/design-renewal-2026-09-25.md §3.17）。
// 歓声と拍手 → 笑い声 → 「やったー できた！」の声。同時に鳴らすと、声に隠れて
// おいわいの音がほとんど聞こえなかった。
const LAUGH_AFTER_CHEER_S = 0.8;
const VOICE_AFTER_CHEER_MS = 1200;
const VOICE_AFTER_CHEER_AND_LAUGH_MS = 1900;

// 楽器の音: ペンタトニック（ドレミソラ）。どの順で鳴っても濁らず、押すたびに上がる
// （だんだん盛り上がる。docs/overall-design-2026-09-28.md §3.1）。
const INSTRUMENT_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];
// できたときのファンファーレ: ド・ミ・ソ・ド を駆け上がって、和音で伸ばし、
// 高いきらきらを2つ（ミ・ソ）。
const FANFARE_RUN = [523.25, 659.25, 783.99, 1046.5];
const FANFARE_CHORD = [523.25, 659.25, 783.99, 1046.5];
const FANFARE_SPARKLE = [1318.51, 1567.98];

/** その遊びの見え方と音。保存に無ければ既定。 */
export function playPrefsFor(settings, gameId) {
  return settings?.playPrefs?.[gameId] ?? DEFAULT_PLAY_PREFS[gameId];
}

/**
 * 押したときの音（この遊びの設定で選ぶ）。
 * 明るい効果音は、押すたびに全音ずつ高くなる（大きさは変えない。§4 安全の決まり）。
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
    const lift = Math.pow(2, (2 * Math.min(Math.max(pressIndex, 0), 6)) / 12);
    audio.playSweep({ fromHz: 300 * lift, toHz: 1100 * lift, durationS: 0.14, gain: 0.04, makeupDb: POP_MAKEUP_DB });
    audio.playNoise({ durationS: 0.08, gain: 0.018, filter: "bandpass", frequency: 2600, q: 1.4, makeupDb: POP_MAKEUP_DB });
    return;
  }
  if (style === "boom") {
    audio.playBoom();
    return;
  }
  audio.playChime(INSTRUMENT_NOTES[pressIndex % INSTRUMENT_NOTES.length]);
}

/** 5回目（できた）の音。ファンファーレ（楽器の音）か、上がっていく効果音。 */
export function playFinishSound(audio, style) {
  if (style === "none") return;
  if (style === "pop" || style === "boom" || style === "boing") {
    [0, 0.12, 0.24, 0.36].forEach((delayS, index) => {
      window.setTimeout(() => {
        audio.playSweep({
          fromHz: 400 + index * 140,
          toHz: 1300 + index * 260,
          durationS: 0.12,
          gain: 0.04,
          makeupDb: POP_MAKEUP_DB,
        });
      }, delayS * 1000);
    });
    FANFARE_SPARKLE.forEach((frequency, index) => {
      audio.playChime(frequency, { delayS: 0.52 + index * 0.12, durationS: 0.7, level: 0.6 });
    });
    return;
  }
  // 駆け上がり → 和音 → きらきら。重ねるぶん1音ずつは小さく（level）。
  FANFARE_RUN.forEach((frequency, index) => {
    audio.playChime(frequency, { delayS: 0.06 + index * 0.085, durationS: 0.45, level: 0.7 });
  });
  FANFARE_CHORD.forEach((frequency) => {
    audio.playChime(frequency, { delayS: 0.46, durationS: 1.5, level: 0.42 });
  });
  FANFARE_SPARKLE.forEach((frequency, index) => {
    audio.playChime(frequency, { delayS: 0.62 + index * 0.13, durationS: 0.8, level: 0.5 });
  });
}

/**
 * できたときのおいわい。歓声と拍手（audio.playApplause。録音があれば子どもの
 * 「イエーイ」と拍手）・笑い声（audio.playLaugh）と「やったー」の声。
 *
 * どれを出すかは、この遊びの設定の「できたときのおいわい」で選ぶ（state.js の
 * PLAY_CHEERS）。「なし」以外なら「やったー」の声も出す。読み上げの声は、支援者の
 * 設定で読み上げが入っているときだけ（切ってあるときは、この遊びの設定の画面に
 * そう書いてある。gameSettings.js）。
 *
 * 順番: 歓声と拍手 → 笑い声 → 声。声（読み上げ）は効果音より大きいので、同時に
 * 鳴らすと、おいわいの音が声に隠れる。効果音を切ってあるときは待たない。
 *
 * @param {object} ctx ゲームの ctx（audio / voiceFeedback / t / settings）
 * @param {{cheer: string}} prefs この遊びの設定
 * @param {string} doneText 読み上げる「できた」の文（プレーン文）
 */
export function celebrate(ctx, prefs, doneText) {
  const cheer = prefs.cheer;
  const withCheer = cheer === "both" || cheer === "applause";
  const withLaugh = cheer === "both" || cheer === "laugh";
  if (withCheer) ctx.audio.playApplause({ sample: "cheer" });
  if (withLaugh) ctx.audio.playLaugh({ delayS: withCheer ? LAUGH_AFTER_CHEER_S : 0 });
  if (!ctx.settings.speechEnabled) return;
  const parts = [doneText];
  if (cheer !== "none") parts.unshift(ctx.t("color.voice.cheer"));
  const text = joinSpeech(parts, resolveTextMode(ctx.settings));
  const sounding = ctx.settings.soundEnabled !== false && cheer !== "none";
  const delayMs = !sounding ? 0 : withCheer && withLaugh ? VOICE_AFTER_CHEER_AND_LAUGH_MS : VOICE_AFTER_CHEER_MS;
  if (delayMs > 0 && typeof ctx.audio.speakOrAnnounceLater === "function") {
    ctx.audio.speakOrAnnounceLater(text, delayMs);
    return;
  }
  ctx.voiceFeedback(text);
}

/**
 * はじめの遊びの流れ（押す → 音 → 進み → 5回目 → フィナーレ → けっか）。
 *
 * ごほうびの文法（docs/overall-design-2026-09-28.md §3）の時刻表をここで持つ:
 *   押した瞬間 … 押したときの音と、遊びの絵（onPress）。1コマ以内
 *   ttsDelayMs 後 … 残りを声で（効果音が終わってから）。連打は最後の1回だけ
 *   5回目 … ファンファーレとフィナーレの絵（onFinale）→ finishDelayMs 後にけっかへ。
 *            けっかが出るのと同時に、歓声と拍手・笑い声・「やったー」（celebrate）
 *
 * @param {object} ctx ゲームの ctx
 * @param {object} options
 * @param {string} options.gameId 遊びの設定（playPrefs）の名前
 * @param {number} [options.target] 何回で終わるか
 * @param {number} options.ttsDelayMs
 * @param {number} options.finishDelayMs
 * @param {string} options.logLabel 評価ログの label（これまでの記録とつなげる）
 * @param {(pressIndex: number) => ({creature?: string}|void)} options.onPress 押したら起きること
 * @param {(remaining: number, pressIndex: number) => string} options.progressSpeech
 * @param {() => string} options.finishSpeech
 * @param {() => object} options.finishSummary けっかへ渡す summary
 * @param {(pressIndex: number) => void} [options.onFinale] 5回目の大きな絵
 */
export function createBeginnerFlow(
  ctx,
  { gameId, target = BEGINNER_TARGET_PRESSES, ttsDelayMs, finishDelayMs, logLabel, onPress, progressSpeech, finishSpeech, finishSummary, onFinale = () => {} }
) {
  const { settings, audio, voiceFeedback, logEvent, finish } = ctx;
  let count = 0;
  let speechTimer = null;
  let finishTimer = null;
  let finishDelivered = false;

  function handleInput() {
    if (count >= target || finishTimer !== null) return false;
    window.clearTimeout(speechTimer);
    speechTimer = null;
    // 前の読み上げが次の音に重ならないよう、押した瞬間に音へ所有権を戻す。
    audio.stopSpeech();
    const pressIndex = count;
    count += 1;
    const prefs = playPrefsFor(settings, gameId);
    const drawn = onPress(pressIndex) || {};
    playPressSound(audio, prefs.sound, pressIndex, { creature: drawn.creature ?? null });

    const remaining = target - count;
    if (remaining > 0) {
      speechTimer = window.setTimeout(() => {
        speechTimer = null;
        voiceFeedback(progressSpeech(remaining, pressIndex));
      }, ttsDelayMs);
    } else {
      playFinishSound(audio, prefs.sound);
      onFinale(pressIndex);
      // 最後の絵とフィナーレを見せてから、けっかへ。けっかが出るのと同時に、
      // 歓声と拍手・笑い声・「やったー」（この遊びの設定で切れる）。
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        finishDelivered = true;
        celebrate(ctx, playPrefsFor(settings, gameId), finishSpeech());
        finish(finishSummary());
      }, finishDelayMs);
    }
    logEvent({ type: "switch", label: logLabel });
    return true;
  }

  return {
    handleInput,
    /** いま何回押したか。 */
    count: () => count,
    /** 最後の1回を押したあとか（けっかへ向かっている）。 */
    finishing: () => count >= target,
    reset() {
      count = 0;
      finishDelivered = false;
    },
    destroy() {
      window.clearTimeout(speechTimer);
      window.clearTimeout(finishTimer);
      speechTimer = null;
      finishTimer = null;
      // 正常終了の「やったー」は、けっかへ移っても最後まで読ませる。
      // 中断時は gameHost.returnHome() が先に stopSpeech() する。
      if (!finishDelivered) audio.stopSpeech();
    },
  };
}

/** 進みぐあいの点（押した数だけ色がつく）。 */
export function progressDotsHtml(done, total = BEGINNER_TARGET_PRESSES) {
  const dots = Array.from(
    { length: total },
    (_, index) => `<span class="pop-dot${index < done ? " is-done" : ""}"></span>`
  ).join("");
  return `<span class="pop-dots" aria-hidden="true" data-done="${done}" data-total="${total}">${dots}</span>`;
}
