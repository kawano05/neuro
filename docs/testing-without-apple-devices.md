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

### 3.1 リズム系ゲーム（P4）実機確認チェックリスト（detailed-design.md §11.3）

ゲーム基盤（`src/lib/games/`）は聴覚キューを研究計測の主データとして扱うため（README.md
「目的」節参照）、Web版のPlaywrightスモークでは検証しきれない下記4点は、iPad実機で
必ず確認してから測定データを収集すること。

- **内蔵スピーカーでのキュー再生**: リズムL1/L2・Go/No-Go・キャリブレーションの
  低音/高音/No-Go音（`content.js` の `cueTones`）が内蔵スピーカーで明瞭に聞き取れるか。
- **サイレントスイッチON時の挙動**: 現状のWeb Audio実装ではサイレントスイッチONで
  音が鳴らない可能性がある（`audio.js` 冒頭コメント参照）。本アプリは「音優先」の
  設計判断（基本設計書 §1.2・§6）のため、サイレントスイッチが訓練中にONのままだと
  計測が成立しない。運用上はサイレントスイッチOFFを徹底するか、iOS化フェーズ（P6・
  基本設計書 §10 の表の1番、下記参照）でネイティブ側のAVAudioSessionを
  `.playback` に設定して解決する。
- **NeuroNode（Switch Control経由）入力でのプレイとオフセット記録**: NeuroNode
  からの入力が `source: "keyboard"` としてゲームの入力ファネル
  （`neuronodeApp.js` の `acceptSwitchEvent`）に届き、`rhythm.sessions` の
  trials に `inputMs`/`rawOffsetMs` が記録されること。Switch Controlの項目スキャン
  経由だとOSの選択処理遅延がオフセットに混入するため、実験プロトコルとしては
  キーボードHID（Space送出）または画面タップでの運用を前提とする
  （基本設計書 §10 の表の2番、P6で `docs/measurement-protocol.md` として正式文書化予定）。
- **ゲーム中に二重走査が発生しないこと**: `scan.js` の不変条件
  （`state.currentView === "game"` では `start()`/`restartIfNeeded()` が
  即 return する二重防御、detailed-design.md §8.4）に加えて、実機のSwitch Control
  項目スキャンとアプリ内走査が同時に動いていないことを目視でも確認する。

上記のうちサイレントスイッチ対応（1番目）とCSV書き出し経路（下記参照）は、
基本設計書 §10「iOS最終形態への適合」の対応表で **iOS化フェーズ必須** と
位置づけられている。P4時点のWeb版はこれらの制約を持ったまま動作する
（運用ノートとして本チェックリストに明記するに留め、コード変更はP6で行う）。

なお、CSV書き出し（評価CSV・リズムCSV）が現状のBlob+`a[download]`方式のまま
WKWebViewで機能しない問題（基本設計書 §10 の表の3番）も、実機確認時にあわせて
再現・記録しておくこと。

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
