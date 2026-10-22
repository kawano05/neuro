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
// 言葉は前向きなものだけにする。下がったことは言わない（けっかの一言と同じ考え。
// docs/design-renewal-2026-09-25.md §1.5）。比べるのは「はじめ」と「さいきん」と「いちばん」。
// 支援者の画面なので、表記は漢字かな混じり（ひらがなの分かち書きは本人の画面だけ）。
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

  function scoreText(gameId, score, lang) {
    if (!score) return "—";
    if (gameId === "baseball") return say({ ja: `${score.value}本`, en: `${score.value}` }, lang);
    return `${score.value} / ${score.of}`;
  }

  /** 直近の回の成績を、棒で並べる（左が古い）。数えない回は低い灰色の棒。 */
  function recentBars(recent) {
    const width = 18;
    const gap = 6;
    const height = 56;
    const bars = recent
      .map((score, index) => {
        const ratio = score ? Math.max(0.06, score.value / score.of) : 0.06;
        const h = Math.round(height * ratio);
        const x = index * (width + gap);
        return `<rect x="${x}" y="${height - h}" width="${width}" height="${h}" rx="4" class="${score ? "is-score" : "is-none"}"></rect>`;
      })
      .join("");
    const total = recent.length * (width + gap) - gap;
    return `<svg class="progress-bars" viewBox="0 0 ${Math.max(total, 1)} ${height}" width="${Math.max(total, 1)}" height="${height}" aria-hidden="true" focusable="false">${bars}</svg>`;
  }

  function gameCard(game, lang) {
    const title = escapeHtml(gameTitle(game.gameId));
    const played = say({ ja: `${game.plays}回（${game.days}日）`, en: `${game.plays} plays (${game.days} days)` }, lang);
    const ratio = (score) => (score ? score.value / score.of : 0);
    let body;
    if (game.scored) {
      const metric =
        game.gameId === "baseball"
          ? say({ ja: "ホームラン（5本のうち）", en: "Home runs (out of 5)" }, lang)
          : say({ ja: "できた数", en: "Successes" }, lang);
      // 上がっていれば言う。同じ・下がったときは、続けていることだけを言う（下がったとは言わない）。
      const grew = game.first && game.latest && ratio(game.latest) > ratio(game.first);
      const message = grew
        ? say({ ja: "はじめより、できるようになっています", en: "Doing better than at the start" }, lang)
        : say({ ja: "続けて遊んでいます", en: "Keeps on playing" }, lang);
      body = `
        <p class="progress-metric">${escapeHtml(metric)}</p>
        <dl class="progress-values">
          <div><dt>${escapeHtml(say({ ja: "はじめ", en: "First" }, lang))}</dt><dd>${escapeHtml(scoreText(game.gameId, game.first, lang))}</dd></div>
          <div><dt>${escapeHtml(say({ ja: "さいきん", en: "Latest" }, lang))}</dt><dd>${escapeHtml(scoreText(game.gameId, game.latest, lang))}</dd></div>
          <div><dt>${escapeHtml(say({ ja: "いちばん", en: "Best" }, lang))}</dt><dd>${escapeHtml(scoreText(game.gameId, game.best, lang))}</dd></div>
        </dl>
        <div class="progress-chart">
          ${recentBars(game.recent)}
          <span class="progress-chart-label">${escapeHtml(say({ ja: `最近の${game.recent.length}回`, en: `Last ${game.recent.length} plays` }, lang))}</span>
        </div>
        <p class="progress-message${grew ? " is-better" : ""}">${escapeHtml(message)}</p>
      `;
    } else {
      body = `<p class="progress-message">${escapeHtml(
        say({ ja: `最後まで遊べた回数 ${game.plays}回`, en: `Played to the end ${game.plays} times` }, lang)
      )}</p>`;
    }
    return `
      <article class="progress-card" data-game-id="${escapeHtml(game.gameId)}">
        <header class="progress-head"><strong>${title}</strong><small>${escapeHtml(played)}</small></header>
        ${body}
      </article>
    `;
  }

  function render() {
    if (!elements.progressGames) return;
    const lang = supporterLang(state.settings);
    const participantId = state.evaluation?.participantId || "";
    const summary = summarizePlayRecords(state.playRecords, { participantId });

    elements.progressNote.textContent = say(
      participantId
        ? {
            ja: `参加者「${participantId}」の記録です。この端末で、最後まで遊んだ回を数えます（途中でやめた回は数えません）。`,
            en: `Records for participant “${participantId}”. Counts the plays finished on this device (stopped plays are not counted).`,
          }
        : {
            ja: "この端末で、最後まで遊んだ回を数えます（途中でやめた回は数えません）。",
            en: "Counts the plays finished on this device (stopped plays are not counted).",
          },
      lang
    );

    const tiles = [
      [{ ja: "この7日で遊んだ日", en: "Days played (7 days)" }, say({ ja: `${summary.daysThisWeek}日`, en: `${summary.daysThisWeek}` }, lang)],
      [{ ja: "この7日で遊んだ回数", en: "Plays (7 days)" }, say({ ja: `${summary.playsThisWeek}回`, en: `${summary.playsThisWeek}` }, lang)],
      [{ ja: "これまでに遊んだ回数", en: "Plays in total" }, say({ ja: `${summary.plays}回`, en: `${summary.plays}` }, lang)],
    ];
    elements.progressSummary.innerHTML = tiles
      .map(([label, value]) => `<div class="progress-tile"><span>${escapeHtml(say(label, lang))}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join("");

    const peak = Math.max(1, ...summary.week.map((entry) => entry.plays));
    const locale = lang === "en" ? "en-US" : "ja-JP";
    elements.progressWeek.innerHTML = `
      <p class="progress-week-title">${escapeHtml(say({ ja: "この7日", en: "The last 7 days" }, lang))}</p>
      <ol class="progress-week-days">
        ${summary.week
          .map((entry) => {
            const [y, m, d] = entry.day.split("-").map(Number);
            const weekday = new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short" });
            const height = Math.round((entry.plays / peak) * 100);
            return `<li class="${entry.plays ? "is-played" : ""}"><span class="progress-week-bar"><span style="height:${height}%"></span></span><strong>${entry.plays}</strong><small>${escapeHtml(weekday)}</small></li>`;
          })
          .join("")}
      </ol>
    `;

    elements.progressGames.innerHTML = summary.games.length
      ? summary.games.map((game) => gameCard(game, lang)).join("")
      : `<p class="empty-state">${escapeHtml(
          say({ ja: "まだ記録がありません。遊び終わると、ここに残ります。", en: "No records yet. Plays appear here when they finish." }, lang)
        )}</p>`;
  }

  return { render };
}
