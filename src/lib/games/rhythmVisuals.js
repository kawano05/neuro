// =====================================================================
// games/rhythmVisuals.js — リズム系ゲームの見た目と事後フィードバック
//
// 判定・記録・AudioContext 時刻は rhythm.js が正本。このファイルは、同じ
// judgedBeats を「通常練習では流れる1レーン」「測定では予告なしの計器盤」へ
// 描き分ける。見た目を本格的なゲームへ引き上げても、研究用の rawOffsetMs を
// 書き換えない境界をファイル単位で明確にする。
//
// 絵（skin）は2通り。高い音だけの れんしゅうの回は音楽会の世界（art/gonogoWorldArt.js、
// 見え方の版 2）、それ以外（そくていの回・ほかのリズムの遊び）は今までの絵（版 1）。
// どちらも同じ骨組み（同じ class・同じ並び）に中身の絵を差すだけなので、玉・太鼓・
// 判定の位置と大きさ、時刻は変わらない。今までの絵の組み立ては、1文字も変えない
// （そくていの回の画面を1pxも変えないため）。
// =====================================================================

import { ORIGINAL_ART_VERSION, shownArtVersion } from "../artVersion.js";
import {
  GONOGO_ART_VERSION,
  gonogoIconSvg,
  gonogoNoteSvg,
  gonogoPadSvg,
  gonogoSceneryHtml,
  gonogoShieldSvg,
  gonogoStageHtml,
} from "../art/gonogoWorldArt.js";

export const RHYTHM_NOTE_LEAD_MIN_MS = 1800;
export const RHYTHM_NOTE_LEAD_MAX_MS = 3200;

const THEME_ICONS = {
  "rhythm-l1": "fa-solid fa-star",
  "rhythm-l2": "fa-solid fa-music",
  gonogo: "fa-solid fa-shield-halved",
  calibration: "fa-solid fa-stopwatch",
};

/** 通常練習はノートレーン、手がかりなし／測定は予告のない計器盤。 */
export function rhythmVisualProfile(gameId, visualGuidance) {
  return gameId === "calibration" || !visualGuidance ? "instrument" : "lane";
}

/** 同じinstrumentでも、測定と「予告なし練習」を画面上で混同しない。 */
export function rhythmProfileLabelKey(profile, measurement) {
  if (profile === "lane") return "rhythm.profile.game";
  return measurement ? "rhythm.profile.measure" : "rhythm.profile.noPreview";
}

/** ノートが出現位置(0)から判定面(1)へ進む比率。純粋関数なのでunit test可能。 */
export function noteTravelRatio(timeUntilMs, leadMs) {
  if (!Number.isFinite(timeUntilMs) || !Number.isFinite(leadMs) || leadMs <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - timeUntilMs / leadMs));
}

/** hit の画面表示だけを Perfect / Good に分ける。研究判定は常に hit のまま。 */
export function gradeRhythmOffset(offsetMs, exactToleranceMs) {
  if (!Number.isFinite(offsetMs)) return "good";
  return Math.abs(offsetMs) <= exactToleranceMs ? "perfect" : "good";
}

function speakerMarkup(side) {
  return `
    <div class="rhythm-speaker-bank is-${side}" aria-hidden="true">
      <span class="rhythm-speaker-light"></span>
      <span class="rhythm-speaker-cone is-small"></span>
      <span class="rhythm-speaker-cone is-large"></span>
      <span class="rhythm-speaker-slot"></span>
    </div>
  `;
}

function dialTicksMarkup() {
  return Array.from(
    { length: 24 },
    (_, index) => `<span class="rhythm-dial-tick" style="--tick:${index}"></span>`
  ).join("");
}

function noteIcon(gameId, kind) {
  if (kind === "nogo") return "fa-solid fa-cube";
  if (gameId === "rhythm-l2") return "fa-solid fa-music";
  return "fa-solid fa-star";
}

/**
 * れんしゅうの回の絵の版（遊びごと）。作り直したのは高い音だけ。リズム練習・続けては
 * 利用者の導線に出していない（registry.js）ので、今までの絵のまま。
 */
const PRACTICE_ART_VERSIONS = Object.freeze({ gonogo: GONOGO_ART_VERSION });

/**
 * その回に画面へ出す絵の版（session.config.artVersion に残す。src/lib/artVersion.js）。
 * measurement は予告のない測定の版面を出す回（そくていの回と、キャリブレーション）。
 * キャリブレーションは支援者の設定が れんしゅう でも元の絵なので、どちらでも 1 になる。
 * practiceArt は遊びの中の「この遊びの設定」の「絵」（前の絵なら 1）。
 */
export function rhythmArtVersion(gameId, measurement, practiceArt) {
  return shownArtVersion(
    measurement ? "measure" : "practice",
    PRACTICE_ART_VERSIONS[gameId] ?? ORIGINAL_ART_VERSION,
    practiceArt
  );
}

/** 今までの絵（版 1）。組み立てた文字列が、この版を足す前と1文字も変わらないこと。 */
function originalSkin(gameId) {
  return {
    world: false,
    iconHtml: `<i class="${THEME_ICONS[gameId] || "fa-solid fa-music"}"></i>`,
    shieldHtml: `<i class="fa-solid fa-shield"></i>`,
    sceneryHtml: "",
    stageHtml: "",
    padHtml: "",
    noteHtml: (kind) => `<i class="${noteIcon(gameId, kind)}"></i>`,
  };
}

/** 高い音だけ・れんしゅうの回の音楽会（版 2）。 */
function gonogoWorldSkin() {
  return {
    world: true,
    iconHtml: gonogoIconSvg(),
    shieldHtml: gonogoShieldSvg(),
    sceneryHtml: gonogoSceneryHtml(),
    stageHtml: gonogoStageHtml(),
    padHtml: gonogoPadSvg(),
    noteHtml: (kind) => gonogoNoteSvg(kind),
  };
}

/** 版から絵を選ぶ。知らない組み合わせは今までの絵（そくていと同じ見え方）へ倒す。 */
export function rhythmSkin(gameId, artVersion) {
  return gameId === "gonogo" && artVersion === GONOGO_ART_VERSION
    ? gonogoWorldSkin()
    : originalSkin(gameId);
}

/**
 * @param {{
 *   gameId:string,
 *   visualGuidance:boolean,
 *   measurement:boolean,
 *   practiceArt?:string,
 *   exactToleranceMs:number,
 *   t:(key:string, vars?:object)=>string,
 * }} options
 */
export function createRhythmVisuals(options) {
  const { gameId, visualGuidance, measurement, practiceArt, exactToleranceMs, t } = options;
  const profile = rhythmVisualProfile(gameId, visualGuidance);
  const artVersion = rhythmArtVersion(gameId, measurement, practiceArt);
  const skin = rhythmSkin(gameId, artVersion);
  let stageEl = null;
  let pulseEl = null;
  let noteLayerEl = null;
  let judgmentEl = null;
  let comboEl = null;
  let scoreEl = null;
  let shieldEl = null;
  let dialTickEls = [];
  let instrumentPhaseEl = null;
  let feedbackTimer = null;
  let beatIntervalS = 1;
  let combo = 0;
  let score = 0;
  let successCount = 0;
  const noteNodes = new Map();
  const timeoutIds = new Set();

  function scheduleTimeout(callback, delayMs) {
    const timeoutId = window.setTimeout(() => {
      timeoutIds.delete(timeoutId);
      callback();
    }, delayMs);
    timeoutIds.add(timeoutId);
    return timeoutId;
  }

  function clearTrackedTimeout(timeoutId) {
    if (timeoutId === null) return;
    window.clearTimeout(timeoutId);
    timeoutIds.delete(timeoutId);
  }

  function mount(el, { titleHtml, instructionHtml, offsetMarkup = "" }) {
    stageEl = el;
    stageEl.classList.add("module-rhythm");
    stageEl.dataset.rhythmTheme = gameId;
    stageEl.dataset.rhythmProfile = profile;
    // れんしゅうの回だけの見た目（明るい色・飾りを減らす。theme-hakkiri.css）。
    // そくていの回（measurement）は今までの見た目のまま。
    stageEl.dataset.rhythmMode = measurement ? "measure" : "practice";
    // れんしゅうの回の印（ほかのタイミングの遊びと同じ .is-practice）。
    stageEl.classList.toggle("is-practice", !measurement);
    // 新しい絵の印。高い音だけの世界の CSS（world-gonogo.css）は、この印の下にだけ書く
    // （前の絵を選んだ回・そくていの回には付けない）。
    stageEl.classList.toggle("has-world-art", skin.world);
    stageEl.innerHTML = `
      <div class="rhythm-world" aria-hidden="true">${skin.sceneryHtml}
        <div class="rhythm-aurora"></div>
        <div class="rhythm-grid-floor"></div>
        <div class="rhythm-cabinet">
          <div class="rhythm-cabinet-header">
            <span class="rhythm-cabinet-icon">${skin.iconHtml}</span>
            <strong class="rhythm-cabinet-title">${titleHtml}</strong>
            <span class="rhythm-cabinet-lamps">
              <i></i><i></i><i></i><i></i>
            </span>
          </div>
          <div class="rhythm-playfield">
            ${speakerMarkup("left")}
            <div class="rhythm-main-display">${skin.stageHtml}
              <div class="rhythm-note-lane">
                <span class="rhythm-lane-rail is-left"></span>
                <span class="rhythm-lane-rail is-right"></span>
                <div class="rhythm-note-layer"></div>
                <span class="rhythm-hit-line"></span>
              </div>
              <div class="rhythm-instrument-face">
                <div class="rhythm-dial-ticks">${dialTicksMarkup()}</div>
                <strong class="rhythm-instrument-phase">${t("rhythm.phase.warmup")}</strong>
                <span class="rhythm-dial-crosshair is-horizontal"></span>
                <span class="rhythm-dial-crosshair is-vertical"></span>
              </div>
              <div class="rhythm-pulse">${skin.padHtml}</div>
              <div class="rhythm-judgment">
                <strong></strong>
                <span class="rhythm-combo"></span>
              </div>
              <div class="rhythm-shield">${skin.shieldHtml}</div>
            </div>
            ${speakerMarkup("right")}
          </div>
          <div class="rhythm-console">
            <div class="rhythm-score-panel">
              <span>${t("rhythm.score")}</span>
              <strong>0</strong>
            </div>
            <div class="rhythm-console-main">${offsetMarkup}</div>
            <div class="rhythm-profile-panel">
              <span class="rhythm-profile-dot"></span>
              <strong>${t(rhythmProfileLabelKey(profile, measurement))}</strong>
            </div>
          </div>
          <span class="reaction-label rhythm-stage-instruction">${instructionHtml}</span>
        </div>
      </div>
    `;
    pulseEl = stageEl.querySelector(".rhythm-pulse");
    noteLayerEl = stageEl.querySelector(".rhythm-note-layer");
    judgmentEl = stageEl.querySelector(".rhythm-judgment strong");
    comboEl = stageEl.querySelector(".rhythm-combo");
    scoreEl = stageEl.querySelector(".rhythm-score-panel strong");
    shieldEl = stageEl.querySelector(".rhythm-shield");
    dialTickEls = Array.from(stageEl.querySelectorAll(".rhythm-dial-tick"));
    instrumentPhaseEl = stageEl.querySelector(".rhythm-instrument-phase");
    stageEl.dataset.success = "0";
    stageEl.dataset.combo = "0";
    return {
      pulseEl,
      offsetTrackEl: stageEl.querySelector(".rhythm-offset-track"),
      offsetMeanEl: stageEl.querySelector(".rhythm-offset-mean"),
    };
  }

  function setBeats(beats, intervalS) {
    beatIntervalS = Number.isFinite(intervalS) && intervalS > 0 ? intervalS : 1;
    noteNodes.clear();
    if (!noteLayerEl || profile !== "lane") return;
    noteLayerEl.innerHTML = "";
    beats.forEach((beat) => {
      const node = document.createElement("span");
      node.className = `rhythm-note is-${beat.kind === "nogo" ? "nogo" : "go"}`;
      node.dataset.beatIndex = String(beat.index);
      node.innerHTML = skin.noteHtml(beat.kind);
      node.hidden = true;
      noteLayerEl.append(node);
      noteNodes.set(beat.index, { node, beat });
    });
  }

  function tick(nowAudioAbsMs) {
    if (profile !== "lane" || !noteLayerEl) return;
    const leadMs = Math.max(
      RHYTHM_NOTE_LEAD_MIN_MS,
      Math.min(RHYTHM_NOTE_LEAD_MAX_MS, beatIntervalS * 2200)
    );
    noteNodes.forEach(({ node, beat }) => {
      if (node.dataset.resolved === "true") return;
      const timeUntilMs = beat.timeMs - nowAudioAbsMs;
      const visible = timeUntilMs <= leadMs && timeUntilMs >= -480;
      node.hidden = !visible;
      if (!visible) return;
      const ratio = noteTravelRatio(timeUntilMs, leadMs);
      node.style.setProperty("--note-progress", ratio.toFixed(4));
      node.style.top = `${(5 + ratio * 79).toFixed(2)}%`;
      node.style.opacity = String(Math.min(1, 0.35 + ratio * 0.9));
    });
  }

  function setScore() {
    if (scoreEl) scoreEl.textContent = String(score);
    if (comboEl) {
      comboEl.textContent = combo >= 2 ? t("rhythm.combo", { n: combo }) : "";
    }
    if (stageEl) {
      stageEl.dataset.success = String(Math.max(0, Math.min(5, successCount)));
      stageEl.dataset.combo = String(Math.max(0, combo));
    }
  }

  function feedbackKey(judgment, offsetMs) {
    if (judgment === "hit") {
      return gradeRhythmOffset(offsetMs, exactToleranceMs) === "perfect"
        ? "rhythm.judgment.perfect"
        : "rhythm.judgment.good";
    }
    if (judgment === "correctRejection") return "rhythm.judgment.hold";
    if (judgment === "commission") return "rhythm.judgment.wrong";
    return "rhythm.judgment.miss";
  }

  function resolveNote(beatIndex, judgment) {
    const entry = noteNodes.get(beatIndex);
    if (!entry) return;
    const { node } = entry;
    node.hidden = false;
    node.dataset.resolved = "true";
    node.style.top = judgment === "correctRejection" ? "94%" : "84%";
    node.style.opacity = "1";
    node.classList.add(`is-${judgment}`);
    scheduleTimeout(() => {
      noteNodes.delete(beatIndex);
      node.remove();
    }, 460);
  }

  // キャリブレーションの24目盛りは、終わった拍だけを事後に埋める。
  // 0〜3拍はならし（中抜き）、4〜23拍は測定（実線）。未来の拍や時刻は
  // ここへ渡さないので、聴覚キューの予告にはならない。
  function completeCalibrationTick(beatIndex) {
    if (gameId !== "calibration" || !Number.isInteger(beatIndex) || beatIndex < 0) return;
    const tickEl = dialTickEls[beatIndex];
    if (!tickEl) return;
    tickEl.classList.add(beatIndex < 4 ? "is-warmup" : "is-measure", "is-complete");
    if (instrumentPhaseEl) {
      instrumentPhaseEl.textContent = t(
        beatIndex >= 3 ? "rhythm.phase.measure" : "rhythm.phase.warmup"
      );
    }
  }

  function showJudgment({ judgment, beatIndex = null, offsetMs = null }) {
    const success = judgment === "hit" || judgment === "correctRejection";
    if (success) {
      combo += 1;
      score += 100;
      successCount += 1;
    } else {
      combo = 0;
    }
    setScore();
    if (judgment === "correctRejection") {
      shieldEl?.classList.add("is-active");
      scheduleTimeout(() => shieldEl?.classList.remove("is-active"), 280);
    }
    if (judgmentEl) {
      judgmentEl.textContent = t(feedbackKey(judgment, offsetMs));
      judgmentEl.parentElement?.classList.remove(
        "is-perfect",
        "is-good",
        "is-hold",
        "is-miss"
      );
      const state = judgment === "hit"
        ? gradeRhythmOffset(offsetMs, exactToleranceMs)
        : judgment === "correctRejection"
          ? "hold"
          : "miss";
      judgmentEl.parentElement?.classList.add(`is-${state}`);
      clearTrackedTimeout(feedbackTimer);
      feedbackTimer = scheduleTimeout(() => {
        feedbackTimer = null;
        if (judgmentEl) judgmentEl.textContent = "";
      }, 440);
    }
    completeCalibrationTick(beatIndex);
    if (beatIndex !== null) resolveNote(beatIndex, judgment);
  }

  function destroy() {
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIds.clear();
    feedbackTimer = null;
    noteNodes.clear();
    if (stageEl) {
      stageEl.classList.remove("module-rhythm", "is-practice", "has-world-art");
      delete stageEl.dataset.rhythmTheme;
      delete stageEl.dataset.rhythmProfile;
      delete stageEl.dataset.rhythmMode;
      delete stageEl.dataset.success;
      delete stageEl.dataset.combo;
    }
    stageEl = null;
    pulseEl = null;
    noteLayerEl = null;
    judgmentEl = null;
    comboEl = null;
    scoreEl = null;
    shieldEl = null;
    dialTickEls = [];
    instrumentPhaseEl = null;
  }

  return { mount, setBeats, tick, showJudgment, destroy, profile, artVersion };
}
