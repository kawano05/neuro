# 支援者設定の見直し（2026-10-01）

> この報告は、その日の作業の記録（あとから書き換えない）。今の決まりは `docs/rules/` を見る。
> 中の `test-results/`・`output/` へのリンクは、そのとき作業した PC にだけある（git の外）。

`docs/reports/2026-09-30/settings-simple.md`（よく使う6項目＋畳める詳細）の見直しで見つかったものを直した記録。
変えていないもの: 保存の形（state.settings のキーと値）・既定値・sanitize・CSV・session.config の意味・
そくていの回の条件（`MEASUREMENT_PROTOCOL`）。

## 作りの形

| ファイル | 持つもの |
|---|---|
| `src/lib/settingDefinitions.js` | 保存キーごとの名前・説明・範囲・選択肢・値の形（format）・そくていで固定されるか（measured / protocol）・遊びの中でも変えられるか（inGame）。設定画面と遊びの中の設定が共有する正本 |
| `src/lib/settingsFields.js` | 設定画面の並び（まとまり・DOM の id）、いま変えられない理由（`unavailableReason`）、読み上げに渡す説明（`describedByIds`）、既定に戻すとき何を戻すか（`resetPlan` / `describeReset`）、説明書の道順（`settingPath`） |
| `src/lib/views/settings.js` | 値の読み書き。入力の配線は1つ、使えない項目の表示は `applyAvailability` の1つ、画面の外への反映は `afterChange` の1つ |
| `src/lib/supporterGuide.js` | 説明書の中身。設定画面の「はじめての方へ」と、印刷用 `public/guide.html`（`node scripts/generate-guide.mjs` で作る）の両方がここから |
| `src/lib/dataExport.js` | 書き出しの手順は `download(rows|json, stem, kind, sessions)` の1つ。名前は書き出す記録の参加者から（`exportFileName`） |

## 判断

- **使えない理由は、その行に出す。** 理由が閉じた「スイッチのくわしい設定」の中にしか無く、スイッチコントロール中の
  「枠が動く速さ」（よく使う設定）は理由なしで灰色だった。理由は1つの関数で決め、行の中の字と aria-describedby の両方に渡す。
  使えるようになったら読み上げからも外す（隠した要素でも aria-describedby で指すと読まれるため）。
- **そくていの回は、実際に使う値を添える。** 灰色のつまみには れんしゅうの値が残る（保存の値を消さないため）。
  「そくていの回は固定です（そくていでは 3.2秒）」と `MEASUREMENT_PROTOCOL` の値を同じ行に出す。
  高い音だけのテンポと音の数は gonogo の値を出す（設定画面のまとまりが「高い音だけ」なので）。
- **既定に戻す** は、くわしい設定のまとまりごと（スイッチ・見え方と声・リール・高い音だけ・アーム・さかなつり）。
  よく使う設定と研究には置かない（よく使う設定は1つずつ見て変えるもの、研究は れんしゅう／そくてい の1つだけ）。
  いま変えられない項目と「iPad のスイッチコントロールを使う」（iPad 本体の設定と合わせるもの。アプリだけ戻すと枠が2つ出る）は戻さず、
  何を戻して何を残したかをボタンのすぐ下に出して読み上げる。画面の上の知らせ（#supporterMessage）は、下で押したときに見えないので使わない。
- **研究者モードは画面から外した。** body に class を付けるだけで、それを使う要素が0個だった。保存のキーと sanitize は残す。
- **回の名前は「れんしゅう」「そくてい」。** 支援者の画面の決まり（design-renewal §3.9 の「そくてい（研究）」、遊びの中の設定と読み上げの
  「そくていの回」）に合わせた。キャリブレーションは「押すタイミングの基準をとる」と呼び、見出しで区切る。
  遊びの画面の題名（`tile.calibration.title`＝「そくてい」）は声のパックに入っているので変えず、そう出ることを先に書いた。
- **書き出しの名前は中身から。** 1人ならそのID、2人以上（IDなしの回が混ざる場合も）なら multi、記録なし（操作ログだけ）は no-id。
  控えの照合から欄の参加者IDを外し、書き出したあとに入れた次の人のIDは切り替えのあとも残す（前の人のIDは今までどおり空にする）。

## 遊びの中の設定（games/gameSettings.js）を共有の表へ寄せる手順

今回は別の担当の範囲と接するので gameSettings.js は触らず、`tests/settings-definitions.test.mjs` で
「同じキー・同じ名前・同じ measured・選択肢が範囲の中」を固定した。寄せるときは:

1. `import { SETTING_DEFINITIONS } from "../settingDefinitions.js";` を足す。
2. `SLOT_SPEED` などの `label` と `measured` を `SETTING_DEFINITIONS[key].label` / `.measured` から引く
   （`key` と、遊びの中だけの選択肢 `options`（ゆっくり／ふつう／はやい）は gameSettings.js に残す）。
3. `GAME_SETTINGS` の各遊びに置くキーは、`SETTING_DEFINITIONS[key].inGame` にその遊びがあるものだけにする
   （両方に書かず、inGame から作ってもよい）。
4. 範囲の外の選択肢を作らない検査は、いまの単体テストがそのまま見る。

## 確かめたこと

`docs/rules/ud-checklist.md` の A2・A4・A6・B3・B4・C7 に関係する。検査の名前は `tests/web-smoke.mjs` と
`tests/settings-definitions.test.mjs`・`tests/supporter-guide.test.mjs`・`tests/data-integrity.test.mjs`。
画像は `test-results/settings-polish/`（コミット対象外）。
