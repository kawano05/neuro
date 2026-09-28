// =====================================================================
// games/slotFit.js — そくていの回のリールが、画面に収まっているか
//
// そくていの回のリールは、決まった大きさ（1コマ 94px、幅 620px 以下は 82px）で
// 出す（刺激の条件、docs/design-renewal-2026-09-25.md §3.3）。iPad ではそれで
// 収まるが、背の低い画面では入りきらなかった。遊びの面は中身を上下の真ん中に
// 置くので、入りきらない分は上と下へ同じだけはみ出し、上にはみ出した分は
// スクロールしても戻せない（2026-09-28 に実測: スマホの横向きで目標の札が丸ごと
// 画面の外、スマホの縦向きで札が上の帯の裏）。
//
// 決まった大きさのままで全部見えているときは、見え方を 1px も変えない。
// 見えないものがあるときだけ、収める見え方（theme-hakkiri.css の
// .slot-stage.is-fitted）にする。そのときも 1コマは決まった大きさより大きく
// しない（縮めるだけ）。実際の1コマの高さは、回の記録（config.reelCellPx）に残す。
// =====================================================================

/** 見るもの。どれか1つでも見えなければ、収める見え方にする。 */
const PART_SELECTORS = [".slot-target", ".slot-status", ".slot-reels", ".slot-symbol-guide"];
/** 上の帯（のこり・この遊びの設定・おわる）。遊びの面の上に重なっている。 */
const BAR_SELECTOR = ".game-progress, .game-actions > :not([hidden])";

function hasArea(rect) {
  return Boolean(rect) && rect.width > 0 && rect.height > 0;
}

/** 2つの箱が重なっているか。slack 以内で触れているだけは重なりにしない。 */
function overlaps(a, b, slack) {
  return a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
}

/**
 * 決まった大きさのリールのままで、見るもの（目標の札・ことば・リール・6つの絵）が
 * 全部見えているか。1つでも遊びの面の外に出ているか、上の帯の裏に入っていれば true。
 *
 * 大きさの無い箱（出していない6つの絵、まだ字の無いことば）は数えない。
 *
 * @param {{ stage: DOMRect, parts: Array<DOMRect|null>, bars: Array<DOMRect|null> }} layout
 * @param {number} [slackPx] 丸めの誤差として見逃す幅
 * @returns {boolean} 収める見え方にするなら true
 */
export function slotLayoutNeedsFit({ stage, parts, bars }, slackPx = 1) {
  const covers = (bars || []).filter(hasArea);
  return (parts || []).filter(hasArea).some(
    (part) =>
      part.top < stage.top - slackPx ||
      part.bottom > stage.bottom + slackPx ||
      part.left < stage.left - slackPx ||
      part.right > stage.right + slackPx ||
      covers.some((bar) => overlaps(part, bar, slackPx))
  );
}

/** コンテナの単位（cqh）が使えるか。使えない古い端末（iOS 16 より前）は、今までの見え方のまま。 */
export function supportsFittedReels(css = globalThis.CSS) {
  return Boolean(css?.supports?.("height", "1cqh"));
}

/**
 * そくていの回のリールを、入りきらないときだけ収める見え方にする。
 * いったん外して決まった大きさで測り、見えないものがあれば付け直す。同じ
 * フレームの中で終わるので、ちらつかない。
 *
 * @param {HTMLElement} stageEl 遊びの面（.slot-stage）
 * @returns {boolean} 収める見え方にしたか
 */
export function fitMeasuredReels(stageEl) {
  if (!stageEl || !supportsFittedReels()) return false;
  stageEl.classList.remove("is-fitted", "is-whole");
  const view = stageEl.closest(".view") || stageEl.ownerDocument;
  const rectOf = (element) => (element ? element.getBoundingClientRect() : null);
  const needsFit = slotLayoutNeedsFit({
    stage: stageEl.getBoundingClientRect(),
    parts: PART_SELECTORS.map((selector) => rectOf(stageEl.querySelector(selector))),
    bars: [...view.querySelectorAll(BAR_SELECTOR)].map(rectOf),
  });
  stageEl.classList.toggle("is-fitted", needsFit);
  // 全部見えているときは、遊びの面をスクロールさせない。はみ出しが余白だけの
  // 画面（iPad mini の横向きで 9px、1280x720 で 21px）で、指やホイールで面が
  // ずれて目標の札が上へ隠れないように。見え方は変わらない。
  stageEl.classList.toggle("is-whole", !needsFit);
  return needsFit;
}

/**
 * いまの1コマの高さ（px、小数1桁）。窓は 3コマぶんの高さ（枠を含む、border-box）。
 * @param {HTMLElement} stageEl
 * @returns {number|null}
 */
export function reelCellPx(stageEl) {
  const windowEl = stageEl?.querySelector(".slot-reel-window");
  if (!windowEl) return null;
  const cell = windowEl.getBoundingClientRect().height / 3;
  return Number.isFinite(cell) && cell > 0 ? Math.round(cell * 10) / 10 : null;
}
