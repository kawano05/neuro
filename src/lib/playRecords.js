// =====================================================================
// playRecords.js — 遊びの記録（家族向けの「がんばりの記録」の元。DOM に触れない純粋関数）
//
// 2026-10-21 の打ち合わせで、依頼元から「目に見えた成長の指標はあったほうがいい。
// お母さんたちからしても、これだけできるようになったというのが見えると励みになる」と
// 言われた（例に挙がったのは、野球にはまって、それ以外だとやる気を出さない利用者）。
//
// 研究の記録（state.sessions）とは分けて持つ。理由は2つ:
//   - はじめの遊び（いないいない ばあ・ふうせん わり・ぬりえ・ボールを打つ）は、研究の記録を
//     一度も残していない（taskType が無い）。野球のホームランの数は、どこにも残っていなかった。
//   - 研究の記録は全部の遊びで 50 回まで（MAX_SESSIONS）。遊びの記録を混ぜると、そくていの回が
//     押し出される。
// 1回遊び終わるごとに、小さな1件（どの遊び・いつ・できた数）を足す。途中でやめた回は数えない。
// 研究の記録ではないので、CSV には出さない。おおさわぎのごほうび（party.js）と同じ扱い。
// =====================================================================

/** 保持する件数の上限（古い順に捨てる）。1日10回遊んでも2か月ぶん。 */
export const MAX_PLAY_RECORDS = 600;

/** 1件の形。done/total は「できた数／回数」。数えない遊びは null。 */
const RECORD_KEYS = ["gameId", "participantId", "atIso", "day", "done", "total", "homeruns", "difficultyMode", "endless"];

/**
 * 遊び終わった1回ぶんの記録を作る。
 * @param {{gameId:string, participantId?:string, score?:{done:number,total:number}|null,
 *   summary?:object|null, difficultyMode?:string, endless?:boolean, at?:Date}} input
 */
export function playRecordFrom({ gameId, participantId = "", score = null, summary = null, difficultyMode = "practice", endless = false, at = new Date() }) {
  const homeruns = summary?.baseball?.homeruns;
  return {
    gameId: String(gameId || ""),
    participantId: String(participantId || ""),
    atIso: at.toISOString(),
    day: dayKey(at),
    done: score && Number.isFinite(score.done) ? score.done : null,
    total: score && Number.isFinite(score.total) ? score.total : null,
    homeruns: Number.isInteger(homeruns) ? homeruns : null,
    difficultyMode: difficultyMode === "measure" ? "measure" : "practice",
    endless: endless === true,
  };
}

/** その端末の日付（YYYY-MM-DD。party.js の localDayKey と同じ形）。 */
export function dayKey(date) {
  const pad = (v) => String(v).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 足して、上限を超えたぶんを古い順に捨てる（配列の先頭が古い）。 */
export function appendPlayRecord(records, record) {
  const list = Array.isArray(records) ? [...records, record] : [record];
  return list.length > MAX_PLAY_RECORDS ? list.slice(list.length - MAX_PLAY_RECORDS) : list;
}

/** 保存の正規化（state.js の sanitizeState から呼ぶ）。壊れた件は捨てる。 */
export function sanitizePlayRecords(candidate) {
  if (!Array.isArray(candidate)) return [];
  const count = (value) => (Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : null);
  const records = candidate
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const at = typeof item.atIso === "string" ? new Date(item.atIso) : null;
      if (!at || Number.isNaN(at.getTime())) return null;
      if (typeof item.gameId !== "string" || !/^[a-z0-9-]{1,40}$/.test(item.gameId)) return null;
      const done = count(item.done);
      const total = count(item.total);
      const record = {
        gameId: item.gameId,
        participantId: typeof item.participantId === "string" ? item.participantId.slice(0, 80) : "",
        atIso: at.toISOString(),
        day: typeof item.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.day) ? item.day : dayKey(at),
        // できた数は回数を超えない（超えていたら、どちらも分からないものとして捨てる）。
        done: done !== null && total !== null && done <= total ? done : null,
        total: done !== null && total !== null && done <= total ? total : null,
        homeruns: count(item.homeruns),
        difficultyMode: item.difficultyMode === "measure" ? "measure" : "practice",
        endless: item.endless === true,
      };
      return Object.fromEntries(RECORD_KEYS.map((key) => [key, record[key]]));
    })
    .filter(Boolean);
  return records.slice(-MAX_PLAY_RECORDS);
}

/** 1回の「成績」。野球はホームランの数（5本のうち）、ほかは できた数／回数。数えない遊びは null。 */
function scoreOf(record) {
  if (record.gameId === "baseball" && record.homeruns !== null) return { value: record.homeruns, of: 5 };
  if (record.done !== null && record.total > 0 && !record.endless) return { value: record.done, of: record.total };
  return null;
}

/**
 * 画面に出す形にまとめる。
 * @param {Array} records
 * @param {{participantId?:string, today?:Date, recent?:number}} [options]
 *   participantId … いまの参加者の記録だけにする（空なら全部。sessionTrend.js と同じ決まり）
 * @returns {{plays:number, days:number, daysThisWeek:number, playsThisWeek:number, week:Array<{day:string,plays:number}>,
 *   games:Array<{gameId:string, plays:number, days:number, lastIso:string, scored:boolean,
 *   first:{value:number,of:number}|null, latest:{value:number,of:number}|null, best:{value:number,of:number}|null,
 *   recent:Array<{value:number,of:number}|null>}>}}
 */
export function summarizePlayRecords(records, { participantId = "", today = new Date(), recent = 10 } = {}) {
  const mine = (Array.isArray(records) ? records : []).filter(
    (record) => !participantId || (record.participantId || "") === participantId
  );
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - index));
    return { day: dayKey(date), plays: 0 };
  });
  const weekIndex = new Map(week.map((entry, index) => [entry.day, index]));
  const byGame = new Map();
  mine.forEach((record) => {
    const at = weekIndex.get(record.day);
    if (at !== undefined) week[at].plays += 1;
    if (!byGame.has(record.gameId)) byGame.set(record.gameId, []);
    byGame.get(record.gameId).push(record);
  });
  const ratio = (score) => (score ? score.value / score.of : -1);
  const games = [...byGame.entries()].map(([gameId, list]) => {
    const scores = list.map(scoreOf);
    const scored = scores.filter(Boolean);
    const best = scored.reduce((top, score) => (!top || ratio(score) > ratio(top) ? score : top), null);
    return {
      gameId,
      plays: list.length,
      days: new Set(list.map((record) => record.day)).size,
      lastIso: list[list.length - 1].atIso,
      scored: scored.length > 0,
      first: scored[0] || null,
      latest: scored[scored.length - 1] || null,
      best,
      recent: scores.slice(-recent),
    };
  });
  // よく遊んだ遊びから（同じなら最近遊んだほうを先に）。
  games.sort((a, b) => b.plays - a.plays || (a.lastIso < b.lastIso ? 1 : -1));
  return {
    plays: mine.length,
    days: new Set(mine.map((record) => record.day)).size,
    daysThisWeek: week.filter((entry) => entry.plays > 0).length,
    playsThisWeek: week.reduce((sum, entry) => sum + entry.plays, 0),
    week,
    games,
  };
}
