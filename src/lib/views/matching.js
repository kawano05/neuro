// =====================================================================
// views/matching.js — 「どれかな？」（お題に合うものを選ぶ。旧 スキャン・マッチング教材）
//
// 選んだ答えの記録（logEvent の matching）と、正誤ののち次の問題へ進む流れは
// 前のまま。効果測定の手順（content.js の evaluationTasks）がこの画面を使うため。
// 見た目と言葉だけを利用者向けにした（docs/design-renewal-2026-09-25.md §3.14）。
// =====================================================================

import { matchingTasks } from "../content.js";
import { learnLabel, learnLang, matchingPrompt } from "../learnText.js";
import { LEARN_PICTURES } from "../art/hakkiriArt.js";
import { rubyToHtml } from "../i18n.js";
import { escapeHtml } from "../utils.js";

export function initMatching(ctx) {
  const { state, elements, save, logEvent, voiceFeedback, playTone, scan } = ctx;

  // 表記が日本語でないときは、問いと札の字・声を その言語にする（learnText.js）。
  // 記録（logEvent の label）と正解の判定は、日本語の label のまま。
  const lang = () => learnLang(ctx.textMode?.());
  const shown = (label) => learnLabel(label, lang());

  function render() {
    const task = matchingTasks[state.matchingIndex % matchingTasks.length];
    const prompt = matchingPrompt(task, lang());
    elements.matchingPrompt.innerHTML = prompt ? escapeHtml(prompt) : rubyToHtml(task.promptRuby || task.prompt);
    elements.matchingGrid.innerHTML = "";
    task.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "match-card";
      button.type = "button";
      button.dataset.scan = "";
      const picture = LEARN_PICTURES[option.label];
      const art = picture
        ? `<svg class="match-picture" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${picture}</svg>`
        : `<span class="shape ${option.visual}"></span>`;
      button.innerHTML = `${art}<strong>${escapeHtml(shown(option.label))}</strong>`;
      button.addEventListener("click", () => choose(option.label));
      elements.matchingGrid.append(button);
    });
  }

  /** 選択肢を選んだときの判定・記録・次の問題への遷移 */
  function choose(answer) {
    const task = matchingTasks[state.matchingIndex % matchingTasks.length];
    const correct = answer === task.answer;
    playTone(correct ? 700 : 230);
    // 間違えても へこませない（打ち合わせ §1.5「あっさり次へ」）。
    voiceFeedback(
      correct ? ctx.t("learn.correct") : ctx.t("learn.tryNext"),
      `${correct ? ctx.t("learn.correct") : ctx.t("learn.tryNext")} ${shown(answer)}`
    );
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
