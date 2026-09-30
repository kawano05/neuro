// =====================================================================
// dataExport.js — 記録を CSV の行にする関数（画面は持たない）
//
// 評価ログの画面（書き出しボタン・参加者ID・切り替え）は、2026-09-30 に
// 支援者の画面から外した。記録（state.sessions / state.logs）は今までどおり
// 端末に残る。ここには、それを CSV の行にする純粋な関数だけを残す
// （tests/data-integrity.test.mjs と scripts/probes/ が使う）。
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

import { toLocalIso } from "./utils.js";
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
          ]);
        });
      });
    return rows;
  }
  return [];
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
