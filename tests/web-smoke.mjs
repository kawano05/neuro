import { chromium, devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { colorLegacyPreset, rhythmPresets, storageKey } from "../src/lib/content.js";
import { resolveTextMode, translate } from "../src/lib/i18n.js";
import { RHYTHM_FINAL_FEEDBACK_MS } from "../src/lib/games/rhythm.js";

// 利用者向けの文言は表記モードで変わる（src/lib/i18n.js）。テストが固定文字列を
// 持つと、辞書を直したときにテストだけが古い文言を主張して落ちる——あるいは
// 辞書の抜けを見逃す。既定の表記で辞書から引く。
const t = (key, values) => translate(key, resolveTextMode({}), values);

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
  {
    // 縦長のスマホ（390x812）。iPhone 14 の viewport は 664px なので、
    // ここは **740px のページ分割しきい値と、それより高い画面のあいだ**に
    // あたる帯になる。長らくどの実寸もこの帯を通らず、ホームの下2枚が
    // 入力ドックの裏に隠れたまま検出されていなかった（走査で選べない項目が
    // 輪に残る＝このアプリの中核の約束が破れている状態）。
    name: "phone-tall",
    browserType: webkit,
    contextOptions: {
      viewport: { width: 390, height: 812 },
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    // スマホを横にした状態。ここは長らく検査の外にあり、モバイル用の圧縮が
    // すべて `max-width: 820px` に紐づいていたせいで 844px 幅の横向きには
    // 何も効いていなかった（タイル名が1文字ずつ折り返していた）。
    // 幅ではなく高さが足りない、という別種の狭さなので専用に見る。
    name: "phone-landscape",
    browserType: webkit,
    contextOptions: {
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    },
  },
];

const checks = [
  ["loads the main learning app", checkMainApp],
  ["keeps the start press from falling through into a home activity", checkStartInputGuard],
  ["plays start -> home -> color-legacy game -> home end to end", checkStartToHomeToGameFlow],
  ["finishes color-legacy with progress, result, retry, and home", checkColorCompletionFlow],
  ["picks slot-l1, renders generated symbols, and records one stopped reel before abort", checkSlotL1GameFlow],
  ["stops slot-l2 reels one at a time from left to right and completes the session", checkSlotSequentialFlow],
  ["starts fishing, records one rt trial, and destroys cleanly on exit", checkFishingGameFlow],
  ["counts up instead of counting down in endless fishing", checkEndlessFishingHasNoClock],
  ["plays one crane trial and destroys cleanly between trials", checkCraneGameFlow],
  ["ends an endless crane run on the first failure", checkEndlessEndsOnFailure],
  ["keeps the result screen free of supporter chrome", checkResultScreenStaysInTheUserWorld],
  ["keeps every scan target visible above the input dock", checkScanFocusStaysVisible],
  ["mutes effect sounds but never the measurement cue", checkEffectSoundsFollowTheSetting],
  ["refuses to record when the cue cannot sound", checkSilentAudioDoesNotProduceData],
  ["moves the input dock out of the way while typing", checkDockStepsAsideForTextEntry],
  ["splits settings into tabs and keeps hidden panels out of the scan ring", checkSettingsTabs],
  ["keeps the supporter menu itself out of the scan ring", checkSupporterMenuStaysOutOfTheScanRing],
  ["delegates shell scanning exclusively to iPad Switch Control", checkIpadSwitchControlMode],
  ["moves between visible feature tabs", checkFeatureTabs],
  ["returns from a tab to home via the home-return button", checkHomeReturnFromTabs],
  ["keeps native keyboard activation separate from switch input", checkKeyboardAndSwitchInput],
  ["treats any key as switch input while scanning, and only then", checkAnyKeyWhileScanning],
  ["keeps researcher-mode tabs (evaluation/settings) working after toggling it on", checkResearcherModeTabsNoRegression],
  ["serves valid PWA assets and reloads offline", checkPwaDelivery],
  ["keeps the mobile layout inside the viewport", checkMobileLayout],
  ["keeps every screen free of overflow and undersized targets", checkLayoutInvariants],
  ["keeps the iPad home readable with large text and high contrast", checkIpadAccessibilityLayout],
  ["keeps the hidden attribute effective against CSS display rules", checkHiddenAttributeIsRespected],
  ["shows a visible reason when there is nothing to export", checkEmptyExportIsExplained],
  ["lets the supporter reach every game's trend through tabs", checkTrendTabsCoverEveryGame],
  ["wires every export button to a real download", checkExportButtonsAreWired],
  ["refuses to clear a participant's data before it has been exported", checkHandOverNeedsAnExportFirst],
];

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, BASE_PATH: basePath },
});

server.stdout.on("data", (data) => process.stdout.write(data));
server.stderr.on("data", (data) => process.stderr.write(data));

const failures = [];
let executed = 0;
let skipped = 0;

/**
 * その実寸・ブラウザでは見るものが無い、を表す返り値。
 *
 * 早期 return する検査（iPad専用の版面、AudioContext が要る音の契約など）を
 * ok と数えると、通った件数が実際の被覆より多く見える。実機が無く CI の
 * 出力が唯一の信号なので、件数は実態どおりでなければならない。
 */
const SKIPPED = Symbol("skipped");

try {
  await waitForServer();

  for (const project of projects) {
    const browser = await project.browserType.launch({ headless: !headed });
    try {
      for (const [name, check] of checks) {
        const context = await browser.newContext(project.contextOptions);
        await context.addInitScript(() => {
          const marker = "neuro-smoke-initialized";
          if (sessionStorage.getItem(marker) === "1") return;
          localStorage.clear();
          sessionStorage.setItem(marker, "1");
        });
        const page = await context.newPage();
        // 実行中に投げられた例外とエラーログを拾う。
        //
        // ここまでの検査はどれも「期待する状態になったか」しか見ていないので、
        // 画面が正しく見えていれば裏で例外が出ていても通ってしまう。音の合成
        // （audio.js の playNoise / playSweep）のように、結果が画面に出ない
        // 処理はとくにそう——鳴らないまま静かに壊れる。
        const pageProblems = [];
        // オフライン時の挙動を見るため、存在しないURLをわざと叩く検査。
        // ここだけ読み込み失敗のログを許す（応答そのものは検査側が assert する）。
        const allowsMissingResources = check === checkPwaDelivery;
        page.on("pageerror", (error) => pageProblems.push(`pageerror: ${error.message}`));
        page.on("console", (message) => {
          if (message.type() !== "error") return;
          // 読み込み失敗を無条件に無視すると、画像やCSSが本当に欠けていても
          // 気づけない（素材の欠落は画面が寂しくなるだけで、テストは通る）。
          // わざと存在しないURLを叩くのは PWA の検査だけなので、そこに限る。
          if (allowsMissingResources && /Failed to load resource/i.test(message.text())) return;
          pageProblems.push(`console.error: ${message.text()}`);
        });
        try {
          await page.goto(baseUrl);
          const outcome = await check(page, project);
          assert(
            pageProblems.length === 0,
            `Page reported errors during the run:\n  ${pageProblems.join("\n  ")}`
          );
          // 検査によっては、その実寸やブラウザでは見るものが無い（iPad専用の
          // 版面、AudioContext が要る音の契約など）。何も見ずに return した
          // ものまで ok と数えると、通った件数が実際の被覆より多く見える。
          // CI の出力が唯一の信号である以上、そこが盛られていてはいけない。
          if (outcome === SKIPPED) {
            skipped += 1;
            console.log(`skip ${project.name}: ${name}`);
          } else {
            executed += 1;
            console.log(`ok ${project.name}: ${name}`);
          }
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
  // 実際に見た件数と、その実寸では見るものが無くて飛ばした件数を分けて出す。
  // 掛け算（実寸 × 検査）をそのまま「通った件数」と書くと、被覆が実態より
  // 多く見える。
  console.log(
    `\n${executed} smoke checks passed, ${skipped} skipped ` +
      `(${projects.length} viewports x ${checks.length} checks).`
  );
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
  // タブは2つ（評価ログ・設定）＋「← ホームへ」。効果測定・操作訓練・研究の
  // 3画面は 2026-08-29 に削除し、支援者のデータ画面は評価ログ1枚へまとめた
  // （手順は別紙の手順書に置く）。matching/voca/letters は利用者向けなので、
  // 以前にホームの「まなぶ・つたえる」二階層目へ移している。
  await waitForCount(page, ".tab", 2);
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
  await waitForActivityChoices(page, 6);
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
  await waitForActivityChoices(page, 6);

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

  // Pure tone owns the first ~0.2s. Spy on the actual app-TTS call and both
  // aria-live regions: checking #liveRegion text alone would miss immediate
  // speechSynthesis or the polite #gameProgress channel.
  await page.waitForTimeout(200);
  const logsBeforeTimedFeedback = await readLogCount(page);
  const earlyFeedback = await page.evaluate(async () => {
    const stage = document.querySelector("#gameStage");
    const stageContent = document.querySelector("#gameStageContent");
    const live = document.querySelector("#liveRegion");
    const progress = document.querySelector("#gameProgress");
    let synth = window.speechSynthesis;
    if (!synth) {
      synth = {};
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: synth,
      });
    }
    if (!("SpeechSynthesisUtterance" in window)) {
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: class FakeSpeechSynthesisUtterance {
          constructor(text) {
            this.text = text;
            this.lang = "";
            this.rate = 1;
            this.volume = 1;
          }
        },
      });
    }
    const speechCalls = [];
    const cancelCalls = [];
    Object.defineProperty(synth, "speak", {
      configurable: true,
      value: (utterance) => speechCalls.push({
        text: utterance.text,
        volume: utterance.volume,
        at: performance.now(),
      }),
    });
    Object.defineProperty(synth, "cancel", {
      configurable: true,
      value: () => cancelCalls.push(performance.now()),
    });
    live.textContent = "";
    const liveEvents = [];
    const progressEvents = [];
    const liveObserver = new MutationObserver(() => {
      liveEvents.push({ text: live.textContent, at: performance.now() });
    });
    const progressObserver = new MutationObserver(() => {
      progressEvents.push({ text: progress.textContent, at: performance.now() });
    });
    liveObserver.observe(live, { childList: true, characterData: true, subtree: true });
    progressObserver.observe(progress, { childList: true, characterData: true, subtree: true });
    window.__colorSpeechCalls = speechCalls;
    window.__colorCancelCalls = cancelCalls;
    window.__colorLiveEvents = liveEvents;
    window.__colorProgressEvents = progressEvents;
    window.__colorObservers = [liveObserver, progressObserver];

    const progressBefore = progress.textContent;
    const clickAt = performance.now();
    window.__colorClickAt = clickAt;
    stage.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const feedback = stageContent.querySelector(".color-feedback");
    const feedbackText = feedback?.cloneNode(true);
    feedbackText?.querySelectorAll("rt").forEach((reading) => reading.remove());
    const box = feedback?.getBoundingClientRect();
    const opacity = feedback ? Number(getComputedStyle(feedback).opacity) : 0;
    return {
      speechCount: speechCalls.length,
      liveCount: liveEvents.length,
      progressCount: progressEvents.length,
      progressBefore,
      progressAfter: progress.textContent,
      hasFeedbackClass: stageContent.classList.contains("is-feedback"),
      feedbackText: feedbackText?.textContent?.trim() || "",
      feedbackOpacity: opacity,
      feedbackInViewport: Boolean(
        box && box.width > 0 && box.height > 0 && box.left >= 0 && box.top >= 0 &&
        box.right <= window.innerWidth && box.bottom <= window.innerHeight
      ),
    };
  });
  assert(earlyFeedback.speechCount === 0, "App TTS must not start during the pure tone");
  assert(earlyFeedback.liveCount === 0, "Assertive live region must stay unchanged during the pure tone");
  assert(earlyFeedback.progressCount === 0, "Polite game progress must stay unchanged during the pure tone");
  assert(earlyFeedback.progressAfter === earlyFeedback.progressBefore, "Color input must not use live progress");
  assert(earlyFeedback.hasFeedbackClass, "Expected short visual feedback after color input");
  assert(earlyFeedback.feedbackText === t("color.changed"), "Visual feedback must say what changed");
  assert(earlyFeedback.feedbackOpacity >= 0.9, `Expected visible feedback, opacity=${earlyFeedback.feedbackOpacity}`);
  assert(earlyFeedback.feedbackInViewport, "Visual feedback must stay inside the viewport");
  assert((await readLogCount(page)) === logsBeforeTimedFeedback + 1, "Timed click must log one input");

  // アプリTTSが届くのを待つ。
  //
  // ここは実行環境によって落ちうる場所で、CIの mobile-webkit-like でだけ
  // 2秒の時間切れになったことがある（2026-08-29）。原因を確かめないまま
  // 待ち時間を伸ばすと、実際の遅延（利用者が待たされる不具合）を隠す。
  //
  // 2つに分ける:
  //   1. そもそもアプリTTSを使えない環境なら、この検査は成り立たない。
  //      audio.js の speak() は SpeechSynthesisUtterance が無ければ live
  //      region へ所有権を戻す（通知自体は失わない）。その環境で「TTSが
  //      来ない」と落とすのは、アプリの正しい振る舞いを不具合と呼ぶこと。
  //   2. 使える環境で来なかったなら、それは調べるべきこと。落とすときに
  //      「何が使えて何が来なかったか」を書き残す——時間切れの一行だけでは
  //      次に見る人が同じ調査を最初からやり直すことになる。
  const speechCapable = await page.evaluate(
    () =>
      typeof window.SpeechSynthesisUtterance === "function" &&
      typeof window.speechSynthesis?.speak === "function"
  );
  if (!speechCapable) return SKIPPED;

  try {
    await page.waitForFunction(() => window.__colorSpeechCalls?.length === 1, null, {
      timeout: 5_000,
    });
  } catch {
    const diagnosis = await page.evaluate(() => ({
      speechCalls: window.__colorSpeechCalls?.length ?? null,
      liveEvents: window.__colorLiveEvents?.length ?? null,
      liveText: document.querySelector("#liveRegion")?.textContent ?? null,
      speechEnabled: JSON.parse(localStorage.getItem("neuronode-prototype-state-v4") || "{}")
        ?.settings?.speechEnabled,
      sinceClick: window.__colorClickAt ? Math.round(performance.now() - window.__colorClickAt) : null,
    }));
    assert(
      false,
      "アプリTTSが届かなかった: " + JSON.stringify(diagnosis)
    );
  }
  const deliveredFeedback = await page.evaluate(() => ({
    speech: window.__colorSpeechCalls[0],
    clickAt: window.__colorClickAt,
    liveCount: window.__colorLiveEvents.length,
    progressCount: window.__colorProgressEvents.length,
  }));
  assert(deliveredFeedback.speech.text === t("color.voice.progress", { n: 4 }), "App TTS must report the change and remaining presses");
  assert(deliveredFeedback.speech.at - deliveredFeedback.clickAt >= 220, "App TTS started before the tone ended");
  assert(deliveredFeedback.speech.at - deliveredFeedback.clickAt <= 600, "App TTS arrived too late for a short response");
  assert(deliveredFeedback.speech.volume === 1, "Normal-mode TTS must retain the existing full-volume default");
  assert(deliveredFeedback.liveCount === 0, "App TTS ownership must suppress duplicate live-region speech");
  assert(deliveredFeedback.progressCount === 0, "Color feedback must not leak through polite progress");

  // Once that app utterance has begun, the next accepted input must return
  // ownership to its pure tone synchronously, not merely cancel a pending timer.
  const nextInputCancellation = await page.evaluate(() => {
    const stage = document.querySelector("#gameStage");
    const before = window.__colorCancelCalls.length;
    const speechBefore = window.__colorSpeechCalls.length;
    const clickAt = performance.now();
    stage.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    return {
      before,
      after: window.__colorCancelCalls.length,
      speechBefore,
      clickAt,
    };
  });
  assert(
    nextInputCancellation.after === nextInputCancellation.before + 1,
    "The next color input must synchronously cancel the in-progress app TTS"
  );
  await page.waitForFunction(
    (previousCount) => window.__colorSpeechCalls?.length === previousCount + 1,
    nextInputCancellation.speechBefore,
    { timeout: 2_000 }
  );
  const nextSpeech = await page.evaluate(
    (index) => window.__colorSpeechCalls[index],
    nextInputCancellation.speechBefore
  );
  assert(nextSpeech.at - nextInputCancellation.clickAt >= 220, "Replacement TTS started before its tone ended");
  assert(nextSpeech.at - nextInputCancellation.clickAt <= 600, "Replacement TTS arrived too late");
  assert(
    nextSpeech.text === t("color.voice.progress", { n: 3 }),
    "Replacement TTS must report the new remaining count"
  );

  await page.waitForFunction(
    () => !document.querySelector("#gameStageContent")?.classList.contains("is-feedback"),
    null,
    { timeout: 2_000 }
  );
  const feedbackEndedAt = await page.evaluate(() => performance.now());
  assert(feedbackEndedAt - nextInputCancellation.clickAt >= 430, "Visual feedback disappeared too early");
  assert(feedbackEndedAt - nextInputCancellation.clickAt < 2_000, "Visual feedback stayed on screen too long");
  await page.waitForTimeout(130);
  const endedOpacity = await page.locator(".color-feedback").evaluate(
    (feedback) => Number(getComputedStyle(feedback).opacity)
  );
  assert(endedOpacity <= 0.1, `Visual feedback remained visible after its timeout (opacity=${endedOpacity})`);

  // Turning app TTS off must cancel current speech. Later color feedback then
  // belongs to the live region only.
  const cancelsBeforeSpeechOff = await page.evaluate(() => window.__colorCancelCalls.length);
  await page.locator("#speechEnabled").evaluate((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const cancelsAfterSpeechOff = await page.evaluate(() => window.__colorCancelCalls.length);
  assert(cancelsAfterSpeechOff === cancelsBeforeSpeechOff + 1, "Disabling app TTS must cancel current speech");
  await page.evaluate(() => window.__colorObservers.forEach((observer) => observer.disconnect()));

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
  // The game now ends after five presses. Start a fresh session before the
  // rapid-click and destroy checks so those independent input contracts do not
  // accidentally consume the completion press.
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#gameTileGrid .game-tile:not([disabled])").first().click();
  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });

  // Switch Control / assistive technologies may emit click-only input. Two
  // accepted presses 170ms apart are outside shell dedupe but inside the
  // 240ms speech delay: the first pending announcement must be cancelled.
  await page.waitForTimeout(200);
  const logsBeforeRapidClicks = await readLogCount(page);
  const rapidEarly = await page.evaluate(async () => {
    const stage = document.querySelector("#gameStage");
    const live = document.querySelector("#liveRegion");
    live.textContent = "";
    window.__colorSpeechCalls.length = 0;
    const events = [];
    const observer = new MutationObserver(() => {
      events.push({ text: live.textContent, at: performance.now() });
    });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
    window.__rapidColorEvents = events;
    window.__rapidColorObserver = observer;

    const firstAt = performance.now();
    stage.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 170));
    const secondAt = performance.now();
    window.__rapidSecondAt = secondAt;
    stage.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      firstAt,
      secondAt,
      eventCount: events.length,
      liveText: live.textContent,
      speechCount: window.__colorSpeechCalls.length,
    };
  });
  assert(rapidEarly.secondAt - rapidEarly.firstAt >= 150, "Rapid clicks must both pass shell dedupe");
  assert(rapidEarly.eventCount === 0, "No rapid-click announcement may start before the last tone ends");
  assert(rapidEarly.liveText === "", "Rapid clicks must keep the live region quiet during the tones");
  assert(rapidEarly.speechCount === 0, "Disabled app TTS must not speak during rapid clicks");
  assert(
    (await readLogCount(page)) === logsBeforeRapidClicks + 2,
    "Expected both click-only assistive activations to record"
  );
  await page.waitForFunction(() => window.__rapidColorEvents?.length === 1, null, { timeout: 2_000 });
  const rapidDelivered = await page.evaluate(() => ({
    events: [...window.__rapidColorEvents],
    secondAt: window.__rapidSecondAt,
    speechCount: window.__colorSpeechCalls.length,
  }));
  assert(rapidDelivered.events[0].text === t("color.voice.progress", { n: 3 }), "Last rapid click must own the remaining-count announcement");
  assert(rapidDelivered.events[0].at - rapidDelivered.secondAt >= 220, "Rapid announcement started too early");
  assert(rapidDelivered.events[0].at - rapidDelivered.secondAt <= 600, "Rapid announcement arrived too late");
  assert(rapidDelivered.speechCount === 0, "Live-region ownership must suppress app TTS");
  await page.waitForTimeout(200);
  assert(
    (await page.evaluate(() => window.__rapidColorEvents.length)) === 1,
    "Cancelled rapid-click announcement must not fire later"
  );
  await page.evaluate(() => window.__rapidColorObserver.disconnect());

  // The keyboard fallback (Space) goes through the same input funnel and
  // reaches the game too. Escape immediately destroys the game, so the
  // pending delayed announcement and visual timer must never fire afterward.
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const live = document.querySelector("#liveRegion");
    live.textContent = "";
    const events = [];
    const observer = new MutationObserver(() => {
      events.push({ text: live.textContent, at: performance.now() });
    });
    observer.observe(live, { childList: true, characterData: true, subtree: true });
    window.__destroyColorEvents = events;
    window.__destroyColorObserver = observer;
  });
  const logsBeforeRepeatedKey = await readLogCount(page);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, repeat: true }));
  });
  assert((await readLogCount(page)) === logsBeforeRepeatedKey, "Expected repeated keydown to be ignored");
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.waitForTimeout(350);
  assert((await readLogCount(page)) === logsBeforeRepeatedKey + 1, "Space must record exactly one input");
  const destroyEventTexts = await page.evaluate(() =>
    window.__destroyColorEvents.map((event) => event.text)
  );
  assert(
    !destroyEventTexts.includes(t("color.voice.progress", { n: 2 })),
    "destroy() must cancel the pending delayed color announcement"
  );
  assert(
    !(await page.locator("#gameStageContent").evaluate((target) => target.classList.contains("is-feedback"))),
    "destroy() must clear visual feedback state"
  );
  const destroyedOpacity = await page.evaluate(() => {
    const feedback = document.querySelector("#gameStageContent .color-feedback");
    return feedback ? Number(getComputedStyle(feedback).opacity) : 0;
  });
  assert(destroyedOpacity <= 0.1, `destroy() left visual feedback visible (opacity=${destroyedOpacity})`);
  await page.evaluate(() => window.__destroyColorObserver.disconnect());

  // Aborting remains distinct from normal completion: Esc returns directly to home.
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator("#homeSupporterMenu").waitFor({ state: "visible" });
}
/**
 * Completes the formerly open-ended colour activity and fixes its quality
 * contract: visible goal and progress, one normal finish, a meaningful result,
 * a clean retry reset, and the shared route back to the menu.
 */
async function checkColorCompletionFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 6);
  await page.locator("#gameTileGrid .game-tile:not([disabled])").first().click();
  await waitForClass(page, "#gameView", "is-active");

  async function beginReadySession() {
    await page.locator(".game-ready").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
    await page.locator("#gameStage").click();
    await page.locator(".game-ready").waitFor({ state: "detached" });
    await page.waitForTimeout(200);
  }

  async function progressSnapshot() {
    return page.evaluate(() => {
      const plainText = (selector) => {
        const source = document.querySelector(selector);
        const clone = source?.cloneNode(true);
        clone?.querySelectorAll("rt").forEach((reading) => reading.remove());
        return clone?.textContent?.trim() || "";
      };
      return {
        total: document.querySelectorAll(".color-progress-dot").length,
        done: document.querySelectorAll(".color-progress-dot.is-done").length,
        label: plainText(".color-session-progress .reaction-detail"),
        feedback: plainText(".color-feedback"),
        chipColor: document.querySelector(".color-chip")?.style.getPropertyValue("--chip-color").trim() || "",
        lastDoneColor:
          [...document.querySelectorAll(".color-progress-dot.is-done")].at(-1)
            ?.style.getPropertyValue("--dot-color").trim() || "",
      };
    });
  }

  await beginReadySession();
  const initial = await progressSnapshot();
  assert(initial.total === colorLegacyPreset.targetPresses, "Color session must show one dot per required press");
  assert(initial.done === 0, "A new color session must start with zero completed dots");
  assert(
    initial.label === t("color.progress", { n: colorLegacyPreset.targetPresses }),
    "A new color session must state the complete remaining goal"
  );

  const logsBefore = await readLogCount(page);
  for (let press = 1; press <= colorLegacyPreset.targetPresses; press += 1) {
    await page.locator("#gameStage").click();
    const snapshot = await progressSnapshot();
    assert(snapshot.done === press, "Expected " + press + " completed color progress dots");
    assert(
      snapshot.chipColor === snapshot.lastDoneColor,
      `Press ${press} must collect the same colour shown in the centre (${snapshot.chipColor} vs ${snapshot.lastDoneColor})`
    );
    if (press < colorLegacyPreset.targetPresses) {
      assert(
        snapshot.label === t("color.progress", { n: colorLegacyPreset.targetPresses - press }),
        "Color progress must count down after every accepted press"
      );
      assert(snapshot.feedback === t("color.changed"), "Non-final color presses must show the change");
      await page.waitForTimeout(170);
    } else {
      assert(snapshot.label === t("color.progressComplete"), "The fifth press must show visual completion");
      assert(snapshot.feedback === t("color.complete"), "The fifth press must say that the goal is complete");
    }
  }
  assert(
    (await readLogCount(page)) === logsBefore + colorLegacyPreset.targetPresses,
    "A completed color session must log exactly the required number of presses"
  );

  // The completion card stays on screen briefly. A sixth accepted activation
  // during that interval must be ignored rather than producing an extra tone/log.
  await page.waitForTimeout(180);
  // The new prism is still in its 360ms arrival animation here. Playwright's
  // actionability wait can outlast the 560ms finish delay and then find the
  // stage hidden by the result view, although a real switch event is accepted
  // immediately. Dispatch the same click event directly: this assertion is
  // about the input guard, not about animation stability.
  await page.locator("#gameStage").dispatchEvent("click");
  assert(
    (await readLogCount(page)) === logsBefore + colorLegacyPreset.targetPresses,
    "Color completion must ignore presses beyond the fixed goal"
  );

  await waitForClass(page, "#resultView", "is-active");
  await page.locator(".completion-result").waitFor({ state: "visible" });
  assert(
    await page.locator(".completion-result-title").evaluate(
      (element, expected) => element.textContent.trim() === expected,
      t("result.completion.title")
    ),
    "Color result must have an explicit completion heading"
  );
  assert(
    await page.locator(".completion-result-summary").evaluate(
      (element, expected) => {
        const clone = element.cloneNode(true);
        clone.querySelectorAll("rt").forEach((reading) => reading.remove());
        return clone.textContent.trim() === expected;
      },
      t("result.completion.summary", { n: colorLegacyPreset.targetPresses })
    ),
    "Color result must report the completed press count"
  );
  assert(
    (await page.locator(".color-result-swatch").count()) === colorLegacyPreset.targetPresses,
    "Color result must retain the five-colour visual history"
  );
  assert(
    (await page.locator("#resultStats").getAttribute("aria-live")) === "off",
    "App TTS completion must suppress a duplicate result live-region announcement"
  );
  const hasFakeResearchSession = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return (saved.sessions || []).some((session) => session.gameId === "color-legacy");
  }, storageKey);
  assert(!hasFakeResearchSession, "Completion-only color play must not create a fake research taskType session");

  await page.locator("#resultRetry").click();
  await waitForClass(page, "#gameView", "is-active");
  await beginReadySession();
  const retried = await progressSnapshot();
  assert(retried.done === 0, "Retry must reset color progress to zero");
  assert(
    retried.label === t("color.progress", { n: colorLegacyPreset.targetPresses }),
    "Retry must restore the full five-press goal"
  );

  for (let press = 0; press < colorLegacyPreset.targetPresses; press += 1) {
    await page.locator("#gameStage").click();
    if (press < colorLegacyPreset.targetPresses - 1) await page.waitForTimeout(170);
  }
  await waitForClass(page, "#resultView", "is-active");
  await page.locator("#resultHome").click();
  await waitForClass(page, "#homeView", "is-active");
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
/**
 * 走査中は、どのキーでもスイッチ入力として受ける。
 *
 * スイッチ機器はキーボードとして見えることが多く、機種によって送るキーが
 * 違う（Space / Enter のほか F1〜F12 や1文字キーを送るものもある）。受ける
 * キーを限ると「押しているのに何も起きない」が起きる——本人には理由が
 * 分からない。
 *
 * ただし走査中に限る。止まっているあいだは支援者がキーボードで普通に
 * 操作している場面なので、そこまで奪うと支援者の操作が壊れる。
 * 修飾キー単独と修飾キー付き（Ctrl+R 等）も奪わない。
 */
async function checkAnyKeyWhileScanning(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");

  // 走査を動かす。
  if (((await page.locator("#scanState").textContent()) || "").trim() !== "走査中") {
    await page.locator("#toggleScan").click();
  }
  await waitForText(page, "#scanState", "走査中");
  await page.waitForFunction(() => document.querySelectorAll(".scan-focus").length > 0);
  await page.waitForTimeout(200);

  // 修飾キー付きは奪わない（ブラウザ・OSの操作を潰さない）。
  const viewBefore = await page.evaluate(() => document.querySelector(".view.is-active")?.id);
  await page.keyboard.press("Control+KeyR".replace("KeyR", "r"));
  await page.waitForTimeout(150);
  assert(
    (await page.evaluate(() => document.querySelector(".view.is-active")?.id)) === viewBefore,
    "Ctrl+r must not act as switch input"
  );

  // 修飾キー単独も「押した」ではない。
  await page.keyboard.press("Shift");
  await page.waitForTimeout(150);
  assert(
    (await page.evaluate(() => document.querySelector(".view.is-active")?.id)) === viewBefore,
    "A bare modifier must not act as switch input"
  );

  // ふつうのキー（F5）は入力として通る。いまハイライトしている項目が選ばれる。
  await page.keyboard.press("F5");
  await page.waitForTimeout(600);
  const moved = await page.evaluate(() => document.querySelector(".view.is-active")?.id);
  assert(
    moved !== viewBefore,
    `F5 while scanning must activate the highlighted item (view stayed ${moved})`
  );
}

async function checkKeyboardAndSwitchInput(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "学ぶ・伝える");
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

/**
 * 設定はタブに分かれている（src/App.svelte の .settings-tab）。
 *
 * 守りたいのは2つ:
 *   1. 開いていない面の操作子が走査の輪に残らないこと。効かない（届かない）
 *      操作子を輪に置くと、利用者がそこで止まって押しても何も起きない。
 *   2. 支援者編集ロックを廃止したあと、操作子がそのまま押せること。
 *      「無効化されているが輪には居る」状態を作り直さない。
 */
/**
 * 書き出しボタンが本当に書き出すこと。
 *
 * リールCSVのボタンは、押しても何も起きない状態で出荷されていた
 * （2026-08-28に発見）。exportSlotCsv が exportRhythmCsv の内側に入り込んで
 * いて、外側からは見えない——にもかかわらず例外は出なかった。`id` を持つ
 * 要素は同名のグローバル変数になるので、`exportSlotCsv` はボタン要素自身に
 * 解決され、addEventListener はそれを「handleEvent を持たないリスナ」として
 * 黙って受け取っていた。エラーも警告も無く、押しても無反応になるだけ。
 *
 * 「押せる」「見える」を見ていたテストでは捕まらない。捕まえられるのは
 * 「押した結果データが出てくるか」だけなので、Blob の生成を数える。
 * ダウンロード自体はヘッドレスで止まるが、URL.createObjectURL まで届けば
 * 行は組み上がっている。
 */
/**
 * 参加者ひとりぶんを終えるとき、書き出す前には消させない。
 *
 * 想定運用は「1人終わったら書き出して、端末を空にして次の人へ」。消すのは
 * 取り返しがつかず、書き出しは取り返しがつく——順番を守らせる。
 *
 * これまでどのボタンも state.sessions を消さなかったので、共用端末では前の
 * 参加者の回が残りつづけ、推移も自己最高も混ざっていた（2026-08-29）。
 */
async function checkHandOverNeedsAnExportFirst(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
    await page.locator('.tab[data-view="log"]').click();
    await waitForClass(page, "#log", "is-active");

  // 消す対象を作る（1件でも入っていれば導線は同じ）。
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    state.logs = [
      { time: "2026-08-29T00:00:00.000Z", view: "home", type: "probe", label: "handover" },
    ];
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
    await page.locator('.tab[data-view="log"]').click();
    await waitForClass(page, "#log", "is-active");

  // 確認ダイアログが出たら必ず承諾する。それでも書き出し前は消えないこと。
  page.on("dialog", (dialog) => dialog.accept());

  await page.locator("#handOverParticipant").click();
  await page.waitForTimeout(150);
  const blocked = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return (state.logs || []).length;
  }, storageKey);
  // 画面を行き来するあいだにも操作ログは増えるので、件数ではなく
  // 「消えていない」ことだけを見る。
  assert(blocked >= 1, `書き出す前に消えてしまった（logs=${blocked}）`);
  const reason = ((await page.locator("#supporterMessage").textContent()) || "").trim();
  assert(
    reason.includes("書き出"),
    `止めた理由が画面に出ていない: ${reason.slice(0, 60)}`
  );

  // 書き出したあとなら消える。
  await page.locator("#exportRawJson").click();
  await page.waitForTimeout(200);
  await page.locator("#handOverParticipant").click();
  await page.waitForTimeout(300);
  const cleared = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      logs: (state.logs || []).length,
      sessions: (state.sessions || []).length,
      participantId: state.evaluation?.participantId ?? null,
    };
  }, storageKey);
  assert(cleared.logs === 0 && cleared.sessions === 0, `消えていない: ${JSON.stringify(cleared)}`);
  // 次の人のIDを入れ直させる（前の人のIDが残っていると取り違える）。
  assert(cleared.participantId === "", `参加者IDが残っている: ${cleared.participantId}`);
}

async function checkExportButtonsAreWired(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  // 効果測定タブは研究者モードでのみ出る。
    await page.locator('.tab[data-view="log"]').click();
    await waitForClass(page, "#log", "is-active");

  // データが1件も無い状態では「ありません」を出して書き出さないのが正しい
  // 挙動なので、押して数える前に1回ぶんの記録を差し込む。
  await page.evaluate(() => {
    window.__blobCount = 0;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__blobCount += 1;
      window.__lastBlobType = blob.type;
      return original(blob);
    };
  });

  const buttons = [
    "#exportRhythmCsv",
    "#exportSlotCsv",
    "#exportScanCsv",
    "#exportRtCsv",
    "#exportSessionLedgerCsv",
    "#exportRawJson",
    // 操作ログCSVもこの1枚に居る（効果測定タブを畳んだ 2026-08-29 以降）。
    "#exportCsv",
  ];
  for (const selector of buttons) {
    const count = await page.locator(selector).count();
    assert(count === 1, `Export button ${selector} must exist exactly once, found ${count}`);
    const before = await page.evaluate(() => window.__blobCount);
    await page.locator(selector).click();
    const after = await page.evaluate(() => window.__blobCount);
    const explained = await page.evaluate(() =>
      (document.querySelector("#supporterMessage")?.textContent || "").trim()
    );
    // 書き出したか、書き出せない理由を出したか。無反応だけを落とす。
    assert(
      after > before || explained.length > 0,
      `${selector} produced neither a download nor a visible reason (silent no-op)`
    );
    await page.evaluate(() => {
      const message = document.querySelector("#supporterMessage");
      if (message) {
        message.textContent = "";
        message.hidden = true;
      }
    });
  }
}

/**
 * 回ごとの推移を、あそびごとのタブで全部たどれること。
 *
 * 記録のあるあそびだけをタブに出すと、支援者は「まだ遊んでいない」のか
 * 「表示が壊れている」のかを区別できない。全部並べて、記録の無いものは
 * 「データがありません」と言う。
 *
 * タブに data-scan は付けない。ここは支援者がタップ／キーボードで使う面で、
 * 利用者が走査で操作するものではない（ホームの支援者メニュー入口と同じ扱い）。
 */
async function checkTrendTabsCoverEveryGame(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");

  const tabs = page.locator(".trend-tab");
  const tabCount = await tabs.count();
  // 記録が1件も無い状態でも、あそびのぶんだけタブが出る。
  assert(tabCount >= 5, `Expected a tab per game, got ${tabCount}`);

  // 走査の輪には入れない（利用者が押しても意味のない項目を増やさない）。
  assert(
    (await page.locator(".trend-tab[data-scan]").count()) === 0,
    "Trend tabs are supporter-only and must stay out of the scan ring"
  );

  // どのタブを開いても、何かしら答えが出る（無反応の面を作らない）。
  for (let index = 0; index < tabCount; index += 1) {
    const tab = tabs.nth(index);
    const name = ((await tab.textContent()) || "").replace(/\s+/g, " ").trim();
    await tab.click();
    await page.waitForTimeout(80);
    assert(
      (await tab.getAttribute("aria-selected")) === "true",
      `Tab "${name}" did not become the selected one`
    );
    const panel = ((await page.locator("#sessionTrends").textContent()) || "").trim();
    assert(panel.length > 0, `Tab "${name}" showed nothing at all`);
    // 記録が無い回は、無いと言い切る（黙って空にしない）。
    const hasCards = (await page.locator("#sessionTrends .trend-card").count()) > 0;
    assert(
      hasCards || panel.includes("データがありません"),
      `Tab "${name}" is empty but does not say so: ${panel.slice(0, 60)}`
    );
  }
}

async function checkSettingsTabs(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");

  const tabs = page.locator(".settings-tab");
  assert((await tabs.count()) === 4, `Expected four settings tabs, got ${await tabs.count()}`);
  assert(
    (await tabs.first().getAttribute("aria-selected")) === "true",
    "The first settings tab must start selected"
  );
  // 最初の面の項目は見えていて、他の面の項目は見えていない。
  await page.locator("#scanInterval").waitFor({ state: "visible" });
  await page.locator("#researcherMode").waitFor({ state: "hidden" });

  const hiddenScannable = async () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll(".settings-panel[hidden] [data-scan]")].filter(
          (el) => el.getBoundingClientRect().width > 0
        ).length
    );
  assert(
    (await hiddenScannable()) === 0,
    "Hidden settings panels must leave the scan ring"
  );

  // 面を切り替えると入れ替わる。
  await openSettingsTab(page, "measure");
  await page.locator("#researcherMode").waitFor({ state: "visible" });
  await page.locator("#scanInterval").waitFor({ state: "hidden" });
  assert(
    (await hiddenScannable()) === 0,
    "Hidden settings panels must leave the scan ring after switching"
  );

  // 支援者編集ロックは廃止した（2026-08-17）。開いた面の操作子はそのまま押せる。
  assert(
    !(await page.locator("#researcherMode").isDisabled()),
    "Settings controls must be usable without an editing lock"
  );
  assert(
    (await page.locator("#supporterEditToggle").count()) === 0,
    "The supporter editing lock must be gone, not merely hidden"
  );
}

/**
 * 支援者メニュー（設定画面）の操作子は走査の輪に入らない。
 *
 * ここを触るのは支援者で、スイッチ走査では操作しない（2026-08-28 合意）。
 * 輪に入れても利用者が選ぶ項目は1つもなく、待ち時間が延びるだけになる。
 *
 * 同時に守るのは逃げ道。面の中身は外すが #homeReturn とタブバーは輪に残す
 * ——利用者が誤って支援者の世界へ入ったとき、走査だけで home へ戻れなく
 * なると、実機確認2026-07-04の「強制終了以外に戻れない」欠落が戻る。
 */
async function checkSupporterMenuStaysOutOfTheScanRing(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");

  // 走査間隔に依存しないよう、→ キーで輪を手で回して一周ぶん集める。
  const walkRing = async (steps) => {
    const seen = [];
    for (let index = 0; index < steps; index += 1) {
      await page.keyboard.press("ArrowRight");
      const current = await page.evaluate(() => {
        const focused = document.querySelector(".scan-focus");
        if (!focused) return null;
        return {
          id: focused.id || null,
          inSettings: Boolean(focused.closest("#settings")),
          label: (focused.getAttribute("aria-label") || focused.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 20),
        };
      });
      if (current) seen.push(current);
    }
    return seen;
  };

  const ring = await walkRing(45);
  assert(ring.length > 0, "The scan ring must not be empty in the supporter menu");

  const fromSettings = ring.filter((entry) => entry.inSettings);
  assert(
    fromSettings.length === 0,
    `Supporter menu controls must stay out of the scan ring, found: ${fromSettings
      .map((entry) => entry.label)
      .join(", ")}`
  );

  // 逃げ道は残っていること。
  assert(
    ring.some((entry) => entry.id === "homeReturn"),
    "The home-return button must remain reachable by scanning from the supporter menu"
  );

  // 他の支援者画面（評価ログ）では、その面の操作子はこれまでどおり輪に入る。
  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");
  const logRing = await walkRing(45);
  assert(
    logRing.some((entry) => entry.id === "exportCsv"),
    "Only the supporter menu is exempt; other views keep their own controls in the ring"
  );
}

/**
 * 実機監査P0: iPad Switch Controlとアプリ自前走査を製品設定で同時に
 * 動かせないこと。WebではOSの青枠そのものを生成できないため、ここでは
 * アプリ側が完全に黙ることと、OS相当の直接clickでシェルを巡れることを固定する。
 */
async function checkIpadSwitchControlMode(page, project) {
  if (project.name !== "ipad-portrait") return SKIPPED;

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await waitForText(page, "#scanState", "走査中");

  const mode = page.locator("#switchControlMode");
  assert(!(await mode.isChecked()), "Switch Control mode must be explicit and default off");
  assert((await mode.getAttribute("data-scan")) === null, "App scan must not let a user disable their only scan owner");
  assert(
    (await page.locator('#scanInterval[data-scan], #speechVolume[data-scan]').count()) === 0,
    "Click-only app scanning must not stop on range controls"
  );
  // Safe hand-off order: supporter stops app scanning, then enables iPad
  // Switch Control outside the app, then activates this native checkbox.
  await page.locator("#autoScan").click();
  await waitForText(page, "#scanState", "走査停止中");
  assert((await page.locator(".scan-focus").count()) === 0, "Stopping app scan must clear its yellow focus");
  await mode.click();
  await page.waitForFunction(() => document.body.classList.contains("switch-control-mode"));
  await page.locator("#switchControlModeNotice").waitFor({ state: "visible" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await waitForText(page, "#scanState", "iPad走査を使用");

  assert(await page.locator("#autoScan").isDisabled(), "App auto scan must be locked out in iPad mode");
  assert(!(await page.locator("#autoScan").isChecked()), "App auto scan must be forced off");
  assert(await page.locator("#scanInterval").isDisabled(), "Scan speed is meaningless while OS owns scanning");
  assert(!(await page.locator("#speechEnabled").isChecked()), "App TTS must start off for OS/TTS A-B testing");
  assert(await page.locator("#speechVolume").isDisabled(), "TTS volume must not be a dead control while TTS is off");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings, storageKey);
  assert(saved.switchControlMode === true, "Switch Control mode must persist");
  assert(saved.autoScan === false, "Persisted state must not restore both scan owners");
  assert(saved.speechEnabled === false, "Enabling iPad mode must persist app TTS off initially");

  // Persisted delegation must survive a real loadState() path. The app always
  // starts on the start screen, but must not revive its timer or dock.
  await page.reload();
  await waitForClass(page, "#startView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("switch-control-mode"));
  assert(await mode.isChecked(), "Switch Control mode must restore after reload");
  assert(!(await page.locator("#autoScan").isChecked()), "Reload must preserve app scan off");
  assert(await page.locator("#autoScan").isDisabled(), "Reloaded delegation must keep app scan locked");
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await waitForText(page, "#scanState", "iPad走査を使用");

  // 手動ボタン・右矢印・自動タイマーのどの入口からも黄色い枠を復活させない。
  await page.evaluate(() => {
    document.querySelector("#toggleScan").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  await page.waitForTimeout(1_900);
  assert((await page.locator(".scan-focus").count()) === 0, "No app scan focus may survive in iPad mode");
  await waitForText(page, "#scanState", "iPad走査を使用");

  // Reloaded start -> home also uses click-only input. Compare the exact home
  // choice order at full width and a 507px Split View approximation.
  await page.locator("#startStage").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#homeView", "is-active");
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await waitForActivityChoices(page, 6);
  const fullLayout = await collectActivityLayout(page, { checkViewport: true });
  const fullWidthTitles = fullLayout.titles;
  assert(
    fullWidthTitles.length === 6,
    "Expected all six home choices, got " + fullWidthTitles.join(", ")
  );

  await page.setViewportSize({ width: 507, height: 1194 });
  // Width breakpoints re-render the home list; wait until layout and bounding
  // boxes reflect the Split View dimensions before taking the snapshot.
  await page.waitForTimeout(200);
  const splitLayout = await collectActivityLayout(page, { checkViewport: true });
  const splitViewTitles = splitLayout.titles;
  assert(
    JSON.stringify(splitViewTitles) === JSON.stringify(fullWidthTitles),
    `Split View changed home order: ${splitViewTitles.join(", ")}`
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 2, `Switch Control Split View overflowed horizontally by ${overflow}px`);

  // Representative click-only game round trip while delegation stays on.
  const firstTile = page.locator("#gameTileGrid .game-tile:not([disabled])").first();
  await firstTile.evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await page.locator("#gameStage").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator("#gameExit").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await page.waitForTimeout(400);
  assert((await page.locator(".scan-focus").count()) === 0, "Game return must not revive app scan");
  await waitForText(page, "#scanState", "iPad走査を使用");

  // OS項目走査が送るclick-only入力相当で支援者画面へ戻れる。
  await page.locator("#homeSupporterMenu").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#settings", "is-active");

  // 2x2比較用に、モード中でも支援者がアプリTTSを明示的にONへ戻せる。
  await openSettingsTab(page, "senses");
  await page.locator("#speechEnabled").click();
  assert(await page.locator("#speechEnabled").isChecked(), "Supporter must be able to enable app TTS for A-B testing");
  assert(!(await page.locator("#speechVolume").isDisabled()), "TTS volume must unlock with app TTS");
  await page.locator("#speechVolume").evaluate((input) => {
    input.value = "0.3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const speechVolume = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).settings.speechVolume,
    storageKey
  );
  assert(speechVolume === 0.3, `Expected adjustable TTS volume 0.3, got ${speechVolume}`);

  // 解除しても自前走査を勝手に再開しない。支援者が明示的にONにしたときだけ再開。
  await openSettingsTab(page, "basic");
  await mode.click();
  await page.waitForFunction(() => !document.body.classList.contains("switch-control-mode"));
  await page.locator(".switch-dock").waitFor({ state: "visible" });
  assert(!(await page.locator("#autoScan").isDisabled()), "Auto scan control must unlock after delegation ends");
  assert(!(await page.locator("#autoScan").isChecked()), "Auto scan must remain stopped until explicitly enabled");
  await page.locator("#autoScan").click();
  await waitForText(page, "#scanState", "走査中");

  // Safe operating instructions stop app scanning first, but the product
  // invariant must also survive an incorrect order. Exercise the actual UI
  // transition from autoScan=true so the mode handler cannot become a no-op.
  await page.waitForFunction(() => document.querySelectorAll(".scan-focus").length > 0);
  await mode.click();
  await page.waitForFunction(() => document.body.classList.contains("switch-control-mode"));
  assert(!(await page.locator("#autoScan").isChecked()), "Mode activation must force a running app scan off");
  assert(await page.locator("#autoScan").isDisabled(), "Forced delegation must lock the app scan control");
  assert((await page.locator(".scan-focus").count()) === 0, "Forced delegation must clear the active yellow focus");
  await waitForText(page, "#scanState", "iPad走査を使用");
  const forcedSaved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).settings,
    storageKey
  );
  assert(forcedSaved.switchControlMode === true, "Forced delegation must persist the mode");
  assert(forcedSaved.autoScan === false, "Forced delegation must persist app scanning off");
}

/**
 * slot-v1 L1 の実画面契約。生成画像が読み込まれ、1回の入力で1試行だけ
 * 記録されたあと、Esc 中断が partial session として失われず残ることを確認する。
 */
async function checkSlotL1GameFlow(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 6);

  await openActivity(page, t("tile.slot-corner.title"));
  await waitForActivityChoices(page, 3);
  await openActivity(page, t("tile.slot-l1.title"));

  await waitForClass(page, "#gameView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await page.locator(".game-ready").waitFor({ state: "visible" });

  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator(".slot-task[data-game-id='slot-l1']").waitFor({ state: "visible" });
  assert(
    (await page.locator(".slot-reel").count()) === 1,
    "slot-l1 must render exactly one reel"
  );

  const imageReady = await page.locator(".slot-symbol-guide img").evaluate(
    (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  );
  assert(imageReady, "Generated six-symbol guide PNG must load in the actual game");

  // 「140ms待って比べる」は時間の仮定だった。回転は rAF で進むので、遅い機械
  // では最初の1フレームがその窓に入らないことがある——CIの mobile-webkit-like
  // （実機のWebKit＋iPhone 14 実寸）でだけ、同じ値が2回採れて落ちていた
  // （手元の5実寸では再現しない。2026-08-30）。
  //
  // 確かめたいのは「動くこと」であって「140ms以内に動くこと」ではない。
  // 待ち合わせにすれば、遅い機械でも意味を変えずに済む。
  const beforeOffset = await page.locator(".slot-reel-track").evaluate(
    (track) => track.style.getPropertyValue("--slot-track-offset")
  );
  await page.waitForFunction(
    (previous) => {
      const track = document.querySelector(".slot-reel-track");
      return Boolean(track) && track.style.getPropertyValue("--slot-track-offset") !== previous;
    },
    beforeOffset,
    { timeout: 5_000 }
  );

  const visibleCopy = await page.locator("#gameStageContent").innerText();
  assert(
    !/(?:BET|JACKPOT|CASINO|COIN|BAR|777|コイン|賭け|大当たり)/iu.test(visibleCopy),
    "The assistive task must not show gambling vocabulary: " + visibleCopy.replace(/\s+/g, " ")
  );

  await page.waitForTimeout(330);
  await page.locator("#gameStage").click();
  await page.waitForFunction(
    ({ key }) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      const session = [...(state.sessions || [])]
        .reverse()
        .find((item) => item.gameId === "slot-l1");
      return session?.trials?.length === 1;
    },
    { key: storageKey }
  );

  await page.keyboard.press("Escape");
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));

  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return [...(state.sessions || [])]
      .reverse()
      .find((item) => item.gameId === "slot-l1") || null;
  }, storageKey);

  assert(session?.taskType === "slot", "slot-l1 must persist taskType=slot");
  assert(session?.protocolVersion === "slot-v1", "slot-l1 must persist protocolVersion=slot-v1");
  assert(session?.engineVersion === 1, "slot-l1 must persist engineVersion=1");
  assert(session?.aborted === true && session?.finished === false, "Esc must persist an aborted partial slot session");
  assert(session?.trials?.length === 1, "One accepted L1 input must produce exactly one stop row");
  assert(session?.config?.reelCount === 1, "slot-l1 must persist reelCount=1");
}

/**
 * slot-v1 L2 の逐次停止を最後まで通す。各入力後の保存件数と active reel を
 * 1件ずつ追い、1入力が2本以上を止めないこと、左→右、ラウンド遷移、
 * 300msガード、完了結果のすべてを実ブラウザで固定する。
 */
async function checkSlotSequentialFlow(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 6);

  await openActivity(page, t("tile.slot-corner.title"));
  await waitForActivityChoices(page, 3);
  await openActivity(page, t("tile.slot-l2.title"));

  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator(".slot-task[data-game-id='slot-l2']").waitFor({ state: "visible" });
  assert(
    (await page.locator(".slot-reel").count()) === 3,
    "slot-l2 must render exactly three reels"
  );

  // slot-l1 と同じ理由で待ち合わせにする（時間の仮定を置かない）。
  const beforeOffsets = await page.locator(".slot-reel-track").evaluateAll((tracks) =>
    tracks.map((track) => track.style.getPropertyValue("--slot-track-offset"))
  );
  await page.waitForFunction(
    (previous) => {
      const tracks = [...document.querySelectorAll(".slot-reel-track")];
      if (tracks.length !== previous.length) return false;
      return tracks.every(
        (track, index) => track.style.getPropertyValue("--slot-track-offset") !== previous[index]
      );
    },
    beforeOffsets,
    { timeout: 5_000 }
  );
  const afterOffsets = await page.locator(".slot-reel-track").evaluateAll((tracks) =>
    tracks.map((track) => track.style.getPropertyValue("--slot-track-offset"))
  );
  assert(
    afterOffsets.every((offset, index) => offset !== beforeOffsets[index]),
    "All three reels must move before sequential stopping (" +
      beforeOffsets.join(", ") + " -> " + afterOffsets.join(", ") + ")"
  );

  const totalStops = 12;
  for (let expected = 0; expected < totalStops; expected += 1) {
    const expectedReel = expected % 3;
    await page.waitForFunction(
      (reelIndex) =>
        Number(document.querySelector(".slot-reel.is-active")?.dataset.slotReel) === reelIndex,
      expectedReel
    );

    // beginRound / advanceAfterStop の300msガードを抜けてから、人が押せる間隔で入力。
    await page.waitForTimeout(330);
    await page.locator("#gameStage").click();

    await page.waitForFunction(
      ({ key, count }) => {
        const state = JSON.parse(localStorage.getItem(key) || "{}");
        const session = [...(state.sessions || [])]
          .reverse()
          .find((item) => item.gameId === "slot-l2");
        return session?.trials?.length === count;
      },
      { key: storageKey, count: expected + 1 }
    );

    if (expected === 0) {
      // シェル側150ms dedupeは抜けるが、課題側300msガード内に収める。
      // detail=0 は Switch Control / AT の click-only 入力と同じ入口を通る。
      await page.waitForTimeout(180);
      await page.locator("#gameStage").evaluate((stage) => {
        stage.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
      });
      await page.waitForTimeout(80);
      const duplicateState = await page.evaluate((key) => {
        const state = JSON.parse(localStorage.getItem(key) || "{}");
        return [...(state.sessions || [])]
          .reverse()
          .find((item) => item.gameId === "slot-l2") || null;
      }, storageKey);
      assert(
        duplicateState?.trials?.length === 1,
        "A guarded duplicate must not stop the next reel"
      );
      assert(
        duplicateState?.summary?.extraInputCount >= 1,
        "A guarded duplicate must be counted explicitly"
      );
    }
  }

  await waitForClass(page, "#resultView", "is-active");
  await page.locator(".slot-result").waitFor({ state: "visible" });

  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return [...(state.sessions || [])]
      .reverse()
      .find((item) => item.gameId === "slot-l2") || null;
  }, storageKey);

  assert(session?.taskType === "slot", "slot-l2 must persist taskType=slot");
  assert(session?.protocolVersion === "slot-v1", "slot-l2 must persist protocolVersion=slot-v1");
  assert(session?.finished === true && session?.aborted === false, "slot-l2 must finish normally");
  assert(session?.trials?.length === totalStops, "Expected " + totalStops + " stop rows");
  assert(session?.config?.rounds === 4 && session?.config?.reelCount === 3, "slot-l2 must keep the 4x3 protocol");

  const positions = (session?.trials || []).map(
    (trial) => trial.roundIndex + ":" + trial.reelIndex
  );
  assert(
    new Set(positions).size === totalStops,
    "Every round/reel position must be unique, got " + positions.join(", ")
  );
  positions.forEach((position, index) => {
    const expectedPosition = Math.floor(index / 3) + ":" + (index % 3);
    assert(
      position === expectedPosition,
      "Stops must stay left-to-right; expected " + expectedPosition + ", got " + position
    );
  });
  assert(
    session?.summary?.extraInputCount >= 1,
    "Completed summary must retain the guarded extra input"
  );
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
  await waitForActivityChoices(page, 6);

  await openActivity(page, "リズム");
  await waitForActivityChoices(page, 4);
  await openActivity(page, "リズム 練習");

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

  // Branch on whether this browser can actually run the task.
  //
  // The rhythm engine drives every beat off AudioContext.currentTime
  // (games/rhythm.js, detailed-design.md §6.3). Headless WebKit ships no
  // AudioContext at all, so audio.scheduler.start() returns null: no beat
  // ever sounds, the pulse never moves, and judged beats never expire — the
  // session would sit on "のこり 10" forever. The engine now refuses to
  // start in that case and says why (renderUnavailable) instead of silently
  // hanging, which also means it never opens a session to abort.
  //
  // Both branches are real behaviour, so assert whichever this browser is
  // in rather than hardcoding browser names: if WebKit ever ships
  // AudioContext in headless, this check follows it instead of going stale.
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );

  if (!audioAvailable) {
    // No audio: the task must explain itself rather than hang. The cue is
    // the sound, so continuing would not be a measurement.
    await page.locator(".game-unavailable").waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await waitForClass(page, "#homeView", "is-active");
    const sessions = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw).sessions || []).length : 0;
    }, storageKey);
    assert(
      sessions === 0,
      `Expected no session to be opened when the task cannot run, found ${sessions}`
    );
    return;
  }

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

/**
 * 通常練習のゲーム版面と、measure / calibration の計器盤を同じDOM契約で固定する。
 *
 * 音の無いWebKitではリズム課題自体を開始しないのが正しいため、AudioContextが
 * 使えるデスクトップChromiumだけで行う。ここで見る「未来ノート0件」は hidden
 * では足りない。測定中にCSSが外れたときも予告が現れないよう、ノート要素そのものを
 * 作らないことまで確認する。
 */
async function checkRhythmVisualProfiles(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) return SKIPPED;

  const practiceThemes = [];

  async function launchPracticeTask(name) {
    await waitForClass(page, "#homeView", "is-active");
    await openActivity(page, t("tile.rhythm-corner.title"));
    await waitForActivityChoices(page, 4);
    await openActivity(page, name);
    await startReadyRhythm();
  }

  async function startReadyRhythm() {
    await waitForClass(page, "#gameView", "is-active");
    await page.locator(".game-ready").waitFor({ state: "visible" });
    // タイルを選んだ物理入力と、開始のひと押しを同じ入力としてdedupeしない。
    await page.waitForTimeout(180);
    await page.locator("#gameStage").click();
    await page.locator(".game-ready").waitFor({ state: "detached" });
    await page.locator("#gameStageContent[data-rhythm-profile]").waitFor({ state: "visible" });
  }

  async function rhythmSnapshot(expectedProfile, expectedTheme) {
    const stage = page.locator("#gameStageContent");
    await page.waitForFunction(
      ({ profile, theme }) => {
        const target = document.querySelector("#gameStageContent");
        return target?.dataset.rhythmProfile === profile && target?.dataset.rhythmTheme === theme;
      },
      { profile: expectedProfile, theme: expectedTheme }
    );
    await page.locator(".rhythm-note-layer").waitFor({ state: "attached" });

    if (expectedProfile === "lane") {
      await page.waitForFunction(
        () => document.querySelectorAll(".rhythm-note-layer .rhythm-note").length > 0
      );
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".rhythm-note-layer .rhythm-note")].some((note) => {
          const rect = note.getBoundingClientRect();
          return !note.hidden && rect.width > 0 && rect.height > 0;
        })
      );
    } else {
      // mount直後の最初のrAFで静止値を書き込む。空のstyleを先に読むと、
      // 実装ではなくテストの競合で不安定になる。
      await page.waitForFunction(
        () => document.querySelector(".rhythm-pulse")?.style.transform === "scale(0.93)"
      );
    }

    const snapshot = await stage.evaluate((target) => {
      const notes = [...target.querySelectorAll(".rhythm-note-layer .rhythm-note")];
      const visibleNotes = notes.filter((note) => {
        const rect = note.getBoundingClientRect();
        const style = getComputedStyle(note);
        return !note.hidden && style.display !== "none" && rect.width > 0 && rect.height > 0;
      });
      const paintedHiddenNotes = notes.filter((note) => {
        const rect = note.getBoundingClientRect();
        const style = getComputedStyle(note);
        return note.hidden && style.display !== "none" && rect.width > 0 && rect.height > 0;
      });
      const world = target.querySelector(".rhythm-world");
      const instrument = target.querySelector(".rhythm-instrument-face");
      const instrumentRect = instrument?.getBoundingClientRect();
      return {
        profile: target.dataset.rhythmProfile,
        theme: target.dataset.rhythmTheme,
        icon: target.querySelector(".rhythm-cabinet-icon i")?.getAttribute("class") || "",
        background: world ? getComputedStyle(world).backgroundImage : "",
        noteLayerCount: target.querySelectorAll(".rhythm-note-layer").length,
        noteCount: notes.length,
        visibleNoteCount: visibleNotes.length,
        paintedHiddenNoteCount: paintedHiddenNotes.length,
        pulseInlineTransform: target.querySelector(".rhythm-pulse")?.style.transform || "",
        instrumentVisible: Boolean(
          instrument &&
          getComputedStyle(instrument).display !== "none" &&
          instrumentRect &&
          instrumentRect.width > 0 &&
          instrumentRect.height > 0
        ),
      };
    });

    assert(snapshot.profile === expectedProfile, `${expectedTheme}: expected ${expectedProfile}, got ${snapshot.profile}`);
    assert(snapshot.theme === expectedTheme, `Expected rhythm theme ${expectedTheme}, got ${snapshot.theme}`);
    assert(snapshot.noteLayerCount === 1, `${expectedTheme}: expected exactly one persistent note layer`);
    assert(
      snapshot.paintedHiddenNoteCount === 0,
      `${expectedTheme}: hidden future notes must not be painted; found ${snapshot.paintedHiddenNoteCount}`
    );
    if (expectedProfile === "lane") {
      assert(snapshot.noteCount > 0, `${expectedTheme}: guided practice must create future notes`);
      assert(snapshot.visibleNoteCount > 0, `${expectedTheme}: at least one future note must be visible`);
      assert(!snapshot.instrumentVisible, `${expectedTheme}: practice lane must not show the instrument face`);
    } else {
      assert(snapshot.noteCount === 0, `${expectedTheme}: measurement must not create future-note elements`);
      assert(snapshot.visibleNoteCount === 0, `${expectedTheme}: measurement must expose zero visible future notes`);
      assert(snapshot.instrumentVisible, `${expectedTheme}: measurement must show the finished instrument face`);
      assert(
        snapshot.pulseInlineTransform === "scale(0.93)",
        `${expectedTheme}: measurement instrument must keep its pulse static, got ${snapshot.pulseInlineTransform}`
      );
    }
    return snapshot;
  }

  async function abortToLobby() {
    await page.keyboard.press("Escape");
    await waitForClass(page, "#homeView", "is-active");
  }

  async function assertLandscapeCabinetFits() {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const selectors = [
        "#gameStage",
        "#gameProgress",
        "#gameExit",
        ".rhythm-cabinet",
        ".rhythm-main-display",
        ".rhythm-console",
      ];
      const boxes = Object.fromEntries(
        selectors.map((selector) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return [
            selector,
            rect
              ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
              : null,
          ];
        })
      );
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        boxes,
      };
    });
    assert(
      layout.scrollWidth <= layout.width + 2,
      `Rhythm landscape must not overflow horizontally: scrollWidth=${layout.scrollWidth}, viewport=${layout.width}`
    );
    Object.entries(layout.boxes).forEach(([selector, box]) => {
      assert(box, `${selector} must have a bounding box at 844x390`);
      assert(box.width > 0 && box.height > 0, `${selector} must remain visible at 844x390`);
      assert(
        box.left >= -2 && box.top >= -2 && box.right <= layout.width + 2 && box.bottom <= layout.height + 2,
        `${selector} left the 844x390 viewport: ${JSON.stringify(box)}`
      );
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(120);
  }

  async function assertNarrowConsoleFits(width) {
    await page.setViewportSize({ width, height: 812 });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const consoleEl = document.querySelector(".rhythm-console");
      const consoleRect = consoleEl?.getBoundingClientRect();
      const children = consoleEl
        ? [...consoleEl.children].map((child) => {
            const rect = child.getBoundingClientRect();
            return {
              className: child.className,
              display: getComputedStyle(child).display,
              left: rect.left,
              right: rect.right,
              width: rect.width,
            };
          })
        : [];
      return {
        viewportWidth: window.innerWidth,
        consoleRect: consoleRect
          ? { left: consoleRect.left, right: consoleRect.right, width: consoleRect.width }
          : null,
        children,
      };
    });
    assert(layout.consoleRect, `Rhythm console must exist at ${width}px`);
    assert(layout.children.length === 3, `Rhythm console must keep all three panels at ${width}px`);
    layout.children.forEach((child) => {
      assert(child.display !== "none" && child.width > 0, `${child.className} disappeared at ${width}px`);
      assert(
        child.left >= layout.consoleRect.left - 2 && child.right <= layout.consoleRect.right + 2,
        `${child.className} was clipped by the console at ${width}px: ${JSON.stringify(child)}`
      );
    });
    const main = layout.children.find((child) => String(child.className).includes("rhythm-console-main"));
    assert(main?.width >= 86, `Offset scale became unreadably narrow at ${width}px: ${main?.width}`);
  }

  async function assertShortRhythmComposition(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const rectOf = (selector) => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        return element && rect
          ? {
              display: getComputedStyle(element).display,
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            }
          : null;
      };
      const consoleEl = document.querySelector(".rhythm-console");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        cabinet: rectOf(".rhythm-cabinet"),
        header: rectOf(".rhythm-cabinet-header"),
        playfield: rectOf(".rhythm-playfield"),
        main: rectOf(".rhythm-main-display"),
        console: rectOf(".rhythm-console"),
        instruction: rectOf(".rhythm-stage-instruction"),
        progress: rectOf("#gameProgress"),
        exit: rectOf("#gameExit"),
        consoleChildren: consoleEl
          ? [...consoleEl.children].map((child) => {
              const rect = child.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width };
            })
          : [],
      };
    });
    const { cabinet, header, playfield, main, console: consoleBox, instruction } = layout;
    assert(layout.scrollWidth <= width + 2, `Rhythm must not overflow at ${width}x${height}`);
    [cabinet, header, playfield, main, consoleBox, layout.progress, layout.exit].forEach((box) => {
      assert(box && box.width > 0 && box.height > 0, `Rhythm structure disappeared at ${width}x${height}`);
      assert(
        box.left >= -2 && box.top >= -2 && box.right <= width + 2 && box.bottom <= height + 2,
        `Rhythm structure left ${width}x${height}: ${JSON.stringify(box)}`
      );
    });
    assert(header.bottom <= playfield.top + 2, `Header overlaps playfield at ${width}x${height}`);
    assert(playfield.bottom <= consoleBox.top + 2, `Playfield overlaps console at ${width}x${height}`);
    assert(
      main.top >= playfield.top - 2 && main.bottom <= playfield.bottom + 2,
      `Main display is clipped by playfield at ${width}x${height}: ${JSON.stringify({ main, playfield })}`
    );
    if (instruction?.display !== "none") {
      assert(consoleBox.bottom <= instruction.top + 2, `Console overlaps instruction at ${width}x${height}`);
      assert(instruction.bottom <= cabinet.bottom + 2, `Instruction is clipped at ${width}x${height}`);
    }
    assert(layout.consoleChildren.length === 3, `Console lost a panel at ${width}x${height}`);
    layout.consoleChildren.forEach((child) => {
      assert(child.width > 0, `Console child disappeared at ${width}x${height}`);
      assert(
        child.left >= consoleBox.left - 2 && child.right <= consoleBox.right + 2,
        `Console child was clipped at ${width}x${height}: ${JSON.stringify(child)}`
      );
    });
  }

  async function assertShortColorComposition(width, height) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => {
      const rectOf = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
          : null;
      };
      return {
        chip: rectOf(".color-chip"),
        progress: rectOf(".color-session-progress"),
        hud: rectOf(".color-stage-hud"),
        exit: rectOf("#gameExit"),
        gameProgress: rectOf("#gameProgress"),
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      };
    });
    assert(layout.scrollWidth <= width + 2, `Colour stage must not overflow at ${width}x${height}`);
    [layout.chip, layout.progress, layout.hud, layout.exit, layout.gameProgress].forEach((box) => {
      assert(box && box.width > 0 && box.height > 0, `Colour structure disappeared at ${width}x${height}`);
      assert(
        box.left >= -2 && box.top >= -2 && box.right <= width + 2 && box.bottom <= height + 2,
        `Colour structure left ${width}x${height}: ${JSON.stringify(box)}`
      );
    });
    assert(
      layout.chip.bottom <= layout.progress.top + 2,
      `Colour prism overlaps progress at ${width}x${height}: ${JSON.stringify(layout)}`
    );
  }

  // 新規利用者は、支援者が設定を触らなくても通常練習のレーンから始まる。
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  const freshSettings = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}").settings || {},
    storageKey
  );
  assert(freshSettings.visualGuidance === true, "Fresh practice must default visualGuidance to true");
  assert(freshSettings.difficultyMode === "practice", "Fresh state must begin in practice mode");

  await launchPracticeTask(t("tile.rhythm-l1.title"));
  practiceThemes.push(await rhythmSnapshot("lane", "rhythm-l1"));
  await assertLandscapeCabinetFits();
  await assertNarrowConsoleFits(390);
  await assertNarrowConsoleFits(507);
  await assertShortRhythmComposition(619, 390);
  await assertShortRhythmComposition(568, 320);
  await assertShortRhythmComposition(422, 195);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(120);
  await abortToLobby();

  await openActivity(page, t("tile.color-legacy.title"));
  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.waitForTimeout(180);
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator("#gameStageContent.module-color").waitFor({ state: "visible" });
  await assertShortColorComposition(619, 390);
  await assertShortColorComposition(568, 320);
  await assertShortColorComposition(422, 195);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(120);
  await abortToLobby();

  await launchPracticeTask(t("tile.rhythm-l2.title"));
  practiceThemes.push(await rhythmSnapshot("lane", "rhythm-l2"));
  await abortToLobby();

  await launchPracticeTask(t("tile.gonogo.title"));
  practiceThemes.push(await rhythmSnapshot("lane", "gonogo"));
  await abortToLobby();

  // 保存値がONのままでも、measureは実効値をOFFへ固定して計器盤にする。
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.settings.difficultyMode = "measure";
    state.settings.visualGuidance = true;
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await launchPracticeTask(t("tile.rhythm-l1.title"));
  await rhythmSnapshot("instrument", "rhythm-l1");
  await abortToLobby();

  // calibrationは支援者画面から起動する専用手順。設定値に関係なくinstrument。
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await openSettingsTab(page, "measure");
  await page.locator("#startCalibration").click();
  await startReadyRhythm();
  const calibrationTheme = await rhythmSnapshot("instrument", "calibration");

  const allThemes = [...practiceThemes, calibrationTheme];
  assert(new Set(allThemes.map((item) => item.theme)).size === 4, "All four rhythm games need distinct theme identifiers");
  assert(new Set(allThemes.map((item) => item.icon)).size === 4, "All four rhythm games need distinct cabinet icons");
  assert(new Set(allThemes.map((item) => item.background)).size === 4, "All four rhythm games need distinct rendered worlds");
}

/**
 * エンドレスのさかなつりに「のこり時間」を出さない。
 *
 * 実装の都合で内部には15分の上限がある（合図の音を最初にまとめて計画する
 * 作りなので、途中で計画を作り直すと時刻の基準ごと取り直すことになる。§9.6）。
 * これは記録が壊れないための上限であって、利用者への約束ではない。
 * カウントダウンを出すと終わりが時間で決まるように読めるが、実際は
 * 1回失敗したら終わり——画面が嘘をつくことになる。
 *
 * 夕暮れ（is-dusk）も「もうすぐ終わり」の合図なので出さない。
 */
async function checkEndlessFishingHasNoClock(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "さかなつり");
  await openActivity(page, "ずっと釣る");
  await waitForClass(page, "#gameView", "is-active");

  await page.locator(".game-ready").waitFor({ state: "visible" });
  const readyText = (await page.locator(".game-ready").textContent()) || "";
  assert(
    !readyText.includes("1分間") && !readyText.includes("1ぷんかん"),
    `Endless fishing must not promise a one-minute run: ${readyText.replace(/\s+/g, " ").trim()}`
  );

  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });

  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) {
    // 音が出せない端末ではセッションを開かない（checkFishingGameFlow と同じ）。
    await page.locator(".game-unavailable").waitFor({ state: "visible" });
    return SKIPPED;
  }

  await page.waitForTimeout(900);
  const progress = ((await page.locator("#gameProgress").textContent()) || "").trim();
  assert(
    !progress.includes("のこり") && !progress.includes("残り"),
    `Endless fishing must not show a countdown, got "${progress}"`
  );
  assert(
    /\d/.test(progress),
    `Endless fishing should show how far the run has got, got "${progress}"`
  );
  assert(
    (await page.locator(".fishing-scene.is-dusk").count()) === 0,
    "Endless fishing must not show the dusk cue that means the run is nearly over"
  );

  await page.locator("#gameExit").click();
  await waitForClass(page, "#homeView", "is-active");
}

async function checkFishingGameFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  // さかなつりはコーナータイルになったので、二階層目で課題を選ぶ。
  // fishing（純粋な単純反応時間）と fishing-gonogo（抑制つき）に分けたのは、
  // taskType "rt" なのに No-Go 刺激が混ざっていた食い違いを解くため。
  await openActivity(page, "さかなつり");
  await openActivity(page, "アタリで釣る");
  await waitForClass(page, "#gameView", "is-active");
  // さかなつりも content.js の gameHowTo を持つようになったので、レディ画面を
  // ひと押しで抜けてからでないとセッションが始まらない。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.waitForTimeout(220);

  // 音が鳴らせない端末では、そもそもセッションを開かない。
  //
  // この課題は魚の動きも判定も AudioContext の時計で回している。時計が
  // 止まったままだとアタリの合図が一度も鳴らず、魚も現れない——それでも
  // 押下は「合図の前に押した」＝フライングとして**試行が記録されてしまう**
  // （実測: 音の無い端末で2件記録された）。刺激を一度も出していない回の
  // データが、正常な反応時間の記録に混ざる。
  //
  // リズムと同じ扱いで、始められない理由を出して止める。両方の分岐が
  // 実際の振る舞いなので、ブラウザ名ではなく AudioContext の有無で分ける。
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) {
    await page.locator(".game-unavailable").waitFor({ state: "visible" });
    await page.locator("#gameStage").click();
    await page.waitForTimeout(300);
    const sessions = await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      return (state.sessions || []).length;
    }, storageKey);
    assert(
      sessions === 0,
      `A task that never presented a cue must not record trials, found ${sessions} session(s)`
    );
    await page.locator("#gameExit").click();
    await waitForClass(page, "#homeView", "is-active");
    return;
  }

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
/**
 * 設定の指定タブを開く。
 *
 * 設定は4つの面に分かれている（src/App.svelte の .settings-tab）。全部を
 * 1ページに並べると 3.4画面ぶんになり、目的の項目を毎回スクロールで探す
 * ことになるため。研究者モードなどは「そくてい」の面にある。
 *
 * 見えていない面の操作子は走査の輪からも外れる（scan.js は rect.width > 0 で
 * 絞る）ので、テストも支援者と同じくまず面を開く。
 */
async function openSettingsTab(page, name) {
  const tab = page.locator(`.settings-tab[data-settings-tab="${name}"]`);
  await tab.click();
  await page.locator(`.settings-panel[data-settings-panel="${name}"]`).waitFor({ state: "visible" });
}

// 走らせるため。const だと宣言位置より前に実行されて TDZ に落ちる。
async function waitForCraneStatus(page, text, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let seen = null;
  while (Date.now() < deadline) {
    // textContent はルビの読みも連結してしまう（`横よこに動うごきます`）。
    // 画面に「本文として」出ている文字だけを読む。
    seen = await page.evaluate(() => {
      const el = document.querySelector(".crane-status");
      if (!el) return null;
      const copy = el.cloneNode(true);
      copy.querySelectorAll("rt").forEach((rt) => rt.remove());
      return copy.textContent;
    });
    if (seen === text) return;
    await delay(80);
  }
  throw new Error(`crane status never became "${text}" (last seen: "${seen}")`);
}

/**
 * エンドレスは1回失敗したら終わり、結果画面へ進む。
 *
 * 難度が上がりつづける遊びに終わりの条件が無いと、いつ終わるかが「支援者が
 * 見ていて止める」だけになる——利用者からは、自分の操作と終わりが結びつかない。
 *
 * 失敗はわざと作る。走査が始まった直後（アームが端にいるうち）に両軸を止めると
 * 狙いから大きく外れる。狙いは内側に寄せて置かれるので（craneGeometry.js の
 * pickTarget）、端で止めれば grip 圏には入らない。
 */
async function checkEndlessEndsOnFailure(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "アームで つかむ");
  await openActivity(page, "ずっと止める");
  await waitForClass(page, "#gameView", "is-active");

  // レディ画面の文言が、エンドレスの約束（終わり方）に差し替わっていること。
  // ここが元のままだと、画面は「5回」と言っているのに終わり方が違う。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  const readyText = (await page.locator(".game-ready").textContent()) || "";
  assert(
    readyText.includes("失敗") || readyText.includes("しっぱい"),
    `Endless ready screen must state how the run ends, got: ${readyText.replace(/\s+/g, " ").trim()}`
  );

  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });

  // わざと外す。ガードを抜けた直後（掃引の約18%）で止める作りにしていたが、
  // 狙いは craneGeometry.pickTarget が x∈[20,80] / y∈[22,78] に置くので、
  // 18%付近はたまたま掴める距離に入ることがある（ipad-portrait で実際に
  // 掴めて回が終わらず、結果画面を待って時間切れになった）。
  //
  // 掃引の折り返し（sweepMs 経過＝100%地点）で止める。狙いの上限は80/78 な
  // ので、grip 圏（半径 toleranceR/2 = 7.5）には決して入らない。
  const sweepMs = 2200;
  await waitForCraneStatus(page, "横に動きます");
  await page.waitForTimeout(sweepMs);
  await page.locator("#gameStage").click();
  await waitForCraneStatus(page, "奥に動きます");
  await page.waitForTimeout(sweepMs);
  await page.locator("#gameStage").click();

  // 1試行で結果画面へ抜けること。回数で終わるゲームなら5回続くので、
  // ここで結果が出れば「失敗で終わった」ことの証拠になる。
  await waitForClass(page, "#resultView", "is-active");

  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    const runs = (state.sessions || []).filter((item) => item.gameId === "crane");
    return runs[runs.length - 1] || null;
  }, storageKey);
  assert(session, "An endless crane run must be recorded");
  assert(session.config?.endless === true, "The run must be recorded as endless");
  assert(
    session.trials.length >= 1 && session.trials.at(-1).judgment !== "grip",
    `The run must end on a failed trial, got ${JSON.stringify(session.trials.map((t) => t.judgment))}`
  );
  // 完走扱いで残ること。aborted に倒れると成立確認の材料から外れる
  // （readinessCheck.js の isUsable）。
  assert(session.aborted === false, "An endless run that ended on a miss is not an abort");
  assert(
    session.config.targetTrials === session.trials.length,
    "The actual trial count must be written back so the record stays self-consistent"
  );
}

async function checkCraneGameFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "アームで つかむ");
  await openActivity(page, "アームを止める");
  await waitForClass(page, "#gameView", "is-active");
  // crane も content.js の gameHowTo を持つようになったので、レディ画面を
  // ひと押しで抜けてからでないとセッションが始まらない。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  // カウントインの長さを固定の待ち時間で当てにいくと、AudioContext の
  // 立ち上がりが遅い環境（WebKit系）で走査開始前に押してしまう。
  // 走査が始まったことを状態表示で確かめてから押す。
  await waitForCraneStatus(page, "横に動きます");
  // 走査が始まった直後の押下は入力ガード（INPUT_GUARD_MS）で弾かれる。
  // ガードを抜けてから押す。
  await page.waitForTimeout(400);
  await page.locator("#gameStage").click();
  await waitForCraneStatus(page, "奥に動きます");

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

/**
 * あそびを終えたあとのリザルトは利用者の世界（start/home/game/result）で、
 * 支援者向けのものを一切出さない。
 *
 * 2件の回帰を同時に見ている。どちらも「動くが、出てはいけないものが出る」型で、
 * ビルドもテストも通り、目視でも見落としやすい。
 *
 *  1. タブバー。隠す規則が body.home-mode にしか無く、result に無かったので、
 *     あそびを終えた直後の画面にだけ「評価ログ / 設定」が現れていた。
 *  2. 支援者編集ロックの注意書き。DOM にあるだけの保護操作子を数えていたため、
 *     #calibrationSaveOffset（そくてい専用・ふだんは hidden）がリザルトに
 *     居るせいで、押せる操作子が1つも無い画面に「いまは変更できません」
 *     だけが毎回出ていた。
 */
async function checkResultScreenStaysInTheUserWorld(page) {
  // 3回で終わる・アームは速い、に寄せて所要時間を詰める（どちらも支援者が
  // 設定画面から実際に選べる範囲。state.js の nullableNumberInRange の下限）。
  //
  // context 側に addInitScript で足すこと自体が要る。この context には
  // 「毎回 localStorage を消す」初期化スクリプトが先に入っているので、
  // evaluate で書いてから reload すると、その消去に巻き込まれて設定が
  // 消える。初期化スクリプトは登録順に走るため、あとから足せば消去の後に
  // 書き込める。
  await page.context().addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: storageKey,
      value: JSON.stringify({
        version: 3,
        settings: { craneTargetTrials: 3, craneSweepMs: 800 },
      }),
    }
  );
  await page.reload();

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "アームで つかむ");
  await openActivity(page, "アームを止める");
  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });

  // 1試行 = 横で1回・奥で1回。あとは掴みの演出が終わると次の試行へ進む。
  for (let trial = 0; trial < 3; trial += 1) {
    await waitForCraneStatus(page, "横に動きます");
    await page.waitForTimeout(400); // 入力ガード（INPUT_GUARD_MS）を抜ける
    await page.locator("#gameStage").click();
    await waitForCraneStatus(page, "奥に動きます");
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
  }

  await waitForClass(page, "#resultView", "is-active");
  assert(
    (await page.locator("#resultStats").getAttribute("aria-live")) === "off",
    "App TTS ownership must suppress duplicate result live-region speech"
  );

  // 支援者のタブバーは出ない。
  await page.locator(".tabbar").waitFor({ state: "hidden" });

  // 利用者が次にできることは画面に出ている。
  await page.locator("#resultRetry").waitFor({ state: "visible" });
  await page.locator("#resultHome").waitFor({ state: "visible" });
}

/**
 * 走査の現在位置は、いつでも画面に見えていなければならない。
 *
 * scan.js は現在位置へ scrollIntoView({block:"nearest"}) するが、これは
 * 「ビューポートの端」を境界にするので、下端に居座る入力ドック
 * （position:fixed）と上端に粘着するタブバー（position:sticky）のぶんを
 * 知らない。スマホのように画面が短いと、いちばん下の選択肢がドックの裏へ
 * 回ったまま「いま えらんでいます」になる。
 *
 * 実測（修正前、iPhone 14 / SE）: ホームの4番目・5番目のタイルが 182px——
 * タイルまるごと——隠れていた。走査で選ぶ利用者にとっては、どれを選んで
 * いるか見えないまま押すことになり、この操作方式そのものが成立しない。
 * CSS の scroll-margin で解いてあるが、値が失われても画面は普通に動く
 * （タイルは並んでいるし、走査も回る）ので、ここで固定する。
 */
async function checkScanFocusStaysVisible(page, project) {
  // 画面が短いほど起きやすい。iPad では起きないので、モバイル系だけ見る。
  if (project.name === "chromium-desktop") return SKIPPED;

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 6);

  const tiles = await page.locator("#gameTileGrid .game-tile").count();
  for (let index = 0; index < tiles; index += 1) {
    // 走査を待つのではなく、対象を直接スクロールさせて同じ経路
    // （scrollIntoView + scroll-margin）を通す。走査間隔に依存しないので
    // 遅い環境でも揺れない。
    const seen = await page.evaluate((position) => {
      const tile = document.querySelectorAll("#gameTileGrid .game-tile")[position];
      if (!tile) return null;
      tile.scrollIntoView({ block: "nearest", inline: "nearest" });
      const dock = document.querySelector(".switch-dock");
      const rect = tile.getBoundingClientRect();
      const dockRect =
        dock && getComputedStyle(dock).display !== "none" ? dock.getBoundingClientRect() : null;
      return {
        label: (tile.textContent || "").replace(/\s+/g, " ").trim().slice(0, 12),
        hiddenByDock: dockRect ? Math.round(rect.bottom - dockRect.top) : 0,
        offScreenAbove: Math.round(-rect.top),
        offScreenBelow: Math.round(rect.bottom - document.documentElement.clientHeight),
      };
    }, index);
    assert(seen, `Expected activity tile #${index + 1} to exist`);
    assert(
      seen.hiddenByDock <= 0,
      `Tile "${seen.label}" sits ${seen.hiddenByDock}px behind the input dock while it is the scan target`
    );
    assert(
      seen.offScreenAbove <= 0 && seen.offScreenBelow <= 0,
      `Tile "${seen.label}" is off screen (above=${seen.offScreenAbove}px below=${seen.offScreenBelow}px)`
    );
  }
}

/**
 * 効果音は設定に従い、測定の合図音は設定に関わらず鳴る。
 *
 * クレーンとさかなつりに「押した結果」の音を足した（アームの下降・把持・
 * 落下、水音とリール）。これらは soundEnabled で切れなければならない一方、
 * リズムやアタリの合図音は切れてはいけない——合図はこのアプリの測定刺激
 * そのもので、basic-design.md §6 でミュート不可としている。
 *
 * 音は自動では聴けないので、合成のために作られた AudioNode の種類を数えて
 * 見分ける。効果音はノイズ音源＋フィルタ（createBufferSource /
 * createBiquadFilter）、合図音はオシレータ（createOscillator）を使うので、
 * 「効果音だけ 0 になり、合図音は残る」ことが数で確かめられる。
 *
 * ヘッドレス WebKit には AudioContext が無いので Chromium でだけ走らせる。
 */
async function checkEffectSoundsFollowTheSetting(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  // AudioContext が無ければ、鳴る/鳴らないを数えようがない。ブラウザ名で
  // 決め打ちせず実際の有無で見る（CI のランナーは手元と同じとは限らない）。
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) return SKIPPED;

  await page.context().addInitScript(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    window.__soundCounts = { noise: 0, filter: 0, tone: 0 };
    const count = (name, key) => {
      const original = Ctx.prototype[name];
      Ctx.prototype[name] = function patched(...args) {
        window.__soundCounts[key] += 1;
        return original.apply(this, args);
      };
    };
    count("createBufferSource", "noise");
    count("createBiquadFilter", "filter");
    count("createOscillator", "tone");
  });

  /** クレーンを1試行だけ進めて、そのあいだに作られたノードを数える。 */
  async function playOneTrial(soundEnabled) {
    await page.context().addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      {
        key: storageKey,
        value: JSON.stringify({
          version: 3,
          settings: { soundEnabled, craneTargetTrials: 3, craneSweepMs: 800 },
        }),
      }
    );
    await page.reload();
    await page.locator("#startStage").click();
    await waitForClass(page, "#homeView", "is-active");
    await openActivity(page, "アームで つかむ");
    await openActivity(page, "アームを止める");
    await page.locator(".game-ready").waitFor({ state: "visible" });
    // タイルを押した直後のこの押下は、入力ファネルの多重発火除去
    // （SWITCH_INPUT_DEDUPE_MS = 150ms）に飲まれることがある。飲まれると
    // レディ画面が残ったままになり、以降の待ちが全部空振りする。
    // 開始できたことを確かめ、まだなら間隔を空けて押し直す。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.waitForTimeout(250);
      await page.locator("#gameStage").click();
      try {
        await page.locator(".game-ready").waitFor({ state: "detached", timeout: 1_000 });
        break;
      } catch {
        // まだレディ画面のまま。もう一度押す。
      }
    }
    await page.locator(".game-ready").waitFor({ state: "detached" });
    const before = await page.evaluate(() => ({ ...window.__soundCounts }));
    await waitForCraneStatus(page, "横に動きます");
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
    await waitForCraneStatus(page, "奥に動きます");
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
    // 固定時間で待たない。掴みの演出（降下→把持→搬送）にかかる時間は端末と
    // ランナーの速さで変わるので、待つのは「結果が確定したこと」そのもの。
    // ここを sleep にすると、遅い CI で音が鳴る前に数えて落ちる。
    await page.waitForFunction(
      () => {
        const status = document.querySelector(".crane-status")?.textContent?.trim() ?? "";
        return /つかんだ|すべった|とどかなかった|とれた/.test(status);
      },
      undefined,
      { timeout: 15_000 }
    );
    await page.waitForTimeout(200); // 落下音は結果表示の少しあとに鳴る
    const after = await page.evaluate(() => ({ ...window.__soundCounts }));
    await page.keyboard.press("Escape");
    await waitForClass(page, "#homeView", "is-active");
    return {
      noise: after.noise - before.noise,
      filter: after.filter - before.filter,
      tone: after.tone - before.tone,
    };
  }

  const withSound = await playOneTrial(true);
  assert(
    withSound.noise > 0 && withSound.filter > 0,
    `Expected effect sounds while sound is on, got ${JSON.stringify(withSound)}`
  );

  const withoutSound = await playOneTrial(false);
  assert(
    withoutSound.noise === 0 && withoutSound.filter === 0,
    `Effect sounds must be silent when the sound setting is off, got ${JSON.stringify(withoutSound)}`
  );
  assert(
    withoutSound.tone > 0,
    "The measurement cue must keep sounding even with effects off (basic-design.md §6)"
  );
}

/**
 * 支援者が文字を入力しているあいだ、入力ドックが可視領域を食わない。
 *
 * ドックは画面下に position:fixed で居座る。スマホでソフトキーボードが出ると
 * その上へ持ち上がり、いま打っている欄が見えなくなる（実測: iPhone SE では
 * フォームの可視領域がほぼ消える）。ドックは利用者がスイッチで操作する
 * ためのものなので、支援者がキーボードを使っている最中に要る場面がない。
 *
 * 焦点が外れたら必ず戻ることまで見る。戻らないと、走査で操作する手段が
 * 画面から消えたままになる——利用者にとっては操作不能と同じ。
 */
async function checkDockStepsAsideForTextEntry(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await page.locator(".switch-dock").waitFor({ state: "visible" });

  // 支援者が文字を打つ欄は、いまは評価ログの参加者IDだけ（観察メモは
  // 効果測定セッションごと別紙へ移した。2026-08-29）。
  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");

  await page.locator("#participantId").focus();
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // 文字入力から離れたらドックは戻る。
  await page.locator("#participantId").evaluate((el) => el.blur());
  await page.locator(".switch-dock").waitFor({ state: "visible" });
}

/**
 * 音が「鳴らせない」状態でセッションを開かない——AudioContext が無い場合だけ
 * でなく、**あるのに鳴らない**場合も。
 *
 * これは実機でだけ起きる silent failure で、ヘッドレスでは自然発生しない。
 * iOS では他アプリの割り込みや着信で state が "interrupted" になり、自動
 * 再生制限の解除にしくじると "suspended" のまま残る。どちらも
 * AudioContext 自体は存在するので、有無だけを見るガードは素通りする
 * ——合図が一度も鳴らないまま、押した分だけがデータになる。
 *
 * CI では再現しないぶん、AudioContext を止めた状態を作って確かめる。
 * 実機の割り込みそのものは作れないが、「止まっている context で始めない」
 * という契約は同じ経路で確かめられる。
 */
async function checkSilentAudioDoesNotProduceData(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) return SKIPPED;

  // 生成された AudioContext を、resume() を無効化したうえで suspended に保つ。
  // アプリ側は unlock() で resume を試みるので、無効化しないと running へ
  // 戻ってしまい、止まった状態を再現できない。
  await page.context().addInitScript(() => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    Ctx.prototype.resume = function stubbedResume() {
      return Promise.resolve();
    };
    const suspend = Ctx.prototype.suspend;
    const original = Ctx.prototype.constructor;
    window.__forceSuspended = true;
    // state は読み取り専用なので、getter を差し替えて "suspended" を返す。
    Object.defineProperty(Ctx.prototype, "state", {
      configurable: true,
      get() {
        return window.__forceSuspended ? "suspended" : "running";
      },
    });
    void suspend;
    void original;
  });
  await page.reload();

  for (const [corner, task] of [
    [null, t("tile.gonogo.title")],
    ["さかなつり", "アタリで釣る"],
  ]) {
    await page.locator("#startStage").click();
    await waitForClass(page, "#homeView", "is-active");
    if (corner) {
      await openActivity(page, corner);
      await openActivity(page, task);
    } else {
      await openActivity(page, task);
    }
    await waitForClass(page, "#gameView", "is-active");

    // レディ画面をひと押しで抜けると、そこで始められないと分かる。
    if ((await page.locator(".game-ready").count()) > 0) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await page.waitForTimeout(250);
        await page.locator("#gameStage").click();
        if ((await page.locator(".game-ready").count()) === 0) break;
      }
    }
    await page.locator(".game-unavailable").waitFor({ state: "visible" });
    // 「止まっている」ときは、端末を変えろではなく直せる案内を出す。
    const text = await page.locator(".game-unavailable").innerText();
    assert(
      text.includes("音が止まっている"),
      `Expected the stopped-audio wording, got: ${text.replace(/\s+/g, " ")}`
    );

    await page.locator("#gameStage").click();
    await page.waitForTimeout(300);
    const sessions = await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key) || "{}");
      return (state.sessions || []).length;
    }, storageKey);
    assert(
      sessions === 0,
      `A task whose cue never sounds must not record trials, found ${sessions} session(s)`
    );
    await page.locator("#gameExit").click();
    await waitForClass(page, "#homeView", "is-active");
    await page.reload();
  }
}

/**
 * リズムを最後まで通し、記録された測定値そのものを確かめる。
 *
 * これまでの rhythm の検査は、500ms で中断して「空の aborted セッションが
 * 残る」ことしか見ていなかった——判定・計時・記録という、このアプリの
 * 中核が1件も検証されていなかった。判定窓の計算や時刻変換が壊れても、
 * 中断だけを見ている検査は通る。
 *
 * ここで保証できるのは「押した時刻と拍の差が、押したとおりの符号と桁で
 * 記録されること」まで。実機の rawOffsetMs には、これに加えて音声出力遅延・
 * NeuroNode の処理とデバウンス・Switch Control の配信遅延が乗る。CI が
 * 見ているのはスケジューラと判定の計算であって、可聴の開始時刻ではない。
 */
async function checkRhythmRecordsRealOffsets(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  const audioAvailable = await page.evaluate(
    () => Boolean(window.AudioContext || window.webkitAudioContext)
  );
  if (!audioAvailable) return SKIPPED;

  // 支援者が設定できる範囲で短くする（bpm 80 / 5拍）。押しどころの時刻は
  // プリセットから導く——カウントイン拍数を決め打ちすると、練習の既定値を
  // 調整したときに黙ってずれる（実際 countInBeats を 3→2 にして落ちた）。
  await page.context().addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    {
      key: storageKey,
      // 基準オフセットを 0 以外にしておく。0 だと「生値を記録する」規則を
      // 壊しても値が変わらず、検査が素通りする（実際そうなった）。
      value: JSON.stringify({
        version: 3,
        settings: { rhythmBpm: 80, targetBeats: 5, baselineOffsetMs: 60 },
      }),
    }
  );
  await page.reload();

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "リズム");
  await openActivity(page, "リズム 練習");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  const startedAt = Date.now();

  // わざと早い側・遅い側へずらして押す。どちらの符号も出ることを見たいので、
  // 全部を「ぴったり」に寄せない。
  const beatMs = 60000 / 80;
  const countIn = rhythmPresets["rhythm-l1"].countInBeats;
  const trialPeriodMs = (countIn + 1.5) * beatMs; // TRIAL_GAP_BEATS = 1.5
  const cueOffsetMs = countIn * beatMs;
  const intended = [-180, 120, -60, 200, 40];
  for (let index = 0; index < intended.length; index += 1) {
    const wait = index * trialPeriodMs + cueOffsetMs + intended[index] - (Date.now() - startedAt);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.locator("#gameStage").click({ position: { x: 400, y: 300 } });
  }

  // 最後の判定も、同じJSタスク内で結果へ消さず、利用者が読める時間を残す。
  await page.waitForFunction(
    () => (document.querySelector(".rhythm-judgment strong")?.textContent || "").trim().length > 0
  );
  assert(
    await page.locator("#gameView").evaluate((element) => element.classList.contains("is-active")),
    "The final rhythm judgment must remain on the game screen before the result transition"
  );
  await page.waitForTimeout(Math.max(120, RHYTHM_FINAL_FEEDBACK_MS - 180));
  assert(
    await page.locator("#gameView").evaluate((element) => element.classList.contains("is-active")),
    "The final rhythm feedback must remain visible for a perceivable interval"
  );

  await waitForClass(page, "#resultView", "is-active");
  const session = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return (state.sessions || []).findLast((item) => item.gameId === "rhythm-l1") || null;
  }, storageKey);

  assert(session, "Expected a recorded rhythm-l1 session");
  assert(session.finished === true && session.aborted === false, "Expected a completed session");

  const hits = (session.trials || []).filter((trial) => trial.judgment === "hit");
  assert(hits.length >= 3, `Expected most presses to be judged as hits, got ${hits.length}`);

  hits.forEach((trial) => {
    assert(
      typeof trial.rawOffsetMs === "number" && Number.isFinite(trial.rawOffsetMs),
      `A hit must carry a numeric rawOffsetMs, got ${trial.rawOffsetMs}`
    );
    // 判定窓の外の値が hit として記録されていたら、判定か時刻変換が壊れている。
    assert(
      Math.abs(trial.rawOffsetMs) <= session.config.effectiveWindowMs,
      `hit offset ${trial.rawOffsetMs}ms lies outside the judgment window ` +
        `(±${session.config.effectiveWindowMs}ms)`
    );
    // 記録は生値のまま。基準を差し引いていれば、この等式が基準のぶん崩れる。
    assert(
      Math.abs(trial.rawOffsetMs - (trial.inputMs - trial.scheduledMs)) <= 1,
      `rawOffsetMs must stay the raw difference of inputMs and scheduledMs ` +
        `(${trial.rawOffsetMs} vs ${trial.inputMs - trial.scheduledMs})`
    );
    // 基準は判定窓の中心をずらすだけで、記録からは差し引かない
    // （研究設計上の最重要規則。games/rhythm.js 冒頭）。
    assert(
      trial.appliedBaselineMs === 60,
      `Expected the configured baseline on every trial, got ${trial.appliedBaselineMs}`
    );
  });

  // 押したタイミングの**差**が、記録の差として現れること。
  //
  // 符号そのもの（早い/遅い）は見ない。テスト側から拍の絶対時刻を正確に
  // 狙うと、スケジューラの先読み（START_DELAY_S）やマウントまでの間が
  // そのまま系統誤差として乗り、CI の速さで揺れる。実際これを見誤って
  // 「全部はやい側」という結果になり、アプリではなくテストの時計モデルが
  // 間違っていた。
  //
  // ここで確かめたいのは「記録が入力時刻に追随すること」——定数でも乱数でも
  // ないこと。押しどころを 300ms 遅らせたら記録も 300ms 遅い側へ動く、が
  // 成り立てば、判定と時刻変換は生きている。
  const intendedDiffs = intended.slice(1).map((value, index) => value - intended[index]);
  const recorded = hits.map((trial) => trial.rawOffsetMs);
  assert(
    recorded.length === intended.length,
    `Expected one hit per press, got ${recorded.length} of ${intended.length}`
  );
  const recordedDiffs = recorded.slice(1).map((value, index) => value - recorded[index]);
  recordedDiffs.forEach((diff, index) => {
    const expected = intendedDiffs[index];
    assert(
      Math.abs(diff - expected) <= 120,
      `Press ${index + 1}→${index + 2} moved by ${Math.round(expected)}ms but the record moved ` +
        `by ${Math.round(diff)}ms (recorded: ${recorded.map(Math.round).join(", ")})`
    );
  });
  // 定数が記録されていないこと（すべて同じ値なら、入力時刻を見ていない）。
  assert(
    Math.max(...recorded) - Math.min(...recorded) > 100,
    `Recorded offsets barely vary (${recorded.map(Math.round).join(", ")}) — the measurement may be constant`
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
  // 二階層目もページに分かれることがある（画面が短いと1ページ2〜3件）。
  // 直に click すると、2ページ目に居る項目に届かない——利用者と同じく
  // 「つぎのページ」を辿ってから押す。
  const activityTargets = [
    ["matching", "マッチング"],
    ["voca", "VOCA"],
    ["letters", "文字学習"],
  ];
  for (const [target, name] of activityTargets) {
    await openActivity(page, "学ぶ・伝える");
    await openActivity(page, name);
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
  await openSettingsTab(page, "measure");
  await page.locator("#researcherMode").click();
  await page.waitForFunction(() => document.body.classList.contains("researcher-mode"));

    await page.locator('.tab[data-view="log"]').click();
    await waitForClass(page, "#log", "is-active");

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

  // researcherMode は設定の面（そくてい）の出し分けに使う。効果測定・操作訓練・
  // 研究の3タブは 2026-08-29 に削除したので、ここで確かめるのは「支援者の
  // データ画面が評価ログ1枚にまとまっていること」。
  await openSettingsTab(page, "measure");
  await page.locator("#researcherMode").click();
  await page.waitForFunction(() => document.body.classList.contains("researcher-mode"));

  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");
  // 参加者IDと書き出しは、すべてこの1枚に居る。
  await page.locator("#participantId").waitFor({ state: "visible" });
  for (const selector of [
    "#exportSessionLedgerCsv",
    "#exportRhythmCsv",
    "#exportSlotCsv",
    "#exportScanCsv",
    "#exportRtCsv",
    "#exportRawJson",
    "#exportCsv",
    "#handOverParticipant",
  ]) {
    await page.locator(selector).waitFor({ state: "visible" });
  }

  // 消した画面が本当に消えていること。マークアップに残したまま到達できない
  // 状態にすると、次に触る人が「動かない画面」を直そうとする。
  for (const gone of ["#evaluation", "#operation", "#research"]) {
    assert((await page.locator(gone).count()) === 0, `${gone} must be gone, not hidden`);
  }
  const tabs = await page.locator(".tabbar button").allTextContents();
  assert(
    tabs.length === 3,
    `Expected three shell tabs (home / log / settings), got ${tabs.length}: ${tabs.join(" ")}`
  );

  // 設定そのものは、researcherMode を入れたあとも動く。
  await page.locator('.tab[data-view="settings"]').click();
  await waitForClass(page, "#settings", "is-active");
  await openSettingsTab(page, "measure");
  await page.locator("#researcherMode").waitFor({ state: "visible" });
  // 「出す遊び」は「そうさ」の面にある（設定はタブ分けされている）。
  await openSettingsTab(page, "basic");
  await page.locator("#hideVisualTasks").click();

  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 4);
  // 1ページだけ見て判定すると、ページ分割の入る画面では「2ページ目に居る」
  // だけの項目を「隠れている」と読んでしまう。全ページを巡って確かめる。
  const lobbyTitles = await collectActivityTitles(page);
  assert(
    !lobbyTitles.includes("アームで つかむ"),
    `Visual-task setting must remove the claw corner from the lobby (saw: ${lobbyTitles.join(", ")})`
  );
  assert(
    lobbyTitles.length === 4,
    `Expected four remaining activities after hiding the claw, got ${lobbyTitles.length}`
  );
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
  //
  // SKIPPED は返さない。ここまでで WebKit も実際に検査を済ませているので、
  // 「何も見ていない」と報告するのは実態と逆になる。
  if (project.name !== "chromium-desktop") return undefined;

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
 * 画面ごとのレイアウト不変条件を、利用者の世界と支援者の世界の両方で見る。
 *
 * この2つは目で見れば分かるが、**実機が無いと目で見られない**種類の欠陥で、
 * しかも壊れてもビルドは通る。手元の計測スクリプトでしか見ていなかったので、
 * CI が唯一の確認手段である以上ここへ移す。実際にここで見つかった:
 *   - 効果測定タブで横スクロール7〜22px（「測定リセット」が潰れて縦書きに
 *     なり画面外へ出ていた）
 *   - 設定のプルダウンが35px（指で押す最小の44pxを下回っていた）
 *   - 横向きでモバイル用の圧縮が丸ごと効かず、タイル名が1文字ずつ折り返し
 *
 * 横スクロールが利用者にとって致命的なのは、走査で選ぶ相手は画面外の
 * 操作子へたどり着けないから。タップ標的の大きさは、狙って押すこと自体が
 * 難しい利用者にとって成功率そのものになる。
 */
async function checkLayoutInvariants(page) {
  /** いま見えている画面の、はみ出しと小さすぎる標的を集める。 */
  const inspect = async (where) => {
    const found = await page.evaluate(() => {
      const doc = document.documentElement;
      const visible = (el) => el.getClientRects().length > 0;
      const controls = [...document.querySelectorAll("button, select, input, [data-scan]")].filter(
        visible
      );
      const describe = (el) => {
        const rect = el.getBoundingClientRect();
        const id = el.id || el.className.toString().split(" ")[0] || el.tagName.toLowerCase();
        // 丸めずに出す。44px ちょうどの要素が 43.99 で落ちたとき、丸めた値を
        // 出すと「44なのに落ちる」という読めないメッセージになる。
        return `${id}=${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`;
      };
      return {
        overflow: doc.scrollWidth - doc.clientWidth,
        // 指で押す最小の大きさ（Apple HIG / WCAG 2.5.5 の目安が44px）。
        // range スライダーは掴む部分が別なので、この検査からは外す。
        //
        // 1px の余裕を持たせるのは、レイアウト計算の端数で 44px 指定の要素が
        // 43.99 になることがあるため。ここで拾いたいのは「44を狙ったのに
        // 端数で落ちた」ではなく「そもそも小さい」ほうなので、
        // 端数で落ちるとテストが狼少年になる。
        tooSmall: controls
          .filter((el) => el.type !== "range")
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            return rect.height < 43 || rect.width < 43;
          })
          .map(describe)
          .slice(0, 8),
      };
    });
    assert(
      found.overflow <= 2,
      `${where}: horizontal overflow ${found.overflow}px — a scanning user cannot reach controls off screen`
    );
    assert(
      found.tooSmall.length === 0,
      `${where}: touch targets below 44px — ${found.tooSmall.join(", ")}`
    );
  };

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await inspect("home");

  // 選択肢の名前が読める幅で置かれていること。
  //
  // これははみ出しにもタップ標的の小ささにも現れない種類の壊れかたで、
  // 実際に見落とした: 横向き（844px幅）でモバイル用の圧縮が丸ごと効かず、
  // タイルの内側が desktop の 52px+88px 列のままになった結果、名前の欄が
  // 13px まで潰れて「い / ろ / と」と1文字ずつ縦に折り返していた。
  // ビルドも通るし、はみ出しも起きないので、数字でしか捕まえられない。
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll("#gameTileGrid .game-tile")].map((tile) => {
      const text = tile.querySelector(".tile-text");
      const heading = tile.querySelector("strong");
      return {
        label: tile.getAttribute("aria-label") || "",
        textWidth: text ? text.getBoundingClientRect().width : 0,
        headingHeight: heading ? heading.getBoundingClientRect().height : 0,
        lineHeight: heading ? parseFloat(getComputedStyle(heading).lineHeight) || 0 : 0,
        tileHeight: tile.getBoundingClientRect().height,
      };
    })
  );
  assert(tiles.length > 0, "Expected activity tiles on the home screen");
  tiles.forEach((tile) => {
    assert(
      tile.textWidth >= 120,
      `Activity "${tile.label}" has only ${Math.round(tile.textWidth)}px for its name — it will wrap per character`
    );
    // 見出しは2行までに収まること（3行以上は、幅が足りずに折り返している）。
    if (tile.lineHeight > 0) {
      const lines = tile.headingHeight / tile.lineHeight;
      assert(
        lines <= 2.2,
        `Activity "${tile.label}" wraps its name over ${lines.toFixed(1)} lines`
      );
    }
  });

  // 支援者の世界。研究者モードを開けて、列の多い画面まで含めて見る。
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await inspect("settings (locked)");

  await openSettingsTab(page, "measure");
  await page.locator("#researcherMode").click();
  await inspect("settings (unlocked)");

  // 支援者が見る面は評価ログと設定の2つだけになった（2026-08-29）。
  // 評価ログは列の多い画面（書き出し9個・推移のタブ・セッション一覧）なので、
  // はみ出しが出るならここに出る。
  for (const view of ["log"]) {
    await page.locator(`.tab[data-view="${view}"]`).click();
    await waitForClass(page, `#${view}`, "is-active");
    await inspect(view);
  }
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
  // calibrationOffer / measureModeNotice など常設の hidden 要素がある前提。
  assert(total >= 3, `Expected several [hidden] elements to inspect, found ${total}`);
  assert(
    leaks.length === 0,
    `These elements have the hidden attribute but are still displayed: ${leaks.join(", ")}`
  );
}

async function checkIpadAccessibilityLayout(page, project) {
  if (project.name !== "ipad-portrait") return SKIPPED;

  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");

  // 押すのではなく、**その状態にする**。
  //
  // ここは長らく largeText を無条件にクリックしていた。ところが largeText の
  // 既定は ON（state.js）なので、クリックは OFF にする操作だった——
  // 「大きい文字で読めること」を確かめる検査が、大きい文字を切った状態を
  // 見ていた。検査名と中身が逆を向いていても、テストは緑のまま通る。
  // 「見え方」は senses の面にある（設定はタブ分けされている）。
  await openSettingsTab(page, "senses");
  const ensureChecked = async (id) => {
    const box = page.locator(`#${id}`);
    if (!(await box.isChecked())) await box.click();
    assert(await box.isChecked(), `Expected #${id} to be on for this check`);
  };
  await ensureChecked("largeText");
  await ensureChecked("highContrast");

  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 6);
  const homeLayout = await collectActivityLayout(page, { checkViewport: true });
  assert(
    homeLayout.titles.length === 6,
    "Expected all six accessible home choices, got " + homeLayout.titles.join(", ")
  );

  // 設定が実際に画面へ効いていること。チェックボックスが入っていても
  // body へ反映されていなければ、以下の寸法検査は素の表示を測ってしまう。
  const applied = await page.evaluate(() => ({
    largeText: document.body.classList.contains("large-text"),
    highContrast: document.body.classList.contains("high-contrast"),
    rootFontPx: parseFloat(getComputedStyle(document.body).fontSize),
  }));
  assert(applied.largeText, "Expected body.large-text while checking the large-text layout");
  assert(applied.highContrast, "Expected body.high-contrast while checking the layout");
  assert(
    applied.rootFontPx > 16,
    `Expected large text to raise the base font above 16px, got ${applied.rootFontPx}px`
  );

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

  // content.js の description の扱い。
  //
  // 名前（aria-label）には混ぜない。走査のたびに説明まで読まれると、選ぶ
  // ための手がかりが埋もれるので、名前は短い見出しのまま保つ。説明は
  // aria-describedby で別に渡す。ここは以前から変わらない。
  //
  // 画面には出す（以前は .sr-only で読み上げ経路にだけ流していた）。
  // 目で見て選ぶ利用者と、隣で見ている支援者には何も届いていなかったため。
  // 「見えないこと」を固定していた以前の assertion は、レイアウトを守って
  // いたわけではなかった——行は .game-tile の min-height（145px）と84pxの
  // アイコンで決まっていて、説明1行を足しても高さは変わらない（実測）。
  //
  // 代わりにここで守るのは、説明を出したことで壊れうる2つ:
  //   1. 説明が見出しより目立たないこと（どちらが選ぶ手がかりか分からなくなる）
  //   2. 説明のぶんで行が伸びていないこと（現在ページが入力ドックの上に収まる、
  //      下の lastBottom <= dockTop と対になる）
  const tileNaming = await page.evaluate(() =>
    [...document.querySelectorAll("#gameTileGrid .game-tile")].map((tile) => {
      const describedBy = tile.getAttribute("aria-describedby");
      const description = describedBy ? document.getElementById(describedBy) : null;
      const heading = tile.querySelector("strong");
      const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
      // 利用者向けの文言は総ルビなので、textContent にはふりがなの読みも
      // 連結される（`色いろと音おと`）。ここで見たいのは「画面に本文として
      // 出ている文字」なので、rt を落としてから読む。読み上げ名（aria-label）は
      // 最初からプレーン文なので、この2つが一致することを下で確かめている。
      const baseText = (el) => {
        if (!el) return "";
        const copy = el.cloneNode(true);
        copy.querySelectorAll("rt").forEach((rt) => rt.remove());
        return copy.textContent.trim();
      };
      return {
        name: tile.getAttribute("aria-label") || "",
        isPager: tile.classList.contains("scan-pager"),
        heading: baseText(heading),
        description: baseText(description),
        descriptionIsVisible: description
          ? description.getBoundingClientRect().width > 2
          : false,
        headingFontPx: px(heading),
        descriptionFontPx: px(description),
        rowHeight: tile.getBoundingClientRect().height,
      };
    })
  );
  // 0件だと以下の forEach が何も検証しないまま通る。
  const firstPageActivities = tileNaming.filter((tile) => !tile.isPager);
  assert(
    firstPageActivities.length === homeLayout.pages[0].length,
    "Expected " + homeLayout.pages[0].length +
      " activities on the first page, got " + firstPageActivities.length
  );
  assert(
    tileNaming.filter((tile) => tile.isPager).length === (homeLayout.pages.length > 1 ? 1 : 0),
    "A paginated home must expose exactly one reachable next-page control"
  );
  tileNaming.forEach((tile) => {
    assert(tile.name === tile.heading, `Tile name must stay the short heading, got "${tile.name}"`);
    assert(tile.description.length > 0, `Tile "${tile.name}" must expose its description to AT`);
    assert(
      tile.descriptionIsVisible,
      `Tile "${tile.name}" description must be readable on screen, not only by AT`
    );
    assert(
      tile.descriptionFontPx < tile.headingFontPx,
      `Tile "${tile.name}" description must stay subordinate to the heading ` +
        `(description ${tile.descriptionFontPx}px vs heading ${tile.headingFontPx}px)`
    );
    assert(
      tile.rowHeight <= 200,
      `Tile "${tile.name}" row grew to ${tile.rowHeight}px; the current page no longer fits above the dock`
    );
  });

  assert(layout.overflow <= 2, `Expected iPad horizontal overflow <= 2px, got ${layout.overflow}px`);
  assert(
    layout.rowWritingModes.every((mode) => mode === "horizontal-tb"),
    `Expected horizontal activity labels, got ${layout.rowWritingModes.join(", ")}`
  );
  // 現在ページの全項目に手が届くこと。判定はアプリと同じ規則にする
  // （src/lib/scanPaging.js の SCAN_OVERLAP_TOLERANCE_PX = 24px）。
  //
  // 厳密な「1pxも重ならない」にしていたころ、大きい文字（既定ON）を入れた
  // iPad で 8px だけ重なって落ちていた。そこでページ分割へ倒すと、8px の
  // ために選択肢が5つから3つへ減る——重なりの実害より、選べる数が減る害の
  // ほうが大きい。走査は scrollIntoView するので、この幅なら現在位置は
  // 必ず全体が見える。
  const OVERLAP_TOLERANCE_PX = 24;
  assert(
    layout.lastBottom !== null &&
      layout.dockTop !== null &&
      layout.lastBottom - layout.dockTop <= OVERLAP_TOLERANCE_PX,
    `Expected every control on the current page within reach of the dock, got lastBottom=${layout.lastBottom} dockTop=${layout.dockTop}`
  );
}

/**
 * ホーム（または二階層目）の選択肢を、名前で押す。
 *
 * 画面が短いと一覧はページに分かれる（src/lib/scanPaging.js）。走査で選ぶ
 * 画面ではスクロールで追わせるより、一度に出す数を減らしてページを送る
 * ほうが安全なため——利用者はスクロールを止められないので、選ぶたびに
 * 画面が動くと「選ぶ」課題が「選ぶ＋動く画面を追う」課題になる。
 *
 * その結果、目的の選択肢が最初のページに無いことがある。テスト側も
 * 実際の利用者と同じ経路（「つぎの ページ」を押す）でたどり着く。
 * ページ数は有限で循環するので、一巡しても見つからなければ失敗にする。
 */
/**
 * スタート押下のガードが切れるまで待つ。
 *
 * スタートを押した直後 500ms は、ホームのタイルへのクリックがアプリ側で
 * 握りつぶされる（views/home.js の armStartInputGuard）。スタートのひと押しが
 * そのままアクティビティまで届いてしまう事故を防ぐためのもので、**正しい挙動**。
 *
 * 待たずに押していたころは、他の待ち合わせでたまたま時間が経っていたので
 * 通っていた。待ち合わせを速くした（画面高さからページ分割を予想するのを
 * やめた）とたんにガード内で押すようになり、一斉に落ちた——テストが人間より
 * 速いだけで、アプリは壊れていない。人が押せる速さに合わせる。
 */
async function settleStartGuard(page) {
  await page.waitForTimeout(550);
}

async function openActivity(page, name) {
  await settleStartGuard(page);
  const target = page.getByRole("button", { name, exact: true });
  const pager = page.locator(".game-tile.scan-pager");
  for (let hop = 0; hop < 6; hop += 1) {
    if ((await target.count()) > 0) {
      await target.click();
      return;
    }
    assert(
      (await pager.count()) > 0,
      `Activity "${name}" is not on this page and there is no way to page forward`
    );
    await pager.click();
    await page.waitForTimeout(120);
  }
  assert(false, `Activity "${name}" never appeared while paging through the scan list`);
}

/**
 * ホーム（または二階層目）に、その画面で出るはずの選択肢が並ぶのを待つ。
 *
 * 画面が短いと一覧はページに分かれる（src/lib/scanPaging.js の
 * SCAN_PAGE_SIZE=3）。数を決め打ちすると、iPad では通ってスマホでは落ちる
 * ——あるいはその逆——というテストになるので、画面の高さから期待値を出す。
 * ページ送り自身は選択肢ではないので数に入れない。
 */
/**
 * 一覧に並ぶ選択肢の名前を、全ページぶん集める。
 *
 * ページ分割が入ったあと、「この選択肢は出ていない」を1ページだけ見て
 * 判定すると、モバイルでは常に真になる——2ページ目に居るだけの項目を
 * 「隠れている」と読んでしまう。数と中身は必ず一巡して確かめる。
 * 最後に先頭ページへ戻すので、呼んだ側の状態は変わらない。
 */
async function collectActivityLayout(page, { checkViewport = false } = {}) {
  const titles = [];
  const pages = [];
  const pager = page.locator(".game-tile.scan-pager");
  for (let hop = 0; hop < 6; hop += 1) {
    const snapshot = await page.evaluate(() => {
      const controls = [...document.querySelectorAll("#gameTileGrid .game-tile")];
      const shown = controls
        .filter((tile) => !tile.classList.contains("scan-pager"))
        .map((tile) => tile.getAttribute("aria-label") || "");
      const outside = controls
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          return (
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.left < -1 ||
            rect.top < -1 ||
            rect.right > window.innerWidth + 1 ||
            rect.bottom > window.innerHeight + 1
          );
        })
        .map((control) => control.getAttribute("aria-label") || control.textContent.trim());
      return { shown, outside };
    });
    assert(snapshot.shown.length > 0, "Activity page must contain at least one choice");
    if (checkViewport) {
      assert(
        snapshot.outside.length === 0,
        `Activity controls left the viewport: ${snapshot.outside.join(", ")}`
      );
    }
    pages.push(snapshot.shown);
    snapshot.shown.forEach((title) => {
      if (!titles.includes(title)) titles.push(title);
    });
    if ((await pager.count()) === 0) break;
    await pager.evaluate((target) => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });
    await page.waitForTimeout(120);
    // 一周して先頭へ戻ったら終わり。
    const firstOfPage = await page.evaluate(
      () =>
        document
          .querySelector("#gameTileGrid .game-tile:not(.scan-pager)")
          ?.getAttribute("aria-label") || ""
    );
    if (titles[0] === firstOfPage) break;
  }
  return { titles, pages };
}

async function collectActivityTitles(page) {
  return (await collectActivityLayout(page)).titles;
}

async function waitForActivityChoices(page, total) {
  // ページ分割が入るかどうかを画面高さから**予想しない**。
  //
  // scanPaging.js のしきい値は先読みの当てでしかなく、最終的な件数は描いた
  // 結果の実測で決まる（views/home.js の refitIfOverflowing）——入りきらな
  // ければ分割し、それでも入らなければ1ページの件数を減らす。ここで予想して
  // いたころは、当てが外れる実寸（390x812）でテストが落ちた。
  //
  // 見たいのは「選択肢が並んでいること」なので、実際に並んだ数が落ち着くのを
  // 待つ: 分割が無ければ全件、あれば全件より少ない件数＋ページ送り。
  await page.waitForFunction(
    (expectedTotal) => {
      const grid = document.querySelector("#gameTileGrid");
      if (!grid) return false;
      const tiles = grid.querySelectorAll(".game-tile:not(.scan-pager)").length;
      if (tiles === 0) return false;
      const hasPager = grid.querySelectorAll(".scan-pager").length > 0;
      return hasPager ? tiles < expectedTotal : tiles === expectedTotal;
    },
    total,
    { timeout: 5_000 }
  );
  await settleStartGuard(page);
  return page.evaluate(
    () => document.querySelectorAll("#gameTileGrid .game-tile:not(.scan-pager)").length
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
