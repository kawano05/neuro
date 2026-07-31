import assert from "node:assert/strict";
import { generateForeperiods, judgeReaction } from "../src/lib/games/reaction.js";

assert.deepEqual(generateForeperiods(3, 1500, 5000, () => 0), [1500, 1500, 1500]);
assert.deepEqual(generateForeperiods(2, 1500, 5000, () => 1), [5000, 5000]);
assert.deepEqual(
  generateForeperiods(3, 1500, 5000, (() => {
    const values = [0, 0.5, 1];
    return () => values.shift();
  })()),
  [1500, 3250, 5000]
);

assert.equal(judgeReaction(999, 1000, 2000, "real"), "falseStart");
assert.equal(judgeReaction(1000, 1000, 2000, "real"), "hit");
assert.equal(judgeReaction(3000, 1000, 2000, "real"), "hit");
assert.equal(judgeReaction(3000.001, 1000, 2000, "real"), "timeout");
assert.equal(judgeReaction(null, 1000, 2000, "real"), "timeout");
assert.equal(judgeReaction(900, 1000, 2000, "fake"), "commission");
assert.equal(judgeReaction(1200, 1000, 2000, "fake"), "commission");
assert.equal(judgeReaction(null, 1000, 2000, "fake"), "correctRejection");

console.log("reaction tests passed");
