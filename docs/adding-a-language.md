# 言語を足す手順

日本語と英語のほかの言語は、`src/lib/locales/` に1言語1ファイルで足す。足したファイルに訳の抜けがあると `tests/locales.test.mjs` が落ち、足りない文は `node scripts/i18n-todo.mjs <言語>` で出る。

## 文の持ち方

文の置き場所は2つあり、訳の引き方が違う。

| | 日本語・英語の置き場所 | 足した言語の訳 | 訳が無いとき |
|---|---|---|---|
| 利用者の世界（スタート・ホーム・遊び・けっか） | `src/lib/i18n.js` の辞書（鍵 → 各表記の文） | そのファイルの `strings`（鍵 → 訳） | 英語 |
| 支援者の世界（設定・評価ログ・がんばりの記録・説明書） | 使う場所に `{ ja, en }` の組 | そのファイルの `phrases`（英語の文 → 訳） | 英語 |

学ぶ・伝える（どれかな？・ことばで伝える）の札と問い、音のクレジットの「何に使ったか」は、英語を別の表で持っている（`content.js` の `LEARN_LABEL_EN`・`PHRASE_EN`・`promptEn`、`soundCredits.js` の `useEn`・`changesEn`）。これらも `phrases` で訳す。

訳が無い文は英語で出る。日本語へは落とさない（日本語を読めない人のための言語なので）。

## 手順

1. `src/lib/locales/<言語>.js` を作る。形は下のとおり。`code` と `mode` は同じ値にする（設定に保存される `textMode` の値になる）。

   ```js
   export default {
     code: "de",
     mode: "de",
     name: "Deutsch",        // 言語を選ぶ所に出る、その言語での呼び名
     htmlLang: "de",         // ページの lang（読み上げソフトが発音を選ぶ）
     speech: "de-DE",        // 読み上げに渡す言語
     dateLocale: "de-DE",    // 日付の書き方
     voicePack: false,       // 作り置きの声が無ければ false（端末の声で読む）
     strings: { "home.title": "…" },
     phrases: { "Highlight speed": "…" },
     letterTasks: [{ prompt: "…", answer: "A", options: ["A", "E", "I", "O"] }],
   };
   ```

2. `src/lib/locales/index.js` の `CATALOGS` に並べる。並べた順に、設定の「言語 / Language」に出る。
3. `node scripts/i18n-todo.mjs <言語> --all` で、訳す文を全部出す。`strings` は「鍵 → 英語の文」、`phrases` は「英語の文 → 日本語の文（参考）」。訳して、手順1のファイルに入れる。
4. `letterTasks` を書く。「文字を えらぶ」は、その字で始まる言葉が言語で違うので、訳ではなく課題ごと持つ。数は日本語の課題（`content.js` の `letterTasks`）と同じにする。
5. `node scripts/generate-guide.mjs` で、印刷用の説明書 `public/guide-<言語>.html` を作る。
6. `node tests/run-unit.mjs` を回す。`locales.test.mjs` が、訳の抜け・使っていない訳・穴の食い違いを知らせる。

英語の文を直すと、その文を鍵にしていた訳は使われなくなる（`locales.test.mjs` が「もう使っていない英語の文の訳がある」「文の訳が足りない」と知らせる）。訳の側の鍵も直す。

## 訳すときの決まり

- `{n}` や `{title}` は穴。そのまま残す。語順に合わせて動かしてよい。
- `{n:time|times}` は、`n` が 1 のときの言い方と、ほかのときの言い方。2つとも、その言語で書く（`{n:Mal|Mal}` のように同じでもよい）。
- `<strong>` などのタグは残す。
- 「Language / 言語」のように、どの言語の人にも見つけられるよう2つの言葉を並べた文がある。

## 文を足す・直すときの決まり

- 支援者の世界の文は `{ ja: "…", en: "…" }` の組で書き、`say(組, 言語, 値)`（`src/lib/supporterText.js`）で出す。
- 組の英語は、決まった文字列で書く。数や名前が入る文は穴あきにして、値を `say` の3つ目か、組の `values` で渡す。式で組み立てた英語（`` `…${x}…` ``）は、訳を鍵で引けない。

  ```js
  say({ ja: "中断 {done}/{planned}回", en: "Stopped early, {done}/{planned} trials" }, lang, { done, planned })
  ```

- 「英語のとき」で分けない（`lang === "en"`）。足した言語が日本語へ落ちる。日本語だけ違う所は `lang === "ja"` で分ける。
- 利用者の世界の辞書の文を、支援者の文の中で使うときは、組に `key` を付ける（`{ ja, en, key }`）。足した言語は、辞書のその言語の文を引く。
- 記録は言語で変えない。記録を束ねる鍵（`sessionTrend.js` の `trendKey`）と操作ログの札（`state.logs` と CSV の `label`）は日本語のまま残し、画面に出すときだけ読み替える。

## 点検

`VITE_PSEUDO_LOCALE=1` を付けてビルドすると、言語の選択肢に にせの言語（`ｐｓｅｕｄｏ`）が出る。この言語は、英語の文の英字を全角の英字に置き換えて出す。画面を回して、半角の英字や日本語の字が出ていれば、そこは訳の仕組みを通っていない（言語を足しても英語か日本語のまま残る）。ふだんのビルドには入らない。

## 声

`voicePack: false` の言語は、端末の声で読む。作り置きの声（`src/assets/voice/`）を足すときは `scripts/voice/` を見る。声にする文の一覧（`scripts/voice/lines.mjs`）は、`voicePack` が true の言語について作られる。
