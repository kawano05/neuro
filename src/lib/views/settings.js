// =====================================================================
// views/settings.js — 項目定義から値を描画・保存する支援者設定
// UIの型・キーは settingsFields.js と共有。開閉では値を変えない。
// 保存・測定条件の解決は従来のまま（docs/settings-simple-2026-09-30.md）。
//
// 設定画面は支援者の世界なので、走査（黄色い枠）はここでは動かない（src/lib/viewWorld.js。
// scan.js が支援者の画面では輪を空にする）。操作はタップとキーボードだけ。
// 走査の設定を変えても、ここで走査を始め直さない——ホームへ戻ったときに scan.js が読む。
// =====================================================================

import {
  SETTINGS_FIELDS,
  describedByIds,
  fieldValue,
  formatFieldValue,
  readFieldValue,
  unavailableReason,
} from "../settingsFields.js";
import { isMeasurementMode } from "../difficultyMode.js";
import { resolveTextMode } from "../i18n.js";
import { evaluateReadiness } from "../readinessCheck.js";
import { SOUND_CREDITS } from "../soundCredits.js";

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
  const { state, elements, save, scan, announce, logEvent, audio } = ctx;

  // 印刷用の説明書（public/guide.html）へのリンクは、iPad のアプリ版では隠す。
  // アプリの中から別の画面を開けず、開けても戻る手段が無いため。ウェブ版だけ。
  if (elements.settingsGuidePrint && globalThis.Capacitor?.isNativePlatform?.()) {
    elements.settingsGuidePrint.hidden = true;
  }

  // 音の素材のクレジット（src/lib/soundCredits.js）。アプリ版では、上の説明書と
  // 同じ理由でリンクにしない（アドレスは字で出す）。
  renderSoundCredits(elements.soundCreditsList, {
    links: !globalThis.Capacitor?.isNativePlatform?.(),
  });

  // 同じ定義からUIと入力配線を作り、手書きの型・キーの重複を持たない。
  const fields = SETTINGS_FIELDS.map(field => ({
    ...field,
    control: elements[field.id],
    output: elements[`${field.id}Value`],
    // 選んだものの説明（雰囲気）。field.description は説明文を作る関数。
    descriptionOutput: elements[`${field.id}Description`],
    reasonOutput: elements[`${field.id}Reason`],
  }));

  /**
   * つまみの値を字で出す。画面の数字と読み上げ（aria-valuetext）に同じ文を使う。
   * aria-valuetext が無いと、VoiceOver は枠の速さを「1600」と生の値で読む。
   */
  function showRangeValue(field, value) {
    if (!field.output) return;
    const text = formatFieldValue(field, value);
    field.output.value = text;
    field.control.setAttribute("aria-valuetext", text);
  }

  function render() {
    fields.forEach(field => {
      const value = fieldValue(field, state.settings);
      if (field.type === "checkbox") field.control.checked = value;
      else field.control.value = value === null ? "" : String(value);
      showRangeValue(field, value);
      if (field.description) field.descriptionOutput.textContent = field.description(value);
    });
    applyAvailability();
  }

  /**
   * いま変えられない項目を使えなくし、その理由を行に出して読み上げにも渡す（ただ1つの道）。
   *
   * 理由は settingsFields.js の unavailableReason が決める（そくていで固定・iPad の
   * スイッチコントロール中・読み上げがオフ）。効かない操作子を黙って置いておくのは、この
   * アプリが何度も直してきた「動くが伝わらない」欠陥そのものなので、触れないことと、その
   * 理由を同じ行で同時に見せる。まとまりの注記は、どちらの回か・何をすれば戻るかの案内。
   */
  function applyAvailability() {
    fields.forEach((field) => {
      const reason = unavailableReason(field, state.settings);
      field.control.disabled = Boolean(reason);
      field.control.setAttribute("aria-disabled", String(Boolean(reason)));
      field.control.setAttribute("aria-describedby", describedByIds(field, state.settings));
      field.control.closest(".setting-row")?.classList.toggle("is-setting-disabled", Boolean(reason));
      field.reasonOutput.textContent = reason;
      field.reasonOutput.hidden = !reason;
    });
    const measuring = isMeasurementMode(state.settings);
    elements.switchControlModeNotice.hidden = !state.settings.switchControlMode;
    elements.measureModeNotice.hidden = !measuring;
    renderReadiness(measuring);
    updateModeStatus(measuring);
  }

  // 研究欄を畳んでも、前の回から残ったそくていの回を見落とさない。
  function updateModeStatus(measuring) {
    const status = elements.settingsModeStatus;
    status.textContent = measuring
      ? "そくていの回です。遊びごとの難しさは固定です。変更は自動で保存されます。"
      : "れんしゅうの回です。変更は自動で保存されます。";
    status.classList.toggle("is-measuring", measuring);
  }

  /**
   * そくていに入る前の成立確認（src/lib/readinessCheck.js）を描く。
   *
   * 測定を止めない。止めるかどうかは支援者と研究者の判断で、アプリが決める
   * ことではない——代わりに「何が確かめられていないか」をその場で出し、
   * 通っていない状態で測った回には readiness="overridden" を残す
   * （測定条件は禁止せず記録する、という全体の方針）。
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
      ? "3つとも れんしゅうの記録から確認できています。"
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

  /** body へ表示系クラス（大きい文字・くっきり表示・スイッチコントロール・「おす」ボタン）を反映する */
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
    // 枠の状態の表示（「iPad で操作中」）を直す。走査そのものは支援者の画面では動かない。
    scan.stop(true);
    announce(
      delegated
        ? "iPad のスイッチコントロールで選ぶようにしました。このアプリの黄色い枠と読み上げは止めました"
        : "iPad のスイッチコントロールを使うのをやめました。黄色い枠は止まったままです"
    );
  });

  fields.filter(field => field.nullable || field.type === "range").forEach(field => {
    field.control.addEventListener(field.type === "range" ? "input" : "change", () => {
      if (field.id === "scanInterval" && state.settings.switchControlMode) return;
      state.settings[field.key] = readFieldValue(field, field.control);
      showRangeValue(field, state.settings[field.key]);
      save();
    });
  });

  fields.filter(field => field.type === "checkbox" && field.id !== "switchControlMode").forEach(({ key, control: element }) => {
    element.addEventListener("change", () => {
      state.settings[key] = element.checked;
      save();
      applyClasses();
      if (key === "autoScan" && state.settings.switchControlMode) {
        // 二重走査を保存状態としても許さない（操作子は使えなくしてあるが、ここでも守る）。
        state.settings.autoScan = false;
        element.checked = false;
        save();
      }
      if (key === "speechEnabled") {
        if (!element.checked) audio.stopSpeech();
        applyAvailability();
      }
      // ホームに出す遊びが変わる。走査の輪はホームへ戻ったときに作り直される。
      if (key === "hideVisualTasks") ctx.views.home.render();
    });
  });

  elements.difficultyMode.addEventListener("change", () => {
    state.settings.difficultyMode = elements.difficultyMode.value;
    save();
    applyAvailability();
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

  elements.scanFeedback?.addEventListener("change", () => {
    state.settings.scanFeedback = elements.scanFeedback.value;
    save();
    announce("枠が動いたときの音を変えました");
  });

  elements.fxLevel?.addEventListener("change", () => {
    state.settings.fxLevel = elements.fxLevel.value;
    save();
    const field = fields.find(item => item.id === "fxLevel");
    field.descriptionOutput.textContent = field.description(state.settings.fxLevel);
    ctx.fx.syncPolicy();
    // 画面の名前は「遊びの雰囲気」。読み上げだけ古い名前（演出の強さ）だった。
    announce(`遊びの雰囲気を「${elements.fxLevel.selectedOptions[0]?.textContent ?? ""}」にしました`);
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
    announce("文字づかいを変えました");
  });

  elements.startCalibration.addEventListener("click", () => {
    ctx.gameHost.launch("calibration");
  });

  return { render, applyClasses };
}
