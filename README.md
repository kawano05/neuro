# neuro

`neuro` は、NeuroNode 利用開始時の導入訓練を支援する iPad 向けアプリの Web プロトタイプです。
単なる教材集ではなく、**タイミング入力課題（リズムゲーム）を中核に据えた導入訓練アプリ**として構成しています。

## 目的

本プロジェクトでは、NeuroNode 利用者が支援者と一緒に入力操作へ慣れるための訓練アプリを開発します。Web版で素早く試作・検証し、Capacitor によって iOS アプリ化することを前提にしています。

研究上の位置づけは、リズムゲームを「音楽ゲームのオマージュ」としてではなく、**感覚運動同期（sensorimotor synchronization; SMS）研究のタッピング課題をゲーミフィケーションした計測器**として設計する点にあります。聴覚キュー（時報型パターン: 低音のカウントイン→高音で押す）に対する入力時刻のオフセット（ズレ）を全試行で記録し、

- 利用者ごとの入力遅延の平均・分散の把握
- 走査間隔（scanInterval）等の設定値推奨の根拠データ
- 訓練前後の比較（導入訓練の効果測定）

に用います。キューは聴覚優先（画面注視が困難な利用者にも適用できるよう、視覚は補助表示に格下げ）とし、支援者向けの効果測定・評価記録機能はこの計測を下支えする継承機能として維持しています。

設計の詳細は `basic-design.md`（基本設計）・`detailed-design.md`（詳細設計）を参照してください。

## 画面フロー

利用者の世界（スタート〜ゲーム）と支援者の世界（タブ）を分離しています。

```
[スタート画面] → (1押しで AudioContext アンロック + 入力導通確認)
      │
      ▼
[アプリ選択]   → ゲームタイルのグリッド。走査で巡回、スイッチで決定
      │
      ▼
[ゲーム実行]   → 走査を完全停止し、画面全体が単一のスイッチになる
      │           （NeuroNode等の Switch Control との二重走査を構造的に防ぐ）
      ▼
[リザルト]     → 達成率・平均オフセット・ばらつき等を表示 → アプリ選択へ戻る
```

支援者向けビュー（効果測定・評価ログ・研究・操作訓練・設定）は既存タブとして残っています。操作訓練・効果測定・研究タブは「設定」画面の「研究者モード」トグル（既定OFF）で表示を切り替えます。設定・記録・研究データの変更は、各支援者ビューで「支援者編集を開始」を押したセッション中だけ有効です。このロックは認証ではなく、利用者の自前走査による誤操作を防ぐためのものです。

## あそび（ゲームタイル）一覧

アプリ選択画面には6枚のタイルが並びます。6種の別ゲームではなく、**同一の判定エンジンとログ基盤の上の難易度階段**です（パラメータだけが異なる同一エンジン、`src/lib/games/rhythm.js`）。

| タイル | ゲームID | 訓練段階 | 内容 |
|---|---|---|---|
| いろがかわる | `color-legacy` | L0 反応確認 | 押すと色と音が変わる（既存移植） |
| リズム れんしゅう | `rhythm-l1` | L1 合図入力（予告あり） | 時報型カウントイン→高音（押しどころ）で押す |
| リズム つづけて | `rhythm-l2` | L1-2 合図入力（連続） | カウントインは最初の1回のみ、以後は毎拍が押しどころ |
| たかいおとだけ | `gonogo` | L2→L3 橋渡し | 高音（Go）なら押す・低音（No-Go）なら見送る抑制課題 |
| そくてい | `calibration` | 計測補助 | 基準オフセット測定。支援者向け導線（候補値の保存） |
| じゅんびちゅう | `future-slot` | — | 非表示相当（`enabled:false`、走査対象外） |

いずれのゲームも入力時刻はゲーム側ではなくシェル（`src/lib/neuronodeApp.js` の入力ファネル）が `performance.now()` で確定し、契約経由でゲームへ渡します。全ゲームが同じ入口を通ることで、入力系遅延の測定条件が課題間で揃います。

## 起動

Node.js 22 以上を推奨します。

```powershell
npm install
npm run serve
```

ブラウザで `http://localhost:5173` を開きます。

## テスト

```powershell
npm run check
npm test
```

`npm test` は `test:unit`（判定ロジック・状態復元・CSV安全化・評価セッション整合性の単体テスト）と `test:web`（本番ビルド後にPlaywrightでスモークテスト）を順に実行します。`test:web` は Chromiumデスクトップ相当とiPhone/WebKit相当で、スタート→アプリ選択→ゲーム、長押しとclick-only支援入力、キーボード操作、支援者ロック、自動走査停止、サブパスでのPWA配信と初回ロード直後のオフライン再読込、旧SW制御中に次版indexだけ取得する更新レース、既存タブの不退行、モバイル幅を確認します。

## iOS化

Mac + Xcode 環境で以下を実行します。

```bash
npm install
npm run build
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

`cap:add:ios` は CocoaPods 版の Xcode workspace を生成します。CI とローカル検証では `ios/App/App.xcworkspace` を `App` scheme でビルドします。

Windows上ではXcodeや本物のiOS Simulatorは使えないため、GitHub Actions の macOS runner で Capacitor iOS プロジェクト生成とXcodeビルド確認を行います。最終的な Switch Control、Guided Access、NeuroNode実機操作は iPad 実機で確認します（`basic-design.md` §10・`docs/testing-without-apple-devices.md` 参照）。

## 操作

- `Space` または `Enter`: シェル画面ではハイライト中の項目を選択／ゲーム中は画面全体への入力として扱う
- `ArrowRight`: 走査ハイライトを手動で次へ移動（シェル画面のみ）
- `Escape`: シェル画面では走査停止／ゲーム中はゲームを中断してホーム（またはアプリ選択）へ戻る
- 画面下部の「入力」ボタン: 単一スイッチ入力の代替（シェル画面）
- ゲーム画面は全画面が単一のスイッチ（タップ・クリック・Space/Enter）

## 実装メモ

- フロントエンド: Svelte + Vite
- 音: Web Audio（オシレータ合成、先読みスケジューラ `createBeatScheduler`）。音源ファイルは使用しない
- iOS化: Capacitor
- データ保存: localStorage（`neuronode-prototype-state-v3`。リズム計測CSVが研究の主データ、既存の効果測定CSVは補助データ）
- 公開: GitHub Pages
- オフライン: ビルド時にindex・ハッシュ付きWeb資産・manifest・iconを列挙し、Service Workerのinstall時に内容ハッシュ版の不変cacheへprecache。オンライン時はnetwork-firstで最新応答を返し、cacheは次版SWのinstall時に版単位で更新（Capacitorでは登録しない）
- CI: 単体・Web煙テストでPages公開をゲート + macOS上のCapacitor iOSビルド確認

研究目的、関連研究の評価軸、実験タスク案は `docs/research-summary.md` に整理しています。
iOS版ビルド手順は `docs/ios-build-steps.md` にまとめています。
Apple実機なしでの確認方針と実機確認チェックリストは `docs/testing-without-apple-devices.md` にまとめています。
旧プロトタイプのモジュール分割メモ（2026-06-10時点、その後の起動経路一本化・ゲーム基盤化で構成は変わっています）は `docs/refactoring-notes-2026-06-10.md` に残しています。
