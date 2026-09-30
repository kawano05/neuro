<script>
  import { onMount } from "svelte";
  import SettingsView from "./lib/views/SettingsView.svelte";
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

    <SettingsView />
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
