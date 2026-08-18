// =====================================================================
// readinessCheck.js — そくていに入る前の「課題が成立しているか」の確認
//
// なぜ要るか:
//   そくていの回で成績が低かったとき、その原因は最低4つある。
//     1. 理解不能 … 何をする課題か分かっていない
//     2. 聴取不能 … 合図の音が聞こえていない／高低を区別できていない
//     3. 運動不能 … 押そうと思ってから押すまでが間に合わない
//     4. 抑制失敗 … 分かっていて聞こえていて押せるが、止められない
//   4だけが gonogo の測っているものだが、1〜3が混ざっていると区別できない。
//   「押せなかった」という同じ記録が4通りの意味を持ってしまう。
//
//   区別する方法は、測る前に 1〜3 が成り立っていることを別々に確かめること。
//   確かめずに測ると、あとからデータをいくら見ても分けられない——これは
//   解析の工夫で埋められない、設計で埋めるしかない穴。
//
// どうやるか:
//   新しい確認課題は作らない。れんしゅうの回で既に必要なものは全部
//   記録している。3つの前提はそれぞれ別の課題の記録から読める。
//
//     きこえて わかる（弁別）   … gonogo   高音と低音を区別できているか
//     いしを もって おせる（随意）… fishing  合図に対して押しているか
//     つづけて できる（規則実行） … sms      合図なしに規則を保てているか
//
//   自己申告のチェックボックスにしない。「できます」と支援者が答えた記録は
//   成績と独立でないし、あとから見返しても何を根拠にそう答えたか残らない。
//
// 判定の作りかた（ここがこのファイルの本体）:
//   「達成率が高いこと」を条件にしてはいけない。判定窓は広く、連続系では
//   窓が時間のほとんどを覆う——でたらめに押しても達成率は高く出る
//   （windowCoverage を参照。bpm50・W540 で 90%）。達成率で構えた条件は、
//   何も確かめていないのに必ず通る条件になる。
//
//   なので、条件はすべて「でたらめに押した場合と区別がつくか」で立てる。
//     弁別   … 押してよい拍と押してはいけない拍で、押す割合が違うこと
//     随意   … 反応時間が随意運動としてありうる幅に収まっていること
//     規則実行… ずれのばらつきが、一様分布より明らかに小さいこと
//
// DOM に触れない純粋関数として置いてある。ここの線引きは画面を見ても
// 分からず、壊れても測定は普通に始まって普通に数字が出る。
// =====================================================================

/**
 * 判定窓がセッションの時間のうちどれだけを覆うか（0〜1）。
 *
 * これは「でたらめに押した1回が、たまたま窓の中に落ちる確率」そのもの。
 * 達成率を能力の指標として使ってよいかの目安になる。
 *
 * 連続系（continuous / gonogo）は拍が beatInterval ごとに切れ目なく並ぶので、
 * 1拍あたり 2W を beatInterval で割る（上限1）。
 * cued は1試行が countInBeats + 1（高音）+ 1.5（休止）拍ぶんの長さを持ち、
 * そのうち窓は 2W だけ。
 *
 * 実例（bpm 50 = 拍間隔 1200ms、判定窓 W=540/600）:
 *   continuous … 2×540/1200 = 0.90 ← でたらめに押しても9割当たる
 *   cued(L1)   … 2×600/((2+1+1.5)×1200) = 0.22
 *
 * @param {"cued"|"continuous"|"gonogo"} mode
 * @param {number} bpm
 * @param {number} effectiveWindowMs 実効判定窓半幅 W（judge.js）
 * @param {number} countInBeats cued でのみ使う
 * @param {number} [trialGapBeats] cued の試行間休止（rhythm.js の TRIAL_GAP_BEATS）
 * @returns {number} 0〜1
 */
export function windowCoverage(mode, bpm, effectiveWindowMs, countInBeats, trialGapBeats = 1.5) {
  const beatIntervalMs = 60000 / bpm;
  const spanMs =
    mode === "cued" ? (countInBeats + 1 + trialGapBeats) * beatIntervalMs : beatIntervalMs;
  return Math.min(1, (2 * effectiveWindowMs) / spanMs);
}

/**
 * 一様に散らばった入力のずれの標準偏差（ms）。
 *
 * 「合図を無視して等間隔に押しているだけ」の人のずれは、拍間隔の幅の一様
 * 分布になる。その SD は幅/√12。実際に測った SD がこれと同じなら、合図に
 * 合わせている証拠がひとつも無いということ。
 *
 * bpm 50（拍間隔1200ms）なら 346ms。
 */
export function uniformOffsetSdMs(bpm) {
  return 60000 / bpm / Math.sqrt(12);
}

/** 同期していると言えるのは、一様分布の SD のこの割合より小さいとき。 */
const SYNC_SD_RATIO = 0.6;
/** 弁別できていると言えるのは、Go と No-Go で押す割合がこれだけ違うとき。 */
const DISCRIMINATION_MARGIN = 0.3;
/** 随意運動としてありうる反応時間の幅（ms）。 */
const VOLUNTARY_RT_MIN_MS = 120;
const VOLUNTARY_RT_MAX_MS = 1500;
/** 1つの確認につき、これだけの回数を見る。1回だけでは調子の差と区別できない。 */
const MIN_SESSIONS = 2;
/** 1回のなかで、これだけの試行が無いと割合として読まない。 */
const MIN_TRIALS = 6;

/** 判定に使ってよい回か（完走していて、れんしゅうの回）。 */
function isUsable(session) {
  // 中断した回は試行数が計画と違うので割合の意味が変わる。
  if (!session || session.aborted === true || session.finished !== true) return false;
  // そくていの回そのものは根拠にしない（成立を確かめる前に測った回なので、
  // それを成立の根拠にすると循環する）。
  return (session.config?.difficultyMode ?? "practice") !== "measure";
}

function countTrials(session) {
  return (session.trials || []).filter((trial) => !trial.excluded).length;
}

/**
 * 【1】きこえて わかる（高低の弁別）。根拠は gonogo の回。
 *
 * 押してよい拍（Go）と押してはいけない拍（No-Go）で、押す割合が違うことを見る。
 * 全部押す人は goHitRate=1.0 / commissionRate=1.0 で差が 0、全部押さない人は
 * 0/0 でやはり差が 0。どちらも「区別できている」証拠にはならない——達成率
 * だけを見ていると前者を満点として通してしまう。
 */
function checkDiscrimination(sessions) {
  const runs = sessions.filter((session) => isUsable(session) && session.taskType === "gonogo");
  const usable = runs.filter((session) => countTrials(session) >= MIN_TRIALS);
  if (usable.length < MIN_SESSIONS) {
    return { met: false, value: null, reason: `「高い音だけ」をあと${MIN_SESSIONS - usable.length}回` };
  }
  const margins = usable.map(
    (session) => (session.summary?.goHitRate ?? 0) - (session.summary?.commissionRate ?? 0)
  );
  const worst = Math.min(...margins);
  return {
    met: worst >= DISCRIMINATION_MARGIN,
    value: worst,
    reason:
      worst >= DISCRIMINATION_MARGIN
        ? ""
        : "高い音と低い音で、押す割合がほとんど同じ",
  };
}

/**
 * 【2】いしを もって おせる（随意操作）。根拠は fishing（単純反応時間）の回。
 *
 * 反応時間が随意運動としてありうる幅にあること。速すぎる（120ms 未満）のは
 * 合図の前から押しはじめていた証拠で、遅すぎる（1500ms 超）のは合図と押しが
 * 結び付いていない。フライングだらけの回も同じ理由で通さない。
 */
function checkVolition(sessions) {
  const runs = sessions.filter((session) => isUsable(session) && session.taskType === "rt");
  const usable = runs.filter((session) => typeof session.summary?.meanRtMs === "number");
  if (usable.length < MIN_SESSIONS) {
    return { met: false, value: null, reason: `「さかなつり」をあと${MIN_SESSIONS - usable.length}回` };
  }
  const rts = usable.map((session) => session.summary.meanRtMs);
  const worst = Math.max(...rts);
  const fastest = Math.min(...rts);
  const inRange = fastest >= VOLUNTARY_RT_MIN_MS && worst <= VOLUNTARY_RT_MAX_MS;
  return {
    met: inRange,
    value: worst,
    reason: inRange
      ? ""
      : fastest < VOLUNTARY_RT_MIN_MS
        ? "合図より先に押しはじめている"
        : "合図と押すことが結びついていない",
  };
}

/**
 * 【3】つづけて できる（規則実行）。根拠は sms（リズム）の回。
 *
 * ずれのばらつきが一様分布より明らかに小さいこと。達成率で見てはいけない
 * ——連続系では窓が時間の9割を覆うので、でたらめに押しても9割当たる。
 * SD なら「合図に合わせている」ことの直接の証拠になる。
 */
function checkRuleExecution(sessions) {
  const runs = sessions.filter((session) => isUsable(session) && session.taskType === "sms");
  const usable = runs.filter(
    (session) =>
      typeof session.summary?.sdRawOffsetMs === "number" && typeof session.config?.bpm === "number"
  );
  if (usable.length < MIN_SESSIONS) {
    return { met: false, value: null, reason: `「リズム」をあと${MIN_SESSIONS - usable.length}回` };
  }
  const ratios = usable.map(
    (session) => session.summary.sdRawOffsetMs / uniformOffsetSdMs(session.config.bpm)
  );
  const worst = Math.max(...ratios);
  return {
    met: worst <= SYNC_SD_RATIO,
    value: worst,
    reason: worst <= SYNC_SD_RATIO ? "" : "押すタイミングが合図と結びついていない",
  };
}

/**
 * 3つの前提の確認結果。
 *
 * label は支援者向け（この画面には支援者が同席する）。reason は「まだ通って
 * いない理由」で、通っているときは空。
 */
export const READINESS_CHECK_IDS = ["discrimination", "volition", "ruleExecution"];

const CHECKS = [
  { id: "discrimination", label: "高い音と低い音を聞き分けられる", run: checkDiscrimination },
  { id: "volition", label: "合図に対して意図して押せる", run: checkVolition },
  { id: "ruleExecution", label: "追加の合図なしに規則を続けられる", run: checkRuleExecution },
];

/**
 * @param {Array<object>} sessions state.sessions（全課題ぶん）
 * @param {string} [participantId] 指定すると、その参加者の回だけを見る
 * @returns {{checks: Array<{id:string,label:string,met:boolean,value:number|null,reason:string}>, allMet:boolean}}
 */
export function evaluateReadiness(sessions, participantId = "") {
  const list = Array.isArray(sessions) ? sessions : [];
  // 参加者を指定したら、その人の回だけ。別の人の記録で成立を判断すると、
  // 「誰について確かめたのか」が言えない記録になる。
  const scoped = participantId
    ? list.filter((session) => (session.participantId || "") === participantId)
    : list;
  const checks = CHECKS.map(({ id, label, run }) => ({ id, label, ...run(scoped) }));
  return { checks, allMet: checks.every((check) => check.met) };
}

/**
 * その回、成立確認がどうなっていた状態で測ったか。session.config に残し、
 * CSV にも出す（測定条件は禁止せず記録する、という全体の方針）。
 *
 *   "met"        … 3つとも確認できている状態で測った
 *   "overridden" … 確認できていないが、支援者が承知のうえで測った
 *   "n/a"        … れんしゅうの回（成立確認の対象外）
 *
 * overridden の回を除外するかどうかは解析側が決める。アプリは測定を止めず、
 * どちらだったかを必ず言えるようにするところまでを担う。
 */
export function resolveReadinessState(settings, sessions, participantId = "") {
  if ((settings?.difficultyMode ?? "practice") !== "measure") return "n/a";
  return evaluateReadiness(sessions, participantId).allMet ? "met" : "overridden";
}

export const READINESS_STATES = new Set(["met", "overridden", "n/a"]);
