// =====================================================================
// views/log.js — 評価ログ画面（操作ログの集計・一覧・CSV書き出し）
// =====================================================================

import { escapeHtml, formatTime, toLocalIso } from "../utils.js";
import { MAX_LOG_ENTRIES } from "../state.js";
import { say, supporterLang } from "../supporterText.js";
import { learnLabel, phraseText } from "../learnText.js";
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

/**
 * 操作ログの札を、日本語でない画面に出す言葉へ読み替える。
 *
 * 記録（state.logs と CSV の label）は、言語で変わらないよう日本語のまま残す——同じ操作が、端末の
 * 言語によって別の札で記録されると、あとから集められない。読み替えるのは画面に出すときだけ。
 * 知らない札は そのまま出す（黙って消さない）。札を足したら、ここにも足す。
 *
 * 札は {ja, en} の組で持つ（ja が記録の札）。3つ目からの言語は、英語の文を鍵に訳を引く
 * （supporterText.js の say）。
 */
const LOG_LABELS = [
  { ja: "スタート", en: "Start" },
  { ja: "色変化", en: "Peekaboo" },
  { ja: "ふうせん わり", en: "Pop the balloons" },
  { ja: "ぬりえ", en: "Colouring" },
  { ja: "ボールを 打つ", en: "Baseball: hit the ball" },
  { ja: "音あそび（すきな がっき）", en: "Sound game (any instrument)" },
  { ja: "音あそび（せんせいと）", en: "Sound game (with the teacher)" },
];
const LOG_LABEL_BY_JA = new Map(LOG_LABELS.map((pair) => [pair.ja, pair]));

/** 名前や数が入る札。正規表現の名前つきの括弧（(?<game>…)）で取った字が、組の同じ名前の穴（{game}）に入る。 */
const LOG_LABEL_PATTERNS = [
  [
    /^(?<game>\S+) 終了 taskType=(?<taskType>\S+)$/,
    { ja: "{game} 終了 taskType={taskType}", en: "{game} finished (taskType={taskType})" },
  ],
  [
    /^(?<game>\S+) エンドレス 無入力(?<seconds>\d+)秒で「もういちど／おわる」を出した$/,
    {
      ja: "{game} エンドレス 無入力{seconds}秒で「もういちど／おわる」を出した",
      en: "{game} endless: “Again / Finish” shown after {seconds}s without input",
    },
  ],
  [
    /^キャリブレーション基準オフセットを更新 (?<before>.+) → (?<after>.+)$/,
    { ja: "キャリブレーション基準オフセットを更新 {before} → {after}", en: "Baseline offset updated: {before} → {after}" },
  ],
  [/^難易度モードを (?<mode>\S+) に変更$/, { ja: "難易度モードを {mode} に変更", en: "Difficulty mode changed to {mode}" }],
  // 前の版の保存を引き継いだときの札（state.js）。
  [
    /^旧保存\((?<source>.+)\)からv4へ移行しました。$/,
    { ja: "旧保存({source})からv4へ移行しました。", en: "Migrated the earlier save ({source}) to v4." },
  ],
  [
    /^旧保存\((?<source>.+)\)から移行しました（settings\/logs\/evaluationのみ）。$/,
    {
      ja: "旧保存({source})から移行しました（settings/logs/evaluationのみ）。",
      en: "Migrated the earlier save ({source}): settings, logs and evaluation only.",
    },
  ],
  [
    /^旧保存\((?<source>.+)\)から移行しました。metricsは引き継ぎ対象外です。$/,
    {
      ja: "旧保存({source})から移行しました。metricsは引き継ぎ対象外です。",
      en: "Migrated the earlier save ({source}). Metrics are not carried over.",
    },
  ],
];

export function logLabelForDisplay(entry, lang = "ja") {
  const label = entry?.label || entry?.type || "";
  if (lang === "ja") return label;
  // どれかな？と ことばで伝える の札は、学ぶ・伝えるの表から引く（learnText.js）。表に無い札は、下の表へ進む。
  const learned =
    entry.type === "matching" ? learnLabel(label, lang) : entry.type === "phrase" ? phraseText(label, lang) : null;
  if (learned != null && learned !== label) return learned;
  const known = LOG_LABEL_BY_JA.get(label);
  if (known) return say(known, lang);
  for (const [pattern, text] of LOG_LABEL_PATTERNS) {
    const match = label.match(pattern);
    if (match) return say(text, lang, match.groups);
  }
  return label;
}

/** ゲームIDを支援者に読める名前へ。未知のIDはそのまま出す（黙って消さない）。 */
function gameTitle(gameId) {
  return gameModules.find((game) => game.id === gameId)?.title ?? gameId;
}

function roundValue(value) {
  return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
}

/** 端末のローカル時刻の「8/28」（月と日の順は言語で違う）。支援者が見るのは日付であって ISO ではない。 */
function shortLocalDate(isoString, lang = "ja") {
  const jst = toLocalIso(isoString);
  if (!jst) return "";
  const [, month, day] = jst.slice(0, 10).split("-");
  return say({ ja: "{month}/{day}", en: "{day}/{month}" }, lang, { month: Number(month), day: Number(day) });
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
function renderTrend(group, gameName, lang = "ja") {
  const w = (text, values) => say(text, lang, values);
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
    direction === "better"
      ? w({ ja: "よくなっています", en: "Improving" })
      : direction === "worse"
        ? w({ ja: "さがっています", en: "Getting worse" })
        : w({ ja: "かわっていません", en: "No change" });

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

  const firstDate = shortLocalDate(positions[0]?.startedAtIso, lang);
  const lastDate = shortLocalDate(positions.at(-1)?.startedAtIso, lang);
  const sameDay = firstDate === lastDate;

  const axisTop = `${roundValue(max)}${unit}`;
  const axisBottom = `${roundValue(min)}${unit}`;

  // 図の読み上げ（線の図は目でしか読めないので、同じ中身を文にする）。
  const count = group.points.length;
  const period = sameDay
    ? firstDate
    : w({ ja: "{from}から{to}まで", en: "{from} to {to}" }, { from: firstDate, to: lastDate });
  const plotLabel = w(
    {
      ja:
        "{label}の推移。{count}回ぶん。{period}。" +
        "はじめ {first}、いま {latest}、" +
        "いちばん よかった回 {best}。たて軸は {axisBottom} から {axisTop} まで。{direction}",
      en:
        "{label} over {count} runs, {period}. " +
        "First {first}, latest {latest}, " +
        "best {best}. The vertical axis runs from {axisBottom} to {axisTop}. {direction}.",
    },
    {
      label: group.label,
      count,
      period,
      first: `${roundValue(group.first)}${unit}`,
      latest: `${roundValue(group.last)}${unit}`,
      best: `${roundValue(group.best)}${unit}`,
      axisBottom,
      axisTop,
      direction: directionLabel,
    }
  );

  return `
    <article class="trend-card">
      <header class="trend-head">
        <div>
          <!-- あそび名は節の見出しに出ているので繰り返さない。カードの主役は
               条件——同じあそびの中で線が分かれている理由がこれ。 -->
          <strong>${escapeHtml(group.conditions || w({ ja: "既定の条件", en: "Default conditions" }))}</strong>
          <small>${escapeHtml(gameName || gameTitle(group.gameId))}</small>
        </div>
        <span class="trend-direction is-${direction}">${directionLabel}</span>
      </header>
      <p class="trend-metric">
        ${escapeHtml(group.label)}
        <span class="trend-hint">${
          group.higherIsBetter
            ? w({ ja: "（大きいほうが よい）", en: "(higher is better)" })
            : w({ ja: "（小さいほうが よい）", en: "(lower is better)" })
        }</span>
      </p>
      <svg
        class="trend-plot"
        viewBox="0 0 ${view.width} ${view.height}"
        role="img"
        aria-label="${escapeHtml(plotLabel)}"
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
        <div><dt>${w({ ja: "はじめ", en: "First" })}</dt><dd>${roundValue(group.first)}${unit}</dd></div>
        <div><dt>${w({ ja: "いま", en: "Latest" })}</dt><dd>${roundValue(group.last)}${unit}</dd></div>
        <div><dt>${w({ ja: "さいこう", en: "Best" })}</dt><dd>${roundValue(group.best)}${unit}</dd></div>
        <div><dt>${w({ ja: "かいすう", en: "Runs" })}</dt><dd>${w({ ja: "{count}回", en: "{count}" }, { count })}</dd></div>
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
      // 端末のローカル時刻（オフセット付き）。名前も time から time_local にする。
      "time_local",
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
      toLocalIso(entry.time),
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
  // 支援者の画面の言語（設定の「言語」に合わせる。supporterText.js）。
  const lang = () => supporterLang(state.settings);
  const tr = (text, values) => say(text, lang(), values);

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
    const key = `tile.${gameId}.title`;
    const translated = ctx.t(key);
    // 日本語でない画面では、文言の辞書の名前を先に見る（遊びの表の title は日本語だけ）。
    if (lang() !== "ja" && translated !== key) return translated;
    const fromTile = gameModules.find((game) => game.id === gameId)?.title;
    if (fromTile) return fromTile;
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
    const groups = summariseSessionTrends(state.sessions, state.evaluation?.participantId, lang());
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
          ${tr(
            {
              ja: "<strong>{game}</strong> の データがありません。<br />同じ条件で 2回以上 完走すると、ここに うつりかわりが出ます（中断した回は 含みません）。",
              en: "No data for <strong>{game}</strong> yet.<br />Once two or more runs are completed under the same conditions, the trend appears here (interrupted runs are not included).",
            },
            { game: escapeHtml(trendGameTitle(activeId) || tr({ ja: "このあそび", en: "this game" })) }
          )}
        </div>
      `;
      return;
    }
    elements.sessionTrends.innerHTML = `
      <div class="trend-grid">${section.trends
        .map((trend) => renderTrend(trend, trendGameTitle(section.gameId), lang()))
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
        tr({ ja: "まだ あそびの きろくがありません。絵あわせ・音あそび・クレーンゲーム・さかなつりを1回終えると記録されます。", en: "No play records yet. A record is added each time a run of Picture match, Sound game, Claw machine or Fishing is finished." });
      elements.sessionList.append(empty);
      return;
    }
    sessions.slice(0, 20).forEach((session) => {
      const item = document.createElement("article");
      item.className = "log-item is-session";
      // 条件は独立した行に置く。.log-item は3カラムなので、4つ目を同じ行に
      // 並べると時刻の下に回り込んで揃わない。
      const conditions = describeSessionConditions(session, lang());
      // 結果は課題ごとの主要指標。条件と並べて初めて「その条件でどうだったか」
      // になる。解釈するのは支援者なので、詳細はCSVに任せて材料だけ出す。
      const result = describeSessionResult(session, lang());
      item.innerHTML = `
        <span class="metric-label">${formatTime(session.startedAtIso)}</span>
        <strong>${escapeHtml(trendGameTitle(session.gameId))}</strong>
        <span>${escapeHtml(describeSessionOutcome(session, lang()))}</span>
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
      empty.textContent = tr({ ja: "まだログはありません。教材、マッチング、VOCA、文字学習で入力すると記録されます。", en: "No input log yet. Inputs in the games and in Which one?, Say it with words and Pick a letter are recorded here." });
      elements.logList.append(empty);
      return;
    }

    if (state.logs.length >= MAX_LOG_ENTRIES) {
      const retentionWarning = document.createElement("div");
      retentionWarning.className = "empty-state";
      retentionWarning.textContent =
        tr(
          {
            ja: "保存上限の直近{max}件に達しています。次の入力から最も古いログが置き換わるため、必要なら先にCSVを書き出してください。",
            en: "The log has reached its limit of {max} entries. From the next input the oldest entry is replaced, so export the CSV first if you need it.",
          },
          { max: MAX_LOG_ENTRIES }
        );
      elements.logList.append(retentionWarning);
    }

    state.logs.slice(0, 32).forEach((entry) => {
      const item = document.createElement("article");
      item.className = "log-item";
      const result = entry.correct === true ? tr({ ja: "正答", en: "Correct" }) : entry.correct === false ? tr({ ja: "誤選択", en: "Wrong choice" }) : "";
      item.innerHTML = `
      <span class="metric-label">${formatTime(entry.time)}</span>
      <strong>${escapeHtml(logLabelForDisplay(entry, lang()))}</strong>
      <span>${result}</span>
    `;
      elements.logList.append(item);
    });
  }

  /** 全ログをBOM付きCSVでダウンロードする */
  function exportCsv() {
    if (!state.logs.length) {
      announce(tr({ ja: "書き出すログがありません", en: "There is no log to export" }));
      notifySupporter(tr({ ja: "書き出すログがありません。利用者が何か操作するとログが増えます。", en: "There is no log to export. Entries are added as the user plays." }));
      return;
    }
    // 名前・BOM・控えは書き出しの共通の道（dataExport.js の download）。ログには行ごとの
    // 参加者が無いので、名前の参加者は端末に入っている記録（セッション）から決める。
    ctx.downloadRecords(buildLogCsvRows(state.logs, state.evaluation?.participantId), "neuronode-log", "logs");
  }

  // タブは押すたびに作り直すので、個々のボタンではなく入れ物で受ける。
  elements.trendTabs?.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-trend-game]");
    if (!tab) return;
    selectedTrendGameId = tab.dataset.trendGame;
    renderTrends();
    announce(
      tr(
        { ja: "{game} の うつりかわりを ひらきました", en: "Showing the trend for {game}" },
        { game: trendGameTitle(selectedTrendGameId) }
      )
    );
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
      announce(tr({ ja: "消すログがありません", en: "There is no log to delete" }));
      notifySupporter(tr({ ja: "消すログがありません。", en: "There is no log to delete." }));
      return;
    }
    if (!ctx.recordBackup?.canClear("logs")) {
      notifySupporter(tr({ ja: "現在の操作ログを先にCSVまたは生データ(JSON)で書き出してください。", en: "Export the current input log as CSV or raw data (JSON) first." }));
      announce(tr({ ja: "先に書き出してください", en: "Please export first" }));
      return;
    }
    if (!window.confirm(
        tr(
          {
            ja: "操作ログ {count}件を消します。元に戻せません。",
            en: "This deletes {count} input log {count:entry|entries}. It cannot be undone.",
          },
          { count }
        )
      )) {
      announce(tr({ ja: "消すのをやめました", en: "Nothing was deleted" }));
      return;
    }
    state.logs = [];
    save();
    render();
    announce(tr({ ja: "ログを削除しました", en: "Log deleted" }));
    notifySupporter(
      tr({ ja: "操作ログ {count}件を消しました。", en: "Deleted {count} input log {count:entry|entries}." }, { count })
    );
  });

  return { render };
}
