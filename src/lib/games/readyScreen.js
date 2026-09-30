// 説明の入力は課題へ渡さない。声を省略する場合も、別の押下で開始を確かめる。
export function createReadyScreen(ctx, start) {
  const { elements, state, scan } = ctx;
  const controls = document.querySelector("#gameReadyControls");
  const next = document.querySelector("#gameReadyNext");
  const page = document.querySelector("#gameReadyPage");
  const previous = document.querySelector("#gameReadyPrevious");
  let observer = null;
  let items = [];
  let index = 0;
  let paged = false;
  let confirm = false;
  let lastInput = -Infinity;

  function update() {
    items.forEach((item, i) => { item.hidden = paged && i !== index; });
    page.textContent = paged ? `${index + 1} / ${items.length}` : "";
    previous.hidden = !paged || index === 0;
    previous.innerHTML = ctx.tHtml("ready.previous");
    previous.setAttribute("aria-label", ctx.t("ready.previous"));
    const hint = paged && index < items.length - 1 ? "ready.nextHint" : confirm ? "ready.confirmHint" : "ready.go";
    elements.gameStageContent.querySelector(".game-ready-instruction").innerHTML = ctx.tHtml(hint);
    next.innerHTML = ctx.tHtml(paged && index < items.length - 1 ? "ready.next" : confirm ? "ready.confirm" : "ready.start");
    next.setAttribute("aria-label", ctx.t(paged && index < items.length - 1 ? "ready.next" : confirm ? "ready.confirm" : "ready.start"));
  }

  function fit() {
    const list = elements.gameStageContent.querySelector(".game-ready-steps");
    if (!list) return;
    items.forEach(item => { item.hidden = false; });
    paged = list.scrollHeight > list.clientHeight + 1;
    update();
  }

  function advance() {
    if (controls.hidden || performance.now() - lastInput < 450) return;
    lastInput = performance.now();
    if (paged && index < items.length - 1) {
      index += 1;
      update();
      return;
    }
    if (confirm) {
      ctx.audio.stopSpeech();
      confirm = false;
      update();
      // 説明を飛ばした1押しを、そのまま開始に転用しない。
      ctx.announce(ctx.t("ready.go"));
      return;
    }
    start();
  }

  next.addEventListener("pointerdown", event => event.stopPropagation());
  next.addEventListener("click", event => { event.stopPropagation(); advance(); });
  previous.addEventListener("pointerdown", event => event.stopPropagation());
  previous.addEventListener("click", event => {
    event.stopPropagation();
    if (performance.now()-lastInput<450 || index===0) return;
    lastInput=performance.now();
    index-=1;
    update();
  });

  function close() {
    observer?.disconnect();
    observer = null;
    controls.hidden = true;
    elements.gameExit.removeAttribute("data-scan");
    elements.gameStage.removeAttribute("aria-describedby");
  }

  function open() {
    close();
    items = [...elements.gameStageContent.querySelectorAll(".game-ready-steps li")];
    index = 0;
    confirm = Boolean(state.settings.speechEnabled);
    lastInput = -Infinity;
    controls.hidden = false;
    elements.gameExit.setAttribute("data-scan", "");
    // role=buttonの外に、説明全文のアクセシブルな経路を残す。
    const explanation=elements.gameStageContent.querySelector(".game-ready-steps").cloneNode(true);
    explanation.querySelectorAll("rt").forEach(e=>e.remove());
    page.setAttribute("aria-label", explanation.textContent);
    elements.gameStage.setAttribute("aria-describedby", "gameReadyPage");
    observer = new ResizeObserver(fit);
    observer.observe(elements.gameStageContent);
    document.fonts.ready.then(() => { if (!controls.hidden) fit(); });
    fit();
    scan.restartIfNeeded();
  }
  return { open, close, advance, isOpen: () => !controls.hidden };
}
