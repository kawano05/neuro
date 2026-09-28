# 読み上げの声（声のパック）

アプリが読み上げる文を、前もって自然な声で音にしたもの。言語ごとに1つのファイルに
まとめてある（`src/lib/voicePack.js`、`src/lib/audio.js` の `speak`）。

| ファイル | 中身 |
|---|---|
| `ja.bin` | 日本語の文ごとの mp3 をつないだもの。声は **VOICEVOX:四国めたん**（ノーマル） |
| `en.bin` | 英語の文ごとの mp3 をつないだもの。声は **Kokoro-82M（af_heart）**、Apache License 2.0 |
| `index.json` | 文 → パックの中の位置（先頭のバイト, 長さ）と、声の名前・クレジット |

パックに無い文（数が範囲の外など）と、設定「読み上げの声」で「端末の声」を選んだときは、
端末の読み上げの声で読む。

## 使ってよい範囲

- 日本語の音は、VOICEVOX（https://voicevox.hiroshiba.jp/）の「四国めたん」の声で作った。
  VOICEVOX の利用規約と、四国めたん（東北ずん子・ずんだもんプロジェクト）の音声ライブラリ
  利用規約（https://zunko.jp/con_ongen_kiyaku.html）に従う。**クレジット「VOICEVOX:四国めたん」が要る**
  （アプリの設定「見え方・音」のいちばん下に出している。`src/lib/soundCredits.js`）。
  この音をほかで使う人も、同じ規約とクレジットに従うこと（VOICEVOX の規約が求めている）。
- 英語の音は、Kokoro-82M（https://huggingface.co/hexgrad/Kokoro-82M、Apache License 2.0）で作った。

声を選んだ理由（春日部つむぎ・No.7 などを使わない理由を含む）は
`docs/design-renewal-2026-09-25.md` §3.20。

## 作り直すとき

文言（`src/lib/i18n.js`・`content.js`）を直したら作り直す（`tests/voice-pack.test.mjs` が古いと落ちる）。

1. VOICEVOX を起動しておく（エンジンが `http://127.0.0.1:50021` で動く）。英語は Kokoro
   （`pip install "kokoro>=0.9.4" "misaki[en]>=0.9.4"`。CPU で動く。MKL の入った torch だと速い）。
2. `node scripts/voice/lines.mjs` … 読み上げる文の一覧（`scripts/voice/lines.json`）を作り直す
3. `python scripts/voice/generate.py` … 足りない音を作り、パックと `index.json` を書き直す
   （作った音は `test-results/voice-cache/` に取っておくので、変えた文だけ作る）
4. `node scripts/voice/check-readings.mjs` … 日本語の漢字の読みが、画面のふりがなと合うか見る。
   合わない言葉は `scripts/voice/readings.json` に読みを足して 3 をやり直す

声を替えるときは `scripts/voice/generate.py` の `VOICES` と `src/lib/soundCredits.js` を一緒に直す。
