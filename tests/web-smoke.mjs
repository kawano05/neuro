import { chromium, devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { storageKey } from "../src/lib/content.js";

const baseUrl = "http://127.0.0.1:4173";
const headed = process.argv.includes("--headed");

const projects = [
  {
    name: "chromium-desktop",
    browserType: chromium,
    contextOptions: { viewport: { width: 1280, height: 900 } },
  },
  {
    name: "mobile-webkit-like",
    browserType: webkit,
    contextOptions: devices["iPhone 14"],
  },
];

const checks = [
  ["loads the main learning app", checkMainApp],
  ["plays start -> home -> color-legacy game -> home end to end", checkStartToHomeToGameFlow],
  ["picks rhythm-l1, hides the shell chrome, and records an aborted session on Esc", checkRhythmL1GameFlow],
  ["moves between visible feature tabs", checkFeatureTabs],
  ["keeps researcher-mode tabs (evaluation/settings) working after toggling it on", checkResearcherModeTabsNoRegression],
  ["keeps the mobile layout inside the viewport", checkMobileLayout],
];

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", "4173"], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (data) => process.stdout.write(data));
server.stderr.on("data", (data) => process.stderr.write(data));

const failures = [];

try {
  await waitForServer();

  for (const project of projects) {
    const browser = await project.browserType.launch({ headless: !headed });
    try {
      for (const [name, check] of checks) {
        const context = await browser.newContext(project.contextOptions);
        await context.addInitScript(() => localStorage.clear());
        const page = await context.newPage();
        try {
          await page.goto(baseUrl);
          await check(page);
          console.log(`ok ${project.name}: ${name}`);
        } catch (error) {
          failures.push({ project: project.name, name, error });
          console.error(`failed ${project.name}: ${name}`);
          console.error(error);
        } finally {
          await context.close().catch(() => {});
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }
} finally {
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} smoke test(s) failed.`);
  process.exit(1);
}

console.log(`\n${projects.length * checks.length} smoke tests passed.`);
process.exit(0);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function checkMainApp(page) {
  await waitForText(page, "h1", "neuro");
  // 8 tabs exist in the DOM (5 always-visible + 3 researcher-mode tabs that
  // stay hidden until settings.researcherMode is enabled, see App.svelte /
  // styles.css .researcher-tab). The former "switcher" tab was removed when
  // its "color change" behavior was migrated into games/colorLegacy.js
  // (P1-2/P1-3, detailed-design.md §12).
  await waitForCount(page, ".tab", 8);
  // The app always boots into the start screen (detailed-design.md §2.1:
  // MUST start from "start" even on revisit, to guarantee the AudioContext
  // unlock + input continuity check every time).
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").waitFor({ state: "visible" });

  // Design-deviation regression check (detailed-design.md §2.1/§8.4): the
  // start screen has no scan targets and scanning MUST stay fully stopped,
  // not merely "not yet started". Before this fix, scan.js's start()/
  // restartIfNeeded() guards only checked currentView==="game", so the
  // default autoScan=true (state.js) would keep scanning the tabbar behind
  // the start screen and the header badge would read "走査中". Confirm the
  // badge reads stopped and that no element ever gains .scan-focus even
  // after waiting past the default scanInterval (1600ms, state.js).
  await waitForText(page, "#scanState", "走査停止中");
  await page.waitForTimeout(1900);
  await waitForText(page, "#scanState", "走査停止中");
  const scanFocusCount = await page.locator(".scan-focus").count();
  assert(scanFocusCount === 0, `Expected no .scan-focus elements on the start screen, found ${scanFocusCount}`);
}

/**
 * Plays through the primary user flow end to end: start screen -> (one
 * input) -> home (game tile grid) -> pick the color-legacy tile -> game
 * screen (scan/tabbar/header hidden) -> input registers -> exit back to
 * home. This is the P1-3 completion criterion from detailed-design.md §12.
 */
async function checkStartToHomeToGameFlow(page) {
  await waitForClass(page, "#startView", "is-active");

  // One input on the start stage unlocks audio, plays a confirmation tone,
  // logs a "switch" event, and advances to home (detailed-design.md §2.2).
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 6);

  // The color-legacy tile is enabled and first by order (content.js gameTiles).
  const tiles = page.locator("#gameTileGrid .game-tile:not([disabled])");
  await tiles.first().click();

  // Entering a game stops scanning and hides the tabbar/header/dock
  // (detailed-design.md §2.4, body.game-mode).
  await waitForClass(page, "#gameView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // Design-deviation regression check (basic-design.md §3.1 "画面全体が単一の
  // スイッチ"): #gameStage must cover the full viewport with no dead margin
  // at the bottom. Before this fix, .game-stage used a stale
  // `calc(100vh - 300px)` sized for the (now-hidden) header/tabbar/dock,
  // which left an unreachable strip at the bottom of tall viewports (found
  // on iPad portrait, 834x1210, during on-device verification). #gameView is
  // now position:fixed; inset:0 while body.game-mode is active, so the stage
  // should span from y=0 to the full viewport height.
  const stageBox = await page.locator("#gameStage").boundingBox();
  const viewportSize = page.viewportSize();
  assert(stageBox, "Expected #gameStage to have a bounding box while in game mode");
  assert(Math.abs(stageBox.y) <= 1, `Expected #gameStage to start at the top of the viewport, got y=${stageBox.y}`);
  assert(
    Math.abs(stageBox.y + stageBox.height - viewportSize.height) <= 1,
    `Expected #gameStage to cover the full viewport height, got bottom=${stageBox.y + stageBox.height} viewport=${viewportSize.height}`
  );

  // The shell dedupes switch-input events within 150ms of each other (the
  // startStage press above still counts as the "last accepted input" for
  // that window; see utils.js createInputDeduper / detailed-design.md §3.3).
  // A real switch user could not physically traverse start -> home -> game
  // and press again within 150ms, but Playwright can, so wait past the
  // window before treating this as a distinct input.
  await page.waitForTimeout(200);

  // Tapping the full-screen game stage is a switch input for color-legacy:
  // it changes color/tone and announces via the live region. Click the
  // center (default) rather than a corner, since #gameProgress/#gameExit are
  // absolutely positioned in the corners and would intercept a corner click.
  await page.locator("#gameStage").click();
  await waitForText(page, "#liveRegion", "色変化に入力しました");

  // The keyboard fallback (Space) goes through the same input funnel and
  // reaches the game too (detailed-design.md §3.3). Wait past the dedupe
  // window again (same reasoning as above).
  await page.evaluate(() => document.querySelector("#liveRegion").textContent = "");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await waitForText(page, "#liveRegion", "色変化に入力しました");

  // Esc aborts the game and returns to home directly (no result screen for
  // color-legacy; see games/colorLegacy.js for the design rationale).
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "visible" });
}

/**
 * P5-1 (detailed-design.md §11.2 items 2-3): pick the rhythm-l1 tile, confirm
 * the game screen hides the shell chrome and stops scanning the same way
 * color-legacy does, then abort with Esc and confirm the shell returns to
 * home directly (no result screen for an aborted session, detailed-design.md
 * §2.4) *and* that an aborted session was actually persisted to
 * state.rhythm.sessions (games/rhythm.js destroy(), detailed-design.md §7.3).
 */
async function checkRhythmL1GameFlow(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 6);

  // Tile order (content.js gameTiles): color-legacy, rhythm-l1, rhythm-l2,
  // gonogo, calibration, future-slot(disabled). rhythm-l1 is the 2nd enabled tile.
  const tiles = page.locator("#gameTileGrid .game-tile:not([disabled])");
  await tiles.nth(1).click();

  await waitForClass(page, "#gameView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("game-mode"));
  // Same shell-chrome-hidden assertions as the color-legacy flow above
  // (detailed-design.md §2.4/§10): tabbar/switch-dock (and with them the
  // scan toggle + scan state readout) are gone while a game is active.
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // Let the countdown/first beat render a moment before aborting.
  await page.waitForTimeout(500);

  // Esc aborts the game and returns to home *directly* (no result screen;
  // detailed-design.md §2.4 terminates the flow via gameHost.abort()).
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "visible" });

  // The abort path (games/rhythm.js destroy(), gameHost.js persistRhythmSession)
  // must still have written an aborted session for rhythm-l1 (detailed-design.md
  // §7.3 MUST: trials recorded so far are confirmed with aborted:true, no
  // silent data loss on early exit).
  const hasAbortedSession = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return (state.rhythm?.sessions || []).some(
      (session) => session.gameId === "rhythm-l1" && session.aborted === true
    );
  }, storageKey);
  assert(hasAbortedSession, "Expected an aborted rhythm-l1 session in state.rhythm.sessions");
}

async function checkFeatureTabs(page) {
  // Only the always-visible tabs; operation/evaluation/research stay hidden
  // until "researcher mode" is turned on in settings (P0-0, detailed-design.md §0.2).
  const tabTargets = ["matching", "voca", "letters", "log", "settings"];

  for (const target of tabTargets) {
    await page.locator(`.tab[data-view="${target}"]`).click();
    await waitForClass(page, `#${target}`, "is-active");
  }
}

/**
 * P5-1 (detailed-design.md §11.2 item 4): confirm the researcher-only tabs
 * (evaluation/operation/research, gated by settings.researcherMode since
 * P0-0) still render correctly after this phase's changes, and specifically
 * that the P3-1/P4 additions to the evaluation tab (rhythm CSV export
 * button) are present and unaffected — this is the "既存タブ(評価・設定)
 * 不退行" no-regression check the task calls out by name.
 */
async function checkResearcherModeTabsNoRegression(page) {
  await page.locator('.tab[data-view="settings"]').click();
  await waitForClass(page, "#settings", "is-active");

  // researcherMode defaults to OFF (P0-0); flip it on to reveal the tab.
  await page.locator("#researcherMode").click();
  await page.waitForFunction(() => document.body.classList.contains("researcher-mode"));

  await page.locator('.tab[data-view="evaluation"]').click();
  await waitForClass(page, "#evaluation", "is-active");
  await page.locator("#participantId").waitFor({ state: "visible" });
  await page.locator("#exportEvaluationCsv").waitFor({ state: "visible" });
  // P3-1's rhythm CSV export button lives alongside the pre-existing
  // evaluation CSV export; both must still be there (no regression).
  await page.locator("#exportRhythmCsv").waitFor({ state: "visible" });

  // Settings itself must keep working too (the tab we just used to flip
  // researcherMode on).
  await page.locator('.tab[data-view="settings"]').click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator("#researcherMode").waitFor({ state: "visible" });
}

async function checkMobileLayout(page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return document.documentElement.scrollWidth - width;
  });

  assert(overflow <= 2, `Expected horizontal overflow <= 2px, got ${overflow}px`);
  await page.locator(".switch-dock").waitFor({ state: "visible" });
  await page.locator("#primarySwitch").waitFor({ state: "visible" });
}

async function waitForText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, expected: text }) => document.querySelector(target)?.textContent?.trim() === text,
    { selector, expected },
    { timeout: 5_000 }
  );
}

async function waitForCount(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, expected: count }) => document.querySelectorAll(target).length === count,
    { selector, expected },
    { timeout: 5_000 }
  );
}

async function waitForClass(page, selector, className) {
  await page.waitForFunction(
    ({ selector: target, className: expectedClass }) =>
      document.querySelector(target)?.classList.contains(expectedClass),
    { selector, className },
    { timeout: 5_000 }
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
