// =====================================================================
// games/results.js — けっかの画面の組み立て（遊びごとの renderer と、一言と星）
//
// もとは games/gameHost.js の中にあった（ゲームの起動・入力・終了の処理と、
// けっかの HTML の組み立てが1つのファイルに混ざり、1000行を超えていた）。
// 技術負債の返済として分けた（docs/overall-design-2026-09-28.md §6.1）。
// 一言と星は雰囲気によらず同じ評価を描き、お祝いはその下へ添える。
// 星が飛び込む動きは fx/fxPresets.js の revealResult（gameHost が最初の1回だけ呼ぶ）。
// =====================================================================

import { displayOffsetMs } from "./rhythm.js";
import { PRIZE_ART } from "./craneArt.js";
import { slotSymbolHtml } from "./slotArt.js";
import { POP_ANIMALS, artSvg, burstSvg } from "../art/hakkiriArt.js";
import { otterSvg, outfitClasses } from "../art/partyArt.js";
import { fullJarHtml, todayJarsHtml } from "./partyStage.js";

/** 符号付きms表記（"+62ms" 等）。値が無ければ "--"。 */
export function formatSignedMs(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}ms`;
}

/**
 * P4-3（detailed-design.md §8.2）: キャリブレーション結果から候補となる
 * baselineOffsetMs（有効試行 hit の生オフセットの中央値、四捨五入）を取り出す。
 * summary が無い、または medianRawOffsetMs が数値でない（hit が0件）場合は null。
 */
export function candidateBaselineMsFromSummary(summary) {
  if (!summary || typeof summary.medianRawOffsetMs !== "number") return null;
  return Math.round(summary.medianRawOffsetMs);
}

/** オフセットの符号を「はやめ/おそめ」に言い換える（detailed-design.md §2.5・§5.2規則4）。 */
function offsetDirectionLabel(value, t) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  if (value < 0) return t("result.early");
  if (value > 0) return t("result.late");
  return t("result.exact");
}

/**
 * その回のずれを、1枚の帯にまとめて描く（事後のKR）。
 *
 * 通常練習は settings.visualGuidance 既定ONでノートレーンを出し、measure /
 * calibration は強制OFFで未来ノートなしの計器盤を出す。ただし、
 * **終わったあとのまとめはどちらの版面でも出す**。理由は2つ。
 *
 *  1. 測定として安全。セッションはもう終わっているので、ここで何を見せても
 *     その回の入力は変わらない。毎試行のKRが問題になるのは、次の試行を
 *     補正させてしまうからで、事後のまとめにはその経路が無い。
 *     運動学習の側から見ても、毎試行より要約のほうが望ましいとされる
 *     （guidance hypothesis）。
 *  2. これが無いと、予告なし計器盤で遊んだ回は「たっせいりつ 70%」以外に
 *     何も残らない。研究の中核である入力時刻のずれを、当のアプリが一度も
 *     見せないことになる。
 *
 * 位置は判定窓（±effectiveWindowMs）を幅いっぱいに写したもので、両版面の
 * 事後目盛りと同じ読み方。値は displayOffsetMs（基準補正後）を使う——記録の
 * rawOffsetMs とは別物であることを、見出しでも書き分けている。
 */
function renderOffsetSpread(trials, config, t) {
  const windowMs = typeof config?.effectiveWindowMs === "number" ? config.effectiveWindowMs : 0;
  if (!windowMs || !Array.isArray(trials)) return "";
  const offsets = trials
    .filter((trial) => !trial.excluded && trial.judgment === "hit")
    .map((trial) => displayOffsetMs(trial.rawOffsetMs, trial.appliedBaselineMs))
    .filter((value) => typeof value === "number");
  if (!offsets.length) return "";

  const ratio = (value) => ((Math.max(-1, Math.min(1, value / windowMs)) + 1) / 2) * 100;
  const marks = offsets
    .map((value) => {
      const tone = value < -30 ? "is-early" : value > 30 ? "is-late" : "is-exact";
      return `<span class="spread-mark ${tone}" style="left:${ratio(value).toFixed(2)}%"></span>`;
    })
    .join("");
  const mean = offsets.reduce((sum, value) => sum + value, 0) / offsets.length;

  return `
    <div class="offset-spread">
      <span class="metric-label">${t("result.spread", { n: offsets.length })}</span>
      <div class="spread-track">
        <span class="spread-centre"></span>
        ${marks}
        <span class="spread-mean" style="left:${ratio(mean).toFixed(2)}%"></span>
      </div>
      <div class="spread-legend">
        <span>${t("scale.early")}</span>
        <span>${t("scale.onTime")}</span>
        <span>${t("scale.late")}</span>
      </div>
    </div>
  `;
}

/** 同期課題のリザルト。 */
function renderSmsResult(summary, context = {}) {
  const t = context.t;
  const totalGoBeats = summary.hits + summary.misses;
  const hitRatePercent = totalGoBeats ? Math.round((summary.hits / totalGoBeats) * 100) : 0;
  const sdLabel = typeof summary.sdRawOffsetMs === "number" ? `${Math.round(summary.sdRawOffsetMs)}ms` : "--";
  return `
    ${renderOffsetSpread(context.trials, context.config, t)}
    <div class="summary-grid">
      <div class="summary-tile">
        <span class="metric-label">${t("result.hitRate")}</span>
        <strong>${hitRatePercent}% <small>(${summary.hits}/${totalGoBeats})</small></strong>
      </div>
      <div class="summary-tile">
        <!--
          この数字は生値（rawOffsetMs）の平均で、上の帯は基準補正後の位置。
          基準オフセットが 0 でない利用者では両者がずれるので、見出しで
          どちらの量かを書き分ける。同じ「オフセット」で通すと、画面の帯と
          この数字とCSVが食い違って見える。
        -->
        <span class="metric-label">${t("result.meanOffset")}</span>
        <strong>${formatSignedMs(summary.meanRawOffsetMs)}</strong>
        <p>${offsetDirectionLabel(summary.meanRawOffsetMs, t)}</p>
      </div>
      <div class="summary-tile">
        <span class="metric-label">${t("result.sd")}</span>
        <strong>${sdLabel}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">${t("result.extras")}</span>
        <strong>${summary.extras}</strong>
      </div>
    </div>
  `;
}

function renderGonogoResult(summary, context = {}) {
  const t = context.t;
  const goTrials = summary.hits + summary.misses;
  const nogoTrials = summary.commissions + summary.correctRejections;
  const hitRate = goTrials ? Math.round((summary.hits / goTrials) * 100) : 0;
  const commissionRate = nogoTrials
    ? Math.round((summary.commissions / nogoTrials) * 100)
    : 0;
  return `
    <div class="summary-grid">
      <div class="summary-tile"><span class="metric-label">${t("result.gonogo.goHit")}</span><strong>${hitRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.gonogo.commission")}</span><strong>${commissionRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.gonogo.missed")}</span><strong>${summary.misses}</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.gonogo.extras")}</span><strong>${summary.extras}</strong></div>
    </div>
  `;
}

/**
 * 走査課題のリザルト。
 *
 * 以前は4枠のうち2枠が「へいきん きょり」「ちゅうおう きょり」という同じ量の
 * 統計違いで、しかも単位が％——利用者に読める情報がひとつも無かった。
 * 先頭を「いくつ取れたか」にして、狙いのずれは1枠に絞る。
 * bestStreak は state.js の scan スキーマ外なので、永続化された session を
 * 描くときは出ない（games/crane.js の computeSummary のコメント参照）。
 */
/**
 * 同じ難度で完走した過去セッションのうち、いちばん良かった値を返す。
 *
 * なぜ「前回」ではなく「これまでの最高」か: 前回と比べると、体調で下がった
 * 日に「まえより すくない」と突きつけることになる。訓練の課題でそれをやる
 * 理由がない。最高記録なら常に目標として働き、負の比較が出ない。
 *
 * なぜ条件で絞るか: 支援者が つかめる広さ・アームの速さ・1回のかいすう を
 * 変えられる（settings の craneToleranceR / craneSweepMs / craneTargetTrials）。
 * とくに かいすう は取れる数の上限そのものなので、5回の回と9回の回を並べると
 * 比較にならない。同じ条件の回だけを見る。
 *
 * 中断した回は試行数が足りず不利なので、完走した回だけを対象にする。
 */
export function personalBest(sessions, { gameId, config, pick, participantId = "" }) {
  // エンドレスは別の束。決まった回数の回とは、上限も終わり方も違う
  // （1回失敗で終わるので、取れた数はほぼ「続いた数 - 1」になる）。
  //
  // 実測で2つ壊れていた（2026-08-28）:
  //   1. 5回で終わったエンドレス（4こ）が、5回設定の通常回の最高として
  //      出ていた。通常回で5こ取るのと、5回目で失敗するまでに4こ取るのは
  //      別のことなので、越えられない目標が出つづける。
  //   2. エンドレスどうしは、続いた回数（＝終了時に書き戻す targetTrials）が
  //      違うだけで別の束になり、いつまでも比較対象なし（null）だった。
  //      いちばん比べたい回どうしが比べられていない。
  //
  // エンドレスは難度の上がり方がコードに固定されていて回ごとに変わらないので、
  // 続いた回数が違っても同じ物差しで比べられる——だから束ねる条件から
  // targetTrials を外す。
  const endless = config?.endless === true;
  const sameSetup = (sessions || []).filter((session) => {
    if (session.gameId !== gameId) return false;
    // 別の参加者の記録を目標として出さない。共用端末では、他の子が出した
    // 記録が「これまでの さいこう」として本人に提示されていた
    // （2026-08-29に発見）。IDが空のときは絞らない（1人しか使わない端末）。
    if (participantId && (session.participantId || "") !== participantId) return false;
    if (session.finished !== true || session.aborted !== false) return false;
    if ((session.config?.endless === true) !== endless) return false;
    if (endless) return true;
    return (
      session.config?.toleranceR === config?.toleranceR &&
      session.config?.sweepMs === config?.sweepMs &&
      session.config?.targetTrials === config?.targetTrials
    );
  });
  const values = sameSetup.map(pick).filter((value) => typeof value === "number");
  return values.length ? Math.max(...values) : null;
}

/**
 * 自己最高の行を出すかどうか、出すなら何と出すか。
 *
 * 実際に遊んで分かったこと: 0こしか取れていない段階で「これまでの さいこう
 * 0こ」と出ると、目標にもならず失敗を復唱するだけになる。記録として意味を
 * 持つのは1こ以上からなので、0のときは何も出さない。
 *
 * ただし 0 → 1 は本人にとって最初の成功なので、そこは祝う。
 * 下回った回に「まえより すくない」は出さない（personalBest 参照）。
 *
 * @param {number} grips いま取れた数
 * @param {number|null} best 同条件での過去最高（比較対象が無ければ null）
 * @param {(key: string, values?: object) => string} t 文言（表記モードで変わるので
 *   定数にできない。ここへ渡すのはプレーン文を返すほう——戻り値の text は
 *   textContent へ入る）
 * @returns {{text:string, isNew:boolean}|null} null なら何も出さない
 */
export function bestRecordLine(grips, best, t) {
  if (typeof grips !== "number") return null;
  if (typeof best !== "number") return null;
  if (grips > best && grips > 0) return { text: t("best.new"), isNew: true };
  if (best > 0) return { text: t("best.previous", { n: best }), isNew: false };
  return null;
}

/**
 * @param {object} summary  いま終わったセッションの集計
 * @param {object} [context] { best } 同条件での自己最高。無ければ null
 */
function renderScanResult(summary, context = {}) {
  const t = context.t;
  const distance =
    typeof summary.meanDistance === "number" ? summary.meanDistance.toFixed(1) : "--";
  const streakTile =
    typeof summary.bestStreak === "number"
      ? `<div class="summary-tile"><span class="metric-label">${t("result.bestStreak")}</span><strong>${summary.bestStreak}</strong></div>`
      : "";
  // 取れた景品を並べる。数だけより「なにが取れたか」が見えるほうが、
  // もう一度やる理由になる。永続化された session を描くときは collected が
  // 無いので出ない（summary の遊び用フィールドは scan スキーマ外）。
  const prizeRow = Array.isArray(summary.collected) && summary.collected.length
    ? `<div class="summary-prizes" role="img" aria-label="${context.tPlain("result.scan.prizes", { n: summary.collected.length })}">${summary.collected
        .map((prize) => `<img src="${PRIZE_ART[prize.asset]}" alt="" />`)
        .join("")}</div>`
    : "";
  // 続ける理由が画面に無かった。1回ぶんの結果しか出ないので、良くなって
  // いるのかどうかが利用者に分からない。同条件の自己最高だけを出す
  // （下がった回に「まえより すくない」とは言わない。personalBest 参照）。
  const record = bestRecordLine(summary.grips, context.best, context.tPlain ?? context.t);
  const bestLine = record
    ? `<p class="summary-best${record.isNew ? " is-new" : ""}">${record.text}</p>`
    : "";
  return `
    <div class="summary-grid">
      <div class="summary-tile is-headline">
        <span class="metric-label">${t("result.scan.caught")}</span>
        <strong>${summary.grips}<small>${t("result.scan.pieces")}</small></strong>
        <p>${t("result.scan.outOf", { n: summary.trials })}</p>
        ${bestLine}
        ${prizeRow}
      </div>
      <div class="summary-tile"><span class="metric-label">${t("result.scan.slips")}</span><strong>${summary.slips}</strong></div>
      ${streakTile}
      <div class="summary-tile"><span class="metric-label">${t("result.scan.distance")}</span><strong>${distance}%</strong></div>
    </div>
  `;
}

function renderReactionResult(summary, context = {}) {
  const t = context.t;
  const hitRate = Math.round((summary.hitRate || 0) * 100);
  const commissionRate = Math.round((summary.commissionRate || 0) * 100);
  const meanRt =
    typeof summary.meanRtMs === "number" ? `${Math.round(summary.meanRtMs)}ms` : "--";

  // 釣果（さかなつりの遊びの手応え）。state.js の rt スキーマには無い値なので
  // 永続化された session からは復元されない。ここに来る summary は
  // ctx.finish() でゲームから直接渡されたものなので、その回だけ表示できる
  // （games/fishing.js 冒頭のコメント参照）。
  const catchTiles =
    typeof summary.scoreCm === "number"
      ? `
      <div class="summary-tile is-headline">
        <span class="metric-label">${t("result.rt.score")}</span>
        <strong>${summary.scoreCm}<small>cm</small></strong>
        <p>${t("result.rt.catchSummary", { n: summary.catches ?? 0, cm: summary.totalLengthCm ?? 0 })}</p>
      </div>
      <div class="summary-tile">
        <span class="metric-label">${t("result.rt.longest")}</span>
        <strong>${typeof summary.longestCm === "number" ? `${summary.longestCm}cm` : "--"}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">${t("result.bestStreak")}</span>
        <strong>${summary.bestStreak ?? 0}</strong>
      </div>
      <div class="summary-tile">
        <span class="metric-label">${t("result.rt.fastCatch")}</span>
        <strong>${summary.speedBonuses ?? 0}</strong>
      </div>`
      : "";

  return `
    <div class="summary-grid">
      ${catchTiles}
      <div class="summary-tile"><span class="metric-label">${t("result.rt.caughtRate")}</span><strong>${hitRate}%</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.rt.meanRt")}</span><strong>${meanRt}</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.rt.falseStarts")}</span><strong>${summary.falseStarts}</strong></div>
      <div class="summary-tile"><span class="metric-label">${t("result.rt.commission")}</span><strong>${commissionRate}%</strong></div>
    </div>
  `;
}

/**
 * 正誤のない「できた」型ゲームの軽量リザルト（おすと でてくる）。研究taskTypeとは分離する。
 *
 * 出てきた動物を並べる。数だけより「だれに会えたか」が見えるほうが、
 * もう一度やる理由になる（docs/design-renewal-2026-09-25.md §1.6）。
 * デザイン案ではメダルを置いていたが、星にした（同 §3.4）。
 */
/** けっかに並べる野球のボール（ボールを打つ遊び）。 */
const BALL_ICON_SVG =
  '<svg class="hk-ball" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="17" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="3"></circle><path d="M12 7 Q 21 20 12 33 M28 7 Q 19 20 28 33" fill="none" stroke="#E0302D" stroke-width="2.6"></path></svg>';

function renderCompletionResult(summary, context = {}) {
  const t = context.t;
  const presses = Number.isFinite(summary?.presses) ? Math.max(0, Math.round(summary.presses)) : 0;
  // 何が起きたかを並べる。遊びによって並べるものが違う:
  //   おすと でてくる … 出てきた動物 / ふうせん わり … 割ったふうせん（はじけた形）
  //   ぬりえ … できあがった絵を大きく1枚
  let items = "";
  let summaryText = "";
  if (Array.isArray(summary?.baseball?.results)) {
    // ボールを打つ遊び: 打った5本を並べる。ホームランは星、ヒットは白い球、
    // ころころは小さい球。
    items = summary.baseball.results
      .map((result) => `<span class="hk-result-item is-ball is-${result}">${result === "homerun" ? burstSvg("#FFC83D") : BALL_ICON_SVG}</span>`)
      .join("");
    summaryText = t("result.baseball.summary", {
      h: summary.baseball.homeruns ?? 0,
      k: summary.baseball.hits ?? 0,
    });
  } else if (Array.isArray(summary?.balloons)) {
    items = summary.balloons
      .map((color) => `<span class="hk-result-item is-burst">${burstSvg(color)}</span>`)
      .join("");
    summaryText = t("result.balloon.summary", { n: summary.balloons.length });
  } else if (typeof summary?.picture === "string") {
    const picture = POP_ANIMALS.find((animal) => animal.id === summary.picture);
    if (picture) {
      items = `<span class="hk-result-picture" data-picture="${picture.id}">${artSvg(picture)}</span>`;
      summaryText = t("result.coloring.summary", { name: t(`animal.${picture.id}`) });
    }
  } else {
    const animals = (Array.isArray(summary?.animals) ? summary.animals : [])
      .map((id) => POP_ANIMALS.find((animal) => animal.id === id))
      .filter(Boolean);
    items = animals
      .map((animal) => `<span class="hk-result-item" data-animal="${animal.id}">${artSvg(animal)}</span>`)
      .join("");
    summaryText = t("result.completion.summary", { n: presses, m: animals.length });
  }

  // 押すと出てくるの既存のおおさわぎだけは、元のけっかを保つ。
  if (summary?.party?.level === "big" && context.gameId === "color-legacy") {
    return renderLegacyPartyResult(summary.party, items, summaryText, context);
  }

  const primary = `
    <div class="hk-result completion-result">
      <div class="hk-result-items" aria-hidden="true">
        <span class="hk-result-medal"><i class="fa-solid fa-star"></i></span>
        ${items}
      </div>
      <strong class="hk-result-title completion-result-title">${t("result.completion.title")}</strong>
      <p class="hk-result-summary completion-result-summary">${summaryText}</p>
    </div>
  `;
  return renderPartyResult(summary?.party, primary, context);
}

/** 評価は通常の描画をそのまま使い、びんや服で一言・星・点数を置き換えない。 */
export function renderPartyResult(party, primary, context = {}) {
  if (!party) return primary;
  return `
    <div class="party-result is-added" data-level="${party.level || "big"}" data-stars="${party.stars ?? 15}">
      ${primary}
      ${renderPartyCompanions(party, context)}
    </div>
  `;
}

/** 仲間とびんは評価の脇役。にぎやかはその回のびん、おおさわぎは服と今日のびんも。 */
function renderPartyCompanions(party, context) {
  const t = context.t;
  const stars = Number.isFinite(party.stars) ? party.stars : 15;
  const reward = party.unlocked
    ? t("party.result.reward", { item: t(`party.outfit.${party.unlocked}`) })
    : t("party.result.rewardDone");
  return `
      <div class="party-result-main">
        <span class="party-result-otter is-cheering ${party.level === "normal" ? "" : outfitClasses(party.outfits)}" aria-hidden="true">${otterSvg()}</span>
        ${fullJarHtml(stars)}
        ${party.level === "normal" ? "" : `<div class="party-result-side">
          <span class="party-result-label">${t("party.result.today")}</span>
          <span class="party-today" aria-hidden="true">${todayJarsHtml(party.jarsToday)}</span>
          <span class="party-result-reward">${reward}</span>
        </div>`}
      </div>
  `;
}

/** 押すと出てくるのおおさわぎは、動物・びん・服の既存の版面を保つ。 */
function renderLegacyPartyResult(party, items, summaryText, context) {
  return `
    <div class="hk-result completion-result party-result" data-level="${party.level || "big"}" data-stars="${party.stars ?? 15}">
      ${renderPartyCompanions(party, context)}
      <div class="hk-result-items" aria-hidden="true">${items}</div>
      <p class="hk-result-summary completion-result-summary">${summaryText}</p>
    </div>
  `;
}

/**
 * 点のある遊びの、利用者向けの一言（docs/design-renewal-2026-09-25.md §1.6）。
 *
 * 「最小限の情報で、点数と一言」と言われた。一言は前向きなものだけ——
 * いちばん低い段でも「がんばったね！」で、星も必ず1つは付く。へこませず、
 * あっさり次へ行けるように（同 §1.5）。
 *
 * 数え方は各遊びの「成功」の定義に合わせる（連続記録と同じ数え方）:
 *   slot   … 合った本数 / 止めた本数
 *   scan   … 取れた数 / 回数（crane）
 *   rt     … 釣れた＋長靴を見送れた / 回数（fishing。見送れたのも成功）
 *   gonogo … 押せた＋見送れた / 拍の数
 *   sms    … 合った拍 / 押すべき拍
 * @returns {{done:number,total:number}|null}
 */
export function resultScore(rendererType, summary) {
  if (!summary) return null;
  const n = (value) => (Number.isFinite(value) ? value : 0);
  switch (rendererType) {
    case "slot":
      return { done: n(summary.hits), total: n(summary.trials) };
    case "scan":
      return { done: n(summary.grips), total: n(summary.trials) };
    case "rt":
      return { done: n(summary.hits) + n(summary.correctRejections), total: n(summary.trials) };
    case "gonogo":
      return {
        done: n(summary.hits) + n(summary.correctRejections),
        total: n(summary.hits) + n(summary.misses) + n(summary.commissions) + n(summary.correctRejections),
      };
    case "sms":
      return { done: n(summary.hits), total: n(summary.hits) + n(summary.misses) };
    default:
      return null;
  }
}

/** 割合から一言と星の数を決める。どの段も前向きな言葉にする。 */
export function praiseFor(done, total) {
  const ratio = total > 0 ? done / total : 0;
  if (ratio >= 0.8) return { key: "result.praise.great", stars: 3 };
  if (ratio >= 0.5) return { key: "result.praise.good", stars: 2 };
  return { key: "result.praise.tried", stars: 1 };
}

export function renderPraise(score, context, extraHtml = "") {
  const t = context.t;
  const praise = praiseFor(score.done, score.total);
  const stars = [1, 2, 3]
    .map((index) => `<i class="fa-solid fa-star hk-star${index <= praise.stars ? "" : " is-off"}"></i>`)
    .join("");
  return `
    <div class="hk-result" data-praise="${praise.key}">
      <div class="hk-stars" aria-hidden="true">${stars}</div>
      ${extraHtml}
      <strong class="hk-result-title">${t(praise.key)}</strong>
      <p class="hk-result-summary">${t("result.score", { n: score.done, total: score.total })}</p>
    </div>
  `;
}

/** slot-v1 の利用者向け結果。失敗数を主見出しにせず、成功とずれの要約を示す。 */
function renderSlotResult(summary, context = {}) {
  const t = context.t;
  const tPlain = context.tPlain || context.t;
  const total = Number.isFinite(summary?.trials) ? summary.trials : 0;
  const hits = Number.isFinite(summary?.hits) ? summary.hits : 0;
  const hitRate = total ? Math.round((hits / total) * 100) : 0;
  const medianError = Number.isFinite(summary?.medianAbsoluteErrorMs)
    ? `${Math.round(summary.medianAbsoluteErrorMs)}ms`
    : "--";
  const meanError = formatSignedMs(summary?.meanSignedErrorMs);
  const lastRound = Array.isArray(summary?.lastRoundSymbols) && summary.lastRoundSymbols.length
    ? `<div class="slot-result-symbols" role="img" aria-label="${tPlain("result.slot.lastRound")}">${summary.lastRoundSymbols
        .map((symbolId) => slotSymbolHtml(symbolId))
        .join("")}</div>`
    : "";

  return `
    <div class="slot-result">
      <strong class="slot-result-title">${t("result.slot.title")}</strong>
      ${lastRound}
      <div class="summary-grid">
        <div class="summary-tile is-headline"><span class="metric-label">${t("result.slot.hitRate")}</span><strong>${hitRate}% <small>(${hits}/${total})</small></strong></div>
        <div class="summary-tile"><span class="metric-label">${t("result.slot.medianError")}</span><strong>${medianError}</strong></div>
        <div class="summary-tile"><span class="metric-label">${t("result.slot.meanError")}</span><strong>${meanError}</strong></div>
        <div class="summary-tile"><span class="metric-label">${t("result.slot.timeouts")}</span><strong>${summary?.timeoutCount || 0}</strong></div>
        <div class="summary-tile"><span class="metric-label">${t("result.slot.extras")}</span><strong>${summary?.extraInputCount || 0}</strong></div>
      </div>
    </div>
  `;
}
export const resultRenderers = {
  completion: renderCompletionResult,
  sms: renderSmsResult,
  gonogo: renderGonogoResult,
  scan: renderScanResult,
  slot: renderSlotResult,
  rt: renderReactionResult,
};
