# 支援者設定を、よく使う6項目と畳める詳細にする

## 調査と配置（実装前に作成）

現状は4タブで28個の入力項目があり、最初のタブはスイッチ関連に偏る。頻度は利用ログによる実測ではなく、支援者が利用者や環境に合わせる場面からの見当。保存キー・既定値・入力範囲・選択肢はそのまま。表の「記録」は session.config の実効条件であり、state.settings の生値が丸ごと保存されるという意味ではない。

| 項目／保存キー | 何を変えるか・使用先 | 既定値 | 頻度（見当） | session.config の条件 | 遊び内と重複 | 新しい置き場所 |
|---|---|---|---|---|---|---|
| 遊びの雰囲気（`fxLevel`） | 紙吹雪や星の量。`fx/` の演出と遊び内の雰囲気 | normal（にぎやか） | 利用者・環境ごと／高 | 実効値 → fxLevel（測定では none） | なし | 常設 |
| 声で読み上げる（`speechEnabled`） | 説明やほめ言葉。`audio.js` の読み上げ | オン | 利用者・環境ごと／高 | なし | なし | 常設 |
| 効果音（`soundEnabled`） | 押した音・拍手。`audio.js` の効果音（課題の合図は切れない） | オン | 利用者・環境ごと／高 | なし | なし | 常設 |
| 枠が動く速さ（`scanInterval`） | 次へ枠が移るまでの時間。`scan.js` の利用者画面の走査 | 1600ms（1.6秒） | 利用者・環境ごと／高 | なし | なし | 常設 |
| 大きい文字（`largeText`） | 全画面の文字。`settings.js` のクラス反映と表示CSS | オン | 利用者・環境ごと／高 | なし | なし | 常設 |
| 画面をよく見る遊びを隠す（`hideVisualTasks`） | リール・アームの表示。`views/home.js` のホーム一覧 | オフ | 利用者・環境ごと／高 | なし | なし | 常設 |
| iPad のスイッチコントロールを使う（`switchControlMode`） | iPad 本体のスイッチコントロールを使うときだけオン。 利用者画面の走査／入力 | オフ | 導入・変更時／低 | なし | なし | スイッチのくわしい設定 |
| 枠を自動で動かす（`autoScan`） | 利用者の画面で、黄色い枠を自動で動かします。 利用者画面の走査／入力 | オン | 導入・変更時／低 | なし | なし | スイッチのくわしい設定 |
| 枠が動いたときの音（`scanFeedback`） | 枠が移るたびに音や遊びの名前で知らせます。 利用者画面の走査／入力 | none | 導入・変更時／低 | なし | なし | スイッチのくわしい設定 |
| 画面に「おす」ボタンを出す（`showScreenSwitch`） | 画面のボタンをスイッチのかわりに使います。 利用者画面の走査／入力 | オフ | 導入・変更時／低 | なし | なし | スイッチのくわしい設定 |
| 文字づかい（`textMode`） | 遊びの文字を選びます。支援者の画面は日本語です。 利用者画面の文字・全画面の表示・音声 | ruby | 導入・変更時／低 | なし | なし | 見え方・声のくわしい設定 |
| くっきり表示（`highContrast`） | 枠と文字の色の差を強くします。 利用者画面の文字・全画面の表示・音声 | オフ | 導入・変更時／低 | なし | なし | 見え方・声のくわしい設定 |
| 読み上げの声の大きさ（`speechVolume`） | アプリの声だけの音量です。 利用者画面の文字・全画面の表示・音声 | 1 | 導入・変更時／低 | なし | なし | 見え方・声のくわしい設定 |
| 読み上げの声（`speechVoice`） | アプリに入れた声か、端末の声を選びます。 利用者画面の文字・全画面の表示・音声 | app | 導入・変更時／低 | なし | なし | 見え方・声のくわしい設定 |
| リールの速さ（`slotCycleMs`） | 1周する時間。長いほどゆっくりです。 リール（L1／L2）の練習 | 3200 | 練習の調整時／中 | cycleMs | あり（練習時） | 遊びごとの難しさ → リールを止める |
| 「合った」にする広さ（`slotToleranceMs`） | 目標の前後の広さ。広いほどやさしくなります。 リール（L1／L2）の練習 | 220 | 練習の調整時／中 | toleranceMs | あり（練習時） | 遊びごとの難しさ → リールを止める |
| 「ひとつ止める」の回数（`slotL1Rounds`） | 1本のリールを止める回数です。 リール（L1／L2）の練習 | 8 | 練習の調整時／中 | rounds（L1） | なし | 遊びごとの難しさ → リールを止める |
| 「3つ止める」の回数（`slotL2Rounds`） | 3本を順番に止める回数です。 リール（L1／L2）の練習 | 4 | 練習の調整時／中 | rounds（L2） | なし | 遊びごとの難しさ → リールを止める |
| 音の速さ（テンポ）（`rhythmBpm`） | 1分に鳴る音の数。少ないほどゆっくりです。 リズム／高い音だけの練習 | null（各遊び50） | 練習の調整時／中 | bpm | あり（練習時） | 遊びごとの難しさ → 高い音だけ |
| 1回に鳴る音の数（`targetBeats`） | 1回の遊びで鳴る音の数です。 リズム／高い音だけの練習 | null（L1:8／L2:16／高い音:20） | 練習の調整時／中 | targetBeats | なし | 遊びごとの難しさ → 高い音だけ |
| 次の音が来る場所を画面に出す（`visualGuidance`） | 次の拍を予告します。測定では出ません。 リズム／高い音だけの練習 | オン | 練習の調整時／中 | visualGuidance / visualPresentation | なし | 遊びごとの難しさ → 高い音だけ |
| アームの速さ（`craneSweepMs`） | 端から端までの時間。長いほどゆっくりです。 アームの練習 | null（2.2秒） | 練習の調整時／中 | sweepMs | あり（練習時） | 遊びごとの難しさ → アームでつかむ |
| つかめる広さ（`craneToleranceR`） | ねらいからのずれの許容幅です。 アームの練習 | null（15） | 練習の調整時／中 | toleranceR | あり（練習時） | 遊びごとの難しさ → アームでつかむ |
| 1回にアームを下ろす回数（`craneTargetTrials`） | 1回の遊びでアームを下ろす回数です。 アームの練習 | null（5） | 練習の調整時／中 | targetTrials | なし | 遊びごとの難しさ → アームでつかむ |
| ねらいの上で音を鳴らす（`craneAudioGuidance`） | ねらいの上を通ると音が鳴り、耳でも狙えます。 アームの練習 | オフ | 練習の調整時／中 | audioGuidance | なし | 遊びごとの難しさ → アームでつかむ |
| アタリが続く長さ（`fishingLimitMs`） | 魚が逃げるまでの時間です。 さかなつりの練習 | null（2秒） | 練習の調整時／中 | limitMs | あり（練習時） | 遊びごとの難しさ → さかなつり |
| 研究者モード（`researcherMode`） | 研究用の表示モード。`settings.js` の body クラス反映 | オフ | 研究時のみ | なし | なし | 研究（練習／測定・成立確認） |
| 練習／測定（`difficultyMode`） | 測定では速さ・回数・手がかりが固定されます。 研究タブ／全課題の条件解決 | practice | 研究時のみ | difficultyMode | なし | 研究（練習／測定・成立確認） |
| 押すタイミングの測定 | calibration を開始。基準オフセットの測定 | 設定値なし | 研究時 | 専用の測定手順・条件は維持 | なし | 研究（折り畳み） |
| 測定の前に（成立確認） | 練習記録から3条件を自動確認 | 自己申告値なし | 測定前 | measurementReadiness | なし | 研究内。測定の回だけ表示 |
| 音の素材 | 作者・出典・ライセンス | 固定クレジット | 必要時 | なし | なし | 音の素材（折り畳み） |
| はじめての方へ／印刷説明書 | 操作と設定の探し方 | 閉じた状態 | 初回 | なし | なし | 先頭の説明（折り畳み） |

## この並びにする理由

最初は6項目。雰囲気・読み上げ・効果音は感覚刺激への調整、枠の速さは選択の余裕、大きい文字は読める大きさ、ホームに出す遊びは視覚追従への配慮として、利用者が変わると確かめたい。機器の委譲・細かい表示と声は導入後には頻繁に変えないため畳む。遊びごとの難しさは遊びを選んでから扱い、研究条件は研究時に扱う。

ネイティブの details / summary は Tab で移動し Enter / Space で開閉でき、開閉状態も読み上げに届く。複数欄を同時に開け、開閉で値は変更しない。入力の id と範囲・選択肢を維持し、短い見出しをラベル、補足を aria-describedby で渡す。走査は既存の支援者画面停止規則に任せる（scan.js は変更しない）。

src/lib/settingsFields.js が表示と入力型の唯一の定義。Svelte の共通部品で画面を生成し、views/settings.js も同じ定義で値を読み書きする。App.svelte の手書き項目、4タブの切り替え配線・DOM参照・専用CSS・旧タブ検査を除去する。保存や条件解決の定義をUIへ複製しない。

研究欄を閉じても「測定の回・難しさは固定」を常時表示する。遊びの詳細内でも固定理由を示す。測定の画面・時刻・既定値・sanitize・CSV列・session.configの意味は変えない。

設定画面では操作できない入力ドックを隠す。固定ドックが設定を覆っていたためで、走査・入力の実装は変更せず、既存の supporter-menu-mode クラスで表示だけを制御する。

## 判断が必要だった点

- 6項目目は「くっきり表示」より「画面をよく見る遊びを隠す」を優先した。利用者が視覚課題を扱えるかをホームの構成に直接反映できるため。くっきり表示は詳細に残す。
- タブを残すと、よく使う項目が複数の面に散らばる。常設6項目と複数同時に開ける折り畳みに置き換えた。
- 研究者モードは現行版でも値と body クラスを保持するが、以前の研究用3タブは既に廃止されている。今回の「全設定を残す」条件に従って項目と動作を維持し、「3タブを出す」という古い説明だけを訂正した。
- 短い補足は小さい画面で折り返す。1行のために字を小さくしたり切り捨てず、説明自体を1文に短くした。

## 検証・画像

変更前の「全項目」画像は、旧画面に全展開の操作がないため撮影時だけ全タブの内容を同時に表示した比較用画像。保存状態は変更していない。画像は作業ツリー内の `output/playwright/settings/` に保存（コミット対象外）。

| 実寸 | 変更前・初期表示 | 変更前・全項目 | 変更後・畳んだ状態 | 変更後・全部開いた状態 |
|---|---|---|---|---|
| iPad横 1180×820 | [画像](../output/playwright/settings/before-ipad-landscape-collapsed.png) | [画像](../output/playwright/settings/before-ipad-landscape-all.png) | [画像](../output/playwright/settings/after-ipad-landscape-collapsed.png) | [画像](../output/playwright/settings/after-ipad-landscape-all.png) |
| iPad縦 834×1194 | [画像](../output/playwright/settings/before-ipad-portrait-collapsed.png) | [画像](../output/playwright/settings/before-ipad-portrait-all.png) | [画像](../output/playwright/settings/after-ipad-portrait-collapsed.png) | [画像](../output/playwright/settings/after-ipad-portrait-all.png) |
| スマホ縦 390×844 | [画像](../output/playwright/settings/before-phone-collapsed.png) | [画像](../output/playwright/settings/before-phone-all.png) | [画像](../output/playwright/settings/after-phone-collapsed.png) | [画像](../output/playwright/settings/after-phone-all.png) |

3実寸の全展開で、横はみ出し0px・入力28項目・操作標的44px以上を確認。保存・再読み込み、Tab／Enter／Spaceでの開閉、明示的なラベル、測定への切り替えで練習値を失わないことを web-smoke に組み込んだ。VoiceOverそのものを使うiPad実機検証は未実施。ブラウザのアクセシブル名・ネイティブ入力・ネイティブ折り畳みを確認した。

検証中に見つけた旧行レイアウトの最小幅による130pxのはみ出しは、最小幅を強制しないカード内の行構成に置き換えて修正した。入力ドックを設定画面で隠す変更に合わせ、旧検査の「設定でもドックが見える」という前提を更新し、評価ログでの表示・文字入力時の退避・入力後の復帰を引き続き検証する。

最終結果:

- `npm run test:unit`: 全スクリプト成功。ログ `test-results/settings-unit.log`。
- `npm run build`: 成功、Service Worker生成も成功。ログ `test-results/settings-build.log`。
- `SMOKE_PROJECTS=chromium-desktop node tests/web-smoke.mjs`: 検査名の絞り込みなし。37成功・実寸対象外3・失敗0。ログ `test-results/settings-chromium-passed.log`。
- `SMOKE_PROJECTS=ipad-portrait node tests/web-smoke.mjs`: WebKit 834×1194、検査名の絞り込みなし。34成功・実寸／音API対象外6・失敗0。ログ `test-results/settings-webkit-passed.log`。
- 変更前からの28項目のID・保存キー・入力型・範囲・選択肢・測定時ロックを照合し、一致。ログ `test-results/settings-contract.log`。
- 前後12画像と全展開の実測: `test-results/settings-capture-final.log`。iPad横・縦・スマホ縦のすべてで横はみ出し0px。

`scan.js`、`games/`、`party*`、`state.js`、CSV／sanitize／条件解決には変更を加えていない。作業は `D:/Code/neuro-wt/settings` 内で行い、`design/settings-simple` にコミット、pushはしない。
