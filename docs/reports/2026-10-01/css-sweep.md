# CSS整理の報告（2026-10-01）

> この報告は、その日の作業の記録（あとから書き換えない）。今の決まりは `docs/rules/` を見る。
> 中の `test-results/` のログ・画像は、そのとき作業した PC にだけある（git の外）。

作業場所: D:/Code/neuro-wt/css-sweep。ブランチ: design/css-sweep。変更前: 798016f9f1b0eaad287788279dbd99dcbe113256。
アプリの変更は CSS 4ファイルのみ。JS・Svelte・研究記録の保存、sanitize、CSVは変更していない。push はしていない。

## コミット

- c2acc9c: 使われなくなった旧画面のCSSを削除。
- 91ddc9e: 世界と結果画面のCSSの重ね書きを担当ファイルへ集約。

## 未使用の規則の削除

src/styles.css の未使用クラス101種類を確認し、233規則から267セレクタを削除した（共有規則では未使用の枝だけ削除）。使われていないIDの削除は0件。
対象は旧色の舞台と結果、旧研究者・評価画面、旧選択・操作練習、起動時の設定リンクなど。全セレクタと根拠は末尾の表に記載した。行番号は変更前のもの。

削除した旧演出専用のキーフレームは6個: color-chip-pop、color-chip-ripple、color-prism-arrive、color-prism-ring、color-light-burst、pulse-ring。残るCSS・JSからの参照がないことを確認した。
調査ログ: css-audit.txt / css-audit.json / dynamic-class-uses.txt / css-unused-removals.json（すべてこの test-results 内）。文字列の単純一致だけで判断せず、変数の値・生成する親要素も確認した。module-color は rhythm.js の古いコメントにだけ残り、現在は module-pop を生成する。

## 重ね書きの統合

| 対象 | 移動元 → 所有先 | 整理内容 |
|---|---|---|
| .slot-stage.is-practice / .slot-status / .slot-reel / .is-active / .is-stopped | theme-hakkiri.css → world-slot.css | 古い背景・枠色・影・状態色を削除。実際に残っていた文字色と4pxの枠をworld-slotの既存規則へまとめた。最終値と状態の優先順を維持。 |
| .game-stage-content.module-crane.is-practice / .crane-marquee / .crane-console / .crane-marquee-title | theme-hakkiri.css → world-crane.css | world-craneの同じセレクタ・通常条件が背景・枠・影・字の色をすべて上書きしていたため、theme側の旧規則だけ削除。 |
| body.result-mode.user-world #resultView / .result-stats | theme-hakkiri.css → responsive.css | 最終の寸法・余白・割り付けを担当するresponsiveに、残っていたdisplay / justify-items / margin / border / background / box-shadowを移動。古いmin-height / align-content / gap / width / paddingを削除。 |
| .crane-tray-label | theme-hakkiri.css → styles.css | 両方の回に使う受け口の字の最終色・文字サイズを基本規則に集約。world-craneの練習用・高コントラスト用の上書きは維持。 |
| body.high-contrast .rhythm-offset-mark | styles.css内 | 後の同じセレクタのborderに完全に覆われる、前の白borderだけ削除。最終の黒border＋白outlineは維持。 |
| .readiness-list | styles.css内 | display:grid、最終gap:10pxとリストの基本規則を最初の1か所にまとめ、後の重複を削除。 |
| @media(max-height:500px) .crane-stage | styles.css → theme-hakkiri.cssの既存規則 | 後の同条件・同セレクタのmax-height:noneに完全に覆われていた74vhを削除。 |
| @media(max-height:500px) .party-result .party-result-main | theme-hakkiri.css内 | 後の同条件・同セレクタのgap:10pxに完全に覆われていたgap:12pxを削除。 |

読み込み順は main.js の styles → theme → world-* → responsive → decoration-motion のまま。条件・詳細度が異なる規則は、基礎値として効く場合があるので一律には削除していない。

## 残した規則と判断が難しいもの

- .is-1-reel: slot.js の is-${config.reelCount}-reel で生成するので維持。
- .is-nogo / .is-correctRejection / .is-commission: rhythmVisuals.js のノート種・判定・状態の is-${...} で生成するので維持。
- .is-bunt: baseball.js / results.js の結果の is-${result} で生成するので維持。
- .is-better / .is-worse / .is-same: log.js の is-${direction} で生成するので維持。
- .has-bow / .has-crown: partyArt.js の outfitClasses が has-${id} を生成するので維持。
- .shapeの色・形: matching.js がcontent.jsのoption.visualを差し込む。現在SVGに置き換わる場合でもフォールバックの生成経路があるので維持。
- data-*条件、:is() / :has()、i18n内のruby・HTML: 使用経路があり維持。属性値・複合セレクタの単純な未使用判定はしていない。
- さかなつりの基本規則とworld-fishingの練習限定規則: 基本規則は測定の回・共通形状にも必要。練習側だけで上書きされることを理由に削除していない。
- 同じ対象に見えるが詳細度・画面条件・状態条件が異なる残りの重ね書き、複合規則の一部だけ覆われる宣言: 全条件で無効と証明できないものは残した。world-gonogoとdecoration-motionも変更なし。

## 行数

物理行数（末尾改行は行に数えない）。

| ファイル | 前 | 後 | 増減 |
|---|---:|---:|---:|
| src/styles.css | 7633 | 6037 | -1596 |
| src/theme-hakkiri.css | 3389 | 3325 | -64 |
| src/world-slot.css | 170 | 172 | +2 |
| src/world-crane.css | 406 | 406 | 0 |
| src/world-fishing.css | 405 | 405 | 0 |
| src/world-gonogo.css | 531 | 531 | 0 |
| src/responsive.css | 280 | 286 | +6 |
| src/decoration-motion.css | 75 | 75 | 0 |
| 合計 | 12889 | 11237 | -1652 |

配布CSS: 262,305 → 234,821 bytes（27,484 bytes、約10.48%減）。

## 検証

1. 変更前に npx vite build --outDir test-results/before-dist を実行し成功。元のビルドは before-dist/ に保持。変更前のCSSは index-B48vtjvj.css。変更後のnpm run buildも成功（build-after.log、既存の500KBチャンク注意のみ）。CSS以外の23資産もバイトで照合し、中身の差は0。JSバンドルはファイル名のハッシュだけ変わり、中身は同一（non-css-assets.json）。
2. 測定の回: 294場面、画面の中身が違う 0、遊ぶ面のRGB差分がある場面 0。 コマンド: node scripts/compare-measure-screens.mjs --before test-results/before-dist --after dist。ログ: measure.log / measure.stderr.log、結果: measure-compare/results.json。
3. 全画面: 737枚 → 737枚。撮影失敗 前0 / 後0。通常画像の差 297、位相固定画像の差 4、スタイル指紋の差 0、位置・寸法の差 0。 capture-screens.mjsをtest-resultsへコピーし、変更前は配信元をbefore-distへ変更。14サイズ・--allの全経路を撮影。時計・乱数を固定し、通常画像に加え、描画履歴をリセットしてCSS/Web Animationsを1000msに固定した補助画像と可視要素のスタイル・寸法も保存。スタイル指紋の照合は通常要素の計算済みスタイル・属性・テキスト、擬似要素も含めた最終描画の照合はRGB画素比較で行う。アプリのコード・記録は変更しない。ログ: capture-before.log / capture-after.log と各stderr.log。画像・概要: screens-before/、screens-after/。全画像のRGB画素比較: all-screen-compare/results.json、compare-all.log。
4. npm run test:unit: 31/31検査ファイル成功（unit.log）。node tests/web-smoke.mjs: 全5環境×57検査=285件を選択、242件成功・43件はスクリプトの環境条件によるスキップ・失敗0・終了コード0。chromium-desktop: 54成功/3スキップ、mobile-webkit-like: 46成功/11スキップ、ipad-portrait: 48成功/9スキップ、phone-tall: 46成功/11スキップ、phone-landscape: 48成功/9スキップ。 ログ: web-smoke.log / web-smoke.stderr.log。SMOKE_PROJECTS / SMOKE_CHECKSの絞り込みなし。

### 画素差分の目視判定

全737場面をRGBで照合した。差がある297場面を75枚の比較シートで目視し、CSS整理による見た目の変更は認めなかった。目視資料: all-screen-compare/review.html、review-001.png〜review-075.png、review-sheets.json。

- 293場面の通常画像の差は、CSS/Web Animationsを同じ1000msに揃えるとRGB差0になる。動く魚・バット・リール・舞台の装飾、ボタンの動きなどの位相差と判定した。
- 残る4場面は練習のふうせんわりのSVG図形の縁の微小差。1133×744で13画素、834×1194で21画素、667×375で2画素、390×844で12画素（合計48画素）。拡大して縁の描画の違いだけであることを確認した。可視要素のスタイル・位置・寸法・時計は全737場面で同一。拡大資料: balloon-edge-review.png、balloon-pixel-analysis.json。
- 原因確認のため、変更前ビルドを単独でもう一度1133×744の全52場面で撮影した（撮影失敗0）。同じ変更前ビルド同士でも風船の同じ場所の13画素が異なり、再撮影した変更前画像と変更後画像はRGB差0だった。CSS変更が原因でないことをこの再現で確認し、他3サイズも同じSVGの縁・同一スタイルであることから描画の揺れと判断した。証拠: repeat-pixel-analysis.json、balloon-repeat-review.png、capture-before-repeat.log、screens-before-repeat/。

測定の回については、補助撮影の位相差に頼らず、専用のcompare-measure-screens.mjsで294場面の中身・遊ぶ面・画面帯のRGB差がすべて0であることを確認した。

別担当のweb-smokeを再検出し、初回の途中撮影を中断した（capture-before-overlap.log、screens-before-overlap/は採用しない）。次の撮影も途中で別担当のweb-smokeが再開し、さらにテスト時計のperformance/rAF原点に小数のずれがあったため、clock-drift名で保存して採用しない。最終の撮影ではDate・performance・イベント時刻を同じ原点に揃え、rAFを16ms刻みに固定し、各場面の時計をclock.jsonにも保存した。アプリのJSは変更していない。測定比較・変更前撮影・変更後撮影・web-smokeを順番に実行し、各検査は他の重い検査の終了を待って開始した。変更前の風船を同じビルドでもう一度単独撮影して微小差の原因を確かめた。最終の全件web-smokeは単独で一度実行し、時間切れ・描画揺れによる失敗0、再試行不要だった。

## UDチェック（今回の変更について）

参照: D:/Code/neuro/docs/rules/ud-checklist.md。今回の「満たした」はCSS整理による既存の見た目・操作性の維持についての判定。自動検査の範囲で確認し、実機のVoiceOver・NeuroNode・消音や着信・古いiPadの性能評価は今回実施していない。

- A1: 満たした（維持）。形・文字・位置を含む前後描画、装飾停止と読み上げのweb-smokeを確認。
- A2: 満たした（維持）。全737場面でスタイル・寸法が同一。iPadの大きい文字・くっきり表示、ruby/英語を含む説明・結果のweb-smokeが成功。色・枠の最終値を維持した。新規の全画面コントラスト測定は行っていない。
- A3: 満たした（維持）。4種類の雰囲気とreduced motionの装飾停止、演出の安全上限のweb-smokeとfx/effect-gainの単体検査が成功。decoration-motion.cssは変更なし。
- A4: 満たした（自動検査の範囲で維持）。走査・Switch Controlへの委譲・キーボード・タップ対象の大きさのweb-smokeが成功。
- A5: 関係ない。時間制御・読み上げ・開始ガードのJSは変更なし。説明中の押下ガードのweb-smokeも成功。
- A6: 満たした（維持）。遊ぶ画面の共通帯・説明・結果・そくてい/れんしゅう表示を前後比較。結果に支援者の操作が混入しないweb-smokeが成功。
- A7: 満たした（維持）。14サイズ737場面で位置・寸法の差0。はみ出し・タップ対象と、短い/高い画面の説明・結果のweb-smokeが成功。
- B1: 満たした（維持）。全支援者画面が走査枠の対象外であるweb-smokeとscan-supporterの単体検査が成功。
- B2: 関係ない。入力の重複防止・開始ガードは変更なし。押下の落ち込み防止などのweb-smokeは成功。
- B3: 満たした（表示の維持）。そくてい/れんしゅうの画面と設定を比較。設定のリセット、書き出し前の削除禁止と書き出し後に記録が変わった際の削除禁止のweb-smokeが成功。
- B4: 関係ない。保存の区分・参加者・ファイル名生成のコードは変更なし。参加者と日時を含むダウンロード名のweb-smokeが成功。
- B5: 満たした（表示・操作性の維持）。設定の組み合わせを含むweb-smoke、スイッチでエンドレスや音が出ない画面から終了する検査が成功。
- C1: 関係ない。例外の隔離や記録処理は変更なし。演出故障時にも課題を完了・記録するweb-smokeが成功。
- C2: 満たした（維持）。測定294場面の中身とRGB差0。測定に演出が漏れないweb-smokeとpartyの単体検査が成功。
- C3: 関係ない。音の可用性と代替読み上げの処理は変更なし。音が出ない場合の開始禁止・読み上げ失敗時の代替説明のweb-smokeが成功。
- C4: 満たした（表示の維持）。保存失敗を表示し、未保存状態を書き出すweb-smokeが成功。保存ロジックは変更なし。
- C5: 関係ない。中断とタイマー破棄の処理は変更なし。中断時に音・結果の音楽が止まるweb-smokeが成功。
- C6: 関係ない。強さの上限を守るJSは変更なし。fx/effect-gainの単体検査と演出安全上限のweb-smokeが成功。
- C7: 関係ない。sanitize・データ版・CSVは変更なし。data-integrity・slot-sessionを含む単体検査31ファイルが成功。

## 削除セレクタの全一覧

共有規則は使用中の枝と宣言を残した。下表は消した枝だけを示す。

| 変更前のファイル:行 | 削除セレクタ | 未使用の親・クラス | 理由 |
|---|---|---|---|
| src/styles.css:857 | `.section-head.compact` | `compact` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:868 | `.trainer-layout` | `trainer-layout` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:875 | `.reaction-pad` | `reaction-pad`、`activity-stage` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:875 | `.activity-stage` | `reaction-pad`、`activity-stage` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:888 | `.activity-stage` | `activity-stage` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:897 | `.activity-stage::before` | `activity-stage` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:907 | `.reaction-pad.flash-good` | `reaction-pad`、`flash-good` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:911 | `.reaction-pad.flash-warn` | `reaction-pad`、`flash-warn` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:923 | `.reaction-detail` | `reaction-detail` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:1000 | `.start-settings-link` | `start-settings-link` | 起動画面の旧設定リンクは存在せず、支援者の入口はホームの homeSupporterMenu。 |
| src/styles.css:1118 | `.game-stage-content.module-color` | `module-color` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1123 | `.game-stage-content.module-color > :not(:first-child)` | `module-color` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1134 | `.game-stage-content.module-color` | `module-color` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1199 | `.completion-result-icon` | `completion-result-icon` | 現在の結果は hk-result-picture / hk-result-items を生成し、旧アイコンは作らない。 |
| src/styles.css:1226 | `.color-result-palette` | `color-result-palette` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1234 | `.color-result-swatch` | `color-result-swatch` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1243 | `.color-result-caption` | `color-result-caption` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:1253 | `body.high-contrast .color-result-swatch` | `color-result-swatch` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4105 | `.trend-game-title` | `trend-game-title` | 現在の log.js は見出しを strong / small で生成し、このクラスを付けない。 |
| src/styles.css:4117 | `.trend-game-count` | `trend-game-count` | 現在の log.js は見出しを strong / small で生成し、このクラスを付けない。 |
| src/styles.css:4292 | `.histogram` | `histogram` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4300 | `.histogram-scope` | `histogram-scope` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4309 | `.histogram-plot` | `histogram-plot` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4321 | `.histogram-zero` | `histogram-zero` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4333 | `.histogram-column` | `histogram-column` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4343 | `.histogram-bar` | `histogram-bar` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4350 | `.histogram-bar.is-plain` | `histogram-bar` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4355 | `.histogram-bar.is-guided` | `histogram-bar` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4359 | `.histogram-axis` | `histogram-axis` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4368 | `.histogram-legend` | `histogram-legend` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4373 | `.histogram-legend-item` | `histogram-legend-item` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4379 | `.histogram-legend-item small` | `histogram-legend-item` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4385 | `.histogram-swatch` | `histogram-swatch` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4392 | `.histogram-swatch.is-plain` | `histogram-swatch` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4396 | `.histogram-swatch.is-guided` | `histogram-swatch` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4401 | `body.high-contrast .histogram-bar.is-guided` | `histogram-bar`、`histogram-swatch` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4401 | `body.high-contrast .histogram-swatch.is-guided` | `histogram-bar`、`histogram-swatch` | 評価ログは log.js の trend-* SVG で生成。旧 histogram-* の生成・参照がない。 |
| src/styles.css:4599 | `.module-grid` | `module-grid` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:4797 | `.activity-visual` | `activity-visual` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:4804 | `.color-chip` | `color-chip`、`balloon-shape`、`firework-ring`、`sound-note`、`burst-mark` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4804 | `.balloon-shape` | `color-chip`、`balloon-shape`、`firework-ring`、`sound-note`、`burst-mark` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4804 | `.firework-ring` | `color-chip`、`balloon-shape`、`firework-ring`、`sound-note`、`burst-mark` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4804 | `.sound-note` | `color-chip`、`balloon-shape`、`firework-ring`、`sound-note`、`burst-mark` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4804 | `.burst-mark` | `color-chip`、`balloon-shape`、`firework-ring`、`sound-note`、`burst-mark` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4821 | `.color-chip` | `color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4832 | `.color-chip::after` | `color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4843 | `.color-feedback` | `color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4863 | `.module-color.is-feedback .color-feedback` | `module-color`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4871 | `body.high-contrast .color-feedback` | `color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4875 | `.color-session-progress` | `color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4882 | `.color-session-progress .reaction-detail` | `color-session-progress`、`reaction-detail` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4886 | `.color-progress-dots` | `color-progress-dots` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4892 | `.color-progress-dot` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4906 | `.color-progress-dot::after` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4915 | `.color-progress-dot.is-done` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4922 | `.color-progress-dot.is-done::after` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4926 | `body.high-contrast .color-progress-dot` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4933 | `body.high-contrast .color-progress-dot.is-done` | `color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4961 | `.game-stage-content.module-color` | `module-color` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4970 | `.module-color .color-light-stage` | `module-color`、`color-light-stage` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4980 | `.module-color .color-light-stage::before` | `module-color`、`color-light-stage` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:4991 | `.module-color .color-light-stage::after` | `module-color`、`color-light-stage` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5008 | `.module-color .color-stage-glow` | `module-color`、`color-stage-glow` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5022 | `.module-color .color-stage-hud` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5043 | `.module-color .color-stage-hud strong` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5050 | `.module-color .color-speaker` | `module-color`、`color-speaker` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5067 | `.module-color .color-speaker::after` | `module-color`、`color-speaker` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5079 | `.module-color .color-speaker-left` | `module-color`、`color-speaker-left` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5083 | `.module-color .color-speaker-right` | `module-color`、`color-speaker-right` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5087 | `.module-color .color-speaker-cone` | `module-color`、`color-speaker-cone` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5097 | `.module-color .color-speaker-cone-small` | `module-color`、`color-speaker-cone-small` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5101 | `.module-color .color-speaker-cone-large` | `module-color`、`color-speaker-cone-large` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5105 | `.module-color .color-prism-rig` | `module-color`、`color-prism-rig` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5117 | `.module-color .color-prism-halo` | `module-color`、`color-prism-halo` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5129 | `.module-color .color-chip` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5148 | `.module-color .color-chip::before` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5156 | `.module-color .color-chip::after` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5165 | `.module-color .color-prism-core` | `module-color`、`color-prism-core` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5176 | `.module-color .color-prism-facet` | `module-color`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5184 | `.module-color .color-prism-facet::before` | `module-color`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5184 | `.module-color .color-prism-facet::after` | `module-color`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5196 | `.module-color .color-prism-facet::before` | `module-color`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5200 | `.module-color .color-prism-facet::after` | `module-color`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5204 | `.module-color .color-light-particles` | `module-color`、`color-light-particles` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5211 | `.module-color .color-light-particle` | `module-color`、`color-light-particle` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5226 | `.module-color.is-feedback .color-light-particle` | `module-color`、`color-light-particle` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5230 | `.module-color .color-light-particle:nth-child(3n)` | `module-color`、`color-light-particle` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5234 | `.module-color .color-light-particle-1` | `module-color`、`color-light-particle-1` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5235 | `.module-color .color-light-particle-2` | `module-color`、`color-light-particle-2` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5236 | `.module-color .color-light-particle-3` | `module-color`、`color-light-particle-3` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5237 | `.module-color .color-light-particle-4` | `module-color`、`color-light-particle-4` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5238 | `.module-color .color-light-particle-5` | `module-color`、`color-light-particle-5` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5239 | `.module-color .color-light-particle-6` | `module-color`、`color-light-particle-6` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5240 | `.module-color .color-light-particle-7` | `module-color`、`color-light-particle-7` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5241 | `.module-color .color-light-particle-8` | `module-color`、`color-light-particle-8` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5242 | `.module-color .color-light-particle-9` | `module-color`、`color-light-particle-9` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5243 | `.module-color .color-light-particle-10` | `module-color`、`color-light-particle-10` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5244 | `.module-color .color-light-particle-11` | `module-color`、`color-light-particle-11` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5245 | `.module-color .color-light-particle-12` | `module-color`、`color-light-particle-12` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5246 | `.module-color .color-light-particle-13` | `module-color`、`color-light-particle-13` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5247 | `.module-color .color-light-particle-14` | `module-color`、`color-light-particle-14` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5249 | `.module-color .color-feedback` | `module-color`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5259 | `.game-stage-content.module-color > .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5269 | `.module-color .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5273 | `.module-color .color-progress-dots` | `module-color`、`color-progress-dots` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5281 | `.module-color .color-progress-dot` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5296 | `.module-color .color-progress-dot::after` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5300 | `.module-color .color-pedestal-number` | `module-color`、`color-pedestal-number` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5319 | `.module-color .color-pedestal-orb` | `module-color`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5337 | `.module-color .color-pedestal-shape` | `module-color`、`color-pedestal-shape` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5342 | `.module-color .color-pedestal-base` | `module-color`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5355 | `.module-color .color-progress-dot.is-done .color-pedestal-orb` | `module-color`、`color-progress-dot`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5365 | `.module-color .color-session-progress .reaction-detail` | `module-color`、`color-session-progress`、`reaction-detail` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5398 | `body.high-contrast .game-stage-content.module-color` | `module-color` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5402 | `body.high-contrast .module-color .color-light-stage::before` | `module-color`、`color-light-stage` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5409 | `body.high-contrast .module-color .color-light-stage::after` | `module-color`、`color-light-stage`、`color-stage-glow`、`color-light-particles` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5409 | `body.high-contrast .module-color .color-stage-glow` | `module-color`、`color-light-stage`、`color-stage-glow`、`color-light-particles` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5409 | `body.high-contrast .module-color .color-light-particles` | `module-color`、`color-light-stage`、`color-stage-glow`、`color-light-particles` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5415 | `body.high-contrast .module-color .color-stage-hud` | `module-color`、`color-stage-hud`、`color-speaker`、`color-session-progress`、`reaction-detail`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5415 | `body.high-contrast .module-color .color-speaker` | `module-color`、`color-stage-hud`、`color-speaker`、`color-session-progress`、`reaction-detail`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5415 | `body.high-contrast .module-color .color-session-progress .reaction-detail` | `module-color`、`color-stage-hud`、`color-speaker`、`color-session-progress`、`reaction-detail`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5415 | `body.high-contrast .module-color .color-feedback` | `module-color`、`color-stage-hud`、`color-speaker`、`color-session-progress`、`reaction-detail`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5425 | `body.high-contrast .module-color .color-speaker-cone` | `module-color`、`color-speaker-cone`、`color-pedestal-orb`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5425 | `body.high-contrast .module-color .color-pedestal-orb` | `module-color`、`color-speaker-cone`、`color-pedestal-orb`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5425 | `body.high-contrast .module-color .color-pedestal-base` | `module-color`、`color-speaker-cone`、`color-pedestal-orb`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5434 | `body.high-contrast .module-color .color-speaker::after` | `module-color`、`color-speaker` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5440 | `body.high-contrast .module-color .color-prism-halo` | `module-color`、`color-prism-halo` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5446 | `body.high-contrast .module-color .color-chip` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5451 | `body.high-contrast .module-color .color-chip::before` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5456 | `body.high-contrast .module-color .color-chip::after` | `module-color`、`color-chip`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5456 | `body.high-contrast .module-color .color-prism-facet` | `module-color`、`color-chip`、`color-prism-facet` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5461 | `body.high-contrast .module-color .color-progress-dot.is-done .color-pedestal-orb` | `module-color`、`color-progress-dot`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5467 | `body.high-contrast .module-color .color-pedestal-number` | `module-color`、`color-pedestal-number` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5472 | `body.high-contrast .module-color .color-progress-dot` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5472 | `body.high-contrast .module-color .color-progress-dot.is-done` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5481 | `.module-color .color-chip` | `module-color`、`color-chip`、`color-pedestal-orb`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5481 | `.module-color .color-chip::after` | `module-color`、`color-chip`、`color-pedestal-orb`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5481 | `.module-color .color-pedestal-orb` | `module-color`、`color-chip`、`color-pedestal-orb`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5481 | `.module-color .color-feedback` | `module-color`、`color-chip`、`color-pedestal-orb`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5489 | `.module-color .color-light-particles` | `module-color`、`color-light-particles` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5495 | `.module-color .color-stage-hud` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5501 | `.module-color .color-stage-hud strong` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5505 | `.module-color .color-speaker` | `module-color`、`color-speaker` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5513 | `.module-color .color-speaker-left` | `module-color`、`color-speaker-left` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5514 | `.module-color .color-speaker-right` | `module-color`、`color-speaker-right` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5516 | `.module-color .color-prism-rig` | `module-color`、`color-prism-rig` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5521 | `.module-color .color-prism-halo` | `module-color`、`color-prism-halo` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5523 | `.module-color .color-chip` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5528 | `.module-color .color-chip::before` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5529 | `.module-color .color-prism-core` | `module-color`、`color-prism-core` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5531 | `.game-stage-content.module-color > .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5536 | `.module-color .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5538 | `.module-color .color-progress-dot` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5543 | `.module-color .color-pedestal-number` | `module-color`、`color-pedestal-number` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5549 | `.module-color .color-pedestal-orb` | `module-color`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5555 | `.module-color .color-progress-dot.is-done .color-pedestal-orb` | `module-color`、`color-progress-dot`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5557 | `.module-color .color-pedestal-base` | `module-color`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5562 | `.module-color .color-session-progress .reaction-detail` | `module-color`、`color-session-progress`、`reaction-detail` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5568 | `.module-color .color-feedback` | `module-color`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5575 | `.module-color .color-speaker` | `module-color`、`color-speaker` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5579 | `.game-stage-content.module-color > .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5585 | `.module-color .color-stage-hud` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5589 | `.module-color .color-prism-rig` | `module-color`、`color-prism-rig` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5594 | `.module-color .color-chip` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5599 | `.module-color .color-progress-dot` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5604 | `.module-color .color-pedestal-orb` | `module-color`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5608 | `.module-color .color-session-progress .reaction-detail` | `module-color`、`color-session-progress`、`reaction-detail` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5614 | `.module-color .color-stage-hud` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5620 | `.module-color .color-stage-hud span` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5624 | `.module-color .color-stage-hud strong` | `module-color`、`color-stage-hud` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5628 | `.module-color .color-prism-rig` | `module-color`、`color-prism-rig` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5633 | `.module-color .color-chip` | `module-color`、`color-chip` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5638 | `.module-color .color-prism-halo` | `module-color`、`color-prism-halo` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5642 | `.game-stage-content.module-color > .color-session-progress` | `module-color`、`color-session-progress` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5647 | `.module-color .color-progress-dot` | `module-color`、`color-progress-dot` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5652 | `.module-color .color-pedestal-number` | `module-color`、`color-pedestal-number` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5657 | `.module-color .color-pedestal-orb` | `module-color`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5662 | `.module-color .color-progress-dot.is-done .color-pedestal-orb` | `module-color`、`color-progress-dot`、`color-pedestal-orb` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5666 | `.module-color .color-pedestal-base` | `module-color`、`color-pedestal-base` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5670 | `.module-color .color-session-progress .reaction-detail` | `module-color`、`color-session-progress`、`reaction-detail` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5675 | `.module-color .color-feedback` | `module-color`、`color-feedback` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:5681 | `.balloon-shape` | `balloon-shape` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5692 | `.burst-mark` | `burst-mark`、`sound-note` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5692 | `.sound-note` | `burst-mark`、`sound-note` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5705 | `.firework-ring` | `firework-ring` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5714 | `.firework-ring.delay` | `firework-ring` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5731 | `.eval-panel` | `eval-panel`、`task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:5731 | `.task-card` | `eval-panel`、`task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:5777 | `.choice-block` | `choice-block` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5781 | `.choice-grid` | `choice-grid` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5791 | `.choice-grid` | `choice-grid` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5795 | `.choice-button` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5807 | `.choice-button` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5816 | `.choice-button:hover` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5828 | `.choice-button` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5833 | `.choice-button.correct` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5838 | `.choice-button.wrong` | `choice-button` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5973 | `.operation-layout` | `operation-layout` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5980 | `.operation-guide` | `operation-guide` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5986 | `.operation-stage` | `operation-stage` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:5995 | `.operation-prompt` | `operation-prompt` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6002 | `.operation-item-grid` | `operation-item-grid` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6008 | `.operation-choice` | `operation-choice` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6019 | `.operation-choice:hover` | `operation-choice` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6024 | `.point-board` | `point-board`、`drag-board` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6024 | `.drag-board` | `point-board`、`drag-board` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6034 | `.point-target` | `point-target`、`tap-target` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6034 | `.tap-target` | `point-target`、`tap-target` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6040 | `.point-target` | `point-target` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6049 | `.tap-target` | `tap-target` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6059 | `.point-line` | `point-line` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6066 | `.point-line.vertical` | `point-line` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6073 | `.point-line.horizontal` | `point-line` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6080 | `.drag-board` | `drag-board` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6088 | `.drag-zone` | `drag-zone`、`drag-card` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6088 | `.drag-card` | `drag-zone`、`drag-card` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6097 | `.drag-zone` | `drag-zone` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6103 | `.drag-card` | `drag-card` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6109 | `.drag-card.is-picked` | `drag-card` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6150 | `.evaluation-summary` | `evaluation-summary` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6167 | `.research-axis-grid` | `research-axis-grid` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6171 | `.condition-profile-grid` | `condition-profile-grid` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6177 | `.condition-profile` | `condition-profile` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6181 | `.condition-profile small` | `condition-profile` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6189 | `.readiness-meter` | `readiness-meter` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6199 | `.readiness-meter strong` | `readiness-meter` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6205 | `.readiness-row` | `readiness-row` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6216 | `.readiness-row small` | `readiness-row` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6223 | `.research-protocol` | `research-protocol` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6227 | `.research-protocol p` | `research-protocol` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6233 | `.research-points` | `research-points` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6241 | `.evaluation-grid` | `evaluation-grid` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6248 | `.eval-panel` | `eval-panel` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6252 | `.eval-panel h3` | `eval-panel` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6256 | `.scale-row` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6256 | `.note-row` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6266 | `.scale-row` | `scale-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6270 | `.scale-row span` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6270 | `.note-row span` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6277 | `.note-row textarea` | `note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6289 | `.note-row` | `note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6293 | `.note-row textarea` | `note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6315 | `.current-task` | `current-task` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6322 | `.current-task strong` | `current-task` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6330 | `.current-task p` | `current-task` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6337 | `.evaluation-counters` | `evaluation-counters` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6341 | `.task-list` | `task-list` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6346 | `.task-card` | `task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6350 | `.task-card strong` | `task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6356 | `.task-card p` | `task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6363 | `.task-card.is-current` | `task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6368 | `.task-card.is-done` | `task-card` | 削除済みの研究・評価・タスク画面。現在の App.svelte / 設定の生成コードにクラスも動的生成もない。 |
| src/styles.css:6656 | `.module-grid` | `module-grid` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.trainer-layout` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.operation-layout` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.choice-grid` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.module-grid` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.research-axis-grid` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.evaluation-grid` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6716 | `.evaluation-summary` | `trainer-layout`、`operation-layout`、`choice-grid`、`module-grid`、`research-axis-grid`、`evaluation-grid`、`evaluation-summary` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6775 | `.activity-stage` | `activity-stage`、`reaction-pad` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6775 | `.reaction-pad` | `activity-stage`、`reaction-pad` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6806 | `.scale-row` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:6806 | `.note-row` | `scale-row`、`note-row` | src の JS・Svelte・HTML と public のテキスト資産に参照がなく、クラスの連結・classList・Svelte class:・i18n HTML の生成経路にもない。 |
| src/styles.css:7040 | `.result-stats.is-completion-result .completion-result-icon` | `completion-result-icon` | 現在の結果は hk-result-picture / hk-result-items を生成し、旧アイコンは作らない。 |
| src/styles.css:7055 | `.result-stats.is-completion-result .color-result-palette` | `color-result-palette` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
| src/styles.css:7060 | `.result-stats.is-completion-result .color-result-swatch` | `color-result-swatch` | 旧色の舞台・色結果。現在の colorLegacy.js は module-pop / pop-* を生成し、旧クラスを生成しない。 |
