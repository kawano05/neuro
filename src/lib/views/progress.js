// =====================================================================
// views/progress.js — がんばりの記録（家族向けの成長の記録）
//
// 2026-10-21 の打ち合わせで、依頼元から「目に見えた成長の指標はあったほうがいい。
// お母さんたちからしても、これだけできるようになったというのが見えると励みになる」と
// 言われ、ユーザーが「家族向けの記録画面」を選んだ（けっかの画面には出さない）。
//
// 評価ログ（研究の記録、views/log.js）とは別の画面・別の記録（state.playRecords。
// src/lib/playRecords.js）。全部の遊びを出す: はじめの遊び（ボールを打つ など）は研究の
// 記録を残さないので、評価ログの推移には出てこない。
//
// 説明の文や補足の札は置かない。並びと形で分からせる（2026-10-23、ユーザーの指摘「不要な
// セカンダリラベルや説明を避ける。レイアウトに説明させる」）:
//   - 上の段は、この7日。曜日の下に棒、棒の上にその日の回数。今日がいちばん右。
//   - 遊びごとに1枚。名前と回数。成績のある遊びは、最近の回を左から古い順に棒で並べ、
//     棒の上に その回の数（野球はホームランの数）。棒の高さの上限は満点（5本・全部の回）。
// 走査では回さない（data-scan を付けない）。家族がタップで見る画面。
// =====================================================================

import { gameModules } from "../games/registry.js";
import { summarizePlayRecords } from "../playRecords.js";
import { say, supporterLang } from "../supporterText.js";
import { escapeHtml } from "../utils.js";

export function initProgress(ctx) {
  const { state, elements } = ctx;

  /** 遊びの名前（評価ログの trendGameTitle と同じ引き方）。 */
  function gameTitle(gameId) {
    const fromTile = gameModules.find((game) => game.id === gameId)?.title;
    const key = `tile.${gameId}.title`;
    const translated = ctx.t(key);
    if (translated !== key) return translated;
    return fromTile || gameId;
  }

  const times = (n, lang) => say({ ja: `${n}回`, en: `${n}` }, lang);

  /**
   * 棒の列。高さは value / of。遊んだ回の成績は 0 でも細い棒を残す（minPercent。「遊んだ」が
   * 見えるように）。この7日の棒は、遊ばなかった日は棒を出さない。
   */
  function bars(items, { label = (item) => item.value, minPercent = 4 } = {}) {
    return `<ol class="progress-bars">${items
      .map((item) => {
        const ratio = item.of > 0 ? item.value / item.of : 0;
        const height = item.value > 0 ? Math.max(minPercent, Math.round(ratio * 100)) : minPercent;
        return `<li class="${item.className || ""}"><b>${escapeHtml(String(label(item)))}</b><span style="--h:${height}%"></span>${
          item.caption ? `<small>${escapeHtml(item.caption)}</small>` : ""
        }</li>`;
      })
      .join("")}</ol>`;
  }

  function gameCard(game, lang) {
    const recent = game.recent.filter(Boolean);
    return `
      <article class="progress-card" data-game-id="${escapeHtml(game.gameId)}">
        <header class="progress-head"><strong>${escapeHtml(gameTitle(game.gameId))}</strong><span>${escapeHtml(times(game.plays, lang))}</span></header>
        ${recent.length ? bars(recent) : ""}
      </article>
    `;
  }

  function render() {
    if (!elements.progressGames) return;
    const lang = supporterLang(state.settings);
    const summary = summarizePlayRecords(state.playRecords, {
      participantId: state.evaluation?.participantId || "",
    });

    const locale = lang === "en" ? "en-US" : "ja-JP";
    const peak = Math.max(1, ...summary.week.map((entry) => entry.plays));
    elements.progressWeek.innerHTML = bars(
      summary.week.map((entry, index) => {
        const [y, m, d] = entry.day.split("-").map(Number);
        return {
          value: entry.plays,
          of: peak,
          caption: new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short" }),
          className: index === summary.week.length - 1 ? "is-today" : "",
        };
      }),
      { minPercent: 0 }
    );

    elements.progressGames.innerHTML = summary.games.length
      ? summary.games.map((game) => gameCard(game, lang)).join("")
      : `<p class="empty-state">${escapeHtml(say({ ja: "まだ記録がありません", en: "No records yet" }, lang))}</p>`;
  }

  return { render };
}
