// =====================================================================
// games/colorLegacy.js — 「色変化」ゲームの契約ラッパ
//
// 継承（基本設計書 §1.3）: 旧 views/switcher.js の runActivity()（押すと
// 画面の色と音が変わる L0 反応確認）を、ゲーム契約（detailed-design.md
// §3.1）にラップして移植したもの。色・音・読み上げデータは content.js の
// switchModules / stageColors をそのまま流用する（教材データそのものは
// 変更していない）。
//
// 終了動線の設計判断（P1-3、詳細設計書 §12 タスク6の指示に基づく）:
// 色変化には「規定試行数」のようなセッション終了条件が無く、セッションの
// 概念が薄い。よってこのゲームは ctx.finish() を一度も呼ばない設計とした。
// 唯一の退出経路は gameHost 側が処理する「おわる」タップ／Esc／
// visibilitychange であり、いずれも ctx.abort() 経由で home へ直帰する
// （リザルト画面は経由しない）。得点や達成率の概念が無いこのゲームで
// 無理にリザルト画面を経由させると、空の集計を見せるだけになり利用者に
// とって意味がないと判断した。
// =====================================================================

import { switchModules, stageColors } from "../content.js";

export function createColorLegacyGame(ctx) {
  const { audio, announce, logEvent } = ctx;
  const legacyModule = switchModules.find((module) => module.id === "color") || switchModules[0];

  let stageEl = null;
  let step = 0;

  function render() {
    if (!stageEl) return;
    const color = stageColors[step % stageColors.length];
    stageEl.style.setProperty("--stage-color", color);
    // 画面の主役は色そのもの（L0 反応確認は「押したら変わった」が伝われば
    // よい課題）。以前はここに legacyModule.name（"色変化"）を巨大な文字で
    // 出していたが、ゲーム名は左上の #gameProgress が既に出しており、しかも
    // タイル名「いろと おと」とも食い違って見えていたので外した。
    stageEl.innerHTML = `
      <span class="activity-visual"><span class="color-chip" style="background:${color}"></span></span>
      <span class="reaction-detail">${legacyModule.description}</span>
    `;
  }

  /** スイッチ入力1回ぶんの処理（色変化＋音＋読み上げ＋記録、旧 runActivity() 相当）。 */
  function handleInput() {
    const tone = legacyModule.tones[step % legacyModule.tones.length];
    step += 1;
    audio.playTone(tone);
    audio.speak(legacyModule.name);
    announce(`${legacyModule.name}に入力しました`);
    // 既存の評価/ログ連動（views/evaluation.js の countEntry が entry.type
    // を見て自動集計する仕組み）を維持するため、旧 switcher.js と同じ
    // {type:"switch", label} を記録する。
    logEvent({ type: "switch", label: legacyModule.name });
    render();
  }

  return {
    mount(el) {
      stageEl = el;
      step = 0;
      stageEl.classList.add("module-color");
      render();
    },
    handleInput,
    destroy() {
      if (stageEl) stageEl.classList.remove("module-color");
      stageEl = null;
    },
  };
}
