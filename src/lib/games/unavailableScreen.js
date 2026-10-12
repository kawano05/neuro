// =====================================================================
// games/unavailableScreen.js — 音が出せず、合図が音の課題を始められないときの画面
//
// さかなつり（アタリの音）と、高い音だけ・リズム（拍の音）は、合図が音なので、
// 音が鳴らない端末・止まっている状態で始めても記録にならない。始めずに理由を出す
// （gameHost の段階 "unavailable"。ctx.markUnavailable で知らせる）。
//
// 次のひと押し: 音が止まっていただけ（iOS のスリープ・ほかのアプリ・読み上げのあと）なら、
// 押した操作の中で音を戻せるので、1回だけ もう一度ためす（遊びの retryUnavailable。9/30 の
// 打ち合わせで「高い音だけ が動かない」と言われた件の直し）。ためしても鳴らない・鳴らせない
// 端末なら、次のひと押しでホームへ戻す（スイッチだけの人を、この画面に閉じ込めない）。
//
// 以前は2つの遊びが同じ画面を日本語だけで別々に持っていた（英語の表記でも日本語が出た）。
// 原因で次の手が変わるので書き分ける: 音が「使えない端末」なら端末を変えるしかないが、
// 「止まっている」だけなら消音スイッチや音量、割り込みを直せばその場で続けられる。
// =====================================================================

/**
 * @param {HTMLElement} stageEl 遊びの面
 * @param {object} ctx ゲームの ctx（t / tHtml / announce / markUnavailable）
 * @param {"fishing"|"rhythm"} game どちらの遊びか（文が少し違う）
 * @param {string} audioState audio.scheduler.state()
 * @param {{canRetry?: boolean}} [options] canRetry … 次のひと押しで、もう一度ためせるか
 */
export function renderAudioUnavailable(stageEl, ctx, game, audioState, { canRetry = false } = {}) {
  if (!stageEl) return;
  const reason = audioState === "suspended" || audioState === "interrupted" ? "stopped" : "missing";
  // ためし直せるあいだは「押すと もう一度ためします」。そうでなければ「押すと戻れます」と次の手。
  const hint = canRetry
    ? ctx.tHtml("game.unavailable.hint.retry")
    : `${ctx.tHtml("game.unavailable.hint")} ${ctx.tHtml(`game.unavailable.next.${reason}`)}`;
  stageEl.innerHTML = `
    <div class="game-unavailable" data-reason="${reason}" data-retry="${canRetry}">
      <strong>${ctx.tHtml("game.unavailable.title")}</strong>
      <p>${ctx.tHtml(`game.unavailable.${reason}.${game}`)} ${ctx.tHtml(`game.unavailable.purpose.${game}`)}</p>
      <p class="game-unavailable-hint">
        ${hint}
      </p>
    </div>
  `;
  ctx.announce(ctx.t(`game.unavailable.announce.${game}`));
  ctx.markUnavailable?.();
}
