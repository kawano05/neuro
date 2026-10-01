// =====================================================================
// dataExport.js — 支援者が記録を取り出すための面（評価ログの中に置く）
//
// もとは「効果測定セッション」画面（views/evaluation.js）だった。手順を
// 画面で案内し、支援者が成功／失敗やカウンタを手で押していく作りだったが、
// 手順は別紙の手順書へ置き換え、アプリに残すのは「記録を取り出す手段」と
// 「取り違えを防ぐ手当て」だけにした（2026-08-29）。
//
// 消したもの: セッション開始・終了、タスクの成功／失敗、誤選択・戻り・
// アシスト・タイミングのカウンタ、3件法の評定、観察メモ、条件プロファイル。
// これらだけが持っていた27列の効果測定CSVも一緒に消えている。単一評価者の
// 主観評定は紙で取って別管理にするほうが、出所が明確になる。
//
// 研究データ本体（state.sessions）はここでは作らない。作るのは各ゲームで、
// この面は書き出すだけ。
// =====================================================================

import { createRecordBackup } from "./recordBackup.js";
import { cloneDefaultState, MAX_SESSIONS } from "./state.js";
import { escapeCsv, exportFileStamp, toLocalIso } from "./utils.js";
import { storageKey } from "./content.js";
import { buildSlotCsvRows } from "./slotCsv.js";
export { buildSlotCsvRows };

const COMMON_TASK_HEADERS = [
  "sessionId",
  "taskType",
  "participantId",
  "gameId",
  // 端末のローカル時刻（オフセット付き）。名前も Jst にして、UTCだった頃の書き出しと
  // 取り違えられないようにする。
  "startedAtLocal",
  "aborted",
  "trialIndex",
];

/**
 * どの端末で測ったか（session.device / audio.js の getDeviceInfo）。
 *
 * 記録はしていたのに、どのCSVにも出していなかった。保存されているだけの値は
 * 解析に使えないので、実質「記録していない」のと同じ——visualGuidance を
 * sanitize から落としていたときと同じ型の穴。
 *
 * iPad とスマホの両方で動くようにした以上、端末は測定条件のひとつになる
 * （画面の大きさ・視距離・刺激の実寸・スピーカー特性・音の出力遅延が
 * まとめて変わる）。混ぜて集計してよいかを決めるのは解析側なので、
 * アプリは材料を曇りなく出すところまでを担う。
 *
 * 列は必ず**末尾**に足す（detailed-design.md §9.3 の既存列互換）。
 */
const DEVICE_HEADERS = [
  "deviceViewportWidth",
  "deviceViewportHeight",
  "devicePixelRatio",
  "deviceOutputLatencyS",
  "deviceBaseLatencyS",
  "deviceUserAgent",
  // その回の入力経路（direct / ios-switch-control）。OS走査経由の入力は
  // 合成clickのみが届き、経路も遅延も違う——反応時間の一次の交絡。
  // 空欄は「記録していない回」（この列を足す前の記録）。
  "deviceInputMethod",
];

/**
 * セッション台帳CSV（1セッション1行、全 taskType 横断）。
 *
 * これまでの5本のCSVはすべて「1試行1行」のロング形式で、セッションそのものを
 * 数える手段が無かった。解析を始める前に必ず要るのは、試行の中身ではなく
 * 台帳のほう——誰の回が何回あり、どれがそくていで、どれが中断で、どれが
 * 成立確認を飛ばして測った回か。ロング形式から復元しようとすると、
 * 「試行が0件で保存された回」（中断・音が出なかった回）が最初から見えない。
 * 欠測を数えられないデータは、欠測が無いデータと区別がつかない。
 *
 * summary は課題ごとに形が違う。共通化して数個の指標に潰すと、潰した先が
 * 課題ごとに違う意味になるので、そのままJSONで1列に入れる（summaryJson）。
 * 解析側で必要な指標だけを開けばよく、アプリ側が意味を決めない。
 */
export const SESSION_LEDGER_HEADERS = Object.freeze([
  "sessionId",
  "participantId",
  "taskType",
  "gameId",
  "startedAtLocal",
  "endedAtLocal",
  "finished",
  "aborted",
  "difficultyMode",
  "measurementReadiness",
  // 「ずっとあそぶ」の回か。trialCount が回ごとに変わる理由がこれ。
  "endless",
  // 難度の上げ方の版。定数を変えると変更前後の回を比べられない。
  "endlessProtocolVersion",
  // その回がどう終わったか（planned / failure / cap / manual）。
  // エンドレスでは trialCount が主要指標になるので、同じ数でも
  // 「失敗して終わった」「支援者が止めた」「上限に達した」で意味が違う。
  "endReason",
  "trialCount",
  "excludedTrialCount",
  "protocolVersion",
  "engineVersion",
  // いまの版で検証していない回か（games/slotState.js）。版を上げたあとも
  // 記録は残すが、現行版の回と同じ分布に混ぜてはいけない。
  "legacyVersion",
  ...DEVICE_HEADERS,
  "configJson",
  "summaryJson",
  // 演出の強さ（src/lib/fx/）。configJson の中にもあるが、層別にすぐ使えるよう列にも出す。
  // 末尾に足す（列位置を動かさない）。演出エンジンより前の記録は空欄。
  "fxLevel",
  // 見え方の版（config.artVersion。その回に画面へ出した絵の版、src/lib/artVersion.js）。
  // fxLevel の後ろに足す。版を持たない課題と、この列より前の記録は空欄。
  "artVersion",
]);

function deviceColumns(session) {
  const device = session?.device || {};
  return [
    device.viewportWidth ?? "",
    device.viewportHeight ?? "",
    device.devicePixelRatio ?? "",
    device.outputLatencyS ?? "",
    device.baseLatencyS ?? "",
    device.userAgent ?? "",
    device.inputMethod ?? "",
  ];
}

/**
 * リズム計測結果のCSV行（19列、ロング形式。detailed-design.md §9.3）。
 * 1試行1行。summary は含めない（解析側で再計算できるので二重管理を避ける）。
 * correctRejection / miss の行は inputMs / rawOffsetMs が空欄になる
 * （trials 側で null にしてあるため、そのまま escapeCsv に渡せば空欄になる）。
 *
 * 純粋関数として切り出してあるのは、これが研究の主要な出力だから。列の順序と
 * 内容をテストで固定できないと、解析側と静かに食い違ったまま卒論のデータが
 * 出る（tests/data-integrity.test.mjs）。
 */
export function buildRhythmCsvRows(sessions) {
  const rows = [
    [
      "sessionId",
      "participantId",
      "gameId",
      // 端末のローカル時刻（オフセット付き）。列名も Iso から Local へ変える——中身の意味を
      // 変えるのに名前を残すと、以前の書き出しをUTCとして読んでいる手元の
      // 集計が、黙って9時間ずれた値を受け取る。名前を変えれば、そこで
      // 止まって気づける。
      "startedAtLocal",
      "aborted",
      "mode",
      "bpm",
      "countInBeats",
      "judgmentWindowMs",
      "effectiveWindowMs",
      "appliedBaselineMs",
      "beatIndex",
      "beatKind",
      "scheduledMs",
      "inputMs",
      "rawOffsetMs",
      "judgment",
      "excluded",
      // 19列目。その回、画面から拍の手がかり（予告の溜め＋ずれの目盛り）を
      // 出していたか。出していた回の入力は聴覚キューだけへの同期ではない
      // ので、解析でこの列を分けずに混ぜると、測っているものが違う行が
      // 同じ分布に入る（settings.visualGuidance / games/rhythm.js）。
      //
      // 既存18列の**後ろ**に足すこと自体が要件（detailed-design.md §9.3
      // 「この18列は既存データ互換のため変更しない」）。途中に挿すと
      // それ以降の列位置がずれ、位置で読んでいる解析側が黙って壊れる。
      "visualGuidance",
      // 20列目。そくてい（研究）かれんしゅう（訓練）か。解析ではまず
      // measure だけを見ればよい——主要測定の条件を固定するための列。
      "difficultyMode",
      ...DEVICE_HEADERS,
      // 端末列の**さらに後ろ**。成立確認（src/lib/readinessCheck.js）が
      // 通った状態で測ったか: met / overridden / n/a。
      //
      // overridden は「高低を聞き分けられるか等を確かめないまま測った回」。
      // 成績が低かったときに、抑制の失敗なのか、そもそも課題が成立して
      // いなかったのかを、この列が無いと後から分けられない。
      // 除外するかどうかを決めるのは解析側なので、アプリは測定を止めず
      // 記録する（測定条件は禁止せず記録する、という全体の方針）。
      "measurementReadiness",
      // 演出の強さ（src/lib/fx/。none / subtle / normal / big）。れんしゅうの回は、
      // 当たったときの星や紙吹雪が成績に効きうる。末尾に足す（列位置を動かさない）。
      // 演出エンジンより前の記録は空欄。
      "fxLevel",
      // 見え方の版（その回に画面へ出した絵の版。src/lib/artVersion.js）。高い音だけの
      // れんしゅうの回は絵を作り直したので、変わる前後の回を分ける。そくていの回はいつでも 1。
      // fxLevel の後ろに足す（列位置を動かさない）。この列より前の記録は空欄。
      "artVersion",
    ],
  ];
  sessions.forEach((session) => {
    const config = session.config || {};
    (session.trials || []).forEach((trial) => {
      rows.push([
        session.sessionId,
        session.participantId || "",
        session.gameId,
        toLocalIso(session.startedAtIso),
        session.aborted,
        config.mode ?? "",
        config.bpm ?? "",
        config.countInBeats ?? "",
        config.judgmentWindowMs ?? "",
        config.effectiveWindowMs ?? "",
        trial.appliedBaselineMs ?? "",
        trial.beatIndex ?? "",
        trial.beatKind ?? "",
        trial.scheduledMs ?? "",
        trial.inputMs ?? "",
        trial.rawOffsetMs ?? "",
        trial.judgment,
        trial.excluded,
        config.visualGuidance === true,
        config.difficultyMode ?? "practice",
        ...deviceColumns(session),
        config.measurementReadiness ?? "n/a",
        config.fxLevel ?? "",
        config.artVersion ?? "",
      ]);
    });
  });
  return rows;
}

export function buildSessionLedgerRows(sessions) {
  const rows = [[...SESSION_LEDGER_HEADERS]];
  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    if (!session || typeof session !== "object") return;
    const trials = Array.isArray(session.trials) ? session.trials : [];
    rows.push([
      session.sessionId ?? "",
      session.participantId || "",
      session.taskType ?? "",
      session.gameId ?? "",
      toLocalIso(session.startedAtIso),
      // 終端を立てないまま消えた回は空欄。終わった回と見分けられるようにする。
      toLocalIso(session.endedAtIso),
      session.finished === true,
      session.aborted === true,
      session.config?.difficultyMode ?? "practice",
      session.config?.measurementReadiness ?? "n/a",
      session.config?.endless === true,
      session.config?.endlessProtocolVersion ?? "",
      session.endReason ?? "",
      trials.length,
      // 除外した試行の数。excluded を持たない課題では常に0になる。
      trials.filter((trial) => trial?.excluded === true).length,
      // slot だけが持つ版。他の課題では空欄——「無い」ことを空欄で表す。
      session.protocolVersion ?? "",
      session.engineVersion ?? "",
      session.legacyVersion === true,
      ...deviceColumns(session),
      JSON.stringify(session.config ?? {}),
      JSON.stringify(session.summary ?? {}),
      session.config?.fxLevel ?? "",
      session.config?.artVersion ?? "",
    ]);
  });
  return rows;
}

export function buildTaskCsvRows(sessions, taskType) {
  if (taskType === "scan") {
    const rows = [
      [
        ...COMMON_TASK_HEADERS,
        "targetX",
        "targetY",
        "toleranceR",
        "selectedX",
        "selectedY",
        "dx",
        "dy",
        "distance",
        "xPhaseMs",
        "yPhaseMs",
        "judgment",
        // その回、ねらいの通過音を鳴らしていたか（settings.craneAudioGuidance）。
        // 鳴らしていた回は画面を見ずに解けるので、視覚課題としての成績を
        // 混ぜてはいけない。既存列の後ろへ足す（列位置を動かさない）。
        "audioGuidance",
        // そくてい（研究）かれんしゅう（訓練）か。
        "difficultyMode",
        ...DEVICE_HEADERS,
        // 成立確認の状態（リズムCSVと同じ意味・同じ位置づけ）。
        "measurementReadiness",
        // その回が「ずっとあそぶ」だったか。回数が回ごとに変わるので、決まった
        // 回数の回と同じ分布に混ぜない（後半ほど疲れが乗る）。
        //
        // 末尾に足すこと。いちど audioGuidance と difficultyMode のあいだへ
        // 挿してしまい、それ以降の列が1つずつずれた——列位置で読んでいる
        // 解析側が黙って壊れる形（detailed-design.md §9.3）。テストが止めた。
        "endless",
        // その試行のアームの速さ。エンドレスでは試行ごとに変わるので、
        // toleranceR だけでは要求精度（grip圏の半径 × sweepMs/100）が出せない。
        "sweepMs",
        "endlessProtocolVersion",
        "endReason",
        // 演出の強さ（src/lib/fx/。none / subtle / normal / big）。れんしゅうの回は、
        // 当たったときの星や紙吹雪が成績に効きうる。末尾に足す（列位置を動かさない）。
        // 演出エンジンより前の記録は空欄。
        "fxLevel",
        // 見え方の版（config.artVersion）。れんしゅうの回の絵が変わった前後を分ける。
        // fxLevel の後ろに足す（列位置を動かさない）。この列より前の記録は空欄。
        "artVersion",
      ],
    ];
    sessions
      .filter((session) => session.taskType === "scan")
      .forEach((session) => {
        (session.trials || []).forEach((trial) => {
          rows.push([
            session.sessionId,
            session.taskType,
            session.participantId || "",
            session.gameId,
            toLocalIso(session.startedAtIso),
            session.aborted,
            trial.index,
            trial.targetX,
            trial.targetY,
            trial.toleranceR,
            trial.selectedX,
            trial.selectedY,
            trial.dx,
            trial.dy,
            trial.distance,
            trial.xPhaseMs,
            trial.yPhaseMs,
            trial.judgment,
            session.config?.audioGuidance === true,
            session.config?.difficultyMode ?? "practice",
            ...deviceColumns(session),
            session.config?.measurementReadiness ?? "n/a",
            session.config?.endless === true,
            trial.sweepMs ?? session.config?.sweepMs ?? "",
            session.config?.endlessProtocolVersion ?? "",
            session.endReason ?? "",
            session.config?.fxLevel ?? "",
            session.config?.artVersion ?? "",
          ]);
        });
      });
    return rows;
  }

  if (taskType === "rt") {
    const rows = [
      [
        ...COMMON_TASK_HEADERS,
        "kind",
        "foreperiodMs",
        "cueMs",
        "inputMs",
        "reactionTimeMs",
        "judgment",
        "excluded",
        ...DEVICE_HEADERS,
        // 末尾に足す（既存列の位置を動かさない）。リズム・走査CSVには
        // 最初からあったのに、反応CSVだけ測定条件が1つも出ていなかった。
        "difficultyMode",
        "measurementReadiness",
        // その回が「ずっとあそぶ」だったか（走査CSVと同じ意味）。
        "endless",
        // その試行の受付時間。エンドレスでは試行ごとに短くなるので、
        // config の値だけでは何段目の試行かを復元できない。
        "limitMs",
        "endlessProtocolVersion",
        "endReason",
        // 演出の強さ（src/lib/fx/。none / subtle / normal / big）。れんしゅうの回は、
        // 当たったときの星や紙吹雪が成績に効きうる。末尾に足す（列位置を動かさない）。
        // 演出エンジンより前の記録は空欄。
        "fxLevel",
        // 見え方の版（config.artVersion）。れんしゅうの回の絵が変わった前後を分ける。
        // fxLevel の後ろに足す（列位置を動かさない）。この列より前の記録は空欄。
        "artVersion",
      ],
    ];
    sessions
      .filter((session) => session.taskType === "rt")
      .forEach((session) => {
        (session.trials || []).forEach((trial) => {
          rows.push([
            session.sessionId,
            session.taskType,
            session.participantId || "",
            session.gameId,
            toLocalIso(session.startedAtIso),
            session.aborted,
            trial.index,
            trial.kind,
            trial.foreperiodMs,
            trial.cueMs,
            trial.inputMs ?? "",
            trial.reactionTimeMs ?? "",
            trial.judgment,
            trial.excluded,
            ...deviceColumns(session),
            session.config?.difficultyMode ?? "practice",
            session.config?.measurementReadiness ?? "n/a",
            session.config?.endless === true,
            trial.limitMs ?? session.config?.limitMs ?? "",
            session.config?.endlessProtocolVersion ?? "",
            session.endReason ?? "",
            session.config?.fxLevel ?? "",
            session.config?.artVersion ?? "",
          ]);
        });
      });
    return rows;
  }
  return [];
}

/**
 * 書き出す記録に入っている参加者（"" は参加者IDを入れずに記録した回）。
 * 並びは記録の順（はじめて出てきた順）。
 */
export function recordedParticipants(sessions) {
  return [...new Set((Array.isArray(sessions) ? sessions : []).map((session) => session?.participantId || ""))];
}

/**
 * 書き出しの名前に入れる参加者。
 *
 * 以前は「いま欄に入っている参加者ID」を使っていたので、次の人のIDを入れてから前の人の記録を
 * 書き出すと、名前と中身の参加者が食い違った（確かめ表 B4）。名前は中身から決める:
 * 記録の参加者が1人ならそのID（IDなしの回だけなら no-id）、2人以上（IDなしの回が混ざる場合も）
 * なら multi。記録が1件も無いもの（操作ログだけ）は no-id。
 */
export function exportParticipantLabel(sessions) {
  const participants = recordedParticipants(sessions);
  if (participants.length > 1) return "multi";
  return participants[0] || "";
}

/**
 * 参加者を切り替えて記録を消したあと、欄に残す参加者ID。
 *
 * 書き出したあとに入れた次の人のIDなら残す（消してから入れ直させない）。前の人のIDが
 * 残っていると、次の人の回に前の人のIDが焼き付く（取り違え。確かめ表 B4）ので、消す記録の
 * 参加者か、書き出したときに欄にあったIDなら空にする。
 */
export function nextParticipantAfterHandOver(typed, sessions, participantAtExport) {
  const id = typed || "";
  if (!id || id === participantAtExport || recordedParticipants(sessions).includes(id)) return "";
  return id;
}

/** 書き出しのファイル名（neuronode-slot-P001-2026-10-01-153000.csv）。 */
export function exportFileName(stem, sessions, extension, date = new Date()) {
  return `${stem}-${exportFileStamp(exportParticipantLabel(sessions), date)}.${extension}`;
}

/** CSV の本文（Excel が UTF-8 と分かるよう、先頭に BOM を付けるのは download の側）。 */
export function csvText(rows) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

/**
 * 課題ごとの書き出し。押したボタン・名前・記録の選び方・列・無いときの知らせを1か所に持つ。
 * kind は控え（recordBackup.js）の種類。消す前に、記録に入っている課題の種類がすべて
 * 書き出してあるかをこの名前で確かめる。
 */
const TASK_EXPORTS = [
  {
    button: "exportRhythmCsv",
    kind: "rhythm",
    stem: "neuronode-rhythm",
    select: (session) => session.taskType === "sms" || session.taskType === "gonogo",
    rows: buildRhythmCsvRows,
    empty: "書き出すリズム計測データがありません",
    how: "リズムまたはGo/No-Goを1回終えると記録されます。",
  },
  {
    button: "exportSlotCsv",
    kind: "slot",
    stem: "neuronode-slot",
    select: (session) => session.taskType === "slot",
    rows: buildSlotCsvRows,
    empty: "書き出すリール停止データがありません",
    how: "L1またはL2を1回終えると記録されます。",
  },
  {
    button: "exportScanCsv",
    kind: "scan",
    stem: "neuronode-scan",
    select: (session) => session.taskType === "scan",
    rows: (sessions) => buildTaskCsvRows(sessions, "scan"),
    empty: "書き出す走査課題データがありません",
    how: "利用者が該当のあそびを1回終えると記録されます。",
  },
  {
    button: "exportRtCsv",
    kind: "rt",
    stem: "neuronode-rt",
    select: (session) => session.taskType === "rt",
    rows: (sessions) => buildTaskCsvRows(sessions, "rt"),
    empty: "書き出す反応課題データがありません",
    how: "利用者が該当のあそびを1回終えると記録されます。",
  },
  {
    button: "exportSessionLedgerCsv",
    kind: "ledger",
    stem: "neuronode-sessions",
    select: () => true,
    rows: buildSessionLedgerRows,
    empty: "書き出すセッションがありません",
    how: "あそびを1回終えると1行ぶん記録されます。",
  },
];

export function initDataExport(ctx) {
  const { state, elements, save, announce, notifySupporter } = ctx;

  const backup = createRecordBackup(state);
  ctx.recordBackup = backup;

  /**
   * 記録を1つのファイルにして渡す（ただ1つの道）。
   *
   * rows（表）なら BOM 付きの CSV、それ以外は JSON。名前は書き出す記録の参加者と時刻から
   * 決め（exportFileName）、書き出したことを控え（kind）に残す。評価ログの操作ログCSVも
   * ここを通る（ctx.downloadRecords）。
   *
   * @param {Array<Array>|object} content
   * @param {string} stem ファイル名の頭（neuronode-slot など）
   * @param {string} kind 控えの種類（recordBackup.js）
   * @param {Array<object>} sessions 名前の参加者を決める記録（既定は端末の全セッション）
   * @returns {string} 付けたファイル名
   */
  function download(content, stem, kind, sessions = state.sessions) {
    const isCsv = Array.isArray(content);
    const blob = isCsv
      ? new Blob([`﻿${csvText(content)}`], { type: "text/csv;charset=utf-8" })
      : new Blob([JSON.stringify(content, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(stem, sessions, isCsv ? "csv" : "json");
    link.click();
    backup.mark(kind);
    URL.revokeObjectURL(url);
    return link.download;
  }
  ctx.downloadRecords = download;

  function exportTask(definition) {
    const sessions = state.sessions.filter(definition.select);
    if (!sessions.length) {
      // announce の出力先 #liveRegion は .sr-only なので、読み上げを使わない支援者には
      // 何も届かない——押しても無反応に見え、壊れていると受け取られる。画面にも出す。
      announce(definition.empty);
      notifySupporter(`${definition.empty}。${definition.how}`);
      return;
    }
    download(definition.rows(sessions), definition.stem, definition.kind, sessions);
  }

  function exportRawJson() {
    const payload = {
      // 控えの中身は state そのまま（保存はUTC）。読む人のために、
      // 書き出した時刻だけ日本時間も併記する。
      exportedAtIso: new Date().toISOString(),
      exportedAtLocal: toLocalIso(new Date().toISOString()),
      storageKey,
      // CSVの列は増えるが、この控えは state の形そのもの。読む側が形を
      // 判別できるように、書き出し時のキー名を添える。
      sessionCount: state.sessions.length,
      logCount: state.logs.length,
      state,
    };
    download(payload, "neuronode-raw", "raw");
    notifySupporter(
      `生データを書き出しました（セッション${state.sessions.length}件、ログ${state.logs.length}件）。`
    );
  }

  function renderSessionRetention() {
    const warning = elements.sessionRetentionWarning;
    if (!warning) return;
    const count = state.sessions.length;
    const remaining = MAX_SESSIONS - count;
    if (remaining > 5) {
      warning.hidden = true;
      warning.textContent = "";
      return;
    }
    warning.hidden = false;
    warning.textContent =
      remaining > 0
        ? `セッションの保存上限（${MAX_SESSIONS}件）まであと${remaining}件です。` +
          "上限を超えると古い回から消えるので、先に「セッション台帳」と各CSV、" +
          "または「生データ(JSON)」を書き出してください。"
        : `セッションの保存上限（${MAX_SESSIONS}件）に達しています。` +
          "次の回を記録すると最も古い回が消えます。今すぐ書き出してください。";
  }

  function handOverToNextParticipant() {
    const sessionCount = state.sessions.length;
    const logCount = state.logs.length;
    if (sessionCount === 0 && logCount === 0) {
      notifySupporter("消すものがありません。この端末にはまだ記録が入っていません。");
      announce("消すものがありません");
      return;
    }
    if (!backup.canClear()) {
      notifySupporter(
        `現在の記録はまだすべて書き出していません。セッション${sessionCount}件・ログ${logCount}件が消えます。` +
          "先に「セッション台帳」と各CSV、または「生データ(JSON)」を書き出してください。"
      );
      announce("先に書き出してください");
      return;
    }
    if (!window.confirm(
      `この端末の記録を消します。\n\n` +
        `　セッション ${sessionCount}件\n` +
        `　操作ログ ${logCount}件\n` +
        `　測定結果と観察メモ\n\n` +
        "書き出したファイルは消えません。消した記録は元に戻せません。"
    )) {
      announce("消すのをやめました");
      return;
    }

    const nextParticipant = nextParticipantAfterHandOver(
      state.evaluation.participantId,
      state.sessions,
      backup.participantAtExport()
    );
    const fresh = cloneDefaultState();
    state.sessions = [];
    state.logs = [];
    state.evaluation = { ...fresh.evaluation, participantId: nextParticipant };
    state.arcade = { ...fresh.arcade };
    backup.reset();
    save();
    ctx.renderAll();
    if (nextParticipant) {
      notifySupporter(
        `記録を消しました（セッション${sessionCount}件・ログ${logCount}件）。` +
          `次の参加者「${nextParticipant}」で始められます。`
      );
      announce(`記録を消しました。次の参加者は${nextParticipant}です`);
    } else {
      notifySupporter(
        `記録を消しました（セッション${sessionCount}件・ログ${logCount}件）。` +
          "次の参加者IDを入れてから始めてください。"
      );
      announce("記録を消しました。次の参加者IDを入れてください");
    }
  }

  /** 参加者IDと保存上限の警告を画面へ反映する。 */
  function render() {
    if (elements.participantId) {
      elements.participantId.value = state.evaluation.participantId;
    }
    renderSessionRetention();
  }

  elements.participantId?.addEventListener("input", (event) => {
    state.evaluation.participantId = event.target.value;
    save();
  });
  TASK_EXPORTS.forEach((definition) => {
    elements[definition.button]?.addEventListener("click", () => exportTask(definition));
  });
  elements.exportRawJson?.addEventListener("click", exportRawJson);
  elements.handOverParticipant?.addEventListener("click", handOverToNextParticipant);

  return { render, exportRawJson };
}
