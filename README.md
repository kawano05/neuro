# neuro

`neuro` は、NeuroNode 利用開始時の導入訓練を支援する iPad 向けアプリの Web プロトタイプです。  
単なる教材集ではなく、入力反応の確認、合図に合わせた入力、選択入力、VOCAによる意思表示までを段階的に練習できる構成にしています。

## 目的

本プロジェクトでは、NeuroNode 利用者が支援者と一緒に入力操作へ慣れるための訓練アプリを開発します。Web版で素早く試作・検証し、Capacitor によって iOS アプリ化することを前提にしています。

研究上の独自性は、既存の一入力教材を参考にしつつ、NeuroNode の導入訓練に特化した以下の要素を持たせる点です。

- 段階式トレーニング: 反応確認、合図入力、選択入力、意思表示
- NeuroNode向け調整: 走査間隔、入力後待機、ボタンサイズ、音声/効果音、高コントラスト
- 支援者記録: 利用者ID、利用場面、入力結果、設定値、支援者メモ、CSV出力
- iOS移植前提: Web先行開発、Capacitor同期、GitHub ActionsでのiOSビルド確認

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
npm run test:web
```

`npm run test:web` は本番ビルドを作成し、Chromiumデスクトップ相当とiPhone/WebKit相当で主要画面、訓練入力、タブ移動、モバイル幅の崩れを確認します。

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

Windows上ではXcodeや本物のiOS Simulatorは使えないため、GitHub Actions の macOS runner で Capacitor iOS プロジェクト生成とXcodeビルド確認を行います。最終的な Switch Control、Guided Access、NeuroNode実機操作は iPad 実機で確認します。

## 主な画面

- `訓練`: 4段階の導入トレーニング
- `VOCA`: 病院・施設で使いやすい定型句
- `記録`: 支援者メモ、設定値、操作ログ、CSV書き出し
- `設定`: 利用者ごとの入力しやすさ調整

## 操作

- `Space` または `Enter`: 現在ハイライトされている項目を選択
- `ArrowRight`: 走査ハイライトを手動で次へ移動
- `Escape`: 走査停止
- 画面下部の「入力」ボタン: 単一スイッチ入力の代替

## 実装メモ

- フロントエンド: Svelte + Vite
- iOS化: Capacitor
- データ保存: localStorage
- 公開: GitHub Pages
- CI: Web煙テスト + macOS上のCapacitor iOSビルド確認

研究目的、関連研究の評価軸、実験タスク案は `docs/research-summary.md` に整理しています。  
iOS版ビルド手順は `docs/ios-build-steps.md` にまとめています。  
旧プロトタイプのモジュール分割メモは `docs/refactoring-notes-2026-06-10.md` に残しています。
