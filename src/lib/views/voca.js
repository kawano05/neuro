// =====================================================================
// views/voca.js — 「ことばで 伝える」（旧 定型句VOCA）
//
// 選んだことばの記録（logEvent の phrase）は元の文字のまま（効果測定の手順
// 「VOCAで『痛いです』を選択」がこの名前で数えるため）。画面に出すときだけ、
// ふりがなを付ける（content.js の PHRASE_RUBY）。
//
// 打合せ要件メモ: 「はい」「いいえ」をタイミングで選ばせる機能
// （西村さんの強い要望）はこのビューの発展形として実装候補。
// =====================================================================

import { PHRASE_RUBY, phraseCategories } from "../content.js";
import { rubyToHtml } from "../i18n.js";

/** 画面に出す形（ふりがな付き）。無いものはそのまま。 */
const shown = (text) => rubyToHtml(PHRASE_RUBY[text] || text);

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
      button.innerHTML = shown(category);
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
    if (state.currentPhrase) elements.currentPhrase.innerHTML = shown(state.currentPhrase);
    else elements.currentPhrase.innerHTML = ctx.tHtml("learn.nothingYet");
    elements.phraseGrid.innerHTML = "";
    phraseCategories[state.currentCategory].forEach((phrase) => {
      const button = document.createElement("button");
      button.className = "phrase-button";
      button.type = "button";
      button.dataset.scan = "";
      button.innerHTML = shown(phrase);
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
