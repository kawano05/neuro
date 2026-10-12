# ユニバーサルデザイン・フールプルーフ・フェイルセーフの確かめ表

> ユーザーの言葉（2026-09-30）: 「ユニバーサルデザインなり、フェールプルーフ、フェイルセーフなりいろいろ考えて製作してほしい」

どの仕事でも、**作る前にこの表で考え、作ったあとにこの表で確かめる**。変更の報告には、関係する項目ごとに
「満たした（どう確かめたか）／満たせない（理由）／関係ない」を書く。表の各項目を守っている自動の検査は、右の欄の
名前で `tests/web-smoke.mjs`（画面）と `tests/*.test.mjs`（単体）にある。

このアプリの人:
- **利用者** — NeuroNode などのスイッチ1つで操作する重度の方。認知面は幼い子ども想定。見えにくさ・聞こえにくさ・光や音への過敏がありうる
- **支援者** — 家族・先生・療法士。タップとキーボード
- **研究者** — 記録（CSV）を解析する

iPad が中心で、iPhone・PC でも使う。展示会でも見せる。

## A. ユニバーサルデザイン（誰でも使える）

| | 決まり | 守っている検査・仕組み |
|---|---|---|
| A1 | **2つ以上の感覚で伝える。** 合図・結果・進みぐあいは、目（形と動き）と耳（効果音・声）の両方で分かる。色だけで区別しない（形・文字・位置も変える）。ただし課題が「わざと片方だけ」のもの（高い音だけ＝音、リール＝見る）は、課題の定義を変えない。動きを止めても、合図は最後の姿で見せる（`src/decoration-motion.css`） | follows the atmosphere for decorative motion…／speaks with the app's own natural voice…／announces the explanation after both voices fail… |
| A2 | **見やすさ。** 字と地のコントラストは 4.5:1 以上（大きい字・部品は 3:1）。走査の枠（黄色 #FFC83D）はどの地でもはっきり見える。「大きい文字」「くっきり表示」「文字づかい（漢字＋ふりがな／英語）」が、どの画面でも効いて崩れない | keeps the iPad home readable with large text and high contrast／keeps responsive explanations and results… |
| A3 | **動きと光への配慮。** 強さは支援者の設定「遊びの雰囲気」で選ぶ（端末の「動きを減らす」は見ない。2026-10-01、ユーザーの判断）。雰囲気「なし」で粒も背景の動きもなく、「すっきり」で揺れ・寄り・背景の動きがない。光と花火は1秒に3回まで。広い面の明滅・色がぐるぐる変わる地・集中線はない | follows the atmosphere for decorative motion…／adds effects within the safety rules…／`tests/fx.test.mjs` |
| A4 | **操作のしかた。** スイッチ1つ（走査）で利用者の世界の全部に届く。iPad のスイッチコントロールへ任せたときも届く。タップの的は 44x44px 以上。キーボードでも使える。VoiceOver で押せるものの名前が読まれる。飾りは aria-hidden | delegates shell scanning exclusively to iPad Switch Control／keeps every screen free of overflow and undersized targets／keeps native keyboard activation separate from switch input |
| A5 | **時間の余裕。** はじめの遊びに時間切れはない。時間で進む遊びは、れんしゅうの回で速さ・長さを変えられる。説明の画面は、開いた直後（0.45秒）を過ぎたら ひと押しで始まる（説明の声が鳴っていても止めて始める。2026-10-01、ユーザーの判断） | guards the explanation press… |
| A6 | **わかりやすさ。** どの遊びも上の帯（のこり・この遊びの設定・おわる）が同じ場所・同じ形。ほめ方と進み方の文法が同じ（`docs/overall-design-2026-09-28.md` §3）。そくてい／れんしゅうが画面で分かる | keeps the result screen free of supporter chrome |
| A7 | **どの画面でも収まる。** 14 の大きさ（`docs/rules/screen-sizes.md`）と、200% に拡大したスマホの横（422×195 相当）で、切れ・はみ出し・重なりがない | keeps the mobile layout inside the viewport／keeps responsive explanations and results…／keeps rhythm visual profiles… |

## B. フールプルーフ（まちがえられない・まちがえても困らない）

| | 決まり | 守っている検査・仕組み |
|---|---|---|
| B1 | **利用者が迷い込まない。** 支援者の世界への入口はタップだけ。支援者の世界（評価ログ・設定）では走査を動かさない（`src/lib/viewWorld.js` の許可一覧の外側＝支援者の世界） | keeps all supporter screens out of the scan ring／`tests/scan-supporter.test.mjs` |
| B2 | **押しまちがいに強い。** 続けて押しても2回に数えない。説明の画面のひと押しは課題の入力に数えない。開いた直後の押下（タイルを選んだ押下の跳ね返り）は受けない。設定を開いているあいだの押下は遊びを進めない | keeps the start press from falling through…／guards the explanation press… |
| B3 | **支援者のまちがいを防ぐ。** そくていの回は、遊ぶ画面・説明・けっか・設定で「そくてい」とひと目で分かる（札は そくていの回にだけ出す。れんしゅうの回には出さない（2026-10-01、ユーザーの判断）。はじめの遊びには そくていの回が無いので出さない）。そくていの回に効く値は変えられない。記録を消す前に、いまの記録と同じ中身を書き出したか確かめる。設定は元に戻せる | blocks deletion when records change after an export／refuses to clear a participant's data before it has been exported |
| B4 | **とり違えない記録。** 本番とプレビューで保存が別。参加者ごとに記録が分かれる。書き出したファイル名に参加者と日時 | names downloads with participant and time |
| B5 | **設定の組み合わせで壊れない。** どの組み合わせでも遊びが始まり、終われる（読み上げ OFF・効果音 OFF・大きい文字・くっきり・英語・雰囲気4つ・スイッチコントロール）。スイッチだけの人が、エンドレス・音の出ない画面から自分で抜けられる | lets one switch finish both endless games…／lets one switch leave the screen where audio cannot start |

## C. フェイルセーフ（壊れても安全な側に倒れる）

| | 決まり | 守っている検査・仕組み |
|---|---|---|
| C1 | **演出が壊れても、遊びと記録は止まらない。** 演出・舞台・世界の絵・音楽・声の例外は `src/lib/presentation.js` の境目で閉じ込め、入力・判定・記録・けっかへの進行は続ける | isolates presentation faults… |
| C2 | **測定は、あいまいなら「何も足さない」側へ。** 雰囲気の値が分からないときは none（`src/lib/atmosphere.js` の atmosphereLevel）。そくていの回に演出が漏れる道を作らない | adds effects … never in a measured run／`tests/party.test.mjs` |
| C3 | **音が出ないとき。** 声のパックが読めない → 端末の声 → それも無ければ文字で知らせる。合図が音の課題（さかなつり・高い音だけ）は、音が出ないなら始めずに理由を出す（`src/lib/games/unavailableScreen.js`） | refuses to record when the cue cannot sound／announces the explanation after both voices fail… |
| C4 | **保存できないとき。** 遊びは続け、支援者に「記録が残らない」ことを見える形で出す。まだ保存されていない記録を書き出せる | keeps storage failures visible and exports the unsaved state |
| C5 | **途中で止まったとき。** 画面が隠れた・別のアプリへ行った → その回を中断として閉じる。予約した音・声・音楽・演出のタイマーが残らない | cancels scheduled sounds and result music when hidden or interrupted |
| C6 | **強さの上限は仕組みの側で守る。** 光・揺れ・粒の数・音の大きさの上限は、遊びの側から破れない（`src/lib/fx/fxSafety.js`・`src/lib/audio.js`） | `tests/fx.test.mjs`／`tests/effect-gain.test.mjs` |
| C7 | **古いデータ・知らない値。** 保存の読み込み（sanitize）は、知らない値・壊れた値を安全な既定か「分からない（null）」にする。版の値（artVersion など）は丸めない | `tests/data-integrity.test.mjs`／`tests/slot-session.test.mjs` |
| C8 | **研究の記録の要は端から端まで確かめる。** 押した時刻と拍の差が、基準を差し引かずに生の値のまま記録される。わざと壊すと落ちる検査であること | records rhythm real offsets without subtracting the baseline |

## 実機でしか確かめられないもの

自動の検査はヘッドレスのブラウザで回すので、次は iPad の実機で確かめる（`docs/testing-without-apple-devices.md`）:
VoiceOver の読み上げの中身、iPad のスイッチコントロールでの操作、NeuroNode での操作、消音スイッチ・着信のあとの音、
古い世代の iPad での動きの重さ。
