// =====================================================================
// party.js — 遊びの雰囲気「おおさわぎ」の決まり（DOM に触れない純粋関数）
//
// 遊びの雰囲気は、演出の強さ（settings.fxLevel）の見せ方を変えたもの:
//   subtle … すっきり / normal … にぎやか（既定）/ big … おおさわぎ / none … なし
// 新しい設定を足さず fxLevel に乗せたのは、session.config.fxLevel が CSV まで
// 残っているから。どの雰囲気で遊んだかが、研究の記録からそのまま分かる。
//
// おおさわぎは「押すと 出てくる」で、押すたびに次のものが重なっていく
// （docs/party-mode-2026-09-29.md）:
//   なかま（ラッコ）・音楽（楽器が1つずつ重なる）・大きな数「キラキラ」・
//   観客・旗・最後のパレード、遊ぶたびにもらえるラッコの服。
// 参考にしたのは算数ドリル「ドパドリル」（MIT）の、解くたびに演出と音楽が
// 重なっていく作り。キャラクターと曲はこのアプリで作ったもの。
// 光の上限・黄色は枠だけ・爆発音なし、は他の雰囲気と同じ（fx/fxSafety.js）。
// =====================================================================

/** 押した回ごとの「キラキラ」（5回目のあと、ボーナスで PARTY_FINAL_BONUS 倍）。 */
export const PARTY_SPARKLES = Object.freeze([100, 1500, 20000, 300000, 5000000]);
export const PARTY_FINAL_BONUS = 2;
/** 越えたらお祝いする節目（1まん・10まん・100まん・1000まん）。 */
export const PARTY_MILESTONES = Object.freeze([10000, 100000, 1000000, 10000000]);
/** 押した回ごとの音楽の重なり（0〜9。partyMusic.js）と速さ（BPM）。 */
export const PARTY_MUSIC_LEVELS = Object.freeze([2, 4, 6, 7, 9]);
export const PARTY_TEMPOS = Object.freeze([114, 118, 122, 125, 128]);
/** 最後の1回で音楽を上げる幅（半音）。 */
export const PARTY_FINAL_KEY_SHIFT = 2;
/** 遊ぶたびに1つもらえるラッコの服（この順）。 */
export const PARTY_OUTFITS = Object.freeze(["hat", "bow", "crown"]);
/** 1日の合計の上限（保存の正規化）。 */
export const MAX_PARTY_SPARKLES = 1e12;

export const DEFAULT_PARTY = Object.freeze({ day: "", sparkles: 0, outfits: Object.freeze([]) });

/** 演出の強さが「おおさわぎ」か。 */
export function isPartyLevel(level) {
  return level === "big";
}

/** 押した回（0 から）までの合計のキラキラ。 */
export function sparklesAfter(pressIndex) {
  const i = Math.min(Math.max(Math.floor(pressIndex), 0), PARTY_SPARKLES.length - 1);
  return PARTY_SPARKLES[i];
}

/**
 * 大きな数の書き方。日本語は「まん」の単位（数え上げの途中も端数を出さない）、
 * 英語は桁区切り。
 * @param {number} n
 * @param {string} mode 表記（"ruby" | "kanji" | "kana" | "en"）
 */
export function formatSparkles(n, mode) {
  const value = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  if (mode === "en") return value.toLocaleString("en-AU");
  if (value < 10000) return value.toLocaleString("ja-JP");
  return `${Math.floor(value / 10000).toLocaleString("ja-JP")}まん`;
}

/** from から to へ増えたときに越えた節目（小さい順）。 */
export function crossedMilestones(from, to) {
  return PARTY_MILESTONES.filter((m) => from < m && to >= m);
}

/** 次にもらえる服。ぜんぶ持っていれば null。 */
export function nextOutfit(outfits) {
  const have = new Set(Array.isArray(outfits) ? outfits : []);
  return PARTY_OUTFITS.find((id) => !have.has(id)) ?? null;
}

/** 端末の日付（その日のキラキラを数える単位）。 */
export function localDayKey(date = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 保存の正規化（state.js の sanitizeState から呼ぶ）。 */
export function sanitizeParty(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const day = typeof source.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.day) ? source.day : "";
  const sparkles = Number.isFinite(source.sparkles)
    ? Math.min(Math.max(Math.round(source.sparkles), 0), MAX_PARTY_SPARKLES)
    : 0;
  const owned = new Set(Array.isArray(source.outfits) ? source.outfits : []);
  return { day, sparkles: day ? sparkles : 0, outfits: PARTY_OUTFITS.filter((id) => owned.has(id)) };
}

/**
 * 1回遊び終えたときの、その日の合計ともらえる服。
 * 日付が変わっていれば合計は0から数え直す（服は取り上げない）。
 * @returns {{party: {day: string, sparkles: number, outfits: string[]}, unlocked: string|null, dayTotal: number}}
 */
export function applyPartyResult(party, sparkles, dayKey = localDayKey()) {
  const current = sanitizeParty(party);
  const base = current.day === dayKey ? current.sparkles : 0;
  const dayTotal = Math.min(base + Math.max(0, Math.round(sparkles || 0)), MAX_PARTY_SPARKLES);
  const unlocked = nextOutfit(current.outfits);
  const outfits = unlocked ? PARTY_OUTFITS.filter((id) => id === unlocked || current.outfits.includes(id)) : current.outfits;
  return { party: { day: dayKey, sparkles: dayTotal, outfits }, unlocked, dayTotal };
}
