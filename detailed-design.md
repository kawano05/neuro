# neuro ゲーム基盤リファクタリング 詳細設計書

- 版: 1.1（2026-07-03）レビュー反映（GPT-5.5 Pro 指摘1〜8、iOS最終形態対応を追加）
- 前提: 基本設計書 1.1。本書は実装可能な粒度で各モジュールを規定する。
- 表記: 「MUST」は必須、「SHOULD」は推奨、「MAY」は任意。

---

## 0. P0-0: 起動経路の一本化（最優先・他フェーズの前提）

### 0.1 現状の実態（2026-07-03 調査）

- main.js は App.svelte を mount する。App.svelte は約980行のモノリスで、
  script 部（約560行）に loadState / 走査 / 音 / 全ビューのロジックを自前実装
  しており、**src/lib を一切 import していない**。保存キーは
  `neuro-trainer-state-v1`、状態スキーマも lib 版と異なる（metrics 構造）。
- src/lib 配下（neuronodeApp.js ほか、保存キー v2）はリファクタリングノート
  2026-06-10 の分割成果物だが、**現行の起動経路から呼ばれていない未配線コード**。
- したがって本設計書 §1 以降の変更を lib 側だけに加えても画面には反映されない。

### 0.2 一本化の方針

**分割版（src/lib）を正とする。** 理由: 責務分割済みで拡張の継ぎ目が用意されて
いること、evaluation の27列CSV等の研究機能が lib 側にのみ存在すること、
リファクタリングノートに検証記録があること。

手順:

1. App.svelte の script を「onMount(() => initNeuroNodeApp()) と最小限の
   マークアップ制御」だけに縮退。モノリス実装（v1 の loadState・走査・
   ビューロジック）を削除する。
2. App.svelte のマークアップを dom.js の collectElements() が期待する id 群に
   整合させる（差分があれば dom.js 側を実マークアップに合わせて更新）。
3. リファクタリングノート既知課題 P1「operation / evaluation / research への
   導線がない」をここで解消する: content.js の visibleViews に3画面を追加し、
   タブは設定画面の「研究者モード」トグルで出し分ける（既定 OFF）。
4. 保存データ移行（§9.5）を loadState() に組み込む。
5. `npm run build` と tests/web-smoke.mjs を通す。**このコミットまでは
   挙動保存のリファクタリングとし、ゲーム関連の新規コードを混ぜない**
   （継承/新規のコミット分離規約）。

---

## 1. ディレクトリ・ファイル変更一覧

| パス | 区分 | 内容 |
|---|---|---|
| src/lib/games/registry.js | 新規 | ゲーム定義の配列と検索関数 |
| src/lib/games/gameHost.js | 新規 | ゲームの起動・入力振り分け・終了処理 |
| src/lib/games/judge.js | 新規 | 判定・オフセット計算（純粋関数） |
| src/lib/games/rhythm.js | 新規 | リズムL1/L2（共通エンジン＋パラメータ） |
| src/lib/games/gonogo.js | 新規 | Go・No-Go 課題 |
| src/lib/games/calibration.js | 新規 | キャリブレーション |
| src/lib/games/colorLegacy.js | 新規 | 既存「色変化」の契約ラッパ |
| src/lib/views/home.js | 新規 | スタート画面＋アプリ選択 |
| src/lib/views/switcher.js | 削除 | home.js と colorLegacy.js に分割吸収 |
| src/lib/audio.js | 変更 | createBeatScheduler 追加、playTone の時刻指定版追加 |
| src/lib/content.js | 変更 | storageKey v3、gameModules、rhythmPresets 追加 |
| src/lib/state.js | 変更 | defaultState 拡張（settings 追加・rhythm 追加）、loadState マージ追加 |
| src/lib/neuronodeApp.js | 変更 | 入力ファネル一元化、gameHost 配線、home 初期化 |
| src/lib/scan.js | 変更 | game 中の start/restartIfNeeded ガード、activate の switcher 分岐削除 |
| src/lib/dom.js | 変更 | 新画面の要素登録 |
| src/App.svelte | **大幅変更** | **モノリス script（約560行）を削除しマークアップ骨格＋onMount(initNeuroNodeApp) に縮退（§0）**。スタート画面・アプリ選択・ゲームステージ・リザルトの HTML 追加 |
| src/styles.css | 変更 | ゲームステージ・パルス円・タイルグリッドのスタイル |
| src/lib/views/evaluation.js | 変更 | リズム集計の連動、リズムCSV出力ボタン |
| tests/web-smoke.mjs | 変更 | 新フローのスモーク追加 |
| README.md, docs/ | 変更 | フロー図・運用ノート更新 |

既存の views/matching.js, voca.js, letters.js, operation.js, research.js, log.js,
settings.js は本リファクタでは原則変更しない。

---

## 2. 画面遷移と状態

### 2.1 currentView の拡張

`state.currentView` に以下を追加する（visibleViews との整合を取る）。

| view 値 | 画面 | 走査 |
|---|---|---|
| `start` | スタート画面 | 停止（走査対象なし・全画面が入力） |
| `home` | アプリ選択 | 動作（タイルが [data-scan]） |
| `game` | ゲーム実行中 | **強制停止** |
| `result` | リザルト | 動作（「もういちど」「メニューへ」の2ボタン） |
| `matching` / `voca` / `letters` | 学習・コミュニケーション（home の「まなぶ・つたえる」タイルから遷移。タブではない） | 現行どおり |
| 既存タブ群（log / settings ＋研究者モード3タブ） | 支援者向け | 現行どおり |

初期表示は `start`。ただし再訪時（localStorage に状態あり）でも MUST で `start` から
始める。理由: AudioContext アンロックと入力導通確認を毎回保証するため。
`loadState()` 後に `state.currentView` を強制的に `start` へ上書きする
（現行の「visibleViews にない場合 switcher へ」の分岐を置換）。

### 2.2 スタート画面仕様

- 表示: アプリ名、大きな「はじめる」ステージ（全画面の 60% 以上）、支援者向けの
  小さな「せってい」リンク（走査対象外・タップ専用）。
- スタート表示中はヘッダ・タブバーを非表示にする（`body.start-mode` クラスで
  CSS 制御。renderAll() が `game-mode` と同様に同期する）。支援者のタップ導線は
  「せってい」リンクが残るため、タブへは home 経由でアクセスする。
- スイッチ入力1回で: `audio.unlock()`（§6.1）を呼び、確認音（880Hz）を鳴らし、
  `home` へ遷移。announce「はじめます」。
- この1押しは L0（反応確認）を兼ねるため、logEvent({type:"switch", label:"スタート"})
  を記録する。

### 2.3 アプリ選択画面仕様

- gameModules（§4.1）を order 昇順でタイル表示。タイルは既存 .module-button の意匠を
  流用し、`data-scan` を付与。走査はタブバーを含め現行 scan.js の収集規則のまま。
- `enabled: false` のタイルは「じゅんびちゅう」表示で走査対象から除外
  （disabled 属性を立てれば scan.refresh() のフィルタで自動除外される）。
- タイル決定で gameHost.launch(gameId) を呼ぶ。
- ゲームタイルの下に「まなぶ・つたえる」セクション（#activityTileGrid）を置き、
  matching / voca / letters へのタイルを表示する（content.js の activityTiles、
  描画は views/home.js）。決定で switchView(view) を呼ぶだけで、ゲーム契約
  （§3.1）には乗せない。これらは旧タブバー由来の利用者向けビューで、
  タブバーには支援者機能（log / settings ＋研究者モード3タブ）だけを残す。
  各ビューからの復帰は「← ホームへ」（#homeReturn、走査対象）による。

### 2.4 ゲーム実行画面仕様

- タブバー・走査UI・ヘッダを非表示（`body.game-mode` クラスで CSS 制御）。
- 画面構成: 中央にパルス円（§7.4）、上部にセッション進捗（「のこり 12」等・
  largeText 連動）、右上に支援者用「おわる」ボタン（44px 角以上、タップ専用）。
- 終了条件（いずれか）:
  1. 規定試行数の完了（自動、通常経路）
  2. 支援者の「おわる」タップ、または Esc キー
  3. タブ非アクティブ化（visibilitychange）→ セッションを aborted で確定
- 終了時は必ず module.destroy() → リザルトへ（aborted の場合は home へ直帰）。

### 2.5 リザルト画面仕様

- 表示項目: 達成率（hit / 対象ビート数）、平均オフセット（符号付き ms、
  「はやめ/おそめ」の言い換え併記）、オフセット SD、extra 入力数。
- ボタン2つ（走査対象）: 「もういちど」（同一ゲーム再起動）「メニューへ」。
- speak で達成率を読み上げ（speechEnabled 時）。

---

## 3. ゲームモジュール契約（正式仕様）

### 3.1 型定義

```js
/**
 * @typedef {object} GameModule
 * @property {string} id            一意ID（例 "rhythm-l1"）
 * @property {string} title         タイル表示名（ひらがな主体）
 * @property {string} description   タイル副文
 * @property {number} order         タイル表示順
 * @property {boolean} enabled      false なら「じゅんびちゅう」
 * @property {(ctx: GameCtx) => GameInstance} create
 */

/**
 * @typedef {object} GameInstance
 * @property {(stageEl: HTMLElement) => void} mount
 * @property {(t: number, source: "keyboard"|"pointer") => void} handleInput
 *           t はシェルが計時した performance.now() 値（ms）
 * @property {() => void} destroy   冪等であること（二重呼び出し許容）
 */

/**
 * @typedef {object} GameCtx  gameHost が構築してゲームへ渡す
 * @property {object} settings       state.settings への参照（読み取り専用扱い）
 * @property {object} audio          { speak, playTone, scheduler }（§6）
 * @property {(record) => void} logTrial    1試行の記録（§9.2 の trial 形式）
 * @property {(summary) => void} finish     セッション正常終了（gameHost がリザルトへ）
 * @property {(message) => void} announce   aria-live 通知
 * @property {() => void} abort             異常終了（home へ直帰）
 */
```

### 3.2 ライフサイクル

```
launch(id)
  ├ scan.stop(true)                     // 走査の完全停止
  ├ state.currentView = "game"; renderAll()
  ├ instance = module.create(gameCtx)
  ├ instance.mount(elements.gameStage)
  │    …ゲーム進行（入力は gameHost 経由で handleInput に流入）…
  ├ instance が ctx.finish(summary) を呼ぶ
  ├ gameHost: instance.destroy()
  └ state.currentView = "result"; renderAll(); scan.restartIfNeeded()
```

MUST: destroy() は自分が作った setInterval / requestAnimationFrame /
オシレータ予約をすべて解除する。gameHost は launch 前に前回 instance の
destroy() を必ず呼ぶ（多重起動防止）。

### 3.3 入力ファネル（シェル側一元計時）

neuronodeApp.js のイベント配線を以下に統一する。

```js
function onSwitchInput(event, source) {
  const t = performance.now();            // ← 最初の1行で計時（MUST）
  if (state.currentView === "game") {
    gameHost.dispatchInput(t, source);    // 走査を経由しない
    return;
  }
  if (state.currentView === "start") { views.home.leaveStart(t); return; }
  scan.activate();                        // シェル世界は従来どおり走査経由
}
```

- 対象イベント: **keydown（Space/Enter、event.repeat 無視）・pointerdown・click の
  すべてを受ける（MUST）。** iOS Switch Control や外部スイッチ経由では環境により
  synthetic click のみが届く可能性があるため、pointerdown 単独に寄せない。
- 同一物理入力の多重発火は二層で抑止する（MUST）。pointerdown を受けた入力面は、
  同じ pointer sequence の後続 click を時間差に関係なく1回だけ消費する。これに加えて、
  異なるイベント経路から150ms以内に到着した入力を temporal dedupe で抑止する。
  pointerdown を伴わない click-only の支援技術入力は有効な入力として受理する。

```js
let lastInputAt = -Infinity;
function acceptSwitchEvent(event, source) {
  const t = performance.now();          // dedupe 判定より前に計時（MUST）
  if (t - lastInputAt < 150) return;
  lastInputAt = t;
  onSwitchInput(t, source);
}
```

  注: この150msは近接イベント経路の重複除去であり、利用者の連続入力の抑制ではない。
  長押しではpointerdownからclickまで150msを超えるため、pointer sequenceの抑止を
  省略してはならない
  （対象集団で150ms以内の意図的2連打は現実的に発生せず、NeuroNode 側にも
  信号処理がある）。dedupe 閾値は定数化しコメントで根拠を残す。
- ゲームステージは div ではなく**全画面の button 要素**（最低でも
  role="button" ＋ tabindex="0"）とし、実機の支援技術経由入力に備える。
- 「おわる」ボタンと「せってい」リンクは stopPropagation でファネルに入れない。
- scan.js 内の既存フォールバック（activate() 内の switcher/operation 分岐）から
  switcher 分岐を削除する。

---

## 4. content.js 変更仕様

### 4.1 gameModules（純粋データ部分）

ロジックを持つ create はデータに置かない。content.js には**タイル情報と
プリセット値のみ**を置き、registry.js で create と結合する。

```js
export const storageKey = "neuronode-prototype-state-v3";  // v2 → v3

export const gameTiles = [
  { id: "color-legacy", title: "いろがかわる", description: "おすと いろと おとが かわるよ", order: 1, enabled: true },
  { id: "rhythm-l1",    title: "リズム れんしゅう", description: "おとの あいずに あわせて おそう", order: 2, enabled: true },
  { id: "rhythm-l2",    title: "リズム つづけて", description: "おとに あわせて つづけて おそう", order: 3, enabled: true },
  { id: "gonogo",       title: "たかいおとだけ", description: "たかいおとのとき だけ おそう", order: 4, enabled: true },
  { id: "calibration",  title: "そくてい", description: "しえんしゃと いっしょに つかいます", order: 5, enabled: true },
  { id: "future-slot",  title: "じゅんびちゅう", description: "", order: 6, enabled: false },
];

export const rhythmPresets = {
  "rhythm-l1": { bpm: 40, countInBeats: 3, targetBeats: 10, mode: "cued" },
  "rhythm-l2": { bpm: 60, countInBeats: 4, targetBeats: 20, mode: "continuous" },
  "gonogo":    { bpm: 50, countInBeats: 3, targetBeats: 20, mode: "gonogo", goRatio: 0.6 },
  "calibration": { bpm: 50, countInBeats: 4, targetBeats: 12, mode: "cued" },
};

export const cueTones = { low: 440, high: 880, noGo: 330, hit: 660, miss: 220 };
```

- テーマスキン用の口として、gameTiles に将来 `skin` フィールドを追加できる構造に
  しておく（本リファクタでは未実装。コメントで意図を明記）。

---

## 5. 判定ロジック（games/judge.js）

### 5.1 用語と定数

- 設定判定窓半幅 W₀ = settings.judgmentWindowMs（既定 600、範囲 200〜1500、100 刻み）
- **実効判定窓半幅 W**: 連続系モード（continuous / gonogo）では隣接ビートとの
  窓重複を禁止するため次で制限する（MUST）。cued モード（L1 / calibration）は
  試行間休止があるため W = W₀ のまま。

```js
const beatIntervalMs = 60000 / bpm;
const W = (mode === "cued") ? W0 : Math.min(W0, beatIntervalMs * 0.45);
```

  適用された W はセッション config に effectiveWindowMs として記録する。
  推奨初期値の目安: L1/calibration は 600、L2 は 400〜450、gonogo は 400〜500。
- 窓中心補正 C = settings.baselineOffsetMs（既定 0。キャリブレーション由来 §8.3）
- 生オフセット raw = tInput − tBeat（両方 audio 時間軸に正規化した ms、§6.3）
- 補正後オフセット adj = raw − C

### 5.2 判定関数（純粋関数・単体テスト対象）

```js
/**
 * セッション中の1入力を、未消化ビート列に対して判定する。
 * @returns {{judgment:"hit"|"extra", beatIndex:number|null, raw:number|null, adj:number|null}}
 */
export function judgeInput(tInput, pendingBeats, W, C) { ... }

/**
 * 時刻 now までに窓を通過した未消化ビートの判定を確定する。
 * Go ビート → miss、No-Go ビート → correctRejection。
 * @returns {{beatIndex:number, judgment:"miss"|"correctRejection"}[]}
 */
export function sweepExpired(now, pendingBeats, W, C) { ... }
```

判定分類は5種（MUST）: `hit | miss | extra | commission | correctRejection`

判定規則（MUST）:

1. 入力は「|adj| ≤ W を満たす最近傍の未消化ビート」に割り当てる。
   Go ビートなら judgment = hit、No-Go ビートなら judgment = commission。
   ビートは1入力までしか消費できない（消化済みは対象外）。
2. どのビートにも入らない入力は judgment = extra（beatIndex = null）。
3. tBeat + W + C を now が超えた未消化ビートは、Go なら miss、
   No-Go なら correctRejection（No-Go を正しく見送った成功、入力行なし）。
4. hit の早遅分類: adj < 0 を early、adj ≥ 0 を late とする。
   **early/late は窓内 hit の符号であり失敗ではない。** リザルト画面の文言に
   反映する（例:「はやめに おせたよ」）。evaluation への連動は §9.4 に従い
   失敗系のみとし、early/late は既存 taskTimingEarly/Late へ加算しない。
5. 率の分母（MUST）: goHitRate = hits ÷ Go ビート数、
   commissionRate = commissions ÷ No-Go ビート数。全ビートを分母にしない。

### 5.3 フィードバック音

- hit: cueTones.hit を即時再生（scheduler 経由の即時予約）。
- miss / extra: cueTones.miss を短く小音量で。連続失敗時も音量を上げない
  （罰的フィードバックの禁止。導入訓練の動機づけ配慮）。

---

## 6. 音声基盤（audio.js 拡張）

### 6.1 unlock()

スタート画面の初回入力で呼ぶ。AudioContext を生成し resume() する。
生成済みなら resume() のみ。iOS 制約対応（既存コメント準拠）。

### 6.2 createBeatScheduler(audioContext)

Chris Wilson 方式（two clocks / lookahead）で実装する。

- 定数: LOOKAHEAD_MS = 25（setInterval 周期）、SCHEDULE_AHEAD_S = 0.10
- API:

```js
const scheduler = createBeatScheduler(ctxAudio);
scheduler.start(plan);   // plan: {startAt, beats: [{index, timeS, tone, gain}]}
scheduler.stop();        // 予約済みオシレータの解放を含む
scheduler.now();         // audioContext.currentTime（秒）
```

- start(plan) は現在時刻 + 0.3s を plan.startAt とし、各ビートを
  `osc.start(startAt + beat.timeS)` で先読み予約する。**setInterval の発火時刻を
  音の発生時刻に使ってはならない（MUST NOT）。**
- 各音の包絡は既存 playTone と同型（sine、gain 0.05、~0.18s 減衰）。
  時刻指定版 `playToneAt(freq, atTimeS)` を audio.js に追加し、playTone(freq) は
  playToneAt(freq, now) の別名として残す（既存呼び出しの互換維持）。

### 6.3 時計の対応付け

セッション開始時に1回、対応ペアを取得する。

```js
const anchor = {
  perfMs: performance.now(),
  audioS: audioContext.currentTime,
};
// 入力時刻の変換: tAudioMs = (tPerfMs - anchor.perfMs) + anchor.audioS * 1000
```

- **内部判定は audio 絶対時刻、記録（trials / CSV）はセッション相対時刻**とする
  （MUST）。実装者が迷わないよう変換を一箇所（rhythm.js のセッション文脈）に集約:

```js
const sessionStartAudioMs = anchor.audioS * 1000;

// 内部判定用（絶対・audio軸ms）
const beatAbsMs  = (plan.startAt + beat.timeS) * 1000;
const inputAbsMs = (tPerfMs - anchor.perfMs) + anchor.audioS * 1000;
const rawOffsetMs = inputAbsMs - beatAbsMs;

// 記録用（セッション相対ms）— CSV にはこちらを出す
const scheduledMs = beatAbsMs - sessionStartAudioMs;
const inputMs     = inputAbsMs - sessionStartAudioMs;
```

- audioContext.outputLatency（取得可能なら）と baseLatency をセッション記録に
  参考値として保存する（補正には使わない。§8.3 の役割分担）。

### 6.4 キューの構成（時報パターン）

mode = "cued"（L1）の1試行:

```
[低440] [低440] [低440] [高880]   ← countInBeats=3 の例。高音が押しどころ
   ←──── beatInterval = 60000/bpm ms ────→
```

- 試行間は 1.5 × beatInterval の休止を挟み、targetBeats 回繰り返す。
- mode = "continuous"（L2）: カウントインを最初の1回のみ行い、以後は
  高音が beatInterval ごとに連続する。押しどころ＝毎拍。
- mode = "gonogo": 高音（Go）と低音 330Hz（No-Go）を goRatio で疑似乱数配列に
  する。**乱数列はセッション開始時に生成して全量を記録**（再現性、MUST）。
  連続 No-Go は2回まで（3連続禁止の制約付きシャッフル）。

---

## 7. リズムゲーム本体（games/rhythm.js）

### 7.1 パラメータ解決

優先順位: state.settings のリズム系設定（支援者が調整した値）＞
rhythmPresets[gameId]。settings 側が null のとき preset を使う。

### 7.2 セッション進行

1. mount: プラン生成（ビート列＋乱数列）→ scheduler.start(plan) →
   requestAnimationFrame ループ開始（描画と sweepMisses 用）。
2. rAF ループ毎フレーム: scheduler.now() を取得し、(a) パルス円の位相更新、
   (b) sweepMisses() で期限切れ miss の確定、(c) 進捗表示更新。
3. handleInput(t): §6.3 で変換 → judgeInput() → フィードバック音 →
   ctx.logTrial(record)。
4. 全ビート消化（hit/miss/commission が確定）で ctx.finish(summary)。

### 7.3 一時停止・中断

- visibilitychange で hidden になったら即 scheduler.stop() し、
  セッションを aborted:true で確定（途中再開はしない。計時汚染防止、MUST）。
- 「おわる」/Esc も同様に aborted:true。

### 7.4 視覚補助（最小実装）

- パルス円: 直径 40vmin の単一 div。ビート位相に合わせて scale(0.85→1.0) を
  CSS transition ではなく rAF で transform 更新（音との同期はあくまで見た目、
  判定には使わない）。
- hit で 120ms の発光（box-shadow）、miss では変化なし（罰的演出をしない）。
- highContrast 時は輪郭線を強調。色は stageColors から1色を使用。

---

## 8. キャリブレーション（games/calibration.js）

### 8.1 目的

利用者＋入力系（NeuroNode→iOS→WebView）の基準オフセットを測定し、
判定窓の中心補正 C を提案する。

### 8.2 手順

1. mode="cued"、bpm=50、countIn=4、targetBeats=12 で L1 と同一の課題を実施。
2. 最初の 2 試行は練習として集計から除外（記録はする。excluded:true フラグ）。
3. 有効試行の hit の生オフセットの**中央値**を基準オフセット候補とする
   （外れ値耐性のため平均でなく中央値、MUST）。
4. リザルトに「候補値 XXXms を設定に保存しますか」を表示。保存操作は
   **支援者のタップ専用ボタン**（走査対象外）。保存で
   settings.baselineOffsetMs を更新し logEvent に旧値→新値を残す。

### 8.3 補正の役割分担（研究設計上の要点）

- baselineOffsetMs は**ゲームの体感公平性のための窓中心シフトにのみ**用いる。
- **CSV に出力する raw オフセットからは差し引かない。** raw が測定対象。
  各行に適用中の C を併記し、解析側で必要に応じて補正できるようにする。

### 8.4 走査との連携（二重防御）

calibration を含む全ゲームで gameHost が scan.stop(true) を呼ぶ（§3.2）。
加えて scan.js 側にもガードを入れ、「game 中は絶対に走査しない」を
エンジン自身の不変条件にする（MUST）。renderAll() 等の経路から
restartIfNeeded() が呼ばれても autoScan=ON で再開してしまう事故を防ぐ。

```js
function start() {
  if (ctx.state.currentView === "game") return;  // ガード
  ...
}
function restartIfNeeded() {
  if (ctx.state.currentView === "game") return;  // ガード
  ...
}
```

activate() 内の switcher 分岐削除（§3.3）と合わせ、scan.js の変更はこの3点のみ。

---

## 9. データモデル

### 9.1 state v3 追加分

```js
settings: {
  // 既存6項目に追加
  judgmentWindowMs: 600,
  baselineOffsetMs: 0,
  rhythmBpm: null,          // null = preset 値を使用
  countInBeats: null,
  targetBeats: null,
},
rhythm: {
  sessions: [],             // 直近 50 セッションを保持（超過分は古い順に破棄）
},
```

loadState() のマージ処理に settings 追加キーと rhythm を組み込む
（既存の evaluation / research と同じ防御的マージ方式）。

### 9.2 セッション記録スキーマ

```js
{
  sessionId: "r-20260703-143005-x7",   // r-日時-乱数
  gameId: "rhythm-l1",
  participantId: state.evaluation.participantId,  // 評価セッション連動
  startedAtIso: "...",
  aborted: false,
  config: { bpm, countInBeats, targetBeats, judgmentWindowMs,
            effectiveWindowMs,                // §5.1 の実効値（MUST）
            baselineOffsetMs, mode, goRatio, seedSequence: [...] },
  device: { outputLatencyS: 0.012 | null, baseLatencyS: ..., userAgent: ... },
  trials: [
    { beatIndex: 0, beatKind: "go",          // go | nogo
      scheduledMs: 4500.0,                    // セッション相対（§6.3）
      inputMs: 4562.3 | null,                 // セッション相対。correctRejection/miss は null
      rawOffsetMs: 62.3 | null,
      appliedBaselineMs: 0,
      judgment: "hit",   // hit|miss|extra|commission|correctRejection
      excluded: false },
  ],
  summary: { hits, misses, extras, commissions, correctRejections,
             goHitRate, commissionRate,       // 分母は §5.2 規則5
             meanRawOffsetMs, sdRawOffsetMs, medianRawOffsetMs },
}
```

### 9.3 リズム CSV 仕様

- 出力場所: 評価ビューに「リズムCSV」ボタンを追加（既存 exportCsv と並置、
  BOM 付き UTF-8、escapeCsv 使用、ファイル名 `neuronode-rhythm-YYYY-MM-DD.csv`）。
- 形式: 1試行1行のロング形式。列（18列、この順で固定）:

```
sessionId, participantId, gameId, startedAtIso, aborted,
mode, bpm, countInBeats, judgmentWindowMs, effectiveWindowMs, appliedBaselineMs,
beatIndex, beatKind, scheduledMs, inputMs, rawOffsetMs, judgment, excluded
```

- judgment 列は5値（hit / miss / extra / commission / correctRejection）。
  correctRejection と miss の行は inputMs / rawOffsetMs が空欄。
- summary は CSV に含めない（解析側で再計算可能なため。二重管理を避ける）。

### 9.4 evaluation 連動（失敗系のみ）

**研究の主データはリズム CSV。既存 evaluation は互換維持の補助データとする。**
既存の taskTimingEarly/Late は「タイミングエラー」寄りの意味を持つため、
窓内 hit の早遅（失敗ではない）を流し込むと意味が混線する。よって:

- taskTimingMissed += misses（連動する）
- taskMistakes += commissions + extras（連動する）
- taskTimingEarly / taskTimingLate へは**連動しない**（早遅の傾向分析は
  リズム CSV の rawOffsetMs で行う）
- logEvent({type:"game", label:`${gameId} 終了 go命中率${...}%`})

### 9.5 保存データ移行（v1/v2 → v3）

loadState() は v3 キーが空のとき次の順で移行を試みる（MUST）:

1. `neuronode-prototype-state-v2`（lib 分割版）を読む
2. なければ `neuro-trainer-state-v1`（App.svelte モノリス版）を読む
3. 読めた範囲で settings（同名キーのみ）・logs・evaluation
   （participantId・completedSessions 等、v2 のみ保有）を v3 へ写す。
   v1 の metrics 構造は v3 に対応先がないため移行しない（logEvent に
   「v1 から移行・metrics は引き継ぎ対象外」と記録）
4. rhythm は常に新規初期化
5. 旧キーは削除しない（切り戻し用に残置。容量が問題になった時点で再検討）

---

## 10. UI・スタイル要点

- App.svelte に追加する構造（ID は dom.js に登録）:
  `#startView`（.view）、`#homeView`（.view、#gameTileGrid）、
  `#gameView`（.view、#gameStage、#gameProgress、#gameExit）、
  `#resultView`（.view、#resultStats、#resultRetry、#resultHome）。
- body.game-mode で .tabbar / 走査UI / ヘッダを display:none。
- タイルグリッドは既存 .module-grid / .module-button のスタイルを流用。
- フォントサイズ・コントラストは既存 largeText / highContrast のクラス切替を
  そのまま適用（新規セレクタを既存規約に合わせて追加）。

---

## 11. テスト

### 11.1 単体（新規: tests/judge.test.mjs、node 実行）

judge.js を対象に最低限以下を検証:

1. 窓内入力の最近傍割り当て（2ビート近接時の帰属）
2. 窓外入力 → extra
3. sweepExpired の境界（tBeat+W+C ちょうど）と Go→miss / No-Go→correctRejection の分岐
4. baselineOffsetMs 補正が判定に効き、raw には効かないこと
5. Go・No-Go の commission 判定と goHitRate / commissionRate の分母
6. 1ビート1入力の消費規則
7. 実効判定窓のクランプ（continuous/gonogo で W = min(W₀, 0.45×拍間隔)、
   cued では W = W₀ のまま）
8. 入力 dedupe（150ms 以内の連続イベントが1入力に潰れること）

package.json に `"test:unit": "node tests/judge.test.mjs"` を追加し、
`test` を `test:unit && test:web` に更新。

### 11.2 スモーク（tests/web-smoke.mjs 追加分）

1. 起動 → start 表示 → 入力 → home 表示
2. rhythm-l1 タイル決定 → game 表示・タブバー非表示・走査停止表示
3. Esc で home へ復帰（aborted セッションが rhythm.sessions に記録）
4. 既存タブ（評価・設定）が従来どおり表示される（不退行）

### 11.3 実機確認チェックリスト（docs に追記）

- 内蔵スピーカーでのキュー再生、サイレントスイッチON時の挙動
- NeuroNode（Switch Control 経由）入力での L1 プレイとオフセット記録
- 二重走査が発生しないこと（ゲーム中）

---

## 12. 実装順序（Claude Code 向けタスク分解）

基本設計書 §10 のフェーズに対応。各タスクはビルドが通る単位で刻む。

0. **P0-0**: 起動経路の一本化（§0）。App.svelte のモノリス script 削除、
   initNeuroNodeApp への配線、dom.js と id 群の整合、visibleViews への
   3画面追加＋研究者モードトグル、v1/v2→v3 移行（§9.5）。
   **挙動保存コミットとしてゲームコードを混ぜない**
1. **P0-1**: content.js に storageKey v3 / gameTiles / rhythmPresets / cueTones
2. **P0-2**: state.js に settings 追加・rhythm 追加・マージ処理
3. **P0-3**: games/registry.js（gameTiles と create の結合表、colorLegacy 仮実装）
4. **P1-1**: App.svelte / dom.js / styles.css に新4ビューの器
5. **P1-2**: views/home.js（スタート＋タイルグリッド）、switcher.js 削除、
   neuronodeApp.js の配線差し替え
6. **P1-3**: gameHost.js（launch/destroy/走査停止）＋入力ファネル、
   scan.js の switcher 分岐削除 → color-legacy 通しプレイ確認
7. **P2-1**: audio.js に unlock / playToneAt / createBeatScheduler
8. **P2-2**: games/judge.js ＋ tests/judge.test.mjs
9. **P2-3**: games/rhythm.js（L1）＋リザルト画面 → オフセット記録確認
10. **P3-1**: evaluation.js にリズムCSV出力・タイミング集計連動
11. **P4-1**: rhythm-l2（プリセット違い）
12. **P4-2**: gonogo.js（乱数列生成・commission 判定）
13. **P4-3**: calibration.js（中央値算出・支援者保存導線）
14. **P5-1**: web-smoke 更新、README・docs 更新、
    継承/新規のコミット分離の最終確認

---

## 13. iOS 化対応（P6）

最終形態は Capacitor iOS アプリ（基本設計書 §10）。Web 版と挙動が分かれる
箇所の実装仕様を規定する。

### 14.1 音声セッション（必須）

- AVAudioSession カテゴリを `.playback` に設定し、サイレントスイッチの影響を
  受けずにキュー音を再生する。実装は既存プラグイン
  （例: capacitor-audio-session 系）の採用を第一候補とし、適合しなければ
  最小の自作プラグイン（AppDelegate で setCategory する数行）とする。
- Web 実行時は no-op。Capacitor.isNativePlatform() で分岐し、分岐は
  audio.js の unlock() 内に閉じ込める（MUST）。

### 14.2 CSV 書き出しの経路一本化（必須）

- utils.js に `exportCsvFile(filename, csvString)` を新設し、評価CSV・
  リズムCSVの両方をこの関数経由に統一する。
- 実装: ネイティブ時は @capacitor/filesystem で Cache ディレクトリに書き、
  @capacitor/share で共有シートを開く（AirDrop / ファイル / メール等へ）。
  Web 時は現行の Blob + a[download]。
- BOM 付き UTF-8・escapeCsv の規約は両経路で共通。

### 14.3 保存の write-through ミラー（推奨）

- createStateSaver() を拡張: localStorage への同期保存（現行、主）に加え、
  ネイティブ時は Capacitor Preferences へ非同期でミラー保存する。
- 起動時 loadState(): localStorage が空で Preferences に v3 データがあれば
  復元してから通常のマージへ。API・呼び出し側は無変更（state.js 内で完結）。

### 14.4 測定プロトコル（docs へ、コード変更なし）

docs/measurement-protocol.md を新設し以下を固定する:

1. ゲーム中の入力: NeuroNode はキーボードHID（Space 送出）または
   画面タップのレシピを使用。**Switch Control の項目スキャンは使用しない**
   （OS の選択処理遅延がオフセットに混入するため）。
2. シェル画面: 自前走査 OFF（autoScan=false）＋ Switch Control に委譲、
   または Web 検証時は自前走査 ON。どちらの構成で実施したかを
   evaluation.condition に記録する（既存フィールドを流用）。
3. 音は iPad 内蔵スピーカー固定。Bluetooth 音声機器は使用しない。
4. 画面自動ロックは Guided Access ＋ 自動ロックなしで運用。
5. セッション中の中断（ホーム移動・ロック）はデータ上 aborted となり
  解析から除外されることを支援者に周知。

### 14.5 実機確認への追記

§11.3 のチェックリストに追加:

- サイレントスイッチ ON でもキューが鳴ること（14.1 の検証）
- 共有シート経由で CSV が Files.app に保存できること
- HID レシピでの keydown が入力ファネルに到達すること
  （source="keyboard" で trials に記録されることまで確認）

---

## 14. 未決事項（実装前に確認が必要なもの）

| # | 事項 | 暫定案 |
|---|---|---|
| 1 | future-slot タイルの扱い（非表示 or 準備中表示） | 準備中表示・走査除外 |
| 2 | matching / voca / letters をアプリ選択に統合する時期 | 本リファクタ後の別課題 |
| 3 | gonogo の No-Go 音を 330Hz とするか無音予告つきにするか | 330Hz（弁別しやすさ優先） |
| 4 | セッション保持件数 50 の妥当性（iPad の localStorage 容量） | 50 で開始し実測で調整 |
