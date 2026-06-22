// =====================================================================
// views/matching.js — スキャン・マッチング教材画面
// =====================================================================

import { matchingTasks } from "../content.js";

export function initMatching(ctx) {
  const { state, elements, save, announce, logEvent, speak, playTone, scan } = ctx;

  function render() {
    const task = matchingTasks[state.matchingIndex % matchingTasks.length];
    elements.matchingPrompt.textContent = task.prompt;
    elements.matchingGrid.innerHTML = "";
    task.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "match-card";
      button.type = "button";
      button.dataset.scan = "";
      button.innerHTML = `<span class="shape ${option.visual}"></span><strong>${option.label}</strong>`;
      button.addEventListener("click", () => choose(option.label));
      elements.matchingGrid.append(button);
    });
  }

  /** 選択肢を選んだときの判定・記録・次の問題への遷移 */
  function choose(answer) {
    const task = matchingTasks[state.matchingIndex % matchingTasks.length];
    const correct = answer === task.answer;
    playTone(correct ? 700 : 230);
    speak(correct ? "正解です" : "違います");
    announce(correct ? `正解: ${answer}` : `違います: ${answer}`);
    logEvent({ type: "matching", label: answer, correct });
    state.matchingIndex = (state.matchingIndex + 1) % matchingTasks.length;
    save();
    render();
    scan.restartIfNeeded();
  }

  elements.nextMatching.addEventListener("click", () => {
    state.matchingIndex = (state.matchingIndex + 1) % matchingTasks.length;
    save();
    render();
    scan.restartIfNeeded();
  });

  return { render };
}
