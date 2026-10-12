# 画面撮影スクリプト更新報告（2026-10-01）

> この報告は、その日の作業の記録（あとから書き換えない）。今の決まりは `docs/rules/` を見る。
> 中の `test-results/` のログ・画像は、そのとき作業した PC にだけある（git の外）。

作業場所: `D:/Code/neuro-wt/capture`。ブランチ: `design/capture-screens`。アプリの `src/` と研究の保存形式・CSVは変更していない。pushは行わない。

コミット: `d3b1be8`（画面撮影を現行の遊びと14サイズに対応する）。指定の `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を最終行に付けた。コミット後の追跡対象の作業ツリーはクリーン。報告書と画像は既存のgitignore対象としてローカルに保存した。pushは行っていない。

## 変更したこと

- `scripts/capture-screens.mjs`: 作り直した。保存キーと初期値をアプリからimportし、ホームのタイルIDとページ送りを実際に辿って対象を集める。既定5サイズ／`--all` 14サイズ。説明の入力ガードを待ち、`#gameReadyStart` で開始する。練習／測定／雰囲気の設定は前のページの終了保存より後、アプリの読み込みより前に反映し、各遊びを開いた際に設定値が一致することも確認する。
- 同スクリプト: Chromiumの実在するAudioContextを使い、端末への出力は消音する。仮想時計を導入済みのページだけで時計を進め、音の時計を揃える。可用性やrunning状態を偽装する音の代用品は使わない。カウントイン後の動く場面を撮り、結果では有限の表示アニメーションの完了を最大5秒待つ。
- 同スクリプト: 角の全ページ、はじめの遊び4つ、タイミング6種類とエンドレス2種類、雰囲気4段階、評価ログ、設定を撮る。設定のdetailsとタブは名前を固定せずDOM順に開く。支援者の画面はclickだけで操作し、走査枠が無いことを確認する。長い画面は先頭へ戻してスクロール範囲全体を撮る。
- 同スクリプト: サイズごとに新しい文脈を作り、場面の失敗を個別に記録して次へ進む。PNG、外部読込の無い `index.html`、件数・到達経路・失敗理由・所要時間を持つ `capture-summary.json` を出す。一部失敗は終了コード0、全滅は1。ブラウザと撮影サーバーを終了処理で閉じる。
- `README.md`: 実機が使えないときの節を更新。使い方、対象、出力、失敗時の扱い、Chromiumと仮想時計の限界を説明した。
- `.github/workflows/ci.yml`: 撮影対象を3実寸から5実寸とするコメントに更新。
- `package.json`: 指定どおり `screens` を追加した。`npm pkg get scripts.screens` でも値を確認。
- `.gitignore`: `artifacts/` と `test-results/` は既にあったため変更不要。
- `test-results/capture-report.md`: この日本語報告。ログ・画像・目視用の一覧とともに、既存のgitignore対象としてローカルに残す。

## 撮る場面と到達方法

各場面は必要な設定を反映して読み込み直し、スタートからタイルIDの経路を辿る。練習の回数はリールL1=3回、L2=2回、アーム=3回、高い音だけ=80bpm／5音とし、支援者の選べる範囲に収めた。測定の固定条件はアプリに任せる。

リールとアームは通常の入力経路への押下、音の課題は入力せず見逃しで結果まで進める。エンドレスは失敗で正規の結果へ進む。結果HTMLや研究の記録を捏造せず、撮影用の仮想操作がアプリ内で作る記録を使う。これらの数字は人の実測値ではない。

現在ホームにあるタイミングの遊びは `slot-l1`（ひとつ止める）、`slot-l2`（3つ止める）、`gonogo`（高い音だけ）、`crane`（アームを止める）、`fishing`（アタリで釣る）、`fishing-gonogo`（魚だけ釣る）の6つ。`rhythm-l1`／`rhythm-l2` はcreatorが互換用に残るがホームのタイルには無い。独立した `rt`／`rhythm` タイルも無い。`calibration` は設定内の研究用ボタンから開く課題で、ホームに無いので対象外。エンドレスは測定時に選べないため、通常課題の測定画面で比較する。

小さい画面だけ追加されるホーム・角のページも含む一覧:

| 場面名（ファイル名の番号以降） | 到達方法 | 撮影範囲 |
|---|---|---|
| `start` | 起動 | 表示領域の実寸 |
| `home` | はじめる → ホーム | 表示領域の実寸 |
| `home-slot-corner` | slot-corner | 表示領域の実寸 |
| `home-crane-corner` | crane-corner | 表示領域の実寸 |
| `home-fishing-corner` | fishing-corner | 表示領域の実寸 |
| `home-learning-corner` | learning-corner | 表示領域の実寸 |
| `color-legacy-play` | color-legacy → 入力 | 表示領域の実寸 |
| `balloon-play` | balloon → 入力 | 表示領域の実寸 |
| `coloring-play` | coloring → 入力 | 表示領域の実寸 |
| `baseball-play` | baseball → 入力 | 表示領域の実寸 |
| `gonogo-practice-ready` | gonogo → れんしゅう → ready | 表示領域の実寸 |
| `gonogo-practice-play` | gonogo → れんしゅう → play | 表示領域の実寸 |
| `gonogo-practice-result` | gonogo → れんしゅう → result | 表示領域の実寸 |
| `gonogo-measure-play` | gonogo → そくてい → 遊ぶ | 表示領域の実寸 |
| `slot-l1-practice-ready` | slot-corner → slot-l1 → れんしゅう → ready | 表示領域の実寸 |
| `slot-l1-practice-play` | slot-corner → slot-l1 → れんしゅう → play | 表示領域の実寸 |
| `slot-l1-practice-result` | slot-corner → slot-l1 → れんしゅう → result | 表示領域の実寸 |
| `slot-l1-measure-play` | slot-corner → slot-l1 → そくてい → 遊ぶ | 表示領域の実寸 |
| `slot-l2-practice-ready` | slot-corner → slot-l2 → れんしゅう → ready | 表示領域の実寸 |
| `slot-l2-practice-play` | slot-corner → slot-l2 → れんしゅう → play | 表示領域の実寸 |
| `slot-l2-practice-result` | slot-corner → slot-l2 → れんしゅう → result | 表示領域の実寸 |
| `slot-l2-measure-play` | slot-corner → slot-l2 → そくてい → 遊ぶ | 表示領域の実寸 |
| `crane-practice-ready` | crane-corner → crane → れんしゅう → ready | 表示領域の実寸 |
| `crane-practice-play` | crane-corner → crane → れんしゅう → play | 表示領域の実寸 |
| `crane-practice-result` | crane-corner → crane → れんしゅう → result | 表示領域の実寸 |
| `crane-measure-play` | crane-corner → crane → そくてい → 遊ぶ | 表示領域の実寸 |
| `fishing-practice-ready` | fishing-corner → fishing → れんしゅう → ready | 表示領域の実寸 |
| `fishing-practice-play` | fishing-corner → fishing → れんしゅう → play | 表示領域の実寸 |
| `fishing-practice-result` | fishing-corner → fishing → れんしゅう → result | 表示領域の実寸 |
| `fishing-measure-play` | fishing-corner → fishing → そくてい → 遊ぶ | 表示領域の実寸 |
| `fishing-gonogo-practice-ready` | fishing-corner → fishing-gonogo → れんしゅう → ready | 表示領域の実寸 |
| `fishing-gonogo-practice-play` | fishing-corner → fishing-gonogo → れんしゅう → play | 表示領域の実寸 |
| `fishing-gonogo-practice-result` | fishing-corner → fishing-gonogo → れんしゅう → result | 表示領域の実寸 |
| `fishing-gonogo-measure-play` | fishing-corner → fishing-gonogo → そくてい → 遊ぶ | 表示領域の実寸 |
| `crane-endless-practice-ready` | crane-corner → crane-endless → れんしゅう → ready（失敗で終了） | 表示領域の実寸 |
| `crane-endless-practice-play` | crane-corner → crane-endless → れんしゅう → play（失敗で終了） | 表示領域の実寸 |
| `crane-endless-practice-result` | crane-corner → crane-endless → れんしゅう → result（失敗で終了） | 表示領域の実寸 |
| `fishing-endless-practice-ready` | fishing-corner → fishing-endless → れんしゅう → ready（失敗で終了） | 表示領域の実寸 |
| `fishing-endless-practice-play` | fishing-corner → fishing-endless → れんしゅう → play（失敗で終了） | 表示領域の実寸 |
| `fishing-endless-practice-result` | fishing-corner → fishing-endless → れんしゅう → result（失敗で終了） | 表示領域の実寸 |
| `slot-l1-practice-result-fx-none` | slot-corner → slot-l1 → 雰囲気 none → けっか | 表示領域の実寸 |
| `slot-l1-practice-result-fx-subtle` | slot-corner → slot-l1 → 雰囲気 subtle → けっか | 表示領域の実寸 |
| `slot-l1-practice-result-fx-normal` | slot-corner → slot-l1 → 雰囲気 normal → けっか | 表示領域の実寸 |
| `slot-l1-practice-result-fx-big` | slot-corner → slot-l1 → 雰囲気 big → けっか | 表示領域の実寸 |
| `supporter-settings` | ホーム → 支援者の入口 → 設定 | スクロール範囲全体 |
| `supporter-log` | ホーム → 支援者の入口 → 評価ログ | スクロール範囲全体 |
| `supporter-settings-1-はじめての方へ：つかいかた` | 設定 → はじめての方へ：つかいかた | スクロール範囲全体 |
| `supporter-settings-2-スイッチのくわしい設定` | 設定 → スイッチのくわしい設定 | スクロール範囲全体 |
| `supporter-settings-3-見え方・声のくわしい設定` | 設定 → 見え方・声のくわしい設定 | スクロール範囲全体 |
| `supporter-settings-4-遊びごとの難しさ` | 設定 → 遊びごとの難しさ | スクロール範囲全体 |
| `supporter-settings-5-音の素材` | 設定 → 音の素材 | スクロール範囲全体 |
| `supporter-settings-6-研究（練習／測定・成立確認）` | 設定 → 研究（練習／測定・成立確認） | スクロール範囲全体 |
| `home-page-2` | ホーム → 次のページ 2 | 表示領域の実寸 |
| `home-page-3` | ホーム → 次のページ 3 | 表示領域の実寸 |
| `home-crane-corner-page-2` | crane-corner → 次のページ 2 | 表示領域の実寸 |
| `home-fishing-corner-page-2` | fishing-corner → 次のページ 2 | 表示領域の実寸 |
| `home-learning-corner-page-2` | learning-corner → 次のページ 2 | 表示領域の実寸 |

## 検証結果

`npx vite build` は成功した。Viteの500kB超のchunkに関する既存の警告が出た。撮影スクリプトはビルド済み `dist` を専用のローカルサーバーから配信する。

| 実行 | サイズ数 | 撮れた枚数 | 失敗した場面 | 所要時間 |
|---|---:|---:|---:|---:|
| `screens-check` | 5 | 265 | 0 | 276.42秒 |
| `screens-all` | 14 | 737 | 0 | 780.52秒 |

- 既定実行: `node scripts/capture-screens.mjs test-results/screens-check`。ログ: `test-results/capture-default.log`。一覧: `test-results/screens-check/index.html`。集計: `test-results/screens-check/capture-summary.json`。終了コード0。
- 全サイズ実行: `node scripts/capture-screens.mjs test-results/screens-all --all`。ログ: `test-results/capture-all.log`。一覧: `test-results/screens-all/index.html`。集計: `test-results/screens-all/capture-summary.json`。終了コード0。
- `node --check scripts/capture-screens.mjs`: 成功。`git diff --check`: 成功。
- 全1002枚のファイルを開いて画像の幅を確認し、利用者画面は高さも指定サイズどおりであることを確認した。支援者のfullPage画像は幅を保ち、高さだけ内容に合わせて延びる。
- 全サイズに共通の52場面が揃い、各サイズのファイル名に重複がないことを集計JSONで確認した。短い画面に追加されるホーム／角のページは、この52場面に加えて残る。
- 390x844と1180x820の全画像を実画像から作った目視用一覧で開いて確認した。長い画像は連続する縦の区間に分けて欠落なく確認。説明／動く遊ぶ画面／結果／測定／エンドレス／雰囲気4段階／設定各節／評価ログが名前と一致する。要所は原寸PNGでも確認した。目視資料: `test-results/capture-review/`、対応表: `test-results/capture-review/review-map.json`。
- ブラウザの配置先を一時的に存在しないフォルダにして起動失敗も確認した。0枚・setup失敗1件・終了コード1となり、JSONとHTMLにも失敗理由が残る。ログ: `test-results/capture-no-browser.log`、出力: `test-results/screens-no-browser/`。環境変数は確認後に戻した。
- 未知のオプション `--unknown` はUsageを表示して終了コード1。撮影を開始しない。
- PNG保存の最初の1回だけを検証用preloadで失敗させた。264枚の撮影を継続し、失敗1件をJSONとHTMLに残して終了コード0となった。後続の場面と残り4サイズも撮れている。所要時間287.69秒。ログ: `test-results/capture-partial-failure.log`、出力: `test-results/screens-partial-failure/`。スクリプト本体は変更していない。
- 一覧HTMLをfile URLで開き、HTTP通信を遮断した状態で既定の265枚すべてが読み込まれることを確認した。外部リクエスト0件。検証ログ: `test-results/capture-gallery.log`、画像: `test-results/gallery-check.png`。
- 全サイズの一覧でも737枚すべてがローカルから読み込まれ、外部リクエスト0件だった。ログ: `test-results/capture-gallery-all.log`、画像: `test-results/gallery-all-check.png`。
- 全サイズ実行の所要時間は、途中で保存失敗の検証を別のブラウザで並行実行した状態での値。既定実行の所要時間は単独で測った。
- 上の所要時間はWindowsのこの作業環境の実測。Ubuntu／2コアCIでの10分以内は今回直接実測していない。既定の実測は10分未満だが、CIでの所要時間は次のCI実行で確認が必要。

14サイズごとの枚数:

| サイズ | 枚数 |
|---|---:|
| 1133x744 | 52 |
| 744x1133 | 52 |
| 1180x820 | 52 |
| 820x1180 | 52 |
| 1194x834 | 52 |
| 834x1194 | 52 |
| 1366x1024 | 52 |
| 1024x1366 | 52 |
| 590x820 | 52 |
| 1366x650 | 52 |
| 1920x1080 | 52 |
| 844x390 | 57 |
| 667x375 | 56 |
| 390x844 | 52 |

## UD・フールプルーフ・フェイルセーフの対応

参照: `D:/Code/neuro/docs/rules/ud-checklist.md`。以下は撮影道具としての判定であり、アプリの全契約をこの作業だけで再検証したという意味ではない。

| 項目 | 判定と根拠 |
|---|---|
| A1 2つ以上の感覚 | 関係ない: 利用者への視覚・聴覚の合図は変更対象外。画像の場面名と経路は併記する。実際の音は検査していない。 |
| A2 見やすさ | 満たした: 一覧に場面名・縮小画像・原寸へのリンクを付けた。元の画像を読み取れる形で残す。アプリの全色のコントラスト測定は今回の範囲外。 |
| A3 動きと光 | 満たした: 成果物は静止画で、撮影中の出力音は消音。雰囲気noneの結果に演出が無いことを目視確認。アプリの光の上限は変更していない。 |
| A4 操作方法 | 関係ない: 実機スイッチ・VoiceOver等の操作契約は変更しない。一覧の画像リンクは通常のリンクで、画像に場面名のaltを付けた。 |
| A5 時間の余裕 | 満たした: READY_GUARD_MSをimportして待ち、始めるボタンで抜ける。練習の短縮値は支援者の選択範囲内。 |
| A6 わかりやすさ | 満たした: ready／play／result、practice／measure、fxの値をファイル名に残し、2サイズの全画像で内容が一致することを確認。 |
| A7 どの画面でも収まる | 満たした: 指定14サイズの撮影材料を生成した。2サイズは全場面を目視確認した。全14サイズ・全設定のはみ出しを判定する検査の代わりにはならない。 |
| B1 支援者へ迷い込まない | 満たした: ホームの支援者入口をclickで開き、支援者画面では走査枠が無いことを確認。撮影中のautoScanもOFF。 |
| B2 押しまちがい | 満たした: 説明のガードを待ち、説明と課題の押下を別の段階として扱う。説明を撮る際には始める操作をしない。 |
| B3 支援者のまちがい | 満たした: 各遊びで練習／測定と撮影用設定の反映を確認。画面のモードも目視。削除・リセット・書き出しの操作には触れない。 |
| B4 記録のとり違え | 満たした: サイズごとに独立した文脈と専用の一時オリジンを使う。普段の参加者・本番記録を触らず、保存キーはアプリからimportする。 |
| B5 設定の組み合わせ | 満たせない: 全設定の組み合わせを網羅する道具ではない。練習／測定、雰囲気4段階、指定サイズについて撮影した。 |
| C1 演出等が壊れても継続 | 満たした: 場面単位で例外を閉じ込め、名前・理由を残して次へ進む。アプリの演出例外の処理は変更対象外。 |
| C2 あいまいなら足さない | 満たした: 測定の固定条件を変更せず、測定画面を別名で撮影する。結果を手製HTMLで置き換えない。 |
| C3 音が出ないとき | 満たした: Chromiumの実在するAudioContextを使う。開始不可の画面を遊んでいる画面として数えない。ブラウザ起動不可は0枚・exit1で理由を残した。 |
| C4 保存できないとき | 満たした: PNG保存の失敗を1回注入し、失敗理由を記録したうえで残り264枚を撮影できた。アプリの記録保存やCSVの救済処理は変更対象外。 |
| C5 途中で止まったとき | 満たした: 通常の完了・例外時は文脈、ブラウザ、撮影サーバーをfinallyで閉じる。結果への進行は120ステップ、有限アニメーション待ちは5秒で打ち切る。 |
| C6 強さの上限 | 関係ない: アプリのFXや音の強さの上限は変更せず、既存の4つの雰囲気を使う。 |
| C7 古いデータ・未知の値 | 満たした: 保存キーと既定値をアプリからimportし、版を直書きしない。アプリが読み込んだ設定を照合し、値が違えば失敗として知らせる。 |

## 残したこと・気づいたこと

- 実機の音、VoiceOver、iPadのスイッチコントロール、NeuroNode、Safariの表示差、古いiPadの負荷はこのChromium撮影では確認できない。
- `supporter-log`（1180x820）では「評価ログ」の見出し末尾が折り返している。画像と目視資料に残した。アプリ側は変更していない。
- 390x844の説明画面では、リールL2や音の課題のイラストの端が表示枠で切れる場面がある。説明文と始めるボタンは確認できる。意図した切り取りかは今回断定せず、画像に残した。
- `slot-l1-practice-result-fx-normal`／`fx-big`（1180x820）など、結果演出中の粒や紙吹雪が見出しに重なる瞬間が写る。結果の見出し自体が未表示の画像は、アニメーション完了待ちで解消した。残る演出の重なりはアプリの挙動として記録し、ソースは変更していない。
- ホームがページに分かれる画面では、同じ遊びでも到達に必要なページ送り数が違う。枚数の違いは追加のホーム／角のページであり、遊びの取りこぼしではない。
- 設定は今回6つのdetailsがあった。表示される設定内タブは今回0個。今後の追加はDOMから辿るが、独自の新しい開閉方式へ変わった場合はその方式の対応が必要。
- 撮影時の仮想時計で作る成績は見た目確認用で、反応時間や同期精度の研究データとして利用できない。
