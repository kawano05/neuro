// =====================================================================
// views/log.js — 評価ログ画面（操作ログの集計・一覧・CSV書き出し）
// =====================================================================

import { escapeHtml, escapeCsv, formatTime, toJstIso } from "../utils.js";
import { MAX_LOG_ENTRIES } from "../state.js";
import {
  describeSessionConditions,
  describeSessionOutcome,
  describeSessionResult,
} from "../sessionConditions.js";
import { gameModules } from "../games/registry.js";
import {
  groupTrendsByGame,
  summariseSessionTrends,
  trendDirection,
} from "../sessionTrend.js";

/** ゲームIDを支援者に読める名前へ。未知のIDはそのまま出す（黙って消さない）。 */
function gameTitle(gameId) {
  return gameModules.find((game) => game.id === gameId)?.title ?? gameId;
}

function roundValue(value) {
  return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** 日本時間の「8/28」。支援者が見るのは日付であって ISO ではない。 */
function shortJstDate(isoString) {
  const jst = toJstIso(isoString);
  if (!jst) return "";
  const [, month, day] = jst.slice(0, 10).split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 1つの束（同じ課題・同じ条件）を、折れ線1本として描く。
 *
 * 読むのは支援者で、多くは面談や記録の合間に短時間で見る。だから
 * 「線の形」だけを出さない——形は縦軸の取り方でいくらでも変わる。
 *
 * 縦軸はその束の中の最小〜最大に合わせる。0を基準にすると、値の動く幅が
 * 小さい指標（ばらつきのmsなど）で線がほぼ平らになり、変化が読めない。
 * ただし拡大したぶん、わずかな差が大きな変化に見える。だから
 * **縦軸の上端と下端を数字で出す**（この但し書きは前からコメントにあったのに、
 * 実装されていなかった＝拡大された線だけが出ていた。2026-08-28に補った）。
 *
 * 横軸には日付を出す。3点が3日なのか3か月なのかで、同じ形の線でも意味が
 * まるで違う。出していなかったので、支援者は「いつの回か」を下の一覧と
 * 突き合わせて数えるしかなかった。
 *
 * 点の値も出す（多いときは最初・最後・最高だけ）。線から値を目で読ませない。
 */
function renderTrend(group, gameName) {
  const values = group.points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const unit = group.unit;

  // 版面。縦横比を固定する（preserveAspectRatio="none" をやめた）。
  // 引き伸ばすと、同じデータでもカード幅によって傾きが変わって見える。
  const view = { width: 320, height: 150 };
  const pad = { top: 18, right: 14, bottom: 30, left: 52 };
  const plot = {
    left: pad.left,
    right: view.width - pad.right,
    top: pad.top,
    bottom: view.height - pad.bottom,
  };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;

  // 全部同じ値のときは真ん中に引く（0除算を避けるためだけの span=1 にすると、
  // 1msの差が版面いっぱいに拡大される）。
  const flat = max === min;
  const span = flat ? 1 : max - min;
  const step = group.points.length > 1 ? plotWidth / (group.points.length - 1) : 0;

  const positions = group.points.map((point, index) => {
    const x = plot.left + index * step;
    // 値そのものを描く（大きい値ほど上）。
    //
    // 「上がれば良い」に揃える描き方も試したが、下が良い指標（ずれの
    // ばらつき）で線が上がりながら数字は下がる、という図になった。
    // 線と、そのすぐ下に並ぶ数字が逆を向くのは、読み違いを招くだけで
    // 得るものがない——とくにこれは卒論の図の元になる画面なので、
    // 図が数字と食い違ってはいけない。
    //
    // 良し悪しの向きは線の形ではなく、上の札（よくなっています／
    // さがっています）と「小さいほうが よい」の注記で言う。
    const y = flat
      ? plot.top + plotHeight / 2
      : plot.bottom - ((point.value - min) / span) * plotHeight;
    return { x, y, value: point.value, startedAtIso: point.startedAtIso };
  });

  const direction = trendDirection(group);
  const directionLabel =
    direction === "better" ? "よくなっています" : direction === "worse" ? "さがっています" : "かわっていません";

  // 値の札は、点が少ないうちは全部に出す。多くなったら重なって読めなく
  // なるので、最初・最後・いちばん良かった回だけに絞る。
  const labelEvery = group.points.length <= 6;
  const bestIndex = values.indexOf(group.best);
  const dots = positions
    .map((position, index) => {
      const isLast = index === positions.length - 1;
      const isBest = index === bestIndex;
      const classes = ["trend-dot"];
      if (isLast) classes.push("is-last");
      if (isBest) classes.push("is-best");
      const shouldLabel = labelEvery || index === 0 || isLast || isBest;
      // 札は点の上に出す。上端に近い点だけ下に逃がす（版面の外へ出さない）。
      const labelY = position.y < plot.top + 14 ? position.y + 16 : position.y - 9;
      const label = shouldLabel
        ? `<text class="trend-point-label" x="${position.x.toFixed(1)}" y="${labelY.toFixed(1)}"
             text-anchor="middle">${roundValue(position.value)}</text>`
        : "";
      return `<circle class="${classes.join(" ")}" cx="${position.x.toFixed(1)}" cy="${position.y.toFixed(1)}" r="${isLast ? 5 : 3.6}" />${label}`;
    })
    .join("");

  const firstDate = shortJstDate(positions[0]?.startedAtIso);
  const lastDate = shortJstDate(positions.at(-1)?.startedAtIso);
  const sameDay = firstDate === lastDate;

  const axisTop = `${roundValue(max)}${unit}`;
  const axisBottom = `${roundValue(min)}${unit}`;

  return `
    <article class="trend-card">
      <header class="trend-head">
        <div>
          <!-- あそび名は節の見出しに出ているので繰り返さない。カードの主役は
               条件——同じあそびの中で線が分かれている理由がこれ。 -->
          <strong>${escapeHtml(group.conditions || "既定の条件")}</strong>
          <small>${escapeHtml(gameName || gameTitle(group.gameId))}</small>
        </div>
        <span class="trend-direction is-${direction}">${directionLabel}</span>
      </header>
      <p class="trend-metric">
        ${escapeHtml(group.label)}
        <span class="trend-hint">（${group.higherIsBetter ? "大きい" : "小さい"}ほうが よい）</span>
      </p>
      <svg
        class="trend-plot"
        viewBox="0 0 ${view.width} ${view.height}"
        role="img"
        aria-label="${escapeHtml(group.label)}の推移。${group.points.length}回ぶん。
          ${sameDay ? `${firstDate}` : `${firstDate}から${lastDate}まで`}。
          はじめ ${roundValue(group.first)}${unit}、いま ${roundValue(group.last)}${unit}、
          いちばん よかった回 ${roundValue(group.best)}${unit}。
          たて軸は ${axisBottom} から ${axisTop} まで。${directionLabel}"
      >
        <!-- 縦軸の上端と下端。拡大された線だけを出すと、わずかな差が
             大きな変化に読める。 -->
        <line class="trend-axis" x1="${plot.left}" y1="${plot.top}" x2="${plot.right}" y2="${plot.top}" />
        <line class="trend-axis" x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" />
        <text class="trend-axis-label" x="${plot.left - 8}" y="${plot.top + 4}" text-anchor="end">${escapeHtml(axisTop)}</text>
        <text class="trend-axis-label" x="${plot.left - 8}" y="${plot.bottom + 4}" text-anchor="end">${escapeHtml(axisBottom)}</text>
        <polyline
          class="trend-line"
          points="${positions.map((position) => `${position.x.toFixed(1)},${position.y.toFixed(1)}`).join(" ")}"
          vector-effect="non-scaling-stroke"
        />
        ${dots}
        <!-- 横軸は日付。3点が3日なのか3か月なのかで、同じ形の線でも
             意味がまるで違う。 -->
        <text class="trend-axis-label" x="${plot.left}" y="${view.height - 8}" text-anchor="start">${escapeHtml(firstDate)}</text>
        ${
          sameDay
            ? ""
            : `<text class="trend-axis-label" x="${plot.right}" y="${view.height - 8}" text-anchor="end">${escapeHtml(lastDate)}</text>`
        }
      </svg>
      <dl class="trend-values">
        <div><dt>はじめ</dt><dd>${roundValue(group.first)}${unit}</dd></div>
        <div><dt>いま</dt><dd>${roundValue(group.last)}${unit}</dd></div>
        <div><dt>さいこう</dt><dd>${roundValue(group.best)}${unit}</dd></div>
        <div><dt>かいすう</dt><dd>${group.points.length}回</dd></div>
      </dl>
    </article>
  `;
}

/**
 * 操作ログCSVの行を作る（1エントリ1行）。
 *
 * 純粋関数として切り出してあるのは、DOMの中に埋めたままだと列をテストで
 * 固定できないから。ロング形式の課題CSVと同じ理由で、ここも解析側と
 * 静かに食い違いうる出力になっている（tests/data-integrity.test.mjs）。
 *
 * @param {Array<object>} logs state.logs（配列先頭が最新）
 * @param {string} [participantId] 書き出した時点の参加者ID
 */
export function buildLogCsvRows(logs, participantId) {
  const rows = [
    [
      // 日本時間（+09:00付き）。名前も time から time_jst にする。
      "time_jst",
      "view",
      "type",
      "label",
      "correct",
      // 以下は末尾に追加した列（既存4列の位置は動かさない）。
      //
      // success / skipEvaluation / distance は sanitizeLogEntry がずっと
      // 保持していたのに、どのCSVにも出していなかった。保存されているだけの
      // 値は解析に使えないので、実質「記録していない」のと同じ——端末情報を
      // 記録しながら書き出していなかったときと同じ型の穴。
      "success",
      "skip_evaluation",
      "distance",
      // 書き出した時点で設定されていた参加者ID。
      //
      // 名前が重要。ログは参加者をまたいで最大300件たまるので、この値を
      // participant_id という名前で出すと、別の参加者の回に付いた行まで
      // 「この人の行」として読めてしまう——列名が行ごとの真実を主張して
      // しまい、ログには行ごとの参加者IDが無い。
      //
      // 突き合わせは時刻で行う（セッションCSVの startedAtIso / endedAtIso と
      // このログの time を突き合わせる）。この列はその作業の入口を示すだけの
      // 補助であって、行の帰属ではない。
      "exported_participant_id",
    ],
  ];
  (Array.isArray(logs) ? logs : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    rows.push([
      toJstIso(entry.time),
      entry.view,
      entry.type,
      entry.label || "",
      entry.correct ?? "",
      entry.success ?? "",
      entry.skipEvaluation ?? "",
      entry.distance ?? "",
      participantId || "",
    ]);
  });
  return rows;
}

/**
 * 推移を出せる taskType。sessionTrend.js の METRICS と揃える。
 *
 * ここを別に持つのは、タブに出すあそびを content.js の gameModules から
 * 引くため（あそびの並びの正本は content.js）。METRICS を直接 export して
 * 参照すると、表示の都合で指標の定義に触れやすくなる。
 */
const TREND_TASK_TYPES = new Set(["sms", "gonogo", "scan", "rt", "slot"]);

export function initLog(ctx) {
  const { state, elements, save, announce, notifySupporter } = ctx;

  // いま開いているあそびのタブ。保存はしない——支援者がこの画面を開き直す
  // たびに最初のタブから見る想定で、前回どこを見ていたかを覚えていると
  // 「なぜここが開いているのか」の説明が要る値が1つ増える。
  let selectedTrendGameId = null;

  /**
   * タブに出すあそびの名前。
   *
   * タイルから外れたあそび（旧リズム等）は gameModules に無いので、
   * そのままだと gameId がそのまま出る（"rhythm-l2"）。記録は残っていて
   * 支援者が見る画面なので、生のIDを見せない——文言の辞書には残っている
   * ので、そこから引く。辞書にも無ければ最後の手段としてIDを出す
   * （何も出さないより、どの記録か分かるほうがよい）。
   */
  function trendGameTitle(gameId) {
    const fromTile = gameModules.find((game) => game.id === gameId)?.title;
    if (fromTile) return fromTile;
    const key = `tile.${gameId}.title`;
    const translated = ctx.t(key);
    return translated === key ? gameId : translated;
  }

  /**
   * 記録済みセッションと、その回に効いていた条件。
   * 難易度を設定画面から変えられるようにした以上、あとから条件を確認できる
   * 必要がある（sessionConditions.js のコメント参照）。新しい順に並べる。
   */
  /**
   * 推移を出せるあそび（記録が残る課題）の一覧。
   *
   * 記録のあるあそびだけを出さない。無いことが見えないと、支援者は
   * 「まだ遊んでいない」のか「表示が壊れている」のかを区別できない。
   * 全部並べて、記録の無いものは「データがありません」と言う。
   *
   * 並びは content.js（gameModules）の順。画面のタイル順とタブの順が
   * 食い違うと、支援者は同じものを2つの順番で覚えることになる。
   */
  function trendGames(byGame = []) {
    const ids = gameModules
      .filter((game) => TREND_TASK_TYPES.has(game.taskType))
      .map((game) => game.id);
    // 記録に残っているのにタイルから外れたあそび（旧リズム等）も必ず出す。
    // タブを現行のタイルだけで作ると、その回のデータは残っているのに
    // どこからも見えなくなる——「無いこと」より質の悪い、見えないデータ。
    byGame.forEach((section) => {
      if (!ids.includes(section.gameId)) ids.push(section.gameId);
    });
    return ids;
  }

  /**
   * いま開いているあそびのタブ。
   *
   * 既定は「記録のある最初のタブ」。並び順のいちばん前を無条件に開くと、
   * ほかに記録があっても最初に見えるのが「データがありません」になり、
   * 何も無いように読める。
   */
  function activeTrendGameId(byGame = []) {
    const ids = trendGames(byGame);
    if (ids.includes(selectedTrendGameId)) return selectedTrendGameId;
    const withData = ids.find((id) => byGame.some((section) => section.gameId === id));
    return withData ?? ids[0] ?? null;
  }

  function renderTrendTabs(byGame) {
    if (!elements.trendTabs) return;
    const activeId = activeTrendGameId(byGame);
    elements.trendTabs.innerHTML = trendGames(byGame)
      .map((gameId) => {
        const section = byGame.find((entry) => entry.gameId === gameId);
        const count = section ? section.trends.length : 0;
        const active = gameId === activeId;
        // 記録のあるタブには線の数を添える。開く前に「どこに何があるか」が
        // 分かると、空のタブを順に開いて確かめる手間が消える。
        const badge = count > 0 ? `<span class="trend-tab-count">${count}</span>` : "";
        return `
          <button
            type="button"
            class="trend-tab${active ? " is-active" : ""}"
            role="tab"
            aria-selected="${active}"
            data-trend-game="${escapeHtml(gameId)}"
          >${escapeHtml(trendGameTitle(gameId))}${badge}</button>
        `;
      })
      .join("");
  }

  /**
   * 課題×条件ごとの推移。2回以上そろった束だけ出る。
   *
   * あそびをタブで切り替え、その中に条件ごとの線を並べる。束ねる単位は
   * 「課題 × 条件」なので、条件を変えた回があると同じあそびの線が複数
   * できる。全部を一列に並べると別のあそびの線と交互に出て、「このあそびは
   * どうなっているか」を読むのに画面を往復することになる。
   */
  function renderTrends() {
    if (!elements.sessionTrends) return;
    const groups = summariseSessionTrends(state.sessions);
    const byGame = groupTrendsByGame(
      groups,
      gameModules.map((game) => game.id)
    );
    renderTrendTabs(byGame);

    const activeId = activeTrendGameId(byGame);
    const section = byGame.find((entry) => entry.gameId === activeId);
    if (!section) {
      elements.sessionTrends.innerHTML = `
        <div class="empty-state">
          <strong>${escapeHtml(trendGameTitle(activeId) || "このあそび")}</strong> の データがありません。<br />
          同じ条件で 2回以上 完走すると、ここに うつりかわりが出ます
          （中断した回は 含みません）。
        </div>
      `;
      return;
    }
    elements.sessionTrends.innerHTML = `
      <div class="trend-grid">${section.trends
        .map((trend) => renderTrend(trend, trendGameTitle(section.gameId)))
        .join("")}</div>
    `;
  }

  function renderSessions() {
    elements.sessionList.innerHTML = "";
    const sessions = [...(state.sessions || [])].reverse();
    if (sessions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent =
        "まだ あそびの きろくがありません。リズム・UFOキャッチャー・さかなつりを1回終えると記録されます。";
      elements.sessionList.append(empty);
      return;
    }
    sessions.slice(0, 20).forEach((session) => {
      const item = document.createElement("article");
      item.className = "log-item is-session";
      // 条件は独立した行に置く。.log-item は3カラムなので、4つ目を同じ行に
      // 並べると時刻の下に回り込んで揃わない。
      const conditions = describeSessionConditions(session);
      // 結果は課題ごとの主要指標。条件と並べて初めて「その条件でどうだったか」
      // になる。解釈するのは支援者なので、詳細はCSVに任せて材料だけ出す。
      const result = describeSessionResult(session);
      item.innerHTML = `
        <span class="metric-label">${formatTime(session.startedAtIso)}</span>
        <strong>${escapeHtml(gameTitle(session.gameId))}</strong>
        <span>${escapeHtml(describeSessionOutcome(session))}</span>
        ${result ? `<span class="session-result">${escapeHtml(result)}</span>` : ""}
        ${conditions ? `<span class="session-conditions">${escapeHtml(conditions)}</span>` : ""}
      `;
      elements.sessionList.append(item);
    });
  }

  /** 集計値とログ一覧（直近32件）の描画 */
  function render() {
    renderTrends();
    renderSessions();
    const total = state.logs.filter((entry) => entry.type !== "system").length;
    // 正答率の母数は正誤判定がある matching / letter のみ
    const graded = state.logs.filter((entry) => entry.type === "matching" || entry.type === "letter");
    const mistakes = graded.filter((entry) => !entry.correct).length;
    const correct = graded.filter((entry) => entry.correct).length;
    elements.totalInputs.textContent = String(total);
    elements.mistakeCount.textContent = String(mistakes);
    elements.accuracyRate.textContent = graded.length
      ? `${Math.round((correct / graded.length) * 100)}%`
      : "--";

    elements.logList.innerHTML = "";
    if (state.logs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "まだログはありません。教材、マッチング、VOCA、文字学習で入力すると記録されます。";
      elements.logList.append(empty);
      return;
    }

    if (state.logs.length >= MAX_LOG_ENTRIES) {
      const retentionWarning = document.createElement("div");
      retentionWarning.className = "empty-state";
      retentionWarning.textContent =
        `保存上限の直近${MAX_LOG_ENTRIES}件に達しています。` +
        "次の入力から最も古いログが置き換わるため、必要なら先にCSVを書き出してください。";
      elements.logList.append(retentionWarning);
    }

    state.logs.slice(0, 32).forEach((entry) => {
      const item = document.createElement("article");
      item.className = "log-item";
      const result = entry.correct === true ? "正答" : entry.correct === false ? "誤選択" : "";
      item.innerHTML = `
      <span class="metric-label">${formatTime(entry.time)}</span>
      <strong>${escapeHtml(entry.label || entry.type)}</strong>
      <span>${result}</span>
    `;
      elements.logList.append(item);
    });
  }

  /** 全ログをBOM付きCSVでダウンロードする */
  function exportCsv() {
    if (!state.logs.length) {
      announce("書き出すログがありません");
      notifySupporter("書き出すログがありません。利用者が何か操作するとログが増えます。");
      return;
    }
    const rows = buildLogCsvRows(state.logs, state.evaluation?.participantId);
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neuronode-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // タブは押すたびに作り直すので、個々のボタンではなく入れ物で受ける。
  elements.trendTabs?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-trend-game]");
    if (!tab) return;
    selectedTrendGameId = tab.dataset.trendGame;
    renderTrends();
    announce(`${trendGameTitle(selectedTrendGameId)} の うつりかわりを ひらきました`);
  });

  elements.exportCsv.addEventListener("click", exportCsv);
  elements.clearLog.addEventListener("click", () => {
    // 消す前に一度だけ止める。
    //
    // この画面は走査の輪に入っている（支援者メニューと違い、利用者が
    // タブバーから迷い込める）。輪は5〜6項目しかないので、迷い込んだ
    // 一押しがそのまま全消去になりうる。支援者が意図して押す場合の
    // 手間は1回だけ増え、事故は止まる。
    const count = state.logs.length;
    if (count === 0) {
      announce("消すログがありません");
      notifySupporter("消すログがありません。");
      return;
    }
    if (!window.confirm(`操作ログ ${count}件を消します。元に戻せません。`)) {
      announce("消すのをやめました");
      return;
    }
    state.logs = [];
    save();
    render();
    announce("ログを削除しました");
    notifySupporter(`操作ログ ${count}件を消しました。`);
  });

  return { render };
}
