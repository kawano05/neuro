// =====================================================================
// games/crane.js — 「アームを とめる」（UFOキャッチャー）
//
// 課題としては従来どおり2軸ポイント走査（taskType: "scan"）。掴み成否は
// 距離だけから決まり、乱数も物理エンジンも使わない。判定は games/pointing.js の
// evaluatePick / graspOutcome のままで、記録スキーマ（state.js の
// sanitizeScanTrial）も変えていない——見た目と手応えだけを作り直した。
//
// なぜ疑似3Dにしたか:
//   以前の盤面は格子の入った長方形を真横から見た絵で、そこに縦横の走査線を
//   引き、アームは「選んだYの位置」まで画面下方向に降りて止まっていた。
//   ところが実機のUFOキャッチャーは X=左右 / Y=奥行き / Z=落下 の3軸で、
//   利用者が指定するのは床の一点（X,Y）、落下は自動。旧表現はYを「高さ」と
//   「奥行き」の両方に使い回していたため、何を指定しているのかが絵から
//   読み取れなかった。
//
//   ここでは床を正方形（0..100 × 0..100）と定義し、それを透視投影して
//   台形に描く。X の1%と Y の1%が床の上で同じ長さを表すので、
//   hypot(dx, dy) が床上の実距離になる。旧実装では盤面が横長の長方形で、
//   X の1%（約7px）と Y の1%（約4px）が別の長さだったため、判定の許容円が
//   画面上では横に潰れた楕円になっていた——景品のど真ん中に見えていても
//   縦に少しずれると miss、という不公平が起きていた。透視投影にすると、
//   許容範囲を床の上の楕円としてそのまま描けるので、見た目と判定が一致する。
//
// なぜ許容範囲を描くのか:
//   「どのくらい近ければ掴めるのか」が画面のどこにも無かった。この課題の
//   目標は狙いを定めることなので、目標そのものを隠す理由がない。景品の足元に
//   掴める範囲のリングを描き、アームの影を床に落として着地点を予告する。
//
// なぜ入力ガードを入れたか:
//   旧実装は X を押した瞬間を Y 走査の起点にしていたため、痙性や振戦で
//   200ms 後にもう一度入ってしまうと Y が走査のほぼ先頭で確定し、ほぼ確実に
//   miss になった。理由の説明も無い。INPUT_GUARD_MS のあいだの入力は
//   試行に使わず、「まってね」の合図だけ返す（黙って捨てない）。
// =====================================================================

import { cranePresets, cranePrizes, cueTones } from "../content.js";
import {
  ENDLESS_PROTOCOL_VERSION,
  endlessDifficultyStep,
  resolveCraneDifficulty,
  resolveDifficultyMode,
  resolveEndlessMode,
} from "../difficultyMode.js";
import { evaluatePick, graspOutcome, scanPercentAt } from "./pointing.js";
import {
  CRANE_CHUTE as CHUTE,
  CRANE_GEOM as GEOM,
  assistedToleranceR,
  floorCircleSize,
  floorCssVars,
  pickTarget,
  project,
} from "./craneGeometry.js";
import { PRIZE_ART, clawClosedUrl, clawOpenUrl } from "./craneArt.js";

const FEEDBACK_GAIN = 0.05;
const MISS_GAIN = 0.018;
/** 走査カーソルが目標を通過した合図。目で追いにくい利用者への補助なので控えめに。 */
const PASS_GAIN = 0.016;

const COUNT_IN_STEP_S = 0.55;

/**
 * カウントインを打ち切る保険（mount からの経過、performance.now 基準）。
 *
 * 走査の開始は本来 audio.scheduler.now()（AudioContext の時計）が
 * カウントイン4拍ぶん進んだ時点で判定する。拍の音と画面の動き出しを
 * 揃えたいので、音が鳴る環境ではこちらが正しい。
 *
 * ただし AudioContext が suspended のままだと currentTime は進まない。
 * WKWebView（サイレントスイッチ、自動再生ポリシー）やヘッドレスの WebKit が
 * まさにそれで、その場合このゲームは「じゅんび」の表示で永久に止まり、
 * 「おわる」以外に出口が無かった。音が出ないことと遊べないことは別なので、
 * 壁時計でも同じ長さが過ぎたら走査を始める。
 *
 * 値は scheduler の START_DELAY_S(0.3) + 3拍ぶん + 余裕。
 */
const COUNT_IN_FALLBACK_MS = 0.3 * 1000 + 3 * COUNT_IN_STEP_S * 1000 + 250;

/**
 * 掴みの演出。旧実装は「降りて止まる」の1200msだけで、掴めたかどうかは
 * アームの文字色が変わることでしか分からなかった。降りる→閉じる→上がる、
 * までを分けると、閉じた瞬間に結果が出て、そのあと成功だけが景品口へ運ばれる
 * ——成功の方が長く祝われ、失敗は早く次へ行く。
 */
const DROP_MS = 550;
const CLOSE_MS = 300;
const LIFT_MS = 550;
const CARRY_MS = 700;
const RESULT_HOLD_MS = 650;

/**
 * フェーズが切り替わった直後、この時間の入力は試行に使わない。
 * 押した本人の意図しない二度押し（痙性・振戦・スイッチのバウンス）で
 * 次の軸が即座に確定してしまうのを防ぐ。捨てるのではなく合図を返す。
 */
const INPUT_GUARD_MS = 320;

/**
 * 降下・上昇・搬送の緩急。
 *
 * 一定速度で動かすと、機械が「値を更新している」だけに見えて、重いものを
 * 掴んで持ち上げている感じが出ない。動き出しと止まり際をなだらかにする。
 * ここは見た目だけの話で、フェーズの長さ（DROP_MS 等）も判定も変えない。
 */
function easeInOut(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 2 * clamped * clamped
    : 1 - ((-2 * clamped + 2) ** 2) / 2;
}

/**
 * 筐体の奥に置いておく飾りの景品。狙う対象ではない（リングも影も付かない）。
 * 床の奥側の隅にだけ置くのは、狙っている景品と紛れないようにするため。
 * 実機の「まだ残っている景品」にあたる、奥行きの手がかりでもある。
 */
const DECOR_SPOTS = [
  { x: 9, y: 10 },
  { x: 91, y: 14 },
  { x: 31, y: 6 },
];

function generateSessionId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `s-${datePart}-${timePart}-${Math.random().toString(36).slice(2, 4)}`;
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

function pickPrize() {
  return cranePrizes[Math.floor(Math.random() * cranePrizes.length)];
}

function computeSummary(trials, collected = []) {
  const distances = trials.map((trial) => trial.distance);
  const grips = trials.filter((trial) => trial.judgment === "grip").length;
  const slips = trials.filter((trial) => trial.judgment === "slip").length;
  const misses = trials.filter((trial) => trial.judgment === "miss").length;
  const meanDistance = average(distances);

  // 連続記録。すべった（slip）は掴めてはいるが景品口まで運べていないので
  // 連続は切る。ここを甘くすると「とりあえず押す」が最適な遊び方になる。
  let streak = 0;
  let bestStreak = 0;
  trials.forEach((trial) => {
    if (trial.judgment === "grip") {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  });

  return {
    trials: trials.length,
    grips,
    slips,
    misses,
    gripRate: trials.length ? grips / trials.length : 0,
    meanDistance,
    sdDistance: standardDeviation(distances, meanDistance),
    medianDistance: median(distances),
    meanXPhaseMs: average(trials.map((trial) => trial.xPhaseMs)),
    meanYPhaseMs: average(trials.map((trial) => trial.yPhaseMs)),
    // 以下は遊びの表示用。state.js の scan スキーマ外なので永続化されない
    // （リザルトへは ctx.finish(summary) で直接渡すのでその場では出せる。
    //  games/fishing.js のスコア表示と同じ扱い）。
    closestDistance: distances.length ? Math.min(...distances) : null,
    bestStreak,
    currentStreak: streak,
    /** 取れた景品（content.js の cranePrizes の要素）。リザルトに並べる。 */
    collected: [...collected],
  };
}

/**
 * 優先順位: settings 側の値（null 以外）＞ content.js の cranePresets。
 * games/rhythm.js の resolveParams と同じ考え方で、支援者が設定画面から
 * 難易度を変えられるようにする（0/5 が続く利用者にコード編集以外の手が
 * 無かった）。値そのものはセッションの config と各試行に記録されるので、
 * どの条件で測ったかは後から追える。
 */
/**
 * エンドレスの上限回数。
 *
 * 無制限にはしない。state.js の scan セッション検証が targetTrials を
 * 1〜100 で切るため、これを超えて記録すると再読み込みで「完走していない回」
 * に倒れ、成立確認の材料からも外れる（readinessCheck.js の isUsable は
 * aborted の回を使わない）。記録が壊れるくらいなら上限で終わる。
 */
const ENDLESS_MAX_TRIALS = 100;

/**
 * エンドレスの難度の上げ方。
 *
 * 2段構えにする。**先に掴める範囲を詰め、詰めきってから速さを上げる。**
 *
 *   1段目（0〜5段） 掴める範囲 toleranceR を 15%ずつ狭める
 *                    15 → 12.75 → 10.8 → 9.2 → 7.8 → 6.6
 *   2段目（6〜11段） 範囲は下限のまま、アームの速さ sweepMs を 12%ずつ詰める
 *                    2200 → 1936 → 1704 → 1500 → 1320 → 1161 → 1100ms
 *
 * 順番に意味がある。範囲を狭めるのは「どこを狙うか」の課題を難しくする
 * ——見て狙う練習はここで伸びる。速さを上げるのは「いつ押すか」の課題を
 * 難しくする。同時に上げると、外した原因が狙いなのか間合いなのか、本人にも
 * 支援者にも分からない。片方ずつなら、どこで終わったかがそのまま「何が
 * 難しかったか」になる。
 *
 * 要求される時間精度は「grip圏の半径 × sweepMs/100」（content.js）。
 * 既定 15/2200 で各軸 ±165ms、1段目の終わりで ±73ms、2段目の終わりで ±36ms。
 * 人が確実に出せる精度は超える——が、エンドレスは1回失敗で終わる遊びなので、
 * いつか必ず届かなくなるのが正しい。どこまで続けられたかが結果になる。
 *
 * 速さの下限 1100ms には別の理由もある。フェーズ開始から INPUT_GUARD_MS
 * （320ms）の入力は捨てるので、掃引がこれに近づくと「押せない時間」が
 * 掃引の大半を占める。掃引は往復する（pointing.js の scanPercentAt は
 * 周期 2×sweepMs の三角波）ので位置そのものは到達可能なままだが、
 * 3倍以上の余裕は残す。
 */
const ENDLESS_TRIALS_PER_STEP = 3;
const ENDLESS_TOLERANCE_STEPS = 5;
const ENDLESS_SPEED_STEPS = 6;
const ENDLESS_MAX_STEP = ENDLESS_TOLERANCE_STEPS + ENDLESS_SPEED_STEPS;
const ENDLESS_TOLERANCE_RATIO = 0.85;
const ENDLESS_MIN_TOLERANCE_R = 6;
const ENDLESS_SWEEP_RATIO = 0.88;
const ENDLESS_MIN_SWEEP_MS = 1100;

/** この試行が何段目か（0始まり）。1段目と2段目の切り分けはここが元。 */
function endlessStepAt(trialIndex) {
  return endlessDifficultyStep(trialIndex, ENDLESS_TRIALS_PER_STEP, ENDLESS_MAX_STEP);
}

/**
 * エンドレスで、この試行に適用する掴める範囲。
 *
 * アシスト（連続で外したときに一時的に広げる assistedToleranceR）とは別物で、
 * こちらが先に効く土台。土台を狭めたうえで、外しつづければアシストが広げる
 * ——「難しくなるが、詰むことはない」を両方成り立たせる。
 */
export function endlessToleranceR(baseR, trialIndex) {
  const step = Math.min(endlessStepAt(trialIndex), ENDLESS_TOLERANCE_STEPS);
  // 下限（ENDLESS_MIN_TOLERANCE_R）は既定の 15 を前提にした安全弁だが、
  // 支援者は 4 まで狭められる（state.js の craneToleranceR は 4〜40）。
  // max だけで挟むと、4 で始めた回が1試行目に 6 へ**広がって易しくなり**、
  // 以後ずっと 6 のまま動かない——「続けるほど難しくなる」の表示が嘘になる。
  // 始めた条件より易しくしないことを Math.min で保証する（2026-08-29）。
  return Math.min(baseR, Math.max(ENDLESS_MIN_TOLERANCE_R, baseR * ENDLESS_TOLERANCE_RATIO ** step));
}

/**
 * エンドレスで、この試行に適用するアームの速さ（片道の掃引時間）。
 *
 * 範囲を詰めきる（ENDLESS_TOLERANCE_STEPS 段）まではプリセットのまま。
 * そこから先だけ速くする。
 */
export function endlessSweepMs(baseSweepMs, trialIndex) {
  const speedStep = Math.max(0, endlessStepAt(trialIndex) - ENDLESS_TOLERANCE_STEPS);
  if (speedStep === 0) return baseSweepMs;
  // 許容半径と同じ理由（支援者は 800ms まで速められる）。max だけで挟むと、
  // 800ms で始めた回が速度段階で 1100ms へ**遅くなって易しくなる**。
  return Math.min(
    baseSweepMs,
    Math.max(ENDLESS_MIN_SWEEP_MS, baseSweepMs * ENDLESS_SWEEP_RATIO ** speedStep)
  );
}

function resolveCraneConfig(settings, readiness, requestedEndless) {
  // そくていの回は protocol 固定・アシスト無し・通過音無し、
  // れんしゅうの回は支援者の設定 → 既定の順（src/lib/difficultyMode.js）。
  // どちらの回だったかも config に残して、CSVと評価ログに出す。
  return {
    ...resolveCraneDifficulty(settings, cranePresets),
    // 「ずっとあそぶ」の回か。そくていでは resolveEndlessMode が必ず false を
    // 返すので、測る回の試行数は protocol のまま動かない。
    endless: resolveEndlessMode(settings, requestedEndless),
    // 難度の上げ方の版。定数を変えると回どうしを比べられなくなるので、
    // どの版で走った回かを残す（difficultyMode.js）。
    endlessProtocolVersion: resolveEndlessMode(settings, requestedEndless)
      ? ENDLESS_PROTOCOL_VERSION
      : null,
    difficultyMode: resolveDifficultyMode(settings),
    // そくていに入る前の成立確認が通っていたか（src/lib/readinessCheck.js）。
    // リズムと同じ理由でここにも残す——測定条件は禁止せず記録する。
    measurementReadiness: readiness || "n/a",
  };
}

export function createCraneGame(ctx) {
  const { audio, announce, voiceFeedback, logTrial, finish, setProgress, t, tHtml } = ctx;

  /**
   * 景品の名前。
   *
   * content.js の label は日本語のままなので、そこを直に差し込むと英語表記でも
   * 「Got the くまさん!」になる——外側だけ訳しても、埋め込むデータが日本語なら
   * 直らない。辞書に無い景品を足したときは label へ落ちる（名前が消えるより
   * 日本語で出るほうがまし）。
   */
  function prizeName(prize) {
    const key = `prize.${prize.id}`;
    const name = t(key);
    return name === key ? prize.label : name;
  }
  // 注意: この名前は画面（tHtml の差し込み値）にも読み上げにも使う。
  // 差し込み値はエスケープされるただの文字なので、**名前に漢字があっても
  // ルビは乗らない**。いまの景品名はすべてかな・カタカナなので問題ないが、
  // 漢字の名前を足すと静かにルビだけ落ちる。その線は
  // tests/i18n.test.mjs の「景品名に漢字を使わない」で縛ってある。
  const config = resolveCraneConfig(ctx.settings, ctx.readiness, ctx.endless);
  let stageEl = null;
  let sceneEl = null;
  let statusEl = null;
  let scoreEl = null;
  let streakEl = null;
  let railEl = null;
  let trolleyEl = null;
  let cableEl = null;
  let clawEl = null;
  let shadowEl = null;
  let ringEl = null;
  let prizeEl = null;
  let chuteEl = null;
  let collectedEl = null;
  let guideXEl = null;
  let guideYEl = null;
  let rafId = null;
  let destroyed = false;
  let finished = false;

  let phase = "countIn";
  let countInEndAudioMs = 0;
  let mountedPerfMs = 0;
  let phaseStartedPerfMs = 0;
  let selectedX = null;
  let selectedY = null;
  let xPhaseMs = 0;
  let yPhaseMs = 0;
  let currentIndex = 0;
  let session = null;
  let targets = [];
  let prizes = [];
  let judgment = null;
  let collected = [];
  /** 直近で連続して掴めなかった回数。掴めたら 0 に戻る（アシストの入力）。 */
  let consecutiveFailures = 0;
  /** この試行で実際に適用する許容半径。試行ごとに記録する。 */
  let trialToleranceR = config.toleranceR;
  // この試行に適用したアームの速さ。エンドレスでは試行ごとに変わるので、
  // 描画・判定・記録がすべて同じ値を見る必要がある（config を直に読まない）。
  let trialSweepMs = config.sweepMs;
  /** 走査カーソルの前フレーム位置。目標通過の合図音を1回だけ鳴らすのに使う。 */
  let lastPercent = null;
  let waitNudgeTimer = null;

  function currentTarget() {
    return targets[currentIndex];
  }

  function currentPrize() {
    return prizes[currentIndex];
  }

  /** 奥に転がしておく飾りの景品。狙う対象ではないので影もリングも付けない。 */
  function decorMarkup() {
    return DECOR_SPOTS.map((spot, index) => {
      const prize = cranePrizes[index % cranePrizes.length];
      const at = project(spot.x, spot.y);
      return `<img class="crane-decor" src="${PRIZE_ART[prize.asset]}" alt=""
        style="left:${at.left}%;top:${at.top}%;--prize-scale:${at.scale.toFixed(3)}" />`;
    }).join("");
  }

  function renderMarkup() {
    // 筐体を「ガラスの箱」だけで描くと、iPad縦では上下に画面の半分ぶんの
    // 空きが残る。.crane-stage の 4:3 は動かせない——縦横比を変えると透視の
    // 見え方が変わり、床の上の距離感（＝狙いの付け方）が画面ごとに変わる
    // （このファイル下部の GEOM と styles.css のコメント参照）。
    //
    // なので箱を引き伸ばすのではなく、空きのほうを筐体の一部にする。上に
    // marquee（台の看板）、下に本体と景品の取り出し口を置くと、画面全体が
    // 「1台の筐体が立っている」構図になり、空きが消える。中身の幾何は
    // 一切さわっていない。
    stageEl.innerHTML = `
      <div class="crane-cabinet" aria-hidden="true">
        <div class="crane-marquee">
          <span class="crane-marquee-title">UFO CATCHER</span>
          <div class="crane-score">${tHtml("crane.score", { n: 0 })}</div>
        </div>
        <div class="crane-stage">
          <div class="crane-back"></div>
          <div class="crane-floor"></div>
          ${decorMarkup()}
          <div class="crane-chute"><span class="crane-chute-mouth"></span></div>
          <div class="crane-rail"></div>
          <div class="crane-trolley"></div>
          <div class="crane-cable"></div>
          <svg class="crane-guides" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line class="crane-guide crane-guide-x" vector-effect="non-scaling-stroke" />
            <line class="crane-guide crane-guide-y" vector-effect="non-scaling-stroke" />
          </svg>
          <span class="crane-ring"></span>
          <span class="crane-shadow"></span>
          <img class="crane-prize" src="" alt="" />
          <img class="crane-claw" src="${clawOpenUrl}" alt="" />
          <div class="crane-glass"></div>
          <div class="crane-streak"></div>
        </div>
        <div class="crane-console">
          <div class="crane-status">${tHtml("crane.ready")}</div>
          <!--
            取れた景品が溜まる取り出し口。以前はガラス箱の中に浮いた行として
            出していたが、筐体の絵の中では「どこに溜まっているのか」が
            分からなかった。実物と同じ場所へ置くと、増えていることが
            数字を読まなくても伝わる。
          -->
          <div class="crane-tray">
            <span class="crane-tray-label">${tHtml("crane.tray")}</span>
            <div class="crane-collected"></div>
          </div>
        </div>
      </div>
    `;
    sceneEl = stageEl.querySelector(".crane-stage");
    // 床の台形と景品口の位置は craneGeometry.js が唯一の出どころ。
    // styles.css はここで入るカスタムプロパティを読む（clip-path と .crane-chute）。
    Object.entries(floorCssVars()).forEach(([key, value]) => {
      sceneEl.style.setProperty(key, value);
    });
    statusEl = stageEl.querySelector(".crane-status");
    scoreEl = stageEl.querySelector(".crane-score");
    streakEl = stageEl.querySelector(".crane-streak");
    railEl = stageEl.querySelector(".crane-rail");
    trolleyEl = stageEl.querySelector(".crane-trolley");
    cableEl = stageEl.querySelector(".crane-cable");
    clawEl = stageEl.querySelector(".crane-claw");
    shadowEl = stageEl.querySelector(".crane-shadow");
    ringEl = stageEl.querySelector(".crane-ring");
    prizeEl = stageEl.querySelector(".crane-prize");
    chuteEl = stageEl.querySelector(".crane-chute");
    collectedEl = stageEl.querySelector(".crane-collected");
    guideXEl = stageEl.querySelector(".crane-guide-x");
    guideYEl = stageEl.querySelector(".crane-guide-y");
  }

  /**
   * 床の上に引く走査線。
   *
   * 奥行きを付けた副作用として、走査中のアームと景品は「床の上では同じ x」でも
   * 奥行きが違えば画面上では重ならない（透視で内側に寄る）。アームの絵だけを
   * 頼りに狙うと、画面で合わせたのに判定は外れる——直そうとしていた不公平が
   * 形を変えて戻ってくる。そこで床そのものに線を引く。x 一定の線は奥へ向かって
   * 収束し、y 一定の線は水平になる。どちらも床の上の実際の位置なので、
   * 線が景品を通れば必ず当たる。
   *
   * SVG は viewBox="0 0 100 100" + preserveAspectRatio="none" なので、
   * 座標をそのままステージの％で書ける（線の太さは non-scaling-stroke で保つ）。
   */
  function updateGuides(x, y) {
    if (!guideXEl || !guideYEl) return;
    const showX = x !== null && x !== undefined;
    const showY = y !== null && y !== undefined;
    if (showX) {
      const far = project(x, 0);
      const near = project(x, 100);
      guideXEl.setAttribute("x1", far.left.toFixed(2));
      guideXEl.setAttribute("y1", String(GEOM.farTop));
      guideXEl.setAttribute("x2", near.left.toFixed(2));
      guideXEl.setAttribute("y2", String(GEOM.nearTop));
    }
    if (showY) {
      const at = project(0, y);
      guideYEl.setAttribute("x1", at.left.toFixed(2));
      guideYEl.setAttribute("y1", at.top.toFixed(2));
      guideYEl.setAttribute("x2", project(100, y).left.toFixed(2));
      guideYEl.setAttribute("y2", at.top.toFixed(2));
    }
    guideXEl.classList.toggle("is-shown", showX);
    guideYEl.classList.toggle("is-shown", showY);
    // 走査中の軸だけを明るくする。確定済みの軸は「もう決めた線」として残す。
    guideXEl.classList.toggle("is-active", phase === "x");
    guideYEl.classList.toggle("is-active", phase === "y");
  }

  /** 景品と「掴める範囲」のリングを、いまの目標に合わせて置き直す。 */
  function placeTarget() {
    const target = currentTarget();
    const prize = currentPrize();
    const at = project(target.x, target.y);
    prizeEl.src = PRIZE_ART[prize.asset];
    prizeEl.style.left = `${at.left}%`;
    prizeEl.style.top = `${at.top}%`;
    prizeEl.style.setProperty("--prize-scale", at.scale.toFixed(3));
    prizeEl.classList.remove("is-lifted", "is-dropped", "is-slipped");
    prizeEl.style.opacity = "1";

    // 掴める範囲（grip 圏 = その試行の toleranceR の半分）を床の上の楕円と
    // して描く。寸法は craneGeometry.js の floorCircleSize が投影から出すので、
    // 描いた楕円の中に入っていれば必ず判定にも入る（tests/crane-geometry で固定）。
    // アシストで許容が広がった試行では、この輪がそのぶん大きくなる。
    const ring = floorCircleSize(trialToleranceR * 0.5, target.y);
    ringEl.style.left = `${at.left}%`;
    ringEl.style.top = `${at.top}%`;
    ringEl.style.width = `${ring.width}%`;
    ringEl.style.height = `${ring.height}%`;
  }

  /** アームと、そこにぶら下がる索・台車・影の位置を1フレームぶん更新する。 */
  function placeClaw(x, y, dropT = 0) {
    const at = project(x, y);
    const altitude = GEOM.altitude * at.scale * (1 - dropT);
    const clawTop = at.top - altitude;
    clawEl.style.left = `${at.left}%`;
    clawEl.style.top = `${clawTop}%`;
    clawEl.style.setProperty("--claw-scale", at.scale.toFixed(3));

    // 影は床の着地点。奥行きが分かりにくい絵なので、どこに降りるかを
    // 影だけは常に正直に示す。
    shadowEl.style.left = `${at.left}%`;
    shadowEl.style.top = `${at.top}%`;
    shadowEl.style.setProperty("--shadow-scale", at.scale.toFixed(3));
    shadowEl.style.opacity = String(0.32 + 0.3 * dropT);

    const railTop = parseFloat(railEl.dataset.top || "8");
    trolleyEl.style.left = `${at.left}%`;
    cableEl.style.left = `${at.left}%`;
    cableEl.style.top = `${railTop}%`;
    cableEl.style.height = `${Math.max(0, clawTop - railTop)}%`;
  }

  function updateProgress() {
    if (config.endless) {
      setProgress(t("progress.endlessCount", { n: currentIndex + 1 }));
      return;
    }
    setProgress(t("progress.remainingCount", { n: Math.max(0, config.targetTrials - currentIndex) }));
  }

  function updateScore() {
    if (!scoreEl || !session) return;
    scoreEl.innerHTML = tHtml("crane.score", { n: session.summary.grips ?? 0 });
  }

  /** 連続記録は3から出す（1・2で出すと常時点灯して意味を失う）。 */
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
   * いま受け付けられない入力に返す合図。黙って捨てると「壊れた」と
   * 区別がつかないので、必ず何かを返す（音は鳴らさない。走査中の
   * 通過音と紛れるため）。
   */
  function nudgeWait() {
    if (!sceneEl) return;
    sceneEl.classList.add("is-waiting");
    window.clearTimeout(waitNudgeTimer);
    waitNudgeTimer = window.setTimeout(() => {
      sceneEl?.classList.remove("is-waiting");
    }, 280);
  }

  function setPhase(next, perfMs) {
    phase = next;
    phaseStartedPerfMs = perfMs;
    lastPercent = null;
  }

  function startXPhase(perfMs) {
    setPhase("x", perfMs);
    selectedX = null;
    selectedY = null;
    judgment = null;
    // この試行の許容半径を先に決める。リングの大きさと判定は必ず同じ値を使う。
    //
    // エンドレスでは土台そのものが試行とともに狭くなる。その上に従来の
    // アシスト（連続で外したら一時的に広げる）を重ねる——難しくしつつ、
    // 外しつづけたときの逃げ道は残す。
    const baseToleranceR = config.endless
      ? endlessToleranceR(config.toleranceR, currentIndex)
      : config.toleranceR;
    // 速さもここで確定させる。掃引の描画と、押した瞬間の位置計算が別の値を
    // 使うと、見えている場所と判定される場所がずれる。
    trialSweepMs = config.endless
      ? endlessSweepMs(config.sweepMs, currentIndex)
      : config.sweepMs;
    trialToleranceR = assistedToleranceR(
      baseToleranceR,
      consecutiveFailures,
      config.assistMaxSteps,
      config.assistStepRatio
    );
    statusEl.innerHTML = tHtml("crane.movingX");
    sceneEl.classList.remove("is-grip", "is-slip", "is-miss");
    clawEl.src = clawOpenUrl;
    clawEl.classList.remove("is-holding");
    placeTarget();
    placeClaw(0, 50, 0);
    updateGuides(null, null); // 前の試行で確定した線を残さない
  }

  function startYPhase(perfMs) {
    setPhase("y", perfMs);
    statusEl.innerHTML = tHtml("crane.movingY");
    // 横が決まった、という返事。押した結果が画面の変化だけだと、画面を
    // 見つづけるのが難しい利用者には何も届かない。位置の情報は載せない
    // （どこで止まったかを音で言うと、通過音と同じ問題になる）。
    audio.playNoise({ durationS: 0.09, gain: 0.03, filter: "bandpass", frequency: 900, q: 6 });
  }

  function startDrop(perfMs) {
    setPhase("drop", perfMs);
    statusEl.innerHTML = tHtml("crane.dropping");
    // アームが降りる。下がる動きに合わせて音も下がる。
    audio.playSweep({ fromHz: 520, toHz: 180, durationS: 0.42, gain: 0.03 });
    audio.playNoise({
      durationS: 0.42,
      gain: 0.014,
      filter: "lowpass",
      frequency: 700,
      sweepTo: 260,
    });
  }

  /**
   * 掴みの成否を確定する。ここで初めて判定・記録・音が出る
   * （アームが閉じた瞬間＝結果が分かる瞬間に揃える）。
   */
  function resolveTrial() {
    const target = currentTarget();
    const prize = currentPrize();
    const result = evaluatePick(
      { x: selectedX, y: selectedY },
      { x: target.x, y: target.y, r: trialToleranceR }
    );
    judgment = graspOutcome(result.distance, trialToleranceR);
    // 連続失敗はここで更新する。次の試行の startXPhase がこれを読んで
    // 許容半径を決める（掴めたら 0 に戻すので、上達すれば元の難度に戻る）。
    consecutiveFailures = judgment === "grip" ? 0 : consecutiveFailures + 1;
    if (judgment === "grip") collected.push(prize);
    session.trials.push({
      index: currentIndex,
      targetX: target.x,
      targetY: target.y,
      toleranceR: trialToleranceR,
      // その試行のアームの速さ。要求された時間精度は
      // 「grip圏の半径 × sweepMs/100」なので、これが無いと、同じ距離の外れ方
      // でも「どれだけ難しい試行だったか」を後から言えない。
      sweepMs: trialSweepMs,
      selectedX,
      selectedY,
      dx: result.dx,
      dy: result.dy,
      distance: result.distance,
      xPhaseMs,
      yPhaseMs,
      judgment,
    });
    session.summary = computeSummary(session.trials, collected);
    logTrial(session);

    const now = audio.scheduler.now();
    clawEl.src = clawClosedUrl;
    sceneEl.classList.add(`is-${judgment}`);
    // 音でも3つの結果を describe する。以前は高さの違うサイン波が1つ鳴るだけで、
    // 掴んだ・すべった・届かなかったの区別が音からはつきにくかった。
    // どれもアームが閉じたあと（結果が確定したあと）に鳴るので、測定には
    // 関与しない。
    if (judgment === "grip") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      // 爪が閉じて景品を噛む金属音＋持ち上がる音。
      audio.playNoise({ durationS: 0.07, gain: 0.035, filter: "bandpass", frequency: 2600, q: 3 });
      audio.playSweep({ fromHz: 260, toHz: 700, durationS: 0.36, gain: 0.028 });
      statusEl.innerHTML = tHtml("crane.gotPrize", { name: prizeName(prize) });
      clawEl.classList.add("is-holding");
      prizeEl.classList.add("is-lifted");
      voiceFeedback(
        t("crane.voice.grip", { name: prizeName(prize) }),
        t("crane.voice.gripAnnounce", { name: prizeName(prize) })
      );
    } else if (judgment === "slip") {
      audio.playToneAt(cueTones.noGo, now, FEEDBACK_GAIN);
      // 一度は噛んだ音を出してから、ずり落ちる音で下がる。「掴めてはいた」を
      // 音の順序でも表す。
      audio.playNoise({ durationS: 0.06, gain: 0.03, filter: "bandpass", frequency: 2400, q: 3 });
      audio.playSweep({ fromHz: 520, toHz: 200, durationS: 0.3, gain: 0.026 });
      statusEl.innerHTML = tHtml("crane.slip");
      // 掴めてはいたので、景品が一度動いて戻ることで「惜しい」を絵でも返す。
      prizeEl.classList.add("is-slipped");
      voiceFeedback(
        t("crane.voice.slip"),
        t("crane.voice.slipAnnounce")
      );
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      // 何にも当たらず空を閉じた音。噛む音を鳴らさないことが「届かなかった」
      // の情報になる。罰にならないよう、いちばん小さく短くする。
      audio.playNoise({ durationS: 0.05, gain: 0.012, filter: "highpass", frequency: 1800 });
      statusEl.innerHTML = tHtml("crane.miss");
      voiceFeedback(
        t("crane.voice.miss"),
        t("crane.voice.missAnnounce")
      );
    }
    updateScore();
    updateStreak();
  }

  /**
   * @param {"planned"|"failure"|"cap"|"manual"} endReason その回がどう終わったか。
   *   エンドレスでは「続いた回数」が主要指標になるので、同じ5でも
   *   「5回目で失敗した」「5回やって支援者が止めた」「上限に達した」で
   *   意味が違う。理由が無いと、打ち切りを成績として読んでしまう。
   */
  function finalize(endReason = "planned") {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    session.endReason = endReason;
    if (config.endless) {
      // エンドレスには「予定した回数」が無い。実際にやった回数を書き戻さないと
      // state.js の完走判定（trials.length === targetTrials）が合わず、
      // 再読み込みで aborted に倒れて成立確認の材料からも外れる。
      session.config.targetTrials = session.trials.length;
    }
    session.summary = computeSummary(session.trials, collected);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const grips = session.summary.grips ?? 0;
    voiceFeedback(
      t("crane.voice.finish", { n: grips }),
      t("crane.voice.finishAnnounce", { n: grips })
    );
    finish(session.summary);
  }

  function nextTrial(perfMs) {
    // エンドレスは1回でも掴めなかったところで終わり。
    //
    // 難度が上がりつづける遊びに終わりの条件が無いと、いつ終わるかが
    // 「支援者が見ていて止める」だけになる——利用者からは、自分の操作と
    // 終わりが結びつかない。失敗で終わるなら、どこまで続けられたかが
    // そのまま結果になる。
    //
    // 直前の試行の判定を見る（この時点ではまだ resolveTrial の judgment が
    // 残っている）。currentIndex を進める前に判定すること。
    if (config.endless && judgment !== "grip") {
      finalize("failure");
      return;
    }
    currentIndex += 1;
    updateProgress();
    if (config.endless) {
      // 計画を使い切ったら、その場で1回ぶんだけ足す。最初にまとめて100回分
      // 作らないのは、ほとんどの回がそこまで続かないから（作った景品の分だけ
      // 抽選が進み、出方の履歴も変わる）。
      if (currentIndex >= targets.length) {
        targets.push(pickTarget(targets[targets.length - 1]));
        prizes.push(pickPrize());
      }
      if (currentIndex >= ENDLESS_MAX_TRIALS) {
        finalize("cap");
        return;
      }
      startXPhase(perfMs);
      return;
    }
    if (currentIndex >= config.targetTrials) {
      finalize();
      return;
    }
    startXPhase(perfMs);
  }

  /**
   * 走査カーソルが目標の座標を通過したら、ごく小さい音を1回鳴らす。
   * 画面を目で追い続けるのが難しい利用者に、押す瞬間を音でも渡すため。
   *
   * 既定 OFF にしてある（config.audioGuidance）。
   *
   * 経緯: もとは常時ONで、コメントには「判定は距離だけで決まるので、この音は
   * 測定の前提を変えない」と書いてあった。判定規則は確かに変わらない。だが
   * 変わるのは**その課題が何を測っているか**のほうだった——この音は目標の
   * 座標そのものを聴覚キューへ翻訳するので、利用者は画面をまったく見ずに
   * 「音が鳴ったら押す」を2回やれば成立してしまう。それは反応時間課題
   * （さかなつり）と同じ運動要求で、UFOキャッチャーが担うはずだった
   * 「周期運動を目で追って2軸を順に決める」ではない。
   *
   * この課題は registry で visualRequired として登録され、
   * settings.hideVisualTasks が隠す対象にもなっている——「画面を見る必要が
   * ある唯一の課題」という位置づけそのものが、この音と両立しない。
   *
   * 消さずに条件へ落としたのは、元の意図（視覚追従が難しい利用者への配慮）が
   * 正当だから。支援者が必要な回だけONにし、その回は記録に残る。リズムの
   * visualGuidance と同じ扱い（games/rhythm.js の resolveVisualGuidance）。
   */
  function maybePassTone(percent, targetPercent, tone) {
    if (!config.audioGuidance) return;
    if (lastPercent === null) {
      lastPercent = percent;
      return;
    }
    const crossed =
      (lastPercent < targetPercent && percent >= targetPercent) ||
      (lastPercent > targetPercent && percent <= targetPercent);
    lastPercent = percent;
    if (crossed) audio.playToneAt(tone, audio.scheduler.now(), PASS_GAIN);
  }

  function loop() {
    if (destroyed || finished || !session) return;
    const nowPerfMs = performance.now();
    const elapsed = nowPerfMs - phaseStartedPerfMs;
    const target = currentTarget();

    if (phase === "countIn") {
      const byAudioClock = audio.scheduler.now() * 1000 >= countInEndAudioMs;
      const byWallClock = nowPerfMs - mountedPerfMs >= COUNT_IN_FALLBACK_MS;
      if (byAudioClock || byWallClock) startXPhase(nowPerfMs);
    } else if (phase === "x") {
      const percent = scanPercentAt(elapsed, trialSweepMs);
      placeClaw(percent, 50, 0);
      updateGuides(percent, null);
      maybePassTone(percent, target.x, cueTones.low);
    } else if (phase === "y") {
      const percent = scanPercentAt(elapsed, trialSweepMs);
      placeClaw(selectedX, percent, 0);
      updateGuides(selectedX, percent);
      maybePassTone(percent, target.y, cueTones.high);
    } else if (phase === "drop") {
      const progress = Math.min(1, elapsed / DROP_MS);
      placeClaw(selectedX, selectedY, easeInOut(progress));
      if (progress >= 1) {
        setPhase("close", nowPerfMs);
        resolveTrial();
      }
    } else if (phase === "close") {
      placeClaw(selectedX, selectedY, 1);
      if (elapsed >= CLOSE_MS) {
        setPhase("lift", nowPerfMs);
        statusEl.innerHTML = judgment === "grip" ? tHtml("crane.lifted") : statusEl.innerHTML;
      }
    } else if (phase === "lift") {
      const progress = Math.min(1, elapsed / LIFT_MS);
      placeClaw(selectedX, selectedY, 1 - easeInOut(progress));
      if (judgment === "grip") followPrizeToClaw();
      if (progress >= 1) {
        if (judgment === "grip") {
          setPhase("carry", nowPerfMs);
          statusEl.innerHTML = tHtml("crane.carrying");
        } else {
          setPhase("result", nowPerfMs);
        }
      }
    } else if (phase === "carry") {
      const progress = Math.min(1, elapsed / CARRY_MS);
      carryToChute(easeInOut(progress));
      if (progress >= 1) {
        dropIntoChute();
        setPhase("result", nowPerfMs);
      }
    } else if (phase === "result") {
      if (elapsed >= RESULT_HOLD_MS) nextTrial(nowPerfMs);
    }

    // nextTrial() が finalize() まで進むことがあるので、次のフレームを
    // 予約する前にもう一度見る（終わったあとに1フレーム余計に回さない）。
    if (destroyed || finished) return;
    rafId = window.requestAnimationFrame(loop);
  }

  /** 掴んだ景品をアームの位置へ吸い付ける（持ち上げ中）。 */
  function followPrizeToClaw() {
    prizeEl.style.left = clawEl.style.left;
    prizeEl.style.top = `calc(${clawEl.style.top} + var(--prize-hang))`;
  }

  /** アームごと景品口へ水平移動する。 */
  function carryToChute(progress) {
    const at = project(selectedX, selectedY);
    const fromLeft = at.left;
    const fromTop = at.top - GEOM.altitude * at.scale;
    const left = fromLeft + (CHUTE.left - fromLeft) * progress;
    const top = fromTop + (CHUTE.top - GEOM.altitude - fromTop) * progress;
    clawEl.style.left = `${left}%`;
    clawEl.style.top = `${top}%`;
    trolleyEl.style.left = `${left}%`;
    cableEl.style.left = `${left}%`;
    const railTop = parseFloat(railEl.dataset.top || "8");
    cableEl.style.height = `${Math.max(0, top - railTop)}%`;
    shadowEl.style.opacity = "0";
    updateGuides(null, null); // 運んでいるあいだは狙いの線を消す
    followPrizeToClaw();
  }

  /** 景品口へ落として、取れたことを確定させる。 */
  function dropIntoChute() {
    clawEl.src = clawOpenUrl;
    clawEl.classList.remove("is-holding");
    prizeEl.classList.remove("is-lifted");
    prizeEl.classList.add("is-dropped");
    prizeEl.style.left = `${CHUTE.left}%`;
    prizeEl.style.top = `${CHUTE.top}%`;
    chuteEl.classList.add("is-filled");
    window.setTimeout(() => chuteEl?.classList.remove("is-filled"), 600);
    // 取れた景品を筐体の外に並べていく。数字の「つかんだ N」だけだと、
    // 何を取ったのかも、増えていくことも見えない。
    const badge = document.createElement("img");
    badge.className = "crane-collected-item";
    badge.src = PRIZE_ART[currentPrize().asset];
    badge.alt = "";
    collectedEl.appendChild(badge);
    audio.playToneAt(cueTones.high, audio.scheduler.now(), FEEDBACK_GAIN);
    // 受け口に落ちる音。低くて短い「ぼとっ」で、掴んだ瞬間の金属音とは
    // 別の出来事だと分かるようにする。ここが1回の試行の終点なので、
    // 音の上でも区切りになる。
    audio.playNoise({
      durationS: 0.16,
      gain: 0.034,
      filter: "lowpass",
      frequency: 420,
      sweepTo: 140,
    });
    statusEl.innerHTML = tHtml("crane.got");
  }

  function handleInput(perfMs) {
    if (destroyed || finished || !session) return;

    // 走査中でなければ、この入力は試行に使えない。捨てずに合図だけ返す。
    if (phase !== "x" && phase !== "y") {
      nudgeWait();
      return;
    }
    // フェーズが変わった直後の二度押しを試行に反映しない（ファイル冒頭の
    // コメント参照）。ここでも黙らせず、待つべきことを合図で返す。
    if (perfMs - phaseStartedPerfMs < INPUT_GUARD_MS) {
      nudgeWait();
      return;
    }

    if (phase === "x") {
      xPhaseMs = Math.max(0, perfMs - phaseStartedPerfMs);
      selectedX = scanPercentAt(xPhaseMs, trialSweepMs);
      placeClaw(selectedX, 50, 0);
      startYPhase(perfMs);
    } else {
      yPhaseMs = Math.max(0, perfMs - phaseStartedPerfMs);
      selectedY = scanPercentAt(yPhaseMs, trialSweepMs);
      placeClaw(selectedX, selectedY, 0);
      startDrop(perfMs);
    }
  }

  function mount(el) {
    stageEl = el;
    stageEl.classList.add("module-crane");
    renderMarkup();
    railEl.dataset.top = "8";

    targets = [];
    prizes = [];
    collected = [];
    consecutiveFailures = 0;
    trialToleranceR = config.toleranceR;
    trialSweepMs = config.sweepMs;
    for (let index = 0; index < config.targetTrials; index += 1) {
      targets.push(pickTarget(targets[index - 1]));
      prizes.push(pickPrize());
    }

    const beats = [0, 1, 2, 3].map((index) => ({
      index,
      timeS: index * COUNT_IN_STEP_S,
      tone: index === 3 ? cueTones.high : cueTones.low,
      gain: FEEDBACK_GAIN,
    }));
    const startAt = audio.scheduler.start({ beats });
    countInEndAudioMs = (startAt + 3 * COUNT_IN_STEP_S) * 1000;
    mountedPerfMs = performance.now();

    session = {
      sessionId: generateSessionId(),
      taskType: "scan",
      gameId: "crane",
      participantId: ctx.participantId || "",
      startedAtIso: new Date().toISOString(),
      aborted: false,
      finished: false,
      config: {
        ...config,
        targetSequence: targets.map((target) => ({ x: target.x, y: target.y })),
      },
      device: audio.getDeviceInfo(),
      trials: [],
      summary: computeSummary([]),
    };
    logTrial(session);
    updateProgress();
    updateScore();
    placeTarget();
    placeClaw(0, 50, 0);
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
    window.clearTimeout(waitNudgeTimer);
    audio.scheduler.stop();
    if (session && !finished) {
      if (config.endless) {
        // 支援者が「おわる」を押した（または画面を離れた）。失敗で終わった
        // 回と同じ「続いた回数」でも意味が違う。
        session.endReason = "manual";
        // エンドレスには「予定した回数」が無いので、途中で止めたのではなく
        // ここが終わり。aborted のままにすると、その回は成立確認の材料から
        // 外れる（readinessCheck.js の isUsable は aborted を使わない）——
        // れんしゅうを重ねているのに成立確認がいつまでも通らない、という
        // 見えない詰まりになる。
        //
        // 実際にやった回数を targetTrials へ書き戻す。state.js の完走判定が
        // trials.length === targetTrials を見るため、書き戻さないと
        // 再読み込みで aborted に倒れる。
        session.finished = true;
        session.aborted = false;
        session.config.targetTrials = session.trials.length;
      } else {
        session.aborted = true;
        session.endReason = "manual";
      }
      session.summary = computeSummary(session.trials, collected);
      logTrial(session);
    }
    if (stageEl) {
      stageEl.classList.remove("module-crane");
      stageEl.innerHTML = "";
    }
    stageEl = null;
    sceneEl = null;
    statusEl = null;
    scoreEl = null;
    streakEl = null;
    railEl = null;
    trolleyEl = null;
    cableEl = null;
    clawEl = null;
    shadowEl = null;
    ringEl = null;
    prizeEl = null;
    chuteEl = null;
    collectedEl = null;
    guideXEl = null;
    guideYEl = null;
  }

  return { mount, handleInput, destroy };
}
