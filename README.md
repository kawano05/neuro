# neuro

neuro は、ニューロノード利用者向けiPad支援アプリのWeb試作版です。仙台高専 竹島研究室の「重度肢体不自由児のための学習支援ソフト」のように、複数の支援機能をひとつのアプリ内にまとめる構成にしています。現在は Svelte + Vite で画面を構成し、CapacitorでiOSアプリ化しやすいように、ビルド成果物は `dist/`、Capacitor設定はルートに置いています。

## Web版の起動

Node.js 22以上を推奨します。Capacitor 8系のCLIがNode.js 22以上を要求するため、iOS化まで行う環境では特にバージョンを合わせてください。

```powershell
npm install
npm run serve
```

その後、ブラウザで `http://localhost:5173` を開きます。開発時は `npm run dev` でも同じVite開発サーバーを起動できます。

## iOS化の流れ

Mac上で以下を実行します。

```bash
npm install
npm run build
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

Xcodeが開いたら、Signing & CapabilitiesでApple Developer Teamを選び、実機またはSimulatorで動作確認します。

## 操作

- `Space` または `Enter`: 現在ハイライトされている項目を選択
- `ArrowRight`: 走査ハイライトを手動で次へ移動
- `Escape`: 走査停止
- 画面下部の「入力」ボタン: 単一スイッチ入力の代替

## 機能

- スイッチ教材ソフト: 色変化
- スキャン・マッチング教材: 色、形、カテゴリを選ぶ練習
- 定型句VOCA: 基本、体調、介助、気持ちの定型句読み上げ
- 文字学習ソフト: ひらがなの選択練習
- 操作訓練: iOS Switch Controlの項目スキャン、ポイントスキャン、タップ、ドラッグをWeb上で模擬練習
- 効果測定: セッション単位でタスク完了時間、入力回数、誤選択、戻り操作、主観評価を記録
- 評価ログ: 入力、正答、誤選択をCSVで書き出し

研究目的、関連研究の評価軸、実験タスク案は `docs/research-summary.md` に整理しています。
iOS版ビルド手順は `docs/ios-build-steps.md` にまとめています。
モジュール分割リファクタリングの内容と改善バックログは `docs/refactoring-notes-2026-06-10.md` を参照してください。

## 実装メモ

- `src/App.svelte` が画面構造、`src/styles.css` が見た目です。制御ロジックは `src/lib/` 配下のESモジュールに責務単位で分割されています。
  - `src/lib/neuronodeApp.js` — ブートストラップ。ctxの構築、ビュー初期化、画面横断のイベント配線のみを担当
  - `src/lib/content.js` — 教材・タスク・研究条件などの純粋データ。**ゲーム追加はここの `switchModules` が起点**
  - `src/lib/state.js` — 状態の初期値・読み込み・保存（保存失敗時は通知）
  - `src/lib/audio.js` — 効果音・読み上げ（音バリエーション要件の集約先）
  - `src/lib/scan.js` — 走査エンジン
  - `src/lib/views/*.js` — 各画面のレンダリングとイベントリスナー
  - `src/lib/utils.js` / `src/lib/dom.js` — 純粋関数とDOM要素レジストリ
- モジュール間は共有コンテキスト `ctx`（state, elements, save, announce, speak, playTone, scan, logEvent, switchView, renderAll, views）で連携します。
- `public/` の `manifest.webmanifest`、`sw.js`、`icon.svg` はViteビルド時に配信ルートへコピーされます。
- ログ、設定、教材の入力回数は `localStorage` に保存されます（キー: `neuronode-prototype-state-v2`。保存失敗時はコンソールとライブリージョンに通知）。
- `public/sw.js` により、HTTP配信時は主要ファイルと取得済みアセットをキャッシュします。
- CSV書き出しは評価実験の入力回数、誤選択、定型句選択の確認用です。
- iOSネイティブプロジェクトはこのWindows環境では生成せず、Mac/Xcode環境で `npx cap add ios` します。
