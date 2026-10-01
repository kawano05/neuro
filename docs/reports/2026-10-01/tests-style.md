# 検査の共通化・書式整理の報告

> この報告は、その日の作業の記録（あとから書き換えない）。今の決まりは `docs/rules/` を見る。
> 中の `test-results/` のログ・画像は、そのとき作業した PC にだけある（git の外）。

作業場所: D:/Code/neuro-wt/tests-style。ブランチ: design/tests-style。2026-10-01。
指示書 brief-tests-style.md に従い、src/、保存形式・sanitize・CSV、測定条件は変更していない。
検査の削除・条件緩和・skip の追加はない。報告書以外のログ・画像は成果物として test-results/ に保存する。

## 共通関数の出典と統一した違い

| 関数 | 元の版と統一方法 |
|---|---|
| findAvailablePort | web-smoke と pwa-update-race の OS 自動割り当て版を基準にした。capture の availablePort、compare の freePort を置換。party の固定5192も空きポートへ統一。プローブの error と close の失敗を伝える。 |
| waitForServer | web-smoke の60回・500ms・response.ok を既定にした。PWA/capture は60回・250ms、party は50回・100ms、compare は100回・100msと資産名照合を引数で保つ。capture の子終了チェックも保つ。party の待ち切れ後に続行する既存挙動は allowTimeout で維持。 |
| stopServer | web-smoke/PWA の SIGTERM→2秒→SIGKILL を基準にした。capture 同様、exit の監視を送信前に登録。party/compare の単なる kill もここへ統一し、子の終了を待ち、2秒で終了しなければ強制終了する。検査内の待ち時間は変更していない。 |
| settleStartGuard | web-smoke の開始入力ガードを越える550msを移動。openActivity の呼び出しと既存の直接呼び出しで使用。 |
| openActivity | web-smoke の表示名・exact:true・実クリック版を移動。6ページ上限、ページ送り120ms、2つの assert の条件を維持。 |
| tilePageSignature | capture の signature（DOM順の data-tile-id を連結）を移動。探索済みページの判定と discover で共有。 |
| openTile | responsive-screens のID・DOMクリック・10回版を既定にした。capture は30回・実クリック・settle(80ms)・同じページの再訪判定、compare は8回・first()・開いた後550ms・送り後300msを引数で保つ。表示名とIDの入口を分け、対応するセレクターを維持。 |
| finishReady | responsive-screens の現行版を基準に、readyScreen.js の声を止める／始める操作を採用。READY_GUARD_MS+50（500ms）・最大3回・説明画面のdetached待ちを保つ。capture はfastForward・実クリック、scanReady は500ms・Space・待った後の再確認なしを指定して元の入力を維持。 |
| patchSettings | responsive-screens の settings 更新→reload を既定にした。web-smoke の保存が無い場合の {} フォールバックと、既存の位置でreloadする処理を allowMissing/reload で保持。capture の home は終了保存に上書きされない window.name 方式を afterUnload で維持。設定以外の削除や障害注入は各検査に残す。 |
| installSettingsPatch | capture の addInitScript 内の初回seedとwindow.name反映を一緒に移動。同じコールバック内でseed→予約設定の順を保ち、別々の初期化処理の実行順序には依存しない。 |
| openSupporterView | web-smoke の openSupporterLog と capture の supporter を基準に、支援者メニュー→タブを共有。capture のsettleと、呼び出し側の画面待ちを指定できる。走査停止の判定は撮影側に残す。 |
| openSupporterLog | web-smoke のログ入口を移動。元の classList.contains と5,000msの待ちを保つ。 |

## 書式を直した範囲

- tests/party-visual.mjs: 全体。transform、pressBeginner、配置・結果の evaluate、全ループと後始末を展開。アニメーション・要素・箱・記録などの短い変数名を具体的にした。治具の処理・判定・待ち時間は同じ。
- scripts/capture-screens.mjs: 全体。冒頭に「なぜ画面一覧が要るか」を追記。captureSize、scene、home、settle、signature、openCaptureTile、navigate、discover、openGame、finishCaptureReady、playing、activeMoment、pressStage、playToResult、supporter、captureSections、tabs、fail、safeName、html、gallery。HTML/CSSの出力文字列は変えず、長いリテラルはそのまま保つ。
- tests/web-smoke.mjs: ファイル全体を2字下げ・1文ずつに整形。入れ子のループ、if、catch、複数変数の宣言を展開。変更された名前付き関数は次のとおり。

  - checkMainApp
  - checkStartInputGuard
  - checkStartToHomeToGameFlow
  - checkColorCompletionFlow
  - checkSharedBeginnerParty
  - checkTimingParty
  - checkPartyAtmosphere
  - checkEffectsFollowSafetyRules
  - checkBeginnerGamesFlow
  - checkBaseballFlow
  - checkScanFeedbackSpeaksNames
  - checkAppVoiceSpeaks
  - checkHomeReturnFromTabs
  - checkAnyKeyWhileScanning
  - checkKeyboardAndSwitchInput
  - checkHandOverNeedsAnExportFirst
  - checkExportButtonsAreWired
  - checkTrendTabsCoverEveryGame
  - checkSettingsDetails
  - checkSupporterGuide
  - checkSettingsReset
  - assertSupporterScanStopped
  - assertHomeScanResumed
  - checkSupporterMenuStaysOutOfTheScanRing
  - checkIpadSwitchControlMode
  - checkSlotL1GameFlow
  - checkPracticeReelsFillTheScreen
  - checkMeasuredReelsStayOnScreen
  - checkSlotSequentialFlow
  - checkRhythmL1GameFlow
  - checkRhythmVisualProfiles
  - checkEndlessFishingHasNoClock
  - checkFishingGameFlow
  - openSettingsDetails
  - waitForCraneStatus
  - checkEndlessEndsOnFailure
  - checkCraneGameFlow
  - checkResultScreenStaysInTheUserWorld
  - checkScanFocusStaysVisible
  - checkEffectSoundsFollowTheSetting
  - checkDockStepsAsideForTextEntry
  - checkSilentAudioDoesNotProduceData
  - checkRhythmRecordsRealOffsets
  - checkFeatureTabs
  - checkEmptyExportIsExplained
  - checkResearcherDataOnOneScreen
  - checkPwaDelivery
  - checkMobileLayout
  - enableScreenSwitch
  - checkLayoutInvariants
  - checkHiddenAttributeIsRespected
  - checkIpadAccessibilityLayout
  - exposePresentationContext
  - checkPresentationFaults
  - checkDecorationMotion
  - checkAtmosphereDescriptions
  - checkPresentationCleanup
  - collectActivityLayout
  - collectActivityTitles
  - waitForActivityChoices
  - waitForText
  - waitForCount
  - waitForClass
  - assertNoSplitRuby
  - readLogCount
  - assert
  - checkBackupRevision
  - checkStorageRecovery
  - checkDoubleVoiceFailure
  - seedOneParticipantSession
  - checkExportFileName
  - checkHandOverAfterExport
  - scanTo
  - checkResponsiveScreensOncePerEngine
  - scanReady
  - checkSwitchEndlessExit
  - checkSwitchUnavailableExit

- tests/responsive-screens.mjs: finishReady、patchSettings、openTile の本体を共通ファイルへ移した。
- tests/pwa-update-race.mjs: ポート・配信待ち・停止の重複を移した。PWAの検査本体は変更していない。
- scripts/compare-measure-screens.mjs: ポート・配信待ち・停止・タイル探索だけを共通化。測定の治具・時計・画像比較・判定は維持。
- tests/helpers.mjs: 各下ごしらえの目的と、維持する挙動を日本語で記載。

## 検証

整形直前の構文と整形直後の構文を、位置・引用符・等価なブロック/宣言分割を除いて照合し、3対象すべて一致した（tests-style-format-audit.json）。
最終版でも assert 524個の条件・引数を、識別子の改名を対応付けて変更前と照合し一致した。web-smoke の479個のうち2個がhelpersへ移り、477+2。responsive=15、PWA=14、party=16（tests-style-contract-audit.json）。
projects（5実寸）とchecks（57検査）の定義は一致。絞り込み環境変数は設定していない。

| 検査 | 変更前 | 変更後 |
|---|---|---|
| npm run test:unit | 本作業では前の実行は不要 | 終了コード0。tests-style-unit-after.log |
| npm run build | 終了コード0。tests-style-build-before.log | 終了コード0。tests-style-build-after.log |
| node tests/web-smoke.mjs | ok=242 / skip=43 / failed=0 | ok=242 / skip=43 / failed=0。名前と分類の一致=true |
| node tests/pwa-update-race.mjs | 前の実行は指示なし | 終了コード0。tests-style-pwa-after.log |
| node scripts/capture-screens.mjs | 5実寸・265枚・失敗0 | 5実寸・265枚・失敗0 |
| node tests/party-visual.mjs | 3配置通過・終了コード1 | 3配置通過・終了コード1（前後ログに詳細） |
| node --check | ― | 変更した7個の.mjs、終了コード0 |

全スモークは変更前と変更後それぞれ1回。こちらで開始した重い仕事は順番に実行した。
変更前の開始後に、別作業の compare-measure-screens/capture-measure が並行していたことを発見したため、変更後はそれらの終了も確認して開始した。
実行環境のNodeはv20.10.0（package.jsonは>=22要求）。環境変更はこの作業の範囲外として行っていない。
単体検査は31/31ファイル通過。前後のビルドは31資産をprecachingし、SWキャッシュ版も5d7189a13145e113で一致した。


### 撮影の実寸別件数

| 実寸 | 前 | 後 |
|---|---:|---:|
| 1180x820 | 52 | 52 |
| 834x1194 | 52 | 52 |
| 1366x650 | 52 | 52 |
| 844x390 | 57 | 57 |
| 390x844 | 52 | 52 |


撮れた場面・ファイル名の一致: true。失敗した場面の一致: true。


route・fullPageを含む全撮影メタデータの一致: true。


演出検査の通過名の一致: true。


通過した3配置の配置・結果データ全体の一致: true。


### 演出検査の既存失敗

変更前はipad-landscape / none / baseballで、.bb-wordのtextContent待ちが30,000msでタイムアウトした。通過は直前のcolor-legacy・balloon・coloringの3配置、画像は12枚＋野球のduring画像1枚だった。
野球のduring画像を目視し、まだ説明画面であることを確認した（party-before-matrix/ipad-landscape-none-baseball-during.png）。launch直後の治具入力はREADY_GUARD_MS内にあり、説明を抜けられていない。
変更後の同じ失敗をログで確認: true。残り141配置は未完了（野球の1配置失敗、140配置未到達）。演出検査全144配置の通過は満たせない。検査数・判定・待ち時間・結果を変えない指示に従い、今回この治具は直していない。


### スモークの実寸別件数

| 実寸 | 前 ok/skip/failed | 後 ok/skip/failed |
|---|---|---|
| chromium-desktop | 54/3/0 | 54/3/0 |
| mobile-webkit-like | 46/11/0 | 46/11/0 |
| ipad-portrait | 48/9/0 | 48/9/0 |
| phone-tall | 46/11/0 | 46/11/0 |
| phone-landscape | 48/9/0 | 48/9/0 |

分類ごとの全検査名は tests-style-smoke-before.log / tests-style-smoke-after.log に保存。
差分: なし。

## UDチェックリスト（守っている検査の維持という今回の範囲）

参照: D:/Code/neuro/docs/rules/ud-checklist.md。

- A1 満たした: 動き停止・アプリ声・二重音声失敗のassertと検査名を維持。
- A2 満たした: iPad大きい文字/高コントラストと説明/結果の版面検査を維持。全画面のコントラスト実測は本作業の対象外。
- A3 満たした: 4雰囲気×動きを減らすの検査、演出安全のassertを維持。
- A4 満たした: 走査・iPadスイッチコントロールの契約・タップ的・キーボードの検査を維持。実機操作は別途確認が必要。
- A5 満たした: 説明中の押下安全検査を維持。共通finishReadyも現行の声を止める/始める操作を使う。
- A6 満たした: 結果画面に支援者操作を出さない検査と、完了・評価・お祝いのassertを維持。
- A7 満たせない: 版面検査の被覆は維持したが、今回はスモークの5実寸、responsive内の7実寸、既定撮影の5実寸。14実寸すべての撮影を指示された作業ではない。
- B1 満たした: 支援者画面で走査を止める検査を維持。共通入口を使う撮影でも.scan-focusの判定を残した。
- B2 満たした: 開始入力の跳ね返り・説明押下・ゲーム入力の各検査を維持。入力安全自体の検査は共通の下ごしらえに置換していない。
- B3 関係ない: 測定条件・記録削除・設定リセットの仕様は変更対象外。対応する既存assertはそのまま維持。
- B4 関係ない: 保存キー・参加者・書き出し名の仕様と記録処理は変更対象外。既存assertを維持。
- B5 満たした: エンドレス/音が出ない画面から1スイッチで抜ける検査と、Space入力・待ち時間を維持。
- C1 満たした: 演出障害6種とタイミング課題の継続・記録・完了のassertを維持。障害注入は配信応答内だけ。
- C2 関係ない: 測定条件・演出ポリシーは変更対象外。安全検査の判定は維持。
- C3 満たした: 合図が鳴らない場合と音声の二重失敗のassertを維持。
- C4 満たした: 保存障害の注入と未保存記録の書き出し検査を維持。変更は障害注入前の設定の下ごしらえのみ。
- C5 満たした: 非表示/中断時の予約音・音楽の停止のassertと700msの確認待ちを維持。
- C6 関係ない: 光・音量などの上限の実装は変更対象外。既存単体検査を実行した。
- C7 関係ない: sanitizeと記録の仕様は変更対象外。既存単体検査を実行した。
- 実機でしか確かめられないもの 満たせない: iPad/VoiceOver/NeuroNode/消音スイッチ・着信/旧端末の実機確認は行っていない。

## 見つけたが直さなかったこと

- capture-screensは1枚以上撮れれば、失敗があっても終了コード0になる。集計のfailuresも確認する必要がある。指示のとおり判定は変更していない。
- party-visualは待ち切れ時に例外を出さずpage.gotoへ進む。この挙動はallowTimeoutで保った。
- party-visualの設定seedは旧v3キーを直接書いている。現在のstorageKeyはv4であり、旧データの読み込みに依存する。研究保存の領域を変えないため残した。
- party-visualは説明画面に対し、launch直後にdispatchInputする治具を使う。ガードや実際のスイッチ入力を検査するものではない。実入力の契約はweb-smoke/responsiveに残した。
- party-visualのevaluationClearは評価/仲間の要素が無い場合にもtrueを返す。両者の存在を必須にする変更は行っていない。
- 多くの検査・撮影は固定の待ち時間に依存する。550ms、120ms、仮想時計の各待ち、アニメーション後の100msなどを変更せず保った。
- web-smokeにはcheckRhythmL1GameFlow、checkRhythmVisualProfiles、checkRhythmRecordsRealOffsetsの定義があるが、checksには登録されていない。今回の全スモークでも直接は実行されない。登録理由は未確認であり、検査の数を変えないためそのまま残した。
- HTML/CSSや配信応答への注入文字列は長い行が残る。出力を変えないため文字列自体は再構成していない。
