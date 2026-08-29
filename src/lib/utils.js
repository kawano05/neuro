// =====================================================================
// utils.js — 汎用ヘルパー（純粋関数のみ。DOM・状態に依存しない）
// =====================================================================

/** HTMLエスケープ（innerHTML へ流し込む文字列に必ず通す） */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

/**
 * CSVセルのエスケープ。
 *
 * 文字列セルの先頭（空白類を除く）が = / + / - / @ の場合、Excel等で
 * 数式として評価されないよう先頭へアポストロフィを付ける。数値型の負数は
 * 正当な数値としてそのまま出力する。
 */
export function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  const safeText =
    typeof value === "string" && /^[\s\ufeff]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

/** ISO文字列 → "HH:MM:SS"（ja-JP） */
export function formatTime(isoString) {
  const date = new Date(isoString);
  if (!Number.isFinite(date.getTime())) return "--:--:--";
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

/** ミリ秒 → "X分Y秒" / "Y秒" / "--" */
export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "--";
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

/**
 * スイッチ入力の多重発火（pointerdown → click 等、同一物理入力からの重複
 * イベント）を1入力に畳むためのヘルパー（detailed-design.md §3.3）。
 *
 * 閾値の根拠: 150ms は「同一イベントの重複除去」であり、利用者の連続入力を
 * 抑制するためのものではない。対象集団（重度肢体不自由等でスイッチ操作を
 * 行う利用者）が150ms以内に意図的な2連打を行うことは現実的に想定しづらく、
 * また NeuroNode 等のスイッチデバイス側にもチャタリング防止の信号処理がある
 * ため、この閾値は「入力の意図」ではなく「イベント配線の重複」だけを吸収する
 * 設計としている。
 *
 * DOM に依存しない純粋関数として切り出してあるため、tests/judge.test.mjs 等の
 * node 実行の単体テストから直接呼べる（detailed-design.md §11.1 の8番目）。
 *
 * @param {number} thresholdMs - 直前に受理した入力からこの時間未満の入力は棄却する
 * @returns {(t: number) => boolean} shouldAccept(t) - t（performance.now() 相当のms）を
 *   渡すと、受理するなら true を返し内部状態を更新する。棄却するなら false を返す
 *   （内部状態は更新しない）。
 */
export function createInputDeduper(thresholdMs) {
  let lastAcceptedAt = -Infinity;
  return function shouldAccept(t) {
    if (t - lastAcceptedAt < thresholdMs) return false;
    lastAcceptedAt = t;
    return true;
  };
}

/**
 * 保存されたISO時刻（UTC）を、端末のローカル時刻のISO文字列にする。
 *
 * なぜ要るか: 記録はUTCで持っている（`2026-08-28T12:00:00.000Z`）。使う人の
 * 時間帯の夕方に測った回はUTCでは同じ日の朝、深夜の回は前日になる。CSVを
 * 「日ごと」に集計すると境界がずれたまま数が出る——数字は出るので気づかない。
 *
 * 端末の時間帯を使う（固定の +09:00 にしない）。この教材は使う場所ごとに
 * 端末があり、支援者はその端末の時計で「今日の何時に測ったか」を認識する。
 * アプリだけが別の時間帯で書き出すと、別紙の記録と突き合わせるときに、
 * 突き合わせる側が毎回ずらして考えることになる。
 *
 * オフセットは必ず文字列に残す（`+09:00` / `+08:00` など）。落とすと、どの
 * 時間帯の値なのか分からなくなる——「どちらの時刻か分からない列」は、
 * 間違った列より質が悪い。オフセットが入っていれば、時間帯の違う端末で
 * 取った回どうしでも、解析側で同じ時刻軸へ戻せる。
 *
 * 端末の時計や時間帯の設定が狂っていれば、その狂ったまま出る。防ぎようが
 * ないので、生データJSONにはUTCのまま残してある（そちらが正本）。
 *
 * @param {string} isoString 保存されているISO時刻
 * @param {number} [offsetMinutes] UTCとの差（分、東が正）。既定は端末の設定。
 *   引数にしてあるのはテストのため——実行環境の時間帯は選べないので、
 *   これが無いと「+09:00 の端末で動かしたときだけ通るテスト」しか書けない。
 * @returns {string} `YYYY-MM-DDTHH:mm:ss.sss+09:00` 形式。読めない値は空文字。
 */
export function toLocalIso(isoString, offsetMinutes) {
  if (typeof isoString !== "string" || isoString === "") return "";
  const time = new Date(isoString).getTime();
  if (!Number.isFinite(time)) return "";
  // getTimezoneOffset() は「UTCより何分遅れているか」なので、東側は負。
  const resolvedOffset =
    typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)
      ? offsetMinutes
      : -new Date(time).getTimezoneOffset();
  const shifted = new Date(time + resolvedOffset * 60_000);
  const sign = resolvedOffset < 0 ? "-" : "+";
  const absolute = Math.abs(resolvedOffset);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  // toISOString() はUTCとして書き出すので、ずらしたあとの値の末尾 "Z" を
  // 実際のオフセットへ置き換える。
  return `${shifted.toISOString().slice(0, -1)}${sign}${hours}:${minutes}`;
}

/**
 * 書き出しファイル名に使う日付（YYYY-MM-DD、端末のローカル時刻）。
 *
 * `new Date().toISOString().slice(0, 10)` を使っていたため、中身はローカル
 * 時刻なのにファイル名の日付だけUTCだった。UTCより東の時間帯では、朝のうちに
 * 書き出すとファイル名が前日になる——書き出したファイルを日付で並べる運用では、
 * その1本だけ前日の束に入る（2026-08-29に発見）。
 */
export function localFileStamp(date = new Date()) {
  const iso = toLocalIso(date instanceof Date ? date.toISOString() : String(date));
  return iso ? iso.slice(0, 10) : "";
}
