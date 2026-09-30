// 保存形式へ項目を足さず、この起動中に書き出した記録の内容を覚える。
// 件数だけでは、上限で古い記録が置き換わる場合や試行の更新を見落とす。
export function createRecordBackup(state) {
  const receipts = new Map();
  const snapshot = () => JSON.stringify({
    sessions: state.sessions, logs: state.logs,
    evaluation: state.evaluation, arcade: state.arcade,
  });
  const logSnapshot = () => JSON.stringify(state.logs);
  function mark(kind) {
    receipts.set(kind, kind === "logs" ? logSnapshot() : snapshot());
  }
  function canClear(scope = "all") {
    const current = snapshot();
    if (receipts.get("raw") === current) return true;
    if (scope === "logs") return receipts.get("logs") === logSnapshot();
    const kinds = new Set(state.sessions.map(session =>
      ["sms", "gonogo"].includes(session.taskType) ? "rhythm" : session.taskType));
    return receipts.get("ledger") === current &&
      [...kinds].every(kind => receipts.get(kind) === current);
  }
  return { mark, canClear, reset: () => receipts.clear() };
}
