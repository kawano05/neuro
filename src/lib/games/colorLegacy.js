// =====================================================================
// games/colorLegacy.js — 「色変化」ゲームの契約ラッパ
//
// 継承（基本設計書 §1.3）: 旧 views/switcher.js の runActivity()（押すと
// 画面の色と音が変わる L0 反応確認）を、ゲーム契約（detailed-design.md
// §3.1）にラップして移植したもの。色・音・読み上げデータは content.js の
// switchModules / stageColors をそのまま流用する（教材データそのものは
// 変更していない）。
//
// 2026-08-19 のゲーム品質監査で、無期限かつ結果画面が無いこと自体が完成度差だと確認した。
// 色と音は既存の評価タスクと同じ5入力で区切り、完了後は共通リザルトへ進む。
// 得点・正誤は作らない。刺激量を保ったまま「目的・進捗・終了・再挑戦」を揃える。
// 強制終了（おわる／Esc）は従来どおり結果を経由せずホームへ戻る。
// =====================================================================

import { colorLegacyPreset, switchModules, stageColors } from "../content.js";

// 純音（約0.2秒）が終わってから短い音声を出す。連打時は最後の1回だけ。
export const COLOR_TTS_DELAY_MS = 240;
export const COLOR_FEEDBACK_MS = 480;
export const COLOR_FINISH_DELAY_MS = 560;
export const COLOR_TARGET_PRESSES = colorLegacyPreset.targetPresses;

const COLOR_PEDESTAL_ICONS = [
  "fa-solid fa-circle",
  "fa-solid fa-play",
  "fa-solid fa-square",
  "fa-solid fa-star",
  "fa-solid fa-diamond",
];
const COLOR_PARTICLE_COUNT = 14;
const COLOR_IDLE_STAGE_COLOR = "#315468";

export function createColorLegacyGame(ctx) {
  const { settings, audio, voiceFeedback, logEvent, finish, t, tHtml } = ctx;
  const legacyModule = switchModules.find((module) => module.id === "color") || switchModules[0];

  let stageEl = null;
  let step = 0;
  let speechTimer = null;
  let feedbackTimer = null;
  let finishTimer = null;
  let feedbackVisible = false;
  let finishDelivered = false;

  function render() {
    if (!stageEl) return;
    // 0回目は未収集の中立色。1押下目から stageColors[0] を中央と台座の両方へ
    // 置き、中央で鳴った/光った順と、残る5色の履歴・結果パレットを一致させる。
    const color = step === 0
      ? COLOR_IDLE_STAGE_COLOR
      : stageColors[(step - 1) % stageColors.length];
    stageEl.style.setProperty("--stage-color", color);
    // 画面の主役は色そのもの（L0 反応確認は「押したら変わった」が伝われば
    // よい課題）。以前はここに legacyModule.name（"色変化"）を巨大な文字で
    // 出していたが、ゲーム名は左上の #gameProgress が既に出しており、しかも
    // タイル名「いろと おと」とも食い違って見えていたので外した。
    const complete = step >= COLOR_TARGET_PRESSES;
    const remaining = Math.max(0, COLOR_TARGET_PRESSES - step);
    const completedCount = Math.min(step, COLOR_TARGET_PRESSES);
    const dots = Array.from({ length: COLOR_TARGET_PRESSES }, (_, index) => {
      const done = index < step ? " is-done" : "";
      const dotColor = stageColors[index % stageColors.length];
      return `
        <span class="color-progress-dot color-pedestal${done}" style="--dot-color:${dotColor}">
          <span class="color-pedestal-number">${index + 1}</span>
          <span class="color-pedestal-orb">
            <i class="color-pedestal-shape ${COLOR_PEDESTAL_ICONS[index]}" aria-hidden="true"></i>
          </span>
          <span class="color-pedestal-base"></span>
        </span>
      `;
    }).join("");
    const particles = Array.from(
      { length: COLOR_PARTICLE_COUNT },
      (_, index) => `<span class="color-light-particle color-light-particle-${index + 1}"></span>`
    ).join("");
    stageEl.innerHTML = `
      <span class="activity-visual color-light-stage" aria-hidden="true">
        <span class="color-stage-glow"></span>
        <span class="color-stage-hud"><span>LIGHT STAGE</span><strong>${completedCount}/${COLOR_TARGET_PRESSES}</strong></span>
        <span class="color-speaker color-speaker-left"><span class="color-speaker-cone color-speaker-cone-small"></span><span class="color-speaker-cone color-speaker-cone-large"></span></span>
        <span class="color-speaker color-speaker-right"><span class="color-speaker-cone color-speaker-cone-small"></span><span class="color-speaker-cone color-speaker-cone-large"></span></span>
        <span class="color-prism-rig">
          <span class="color-prism-halo"></span>
          <span class="color-light-particles">${particles}</span>
          <span class="color-chip" style="--chip-color:${color}"><span class="color-prism-core"></span><span class="color-prism-facet"></span></span>
          <span class="color-feedback" aria-hidden="true">${tHtml(complete ? "color.complete" : "color.changed")}</span>
        </span>
      </span>
      <span class="color-session-progress" aria-hidden="true">
        <span class="color-progress-dots">${dots}</span>
        <span class="reaction-detail">${tHtml(complete ? "color.progressComplete" : "color.progress", { n: remaining })}</span>
      </span>
    `;
    stageEl.classList.toggle("is-feedback", feedbackVisible);
  }

  /** スイッチ入力1回ぶんの処理（色変化＋音＋短い遅延案内＋記録）。 */
  function handleInput() {
    if (step >= COLOR_TARGET_PRESSES || finishTimer !== null) return;
    window.clearTimeout(speechTimer);
    window.clearTimeout(feedbackTimer);
    // 前の発話が次の純音へ重ならないよう、入力の瞬間に所有権を音へ戻す。
    audio.stopSpeech();
    const tone = legacyModule.tones[step % legacyModule.tones.length];
    step += 1;
    audio.playTone(tone);
    feedbackVisible = true;
    render();

    feedbackTimer = window.setTimeout(() => {
      feedbackVisible = false;
      stageEl?.classList.remove("is-feedback");
    }, COLOR_FEEDBACK_MS);

    const remaining = COLOR_TARGET_PRESSES - step;
    if (remaining > 0) {
      // 純音が終わってから、アプリTTSかOS/live regionの一方だけが読む。
      // 残り回数も同じ所有者から一度だけ伝える。
      speechTimer = window.setTimeout(() => {
        speechTimer = null;
        voiceFeedback(t("color.voice.progress", { n: remaining }));
      }, COLOR_TTS_DELAY_MS);
    } else {
      // 最後の色・波紋・短文を見せてから共通結果へ進む。
      // 得点は作らず、完了した入力回数と色数だけを結果レンダラーへ渡す。
      finishTimer = window.setTimeout(() => {
        finishTimer = null;
        finishDelivered = true;
        if (settings.speechEnabled) {
          voiceFeedback(t("color.voice.finish", { n: COLOR_TARGET_PRESSES }));
        }
        finish({ presses: COLOR_TARGET_PRESSES, colors: stageColors.length });
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
      feedbackVisible = false;
      finishDelivered = false;
      stageEl.classList.add("module-color");
      render();
    },
    handleInput,
    destroy() {
      window.clearTimeout(speechTimer);
      window.clearTimeout(feedbackTimer);
      window.clearTimeout(finishTimer);
      speechTimer = null;
      feedbackTimer = null;
      finishTimer = null;
      // 正常終了の完了案内は、結果画面へ遷移しても最後まで読ませる。
      // 中断時は gameHost.returnHome() が先に stopSpeech() する。
      if (!finishDelivered) audio.stopSpeech();
      if (stageEl) stageEl.classList.remove("module-color", "is-feedback");
      stageEl = null;
    },
  };
}
