# NeuroNode Support Lab

ニューロノード利用者向けiPad支援アプリのWeb試作版です。CapacitorでiOSアプリ化しやすいように、Web成果物は `www/`、Capacitor設定はルートに置いています。

## Web版の起動

```powershell
npm run serve
```

その後、ブラウザで `http://localhost:5173` を開きます。npmを使わない場合は次でも起動できます。

```powershell
python -m http.server 5173 --directory www
```

## iOS化の流れ

Mac上で以下を実行します。

```bash
npm install
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

## 実装メモ

- ログ、設定、教材の入力回数は `localStorage` に保存されます。
- `www/sw.js` により、HTTP配信時は主要ファイルをキャッシュします。
- CSV書き出しは評価実験の入力回数、誤選択、定型句選択の確認用です。
- iOSネイティブプロジェクトはこのWindows環境では生成せず、Mac/Xcode環境で `npx cap add ios` します。
