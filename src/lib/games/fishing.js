// =====================================================================
// games/fishing.js — 「さかなつり」
//
// 課題としては変動前刺激間隔つき単純反応時間課題（taskType: "rt"）のまま。
// 測っているのはアタリ音から入力までの反応時間で、判定は games/reaction.js の
// judgeReaction、前刺激間隔は generateForeperiods、real/fake の並びは
// judge.js の generateGoNoGoSequence——いずれも変えていない。
//
// 見た目を「よくある釣りゲーム」にするにあたっての設計:
//   - 舟と釣り人は画面中央上部に固定（利用者は移動できない。操作は
//     NeuroNode の単一スイッチ1つだけなので、移動の概念を持ち込まない）。
//   - 魚は水中を右から左へ流れ、**アタリ音が鳴る瞬間（cueMs）にちょうど
//     糸の真下へ来る**ように泳ぐ。つまり画面は音のキューを目でも追える
//     ようにした表現であって、判定の基準は音の時刻のまま。
//   - これにより「画面を見ずに音だけでも遊べる」「音が聴こえにくくても
//     画面で合わせられる」の両方が成り立つ。basic-design.md §6 の聴覚優先を
//     崩さずに、視覚的な手応えだけを足している。
//   - 利用者ができる操作は「押して糸を垂らす」だけ。掛かったら自動で
//     舟まで巻き上げ、魚の長さを表示してスコアに足す。
//   - 1ゲームは1分。試行数ではなく時間で区切る（content.js の sessionMs）。
//
// スコアと魚の長さについて: これらは遊びの手応えのための表示で、
// state.js の sanitizeReactionSession は rt スキーマの外の値を保持しない。
// 記録・CSV に残るのは従来どおり反応時間と判定だけで、研究データの
// スキーマは変えていない。リザルト画面には ctx.finish(summary) 経由で
// 渡すため（sanitizer を通らない）、その場では合計スコアを表示できる。
// =====================================================================

import { cueTones, fishingPresets, fishingSpecies } from "../content.js";
import {
  endlessDifficultyStep,
  resolveDifficultyMode,
  resolveEndlessMode,
} from "../difficultyMode.js";
import { generateGoNoGoSequence } from "./judge.js";
import { generateForeperiods, judgeReaction } from "./reaction.js";

// 素材の URL。`import boat from "...png"` ではなく new URL(...) を使う。
// 前者だと Vite は解決できるが、素の Node が .png を読めずに落ちる
// （tests/data-integrity.test.mjs は state.js 経由でこのファイルまで
// 辿り着くため、単体テストが起動しなくなる）。new URL(..., import.meta.url)
// は Vite が静的解析してハッシュ付きの配信URLへ書き換えてくれるうえ、
// Node からはただの式なので読み込み時に評価されるだけで害がない。
const boatUrl = new URL("../../assets/fishing/boat.png", import.meta.url).href;
const bootUrl = new URL("../../assets/fishing/boot.png", import.meta.url).href;
const fishLargeUrl = new URL("../../assets/fishing/fish-large.png", import.meta.url).href;
const fishMediumUrl = new URL("../../assets/fishing/fish-medium.png", import.meta.url).href;
const fishSmallUrl = new URL("../../assets/fishing/fish-small.png", import.meta.url).href;

const FEEDBACK_GAIN = 0.05;
const MISS_GAIN = 0.018;

/** 魚の見た目（content.js の species.asset → 画像URL）。 */
const FISH_ART = {
  small: fishSmallUrl,
  medium: fishMediumUrl,
  large: fishLargeUrl,
};

// 画面上の位置（.fishing-scene に対する％）。糸は中央に垂れる。
const LINE_X_PERCENT = 50;
const SPAWN_X_PERCENT = 110;
const EXIT_X_PERCENT = -20;

function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `t-${datePart}-${timePart}-${Math.random().toString(36).slice(2, 4)}`;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values, mean) {
  if (values.length < 2 || mean === null) return null;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  );
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 出現比（weight）に従って魚種を1つ選ぶ。 */
function pickSpecies() {
  const total = fishingSpecies.reduce((sum, species) => sum + species.weight, 0);
  let roll = Math.random() * total;
  for (const species of fishingSpecies) {
    roll -= species.weight;
    if (roll <= 0) return species;
  }
  return fishingSpecies[fishingSpecies.length - 1];
}

/** 「のこり 1:23」用の mm:ss 表記。 */
function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * 「すばやい！」ボーナスの加点（cm）。
 *
 * 速さに報いる仕組みを入れるのは、判定窓が2秒あって見ていればまず外れず、
 * 釣れる魚の長さも乱数なので、上手に押してもスコアに返ってこなかったため。
 * ただし速さの基準は他人ではなく**その人自身のセッション内中央値**にする。
 * 固定のしきい値にすると、反応の遅い利用者は一度も達成できない。この
 * アプリの利用者は反応が遅いのが前提なので、遅さを罰する設計にはしない
 * （窓を狭めるのではなく、速いときに上乗せするだけにしている）。
 */
const SPEED_BONUS_CM = 10;

/** ボーナス判定に自己中央値を使いはじめるまでに必要な hit 数。 */
const SPEED_BONUS_MIN_SAMPLES = 3;

/**
 * 残りこの時間で空を夕方の色にする。セッション長（1分）のおよそ1/5。
 * 長すぎると「終盤」の合図にならず、ずっと夕方の画面になってしまう。
 */
const DUSK_MS = 12_000;

function computeSummary(trials) {
  const included = trials.filter((trial) => !trial.excluded);
  const hits = included.filter((trial) => trial.judgment === "hit");
  const timeouts = included.filter((trial) => trial.judgment === "timeout").length;
  const falseStarts = included.filter((trial) => trial.judgment === "falseStart").length;
  const commissions = included.filter((trial) => trial.judgment === "commission").length;
  const correctRejections = included.filter(
    (trial) => trial.judgment === "correctRejection"
  ).length;
  const realCount = included.filter((trial) => trial.kind === "real").length;
  const fakeCount = included.filter((trial) => trial.kind === "fake").length;
  const reactionTimes = hits.map((trial) => trial.reactionTimeMs);
  const meanRtMs = average(reactionTimes);
  // 釣果（遊びの手応え用）。永続化はされない（ファイル冒頭のコメント参照）。
  const caughtLengths = hits
    .map((trial) => trial.lengthCm)
    .filter((value) => typeof value === "number");
  const totalLengthCm = caughtLengths.reduce((sum, value) => sum + value, 0);
  const speedBonuses = included.filter((trial) => trial.speedBonus).length;

  // 連続記録。長靴を見送れた（correctRejection）のも成功として数える。
  // 抑制できたことを褒めないと、押し続けるのが最適な遊び方になってしまう。
  let streak = 0;
  let bestStreak = 0;
  included.forEach((trial) => {
    if (trial.judgment === "hit" || trial.judgment === "correctRejection") {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  });

  return {
    trials: included.length,
    hits: hits.length,
    timeouts,
    falseStarts,
    commissions,
    correctRejections,
    hitRate: realCount ? hits.length / realCount : 0,
    commissionRate: fakeCount ? commissions / fakeCount : 0,
    falseStartRate: included.length ? falseStarts / included.length : 0,
    meanRtMs,
    sdRtMs: standardDeviation(reactionTimes, meanRtMs),
    medianRtMs: median(reactionTimes),
    catches: caughtLengths.length,
    totalLengthCm,
    longestCm: caughtLengths.length ? Math.max(...caughtLengths) : null,
    speedBonuses,
    bestStreak,
    currentStreak: streak,
    scoreCm: totalLengthCm + speedBonuses * SPEED_BONUS_CM,
  };
}

/**
 * @param {"fishing"|"fishing-gonogo"} gameId
 *   fishing        … 純粋な単純反応時間（fakeRatio 0。長靴が出ない）
 *   fishing-gonogo … 抑制つき（低音の長靴が混ざる）
 *   どちらも同じエンジンで、違いは content.js の fishingPresets だけ
 *   （games/rhythm.js の createRhythmGame(gameId) と同じ作法）。
 * @returns {(ctx: import("./gameHost.js").GameCtx) => import("./gameHost.js").GameInstance}
 */
/**
 * エンドレスの難度の上げ方。
 *
 * 上げるのは受付時間（limitMs）。反応課題の難しさは「合図からどれだけの
 * うちに押さないといけないか」そのものなので、ここを詰めるのがいちばん
 * 素直で、遊んでいて分かる。魚の速さや音を変えても、測っているものが
 * 変わるだけで難しさは変わらない。
 *
 * 4回ごとに1段、1段で150ms短縮。5段で打ち止め（既定の2000msなら
 * 2000 → 1850 → 1700 → 1550 → 1400 → 1250ms）。
 *
 * 下限 1250ms には根拠がある。成立確認（readinessCheck.js）が随意運動として
 * 認める反応時間の上限は 1500ms で、スイッチ操作を行う利用者はその近くに
 * 分布しうる。下限をそれより下に置くと「押せたはずの入力が間に合わない」
 * 課題になり、難しい課題ではなく成立していない課題になる。
 *
 * 適用した値は試行ごとに記録する（state.js が試行の limitMs を優先して
 * 判定するのはこのため）。config の値だけでは、何段目の試行かを後から
 * 復元できない。
 */
const ENDLESS_TRIALS_PER_STEP = 4;
const ENDLESS_MAX_STEP = 5;
const ENDLESS_LIMIT_STEP_MS = 150;
const ENDLESS_MIN_LIMIT_MS = 1250;

function endlessLimitMs(baseLimitMs, trialIndex) {
  const step = endlessDifficultyStep(trialIndex, ENDLESS_TRIALS_PER_STEP, ENDLESS_MAX_STEP);
  // 始めた条件より易しくしない（crane 側と同じ保証）。いまは limitMs を
  // 支援者が触れないが、触れるようになった瞬間に下限が易化に化ける。
  return Math.min(
    baseLimitMs,
    Math.max(ENDLESS_MIN_LIMIT_MS, baseLimitMs - ENDLESS_LIMIT_STEP_MS * step)
  );
}

/**
 * エンドレスの長さと上限。
 *
 * さかなつりは時間で区切る課題で、合図の音は最初にまとめて計画し、
 * lookahead スケジューラ（audio.js）が窓に入ったものだけを予約していく。
 * 途中で計画を作り直すと、時刻の基準（anchorPerfMs / sessionStartAudioMs）を
 * 取り直すことになり、反応時間の測り方そのものが変わる——遊びのために
 * 測定の土台を動かすのは割に合わない。
 *
 * なので「無限」ではなく「長い1回」にする。支援者が終わらせるまで続き、
 * 誰も終わらせなければ15分で終わる。試行数の上限は state.js の rt 検証が
 * targetTrials を 1〜200 で切ることに合わせる（超えると再読み込みで
 * 「完走していない回」に倒れ、成立確認の材料からも外れる）。
 */
const ENDLESS_SESSION_MS = 15 * 60_000;
const ENDLESS_MAX_TRIALS = 200;

export function createFishingGame(gameId) {
  return function create(ctx) {
  const { audio, announce, voiceFeedback, logTrial, finish, setProgress, t, tHtml } = ctx;

  const config = { ...fishingPresets[gameId] };
  // 「ずっとあそぶ」の回か。そくていでは resolveEndlessMode が必ず false を
  // 返すので、測る回の長さは protocol のまま動かない。
  config.endless = resolveEndlessMode(ctx.settings, ctx.endless);
  if (config.endless) config.sessionMs = ENDLESS_SESSION_MS;
  let stageEl = null;
  let statusEl = null;
  // いま状態表示に出している文言のキー。
  //
  // 以前は statusEl.textContent を文字列リテラルと比べて「もう出ているか」を
  // 判定していた。表記は設定で変わる（src/lib/i18n.js）ので、文言を差し替えた
  // 瞬間にその比較は成り立たなくなり、毎フレーム書き込みが走る——表示している
  // 文字列を状態として読むと、翻訳した時点で静かに壊れる。キーで持つ。
  let shownStatusKey = null;
  let sceneEl = null;
  let lineEl = null;
  let swimmerEl = null;
  let swimmerArtEl = null;
  let catchEl = null;
  let scoreEl = null;
  let streakEl = null;
  let rafId = null;
  let castTimer = null;
  let catchTimer = null;
  let destroyed = false;
  let finished = false;
  let sessionStartAudioMs = 0;
  let anchorPerfMs = 0;
  let trialsPlan = [];
  let currentIndex = 0;
  let session = null;
  let sessionEndMs = 0;
  // エンドレスで失敗が出たか。記録の直後にその場で finalize すると、
  // 釣り上げ／逃げの演出と読み上げが途中で切れる。旗だけ立てて、枠が
  // 終わるところ（advanceSlot）で畳む。
  let endlessFailed = false;
  // 巻き上げ演出中は rAF による位置更新を止め、CSS の遷移に任せる。
  let reelingIndex = -1;
  // 「その枠の試行が記録済みか」と「枠そのものが終わったか」を分けて持つ。
  //
  // 以前は記録した時点で currentIndex を次へ進めていた。すると開始直後から
  // 連打された場合、各枠がフライング（falseStart）で即座に消費され、魚が
  // 一度も画面に現れなくなる。ところがアタリ音は mount() で全ビートを
  // 予約済みなので鳴り続ける。「音は鳴るのに魚がいない」状態になり、
  // 音と絵が一致するというこのゲームの前提が崩れていた。
  //
  // 記録は1枠1回のまま（判定の意味は変えない）で、枠の進行は時間で行う。
  // フライングしても魚はその枠の最後まで泳ぐので、「早すぎて逃した」ことが
  // 目で見て分かる。
  let resolvedIndex = -1;
  let resolvedJudgment = null;

  /**
   * 状態表示を1箇所から書き換える。
   *
   * キーを覚えておくのは、毎フレーム走る updateSwimmer() が「もう出ているか」
   * を知る必要があるから（表示文字列で比べると、表記を切り替えた瞬間に
   * 成り立たなくなる。上の shownStatusKey のコメント参照）。
   */
  function setStatus(key, values) {
    if (!statusEl) return;
    shownStatusKey = key;
    statusEl.innerHTML = tHtml(key, values);
  }

  function toAudioAbsMs(perfMs) {
    return perfMs - anchorPerfMs + sessionStartAudioMs;
  }

  function toSessionRelativeMs(audioAbsMs) {
    return audioAbsMs - sessionStartAudioMs;
  }

  /**
   * 画面は海が全面。舟・糸・魚が主役で、文字は海の上に小さく重ねる。
   * 以前はステージ中央に小さな海の四角を置き、その下に巨大な状態表示と
   * 説明文を並べていたため、画面でいちばん大きい要素が「アタリ！」の文字に
   * なっていた（ゲーム本体は画面の3割ほど）。説明文はレディ画面と重複して
   * いたので外した。
   */
  /**
   * 音が出せない端末で、課題を始められない理由を画面に出す。
   * 読む相手は支援者なので、原因と次の手を書く（games/rhythm.js と同型）。
   */
  function renderUnavailable(audioState) {
    if (!stageEl) return;
    const stopped = audioState === "suspended" || audioState === "interrupted";
    const why = stopped
      ? "音が止まっているため、さかなつりは始められません。ほかのアプリの音や着信、消音スイッチ、音量を確認してください。"
      : "この端末では音を鳴らす機能が使えないため、さかなつりは始められません。";
    stageEl.innerHTML = `
      <div class="game-unavailable">
        <strong>おとが ならせません</strong>
        <p>${why} アタリの合図が音なので、続けても はやさの記録になりません。</p>
        <p class="game-unavailable-hint">
          右上の「おわる」で もどれます。${
            stopped ? "直したあと、もう一度えらんでください。" : "音の出る端末で もう一度おためしください。"
          }
        </p>
      </div>
    `;
    announce("音が鳴らせないため、さかなつりを始められません");
  }

  function renderMarkup() {
    stageEl.innerHTML = `
      <div class="fishing-scene" aria-hidden="true">
        <div class="fishing-sky"></div>
        <div class="fishing-water"></div>
        <!--
          水中の環境。以前は糸の下がまるごと空の青で、画面の4割近くが
          「まだ描かれていない場所」に見えていた。60秒のあいだ、待っている
          時間の大半をそこで過ごすので、体感としても空虚だった。

          埋めるうえでの制約は1つだけ: ここで動くものは、アタリの予告に
          なってはいけない。前刺激間隔は 1.8〜4.2 秒の乱数（content.js）で、
          その乱数を推測できる手がかりが画面にあると、測っているものが
          反応時間でなくなる。

          なのでここの動きはすべて
            - 課題の乱数と無関係な固定周期（9s / 13s / 17s / 23s。
              前刺激間隔の範囲からも、その整数倍からも外してある）
            - 糸のまわり（アタリの起きる場所）ではなく、深いところに置く
            - 影のシルエットにして、狙う対象（.fishing-swimmer は色つきの絵）
              と見た目の種類を変える
          にしてある。見分けがつかないと、遠くの魚影を追ってしまう。
        -->
        <div class="fishing-deep">
          <span class="fishing-shaft fishing-shaft-a"></span>
          <span class="fishing-shaft fishing-shaft-b"></span>
          <span class="fishing-far fishing-far-a"></span>
          <span class="fishing-far fishing-far-b"></span>
          <span class="fishing-far fishing-far-c"></span>
          <span class="fishing-far fishing-far-d"></span>
          <span class="fishing-far fishing-far-e"></span>
          <span class="fishing-bubble fishing-bubble-a"></span>
          <span class="fishing-bubble fishing-bubble-b"></span>
          <span class="fishing-bubble fishing-bubble-c"></span>
          <span class="fishing-bubble fishing-bubble-d"></span>
          <span class="fishing-bubble fishing-bubble-e"></span>
          <div class="fishing-bed">
            <span class="fishing-weed fishing-weed-a"></span>
            <span class="fishing-weed fishing-weed-b"></span>
            <span class="fishing-weed fishing-weed-c"></span>
            <span class="fishing-weed fishing-weed-d"></span>
          </div>
        </div>
        <div class="fishing-line"></div>
        <img class="fishing-boat" src="${boatUrl}" alt="" />
        <div class="fishing-swimmer"><img class="fishing-swimmer-art" src="" alt="" /></div>
        <div class="fishing-catch"></div>
        <div class="fishing-score">0 cm</div>
        <div class="fishing-streak"></div>
        <div class="fishing-status">${tHtml("fishing.wait")}</div>
      </div>
    `;
    sceneEl = stageEl.querySelector(".fishing-scene");
    statusEl = stageEl.querySelector(".fishing-status");
    // 版面の初期値（マークアップ側で出している文言）と合わせておく。
    shownStatusKey = "fishing.wait";
    lineEl = stageEl.querySelector(".fishing-line");
    swimmerEl = stageEl.querySelector(".fishing-swimmer");
    swimmerArtEl = stageEl.querySelector(".fishing-swimmer-art");
    catchEl = stageEl.querySelector(".fishing-catch");
    scoreEl = stageEl.querySelector(".fishing-score");
    streakEl = stageEl.querySelector(".fishing-streak");
  }

  function updateProgress(nowRelativeMs) {
    // エンドレスには「のこり時間」が無い。15分は記録が壊れないための上限で
    // あって、利用者への約束ではない——カウントダウンを出すと、終わりが
    // 時間で決まるように読める（実際は1回失敗したら終わり）。crane と同じく
    // やった数を出す。
    if (config.endless) {
      setProgress(t("progress.endlessCount", { n: session ? session.trials.length + 1 : 1 }));
      return;
    }
    setProgress(t("progress.remainingTime", { time: formatRemaining(sessionEndMs - nowRelativeMs) }));
  }

  function updateScore() {
    if (!scoreEl || !session) return;
    scoreEl.textContent = `${session.summary.scoreCm ?? 0} cm`;
  }

  /**
   * 連続記録の表示。3から出す（1・2で出すと常時点灯して意味を失う）。
   * 長靴を見送れたのも連続に含めているので、「押さない」ことにも
   * 手応えが返る。
   */
  function updateStreak() {
    if (!streakEl || !session) return;
    const streak = session.summary.currentStreak ?? 0;
    if (streak >= 3) {
      streakEl.innerHTML = tHtml("progress.streak", { n: streak });
      streakEl.classList.add("is-shown");
    } else {
      streakEl.classList.remove("is-shown");
    }
  }

  /**
   * 合わせて引き上げる演出（押したときは必ず動かす。空振りでも手応えを返す）。
   *
   * 以前は「押したら糸が伸びる」だったが、それだと糸が水中に無いのに魚が
   * 食いつく（アタリ音が鳴る）ことになり、釣りとして因果が逆立ちしていた。
   * 糸は最初から魚のいる深さまで垂れていて、押す＝合わせて引き上げる、
   * とすることで音・絵・操作の3つが揃う。
   */
  function pullLine() {
    if (!lineEl) return;
    lineEl.classList.add("is-pulled");
    window.clearTimeout(castTimer);
    castTimer = window.setTimeout(() => {
      lineEl?.classList.remove("is-pulled");
    }, 420);
  }

  /** 掛かった魚を舟まで巻き上げ、長さを表示する。 */
  function reelIn(planned, speedBonus = false) {
    if (!swimmerEl || !catchEl) return;
    reelingIndex = planned.index;
    catchEl.classList.toggle("is-bonus", speedBonus);
    // 巻き上げ中は updateVisual が早期 return するため、食いつきの
    // アニメーションはここで明示的に外す（付けっぱなしにすると
    // transform が競合して巻き上げが揺れる）。
    swimmerEl.classList.remove("is-biting");
    swimmerEl.classList.add("is-hooked");
    catchEl.textContent = speedBonus
      ? `★ ${planned.lengthCm} cm ＋${SPEED_BONUS_CM}`
      : `${planned.lengthCm} cm`;
    catchEl.classList.add("is-shown");
    window.clearTimeout(catchTimer);
    catchTimer = window.setTimeout(() => {
      catchEl?.classList.remove("is-shown");
      swimmerEl?.classList.remove("is-hooked");
      if (swimmerEl) swimmerEl.style.opacity = "0";
      reelingIndex = -1;
    }, 900);
  }

  /**
   * この hit が「その人にとって速い」かを、これまでの hit の中央値と比べて決める。
   * 母数が少ないうちは判定しない（最初の1回が基準になってしまうため）。
   */
  function isSpeedBonus(judgment, reactionTimeMs) {
    if (judgment !== "hit" || typeof reactionTimeMs !== "number") return false;
    const priorRts = session.trials
      .filter((trial) => trial.judgment === "hit" && typeof trial.reactionTimeMs === "number")
      .map((trial) => trial.reactionTimeMs);
    if (priorRts.length < SPEED_BONUS_MIN_SAMPLES) return false;
    return reactionTimeMs < median(priorRts);
  }

  /**
   * その試行の受付時間。
   *
   * エンドレスでは試行ごとに変わる（endlessLimitMs）。判定・表示・終端の
   * すべてが同じ値を見ていないと、「画面ではまだ食いついているのに判定は
   * 時間切れ」のような食い違いが出る。config の値を直に読まず必ずここを通す。
   */
  function limitMsOf(planned) {
    return typeof planned?.limitMs === "number" ? planned.limitMs : config.limitMs;
  }

  function recordCurrent(judgment, inputMs = null) {
    if (finished || currentIndex >= trialsPlan.length) return;
    if (resolvedIndex === currentIndex) return; // 1枠1行（多重記録を防ぐ）
    const planned = trialsPlan[currentIndex];
    const normalizedInput =
      judgment === "timeout" || judgment === "correctRejection" ? null : inputMs;
    const row = {
      index: currentIndex,
      kind: planned.kind,
      foreperiodMs: planned.foreperiodMs,
      cueMs: planned.cueMs,
      // その試行の受付時間。エンドレスでは試行ごとに変わるので、config の値
      // だけでは再読み込み時に判定を再現できない（state.js が試行の limitMs を
      // 優先するのはこのため）。何段目の試行かも、この値から復元できる。
      limitMs: limitMsOf(planned),
      inputMs: normalizedInput,
      reactionTimeMs:
        judgment === "hit" && normalizedInput !== null
          ? normalizedInput - planned.cueMs
          : null,
      judgment,
      excluded: false,
      // 以下は遊びの表示用（永続化されない。ファイル冒頭のコメント参照）。
      species: planned.species,
      lengthCm: judgment === "hit" ? planned.lengthCm : null,
      speedBonus: false,
    };
    row.speedBonus = isSpeedBonus(judgment, row.reactionTimeMs);
    session.trials.push(row);
    session.summary = computeSummary(session.trials);
    logTrial(session);

    // エンドレスは1回でも失敗したところで終わり（crane と同じ規則）。
    //
    // correctRejection は「押してはいけない合図で押さなかった」で、正しく
    // できた回。失敗に数えない——長靴で待てたことを失敗にすると、抑制の
    // 練習が成立しなくなる。
    if (config.endless && judgment !== "hit" && judgment !== "correctRejection") {
      endlessFailed = true;
    }

    // ここから先はすべて**入力より後**の音。
    //
    // この課題の測定刺激はアタリの合図音なので、それより前に音を足すことは
    // しない（前に鳴る音は、アタリの予告として働きうる＝反応時間の測定が
    // 成立しなくなる）。結果が確定したあとなら、その回の反応時間はもう
    // 確定しているので何を鳴らしても測定に関与しない。
    const now = audio.scheduler.now();
    if (judgment === "hit") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      // 水を切って上がってくる音。リールの巻き上げ（上がる掃引）と
      // 水しぶき（高い帯のノイズ）を重ねる。
      audio.playSweep({ fromHz: 240, toHz: 880, durationS: 0.34, gain: 0.03 });
      audio.playNoise({
        durationS: 0.3,
        gain: 0.026,
        filter: "highpass",
        frequency: 1400,
        sweepTo: 3200,
      });
      setStatus(row.speedBonus ? "fishing.fast" : "fishing.caught", { n: planned.lengthCm });
      reelIn(planned, row.speedBonus);
      updateScore();
      announce(
        t(row.speedBonus ? "fishing.voice.caughtFast" : "fishing.voice.caught", {
          n: planned.lengthCm,
        })
      );
    } else if (judgment === "correctRejection") {
      setStatus("fishing.goodWait");
      announce(t("fishing.voice.goodWait"));
    } else if (judgment === "falseStart") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      setStatus("fishing.tooEarly");
      announce(t("fishing.voice.tooEarly"));
    } else if (judgment === "commission") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      // 長靴。魚が上がる音と同じ「掛かった」でも、重くて鈍い音にして
      // 中身が違うことを耳で分ける。
      audio.playNoise({
        durationS: 0.26,
        gain: 0.024,
        filter: "lowpass",
        frequency: 520,
        sweepTo: 200,
      });
      setStatus("fishing.boot");
      announce(t("fishing.voice.boot"));
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      // 逃げられた。水に落ちて沈む音だけを残す（罰にならないよう小さく）。
      audio.playNoise({ durationS: 0.2, gain: 0.014, filter: "lowpass", frequency: 900, sweepTo: 300 });
      setStatus("fishing.lost");
      announce(t("fishing.voice.lost"));
    }

    updateStreak();
    // ここでは枠を進めない。枠の進行は advanceSlot()（＝時間）が担う。
    resolvedIndex = currentIndex;
    resolvedJudgment = judgment;
  }

  /**
   * 枠（1試行ぶんの時間）を1つ進める。判定窓を過ぎた時点で呼ぶ。
   * 未決着なら見逃し（real）／見送り成功（fake）として確定してから進める。
   */
  function advanceSlot() {
    const planned = trialsPlan[currentIndex];
    if (!planned) return;
    if (resolvedIndex !== currentIndex) {
      recordCurrent(planned.kind === "real" ? "timeout" : "correctRejection", null);
    }
    currentIndex += 1;
    resolvedJudgment = null;
    swimmerEl?.classList.remove("is-lost");
    // エンドレスは1回失敗したら終わり。難度が上がりつづける遊びに終わりの
    // 条件が無いと、いつ終わるかが「支援者が見ていて止める」だけになる
    // ——利用者からは、自分の操作と終わりが結びつかない。失敗で終わるなら、
    // どこまで続けられたかがそのまま結果になる。
    if (endlessFailed) {
      finalize();
      return;
    }
    if (currentIndex >= trialsPlan.length) finalize();
  }

  function finalize() {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    if (config.endless) {
      // エンドレスには「予定した試行数」が無い。実際にやった数を書き戻さないと
      // state.js の完走判定（trials.length === targetTrials）が合わず、
      // 再読み込みで aborted に倒れて成立確認の材料からも外れる。
      session.config.targetTrials = session.trials.length;
    }
    session.summary = computeSummary(session.trials);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const total = session.summary.totalLengthCm ?? 0;
    const catches = session.summary.catches ?? 0;
    voiceFeedback(
      t("fishing.voice.finish", { n: catches, cm: total }),
      t("fishing.voice.finishAnnounce", { n: catches, cm: total })
    );
    finish(session.summary);
  }

  /**
   * 泳ぎの位置（.fishing-scene に対する％）。3区間に分ける:
   *   1. 寄ってくる  … 右端 → 糸の位置。cueMs にちょうど糸へ着く
   *   2. 食いついている … 判定窓（cueMs 〜 cueMs+limitMs）のあいだ糸の位置に留まる
   *   3. 逃げる      … 窓を過ぎたら左へ抜ける
   * 画面に出ていない区間では null を返す。
   *
   * 2 の「留まる」が要点。以前は cueMs から limitMs+exitMs をかけて左端まで
   * 泳ぎ切らせていたため、判定窓の終わりには魚が画面外（x=-2%）にいた。
   * 反応時間 600ms でも既に x=34% まで進んでおり、「押せるのに魚はもういない」
   * という見た目と判定の食い違いが起きていた。アタリ＝魚が食いついている
   * 状態なので、押せるあいだは糸の位置にいるのが正しい。
   */
  function swimX(nowRelativeMs, planned) {
    const appearMs = planned.cueMs - config.approachMs;
    const holdEndMs = planned.cueMs + limitMsOf(planned);
    const leaveMs = holdEndMs + config.exitMs;
    if (nowRelativeMs < appearMs || nowRelativeMs > leaveMs) return null;
    if (nowRelativeMs <= planned.cueMs) {
      const progress = (nowRelativeMs - appearMs) / config.approachMs;
      return SPAWN_X_PERCENT + (LINE_X_PERCENT - SPAWN_X_PERCENT) * progress;
    }
    if (nowRelativeMs <= holdEndMs) return LINE_X_PERCENT;
    const progress = (nowRelativeMs - holdEndMs) / config.exitMs;
    return LINE_X_PERCENT + (EXIT_X_PERCENT - LINE_X_PERCENT) * progress;
  }

  function updateVisual(nowRelativeMs) {
    const planned = trialsPlan[currentIndex];
    if (!planned || !statusEl || !swimmerEl) return;

    // 巻き上げ演出中は CSS の遷移に任せる（rAF で位置を上書きしない）。
    if (reelingIndex >= 0) return;

    // 釣り上げ済みの魚は画面へ戻さない。枠の終わりまで進めるように変えた
    // ことで、巻き上げ演出が終わったあともまだ swimX() が座標を返す時間が
    // 残る。そのままだと釣ったはずの魚が水中に再出現して泳ぎ去ってしまう。
    if (resolvedIndex === currentIndex && resolvedJudgment === "hit") {
      swimmerEl.style.opacity = "0";
      swimmerEl.classList.remove("is-biting", "is-lost");
      return;
    }

    const x = swimX(nowRelativeMs, planned);
    if (x === null) {
      swimmerEl.style.opacity = "0";
    } else {
      if (swimmerArtEl && swimmerArtEl.dataset.index !== String(planned.index)) {
        swimmerArtEl.dataset.index = String(planned.index);
        swimmerArtEl.src = planned.kind === "fake" ? bootUrl : FISH_ART[planned.species];
        swimmerEl.classList.toggle("is-boot", planned.kind === "fake");
        // 画面上の大きさを魚種に合わせる（styles.css の
        // .fishing-swimmer[data-species]）。長さを cm で見せる以上、
        // 12cm と 48cm が同じ大きさに描かれていると数字が嘘になる。
        if (planned.species) swimmerEl.dataset.species = planned.species;
        else delete swimmerEl.dataset.species;
      }
      swimmerEl.style.opacity = "1";
      swimmerEl.style.left = `${x.toFixed(2)}%`;
    }

    // この枠は既に決着している（フライング／長靴を掛けた等）。魚は最後まで
    // 泳がせるが、掛かる対象ではないので薄く表示し、状態表示も上書きしない。
    // 「早すぎて逃した」という因果が目で見て分かるようにするための表示で、
    // ここで魚を消してしまうと音だけが鳴って画面に何も無い状態になる。
    const settled = resolvedIndex === currentIndex;
    swimmerEl.classList.toggle("is-lost", settled);
    if (settled) {
      swimmerEl.classList.remove("is-biting");
      return;
    }

    const beforeCue = nowRelativeMs < planned.cueMs;
    const withinWindow = nowRelativeMs <= planned.cueMs + limitMsOf(planned);
    if (beforeCue) {
      if (shownStatusKey !== "fishing.wait" && x !== null && x > 70) {
        setStatus("fishing.wait");
      }
    } else if (withinWindow) {
      setStatus("fishing.bite");
    }
    swimmerEl.classList.toggle("is-biting", !beforeCue && withinWindow);
  }

  function loop() {
    if (destroyed || finished || !session) return;
    const nowRelativeMs = toSessionRelativeMs(audio.scheduler.now() * 1000);
    const planned = trialsPlan[currentIndex];
    if (planned && nowRelativeMs > planned.cueMs + limitMsOf(planned)) {
      advanceSlot();
      if (finished || destroyed) return;
    }
    updateVisual(nowRelativeMs);
    updateProgress(nowRelativeMs);
    // 残りが少なくなったら空を夕方の色にする。音で急かすとアタリ音と
    // 混ざるので、時間の経過は光の変化だけで伝える。
    // 夕暮れも「もうすぐ終わり」の合図なので、エンドレスでは出さない。
    // 上限の15分に近づいたことを空の色で伝えても、利用者にとっては
    // 意味の無い合図になる（終わりは失敗で決まる）。
    sceneEl?.classList.toggle(
      "is-dusk",
      !config.endless && sessionEndMs - nowRelativeMs <= DUSK_MS
    );
    rafId = window.requestAnimationFrame(loop);
  }

  function handleInput(perfMs) {
    if (destroyed || finished || !session) return;
    pullLine();
    const inputMs = toSessionRelativeMs(toAudioAbsMs(perfMs));
    let planned = trialsPlan[currentIndex];

    // rAFの境界直前に入力が来ても、期限切れの枠を正常に確定してから
    // 次の前刺激区間の入力として扱う。
    while (planned && inputMs > planned.cueMs + limitMsOf(planned)) {
      advanceSlot();
      if (finished) return;
      planned = trialsPlan[currentIndex];
    }
    if (!planned) return;

    // この枠はもう決着している（フライング済みなど）。押しても何も起きない。
    // ここで次の枠へ持ち越すと、連打で先の試行を食い潰すことになる。
    if (resolvedIndex === currentIndex) return;

    // まだ受付の始まっていない試行に入力を当てない。
    //
    // 連打すると1回目で現在の試行が決着して currentIndex が進むため、
    // 2回目以降が「まだ音の鳴っていない次の試行」に当たっていた。とくに
    // fake は judgeReaction がタイミングを見ずに commission を返すので、
    // 連打だけで先の試行が次々と食い潰される。痙性や振戦のある利用者では
    // 起こりやすく、記録も実態と合わなくなる。
    //
    // 各試行の受付は前の試行の枠が終わった時点（startMs）から始まる。
    // 決着済みの試行の残り時間に来た入力はどの試行にも属さないので、
    // 記録せずに捨てる（誤った試行へ付け替えるより実態に近い）。
    if (inputMs < planned.startMs) return;

    const judgment = judgeReaction(inputMs, planned.cueMs, limitMsOf(planned), planned.kind);
    recordCurrent(judgment, inputMs);
  }

  /**
   * 1ゲームぶんの試行計画を作る。試行数は前刺激間隔の乱数で決まるので、
   * 多めに生成してから sessionMs に収まるところで切る。切ったあとの
   * 実数を config.targetTrials に書き戻すこと（state.js の完走判定が
   * trials.length === targetTrials を見るため）。
   */
  function buildPlan() {
    const maxTrials = Math.min(
      ENDLESS_MAX_TRIALS,
      Math.ceil(config.sessionMs / (config.foreperiodMinMs + config.limitMs)) + 2
    );
    const foreperiods = generateForeperiods(
      maxTrials,
      config.foreperiodMinMs,
      config.foreperiodMaxMs
    );

    const planned = [];
    let cursorMs = 0;
    for (const foreperiodMs of foreperiods) {
      // エンドレスでは試行ごとに受付時間が短くなる。枠の長さが変わるので、
      // 次の試行の開始位置もその試行の limitMs で決める。
      const limitMs = config.endless
        ? endlessLimitMs(config.limitMs, planned.length)
        : config.limitMs;
      const cueMs = cursorMs + foreperiodMs;
      if (cueMs + limitMs > config.sessionMs) break;
      // 記録が壊れる長さまでは伸ばさない（ENDLESS_MAX_TRIALS のコメント）。
      if (planned.length >= ENDLESS_MAX_TRIALS) break;
      // startMs = この試行の受付が始まる時刻（前の試行の枠の終わり）。
      // handleInput がこれを使って、決着済みの試行の残り時間に来た入力を
      // 次の試行へ持ち越さないようにする。
      planned.push({ index: planned.length, startMs: cursorMs, foreperiodMs, cueMs, limitMs });
      cursorMs = cueMs + limitMs;
    }

    const kindSequence = generateGoNoGoSequence(planned.length, 1 - config.fakeRatio).map(
      (kind) => (kind === "go" ? "real" : "fake")
    );

    const trials = planned.map((trial, index) => {
      const kind = kindSequence[index];
      const species = kind === "real" ? pickSpecies() : null;
      return {
        ...trial,
        kind,
        species: species ? species.id : null,
        lengthCm: species
          ? Math.round(species.minCm + Math.random() * (species.maxCm - species.minCm))
          : null,
      };
    });

    return {
      trials,
      kindSequence,
      foreperiods: trials.map((trial) => trial.foreperiodMs),
    };
  }

  function mount(el) {
    stageEl = el;
    stageEl.classList.add("module-fishing");
    renderMarkup();

    const { trials, kindSequence, foreperiods } = buildPlan();
    trialsPlan = trials;
    currentIndex = 0;
    endlessFailed = false;
    resolvedIndex = -1;
    resolvedJudgment = null;
    reelingIndex = -1;
    // 完走判定（state.js sanitizeReactionSession）が参照するため、
    // プリセットの固定値ではなく実際に計画した試行数を入れる。
    config.targetTrials = trials.length;

    const beats = trials.map((trial) => ({
      index: trial.index,
      timeS: trial.cueMs / 1000,
      tone: trial.kind === "real" ? cueTones.high : cueTones.noGo,
      gain: FEEDBACK_GAIN,
    }));

    const startAt = audio.scheduler.start({ beats });

    // AudioContext が使えない環境では start() が null を返す（audio.js）。
    //
    // このとき now() も常に 0 を返す。この課題は魚の動きも判定も
    // toSessionRelativeMs(audio.scheduler.now() * 1000) で回しているので、
    // 時計が止まったまま——アタリの合図は一度も鳴らず、魚も現れない。
    // それでも押下は受け付けられ、「合図の前に押した」＝フライングとして
    // **試行が記録されてしまう**（実測: 音の無い端末で2件記録された）。
    // 刺激を一度も出していない回のデータが、正常な反応時間の記録に混ざる。
    //
    // 黙って壊れるより、始められない理由を出して支援者に判断を返す。
    // リズムと同じ扱い（games/rhythm.js の renderUnavailable）。
    //
    // UFOキャッチャーは同じ検査を要らない: あちらはカウントインに壁時計の
    // 予備経路があり、位相の進行も performance.now() で回る。測るのも
    // 時刻ではなく床の上の位置なので、音が無くても測定は成立する。
    // 合図が鳴らせない状態は2つある。AudioContext が無い場合と、あるのに
    // 鳴らない場合（iOS の suspended / interrupted。他アプリの割り込み、
    // 着信、自動再生制限の解除しそこね）。どちらも「刺激を出していない回の
    // データ」を作るので、まとめて止める。後者はヘッドレスでは再現せず、
    // CI には出てこない種類の失敗。
    if (startAt === null || !audio.scheduler.canSound()) {
      audio.scheduler.stop();
      renderUnavailable(audio.scheduler.state());
      return;
    }

    anchorPerfMs = performance.now();
    sessionStartAudioMs = audio.scheduler.now() * 1000;
    const startOffsetMs = startAt * 1000 - sessionStartAudioMs;
    trialsPlan = trialsPlan.map((trial) => ({
      ...trial,
      cueMs: trial.cueMs + startOffsetMs,
      startMs: trial.startMs + startOffsetMs,
    }));
    // 残り時間の終端は sessionMs ではなく「最後の試行の枠が終わる時刻」。
    // 計画は1試行が丸ごと収まるところで打ち切るため末尾に最大6秒ほどの
    // 端数が残り、sessionMs を終端にすると「のこり 0:04」を表示したまま
    // ゲームが終わってしまう（実測でそうなっていた）。
    const lastTrial = trialsPlan[trialsPlan.length - 1];
    sessionEndMs = lastTrial
      ? lastTrial.cueMs + limitMsOf(lastTrial)
      : config.sessionMs + startOffsetMs;

    session = {
      sessionId: generateSessionId(),
      taskType: "rt",
      gameId,
      participantId: ctx.participantId || "",
      startedAtIso: new Date().toISOString(),
      aborted: false,
      finished: false,
      config: {
        ...config,
        seedSequence: foreperiods,
        kindSequence,
        // その回が「そくてい」か「れんしゅう」か（src/lib/difficultyMode.js）。
        //
        // リズム・クレーン・リールは記録していたのに、反応課題だけ落ちていた
        // ——config にも sanitize にもCSVにも無く、3経路すべてで欠けていた。
        // さかなつりは成立確認の「いしを もって おせる」の根拠にも使う
        // （src/lib/readinessCheck.js）ので、どちらの回の記録かを言えないと、
        // 成立確認の材料そのものが層別できない。
        //
        // 注意: fishing は MEASUREMENT_PROTOCOL に項目を持たない。つまり
        // ここでの "measure" は「そくていモードで走らせた回」であって
        // 「パラメータが protocol で固定されていた回」ではない。パラメータは
        // fishingPresets 由来のまま同じ行に出るので、解析側はそちらで確かめ
        // られる。
        difficultyMode: resolveDifficultyMode(ctx.settings),
        // 成立確認の状態（met / overridden / n/a）。他の課題と同じ意味。
        measurementReadiness: ctx.readiness || "n/a",
      },
      device: audio.getDeviceInfo(),
      trials: [],
      summary: computeSummary([]),
    };
    logTrial(session);
    updateProgress(0);
    updateScore();
    rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopLoop();
    window.clearTimeout(castTimer);
    window.clearTimeout(catchTimer);
    audio.scheduler.stop();
    if (session && !finished) {
      if (config.endless) {
        // エンドレスには「予定した終わり」が無いので、止めたところが終わり。
        // aborted のままにすると成立確認の材料から外れる（readinessCheck.js の
        // isUsable は aborted を使わない）——さかなつりは「いしを もって
        // おせる」の根拠なので、ここが外れると成立確認が通らなくなる。
        //
        // 実際にやった数を targetTrials へ書き戻す（state.js の完走判定が
        // trials.length === targetTrials を見る）。
        session.finished = true;
        session.aborted = false;
        session.config.targetTrials = session.trials.length;
      } else {
        session.aborted = true;
      }
      session.summary = computeSummary(session.trials);
      logTrial(session);
    }
    if (stageEl) {
      stageEl.classList.remove("module-fishing");
      stageEl.innerHTML = "";
    }
    stageEl = null;
    statusEl = null;
    sceneEl = null;
    lineEl = null;
    swimmerEl = null;
    swimmerArtEl = null;
    catchEl = null;
    scoreEl = null;
    streakEl = null;
  }

    return { mount, handleInput, destroy };
  };
}
