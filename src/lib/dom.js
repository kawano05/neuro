// =====================================================================
// dom.js — Svelte が描画したマークアップへの参照を一括取得する
// 設定は共通の項目定義から収集する（docs/settings-simple-2026-09-30.md）。
//
// id を変更・追加した場合はここに追記する。各ビューは elements 経由でのみ
// DOM に触れる（直接 querySelector しない）ことで、参照箇所を追いやすくする。
// 例外: 走査エンジン（scan.js）と操作訓練のカーソル更新は動的要素を扱うため
// document.querySelector を併用している。
// =====================================================================

import { SETTINGS_FIELDS } from "./settingsFields.js";

export function collectElements() {
  return {
    // 設定UIと同じ定義からIDを収集し、手書きの項目一覧を重複させない。
    ...Object.fromEntries(SETTINGS_FIELDS.flatMap(field => [
      [field.id, document.getElementById(field.id)],
      ...(field.type === "range" ? [[field.id + "Value", document.getElementById(field.id + "Value")]] : []),
    ])),
    scanState: document.querySelector("#scanState"),
    homeSupporterMenu: document.querySelector("#homeSupporterMenu"),
    liveRegion: document.querySelector("#liveRegion"),
    tabs: [...document.querySelectorAll(".tab")],
    views: [...document.querySelectorAll(".view")],
    // 支援者の世界（タブ群）から home へ戻る導線（detailed-design.md §10）。
    homeReturn: document.querySelector("#homeReturn"),
    // P1-1（新4ビュー、detailed-design.md §10）。start/home/game/result。
    startStage: document.querySelector("#startStage"),
    // 利用者の世界の固定文言（表記モードで差し替える）。
    startTitle: document.querySelector("#start-title"),
    startStageLabel: document.querySelector(".start-stage-label"),
    gameTitle: document.querySelector("#game-title"),
    resultTitle: document.querySelector("#result-title"),
    startArt: document.querySelector("#startArt"),
    startLead: document.querySelector("#startLead"),
    gameTileGrid: document.querySelector("#gameTileGrid"),
    homeEyebrow: document.querySelector("#homeEyebrow"),
    homeTitle: document.querySelector("#home-title"),
    homeGuide: document.querySelector("#homeGuide"),
    homeOrderNote: document.querySelector("#homeOrderNote"),
    gameStage: document.querySelector("#gameStage"),
    gameStageContent: document.querySelector("#gameStageContent"),
    gameProgress: document.querySelector("#gameProgress"),
    gameExit: document.querySelector("#gameExit"),
    gameSettings: document.querySelector("#gameSettings"),
    gameSettingsDialog: document.querySelector("#gameSettingsDialog"),
    resultStats: document.querySelector("#resultStats"),
    resultRetry: document.querySelector("#resultRetry"),
    resultHome: document.querySelector("#resultHome"),
    // P4-3（detailed-design.md §8.2）: キャリブレーションの「候補値を保存
    // しますか」導線。走査対象外・タップ専用（data-scan を付けない、
    // games/gameHost.js が stopPropagation で入力ファネル外にする）。
    calibrationOffer: document.querySelector("#calibrationOffer"),
    calibrationOfferText: document.querySelector("#calibrationOfferText"),
    calibrationSaveOffset: document.querySelector("#calibrationSaveOffset"),
    matchingPrompt: document.querySelector("#matchingPrompt"),
    matchingGrid: document.querySelector("#matchingGrid"),
    nextMatching: document.querySelector("#nextMatching"),
    categoryRow: document.querySelector("#categoryRow"),
    phraseGrid: document.querySelector("#phraseGrid"),
    currentPhrase: document.querySelector("#currentPhrase"),
    repeatPhrase: document.querySelector("#repeatPhrase"),
    letterPrompt: document.querySelector("#letterPrompt"),
    letterGrid: document.querySelector("#letterGrid"),
    nextLetter: document.querySelector("#nextLetter"),
    operationModeGrid: document.querySelector("#operationModeGrid"),
    operationModeTitle: document.querySelector("#operationModeTitle"),
    operationGuide: document.querySelector("#operationGuide"),
    operationStage: document.querySelector("#operationStage"),
    operationPrimary: document.querySelector("#operationPrimary"),
    nextOperationTarget: document.querySelector("#nextOperationTarget"),
    resetOperation: document.querySelector("#resetOperation"),
    operationTrials: document.querySelector("#operationTrials"),
    operationSuccessRate: document.querySelector("#operationSuccessRate"),
    participantId: document.querySelector("#participantId"),
    exportRhythmCsv: document.querySelector("#exportRhythmCsv"),
    exportSlotCsv: document.querySelector("#exportSlotCsv"),
    exportSessionLedgerCsv: document.querySelector("#exportSessionLedgerCsv"),
    exportRawJson: document.querySelector("#exportRawJson"),
    sessionRetentionWarning: document.querySelector("#sessionRetentionWarning"),
    exportScanCsv: document.querySelector("#exportScanCsv"),
    exportRtCsv: document.querySelector("#exportRtCsv"),
    handOverParticipant: document.querySelector("#handOverParticipant"),
    taskMistakes: document.querySelector("#taskMistakes"),
    taskTimingErrors: document.querySelector("#taskTimingErrors"),
    researchProfileGrid: document.querySelector("#researchProfileGrid"),
    offsetDistribution: document.querySelector("#offsetDistribution"),
    readinessChecklist: document.querySelector("#readinessChecklist"),
    readinessScore: document.querySelector("#readinessScore"),
    researchEnvironment: document.querySelector("#researchEnvironment"),
    deploymentNotes: document.querySelector("#deploymentNotes"),
    copyDeploymentNote: document.querySelector("#copyDeploymentNote"),
    researchProtocolHint: document.querySelector("#researchProtocolHint"),
    totalInputs: document.querySelector("#totalInputs"),
    accuracyRate: document.querySelector("#accuracyRate"),
    mistakeCount: document.querySelector("#mistakeCount"),
    logList: document.querySelector("#logList"),
    sessionList: document.querySelector("#sessionList"),
    sessionTrends: document.querySelector("#sessionTrends"),
    trendTabs: document.querySelector("#trendTabs"),
    exportCsv: document.querySelector("#exportCsv"),
    clearLog: document.querySelector("#clearLog"),
    switchControlModeNotice: document.querySelector("#switchControlModeNotice"),
    supporterMessage: document.querySelector("#supporterMessage"),
    measureModeNotice: document.querySelector("#measureModeNotice"),
    // そくていに入る前の成立確認（src/lib/readinessCheck.js）。
    readinessCheck: document.querySelector("#readinessCheck"),
    readinessLead: document.querySelector("#readinessLead"),
    readinessList: document.querySelector("#readinessList"),
    startCalibration: document.querySelector("#startCalibration"),
    toggleScan: document.querySelector("#toggleScan"),
    toggleScanLabel: document.querySelector("#toggleScanLabel"),
    primarySwitch: document.querySelector("#primarySwitch"),
    primarySwitchLabel: document.querySelector("#primarySwitchLabel"),
  };
}
