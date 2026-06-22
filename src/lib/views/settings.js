// =====================================================================
// views/settings.js — 設定画面（走査間隔・音・表示の設定）
// =====================================================================

export function initSettings(ctx) {
  const { state, elements, save, scan } = ctx;

  /** 設定UIへ現在値を反映する */
  function render() {
    const settings = state.settings;
    elements.scanInterval.value = settings.scanInterval;
    elements.scanIntervalValue.value = `${settings.scanInterval}ms`;
    elements.autoScan.checked = settings.autoScan;
    elements.speechEnabled.checked = settings.speechEnabled;
    elements.soundEnabled.checked = settings.soundEnabled;
    elements.largeText.checked = settings.largeText;
    elements.highContrast.checked = settings.highContrast;
  }

  /** body へ表示系クラス（大きい文字・高コントラスト）を反映する */
  function applyClasses() {
    document.body.classList.toggle("large-text", state.settings.largeText);
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
  }

  elements.scanInterval.addEventListener("input", (event) => {
    state.settings.scanInterval = Number(event.target.value);
    elements.scanIntervalValue.value = `${state.settings.scanInterval}ms`;
    save();
    if (scan.isRunning()) scan.start();
  });

  [
    ["autoScan", elements.autoScan],
    ["speechEnabled", elements.speechEnabled],
    ["soundEnabled", elements.soundEnabled],
    ["largeText", elements.largeText],
    ["highContrast", elements.highContrast],
  ].forEach(([key, element]) => {
    element.addEventListener("change", () => {
      state.settings[key] = element.checked;
      save();
      applyClasses();
      if (key === "autoScan") scan.restartIfNeeded();
    });
  });

  return { render, applyClasses };
}
