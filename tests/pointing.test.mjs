import assert from "node:assert/strict";
import { evaluatePick, graspOutcome, scanPercentAt } from "../src/lib/games/pointing.js";

assert.equal(scanPercentAt(0, 1600), 0);
assert.equal(scanPercentAt(800, 1600), 50);
assert.equal(scanPercentAt(1600, 1600), 100);
assert.equal(scanPercentAt(2400, 1600), 50);
assert.equal(scanPercentAt(3200, 1600), 0);
assert.equal(scanPercentAt(-800, 1600), 50);
assert.equal(scanPercentAt(100, 0), 0);

const exact = evaluatePick({ x: 30, y: 40 }, { x: 30, y: 40, r: 12 });
assert.deepEqual(exact, { dx: 0, dy: 0, distance: 0, success: true });

const edge = evaluatePick({ x: 42, y: 40 }, { x: 30, y: 40, r: 12 });
assert.equal(edge.distance, 12);
assert.equal(edge.success, true);

assert.equal(graspOutcome(6, 12), "grip");
assert.equal(graspOutcome(6.0001, 12), "slip");
assert.equal(graspOutcome(12, 12), "slip");
assert.equal(graspOutcome(12.0001, 12), "miss");

console.log("pointing tests passed");
