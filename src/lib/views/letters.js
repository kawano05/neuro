// =====================================================================
// views/letters.js — 「文字を えらぶ」（旧 文字学習ソフト）
//
// 記録（logEvent の letter）と、正誤ののち次の問題へ進む流れは前のまま。
// 見た目と言葉だけを利用者向けにした（docs/design-renewal-2026-09-25.md §3.14）。
// =====================================================================

import { letterTasks } from "../content.js";
import { rubyToHtml } from "../i18n.js";

export function initLetters(ctx) {
  const { state, elements, save, logEvent, voiceFeedback, playTone, scan } = ctx;

  function render() {
    const task = letterTasks[state.letterIndex % letterTasks.length];
    elements.letterPrompt.innerHTML = rubyToHtml(task.promptRuby || task.prompt);
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
      correct ? ctx.t("learn.correct") : ctx.t("learn.tryNext"),
      `${correct ? ctx.t("learn.correct") : ctx.t("learn.tryNext")} ${letter}`
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
