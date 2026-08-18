// 走査リストのページ分割。
//
// 「最後のページの次は先頭へ戻る」のような境界は、画面を見ても壊れたことに
// 気づきにくい（見た目には項目が並んでいる）。走査は一方向にしか進めないので、
// 循環が壊れると目的の項目へ二度とたどり着けなくなる。
//
//   node tests/scan-paging.test.mjs

import assert from "node:assert/strict";
import {
  SCAN_OVERLAP_TOLERANCE_PX,
  SCAN_PAGE_SIZE,
  SCAN_PAGE_SIZE_MIN,
  pageSlice,
  shouldPaginate,
} from "../src/lib/scanPaging.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

const items = ["a", "b", "c", "d", "e"];

test("splits only when a short screen actually cannot hold the list", () => {
  // iPad 縦（1194px）は5枚とも入るので分けない。分けると1周の歩数が
  // 増えるだけで、待ち時間が伸びる。
  assert.equal(shouldPaginate(1194, 5), false);
  // スマホ縦（iPhone 14 の viewport 664px、SE 667px）は分ける。
  assert.equal(shouldPaginate(664, 5), true);
  assert.equal(shouldPaginate(667, 5), true);
  // 項目がページに収まるなら、画面が短くても分けない。
  assert.equal(shouldPaginate(664, 3), false);
  assert.equal(shouldPaginate(664, 2), false);
  // 高さが分からない環境では分けない（分けたことで選択肢が消えるほうが重い）。
  assert.equal(shouldPaginate(null, 5), false);
  assert.equal(shouldPaginate(Number.NaN, 5), false);
});

test("hands back one page at a time", () => {
  const first = pageSlice(items, 0, 3);
  assert.deepEqual(first.visible, ["a", "b", "c"]);
  assert.equal(first.pageCount, 2);
  assert.equal(first.nextPageIndex, 1);

  const second = pageSlice(items, 1, 3);
  assert.deepEqual(second.visible, ["d", "e"]);
  assert.equal(second.pageIndex, 1);
});

test("wraps from the last page back to the first", () => {
  // 走査は一方向にしか進めない。最後のページで止まると、そこから先頭の
  // 項目へ戻る手段が無くなる。
  const last = pageSlice(items, 1, 3);
  assert.equal(last.nextPageIndex, 0);
  // 範囲外のページ番号も循環して正規化される（描画側が持ち帰る値）。
  assert.equal(pageSlice(items, 2, 3).pageIndex, 0);
  assert.equal(pageSlice(items, 5, 3).pageIndex, 1);
  // 負の値でも先頭より前へは行かない（-1 % 2 は -1 になる罠）。
  assert.equal(pageSlice(items, -1, 3).pageIndex, 1);
  assert.equal(pageSlice(items, -3, 3).pageIndex, 1);
});

test("stays sane for empty and single-page lists", () => {
  const empty = pageSlice([], 0, 3);
  assert.deepEqual(empty.visible, []);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.nextPageIndex, 0);

  const short = pageSlice(["a", "b"], 0, 3);
  assert.deepEqual(short.visible, ["a", "b"]);
  assert.equal(short.pageCount, 1);
  // 1ページしかないとき「つぎのページ」は出さない（描画側は pageCount で判断）。
  assert.equal(short.nextPageIndex, 0);

  // 配列でない値を渡されても落ちない（描画の途中で呼ばれうる）。
  assert.deepEqual(pageSlice(null, 0, 3).visible, []);
});

test("keeps the page size at three so one cycle stays short", () => {
  // 3項目＋「つぎへ」で1周4歩。既定の走査間隔 1600ms では 6.4秒で、
  // 目的の項目へ戻るまでの待ち時間としてこのあたりが上限に近い。
  assert.equal(SCAN_PAGE_SIZE, 3);
  const page = pageSlice(items, 0, SCAN_PAGE_SIZE);
  assert.equal(page.visible.length + 1, 4);
});

test("the height threshold is only a first guess, not the real check", () => {
  // 812px の縦長スマホは、しきい値（740px）では「入る」と判定される。
  // 実際には入らず、下2枚がドックの裏に隠れていた——タイルの高さは文言の
  // 折り返しで変わる（実測 80〜128px）ので、画面高さの定数では当てられない。
  //
  // これを「当ての外れ」として記録しておく。最終的な判定は描いたあとの
  // 実測（views/home.js の listOverflowsDock → refitIfOverflowing）で、
  // ここを直したつもりで実測側を消すと同じ穴が開く。
  assert.equal(shouldPaginate(812, 5), false, "しきい値だけでは 812px を取りこぼす");
});

test("page size never shrinks below two", () => {
  // 入りきらない画面では1ページの件数を減らすが、下限は2。
  // 1項目＋「つぎへ」では走査の半分がページ送りになり、選ぶ体験にならない。
  assert.equal(SCAN_PAGE_SIZE_MIN, 2);
  assert.ok(SCAN_PAGE_SIZE_MIN < SCAN_PAGE_SIZE);
  // 減らしたページ数でも循環は保たれる（走査は一方向にしか進めない）。
  const slice = pageSlice(items, 2, SCAN_PAGE_SIZE_MIN);
  assert.equal(slice.pageCount, 3);
  assert.equal(slice.pageIndex, 2);
  assert.equal(slice.nextPageIndex, 0, "最後のページの次は先頭へ戻る");
});

test("a few pixels of overlap is not 'out of reach'", () => {
  // 実測で 2px だけ重なる実寸があった（スマホ横 844x390）。そこでページを
  // 分けると、分ける必要のない画面まで1周が伸びる。
  assert.ok(SCAN_OVERLAP_TOLERANCE_PX >= 2);
  // かといって、タイル1枚ぶん（実測 80〜128px）を許してはいけない。
  assert.ok(SCAN_OVERLAP_TOLERANCE_PX < 80);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("scan paging tests passed");
