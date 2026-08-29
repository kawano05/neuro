// 自己最高（crane のリザルトに出る「これまでの さいこう」）が、
// エンドレスの回と決まった回数の回を混ぜていないか。
//
//   node scripts/probes/probe-personal-best.mjs

import { personalBest } from "../../src/lib/games/gameHost.js";

const run = ({ id, targetTrials, grips, endless }) => ({
  sessionId: id,
  gameId: "crane",
  taskType: "scan",
  finished: true,
  aborted: false,
  config: { sweepMs: 2200, toleranceR: 15, targetTrials, endless },
  trials: Array.from({ length: targetTrials }, (_, index) => ({ index })),
  summary: { trials: targetTrials, grips },
});

const pick = (session) => session.summary?.grips;

console.log("=== 通常5回の回に、5回で終わったエンドレスが混ざるか ===");
const history = [
  run({ id: "n1", targetTrials: 5, grips: 2, endless: false }),
  // エンドレスは1回失敗で終わるので、5回続いた回は grips 4。
  run({ id: "e1", targetTrials: 5, grips: 4, endless: true }),
];
const current = run({ id: "n2", targetTrials: 5, grips: 3, endless: false });
console.log(
  "  通常回のさいこう:",
  personalBest(history, { gameId: "crane", config: current.config, pick }),
  "（エンドレスを混ぜなければ 2 のはず）"
);

console.log("\n=== エンドレスどうしは、続いた回数が違っても比べたい ===");
const endlessHistory = [
  run({ id: "x1", targetTrials: 7, grips: 6, endless: true }),
  run({ id: "x2", targetTrials: 13, grips: 12, endless: true }),
];
const endlessCurrent = run({ id: "x3", targetTrials: 22, grips: 21, endless: true });
console.log(
  "  エンドレスのさいこう:",
  personalBest(endlessHistory, { gameId: "crane", config: endlessCurrent.config, pick }),
  "（12 と出てほしい。null なら、続いた回数ごとに束が割れて比較できていない）"
);
