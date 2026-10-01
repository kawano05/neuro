# そくていの回を変えない決まり

このアプリは研究の道具でもある。タイミングの遊び（リール・アーム・さかなつり・高い音だけ・リズム・反応）の
**そくていの回**（`settings.difficultyMode = "measure"`）は、それまでに取ったデータと比べられることが一番大事。
見た目・演出・画面の大きさの仕事をするときも、ここに書いたものは変えない。

## 変えないもの

1. **測定の手順の値** — `src/lib/difficultyMode.js` の `MEASUREMENT_PROTOCOL`（テンポ・拍数・周期・許容幅・回数・
   種・受付時間など）。支援者の設定より優先し、支援者は変えられない。変えるときは、それまでのデータと比べられなく
   なることを承知で、研究者と決めてから変える。
2. **遊ぶ画面の見え方** — 刺激（合図・目標・動くもの）と、その位置・大きさ・時刻・色。**1画素も変えない。**
   新しい絵・世界・動き・演出は、れんしゅうの回だけに出す（遊ぶ面に `.is-practice` が付く。リールは
   `.slot-task[data-difficulty-mode="practice"]` も）。CSS は必ずその下に書き、JS で絵を替えるときも
   `difficultyMode !== "measure"` のときだけ。
3. **判定と時刻** — 入力の時刻の取り方（シェルの入口で取る）、判定の式、合図の出る時刻、試行の順序。
4. **雰囲気と演出** — そくていの回は雰囲気を none として扱う（`src/lib/atmosphere.js`・`fx.forMeasurement()`）。
   ラッコ・びん・音楽・観客・粒・背景の動きは出さない。
5. **合図より前に動くもの・鳴るものを置かない**（予告になる）。これは、れんしゅうの回でも守る。

## 変えてよいもの

- 遊ぶ前の説明の画面（まだ計測が始まっていない）と、けっかの画面（計測が終わっている）。
- 上の帯（のこり・この遊びの設定・おわる）。遊びの面の外にある支援者のための帯。「そくてい／れんしゅう」の
  名前を出している（とり違えを防ぐ。`docs/rules/ud-checklist.md` の B3）。
- 収まらない画面での縮め方（`docs/rules/screen-sizes.md`）。そくていの回は、決まった大きさのまま収まる画面では
  何も変えず、収まらない画面でだけ小さく収める（大きくはしない）。実際に出した大きさは記録に残す（リールの
  `reelCellPx`）。

## 記録（測定の条件は禁止せず記録する）

見え方や手がかりを変える設定は、訓練には要るので禁止しない。代わりに**条件として記録する**。新しい条件を足すときは、
3つの道を全部通す。1つでも欠けると、あとから条件を区別できない。

1. 各遊びで `session.config` に書く
2. `src/lib/state.js` の sanitize で残す（知らない値・壊れた値は安全な既定か null。版の値は丸めない）
3. CSV に列として出す。**既にある列の位置は動かさず、いちばん後ろに足す**

今ある条件の例: `difficultyMode`・`visualGuidance`・`craneAudioGuidance`・`textMode`・`device`・`fxLevel`・
`artVersion`（その回に画面へ出した絵の版。そくていの回はいつも 1。`src/lib/artVersion.js`）。
リールの判定の版 `SLOT_ENGINE_VERSION` は、見え方ではなく判定を変えたときだけ上げる。

保存の形（localStorage の state）・sanitize の意味・CSV の列の順番・`session.config` の意味は、研究の記録そのもの。
作り直すときもここは変えない（`docs/rules/` の外の決まり: 技術負債を返すときも研究の記録とそくていの回は変えない）。

## 確かめ方

- 画面: 変更の前のコミットと、変更のあとで、それぞれビルドして比べる。

  ```
  npx vite build --outDir <前のビルド>      （前のコミットの worktree で）
  npx vite build --outDir <後のビルド>
  node scripts/compare-measure-screens.mjs --before <前のビルド> --after <後のビルド>
  ```

  そくていの回のタイミングの遊び7つ（calibration を含む）× 14 の大きさ × 遊んでいる最中の3つの時刻を、乱数・時計・音の時計を固定して撮り、
  RGB で比べる。遊ぶ画面が1画素でも違えば exit 1。上の帯の「のこり」の札の違いは、別に数えて知らせる。
- 単体: `tests/data-integrity.test.mjs`（sanitize・CSV の列）、`tests/session-conditions.test.mjs`（条件が記録に残る）、
  `tests/difficulty-mode.test.mjs`（protocol が設定より優先する）、`tests/party.test.mjs`・`tests/fx.test.mjs`（そくていの回で
  何も足さない）。
- 画面の動き: `tests/web-smoke.mjs` の「adds effects within the safety rules and never in a measured run」など。

## 経緯

- `basic-design.md` §6・`detailed-design.md` … 研究の設計
- `docs/overall-design-2026-09-28.md` §2-5・§5 … 演出と測定の境界
- `docs/design-renewal-2026-09-25.md` §3.3 … そくていの回は1pxも変えない、と決めたとき
- 2026-09-30 … 絵を作り直すたびに、そくていの回の画面を画素で比べてきた（リール・アーム・さかなつり・画面の大きさ・
  雰囲気。どれも遊ぶ画面の違いは 0）。比べ方が作業ごとの使い捨ての道具に分かれていたので、2026-10-01 に
  `scripts/compare-measure-screens.mjs` の1つにまとめた
