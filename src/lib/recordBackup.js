// 保存形式へ項目を足さず、この起動中に書き出した記録の内容を覚える。
// 件数だけでは、上限で古い記録が置き換わる場合や試行の更新を見落とす。
//
// 照合に「いま欄に入っている参加者ID」（evaluation.participantId）は入れない。記録そのもの
// ではなく、次の回に焼き付ける値なので、書き出したあとに次の人のIDを入れただけで
// 「まだすべて書き出していません」と拒まれていた。記録（セッション・ログ・評価の値・
// メダル）が同じなら、書き出したものと同じとみなす。
export function createRecordBackup(state) {
  const receipts = new Map();
  const snapshot = () => {
    const { participantId: _nextParticipant, ...evaluation } = state.evaluation || {};
    return JSON.stringify({
      sessions: state.sessions, logs: state.logs,
      evaluation, arcade: state.arcade,
    });
  };
  const logSnapshot = () => JSON.stringify(state.logs);
  // 最後に書き出したときに欄に入っていた参加者ID。切り替えのとき、そのあとに入れた
  // 次の人のIDかどうかを見分けるのに使う（dataExport.js の nextParticipantAfterHandOver）。
  let participantAtExport = null;
  function mark(kind) {
    receipts.set(kind, kind === "logs" ? logSnapshot() : snapshot());
    participantAtExport = state.evaluation?.participantId || "";
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
  return {
    mark,
    canClear,
    participantAtExport: () => participantAtExport,
    reset: () => {
      receipts.clear();
      participantAtExport = null;
    },
  };
}
