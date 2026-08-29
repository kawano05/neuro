// =====================================================================
// difficultyMode.js — 「そくてい（研究）」と「れんしゅう（訓練）」の切り分け
//
// なぜ要るか: 支援者が触れるつまみ（テンポ・拍数・つかめる広さ・画面の
// 手がかり・通過音）は、どれも測っているものを変えうる。これまではすべてが
// 同じ設定面に並んでいて、研究として測る回とふだんの訓練の回が、同じ場所から
// 無数の組合せで作られていた。
//
// 条件を1つずつ記録する方式には限界がある。条件が増えるほど層別すべき
// セルが増え、少ない参加者では空のセルばかりになる。「記録した」ことは
// 「交絡が無い」ことを意味しない。
//
// なので、条件の束に名前を付けて2つに畳む。
//
//   そくてい（measure）… 測るための回。パラメータは protocol 固定で支援者は
//     変更できない。画面の手がかりも通過音もアシストも無し。回どうしを
//     そのまま比較でき、参加者間でも同じ条件になる。
//   れんしゅう（practice）… ふだん遊ぶ回。支援者が利用者に合わせて自由に
//     調整でき、手がかりもアシストも使える。上達のための回。
//
// どちらだったかは session.config.difficultyMode に残し、CSVにも出す。
// 解析では、まず difficultyMode === "measure" だけを見ればよい——これが
// 「主要測定の条件を固定する」ということ。
//
// DOM に触れない純粋関数として置いてある。ここの線引きは画面を見ても
// 分からず、壊れても両方の回が普通に遊べてしまう。
// =====================================================================

/** 既定は「れんしゅう」。ふだん使うのは訓練で、測定は支援者が意図して選ぶ。 */
export const DEFAULT_DIFFICULTY_MODE = "practice";

export const DIFFICULTY_MODES = new Set(["measure", "practice"]);

/**
 * そくていの protocol 値。
 *
 * ここが「主要測定の条件」そのもの。支援者の設定より優先し、変更できない。
 * 値は content.js の rhythmPresets / cranePresets と同じものを出発点にして
 * いるが、**わざと別に持っている**——プリセット側を訓練の都合で調整したとき
 * に、測定の条件まで一緒に動いてしまわないようにするため。
 *
 * 変えるときは、それまでに取ったデータと比較できなくなることを承知で変える。
 */
export const MEASUREMENT_PROTOCOL = {
  rhythm: {
    "rhythm-l1": { bpm: 40, countInBeats: 3, targetBeats: 10 },
    "rhythm-l2": { bpm: 60, countInBeats: 4, targetBeats: 20 },
    gonogo: { bpm: 50, countInBeats: 3, targetBeats: 20 },
    // calibration は元から protocol 固定（PROTOCOL_LOCKED_GAME_IDS）なので
    // ここには置かない。二重に持つと食い違う。
  },
  slot: {
    "slot-l1": { cycleMs: 3200, toleranceMs: 220, rounds: 8, seed: "slot-measure-01" },
    "slot-l2": { cycleMs: 3200, toleranceMs: 220, rounds: 4, seed: "slot-measure-01" },
  },
  crane: { sweepMs: 2200, toleranceR: 15, targetTrials: 5 },
};

/** 設定値から、いまどちらの回かを決める。 */
export function resolveDifficultyMode(settings) {
  const mode = settings?.difficultyMode;
  return DIFFICULTY_MODES.has(mode) ? mode : DEFAULT_DIFFICULTY_MODE;
}

/**
 * 「エンドレス」の回か。
 *
 * 決まった回数・決まった時間で終わらず、続けるほど難しくなる。終わりは
 * 支援者が「おわる」を押したとき（または上限に届いたとき）。
 *
 * 選ぶのは**あそびの入口**（ホームのコーナー）であって支援者の設定ではない。
 * 利用者が自分で選ぶ遊び方なので、支援者メニューのつまみとして置くと、
 * 選んだ本人からは何が変わったのか見えないまま挙動だけが変わる。
 *
 * そくていでは必ず false に解決する（MUST）。そくていは protocol で試行数と
 * パラメータを固定することが条件そのもので、難度が回の途中で動くと、回どうし
 * どころか同じ回の中の試行すら同じ条件でなくなる。エンドレスの入口は
 * そくていモード中はホームに出さないが、二重防御としてここでも落とす。
 *
 * 上限はある（各ゲームの ENDLESS_MAX_TRIALS）。state.js の検証範囲が
 * targetTrials を scan=100 / rt=200 で切るので、そこを超えて記録すると
 * 再読み込みで「完走していない回」に倒れる。無限に見せて記録が壊れるより、
 * 上限で終わるほうがよい。
 *
 * @param {object} settings state.settings
 * @param {boolean} requested ゲームの入口から渡された希望（gameHost.launch）
 */
export function resolveEndlessMode(settings, requested) {
  if (isMeasurementMode(settings)) return false;
  return requested === true;
}

/**
 * エンドレスで、いま何段目の難度か。
 *
 * 上げ方は「一定の試行数ごとに1段」。連続で成功したら上げる、という
 * 出来高制にはしない——上達したから上がったのか、たまたま当たったから
 * 上がったのかが記録から分けられなくなる。試行数で上がるなら、何試行目が
 * どの段だったかは後から必ず言える（試行ごとに実際に適用した値を記録して
 * あるので、解析側は段を数え直さなくてよい）。
 *
 * @param {number} trialIndex 0始まり
 * @param {number} trialsPerStep 1段あたりの試行数
 * @param {number} maxStep 最大段数（これ以上は上げない）
 */
export function endlessDifficultyStep(trialIndex, trialsPerStep, maxStep) {
  if (!(trialsPerStep > 0) || !(maxStep > 0)) return 0;
  const index = Number.isFinite(trialIndex) && trialIndex > 0 ? Math.floor(trialIndex) : 0;
  return Math.min(maxStep, Math.floor(index / trialsPerStep));
}

/** そくていの回か。支援者のつまみを効かせてよいかの判断はすべてこれで引く。 */
export function isMeasurementMode(settings) {
  return resolveDifficultyMode(settings) === "measure";
}

/**
 * リズム系の実効パラメータ。
 *
 * そくていでは protocol 固定。れんしゅうでは支援者の設定 → あそびごとの
 * 既定、の順で解決する（従来の優先順位をそのまま残す）。
 *
 * @param {string} gameId
 * @param {object} settings state.settings
 * @param {object} preset content.js の rhythmPresets[gameId]
 * @returns {{bpm:number, countInBeats:number, targetBeats:number}}
 */
export function resolveRhythmDifficulty(gameId, settings, preset) {
  const protocolValues = MEASUREMENT_PROTOCOL.rhythm[gameId];
  if (isMeasurementMode(settings) && protocolValues) {
    return { ...protocolValues };
  }
  return {
    bpm: settings?.rhythmBpm ?? preset.bpm,
    countInBeats: settings?.countInBeats ?? preset.countInBeats,
    targetBeats: settings?.targetBeats ?? preset.targetBeats,
  };
}

/**
 * スロット型課題の実効パラメータ。測定ではslot-v1を固定し、練習だけを調整可能にする。
 * 許容幅は常に絵柄間隔の半分以内へ収め、隣の絵柄なのにhitになる条件を作らない。
 */
export function resolveSlotDifficulty(gameId, settings, preset, practiceSeed) {
  const protocolValues = MEASUREMENT_PROTOCOL.slot[gameId];
  const measuring = isMeasurementMode(settings);
  const cycleMs = measuring
    ? protocolValues.cycleMs
    : settings?.slotCycleMs ?? preset.cycleMs;
  const requestedToleranceMs = measuring
    ? protocolValues.toleranceMs
    : settings?.slotToleranceMs ?? preset.toleranceMs;
  const roundsKey = gameId === "slot-l2" ? "slotL2Rounds" : "slotL1Rounds";
  const rounds = measuring
    ? protocolValues.rounds
    : settings?.[roundsKey] ?? preset.rounds;
  const maximumUnambiguousTolerance = cycleMs / (preset.symbolCount * 2);
  return {
    ...preset,
    cycleMs,
    toleranceMs: Math.min(requestedToleranceMs, maximumUnambiguousTolerance),
    rounds,
    seed: measuring ? protocolValues.seed : practiceSeed,
  };
}

/**
 * UFOキャッチャーの実効パラメータ。
 *
 * そくていでは protocol 固定に加えてアシストも切る。連続失敗で許容半径が
 * 広がる仕組みは訓練としては正しいが、測定では「同じ課題を解いた回」で
 * なくなる——同じセッションの中でも試行ごとに難度が変わってしまう。
 */
export function resolveCraneDifficulty(settings, preset) {
  if (isMeasurementMode(settings)) {
    return {
      ...preset,
      ...MEASUREMENT_PROTOCOL.crane,
      // アシスト無し。assistMaxSteps を 0 にすると assistedToleranceR は
      // 常に素の toleranceR を返す（games/craneGeometry.js）。
      assistMaxSteps: 0,
      audioGuidance: false,
    };
  }
  return {
    ...preset,
    sweepMs: settings?.craneSweepMs ?? preset.sweepMs,
    toleranceR: settings?.craneToleranceR ?? preset.toleranceR,
    targetTrials: settings?.craneTargetTrials ?? preset.targetTrials,
    audioGuidance: settings?.craneAudioGuidance === true,
  };
}

/**
 * その回、画面から拍の手がかりを出してよいか。
 *
 * そくていでは支援者の設定に関わらず常に切る。手がかりを出した回は
 * 「聴覚キューへの同期」を測った回ではないので、測定の回に混ぜられない。
 */
export function allowsVisualGuidance(settings) {
  return !isMeasurementMode(settings) && settings?.visualGuidance === true;
}
