# iOS版ビルド手順

このプロジェクトは Svelte + Vite でWeb版をビルドし、その成果物 `dist/` をCapacitorでiOSアプリに取り込みます。`capacitor.config.json` の `webDir` は `dist` に設定済みです。

## 前提環境

- Mac
- Node.js 22以上
- npm
- Xcode
- Apple Developer Teamを選択できるApple ID

## 初回だけ行う手順

```bash
npm install
npm run build
npm run cap:add:ios
npm run cap:sync
npm run cap:open:ios
```

Xcodeが開いたら、以下を設定します。

1. `App` ターゲットを選ぶ
2. `Signing & Capabilities` を開く
3. `Team` にApple Developer Teamを選ぶ
4. 実機またはSimulatorを選んでRunする

## Web側を変更した後の更新手順

`src/` や `public/` を変更した後は、iOSプロジェクトへ再同期します。

```bash
npm run build
npm run cap:sync
npm run cap:open:ios
```

`npm run cap:sync` は内部で `npm run build && npx cap sync ios` を実行する設定にしているため、通常は次でも構いません。

```bash
npm run cap:sync
```

## 確認ポイント

- `dist/index.html` が生成されていること
- `capacitor.config.json` の `webDir` が `dist` であること
- XcodeでSigningのTeamが設定されていること
- 実機で確認する場合、MacとiPad/iPhoneを接続し、端末側で開発者を信頼すること

## 注意

- Windows環境ではXcodeを使えないため、iOSネイティブプロジェクトの生成と実機ビルドはMacで行います。
- Capacitor 8系のCLIはNode.js 22以上を要求します。
- App Store配布を行う場合は、Xcode上でBundle Identifier、署名、アイコン、プライバシー関連の設定を確認してください。
