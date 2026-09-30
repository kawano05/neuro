// =====================================================================
// views/settings.js — 設定画面（走査間隔・音・表示の設定）
// =====================================================================

import { cranePresets, slotPresets } from "../content.js";
import { resolveTextMode } from "../i18n.js";
import { SOUND_CREDITS } from "../soundCredits.js";

/**
 * ミリ秒を「秒」で見せる（1600 → 1.6秒、220 → 0.22秒）。打ち合わせで設定の言葉を
 * 「小学校高学年が読んで分かる」ようにと言われた（docs/design-renewal-2026-09-25.md
 * §1.8）。「ms」はその外にある。保存する値はミリ秒のまま。
 */
export function formatSeconds(ms) {
  return `${Number((ms / 1000).toFixed(2))}秒`;
}

/** 音の素材のクレジットを描く。中身は固定の表なので、字はそのまま入れる。 */
export function renderSoundCredits(listEl, { links = true } = {}) {
  if (!listEl) return;
  listEl.replaceChildren(
    ...SOUND_CREDITS.map((credit) => {
      const item = document.createElement("li");
      const use = document.createElement("strong");
      use.textContent = credit.use;
      const line = document.createElement("span");
      line.textContent = `「${credit.title}」 ${credit.author}。${credit.changes}。 `;
      // CC BY はライセンスの場所（URL）も示すのが条件。
      const address = (text, href) => {
        const node = links ? document.createElement("a") : document.createElement("span");
        node.textContent = text;
        if (links) {
          node.href = href;
          node.target = "_blank";
          node.rel = "noopener";
        }
        return node;
      };
      item.append(
        use,
        line,
        address(credit.source, credit.source),
        document.createTextNode(" ／ "),
        address(links ? credit.license : `${credit.license} ${credit.licenseUrl}`, credit.licenseUrl)
      );
      return item;
    })
  );
}

export function initSettings(ctx) {
  const { state, elements, save, scan, announce, audio } = ctx;

  // 印刷用の説明書（public/guide.html）へのリンクは、iPad のアプリ版では隠す。
  // アプリの中から別の画面を開けず、開けても戻る手段が無いため。ウェブ版だけ。
  const guidePrint = document.querySelector("#settingsGuidePrint");
  if (guidePrint && globalThis.Capacitor?.isNativePlatform?.()) guidePrint.hidden = true;

  // 音の素材のクレジット（src/lib/soundCredits.js）。アプリ版では、上の説明書と
  // 同じ理由でリンクにしない（アドレスは字で出す）。
  renderSoundCredits(document.querySelector("#soundCreditsList"), {
    links: !globalThis.Capacitor?.isNativePlatform?.(),
  });

  // UFOキャッチャーの難易度。設定側が null のあいだは cranePresets の値を
  // 使うので、スライダーにもその既定値を映す（games/crane.js の
  // resolveCraneConfig と同じ優先順位）。
  const craneSliders = [
    {
      key: "craneSweepMs",
      input: elements.craneSweepMs,
      output: elements.craneSweepMsValue,
      fallback: cranePresets.sweepMs,
      format: formatSeconds,
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

  const slotSliders = [
    {
      key: "slotCycleMs",
      input: elements.slotCycleMs,
      output: elements.slotCycleMsValue,
      fallback: slotPresets["slot-l1"].cycleMs,
      format: formatSeconds,
    },
    {
      key: "slotToleranceMs",
      input: elements.slotToleranceMs,
      output: elements.slotToleranceMsValue,
      fallback: slotPresets["slot-l1"].toleranceMs,
      format: formatSeconds,
    },
    {
      key: "slotL1Rounds",
      input: elements.slotL1Rounds,
      output: elements.slotL1RoundsValue,
      fallback: slotPresets["slot-l1"].rounds,
      format: String,
    },
    {
      key: "slotL2Rounds",
      input: elements.slotL2Rounds,
      output: elements.slotL2RoundsValue,
      fallback: slotPresets["slot-l2"].rounds,
      format: String,
    },
  ];
  const difficultySliders = [...slotSliders, ...craneSliders];

  // リズム系の難易度。値を持たない（null）＝「あそびごとの既定を使う」を
  // 選択肢として表せる必要があるのでプルダウンにしてある。空文字が null。
  const rhythmChoices = [
    { key: "rhythmBpm", select: elements.rhythmBpm },
    { key: "targetBeats", select: elements.rhythmTargetBeats },
    // さかなつりの、アタリが続く長さ（空文字は既定の2秒）。
    { key: "fishingLimitMs", select: elements.fishingLimitMs },
  ].filter(({ select }) => select);

  /** 設定UIへ現在値を反映する */
  function render() {
    const settings = state.settings;
    rhythmChoices.forEach(({ key, select }) => {
      select.value = settings[key] === null ? "" : String(settings[key]);
    });
    elements.scanInterval.value = settings.scanInterval;
    elements.scanIntervalValue.value = formatSeconds(settings.scanInterval);
    difficultySliders.forEach(({ key, input, output, fallback, format }) => {
      const value = settings[key] ?? fallback;
      input.value = value;
      output.value = format(value);
    });
    elements.switchControlMode.checked = settings.switchControlMode;
    elements.autoScan.checked = settings.autoScan;
    elements.showScreenSwitch.checked = settings.showScreenSwitch;
    if (elements.scanFeedback) elements.scanFeedback.value = settings.scanFeedback;
    if (elements.fxLevel) elements.fxLevel.value = settings.fxLevel;
    elements.speechEnabled.checked = settings.speechEnabled;
    elements.speechVolume.value = settings.speechVolume;
    elements.speechVolumeValue.value = `${Math.round(settings.speechVolume * 100)}%`;
    if (elements.speechVoice) elements.speechVoice.value = settings.speechVoice;
    elements.soundEnabled.checked = settings.soundEnabled;
    elements.largeText.checked = settings.largeText;
    elements.highContrast.checked = settings.highContrast;
    elements.hideVisualTasks.checked = settings.hideVisualTasks;
    elements.visualGuidance.checked = settings.visualGuidance;
    elements.craneAudioGuidance.checked = settings.craneAudioGuidance;
    elements.textMode.value = resolveTextMode(settings);
    applySwitchControlMode();
    applySpeechSettings();
  }

  /** 使えない操作子を無効化し、自前走査の輪からも外す。 */
  function setControlAvailable(control, available) {
    if (!control) return;
    control.disabled = !available;
    control.setAttribute("aria-disabled", String(!available));
    const row = control.closest(".setting-row");
    if (row) row.classList.toggle("is-setting-disabled", !available);
  }

  /** iPad Switch Controlへ委譲中は自前走査の設定自体を操作不能にする。 */
  function applySwitchControlMode() {
    const delegated = Boolean(state.settings.switchControlMode);
    elements.switchControlModeNotice.hidden = !delegated;
    setControlAvailable(elements.scanInterval, !delegated);
    setControlAvailable(elements.autoScan, !delegated);
  }

  /** アプリTTSがOFFなら、効かない音量つまみ・声の選択を走査対象に残さない。 */
  function applySpeechSettings() {
    setControlAvailable(elements.speechVolume, Boolean(state.settings.speechEnabled));
    setControlAvailable(elements.speechVoice, Boolean(state.settings.speechEnabled));
  }

  /** body へ表示系クラス（大きい文字・高コントラスト など）を反映する */
  function applyClasses() {
    document.body.classList.toggle("large-text", state.settings.largeText);
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
    document.body.classList.toggle("switch-control-mode", state.settings.switchControlMode);
    // 利用者の画面に「おす」ボタンを出すか（theme-hakkiri.css が見る）。
    document.body.classList.toggle("screen-switch-on", Boolean(state.settings.showScreenSwitch));

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
    if (state.settings.switchControlMode) return;
    state.settings.scanInterval = Number(event.target.value);
    elements.scanIntervalValue.value = formatSeconds(state.settings.scanInterval);
    save();
    if (scan.isRunning()) scan.start();
  });

  elements.speechVolume.addEventListener("input", (event) => {
    state.settings.speechVolume = Number(event.target.value);
    elements.speechVolumeValue.value = `${Math.round(state.settings.speechVolume * 100)}%`;
    save();
  });

  // 読み上げの声を替えたら、その声で一言読む（支援者が聞いて選べるように）。
  elements.speechVoice?.addEventListener("change", () => {
    state.settings.speechVoice = elements.speechVoice.value === "device" ? "device" : "app";
    save();
    audio.prefetchVoice?.();
    audio.speak(ctx.t("color.voice.cheer"));
  });

  elements.switchControlMode.addEventListener("change", () => {
    const delegated = elements.switchControlMode.checked;
    state.settings.switchControlMode = delegated;
    if (delegated) {
      // 二重走査を保存状態としても許さない。TTSはOS読み上げとの比較を
      // 始められるよう、モードを有効にした時点でいったんOFFにする。
      state.settings.autoScan = false;
      state.settings.speechEnabled = false;
      audio.stopSpeech();
    }
    save();
    render();
    applyClasses();
    scan.stop(true);
    scan.refresh();
    announce(
      delegated
        ? "iPad のスイッチコントロールで選ぶようにしました。このアプリの黄色い枠と読み上げは止めました"
        : "iPad のスイッチコントロールを使うのをやめました。黄色い枠は止まったままです"
    );
  });

  rhythmChoices.forEach(({ key, select }) => {
    select.addEventListener("change", () => {
      // 空文字は「あそびごとの既定」。null で保存すると games/rhythm.js の
      // resolveParams が rhythmPresets 側を使う。
      state.settings[key] = select.value === "" ? null : Number(select.value);
      save();
    });
  });

  difficultySliders.forEach(({ key, input, output, format }) => {
    input.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      state.settings[key] = value;
      output.value = format(value);
      save();
    });
  });

  [
    ["autoScan", elements.autoScan],
    ["showScreenSwitch", elements.showScreenSwitch],
    ["speechEnabled", elements.speechEnabled],
    ["soundEnabled", elements.soundEnabled],
    ["largeText", elements.largeText],
    ["highContrast", elements.highContrast],
    ["hideVisualTasks", elements.hideVisualTasks],
    ["visualGuidance", elements.visualGuidance],
    ["craneAudioGuidance", elements.craneAudioGuidance],
  ].forEach(([key, element]) => {
    element.addEventListener("change", () => {
      state.settings[key] = element.checked;
      save();
      applyClasses();
      if (key === "autoScan") {
        if (state.settings.switchControlMode) {
          state.settings.autoScan = false;
          element.checked = false;
          save();
          scan.stop(true);
          return;
        }
        // restartIfNeeded() はON時だけ再始動する。OFFへ切り替えた
        // ときは既存の interval を明示的に止める必要がある。
        if (element.checked) scan.restartIfNeeded();
        else scan.stop(true);
      }
      if (key === "speechEnabled") {
        if (!element.checked) audio.stopSpeech();
        applySpeechSettings();
        scan.refresh();
      }
      if (key === "hideVisualTasks") {
        ctx.views.home.render();
        scan.restartIfNeeded();
      }
    });
  });

  elements.scanFeedback?.addEventListener("change", () => {
    state.settings.scanFeedback = elements.scanFeedback.value;
    save();
    announce("枠が動いたときの音を変えました");
  });

  elements.fxLevel?.addEventListener("change", () => {
    state.settings.fxLevel = elements.fxLevel.value;
    save();
    announce("演出の強さを変えました");
    // 選んだ強さを、その場で小さく見せる（設定の面の真ん中で星がはじける）。
    ctx.fx?.pressRing(elements.fxLevel, { color: "#FFC83D" });
    ctx.fx?.engine.burst({
      ...ctx.fx.engine.pointOf(elements.fxLevel),
      count: 12,
      shapes: ["sparkle", "star"],
      colors: ["#FFC83D", "#4DC4FF", "#FFFFFF"],
      gravity: 120,
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
   * どのタブを開いていたかは保存しない。設定を開くたび「スイッチ」から
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

  return { render, applyClasses };
}
