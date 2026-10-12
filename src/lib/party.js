// =====================================================================
// party.js — 遊びの雰囲気「おおさわぎ」の決まり（DOM に触れない純粋関数）
//
// 遊びの雰囲気（なし・すっきり・にぎやか・おおさわぎ）の段ごとの中身は
// src/lib/atmosphere.js の表がただ1つの持ち主。ここはおおさわぎの「たまるもの」
// （びんの星・服・その日のびん）の決まりだけを持つ。研究の summary とは別に扱う。
// おおさわぎでは、押すたびに次のものが重なっていく
// （docs/party-mode-2026-09-29.md）:
//   なかま（ラッコ）・音楽（楽器が1つずつ重なる）・キラキラびん（星がたまる）・
//   観客・旗・最後のパレード、遊ぶたびにもらえるラッコの服。
// たまっていくものを数ではなく「びんの中の星」にしたのは、数字を読まない子にも
// 目で見て分かるように（はじめは大きな数にしていたが、意味が伝わらなかった）。
// 参考にしたのは算数ドリル「ドパドリル」（MIT）の、解くたびに演出と音楽が
// 重なっていく作り。キャラクターと曲はこのアプリで作ったもの。
// 光の上限・黄色は枠だけ・爆発音なし、は他の雰囲気と同じ（fx/fxSafety.js）。
// =====================================================================

/** 押した回ごとの、びんの中の星の数（5回目でちょうどいっぱい）。 */
export const PARTY_STARS = Object.freeze([1, 3, 7, 11, 15]);
export const PARTY_JAR_CAPACITY = 15;
/** 星がこの数になった回でお祝いする（はんぶん・いっぱい）。 */
export const PARTY_JAR_MOMENTS = Object.freeze({ 7: "half", 15: "full" });
/** 押した回ごとの音楽の重なり（0〜9。partyMusic.js）と速さ（BPM）。 */
export const PARTY_MUSIC_LEVELS = Object.freeze([2, 4, 6, 7, 9]);
export const PARTY_TEMPOS = Object.freeze([114, 118, 122, 125, 128]);
/** 最後の1回で音楽を上げる幅（半音）。 */
export const PARTY_FINAL_KEY_SHIFT = 2;
/** 遊ぶたびに1つもらえるラッコの服（この順）。 */
export const PARTY_OUTFITS = Object.freeze(["hat", "bow", "crown"]);
/** 1日にいっぱいにしたびんの数の上限（保存の正規化）。 */
export const MAX_PARTY_JARS = 9999;

export const DEFAULT_PARTY = Object.freeze({ day: "", jars: 0, outfits: Object.freeze([]) });

/**
 * タイミングの遊びで、成功したぶんだけ星をためる。全部成功で 15（いっぱい）。
 * エンドレスは成功1回で星1つ、15個ごとに次のびんへ進む。
 */
export function timingStars(successes, total, endless = false) {
  const clamped = Math.max(0, Math.min(successes, total));
  const earned = endless
    ? Math.max(0, Math.floor(successes))
    : Math.floor((clamped * PARTY_JAR_CAPACITY) / Math.max(1, total));
  return {
    earned,
    jars: Math.floor(earned / PARTY_JAR_CAPACITY),
    stars: earned > 0 ? earned % PARTY_JAR_CAPACITY || PARTY_JAR_CAPACITY : 0,
  };
}

/** 押した回（0 から）のあとの、びんの中の星の数。 */
export function starsAfter(pressIndex) {
  const i = Math.min(Math.max(Math.floor(pressIndex), 0), PARTY_STARS.length - 1);
  return PARTY_STARS[i];
}

/** その回でびんが「はんぶん」「いっぱい」になったか（ならなければ null）。 */
export function jarMomentAt(pressIndex) {
  return PARTY_JAR_MOMENTS[starsAfter(pressIndex)] ?? null;
}

/** 次にもらえる服。ぜんぶ持っていれば null。 */
export function nextOutfit(outfits) {
  const have = new Set(Array.isArray(outfits) ? outfits : []);
  return PARTY_OUTFITS.find((id) => !have.has(id)) ?? null;
}

/** 端末の日付（その日のびんを数える単位）。 */
export function localDayKey(date = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 保存の正規化（state.js の sanitizeState から呼ぶ）。 */
export function sanitizeParty(candidate) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const day = typeof source.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.day) ? source.day : "";
  const jars = Number.isFinite(source.jars) ? Math.min(Math.max(Math.round(source.jars), 0), MAX_PARTY_JARS) : 0;
  const owned = new Set(Array.isArray(source.outfits) ? source.outfits : []);
  return { day, jars: day ? jars : 0, outfits: PARTY_OUTFITS.filter((id) => owned.has(id)) };
}

/**
 * 1回遊び終えたとき（びんがいっぱいになったとき）の、その日のびんの数ともらえる服。
 * 日付が変わっていれば数え直す（服は取り上げない）。
 * @returns {{party: {day: string, jars: number, outfits: string[]}, unlocked: string|null, jarsToday: number}}
 */
export function applyPartyResult(party, dayKey = localDayKey(), jarCount = 1) {
  const current = sanitizeParty(party);
  const base = current.day === dayKey ? current.jars : 0;
  const jarsToday = Math.min(base + Math.max(0, Math.floor(jarCount)), MAX_PARTY_JARS);
  const unlocked = nextOutfit(current.outfits);
  const outfits = unlocked ? PARTY_OUTFITS.filter((id) => id === unlocked || current.outfits.includes(id)) : current.outfits;
  return { party: { day: dayKey, jars: jarsToday, outfits }, unlocked, jarsToday };
}
