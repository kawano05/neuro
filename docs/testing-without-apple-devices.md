# Apple実機なしでできるテスト方針

MacやiPhone/iPadを手元に持っていない間は、次の3層で確認します。

## 1. Windows上で確認すること

- `npm run check`: Webアプリとしてビルドできるか
- `npm run test:web`: Playwrightで主要画面、スイッチ入力相当、モバイル幅の崩れを確認
- GitHub Pages: 実際の公開URLでCSS/JS/Service Workerが読めるか確認

## 2. GitHub上のmacOSで確認すること

`.github/workflows/ci.yml` の `Capacitor iOS build` で、GitHubのmacOS runner上にiOSプロジェクトを生成し、XcodeのiOS Simulator向けビルドまで通します。

これで確認できること:

- CapacitorのiOSプロジェクト生成が壊れていない
- `dist/` のWeb成果物をiOSアプリに同期できる
- Xcodeでビルド不能になる設定ミスを検出できる

## 3. それでも代替できないこと

以下は最終段階で、借りたMac/クラウドMac/学校や先方のiPadなどで実機確認が必要です。

- iOSのスイッチコントロール実操作
- アクセスガイド中の挙動
- iPadの音量、音声読み上げ、画面回転、実タッチの反応
- App Store/TestFlight配布時の署名と審査まわり

## 実行コマンド

```powershell
npm run check
npx playwright install chromium webkit
npm run test:web
```

ブラウザを見ながら確認したい場合:

```powershell
npm run test:web:headed
```
