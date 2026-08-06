// =====================================================================
// views/settings.js — 設定画面（走査間隔・音・表示の設定）
// =====================================================================

import { cranePresets } from "../content.js";

export function initSettings(ctx) {
  const { state, elements, save, scan } = ctx;

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
  }

  /** body へ表示系クラス（大きい文字・高コントラスト・研究者モード）を反映する */
  function applyClasses() {
    document.body.classList.toggle("large-text", state.settings.largeText);
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
    document.body.classList.toggle("researcher-mode", state.settings.researcherMode);
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

  elements.startCalibration.addEventListener("click", () => {
    ctx.gameHost.launch("calibration");
  });

  return { render, applyClasses };
}
