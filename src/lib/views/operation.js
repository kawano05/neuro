// =====================================================================
// views/operation.js — iOS操作訓練画面（Switch Control の模擬）
//
// 注意: この画面はマークアップ上は存在するが、現状タブからは到達できない
// （content.js の visibleViews 参照、既知の制約）。
// =====================================================================

import { operationModes, operationItemTasks, operationPointTargets } from "../content.js";
import { cloneDefaultState } from "../state.js";
import { evaluatePick, scanPercentAt } from "../games/pointing.js";

export function initOperation(ctx) {
  const { state, elements, save, announce, logEvent, voiceFeedback, playTone, scan } = ctx;

  /** 現在選択中の訓練モード */
  function activeMode() {
    return operationModes.find((mode) => mode.id === state.operation.mode) || operationModes[0];
  }

  /** 画面全体の描画（モード選択＋ステージ＋記録） */
  function render() {
    renderModes();
    renderStage();
    renderMetrics();
  }

  /** 訓練モード選択グリッドの描画 */
  function renderModes() {
    elements.operationModeGrid.innerHTML = "";
    operationModes.forEach((mode) => {
      const button = document.createElement("button");
      button.className = "module-button";
      button.classList.toggle("is-active", mode.id === state.operation.mode);
      button.type = "button";
      button.dataset.scan = "";
      button.innerHTML = `<strong>${mode.name}</strong><span>${mode.description}</span>`;
      button.addEventListener("click", () => {
        state.operation.mode = mode.id;
        state.operation.pointPhase = "x";
        state.operation.pointStartedAt = Date.now();
        state.operation.selectedX = null;
        state.operation.selectedY = null;
        state.operation.dragPhase = "start";
        save();
        render();
        scan.restartIfNeeded();
      });
      elements.operationModeGrid.append(button);
    });
  }

  /** 選択中モードに応じてステージを描画する */
  function renderStage() {
    const mode = activeMode();
    elements.operationModeTitle.textContent = `${mode.name}訓練`;
    elements.operationGuide.textContent = mode.description;
    elements.operationStage.className = `operation-stage operation-${mode.id}`;
    elements.operationStage.innerHTML = "";
    elements.operationPrimary.hidden = false;

    if (mode.id === "item") renderItemScanTraining();
    if (mode.id === "point") renderPointScanTraining();
    if (mode.id === "tap") renderTapTraining();
    if (mode.id === "drag") renderDragTraining();
  }

  /** 項目スキャン訓練ステージ */
  function renderItemScanTraining() {
    const task = operationItemTasks[state.operation.itemIndex % operationItemTasks.length];
    elements.operationPrimary.hidden = true;
    const prompt = document.createElement("p");
    prompt.className = "operation-prompt";
    prompt.textContent = task.prompt;
    const grid = document.createElement("div");
    grid.className = "operation-item-grid";
    task.options.forEach((option) => {
      const button = document.createElement("button");
      button.className = "operation-choice";
      button.type = "button";
      button.dataset.scan = "";
      button.textContent = option;
      button.addEventListener("click", () => chooseItem(option));
      grid.append(button);
    });
    elements.operationStage.append(prompt, grid);
  }

  /** ポイントスキャン訓練ステージ */
  function renderPointScanTraining() {
    const target = operationPointTargets[state.operation.pointIndex % operationPointTargets.length];
    if (!state.operation.pointStartedAt) state.operation.pointStartedAt = Date.now();
    const x = state.operation.selectedX ?? getPointScanPercent();
    const y = state.operation.selectedY ?? getPointScanPercent();
    elements.operationPrimary.textContent =
      state.operation.pointPhase === "x"
        ? "縦カーソルを止める"
        : state.operation.pointPhase === "y"
          ? "横カーソルを止める"
          : "次のポイント課題";
    elements.operationStage.innerHTML = `
    <p class="operation-prompt">${target.label}を指定してください</p>
    <div class="point-board">
      <span class="point-target" style="left:${target.x}%;top:${target.y}%"></span>
      <span class="point-line vertical" id="pointVertical" style="left:${x}%"></span>
      <span class="point-line horizontal" id="pointHorizontal" style="top:${y}%"></span>
    </div>
  `;
  }

  /** タップ訓練ステージ */
  function renderTapTraining() {
    const target = operationPointTargets[state.operation.pointIndex % operationPointTargets.length];
    elements.operationPrimary.textContent = "タップ成功として記録";
    elements.operationStage.innerHTML = `
    <p class="operation-prompt">${target.label}をタップしてください</p>
    <div class="point-board">
      <button class="tap-target" data-scan type="button" style="left:${target.x}%;top:${target.y}%">タップ</button>
    </div>
  `;
    elements.operationStage
      .querySelector(".tap-target")
      .addEventListener("click", () => completeTrial("タップ", true, 0));
  }

  /** ドラッグ訓練ステージ */
  function renderDragTraining() {
    elements.operationPrimary.textContent = state.operation.dragPhase === "start" ? "ドラッグ開始" : "目標へドロップ";
    elements.operationStage.innerHTML = `
    <p class="operation-prompt">カードを開始点から目標へ移動する想定で、2段階で入力してください</p>
    <div class="drag-board">
      <span class="drag-zone start">開始</span>
      <span class="drag-card ${state.operation.dragPhase === "end" ? "is-picked" : ""}">カード</span>
      <span class="drag-zone goal">目標</span>
    </div>
  `;
  }

  /** 試行回数・成功率・平均ズレの表示更新 */
  function renderMetrics() {
    elements.operationTrials.textContent = String(state.operation.trials);
    elements.operationSuccessRate.textContent = state.operation.trials
      ? `${Math.round((state.operation.successes / state.operation.trials) * 100)}%`
      : "--";
    if (state.operation.distances.length === 0) {
      elements.operationAverageDistance.textContent = "--";
      return;
    }
    const average =
      state.operation.distances.reduce((sum, value) => sum + value, 0) / state.operation.distances.length;
    elements.operationAverageDistance.textContent = `${Math.round(average)}px相当`;
  }

  /** 往復するポイントスキャンカーソルの現在位置（%）を返す */
  function getPointScanPercent() {
    const startedAt = state.operation.pointStartedAt || Date.now();
    const percent = scanPercentAt(Date.now() - startedAt, 1600);
    return Math.max(4, Math.min(96, Math.round(percent)));
  }

  /**
   * ポイントスキャンカーソルの位置をDOMへ反映する（200ms間隔で呼ばれる）。
   * ステージ再描画を避けるため、カーソル線の style だけを更新する。
   */
  function updatePointCursor() {
    if (state.currentView !== "operation" || state.operation.mode !== "point") return;
    const percent = getPointScanPercent();
    const vertical = document.querySelector("#pointVertical");
    const horizontal = document.querySelector("#pointHorizontal");
    if (vertical && state.operation.pointPhase === "x") vertical.style.left = `${percent}%`;
    if (horizontal && state.operation.pointPhase === "y") horizontal.style.top = `${percent}%`;
  }

  /** 項目スキャン訓練で選択肢を選んだとき */
  function chooseItem(answer) {
    const task = operationItemTasks[state.operation.itemIndex % operationItemTasks.length];
    const correct = answer === task.answer;
    completeTrial(`項目スキャン: ${answer}`, correct, null);
    state.operation.itemIndex = (state.operation.itemIndex + 1) % operationItemTasks.length;
    save();
    render();
    scan.restartIfNeeded();
  }

  /** 「訓練入力」ボタン（および走査フォールバック）の処理 */
  function handlePrimary() {
    if (state.operation.mode === "point") {
      handlePointScanInput();
    } else if (state.operation.mode === "tap") {
      completeTrial("タップ", true, 0);
      nextTarget();
    } else if (state.operation.mode === "drag") {
      handleDragInput();
    }
  }

  /** ポイントスキャン: 縦→横の順にカーソルを止め、2回目で判定する */
  function handlePointScanInput() {
    if (!state.operation.pointStartedAt) state.operation.pointStartedAt = Date.now();
    if (state.operation.pointPhase === "x") {
      state.operation.selectedX = getPointScanPercent();
      state.operation.pointPhase = "y";
      state.operation.pointStartedAt = Date.now();
      save();
      renderPointScanTraining();
      return;
    }
    if (state.operation.pointPhase === "y") {
      state.operation.selectedY = getPointScanPercent();
      const target = operationPointTargets[state.operation.pointIndex % operationPointTargets.length];
      const { distance } = evaluatePick(
        { x: state.operation.selectedX, y: state.operation.selectedY },
        { ...target, r: 16 }
      );
      completeTrial("ポイントスキャン", distance <= 16, distance * 4);
      nextTarget();
    }
  }

  /** ドラッグ: 開始→ドロップの2段階入力 */
  function handleDragInput() {
    if (state.operation.dragPhase === "start") {
      state.operation.dragPhase = "end";
      save();
      renderStage();
      return;
    }
    completeTrial("ドラッグ", true, 0);
    state.operation.dragPhase = "start";
    save();
    render();
  }

  /** 次のポイント課題へ進める（状態をリセットして再描画） */
  function nextTarget() {
    state.operation.pointIndex = (state.operation.pointIndex + 1) % operationPointTargets.length;
    state.operation.pointPhase = "x";
    state.operation.pointStartedAt = Date.now();
    state.operation.selectedX = null;
    state.operation.selectedY = null;
    state.operation.dragPhase = "start";
    save();
    render();
    scan.restartIfNeeded();
  }

  /** 試行1回の結果を記録する（成功判定・距離・音・ログ） */
  function completeTrial(label, success, distance) {
    state.operation.trials += 1;
    if (success) state.operation.successes += 1;
    if (typeof distance === "number") state.operation.distances.push(distance);
    state.operation.distances = state.operation.distances.slice(-40);
    playTone(success ? 700 : 240);
    voiceFeedback(
      success ? "成功です" : "もう一度です",
      success ? `${label}に成功しました` : `${label}に失敗しました`
    );
    logEvent({ type: "operation", label, correct: success, distance: Math.round(distance ?? 0) });
    save();
    renderMetrics();
  }

  /** 操作訓練の記録をリセットする */
  function reset() {
    state.operation = cloneDefaultState().operation;
    save();
    announce("操作訓練の記録をリセットしました");
    render();
    scan.restartIfNeeded();
  }

  elements.operationPrimary.addEventListener("click", handlePrimary);
  elements.nextOperationTarget.addEventListener("click", nextTarget);
  elements.resetOperation.addEventListener("click", reset);

  return { render, handlePrimary, updatePointCursor };
}
