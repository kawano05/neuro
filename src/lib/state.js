// =====================================================================
// state.js — アプリ状態の初期値・読み込み・保存
//
// 変更点（旧 neuronodeApp.js からの改善）:
//   saveState が try/catch で保護され、localStorage への書き込み失敗
//   （容量不足・プライベートブラウズ等）が黙って握り潰されなくなった。
//   失敗時は console.error と onError コールバック（初回のみ）で通知する。
// =====================================================================

import { storageKey, readinessItems } from "./content.js";

/**
 * 旧保存キー（P0-0 移行元、detailed-design.md §9.5）。
 * v2 … src/lib 分割版（リファクタリングノート2026-06-10時点）。
 * v1 … App.svelte モノリス版（P0-0 で起動経路を一本化する前の実装）。
 * どちらも削除はせず、v3 が空のときの移行元としてのみ参照する。
 */
const legacyStorageKeyV2 = "neuronode-prototype-state-v2";
const legacyStorageKeyV1 = "neuro-trainer-state-v1";

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
    // 既定OFF。ONで操作訓練/効果測定/研究タブを表示する（P0-0, detailed-design.md §0.2）。
    researcherMode: false,
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

/** localStorage の生値を読み、JSON として壊れていれば null を返す。 */
function readLegacyState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 旧 settings から、現行 defaultState.settings に「同名キーのみ」を写す。
 * v1 の inputLockMs / buttonScale のように v3 に対応先がないキーは無視する
 * （detailed-design.md §9.5 手順3）。
 */
function migrateSettingsKeys(sourceSettings) {
  if (!sourceSettings || typeof sourceSettings !== "object") return {};
  const migrated = {};
  Object.keys(defaultState.settings).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(sourceSettings, key)) {
      migrated[key] = sourceSettings[key];
    }
  });
  return migrated;
}

/**
 * v1（App.svelte モノリス版）のログ1件を v3 のログ形状へ写す。
 * v1 は時刻キーが `at`（v3 は `time`）で、`view` を持たないなど形が異なるため、
 * そのまま複製すると views/log.js の formatTime(entry.time) 等が
 * undefined を渡されて壊れる。ここで安全な形へ正規化する。
 */
function migrateLegacyLogEntryV1(entry) {
  return {
    time: typeof entry?.at === "string" ? entry.at : new Date().toISOString(),
    view: "legacy-v1",
    type: typeof entry?.type === "string" ? entry.type : "legacy",
    label: typeof entry?.label === "string" ? entry.label : "",
    success: entry?.success,
  };
}

/**
 * v3 が空のときに、v2 → v1 の順で旧保存を読み、移行できる範囲を v3 へ写す
 * （detailed-design.md §9.5）。移行できるのは settings（同名キーのみ）・logs・
 * evaluation（v2 のみ保有、participantId・completedSessions 等）まで。
 * v1 の metrics 構造は v3 に対応先がないため移行しない。移行元・移行範囲は
 * logs の先頭に記録する（旧キー自体は削除しない）。
 * @returns {object|null} 移行後の state。移行元が1つも無ければ null。
 */
function migrateLegacyState() {
  const v2 = readLegacyState(legacyStorageKeyV2);
  if (v2) {
    const migrated = cloneDefaultState();
    migrated.settings = { ...migrated.settings, ...migrateSettingsKeys(v2.settings) };
    migrated.logs = Array.isArray(v2.logs) ? v2.logs.slice(0, 300) : [];
    if (v2.evaluation && typeof v2.evaluation === "object") {
      migrated.evaluation = {
        ...migrated.evaluation,
        ...v2.evaluation,
        results: Array.isArray(v2.evaluation.results) ? v2.evaluation.results : [],
        completedSessions: Array.isArray(v2.evaluation.completedSessions)
          ? v2.evaluation.completedSessions
          : [],
      };
    }
    migrated.logs.unshift({
      time: new Date().toISOString(),
      view: "system",
      type: "migration",
      label: `旧保存(${legacyStorageKeyV2})から移行しました（settings/logs/evaluationのみ）。`,
      success: true,
    });
    return migrated;
  }

  const v1 = readLegacyState(legacyStorageKeyV1);
  if (v1) {
    const migrated = cloneDefaultState();
    migrated.settings = { ...migrated.settings, ...migrateSettingsKeys(v1.settings) };
    migrated.logs = Array.isArray(v1.logs)
      ? v1.logs.slice(0, 300).map(migrateLegacyLogEntryV1)
      : [];
    // v1 から移行・metrics は引き継ぎ対象外（v3 に対応するスキーマがないため）。
    migrated.logs.unshift({
      time: new Date().toISOString(),
      view: "system",
      type: "migration",
      label: `旧保存(${legacyStorageKeyV1})から移行しました。metricsは引き継ぎ対象外です。`,
      success: true,
    });
    return migrated;
  }

  return null;
}

/**
 * localStorage から状態を読み込む。
 * 保存形式の差分（古い保存・欠落キー）は defaultState とマージして吸収する。
 * v3 キーが空の場合は v2 → v1 の順で旧保存からの移行を試みる（§9.5）。
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return migrateLegacyState() || cloneDefaultState();
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
