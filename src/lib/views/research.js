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
import { summariseOffsetDistribution } from "../offsetDistribution.js";
import { gameModules } from "../games/registry.js";
import { escapeHtml } from "../utils.js";

/** ゲームIDを支援者に読める名前へ。未知のIDはそのまま出す。 */
function gameTitle(gameId) {
  return gameModules.find((game) => game.id === gameId)?.title ?? gameId;
}

/** 符号つきms。ずれは向きが意味を持つので符号を落とさない。 */
function signedMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return `${rounded >= 0 ? "+" : ""}${rounded}ms`;
}

function msLabel(value) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}ms` : "--";
}

/**
 * オフセット分布のヒストグラム。
 *
 * 条件ごとに別の系列として重ねる。「手がかりあり」の回は聴覚キューだけへの
 * 同期ではないので、同じ山に混ぜてはいけない。片方しかデータが無いときは
 * その系列だけを描く（凡例も出さない——常に2つ出すと、0件の条件が
 * 「測ったが0だった」ように読める）。
 */
function renderDistribution(summary) {
  const scale = summary.maxCount || 1;
  const columns = summary.bins
    .map((bin) => {
      // 高さ0の列も枠として残す。抜けていると、そこに試行が無いのか
      // ビン自体が無いのかが読めない。
      const plainHeight = (bin.plain / scale) * 100;
      const guidedHeight = (bin.guided / scale) * 100;
      const title = `${signedMs(bin.from)}〜${signedMs(bin.to)}: 手がかりなし ${bin.plain} / あり ${bin.guided}`;
      return `
        <div class="histogram-column" title="${escapeHtml(title)}">
          <span class="histogram-bar is-plain" style="height:${plainHeight.toFixed(2)}%"></span>
          <span class="histogram-bar is-guided" style="height:${guidedHeight.toFixed(2)}%"></span>
        </div>
      `;
    })
    .join("");

  const series = [
    { key: "plain", label: "手がかりなし（測定）", stats: summary.plain },
    { key: "guided", label: "手がかりあり（練習）", stats: summary.guided },
  ]
    .filter((item) => item.stats.n > 0)
    .map(
      (item) => `
        <div class="histogram-legend-item">
          <span class="histogram-swatch is-${item.key}"></span>
          <div>
            <strong>${escapeHtml(item.label)}</strong>
            <small>
              ${item.stats.n}試行 / 平均 ${signedMs(item.stats.meanMs)} / SD ${msLabel(item.stats.sdMs)}
            </small>
          </div>
        </div>
      `
    )
    .join("");

  // どの母集団の図なのかを見出しに出す。以前は課題の種類もテンポも参加者も
  // ひとつの山に混ぜていたので、山の形に意味が無かった——cued（拍ごとに
  // 予告がある）と continuous（連続する拍）では課題そのものが違うし、
  // テンポが違えば拍間隔＝要求される精度が違う。
  const scope = [
    gameTitle(summary.gameId),
    `テンポ ${summary.bpm}`,
    summary.participantId ? `参加者 ${summary.participantId}` : "参加者ID なし",
  ].join(" / ");

  return `
    <div class="histogram">
      <p class="histogram-scope">${escapeHtml(scope)}</p>
      <div class="histogram-plot" role="img"
        aria-label="入力オフセットの分布。手がかりなし ${summary.plain.n}試行、手がかりあり ${summary.guided.n}試行。">
        <span class="histogram-zero"></span>
        ${columns}
      </div>
      <div class="histogram-axis">
        <span>${signedMs(-summary.rangeMs)}（はやい）</span>
        <span>0</span>
        <span>${signedMs(summary.rangeMs)}（おそい）</span>
      </div>
      <div class="histogram-legend">${series}</div>
    </div>
  `;
}

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
    if (elements.offsetDistribution) {
      // 課題×テンポ×参加者ごとに図を分ける。母集団の違うものを1つの山に
      // まとめると、山の形が何を表しているのか言えなくなる。
      const groups = summariseOffsetDistribution(state.sessions);
      elements.offsetDistribution.innerHTML = groups.length
        ? groups.map(renderDistribution).join("")
        : `<p class="panel-note">
             まだ記録がありません。リズムの課題を1回 最後まで終えると、ここに分布が出ます。
           </p>`;
    }
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
