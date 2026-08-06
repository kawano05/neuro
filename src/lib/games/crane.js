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
function resolveCraneConfig(settings) {
  return {
    ...cranePresets,
    sweepMs: settings?.craneSweepMs ?? cranePresets.sweepMs,
    toleranceR: settings?.craneToleranceR ?? cranePresets.toleranceR,
    targetTrials: settings?.craneTargetTrials ?? cranePresets.targetTrials,
  };
}

export function createCraneGame(ctx) {
  const { audio, announce, logTrial, finish, setProgress } = ctx;
  const config = resolveCraneConfig(ctx.settings);
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
    stageEl.innerHTML = `
      <div class="crane-cabinet" aria-hidden="true">
        <div class="crane-stage">
          <div class="crane-back"></div>
          <div class="crane-floor"></div>
          ${decorMarkup()}
          <div class="crane-chute"><span class="crane-chute-mouth"></span></div>
          <div class="crane-collected"></div>
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
          <div class="crane-score">つかんだ 0</div>
          <div class="crane-streak"></div>
          <div class="crane-status">じゅんび</div>
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
    setProgress(`のこり ${Math.max(0, config.targetTrials - currentIndex)}`);
  }

  function updateScore() {
    if (!scoreEl || !session) return;
    scoreEl.textContent = `つかんだ ${session.summary.grips ?? 0}`;
  }

  /** 連続記録は3から出す（1・2で出すと常時点灯して意味を失う）。 */
  function updateStreak() {
    if (!streakEl || !session) return;
    const streak = session.summary.currentStreak ?? 0;
    if (streak >= 3) {
      streakEl.textContent = `${streak} れんぞく`;
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
    trialToleranceR = assistedToleranceR(
      config.toleranceR,
      consecutiveFailures,
      config.assistMaxSteps,
      config.assistStepRatio
    );
    statusEl.textContent = "よこに うごきます";
    sceneEl.classList.remove("is-grip", "is-slip", "is-miss");
    clawEl.src = clawOpenUrl;
    clawEl.classList.remove("is-holding");
    placeTarget();
    placeClaw(0, 50, 0);
    updateGuides(null, null); // 前の試行で確定した線を残さない
  }

  function startYPhase(perfMs) {
    setPhase("y", perfMs);
    statusEl.textContent = "おくに うごきます";
  }

  function startDrop(perfMs) {
    setPhase("drop", perfMs);
    statusEl.textContent = "アームが おりるよ";
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
    if (judgment === "grip") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      statusEl.textContent = `${prize.label}を つかんだ！`;
      clawEl.classList.add("is-holding");
      prizeEl.classList.add("is-lifted");
      audio.speak(`${prize.label}を つかみました`);
      announce(`${prize.label}を しっかり つかみました`);
    } else if (judgment === "slip") {
      audio.playToneAt(cueTones.noGo, now, FEEDBACK_GAIN);
      statusEl.textContent = "おしい！ すべった";
      // 掴めてはいたので、景品が一度動いて戻ることで「惜しい」を絵でも返す。
      prizeEl.classList.add("is-slipped");
      audio.speak("おしい。つかんだけど すべりました");
      announce("つかみましたが すべりました");
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "とどかなかった";
      audio.speak("つぎは だいじょうぶ");
      announce("アームが けいひんから はずれました");
    }
    updateScore();
    updateStreak();
  }

  function finalize() {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    session.summary = computeSummary(session.trials, collected);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const grips = session.summary.grips ?? 0;
    audio.speak(`おわりました。${grips}こ とれました`);
    announce(`UFOキャッチャーが おわりました。${grips}こ とれました`);
    finish(session.summary);
  }

  function nextTrial(perfMs) {
    currentIndex += 1;
    updateProgress();
    if (currentIndex >= config.targetTrials) {
      finalize();
      return;
    }
    startXPhase(perfMs);
  }

  /**
   * 走査カーソルが目標の座標を通過したら、ごく小さい音を1回鳴らす。
   * 画面を目で追い続けるのが難しい利用者に、押す瞬間を音でも渡すため。
   * 判定は距離だけで決まるので、この音は測定の前提を変えない。
   */
  function maybePassTone(percent, targetPercent, tone) {
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
      const percent = scanPercentAt(elapsed, config.sweepMs);
      placeClaw(percent, 50, 0);
      updateGuides(percent, null);
      maybePassTone(percent, target.x, cueTones.low);
    } else if (phase === "y") {
      const percent = scanPercentAt(elapsed, config.sweepMs);
      placeClaw(selectedX, percent, 0);
      updateGuides(selectedX, percent);
      maybePassTone(percent, target.y, cueTones.high);
    } else if (phase === "drop") {
      const t = Math.min(1, elapsed / DROP_MS);
      placeClaw(selectedX, selectedY, easeInOut(t));
      if (t >= 1) {
        setPhase("close", nowPerfMs);
        resolveTrial();
      }
    } else if (phase === "close") {
      placeClaw(selectedX, selectedY, 1);
      if (elapsed >= CLOSE_MS) {
        setPhase("lift", nowPerfMs);
        statusEl.textContent = judgment === "grip" ? "もちあげた" : statusEl.textContent;
      }
    } else if (phase === "lift") {
      const t = Math.min(1, elapsed / LIFT_MS);
      placeClaw(selectedX, selectedY, 1 - easeInOut(t));
      if (judgment === "grip") followPrizeToClaw();
      if (t >= 1) {
        if (judgment === "grip") {
          setPhase("carry", nowPerfMs);
          statusEl.textContent = "けいひんぐちへ";
        } else {
          setPhase("result", nowPerfMs);
        }
      }
    } else if (phase === "carry") {
      const t = Math.min(1, elapsed / CARRY_MS);
      carryToChute(easeInOut(t));
      if (t >= 1) {
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
  function carryToChute(t) {
    const at = project(selectedX, selectedY);
    const fromLeft = at.left;
    const fromTop = at.top - GEOM.altitude * at.scale;
    const left = fromLeft + (CHUTE.left - fromLeft) * t;
    const top = fromTop + (CHUTE.top - GEOM.altitude - fromTop) * t;
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
    statusEl.textContent = "とれた！";
  }

  function handleInput(t) {
    if (destroyed || finished || !session) return;

    // 走査中でなければ、この入力は試行に使えない。捨てずに合図だけ返す。
    if (phase !== "x" && phase !== "y") {
      nudgeWait();
      return;
    }
    // フェーズが変わった直後の二度押しを試行に反映しない（ファイル冒頭の
    // コメント参照）。ここでも黙らせず、待つべきことを合図で返す。
    if (t - phaseStartedPerfMs < INPUT_GUARD_MS) {
      nudgeWait();
      return;
    }

    if (phase === "x") {
      xPhaseMs = Math.max(0, t - phaseStartedPerfMs);
      selectedX = scanPercentAt(xPhaseMs, config.sweepMs);
      placeClaw(selectedX, 50, 0);
      startYPhase(t);
    } else {
      yPhaseMs = Math.max(0, t - phaseStartedPerfMs);
      selectedY = scanPercentAt(yPhaseMs, config.sweepMs);
      placeClaw(selectedX, selectedY, 0);
      startDrop(t);
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
      session.aborted = true;
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
