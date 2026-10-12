import assert from "node:assert/strict";
import { test } from "node:test";
import { createScanEngine } from "../src/lib/scan.js";
import { isSupporterView, USER_WORLD_VIEWS } from "../src/lib/viewWorld.js";

// 実時間やブラウザに依存せず、タイマー所有権と各入口からの停止を確かめる。
function fixture(run) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const timers = new Map();
  const pending = [];
  let clicks = 0;
  const classes = new Set();
  const tile = {
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    getBoundingClientRect: () => ({ width: 100, height: 100 }),
    scrollIntoView() {},
    click() { clicks += 1; },
  };
  const toggle = { ...tile, classList: { add() {}, remove() {} } };
  globalThis.document = {
    querySelector: () => ({ querySelectorAll: () => [tile] }),
    querySelectorAll: (selector) => selector === ".scan-focus" && classes.has("scan-focus") ? [tile] : [],
  };
  globalThis.window = {
    setInterval: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
    setTimeout: (callback) => pending.push(callback),
  };
  const state = { currentView: "home", settings: { autoScan: true, scanInterval: 1600 } };
  const elements = { toggleScan: toggle, scanState: {}, toggleScanLabel: {} };
  const scan = createScanEngine({ state, elements });
  try {
    run({ state, scan, timers, pending, classes, clicks: () => clicks });
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  }
}

test("new screens default to the supporter world until explicitly allowed", () => {
  for (const view of USER_WORLD_VIEWS) assert.equal(isSupporterView(view), false);
  for (const view of ["settings", "log", "future-supporter-screen", undefined]) {
    assert.equal(isSupporterView(view), true);
  }
});

for (const view of ["settings", "log", "future-supporter-screen"]) {
  test(`${view}: every scan entry stops the timer and refuses activation`, () => fixture(({ state, scan, timers, classes, clicks }) => {
    scan.start();
    assert.equal(timers.size, 1);
    assert.equal(classes.has("scan-focus"), true);
    state.currentView = view;
    scan.refresh();
    assert.equal(timers.size, 0, "refresh must cancel the old home timer");
    for (const entry of ["refresh", "step", "start", "restartIfNeeded", "activate", "toggle"]) {
      scan[entry]();
      assert.equal(scan.isRunning(), false, entry);
      assert.equal(timers.size, 0, entry);
      assert.equal(classes.size, 0, entry);
      assert.equal(clicks(), 0, entry);
    }
  }));
}

test("a queued home restart cannot revive scanning after entering the log", () => fixture(({ state, scan, pending, timers, classes }) => {
  scan.restartIfNeeded();
  state.currentView = "log";
  pending.shift()();
  assert.equal(timers.size, 0);
  assert.equal(classes.size, 0);
}));

for (const view of ["settings", "log"]) {
  test(`${view}: returning home resumes automatic scanning and switch activation`, () => fixture(({ state, scan, pending, timers, classes, clicks }) => {
    state.currentView = view;
    scan.restartIfNeeded();
    state.currentView = "home";
    scan.restartIfNeeded();
    pending.shift()();
    assert.equal(timers.size, 1);
    assert.equal(classes.has("scan-focus"), true);
    scan.activate();
    assert.equal(clicks(), 1);
  }));
}

test("returning home preserves manual scanning and native Switch Control preferences", () => {
  for (const settings of [{ autoScan: false }, { switchControlMode: true }]) {
    fixture(({ state, scan, pending, timers }) => {
      Object.assign(state.settings, settings);
      state.currentView = "log";
      scan.restartIfNeeded();
      state.currentView = "home";
      scan.restartIfNeeded();
      pending.splice(0).forEach((callback) => callback());
      assert.equal(timers.size, 0);
    });
  }
});
