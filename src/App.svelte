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
    <div class="brand-lockup">
      <i class="fa-solid fa-circle-nodes brand-mark" aria-hidden="true"></i>
      <h1>NEURONODE</h1>
    </div>
    <div class="status-pill" aria-live="polite">
      <span id="scanState">走査停止中</span>
    </div>
    <div class="topbar-actions">
      <button class="home-supporter-menu" id="homeSupporterMenu" type="button" hidden>
        <i class="fa-solid fa-user" aria-hidden="true"></i>
        <span>支援者メニュー</span>
      </button>
    </div>
  </header>

  <nav class="tabbar" aria-label="主要画面">
    <!--
      支援者の世界（タブ群）から利用者の世界（home）へ戻る導線
      （実機確認2026-07-04で発覚：タブビューへ入ると強制終了以外に戻れなかった。
      basic-design.md §3.2）。走査順の先頭に置き、home/start/result（利用者の
      世界）では neuronodeApp.js の renderAll() が hidden を立てて隠す。
    -->
    <!--
      各タブは長い名前と短い名前の両方を持つ。狭い画面では短いほうだけを
      出して1行に収める——2列3行に折り返すと、支援者の画面は上半分が
      ナビゲーションで埋まる（実測: iPhone 14 でヘッダ＋タブ＋ロック説明が
      356px、画面の54%。最初の設定項目は y=772 で折り返しの下だった）。

      横スクロールにはしない。タブは走査対象なので、画面の外に置くと
      「走査対象は必ず画面内」という約束（scanPaging.js）が崩れる。

      aria-label に長いほうを固定するのは、display:none の文字が
      アクセシブル名の計算から外れるため。短縮するのは見た目だけで、
      読み上げは常に正式名称のまま。
    -->
    <button
      class="home-return"
      id="homeReturn"
      type="button"
      data-scan
      aria-label="ホームへもどる"
    >
      <span class="tab-full">← ホームへ</span><span class="tab-short">ホーム</span>
    </button>
    <!--
      マッチング・VOCA・文字学習は利用者向けアクティビティなので、タブでは
      なくホームの「まなぶ・つたえる」二階層から入る。
      タブバーに残るのは支援者機能（評価ログ・設定＋研究者モードの3タブ）のみ。
    -->
    <button class="tab researcher-tab" data-view="operation" data-scan aria-label="操作訓練">
      <span class="tab-full">操作訓練</span><span class="tab-short">訓練</span>
    </button>
    <button class="tab researcher-tab" data-view="evaluation" data-scan aria-label="効果測定">
      <span class="tab-full">効果測定</span><span class="tab-short">測定</span>
    </button>
    <button class="tab researcher-tab" data-view="research" data-scan aria-label="研究">
      <span class="tab-full">研究</span><span class="tab-short">研究</span>
    </button>
    <button class="tab" data-view="log" data-scan aria-label="評価ログ">
      <span class="tab-full">評価ログ</span><span class="tab-short">ログ</span>
    </button>
    <button class="tab" data-view="settings" data-scan aria-label="設定">
      <span class="tab-full">設定</span><span class="tab-short">設定</span>
    </button>
  </nav>

  <!--
    支援者の操作に対する、目に見える返事（ctx.notifySupporter）。
    書き出すデータが1件も無いときなど、押しても何も起きない操作の理由を出す。
    読み上げ側は従来どおり #liveRegion が担当する。
  -->
  <p class="supporter-message" id="supporterMessage" role="status" hidden></p>

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
      <div class="home-intro">
        <p class="eyebrow" id="homeEyebrow">Home</p>
        <h2 id="home-title">アクティビティ</h2>
        <p class="home-guide" id="homeGuide">やりたいことを えらびます</p>
      </div>
      <div class="activity-list" id="gameTileGrid" aria-label="アクティビティの一覧"></div>
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
        <button
          class="secondary calibration-save"
          id="calibrationSaveOffset"
          type="button"
        >
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
        <button class="secondary" id="resetOperation">訓練記録をリセット</button>
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
          <button class="secondary" id="exportScanCsv" data-scan>走査CSV</button>
          <button class="secondary" id="exportRtCsv" data-scan>反応CSV</button>
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

      <!--
        入力オフセットの分布。このアプリの研究上の位置づけそのもの
        （全試行のずれを記録する計測器）なのに、集めた値を通しで見る場所が
        どこにも無く、CSVを書き出して別のツールへ持っていくしかなかった。
        平均とSDは1回ぶんならリザルトに出るが、分布の形は数値2つでは分からない。

        「がめんに 手がかりを出す」を入れていた回は別の山として描く
        （聴覚キューだけへの同期ではないので、混ぜると母集団が違う値が
        1つの山になる。src/lib/offsetDistribution.js）。
      -->
      <section class="eval-panel">
        <h3>入力オフセットの分布</h3>
        <p class="panel-note">
          記録済みのリズム課題から、当たった試行の生オフセット（rawOffsetMs）を
          50msごとに数えたものです。そくていの回と、慣らしの除外試行は含みません。
        </p>
        <div id="offsetDistribution"></div>
      </section>

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

      <!--
        記録済みセッションと、その回に効いていた条件。
        難易度を設定画面から変えられるようにしたので、回ごとに条件が違いうる。
        値は session.config に残るが、これまで state.sessions は CSV 書き出し
        からしか読まれておらず、画面には一度も出ていなかった。
      -->
      <!--
        回を並べた推移。このアプリの目的のひとつが「訓練前後の比較」
        （README）なのに、画面に出ていたのは1回ごとの記録だけで、良く
        なっているかどうかは支援者が数字を目で追って比べるしかなかった。

        条件（テンポ・拍数・つかめる広さ・画面の手がかり）が違う回は別の線に
        する。同じ指標でも測っているものが変わるので、1本にまとめると
        比較にならない（src/lib/sessionTrend.js）。
      -->
      <h3 class="settings-group-title">回ごとの推移</h3>
      <p class="settings-group-note">
        同じ あそび・同じ条件で完走した回だけを、古い順に並べています。
        条件を変えた回は別の線になります。中断した回は含みません。
      </p>
      <div id="sessionTrends" aria-label="セッションの推移"></div>

      <h3 class="settings-group-title">遊びの記録</h3>
      <p class="settings-group-note">
        1回ごとの条件です。設定を変えた回は、ここの値も変わります。
      </p>
      <div class="log-list" id="sessionList" aria-label="記録済みのセッション"></div>

      <h3 class="settings-group-title">操作ログ</h3>
      <div class="log-list" id="logList" aria-label="直近の操作ログ"></div>
    </section>

    <section class="view" id="settings" aria-labelledby="settings-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Prototype settings</p>
          <h2 id="settings-title">設定</h2>
        </div>
      </div>

      <!--
        設定をタブに分ける。
        全部を1ページに並べると 3.4画面ぶん（実測2438px / 720px）になり、
        目的の項目を毎回スクロールして探すことになる。畳む方式も試したが、
        「開いてから探す」が残るので、はじめから面を分ける。

        分けかたは支援者の目的順:
          そうさ … 利用者が何をどう選ぶか（走査の速さ・出す遊び）
          見え方・音 … 感覚まわり
          むずかしさ … あそびごとの難易度
          そくてい … 研究者向けの設定と測定条件

        1面が1画面に収まることを基準に配分した（iPad 実測）。収まっていれば
        探す動作が要らない——タブに分けても面が長ければ、結局スクロールで
        探すことになる。

        タブ自体は何も変更しないので、走査の輪には入れる（利用者が誤って
        押しても設定は変わらず、面が切り替わるだけ）。
      -->
      <div class="settings-tabs" role="tablist" aria-label="設定の分類">
        <button class="settings-tab" role="tab" data-settings-tab="basic" aria-selected="true" data-scan>
          そうさ
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="senses" aria-selected="false" data-scan>
          見え方・音
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="play" aria-selected="false" data-scan>
          むずかしさ
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="measure" aria-selected="false" data-scan>
          そくてい
        </button>
      </div>

      <div class="settings-panel" data-settings-panel="basic">
      <!--
        設定は長らく「トグル8個が1つのグリッドに並ぶ」形だった。走査の速さも
        画面の見え方もあそびの出し分けも同じ面に並ぶので、支援者は目的の項目を
        毎回さがすことになる（スマホでは縦3000px超）。あそびごとの難易度は
        既に見出しで囲ってあるので、全体設定側も同じ規則へ揃える。
        並べ替えているだけで、項目そのものは足しても引いてもいない。
      -->
      <h3 class="settings-group-title">走査（スイッチで選ぶ）</h3>
      <p class="settings-group-note">
        利用者がどう選ぶか。速さは利用者ごとに大きく違うので、いちばん上に置きます。
      </p>

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
      </div>

      <h3 class="settings-group-title">出す遊び</h3>

      <div class="settings-grid">
        <label class="setting-row toggle-row">
          <span>
            <strong>視覚課題を隠す</strong>
            <small>画面注視が必要なUFOキャッチャーをロビーから外します</small>
          </span>
          <input id="hideVisualTasks" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      </div>

      <div class="settings-panel" data-settings-panel="senses" hidden>
      <h3 class="settings-group-title">音と言葉</h3>
      <p class="settings-group-note">
        効果音を切っても、リズムやアタリの合図音は鳴ります。合図は課題そのものなので、
        ここでは止められません。
      </p>

      <div class="settings-grid">
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
            <small>
              押した結果の音（アームの上下や把持、水音やリール）を鳴らします
            </small>
          </span>
          <input id="soundEnabled" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">見え方</h3>
      <p class="settings-group-note">
        文字づかいは利用者に合わせて選びます。ひらがなだけが常にやさしいとは
        限りません——日本語は漢字が語の切れ目を作るので、漢字が読める人には
        漢字のほうが速く読めます。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>文字づかい</strong>
            <small>
              あそびの画面に出る文字。支援者向けの画面（設定・記録・研究）は
              日本語のままです
            </small>
          </span>
          <select id="textMode" data-scan>
            <option value="ruby">漢字＋ふりがな</option>
            <option value="en">English</option>
          </select>
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
      </div>

      </div>

      <div class="settings-panel" data-settings-panel="play" hidden>
      <!--
        そくていの回に、下のむずかしさが効かない理由をその場で出す。出さないと
        「操作子が黙って無効になっている」という、このアプリが何度も直して
        きたのと同じ欠陥になる。

        つまみと**同じ面**に置くこと。切り替えは「そくてい」タブだが、
        効かない操作子を見ているのはこの面なので、理由がここに無いと
        支援者は別の面を探しにいくことになる。
      -->
      <p class="measure-mode-notice" id="measureModeNotice" hidden>
        <i class="fa-solid fa-lock" aria-hidden="true"></i>
        <span>
          いまは「そくてい」の回です。下のむずかしさは決まった値に固定されていて
          変えられません。調整したいときは「そくてい」タブで「練習」に
          切り替えてください。
        </span>
      </p>

      <h3 class="settings-group-title">リズムの難易度</h3>
      <p class="settings-group-note">
        「リズム れんしゅう」「リズム つづけて」「たかいおとだけ」の3つに ききます。
        そくていは 手順を そろえるため 変わりません。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>テンポ</strong>
            <small>1分あたりの拍数。ゆっくりなほど、合わせるのがやさしくなります</small>
          </span>
          <select id="rhythmBpm" data-scan>
            <option value="">あそびごとの既定</option>
            <option value="30">30（とてもゆっくり）</option>
            <option value="40">40</option>
            <option value="50">50</option>
            <option value="60">60</option>
            <option value="80">80（はやめ）</option>
          </select>
        </label>

        <label class="setting-row">
          <span>
            <strong>1回の拍数</strong>
            <small>1セッションで押す回数。長くも短くもできます</small>
          </span>
          <select id="rhythmTargetBeats" data-scan>
            <option value="">あそびごとの既定</option>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
          </select>
        </label>

        <!--
          画面から拍の手がかりを出すか。ONで2つが同時に効く:
            1. 円が次の拍へ向けて「溜める」（＝拍の予告）
            2. 押したあと、ずれの目盛りが「はやい/おそい」を出す（＝KR）

          既定OFF。この課題は聴覚キューへの同期を測る計測器なので、素の状態は
          「手がかりは音だけ」でなければ rawOffsetMs が聴覚同期の指標にならない。
          訓練として使う回だけ支援者がONにする。実際に効いた値はセッションごとに
          記録され、評価ログとリズムCSVにも出る。
        -->
        <label class="setting-row toggle-row">
          <span>
            <strong>がめんに 手がかりを出す</strong>
            <small>
              つぎの拍がくる合図を円で予告し、おしたあと はやい/おそいを見せます。
              練習むけ。切ると、手がかりは音だけになります（測定はこちら。
              そくていは、はじめから出しません）
            </small>
          </span>
          <input id="visualGuidance" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">UFOキャッチャーの難易度</h3>
      <p class="settings-group-note">
        変えた値は、つぎに はじめる ときから ききます。どの ねらいで
        あそんだかは 記録に のこります。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>アームの速さ</strong>
            <small>アームが端から端まで動く時間。短いほど速く、狙うのが難しくなります</small>
          </span>
          <input id="craneSweepMs" type="range" min="800" max="6000" step="100" data-scan />
          <output id="craneSweepMsValue" for="craneSweepMs">2200ms</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>つかめる広さ</strong>
            <small>景品からどれだけずれても掴めるか。大きいほどやさしくなります</small>
          </span>
          <input id="craneToleranceR" type="range" min="4" max="40" step="1" data-scan />
          <output id="craneToleranceRValue" for="craneToleranceR">15</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>1回の回数</strong>
            <small>1セッションでアームを下ろす回数。短くも長くもできます</small>
          </span>
          <input id="craneTargetTrials" type="range" min="3" max="15" step="1" data-scan />
          <output id="craneTargetTrialsValue" for="craneTargetTrials">5</output>
        </label>

        <!--
          目標を通過したときの音。既定OFF。

          ONだと、目標の座標そのものが音になるので、画面を見ずに「音が鳴ったら
          押す」だけで成立する——このあそびが「画面を見る必要がある唯一の課題」
          である前提が崩れる。視覚追従が難しい利用者への配慮としては正当なので
          残してあるが、支援者が必要な回だけ入れる。効いた値は記録に残る。
        -->
        <label class="setting-row toggle-row">
          <span>
            <strong>狙いの通過音</strong>
            <small>
              アームが ねらいの上を通ったとき、小さい音で知らせます。画面を
              見つづけるのが むずかしいときに。入れると、耳だけでも あそべる
              ぶん、目で追う練習にはなりません
            </small>
          </span>
          <input id="craneAudioGuidance" type="checkbox" role="switch" data-scan />
        </label>
      </div>
      </div>

      <div class="settings-panel" data-settings-panel="measure" hidden>
      <div class="supporter-actions">
        <div>
          <strong>入力タイミングの測定</strong>
          <span>利用者ホームには表示せず、支援者と一緒に実施します。</span>
        </div>
        <button class="secondary" id="startCalibration" type="button">
          そくていを始める
        </button>
      </div>

      <h3 class="settings-group-title">研究者向け</h3>

      <div class="settings-grid">
        <label class="setting-row toggle-row">
          <span>
            <strong>研究者モード</strong>
            <small>操作訓練・効果測定・研究タブを表示します</small>
          </span>
          <input id="researcherMode" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <!--
        あそびごとの難易度は、全体設定に混ぜると「どのあそびの話なのか」が
        小さい説明文を読むまで分からない。見出しで囲って所属を先に示す。
        値はセッションの config に記録されるので、どの条件で測ったかは
        走査CSVから追える。
      -->
      <!--
        リズム系の難易度。設定は課題ごとではなく1つなので、「あそびごとの
        既定を使う」という状態が要る。既定は L1=40 / L2=60 / gonogo=50 と
        ばらばらで、スライダーではどれを初期位置にしても嘘になるため、
        既定を選択肢のひとつに持てるプルダウンにしている。

        そくてい（calibration）には効かない。基準オフセットの測定手順そのもの
        で、ここで得た中央値は判定窓の中心補正として全セッションに効く
        （games/rhythm.js の PROTOCOL_LOCKED_GAME_IDS）。
      -->
      <!--
        難易度を「そくてい（研究）」と「れんしゅう（訓練）」の2つに畳む。

        条件を1つずつ記録する方式には限界がある——条件が増えるほど層別すべき
        セルが増え、少ない参加者では空のセルばかりになる。「記録した」ことは
        「交絡が無い」ことを意味しない。名前つきの束にして、解析ではまず
        そくていの回だけを見ればよい状態にする（src/lib/difficultyMode.js）。
      -->
      <h3 class="settings-group-title">この回の使い方</h3>
      <p class="settings-group-note">
        測るための回か、ふだんの練習の回かを選びます。どちらだったかは
        1回ごとに記録され、評価ログとCSVに出ます。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>難易度の決め方</strong>
            <small>
              そくていを選ぶと、テンポ・拍数・つかめる広さ・画面の手がかり・
              通過音・アシストが決まった値に固定され、下の設定は変えられなく
              なります。回どうし・利用者どうしを同じ条件で比べるためです
            </small>
          </span>
          <select id="difficultyMode">
            <option value="practice">練習（訓練・調整できる）</option>
            <option value="measure">測定（研究・固定）</option>
          </select>
        </label>
      </div>

      <!--
        そくていに入る前の成立確認（src/lib/readinessCheck.js）。

        測定を止めるためではなく、止めないなら何が確かめられていないのかを
        言えるようにするために出す。3つのうち通っていないものがあっても
        そくていは選べるが、その回の記録には readiness="overridden" が残り、
        評価ログとCSVに出る。

        判定はれんしゅうの回の記録から自動で読む（自己申告のチェックボックス
        にしない——「できます」という記録は成績と独立でないし、何を根拠に
        そう答えたかが残らない）。そくていを選んでいるときだけ出す:
        れんしゅうの回には関係がなく、常設すると設定画面が長くなるだけ。
      -->
      <div class="readiness-check" id="readinessCheck" hidden>
        <h3 class="settings-group-title">測定の前に（成立確認）</h3>
        <p class="readiness-lead" id="readinessLead"></p>
        <ul class="readiness-list" id="readinessList"></ul>
      </div>

      </div>
    </section>
  </main>

  <footer class="switch-dock">
    <button class="scan-control" id="toggleScan" data-scan>
      <i class="fa-solid fa-circle-stop" aria-hidden="true"></i>
      <span id="toggleScanLabel">走査開始</span>
    </button>
    <button class="primary-switch" id="primarySwitch">
      <i class="fa-solid fa-circle" aria-hidden="true"></i>
      <span id="primarySwitchLabel">入力</span>
    </button>
  </footer>
</div>

<div class="sr-only" id="liveRegion" aria-live="assertive"></div>
