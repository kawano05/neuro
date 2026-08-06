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

/** 完走したか、途中で終わったか。中断した回は数字の意味が変わる。 */
export function describeSessionOutcome(session) {
  if (!session) return "";
  const trials = session.trials?.length ?? 0;
  const planned = session.config?.targetTrials ?? null;
  if (session.finished === true && session.aborted === false) {
    return `完走 ${trials}回`;
  }
  // 中断した回を完走と並べて見せると、少ない試行数を成績の低さと取り違える。
  return planned === null ? `中断 ${trials}回` : `中断 ${trials}/${planned}回`;
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
export function describeSessionResult(session) {
  const summary = session?.summary;
  if (!summary) return "";

  if (session.taskType === "scan") {
    const trials = summary.trials ?? session.trials?.length ?? 0;
    return `とれた ${summary.grips ?? 0}/${trials}`;
  }

  if (session.taskType === "sms") {
    const parts = [`あった ${summary.hits ?? 0}`];
    const offset = signedMs(summary.meanRawOffsetMs);
    // ずれは hit が1つも無いと出せない。出せないものを 0ms と書かない。
    if (offset) parts.push(`ずれ 平均 ${offset}`);
    return parts.join(" / ");
  }

  if (session.taskType === "gonogo") {
    // 抑制課題の主要指標は commissionRate（押してはいけない拍で押した割合）。
    return `あった ${summary.hits ?? 0} / つい おした ${summary.commissions ?? 0}`;
  }

  if (session.taskType === "rt") {
    const parts = [];
    if (typeof summary.meanRtMs === "number") parts.push(`はやさ 平均 ${Math.round(summary.meanRtMs)}ms`);
    parts.push(`つれた ${summary.hits ?? 0}`);
    if ((summary.falseStarts ?? 0) > 0) parts.push(`フライング ${summary.falseStarts}`);
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
export function describeSessionConditions(session) {
  const config = session?.config;
  if (!config) return "";

  if (session.taskType === "scan") {
    const parts = [];
    if (typeof config.sweepMs === "number") parts.push(`はやさ ${config.sweepMs}ms`);
    if (typeof config.toleranceR === "number") parts.push(`ひろさ ${config.toleranceR}`);
    if (typeof config.targetTrials === "number") parts.push(`${config.targetTrials}かい`);
    return parts.join(" / ");
  }

  if (session.taskType === "sms" || session.taskType === "gonogo") {
    const parts = [];
    if (typeof config.bpm === "number") parts.push(`テンポ ${config.bpm}`);
    if (typeof config.targetBeats === "number") parts.push(`${config.targetBeats}はく`);
    return parts.join(" / ");
  }

  if (session.taskType === "rt") {
    // さかなつりは支援者が触れる設定を持たない。それでも試行数は回ごとに
    // 変わる（前刺激間隔の乱数で決まる）ので、そこだけ出す。
    return typeof config.targetTrials === "number" ? `${config.targetTrials}かい` : "";
  }

  return "";
}
