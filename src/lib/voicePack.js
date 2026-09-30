// =====================================================================
// voicePack.js — アプリに入れた読み上げの声（声のパック）を引く
//
// 端末の読み上げ（speechSynthesis）は、端末に入っている声しか使えない。iPad の
// 標準の声（Kyoko・Samantha）や Windows の声（Ayumi・Haruka）は機械的で、
// 「英語でも日本語でも棒読み」と言われた（2026-09-28。5巡目に声の選び方を
// 直したあとも）。端末の設定で良い声を入れてもらう手もあるが、配る先の
// iPad すべてにそれを頼むことはできない。
//
// そこで、アプリが読み上げる文を、前もって自然な声で音にしておき、言語ごとに
// 1つのファイル（声のパック）にまとめてアプリに入れる（scripts/voice/）。
//   日本語 … VOICEVOX:四国めたん（アプリへの組み込み可・クレジット必須）
//   英語   … Kokoro（Apache-2.0）
// 読み上げのときに、その文の音がパックにあれば鳴らし、無ければ端末の声で読む
// （audio.js の speak）。
//
// 引くのは「文のかたまり」ごと。題名＋手順のように文をつないだ読み上げも、
// 文ごとの音を順に鳴らせば言える。1つでも音の無いかたまりがあれば、その
// 読み上げ全体を端末の声で読む——途中で声が変わると、別の人が話している
// ように聞こえるため。
//
// ここは純粋な関数だけ。声を作るスクリプト（scripts/voice/lines.mjs）も同じ
// 関数でかたまりを切る。作る側と引く側で切り方が1文字でも違うと引けない。
// =====================================================================

/** "ja-JP" / "en-US" → "ja" / "en"（パックは言語ごと）。 */
export function voiceLang(lang) {
  return String(lang || "").toLowerCase().split(/[-_]/)[0];
}

const JA_TERMINAL = new Set(["。", "！", "？", "!", "?"]);
const EN_TERMINAL = new Set([".", "!", "?"]);
const OPENERS = new Set(["「", "『", "（", "(", "“", "‘"]);
// 文の終わりの記号のすぐ後に続いてよい閉じかっこ。
const CLOSERS = new Set(["」", "』", "）", ")", "\"", "”", "’"]);

/**
 * 読み上げる文（toSpeechText を通したもの）を、文のかたまりに切る。
 *
 * 日本語は「。！？」の後ろで切る（記号は前のかたまりに付ける——「やったー！」と
 * 「やったー」は言い方が違うので、別の音として作る）。英語は「. ! ?」のあとに
 * 空白があるところで切る（「3.5」のような数を切らないため）。かっこの中の記号
 * （大きな「！」が出たら…）では切らない。
 * 後読み（(?<=…)）は古い iPad で読み込みごと失敗するので、1字ずつ見る。
 *
 * @param {string} text
 * @param {string} lang "ja-JP" | "en-US"
 * @returns {string[]}
 */
export function splitSpeechChunks(text, lang) {
  const english = voiceLang(lang) === "en";
  const terminal = english ? EN_TERMINAL : JA_TERMINAL;
  const source = String(text ?? "").replace(/\s+/g, " ").trim();
  const chunks = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    current += char;
    if (OPENERS.has(char)) depth += 1;
    else if (CLOSERS.has(char) && depth > 0) depth -= 1;
    if (depth > 0 || !terminal.has(char)) continue;
    // 「！？」「…!」のように続く記号と閉じかっこは、同じかたまりに入れる。
    let next = source[index + 1];
    while (next !== undefined && (terminal.has(next) || CLOSERS.has(next))) {
      current += next;
      index += 1;
      next = source[index + 1];
    }
    if (english && next !== undefined && next !== " ") continue;
    chunks.push(current.trim());
    current = "";
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * かたまりのあとに置く間（秒）。録音の頭と終わりの無音は削ってあるので
 * （scripts/voice/generate.py）、文の切れ目の間はここで決める。
 * 句点のあとは長め、「！」のあとは少し短め（はずんだ言い方のまま次へ）。
 */
export function chunkGapS(chunk) {
  const last = String(chunk ?? "").replace(/[」』）)"”’]+$/, "").slice(-1);
  if (last === "。" || last === ".") return 0.3;
  if (JA_TERMINAL.has(last) || EN_TERMINAL.has(last)) return 0.22;
  return 0.14;
}

/**
 * 声のパックの中の位置。1つでも無いかたまりがあれば null（端末の声で読む）。
 *
 * @param {{clips?: Record<string, Record<string, [number, number]>>}|null} index
 *   src/assets/voice/index.json（clips[言語][かたまり] = [先頭のバイト, 長さ]）
 * @param {string} lang
 * @param {string[]} chunks splitSpeechChunks の結果
 * @returns {Array<[number, number]>|null}
 */
export function planVoiceClips(index, lang, chunks) {
  const clips = index?.clips?.[voiceLang(lang)];
  if (!clips || !chunks?.length) return null;
  const plan = [];
  for (const chunk of chunks) {
    const range = clips[chunk];
    if (!Array.isArray(range) || range.length !== 2) return null;
    plan.push(range);
  }
  return plan;
}
