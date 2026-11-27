// =====================================================================
// sessionConditions.js — 記録済みセッションを支援者向けの一行に要約する
//
// なぜ要るか: 難易度を設定画面から変えられるようにした結果、セッションごとに
// 条件が違いうる状態になった。値は session.config に残るので追跡はできるが、
// これまで state.sessions は CSV 書き出しからしか読まれておらず、画面には
// 一度も出ていなかった。支援者が「この回はどの設定だったか」を知るには
// CSVを書き出して開くしかない。設定を開放した以上、条件が見えることは
// その対価として要る。
//
// 表示だけの純粋関数として切り出してあるのは、文言の判断（何を出し、何を
// 出さないか）をテストで固定するため。DOM には触れない。
// =====================================================================

import { MEASUREMENT_PROTOCOL } from "./difficultyMode.js";
import { say } from "./supporterText.js";

/**
 * 表示の言葉を選ぶ。記録を束ねる鍵（sessionTrend.js の trendKey）は、言語で変わらないよう
 * いつも日本語（既定）で作る。画面に出すときだけ、支援者の画面の言語を渡す。
 *
 * 文は {ja, en} の組で書き、数は {name} の穴に入れる（supporterText.js の say）。
 */
const pick = (lang) => (pair, values) => say(pair, lang, values);

/** 完走したか、途中で終わったか。中断した回は数字の意味が変わる。 */
export function describeSessionOutcome(session, lang = "ja") {
  const w = pick(lang);
  if (!session) return "";
  const trials = session.trials?.length ?? 0;
  const planned = session.config?.targetTrials ??
    (session.taskType === "slot" && Number.isFinite(session.config?.rounds) && Number.isFinite(session.config?.reelCount)
      ? session.config.rounds * session.config.reelCount : null);
  if (session.finished === true && session.aborted === false) {
    return w({ ja: "完走 {n}回", en: "Completed, {n} {n:trial|trials}" }, { n: trials });
  }
  // 中断した回を完走と並べて見せると、少ない試行数を成績の低さと取り違える。
  return planned === null
    ? w({ ja: "中断 {n}回", en: "Stopped early, {n} {n:trial|trials}" }, { n: trials })
    : w({ ja: "中断 {done}/{planned}回", en: "Stopped early, {done}/{planned} trials" }, { done: trials, planned });
}

/**
 * 符号つきミリ秒。ずれは向き（早い/遅い）が意味を持つので符号を落とさない。
 *
 * Math.round は半数値を常に +∞ 方向へ丸めるので、+37.5 は +38、-37.5 は -37 に
 * なる。符号のある測定値をそう表示すると、0 を挟んで丸めの向きが変わる。
 * 幅は1msだが、早い側と遅い側で扱いを変える理由が無いので絶対値で丸める。
 */
function signedMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.sign(value) * Math.round(Math.abs(value));
  return `${rounded >= 0 ? "+" : ""}${rounded}ms`;
}

/**
 * その回の結果を、課題ごとの主要指標で1行にする。
 *
 * なぜ要るか: 条件だけ出しても、支援者が知りたい「その条件でどうだったか」に
 * ならない。条件と結果は並べて初めて判断材料になる。
 *
 * 何を出すかは basic-design.md §1.2 の主要指標に合わせる。詳細（SD・中央値・
 * 個々の試行）はCSV側の役割で、ここに並べると読む量が増えるだけになる。
 * 解釈するのは支援者なので、アプリは材料を曇りなく出すところまでを担う。
 */
export function describeSessionResult(session, lang = "ja") {
  const w = pick(lang);
  const summary = session?.summary;
  if (!summary) return "";

  if (session.taskType === "scan") {
    const trials = summary.trials ?? session.trials?.length ?? 0;
    return w({ ja: "とれた {grips}/{trials}", en: "Grabbed {grips}/{trials}" }, { grips: summary.grips ?? 0, trials });
  }

  if (session.taskType === "sms") {
    const parts = [w({ ja: "あった {hits}", en: "On time {hits}" }, { hits: summary.hits ?? 0 })];
    const offset = signedMs(summary.meanRawOffsetMs);
    // ずれは hit が1つも無いと出せない。出せないものを 0ms と書かない。
    if (offset) parts.push(w({ ja: "ずれ 平均 {offset}", en: "mean offset {offset}" }, { offset }));
    return parts.join(" / ");
  }

  if (session.taskType === "gonogo") {
    // 抑制課題の主要指標は commissionRate（押してはいけない拍で押した割合）。
    return [
      w({ ja: "あった {hits}", en: "On time {hits}" }, { hits: summary.hits ?? 0 }),
      w({ ja: "つい おした {commissions}", en: "pressed by mistake {commissions}" }, { commissions: summary.commissions ?? 0 }),
    ].join(" / ");
  }

  if (session.taskType === "slot") {
    const trials = summary.trials ?? session.trials?.length ?? 0;
    const parts = [w({ ja: "あった {hits}/{trials}", en: "Matched {hits}/{trials}" }, { hits: summary.hits ?? 0, trials })];
    if (typeof summary.medianAbsoluteErrorMs === "number") {
      parts.push(w({ ja: "ずれ 中央 {ms}ms", en: "median error {ms}ms" }, { ms: Math.round(summary.medianAbsoluteErrorMs) }));
    }
    if ((summary.timeoutCount ?? 0) > 0) parts.push(w({ ja: "時間切れ {count}", en: "timed out {count}" }, { count: summary.timeoutCount }));
    return parts.join(" / ");
  }


  if (session.taskType === "rt") {
    const parts = [];
    if (typeof summary.meanRtMs === "number") parts.push(w({ ja: "はやさ 平均 {ms}ms", en: "mean reaction {ms}ms" }, { ms: Math.round(summary.meanRtMs) }));
    parts.push(w({ ja: "つれた {hits}", en: "caught {hits}" }, { hits: summary.hits ?? 0 }));
    if ((summary.falseStarts ?? 0) > 0) parts.push(w({ ja: "フライング {count}", en: "early presses {count}" }, { count: summary.falseStarts }));
    return parts.join(" / ");
  }

  return "";
}

/**
 * その回に効いていた条件。支援者が設定画面で触れる値だけを出す。
 *
 * 触れない値（前刺激間隔の範囲、判定窓など）まで並べると、読む量が増える
 * わりに「自分が何を変えたか」を見分けにくくなる。追試に必要な全項目は
 * CSV 側に出ている。
 */
export function describeSessionConditions(session, lang = "ja") {
  const w = pick(lang);
  const config = session?.config;
  if (!config) return "";

  // エンドレスは、決まった回数の回とは別の束にする。
  //
  // 理由は2つ。
  //   1. 難度が回の途中で動く。はやさ・ひろさ・受付時間を1つの値として
  //      出すと嘘になる（crane なら 2200ms/15 で始まって 1100ms/6.66 まで
  //      動く）。動く条件を固定値の顔で並べてはいけない。
  //   2. 終わり方が違う。エンドレスは1回失敗したところで終わるので、
  //      「5回中3回とれた」と「22回目で失敗した」を同じ線に載せられない。
  //
  // 束ねる名前は「エンドレス」だけでよい。難度の上がり方はコードに固定されて
  // いて回ごとに変わらないので、エンドレスどうしは同じ条件で比べられる
  // （games/crane.js の endlessToleranceR / endlessSweepMs）。試行数は
  // 条件ではなく結果なので、ここには出さない——出すと回ごとにキーが変わり、
  // 線が1点ずつに割れて推移が一度も出なくなる（実測で0本だった）。
  if (config.endless === true) return w({ ja: "エンドレス", en: "Endless" });

  // 押せば必ず当たる回（difficultyMode.js の resolveSureHit）は、名前を先頭に出して別の束にする。
  // どこで押しても当たりになる回なので、ふだんの回と同じ線に載せると、切り替えた日に成績が
  // 跳ね上がって（戻した日に落ちて）見える。高い音だけは、ほかの値（テンポ・拍の数）が
  // ふだんの回と同じなので、名前が無いと同じ束に入ってしまう。
  const sureHit = config.sureHit === true ? [w({ ja: "押せば必ず当たる", en: "Every press wins" })] : [];

  if (session.taskType === "scan") {
    const parts = [];
    if (typeof config.sweepMs === "number") parts.push(w({ ja: "はやさ {ms}ms", en: "sweep {ms}ms" }, { ms: config.sweepMs }));
    if (typeof config.toleranceR === "number") parts.push(w({ ja: "ひろさ {r}", en: "width {r}" }, { r: config.toleranceR }));
    if (typeof config.targetTrials === "number") parts.push(w({ ja: "{n}かい", en: "{n} {n:try|tries}" }, { n: config.targetTrials }));
    // 通過音を鳴らしていた回は、画面を見なくても解ける——視覚課題としての
    // 成績ではなくなるので、条件として並べないと回どうしを比べられない。
    if (config.audioGuidance === true) parts.push(w({ ja: "通過音あり", en: "pass-over sound on" }));
    if (config.difficultyMode === "measure") parts.unshift(w({ ja: "そくてい", en: "Measure" }));
    if (config.measurementReadiness === "overridden") parts.push(w({ ja: "成立確認なし", en: "readiness not checked" }));
    return [...sureHit, ...parts].join(" / ");
  }

  if (session.taskType === "sms" || session.taskType === "gonogo") {
    const parts = [];
    if (typeof config.bpm === "number") parts.push(w({ ja: "テンポ {bpm}", en: "tempo {bpm}" }, { bpm: config.bpm }));
    if (typeof config.targetBeats === "number") parts.push(w({ ja: "{n}はく", en: "{n} beats" }, { n: config.targetBeats }));
    // 画面から拍の手がかり（予告の溜め＋ずれの目盛り）を出していた回は、
    // 聴覚だけへの同期ではないので測定として別条件になる。ここに出さないと、
    // 支援者は2つの回を並べたときに違いに気づけない。
    //
    // 出すのは ON のときだけ。既定が OFF なので、OFF を毎行書くと全行に
    // 同じ札が並んで、条件の違いを探すのがかえって難しくなる。
    if (config.visualGuidance === true) parts.push(w({ ja: "手がかりあり", en: "visual cue on" }));
    // そくていの回は先頭に出す。条件の束の名前なので、個別の値より先に
    // 目に入るほうが「この回は何なのか」が速く分かる。
    if (config.difficultyMode === "measure") parts.unshift(w({ ja: "そくてい", en: "Measure" }));
    // 成立確認（高低の聞き分け・随意操作・規則の実行）を確かめないまま
    // 測った回。成績が低かったときに、抑制の失敗なのか課題がそもそも
    // 成立していなかったのかを分けられない回なので、条件として出す。
    // 出すのは overridden のときだけ——met を毎行書くと札が並ぶだけで、
    // 見分けたいほうが埋もれる（そくていの札と同じ扱い）。
    if (config.measurementReadiness === "overridden") parts.push(w({ ja: "成立確認なし", en: "readiness not checked" }));
    return [...sureHit, ...parts].join(" / ");
  }

  if (session.taskType === "slot") {
    const parts = [];
    if (typeof config.cycleMs === "number") parts.push(w({ ja: "1周 {ms}ms", en: "cycle {ms}ms" }, { ms: config.cycleMs }));
    if (typeof config.toleranceMs === "number") parts.push(w({ ja: "合う幅 ±{ms}ms", en: "window ±{ms}ms" }, { ms: config.toleranceMs }));
    if (typeof config.rounds === "number") parts.push(w({ ja: "{n}ラウンド", en: "{n} {n:round|rounds}" }, { n: config.rounds }));
    if (typeof config.reelCount === "number") parts.push(w({ ja: "{n}本", en: "{n} {n:reel|reels}" }, { n: config.reelCount }));
    if (config.difficultyMode === "measure") parts.unshift(w({ ja: "そくてい", en: "Measure" }));
    if (config.measurementReadiness === "overridden") parts.push(w({ ja: "成立確認なし", en: "readiness not checked" }));
    return [...sureHit, ...parts].join(" / ");
  }

  if (session.taskType === "rt") {
    // 支援者が変えられるのは、アタリが続く長さ（受付時間 limitMs）だけ（練習の回、
    // 2026-09-27 から。difficultyMode.js の resolveFishingDifficulty）。
    //
    // そくていと同じ長さ（2000ms）の回には何も出さない。測定の回と同じ束に入り、これまでの
    // 推移がそのまま続く。違う長さの回だけを別の束にする。
    //
    // 比べる相手は、そくていの長さ（MEASUREMENT_PROTOCOL）。2026-11-25 に れんしゅうの「ふつう」を
    // 3000ms へ長くした（timingLevels.js）ので、プリセットと比べると、今までの 2000ms の回の札が
    // 消え、新しい ふつうの回が測定の回と同じ束に入ってしまう。
    // 押せば必ず当たる回は、長さも数も決まっている（difficultyMode.js の SURE_HIT_FISHING）ので、名前だけ。
    if (sureHit.length) return sureHit[0];
    const defaultLimitMs = MEASUREMENT_PROTOCOL.fishing[session.gameId]?.limitMs;
    if (typeof config.limitMs === "number" && typeof defaultLimitMs === "number" && config.limitMs !== defaultLimitMs) {
      return w({ ja: "アタリ {ms}ms", en: "bite window {ms}ms" }, { ms: config.limitMs });
    }
    //
    // 試行数は出さない。前刺激間隔の乱数で回ごとに変わるので、条件キーに
    // 入れると回ごとに別の束になり、推移が1本も出なくなる（実測で0本
    // だった。2026-08-29）。試行数は条件ではなく結果——同じ手続きで測った
    // 回が、たまたま何試行になったかの違いでしかない。
    //
    // 何試行だったかは台帳CSVの trialCount とセッション一覧に出る。
    return "";
  }

  return "";
}
