import { chromium, devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { storageKey } from "../src/lib/content.js";

const port = await findAvailablePort();
const basePath = "/neuro-smoke/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
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
  {
    name: "ipad-portrait",
    browserType: webkit,
    contextOptions: { viewport: { width: 834, height: 1194 } },
  },
];

const checks = [
  ["loads the main learning app", checkMainApp],
  ["keeps the start press from falling through into a home activity", checkStartInputGuard],
  ["plays start -> home -> color-legacy game -> home end to end", checkStartToHomeToGameFlow],
  ["picks rhythm-l1, hides the shell chrome, and records an aborted session on Esc", checkRhythmL1GameFlow],
  ["starts fishing, records one rt trial, and destroys cleanly on exit", checkFishingGameFlow],
  ["plays one crane trial and destroys cleanly between trials", checkCraneGameFlow],
  ["moves between visible feature tabs", checkFeatureTabs],
  ["returns from a tab to home via the home-return button", checkHomeReturnFromTabs],
  ["keeps native keyboard activation separate from switch input", checkKeyboardAndSwitchInput],
  ["locks supporter editing without hiding it from keyboard access", checkSupporterEditingLock],
  ["keeps researcher-mode tabs (evaluation/settings) working after toggling it on", checkResearcherModeTabsNoRegression],
  ["serves valid PWA assets and reloads offline", checkPwaDelivery],
  ["keeps the mobile layout inside the viewport", checkMobileLayout],
  ["keeps the iPad home readable with large text and high contrast", checkIpadAccessibilityLayout],
  ["keeps the hidden attribute effective against CSS display rules", checkHiddenAttributeIsRespected],
  ["shows a visible reason when there is nothing to export", checkEmptyExportIsExplained],
];

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, BASE_PATH: basePath },
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
          await check(page, project);
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
  await stopServer();
}

if (failures.length) {
  console.error(`\n${failures.length} smoke test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${projects.length * checks.length} smoke tests passed.`);
}

async function findAvailablePort() {
  const probe = createNetServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const selectedPort = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  if (!selectedPort) throw new Error("Could not allocate an available test port");
  return selectedPort;
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    delay(2_000).then(() => {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    }),
  ]);
}

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
  await waitForText(page, "h1", "NEURONODE");
  // 5 tabs exist in the DOM (2 always-visible supporter tabs — log/settings —
  // + 3 researcher-mode tabs that stay hidden until settings.researcherMode
  // is enabled, see App.svelte / styles.css .researcher-tab). The former
  // matching/voca/letters tabs moved into the home screen's
  // "まなぶ・つたえる" second level since they are user-facing activities,
  // not supporter tools.
  await waitForCount(page, ".tab", 5);
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

/** A physical start press must not retarget its release/click to the new home UI. */
async function checkStartInputGuard(page) {
  const startBox = await page.locator("#startStage").boundingBox();
  assert(startBox, "Expected start stage bounds");
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 5);
  await page.waitForTimeout(600);
  assert(
    await page.locator("#homeView").evaluate((view) => view.classList.contains("is-active")),
    "Expected the first physical press to stop on home instead of launching an activity"
  );
  assert(
    !(await page.locator("#gameView").evaluate((view) => view.classList.contains("is-active"))),
    "Expected game view to remain inactive after the start press"
  );
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
  await waitForCount(page, "#gameTileGrid .game-tile", 5);

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

  // Games that carry a "やりかた" entry in content.js now open on the ready
  // screen (games/gameHost.js renderReady) so the rules are shown before any
  // beat is scheduled. The first press dismisses it and starts the session;
  // it is not a task input, so it must not be forwarded to the game nor
  // recorded in the log.
  await page.locator(".game-ready").waitFor({ state: "visible" });
  const logsBeforeReadyDismiss = await readLogCount(page);
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  assert(
    (await readLogCount(page)) === logsBeforeReadyDismiss,
    "Expected the ready-screen press to start the session without logging an input"
  );

  // Tapping the full-screen game stage is a switch input for color-legacy:
  // it changes color/tone and announces via the live region. Click the
  // center (default) rather than a corner, since #gameProgress/#gameExit are
  // absolutely positioned in the corners and would intercept a corner click.
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  await waitForText(page, "#liveRegion", "色変化に入力しました");

  // A long physical press produces pointerdown immediately and click only on
  // release. It is still one physical input even when the gap exceeds the
  // generic 150ms dedupe window.
  await page.waitForTimeout(200);
  const logsBeforeLongPress = await readLogCount(page);
  const longPressBox = await page.locator("#gameStage").boundingBox();
  assert(longPressBox, "Expected #gameStage bounds for the long-press regression check");
  await page.mouse.move(longPressBox.x + longPressBox.width / 2, longPressBox.y + longPressBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert(
    (await readLogCount(page)) === logsBeforeLongPress + 1,
    "Expected pointerdown plus delayed click to record exactly one switch input"
  );

  // Switch Control / assistive technologies may emit only a synthetic click
  // (detail=0) with no pointerdown. That click remains a valid single input.
  await page.waitForTimeout(200);
  const logsBeforeSyntheticClick = await readLogCount(page);
  await page.locator("#gameStage").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await page.waitForTimeout(50);
  assert(
    (await readLogCount(page)) === logsBeforeSyntheticClick + 1,
    "Expected click-only assistive activation to record one switch input"
  );

  // The keyboard fallback (Space) goes through the same input funnel and
  // reaches the game too (detailed-design.md §3.3). Wait past the dedupe
  // window again (same reasoning as above).
  await page.evaluate(() => document.querySelector("#liveRegion").textContent = "");
  await page.waitForTimeout(200);
  const logsBeforeRepeatedKey = await readLogCount(page);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, repeat: true }));
  });
  assert((await readLogCount(page)) === logsBeforeRepeatedKey, "Expected repeated keydown to be ignored");
  await page.keyboard.press("Space");
  await waitForText(page, "#liveRegion", "色変化に入力しました");

  // Esc aborts the game and returns to home directly (no result screen for
  // color-legacy; see games/colorLegacy.js for the design rationale).
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator("#homeSupporterMenu").waitFor({ state: "visible" });
}

/**
 * Regression check for the on-device gap found 2026-07-04 (basic-design.md
 * §3.2): once a switch user (or a supporter) moved from home into the
 * supporter's world (any tab), there was no way back to the user's world
 * short of force-quitting the app. #homeReturn ("← ホームへ") is the fix:
 * it must stay hidden while in the user's world (start/home/game/result) and
 * appear the moment a tab view is entered, and clicking/scanning to it must
 * take the user all the way back to #homeView and restart scanning there.
 */
async function checkHomeReturnFromTabs(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  // In the user's world (home), the return-to-home button makes no sense
  // and must not be shown or reachable by scanning (detailed-design.md §10).
  await page.locator("#homeReturn").waitFor({ state: "hidden" });

  // Enter the supporter's world through the tap/keyboard-only menu entry.
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator("#homeReturn").waitFor({ state: "visible" });

  // Clicking it must announce in hiragana, switch back to home, and hide
  // itself again now that we're back in the user's world.
  await page.evaluate(() => {
    document.querySelector("#liveRegion").textContent = "";
  });
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForText(page, "#liveRegion", "メニューにもどります");
  await page.locator("#homeReturn").waitFor({ state: "hidden" });

  // switchView("home") calls scan.restartIfNeeded(); with the default
  // autoScan=true (state.js) scanning must actually resume against home's
  // tiles, not stay stale/stopped from whatever the settings view left it in.
  await waitForText(page, "#scanState", "走査中");
}

/**
 * A keyboard user who tabs to a real control must get the browser's native
 * activation, while an unfocused Space/Enter press continues to act as the
 * single-switch input. This protects both keyboard accessibility and the
 * dedicated switch funnel from the old hidden-action regression.
 */
async function checkKeyboardAndSwitchInput(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.getByRole("button", { name: "まなぶ・つたえる", exact: true }).click();
  await page.locator('#gameTileGrid [data-view="voca"]').click();
  await waitForClass(page, "#voca", "is-active");

  // Stop auto scan so an unfocused Space has no selected target and therefore
  // must be a no-op rather than triggering a hidden training action.
  if ((await page.locator("#scanState").textContent())?.trim() === "走査中") {
    await page.locator("#toggleScan").click();
  }
  await waitForText(page, "#scanState", "走査停止中");

  const firstPhrase = page.locator("#phraseGrid button").first();
  await firstPhrase.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#currentPhrase")?.textContent?.trim() !== "まだ選択されていません");

  const logsBeforeUnfocusedSpace = await readLogCount(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert(
    (await readLogCount(page)) === logsBeforeUnfocusedSpace,
    "Expected unfocused Space with scanning stopped to leave the operation log unchanged"
  );

  // The physical-input substitute is intentionally outside [data-scan], so
  // it can activate the highlighted target without ever becoming a dead slot.
  assert(!(await page.locator("#primarySwitch").getAttribute("data-scan")), "Primary switch must not scan itself");
  await page.locator("#toggleScan").click();
  await waitForText(page, "#scanState", "走査中");
  // toggleScan の pointerdown と物理入力代替の pointerdown は別入力。
  // Playwrightは人間より速いため、150msの入力dedupe窓を越えてから押す。
  await page.waitForTimeout(200);
  await page.locator("#primarySwitch").click();
  await waitForClass(page, "#homeView", "is-active");
}

async function checkSupporterEditingLock(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");

  const editToggle = page.locator("#supporterEditToggle");
  await editToggle.waitFor({ state: "visible" });
  assert(!(await editToggle.getAttribute("data-scan")), "Supporter edit toggle must stay outside the app scan order");
  assert((await editToggle.getAttribute("aria-pressed")) === "false", "Supporter editing must start locked");
  assert(await page.locator("#scanInterval").isDisabled(), "Settings must be disabled while supporter editing is locked");
  assert(await page.locator("#researcherMode").isDisabled(), "Researcher mode must be disabled while locked");

  // ロックしていること自体より、ロックされていると分かることを守る。
  // 以前は設定画面の走査対象13個のうち9個が黙って無効になるだけで、
  // 理由も解除方法もどこにも出ていなかった（支援者には故障と区別がつかない）。
  const lockNotice = page.locator("#supporterLockNotice");
  await lockNotice.waitFor({ state: "visible" });
  assert(
    (await lockNotice.innerText()).includes("支援者編集を開始"),
    "The lock notice must name the control that unlocks the screen"
  );

  // The current tab is still a normal keyboard/AT control, but internal scan
  // must skip it because selecting it would only redraw the same view.
  if ((await page.locator("#scanState").textContent())?.trim() === "走査中") {
    await page.locator("#toggleScan").click();
  }
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press("ArrowRight");
    const focusedView = await page.locator(".scan-focus").getAttribute("data-view");
    assert(focusedView !== "settings", "Internal scan must skip the already-active settings tab");
  }
  await page.locator("#toggleScan").click();
  await waitForText(page, "#scanState", "走査中");

  // The control is excluded only from the app's scan order; keyboard and
  // assistive-technology users must still be able to reach and activate it.
  await editToggle.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#supporterEditToggle")?.getAttribute("aria-pressed") === "true");
  assert(!(await page.locator("#scanInterval").isDisabled()), "Settings must unlock after supporter activation");
  await lockNotice.waitFor({ state: "hidden" });

  // Turning auto scan off must stop an already-running interval immediately,
  // not merely prevent a future restart.
  await page.locator("#autoScan").click();
  await waitForText(page, "#scanState", "走査停止中");
  await page.locator("#autoScan").click();
  await waitForText(page, "#scanState", "走査中");

  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  assert((await editToggle.getAttribute("aria-pressed")) === "false", "Leaving supporter views must relock editing");
  assert(await page.locator("#scanInterval").isDisabled(), "Relocked settings must be disabled again");
}

/**
 * P5-1 (detailed-design.md §11.2 items 2-3): pick the rhythm-l1 tile, confirm
 * the game screen hides the shell chrome and stops scanning the same way
 * color-legacy does, then abort with Esc and confirm the shell returns to
 * home directly (no result screen for an aborted session, detailed-design.md
 * §2.4) *and* that an aborted session was actually persisted to
 * state.sessions (games/rhythm.js destroy(), detailed-design.md §7.3).
 */
async function checkRhythmL1GameFlow(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 5);

  await page.getByRole("button", { name: "リズム", exact: true }).click();
  await waitForCount(page, "#gameTileGrid .game-tile", 4);
  await page.getByRole("button", { name: "リズム れんしゅう", exact: true }).click();

  await waitForClass(page, "#gameView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("game-mode"));
  // Same shell-chrome-hidden assertions as the color-legacy flow above
  // (detailed-design.md §2.4/§10): tabbar/switch-dock (and with them the
  // scan toggle + scan state readout) are gone while a game is active.
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // The ready screen ("やりかた") comes first and no beat is scheduled until
  // it is dismissed (games/gameHost.js renderReady/beginSession). Aborting
  // from here would leave no session at all, so start the session before
  // testing the abort path below.
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });

  // Let the countdown/first beat render a moment before aborting.
  await page.waitForTimeout(500);

  // Esc aborts the game and returns to home *directly* (no result screen;
  // detailed-design.md §2.4 terminates the flow via gameHost.abort()).
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator("#homeSupporterMenu").waitFor({ state: "visible" });

  // The abort path (games/rhythm.js destroy(), gameHost.js persistSession)
  // must still have written an aborted session for rhythm-l1 (detailed-design.md
  // §7.3 MUST: trials recorded so far are confirmed with aborted:true, no
  // silent data loss on early exit).
  const hasAbortedSession = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const state = JSON.parse(raw);
    return (state.sessions || []).some(
      (session) => session.gameId === "rhythm-l1" && session.aborted === true
    );
  }, storageKey);
  assert(hasAbortedSession, "Expected an aborted rhythm-l1 session in state.sessions");
}

async function checkFishingGameFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  // さかなつりはコーナータイルになったので、二階層目で課題を選ぶ。
  // fishing（純粋な単純反応時間）と fishing-gonogo（抑制つき）に分けたのは、
  // taskType "rt" なのに No-Go 刺激が混ざっていた食い違いを解くため。
  await page.getByRole("button", { name: "さかなつり", exact: true }).click();
  await page.getByRole("button", { name: "アタリで つる", exact: true }).click();
  await waitForClass(page, "#gameView", "is-active");
  // さかなつりも content.js の gameHowTo を持つようになったので、レディ画面を
  // ひと押しで抜けてからでないとセッションが始まらない。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.waitForTimeout(220);
  // 前刺激区間の入力も falseStart / commission として1試行に確定する。
  await page.locator("#gameStage").click();
  await page.waitForFunction(
    (key) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      return (state.sessions || []).some(
        (session) => session.gameId === "fishing" && session.trials?.length === 1
      );
    },
    storageKey
  );
  await page.locator("#gameExit").click();
  await waitForClass(page, "#homeView", "is-active");
  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return (state.sessions || []).find((item) => item.gameId === "fishing");
  }, storageKey);
  assert(session?.taskType === "rt", "Expected fishing to persist taskType=rt");
  assert(session?.aborted === true, "Expected fishing exit to persist aborted=true");
}

// 関数宣言にしているのは、このファイルがトップレベル await でテスト本体を
// 走らせるため。const だと宣言位置より前に実行されて TDZ に落ちる。
async function waitForCraneStatus(page, text, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let seen = null;
  while (Date.now() < deadline) {
    seen = await page.evaluate(() => document.querySelector(".crane-status")?.textContent ?? null);
    if (seen === text) return;
    await delay(80);
  }
  throw new Error(`crane status never became "${text}" (last seen: "${seen}")`);
}

async function checkCraneGameFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.getByRole("button", { name: "アームを とめる", exact: true }).click();
  await waitForClass(page, "#gameView", "is-active");
  // crane も content.js の gameHowTo を持つようになったので、レディ画面を
  // ひと押しで抜けてからでないとセッションが始まらない。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  // カウントインの長さを固定の待ち時間で当てにいくと、AudioContext の
  // 立ち上がりが遅い環境（WebKit系）で走査開始前に押してしまう。
  // 走査が始まったことを状態表示で確かめてから押す。
  await waitForCraneStatus(page, "よこに うごきます");
  // 走査が始まった直後の押下は入力ガード（INPUT_GUARD_MS）で弾かれる。
  // ガードを抜けてから押す。
  await page.waitForTimeout(400);
  await page.locator("#gameStage").click();
  await waitForCraneStatus(page, "おくに うごきます");

  // フェーズ切り替え直後の二度押しは試行に使わない（games/crane.js の
  // INPUT_GUARD_MS）。痙性や振戦で入った2回目がYを走査の先頭で確定させ、
  // ほぼ確実に miss になっていた回帰を防ぐ。この押下が効いてしまうと
  // yPhaseMs がガード時間より小さくなるので、最後にそれを確かめる。
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  await page.waitForTimeout(300);
  await page.locator("#gameStage").click();

  await page.waitForFunction(
    (key) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      return (state.sessions || []).some(
        (session) => session.gameId === "crane" && session.trials?.length === 1
      );
    },
    storageKey,
    { timeout: 5_000 }
  );
  await page.locator("#gameExit").click();
  await waitForClass(page, "#homeView", "is-active");
  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return (state.sessions || []).find((item) => item.gameId === "crane");
  }, storageKey);
  assert(session?.taskType === "scan", "Expected crane to persist taskType=scan");
  assert(session?.trials?.length === 1, "Expected exactly one recorded crane trial");
  assert(session?.aborted === true, "Expected crane exit to persist aborted=true");
  // ガード内（200ms時点）の押下が効いていれば yPhaseMs はそこで確定してしまう。
  // 実際に効いたのは300ms後の押下なので、ガード時間より確実に大きくなる。
  assert(
    session?.trials?.[0]?.yPhaseMs > 320,
    `Expected the input guard to reject the second press (yPhaseMs=${session?.trials?.[0]?.yPhaseMs})`
  );
}

async function checkFeatureTabs(page) {
  // The start screen hides the whole shell (topbar/tabbar, body.start-mode)
  // since the design pass, so enter the home screen first to make the tabs
  // clickable — same as a real supporter would.
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  // matching/voca/letters are user-facing activities and now live on the
  // home screen under the "まなぶ・つたえる" second level, not as tabs.
  // Each visit returns home via #homeReturn, the same path a switch user
  // would scan to.
  const activityTargets = ["matching", "voca", "letters"];
  for (const target of activityTargets) {
    await page.getByRole("button", { name: "まなぶ・つたえる", exact: true }).click();
    await page.locator(`#gameTileGrid [data-view="${target}"]`).click();
    await waitForClass(page, `#${target}`, "is-active");
    await page.locator("#homeReturn").click();
    await waitForClass(page, "#homeView", "is-active");
  }

  // Only the always-visible supporter tabs; operation/evaluation/research
  // stay hidden until "researcher mode" is turned on in settings
  // (P0-0, detailed-design.md §0.2).
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  const tabTargets = ["log", "settings"];
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
/**
 * 書き出すデータが1件も無いとき、押した支援者に理由が見えること。
 *
 * 以前は announce() だけを出していたが、その出力先 #liveRegion は .sr-only
 * なので、読み上げを使わない支援者には何も届かなかった。研究データの
 * 書き出し導線が「押しても無反応」に見え、壊れていると受け取られる。
 */
async function checkEmptyExportIsExplained(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator("#supporterEditToggle").click();
  await page.waitForFunction(
    () => document.querySelector("#supporterEditToggle")?.getAttribute("aria-pressed") === "true"
  );
  await page.locator("#researcherMode").click();
  await page.waitForFunction(() => document.body.classList.contains("researcher-mode"));

  await page.locator('.tab[data-view="evaluation"]').click();
  await waitForClass(page, "#evaluation", "is-active");

  // まだ1回も遊んでいないので走査課題データは0件。
  const message = page.locator("#supporterMessage");
  assert(await message.isHidden(), "The supporter message must stay out of the way until needed");
  await page.locator("#exportScanCsv").click();
  await message.waitFor({ state: "visible" });

  const text = await message.innerText();
  assert(text.includes("ありません"), `Expected the message to say what is missing, got "${text}"`);
  // 理由だけでなく、どうすれば書き出せるようになるかまで伝える。
  assert(
    text.includes("1回終える"),
    `Expected the message to say how to produce data, got "${text}"`
  );
}

async function checkResearcherModeTabsNoRegression(page) {
  // The tabbar is hidden on the start screen (body.start-mode, design pass);
  // go through home first.
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");

  // Research controls are protected from the user's scan order until a
  // supporter explicitly unlocks the editing session.
  await page.locator("#supporterEditToggle").click();
  await page.waitForFunction(() => document.querySelector("#supporterEditToggle")?.getAttribute("aria-pressed") === "true");

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
  await page.locator("#exportScanCsv").waitFor({ state: "visible" });
  await page.locator("#exportRtCsv").waitFor({ state: "visible" });

  // Settings itself must keep working too (the tab we just used to flip
  // researcherMode on).
  await page.locator('.tab[data-view="settings"]').click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator("#researcherMode").waitFor({ state: "visible" });
  await page.locator("#hideVisualTasks").click();

  // Destructive operation reset is supporter-only and never part of custom
  // scan, while the actual user training controls remain available when the
  // editing lock is closed.
  await page.locator('.tab[data-view="operation"]').click();
  await waitForClass(page, "#operation", "is-active");
  assert(!(await page.locator("#resetOperation").getAttribute("data-scan")), "Operation reset must stay out of scan order");
  assert(!(await page.locator("#resetOperation").isDisabled()), "Operation reset is available during supporter editing");
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 4);
  assert(
    (await page.getByRole("button", { name: "アームを とめる", exact: true }).count()) === 0,
    "Visual-task setting must remove crane from the lobby and scan order"
  );
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator('.tab[data-view="operation"]').click();
  await waitForClass(page, "#operation", "is-active");
  assert(await page.locator("#resetOperation").isDisabled(), "Operation reset must relock outside supporter editing");
  assert(!(await page.locator("#operationPrimary").isDisabled()), "User operation input must remain available while reset is locked");
}

async function checkPwaDelivery(page, project) {
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  assert(manifestHref, "Expected a manifest link in the built page");
  const manifestUrl = new URL(manifestHref, page.url()).href;
  const manifestResult = await page.evaluate(async (url) => {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      // The assertions below report an invalid manifest body with its URL.
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
      body,
    };
  }, manifestUrl);
  assert(manifestResult.status === 200, `Expected manifest to return 200, got ${manifestResult.status}`);
  assert(
    manifestResult.contentType.includes("application/manifest+json"),
    `Expected manifest Content-Type, got ${manifestResult.contentType || "(missing)"}`
  );
  assert(manifestResult.body && typeof manifestResult.body === "object", `Expected valid manifest JSON from ${manifestUrl}`);
  assert(typeof manifestResult.body.start_url === "string", "Expected manifest start_url to be a string");
  assert(typeof manifestResult.body.icons?.[0]?.src === "string", "Expected manifest icon src to be a string");

  const startUrl = new URL(manifestResult.body.start_url, manifestUrl).href;
  const iconUrl = new URL(manifestResult.body.icons?.[0]?.src, manifestUrl).href;
  const missingAssetUrl = new URL("assets/__definitely_missing__.js", page.url()).href;
  const assetResults = await page.evaluate(async ([start, icon, missingAsset]) => {
    const [startResponse, iconResponse, missingResponse] = await Promise.all([
      fetch(start, { cache: "no-store" }),
      fetch(icon, { cache: "no-store" }),
      fetch(missingAsset, { cache: "no-store" }),
    ]);
    const [startBody, iconBody, missingBody] = await Promise.all([
      startResponse.text(),
      iconResponse.text(),
      missingResponse.text(),
    ]);
    return {
      start: {
        status: startResponse.status,
        contentType: startResponse.headers.get("content-type") || "",
        body: startBody,
      },
      icon: {
        status: iconResponse.status,
        contentType: iconResponse.headers.get("content-type") || "",
        body: iconBody,
      },
      missing: {
        status: missingResponse.status,
        contentType: missingResponse.headers.get("content-type") || "",
        body: missingBody,
      },
    };
  }, [startUrl, iconUrl, missingAssetUrl]);
  assert(assetResults.start.status === 200, `Expected manifest start_url to return 200, got ${assetResults.start.status}`);
  assert(assetResults.start.contentType.includes("text/html"), `Expected HTML start_url, got ${assetResults.start.contentType}`);
  assert(assetResults.start.body.includes('<div id="app"></div>'), "Expected start_url body to contain the app mount point");
  assert(assetResults.icon.status === 200, `Expected manifest icon to return 200, got ${assetResults.icon.status}`);
  assert(assetResults.icon.contentType.includes("image/svg+xml"), `Expected SVG icon, got ${assetResults.icon.contentType}`);
  assert(/<svg[\s>]/i.test(assetResults.icon.body), "Expected icon response to contain SVG markup");
  assert(assetResults.missing.status === 404, `Expected a missing JS asset to return 404, got ${assetResults.missing.status}`);
  assert(!assetResults.missing.contentType.includes("text/html"), "Missing assets must not receive the SPA HTML fallback");
  assert(!assetResults.missing.body.includes('<div id="app"></div>'), "Missing assets must not receive the app shell body");

  // Playwright WebKit does not reliably expose service-worker control in an
  // ephemeral context. Chromium verifies the complete first load -> install
  // precache -> controlled -> immediate offline reload path; WebKit still
  // verifies all manifest-relative URLs and the missing-asset 404 behavior.
  if (project.name !== "chromium-desktop") return;

  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 1);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  const precachedUrls = await page.evaluate(() => [
    new URL("index.html", location.href).href,
    ...Array.from(document.querySelectorAll("script[src], link[rel='stylesheet'][href]"), (element) =>
      new URL(element.src || element.href, location.href).href
    ),
    new URL(document.querySelector('link[rel="manifest"]').href, location.href).href,
    new URL(document.querySelector('link[rel="icon"]').href, location.href).href,
  ]);
  const cacheState = await page.evaluate(async (urls) => {
    const names = await caches.keys();
    const missing = [];
    for (const url of urls) {
      if (!(await caches.match(url))) missing.push(url);
    }
    return { names, missing };
  }, precachedUrls);
  assert(
    cacheState.names.some((name) => name.startsWith("neuro-precache:") && /:[a-f0-9]{16}$/.test(name)),
    `Expected a versioned neuro precache, got ${cacheState.names.join(", ") || "none"}`
  );
  assert(cacheState.missing.length === 0, `Expected install-time precache entries, missing: ${cacheState.missing.join(", ")}`);

  await page.context().setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
    await waitForText(page, "h1", "NEURONODE");
    assert(
      await page.evaluate(() =>
        Array.from(document.styleSheets).some((sheet) => {
          try {
            return sheet.href?.includes("/assets/") && sheet.cssRules.length > 0;
          } catch {
            return false;
          }
        })
      ),
      "Expected the precached stylesheet to apply during the first offline reload"
    );
  } finally {
    await page.context().setOffline(false);
  }
}

async function checkMobileLayout(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return document.documentElement.scrollWidth - width;
  });

  assert(overflow <= 2, `Expected horizontal overflow <= 2px, got ${overflow}px`);
  await page.locator(".switch-dock").waitFor({ state: "visible" });
  await page.locator("#primarySwitch").waitFor({ state: "visible" });
}

/**
 * hidden 属性が CSS の display 指定に打ち消されていないこと。
 *
 * .calibration-offer に display:flex が当たっていたため、gameHost.js が
 * calibrationOffer.hidden = true にしても消えず、キャリブレーション以外の
 * 全リザルトに点線枠と「この値を保存する」が出たままになっていた。
 *
 * 個別の要素ではなく「hidden なのに表示されている要素がひとつも無い」を
 * 見る。同じ罠は display を当てたどのコンテナでも起こるので、症状ではなく
 * 種類を塞ぐ。表示中の画面だけでなく、いま隠れているビューの中身も対象。
 */
async function checkHiddenAttributeIsRespected(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  const { total, leaks } = await page.evaluate(() => {
    const hidden = [...document.querySelectorAll("[hidden]")];
    return {
      total: hidden.length,
      leaks: hidden
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => element.id || element.className || element.tagName),
    };
  });
  // 対象が0件だと、この検査は何も見ずに通ってしまう。
  // calibrationOffer / supporterLockNotice など常設の hidden 要素がある前提。
  assert(total >= 3, `Expected several [hidden] elements to inspect, found ${total}`);
  assert(
    leaks.length === 0,
    `These elements have the hidden attribute but are still displayed: ${leaks.join(", ")}`
  );
}

async function checkIpadAccessibilityLayout(page, project) {
  if (project.name !== "ipad-portrait") return;

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator("#supporterEditToggle").click();
  await page.locator("#largeText").click();
  await page.locator("#highContrast").click();
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForCount(page, "#gameTileGrid .game-tile", 5);

  const layout = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#gameTileGrid .game-tile")];
    const dock = document.querySelector(".switch-dock")?.getBoundingClientRect();
    const last = rows.at(-1)?.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowWritingModes: rows.map((row) => getComputedStyle(row).writingMode),
      lastBottom: last ? last.bottom : null,
      dockTop: dock ? dock.top : null,
    };
  });

  // content.js の description は読み上げ・VoiceOver にだけ載せる。
  // 名前（aria-label）に混ぜると、走査のたびに説明まで読まれて選ぶ手がかりが
  // 埋もれるので、名前は短い見出しのまま保つ。
  const tileNaming = await page.evaluate(() =>
    [...document.querySelectorAll("#gameTileGrid .game-tile")].map((tile) => {
      const describedBy = tile.getAttribute("aria-describedby");
      const description = describedBy ? document.getElementById(describedBy) : null;
      return {
        name: tile.getAttribute("aria-label") || "",
        heading: tile.querySelector("strong")?.textContent?.trim() || "",
        description: description?.textContent?.trim() || "",
        descriptionRendersInvisible: description
          ? description.getBoundingClientRect().width <= 2
          : false,
      };
    })
  );
  // 0件だと以下の forEach が何も検証しないまま通る。
  assert(tileNaming.length === 5, `Expected 5 activity tiles, got ${tileNaming.length}`);
  tileNaming.forEach((tile) => {
    assert(tile.name === tile.heading, `Tile name must stay the short heading, got "${tile.name}"`);
    assert(tile.description.length > 0, `Tile "${tile.name}" must expose its description to AT`);
    assert(
      tile.descriptionRendersInvisible,
      `Tile "${tile.name}" description must not add visible text to the row`
    );
  });

  assert(layout.overflow <= 2, `Expected iPad horizontal overflow <= 2px, got ${layout.overflow}px`);
  assert(
    layout.rowWritingModes.every((mode) => mode === "horizontal-tb"),
    `Expected horizontal activity labels, got ${layout.rowWritingModes.join(", ")}`
  );
  assert(
    layout.lastBottom !== null && layout.dockTop !== null && layout.lastBottom <= layout.dockTop,
    `Expected all five rows above the input dock, got lastBottom=${layout.lastBottom} dockTop=${layout.dockTop}`
  );
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

async function readLogCount(page) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    return JSON.parse(raw).logs?.length || 0;
  }, storageKey);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
