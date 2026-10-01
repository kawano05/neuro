// 演出だけを閉じ込める境目（src/lib/presentation.js）。
// 演出の失敗は飲み込んで続け、課題の時計の失敗は隠さない（docs/rules/ud-checklist.md の C1）。
import assert from "node:assert/strict";
import test from "node:test";

import { createPresentationBoundary } from "../src/lib/presentation.js";

function boundary() {
  const reports = [];
  return { reports, ...createPresentationBoundary((label, error) => reports.push([label, error.message])) };
}

/** setTimeout と rAF を手で進める窓。 */
function fakeWindow() {
  const queue = new Map();
  let nextId = 1;
  return {
    setTimeout(fn) {
      const id = nextId++;
      queue.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    requestAnimationFrame(fn) {
      queue.set(nextId++, fn);
    },
    flush() {
      const pending = [...queue.values()];
      queue.clear();
      pending.forEach((fn) => fn());
    },
  };
}

test("a thrown effect is reported and the caller gets the fallback", () => {
  const { run, reports } = boundary();
  const result = run("fx.burst", () => {
    throw new Error("boom");
  }, "fallback");
  assert.equal(result, "fallback");
  assert.deepEqual(reports, [["fx.burst", "boom"]]);
  assert.equal(run("fx.ok", () => 3), 3);
});

test("a rejected effect is reported and resolves to the fallback", async () => {
  const { run, reports } = boundary();
  assert.equal(await run("voice.speak", () => Promise.reject(new Error("no voice")), false), false);
  assert.deepEqual(reports, [["voice.speak", "no voice"]]);
});

test("protect wraps every method, nested objects too, with per-method fallbacks", () => {
  const { protect, reports } = boundary();
  const fx = protect(
    {
      level: () => {
        throw new Error("policy");
      },
      burst: () => {
        throw new Error("canvas");
      },
      engine: { draw: () => {
        throw new Error("draw");
      } },
    },
    "fx",
    { fallbacks: { level: "none" } }
  );
  assert.equal(fx.level(), "none");
  assert.equal(fx.burst(), undefined);
  assert.equal(fx.engine.draw(), undefined);
  assert.deepEqual(reports.map(([label]) => label), ["fx.level", "fx.burst", "fx.engine.draw"]);
});

test("the task clock passes through: its failures are not hidden", () => {
  const { protect, reports } = boundary();
  const audio = protect(
    {
      scheduler: { start: () => {
        throw new Error("clock");
      } },
      playTone: () => {
        throw new Error("tone");
      },
    },
    "audio",
    { passThrough: ["scheduler"] }
  );
  assert.throws(() => audio.scheduler.start(), /clock/);
  assert.equal(audio.playTone(), undefined);
  assert.deepEqual(reports.map(([label]) => label), ["audio.playTone"]);
});

test("protect returns the same wrapper for the same object", () => {
  const { protect } = boundary();
  const target = { burst() {} };
  assert.equal(protect(target, "fx"), protect(target, "fx"));
});

test("cancelTimers stops scheduled effects from firing on the next screen", () => {
  const { later, frame, cancelTimers } = boundary();
  const win = fakeWindow();
  const fired = [];
  later(100, () => fired.push("timer"), win);
  frame(() => fired.push("frame"), win);
  cancelTimers();
  win.flush();
  assert.deepEqual(fired, []);
  later(100, () => fired.push("after"), win);
  win.flush();
  assert.deepEqual(fired, ["after"]);
});
