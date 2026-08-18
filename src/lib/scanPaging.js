// =====================================================================
// scanPaging.js — 走査リストのページ分割
//
// なぜ要るか: 走査（オートスキャン）で選ぶ画面では、選択肢が画面の外に
// あること自体が欠陥になる。scan.js は現在位置へ scrollIntoView するが、
// 利用者はスクロールを止めることも戻すこともできないので、選択のたびに
// 画面が動くと「選ぶ」課題が「選ぶ＋動く画面を追う」課題に変わる。
// 走査で選ぶUIが伝統的にスクロールではなくページ送りを使うのはこのため。
//
// スマホ実測（修正前）: iPhone 14 縦でホームの4番目・5番目のタイルが
// 入力ドックの裏に完全に隠れたまま「いま えらんでいます」になっていた。
// scroll-margin で可視性は確保したが、それでも画面は動く。短い画面では
// そもそも動かさない。
//
// 何を削って何を削らないか: 削るのは1ページあたりの項目数であって、
// タップ標的の大きさではない。ここの利用者は狙って押すこと自体が難しく、
// 収めるために標的を縮めるのは本末転倒になる。
//
// DOM に触れない純粋関数として置いてある。「最後のページから先頭へ戻る」
// のような境界の振る舞いは、画面を見ても壊れたことに気づきにくい。
// =====================================================================

/**
 * 1ページに出す選択肢の数。
 *
 * 3 なのは、ページ送り自身も走査対象を1つ使うから——3項目＋「つぎへ」で
 * 1周4ステップになる。走査間隔の既定 1600ms では1周 6.4秒で、目的の項目に
 * 戻ってくるまでの待ち時間としてはこのあたりが上限に近い。
 * 数を増やすと1周が伸び、減らすとページ送りの回数が増える。
 */
export const SCAN_PAGE_SIZE = 3;

/**
 * ページ送りを入れても入りきらないときに、ここまで減らす。
 *
 * 2 未満にはしない。1項目＋「つぎへ」では、走査の半分がページ送りになり、
 * 目的の項目に当たるまでの往復が増えるだけで「選ぶ」体験にならない。
 * それでも入らない画面は、項目の高さか画面の作りのほうを直す問題。
 */
export const SCAN_PAGE_SIZE_MIN = 2;

/**
 * ドックの裏へこれ以下しか出ていなければ、隠れているとは見なさない。
 *
 * ここで見たいのは「その項目に届かない」ことで、縁が少し重なることではない。
 * 実測した重なりの幅:
 *   2px   スマホ横 844x390 … 見た目には重なっていない
 *   8px   iPad 縦・大きい文字ON … 5枚目の下端だけ。95%以上見えている
 *   63px  スマホ縦 390x812 の「つぎのページ」… ほぼ隠れて押せない
 *   182px 旧実装のホーム4・5枚目 … まるごと隠れていた
 *
 * 24px は、ドックの高さ（実測100px）の1/4、タイルの高さ（80〜151px）の
 * 1/3未満。ここを下回る重なりなら、その項目は8割以上見えている。
 *
 * 厳しくしすぎると別の害が出る: 8px で分けていたころ、iPad で大きい文字を
 * 入れた瞬間に選択肢が5つから3つへ減っていた（8px の重なりのために
 * ページ送りが増える）。
 */
export const SCAN_OVERLAP_TOLERANCE_PX = 24;

/**
 * この画面高さでページ分割するか。
 *
 * 高さで決めるのは、問題が「縦に入りきらないこと」だから。iPad 縦
 * (1194px) や横向きのタブレットでは5枚とも入るので分割しない——分割は
 * 1周の歩数を増やすので、要らないところで使うと単に遅くなる。
 * 740px は、スマホ縦（iPhone 14 の viewport 664px、SE 667px）が入り、
 * iPad 縦が入らない線として引いてある。
 */
/**
 * ここは**先読みの当て**でしかない。
 *
 * タイルの高さは文言の折り返しで変わる（実測 80〜128px）ので、「この高さなら
 * 入る」を画面高さの定数で当てるのは原理的に無理がある。実際 iPhone 14 の
 * 664px は分割されるのに、812px の縦長では分割されず、下2枚がドックの裏に
 * 隠れていた。最終的な判定は描いたあとの実測（views/home.js の
 * listOverflowsDock）で、ここは初回描画のちらつきを減らすためだけにある。
 */
export function shouldPaginate(viewportHeight, itemCount, pageSize = SCAN_PAGE_SIZE) {
  if (typeof viewportHeight !== "number" || !Number.isFinite(viewportHeight)) return false;
  if (itemCount <= pageSize) return false;
  return viewportHeight <= 740;
}

/**
 * ページ1枚ぶんの切り出し。
 *
 * @param {Array} items 全項目
 * @param {number} pageIndex 0起点。範囲外は循環させる（走査は一方向にしか
 *   進めないので、最後のページの次は先頭へ戻れないと目的の項目へ二度と
 *   たどり着けなくなる）
 * @param {number} pageSize
 * @returns {{visible:Array, pageIndex:number, pageCount:number, nextPageIndex:number}}
 */
export function pageSlice(items, pageIndex, pageSize = SCAN_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(list.length / size));
  // 負のページ番号でも循環させる（(-1 % 3) は -1 になるので二重に足す）。
  const page = ((Math.trunc(pageIndex) % pageCount) + pageCount) % pageCount;
  return {
    visible: list.slice(page * size, page * size + size),
    pageIndex: page,
    pageCount,
    nextPageIndex: (page + 1) % pageCount,
  };
}
