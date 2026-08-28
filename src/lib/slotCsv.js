// slot-v1専用CSV（1停止1行）。旧リズムCSVとは意図的に分離する。

export const SLOT_CSV_HEADERS = Object.freeze([
  "sessionId",
  "participantId",
  "gameId",
  "protocolVersion",
  "engineVersion",
  "startedAtIso",
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
]);

export function buildSlotCsvRows(sessions) {
  const rows = [[...SLOT_CSV_HEADERS]];
  (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.taskType === "slot")
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
          session.startedAtIso,
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
        ]);
      });
    });
  return rows;
}
