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
//   - 1ゲームは2分。試行数ではなく時間で区切る（content.js の sessionMs）。
//
// スコアと魚の長さについて: これらは遊びの手応えのための表示で、
// state.js の sanitizeReactionSession は rt スキーマの外の値を保持しない。
// 記録・CSV に残るのは従来どおり反応時間と判定だけで、研究データの
// スキーマは変えていない。リザルト画面には ctx.finish(summary) 経由で
// 渡すため（sanitizer を通らない）、その場では合計スコアを表示できる。
// =====================================================================

import { cueTones, fishingPresets, fishingSpecies } from "../content.js";
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
    totalLengthCm: caughtLengths.reduce((sum, value) => sum + value, 0),
    longestCm: caughtLengths.length ? Math.max(...caughtLengths) : null,
  };
}

export function createFishingGame(ctx) {
  const { audio, announce, logTrial, finish, setProgress } = ctx;
  const config = { ...fishingPresets };
  let stageEl = null;
  let statusEl = null;
  let sceneEl = null;
  let lineEl = null;
  let swimmerEl = null;
  let swimmerArtEl = null;
  let catchEl = null;
  let scoreEl = null;
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
  // 巻き上げ演出中は rAF による位置更新を止め、CSS の遷移に任せる。
  let reelingIndex = -1;

  function toAudioAbsMs(perfMs) {
    return perfMs - anchorPerfMs + sessionStartAudioMs;
  }

  function toSessionRelativeMs(audioAbsMs) {
    return audioAbsMs - sessionStartAudioMs;
  }

  function renderMarkup() {
    stageEl.innerHTML = `
      <div class="fishing-scene" aria-hidden="true">
        <div class="fishing-sky"></div>
        <div class="fishing-water"></div>
        <div class="fishing-line"></div>
        <img class="fishing-boat" src="${boatUrl}" alt="" />
        <div class="fishing-swimmer"><img class="fishing-swimmer-art" src="" alt="" /></div>
        <div class="fishing-catch"></div>
        <div class="fishing-score">0 cm</div>
      </div>
      <span class="reaction-label fishing-status">しずかに まとう</span>
      <span class="reaction-detail">アタリの おとで おそう</span>
    `;
    sceneEl = stageEl.querySelector(".fishing-scene");
    statusEl = stageEl.querySelector(".fishing-status");
    lineEl = stageEl.querySelector(".fishing-line");
    swimmerEl = stageEl.querySelector(".fishing-swimmer");
    swimmerArtEl = stageEl.querySelector(".fishing-swimmer-art");
    catchEl = stageEl.querySelector(".fishing-catch");
    scoreEl = stageEl.querySelector(".fishing-score");
  }

  function updateProgress(nowRelativeMs) {
    setProgress(`のこり ${formatRemaining(sessionEndMs - nowRelativeMs)}`);
  }

  function updateScore() {
    if (!scoreEl || !session) return;
    scoreEl.textContent = `${session.summary.totalLengthCm ?? 0} cm`;
  }

  /** 糸を垂らす演出（押したときは必ず動かす。空振りでも手応えを返す）。 */
  function castLine() {
    if (!lineEl) return;
    lineEl.classList.add("is-cast");
    window.clearTimeout(castTimer);
    castTimer = window.setTimeout(() => {
      lineEl?.classList.remove("is-cast");
    }, 520);
  }

  /** 掛かった魚を舟まで巻き上げ、長さを表示する。 */
  function reelIn(planned) {
    if (!swimmerEl || !catchEl) return;
    reelingIndex = planned.index;
    // 巻き上げ中は updateVisual が早期 return するため、食いつきの
    // アニメーションはここで明示的に外す（付けっぱなしにすると
    // transform が競合して巻き上げが揺れる）。
    swimmerEl.classList.remove("is-biting");
    swimmerEl.classList.add("is-hooked");
    catchEl.textContent = `${planned.lengthCm} cm`;
    catchEl.classList.add("is-shown");
    window.clearTimeout(catchTimer);
    catchTimer = window.setTimeout(() => {
      catchEl?.classList.remove("is-shown");
      swimmerEl?.classList.remove("is-hooked");
      if (swimmerEl) swimmerEl.style.opacity = "0";
      reelingIndex = -1;
    }, 900);
  }

  function recordCurrent(judgment, inputMs = null) {
    if (finished || currentIndex >= trialsPlan.length) return;
    const planned = trialsPlan[currentIndex];
    const normalizedInput =
      judgment === "timeout" || judgment === "correctRejection" ? null : inputMs;
    const row = {
      index: currentIndex,
      kind: planned.kind,
      foreperiodMs: planned.foreperiodMs,
      cueMs: planned.cueMs,
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
    };
    session.trials.push(row);
    session.summary = computeSummary(session.trials);
    logTrial(session);

    const now = audio.scheduler.now();
    if (judgment === "hit") {
      audio.playToneAt(cueTones.hit, now, FEEDBACK_GAIN);
      statusEl.textContent = `${planned.lengthCm}cm つれた！`;
      reelIn(planned);
      updateScore();
      announce(`${planned.lengthCm}センチの さかなが つれました`);
    } else if (judgment === "correctRejection") {
      statusEl.textContent = "よく まてたね";
      announce("にせアタリを みわけました");
    } else if (judgment === "falseStart") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "まだ まとう";
      announce("まだ アタリではありません");
    } else if (judgment === "commission") {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "ながぐつ だった";
      announce("ながぐつが かかりました");
    } else {
      audio.playToneAt(cueTones.miss, now, MISS_GAIN);
      statusEl.textContent = "にげられた";
      announce("さかなに にげられました");
    }

    currentIndex += 1;
    if (currentIndex >= trialsPlan.length) finalize();
  }

  function finalize() {
    if (finished || !session) return;
    finished = true;
    session.finished = true;
    session.summary = computeSummary(session.trials);
    logTrial(session);
    stopLoop();
    audio.scheduler.stop();
    const total = session.summary.totalLengthCm ?? 0;
    const catches = session.summary.catches ?? 0;
    audio.speak(`おわりました。${catches}ひき、あわせて ${total}センチでした`);
    announce(`さかなつりが おわりました。${catches}ひき、あわせて ${total}センチ`);
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
    const holdEndMs = planned.cueMs + config.limitMs;
    const leaveMs = holdEndMs + config.exitMs;
    if (nowRelativeMs < appearMs || nowRelativeMs > leaveMs) return null;
    if (nowRelativeMs <= planned.cueMs) {
      const t = (nowRelativeMs - appearMs) / config.approachMs;
      return SPAWN_X_PERCENT + (LINE_X_PERCENT - SPAWN_X_PERCENT) * t;
    }
    if (nowRelativeMs <= holdEndMs) return LINE_X_PERCENT;
    const t = (nowRelativeMs - holdEndMs) / config.exitMs;
    return LINE_X_PERCENT + (EXIT_X_PERCENT - LINE_X_PERCENT) * t;
  }

  function updateVisual(nowRelativeMs) {
    const planned = trialsPlan[currentIndex];
    if (!planned || !statusEl || !swimmerEl) return;

    // 巻き上げ演出中は CSS の遷移に任せる（rAF で位置を上書きしない）。
    if (reelingIndex >= 0) return;

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

    const beforeCue = nowRelativeMs < planned.cueMs;
    const withinWindow = nowRelativeMs <= planned.cueMs + config.limitMs;
    if (beforeCue) {
      if (statusEl.textContent !== "しずかに まとう" && x !== null && x > 70) {
        statusEl.textContent = "しずかに まとう";
      }
    } else if (withinWindow) {
      statusEl.textContent = "アタリ！";
    }
    swimmerEl.classList.toggle("is-biting", !beforeCue && withinWindow);
  }

  function loop() {
    if (destroyed || finished || !session) return;
    const nowRelativeMs = toSessionRelativeMs(audio.scheduler.now() * 1000);
    const planned = trialsPlan[currentIndex];
    if (planned && nowRelativeMs > planned.cueMs + config.limitMs) {
      recordCurrent(
        planned.kind === "real" ? "timeout" : "correctRejection",
        null
      );
      if (finished || destroyed) return;
    }
    updateVisual(nowRelativeMs);
    updateProgress(nowRelativeMs);
    rafId = window.requestAnimationFrame(loop);
  }

  function handleInput(t) {
    if (destroyed || finished || !session) return;
    castLine();
    const inputMs = toSessionRelativeMs(toAudioAbsMs(t));
    let planned = trialsPlan[currentIndex];

    // rAFの境界直前に入力が来ても、期限切れ試行を正常に確定してから
    // 次の前刺激区間の入力として扱う。
    while (planned && inputMs > planned.cueMs + config.limitMs) {
      recordCurrent(
        planned.kind === "real" ? "timeout" : "correctRejection",
        null
      );
      if (finished) return;
      planned = trialsPlan[currentIndex];
    }
    if (!planned) return;
    const judgment = judgeReaction(inputMs, planned.cueMs, config.limitMs, planned.kind);
    recordCurrent(judgment, inputMs);
  }

  /**
   * 2分ぶんの試行計画を作る。試行数は前刺激間隔の乱数で決まるので、
   * 多めに生成してから sessionMs に収まるところで切る。切ったあとの
   * 実数を config.targetTrials に書き戻すこと（state.js の完走判定が
   * trials.length === targetTrials を見るため）。
   */
  function buildPlan() {
    const maxTrials = Math.ceil(config.sessionMs / (config.foreperiodMinMs + config.limitMs)) + 2;
    const foreperiods = generateForeperiods(
      maxTrials,
      config.foreperiodMinMs,
      config.foreperiodMaxMs
    );

    const planned = [];
    let cursorMs = 0;
    for (const foreperiodMs of foreperiods) {
      const cueMs = cursorMs + foreperiodMs;
      if (cueMs + config.limitMs > config.sessionMs) break;
      planned.push({ index: planned.length, foreperiodMs, cueMs });
      cursorMs = cueMs + config.limitMs;
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
    anchorPerfMs = performance.now();
    sessionStartAudioMs = audio.scheduler.now() * 1000;
    const startOffsetMs = startAt * 1000 - sessionStartAudioMs;
    trialsPlan = trialsPlan.map((trial) => ({
      ...trial,
      cueMs: trial.cueMs + startOffsetMs,
    }));
    sessionEndMs = config.sessionMs + startOffsetMs;

    session = {
      sessionId: generateSessionId(),
      taskType: "rt",
      gameId: "fishing",
      participantId: ctx.participantId || "",
      startedAtIso: new Date().toISOString(),
      aborted: false,
      finished: false,
      config: {
        ...config,
        seedSequence: foreperiods,
        kindSequence,
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
      session.aborted = true;
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
  }

  return { mount, handleInput, destroy };
}
