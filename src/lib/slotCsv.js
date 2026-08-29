// slot-v1専用CSV（1停止1行）。旧リズムCSVとは意図的に分離する。

import { toLocalIso } from "./utils.js";

export const SLOT_CSV_HEADERS = Object.freeze([
  "sessionId",
  "participantId",
  "gameId",
  "protocolVersion",
  "engineVersion",
  "startedAtLocal",
  "aborted",
  "difficultyMode",
  "roundIndex",
  "reelIndex",
  "targetSymbol",
  "targetIndex",
  "stoppedSymbol",
  "cycleMs",
  "toleranceMs",
  "inputMs",
  "targetPassMs",
  "signedErrorMs",
  "absoluteErrorMs",
  "observedCycles",
  "judgment",
  "seed",
  "symbolOrder",
  "deviceViewportWidth",
  "deviceViewportHeight",
  "devicePixelRatio",
  "deviceUserAgent",
  "measurementReadiness",
  // 音の出力遅延と基準遅延。sanitizeDevice は保存していたのに、リールCSVだけ
  // 出していなかった（2026-08-28）。保存されているだけの値は解析に使えない。
  //
  // リールは見て止める課題だが、止めた合図には音も出る。端末をまたいで
  // 混ぜてよいかを決めるのは解析側なので、材料は曇りなく出す。
  // 列は末尾へ足す（既存28列の位置を動かさない）。
  "deviceOutputLatencyS",
  "deviceBaseLatencyS",
  // その回の入力経路（direct / ios-switch-control）。他のCSVと同じ意味。
  "deviceInputMethod",
]);

export function buildSlotCsvRows(sessions) {
  const rows = [[...SLOT_CSV_HEADERS]];
  (Array.isArray(sessions) ? sessions : [])
    // いまの版で検証していない回は出さない。列の意味が当時の判定規則の
    // ものなので、同じ表に混ぜると1つの列に2つの意味が入る。
    // 残っていること自体は台帳CSV（legacyVersion 列）から分かる。
    .filter((session) => session?.taskType === "slot" && session.legacyVersion !== true)
    .forEach((session) => {
      const config = session.config || {};
      const device = session.device || {};
      (session.trials || []).forEach((trial) => {
        rows.push([
          session.sessionId,
          session.participantId || "",
          session.gameId,
          session.protocolVersion,
          session.engineVersion,
          toLocalIso(session.startedAtIso),
          session.aborted,
          config.difficultyMode ?? "practice",
          trial.roundIndex,
          trial.reelIndex,
          trial.targetSymbol,
          trial.targetIndex,
          trial.stoppedSymbol,
          config.cycleMs,
          config.toleranceMs,
          trial.inputMs ?? "",
          trial.targetPassMs,
          trial.signedErrorMs ?? "",
          trial.absoluteErrorMs ?? "",
          trial.observedCycles,
          trial.judgment,
          config.seed,
          JSON.stringify(trial.symbolOrder || []),
          device.viewportWidth ?? "",
          device.viewportHeight ?? "",
          device.devicePixelRatio ?? "",
          device.userAgent ?? "",
          config.measurementReadiness ?? "n/a",
          device.outputLatencyS ?? "",
          device.baseLatencyS ?? "",
          device.inputMethod ?? "",
        ]);
      });
    });
  return rows;
}
