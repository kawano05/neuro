// =====================================================================
// views/letters.js — 文字学習ソフト画面
// =====================================================================

import { letterTasks } from "../content.js";

export function initLetters(ctx) {
  const { state, elements, save, logEvent, voiceFeedback, playTone, scan } = ctx;

  function render() {
    const task = letterTasks[state.letterIndex % letterTasks.length];
    elements.letterPrompt.textContent = task.prompt;
    elements.letterGrid.innerHTML = "";
    task.options.forEach((letter) => {
      const button = document.createElement("button");
      button.className = "letter-button";
      button.type = "button";
      button.dataset.scan = "";
      button.textContent = letter;
      button.addEventListener("click", () => choose(letter));
      elements.letterGrid.append(button);
    });
  }

  /** 文字を選んだときの判定・記録・次の問題への遷移 */
  function choose(letter) {
    const task = letterTasks[state.letterIndex % letterTasks.length];
    const correct = letter === task.answer;
    playTone(correct ? 760 : 240);
    voiceFeedback(
      correct ? "正解です" : "違います",
      correct ? `正解: ${letter}` : `違います: ${letter}`
    );
    logEvent({ type: "letter", label: letter, correct });
    state.letterIndex = (state.letterIndex + 1) % letterTasks.length;
    save();
    render();
    scan.restartIfNeeded();
  }

  elements.nextLetter.addEventListener("click", () => {
    state.letterIndex = (state.letterIndex + 1) % letterTasks.length;
    save();
    render();
    scan.restartIfNeeded();
  });

  return { render };
}
