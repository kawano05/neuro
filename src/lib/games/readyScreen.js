// =====================================================================
// games/readyScreen.js — 遊ぶ前の説明の画面（レディ画面）の押し方
//
// ひと押しで始まる。説明の声が鳴っていても止めて始める（声は beginSession が止める）。
// スイッチ1つで遊ぶ人にとって、押す回数はそのまま負担になる。
// 以前は「声が鳴っているあいだのひと押しは声を止めるだけ」にしていた（点検 U15、
// 2026-09-30）が、ユーザーの判断で「押したらすぐ始まる」にした（2026-10-01）。
// それより前（GPT の直し）は、読み上げ ON なら必ず「説明を終わる → 始める」の2回で、
// 短い画面ではさらに「次の説明」を手順の数だけ押す必要があった。
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
  let guardUntil = 0;
  let pageTimer = null;

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
    setLabel(startButton, "ready.start");
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

  /**
   * スイッチのひと押し（走査で「はじめる」を選んだとき・走査なしで画面を押したとき）。
   * すぐ始める（説明の声は、始める処理が止める）。
   */
  function press() {
    if (!isOpen() || performance.now() < guardUntil) return;
    guard();
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
    pageTimer = null;
    controls.hidden = true;
    elements.gameStage.removeAttribute("aria-describedby");
  }

  function open() {
    close();
    items = [...elements.gameStageContent.querySelectorAll(".game-ready-steps li")];
    index = 0;
    controls.hidden = false;
    guard();
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
    fit();
    scan.restartIfNeeded();
  }

  return { open, close, press, isOpen };
}
