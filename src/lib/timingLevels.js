// =====================================================================
// timingLevels.js — タイミングの遊びの速さの段階（2026-11-25）
//
// 2026-11-25 の打ち合わせで「アームは いちばん遅くしても速い」と言われ、「タイミングの遊びは
// 全体に もう一段階遅く」と決めた。遊びの中の札（とても ゆっくり／ゆっくり／ふつう／はやい）は
// そのままにして、中身の値を一段階ずつ遅くした:
//   - 遊びの中の選択肢 … games/gameSettings.js の IN_GAME_CHOICES
//   - 支援者の設定画面の選択肢と範囲 … settingDefinitions.js
//   - 「ふつう」（何も選んでいないとき）… content.js のプリセット
//   - ボールを打つ遊び … games/baseball.js の PITCH_MS（保存は札の名前なので、移し替えは要らない）
//
// 前の版で札から選んだ値は、保存に「数」で残っている。そのままだと、前の「ゆっくり」が新しい
// 「ふつう」と同じ速さになり、選んだ札と速さが食い違う。えあわせは「ふつう」も数で保存されている
// （state.js の既定）ので、移さないと今までの端末では速さが変わらない。そこで、前の札の値と
// 同じ数だけを、同じ札の新しい値へ1回だけ移す。札の値と違う数（支援者が目盛りで決めた値）は
// 動かさない。1回だけにするため、移したあとは settings.timingLevels に版を書く（state.js）。
//
// そくていの回は変わらない（difficultyMode.js の MEASUREMENT_PROTOCOL が設定より優先する）。
// =====================================================================

/** 今の段階の版。settings.timingLevels がこれより小さい（または無い）保存だけを移す。 */
export const TIMING_LEVELS_VERSION = 2;

/**
 * 前の札の値 → 同じ札の新しい値（設定のキーごと）。前の「ふつう」の値も入れてある
 * （えあわせは既定が数で保存されている。ほかは目盛りや数の選択肢で同じ数を選べた）。
 * 1回の読み込みで1段だけ動かす（3200 → 4800 のあと、4800 → 7200 へは続けて動かさない）。
 */
export const LEGACY_TIMING_LEVELS = Object.freeze({
  // えあわせ: とても ゆっくり／ゆっくり／ふつう／はやい = 7200/4800/3200/2800 → 9600/7200/4800/3200
  slotCycleMs: Object.freeze({ 7200: 9600, 4800: 7200, 3200: 4800, 2800: 3200 }),
  // 音あそび（高い音だけ）のテンポ: 支援者の設定画面の数（30〜60）を1つずつ遅い数へ。
  // 「80（はやめ）」は残っているので動かさない。
  rhythmBpm: Object.freeze({ 60: 50, 50: 40, 40: 30, 30: 20 }),
  // アーム: ゆっくり／ふつう／はやい = 3200/2200/1700 → 4800/3200/2200
  craneSweepMs: Object.freeze({ 3200: 4800, 2200: 3200, 1700: 2200 }),
  // さかなつりのアタリが続く長さ: とても ながい／ながい／ふつう／みじかい = 4000/3000/2000/1400
  //   → 6000/4500/3000/2000
  fishingLimitMs: Object.freeze({ 4000: 6000, 3000: 4500, 2000: 3000, 1400: 2000 }),
});

/**
 * 前の段階で保存された設定を、今の段階へ移す。今の版の設定はそのまま返す。
 * 入力は書き換えず、移したときだけ新しいオブジェクトを返す。版を書くのは呼び出し側（state.js）。
 *
 * @param {Record<string, unknown>} settings 保存から読んだ設定（sanitize の前）
 * @returns {Record<string, unknown>}
 */
export function migrateTimingLevels(settings) {
  if (!settings || typeof settings !== "object") return settings;
  const version = Number(settings.timingLevels);
  if (Number.isFinite(version) && version >= TIMING_LEVELS_VERSION) return settings;
  let next = settings;
  for (const [key, table] of Object.entries(LEGACY_TIMING_LEVELS)) {
    const value = settings[key];
    if (typeof value !== "number" || !Object.hasOwn(table, value)) continue;
    if (next === settings) next = { ...settings };
    next[key] = table[value];
  }
  return next;
}
