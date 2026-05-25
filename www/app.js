const storageKey = "neuronode-prototype-state-v2";

const switchModules = [
  {
    id: "color",
    name: "色変化",
    description: "入力すると画面の色が変わります。",
    tones: [392, 440, 494, 523],
  },
  {
    id: "balloon",
    name: "風船ふくらませ",
    description: "入力するたびに風船が大きくなり、最後に割れます。",
    tones: [330, 392, 494, 660],
  },
  {
    id: "firework",
    name: "花火",
    description: "入力すると花火のような光が広がります。",
    tones: [523, 659, 784, 988],
  },
  {
    id: "sound",
    name: "音あそび",
    description: "入力するたびに違う音を鳴らします。",
    tones: [262, 330, 392, 523],
  },
];

const stageColors = ["#0f8b8d", "#2f8f5b", "#315c9c", "#7a8f1f", "#c04747"];

const matchingTasks = [
  {
    prompt: "赤いものを選んでください",
    answer: "りんご",
    options: [
      { label: "りんご", visual: "circle red" },
      { label: "そら", visual: "square blue" },
      { label: "はっぱ", visual: "triangle green" },
      { label: "ゆき", visual: "circle white" },
    ],
  },
  {
    prompt: "丸い形を選んでください",
    answer: "まる",
    options: [
      { label: "しかく", visual: "square teal" },
      { label: "さんかく", visual: "triangle yellow" },
      { label: "まる", visual: "circle blue" },
      { label: "ながしかく", visual: "bar green" },
    ],
  },
  {
    prompt: "食べものを選んでください",
    answer: "パン",
    options: [
      { label: "くつ", visual: "bar teal" },
      { label: "パン", visual: "circle yellow" },
      { label: "ほん", visual: "square blue" },
      { label: "いす", visual: "square green" },
    ],
  },
];

const letterTasks = [
  { prompt: "「あめ」の最初の文字を選んでください", answer: "あ", options: ["あ", "い", "う", "え"] },
  { prompt: "「からだ」の最初の文字を選んでください", answer: "か", options: ["さ", "た", "か", "な"] },
  { prompt: "「みず」の最初の文字を選んでください", answer: "み", options: ["に", "み", "し", "り"] },
  { prompt: "「ありがとう」の最初の文字を選んでください", answer: "あ", options: ["お", "あ", "ま", "や"] },
];

const phraseCategories = {
  基本: ["はい", "いいえ", "もう一度", "わかりません", "ありがとう", "大丈夫です"],
  体調: ["痛いです", "寒いです", "暑いです", "眠いです", "休みたいです", "水がほしいです"],
  介助: ["姿勢を変えてください", "トイレに行きたいです", "吸引してください", "家族に連絡してください", "ナースコール", "待ってください"],
  気持ち: ["うれしいです", "不安です", "楽しいです", "静かにしたいです", "外に出たいです", "話したいです"],
};

const defaultState = {
  currentView: "switcher",
  activeSwitchModule: "color",
  switchStep: 0,
  hitCount: 0,
  hitTimes: [],
  matchingIndex: 0,
  letterIndex: 0,
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

const elements = {
  scanState: document.querySelector("#scanState"),
  liveRegion: document.querySelector("#liveRegion"),
  tabs: [...document.querySelectorAll(".tab")],
  views: [...document.querySelectorAll(".view")],
  switchModuleGrid: document.querySelector("#switchModuleGrid"),
  switchStage: document.querySelector("#switchStage"),
  activityVisual: document.querySelector("#activityVisual"),
  switchTitle: document.querySelector("#switchTitle"),
  switchHint: document.querySelector("#switchHint"),
  hitCount: document.querySelector("#hitCount"),
  averageInterval: document.querySelector("#averageInterval"),
  lastReaction: document.querySelector("#lastReaction"),
  resetSwitch: document.querySelector("#resetSwitch"),
  matchingPrompt: document.querySelector("#matchingPrompt"),
  matchingGrid: document.querySelector("#matchingGrid"),
  nextMatching: document.querySelector("#nextMatching"),
  categoryRow: document.querySelector("#categoryRow"),
  phraseGrid: document.querySelector("#phraseGrid"),
  currentPhrase: document.querySelector("#currentPhrase"),
  repeatPhrase: document.querySelector("#repeatPhrase"),
  letterPrompt: document.querySelector("#letterPrompt"),
  letterGrid: document.querySelector("#letterGrid"),
  nextLetter: document.querySelector("#nextLetter"),
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

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

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
  state.logs = state.logs.slice(0, 300);
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

function activeSwitchModule() {
  return switchModules.find((module) => module.id === state.activeSwitchModule) || switchModules[0];
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
  renderSwitchModules();
  renderSwitchStage();
  renderMatching();
  renderCategories();
  renderPhrases();
  renderLetters();
  renderSettings();
  renderLog();
  applySettingsClasses();
}

function renderSwitchModules() {
  elements.switchModuleGrid.innerHTML = "";
  switchModules.forEach((module) => {
    const button = document.createElement("button");
    button.className = "module-button";
    button.classList.toggle("is-active", module.id === state.activeSwitchModule);
    button.type = "button";
    button.dataset.scan = "";
    button.innerHTML = `<strong>${module.name}</strong><span>${module.description}</span>`;
    button.addEventListener("click", () => {
      state.activeSwitchModule = module.id;
      state.switchStep = 0;
      saveState();
      renderSwitchModules();
      renderSwitchStage();
      restartScanIfNeeded();
    });
    elements.switchModuleGrid.append(button);
  });
}

function renderSwitchStage() {
  const module = activeSwitchModule();
  elements.switchTitle.textContent = module.name;
  elements.switchHint.textContent = module.description;
  elements.switchStage.className = `activity-stage module-${module.id}`;
  elements.switchStage.dataset.scan = "";

  if (module.id === "color") {
    const color = stageColors[state.switchStep % stageColors.length];
    elements.switchStage.style.setProperty("--stage-color", color);
    elements.activityVisual.innerHTML = `<span class="color-chip" style="background:${color}"></span>`;
  } else if (module.id === "balloon") {
    const size = 64 + (state.switchStep % 5) * 26;
    const popped = state.switchStep % 6 === 5;
    elements.activityVisual.innerHTML = popped
      ? `<span class="burst-mark">POP</span>`
      : `<span class="balloon-shape" style="width:${size}px;height:${size}px"></span>`;
  } else if (module.id === "firework") {
    elements.activityVisual.innerHTML = `<span class="firework-ring"></span><span class="firework-ring delay"></span>`;
  } else {
    const notes = ["ド", "ミ", "ソ", "高いド"];
    elements.activityVisual.innerHTML = `<span class="sound-note">${notes[state.switchStep % notes.length]}</span>`;
  }

  renderSwitchMetrics();
}

function renderSwitchMetrics() {
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

function renderMatching() {
  const task = matchingTasks[state.matchingIndex % matchingTasks.length];
  elements.matchingPrompt.textContent = task.prompt;
  elements.matchingGrid.innerHTML = "";
  task.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "match-card";
    button.type = "button";
    button.dataset.scan = "";
    button.innerHTML = `<span class="shape ${option.visual}"></span><strong>${option.label}</strong>`;
    button.addEventListener("click", () => chooseMatching(option.label));
    elements.matchingGrid.append(button);
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

function renderLetters() {
  const task = letterTasks[state.letterIndex % letterTasks.length];
  elements.letterPrompt.textContent = task.prompt;
  elements.letterGrid.innerHTML = "";
  task.options.forEach((letter) => {
    const button = document.createElement("button");
    button.className = "letter-button";
    button.type = "button";
    button.dataset.scan = "";
    button.textContent = letter;
    button.addEventListener("click", () => chooseLetter(letter));
    elements.letterGrid.append(button);
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
  const graded = state.logs.filter((entry) => entry.type === "matching" || entry.type === "letter");
  const mistakes = graded.filter((entry) => !entry.correct).length;
  const correct = graded.filter((entry) => entry.correct).length;
  elements.totalInputs.textContent = String(total);
  elements.mistakeCount.textContent = String(mistakes);
  elements.accuracyRate.textContent = graded.length ? `${Math.round((correct / graded.length) * 100)}%` : "--";

  elements.logList.innerHTML = "";
  if (state.logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "まだログはありません。教材、マッチング、VOCA、文字学習で入力すると記録されます。";
    elements.logList.append(empty);
    return;
  }

  state.logs.slice(0, 32).forEach((entry) => {
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

function runSwitchActivity() {
  const module = activeSwitchModule();
  const tone = module.tones[state.switchStep % module.tones.length];
  state.hitCount += 1;
  state.hitTimes.push(Date.now());
  state.hitTimes = state.hitTimes.slice(-60);
  state.switchStep += 1;

  playTone(tone);
  speak(module.name);
  announce(`${module.name}に入力しました`);
  logEvent({ type: "switch", label: module.name });
  saveState();
  renderSwitchStage();
}

function chooseMatching(answer) {
  const task = matchingTasks[state.matchingIndex % matchingTasks.length];
  const correct = answer === task.answer;
  playTone(correct ? 700 : 230);
  speak(correct ? "正解です" : "違います");
  announce(correct ? `正解: ${answer}` : `違います: ${answer}`);
  logEvent({ type: "matching", label: answer, correct });
  state.matchingIndex = (state.matchingIndex + 1) % matchingTasks.length;
  saveState();
  renderMatching();
  restartScanIfNeeded();
}

function chooseLetter(letter) {
  const task = letterTasks[state.letterIndex % letterTasks.length];
  const correct = letter === task.answer;
  playTone(correct ? 760 : 240);
  speak(correct ? "正解です" : "違います");
  announce(correct ? `正解: ${letter}` : `違います: ${letter}`);
  logEvent({ type: "letter", label: letter, correct });
  state.letterIndex = (state.letterIndex + 1) % letterTasks.length;
  saveState();
  renderLetters();
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
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18);
    oscillator.stop(audioContext.currentTime + 0.2);
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
    if (state.currentView === "switcher") runSwitchActivity();
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

elements.switchStage.addEventListener("click", runSwitchActivity);
elements.primarySwitch.addEventListener("click", activateCurrentScanTarget);
elements.toggleScan.addEventListener("click", toggleScan);
elements.resetSwitch.addEventListener("click", () => {
  state.hitCount = 0;
  state.hitTimes = [];
  state.switchStep = 0;
  logEvent({ type: "system", label: "スイッチ教材記録をリセット" });
  saveState();
  renderSwitchStage();
});
elements.nextMatching.addEventListener("click", () => {
  state.matchingIndex = (state.matchingIndex + 1) % matchingTasks.length;
  saveState();
  renderMatching();
  restartScanIfNeeded();
});
elements.repeatPhrase.addEventListener("click", () => {
  if (state.currentPhrase) speak(state.currentPhrase);
});
elements.nextLetter.addEventListener("click", () => {
  state.letterIndex = (state.letterIndex + 1) % letterTasks.length;
  saveState();
  renderLetters();
  restartScanIfNeeded();
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
