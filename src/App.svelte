<script>
  import { onMount } from "svelte";

  const storageKey = "neuro-trainer-state-v1";

  const views = [
    { id: "training", label: "訓練", eyebrow: "Training" },
    { id: "voca", label: "VOCA", eyebrow: "Communication" },
    { id: "records", label: "記録", eyebrow: "Support log" },
    { id: "settings", label: "設定", eyebrow: "Adjust" },
  ];

  const levels = [
    {
      id: "reaction",
      number: 1,
      label: "反応を知る",
      short: "反応",
      goal: "入力と画面反応の対応をつかむ",
      description: "入力するたびに色と音が変わります。ニューロノードの反応を楽に確認する導入訓練です。",
      action: "入力して色を変える",
      coach: "まずは成功体験を作ります。反応が出るまでの姿勢、装着位置、疲れやすさを支援者が見ます。",
    },
    {
      id: "timing",
      number: 2,
      label: "合図で入力",
      short: "合図",
      goal: "待つ、見る、入力する流れを練習する",
      description: "合図が出てから入力します。見逃しや早押しが起きやすい設定を調整できます。",
      action: "合図に合わせて入力",
      coach: "合図後の反応時間を見ます。早押しが多い場合はクールタイム、見逃しが多い場合は走査間隔を調整します。",
    },
    {
      id: "choice",
      number: 3,
      label: "選択する",
      short: "選択",
      goal: "目的の項目を選ぶ操作に慣れる",
      description: "お題に合う選択肢を選びます。項目スキャンに近い練習として使えます。",
      action: "お題の項目を選ぶ",
      coach: "ボタンの数、サイズ、間隔が合っているかを見ます。誤選択が続く場合は選択肢を減らします。",
    },
    {
      id: "message",
      number: 4,
      label: "伝える",
      short: "伝達",
      goal: "定型句で意思表示する",
      description: "病院・施設で使いやすい短いことばを選び、音声読み上げで伝えます。",
      action: "ことばを選んで伝える",
      coach: "訓練から実利用へつなげる段階です。本人が使いたい語句を優先表示できるか確認します。",
    },
  ];

  const stageColors = ["#147d78", "#247a4d", "#315f9d", "#8a6f19", "#b84a4a"];

  const choiceTasks = [
    {
      prompt: "「水」を選んでください",
      answer: "水",
      options: ["はい", "水", "休む", "戻る"],
    },
    {
      prompt: "「痛い」を選んでください",
      answer: "痛い",
      options: ["眠い", "痛い", "寒い", "暑い"],
    },
    {
      prompt: "「ナースコール」を選んでください",
      answer: "ナースコール",
      options: ["ありがとう", "水", "ナースコール", "家族"],
    },
  ];

  const phraseCategories = {
    基本: ["はい", "いいえ", "もう一度", "わかりません", "ありがとう", "待ってください"],
    体調: ["痛いです", "寒いです", "暑いです", "眠いです", "休みたいです", "水がほしいです"],
    介助: ["姿勢を変えてください", "トイレに行きたいです", "吸引してください", "家族に連絡してください", "ナースコール", "外に出たいです"],
  };

  const buttonScaleLabels = {
    1: "標準",
    2: "大きめ",
    3: "最大",
  };

  const defaultState = {
    activeView: "training",
    activeLevel: "reaction",
    activeCategory: "基本",
    colorStep: 0,
    choiceIndex: 0,
    selectedPhrase: "",
    profileName: "",
    sessionPlace: "病院",
    settings: {
      scanInterval: 1600,
      inputLockMs: 900,
      buttonScale: 2,
      autoScan: false,
      soundEnabled: true,
      speechEnabled: true,
      highContrast: false,
      largeText: true,
    },
    metrics: {
      totalInputs: 0,
      successes: 0,
      mistakes: 0,
      timingInputs: 0,
      timingSumMs: 0,
      lastReactionMs: null,
      lockedInputs: 0,
    },
    logs: [],
    supportNote: "",
  };

  let state = loadState();
  let scanTargets = [];
  let scanIndex = -1;
  let scanTimer = null;
  let cueActive = false;
  let cueWaiting = false;
  let cueStartedAt = null;
  let cueTimer = null;
  let lastInputAt = 0;
  let toast = "訓練を開始できます";
  let mounted = false;
  let audioContext;

  $: activeView = views.find((view) => view.id === state.activeView) || views[0];
  $: activeLevel = levels.find((level) => level.id === state.activeLevel) || levels[0];
  $: currentChoiceTask = choiceTasks[state.choiceIndex % choiceTasks.length];
  $: phrases = phraseCategories[state.activeCategory] || phraseCategories.基本;
  $: stageColor = stageColors[state.colorStep % stageColors.length];
  $: averageTiming = state.metrics.timingInputs
    ? Math.round(state.metrics.timingSumMs / state.metrics.timingInputs)
    : null;
  $: successRate = state.metrics.totalInputs
    ? Math.round((state.metrics.successes / state.metrics.totalInputs) * 100)
    : null;
  $: recommendation = buildRecommendation();

  onMount(() => {
    mounted = true;
    applyBodyClasses();
    refreshScanTargets();
    if (state.settings.autoScan) startScan();

    const handleKeydown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
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
    };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", refreshScanTargets);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("resize", refreshScanTargets);
      stopScan();
      clearCueTimer();
    };
  });

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return cloneDefaultState();
      const parsed = JSON.parse(raw);
      return {
        ...cloneDefaultState(),
        ...parsed,
        settings: { ...defaultState.settings, ...(parsed.settings || {}) },
        metrics: { ...defaultState.metrics, ...(parsed.metrics || {}) },
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      };
    } catch {
      return cloneDefaultState();
    }
  }

  function cloneDefaultState() {
    return JSON.parse(JSON.stringify(defaultState));
  }

  function commit(message) {
    state = { ...state };
    localStorage.setItem(storageKey, JSON.stringify(state));
    applyBodyClasses();
    if (message) toast = message;
    window.setTimeout(refreshScanTargets, 0);
  }

  function applyBodyClasses() {
    if (!mounted) return;
    document.body.classList.toggle("large-text", state.settings.largeText);
    document.body.classList.toggle("high-contrast", state.settings.highContrast);
    document.body.dataset.buttonScale = String(state.settings.buttonScale);
  }

  function setView(viewId) {
    state.activeView = viewId;
    clearCue();
    commit(`${views.find((view) => view.id === viewId)?.label || "画面"}を表示しました`);
    restartScanIfNeeded();
  }

  function setLevel(levelId) {
    state.activeLevel = levelId;
    clearCue();
    addLog("level", `${levels.find((level) => level.id === levelId)?.label || "訓練"}に切り替え`, true, false);
    commit(`${activeLevel.label}の訓練に切り替えました`);
    restartScanIfNeeded();
  }

  function handleTrainingInput() {
    if (isInputLocked()) return;
    lastInputAt = Date.now();

    if (state.activeLevel === "reaction") {
      state.colorStep += 1;
      recordInput(true);
      playTone(520 + state.colorStep * 24);
      speak("入力できました");
      addLog("training", "反応入力", true);
      commit("入力できました。色が変わりました");
      return;
    }

    if (state.activeLevel === "timing") {
      if (!cueActive) {
        state.metrics.mistakes += 1;
        recordInput(false, false);
        playTone(220);
        addLog("timing", cueWaiting ? "合図前の入力" : "合図なしの入力", false);
        commit(cueWaiting ? "まだ合図前です。待つ練習として記録しました" : "先に「合図を出す」を押してください");
        return;
      }

      const reactionMs = Date.now() - cueStartedAt;
      state.metrics.timingInputs += 1;
      state.metrics.timingSumMs += reactionMs;
      state.metrics.lastReactionMs = reactionMs;
      clearCue();
      recordInput(true);
      playTone(660);
      speak("入力できました");
      addLog("timing", `合図後 ${reactionMs}ms`, true);
      commit(`合図後 ${reactionMs}ms で入力できました`);
      return;
    }

    if (state.activeLevel === "choice") {
      commit("選択肢からお題の項目を選びます");
      return;
    }

    if (state.activeLevel === "message") {
      if (state.selectedPhrase) {
        speak(state.selectedPhrase);
        playTone(560);
        addLog("message", `再読み上げ: ${state.selectedPhrase}`, true);
        commit(`「${state.selectedPhrase}」をもう一度読み上げました`);
      } else {
        commit("VOCA画面でことばを選んでください");
      }
    }
  }

  function beginCue() {
    clearCue();
    cueWaiting = true;
    toast = "待ってください。まもなく合図が出ます";
    cueTimer = window.setTimeout(() => {
      cueWaiting = false;
      cueActive = true;
      cueStartedAt = Date.now();
      playTone(740);
      speak("いまです");
      toast = "いま入力してください";
    }, 900);
  }

  function chooseOption(option) {
    if (isInputLocked()) return;
    lastInputAt = Date.now();
    const correct = option === currentChoiceTask.answer;
    if (correct) {
      state.choiceIndex = (state.choiceIndex + 1) % choiceTasks.length;
    } else {
      state.metrics.mistakes += 1;
    }
    recordInput(correct);
    playTone(correct ? 690 : 240);
    speak(correct ? "正解です" : "違います");
    addLog("choice", option, correct);
    commit(correct ? `正解です。「${option}」を選びました` : `「${option}」は違います`);
    restartScanIfNeeded();
  }

  function selectPhrase(phrase) {
    if (isInputLocked()) return;
    lastInputAt = Date.now();
    state.selectedPhrase = phrase;
    recordInput(true);
    speak(phrase);
    playTone(560);
    addLog("message", phrase, true);
    commit(`「${phrase}」を選びました`);
  }

  function recordInput(success, countSuccess = true) {
    state.metrics.totalInputs += 1;
    if (success && countSuccess) state.metrics.successes += 1;
  }

  function isInputLocked() {
    const elapsed = Date.now() - lastInputAt;
    if (elapsed < state.settings.inputLockMs) {
      state.metrics.lockedInputs += 1;
      commit("連続入力を防止しました");
      return true;
    }
    return false;
  }

  function addLog(type, label, success = true, save = true) {
    const level = levels.find((item) => item.id === state.activeLevel);
    state.logs.unshift({
      at: new Date().toISOString(),
      type,
      label,
      success,
      level: level?.label || "",
      scanInterval: state.settings.scanInterval,
      inputLockMs: state.settings.inputLockMs,
      place: state.sessionPlace,
      profileName: state.profileName,
    });
    state.logs = state.logs.slice(0, 120);
    if (save) commit();
  }

  function saveSupportNote() {
    const text = state.supportNote.trim();
    if (!text) {
      toast = "メモを入力してください";
      return;
    }
    addLog("note", text, true);
    state.supportNote = "";
    commit("支援者メモを記録しました");
  }

  function resetSession() {
    state.metrics = cloneDefaultState().metrics;
    state.logs = [];
    state.colorStep = 0;
    state.choiceIndex = 0;
    state.selectedPhrase = "";
    clearCue();
    commit("セッション記録をリセットしました");
  }

  function exportCsv() {
    if (!state.logs.length) {
      toast = "書き出す記録がありません";
      return;
    }
    const rows = [
      ["time", "type", "level", "label", "success", "scanInterval", "inputLockMs", "place", "profileName"],
      ...state.logs.map((entry) => [
        entry.at,
        entry.type,
        entry.level,
        entry.label,
        entry.success,
        entry.scanInterval,
        entry.inputLockMs,
        entry.place,
        entry.profileName,
      ]),
    ];
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuro-training-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function updateSetting(key, value) {
    state.settings[key] = value;
    commit("設定を更新しました");
    if (key === "scanInterval" && scanTimer) startScan();
    if (key === "autoScan") restartScanIfNeeded();
  }

  function clearCueTimer() {
    if (cueTimer) {
      window.clearTimeout(cueTimer);
      cueTimer = null;
    }
  }

  function clearCue() {
    clearCueTimer();
    cueWaiting = false;
    cueActive = false;
    cueStartedAt = null;
  }

  function refreshScanTargets() {
    if (!mounted) return;
    const activeSection = document.querySelector(".view.is-active");
    scanTargets = [
      ...document.querySelectorAll(".tabbar [data-scan]"),
      ...(activeSection ? [...activeSection.querySelectorAll("[data-scan]")] : []),
      ...document.querySelectorAll(".switch-dock [data-scan]"),
    ].filter((target) => {
      const rect = target.getBoundingClientRect();
      return !target.disabled && rect.width > 0 && rect.height > 0;
    });
    if (scanIndex >= scanTargets.length) scanIndex = scanTargets.length ? 0 : -1;
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
    toast = "走査中です。入力ボタンで選択できます";
  }

  function stopScan(clearFocus = true) {
    if (scanTimer) {
      window.clearInterval(scanTimer);
      scanTimer = null;
    }
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
    if (scanTargets.length && scanIndex >= 0) {
      const target = scanTargets[scanIndex];
      target.click();
      return;
    }
    handleTrainingInput();
  }

  function toggleScan() {
    if (scanTimer) {
      stopScan();
      toast = "走査を停止しました";
    } else {
      startScan();
    }
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
    if (!state.settings.soundEnabled) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
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
      // Audio feedback is optional in embedded browsers.
    }
  }

  function buildRecommendation() {
    if (state.metrics.mistakes >= 3) {
      return "誤選択が増えています。選択肢を減らす、ボタンサイズを上げる、走査間隔を少し長くする候補です。";
    }
    if (state.metrics.lockedInputs >= 3) {
      return "連続入力防止が多く働いています。入力後待機時間が長すぎないか、本人の入力リズムと合わせて確認してください。";
    }
    if (averageTiming && averageTiming > 2200) {
      return "合図後の入力がゆっくりです。合図表示を強くする、走査間隔を長めにする候補です。";
    }
    if (state.metrics.totalInputs >= 8 && successRate >= 80) {
      return "安定して入力できています。次のレベル、またはVOCAで実用語句の練習に進めます。";
    }
    return "まずはレベル1で入力しやすい姿勢と装着位置を確認し、反応が安定したらレベル2へ進みます。";
  }

  function escapeCsv(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function formatTime(isoString) {
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(isoString));
  }
</script>

<div class="app-shell">
  <header class="topbar">
    <div class="brand-block">
      <p class="eyebrow">NeuroNode training app</p>
      <h1>neuro trainer</h1>
      <p>ニューロノード導入時の「できた」を積み上げる訓練アプリ</p>
    </div>
    <div class="session-card" aria-live="polite">
      <span>現在の段階</span>
      <strong>Lv.{activeLevel.number} {activeLevel.label}</strong>
      <small>{scanTimer ? "走査中" : "走査停止中"} / {state.settings.scanInterval}ms</small>
    </div>
  </header>

  <nav class="tabbar" aria-label="主要画面">
    {#each views as view}
      <button
        class:is-active={state.activeView === view.id}
        class="tab"
        type="button"
        data-view={view.id}
        data-scan
        onclick={() => setView(view.id)}
      >
        <span>{view.eyebrow}</span>
        {view.label}
      </button>
    {/each}
  </nav>

  <main>
    <section class:is-active={state.activeView === "training"} class="view training-view" id="training">
      <div class="section-head">
        <div>
          <p class="eyebrow">Step training</p>
          <h2>段階式トレーニング</h2>
        </div>
        <p class="section-copy">支援者が横で見ながら、反応確認から意思表示まで少しずつ進めます。</p>
      </div>

      <div class="training-layout">
        <aside class="level-rail" aria-label="訓練レベル">
          {#each levels as level}
            <button
              class:is-active={state.activeLevel === level.id}
              class="level-card"
              type="button"
              data-scan
              onclick={() => setLevel(level.id)}
            >
              <span>Level {level.number}</span>
              <strong>{level.label}</strong>
              <small>{level.goal}</small>
            </button>
          {/each}
        </aside>

        <section class="stage-panel">
          <div class="stage-header">
            <div>
              <p class="eyebrow">Level {activeLevel.number}</p>
              <h3>{activeLevel.action}</h3>
            </div>
            {#if state.activeLevel === "timing"}
              <button class="secondary" type="button" data-scan onclick={beginCue}>
                合図を出す
              </button>
            {/if}
          </div>

          {#if state.activeLevel === "choice"}
            <div class="prompt-board">
              <span>お題</span>
              <strong>{currentChoiceTask.prompt}</strong>
            </div>
            <div class="choice-grid">
              {#each currentChoiceTask.options as option}
                <button class="choice-button" type="button" data-scan onclick={() => chooseOption(option)}>
                  {option}
                </button>
              {/each}
            </div>
          {:else if state.activeLevel === "message"}
            <div class="prompt-board">
              <span>選択中のことば</span>
              <strong>{state.selectedPhrase || "VOCA画面でことばを選びます"}</strong>
            </div>
            <button class="training-stage message-stage" type="button" data-scan onclick={handleTrainingInput}>
              <span class="stage-symbol">話す</span>
              <strong>選んだことばを読み上げる</strong>
              <small>{activeLevel.description}</small>
            </button>
          {:else}
            <button
              class:is-cue={cueActive}
              class:is-waiting={cueWaiting}
              class="training-stage"
              style={`--stage-color: ${state.activeLevel === "reaction" ? stageColor : "#147d78"}`}
              type="button"
              data-scan
              onclick={handleTrainingInput}
            >
              <span class="stage-symbol">
                {#if state.activeLevel === "timing"}
                  {cueActive ? "今" : cueWaiting ? "待つ" : "合図"}
                {:else}
                  入力
                {/if}
              </span>
              <strong>
                {#if state.activeLevel === "timing"}
                  {cueActive ? "いま入力してください" : cueWaiting ? "合図を待っています" : "合図後に入力します"}
                {:else}
                  入力すると反応します
                {/if}
              </strong>
              <small>{activeLevel.description}</small>
            </button>
          {/if}

          <div class="coach-note">
            <span>支援者の観察ポイント</span>
            <p>{activeLevel.coach}</p>
          </div>
        </section>

        <aside class="insight-panel">
          <div class="metric-tile primary">
            <span>総入力</span>
            <strong>{state.metrics.totalInputs}</strong>
          </div>
          <div class="metric-grid">
            <div class="metric-tile">
              <span>成功率</span>
              <strong>{successRate === null ? "--" : `${successRate}%`}</strong>
            </div>
            <div class="metric-tile">
              <span>誤選択</span>
              <strong>{state.metrics.mistakes}</strong>
            </div>
            <div class="metric-tile">
              <span>平均反応</span>
              <strong>{averageTiming === null ? "--" : `${averageTiming}ms`}</strong>
            </div>
            <div class="metric-tile">
              <span>連続防止</span>
              <strong>{state.metrics.lockedInputs}</strong>
            </div>
          </div>
          <div class="recommendation">
            <span>次の調整候補</span>
            <p>{recommendation}</p>
          </div>
        </aside>
      </div>
    </section>

    <section class:is-active={state.activeView === "voca"} class="view" id="voca">
      <div class="section-head">
        <div>
          <p class="eyebrow">Communication bridge</p>
          <h2>VOCA練習</h2>
        </div>
        <p class="section-copy">訓練の最後に、実際に伝えたいことばへつなげます。</p>
      </div>

      <div class="voca-layout">
        <div class="message-board">
          <span>現在のことば</span>
          <strong>{state.selectedPhrase || "まだ選択されていません"}</strong>
          <button class="secondary" type="button" data-scan onclick={handleTrainingInput}>もう一度読む</button>
        </div>

        <div class="phrase-area">
          <div class="category-row">
            {#each Object.keys(phraseCategories) as category}
              <button
                class:is-active={state.activeCategory === category}
                class="category-button"
                type="button"
                data-scan
                onclick={() => {
                  state.activeCategory = category;
                  commit(`${category}カテゴリを表示しました`);
                  restartScanIfNeeded();
                }}
              >
                {category}
              </button>
            {/each}
          </div>
          <div class="phrase-grid">
            {#each phrases as phrase}
              <button class="phrase-button" type="button" data-scan onclick={() => selectPhrase(phrase)}>
                {phrase}
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section class:is-active={state.activeView === "records"} class="view" id="records">
      <div class="section-head">
        <div>
          <p class="eyebrow">Supporter log</p>
          <h2>支援者記録</h2>
        </div>
        <div class="action-row">
          <button class="secondary" type="button" data-scan onclick={exportCsv}>CSV書き出し</button>
          <button class="danger" type="button" data-scan onclick={resetSession}>記録リセット</button>
        </div>
      </div>

      <div class="records-layout">
        <section class="record-panel">
          <h3>利用者と場面</h3>
          <label class="field-row">
            <span>利用者名/ID</span>
            <input
              value={state.profileName}
              placeholder="例: P001"
              oninput={(event) => {
                state.profileName = event.target.value;
                commit();
              }}
            />
          </label>
          <label class="field-row">
            <span>利用場面</span>
            <select
              value={state.sessionPlace}
              onchange={(event) => {
                state.sessionPlace = event.target.value;
                commit();
              }}
            >
              <option>病院</option>
              <option>施設</option>
              <option>在宅</option>
              <option>デモ</option>
            </select>
          </label>
          <label class="note-row">
            <span>支援者メモ</span>
            <textarea
              rows="5"
              value={state.supportNote}
              placeholder="例: 走査間隔1600msは少し速い。ボタンは大きめが安定。"
              oninput={(event) => {
                state.supportNote = event.target.value;
                commit();
              }}
            ></textarea>
          </label>
          <button class="primary-small" type="button" data-scan onclick={saveSupportNote}>メモを記録</button>
        </section>

        <section class="record-panel">
          <h3>セッション要約</h3>
          <div class="summary-list">
            <div><span>現在レベル</span><strong>Lv.{activeLevel.number} {activeLevel.label}</strong></div>
            <div><span>ボタンサイズ</span><strong>{buttonScaleLabels[state.settings.buttonScale]}</strong></div>
            <div><span>走査間隔</span><strong>{state.settings.scanInterval}ms</strong></div>
            <div><span>入力後待機</span><strong>{state.settings.inputLockMs}ms</strong></div>
          </div>
          <div class="recommendation compact">
            <span>引き継ぎメモの種</span>
            <p>{recommendation}</p>
          </div>
        </section>
      </div>

      <section class="log-panel">
        <h3>最近の記録</h3>
        <div class="log-list">
          {#if state.logs.length === 0}
            <div class="empty-state">まだ記録はありません。訓練入力やメモを行うとここに残ります。</div>
          {:else}
            {#each state.logs as entry}
              <article class:failed={!entry.success} class="log-item">
                <span>{formatTime(entry.at)}</span>
                <strong>{entry.label}</strong>
                <small>{entry.type} / {entry.level || "メモ"}</small>
              </article>
            {/each}
          {/if}
        </div>
      </section>
    </section>

    <section class:is-active={state.activeView === "settings"} class="view" id="settings">
      <div class="section-head">
        <div>
          <p class="eyebrow">NeuroNode tuning</p>
          <h2>訓練設定</h2>
        </div>
        <p class="section-copy">利用者ごとの入力しやすさに合わせます。研究でも会社デモでも説明しやすい調整項目です。</p>
      </div>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>走査間隔</strong>
            <small>項目が次へ移るまでの時間</small>
          </span>
          <input
            type="range"
            min="800"
            max="3200"
            step="100"
            value={state.settings.scanInterval}
            oninput={(event) => updateSetting("scanInterval", Number(event.target.value))}
          />
          <output>{state.settings.scanInterval}ms</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>入力後待機</strong>
            <small>意図しない連続入力を防ぐ時間</small>
          </span>
          <input
            type="range"
            min="300"
            max="2000"
            step="100"
            value={state.settings.inputLockMs}
            oninput={(event) => updateSetting("inputLockMs", Number(event.target.value))}
          />
          <output>{state.settings.inputLockMs}ms</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>ボタンサイズ</strong>
            <small>選択肢とVOCAボタンの大きさ</small>
          </span>
          <input
            type="range"
            min="1"
            max="3"
            step="1"
            value={state.settings.buttonScale}
            oninput={(event) => updateSetting("buttonScale", Number(event.target.value))}
          />
          <output>{buttonScaleLabels[state.settings.buttonScale]}</output>
        </label>

        <label class="setting-row toggle-row">
          <span><strong>自動走査</strong><small>画面遷移後に走査を開始</small></span>
          <input
            checked={state.settings.autoScan}
            type="checkbox"
            role="switch"
            data-scan
            onchange={(event) => updateSetting("autoScan", event.target.checked)}
          />
        </label>

        <label class="setting-row toggle-row">
          <span><strong>音声読み上げ</strong><small>ことばとフィードバックを読み上げ</small></span>
          <input
            checked={state.settings.speechEnabled}
            type="checkbox"
            role="switch"
            data-scan
            onchange={(event) => updateSetting("speechEnabled", event.target.checked)}
          />
        </label>

        <label class="setting-row toggle-row">
          <span><strong>効果音</strong><small>入力時に短い確認音を鳴らす</small></span>
          <input
            checked={state.settings.soundEnabled}
            type="checkbox"
            role="switch"
            data-scan
            onchange={(event) => updateSetting("soundEnabled", event.target.checked)}
          />
        </label>

        <label class="setting-row toggle-row">
          <span><strong>大きい文字</strong><small>共有iPadで見やすい表示</small></span>
          <input
            checked={state.settings.largeText}
            type="checkbox"
            role="switch"
            data-scan
            onchange={(event) => updateSetting("largeText", event.target.checked)}
          />
        </label>

        <label class="setting-row toggle-row">
          <span><strong>高コントラスト</strong><small>ハイライトと文字の差を強める</small></span>
          <input
            checked={state.settings.highContrast}
            type="checkbox"
            role="switch"
            data-scan
            onchange={(event) => updateSetting("highContrast", event.target.checked)}
          />
        </label>
      </div>
    </section>
  </main>

  <footer class="switch-dock" aria-live="polite">
    <button class="scan-control" type="button" data-scan onclick={toggleScan}>
      {scanTimer ? "走査停止" : "走査開始"}
    </button>
    <div class="toast-line">{toast}</div>
    <button class="primary-switch" type="button" data-scan onclick={activateCurrentScanTarget}>入力</button>
  </footer>
</div>
