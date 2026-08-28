# neuro ゲーム基盤リファクタリング 基本設計書

- 版: 1.3（2026-08-20）利用者向けリズムL1/L2をslot-v1逐次停止課題へ置換
- 対象リポジトリ: kawano05/neuro（Svelte5 + Vite6 + Capacitor8）
- 対象読者: 実装担当（Claude Code）、卒研指導教員向け説明の下敷き

---

## 1. 背景と目的

### 1.1 背景

現行アプリは先行システム（仙台高専由来のコード）を土台とした Web プロトタイプであり、
反応確認・選択入力・意思表示（VOCA）等の教材ビューを持つ。利用者向け体験は
「スタート画面 → 年齢中立のアクティビティホーム → 各課題」で構成する。2026-08-20の
`slot-v1` では、利用者向けリズムL1/L2を1リール／3リールの視覚逐次停止課題へ置換し、
走査選択、聴覚抑制、単純反応時間の課題と同じ入力基盤上で扱う。

**重要な前提（実装前調査 2026-07-03）**: 現行リポジトリには二重実装が同居している。
実際に動作しているのは App.svelte（約980行のモノリス、保存キー
`neuro-trainer-state-v1`）であり、src/lib 配下の分割アーキテクチャ
（リファクタリングノート 2026-06-10 の成果物、保存キー
`neuronode-prototype-state-v2`）は **main.js → App.svelte の起動経路から
呼ばれていない未配線コード**である。本リファクタは最初のフェーズ（P0-0）で
分割版を正とする起動経路の一本化を行い、その骨格の上にゲーム基盤を築く。

### 1.2 研究上の位置づけ

本アプリは単なるゲーム集ではなく、単一スイッチで実施できる課題系を、
練習と測定に分けて扱う訓練・計測環境である。製品全体は年齢中立とし、
各ゲームは固有の進行と事後結果を持つ。

| 課題系 | taskType | 対象ゲーム | 主要指標 |
|---|---|---|---|
| 視覚停止・逐次入力 | `slot` | slot-l1 / slot-l2 | 絶対ずれ中央値、符号付き平均ずれ、完遂 |
| 抑制 | `gonogo` | gonogo | commissionRate（比率） |
| 走査選択 | `scan` | crane | 目標中心からの距離（画面正規化%） |
| 反応 | `rt` | fishing | 反応時間（ms）・falseStartRate |
| 聴覚同期（互換・補助） | `sms` | calibration、旧rhythmデータ | rawOffsetMs の平均・SD（ms） |

スロット課題では、丸・魚・星・花・鳥・四角の6図形が動く論理位相を入力時刻から求め、
目標中央の最近傍通過との符号付きずれと絶対ずれを全停止で記録する。L2は1入力で
1本だけを左から右へ止め、固定ラウンド数で必ず終了する。測定条件は `slot-v1` と
固定seedで再現し、練習条件のseedも記録する。

`slot-l1`、`slot-l2`、`crane` は視覚必須と明示し、不要な場合は
`hideVisualTasks` で利用者ホームから外す。`gonogo`、`fishing`、
`calibration` は別の聴覚パラダイムとして残す。聴覚baselineは検証なしに
視覚停止へ適用せず、旧 `taskType: sms` と新 `taskType: slot` を同じ集計へ混ぜない。

### 1.3 継承と新規の線引き（論文記載用）

| 区分 | 対象 |
|---|---|
| 継承（先行システム由来・移植） | 走査エンジン（scan.js）、状態永続化の枠組み（state.js）、音声読み上げ、設定項目の思想（走査間隔・高コントラスト等）、支援者向け評価記録（evaluation） |
| 新規開発（本研究の貢献） | ゲームモジュール基盤、入力タイムスタンプの一元化、時刻ベースのslot-v1判定・固定seed出題・逐次停止状態機械、Web Audio課題、課題別計測CSV、v3→v4無損失移行 |

---

## 2. スコープ

### 2.1 やること

1. 利用者向け画面フローを「スタート画面 → アプリ選択 → ゲーム」に保つ
2. ゲームモジュール契約とシェル一元入力時刻を全課題で共用する
3. `slot-l1` / `slot-l2`、純粋判定、固定seed出題、逐次停止状態を実装する
4. Go・No-Go、キャリブレーション、crane、fishing、既存色変化を残す
5. `taskType: slot` セッションとスロット専用CSVを追加し、旧課題CSVを保持する
6. localStorageをv4へ更新し、v3設定・旧SMSセッションを無損失移行する
7. 6図形、停止線、進捗、穏やかな結果を大文字・高コントラスト・狭画面へ対応する
8. 賭博固有語彙、通貨、掛け金、無限継続、人為的な近接失敗を導入しない

### 2.2 やらないこと（非スコープ）

- 視線入力・ポインタ化（拡張研究として言及するのみ）
- 寿司・鬼等の追加テーマスキンを選択・配布する機能。各ゲーム固有の既定テーマと
  視覚的な作り込みは本スコープに含む
- 楽曲・音源ファイルの導入（すべてオシレータ合成音で完結）
- 既存教材ビュー（matching / voca / letters / operation）のゲーム契約への完全移植
  （ビュー実装は現行のまま。matching / voca / letters への入口はホームの
  「まなぶ・つたえる」タイルへ移した — §3.2 参照。ゲーム契約化は将来課題）
- Bluetooth 音声機器対応（内蔵スピーカー運用を前提とし、運用ノートに明記）

---

## 3. システム構成

### 3.1 二つの世界の分離（最重要の設計判断）

アプリを**シェル（走査の世界）**と**ゲーム（走査停止の世界）**に分ける。

- **シェル**: スタート画面・アプリ選択（ゲーム＋まなぶ・つたえるタイル）・
  支援者向けタブ（評価/研究/ログ/設定）。
  複数の選択肢を単一スイッチで選ぶため、自前走査（scan.js）が動作する。
- **ゲーム**: 入場と同時に走査を完全停止し、**画面全体が単一のスイッチ**になる。
  選択肢が存在しないため走査が不要になり、iOS 実機の Switch Control との
  二重走査問題（docs/refactoring-notes 既知課題）もゲーム中は構造的に発生しない。

### 3.2 画面遷移

```
[スタート画面]  … 初回1押しで AudioContext アンロック＋入力導通確認（実質L0）
      │ スイッチ入力
      ▼
[アプリ選択]    … ゲームタイルのグリッド。走査で巡回、スイッチで決定
      │ タイル決定
      ▼
[ゲーム実行]    … 走査停止。全画面スイッチ。規定試行数で自動終了
      │ セッション終了（自動） / 支援者操作（終了ボタン・Esc）
      ▼
[リザルト]      … 成績（達成率・平均オフセット・ばらつき）表示 → アプリ選択へ戻る
```

支援者向けビュー（evaluation / research / log / settings）は既存タブとして残す。
利用者向けの学習・コミュニケーションビュー（matching / voca / letters）は
タブではなくアプリ選択画面の「まなぶ・つたえる」タイルから入る（利用者向け
アクティビティを支援者機能のタブに混在させない）。ビューからの復帰は
「← ホームへ」（走査対象）による。利用者の世界（上図）と支援者の世界（タブ）を
分離する。

### 3.3 モジュール構成（現行 → 変更後）

```
src/lib/
  neuronodeApp.js   … 配線役（ctx構築・入力ファネル追加）        [変更]
  content.js        … 純粋データ（gameModules 定義を追加）        [変更]
  state.js          … 状態 v4、v3移行、taskType別sanitize          [変更]
  slotCsv.js        … スロット専用CSV                              [新規]
  scan.js           … 走査エンジン                                [変更]
  audio.js          … speak/playTone ＋ BeatScheduler             [維持]
  dom.js, utils.js  …                                             [軽微変更]
  games/
    registry.js     … ゲーム一覧と契約の定義
    gameHost.js     … mount/destroy・入力振り分け・slot結果
    slot.js         … L1/L2共通の逐次停止エンジン                  [新規]
    slotJudge.js    … 位相・最近傍通過・seed出題・集計の純粋関数   [新規]
    slotState.js    … スロットセッションの検証・復元               [新規]
    slotArt.js      … 6図形と生成画像の結線                        [新規]
    rhythm.js       … 旧SMSデータ互換のため保持
    gonogo.js       … Go・No-Go
    calibration.js  … キャリブレーション
    pointing.js / crane.js / reaction.js / fishing.js / colorLegacy.js
  views/
    home.js         … スタート画面＋アプリ選択（switcher.js を置換）[新規]
    (switcher.js)   … 削除（機能は home.js と colorLegacy.js に分割吸収）
    その他ビュー     …                                             [残置]
```

---

## 4. ゲームモジュール契約（概要）

すべてのゲームは同一のインターフェースに従う。詳細は詳細設計書 §3。

```js
{
  id: "slot-l1",
  taskType: "slot",
  protocolVersion: "slot-v1",
  create(ctx) {
    return {
      mount(stageEl) {},         // 描画とセッション開始
      handleInput(t, source) {}, // tはシェル計時のperformance.now()
      destroy() {},              // 中断分をaborted:trueで保存して後片付け
    };
  },
}
```

**入力時刻 t はゲームが取らない。シェルが取る。** スイッチイベント（Space/Enter/
ステージタップ）を最初に受けた地点で performance.now() を確定し、契約経由で渡す。
全ゲームが同じ入口を通ることで、入力系遅延の測定条件が課題間で揃う。

---

## 5. アクティビティ構成と訓練段階のマッピング

ホームは6項目とし、視覚停止2課題だけを「リールを 止める」の二階層目へまとめる。

| ホーム項目 | 遷移先 | taskType / 役割 | 内容 |
|---|---|---|---|
| いろと おと | color-legacy | L0反応確認 | 押すと色と音が変わる |
| リールを 止める | slot-l1 / slot-l2 | slot / 視覚停止・逐次入力 | 1本または3本を目標中央で止める |
| 高い音だけ | gonogo | gonogo / 聴覚抑制 | Goだけ押し、No-Goを見送る |
| アームを 止める | crane | scan / 視覚走査 | X/Yの2位相走査で目標を選ぶ |
| さかなつり | fishing / fishing-gonogo | rt / 聴覚反応 | 変動前刺激間隔の本アタリへ反応する |
| まなぶ・つたえる | matching / voca / letters | 教材 | ゲーム契約外の既存教材へ入る |

`calibration` は支援者設定から実施する聴覚測定補助で、利用者ホームへ出さない。
旧 `rhythm-l1` / `rhythm-l2` はホームへ出さず、旧セッション復元・CSV確認のため
コードとIDを保持する。スロットとcraneは `visualRequired` とし、
`hideVisualTasks` でカテゴリーごと非表示にする。

---

## 6. 刺激とフィードバック設計（概要）

- スロットの課題刺激は、6図形が一定周期で循環する視覚運動と太い中央停止線である。
- 目標図形は文字名と形の両方で示す。生成PNGは図形一覧の補助で、リール本体は
  CSS形状・アイコンでも識別でき、画像読込失敗が判定値を変えない。
- 入力後だけ控えめな停止音を鳴らせるが、音は判定刺激ではなく、消音でも課題は成立する。
- 通貨、掛け金、配当、777、BAR、ジャックポット、点滅する近接失敗、無限継続を使わない。
- `gonogo`、`fishing`、`calibration` の時報型キューとAudioContext時計は従来どおり
  聴覚課題だけへ使用し、刺激が鳴らせない状態ではセッションを開始しない。

---

## 7. 計時と計測の方針（概要）

1. **入力時刻の正本はシェルの `performance.now()`。** pointerdown、click-only、
   Space/Enterのイベント入口で即時取得し、dedupe後も元の値をゲームへ渡す。
2. スロットの論理位相は、リール開始時刻、入力時刻、`cycleMs`、`initialPhase`
   だけから計算する。`requestAnimationFrame` は表示更新に限定し、フレーム落ちや
   画面リフレッシュレートで停止判定を変えない。
3. 各リールのactive開始から4周期でtimeoutにし、期限後の入力を次リールへ転用しない。
   1停止後300msは入力ロックし、余分な入力を件数として残す。
4. AudioContext時計と聴覚baselineは `gonogo`、`fishing`、`calibration`、
   旧SMS互換経路だけに適用し、視覚停止のslot-v1へ適用しない。

---

## 8. データ設計の方針（概要）

- storageKeyは `neuronode-prototype-state-v4`。v4が無い初回だけv3→v2→v1の順で読み、
  v3の設定、ログ、評価、`taskType: sms` セッションを変換せずv4へコピーする。旧キーは削除しない。
- スロットセッションは `taskType: slot`、`protocolVersion: slot-v1`、
  `engineVersion: 1` と、周期、許容幅、回数、seed、端末、全停止試行を持つ。
- sanitizeは図形ID、順序、位相、判定の再計算整合を検証する。不正試行だけを落とし、
  必要な round/reel が欠ければ完了フラグを取り消す。
- `neuronode-slot-YYYY-MM-DD.csv` は1停止1行・固定28列・BOM付きUTF-8。
  旧リズム、scan、rt、評価CSVは削除せず別ファイルに保つ。
- 既定UIにクレジット・メダル等の価値表現を追加しない。結果は完遂と時間ずれを中立的に示す。

---

## 9. 非機能要件

| 項目 | 要件 |
|---|---|
| 対応環境 | iPad Safari / WKWebView（Capacitor8）、開発時はデスクトップ Chromium |
| オフライン | ビルド時にindex・Viteのコンテンツハッシュ付き資産・manifest・iconを列挙し、Service Workerのinstall時に内容ハッシュ版の不変cacheへprecache。オンライン時はnetwork-firstで最新応答を返し、cacheは次版SWのinstall時に版単位で更新。Capacitorでは登録しない |
| 音声制約 | 聴覚課題は初回入力でAudioContextをアンロックし、鳴らせなければ記録しない。スロットは音なしでも判定・完遂できる |
| アクセシビリティ | largeText / highContrast をゲーム画面とリザルトにも適用。aria-live（announce）は開始・終了等に限定し、毎拍の評価を重ねない。文字4.5:1、主要な非文字UI 3:1以上を満たす |
| 走査・操作 | ゲーム中は自前走査を停止し、ステージ全体を唯一の入力面にする。装飾は走査・フォーカス対象にせず、レディ／リザルトの走査順とボタン順を固定。操作標的は44×44 CSS px以上 |
| 動きを減らす | `prefers-reduced-motion: reduce` では連続スクロール、パララックス、粒子を止める。静止背景、固定ノート枠、輪郭切替、事後スタンプ、段階的進捗でゲームの世界観と状態差は残す |
| 高コントラスト | 色だけで意味を伝えず、形・4px以上の輪郭・数字または短い文字を併用する。装飾を減らしても、目標、判定面、進捗、結果は消さない |
| 844×390横向き | 横844×縦390 CSS pxで、進捗、主操作面、判定面、支援者用終了、リザルトCTAが重ならず到達可能。装飾を先に縮退し、44px標的と主要情報を維持する |
| 計時精度 | slotは入力時刻から論理位相を決め、描画fpsに非依存。聴覚課題のビート予約はAudioContext基準 |
| 既存機能の不退行 | 支援者向けタブ・旧リズムCSV・評価CSV・設定を維持し、slotを含むtests/web-smoke.mjsとPWA更新競合で回帰確認 |
| 誤操作防止 | 設定・記録・研究データの変更はセッション内の支援者編集ロック解除中のみ許可。解除ボタンは自前走査外だがキーボード・VoiceOverから操作可能 |

---

## 10. iOS 最終形態への適合（Capacitor）

本アプリの最終形態は Capacitor による iOS（iPad）アプリであり、Web 版は開発・
検証用の先行形態である。同一の dist/ を WKWebView に載せる方式のため
ロジックは共通だが、以下は iOS で挙動が変わるため設計段階で対応を規定する。

| # | 事項 | 対応 | 時期 |
|---|---|---|---|
| 1 | サイレントスイッチで Web Audio が消音される（音優先設計にとって致命的） | ネイティブ側で AVAudioSession カテゴリを playback に設定する Capacitor プラグインを導入。Web 版は影響なし | iOS化フェーズ必須 |
| 2 | Switch Control 項目スキャン経由の入力は OS の選択処理遅延がオフセット測定に混入する | **測定プロトコルとして規定**: ゲーム中は NeuroNode をキーボードHID（Space）または画面タップのレシピで運用し、項目スキャンを使わない。シェル画面は自前走査OFFで Switch Control に委ねる（参照構成/最適化構成の比較と整合） | docs 運用ノート・実験手順書 |
| 3 | Blob + a[download] の CSV 保存が WKWebView で機能しない（既存評価CSVも同罪） | export 経路を utils.js に一本化し、iOS では Filesystem + Share（共有シート）、Web では現行方式にフォールバック | iOS化フェーズ必須 |
| 4 | localStorage の永続性が研究データの器として心許ない | Capacitor Preferences への write-through ミラー（state.js のみの変更で完結） | iOS化フェーズ推奨 |

計時系（performance.now / AudioContext.currentTime / 先読みスケジューラ）は
WKWebView でも同一に動作するため、Web 版で検証した測定ロジックはそのまま
iOS 版の測定ロジックである。この同一性こそが Web 先行開発を正当化する。

---

## 11. 移行計画（実装フェーズ）

| フェーズ | 内容 | 完了条件 |
|---|---|---|
| P0-0 | **起動経路の一本化**: App.svelte をマークアップ骨格に縮退させ onMount で initNeuroNodeApp を呼ぶ。モノリス script を削除し src/lib 分割版を正とする。v1/v2 保存データの v3 移行処理 | main.js→App.svelte→initNeuroNodeApp が疎通し、npm run build と既存スモークが通る |
| P0 | state v3・games/registry 骨格・content.js に gameModules | ビルドが通り既存機能が動く |
| P1 | シェル改修: スタート画面・アプリ選択（home.js）・gameHost・入力ファネル | color-legacy が新フローで遊べる |
| P2 | BeatScheduler・judge.js・rhythm-l1 | L1 が動きオフセットが記録される |
| P3 | リザルト画面・rhythm CSV 出力・evaluation 連動 | CSV が仕様通り出る |
| P4 | rhythm-l2・gonogo・calibration | 全タイルが動作 |
| P5 | web-smoke 更新・README/docs 更新 | test:web が通る |
| P6 | iOS化対応（§10 の 1・3 必須、4 推奨）＋実機測定プロトコル文書化 | 実機で L1 が計測込みで動作し CSV が取り出せる |
| P7 | slot-v1: slotJudge/slot L1/L2、生成6図形、state v4移行、slot CSV、ホーム・設定・文書統合 | unit、5実寸Webスモーク、PWA更新競合、buildが通る |

各フェーズのコミットは「継承部分の移植」と「新規部分」を分離すること（§1.3 の
線引きを論文に書くため）。
