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
