// =====================================================================
// games/readyScreen.js — 遊ぶ前の説明の画面（レディ画面）の押し方
//
// スイッチ1つで遊ぶ人にとって、押す回数はそのまま負担になる。一方で、説明を
// 聞いている途中のひと押しで課題が始まると、何をする遊びか分からないまま合図が
// 来る（点検 U15）。両方を満たすために、ひと押しの意味を「いま声が鳴っているか」
// で決める:
//   - 読み上げが鳴っているあいだ … 声を止めるだけ（始めない）
//   - 声が止まっている（読み終えた・読み上げ OFF・止めた） … ひと押しで始まる
// 読み上げが終わるまで待てば1回、途中で押しても2回で始まる。以前（GPT の直し、
// 2026-09-30）は読み上げ ON なら必ず「説明を終わる → 始める」の2回で、短い画面では
// さらに「次の説明」を手順の数だけ押す必要があった（アームでスマホ横なら5回）。
//
// 短い画面で説明が入りきらないときは、1手順ずつ見せて一定の間隔で次へ送る。
// ページ送りは始める条件にしない（スイッチの人に「次へ」を押させないため。説明は
// 声でも全部届く）。前後のボタンは支援者のタップ用で、走査の輪には入れない。
// 走査で回るのは「はじめる」と「おわる」だけ（scan.js）。
//
// タイルを選んだ押下がそのまま跳ねて始まらないよう、開いてから・前の押下から
// READY_GUARD_MS は押下を受けない。
// =====================================================================

/** 開いた直後・前の押下の直後に、押下を受けない長さ（跳ね返りと連打）。 */
export const READY_GUARD_MS = 450;
/** 説明を1手順ずつ見せるとき、次の手順へ送る間隔。 */
export const READY_PAGE_MS = 5000;
/** 声が鳴っているかを見直す間隔（ボタンと案内の文を、ひと押しの意味に合わせる）。 */
const SPEECH_POLL_MS = 250;

export function createReadyScreen(ctx, start) {
  const { elements, scan } = ctx;
  const {
    gameReadyControls: controls,
    gameReadyStart: startButton,
    gameReadyPrevious: previousButton,
    gameReadyForward: forwardButton,
    gameReadyPage: pageLabel,
  } = elements;

  let observer = null;
  let items = [];
  let index = 0;
  let paged = false;
  let speaking = false;
  let guardUntil = 0;
  let pageTimer = null;
  let speechTimer = null;

  const isOpen = () => !controls.hidden;
  const guard = () => {
    guardUntil = performance.now() + READY_GUARD_MS;
  };

  /** 見えている手順・ページ番号・ボタンの文を、いまの状態に合わせる。 */
  function render() {
    items.forEach((item, i) => {
      item.hidden = paged && i !== index;
    });
    pageLabel.textContent = paged ? `${index + 1} / ${items.length}` : "";
    previousButton.hidden = !paged;
    forwardButton.hidden = !paged;
    setLabel(previousButton, "ready.previous");
    setLabel(forwardButton, "ready.next");
    setLabel(startButton, speaking ? "ready.stopVoice" : "ready.start");
    const instruction = elements.gameStageContent.querySelector(".game-ready-instruction");
    if (instruction) instruction.innerHTML = ctx.tHtml(speaking ? "ready.stopHint" : "ready.go");
  }

  function setLabel(button, key) {
    button.innerHTML = ctx.tHtml(key);
    button.setAttribute("aria-label", ctx.t(key));
  }

  /** 説明が入りきるかを測り、入りきらなければ1手順ずつにする。 */
  function fit() {
    const list = elements.gameStageContent.querySelector(".game-ready-steps");
    if (!list) return;
    items.forEach((item) => {
      item.hidden = false;
    });
    paged = list.scrollHeight > list.clientHeight + 1;
    if (!paged) index = 0;
    render();
    schedulePage();
  }

  function showPage(next) {
    if (!paged || !items.length) return;
    index = (next + items.length) % items.length;
    render();
  }

  /** 1手順ずつのときは、一定の間隔で次の手順へ送る（最後まで行ったら最初へ）。 */
  function schedulePage() {
    window.clearTimeout(pageTimer);
    pageTimer = null;
    if (!paged || !isOpen()) return;
    pageTimer = window.setTimeout(() => {
      showPage(index + 1);
      schedulePage();
    }, READY_PAGE_MS);
  }

  /** 声が鳴り終わったら、ボタンと案内を「始める」に戻す。 */
  function watchSpeech() {
    window.clearTimeout(speechTimer);
    speechTimer = null;
    if (!isOpen()) return;
    const now = Boolean(ctx.audio.isSpeaking?.());
    if (now !== speaking) {
      speaking = now;
      render();
    }
    if (speaking) speechTimer = window.setTimeout(watchSpeech, SPEECH_POLL_MS);
  }

  /**
   * スイッチのひと押し（走査で「はじめる」を選んだとき・走査なしで画面を押したとき）。
   * 声が鳴っていれば止めるだけ、止まっていれば始める。
   */
  function press() {
    if (!isOpen() || performance.now() < guardUntil) return;
    guard();
    if (ctx.audio.isSpeaking?.()) {
      ctx.audio.stopSpeech();
      speaking = false;
      render();
      // 声で言い直すと、また「声が鳴っている」になって始められない。文字の知らせだけにする。
      ctx.announce(ctx.t("ready.stopped"));
      return;
    }
    start();
  }

  function onButton(button, action) {
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      action();
    });
  }
  onButton(startButton, press);
  // 前後のボタンは支援者のタップ用。押したら自動の送りを始めから数え直す。
  onButton(previousButton, () => {
    showPage(index - 1);
    schedulePage();
  });
  onButton(forwardButton, () => {
    showPage(index + 1);
    schedulePage();
  });

  function close() {
    observer?.disconnect();
    observer = null;
    window.clearTimeout(pageTimer);
    window.clearTimeout(speechTimer);
    pageTimer = speechTimer = null;
    controls.hidden = true;
    elements.gameExit.removeAttribute("data-scan");
    elements.gameStage.removeAttribute("aria-describedby");
  }

  function open() {
    close();
    items = [...elements.gameStageContent.querySelectorAll(".game-ready-steps li")];
    index = 0;
    controls.hidden = false;
    guard();
    // 「おわる」も走査の輪に入れる（説明の画面から、スイッチだけで戻れるように）。
    elements.gameExit.setAttribute("data-scan", "");
    // #gameStageContent は aria-hidden なので、説明の全文を読める経路を別に残す。
    const explanation = elements.gameStageContent.querySelector(".game-ready-steps").cloneNode(true);
    explanation.querySelectorAll("rt").forEach((ruby) => ruby.remove());
    pageLabel.setAttribute("aria-label", explanation.textContent);
    elements.gameStage.setAttribute("aria-describedby", pageLabel.id);
    observer = new ResizeObserver(fit);
    observer.observe(elements.gameStageContent);
    document.fonts?.ready.then(() => {
      if (isOpen()) fit();
    });
    speaking = Boolean(ctx.audio.isSpeaking?.());
    fit();
    watchSpeech();
    scan.restartIfNeeded();
  }

  return { open, close, press, isOpen };
}
