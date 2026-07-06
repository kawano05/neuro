<script>
  import { onMount } from "svelte";
  import { initNeuroNodeApp } from "./lib/neuronodeApp.js";

  // P0-0（起動経路の一本化）: このファイルはマークアップ骨格のみを持ち、
  // 状態管理・走査・音声・各画面のロジックはすべて src/lib 配下（分割版）に
  // ある。詳細は detailed-design.md §0 を参照。
  onMount(() => {
    initNeuroNodeApp();
  });
</script>

<div class="app-shell">
  <header class="topbar">
    <div>
      <p class="eyebrow">neuro Web Prototype</p>
      <h1>neuro</h1>
    </div>
    <div class="status-pill" aria-live="polite">
      <span id="scanState">走査停止中</span>
    </div>
  </header>

  <nav class="tabbar" aria-label="主要画面">
    <!--
      支援者の世界（タブ群）から利用者の世界（home）へ戻る導線
      （実機確認2026-07-04で発覚：タブビューへ入ると強制終了以外に戻れなかった。
      basic-design.md §3.2）。走査順の先頭に置き、home/start/result（利用者の
      世界）では neuronodeApp.js の renderAll() が hidden を立てて隠す。
    -->
    <button
      class="home-return"
      id="homeReturn"
      type="button"
      data-scan
      aria-label="ホームへもどる"
    >
      ← ホームへ
    </button>
    <!--
      マッチング・VOCA・文字学習は利用者向けアクティビティなので、タブでは
      なくホームのタイル（#activityTileGrid、views/home.js）から入る。
      タブバーに残るのは支援者機能（評価ログ・設定＋研究者モードの3タブ）のみ。
    -->
    <button class="tab researcher-tab" data-view="operation" data-scan>操作訓練</button>
    <button class="tab researcher-tab" data-view="evaluation" data-scan>効果測定</button>
    <button class="tab researcher-tab" data-view="research" data-scan>研究</button>
    <button class="tab" data-view="log" data-scan>評価ログ</button>
    <button class="tab" data-view="settings" data-scan>設定</button>
  </nav>

  <main>
    <!--
      利用者向けフロー（detailed-design.md §10）: start/home/game/result。
      起動時は必ず #startView から始まる（P1-2、state.js/neuronodeApp.js参照）。
    -->
    <section class="view is-active" id="startView" aria-labelledby="start-title">
      <div class="start-screen">
        <p class="eyebrow">NeuroNode</p>
        <h2 id="start-title" class="sr-only">スタート画面</h2>
        <button class="start-stage" id="startStage" type="button">
          <span class="start-stage-label">はじめる</span>
        </button>
        <button class="start-settings-link" id="startSettingsLink" type="button">せってい</button>
      </div>
    </section>

    <section class="view" id="homeView" aria-labelledby="home-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Choose a game</p>
          <h2 id="home-title">あそびを えらぶ</h2>
        </div>
      </div>
      <div class="module-grid" id="gameTileGrid" aria-label="あそびの一覧"></div>

      <!-- 学習・コミュニケーション系（旧タブのマッチング/VOCA/文字学習）。
           タイルデータは content.js の activityTiles、描画は views/home.js。 -->
      <div class="section-head">
        <div>
          <p class="eyebrow">Learn &amp; communicate</p>
          <h2 id="home-activity-title">まなぶ・つたえる</h2>
        </div>
      </div>
      <div class="module-grid" id="activityTileGrid" aria-label="まなびの一覧"></div>
    </section>

    <section class="view" id="gameView" aria-labelledby="game-title">
      <h2 id="game-title" class="sr-only">ゲーム画面</h2>
      <div class="game-stage" id="gameStage" role="button" tabindex="0" aria-label="ゲームの入力エリア">
        <div class="game-stage-content" id="gameStageContent" aria-hidden="true"></div>
        <div class="game-progress" id="gameProgress" aria-live="polite"></div>
        <button class="game-exit" id="gameExit" type="button">おわる</button>
      </div>
    </section>

    <section class="view" id="resultView" aria-labelledby="result-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Result</p>
          <h2 id="result-title">けっか</h2>
        </div>
      </div>
      <div class="result-stats" id="resultStats" aria-live="polite"></div>
      <!--
        P4-3（detailed-design.md §8.2）: キャリブレーションの結果でのみ表示する
        「候補値を保存しますか」導線。calibrationSaveOffset は支援者のタップ専用
        （data-scan を付けず走査対象から外し、games/gameHost.js が
        pointerdown/click で stopPropagation して入力ファネルにも入れない）。
      -->
      <div class="calibration-offer" id="calibrationOffer" hidden>
        <p id="calibrationOfferText"></p>
        <button class="secondary calibration-save" id="calibrationSaveOffset" type="button">
          この値を保存する
        </button>
      </div>
      <div class="action-row wrap">
        <button class="primary-small" id="resultRetry" type="button" data-scan>もういちど</button>
        <button class="secondary" id="resultHome" type="button" data-scan>メニューへ</button>
      </div>
    </section>

    <section class="view" id="matching" aria-labelledby="matching-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Scan matching</p>
          <h2 id="matching-title">スキャン・マッチング教材</h2>
        </div>
        <button class="secondary" id="nextMatching" data-scan>次の問題</button>
      </div>

      <div class="question-board">
        <span class="metric-label">お題</span>
        <strong id="matchingPrompt">赤いものを選んでください</strong>
      </div>
      <div class="card-grid" id="matchingGrid" aria-label="マッチング選択肢"></div>
    </section>

    <section class="view" id="voca" aria-labelledby="voca-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Fixed phrase VOCA</p>
          <h2 id="voca-title">定型句VOCA</h2>
        </div>
        <button class="secondary" id="repeatPhrase" data-scan>もう一度読む</button>
      </div>

      <div class="message-board" aria-live="polite">
        <span class="metric-label">選択したことば</span>
        <strong id="currentPhrase">まだ選択されていません</strong>
      </div>

      <div class="category-row" id="categoryRow" aria-label="カテゴリ"></div>
      <div class="phrase-grid" id="phraseGrid" aria-label="定型句"></div>
    </section>

    <section class="view" id="letters" aria-labelledby="letters-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Letter learning</p>
          <h2 id="letters-title">文字学習ソフト</h2>
        </div>
        <button class="secondary" id="nextLetter" data-scan>次の問題</button>
      </div>

      <div class="question-board letter-board">
        <span class="metric-label">文字のお題</span>
        <strong id="letterPrompt">「あめ」の最初の文字を選んでください</strong>
      </div>
      <div class="letter-grid" id="letterGrid" aria-label="文字選択肢"></div>
    </section>

    <section class="view" id="operation" aria-labelledby="operation-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">iOS Switch Control training</p>
          <h2 id="operation-title">iOS操作訓練</h2>
        </div>
        <button class="secondary" id="resetOperation" data-scan>訓練記録をリセット</button>
      </div>

      <div class="module-grid" id="operationModeGrid" aria-label="操作訓練の種類"></div>

      <div class="operation-layout">
        <section class="eval-panel">
          <h3 id="operationModeTitle">項目スキャン訓練</h3>
          <p class="operation-guide" id="operationGuide">項目が順番にハイライトされる前提で、目的の項目を選びます。</p>
          <div class="operation-stage" id="operationStage" aria-label="操作訓練ステージ"></div>
          <div class="action-row wrap">
            <button class="primary-small" id="operationPrimary" data-scan>訓練入力</button>
            <button class="secondary" id="nextOperationTarget" data-scan>次の課題</button>
          </div>
        </section>

        <aside class="metrics" aria-label="操作訓練の記録">
          <div>
            <span class="metric-label">試行回数</span>
            <strong id="operationTrials">0</strong>
          </div>
          <div>
            <span class="metric-label">成功率</span>
            <strong id="operationSuccessRate">--</strong>
          </div>
          <div>
            <span class="metric-label">平均ズレ</span>
            <strong id="operationAverageDistance">--</strong>
          </div>
        </aside>
      </div>
    </section>

    <section class="view" id="evaluation" aria-labelledby="evaluation-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Research measurement</p>
          <h2 id="evaluation-title">効果測定セッション</h2>
        </div>
        <div class="action-row">
          <button class="secondary" id="exportEvaluationCsv" data-scan>測定CSV</button>
          <button class="secondary" id="exportRhythmCsv" data-scan>リズムCSV</button>
          <button class="danger" id="resetEvaluation" data-scan>測定リセット</button>
        </div>
      </div>

      <div class="evaluation-grid">
        <section class="eval-panel">
          <h3>セッション情報</h3>
          <label class="field-row">
            <span>参加者ID</span>
            <input id="participantId" type="text" inputmode="text" placeholder="例: P001" />
          </label>
          <label class="field-row">
            <span>条件</span>
            <select id="evaluationCondition">
              <option value="web">Web版</option>
              <option value="native">iOSネイティブ版</option>
              <option value="reference">参照構成</option>
              <option value="optimized">最適化構成</option>
            </select>
          </label>
          <div class="action-row wrap">
            <button class="primary-small" id="startSession" data-scan>セッション開始</button>
            <button class="secondary" id="finishSession" data-scan>セッション終了</button>
          </div>
        </section>

        <section class="eval-panel">
          <h3>現在のタスク</h3>
          <div class="current-task">
            <span class="metric-label" id="evaluationStatus">未開始</span>
            <strong id="currentTaskTitle">セッションを開始してください</strong>
            <p id="currentTaskGuide">研究協力者ごとに同じ順番でタスクを実施します。</p>
          </div>
          <div class="action-row wrap">
            <button class="primary-small" id="startTask" data-scan>タスク開始</button>
            <button class="secondary" id="openTaskView" data-scan>タスク画面へ</button>
            <button class="secondary" id="markTaskSuccess" data-scan>成功で終了</button>
            <button class="danger" id="markTaskFail" data-scan>中止/失敗</button>
          </div>
        </section>
      </div>

      <div class="summary-grid evaluation-summary">
        <div class="summary-tile">
          <span class="metric-label">経過時間</span>
          <strong id="taskElapsed">--</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">入力回数</span>
          <strong id="taskInputs">0</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">誤選択</span>
          <strong id="taskMistakes">0</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">戻り操作</span>
          <strong id="taskBacks">0</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">タイミングエラー</span>
          <strong id="taskTimingErrors">0</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">介助回数</span>
          <strong id="taskAssists">0</strong>
        </div>
      </div>

      <div class="action-row wrap evaluation-counters">
        <button class="secondary" id="addMistake" data-scan>誤選択 +1</button>
        <button class="secondary" id="addBack" data-scan>戻り操作 +1</button>
        <button class="secondary" id="addTimingMissed" data-scan>見逃し +1</button>
        <button class="secondary" id="addTimingEarly" data-scan>早押し +1</button>
        <button class="secondary" id="addTimingLate" data-scan>遅押し +1</button>
        <button class="secondary" id="addAssist" data-scan>介助 +1</button>
      </div>

      <div class="evaluation-grid">
        <section class="eval-panel">
          <h3>主観評価</h3>
          <label class="scale-row">
            <span>負担感</span>
            <input id="effortRating" type="range" min="1" max="5" step="1" />
            <output id="effortRatingValue">3</output>
          </label>
          <label class="scale-row">
            <span>操作しやすさ</span>
            <input id="easeRating" type="range" min="1" max="5" step="1" />
            <output id="easeRatingValue">3</output>
          </label>
          <label class="scale-row">
            <span>集中・関心</span>
            <input id="engagementRating" type="range" min="1" max="5" step="1" />
            <output id="engagementRatingValue">3</output>
          </label>
          <label class="note-row">
            <span>観察メモ</span>
            <textarea id="observerNotes" rows="4" placeholder="例: 走査速度は適切。3問目で見逃しがあった。"></textarea>
          </label>
        </section>

        <section class="eval-panel">
          <h3>タスク一覧</h3>
          <div class="task-list" id="evaluationTaskList"></div>
        </section>
      </div>

      <section class="eval-panel">
        <h3>測定結果</h3>
        <div class="log-list" id="evaluationResultList"></div>
      </section>
    </section>

    <section class="view" id="research" aria-labelledby="research-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Original research design</p>
          <h2 id="research-title">neuro独自要素</h2>
        </div>
      </div>

      <div class="summary-grid research-axis-grid">
        <div class="summary-tile">
          <span class="metric-label">二段階開発</span>
          <strong>Web → iOS</strong>
          <p>Webで高速に試作し、CapacitorでiOS公開候補版へつなげる。</p>
        </div>
        <div class="summary-tile">
          <span class="metric-label">比較条件</span>
          <strong>参照 / 最適化</strong>
          <p>先行Web教材に近い構成と、Switch Control向けに調整した構成を比較する。</p>
        </div>
        <div class="summary-tile">
          <span class="metric-label">実運用</span>
          <strong>共有iPad</strong>
          <p>Guided Access、オフライン動作、単一アプリ運用を確認する。</p>
        </div>
      </div>

      <div class="evaluation-grid">
        <section class="eval-panel">
          <h3>研究条件プロファイル</h3>
          <p class="panel-note">
            効果測定の条件欄と連動させ、Web版/iOS版、参照構成/最適化構成の比較を明確にします。
          </p>
          <div class="condition-profile-grid" id="researchProfileGrid"></div>
        </section>

        <section class="eval-panel">
          <h3>公開候補チェック</h3>
          <div class="readiness-meter">
            <span class="metric-label">実用化準備</span>
            <strong id="readinessScore">0/0</strong>
          </div>
          <div class="readiness-list" id="readinessChecklist"></div>
        </section>
      </div>

      <div class="evaluation-grid">
        <section class="eval-panel">
          <h3>現場運用メモ</h3>
          <label class="field-row">
            <span>利用場面</span>
            <select id="researchEnvironment">
              <option value="hospital">病院</option>
              <option value="facility">施設</option>
              <option value="home">在宅</option>
            </select>
          </label>
          <label class="note-row">
            <span>運用メモ</span>
            <textarea
              id="deploymentNotes"
              rows="4"
              placeholder="例: 共有iPadでアクセスガイドを有効化。支援者が走査間隔を調整。"
            ></textarea>
          </label>
          <button class="secondary" id="copyDeploymentNote" data-scan>観察メモへ反映</button>
        </section>

        <section class="eval-panel research-protocol">
          <h3>計画書からの研究軸</h3>
          <p id="researchProtocolHint">
            Web先行開発、iOSネイティブ化、共有端末運用、App Store公開準備を評価対象に含めます。
          </p>
          <ul class="research-points">
            <li>教材機能だけでなく、変換工程と運用要件を研究対象にする。</li>
            <li>Switch Controlに合わせた要素配置と走査順序を比較する。</li>
            <li>支援者の観察メモを、タスク結果と同じ記録として残す。</li>
          </ul>
        </section>
      </div>
    </section>

    <section class="view" id="log" aria-labelledby="log-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Evaluation</p>
          <h2 id="log-title">評価ログ</h2>
        </div>
        <div class="action-row">
          <button class="secondary" id="exportCsv" data-scan>CSVを書き出す</button>
          <button class="danger" id="clearLog" data-scan>ログ削除</button>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-tile">
          <span class="metric-label">総入力</span>
          <strong id="totalInputs">0</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">正答率</span>
          <strong id="accuracyRate">--</strong>
        </div>
        <div class="summary-tile">
          <span class="metric-label">誤選択</span>
          <strong id="mistakeCount">0</strong>
        </div>
      </div>

      <div class="log-list" id="logList" aria-label="直近の操作ログ"></div>
    </section>

    <section class="view" id="settings" aria-labelledby="settings-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Prototype settings</p>
          <h2 id="settings-title">設定</h2>
        </div>
      </div>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>走査間隔</strong>
            <small>Switch Control相当のハイライト速度</small>
          </span>
          <input id="scanInterval" type="range" min="800" max="3200" step="100" />
          <output id="scanIntervalValue" for="scanInterval">1600ms</output>
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>自動走査</strong>
            <small>画面切り替え後に走査を開始します</small>
          </span>
          <input id="autoScan" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>音声読み上げ</strong>
            <small>定型句やフィードバックを読み上げます</small>
          </span>
          <input id="speechEnabled" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>効果音</strong>
            <small>入力時に短い確認音を鳴らします</small>
          </span>
          <input id="soundEnabled" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>大きい文字</strong>
            <small>共有iPadで見やすい表示にします</small>
          </span>
          <input id="largeText" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>高コントラスト</strong>
            <small>ハイライトと文字の差を強めます</small>
          </span>
          <input id="highContrast" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>研究者モード</strong>
            <small>操作訓練・効果測定・研究タブを表示します</small>
          </span>
          <input id="researcherMode" type="checkbox" role="switch" data-scan />
        </label>
      </div>
    </section>
  </main>

  <footer class="switch-dock">
    <button class="scan-control" id="toggleScan" data-scan>走査開始</button>
    <button class="primary-switch" id="primarySwitch">入力</button>
  </footer>
</div>

<div class="sr-only" id="liveRegion" aria-live="assertive"></div>
