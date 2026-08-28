// =====================================================================
// views/voca.js — 定型句VOCA画面
//
// 打合せ要件メモ: 「はい」「いいえ」をタイミングで選ばせる機能
// （西村さんの強い要望）はこのビューの発展形として実装候補。
// =====================================================================

import { phraseCategories } from "../content.js";

export function initVoca(ctx) {
  const { state, elements, save, logEvent, speak, voiceFeedback, playTone, scan } = ctx;

  /** カテゴリ行の描画 */
  function renderCategories() {
    elements.categoryRow.innerHTML = "";
    Object.keys(phraseCategories).forEach((category) => {
      const button = document.createElement("button");
      button.className = "category-button";
      button.classList.toggle("is-active", category === state.currentCategory);
      button.type = "button";
      button.dataset.scan = "";
      button.textContent = category;
      button.addEventListener("click", () => {
        state.currentCategory = category;
        save();
        renderCategories();
        renderPhrases();
        scan.restartIfNeeded();
      });
      elements.categoryRow.append(button);
    });
  }

  /** 定型句グリッドと選択中フレーズの描画 */
  function renderPhrases() {
    elements.currentPhrase.textContent = state.currentPhrase || "まだ選択されていません";
    elements.phraseGrid.innerHTML = "";
    phraseCategories[state.currentCategory].forEach((phrase) => {
      const button = document.createElement("button");
      button.className = "phrase-button";
      button.type = "button";
      button.dataset.scan = "";
      button.textContent = phrase;
      button.addEventListener("click", () => selectPhrase(phrase));
      elements.phraseGrid.append(button);
    });
  }

  /** 定型句を選択して読み上げる */
  function selectPhrase(phrase) {
    state.currentPhrase = phrase;
    playTone(560);
    voiceFeedback(phrase);
    logEvent({ type: "phrase", label: phrase });
    save();
    renderPhrases();
  }

  elements.repeatPhrase.addEventListener("click", () => {
    if (state.currentPhrase) speak(state.currentPhrase);
  });

  return {
    render() {
      renderCategories();
      renderPhrases();
    },
  };
}
