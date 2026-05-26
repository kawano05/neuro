export function initNeuroNodeApp() {
const storageKey = "neuronode-prototype-state-v2";

const switchModules = [
  {
    id: "color",
    name: "色変化",
    description: "入力すると画面の色が変わります。",
    tones: [392, 440, 494, 523],
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

const operationModes = [
  {
    id: "item",
    name: "項目スキャン",
    description: "順番にハイライトされる項目から目的のボタンを選ぶ練習です。",
  },
  {
    id: "point",
    name: "ポイントスキャン",
    description: "縦横のカーソルを止めて、画面上の一点を指定する練習です。",
  },
  {
    id: "tap",
    name: "タップ",
    description: "目的の場所をタップする操作を確認します。",
  },
  {
    id: "drag",
    name: "ドラッグ",
    description: "開始点から終了点へ動かす操作を段階的に練習します。",
  },
];

const operationItemTasks = [
  { prompt: "「水」を選んでください", answer: "水", options: ["はい", "水", "休む", "戻る"] },
  { prompt: "「戻る」を選んでください", answer: "戻る", options: ["痛い", "寒い", "戻る", "ありがとう"] },
  { prompt: "「ナースコール」を選んでください", answer: "ナースコール", options: ["水", "ナースコール", "暑い", "眠い"] },
];

const operationPointTargets = [
  { x: 30, y: 34, label: "左上の目標" },
  { x: 72, y: 38, label: "右上の目標" },
  { x: 44, y: 72, label: "下側の目標" },
];

const phraseCategories = {
  基本: ["はい", "いいえ", "もう一度", "わかりません", "ありがとう", "大丈夫です"],
  体調: ["痛いです", "寒いです", "暑いです", "眠いです", "休みたいです", "水がほしいです"],
  介助: ["姿勢を変えてください", "トイレに行きたいです", "吸引してください", "家族に連絡してください", "ナースコール", "待ってください"],
  気持ち: ["うれしいです", "不安です", "楽しいです", "静かにしたいです", "外に出たいです", "話したいです"],
};

const evaluationTasks = [
  {
    id: "switch-5",
    title: "スイッチ教材を5回入力",
    guide: "スイッチ教材画面で同じ入力を5回行い、支援者が達成を確認したら成功で終了します。",
    view: "switcher",
  },
  {
    id: "matching-1",
    title: "マッチング問題を1問正解",
    guide: "マッチング画面でお題に合う選択肢を選びます。誤選択は自動で記録されます。",
    view: "matching",
  },
  {
    id: "voca-pain",
    title: "VOCAで「痛いです」を選択",
    guide: "VOCA画面で体調カテゴリから「痛いです」を選びます。必要に応じて誤選択を手動で加算します。",
    view: "voca",
  },
  {
    id: "letter-1",
    title: "文字学習を1問正解",
    guide: "文字学習画面で提示された単語の最初の文字を選びます。誤選択は自動で記録されます。",
    view: "letters",
  },
  {
    id: "operation-point",
    title: "ポイントスキャンで目標を選択",
    guide: "操作訓練画面でポイントスキャンを選び、縦横カーソルを止めて目標を指定します。",
    view: "operation",
  },
];

const researchConditionProfiles = [
  {
    id: "web",
    name: "Web版",
    description: "iPad Safariで動かし、試作と先行Web教材との比較を行う条件です。",
    focus: "試作速度、ブラウザ互換、オフライン配信",
    evaluationValue: "web",
  },
  {
    id: "native",
    name: "iOS版",
    description: "Capacitorで変換した公開候補版として、Switch ControlとGuided Accessを確認します。",
    focus: "単一アプリ運用、署名、App Store公開準備",
    evaluationValue: "native",
  },
  {
    id: "reference",
    name: "参照構成",
    description: "先行Web教材に近い配置・画面遷移で測り、比較の基準にします。",
    focus: "従来構成との差分、誤操作、戻り操作",
    evaluationValue: "reference",
  },
  {
    id: "optimized",
    name: "最適化構成",
    description: "ニューロノードとSwitch Control向けに、走査順・ボタンサイズ・復帰導線を調整します。",
    focus: "操作負担、見逃し、支援者介助の減少",
    evaluationValue: "optimized",
  },
];

const readinessItems = [
  {
    id: "localRun",
    label: "ローカル動作",
    detail: "通信が不安定な病院・施設でも主要機能が使える。",
  },
  {
    id: "switchControl",
    label: "Switch Control検証",
    detail: "項目スキャン/ポイントスキャンで主要タスクを実施できる。",
  },
  {
    id: "guidedAccess",
    label: "Guided Access想定",
    detail: "共有iPadで単一アプリ運用し、誤終了を防ぐ導線を確認する。",
  },
  {
    id: "sharedIpad",
    label: "共有端末運用",
    detail: "利用者ID、観察メモ、ログ削除の扱いを支援者が管理できる。",
  },
  {
    id: "appStoreAssets",
    label: "公開素材",
    detail: "説明文、スクリーンショット、アイコン、運用説明を準備する。",
  },
];

const environmentLabels = {
  hospital: "病院",
  facility: "施設",
  home: "在宅",
};

const visibleViews = new Set(["switcher", "matching", "voca", "letters", "log", "settings"]);

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
  operation: {
    mode: "item",
    itemIndex: 0,
    pointIndex: 0,
    pointPhase: "x",
    pointStartedAt: null,
    selectedX: null,
    selectedY: null,
    dragPhase: "start",
    trials: 0,
    successes: 0,
    distances: [],
  },
  settings: {
    scanInterval: 1600,
    autoScan: true,
    speechEnabled: true,
    soundEnabled: true,
    largeText: true,
    highContrast: false,
  },
  logs: [],
  evaluation: {
    participantId: "",
    condition: "web",
    isActive: false,
    sessionStartedAt: null,
    sessionEndedAt: null,
    activeTaskIndex: 0,
    taskStartedAt: null,
    taskInputs: 0,
    taskMistakes: 0,
    taskBacks: 0,
    taskTimingMissed: 0,
    taskTimingEarly: 0,
    taskTimingLate: 0,
    taskAssists: 0,
    taskDistances: [],
    effortRating: 3,
    easeRating: 3,
    engagementRating: 3,
    observerNotes: "",
    results: [],
    completedSessions: [],
  },
  research: {
    conditionProfile: "optimized",
    environment: "hospital",
    deploymentNotes: "",
    readiness: readinessItems.reduce((items, item) => ({ ...items, [item.id]: false }), {}),
  },
};

let state = loadState();
if (!visibleViews.has(state.currentView)) state.currentView = "switcher";
if (!switchModules.some((module) => module.id === state.activeSwitchModule)) {
  state.activeSwitchModule = switchModules[0].id;
}
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
  operationModeGrid: document.querySelector("#operationModeGrid"),
  operationModeTitle: document.querySelector("#operationModeTitle"),
  operationGuide: document.querySelector("#operationGuide"),
  operationStage: document.querySelector("#operationStage"),
  operationPrimary: document.querySelector("#operationPrimary"),
  nextOperationTarget: document.querySelector("#nextOperationTarget"),
  resetOperation: document.querySelector("#resetOperation"),
  operationTrials: document.querySelector("#operationTrials"),
  operationSuccessRate: document.querySelector("#operationSuccessRate"),
  operationAverageDistance: document.querySelector("#operationAverageDistance"),
  participantId: document.querySelector("#participantId"),
  evaluationCondition: document.querySelector("#evaluationCondition"),
  startSession: document.querySelector("#startSession"),
  finishSession: document.querySelector("#finishSession"),
  startTask: document.querySelector("#startTask"),
  openTaskView: document.querySelector("#openTaskView"),
  markTaskSuccess: document.querySelector("#markTaskSuccess"),
  markTaskFail: document.querySelector("#markTaskFail"),
  addMistake: document.querySelector("#addMistake"),
  addBack: document.querySelector("#addBack"),
  addTimingMissed: document.querySelector("#addTimingMissed"),
  addTimingEarly: document.querySelector("#addTimingEarly"),
  addTimingLate: document.querySelector("#addTimingLate"),
  addAssist: document.querySelector("#addAssist"),
  effortRating: document.querySelector("#effortRating"),
  effortRatingValue: document.querySelector("#effortRatingValue"),
  easeRating: document.querySelector("#easeRating"),
  easeRatingValue: document.querySelector("#easeRatingValue"),
  engagementRating: document.querySelector("#engagementRating"),
  engagementRatingValue: document.querySelector("#engagementRatingValue"),
  observerNotes: document.querySelector("#observerNotes"),
  exportEvaluationCsv: document.querySelector("#exportEvaluationCsv"),
  resetEvaluation: document.querySelector("#resetEvaluation"),
  evaluationStatus: document.querySelector("#evaluationStatus"),
  currentTaskTitle: document.querySelector("#currentTaskTitle"),
  currentTaskGuide: document.querySelector("#currentTaskGuide"),
  taskElapsed: document.querySelector("#taskElapsed"),
  taskInputs: document.querySelector("#taskInputs"),
  taskMistakes: document.querySelector("#taskMistakes"),
  taskBacks: document.querySelector("#taskBacks"),
  taskTimingErrors: document.querySelector("#taskTimingErrors"),
  taskAssists: document.querySelector("#taskAssists"),
  evaluationTaskList: document.querySelector("#evaluationTaskList"),
  evaluationResultList: document.querySelector("#evaluationResultList"),
  researchProfileGrid: document.querySelector("#researchProfileGrid"),
  readinessChecklist: document.querySelector("#readinessChecklist"),
  readinessScore: document.querySelector("#readinessScore"),
  researchEnvironment: document.querySelector("#researchEnvironment"),
  deploymentNotes: document.querySelector("#deploymentNotes"),
  copyDeploymentNote: document.querySelector("#copyDeploymentNote"),
  researchProtocolHint: document.querySelector("#researchProtocolHint"),
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
      operation: {
        ...defaultState.operation,
        ...(parsed.operation || {}),
        distances: Array.isArray(parsed.operation?.distances) ? parsed.operation.distances : [],
      },
      evaluation: {
        ...defaultState.evaluation,
        ...(parsed.evaluation || {}),
        results: Array.isArray(parsed.evaluation?.results) ? parsed.evaluation.results : [],
        completedSessions: Array.isArray(parsed.evaluation?.completedSessions)
          ? parsed.evaluation.completedSessions
          : [],
      },
      research: {
        ...defaultState.research,
        ...(parsed.research || {}),
        readiness: {
          ...defaultState.research.readiness,
          ...(parsed.research?.readiness || {}),
        },
      },
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
  countEvaluationEntry(entry);
  saveState();
  renderLog();
  renderEvaluation();
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
  const nextView = visibleViews.has(viewName) ? viewName : "switcher";
  state.currentView = nextView;
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === nextView);
    tab.setAttribute("aria-selected", String(tab.dataset.view === nextView));
  });
  elements.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === nextView);
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
  renderOperation();
  renderEvaluation();
  renderResearchPlan();
  renderSettings();
  renderLog();
  applySettingsClasses();
}

function renderSwitchModules() {
  elements.switchModuleGrid.innerHTML = "";
  const activeModuleId = activeSwitchModule().id;
  switchModules.forEach((module) => {
    const button = document.createElement("button");
    button.className = "module-button";
    button.classList.toggle("is-active", module.id === activeModuleId);
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

  const color = stageColors[state.switchStep % stageColors.length];
  elements.switchStage.style.setProperty("--stage-color", color);
  elements.activityVisual.innerHTML = `<span class="color-chip" style="background:${color}"></span>`;

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

function activeOperationMode() {
  return operationModes.find((mode) => mode.id === state.operation.mode) || operationModes[0];
}

function renderOperation() {
  renderOperationModes();
  renderOperationStage();
  renderOperationMetrics();
}

function renderOperationModes() {
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
      saveState();
      renderOperation();
      restartScanIfNeeded();
    });
    elements.operationModeGrid.append(button);
  });
}

function renderOperationStage() {
  const mode = activeOperationMode();
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
    button.addEventListener("click", () => chooseOperationItem(option));
    grid.append(button);
  });
  elements.operationStage.append(prompt, grid);
}

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

function renderTapTraining() {
  const target = operationPointTargets[state.operation.pointIndex % operationPointTargets.length];
  elements.operationPrimary.textContent = "タップ成功として記録";
  elements.operationStage.innerHTML = `
    <p class="operation-prompt">${target.label}をタップしてください</p>
    <div class="point-board">
      <button class="tap-target" data-scan type="button" style="left:${target.x}%;top:${target.y}%">タップ</button>
    </div>
  `;
  elements.operationStage.querySelector(".tap-target").addEventListener("click", () => completeOperationTrial("タップ", true, 0));
}

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

function renderOperationMetrics() {
  elements.operationTrials.textContent = String(state.operation.trials);
  elements.operationSuccessRate.textContent = state.operation.trials
    ? `${Math.round((state.operation.successes / state.operation.trials) * 100)}%`
    : "--";
  if (state.operation.distances.length === 0) {
    elements.operationAverageDistance.textContent = "--";
    return;
  }
  const average = state.operation.distances.reduce((sum, value) => sum + value, 0) / state.operation.distances.length;
  elements.operationAverageDistance.textContent = `${Math.round(average)}px相当`;
}

function getPointScanPercent() {
  const startedAt = state.operation.pointStartedAt || Date.now();
  const elapsed = (Date.now() - startedAt) % 3200;
  const half = elapsed <= 1600 ? elapsed : 3200 - elapsed;
  return Math.max(4, Math.min(96, Math.round((half / 1600) * 100)));
}

function updatePointCursorDom() {
  if (state.currentView !== "operation" || state.operation.mode !== "point") return;
  const percent = getPointScanPercent();
  const vertical = document.querySelector("#pointVertical");
  const horizontal = document.querySelector("#pointHorizontal");
  if (vertical && state.operation.pointPhase === "x") vertical.style.left = `${percent}%`;
  if (horizontal && state.operation.pointPhase === "y") horizontal.style.top = `${percent}%`;
}

function chooseOperationItem(answer) {
  const task = operationItemTasks[state.operation.itemIndex % operationItemTasks.length];
  const correct = answer === task.answer;
  completeOperationTrial(`項目スキャン: ${answer}`, correct, null);
  state.operation.itemIndex = (state.operation.itemIndex + 1) % operationItemTasks.length;
  saveState();
  renderOperation();
  restartScanIfNeeded();
}

function handleOperationPrimary() {
  if (state.operation.mode === "point") {
    handlePointScanInput();
  } else if (state.operation.mode === "tap") {
    completeOperationTrial("タップ", true, 0);
    nextOperationTarget();
  } else if (state.operation.mode === "drag") {
    handleDragInput();
  }
}

function handlePointScanInput() {
  if (!state.operation.pointStartedAt) state.operation.pointStartedAt = Date.now();
  if (state.operation.pointPhase === "x") {
    state.operation.selectedX = getPointScanPercent();
    state.operation.pointPhase = "y";
    state.operation.pointStartedAt = Date.now();
    saveState();
    renderPointScanTraining();
    return;
  }
  if (state.operation.pointPhase === "y") {
    state.operation.selectedY = getPointScanPercent();
    const target = operationPointTargets[state.operation.pointIndex % operationPointTargets.length];
    const dx = state.operation.selectedX - target.x;
    const dy = state.operation.selectedY - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    completeOperationTrial("ポイントスキャン", distance <= 16, distance * 4);
    nextOperationTarget();
  }
}

function handleDragInput() {
  if (state.operation.dragPhase === "start") {
    state.operation.dragPhase = "end";
    saveState();
    renderOperationStage();
    return;
  }
  completeOperationTrial("ドラッグ", true, 0);
  state.operation.dragPhase = "start";
  saveState();
  renderOperation();
}

function nextOperationTarget() {
  state.operation.pointIndex = (state.operation.pointIndex + 1) % operationPointTargets.length;
  state.operation.pointPhase = "x";
  state.operation.pointStartedAt = Date.now();
  state.operation.selectedX = null;
  state.operation.selectedY = null;
  state.operation.dragPhase = "start";
  saveState();
  renderOperation();
  restartScanIfNeeded();
}

function completeOperationTrial(label, success, distance) {
  state.operation.trials += 1;
  if (success) state.operation.successes += 1;
  if (typeof distance === "number") state.operation.distances.push(distance);
  state.operation.distances = state.operation.distances.slice(-40);
  playTone(success ? 700 : 240);
  speak(success ? "成功です" : "もう一度です");
  announce(success ? `${label}に成功しました` : `${label}に失敗しました`);
  logEvent({ type: "operation", label, correct: success, distance: Math.round(distance ?? 0) });
  saveState();
  renderOperationMetrics();
}

function resetOperationTraining() {
  state.operation = cloneDefaultState().operation;
  saveState();
  announce("操作訓練の記録をリセットしました");
  renderOperation();
  restartScanIfNeeded();
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

function activeEvaluationTask() {
  return evaluationTasks[state.evaluation.activeTaskIndex] || null;
}

function shouldCountEvaluationEntry(entry) {
  return (
    state.evaluation.isActive &&
    state.evaluation.taskStartedAt &&
    !entry.skipEvaluation &&
    ["switch", "matching", "phrase", "letter", "operation"].includes(entry.type)
  );
}

function countEvaluationEntry(entry) {
  if (!shouldCountEvaluationEntry(entry)) return;
  state.evaluation.taskInputs += 1;
  if (entry.correct === false) state.evaluation.taskMistakes += 1;
  if (typeof entry.distance === "number") state.evaluation.taskDistances.push(entry.distance);
}

function formatDuration(milliseconds) {
  if (!milliseconds || milliseconds < 0) return "--";
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function startEvaluationSession() {
  state.evaluation.isActive = true;
  state.evaluation.sessionStartedAt = new Date().toISOString();
  state.evaluation.sessionEndedAt = null;
  state.evaluation.activeTaskIndex = 0;
  state.evaluation.taskStartedAt = null;
  state.evaluation.taskInputs = 0;
  state.evaluation.taskMistakes = 0;
  state.evaluation.taskBacks = 0;
  state.evaluation.taskTimingMissed = 0;
  state.evaluation.taskTimingEarly = 0;
  state.evaluation.taskTimingLate = 0;
  state.evaluation.taskAssists = 0;
  state.evaluation.taskDistances = [];
  state.evaluation.results = [];
  saveState();
  announce("効果測定セッションを開始しました");
  logEvent({ type: "measurement", label: "効果測定セッション開始", skipEvaluation: true });
  renderEvaluation();
}

function finishEvaluationSession() {
  if (!state.evaluation.isActive && state.evaluation.results.length === 0) return;
  if (state.evaluation.taskStartedAt) completeEvaluationTask(false);
  const session = {
    participantId: state.evaluation.participantId,
    condition: state.evaluation.condition,
    startedAt: state.evaluation.sessionStartedAt,
    endedAt: new Date().toISOString(),
    effortRating: state.evaluation.effortRating,
    easeRating: state.evaluation.easeRating,
    engagementRating: state.evaluation.engagementRating,
    observerNotes: state.evaluation.observerNotes,
    taskResults: [...state.evaluation.results],
  };
  state.evaluation.completedSessions.unshift(session);
  state.evaluation.completedSessions = state.evaluation.completedSessions.slice(0, 20);
  state.evaluation.isActive = false;
  state.evaluation.sessionEndedAt = session.endedAt;
  state.evaluation.taskStartedAt = null;
  state.evaluation.taskInputs = 0;
  state.evaluation.taskMistakes = 0;
  state.evaluation.taskBacks = 0;
  state.evaluation.taskTimingMissed = 0;
  state.evaluation.taskTimingEarly = 0;
  state.evaluation.taskTimingLate = 0;
  state.evaluation.taskAssists = 0;
  state.evaluation.taskDistances = [];
  saveState();
  announce("効果測定セッションを終了しました");
  logEvent({ type: "measurement", label: "効果測定セッション終了", skipEvaluation: true });
  renderEvaluation();
}

function startEvaluationTask() {
  if (!state.evaluation.isActive) startEvaluationSession();
  const task = activeEvaluationTask();
  if (!task) {
    announce("すべての評価タスクが完了しています");
    return;
  }
  state.evaluation.taskStartedAt = new Date().toISOString();
  state.evaluation.taskInputs = 0;
  state.evaluation.taskMistakes = 0;
  state.evaluation.taskBacks = 0;
  state.evaluation.taskTimingMissed = 0;
  state.evaluation.taskTimingEarly = 0;
  state.evaluation.taskTimingLate = 0;
  state.evaluation.taskAssists = 0;
  state.evaluation.taskDistances = [];
  saveState();
  announce(`${task.title}を開始しました`);
  logEvent({ type: "measurement", label: `タスク開始: ${task.title}`, skipEvaluation: true });
  renderEvaluation();
}

function completeEvaluationTask(success) {
  const task = activeEvaluationTask();
  if (!task || !state.evaluation.taskStartedAt) {
    announce("先にタスクを開始してください");
    return;
  }
  const endedAt = new Date().toISOString();
  const durationMs = new Date(endedAt).getTime() - new Date(state.evaluation.taskStartedAt).getTime();
  const timingErrors =
    state.evaluation.taskTimingMissed +
    state.evaluation.taskTimingEarly +
    state.evaluation.taskTimingLate;
  const durationMinutes = durationMs > 0 ? durationMs / 60000 : 0;
  const averageTargetDistance = state.evaluation.taskDistances.length
    ? Math.round(
        state.evaluation.taskDistances.reduce((sum, value) => sum + value, 0) /
          state.evaluation.taskDistances.length
      )
    : "";
  const result = {
    participantId: state.evaluation.participantId,
    condition: state.evaluation.condition,
    taskId: task.id,
    taskTitle: task.title,
    success,
    startedAt: state.evaluation.taskStartedAt,
    endedAt,
    durationSeconds: Math.round(durationMs / 100) / 10,
    inputs: state.evaluation.taskInputs,
    mistakes: state.evaluation.taskMistakes,
    backs: state.evaluation.taskBacks,
    timingMissed: state.evaluation.taskTimingMissed,
    timingEarly: state.evaluation.taskTimingEarly,
    timingLate: state.evaluation.taskTimingLate,
    timingErrors,
    assists: state.evaluation.taskAssists,
    scanIntervalMs: state.settings.scanInterval,
    inputsPerMinute: durationMinutes ? Math.round((state.evaluation.taskInputs / durationMinutes) * 10) / 10 : 0,
    averageTargetDistance,
    selectionErrorRate: state.evaluation.taskInputs
      ? Math.round((state.evaluation.taskMistakes / state.evaluation.taskInputs) * 1000) / 10
      : 0,
    totalScanningErrorRate: state.evaluation.taskInputs
      ? Math.round(((state.evaluation.taskMistakes + timingErrors) / state.evaluation.taskInputs) * 1000) / 10
      : 0,
    effortRating: state.evaluation.effortRating,
    easeRating: state.evaluation.easeRating,
    engagementRating: state.evaluation.engagementRating,
    observerNotes: state.evaluation.observerNotes,
  };
  state.evaluation.results.push(result);
  state.evaluation.activeTaskIndex = Math.min(state.evaluation.activeTaskIndex + 1, evaluationTasks.length);
  state.evaluation.taskStartedAt = null;
  state.evaluation.taskInputs = 0;
  state.evaluation.taskMistakes = 0;
  state.evaluation.taskBacks = 0;
  state.evaluation.taskTimingMissed = 0;
  state.evaluation.taskTimingEarly = 0;
  state.evaluation.taskTimingLate = 0;
  state.evaluation.taskAssists = 0;
  state.evaluation.taskDistances = [];
  saveState();
  announce(success ? "タスクを成功で記録しました" : "タスクを中止または失敗で記録しました");
  logEvent({
    type: "measurement",
    label: `${success ? "成功" : "中止/失敗"}: ${task.title}`,
    skipEvaluation: true,
  });
  renderEvaluation();
}

function openCurrentEvaluationTask() {
  const task = activeEvaluationTask();
  if (!task) {
    announce("すべての評価タスクが完了しています");
    return;
  }
  switchView(task.view);
}

function adjustEvaluationCounter(kind) {
  if (!state.evaluation.taskStartedAt) {
    announce("先にタスクを開始してください");
    return;
  }
  if (kind === "mistake") {
    state.evaluation.taskInputs += 1;
    state.evaluation.taskMistakes += 1;
    logEvent({ type: "measurement", label: "誤選択を手動加算", skipEvaluation: true });
  } else if (kind === "back") {
    state.evaluation.taskBacks += 1;
    logEvent({ type: "measurement", label: "戻り操作を手動加算", skipEvaluation: true });
  } else if (kind === "timingMissed") {
    state.evaluation.taskTimingMissed += 1;
    logEvent({ type: "measurement", label: "タイミングエラー: 見逃し", skipEvaluation: true });
  } else if (kind === "timingEarly") {
    state.evaluation.taskInputs += 1;
    state.evaluation.taskTimingEarly += 1;
    logEvent({ type: "measurement", label: "タイミングエラー: 早押し", skipEvaluation: true });
  } else if (kind === "timingLate") {
    state.evaluation.taskInputs += 1;
    state.evaluation.taskTimingLate += 1;
    logEvent({ type: "measurement", label: "タイミングエラー: 遅押し", skipEvaluation: true });
  } else if (kind === "assist") {
    state.evaluation.taskAssists += 1;
    logEvent({ type: "measurement", label: "介助を手動加算", skipEvaluation: true });
  }
  saveState();
  renderEvaluation();
}

function resetEvaluation() {
  state.evaluation = {
    ...cloneDefaultState().evaluation,
    participantId: state.evaluation.participantId,
    condition: state.evaluation.condition,
  };
  saveState();
  announce("測定データをリセットしました");
  renderEvaluation();
}

function flattenEvaluationResults() {
  const completed = state.evaluation.completedSessions.flatMap((session) =>
    session.taskResults.map((result) => ({
      ...result,
      sessionStartedAt: session.startedAt,
      sessionEndedAt: session.endedAt,
      effortRating: session.effortRating,
      easeRating: session.easeRating,
      engagementRating: session.engagementRating,
      observerNotes: session.observerNotes,
    }))
  );
  return [...state.evaluation.results, ...completed];
}

function exportEvaluationCsv() {
  const results = flattenEvaluationResults();
  if (results.length === 0) {
    announce("書き出す測定結果がありません");
    return;
  }
  const rows = [
    [
      "participant_id",
      "condition",
      "task_id",
      "task_title",
      "success",
      "duration_sec",
      "inputs",
      "mistakes",
      "selection_error_rate_percent",
      "timing_missed",
      "timing_early",
      "timing_late",
      "timing_errors",
      "total_scanning_error_rate_percent",
      "backs",
      "assists",
      "inputs_per_minute",
      "average_target_distance",
      "scan_interval_ms",
      "effort_rating",
      "ease_rating",
      "engagement_rating",
      "observer_notes",
      "task_started_at",
      "task_ended_at",
      "session_started_at",
      "session_ended_at",
    ],
    ...results.map((result) => [
      result.participantId || "",
      result.condition || "",
      result.taskId,
      result.taskTitle,
      result.success ? "success" : "fail",
      result.durationSeconds,
      result.inputs,
      result.mistakes,
      result.selectionErrorRate ?? "",
      result.timingMissed ?? "",
      result.timingEarly ?? "",
      result.timingLate ?? "",
      result.timingErrors ?? "",
      result.totalScanningErrorRate ?? "",
      result.backs,
      result.assists ?? "",
      result.inputsPerMinute ?? "",
      result.averageTargetDistance ?? "",
      result.scanIntervalMs ?? "",
      result.effortRating,
      result.easeRating,
      result.engagementRating ?? "",
      result.observerNotes ?? "",
      result.startedAt,
      result.endedAt,
      result.sessionStartedAt || state.evaluation.sessionStartedAt || "",
      result.sessionEndedAt || state.evaluation.sessionEndedAt || "",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neuronode-evaluation-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderEvaluation() {
  if (!elements.evaluationStatus) return;
  const task = activeEvaluationTask();
  const isRunningTask = Boolean(state.evaluation.taskStartedAt);
  elements.participantId.value = state.evaluation.participantId;
  elements.evaluationCondition.value = state.evaluation.condition;
  elements.effortRating.value = state.evaluation.effortRating;
  elements.effortRatingValue.value = String(state.evaluation.effortRating);
  elements.easeRating.value = state.evaluation.easeRating;
  elements.easeRatingValue.value = String(state.evaluation.easeRating);
  elements.engagementRating.value = state.evaluation.engagementRating;
  elements.engagementRatingValue.value = String(state.evaluation.engagementRating);
  elements.observerNotes.value = state.evaluation.observerNotes;

  elements.evaluationStatus.textContent = isRunningTask
    ? "タスク計測中"
    : state.evaluation.isActive
      ? "セッション中"
      : "未開始";
  elements.currentTaskTitle.textContent = task ? task.title : "すべてのタスクが完了しました";
  elements.currentTaskGuide.textContent = task
    ? task.guide
    : "セッション終了を押すと、今回の測定を保存できます。";
  elements.taskElapsed.textContent = isRunningTask
    ? formatDuration(Date.now() - new Date(state.evaluation.taskStartedAt).getTime())
    : "--";
  elements.taskInputs.textContent = String(state.evaluation.taskInputs);
  elements.taskMistakes.textContent = String(state.evaluation.taskMistakes);
  elements.taskBacks.textContent = String(state.evaluation.taskBacks);
  elements.taskTimingErrors.textContent = String(
    state.evaluation.taskTimingMissed +
      state.evaluation.taskTimingEarly +
      state.evaluation.taskTimingLate
  );
  elements.taskAssists.textContent = String(state.evaluation.taskAssists);

  elements.evaluationTaskList.innerHTML = "";
  evaluationTasks.forEach((item, index) => {
    const done = state.evaluation.results.some((result) => result.taskId === item.id);
    const card = document.createElement("article");
    card.className = "task-card";
    card.classList.toggle("is-current", index === state.evaluation.activeTaskIndex);
    card.classList.toggle("is-done", done);
    card.innerHTML = `
      <span class="metric-label">${done ? "完了" : index === state.evaluation.activeTaskIndex ? "現在" : "待機"}</span>
      <strong>${index + 1}. ${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.guide)}</p>
    `;
    elements.evaluationTaskList.append(card);
  });

  elements.evaluationResultList.innerHTML = "";
  const results = [...state.evaluation.results].reverse();
  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "まだ測定結果はありません。タスクを開始して、成功または中止/失敗で終了すると記録されます。";
    elements.evaluationResultList.append(empty);
    return;
  }
  results.forEach((result) => {
    const item = document.createElement("article");
    item.className = "log-item";
    item.innerHTML = `
      <span class="metric-label">${result.success ? "成功" : "中止/失敗"}</span>
      <strong>${escapeHtml(result.taskTitle)}</strong>
      <span>${result.durationSeconds}秒 / 入力${result.inputs} / 誤${result.mistakes} / 走査誤${result.timingErrors || 0}</span>
    `;
    elements.evaluationResultList.append(item);
  });
}

function activeResearchProfile() {
  return (
    researchConditionProfiles.find((profile) => profile.id === state.research.conditionProfile) ||
    researchConditionProfiles[0]
  );
}

function renderResearchPlan() {
  if (!elements.researchProfileGrid) return;
  const activeProfile = activeResearchProfile();
  const environment = environmentLabels[state.research.environment] || environmentLabels.hospital;

  elements.researchProfileGrid.innerHTML = "";
  researchConditionProfiles.forEach((profile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "module-button condition-profile";
    button.classList.toggle("is-active", profile.id === activeProfile.id);
    button.dataset.scan = "";
    button.innerHTML = `
      <strong>${escapeHtml(profile.name)}</strong>
      <span>${escapeHtml(profile.description)}</span>
      <small>${escapeHtml(profile.focus)}</small>
    `;
    button.addEventListener("click", () => {
      state.research.conditionProfile = profile.id;
      state.evaluation.condition = profile.evaluationValue;
      saveState();
      announce(`${profile.name}を効果測定の条件に設定しました`);
      renderResearchPlan();
      renderEvaluation();
      restartScanIfNeeded();
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
      saveState();
      announce(`${item.label}を${input.checked ? "確認済み" : "未確認"}にしました`);
      renderResearchPlan();
      restartScanIfNeeded();
    });

    row.append(text, input);
    elements.readinessChecklist.append(row);
  });

  elements.researchEnvironment.value = state.research.environment;
  elements.deploymentNotes.value = state.research.deploymentNotes;
  elements.researchProtocolHint.textContent =
    `${environment}で${activeProfile.name}を使い、${activeProfile.focus}を観察します。` +
    "測定後はタスク完了時間、入力回数、誤選択、戻り操作、タイミングエラー、介助回数、支援者メモを比較します。";
}

function copyDeploymentNoteToEvaluation() {
  const profile = activeResearchProfile();
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
  saveState();
  logEvent({ type: "measurement", label: "実用化研究メモを観察メモへ反映", skipEvaluation: true });
  renderEvaluation();
  announce("実用化研究メモを観察メモへ反映しました");
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
    if (state.currentView === "operation") handleOperationPrimary();
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
elements.operationPrimary.addEventListener("click", handleOperationPrimary);
elements.nextOperationTarget.addEventListener("click", nextOperationTarget);
elements.resetOperation.addEventListener("click", resetOperationTraining);
elements.participantId.addEventListener("input", (event) => {
  state.evaluation.participantId = event.target.value.trim();
  saveState();
});
elements.evaluationCondition.addEventListener("change", (event) => {
  state.evaluation.condition = event.target.value;
  const profile = researchConditionProfiles.find((item) => item.evaluationValue === event.target.value);
  if (profile) state.research.conditionProfile = profile.id;
  saveState();
  renderEvaluation();
  renderResearchPlan();
});
elements.startSession.addEventListener("click", startEvaluationSession);
elements.finishSession.addEventListener("click", finishEvaluationSession);
elements.startTask.addEventListener("click", startEvaluationTask);
elements.openTaskView.addEventListener("click", openCurrentEvaluationTask);
elements.markTaskSuccess.addEventListener("click", () => completeEvaluationTask(true));
elements.markTaskFail.addEventListener("click", () => completeEvaluationTask(false));
elements.addMistake.addEventListener("click", () => adjustEvaluationCounter("mistake"));
elements.addBack.addEventListener("click", () => adjustEvaluationCounter("back"));
elements.addTimingMissed.addEventListener("click", () => adjustEvaluationCounter("timingMissed"));
elements.addTimingEarly.addEventListener("click", () => adjustEvaluationCounter("timingEarly"));
elements.addTimingLate.addEventListener("click", () => adjustEvaluationCounter("timingLate"));
elements.addAssist.addEventListener("click", () => adjustEvaluationCounter("assist"));
elements.effortRating.addEventListener("input", (event) => {
  state.evaluation.effortRating = Number(event.target.value);
  saveState();
  renderEvaluation();
});
elements.easeRating.addEventListener("input", (event) => {
  state.evaluation.easeRating = Number(event.target.value);
  saveState();
  renderEvaluation();
});
elements.engagementRating.addEventListener("input", (event) => {
  state.evaluation.engagementRating = Number(event.target.value);
  saveState();
  renderEvaluation();
});
elements.observerNotes.addEventListener("input", (event) => {
  state.evaluation.observerNotes = event.target.value;
  saveState();
});
elements.exportEvaluationCsv.addEventListener("click", exportEvaluationCsv);
elements.resetEvaluation.addEventListener("click", resetEvaluation);
elements.researchEnvironment.addEventListener("change", (event) => {
  state.research.environment = event.target.value;
  saveState();
  renderResearchPlan();
});
elements.deploymentNotes.addEventListener("input", (event) => {
  state.research.deploymentNotes = event.target.value;
  saveState();
});
elements.copyDeploymentNote.addEventListener("click", copyDeploymentNoteToEvaluation);
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

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

window.setInterval(() => {
  if (state.evaluation.taskStartedAt) renderEvaluation();
}, 1000);

window.setInterval(updatePointCursorDom, 200);

render();
switchView(state.currentView);
}
