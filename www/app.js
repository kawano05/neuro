const storageKey = "neuronode-prototype-state-v1";

const lessons = [
  {
    label: "入力できました",
    detail: "一入力一反応の確認です。入力のたびに表示と記録が更新されます。",
    tone: 440,
    flash: "flash-good",
  },
  {
    label: "次の画面へ",
    detail: "共有iPadで迷わないように、大きな反応領域を中心にしています。",
    tone: 520,
    flash: "flash-warn",
  },
  {
    label: "よくできました",
    detail: "SpaceまたはEnterでニューロノード入力を簡易的に再現できます。",
    tone: 660,
    flash: "flash-good",
  },
  {
    label: "もう一度",
    detail: "反応時間、入力回数、誤選択数を評価ログに残します。",
    tone: 360,
    flash: "flash-warn",
  },
];

const choiceTasks = [
  { prompt: "「はい」を選んでください", answer: "はい", options: ["はい", "いいえ", "もう一度", "休みたい"] },
  { prompt: "「痛い」を選んでください", answer: "痛い", options: ["寒い", "痛い", "水がほしい", "ありがとう"] },
  { prompt: "「姿勢を変えて」を選んでください", answer: "姿勢を変えて", options: ["姿勢を変えて", "トイレ", "眠い", "大丈夫"] },
];

const phraseCategories = {
  基本: ["はい", "いいえ", "もう一度", "わかりません", "ありがとう", "大丈夫です"],
  体調: ["痛いです", "寒いです", "暑いです", "眠いです", "休みたいです", "水がほしいです"],
  介助: ["姿勢を変えてください", "トイレに行きたいです", "吸引してください", "家族に連絡してください", "ナースコール", "待ってください"],
  気持ち: ["うれしいです", "不安です", "楽しいです", "静かにしたいです", "外に出たいです", "話したいです"],
};

const defaultState = {
  currentView: "trainer",
  lessonIndex: 0,
  choiceIndex: 0,
  hitCount: 0,
  hitTimes: [],
  currentPhrase: "",
  currentCategory: "基本",
  settings: {
    scanInterval: 1600,
    autoScan: true,
    speechEnabled: true,
    soundEnabled: true,
    largeText: true,
    highContrast: false,
  },
  logs: [],
};

let state = loadState();
let scanTargets = [];
let scanIndex = -1;
let scanTimer = null;
let audioContext;
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

const elements = {
  scanState: document.querySelector("#scanState"),
  liveRegion: document.querySelector("#liveRegion"),
  tabs: [...document.querySelectorAll(".tab")],
  views: [...document.querySelectorAll(".view")],
  reactionPad: document.querySelector("#reactionPad"),
  reactionLabel: document.querySelector("#reactionLabel"),
  lessonPrompt: document.querySelector("#lessonPrompt"),
  hitCount: document.querySelector("#hitCount"),
  averageInterval: document.querySelector("#averageInterval"),
  lastReaction: document.querySelector("#lastReaction"),
  resetTrainer: document.querySelector("#resetTrainer"),
  choicePrompt: document.querySelector("#choicePrompt"),
  choiceGrid: document.querySelector("#choiceGrid"),
  categoryRow: document.querySelector("#categoryRow"),
  phraseGrid: document.querySelector("#phraseGrid"),
  currentPhrase: document.querySelector("#currentPhrase"),
  repeatPhrase: document.querySelector("#repeatPhrase"),
  totalInputs: document.querySelector("#totalInputs"),
  accuracyRate: document.querySelector("#accuracyRate"),
  mistakeCount: document.querySelector("#mistakeCount"),
  logList: document.querySelector("#logList"),
  exportCsv: document.querySelector("#exportCsv"),
  clearLog: document.querySelector("#clearLog"),
  scanInterval: document.querySelector("#scanInterval"),
  scanIntervalValue: document.querySelector("#scanIntervalValue"),
  autoScan: document.querySelector("#autoScan"),
  speechEnabled: document.querySelector("#speechEnabled"),
  soundEnabled: document.querySelector("#soundEnabled"),
  largeText: document.querySelector("#largeText"),
  highContrast: document.querySelector("#highContrast"),
  toggleScan: document.querySelector("#toggleScan"),
  primarySwitch: document.querySelector("#primarySwitch"),
};

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultState(),
      ...parsed,
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      hitTimes: Array.isArray(parsed.hitTimes) ? parsed.hitTimes : [],
    };
  } catch {
    return cloneDefaultState();
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function announce(message) {
  elements.liveRegion.textContent = message;
}

function logEvent(entry) {
  state.logs.unshift({
    time: new Date().toISOString(),
    view: state.currentView,
    ...entry,
  });
  state.logs = state.logs.slice(0, 200);
  saveState();
  renderLog();
}

function formatTime(isoString) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoString));
}

function switchView(viewName) {
  state.currentView = viewName;
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === viewName);
    tab.setAttribute("aria-selected", String(tab.dataset.view === viewName));
  });
  elements.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === viewName);
  });
  saveState();
  render();
  restartScanIfNeeded();
}

function render() {
  renderTrainer();
  renderChoices();
  renderCategories();
  renderPhrases();
  renderSettings();
  renderLog();
  applySettingsClasses();
}

function renderTrainer() {
  const lesson = lessons[state.lessonIndex % lessons.length];
  elements.reactionLabel.textContent = lesson.label;
  elements.lessonPrompt.textContent = lesson.detail;
  elements.hitCount.textContent = String(state.hitCount);

  if (state.hitTimes.length >= 2) {
    const intervals = state.hitTimes.slice(1).map((time, index) => time - state.hitTimes[index]);
    const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    elements.averageInterval.textContent = `${Math.round(average / 100) / 10}秒`;
  } else {
    elements.averageInterval.textContent = "--";
  }

  const last = state.hitTimes[state.hitTimes.length - 1];
  elements.lastReaction.textContent = last ? new Intl.DateTimeFormat("ja-JP", { minute: "2-digit", second: "2-digit" }).format(last) : "--";
}

function renderChoices() {
  const task = choiceTasks[state.choiceIndex % choiceTasks.length];
  elements.choicePrompt.textContent = task.prompt;
  elements.choiceGrid.innerHTML = "";
  task.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.dataset.scan = "";
    button.textContent = option;
    button.addEventListener("click", () => chooseAnswer(option));
    elements.choiceGrid.append(button);
  });
}

function renderCategories() {
  elements.categoryRow.innerHTML = "";
  Object.keys(phraseCategories).forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-button";
    button.classList.toggle("is-active", category === state.currentCategory);
    button.type = "button";
    button.dataset.scan = "";
    button.textContent = category;
    button.addEventListener("click", () => {
      state.currentCategory = category;
      saveState();
      renderCategories();
      renderPhrases();
      restartScanIfNeeded();
    });
    elements.categoryRow.append(button);
  });
}

function renderPhrases() {
  elements.currentPhrase.textContent = state.currentPhrase || "まだ選択されていません";
  elements.phraseGrid.innerHTML = "";
  phraseCategories[state.currentCategory].forEach((phrase) => {
    const button = document.createElement("button");
    button.className = "phrase-button";
    button.type = "button";
    button.dataset.scan = "";
    button.textContent = phrase;
    button.addEventListener("click", () => selectPhrase(phrase));
    elements.phraseGrid.append(button);
  });
}

function renderSettings() {
  const settings = state.settings;
  elements.scanInterval.value = settings.scanInterval;
  elements.scanIntervalValue.value = `${settings.scanInterval}ms`;
  elements.autoScan.checked = settings.autoScan;
  elements.speechEnabled.checked = settings.speechEnabled;
  elements.soundEnabled.checked = settings.soundEnabled;
  elements.largeText.checked = settings.largeText;
  elements.highContrast.checked = settings.highContrast;
}

function renderLog() {
  const total = state.logs.filter((entry) => entry.type !== "system").length;
  const answers = state.logs.filter((entry) => entry.type === "choice");
  const mistakes = answers.filter((entry) => !entry.correct).length;
  const correct = answers.filter((entry) => entry.correct).length;
  elements.totalInputs.textContent = String(total);
  elements.mistakeCount.textContent = String(mistakes);
  elements.accuracyRate.textContent = answers.length ? `${Math.round((correct / answers.length) * 100)}%` : "--";

  elements.logList.innerHTML = "";
  if (state.logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "まだログはありません。教材または会話画面で入力すると記録されます。";
    elements.logList.append(empty);
    return;
  }

  state.logs.slice(0, 24).forEach((entry) => {
    const item = document.createElement("article");
    item.className = "log-item";
    const result = entry.correct === true ? "正答" : entry.correct === false ? "誤選択" : "";
    item.innerHTML = `
      <span class="metric-label">${formatTime(entry.time)}</span>
      <strong>${escapeHtml(entry.label || entry.type)}</strong>
      <span>${result}</span>
    `;
    elements.logList.append(item);
  });
}

function applySettingsClasses() {
  document.body.classList.toggle("large-text", state.settings.largeText);
  document.body.classList.toggle("high-contrast", state.settings.highContrast);
}

function runReaction() {
  const now = Date.now();
  const lesson = lessons[state.lessonIndex % lessons.length];
  state.hitCount += 1;
  state.hitTimes.push(now);
  state.hitTimes = state.hitTimes.slice(-40);
  state.lessonIndex = (state.lessonIndex + 1) % lessons.length;

  elements.reactionPad.classList.remove("flash-good", "flash-warn");
  requestAnimationFrame(() => {
    elements.reactionPad.classList.add(lesson.flash);
    setTimeout(() => elements.reactionPad.classList.remove(lesson.flash), 520);
  });

  playTone(lesson.tone);
  speak(lesson.label);
  announce(lesson.label);
  logEvent({ type: "reaction", label: lesson.label });
  saveState();
  renderTrainer();
}

function chooseAnswer(answer) {
  const task = choiceTasks[state.choiceIndex % choiceTasks.length];
  const correct = answer === task.answer;
  const label = correct ? `正解: ${answer}` : `違います: ${answer}`;
  state.choiceIndex = (state.choiceIndex + 1) % choiceTasks.length;
  playTone(correct ? 700 : 230);
  speak(correct ? "正解です" : "違います");
  announce(label);
  logEvent({ type: "choice", label: answer, correct });
  saveState();
  renderChoices();
  restartScanIfNeeded();
}

function selectPhrase(phrase) {
  state.currentPhrase = phrase;
  speak(phrase);
  playTone(560);
  announce(phrase);
  logEvent({ type: "phrase", label: phrase });
  saveState();
  renderPhrases();
}

function speak(text) {
  if (!state.settings.speechEnabled || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function playTone(frequency) {
  if (!state.settings.soundEnabled || !AudioContextClass) return;
  try {
    if (!audioContext) audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.16);
    oscillator.stop(audioContext.currentTime + 0.18);
  } catch {
    // AudioContext may be unavailable in older embedded browsers.
  }
}

function refreshScanTargets() {
  const activeView = document.querySelector(".view.is-active");
  scanTargets = [
    ...document.querySelectorAll(".tabbar [data-scan]"),
    ...(activeView ? [...activeView.querySelectorAll("[data-scan]")] : []),
    elements.toggleScan,
  ].filter((target) => {
    const rect = target.getBoundingClientRect();
    return !target.disabled && rect.width > 0 && rect.height > 0;
  });
  if (scanIndex >= scanTargets.length) scanIndex = 0;
  updateScanFocus();
}

function updateScanFocus() {
  document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
  if (!scanTargets.length || scanIndex < 0) return;
  const target = scanTargets[scanIndex];
  target.classList.add("scan-focus");
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function stepScan() {
  refreshScanTargets();
  if (!scanTargets.length) return;
  scanIndex = (scanIndex + 1) % scanTargets.length;
  updateScanFocus();
}

function startScan() {
  stopScan(false);
  refreshScanTargets();
  scanIndex = scanTargets.length ? Math.max(0, scanIndex) : -1;
  updateScanFocus();
  scanTimer = window.setInterval(stepScan, state.settings.scanInterval);
  elements.scanState.textContent = "走査中";
  elements.toggleScan.textContent = "走査停止";
}

function stopScan(clearFocus = true) {
  if (scanTimer) {
    window.clearInterval(scanTimer);
    scanTimer = null;
  }
  elements.scanState.textContent = "走査停止中";
  elements.toggleScan.textContent = "走査開始";
  if (clearFocus) {
    scanIndex = -1;
    document.querySelectorAll(".scan-focus").forEach((target) => target.classList.remove("scan-focus"));
  }
}

function restartScanIfNeeded() {
  window.setTimeout(() => {
    refreshScanTargets();
    if (state.settings.autoScan) startScan();
  }, 0);
}

function activateCurrentScanTarget() {
  refreshScanTargets();
  if (!scanTargets.length || scanIndex < 0) {
    if (state.currentView === "trainer") runReaction();
    return;
  }
  const target = scanTargets[scanIndex];
  if (target === elements.toggleScan) {
    toggleScan();
    return;
  }
  target.click();
}

function toggleScan() {
  if (scanTimer) {
    stopScan();
  } else {
    startScan();
  }
}

function exportCsv() {
  if (!state.logs.length) {
    announce("書き出すログがありません");
    return;
  }
  const rows = [
    ["time", "view", "type", "label", "correct"],
    ...state.logs.map((entry) => [
      entry.time,
      entry.view,
      entry.type,
      entry.label || "",
      entry.correct ?? "",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neuronode-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

elements.reactionPad.addEventListener("click", runReaction);
elements.primarySwitch.addEventListener("click", activateCurrentScanTarget);
elements.toggleScan.addEventListener("click", toggleScan);
elements.resetTrainer.addEventListener("click", () => {
  state.hitCount = 0;
  state.hitTimes = [];
  state.lessonIndex = 0;
  logEvent({ type: "system", label: "教材記録をリセット" });
  saveState();
  renderTrainer();
});
elements.repeatPhrase.addEventListener("click", () => {
  if (state.currentPhrase) speak(state.currentPhrase);
});
elements.exportCsv.addEventListener("click", exportCsv);
elements.clearLog.addEventListener("click", () => {
  state.logs = [];
  saveState();
  renderLog();
  announce("ログを削除しました");
});

elements.scanInterval.addEventListener("input", (event) => {
  state.settings.scanInterval = Number(event.target.value);
  elements.scanIntervalValue.value = `${state.settings.scanInterval}ms`;
  saveState();
  if (scanTimer) startScan();
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
    saveState();
    applySettingsClasses();
    if (key === "autoScan") restartScanIfNeeded();
  });
});

document.addEventListener("keydown", (event) => {
  const tag = event.target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    activateCurrentScanTarget();
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepScan();
  }
  if (event.key === "Escape") {
    stopScan();
  }
});

window.addEventListener("resize", () => refreshScanTargets());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
switchView(state.currentView);
