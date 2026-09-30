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
      <span id="scanState">枠は止まっています</span>
    </div>
    <div class="topbar-actions">
      <!--
        支援者の入口。利用者の走査の輪には入れない（タップ専用）。
        打ち合わせで「設定は支援者しか触らないので端に小さく、ハイライトで
        選べなくてよい」と言われた形のまま（docs/design-renewal-2026-09-25.md §1.3）。
      -->
      <button class="home-supporter-menu" id="homeSupporterMenu" type="button" hidden>
        <i class="fa-solid fa-sliders" aria-hidden="true"></i>
        <span>支援者の設定</span>
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

  <aside id="storageWarning" class="storage-warning" role="status" hidden>
    <p>記録を端末に保存できません。読み込み直す前に生データを書き出してください。</p>
    <div class="action-row wrap">
      <button id="storageExport" class="secondary" type="button">未保存の記録をJSONで書き出す</button>
      <button id="storageRetry" class="secondary" type="button">保存をやり直す</button>
    </div>
  </aside>

  <main>
    <!--
      利用者向けフロー（detailed-design.md §10）: start/home/game/result。
      起動時は必ず #startView から始まる（P1-2、state.js/neuronodeApp.js参照）。
    -->
    <!--
      スタート画面は「はじめる」だけ。以前あった小さな「せってい」は消した——
      打ち合わせで「先に設定しないといけないと思った」と言われた
      （docs/design-renewal-2026-09-25.md §1.2）。支援者はホーム右上から入る。

      見た目は絵＋一言＋「はじめる」だが、当たり判定は画面全体のまま
      （detailed-design.md §2.2。狙って押せない利用者がいる）。
    -->
    <section class="view is-active" id="startView" aria-labelledby="start-title">
      <div class="start-screen">
        <p class="eyebrow">NeuroNode</p>
        <h2 id="start-title" class="sr-only">スタート画面</h2>
        <button class="start-stage" id="startStage" type="button">
          <span class="start-art" id="startArt" aria-hidden="true"></span>
          <span class="start-lead" id="startLead" aria-hidden="true">おして、はじめよう。</span>
          <span class="start-stage-label">はじめる</span>
        </button>
      </div>
    </section>

    <section class="view" id="homeView" aria-labelledby="home-title">
      <div class="home-intro">
        <p class="eyebrow" id="homeEyebrow">Home</p>
        <h2 id="home-title">アクティビティ</h2>
        <p class="home-guide" id="homeGuide">やりたいことを えらびます</p>
        <p class="home-order-note" id="homeOrderNote"></p>
      </div>
      <div class="activity-list" id="gameTileGrid" aria-label="アクティビティの一覧"></div>
    </section>

    <!--
      #gameProgress と #gameExit は #gameStage の**外**に置く。

      ARIA では role="button" の子孫は presentational として扱われる。
      入れ子にしていたころ、iOS Switch Control の項目走査からはゲーム画面が
      「ゲームの入力エリア」1個にしか見えず、「おわる」へ到達できなかった
      （2026-09-14の実機報告。WebKitのARIAスナップショットでも、拾える要素は
      入力エリアとその内側の「おわる」だけだった）。aria-live も同じ理由で
      押し込められる。兄弟に出せば、AXツリーは入力面と「おわる」の2要素になる。

      見た目は変えない。包含ブロックを .game-stage から #gameView へ移し
      （styles.css の position: relative）、同じ座標にオーバーレイし続ける。
    -->
    <section class="view" id="gameView" aria-labelledby="game-title">
      <h2 id="game-title" class="sr-only">ゲーム画面</h2>
      <div class="game-stage" id="gameStage" role="button" tabindex="0" aria-label="ゲームの入力エリア">
        <div class="game-stage-content" id="gameStageContent" aria-hidden="true"></div>
      </div>
      <div class="game-progress" id="gameProgress" aria-live="polite"></div>
      <!--
        この遊びの設定（支援者がその場で変える。docs/design-renewal-2026-09-25.md §1.8）。
        「おわる」と同じく #gameStage の兄弟に置く——入れ子にすると
        role="button" の子孫として AT から見えなくなる（上のコメント参照）。
        変えられる項目のある遊びでだけ出す（games/gameSettings.js）。
      -->
      <div class="game-actions">
        <button class="game-settings" id="gameSettings" type="button" hidden>この遊びの設定</button>
        <button class="game-exit" id="gameExit" type="button">おわる</button>
      </div>
      <div
        class="game-settings-dialog"
        id="gameSettingsDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gameSettingsTitle"
        hidden
      ></div>
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
        <span class="metric-label" id="matchingLabel">お題</span>
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
        <span class="metric-label" id="vocaLabel">選択したことば</span>
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
        <span class="metric-label" id="letterLabel">文字のお題</span>
        <strong id="letterPrompt">「あめ」の最初の文字を選んでください</strong>
      </div>
      <div class="letter-grid" id="letterGrid" aria-label="文字選択肢"></div>
    </section>

    <section class="view" id="log" aria-labelledby="log-title">
      <div class="section-head">
        <div>
          <p class="eyebrow">Evaluation</p>
          <h2 id="log-title">評価ログ</h2>
        </div>
        <!--
          支援者が使うデータ画面はここ1枚にまとめる（2026-08-29）。
          測定手順のUI（効果測定セッション）・操作訓練・研究メモの3画面は
          別紙の手順書に置き換えて削除した。アプリに残すのは、記録を取り出す
          手段と、取り違えを防ぐ手当てだけ。
        -->
        <div class="action-row">
          <button class="secondary" id="exportSessionLedgerCsv" data-scan>セッション台帳</button>
          <button class="secondary" id="exportRhythmCsv" data-scan>リズムCSV</button>
          <button class="secondary" id="exportSlotCsv" data-scan>リールCSV</button>
          <button class="secondary" id="exportScanCsv" data-scan>走査CSV</button>
          <button class="secondary" id="exportRtCsv" data-scan>反応CSV</button>
          <button class="secondary" id="exportRawJson" data-scan>生データ(JSON)</button>
          <button class="secondary" id="exportCsv" data-scan>操作ログCSV</button>
          <button class="danger" id="clearLog" data-scan>ログ削除</button>
          <button class="danger" id="handOverParticipant" data-scan>参加者を切り替える</button>
        </div>
      </div>

      <!--
        参加者ID。全セッションにこの値が焼き付き、成立確認もこれで絞る。
        書き出しの前に必ず目に入る位置へ置く——切り替え忘れは記録から
        見分けられないので、気づける場所に出しておくしかない。
      -->
      <div class="supporter-fields">
          <label class="field-row">
            <span>参加者ID</span>
            <input id="participantId" type="text" inputmode="text" placeholder="例: P001" />
          </label>
      </div>

      <!--
        保存上限（MAX_SESSIONS）の警告。研究データ本体は古い順に消える。
      -->
      <p class="empty-state" id="sessionRetentionWarning" hidden></p>

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
      <!--
        あそびごとのタブ。記録のあるあそびだけを出すと「無い」ことが見えず、
        支援者は「まだ遊んでいない」のか「表示が壊れている」のか分からない。
        全部のあそびを出し、記録が無い回は「データがありません」と言う。

        data-scan は付けない。ここは支援者がタップ／キーボードで使う面で、
        利用者が走査で操作するものではない（ホームの支援者メニュー入口と
        同じ扱い）。走査の輪に入れると、押しても利用者に関係のない項目が
        並ぶだけ増える。
      -->
      <div class="trend-tabs" id="trendTabs" role="tablist" aria-label="あそびを えらぶ"></div>
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
          <p class="eyebrow">支援者の方へ</p>
          <h2 id="settings-title">設定</h2>
        </div>
      </div>

      <!--
        はじめての支援者向けの説明（つかいかた）。打ち合わせで「最初の画面だけでも、
        どのボタンが何をするのか支援者向けに書いてあれば解決しそう」「お母さんに
        渡す簡単な説明書がほしい」と言われた（docs/design-renewal-2026-09-25.md §1.8）。
        いちばん詰まったのは、iPad 本体のスイッチコントロールとこのアプリの関係だった。

        ふだんは閉じておく。開くとタブの面が下へずれるだけで、設定の操作子の数や
        走査（この画面では動かない）には関わらない。
      -->
      <details class="settings-guide" id="settingsGuide">
        <summary>はじめての方へ：つかいかた</summary>
        <ol class="settings-guide-steps">
          <li>
            <strong>つなぐ</strong>
            NeuroNode を iPad にキーボードとしてつなぎます。スイッチを押すと、画面の遊びが進みます。
          </li>
          <li>
            <strong>スイッチコントロールは、ふつうはオフ</strong>
            NeuroNode をそのまま使うときは、iPad 本体の「スイッチコントロール」も、下の
            「iPad のスイッチコントロールを使う」もオフのままにします（このアプリの黄色い枠で選びます）。
            iPad 本体のスイッチコントロールで操作するときだけ、両方をオンにします。
            iPad 本体だけをオンにすると、黄色い枠と iPad の枠が両方出て、うまく選べません。
          </li>
          <li>
            <strong>はじめる</strong>
            最初の画面は「はじめる」だけです。スイッチを1回押すと、遊びを選ぶ画面になります。
          </li>
          <li>
            <strong>遊びを選ぶ</strong>
            黄色い枠が順番に動きます。やりたい遊びに枠が来たら押します。①がいちばんかんたんで、
            番号が大きいほどむずかしくなります。画面を直接さわっても選べます。
          </li>
          <li>
            <strong>遊んでいるとき</strong>
            右上の「この遊びの設定」で、音や速さをその場で変えられます（変えられる遊びだけ）。
            やめるときは「おわる」です。
          </li>
          <li>
            <strong>この画面に来るには</strong>
            遊びを選ぶ画面の右上「支援者の設定」を、指でさわります（スイッチでは来られません）。
            戻るときは「← ホームへ」です。
          </li>
        </ol>
        <!-- 同じ内容を絵つきで、印刷して渡せる形にしたもの（public/guide.html）。
             iPad のアプリ版では別の画面を開けないので、settings.js が隠す。 -->
        <p class="settings-guide-print" id="settingsGuidePrint">
          <a href="./guide.html" target="_blank" rel="noopener">印刷用の説明書（A4・絵つき）を開く</a>
        </p>
      </details>

      <!--
        設定をタブに分ける。
        全部を1ページに並べると 3.4画面ぶん（実測2438px / 720px）になり、
        目的の項目を毎回スクロールして探すことになる。畳む方式も試したが、
        「開いてから探す」が残るので、はじめから面を分ける。

        分けかたは支援者の目的順:
          スイッチ … 利用者が何をどう選ぶか（枠の速さ・ホームに出す遊び）
          見え方・音 … 感覚まわり
          むずかしさ … あそびごとの難易度
          そくてい（研究） … 研究者向けの設定と測定条件

        1面が1画面に収まることを基準に配分した（iPad 実測）。収まっていれば
        探す動作が要らない——タブに分けても面が長ければ、結局スクロールで
        探すことになる。

        タブ自体は何も変更しないので、走査の輪には入れる（利用者が誤って
        押しても設定は変わらず、面が切り替わるだけ）。
      -->
      <div class="settings-tabs" role="tablist" aria-label="設定の分類">
        <button class="settings-tab" role="tab" data-settings-tab="basic" aria-selected="true" data-scan>
          スイッチ
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="senses" aria-selected="false" data-scan>
          見え方・音
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="play" aria-selected="false" data-scan>
          むずかしさ
        </button>
        <button class="settings-tab" role="tab" data-settings-tab="measure" aria-selected="false" data-scan>
          そくてい（研究）
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
      <h3 class="settings-group-title">スイッチで選ぶとき</h3>
      <p class="settings-group-note">
        黄色い枠が順番に動き、枠がある遊びをスイッチで選びます。合う速さは人によって大きく違います。
      </p>

      <div class="settings-grid">
        <label class="setting-row toggle-row">
          <span>
            <strong>iPad のスイッチコントロールを使う</strong>
            <small>ふつうはオフのまま。iPad 本体のスイッチコントロールで操作するときだけオンにします（アプリの黄色い枠は止まります）</small>
          </span>
          <input
            id="switchControlMode"
            type="checkbox"
            role="switch"
            aria-describedby="switchControlModeNotice"
          />
        </label>

        <p class="settings-mode-notice" id="switchControlModeNotice" hidden>
          iPad の「設定」→「アクセシビリティ」→「スイッチコントロール」もオンにしてください。
          このアプリの読み上げは、ここでいったんオフになります（「見え方・音」でオンに戻せます）。
        </p>

        <label class="setting-row">
          <span>
            <strong>枠が動く速さ</strong>
            <small>黄色い枠が次へ動くまでの時間。長くすると、選ぶ時間に余裕ができます</small>
          </span>
          <input id="scanInterval" type="range" min="800" max="3200" step="100" />
          <output id="scanIntervalValue" for="scanInterval">1.6秒</output>
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>枠を自動で動かす</strong>
            <small>画面が変わると、黄色い枠が自動で動き出します。オフにすると枠は止まったままです</small>
          </span>
          <input id="autoScan" type="checkbox" role="switch" data-scan />
        </label>

        <!--
          利用者の画面の下の「おす」ボタン（画面のスイッチ）。既定は出さない
          （docs/design-renewal-2026-09-25.md §3.5）。画面のどこかを押して
          「いまの枠」を決めたい人のためのもの。
        -->
        <!--
          枠が動いたときの音（settings.scanFeedback）。画面を見続けるのが難しい人は、
          音や名前の読み上げで、いまどこに枠があるかが分かる（打ち合わせ §1.7）。
        -->
        <label class="setting-row">
          <span>
            <strong>枠が動いたときの音</strong>
            <small>画面を見るのが難しい人のために、黄色い枠が次へ動くたびに小さな音を出したり、名前を読んだりします</small>
          </span>
          <select id="scanFeedback" data-scan>
            <option value="none">なし</option>
            <option value="tick">小さな音</option>
            <option value="speak">名前を読む</option>
          </select>
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>画面に「おす」ボタンを出す</strong>
            <small>画面のボタンをスイッチのかわりに使う人のためのものです。ふだんは出しません</small>
          </span>
          <input id="showScreenSwitch" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">ホームに出す遊び</h3>

      <div class="settings-grid">
        <label class="setting-row toggle-row">
          <span>
            <strong>画面をよく見る遊びを隠す</strong>
            <small>「リールを止める」と「アームでつかむ」は画面を見続ける遊びです。見るのが難しい人のときは外せます</small>
          </span>
          <input id="hideVisualTasks" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      </div>

      <div class="settings-panel" data-settings-panel="senses" hidden>
      <h3 class="settings-group-title">音と言葉</h3>
      <p class="settings-group-note">
        効果音を切っても、遊びの合図の音（「高い音だけ」の音や、さかなつりのアタリの音など）は
        鳴ります。合図が無いと遊べないためです。
      </p>

      <div class="settings-grid">
        <label class="setting-row toggle-row">
          <span>
            <strong>声で読み上げる</strong>
            <small>説明やほめ言葉（「やったー」など）を声で読み上げます</small>
          </span>
          <input id="speechEnabled" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row">
          <span>
            <strong>読み上げの声の大きさ</strong>
            <small>このアプリの声だけの大きさです（iPad 全体の音量とは別）</small>
          </span>
          <input id="speechVolume" type="range" min="0.2" max="1" step="0.1" />
          <output id="speechVolumeValue" for="speechVolume">100%</output>
        </label>

        <!-- 読み上げの声（settings.speechVoice。src/lib/voicePack.js）。 -->
        <label class="setting-row">
          <span>
            <strong>読み上げの声</strong>
            <small>
              「アプリの声」は、このアプリに入れた自然な声です（日本語・英語とも、ネットが無くても同じ声）。
              「端末の声」は、iPad の設定「読み上げコンテンツ」の声です
            </small>
          </span>
          <select id="speechVoice" data-scan>
            <option value="app">アプリの声</option>
            <option value="device">端末の声</option>
          </select>
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>効果音</strong>
            <small>
              押したときの音や拍手（アームの音、水の音、リールの音など）を鳴らします
            </small>
          </span>
          <input id="soundEnabled" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">見え方</h3>
      <p class="settings-group-note">
        遊びの画面の文字は、漢字にふりがなを付けて出します。英語にもできます。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>文字づかい</strong>
            <small>
              遊びの画面の文字。支援者の画面（設定・記録）は日本語のままです
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
            <small>文字を大きくします</small>
          </span>
          <input id="largeText" type="checkbox" role="switch" data-scan />
        </label>

        <label class="setting-row toggle-row">
          <span>
            <strong>くっきり表示</strong>
            <small>枠と文字の色の差を強くします</small>
          </span>
          <input id="highContrast" type="checkbox" role="switch" data-scan />
        </label>

        <!-- 遊びの雰囲気（settings.fxLevel。docs/overall-design-2026-09-28.md §4、
             docs/party-mode-2026-09-29.md）。値は演出の強さのまま——session.config.fxLevel が
             記録に残るので、どの雰囲気で遊んだかが研究の記録から分かる。
             光の点滅・揺れ・粒の数の上限は、どの雰囲気でも同じ。 -->
        <label class="setting-row">
          <span>
            <strong>遊びの雰囲気</strong>
            <small>できたときの紙吹雪や星の量です。「おおさわぎ」は、押すと 出てくる で、なかまのラッコ・押すたびに重なる音楽・大きな数・観客まで出ます。光の点滅は、どの雰囲気でも1秒に3回までです。刺激に弱い人は「すっきり」か「なし」に</small>
          </span>
          <select id="fxLevel" data-scan>
            <option value="none">なし</option>
            <option value="subtle">すっきり</option>
            <option value="normal">にぎやか</option>
            <option value="big">おおさわぎ</option>
          </select>
        </label>
      </div>

      <!-- 録音の素材のクレジット（src/lib/soundCredits.js。views/settings.js が中を描く）。
           CC BY の素材は、アプリの中で見られるところに作者と出典を出すのが使う条件。 -->
      <details class="settings-guide settings-credits" id="soundCredits">
        <summary>このアプリで使っている音の素材</summary>
        <p class="settings-credits-note">
          読み上げの「アプリの声」も、ここにある声で作っています。
          ほかの効果音は、このアプリの中で作っています（録音ではありません）。
        </p>
        <ul class="settings-credits-list" id="soundCreditsList"></ul>
      </details>

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
          変えられません。変えたいときは「そくてい（研究）」タブで「練習」に
          切り替えてください。
        </span>
      </p>

      <h3 class="settings-group-title">リールを止める</h3>
      <p class="settings-group-note">
        練習の回にだけ効きます。測定の回は決まった値です（1周3.2秒・「合った」の広さ0.22秒・
        「ひとつ止める」8回・「3つ止める」4回）。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>リールの速さ</strong>
            <small>絵が1周する時間。短いほど速くなります</small>
          </span>
          <input id="slotCycleMs" type="range" min="2800" max="6000" step="100" data-scan />
          <output id="slotCycleMsValue" for="slotCycleMs">3.2秒</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>「合った」にする広さ</strong>
            <small>目標の真ん中から前後どれくらいまでを「合った」にするか。広いほどやさしくなります</small>
          </span>
          <input id="slotToleranceMs" type="range" min="60" max="220" step="10" data-scan />
          <output id="slotToleranceMsValue" for="slotToleranceMs">0.22秒</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>「ひとつ止める」の回数</strong>
            <small>1本のリールを止める回数です</small>
          </span>
          <input id="slotL1Rounds" type="range" min="3" max="20" step="1" data-scan />
          <output id="slotL1RoundsValue" for="slotL1Rounds">8</output>
        </label>

        <label class="setting-row">
          <span>
            <strong>「3つ止める」の回数</strong>
            <small>1回ごとに、3本を左から順に止めます</small>
          </span>
          <input id="slotL2Rounds" type="range" min="2" max="12" step="1" data-scan />
          <output id="slotL2RoundsValue" for="slotL2Rounds">4</output>
        </label>
      </div>

      <h3 class="settings-group-title">高い音だけ</h3>
      <p class="settings-group-note">
        練習の回にだけ効きます。測定の回と「押すタイミングの測定」は、決まった条件で行います。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>音の速さ（テンポ）</strong>
            <small>1分に鳴る音の数。ゆっくりなほど、やさしくなります</small>
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
            <strong>1回に鳴る音の数</strong>
            <small>1回の遊びで鳴る音の数。長くも短くもできます</small>
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
          通常練習で流れるノートを出すか。ONが制御するのは、ノートが
          判定面へ流れる「次の拍の予告」だけ。押したあとのずれ目盛り（KR）は、
          ON/OFFどちらの版面にも残り、未来の拍は示さない。

          既定ON。ふだんの練習は本格的なリズムゲームとして取り組めるようにする。
          OFFの練習と measure / calibration は、未来ノートを作らない予告なし計器盤。
          実際に効いた visualGuidance / visualPresentation はセッションごとに記録され、
          visualGuidance と difficultyMode は評価ログとリズムCSVにも出る。
        -->
        <label class="setting-row toggle-row">
          <span>
            <strong>次の音が来る場所を画面に出す</strong>
            <small>
              練習では、次の音が来る場所を画面に出します（練習の既定）。切ると、
              押したあとの「はやい／おそい」だけを出します。測定の回と「押すタイミングの測定」では
              自動で切れます
            </small>
          </span>
          <input id="visualGuidance" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">アームでつかむ</h3>
      <p class="settings-group-note">
        変えた値は、次に始めるときから効きます。どの設定で遊んだかは記録に残ります。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>アームの速さ</strong>
            <small>アームが端から端まで動く時間。短いほど速く、狙うのが難しくなります</small>
          </span>
          <input id="craneSweepMs" type="range" min="800" max="6000" step="100" data-scan />
          <output id="craneSweepMsValue" for="craneSweepMs">2.2秒</output>
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
            <strong>1回にアームを下ろす回数</strong>
            <small>1回の遊びでアームを下ろす回数。短くも長くもできます</small>
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
            <strong>ねらいの上で音を鳴らす</strong>
            <small>
              アームがねらいの上を通ったとき、小さい音で知らせます。画面を見続けるのが
              難しいときに。入れると耳だけでも遊べるぶん、目で追う練習にはなりません
            </small>
          </span>
          <input id="craneAudioGuidance" type="checkbox" role="switch" data-scan />
        </label>
      </div>

      <h3 class="settings-group-title">さかなつり</h3>
      <p class="settings-group-note">
        練習の回にだけ効きます。測定の回は決まった条件です。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>アタリが続く長さ</strong>
            <small>魚が食いついてから逃げるまでの時間。長いほど、ゆっくり押しても釣れます</small>
          </span>
          <select id="fishingLimitMs" data-scan>
            <option value="">ふつう（2秒）</option>
            <option value="3000">ながい（3秒）</option>
            <option value="4000">とても ながい（4秒）</option>
            <option value="1400">みじかい（1.4秒）</option>
          </select>
        </label>
      </div>
      </div>

      <div class="settings-panel" data-settings-panel="measure" hidden>
      <div class="supporter-actions">
        <div>
          <strong>押すタイミングの測定（研究用）</strong>
          <span>ホームには出しません。支援者と一緒に行います。</span>
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
            <small>研究用のタブ（操作訓練・効果測定・研究）を出します</small>
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
      <h3 class="settings-group-title">この回は、練習？ 測定？</h3>
      <p class="settings-group-note">
        ふだんは「練習」のままで大丈夫です。研究で測るときだけ「測定」にします。
        どちらだったかは1回ごとに記録されます。
      </p>

      <div class="settings-grid">
        <label class="setting-row">
          <span>
            <strong>練習／測定</strong>
            <small>
              測定にすると、速さや回数などが決まった値になり、変えられなくなります。
              回どうし・人どうしを同じ条件で比べるためです
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
      <span id="toggleScanLabel">枠を動かす</span>
    </button>
    <button class="primary-switch" id="primarySwitch">
      <i class="fa-solid fa-circle" aria-hidden="true"></i>
      <span id="primarySwitchLabel">入力</span>
    </button>
  </footer>
</div>

<div class="sr-only" id="liveRegion" aria-live="assertive"></div>
