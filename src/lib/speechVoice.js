// =====================================================================
// speechVoice.js — 読み上げに使う声を選ぶ（audio.js の speak）
//
// 声を指定しないと、端末が言語ごとの「既定の声」を選ぶ。iPhone / iPad では、
// これが機械的な声（Eloquence の Eddy・Flo・Grandma… や、おもちゃの声の
// Bells・Boing・Zarvox…）になることがあり、日本語も英語も「たどたどしい」
// 読み上げになっていた（2026-09-27、利用者側で気づいた）。
//
// ここでは、その言語の声の中から、
//   1. おもちゃの声・Eloquence の声は使わない
//   2. 端末の中にある声（オフラインでも鳴る）を優先する
//   3. 高品質の声（プレミアム・拡張）があればそれを使う
//   4. よく知られた自然な声（Kyoko・O-Ren・Otoya、Samantha・Ava など）を優先する
// の順で選ぶ。合う声が無ければ null（端末の既定に任せる）。
//
// iPad で「設定 → アクセシビリティ → 読み上げコンテンツ → 声」から
// 日本語の Kyoko（拡張）や O-Ren（プレミアム）を入れておくと、それが選ばれる。
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
  ja: ["O-Ren", "Kyoko", "Otoya", "Hattori", "Nanami", "Keita", "Google 日本語", "Haruka", "Ayumi", "Sayaka", "Ichiro"],
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
 */
export function scoreVoice(voice, lang) {
  if (!voice || baseLanguage(voice.lang) !== baseLanguage(lang)) return -Infinity;
  if (!isNaturalVoice(voice)) return -Infinity;
  const name = String(voice.name);
  let score = 0;
  if (normalizedRegion(voice.lang) === normalizedRegion(lang)) score += 2;
  // オフラインでも鳴る声を強く優先する（病院・施設で使う）。
  if (voice.localService !== false) score += 8;
  if (HIGH_QUALITY.test(name)) score += 6;
  else if (ENHANCED.test(name)) score += 5;
  else if (NATURAL.test(name)) score += 4;
  const preferred = PREFERRED_VOICES[baseLanguage(lang)] || [];
  const index = preferred.findIndex((known) => name.toLowerCase().includes(known.toLowerCase()));
  if (index >= 0) score += 4 - index * 0.1;
  if (voice.default) score += 0.5;
  return score;
}

/**
 * いちばん良い声。合う声が無ければ null（端末の既定に任せる）。
 * @param {Array<object>} voices speechSynthesis.getVoices() の結果
 * @param {string} lang
 */
export function pickVoice(voices, lang) {
  let best = null;
  let bestScore = -Infinity;
  for (const voice of voices || []) {
    const score = scoreVoice(voice, lang);
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return bestScore === -Infinity ? null : best;
}
