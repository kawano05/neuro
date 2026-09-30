// =====================================================================
// atmosphere.js — 遊びの雰囲気（なし・すっきり・にぎやか・おおさわぎ）の、ただ1つの表
//
// 支援者の設定「遊びの雰囲気」（settings.fxLevel）の4つの段が、それぞれ何を出すかを
// ここだけで決める。演出エンジン（fx/）・舞台（games/partyStage.js）・ホスト
// （games/gameHost.js）・はじめの遊び（games/beginnerKit.js）・けっか（games/results.js）は、
// 段の名前で分岐せず、この表の欄を読む。以前は、粒の係数が fx/fxSafety.js に、段の文法が
// party.js に、待ち時間や「なし／すっきりならチャイム」がホストと遊びのあちこちに直書き
// されていて、表の欄の半分はどこからも読まれていなかった（2026-10-01 に1つにまとめた）。
//
// 名前は保存と記録の値（fxLevel）のまま。session.config.fxLevel が CSV まで残るので、
// どの雰囲気で遊んだかが研究の記録からそのまま分かる。
// DOM に触れない純粋な表（tests/party.test.mjs・tests/fx.test.mjs で固定する）。
// =====================================================================

/** 段の並び（弱い順）。保存の値でもある。 */
export const ATMOSPHERE_LEVELS = Object.freeze(["none", "subtle", "normal", "big"]);
/** 保存の既定（はじめて使う人は「にぎやか」）。動いている最中の分からない値は none に倒す。 */
export const DEFAULT_ATMOSPHERE = "normal";

/** おおさわぎで、遊び終えてからけっかへ進むまで（星が入りきって「いっぱい！」→ パレード）。 */
export const PARTY_FINISH_DELAY_MS = 7200;
/** おおさわぎのけっかで、お祝いが終わって走査の枠が動き出すまで（紙吹雪の下で枠を進めない）。 */
export const PARTY_RESULT_SCAN_DELAY_MS = 3400;

/**
 * 段ごとの中身。
 *   effects        … 粒・揺れ・光の係数（fx/fxEngine.js が使う）
 *                    particles 数の倍率 / particleSize 大きさの倍率 / shake 画面の揺れ /
 *                    camera 舞台の寄り / glow やわらかい光の強さ / fireworks 花火 / hitStopMs 当たりで止める長さ
 *   pressMotion    … 押したものが弾む・つぶれる（DOM の動き）
 *   worldMotion    … 世界のゆっくりした動き（海の光・泡・海藻、雲）
 *   finale         … できたときのおいわい: none / ring（星の輪）/ confetti（紙吹雪）/ parade（紙吹雪・パレード・花火）
 *   finishCue      … できたときの音: chime（短いチャイム）/ chimeApplause（＋短い拍手）/
 *                    usual（遊びの設定の音）/ fanfare（＋ファンファーレ）
 *   companions     … ラッコとキラキラびん: none / result（けっかにだけ）/ live（遊んでいる最中も）
 *   reward         … 遊び終えるとラッコの服・その日のびん
 *   finaleWaitMs   … タイミングの遊びが終わってから、けっかへ進むまでの待ち（はじめの遊びは自分の流れで待つ）
 *   resultRevealMs … けっかでお祝いを見せるあいだ、走査の枠を待たせる長さ
 */
const TABLE = {
  none: {
    effects: { particles: 0, particleSize: 1, shake: false, camera: false, glow: 0, fireworks: false, hitStopMs: 0 },
    pressMotion: false,
    worldMotion: false,
    finale: "none",
    finishCue: "chime",
    companions: "none",
    reward: false,
    finaleWaitMs: 0,
    resultRevealMs: 0,
  },
  subtle: {
    effects: { particles: 0.4, particleSize: 0.6, shake: false, camera: false, glow: 0.5, fireworks: false, hitStopMs: 40 },
    pressMotion: true,
    worldMotion: false,
    finale: "ring",
    finishCue: "chimeApplause",
    companions: "none",
    reward: false,
    finaleWaitMs: 650,
    resultRevealMs: 0,
  },
  normal: {
    effects: { particles: 1, particleSize: 1, shake: true, camera: true, glow: 1, fireworks: false, hitStopMs: 80 },
    pressMotion: true,
    worldMotion: true,
    finale: "confetti",
    finishCue: "usual",
    companions: "result",
    reward: false,
    finaleWaitMs: 1600,
    resultRevealMs: 1400,
  },
  big: {
    effects: { particles: 1.5, particleSize: 1, shake: true, camera: true, glow: 1, fireworks: true, hitStopMs: 90 },
    pressMotion: true,
    worldMotion: true,
    finale: "parade",
    finishCue: "fanfare",
    companions: "live",
    reward: true,
    finaleWaitMs: PARTY_FINISH_DELAY_MS,
    resultRevealMs: PARTY_RESULT_SCAN_DELAY_MS,
  },
};

function freezeDeep(value) {
  Object.values(value).forEach((child) => {
    if (child && typeof child === "object") freezeDeep(child);
  });
  return Object.freeze(value);
}

/** 段ごとの表（label と description は i18n のキー。設定の画面が引く）。 */
export const ATMOSPHERES = freezeDeep(
  Object.fromEntries(
    ATMOSPHERE_LEVELS.map((level) => [
      level,
      {
        level,
        label: `party.atmosphere.${level}.label`,
        description: `party.atmosphere.${level}.description`,
        ...TABLE[level],
      },
    ])
  )
);

/** 分からない値は none（何も足さない側）へ倒す。保存の既定（normal）へ戻すのは state.js の sanitize。 */
export function atmosphereLevel(level) {
  return ATMOSPHERE_LEVELS.includes(level) ? level : "none";
}

/**
 * 遊びの型ごとの、実際に出すもの。
 * @param {string} level fxLevel
 * @param {"beginner"|"timing"} [kind] はじめの遊び（押すと 出てくる を含む）か、タイミングの遊びか
 * @param {{audioCue?: boolean}} [options] 合図が音の課題（高い音だけ・さかなつり）か
 *
 * タイミングの遊びには、合図を覆う音楽・観客・旗を持ち込まない。合図が音の課題では、
 * 試行のあいだに鳴る節目の音（ベル）も鳴らさない——高い音の合図と取り違えうる。
 */
export function atmosphereFor(level, kind = "beginner", { audioCue = false } = {}) {
  const base = ATMOSPHERES[atmosphereLevel(level)];
  const timing = kind === "timing";
  return {
    ...base,
    kind,
    liveCompanions: base.companions === "live",
    resultCompanions: base.companions !== "none",
    music: base.companions === "live" && !timing,
    crowd: base.companions === "live" && !timing,
    milestoneSound: !(timing && audioCue),
    quietFinish: base.finishCue === "chime" || base.finishCue === "chimeApplause",
  };
}
