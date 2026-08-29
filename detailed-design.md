# neuro ゲーム基盤リファクタリング 詳細設計書

- 版: 1.3（2026-08-20）slot-v1逐次停止課題、state v4、slot CSVを反映
- 前提: 基本設計書 1.2。本書は実装可能な粒度で各モジュールを規定する。
- 表記: 「MUST」は必須、「SHOULD」は推奨、「MAY」は任意。

---

## 0A. slot-v1 逐次停止課題（2026-08-20 現行正本）

> 本節は、利用者向け `rhythm-l1` / `rhythm-l2` を `slot-l1` / `slot-l2`
> へ置換した後の現行仕様である。旧リズムエンジン、`taskType: sms`、
> calibration、旧リズムCSVは履歴互換のため残す。後続の `7`、`9.1〜9.5`、
> `11.1〜11.2` にあるリズム中心の記述と本節が衝突する場合は、本節を優先する。
> 固定した要求の全文は `docs/slot-game-replacement-plan.md` を正本とする。

### 0A.1 識別子と置換境界

| 項目 | L1 | L2 |
|---|---|---|
| 利用者向け名称 | ひとつ 止める | 3つ 止める |
| gameId | `slot-l1` | `slot-l2` |
| taskType | `slot` | `slot` |
| protocolVersion | `slot-v1` | `slot-v1` |
| engineVersion | `1` | `1` |
| reelCount | 1 | 3 |
| rounds | 8 | 4 |
| 総停止数 | 8 | 12 |

利用者ホームのカテゴリーは「リールを 止める」。`rhythm-l1` /
`rhythm-l2` のIDを新課題へ再利用せず、旧SMSデータをslotへ変換しない。
`gonogo` は独立したホーム項目、`calibration` は支援者設定内に残す。
`slot-l1`、`slot-l2`、`crane` は `visualRequired: true` とし、
`hideVisualTasks` でスロットカテゴリーごと除外する。

### 0A.2 固定プロトコルと練習値

| 条件 | measure | practice |
|---|---|---|
| symbolCount | 6 | 6 |
| cycleMs | 3200 | 3200既定、2800〜6000 |
| toleranceMs | 220 | 220既定、60〜220 |
| maxCyclesPerReel | 4 | 4 |
| L1 rounds | 8 | 8既定、3〜20 |
| L2 rounds | 4 | 4既定、2〜12 |
| seed | `slot-measure-01` | セッションごとに生成し記録 |

図形IDは `circle`、`fish`、`star`、`flower`、`bird`、`square` の固定6種。
測定は同じseedから目標、図形順、初期位相を再現する。練習は可変でも、実際に
使ったseedと全 `symbolOrder` を保存する。入力後に乱数を引いて成功・失敗や
停止図形を変更してはならない。

### 0A.3 判定式

入力時刻の正本は `src/lib/neuronodeApp.js` の入力ファネルがイベント入口で取得した
`performance.now()`。ゲーム側で再計時しない。リール `r` の論理位相は次で求める。

```text
elapsedMs = inputPerfMs - reelStartPerfMs
phase = positiveModulo(
  initialPhase + elapsedMs / cycleMs * symbolCount,
  symbolCount
)
stoppedIndex = floor(phase + 0.5) mod symbolCount
signedErrorMs = inputPerfMs - nearestTargetPassPerfMs
absoluteErrorMs = abs(signedErrorMs)
judgment = absoluteErrorMs <= toleranceMs ? hit : miss
```

早押しは負、遅押しは正とし、許容幅ちょうどはhit。最近傍の目標通過は周期境界を
またいで探索する。`requestAnimationFrame` は `phase` の見た目を描くためだけに使い、
判定、timeout、保存値の正本にしない。聴覚 `baselineOffsetMs` は適用しない。

activeになったリールが4周期を超えた場合は、期限時刻を使って `timeout` を1件記録する。
期限後に到着した入力を次リールへ転用しない。

### 0A.4 逐次停止状態機械

```text
ready
  -> round 0 / reel 0 active
  -> 入力またはtimeoutで現在の1本だけ停止
  -> 同じroundの次reelをactive
  -> 最終reel停止後560ms保持
  -> 次round / reel 0
  -> 全停止後620ms保持
  -> result
```

- 1入力で更新できるのは現在の `roundIndex:reelIndex` 1位置だけ。
- 各roundと各停止後は300msの入力ロックを置く。
- シェルの150msイベントdedupeを抜けた余分な入力も、次リールを止めず
  `extraInputCount` / `ignoredDuplicateInputs` として残す。
- Escまたは終了ボタンでは、直前までの試行を `aborted: true`、
  `finished: false` で保存する。
- 完走時は必要な全 `roundIndex:reelIndex` が一意に揃った場合だけ
  `finished: true`、`aborted: false` とする。

### 0A.5 UI、画像、アクセシビリティ、倫理

- 各roundで目標図形、太い上下停止線、リール番号、active/stopped状態、全停止数の進捗を示す。
- L2は3本すべてを同時に動かし、停止操作だけを左から右へ1本ずつ受け付ける。
- 生成画像 `src/assets/slot/slot-symbol-strip-v1.png` は6図形のガイドとして表示する。
  リール本体はCSS形状とFont Awesomeアイコンでも識別でき、画像の有無が判定へ影響しない。
- highContrastでは色に加えて形、太い輪郭、番号、短い文字を併用する。
- 大文字、834×1194、507×1194、390×664、390×812、844×390で主操作、
  停止線、進捗、終了導線が画面外へ出ないことをWebスモークで確認する。
- `prefers-reduced-motion` は完了装飾等の非本質アニメーションを抑制する。
- 利用者向けに「スロット」、BET、通貨、配当、BAR、777、ジャックポット、
  near miss、無限継続、希少報酬を表示しない。
- 結果は命中率、絶対ずれ中央値、符号付き平均ずれ、timeout、余分な入力、
  最後の図形を中立的に示し、失敗回数を主見出しにしない。

### 0A.6 セッションと試行

セッション必須部:

```js
{
  sessionId,
  taskType: "slot",
  protocolVersion: "slot-v1",
  engineVersion: 1,
  gameId: "slot-l1" | "slot-l2",
  participantId,
  startedAtIso,
  endedAtIso,
  aborted,
  finished,
  config: {
    reelCount, symbolCount, cycleMs, toleranceMs, rounds,
    maxCyclesPerReel, seed, difficultyMode, textMode,
    measurementReadiness, visualGuidance: false
  },
  device,
  trials,
  summary
}
```

各停止試行は、少なくとも `index`、`roundIndex`、`reelIndex`、
`targetSymbol`、`targetIndex`、`symbolOrder`、`initialPhase`、
`reelStartMs`、`activeStartMs`、`inputMs`、`timeoutAtMs`、
`targetPassMs`、`signedErrorMs`、`absoluteErrorMs`、`stoppedPhase`、
`stoppedIndex`、`stoppedSymbol`、`observedCycles`、`judgment`、
`inputSource`、`ignoredDuplicateInputs` を持つ。

summaryは `trials`、`hits`、`misses`、`timeouts`、`hitRate`、
`meanSignedErrorMs`、`medianAbsoluteErrorMs`、`meanAbsoluteErrorMs`、
`extraInputCount`、`completionTimeMs`、`lastRoundSymbols` を再計算できる形で持つ。

### 0A.7 保存v4とサニタイズ

保存キーは `neuronode-prototype-state-v4`。v4が無いときはv3を最優先に読み、
既存settings、logs、evaluation、sessions、旧 `rhythm.sessions` を保持してv4へ保存する。
v3キーは削除しない。v3が無い場合だけ従来のv2→v1移行へ進む。

`sanitizeSlotSession` は次をMUSTとする。

1. gameId、protocolVersion、engineVersion、図形ID、図形順を検証する。
2. cycle、tolerance、rounds、reelCount、maxCyclesを安全範囲へclampする。
3. 保存された時刻・位相から判定を再計算し、一致しない試行を個別に除外する。
4. `roundIndex:reelIndex` の重複、範囲外、必要位置の欠落を検出する。
5. 試行が欠落した完了セッションは `finished: false`、`aborted: true` に戻す。
6. MAX_SESSIONS上限と旧SMSセッションを維持する。

### 0A.8 スロットCSV

出力名は `neuronode-slot-YYYY-MM-DD.csv`、BOM付きUTF-8、1停止1行。
`escapeCsv` を通し、列順は次の28列で固定する。

```text
sessionId,participantId,gameId,protocolVersion,engineVersion,startedAtIso,
aborted,difficultyMode,roundIndex,reelIndex,targetSymbol,targetIndex,
stoppedSymbol,cycleMs,toleranceMs,inputMs,targetPassMs,signedErrorMs,
absoluteErrorMs,observedCycles,judgment,seed,symbolOrder,
deviceViewportWidth,deviceViewportHeight,devicePixelRatio,deviceUserAgent,
measurementReadiness
```

`symbolOrder` はJSON文字列。旧 `neuronode-rhythm-YYYY-MM-DD.csv`、
`neuronode-scan-YYYY-MM-DD.csv`、`neuronode-rt-YYYY-MM-DD.csv`、
評価CSVを変更・統合しない。

### 0A.9 実装ファイルと検証

| パス | 責務 |
|---|---|
| `src/lib/games/slotJudge.js` | 位相、最近傍目標通過、判定、seed出題、summary |
| `src/lib/games/slot.js` | L1/L2共通UI、逐次状態機械、timeout、中断 |
| `src/lib/games/slotState.js` | 保存セッションの検証・再計算 |
| `src/lib/games/slotArt.js` | 6図形HTMLと生成画像URL |
| `src/lib/slotCsv.js` | 固定28列のCSV行 |
| `tests/slot-judge.test.mjs` | 境界、符号、seed、fps非依存 |
| `tests/slot-session.test.mjs` | 1入力1停止、遷移、sanitize、中断 |
| `tests/data-integrity.test.mjs` | v3→v4、CSV、ID、画像 |
| `tests/web-smoke.mjs` | L1画像・中断、L2全12停止、5実寸 |

Windows上の自動検証は論理・DOM・レイアウト・PWAまでであり、NeuroNode実機、
iPad実機のSwitch Control、実際の視距離、疲労、図形弁別性の人間確認を代替しない。

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
| src/lib/games/registry.js | 変更 | slot-l1/l2 creator追加、旧rhythm creator保持 |
| src/lib/games/gameHost.js | 変更 | taskType別の起動・入力・終了、slot結果 |
| src/lib/games/slotJudge.js | 新規 | 位相・最近傍通過・判定・固定seed・集計の純粋関数 |
| src/lib/games/slot.js | 新規 | 1/3リール共通UIと逐次停止状態機械 |
| src/lib/games/slotState.js | 新規 | slotセッションのsanitize・判定再検証 |
| src/lib/games/slotArt.js | 新規 | 6図形HTMLと生成画像URL |
| src/lib/slotCsv.js | 新規 | slot-v1固定28列CSV |
| src/assets/slot/slot-symbol-strip-v1.png | 新規 | 生成した透過6図形ガイド |
| src/lib/games/judge.js / rhythm.js | 維持 | 旧SMSデータと旧リズムCSVの互換経路 |
| src/lib/games/pointing.js / crane.js | 維持 | 2軸走査・UFOキャッチャー |
| src/lib/games/reaction.js / fishing.js | 維持 | 反応時間課題 |
| src/lib/games/gonogo.js / calibration.js | 維持 | 聴覚抑制・聴覚baseline |
| src/lib/content.js | 変更 | storageKey v4、slotタイル・プリセット、visualRequired |
| src/lib/difficultyMode.js | 変更 | measure固定slot-v1とpractice値解決 |
| src/lib/state.js | 変更 | v3→v4移行、slot sanitize、旧SMS保持 |
| src/lib/views/home.js | 変更 | 6項目、slotカテゴリー、gonogo独立、viewport再分割 |
| src/lib/views/evaluation.js | 変更 | slot CSV、旧rhythm/scan/rt CSV併置 |
| src/lib/views/settings.js | 変更 | slot周期・許容幅・L1/L2回数、measureロック |
| src/lib/sessionConditions.js | 変更 | slot計画停止数と条件表示 |
| src/App.svelte / src/lib/dom.js | 変更 | slot設定とCSV操作子 |
| src/styles.css | 変更 | slot盤面、狭画面、高コントラスト、reduced-motion |
| tests/slot-judge.test.mjs | 新規 | 判定境界、seed、fps非依存 |
| tests/slot-session.test.mjs | 新規 | 逐次遷移、sanitize、中断 |
| tests/data-integrity.test.mjs | 変更 | v3→v4、CSV、ID、画像 |
| tests/web-smoke.mjs | 変更 | L1とL2全12停止を5実寸で検証 |
| README.md / basic-design.md / detailed-design.md / docs/research-summary.md | 変更 | 現行パラダイムへ更新 |

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

### 2.3 アクティビティホーム仕様

- home は年齢中立の「アクティビティ」として表示する。利用者向け項目は
  `color-legacy` / リズムコーナー / `crane` / `fishing` / `calibration` の5件。
  リズム二階層目で `rhythm-l1` / `rhythm-l2` / `gonogo` / ホームへ戻る、の
  4件を表示する。すべて既存 `.module-button` の意匠と `data-scan` を使う。
- `settings.hideVisualTasks` が ON のとき、視覚必須の `crane` はホームDOMへ
  生成せず、走査対象からも外す。`calibration` は現段階では従来どおり表示する。
- シェルではゲームセンター、クレジット、メダルなど年齢・文化的文脈を限定する表現を
  既定表示しない。ゲーム固有の演出は `gameView` 内だけで使用する。
- 支援者向け入口は利用者の走査対象外とし、設定・評価・ログ・研究画面は
  落ち着いた業務UIとして利用者ホームから視覚的に分離する。
- 支援者メニュー（`settings`）は入口だけでなく**面の中身も走査の輪に入れない**
  （2026-08-28）。ここを操作するのは支援者で、スイッチ走査では触らない。
  ただしタブバーと `#homeReturn` は輪に残す——面の中身とまとめて断つと、
  利用者が誤って支援者の世界へ入ったとき走査だけで home へ戻れなくなり、
  実機確認2026-07-04の欠落（§3.2）が戻る。他の支援者画面（評価ログ等）は
  従来どおり自分の操作子を輪に入れる。
- スタート決定に使った同一入力イベントが、遷移後のホーム項目まで決定してはならない。
  `start → home` の遷移境界で同一イベント系列を消費済みとして扱う。
- `enabled: false` のタイルは「じゅんびちゅう」表示で走査対象から除外
  （disabled 属性を立てれば scan.refresh() のフィルタで自動除外される）。
- タイル決定で gameHost.launch(gameId) を呼ぶ。
- ゲームタイルの下に「まなぶ・つたえる」セクション（#activityTileGrid）を置き、
  matching / voca / letters へのタイルを表示する（content.js の activityTiles、
  描画は views/home.js）。決定で switchView(view) を呼ぶだけで、ゲーム契約
  （§3.1）には乗せない。これらは旧タブバー由来の利用者向けビューで、
  タブバーには支援者機能（log / settings ＋研究者モード3タブ）だけを残す。
  各ビューからの復帰は「← ホームへ」（#homeReturn、走査対象）による。

#### 2.3.1 画面が短いときのページ走査（src/lib/scanPaging.js）

- 走査で選ぶ画面では、**選択肢が画面の外にあること自体が欠陥**になる。
  scan.js は現在位置へ `scrollIntoView` するが、利用者はスクロールを止める
  ことも戻すこともできないので、選択のたびに画面が動くと「選ぶ」課題が
  「選ぶ＋動く画面を追う」課題に変わる。走査UIがスクロールではなくページ
  送りを使うのはこのため。
- 実測（対策前、iPhone 14 縦）: ホームの4番目・5番目のタイルが入力ドックの
  裏に**まるごと**（182px）隠れたまま「いま えらんでいます」になっていた。
- 対策は2段構え。
  1. `scroll-margin-top / -bottom`（styles.css）で、`scrollIntoView` が
     固定ドックと粘着タブバーのぶん手前で止まるようにする。値は
     `--dock-height` から引くので、片方だけ更新して食い違う事故が起きない。
  2. 画面高さが 740px 以下かつ項目が `SCAN_PAGE_SIZE`(=3) を超えるときは
     ページに分ける。1ページ＝3項目＋「つぎの ページ」で1周4歩
     （既定の走査間隔 1600ms で 6.4秒）。最後のページの次は先頭へ循環する
     ——走査は一方向にしか進めないので、循環しないと目的の項目へ二度と
     たどり着けない。
- **削るのは1ページあたりの項目数であって、タップ標的の大きさではない。**
  ここの利用者は狙って押すこと自体が難しく、収めるために標的を縮めるのは
  本末転倒になる。飾り（見出しの eyebrow、案内文、走査中の札）を先に削る。
- ページ番号はコーナーの出入りとロビー復帰で 0 に戻す。持ち越すと、あそびを
  終えて戻った瞬間に2ページ目が出て「さっき選んだものが無い」ことになる。
- 高さが変わる場面（回転・ツールバー伸縮・ソフトキーボード）は matchMedia の
  change でだけ描き直す。毎回描き直すと走査中に現在位置が消える。

### 2.4 ゲーム実行画面仕様

- **レディ画面（「やりかた」）を先に出す。** content.js の `gameHowTo[gameId]` に
  手順を持つ課題では、gameHost.launch() は instance を作らず手順を描くだけに
  留める（games/gameHost.js renderReady）。最初のスイッチ入力で beginSession()
  が instance を生成し mount() する。この1押しは説明を読み終えた合図であって
  課題の入力ではないので、ゲームへは渡さず logEvent にも残さない。
  - 理由: 以前はタイル決定と同時に mount() が走り、先読みスケジューラが即座に
    拍を鳴らしはじめていた。何をする課題なのかを伝える場所がどこにも無く、
    とくに gonogo は高音は押す・低音は見送るというルールを音だけからは
    推測できなかった。
  - 説明を開始前に置くのは、測定中の追加説明が刺激へ重なるのを防ぐため。
    §7.4 の `lane`（練習）では課題中の予告ノートを許可するが、`instrument`
    （`measure` / calibration）では開始後の予告キューを禁止する。開始前はまだ
    計測が始まっていないので、どちらも図・手順・色を自由に使える。
  - `gameHowTo` に無い課題（crane のように画面を見て操作するもの）は
    説明の作り方が別なので、従来どおり即開始する。
  - #gameStageContent は aria-hidden のため、説明は announce() と
    audio.speak() で読み上げ経路にも流す。開始時と離脱時は audio.stopSpeech()
    で発話を打ち切る（案内の声が課題の合図音に重なるのを防ぐ）。
  - レディ画面から「おわる」/Esc で抜けた場合、セッションは1件も作られない
    （中断記録も残らない。まだ計測が始まっていないため）。
- タブバー・走査UI・ヘッダを非表示（`body.game-mode` クラスで CSS 制御）。
- 画面構成: 中央にゲーム別の視覚ステージ（§7.4）、上部にセッション進捗
  （「のこり 12」等・largeText 連動）、右上に支援者用「おわる」ボタン
  （44px 角以上、タップ専用）。中央パルス円は標準レイアウトとしない。
- 終了条件（いずれか）:
  1. 規定試行数の完了（自動、通常経路）
  2. 支援者の「おわる」タップ、または Esc キー
  3. タブ非アクティブ化（visibilitychange）→ セッションを aborted で確定
- 終了時は必ず module.destroy() → リザルトへ（aborted の場合は home へ直帰）。

### 2.5 リザルト画面仕様

- 表示項目: 達成率（hit / 対象ビート数）、平均オフセット（符号付き ms、
  「はやめ/おそめ」の言い換え併記）、オフセット SD、extra 入力数。
- 数値とボタン順は共通の意味構造を使うが、背景・見出し・獲得物はゲーム別テーマを
  継続する。白い汎用カードだけへ切り替えない。装飾は `aria-hidden` とし、
  同じ意味を1文の結果要約でも伝える。
- ボタン2つ（走査対象）: 「もういちど」（同一ゲーム再起動）「メニューへ」。
- speak で達成率を読み上げ（speechEnabled 時）。

---

## 3. ゲームモジュール契約（正式仕様）

### 3.1 型定義

```js
/**
 * @typedef {object} GameModule
 * @property {string} id            一意ID（例 "rhythm-l1"）
 * @property {"sms"|"gonogo"|"scan"|"rt"|null} taskType
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
 * @property {(session) => void} logTrial   現時点のセッション全体を upsert（§9.2）
 * @property {(summary) => void} finish     セッション正常終了（gameHost がリザルトへ）
 * @property {(message) => void} announce   aria-live 通知
 * @property {() => void} abort             異常終了（home へ直帰）
 * @property {string} participantId         評価セッションの参加者ID
 * @property {(text:string) => void} setProgress  ホストの進捗表示を更新
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
  { id: "color-legacy", taskType: null, title: "いろがかわる", order: 1, enabled: true },
  { id: "rhythm-l1", taskType: "sms", title: "リズム れんしゅう", order: 2, enabled: true },
  { id: "rhythm-l2", taskType: "sms", title: "リズム つづけて", order: 3, enabled: true },
  { id: "gonogo", taskType: "gonogo", title: "たかいおとだけ", order: 4, enabled: true },
  { id: "crane", taskType: "scan", title: "UFOキャッチャー", order: 5, enabled: true },
  { id: "fishing", taskType: "rt", title: "さかなつり", order: 6, enabled: true },
  { id: "calibration", taskType: "sms", title: "そくてい", order: 7, enabled: true },
];

export const rhythmPresets = {
  "rhythm-l1": { bpm: 50, countInBeats: 2, targetBeats: 8,  mode: "cued" },
  "rhythm-l2": { bpm: 50, countInBeats: 4, targetBeats: 16, mode: "continuous" },
  "gonogo":    { bpm: 50, countInBeats: 3, targetBeats: 20, mode: "gonogo", goRatio: 0.6 },
  "calibration": { bpm: 50, countInBeats: 4, targetBeats: 24, mode: "continuous", excludedTrialCount: 4 },
};

export const cueTones = { low: 440, high: 880, noGo: 330, hit: 660, miss: 220 };
```

- `gameId` から解決する既定の視覚プロフィール（背景、主役、進捗、結果）は
  必須の製品要件とする。将来の `skin` は外部差し替え用であり、未指定時を
  無地にするための口ではない。

---

## 5. 判定ロジック（games/judge.js）

### 5.1 用語と定数

- 設定判定窓半幅 W₀ = settings.judgmentWindowMs（既定 600、範囲 200〜1500、100 刻み）
- **実効判定窓半幅 W**: 連続系モード（continuous / gonogo）では隣接ビートとの
  窓重複を禁止するため次で制限する（MUST）。cued モード（L1）は
  試行間休止があるため W = W₀ のまま。calibration は §8.2 のとおり
  continuous なので、この制限を受ける側になる（bpm 50 で W = 540）。

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

#### 5.3.1 結果を伝える効果音（クレーン・さかなつり）

- 長らくアプリの音は「約0.18秒のサイン波」1種類しかなかった。合図としては
  足りるが、押した結果として何が起きたのか——アームが降りたのか、掴んだのか、
  滑ったのか、魚が掛かったのか——は音では区別できなかった。画面を見つづける
  のが難しい利用者にとって、これは「結果が届かない」ということそのもの。
- `audio.playNoise()` / `audio.playSweep()` を追加し、次を鳴らす。
  - crane: 横の確定（短い帯域ノイズ）、下降（下がる掃引＋低域ノイズ）、
    把持（金属の当たり＋上がる掃引）、すべり（当たり音のあと下がる掃引）、
    空振り（当たり音を鳴らさないこと自体が情報）、受け口への落下（低い衝撃音）。
  - fishing: 釣り上げ（上がる掃引＋高域の水しぶき）、長靴（重く鈍い低域）、
    逃げられた（沈む低域、いちばん小さく）。
- **守る条件は「測定の合図音を覆わないこと」**。
  - 音量は `EFFECT_GAIN_CEILING`(0.04) で丸め、合図音 `DEFAULT_TONE_GAIN`(0.05)
    より必ず下に置く（`clampEffectGain`）。呼び出し側の実引数も
    tests/effect-gain.test.mjs で突き合わせる。
  - 帯域を分ける。合図は 440/880Hz の純音なので、効果音はノイズと低域、
    掃引は三角波にして同じ高さで competing させない。
  - 鳴らすのは**入力より後**の出来事だけ。とくに fishing のアタリ音は測定
    刺激なので、それより前に音を足さない（予告として働きうる）。
  - `settings.soundEnabled` で全部切れる。一方で合図音は切れない
    （basic-design.md §6 によりミュート不可）。この対比は
    web-smoke の「mutes effect sounds but never the measurement cue」で
    固定してある（生成された AudioNode の種類を数えて見分ける）。

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

## 7. 旧リズムゲーム本体（互換仕様・利用者導線なし）
> 以下は旧SMSセッション復元と旧リズムCSV回帰のために保持する仕様である。

### 7.1 パラメータ解決

優先順位: state.settings のリズム系設定（支援者が調整した値）＞
rhythmPresets[gameId]。settings 側が null のとき preset を使う。

### 7.2 セッション進行

1. mount: プラン生成（ビート列＋乱数列）→ scheduler.start(plan) →
   requestAnimationFrame ループ開始（描画と sweepMisses 用）。
2. rAF ループ毎フレーム: scheduler.now() を取得し、(a) 表示プロフィールの更新、
   (b) sweepMisses() で期限切れ miss の確定、(c) 進捗表示更新。ノート位置は
   AudioContext の絶対時刻から求め、`performance.now()` だけで流さない。
3. handleInput(t): §6.3 で変換 → judgeInput() → フィードバック音 →
   ctx.logTrial(record)。
4. 全ビート消化（hit/miss/commission が確定）で ctx.finish(summary)。

### 7.3 一時停止・中断

- visibilitychange で hidden になったら即 scheduler.stop() し、
  セッションを aborted:true で確定（途中再開はしない。計時汚染防止、MUST）。
- 「おわる」/Esc も同様に aborted:true。

### 7.4 視覚提示（練習と測定のモード分離）

中央パルス円は正本ではない。リズムというジャンル、AudioContext 基準の予定時刻、
§5 の判定、§9 の生データを維持し、見た目は次の2プロフィールへ分ける。

| `visualPresentation` | 適用条件 | 拍より前の表示 |
|---|---|---|
| `lane` | calibration 以外、`difficultyMode=practice` かつ `visualGuidance=true` | 許可。流れるノート、次の音種の形、判定面を表示できる |
| `instrument` | `measure`、calibration、または練習で `visualGuidance=false` | 禁止。予定ビートを表すDOM・移動・拍前拡縮を出さない |

- プロフィールは mount 時に1回だけ確定し、途中で切り替えない。実際に使った
  `difficultyMode`、`visualGuidance`、`visualPresentation` を
  `session.config` に保存し sanitize でも保持する。CSVには少なくとも
  `difficultyMode` と `visualGuidance` を出し、条件を混ぜて集計しない。
- calibration は設定値にかかわらず `instrument` / `visualGuidance=false`
  に固定する。`measure` も同じく予告を強制OFFにする。

#### 7.4.1 `lane`（通常練習）

- ゲーム別テーマを持つ1レーンのリズムゲームとする。ノート位置は
  `scheduler.now()` と予定ビートの AudioContext 絶対時刻から求め、判定は
  表示DOMの位置でなく §5 の時刻差だけで行う。
- L1 は明るい空・疎な単発ノート（同時1〜2個）、L2 は夜景・連続列・コンボ蓄積、
  gonogo は星／岩等を形・輪郭・アイコンで区別する。色だけで区別しない。
- Perfect / Good は入力後の表示用評価であり、研究上の `judgment=hit` を
  分割・上書きしない。miss / commission も罰的な全画面フラッシュを使わない。
- correctRejection のシールド等は判定窓が閉じた後だけ表示し、320ms以内に消す。
  次の試行の種類や時刻を知らせる動きへ連結しない。

#### 7.4.2 `instrument`（測定・予告なし練習）

- 無地の白画面や中央円へ戻さない。暗色グリッド、静止判定線、24分割の外周目盛り、
  現在区間、事後マーカー、計器盤型リザルトを持つ完成された精密機器として描く。
- 音が鳴る前は静止し、未来のビート位置・音種・残り時間を空間配置で教えない。
  入力位置マーカー、早い／ちょうど／遅いの形、波紋は入力または判定確定後だけ出す。
- calibration の最初の4拍は「ならし」、後続20拍は「測定」として外周目盛りの
  塗り分けで進捗を示す。この進捗は過去の完了数であり、次の拍の時刻を示さない。
- ずれ表示は `rawOffsetMs - appliedBaselineMs` を用いるが、
  **記録される `rawOffsetMs` は常に生値**（§8.3）。

#### 7.4.3 共通の表示条件

- 音を開始できない端末ではセッションを開かず、テーマ内の故障表示と理由を出す。
- `prefers-reduced-motion: reduce` ではJS側も連続移動を止める。lane は
  固定ノート枠の段階切替、instrument は静止目盛り＋事後スタンプを使い、
  背景・HUD・獲得物まで消して検査円だけにしない。
- 通常高の画面では instrument の主計器220〜250pxを目安にする。844×390の
  短横画面では、左右16px以上・ノート52px以上・判定面96px以上を優先し、
  主計器はプレイ面内に収まる約168pxまで縮退する。進捗・終了・主役を重ねない。
- highContrast では文字4.5:1、判定線・ノート輪郭等3:1以上、輪郭4px以上。
  形・数字・短い文字を併用し、背景装飾だけを先に落とす。

### 7.5 さかなつり（games/fishing.js）

**2種類ある。** どちらも反応時間を測るが、測っているものが違う:

| gameId | タイル | 内容 | fakeRatio |
|---|---|---|---|
| `fishing` | アタリで つる | 純粋な単純反応時間。アタリ音は1種類だけ | 0 |
| `fishing-gonogo` | さかなだけ つる | そこに No-Go（低音の長靴）を混ぜた抑制つき | 0.22 |

以前は1つのゲームに `fakeRatio` を持たせていたため、`taskType` は `"rt"`
（単純反応時間）なのに実体は Go/No-Go 課題という食い違いがあり、
「この課題で何を測ったか」を書けなかった。分けたことで
「単純RT＝fishing、抑制＝fishing-gonogo（および拍に乗る gonogo）」と
役割が確定する。

- ロビーでは `fishingCornerTile`（さかなつり）にまとめ、二階層目で選ぶ。
  リズムコーナーと同じ作法で、ロビーの走査項目は5件のまま増えない。
- エンジンは共通。`createFishingGame(gameId)` が `fishingPresets[gameId]` を
  読むだけ（`createRhythmGame(gameId)` と同じ形）。
- どちらも `taskType: "rt"`。rt のサマライザは commission /
  correctRejection を既に扱えるので、純粋版は fake が0件になるだけで
  スキーマは共通のまま。`state.js` の `RT_GAME_IDS` に両方を登録する。


課題としては従来どおり変動前刺激間隔つき単純反応時間課題（taskType: "rt"）で、
判定は reaction.js の `judgeReaction`、前刺激間隔は `generateForeperiods`、
real/fake の並びは `generateGoNoGoSequence`——いずれも変更していない。
見た目だけを一般的な釣りゲームに寄せている。

- 舟と釣り人は画面中央上部に固定する。NeuroNode は単一スイッチなので、
  移動の概念を持ち込まない。利用者ができる操作は「押して糸を垂らす」だけ。
- 魚は水中を右から左へ流れ、**アタリ音が鳴る瞬間（cueMs）にちょうど糸の
  真下へ来る**。画面は音のキューを目でも追えるようにした表現であって、
  判定の基準は音の時刻のまま。これにより「画面を見ずに音だけでも遊べる」
  「音が聴こえにくくても画面で合わせられる」の両方が成り立つ
  （基本設計書 §6 の聴覚優先を崩さない）。よって `visualRequired` は付けない。
- 位置は `swimX()` が「寄ってくる／食いついている／逃げる」の3区間で返し、
  rAF で `left` を更新する。**判定窓のあいだは糸の位置に留める**こと。
  窓をかけて左端まで泳ぎ切らせると、反応時間ぶんの遅れで「押せるのに魚は
  もういない」状態になる（実際、窓の終わりに x=-2% まで進んでいた）。
  掛かったあとの巻き上げ中は rAF が位置を触らず、CSS の遷移に任せる
  （`reelingIndex`）。
- 糸は最初から魚のいる深さまで垂れていて、押す＝合わせて引き上げる。
  「押すと糸が伸びる」にすると、糸が水中に無いのに魚が食いつく（アタリ音が
  鳴る）ことになり因果が逆立ちする。魚の基準点は中心ではなく口元
  （幅の約18%）に置き、糸が背中ではなく口に噛んで見えるようにする。
- **「試行の決着」と「枠の進行」を分ける。** 記録は1枠1行のまま（`resolvedIndex`）
  だが、`currentIndex` を進めるのは時間（`advanceSlot()`、判定窓を過ぎた時点）。
  記録と同時に枠を進めていたときは、開始直後から連打されると各枠が
  フライングで即座に消費され、**魚が一度も画面に現れないのにアタリ音だけが
  鳴り続けた**（音は mount() で全ビート予約済みのため止まらない）。音と絵が
  一致するというこのゲームの前提が崩れる。決着後も魚はその枠の最後まで
  泳がせ、`.is-lost` で薄く描いて「早すぎて逃した」ことを見えるようにする。
  - 釣り上げ済み（`resolvedJudgment === "hit"`）の枠だけは魚を再表示しない。
    枠の終わりまで進めるようにしたことで巻き上げ演出のあとにも `swimX()` が
    座標を返す時間が残り、放っておくと釣った魚が水中に再出現する。
- **まだ受付の始まっていない試行に入力を当てない。** 各試行は `startMs`
  （前の試行の枠の終わり）を持ち、`handleInput` はそれ以前の入力を捨てる。
  これが無いと、連打したとき1回目で `currentIndex` が進むため2回目以降が
  「まだ音の鳴っていない次の試行」に当たる。とくに fake は `judgeReaction`
  がタイミングを見ずに `commission` を返すので、連打だけで先の試行が
  次々に食い潰される（痙性・振戦のある利用者で起こりやすい）。決着済みの
  試行の残り時間に来た入力はどの試行にも属さないので記録しない。
- 画面は海が全面。舟・糸・魚が主役で、状態表示は海の上に重ねる小さな帯に
  する。中央に小さな海の四角を置いて下に巨大な状態表示と説明文を並べると、
  画面でいちばん大きい要素が文字になる。説明文はレディ画面と重複するので
  置かない。スコアは上中央（右上は `#gameExit` と重なる）。
- 1ゲームは1分（`fishingPresets.sessionMs`）。試行数ではなく時間で区切るため、
  試行数は前刺激間隔の乱数で毎回変わる。**mount() で実際に計画した試行数を
  `config.targetTrials` に書き戻すこと**（state.js の `sanitizeReactionSession`
  が `trials.length === targetTrials` を完走判定に使うので、ここがずれると
  全セッションが中断扱いで保存される）。
- 遊びとしての手応え（いずれも記録済みの値から導出する。判定・キュー時刻には
  一切関与しない）:
  - **すばやいボーナス**: その hit の反応時間が、**同一セッションのそれまでの
    hit の中央値**より速ければ +10cm。基準を固定値ではなく自己中央値に
    するのは、反応の遅い利用者が一度も達成できない設計を避けるため。
    このアプリの利用者は反応が遅いのが前提なので、**判定窓を狭めて遅さを
    罰するのではなく、速いときに上乗せする**方向に倒している。母数が
    3件に満たないうちは判定しない（最初の1回が基準になってしまう）。
  - **連続**: hit と correctRejection を成功として数える。長靴を見送れた
    ことも褒めないと、押し続けるのが最適な遊び方になってしまう。表示は
    3から（1・2で出すと常時点灯して意味を失う）。
  - **終盤の夕暮れ**: 残り12秒（`DUSK_MS`）で空を夕方の色にする。音で急かすとアタリ音と
    混ざって聴覚キューの聴き取りを妨げるので、時間の経過は光の変化だけで
    伝える。
- スコアと魚の長さ（`species` / `lengthCm` / `totalLengthCm` / `catches` /
  `longestCm` / `speedBonus` / `bestStreak` / `scoreCm`）は遊びの手応えの
  ための表示で、rt スキーマの外にあるため永続化されない。記録・CSV に残るのは従来どおり反応時間と判定だけで、
  研究データのスキーマは変えていない。リザルトには `ctx.finish(summary)` で
  直接渡るので（sanitizer を通らない）その回だけ表示できる。
- 素材（魚3種・長靴・舟）は `src/assets/fishing/*.png`。Vite 経由で import し、
  base 付きの配信でもパスが壊れないようにする。Service Worker は dist 配下を
  全ファイル事前キャッシュするため、合計サイズを小さく保つこと。

---

## 8. キャリブレーション（games/calibration.js）

### 8.1 目的

利用者＋入力系（NeuroNode→iOS→WebView）の基準オフセットを測定し、
判定窓の中心補正 C を提案する。

### 8.2 手順

1. mode="continuous"、bpm=50、countIn=4、targetBeats=24 で L2 と同一の課題を実施。
2. 最初の 4 拍は立ち上がりとして集計から除外（記録はする。excluded:true フラグ）。
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

### 8.5 測定版面

- calibration は §7.4.2 の `instrument` を必須とし、未来のノート、
  拍前のパルス、次の音種を示す色・形を一切描かない。
- 24目盛り、静止判定線、ならし4拍／測定20拍の完了進捗、入力後マーカーを持つ。
  「予告禁止」は「簡素でよい」という意味ではなく、見た目の階層と質感を落とさない。
- リザルトも計器盤の世界を継続し、候補中央値と支援者用保存操作を共通の意味構造で示す。

---

## 9. データモデル

### 9.1 旧state v3追加分（v4移行元）

```js
settings: {
  // 既存6項目に追加
  judgmentWindowMs: 600,
  baselineOffsetMs: 0,
  rhythmBpm: null,          // null = preset 値を使用
  countInBeats: null,
  targetBeats: null,
  hideVisualTasks: false,
},
sessions: [],                 // 全 taskType 合計で直近50件
arcade: { medals: 0, history: [] }, // 旧v3互換用。既定UIでは表示・付与しない
rhythm: {
  sessions: [],               // 旧v3移送元としてキーのみ残す
},
```

保存キーは `neuronode-prototype-state-v3` のまま変更しない。`loadState()` は
旧 `state.rhythm.sessions` を読み、`gameId === "gonogo"` なら `gonogo`、
その他のリズム系なら `sms` を補って `state.sessions` へ移送する。移送後も
`state.rhythm` キー自体は切り戻し用に残す。

`gameHost.launch()` はクレジット投入や残高判定を行わず、すべてのゲームを無条件で起動する。
`arcade` は既存保存データを失わないため保持するが、新規のメダル付与には使わない。

### 9.2 セッション記録スキーマ

```js
{
  sessionId: "r-20260703-143005-x7",   // r-日時-乱数
  taskType: "sms",                     // sms | gonogo | scan | rt
  gameId: "rhythm-l1",
  participantId: state.evaluation.participantId,  // 評価セッション連動
  startedAtIso: "...",
  aborted: false,
  config: { bpm, countInBeats, targetBeats, judgmentWindowMs,
            effectiveWindowMs,                // §5.1 の実効値（MUST）
            baselineOffsetMs, mode, goRatio, seedSequence: [...],
            difficultyMode, visualGuidance, visualPresentation },
  device: { outputLatencyS: 0.012 | null, baseLatencyS: ..., userAgent: ... },
  trials: [
    { index: 0, beatIndex: 0, beatKind: "go", // index/judgment は全課題共通
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

共通化するのは `sessionId` / `taskType` / `gameId` / `participantId` /
`startedAtIso` / `aborted` / `device` / `trials[].index` /
`trials[].judgment` の9点だけとする。`config` と `summary` は単位を守るため
課題固有の形を維持する。

- `scan` trial: targetX/Y, toleranceR, selectedX/Y, dx/dy, distance,
  xPhaseMs/yPhaseMs, judgment（grip / slip / miss）
- `scan` summary: grips/slips/misses, gripRate, distance の平均・SD・中央値、
  X/Y各位相の平均所要時間
- `rt` trial: kind（real / fake）, foreperiodMs, cueMs, inputMs,
  reactionTimeMs, judgment, excluded
- `rt` summary: hits/timeouts/falseStarts/commissions/correctRejections、
  hit/commission/falseStart率、反応時間の平均・SD・中央値

### 9.3 旧リズム CSV 仕様（互換出力）

- 出力場所: 評価ビューに「リズムCSV」ボタンを追加（既存 exportCsv と並置、
  BOM 付き UTF-8、escapeCsv 使用、ファイル名 `neuronode-rhythm-YYYY-MM-DD.csv`）。
- 形式: 1試行1行のロング形式。列（27列、この順で固定）:

```
sessionId, participantId, gameId, startedAtIso, aborted,
mode, bpm, countInBeats, judgmentWindowMs, effectiveWindowMs, appliedBaselineMs,
beatIndex, beatKind, scheduledMs, inputMs, rawOffsetMs, judgment, excluded,
visualGuidance, difficultyMode,
deviceViewportWidth, deviceViewportHeight, devicePixelRatio,
deviceOutputLatencyS, deviceBaseLatencyS, deviceUserAgent,
measurementReadiness
```

- judgment 列は5値（hit / miss / extra / commission / correctRejection）。
  correctRejection と miss の行は inputMs / rawOffsetMs が空欄。
- summary は CSV に含めない（解析側で再計算可能なため。二重管理を避ける）。
- 先頭18列は既存データ互換のため変更しない。taskType 列も追加しない。
- 19列目 `visualGuidance` は §7.4 の測定条件（画面から拍の手がかりを出したか）。
  **末尾に足すこと自体が要件**で、途中に挿してはならない——挿すとそれ以降の
  列位置がずれ、列位置で読んでいる解析側が黙って壊れる。この列が true の行は
  聴覚キューだけへの同期ではないので、分けずに混ぜて集計しない。
- 20列目 `difficultyMode` は practice / measure を記録する。21〜26列目は
  端末・表示領域、27列目 `measurementReadiness` は成立確認の状態を記録する。
  `visualPresentation` はセッションJSONに保持し、lane / instrument の実版面を追跡する。
- 走査CSVも同じ理由で末尾に `audioGuidance` を持つ（UFOキャッチャーで
  「ねらいの通過音」を鳴らしていたか。`settings.craneAudioGuidance` /
  `games/crane.js` の `maybePassTone`、既定 OFF）。この音は目標の座標そのものを
  聴覚キューへ翻訳するので、ONの回は画面を見ずに解けてしまい、`crane` が
  `visualRequired`（視覚必須課題、§2.3 の `hideVisualTasks`）である前提が
  崩れる。視覚追従が難しい利用者への配慮としては正当なので消さず、条件として
  記録する。true の行を視覚課題の成績として混ぜない。
- 列の順序と内容は `buildRhythmCsvRows` / `buildTaskCsvRows` を純粋関数として
  切り出し、`tests/data-integrity.test.mjs` で固定している。

走査と反応は別ファイルへ出力する。いずれも先頭7列を
`sessionId, taskType, participantId, gameId, startedAtIso, aborted, trialIndex`
で統一し、後続は課題固有列とする。

- `neuronode-scan-YYYY-MM-DD.csv`: 18列
- `neuronode-rt-YYYY-MM-DD.csv`: 14列
- BOM付きUTF-8、`escapeCsv` 使用。単一ファイルには統合しない。

#### 9.3.2 2026-08-28 の追加（研究用出力の穴埋め）

出力を通しで点検して見つかった欠落と、その埋めかた。

- **リールCSVが1件も書き出せなかった（重大）。** `exportSlotCsv` が
  `exportRhythmCsv` の内側に入り込んでいて、外側の `addEventListener` からは
  見えない。ところが例外は出ない——`id` を持つ要素は同名のグローバル変数に
  なるので、識別子はボタン要素自身に解決され、`addEventListener` はそれを
  「`handleEvent` を持たないリスナ」として黙って受け取る。押しても無反応に
  なるだけで、エラーも警告も出ない。押せる／見えるを見ていたテストでは
  捕まらないので、`tests/web-smoke.mjs` の
  `checkExportButtonsAreWired` は**押した結果データが出てくるか**
  （`URL.createObjectURL` の呼び出し）で見る。
- **反応CSVにだけ測定条件が1列も無かった。** リズム・走査・リールは
  `difficultyMode` と `measurementReadiness` を出していたのに、`rt` は
  `games/fishing.js` の config にも `sanitizeReactionSession` にもCSVにも
  無く、3経路すべてで欠けていた。さかなつりは成立確認の「いしを もって
  おせる」の根拠でもあるので、そくてい／れんしゅうを分けられないと、
  成立確認の材料そのものが層別できない。既存列の**うしろ**へ2列足す。
  なお `fishing` は `MEASUREMENT_PROTOCOL` に項目を持たないため、ここでの
  `measure` は「そくていモードで走らせた回」であって「パラメータが protocol
  で固定されていた回」ではない。パラメータは同じ行に出るので解析側で確かめる。
- **セッション台帳CSV（新規）** `neuronode-sessions-YYYY-MM-DD.csv`。
  1セッション1行、全 taskType 横断。ロング形式の5本は「1試行1行」なので、
  試行が0件で終わった回（中断、音が出せなかった回）はどのCSVにも現れない。
  欠測を数えられないデータは、欠測が無いデータと区別がつかない。
  `summary` は課題ごとに形が違うため、潰さず `summaryJson` に入れる。
- **`endedAtIso` を全課題へ広げた。** slot だけが持っていた。開始時刻しか
  無いと、1回にどれだけ掛かったか、途中で止まったのがいつかを言えない。
  押す場所は `games/gameHost.js` の `persistSession`（`finished` /
  `aborted` を立てるのは各ゲーム、保存を通すのはここ1か所）。終端を立てない
  まま消えた回は空欄のまま——終わらなかった回を、終わった回のように見せない。
- **生データ(JSON)の書き出し（新規）** `neuronode-raw-YYYY-MM-DD.json`。
  CSVは列を選んだ派生物で、選ばなかったものは出ない。正本はその端末の
  localStorage だけにあり、端末を初期化すれば消える。再解析・監査のために
  state をそのまま落とせるようにする。
- **操作ログCSVに、ログが既に持っていた列を出す。** `success` /
  `skipEvaluation` / `distance` は `sanitizeLogEntry` がずっと保持していたのに
  どのCSVにも出していなかった（保存されているだけの値は解析に使えない＝実質
  「記録していない」のと同じ）。参加者IDも無く、セッションCSVと突き合わせる
  手段が時刻しか無かった。行組み立ては `buildLogCsvRows` として純粋関数へ
  切り出し、テストで列を固定する。
- **セッションの保存上限に警告を出す。** `state.sessions` は
  `MAX_SESSIONS`（50件）で古い順に消える。操作ログ（300件）には警告UIが
  あったのに、研究データ本体には何も無く、気づけるのは書き出したあと
  （そのときには既に消えている）。残り5件から `#sessionRetentionWarning`
  に出す。

#### 9.3.3 書き出す時刻は端末のローカル時刻（2026-08-29改訂）

保存はUTCのまま。**書き出しだけ**を端末のローカル時刻へ直す
（`src/lib/utils.js` の `toLocalIso`）。

当初は固定 +09:00 にしていたが、端末の時間帯を使う形へ改めた（2026-08-29）。
支援者はその端末の時計で「今日の何時に測ったか」を認識するので、アプリだけが
別の時間帯で書き出すと、別紙の記録と突き合わせる側が毎回ずらして考えることに
なる。オフセット（`+09:00` / `+08:00` など）を文字列に残すので、時間帯の違う
端末で取った回どうしでも解析側で同じ時刻軸へ戻せる。

理由: 使う人の時間帯の夕方に測った回はUTCでは同じ日の朝、深夜の回は前日になる。
CSVを「日ごと」に集計すると境界がずれたまま数が出る——数字は出るので気づかない。

- 列名も変える（`startedAtIso` → `startedAtLocal`、`endedAtIso` → `endedAtLocal`、
  ログの `time` → `time_local`、効果測定CSVの4列に `_local` を付ける）。中身の意味を
  変えるのに名前を残すと、以前の書き出しをUTCとして読んでいる手元の集計が、
  黙ってずれた値を受け取る。名前を変えれば、そこで止まって気づける。
- オフセット（`+09:00` / `+08:00` など）は必ず文字列に残す。落とすとどの時間帯の
  値なのか分からなくなる——「どちらの時刻か分からない列」は、間違った列より
  質が悪い。オフセットがあれば、時間帯の違う端末で取った回どうしでも同じ時刻軸へ
  戻せる。
- 端末の時計や時間帯の設定が狂っていれば、その狂ったまま出る。防ぎようがないので、
  生データJSONにはUTCのまま残す（そちらが正本）。
- `toLocalIso` はオフセットを引数で受け取れる。実行環境の時間帯は選べない
  （手元の Windows の Node は TZ を無視する）ので、これが無いと「+09:00 の端末で
  動かしたときだけ通るテスト」しか書けない。30分刻みの時間帯（インド +05:30、
  ニューファンドランド -03:30）も含めてテストで固定している。
- 生データJSONは state をそのまま入れる（保存はUTCのまま）。読む人のために
  `exportedAtLocal` だけ併記する。

### 9.6 エンドレス — crane / fishing

決まった回数・決まった時間で終わらず、**続けるほど難しくなる**。終わりは
支援者が「おわる」を押したとき（または上限に届いたとき）。

**入口はゲームの中**（ホームの二階層目）であって支援者メニューではない。
利用者が自分で選ぶ遊び方なので、支援者のつまみとして置くと、選んだ本人からは
何が変わったのか見えないまま挙動だけが変わる。

- `crane`: ホームの直タイルを `craneCornerTile` に替え、二階層目で
  「アームを とめる」/「ずっと とめる」を選ぶ（slot / fishing と同じ作法）。
- `fishing`: 既存コーナーに「ずっと つる」を足す。

**gameId は増やさない。** エンドレスは遊び方であって別の課題ではないので、
同じ `gameId`・同じ `taskType` で走り、記録は `session.config.endless` で
区別する（`content.js` の `endlessTiles` は `gameId` を指すだけ）。新しい
gameId を足すと taskType の判定・成立確認の材料・そくていの protocol まで
枝分かれし、「同じ課題の別の遊び方」という事実がコードから消える。
入口は `gameHost.launch(gameId, { endless: true })` で渡す。

**そくていでは必ずOFFに解決する（MUST）。** ホームにも出さない
（`isMeasurementMode` で `endlessTiles` を落とす）が、`resolveEndlessMode` が
二重防御で落とす。そくていは試行数とパラメータを固定することが条件そのもので、
難度が回の途中で動くと、回どうしどころか**同じ回の中の試行すら同じ条件で
なくなる**。

#### 難度の上げ方

上げ方は「一定の試行数ごとに1段」（`endlessDifficultyStep`）。連続成功で
上げる出来高制にはしない——上達したから上がったのか、たまたま当たったから
上がったのかが記録から分けられなくなる。試行数で上がるなら、何試行目がどの段
だったかは後から必ず言える。

| ゲーム | 上げるもの | 刻み | 推移 |
|---|---|---|---|
| crane 1段目（0〜5段） | 掴める範囲 `toleranceR` | 3試行ごと・15%減 | 15 → 12.75 → 10.8 → 9.2 → 7.8 → 6.6 |
| crane 2段目（6〜11段） | アームの速さ `sweepMs` | 3試行ごと・12%減 | 2200 → 1936 → 1704 → 1500 → 1320 → 1161 → 1100ms |
| fishing | 受付時間 `limitMs` | 4試行ごと・150ms減・5段 | 2000 → 1850 → 1700 → 1550 → 1400 → 1250ms |

**crane は先に範囲を詰め、詰めきってから速さを上げる。** 順番に意味がある。
範囲を狭めるのは「どこを狙うか」の課題を難しくし、速さを上げるのは「いつ
押すか」の課題を難しくする。同時に上げると、外した原因が狙いなのか間合いなのか、
本人にも支援者にも分からない。片方ずつなら、どこで終わったかがそのまま
「何が難しかったか」になる。

要求される時間精度は `grip圏の半径 × sweepMs/100`。既定 15/2200 で各軸
±165ms、1段目の終わりで ±73ms、2段目の終わりで ±36ms。人が確実に出せる精度は
超える——が、エンドレスは1回失敗で終わる遊びなので、いつか必ず届かなくなるのが
正しい。どこまで続けられたかが結果になる。

下限の根拠:

- `toleranceR` 6 … 狭すぎる範囲は「狙って押す」練習ではなく偶然の当たりになる。
  外しつづける課題は、難しい課題ではなく成立していない課題。
- `sweepMs` 1100ms … フェーズ開始から `INPUT_GUARD_MS`（320ms）の入力は捨てる
  ので、掃引がこれに近づくと「押せない時間」が掃引の大半を占める。掃引は往復
  する（`pointing.js` の `scanPercentAt` は周期 `2×sweepMs` の三角波）ので
  位置そのものは到達可能なままだが、3倍以上の余裕は残す。
- fishing `limitMs` 1250ms … 成立確認が随意運動として認めるRTの上限が1500ms。
  下限をそれより下に置くと「押せたはずの入力が間に合わない」課題になる。

#### 試行ごとの速さ（scan スキーマの変更）

`sweepMs` が試行ごとに変わるため、**試行に `sweepMs` を持たせた**
（`toleranceR` と同じ扱い）。要求精度は `grip圏の半径 × sweepMs/100` なので、
これが無いと、同じ距離の外れ方でも「どれだけ難しい試行だったか」を後から
言えない。持たない古い記録はセッションの `config.sweepMs` で補う。走査CSVにも
`sweepMs` 列として出す（末尾）。

crane 側では、描画（rAF の `scanPercentAt`）・押した瞬間の位置計算・記録の
3つが必ず同じ `trialSweepMs` を見る。`config.sweepMs` を直に読む場所は
解決点1か所だけに残してある——見えている場所と判定される場所がずれると、
公平性がその場で壊れる（`toleranceR` について既に守っている不変条件と同じ）。

エンドレスの狭まりは**土台**で、その上に従来のアシスト（連続で外したら一時的
に広げる `assistedToleranceR`）が重なる——難しくしつつ、外しつづけたときの
逃げ道は残す。

#### 試行ごとの受付時間（rt スキーマの変更）

fishing の `limitMs` が試行ごとに変わるため、**試行に `limitMs` を持たせた**。
`sanitizeReactionSession` は以前 config の値を全試行へ上書きしており、そのまま
だと短い窓で時間切れになった試行を「まだ間に合っていた」として再判定し、判定が
食い違った行を**丸ごと捨てて**いた（`sanitizeReactionTrial` は合わない行を
null にする）。難しくした回ほどデータが消える、といういちばん困る壊れ方をする。

いまは試行が自分の値を持っていればそれを使い、持たない古い記録だけ config で
補う。値は反応CSVにも出す（`limitMs` 列）。何段目の試行かも、この値から復元
できる。

#### 終わり方と上限

エンドレスには「予定した終わり」が無いので、止めたところが終わり。`destroy()`
で `finished = true` / `aborted = false` にし、実際にやった回数を
`config.targetTrials` へ書き戻す（`state.js` の完走判定が
`trials.length === targetTrials` を見るため、書き戻さないと再読み込みで
aborted に倒れる）。

aborted のままにしない理由は成立確認にある。`readinessCheck.js` の `isUsable`
は aborted の回を材料にしない。エンドレスをれんしゅうに使うほど成立確認の
材料が減る、という逆向きの動きになり、支援者からは「練習を重ねているのに
いつまでも成立確認が通らない」という見えない詰まりに見える。

上限は crane 100回 / fishing 15分・200試行。`state.js` の検証が `targetTrials`
を scan=1〜100 / rt=1〜200 で切るので、超えると再読み込みで「完走していない回」
に倒れる。fishing を真の無限にしないのは、合図の音を最初にまとめて計画し
lookahead スケジューラが窓に入ったものだけを予約する作りだから——途中で計画を
作り直すと時刻の基準（`anchorPerfMs` / `sessionStartAudioMs`）を取り直すことに
なり、反応時間の測り方そのものが変わる。遊びのために測定の土台は動かさない。

#### 説明の文言

レディ画面（「やりかた」）の**最後の1行だけ**を差し替える（`gameHost.js` の
`ENDLESS_HOWTO_KEYS`）。押し方の説明はどちらも同じで、変わるのは終わり方の
約束だけ。直さないと画面は「1分間」と言っているのに終わらない——説明と挙動が
食い違ったまま遊ばせることになる。全文を別キーで二重に持つと、片方だけ直した
ときに静かに食い違う。

#### 記録

`session.config.endless` に残し、走査CSV・反応CSV・セッション台帳に `endless`
列として出す（いずれも既存列の**うしろ**）。回数が回ごとに変わる理由がこの列。
決まった回数の回と同じ分布に混ぜてはいけない（試行の後半ほど疲れが乗るうえ、
そもそも試行ごとに難度が違う）。

### 9.3.1 セッションの推移（src/lib/sessionTrend.js）

- 評価ログに「かいごとの うつりかわり」を出す。README の目的にある
  「訓練前後の比較（導入訓練の効果測定）」は、1回ごとの記録だけでは読めない。
- **束ねる単位は「課題 × 条件」**。テンポ・拍数・つかめる広さ・画面の手がかり
  ——どれが違っても同じ指標を並べた意味が変わるので、別の線にする。束ねる
  キーには `describeSessionConditions()` の文字列をそのまま使う。別々に持つと、
  画面に出ている条件表示と束ね方が食い違う（表示は同じなのに別の線、または逆）。
- 中断した回は入れない（試行数が足りず指標が偏る。crane の自己最高と同じ線引き）。
- 課題ごとの主要指標と「どちらが良いか」を持つ（`higherIsBetter`）。
  sms=ずれのSD（小さいほうが良い）、gonogo=commissions、scan=grips（大きい
  ほうが良い）、rt=平均反応時間。
- **図は生の値をそのまま描く**（大きい値ほど上）。「上がれば良い」に正規化する
  描き方も試したが、下が良い指標で線が上がりながらすぐ下の数字は下がる、という
  図になった。ここは卒論の図の元になる画面なので、線と数字が逆を向いてはいけない。
  良し悪しは線の形ではなく、札（よくなっています／さがっています）と
  「小さいほうが よい」の注記で言う。
- 差が無いときは "same" を返す。1msの差を「良くなった」と書くと、支援者が
  それを実在の変化として読む。解釈するのは支援者、という全体の方針に合わせる。

### 9.4 evaluation 連動（失敗系のみ）

**研究の主データは課題別 CSV。既存 evaluation は互換維持の補助データとする。**
既存の taskTimingEarly/Late は「タイミングエラー」寄りの意味を持つため、
窓内 hit の早遅（失敗ではない）を流し込むと意味が混線する。よって:

- taskTimingMissed += misses（連動する）
- taskMistakes += commissions + extras（連動する）
- scan: taskTimingMissed += misses、taskMistakes += slips
- rt: taskTimingMissed += timeouts、taskMistakes += falseStarts + commissions
- taskTimingEarly / taskTimingLate へは**連動しない**（早遅の傾向分析は
  リズム CSV の rawOffsetMs で行う）
- logEvent({type:"game", label:`${gameId} 終了 go命中率${...}%`})

### 9.5 旧保存データ移行（v1/v2 → v3。v3→v4は§0A.7）

loadState() は v3 キーが空のとき次の順で移行を試みる（MUST）:

1. `neuronode-prototype-state-v2`（lib 分割版）を読む
2. なければ `neuro-trainer-state-v1`（App.svelte モノリス版）を読む
3. 読めた範囲で settings（同名キーのみ）・logs・evaluation
   （participantId・completedSessions 等、v2 のみ保有）を v3 へ写す。
   v1 の metrics 構造は v3 に対応先がないため移行しない（logEvent に
   「v1 から移行・metrics は引き継ぎ対象外」と記録）
4. 同じv3キー内の `rhythm.sessions` は taskType を補って `sessions` へ移送
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
- `#gameStage` に `data-game-id` と表示プロフィールを付け、ゲーム別背景と
  リザルトテーマの継ぎ目にする。`#gameProgress` は兄弟要素なので
  `:has()` に依存せず、古い WKWebView でも同じテーマを解決できるようにする。
- 装飾は `aria-hidden=true` / `pointer-events:none` とし、走査対象や
  フォーカス順を増やさない。ゲーム中はステージ全体が唯一の入力面。レディと
  リザルトは「開始」または「もういちど → メニューへ」の順を固定する。
- `prefers-reduced-motion` はCSSアニメーションだけでなく、rAF更新側でも分岐する。
  連続スクロール、パララックス、粒子を止め、静止差分・輪郭・事後スタンプへ置換する。
- highContrast では意味を色だけへ依存させず、4px輪郭、形、数字、文字を併用する。
  文字4.5:1、主要な非文字UI 3:1以上を満たす。
- 844×390と200%拡大では、装飾、パララックス、補助文の順に縮退する。進捗、
  44×44px以上の終了／CTA、主操作面、判定面、結果要約は隠さず、横スクロールと
  重なりを発生させない。

---

## 11. テスト

### 11.1 単体（node 実行、slot-v1を含む）

slot-v1は `tests/slot-judge.test.mjs` と `tests/slot-session.test.mjs` で、
位相0、周期境界、符号、許容幅、timeout、fps非依存、seed再現、1入力1停止、
round遷移、sanitize、中断を検証する。以下は残存課題・互換経路の検証である。

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

package.json の `test:unit` は judge / pointing / reaction / data-integrity を
順に実行し、`test` は `test:unit && test:web` とする。

追加の `pointing.test.mjs` は三角波の折り返しと grip/slip/miss 境界、
`reaction.test.mjs` は hit/timeout/falseStart/commission/correctRejection と
前刺激間隔生成を検証する。`data-integrity.test.mjs` は4つの taskType、
旧セッション移送、registry/preset整合、scan/rt CSV列数を検証する。

### 11.2 スモーク（tests/web-smoke.mjs、slot-v1を含む）

現行の必須経路は、slot-l1の生成画像読込・1停止・中断保存と、slot-l2の
4round×3reel完走である。各入力後に試行数が1だけ増え、active reelが
0→1→2を繰り返すこと、300ms内の追加clickが次リールへ流れないことを、
1280×900、390×664、834×1194、390×812、844×390で確認する。

1. 起動 → start → 6項目home、短画面では全ページへ到達できる
2. 「リールを 止める」→ slot-l1/l2を走査とclick-only入力で選べる
3. slot-l1で生成画像が読み込まれ、1入力で1停止だけ保存される
4. slot-l1をEsc中断するとpartial trialがaborted=trueで残る
5. slot-l2で全3本が動き、0→1→2の順を4round繰り返して12件で結果へ進む
6. 150msシェルdedupe後・300ms課題ガード内の追加入力が次リールを止めない
7. fishingとcraneの中断保存、gonogo/fishingの無音時データ拒否を維持する
8. slot CSVと旧rhythm/scan/rt CSV、評価・設定タブを維持する
9. 全5実寸で横overflow、44px標的、停止線・進捗・CTAの画面外逸脱がない
10. PWAのサブパス、offline reload、v1→v2更新競合で資産が混在しない

gonogo の correctRejection 演出時刻、reduced-motion、高コントラスト、
リザルトCTAを含む全画面の実機条件は §11.3 の確認対象であり、上記Webスモークの
PASSだけを実機合格とは扱わない。

### 11.3 実機確認チェックリスト（docs に追記）

- NeuroNode実入力でslot-l1を8停止、slot-l2を左→右12停止し、二重停止しない
- 実iPadの60/120Hz、縦横、Switch Control、Guided Accessで入力と終了導線が成立する
- 丸・魚・星・花・鳥・四角を利用者が弁別でき、停止線・activeリールが理解できる
- 長時間利用で疲労、焦り、余分な入力が増えないか支援者が観察する
- highContrast、大きい文字、動きを減らす条件で主操作・進捗・結果へ到達できる
- 残存する聴覚課題は内蔵スピーカーとサイレントスイッチ条件を別途確認する

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
6. `measure` と calibration は `visualGuidance=false` /
   `visualPresentation=instrument` を固定し、未来ノートが描画されないことを
   条件記録と実機画面の両方で確認する。

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
| 1 | matching / voca / letters をゲーム契約へ統合する時期 | 別課題。利用者ホーム下の既存セクションは維持 |
| 2 | gonogo の No-Go 音を 330Hz とするか無音予告つきにするか | 330Hz（弁別しやすさ優先） |
| 3 | セッション保持件数 50 の妥当性（iPad の localStorage 容量） | 50 で開始し実測で調整 |
