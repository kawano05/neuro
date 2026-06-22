// =====================================================================
// state.js — アプリ状態の初期値・読み込み・保存
//
// 変更点（旧 neuronodeApp.js からの改善）:
//   saveState が try/catch で保護され、localStorage への書き込み失敗
//   （容量不足・プライベートブラウズ等）が黙って握り潰されなくなった。
//   失敗時は console.error と onError コールバック（初回のみ）で通知する。
// =====================================================================

import { storageKey, readinessItems } from "./content.js";

/** 状態の初期値。localStorage が空・壊れている場合のフォールバック。 */
export const defaultState = {
  currentView: "switcher",
  activeSwitchModule: "color",
  switchStep: 0,
  hitCount: 0,
  hitTimes: [],
  matchingIndex: 0,
  letterIndex: 0,
  currentPhrase: "",
  currentCategory: "基本",
  operation: {
    mode: "item",
    itemIndex: 0,
    pointIndex: 0,
    pointPhase: "x",
    pointStartedAt: null,
    selectedX: null,
    selectedY: null,
    dragPhase: "start",
    trials: 0,
    successes: 0,
    distances: [],
  },
  settings: {
    scanInterval: 1600,
    autoScan: true,
    speechEnabled: true,
    soundEnabled: true,
    largeText: true,
    highContrast: false,
  },
  logs: [],
  evaluation: {
    participantId: "",
    condition: "web",
    isActive: false,
    sessionStartedAt: null,
    sessionEndedAt: null,
    activeTaskIndex: 0,
    taskStartedAt: null,
    taskInputs: 0,
    taskMistakes: 0,
    taskBacks: 0,
    taskTimingMissed: 0,
    taskTimingEarly: 0,
    taskTimingLate: 0,
    taskAssists: 0,
    taskDistances: [],
    effortRating: 3,
    easeRating: 3,
    engagementRating: 3,
    observerNotes: "",
    results: [],
    completedSessions: [],
  },
  research: {
    conditionProfile: "optimized",
    environment: "hospital",
    deploymentNotes: "",
    readiness: readinessItems.reduce((items, item) => ({ ...items, [item.id]: false }), {}),
  },
};

/** defaultState の深いコピーを返す。 */
export function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

/**
 * localStorage から状態を読み込む。
 * 保存形式の差分（古い保存・欠落キー）は defaultState とマージして吸収する。
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return cloneDefaultState();
    const parsed = JSON.parse(raw);
    return {
      ...cloneDefaultState(),
      ...parsed,
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      operation: {
        ...defaultState.operation,
        ...(parsed.operation || {}),
        distances: Array.isArray(parsed.operation?.distances) ? parsed.operation.distances : [],
      },
      evaluation: {
        ...defaultState.evaluation,
        ...(parsed.evaluation || {}),
        results: Array.isArray(parsed.evaluation?.results) ? parsed.evaluation.results : [],
        completedSessions: Array.isArray(parsed.evaluation?.completedSessions)
          ? parsed.evaluation.completedSessions
          : [],
      },
      research: {
        ...defaultState.research,
        ...(parsed.research || {}),
        readiness: {
          ...defaultState.research.readiness,
          ...(parsed.research?.readiness || {}),
        },
      },
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      hitTimes: Array.isArray(parsed.hitTimes) ? parsed.hitTimes : [],
    };
  } catch {
    return cloneDefaultState();
  }
}

/**
 * 保存関数を生成する。
 * @param {object} state - 保存対象の状態（参照を保持する）
 * @param {(error: Error) => void} [onError] - 保存失敗時に「初回のみ」呼ばれる通知
 * @returns {() => void} saveState
 */
export function createStateSaver(state, onError) {
  let notified = false;
  return function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      // 旧実装ではここで例外がそのまま伝播し、以降の描画処理が
      // 中断される可能性があった（localStorage黙落ち問題）。
      console.error("[neuro] 状態の保存に失敗しました", error);
      if (!notified) {
        notified = true;
        onError?.(error);
      }
    }
  };
}
