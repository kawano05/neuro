// =====================================================================
// speechVoice.js — 端末の読み上げに使う声を選ぶ（audio.js の speakWithDevice）
//
// ふだんの読み上げは、アプリに入れた声（声のパック。src/lib/voicePack.js）で
// 鳴らす。端末の声を使うのは、パックに無い文と、設定で「端末の声」を選んだとき。
//
// 声を指定しないと、端末が言語ごとの「既定の声」を選ぶ。iPhone / iPad では、
// これが機械的な声（Eloquence の Eddy・Flo・Grandma… や、おもちゃの声の
// Bells・Boing・Zarvox…）になることがあった（2026-09-27）。
//
// ここでは、その言語の声の中から、
//   1. おもちゃの声・Eloquence の声は使わない
//   2. 自然な声（ニューラル・プレミアム・拡張）を優先する
//   3. Windows の古い声（Microsoft Ayumi・Haruka・Zira など）は最後にする
//   4. ネットの要る声は、つながっているときだけ使う
//   5. よく知られた自然な声（Kyoko・O-Ren・七海、Samantha・Ava など）を優先する
// の順で選ぶ。合う声が無ければ null（端末の既定に任せる）。
//
// 2026-09-28: 以前は「オフラインでも鳴る声」をいちばん強く優先していた。
// そのため Windows の Chrome・Edge では、Edge の「七海 Online (Natural)」や
// Chrome の「Google 日本語」があっても、古い Microsoft Ayumi が選ばれ、
// 「棒読み」と言われた。ネットの要る声が鳴らなかったときは、audio.js が
// 端末の中の声で言い直す。
// =====================================================================

/** おもちゃの声と Eloquence の声（名前の頭で見分ける）。 */
const UNNATURAL_VOICE = new RegExp(
  "^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|" +
    "Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Ralph|Reed|Rocko|" +
    "Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\\b",
  "i"
);

/** 言語ごとの、自然に聞こえることが分かっている声（前ほど優先）。 */
const PREFERRED_VOICES = {
  ja: ["O-Ren", "Kyoko", "Otoya", "Hattori", "七海", "Nanami", "圭太", "Keita", "Google 日本語", "Haruka", "Ayumi", "Sayaka", "Ichiro"],
  en: [
    "Ava",
    "Samantha",
    "Zoe",
    "Allison",
    "Susan",
    "Evan",
    "Nathan",
    "Tom",
    "Aaron",
    "Nicky",
    "Aria",
    "Jenny",
    "Guy",
    "Google US English",
    "Zira",
    "David",
    "Mark",
    "Karen",
    "Daniel",
    "Moira",
    "Tessa",
  ],
};

const HIGH_QUALITY = /(Premium|プレミアム)/i;
const ENHANCED = /(Enhanced|拡張|高品質)/i;
const NATURAL = /(Natural|Neural|ニューラル)/i;
/** Chrome の声（ネットの要る声。Windows の古い声よりずっと自然）。 */
const GOOGLE_NETWORK = /^Google\s/i;
/** Windows の古い声（SAPI・OneCore）。「Natural」の付かない Microsoft の声。 */
const LEGACY_WINDOWS = /^Microsoft\s/i;

/** "ja-JP" / "ja_JP" / "JA" → "ja" */
function baseLanguage(lang) {
  return String(lang || "").toLowerCase().split(/[-_]/)[0];
}

function normalizedRegion(lang) {
  return String(lang || "").toLowerCase().replace("_", "-");
}

/** 使ってよい声か（おもちゃの声・Eloquence の声でないか）。 */
export function isNaturalVoice(voice) {
  return Boolean(voice && voice.name) && !UNNATURAL_VOICE.test(String(voice.name).trim());
}

/**
 * 声の点数。使わない声は -Infinity。
 * @param {{name: string, lang: string, localService?: boolean, default?: boolean}} voice
 * @param {string} lang 読み上げたい言語（"ja-JP" / "en-US"）
 * @param {{online?: boolean}} [options] online … ネットの要る声を使ってよいか
 */
export function scoreVoice(voice, lang, { online = true } = {}) {
  if (!voice || baseLanguage(voice.lang) !== baseLanguage(lang)) return -Infinity;
  if (!isNaturalVoice(voice)) return -Infinity;
  const remote = voice.localService === false;
  // ネットにつながっていないときは、ネットの要る声は鳴らない（病院・施設で使う）。
  if (remote && !online) return -Infinity;
  const name = String(voice.name);
  let score = 0;
  if (normalizedRegion(voice.lang) === normalizedRegion(lang)) score += 2;
  // 同じくらいの声なら、端末の中の声（すぐ鳴り、途切れない）。
  if (!remote) score += 1;
  if (NATURAL.test(name)) score += 10;
  else if (HIGH_QUALITY.test(name)) score += 9;
  else if (ENHANCED.test(name)) score += 7;
  else if (GOOGLE_NETWORK.test(name)) score += 5;
  else if (LEGACY_WINDOWS.test(name)) score -= 4;
  const preferred = PREFERRED_VOICES[baseLanguage(lang)] || [];
  const index = preferred.findIndex((known) => name.toLowerCase().includes(known.toLowerCase()));
  if (index >= 0) score += 3 * (1 - index / preferred.length);
  if (voice.default) score += 0.2;
  return score;
}

/**
 * いちばん良い声。合う声が無ければ null（端末の既定に任せる）。
 * @param {Array<object>} voices speechSynthesis.getVoices() の結果
 * @param {string} lang
 * @param {{online?: boolean}} [options]
 */
export function pickVoice(voices, lang, options = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const voice of voices || []) {
    const score = scoreVoice(voice, lang, options);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return bestScore === -Infinity ? null : best;
}
