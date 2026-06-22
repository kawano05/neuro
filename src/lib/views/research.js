// =====================================================================
// views/research.js — neuro独自要素（実用化研究）画面
//
// 研究条件プロファイル・公開候補チェック・現場運用メモを管理し、
// 効果測定（evaluation）の条件欄・観察メモと連動する。
//
// 注意: この画面はマークアップ上は存在するが、現状タブからは到達できない
// （content.js の visibleViews 参照、既知の制約）。
// =====================================================================

import { researchConditionProfiles, readinessItems, environmentLabels } from "../content.js";
import { escapeHtml } from "../utils.js";

export function initResearch(ctx) {
  const { state, elements, save, announce, logEvent, scan } = ctx;

  /** 現在選択中の研究条件プロファイル */
  function activeProfile() {
    return (
      researchConditionProfiles.find((profile) => profile.id === state.research.conditionProfile) ||
      researchConditionProfiles[0]
    );
  }

  /** 実用化研究画面全体の描画 */
  function render() {
    if (!elements.researchProfileGrid) return;
    const profile = activeProfile();
    const environment = environmentLabels[state.research.environment] || environmentLabels.hospital;

    elements.researchProfileGrid.innerHTML = "";
    researchConditionProfiles.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "module-button condition-profile";
      button.classList.toggle("is-active", item.id === profile.id);
      button.dataset.scan = "";
      button.innerHTML = `
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(item.description)}</span>
      <small>${escapeHtml(item.focus)}</small>
    `;
      button.addEventListener("click", () => {
        state.research.conditionProfile = item.id;
        state.evaluation.condition = item.evaluationValue;
        save();
        announce(`${item.name}を効果測定の条件に設定しました`);
        render();
        ctx.views.evaluation.render();
        scan.restartIfNeeded();
      });
      elements.researchProfileGrid.append(button);
    });

    const readiness = state.research.readiness || {};
    const completed = readinessItems.filter((item) => readiness[item.id]).length;
    elements.readinessScore.textContent = `${completed}/${readinessItems.length}`;
    elements.readinessChecklist.innerHTML = "";
    readinessItems.forEach((item) => {
      const row = document.createElement("label");
      row.className = "readiness-row";

      const text = document.createElement("span");
      text.innerHTML = `<strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small>`;

      const input = document.createElement("input");
      input.type = "checkbox";
      input.role = "switch";
      input.dataset.scan = "";
      input.checked = Boolean(readiness[item.id]);
      input.addEventListener("change", () => {
        state.research.readiness[item.id] = input.checked;
        save();
        announce(`${item.label}を${input.checked ? "確認済み" : "未確認"}にしました`);
        render();
        scan.restartIfNeeded();
      });

      row.append(text, input);
      elements.readinessChecklist.append(row);
    });

    elements.researchEnvironment.value = state.research.environment;
    elements.deploymentNotes.value = state.research.deploymentNotes;
    elements.researchProtocolHint.textContent =
      `${environment}で${profile.name}を使い、${profile.focus}を観察します。` +
      "測定後はタスク完了時間、入力回数、誤選択、戻り操作、タイミングエラー、介助回数、支援者メモを比較します。";
  }

  /** 実用化研究メモを効果測定の観察メモへ反映する */
  function copyDeploymentNote() {
    const profile = activeProfile();
    const environment = environmentLabels[state.research.environment] || environmentLabels.hospital;
    const completedLabels = readinessItems
      .filter((item) => state.research.readiness[item.id])
      .map((item) => item.label)
      .join("、");
    const note = [
      `[実用化検証] 条件: ${profile.name}`,
      `場面: ${environment}`,
      `確認済み: ${completedLabels || "未確認"}`,
      state.research.deploymentNotes ? `メモ: ${state.research.deploymentNotes}` : "",
    ]
      .filter(Boolean)
      .join(" / ");

    state.evaluation.observerNotes = state.evaluation.observerNotes
      ? `${state.evaluation.observerNotes}\n${note}`
      : note;
    save();
    logEvent({ type: "measurement", label: "実用化研究メモを観察メモへ反映", skipEvaluation: true });
    ctx.views.evaluation.render();
    announce("実用化研究メモを観察メモへ反映しました");
  }

  elements.researchEnvironment.addEventListener("change", (event) => {
    state.research.environment = event.target.value;
    save();
    render();
  });
  elements.deploymentNotes.addEventListener("input", (event) => {
    state.research.deploymentNotes = event.target.value;
    save();
  });
  elements.copyDeploymentNote.addEventListener("click", copyDeploymentNote);

  return { render };
}
