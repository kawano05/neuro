// =====================================================================
// views/settings.js — 設定画面（走査間隔・音・表示の設定）
// =====================================================================

import { cranePresets } from "../content.js";
import { isMeasurementMode, resolveDifficultyMode } from "../difficultyMode.js";
import { resolveTextMode } from "../i18n.js";
import { evaluateReadiness } from "../readinessCheck.js";

export function initSettings(ctx) {
  const { state, elements, save, scan, announce, logEvent } = ctx;

  // UFOキャッチャーの難易度。設定側が null のあいだは cranePresets の値を
  // 使うので、スライダーにもその既定値を映す（games/crane.js の
  // resolveCraneConfig と同じ優先順位）。
  const craneSliders = [
    {
      key: "craneSweepMs",
      input: elements.craneSweepMs,
      output: elements.craneSweepMsValue,
      fallback: cranePresets.sweepMs,
      format: (value) => `${value}ms`,
    },
    {
      key: "craneToleranceR",
      input: elements.craneToleranceR,
      output: elements.craneToleranceRValue,
      fallback: cranePresets.toleranceR,
      format: (value) => String(value),
    },
    {
      key: "craneTargetTrials",
      input: elements.craneTargetTrials,
      output: elements.craneTargetTrialsValue,
      fallback: cranePresets.targetTrials,
      format: (value) => String(value),
    },
  ];

  // リズム系の難易度。値を持たない（null）＝「あそびごとの既定を使う」を
  // 選択肢として表せる必要があるのでプルダウンにしてある。空文字が null。
  const rhythmChoices = [
    { key: "rhythmBpm", select: elements.rhythmBpm },
    { key: "targetBeats", select: elements.rhythmTargetBeats },
  ];

  /** 設定UIへ現在値を反映する */
  function render() {
    const settings = state.settings;
    rhythmChoices.forEach(({ key, select }) => {
      select.value = settings[key] === null ? "" : String(settings[key]);
    });
    elements.scanInterval.value = settings.scanInterval;
    elements.scanIntervalValue.value = `${settings.scanInterval}ms`;
    craneSliders.forEach(({ key, input, output, fallback, format }) => {
      const value = settings[key] ?? fallback;
      input.value = value;
      output.value = format(value);
    });
    elements.autoScan.checked = settings.autoScan;
    elements.speechEnabled.checked = settings.speechEnabled;
    elements.soundEnabled.checked = settings.soundEnabled;
    elements.largeText.checked = settings.largeText;
    elements.highContrast.checked = settings.highContrast;
    elements.hideVisualTasks.checked = settings.hideVisualTasks;
    elements.researcherMode.checked = settings.researcherMode;
    elements.visualGuidance.checked = settings.visualGuidance;
    elements.craneAudioGuidance.checked = settings.craneAudioGuidance;
    elements.difficultyMode.value = resolveDifficultyMode(settings);
    elements.textMode.value = resolveTextMode(settings);
    applyDifficultyMode();
  }

  /**
   * そくていの回では、むずかしさのつまみを無効にして理由を出す。
   *
   * 値そのものは protocol 側が優先するので（src/lib/difficultyMode.js）、
   * つまみを触れても効かない。効かない操作子を黙って置いておくのは、この
   * アプリが何度も直してきた「動くが伝わらない」欠陥そのものなので、
   * 触れないことと、その理由を同時に見せる。
   *
   * 走査対象からも外す。効かない操作子を走査の輪に残すと、利用者が
   * そこで止まって押しても何も起きない。
   */
  function applyDifficultyMode() {
    const measuring = isMeasurementMode(state.settings);
    elements.measureModeNotice.hidden = !measuring;
    const locked = [
      elements.rhythmBpm,
      elements.rhythmTargetBeats,
      elements.visualGuidance,
      elements.craneSweepMs,
      elements.craneToleranceR,
      elements.craneTargetTrials,
      elements.craneAudioGuidance,
    ];
    locked.forEach((control) => {
      if (!control) return;
      control.disabled = measuring;
      control.setAttribute("aria-disabled", String(measuring));
      const row = control.closest(".setting-row");
      if (row) row.classList.toggle("is-protocol-locked", measuring);
      if (measuring) delete control.dataset.scan;
      else control.dataset.scan = "";
    });
    renderReadiness(measuring);
    updateMeasureTabState(measuring);
  }

  /**
   * 「そくてい」タブに、いま測定の回であることを出す。
   *
   * 測定条件は「そくてい」タブの中にあるので、別の面を見ているあいだは
   * 状態が見えない。畳めるもの（面を分けてよいもの）と、面をまたいで
   * 伝えねばならないものは別——支援者が昨日の設定のまま測ってしまう。
   */
  function updateMeasureTabState(measuring) {
    const tab = (elements.settingsTabs || []).find(
      (item) => item.dataset.settingsTab === "measure"
    );
    if (!tab) return;
    tab.classList.toggle("is-measuring", measuring);
    // 印だけで意味を運ばない（色覚・読み上げ）。読み上げ名にも出す。
    tab.setAttribute("aria-label", measuring ? "そくてい（いまは測定の回）" : "そくてい");
  }

  /**
   * そくていに入る前の成立確認（src/lib/readinessCheck.js）を描く。
   *
   * 測定を止めない。止めるかどうかは支援者と研究者の判断で、アプリが決める
   * ことではない——代わりに「何が確かめられていないか」をその場で出し、
   * 通っていない状態で測った回には readiness="overridden" を残す
   * （測定条件は禁止せず記録する、という全体の方針）。
   *
   * 走査対象にはしない。利用者が選ぶものではなく、支援者が読むものなので、
   * 走査の輪に入れると押しても何も起きない項目が増えるだけになる。
   */
  function renderReadiness(measuring) {
    const box = elements.readinessCheck;
    if (!box) return;
    // れんしゅうの回には関係がない。常設すると設定画面が長くなるだけ。
    box.hidden = !measuring;
    if (!measuring) return;

    const { checks, allMet } = evaluateReadiness(
      state.sessions || [],
      state.evaluation?.participantId || ""
    );
    elements.readinessLead.textContent = allMet
      ? "3つとも練習の記録から確認できています。"
      : "確認できていない項目があります。このまま測ることもできますが、その回の記録には「成立確認なし」が残ります。";
    elements.readinessLead.classList.toggle("is-unmet", !allMet);

    elements.readinessList.innerHTML = "";
    checks.forEach((check) => {
      const item = document.createElement("li");
      item.className = `readiness-item ${check.met ? "is-met" : "is-unmet"}`;
      const icon = document.createElement("i");
      // アイコンだけで意味を運ばない（色覚・読み上げ）。文言側にも理由を出す。
      icon.className = check.met ? "fa-solid fa-circle-check" : "fa-regular fa-circle";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "readiness-label";
      label.textContent = check.met ? check.label : `${check.label}（${check.reason}）`;
      item.append(icon, label);
      elements.readinessList.append(item);
    });
  }

  /** body へ表示系クラス（大きい文字・高コントラスト・研究者モード）を反映する */
  function applyClasses() {
    document.body.classList.toggle("large-text", state.settings.largeText);
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
    document.body.classList.toggle("researcher-mode", state.settings.researcherMode);

    // ルート（html）にも付ける。
    //
    // 文字の拡大は rem の基準を動かす必要があるので html に当てたいが、
    // `:root:has(body.large-text)` だと :has() を持たない環境（Safari 15.4
    // より前）で**黙って効かなくなる**。効かないことに気づけない設定は、
    // 無いのと同じか、それより悪い（支援者は入れたつもりでいる）。
    // クラスを直接付ければ、その依存が消える。
    //
    // 表記がルビかどうかも同じ理由でクラスにする。ルビは行の高さを増やすので、
    // 「ルビが乗っている行だけ広げる」を :has(ruby) でやっていたが、これも
    // 効かない環境では行が詰まってふりがなが上の行と重なる。
    const root = document.documentElement;
    root.classList.toggle("large-text", state.settings.largeText);
    root.classList.toggle("text-ruby", resolveTextMode(state.settings) === "ruby");
  }

  elements.scanInterval.addEventListener("input", (event) => {
    state.settings.scanInterval = Number(event.target.value);
    elements.scanIntervalValue.value = `${state.settings.scanInterval}ms`;
    save();
    if (scan.isRunning()) scan.start();
  });

  rhythmChoices.forEach(({ key, select }) => {
    select.addEventListener("change", () => {
      // 空文字は「あそびごとの既定」。null で保存すると games/rhythm.js の
      // resolveParams が rhythmPresets 側を使う。
      state.settings[key] = select.value === "" ? null : Number(select.value);
      save();
    });
  });

  craneSliders.forEach(({ key, input, output, format }) => {
    input.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.settings[key] = value;
      output.value = format(value);
      save();
    });
  });

  [
    ["autoScan", elements.autoScan],
    ["speechEnabled", elements.speechEnabled],
    ["soundEnabled", elements.soundEnabled],
    ["largeText", elements.largeText],
    ["highContrast", elements.highContrast],
    ["hideVisualTasks", elements.hideVisualTasks],
    ["researcherMode", elements.researcherMode],
    ["visualGuidance", elements.visualGuidance],
    ["craneAudioGuidance", elements.craneAudioGuidance],
  ].forEach(([key, element]) => {
    element.addEventListener("change", () => {
      state.settings[key] = element.checked;
      save();
      applyClasses();
      if (key === "autoScan") {
        // restartIfNeeded() はON時だけ再始動する。OFFへ切り替えた
        // ときは既存の interval を明示的に止める必要がある。
        if (element.checked) scan.restartIfNeeded();
        else scan.stop();
      }
      // researcherMode はタブの表示/非表示を切り替えるため、走査対象の再収集が要る。
      if (key === "researcherMode") scan.restartIfNeeded();
      if (key === "hideVisualTasks") {
        ctx.views.home.render();
        scan.restartIfNeeded();
      }
    });
  });

  elements.difficultyMode.addEventListener("change", () => {
    state.settings.difficultyMode = elements.difficultyMode.value;
    save();
    applyDifficultyMode();
    // 走査対象が増減する（そくていではむずかしさのつまみが輪から外れる）。
    scan.restartIfNeeded();
    announce(
      isMeasurementMode(state.settings)
        ? "そくていの回にしました。むずかしさは固定されます"
        : "れんしゅうの回にしました。むずかしさを調整できます"
    );
    logEvent({
      type: "measurement",
      label: `難易度モードを ${state.settings.difficultyMode} に変更`,
      skipEvaluation: true,
    });
  });

  elements.textMode.addEventListener("change", () => {
    state.settings.textMode = elements.textMode.value;
    save();
    // 利用者の世界の文言が全部変わるので、ホームを描き直す。
    // 表記は定数として持てない——描画のたびに引き直す必要がある。
    ctx.views.home.render();
    scan.restartIfNeeded();
    announce("文字づかいを変えました");
  });

  /**
   * 設定のタブを切り替える。
   *
   * 面を hidden にするだけ。中の操作子は走査の輪から自動的に外れる
   * （scan.js は [data-scan] を rect.width > 0 で絞るので、hidden の中は
   * 対象外になる）——「見えていないのに走査で止まる」を作らない。
   *
   * どのタブを開いていたかは保存しない。設定を開くたび「そうさ」から
   * 始まるほうが、いちばんよく使う面が毎回すぐ出る。
   */
  function showSettingsTab(name) {
    (elements.settingsPanels || []).forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== name;
    });
    (elements.settingsTabs || []).forEach((tab) => {
      const active = tab.dataset.settingsTab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("is-active", active);
    });
    // タブを替えると輪の長さが変わる。走査中に切り替えても現在位置が
    // 消えた面に取り残されないよう、refresh を明示的に呼ぶ。
    scan.refresh();
  }

  (elements.settingsTabs || []).forEach((tab) => {
    tab.addEventListener("click", () => {
      showSettingsTab(tab.dataset.settingsTab);
      announce(`${tab.textContent.trim()}の設定`);
    });
  });

  elements.startCalibration.addEventListener("click", () => {
    ctx.gameHost.launch("calibration");
  });

  return { render, applyClasses };
}
