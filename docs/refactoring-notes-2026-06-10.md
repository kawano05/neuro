# リファクタリングノート（2026-06-10）

iOS化の前段として、`src/lib/neuronodeApp.js` に集中していた全ロジック（約1,100行）を責務単位のESモジュールへ分割した。挙動保存を原則としたメカニカルなリファクタリングであり、ユーザーから見える動作は従来と同一（例外は後述のlocalStorage保存の1点のみ）。Capacitorは `dist/` をそのままWebViewに載せる方式のため、iOS化そのものに対する直接の変更は不要で、本リファクタの狙いは (1) 打合せで合意した「複数ゲームを起動メニューから選ぶ1アプリ」構成へ拡張しやすい継ぎ目を作ること、(2) iOS実機検証で必ず触ることになる走査・音・保存の各レイヤーを独立して差し替え可能にすること、の2点にある。

## 新しいモジュール構成

`src/App.svelte`（マークアップ）、`src/main.js`、`src/styles.css`、`index.html`、`vite.config.js` は無変更。`src/lib/neuronodeApp.js` はエントリポイント名を維持したままブートストラップ（配線役）に置き換わり、実装は以下へ移った。

| ファイル | 責務 |
|---|---|
| `src/lib/content.js` | 教材・タスク・研究条件・表示ラベルなどの純粋データ。**ゲーム追加の起点**（`switchModules`） |
| `src/lib/state.js` | 状態の初期値 `defaultState`、`loadState()`（旧保存とのマージ）、`createStateSaver()`（保存失敗の通知付き） |
| `src/lib/utils.js` | `escapeHtml` / `escapeCsv` / `formatTime` / `formatDuration`（純粋関数） |
| `src/lib/dom.js` | `collectElements()` — App.svelteのid群への参照レジストリ |
| `src/lib/audio.js` | `createAudio()` — 効果音と読み上げ。**音バリエーション要件の集約先** |
| `src/lib/scan.js` | `createScanEngine()` — 走査エンジン（refresh / start / stop / step / activate / toggle） |
| `src/lib/views/*.js` | 各画面のレンダリングとリスナー（switcher, matching, voca, letters, operation, evaluation, research, log, settings） |

モジュール間は共有コンテキスト `ctx`（state, elements, save, announce, speak, playTone, scan, logEvent, switchView, renderAll, views）で連携する。各ビューは `init○○(ctx)` を一度呼ぶとリスナーを張り、`{ render, ... }` のAPIを返す。`logEvent` → 効果測定の自動集計（`views.evaluation.countEntry`）→ ログ/効果測定の再描画、という旧来の呼び出し順序もそのまま維持している。

検証は `npm run build`（Vite 6 / Svelte 5、成功）に加えて、jsdom上でビルド成果物を起動するスモークテスト22項目（初期描画、スイッチ入力と記録、タブ遷移、マッチング/VOCA/文字学習の操作とログ反映、正答率集計、設定変更の保存、自動走査の開始・トグル・キー操作）を全件パスで確認した。テストスクリプトは `smoke.mjs` として同梱してある（`npm i jsdom --no-save && node smoke.mjs` で再実行可能。納品リポジトリには含めず手元検証用）。

## 挙動を変えた点（1点のみ）

状態保存（旧 `saveState`）を try/catch で保護した。旧実装では localStorage への書き込み失敗（容量不足、Safariプライベートブラウズ等）が例外としてそのまま伝播し、以降の描画処理が中断する可能性があった。新実装（`state.js` の `createStateSaver`）では失敗時に `console.error` へ記録し、初回のみライブリージョン経由で「データの保存に失敗しました」と通知する。それ以外のロジック・タイミング・保存キー（`neuronode-prototype-state-v2`）は一切変えていない。

## 発見した問題と改善バックログ

**P1: operation / evaluation / research 画面への導線がない。** タブは6画面（switcher, matching, voca, letters, log, settings）のみで、`visibleViews` にも上記3画面が含まれないため、マークアップ上は存在するのにユーザーが到達できない。効果測定の「タスク画面へ」ボタンが `switchView("operation")` を呼んでも switcher にフォールバックする。タブを常設するか、設定画面に「研究者モード」トグルを置いて出し分けるかは設計判断なので、メンバー間で方針を決めてから実装したい（リファクタ後は `content.js` の `visibleViews` と App.svelte のタブ追加だけで済む）。

**P1: DOM全面再構築による走査フォーカスの喪失。** 各ビューが描画のたびに `innerHTML` を再生成するため、走査中に再描画が走ると `.scan-focus` の付いた要素ごと破棄され、走査位置が実質リセットされる（`refresh()` 内のインデックス補正のみが頼り）。利用者は走査周期に合わせて入力タイミングを構えているので、ここの安定性は実利用での操作感に直結する。恒久対応は差分更新（Svelteコンポーネント化）だが、暫定でも「再描画後に同一要素を `data-scan-id` で探して走査位置を復元する」対応は可能。

**P2: localStorage 依存。** 今回保存失敗を通知するようにしたが、根本的には共有iPad運用（Guided Access・複数利用者）でのデータ保持手段として localStorage は心許ない。iOS化の際は Capacitor Preferences（ネイティブ側のUserDefaultsに保存）への移行を推奨。保存処理が `state.js` に一本化されたので、差し替えはこのファイルだけで完結する。

**P2: 手動バージョニング（-v10）とService Workerの手動キャッシュ列挙。** `vite.config.js` でファイル名を `-v10` に固定し、`public/sw.js` がそのファイル名を手書きで列挙している。更新のたびに3箇所（vite.config / sw.js / index.html）の数字を揃える必要があり、揃え忘れると旧キャッシュが配信され続ける。Vite標準のコンテンツハッシュ＋`vite-plugin-pwa`（Workbox）による自動生成へ移行すれば、この手作業は丸ごと不要になる。なおCapacitorアプリ内ではSWキャッシュ自体が不要（アセットはローカル同梱）なので、iOS版ではSW登録をスキップする分岐も検討対象。

**P2: デプロイ経路の混在。** `index.html` に localhost 分岐の二重ローダがあり、リポジトリルートにもビルド成果物（`assets/main-v9.js` 等の旧版含む）がコミットされている一方、GitHub Actions は `dist/` を Pages にデプロイしている。「Pagesはdistから、ルート直置きは廃止」に一本化し、ルートの `assets/`・`sw.js`・`manifest.webmanifest`・`icon.svg`（public配下と重複）は削除してよいはず。先方確認用URLが現在どちらを向いているかだけ確認してから整理すること。

> 2026-07-10対応済み: Pages workflowが`dist/`を公開することを確認し、ルート直置きの旧成果物を削除。Vite標準のコンテンツハッシュを使い、ビルド後にindex・hashed JS/CSS・manifest・iconのprecache一覧と内容ハッシュ版cache名を持つSWを自動生成する構成へ一本化した。install時に全資産を不変cacheへprecacheし、オンライン時はnetwork-firstで最新応答を返す。cacheは次版SWのinstall時に版単位で更新するため、旧cacheへ新indexだけが混入しない。

**P3: 自前走査とiOS Switch Controlの二重走査。** 本アプリの走査エンジンはWeb上でSwitch Controlを「模擬」するためのもので、iOS実機でSwitch Controlを有効にすると走査が二重に走る。iOS版では「自前走査OFF（autoScan=false＋走査UI非表示）でOSのSwitch Controlに委ねるモード」を用意するのが研究計画（参照構成/最適化構成の比較）とも整合する。走査が `scan.js` に独立したので、エンジン差し替え・無効化は局所変更で済む。

**P3: WKWebViewでの音まわり。** `AudioContext` はユーザー操作起点で初期化される現実装でOKだが、iPadのサイレントスイッチONだと効果音が鳴らない場合がある（打合せで「音が操作実感に直結する」と確認された要件なので実機で必ず検証）。`speechSynthesis` の日本語ボイスは取得タイミングに癖があるため、初回読み上げが無音にならないかも確認項目。必要ならネイティブTTSプラグインへの差し替えを検討（`audio.js` に集約済み）。

## 打合せ要件（2026-04-20）とのギャップ

現行アプリは教材・評価基盤としては要件を満たすが、打合せで挙がったゲームコンテンツはまだ存在しない。対応関係を整理すると次のようになる。

| 打合せ要件 | 現状 | 実装の置き場所 |
|---|---|---|
| ゲーム群（鬼退治・回転寿司・お絵描き音階・サッカー） | 未実装（switchModulesは「色変化」のみ） | `content.js` の `switchModules` ＋ `views/switcher.js` |
| 段階的難易度（風船割り→難化） | 未実装 | 各ゲームモジュールの stage 概念として |
| 音を変えられる機能（爆発系・ポヨン系） | 未実装（単音トーンのみ） | `audio.js` に音プリセットを追加 |
| 「はい/いいえ」タイミング選択 | 未実装（西村さん強い要望） | VOCAの発展形 or 独立ゲームとして。回転寿司と同じ「タイミング押し」機構を共有できる |
| スコア機能 | 未実装（打合せでは「検討」扱い） | 入力回数・正答の記録基盤は既にあるので表示層の追加で可 |
| クレジット表記（学生名・学校名） | 未実装 | 起動メニュー or 設定画面下部に。「プロデューサー」風の見せ方の要望あり |
| オンライン協力プレイ | 対象外（Web版限定の将来形と合意済み） | — |

「複数ゲームを起動メニューから選ぶ」構成は、現在のスイッチ教材画面のモジュールグリッドがそのまま起動メニューの原型になる。ゲーム追加の手順は次の通り。

```js
// 1. content.js — モジュール定義を追加
export const switchModules = [
  { id: "color",   name: "色変化",   description: "...", tones: [392, 440, 494, 523] },
  { id: "balloon", name: "風船割り", description: "入力すると風船が割れます。",
    tones: [523, 587, 659], stages: 3 },   // ← 追加
];

// 2. views/switcher.js — renderStage() に表示分岐、runActivity() に挙動分岐を追加
//    （モジュールが増えてきたら views/games/balloon.js のように1ゲーム1ファイルへ）
```

回転寿司のような「タイミング押し」系は、判定ループを `requestAnimationFrame` で回し、`ctx.scan` と競合しないよう自前走査OFFを前提に設計するのがよい。タイミング判定の成否は既存の `logEvent({ type: "...", correct })` に乗せれば、効果測定のタイミングエラー集計（見逃し・早押し・遅押し）とそのまま接続できる。

## iOS化チェックリスト

ビルド手順自体は `docs/ios-build-steps.md` の通り。Mac作業時に今回のリファクタ観点で追加確認すべき点は、(1) WKWebViewでの効果音（サイレントスイッチON/OFF両方）と読み上げの初回動作、(2) localStorageのデータがアプリ再起動・iPadOSアップデート後も保持されるか（だめならCapacitor Preferencesへ移行）、(3) Switch Control有効時の二重走査の挙動と自前走査OFF運用、(4) Guided Access下でのCSVダウンロード動線（`<a download>` はWKWebViewで挙動が異なるため、必要なら `@capacitor/filesystem`＋共有シートへ差し替え）、(5) SW登録のスキップ要否、の5点。

## ビルド・動作確認結果

`npm install` → `npm run build`（vite v6.4.3 / svelte 5系）成功。出力は従来同様 `dist/assets/main-v10.js`（89.1 kB / gzip 27.7 kB）・`main-v10.css`・`index-v10.js`。jsdomスモークテスト22項目全パス。既存のlocalStorage保存データ（v2キー）はそのまま読める（`loadState` のマージロジックを原文移植）。
