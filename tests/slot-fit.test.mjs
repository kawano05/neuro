// そくていの回のリールを「収める見え方」にするかの判定（src/lib/games/slotFit.js）。
import assert from "node:assert/strict";
import test from "node:test";

import { slotLayoutNeedsFit, supportsFittedReels } from "../src/lib/games/slotFit.js";

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

// iPad の横向き（1180x820）で、決まった大きさのリールが収まっているときの配置（実測）。
const ipadStage = box(0, 0, 1180, 820);
const ipadBars = [box(16, 16, 174, 48), box(1058, 16, 106, 48)];
const ipadParts = [box(410, 50, 360, 94), box(470, 160, 240, 40), box(155, 225, 870, 406), box(330, 645, 520, 125)];

test("a layout that shows everything keeps the fixed-size reels", () => {
  assert.equal(slotLayoutNeedsFit({ stage: ipadStage, parts: ipadParts, bars: ipadBars }), false);
});

test("a target card pushed above the screen needs the fitted layout", () => {
  // スマホの横向き（844x390）: 目標の札が画面の上の外（-144px）にあった。
  const stage = box(0, 0, 844, 390);
  const parts = [box(242, -144, 360, 94), box(300, -40, 240, 40), box(40, 20, 764, 406)];
  assert.equal(slotLayoutNeedsFit({ stage, parts, bars: [] }), true);
});

test("a part hidden under the top bar needs the fitted layout", () => {
  // スマホの縦向き（390x664）: 目標の札（y=29）が「のこり」と「おわる」の裏に入っていた。
  const stage = box(0, 0, 390, 664);
  const bars = [box(16, 16, 150, 48), box(270, 16, 104, 48)];
  const parts = [box(52, 29, 286, 94), box(20, 185, 350, 388)];
  assert.equal(slotLayoutNeedsFit({ stage, parts, bars }), true);
});

test("a part below the bottom edge needs the fitted layout", () => {
  const stage = box(0, 0, 390, 664);
  const parts = [box(52, 108, 286, 94), box(40, 560, 310, 137)];
  assert.equal(slotLayoutNeedsFit({ stage, parts, bars: [] }), true);
});

test("touching an edge or a bar within the rounding slack is not an overlap", () => {
  const stage = box(0, 0, 1180, 820);
  // 帯の下端（64px）にちょうど触れている札、画面の下端から 0.5px 出ている6つの絵。
  const parts = [box(16, 64, 360, 94), box(330, 695, 520, 125.5)];
  assert.equal(slotLayoutNeedsFit({ stage, parts, bars: [box(16, 16, 174, 48)] }), false);
});

test("boxes without a size are ignored", () => {
  // 出していない6つの絵（display: none）や、まだ字の無いことばは大きさが 0。
  const parts = [...ipadParts, box(0, -500, 0, 0), box(-50, 900, 0, 20)];
  const bars = [...ipadBars, box(410, 50, 0, 0)];
  assert.equal(slotLayoutNeedsFit({ stage: ipadStage, parts, bars }), false);
  assert.equal(slotLayoutNeedsFit({ stage: ipadStage, parts: [null, undefined], bars: null }), false);
});

test("the fitted layout is only offered where container units exist", () => {
  assert.equal(supportsFittedReels({ supports: (property, value) => property === "height" && value === "1cqh" }), true);
  assert.equal(supportsFittedReels({ supports: () => false }), false);
  assert.equal(supportsFittedReels(undefined), false);
});
