// =====================================================================
// sessionTrend.js — 同じ課題の回を時系列で並べる（評価ログの推移）
//
// なぜ要るか: このアプリの目的のひとつは「訓練前後の比較（導入訓練の効果
// 測定）」（README）。ところが画面に出ていたのは1回ごとの記録だけで、
// 良くなっているのかどうかは、支援者が数字を目で追って比べるしかなかった。
// 回を並べて初めて「前より合うようになった」が読める。
//
// 条件が違う回を1本の線にしないこと自体が要件。テンポ・拍数・つかめる広さ・
// 画面の手がかりの有無——どれが違っても、同じ指標を並べた意味が変わる
// （手がかりありの回は聴覚だけへの同期ではないので、素の測定と混ぜられない）。
// なので「同じ課題・同じ条件」で束ねてから並べる。
//
// DOM に触れない純粋関数として置いてある。どの回を同じ束に入れるかの規則は、
// 画面を見ても壊れたことに気づけない（線は必ず引けてしまう）。
// =====================================================================

import { describeSessionConditions } from "./sessionConditions.js";
import { say } from "./supporterText.js";

/** 束ねるのに必要な最小の回数。1点では推移にならない。 */
export const MIN_SESSIONS_FOR_TREND = 2;

/**
 * 課題ごとの主要指標。basic-design.md §1.2 に合わせる。
 *
 * higherIsBetter を持たせているのは、上向きが良い指標と下向きが良い指標が
 * 混ざるから。矢印の向きを描画側で決め打ちすると、ばらつき（SD）のような
 * 「小さいほど良い」値で嘘の評価になる。
 */
const METRICS = {
  sms: {
    label: { ja: "ずれの ばらつき（SD）", en: "Timing spread (SD)" },
    unit: "ms",
    higherIsBetter: false,
    pick: (session) => session.summary?.sdRawOffsetMs,
  },
  gonogo: {
    label: { ja: "つい おした かず", en: "Presses by mistake" },
    unit: "",
    higherIsBetter: false,
    pick: (session) => session.summary?.commissions,
  },
  scan: {
    label: { ja: "とれた かず", en: "Prizes grabbed" },
    unit: "",
    higherIsBetter: true,
    pick: (session) => session.summary?.grips,
  },
  rt: {
    label: { ja: "へいきん はんのう", en: "Mean reaction time" },
    unit: "ms",
    higherIsBetter: false,
    pick: (session) => session.summary?.meanRtMs,
  },
  // リールは指標が無く、推移に一度も出ていなかった（2026-08-29に気づいた）。
  // 遊べて記録も残るのに、あそびごとのタブを作ると「データがありません」と
  // 出つづける——記録が無いのではなく、並べる指標が無かっただけ。
  //
  // 主要指標はずれの大きさ（中央値）。合った数（hits）ではなくずれを見るのは、
  // 合う幅（toleranceMs）を支援者が変えられるため——幅を広げれば合った数は
  // 増えるが、止める精度が上がったわけではない。ずれなら幅を変えても意味が
  // 変わらない。中央値にするのは、1回の大外し（手が滑った回）で平均が
  // 引きずられないようにするため。
  slot: {
    label: { ja: "ずれの 中央", en: "Median timing error" },
    unit: "ms",
    higherIsBetter: false,
    pick: (session) => session.summary?.medianAbsoluteErrorMs,
  },
};

/**
 * エンドレスの回の指標。
 *
 * 課題ごとの主要指標（scan なら「とれた かず」、rt なら「へいきん はんのう」）
 * は、エンドレスにそのまま当てられない。
 *
 *   scan … 1回失敗したら終わるので、とれた数はほぼ「続いた数 - 1」。
 *          5回中3回の回と並べると、上限の違う数字を同じ線に載せることになる。
 *   rt  … 続くほど受付時間が短くなる。遅い反応は時間切れになって平均から
 *          外れるので、**長く続いた回ほど平均反応時間が良く見える**。
 *          上達していなくても線が下がる、いちばん質の悪い偽の改善。
 *
 * どちらも「どこまで続けられたか」が測っているものなので、そこを並べる。
 * 難度の上がり方はコードに固定されていて回ごとに変わらないため、
 * エンドレスどうしなら同じ物差しになる。
 */
const ENDLESS_METRIC = {
  label: { ja: "つづいた かず", en: "How far the run went" },
  unit: "",
  higherIsBetter: true,
  pick: (session) => session.summary?.trials ?? session.trials?.length,
};

/** その回に当てる指標。エンドレスかどうかを先に見る。 */
function metricFor(session) {
  if (session?.config?.endless === true) {
    return METRICS[session.taskType] ? ENDLESS_METRIC : null;
  }
  return METRICS[session?.taskType] ?? null;
}

/**
 * 同じ束に入れてよい回かどうかを決めるキー。
 *
 * 課題（gameId）と、支援者が触れる条件（sessionConditions が1行に要約して
 * いるもの）が揃っている回だけを同じ線に載せる。条件の文字列をそのまま
 * キーに使うのは、画面に出ている条件表示と束ね方が必ず一致するため——
 * 別々に持つと、表示は同じなのに別の線になる（あるいはその逆）が起きる。
 */
export function trendKey(session) {
  return `${session.gameId}\u0000${describeSessionConditions(session)}`;
}

/**
 * 記録済みセッションを、課題×条件ごとの推移にまとめる。
 *
 * 中断した回は入れない。試行数が足りないぶん指標が偏るので、完走した回だけを
 * 並べる（crane の自己最高と同じ線引き。games/gameHost.js）。
 *
 * @returns {Array<{
 *   key:string, gameId:string, taskType:string, conditions:string,
 *   label:string, unit:string, higherIsBetter:boolean,
 *   points:Array<{value:number, startedAtIso:string}>,
 *   first:number, last:number, best:number,
 * }>}
 */
export function summariseSessionTrends(sessions, participantId = "", lang = "ja") {
  const groups = new Map();
  // 端末は1台を複数の参加者で共用する（来所ごとに同じiPadを使う）。
  // 参加者で絞らないと、別人の回が1本の線に載って「よくなっています」と
  // 出る——支援者にも、卒論の図にも、そのまま嘘が伝わる。
  //
  // 成立確認（readinessCheck.js の evaluateReadiness）は最初から絞って
  // いた。「別の人の記録で成立を判断すると、誰について確かめたのかが
  // 言えない記録になる」——推移も同じことなのに、ここだけ絞っていなかった
  // （2026-08-29に発見）。
  //
  // 参加者IDが空のときは絞らない。IDを使わない運用（1人しか使わない端末）
  // を壊さないため。
  const scoped = participantId
    ? (sessions || []).filter((session) => (session?.participantId || "") === participantId)
    : sessions;
  (scoped || []).forEach((session) => {
    const metric = metricFor(session);
    if (!metric) return;
    // いまの版で検証していない回（games/slotState.js の legacyVersion）は
    // 並べない。当時の判定規則で作られた値なので、現行版の回と同じ線に
    // 載せると、比べてはいけないものを比べることになる。記録としては
    // 残してあり、台帳とCSVからは取り出せる。
    if (session.legacyVersion === true) return;
    if (session.finished !== true || session.aborted !== false) return;
    const value = metric.pick(session);
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const key = trendKey(session);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        gameId: session.gameId,
        taskType: session.taskType,
        // 束ねる鍵（trendKey）は言語で変わらない。ここは画面に出す字なので、言語を渡す。
        conditions: describeSessionConditions(session, lang),
        label: say(metric.label, lang),
        unit: metric.unit,
        higherIsBetter: metric.higherIsBetter,
        points: [],
      });
    }
    groups.get(key).points.push({ value, startedAtIso: session.startedAtIso || "" });
  });

  return [...groups.values()]
    .filter((group) => group.points.length >= MIN_SESSIONS_FOR_TREND)
    .map((group) => {
      // 記録された順（古い順）に並べる。state.sessions は push 順なので
      // 既に古い順だが、保存や移行で崩れうるので日時で確定させる。
      const points = [...group.points].sort((a, b) =>
        a.startedAtIso < b.startedAtIso ? -1 : a.startedAtIso > b.startedAtIso ? 1 : 0
      );
      const values = points.map((point) => point.value);
      return {
        ...group,
        points,
        first: values[0],
        last: values.at(-1),
        best: group.higherIsBetter ? Math.max(...values) : Math.min(...values),
      };
    });
}

/**
 * 推移の束を、あそびごとにまとめる。
 *
 * なぜ要るか: 束ねる単位は「課題 × 条件」なので、条件を変えた回があると
 * 同じあそびの線が複数できる。それを一列に並べると、別のあそびの線と
 * 交互に出て、「このあそびはどうなっているか」を読むのに画面を往復する
 * ことになる。あそびで先に分けてから条件を並べれば、その往復が消える。
 *
 * 並び順は呼び出し側から渡す（`order`）。画面のタイル順と推移の順が
 * 食い違うと、支援者は同じものを2つの順番で覚えることになる。順番の正本は
 * content.js（あそびの並び）であって、ここではない——このファイルは
 * DOM も content も知らないままにしておく。
 *
 * あそびの中の並びは「最後に遊んだ回が新しい順」。いま使っている条件が
 * 上に来る。
 *
 * @param {Array<object>} groups summariseSessionTrends の戻り値
 * @param {Array<string>} [order] gameId の並び。ここに無いものは後ろへ回す
 * @returns {Array<{gameId:string, trends:Array<object>}>}
 */
export function groupTrendsByGame(groups, order = []) {
  const byGame = new Map();
  (groups || []).forEach((group) => {
    if (!group) return;
    if (!byGame.has(group.gameId)) byGame.set(group.gameId, []);
    byGame.get(group.gameId).push(group);
  });

  const lastPlayed = (group) => group.points.at(-1)?.startedAtIso ?? "";
  const rank = (gameId) => {
    const index = order.indexOf(gameId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return [...byGame.entries()]
    .map(([gameId, trends]) => ({
      gameId,
      trends: [...trends].sort((a, b) => (lastPlayed(a) < lastPlayed(b) ? 1 : -1)),
    }))
    .sort((a, b) => {
      const byOrder = rank(a.gameId) - rank(b.gameId);
      if (byOrder !== 0) return byOrder;
      // 並びに無いあそびどうしは、最後に遊んだ回が新しい順。
      return lastPlayed(a.trends[0]) < lastPlayed(b.trends[0]) ? 1 : -1;
    });
}

/**
 * 最初の回と最後の回を比べて、良くなったか。
 *
 * 「変わらない」を返せることが要る。1msの差を「良くなった」と言うと、
 * 支援者がその差を実在の変化として読んでしまう。指標ごとの意味のある差は
 * 決められないので、ここでは同値のときだけ "same" にして、あとは向きだけを
 * 返す——解釈するのは支援者、という全体の方針に合わせる。
 */
export function trendDirection(group) {
  if (!group || group.first === group.last) return "same";
  const improved = group.higherIsBetter ? group.last > group.first : group.last < group.first;
  return improved ? "better" : "worse";
}
