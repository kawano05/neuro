// =====================================================================
// views/switcher.js — スイッチ教材ソフト画面
//
// ゲーム追加の起点になるビュー。content.js の switchModules に
// モジュールを追加し、renderStage() に表示分岐を足すことで
// 「起動メニュー → 各ゲーム」構成（打合せ合意済みの方針）に拡張できる。
// =====================================================================

import { switchModules, stageColors } from "../content.js";

export function initSwitcher(ctx) {
  const { state, elements, save, announce, logEvent, speak, playTone, scan } = ctx;

  /** 現在選択中の教材モジュール */
  function activeModule() {
    return switchModules.find((module) => module.id === state.activeSwitchModule) || switchModules[0];
  }

  /** モジュール選択グリッドの描画 */
  function renderModules() {
    elements.switchModuleGrid.innerHTML = "";
    const activeModuleId = activeModule().id;
    switchModules.forEach((module) => {
      const button = document.createElement("button");
      button.className = "module-button";
      button.classList.toggle("is-active", module.id === activeModuleId);
      button.type = "button";
      button.dataset.scan = "";
      button.innerHTML = `<strong>${module.name}</strong><span>${module.description}</span>`;
      button.addEventListener("click", () => {
        state.activeSwitchModule = module.id;
        state.switchStep = 0;
        save();
        renderModules();
        renderStage();
        scan.restartIfNeeded();
      });
      elements.switchModuleGrid.append(button);
    });
  }

  /** 教材ステージ（大きな入力ボタン）の描画 */
  function renderStage() {
    const module = activeModule();
    elements.switchTitle.textContent = module.name;
    elements.switchHint.textContent = module.description;
    elements.switchStage.className = `activity-stage module-${module.id}`;
    elements.switchStage.dataset.scan = "";

    const color = stageColors[state.switchStep % stageColors.length];
    elements.switchStage.style.setProperty("--stage-color", color);
    elements.activityVisual.innerHTML = `<span class="color-chip" style="background:${color}"></span>`;

    renderMetrics();
  }

  /** 入力回数・平均間隔・直近反応の表示更新 */
  function renderMetrics() {
    elements.hitCount.textContent = String(state.hitCount);
    if (state.hitTimes.length >= 2) {
      const intervals = state.hitTimes.slice(1).map((time, index) => time - state.hitTimes[index]);
      const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      elements.averageInterval.textContent = `${Math.round(average / 100) / 10}秒`;
    } else {
      elements.averageInterval.textContent = "--";
    }

    const last = state.hitTimes[state.hitTimes.length - 1];
    elements.lastReaction.textContent = last
      ? new Intl.DateTimeFormat("ja-JP", { minute: "2-digit", second: "2-digit" }).format(last)
      : "--";
  }

  /** スイッチ入力1回ぶんの処理（色変化＋音＋記録） */
  function runActivity() {
    const module = activeModule();
    const tone = module.tones[state.switchStep % module.tones.length];
    state.hitCount += 1;
    state.hitTimes.push(Date.now());
    state.hitTimes = state.hitTimes.slice(-60);
    state.switchStep += 1;

    playTone(tone);
    speak(module.name);
    announce(`${module.name}に入力しました`);
    logEvent({ type: "switch", label: module.name });
    save();
    renderStage();
  }

  elements.switchStage.addEventListener("click", runActivity);
  elements.resetSwitch.addEventListener("click", () => {
    state.hitCount = 0;
    state.hitTimes = [];
    state.switchStep = 0;
    logEvent({ type: "system", label: "スイッチ教材記録をリセット" });
    save();
    renderStage();
  });

  return {
    render() {
      renderModules();
      renderStage();
    },
    runActivity,
  };
}
