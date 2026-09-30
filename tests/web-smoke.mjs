import { chromium, devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { colorLegacyPreset, rhythmPresets, storageKey } from "../src/lib/content.js";
import { resolveTextMode, toSpeechText, translate } from "../src/lib/i18n.js";
import { RHYTHM_FINAL_FEEDBACK_MS } from "../src/lib/games/rhythm.js";
import { POP_FADE_MS, POP_SHOW_MS, popAnimalFor } from "../src/lib/games/colorLegacy.js";
import { BEGINNER_TARGET_PRESSES } from "../src/lib/games/beginnerKit.js";
import { PARTY_FINISH_DELAY_MS, PARTY_RESULT_SCAN_DELAY_MS } from "../src/lib/games/partyStage.js";
import { PARTY_JAR_CAPACITY, PARTY_STARS } from "../src/lib/party.js";

// 利用者向けの文言は表記モードで変わる（src/lib/i18n.js）。テストが固定文字列を
// 持つと、辞書を直したときにテストだけが古い文言を主張して落ちる——あるいは
// 辞書の抜けを見逃す。既定の表記で辞書から引く。
const t = (key, values) => translate(key, resolveTextMode({}), values);
// 声に渡る形（分かち書きの空白を外し、かなの助数詞を漢字へ。src/lib/i18n.js の toSpeechText）。
// 画面の文と読み上げの文は、2026-09-27 から意図して違う。
const spokenJa = (text) => toSpeechText(text, "ja-JP");

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
  ["plays the balloon and coloring games to the end, with live per-game settings", checkBeginnerGamesFlow],
  ["hits every pitch that is swung at and re-pitches a missed one in the baseball game", checkBaseballFlow],
  ["adds effects within the safety rules and never in a measured run", checkEffectsFollowSafetyRules],
  ["plays the party atmosphere: otter, sparkles, crowd, reward, and a frame that waits", checkPartyAtmosphere],
  ["plays the shared party atmosphere in balloon, coloring, and baseball without research rewards", checkSharedBeginnerParty],
  ["keeps the timing party still before cues and counts only resolved successes", checkTimingParty],
  ["speaks the name of each item the scan frame moves to when asked to", checkScanFeedbackSpeaksNames],
  ["speaks with the app's own natural voice, and with the device voice when asked to", checkAppVoiceSpeaks],
  ["picks slot-l1, renders generated symbols, and records one stopped reel before abort", checkSlotL1GameFlow],
  ["stops slot-l2 reels one at a time from left to right and completes the session", checkSlotSequentialFlow],
  ["fills the screen with the practice reels without any of them spilling off it", checkPracticeReelsFillTheScreen],
  ["keeps the measured reels at their fixed size and shrinks them only when they cannot fit", checkMeasuredReelsStayOnScreen],
  ["starts fishing, records one rt trial, and destroys cleanly on exit", checkFishingGameFlow],
  ["counts up instead of counting down in endless fishing", checkEndlessFishingHasNoClock],
  ["plays one crane trial and destroys cleanly between trials", checkCraneGameFlow],
  ["ends an endless crane run on the first failure", checkEndlessEndsOnFailure],
  ["keeps the result screen free of supporter chrome", checkResultScreenStaysInTheUserWorld],
  ["keeps every scan target visible above the input dock", checkScanFocusStaysVisible],
  ["mutes effect sounds but never the measurement cue", checkEffectSoundsFollowTheSetting],
  ["refuses to record when the cue cannot sound", checkSilentAudioDoesNotProduceData],
  ["moves the input dock out of the way while typing", checkDockStepsAsideForTextEntry],
  ["shows six common settings and preserves values through accessible details", checkSettingsDetails],
  ["keeps all supporter screens out of the scan ring", checkSupporterMenuStaysOutOfTheScanRing],
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
  ["keeps storage failures visible and exports the unsaved state", checkStorageRecovery],
  ["announces the explanation after both voices fail asynchronously", checkDoubleVoiceFailure],
  ["names downloads with participant and time", checkExportFileName],
  ["lets one switch finish both endless games without changing measured input", checkSwitchEndlessExit],
  ["lets one switch leave the screen where audio cannot start", checkSwitchUnavailableExit],
  ["blocks deletion when records change after an export", checkBackupRevision],
  ["refuses to clear a participant's data before it has been exported", checkHandOverNeedsAnExportFirst],
];

// 手元で一部だけ回すための絞り込み。CI は何も付けずに全部回す。
//   SMOKE_PROJECTS=chromium-desktop SMOKE_CHECKS=color,result node tests/web-smoke.mjs
// 実寸 × 検査の全部は重い（WebKit を4実寸立てる）。直した画面の周りだけを
// 先に回して、全体は CI に任せる使い方のため。絞ったときは最後にそう書く
// ——絞った緑を全体の緑と取り違えないように。
const listFromEnv = (name) =>
  (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const onlyProjects = listFromEnv("SMOKE_PROJECTS");
const onlyChecks = listFromEnv("SMOKE_CHECKS");
const selectedProjects = onlyProjects.length
  ? projects.filter((project) => onlyProjects.includes(project.name))
  : projects;
const selectedChecks = onlyChecks.length
  ? checks.filter(([name]) => onlyChecks.some((keyword) => name.includes(keyword)))
  : checks;

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", process.env.SMOKE_DIST || "dist", String(port)], {
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

  for (const project of selectedProjects) {
    const browser = await project.browserType.launch({ headless: !headed });
    try {
      for (const [name, check] of selectedChecks) {
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
          if (check === checkStorageRecovery && message.text().startsWith("[neuro] 状態の保存に失敗しました")) return;
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
      `(${selectedProjects.length} viewports x ${selectedChecks.length} checks).`
  );
  if (selectedProjects.length < projects.length || selectedChecks.length < checks.length) {
    console.log(
      `NOTE: filtered run (SMOKE_PROJECTS / SMOKE_CHECKS). ` +
        `Full suite is ${projects.length} viewports x ${checks.length} checks.`
    );
  }
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
  await waitForText(page, "#scanState", "枠は止まっています");
  await page.waitForTimeout(1900);
  await waitForText(page, "#scanState", "枠は止まっています");
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
  await waitForActivityChoices(page, 9);
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
  await waitForActivityChoices(page, 9);

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

  // はじめの遊び（おすと でてくる）は「やりかた」を挟まない。遊びの画面が
  // 最初から「押してみよう」と出していて、最初のひと押しで動物が出る
  // （content.js の gameHowTo、docs/design-renewal-2026-09-25.md §1.4）。
  // レディ画面を挟む遊びの契約（1押し目は記録しない）は slot / fishing /
  // crane の検査が見ている。
  await page.locator("#gameStageContent.module-pop .pop-prompt").waitFor({ state: "visible" });
  assert(
    (await page.locator(".game-ready").count()) === 0,
    "The first game must open straight on its prompt, without a ready screen"
  );

  // Pure tone owns the first ~0.2s. Spy on the actual app-TTS call and both
  // aria-live regions: checking #liveRegion text alone would miss immediate
  // speechSynthesis or the polite #gameProgress channel.
  // アプリの読み上げは、アプリに入れた声（声のパック）でも端末の声でも
  // neuronode:speech を出す（audio.js の reportSpeech）。どちらで読んだかに
  // よらず、それを数える。端末の声は鳴らさない（speak を空にする）。
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
      value: () => {},
    });
    window.addEventListener("neuronode:speech", (event) => {
      if (event.detail.fallback) return;
      speechCalls.push({
        text: event.detail.text,
        volume: event.detail.volume,
        via: event.detail.via,
        at: performance.now(),
      });
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
    const feedback = stageContent.querySelector(".pop-figure");
    const feedbackText = feedback?.querySelector(".pop-word")?.cloneNode(true);
    feedbackText?.querySelectorAll("rt").forEach((reading) => reading.remove());
    const box = feedback?.getBoundingClientRect();
    return {
      speechCount: speechCalls.length,
      liveCount: liveEvents.length,
      progressCount: progressEvents.length,
      progressBefore,
      progressAfter: progress.textContent,
      animal: feedback?.dataset.animal || "",
      feedbackText: feedbackText?.textContent?.trim() || "",
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
  assert(earlyFeedback.animal === popAnimalFor(0).id, "The first press must bring out the first animal");
  assert(earlyFeedback.feedbackText === t("color.pop.0"), "The animal must come with its short word");
  assert(earlyFeedback.feedbackInViewport, "Visual feedback must stay inside the viewport");
  // 出てくる動きが終わったら、はっきり見えていること（hk-pop の途中は opacity が低い）。
  await page.waitForTimeout(300);
  const settledOpacity = await page.locator("#gameStageContent .pop-figure").evaluate(
    (figure) => Number(getComputedStyle(figure).opacity)
  );
  assert(settledOpacity >= 0.9, `Expected the animal to be clearly visible, opacity=${settledOpacity}`);
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
      Boolean(window.AudioContext || window.webkitAudioContext) ||
      (typeof window.SpeechSynthesisUtterance === "function" &&
        typeof window.speechSynthesis?.speak === "function")
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
  assert(
    deliveredFeedback.speech.text ===
      spokenJa(t("color.voice.progress", { name: t(`animal.${popAnimalFor(0).id}`), n: 4 })),
    `App TTS must name the animal and report the remaining presses, got ${JSON.stringify(deliveredFeedback.speech.text)}`
  );
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
    nextSpeech.text === spokenJa(t("color.voice.progress", { name: t(`animal.${popAnimalFor(1).id}`), n: 3 })),
    `Replacement TTS must name the new animal and report the new remaining count, got ${JSON.stringify(nextSpeech.text)}`
  );

  // 出た動物はしばらく見せて、消えて真っ暗に戻る（「出て、消えて、次」）。
  await page.waitForFunction(
    () => !document.querySelector("#gameStageContent .pop-figure"),
    null,
    { timeout: POP_SHOW_MS + POP_FADE_MS + 3_000 }
  );
  const feedbackEndedAt = await page.evaluate(() => performance.now());
  assert(
    feedbackEndedAt - nextInputCancellation.clickAt >= POP_SHOW_MS,
    "The animal disappeared before it could be seen"
  );
  assert(
    feedbackEndedAt - nextInputCancellation.clickAt < POP_SHOW_MS + POP_FADE_MS + 2_000,
    "The animal stayed on screen too long"
  );

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
  await page.locator("#gameStageContent.module-pop .pop-prompt").waitFor({ state: "visible" });

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
  assert(
    rapidDelivered.events[0].text ===
      t("color.voice.progress", { name: t(`animal.${popAnimalFor(1).id}`), n: 3 }),
    "Last rapid click must own the remaining-count announcement"
  );
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
    !destroyEventTexts.includes(
      t("color.voice.progress", { name: t(`animal.${popAnimalFor(2).id}`), n: 2 })
    ),
    "destroy() must cancel the pending delayed color announcement"
  );
  assert(
    (await page.locator("#gameStageContent .pop-figure").count()) === 0,
    "destroy() must not leave the animal on the (hidden) stage"
  );
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
  await waitForActivityChoices(page, 9);
  await page.locator("#gameTileGrid .game-tile:not([disabled])").first().click();
  await waitForClass(page, "#gameView", "is-active");

  // おすと でてくる（旧 色と音）。レディ画面は挟まず、最初から「押してみよう」。
  async function waitForPrompt() {
    await page.locator("#gameStageContent.module-pop .pop-prompt").waitFor({ state: "visible" });
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
        total: document.querySelectorAll(".pop-dot").length,
        done: document.querySelectorAll(".pop-dot.is-done").length,
        word: plainText(".pop-word"),
        animal: document.querySelector(".pop-figure")?.dataset.animal || "",
      };
    });
  }

  await waitForPrompt();
  const initial = await progressSnapshot();
  assert(initial.total === colorLegacyPreset.targetPresses, "The game must show one dot per required press");
  assert(initial.done === 0, "A new session must start with zero completed dots");
  assert(initial.word === t("color.prompt"), "A new session must invite the first press");
  assert(initial.animal === "", "No animal may be out before the first press");

  const logsBefore = await readLogCount(page);
  for (let press = 1; press <= colorLegacyPreset.targetPresses; press += 1) {
    await page.locator("#gameStage").click();
    const snapshot = await progressSnapshot();
    assert(snapshot.done === press, "Expected " + press + " completed progress dots");
    // どの回も必ず動物が出る（失敗が無い）。出る順番は決まっている。
    assert(
      snapshot.animal === popAnimalFor(press - 1).id,
      `Press ${press} must bring out ${popAnimalFor(press - 1).id}, got ${snapshot.animal}`
    );
    const expectedWord =
      press < colorLegacyPreset.targetPresses ? t(`color.pop.${Math.min(press - 1, 3)}`) : t("color.pop.4");
    assert(snapshot.word === expectedWord, `Press ${press} must say "${expectedWord}", got "${snapshot.word}"`);
    if (press < colorLegacyPreset.targetPresses) await page.waitForTimeout(170);
  }
  assert(
    (await readLogCount(page)) === logsBefore + colorLegacyPreset.targetPresses,
    "A completed session must log exactly the required number of presses"
  );

  // The last animal stays on screen briefly. A sixth accepted activation
  // during that interval must be ignored rather than producing an extra tone/log.
  await page.waitForTimeout(180);
  // Dispatch the click directly: Playwright's actionability wait can outlast
  // the finish delay and then find the stage hidden by the result view,
  // although a real switch event is accepted immediately. This assertion is
  // about the input guard, not about animation stability.
  await page.locator("#gameStage").dispatchEvent("click");
  assert(
    (await readLogCount(page)) === logsBefore + colorLegacyPreset.targetPresses,
    "Completion must ignore presses beyond the fixed goal"
  );

  await waitForClass(page, "#resultView", "is-active");
  await page.locator(".completion-result").waitFor({ state: "visible" });
  await assertNoSplitRuby(page, "completion result");
  const plainOf = async (selector) =>
    page.locator(selector).evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll("rt").forEach((reading) => reading.remove());
      return clone.textContent.trim();
    });
  assert(
    (await plainOf(".completion-result-title")) === t("result.completion.title"),
    "The result must have an explicit completion heading"
  );
  assert(
    (await plainOf(".completion-result-summary")) ===
      t("result.completion.summary", {
        n: colorLegacyPreset.targetPresses,
        m: colorLegacyPreset.targetPresses,
      }),
    "The result must report how many times the child played and how many friends came out"
  );
  const resultAnimals = await page.locator(".hk-result-item").evaluateAll((items) =>
    items.map((item) => item.dataset.animal)
  );
  assert(
    JSON.stringify(resultAnimals) ===
      JSON.stringify(
        Array.from({ length: colorLegacyPreset.targetPresses }, (_, index) => popAnimalFor(index).id)
      ),
    `The result must line up the animals that came out, got ${JSON.stringify(resultAnimals)}`
  );
  assert(
    (await page.locator("#resultStats").getAttribute("aria-live")) === "off",
    "App TTS completion must suppress a duplicate result live-region announcement"
  );
  const hasFakeResearchSession = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    return (saved.sessions || []).some((session) => session.gameId === "color-legacy");
  }, storageKey);
  assert(!hasFakeResearchSession, "Completion-only play must not create a fake research taskType session");

  await page.locator("#resultRetry").click();
  await waitForClass(page, "#gameView", "is-active");
  await waitForPrompt();
  const retried = await progressSnapshot();
  assert(retried.done === 0, "Retry must reset progress to zero");
  assert(retried.word === t("color.prompt"), "Retry must invite the first press again");

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
 * 遊びの雰囲気「おおさわぎ」（演出の強さ big。src/lib/party.js・games/partyStage.js）。
 *
 *   - 押すと 出てくる に、ラッコ・キラキラびん・観客・旗が重なり、押すたびに増える
 *   - 5回目のあと、けっかに星でいっぱいのびん・きょうのびん・もらった服が出る
 *   - けっかでは、お祝いが終わるまで枠を動かさない（紙吹雪の下で枠を進めない）
 *   - その日にいっぱいにしたびんの数と服が保存される（研究の記録ではない）
 * 音楽の中身は Web Audio なので、デスクトップの Chromium だけで見る。
 */
async function checkSharedBeginnerParty(page, project) {
  if (project.name !== "chromium-desktop" && project.name !== "phone-landscape") return SKIPPED;
  await (await import("node:fs/promises")).mkdir("test-results/party-live", {recursive:true});
  for (const gameId of ["balloon", "coloring", "baseball"]) {
    await page.evaluate(({key}) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      saved.settings = {...saved.settings, fxLevel:"big", speechEnabled:false, autoScan:false};
      delete saved.party;
      localStorage.setItem(key, JSON.stringify(saved));
    }, {key:storageKey});
    await page.reload();
    await page.locator("#startStage").click();
    await openActivity(page,t(`tile.${gameId}.title`));
    // 野球は投球前のやりかたを挟む。舞台は遊びを始めてから作られる。
    if (gameId === "baseball") {
      await page.locator(".game-ready").waitFor({state:"visible"});
      await page.locator("#gameStage").click();
    }
    await page.locator(".party-otter").waitFor({state:"visible"});
    for(let press=0;press<5;press+=1) {
      if(gameId==="baseball") {
        await page.waitForFunction(()=>document.querySelector(".bb-word")?.textContent==="",null,{timeout:6000});
        await page.waitForTimeout(350);
      }
      await page.locator("#gameStage").click();
      if(press<4) await page.waitForTimeout(800);
      if(press===2) {
        await page.waitForTimeout(1200);
        await page.screenshot({path:`test-results/party-live/${project.name}-${gameId}-third.png`});
        assert((await page.locator(".party-jar .party-star").count())===7,`${gameId}: 3回目ではんぶん`);
        const overlaps = await page.evaluate(() => {
          const visible = el => el.getClientRects().length && getComputedStyle(el).opacity !== "0";
          // 割れたふうせんは、非表示のひもを含む箱ではなく実際の印を比べる。
          const heroes = [...document.querySelectorAll(".balloon:not(.is-popped),.balloon.is-popped .balloon-mark,.coloring-card,.bb-ball,.bb-bat,.balloon-word,.coloring-word,.bb-word")].filter(visible);
          return [...document.querySelectorAll(".party-fan.is-on,.party-otter,.party-jar,.party-bunting.is-on,.party-stamp")].filter(visible).flatMap(decoration => {
            const a = decoration.getBoundingClientRect();
            return heroes.filter(hero => {
              const b = hero.getBoundingClientRect();
              return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            }).map(hero => `${decoration.className}/${hero.className}`);
          });
        });
        assert(overlaps.length === 0, `${gameId}: 仲間・観客・旗・札を主役へ重ねない (${overlaps.join(", ")})`);
      }
    }
    await page.waitForFunction(() => document.querySelector("#resultView")?.classList.contains("is-active"), null, {timeout:PARTY_FINISH_DELAY_MS+4000});
    const saved = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),storageKey);
    assert(saved.party?.outfits?.includes("hat"),`${gameId}: 終了で服をもらえる`);
    assert((await page.locator(".party-result-jar .party-star").count())===15,`${gameId}: 5回でいっぱい`);
    assert((await page.locator(".party-result .hk-result-title").textContent()).includes("できた"),`${gameId}: お祝いにも一言を残す`);
    assert((await page.locator(".party-result .hk-result-medal").count())===1,`${gameId}: 完了の星を残す`);
    assert(!(saved.sessions||[]).some(s=>s.summary?.party),"お祝いを研究の記録に入れない");
  }
}

async function checkTimingParty(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  await page.evaluate(({key})=>{
    const saved=JSON.parse(localStorage.getItem(key)||"{}");
    saved.settings={...saved.settings,fxLevel:"big",difficultyMode:"practice",targetBeats:5,rhythmBpm:120,speechEnabled:false,autoScan:false};
    delete saved.party;
    localStorage.setItem(key,JSON.stringify(saved));
  },{key:storageKey});
  await page.reload();
  await page.locator("#startStage").click();
  await openActivity(page,t("tile.gonogo.title"));
  await page.locator("#gameStage").click();
  await page.waitForTimeout(300);
  const waiting=await page.evaluate(()=>({
    flyers:document.querySelectorAll(".party-star-flyer").length,
    moving:document.querySelector(".party-layer")?.getAnimations({subtree:true}).filter(a=>a.playState==="running").length||0,
    crowd:document.querySelectorAll(".party-fan,.party-bunting").length,
  }));
  assert(waiting.flyers===0&&waiting.moving===0&&waiting.crowd===0,"合図の前に仲間を動かさない");
  // 低い音を正しく見送る。高い音の見逃しには星を与えない。
  await page.waitForFunction(()=>document.querySelector("#resultView")?.classList.contains("is-active"),null,{timeout:25000});
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||"{}"),storageKey);
  const session=saved.sessions.find(s=>s.gameId==="gonogo");
  const successful=session.trials.filter(row=>row.judgment==="hit"||row.judgment==="correctRejection").length;
  const expected=Math.floor(successful*15/session.trials.length);
  assert((await page.locator(".party-result-jar .party-star").count())===expected,"成功したぶんだけ星を入れる");
  const ratio=successful/session.trials.length;
  const rating=ratio>=0.8?3:ratio>=0.5?2:1;
  const praise=ratio>=0.8?"great":ratio>=0.5?"good":"tried";
  assert((await page.locator("#resultStats [data-praise]").getAttribute("data-praise"))===`result.praise.${praise}`,"お祝いでも成績に応じた一言を残す");
  assert((await page.locator("#resultStats .hk-star:not(.is-off)").count())===rating,"びんの星とは別に3つ星で評価する");
  assert(!session.summary.party,"研究のsummaryとお祝いを分ける");
  assert(saved.party?.outfits?.includes("hat"),"課題でも完走したら服をもらえる");
}

async function checkPartyAtmosphere(page, project) {
  if (project.name !== "chromium-desktop") return SKIPPED;
  await page.evaluate(
    ({ key }) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      saved.settings = { ...(saved.settings || {}), fxLevel: "big" };
      delete saved.party;
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: storageKey }
  );
  await page.reload();
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, t("tile.color-legacy.title"));
  await waitForClass(page, "#gameView", "is-active");
  await page.locator("#gameStageContent.module-pop.is-party .party-otter").waitFor({ state: "attached" });
  const snapshot = () =>
    page.evaluate(() => ({
      stars: document.querySelectorAll(".party-jar .party-star").length,
      fans: document.querySelectorAll(".party-fan.is-on").length,
      bunting: Boolean(document.querySelector(".party-bunting.is-on")),
      sea: document.querySelector("#gameStageContent")?.classList.contains("is-sea") || false,
    }));
  const start = await snapshot();
  assert(start.sea, "The pop game must start in the sea by default");
  assert(start.stars === 0, "The sparkle jar must start empty");
  assert(start.fans === 0 && !start.bunting, "The crowd and bunting must arrive only after pressing");

  for (let press = 1; press <= 3; press += 1) {
    await page.locator("#gameStage").click();
    await page.waitForTimeout(1000);
  }
  // 星は出てきた動物から飛んでびんに入る（入りきるまで少しかかる）。
  await page.waitForTimeout(1200);
  const third = await snapshot();
  assert(third.stars === PARTY_STARS[2], `After three presses the jar must hold ${PARTY_STARS[2]} stars, got ${third.stars}`);
  assert(third.fans >= 4, "The crowd must grow with each press");
  assert(third.bunting, "The bunting must be up by the third press");

  await page.locator("#gameStage").click();
  await page.waitForTimeout(1000);
  await page.locator("#gameStage").click();
  // フィナーレとパレードを見せてから けっかへ進む（PARTY_FINISH_DELAY_MS）。ふだんの待ち（5秒）より長い。
  await page.waitForFunction(() => document.querySelector("#resultView")?.classList.contains("is-active"), null, {
    timeout: PARTY_FINISH_DELAY_MS + 4000,
  });
  const result = await page.evaluate(() => {
    const root = document.querySelector("#resultStats .party-result");
    return {
      stars: root?.querySelectorAll(".party-result-jar .party-star").length || 0,
      jarsToday: root?.querySelectorAll(".party-today .party-mini-jar").length || 0,
      reward: root?.querySelector(".party-result-reward")?.textContent || "",
      hat: Boolean(root?.querySelector(".party-result-otter.has-hat")),
      focus: Boolean(document.querySelector("#resultView .scan-focus")),
    };
  });
  assert(result.stars === PARTY_JAR_CAPACITY, `The result must show a full jar, got ${result.stars} stars`);
  assert(result.jarsToday === 1, "The first play of the day must show one jar for today");
  assert(result.reward.includes(t("party.outfit.hat").replace(/\[.*?\]/g, "")), "The first finished play must give the party hat");
  assert(result.hat, "The otter on the result must wear the new hat");
  assert(!result.focus, "The frame must wait until the celebration is over");
  await page.waitForTimeout(PARTY_RESULT_SCAN_DELAY_MS + 600);
  const scanning = await page.evaluate(() => Boolean(document.querySelector("#resultView .scan-focus")));
  const autoScan = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").settings?.autoScan !== false, storageKey);
  if (autoScan) assert(scanning, "The frame must move again after the celebration");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}").party, storageKey);
  assert(saved?.jars === 1 && saved?.outfits?.join(",") === "hat", `The day's jars and the outfit must be saved, got ${JSON.stringify(saved)}`);

  // 元の強さへ戻す（あとの確かめに持ち越さない）。
  await page.evaluate(
    ({ key }) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      saved.settings = { ...(saved.settings || {}), fxLevel: "normal" };
      delete saved.party;
      localStorage.setItem(key, JSON.stringify(saved));
    },
    { key: storageKey }
  );
}

/**
 * 演出エンジン（src/lib/fx/。docs/overall-design-2026-09-28.md §4・§5）。
 *
 *   - 演出のキャンバスは入力をさえぎらず、読み上げにも乗らない
 *   - ふつうの強さでは押すと粒が出て、動きが止まればキャンバスも描くのをやめる
 *   - 強さ「なし」では粒を出さない
 *   - けっかの星は飛び込んでくる（見せ始めのアニメーションがある）
 *   - そくていの回の遊びでは、どの強さを選んでいても何も足さず、その回の
 *     session.config.fxLevel は "none" と記録される
 */
async function checkEffectsFollowSafetyRules(page) {
  const emitted = () =>
    page.evaluate(() => Number(document.querySelector("#fxLayer")?.dataset.emitted || 0));
  const setSettings = (patch) =>
    page.evaluate(
      ({ key, patch }) => {
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        saved.settings = { ...(saved.settings || {}), ...patch };
        localStorage.setItem(key, JSON.stringify(saved));
      },
      { key: storageKey, patch }
    );
  const toHome = async () => {
    await page.reload();
    await page.locator("#startStage").click();
    await waitForClass(page, "#homeView", "is-active");
  };
  const openBalloon = async () => {
    await openActivity(page, t("tile.balloon.title"));
    await waitForClass(page, "#gameView", "is-active");
    await page.locator("#gameStageContent.module-balloon .balloon-word").waitFor({ state: "visible" });
    await page.waitForTimeout(200);
  };
  const gone = () =>
    page.evaluate(() => document.querySelectorAll(".balloon.is-popping, .balloon.is-popped").length);

  // 1. ふつう: ふうせんを割ると粒が出る。キャンバスは入力をさえぎらない。
  await setSettings({ fxLevel: "normal" });
  await toHome();
  await openBalloon();
  const before = await emitted();
  await page.locator("#gameStage").click();
  await page.waitForFunction(
    (n) => Number(document.querySelector("#fxLayer")?.dataset.emitted || 0) > n,
    before,
    { timeout: 3000 }
  );
  const layer = await page.evaluate(() => {
    const el = document.querySelector("#fxLayer");
    const style = getComputedStyle(el);
    return { pointerEvents: style.pointerEvents, ariaHidden: el.getAttribute("aria-hidden"), position: style.position };
  });
  assert(layer.pointerEvents === "none", `The effects canvas must never take input, got pointer-events: ${layer.pointerEvents}`);
  assert(layer.ariaHidden === "true", "The effects canvas must stay out of the accessibility tree");
  assert(layer.position === "fixed", "The effects canvas must cover the viewport without moving the layout");
  // 粒が飛んでいる最中でも、次のひと押しはふうせんに届く。
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  assert((await gone()) === 2, "A press during the effects must still pop the next balloon");
  // 動くものが無くなったら、キャンバスは描くのをやめる（遊んでいない時間に描き続けない）。
  await page.waitForFunction(() => document.querySelector("#fxLayer")?.dataset.active === "false", null, {
    timeout: 8000,
  });

  // けっかの星は飛び込んでくる（見せ始めのアニメーション）。
  for (let press = 3; press <= 5; press += 1) {
    await page.waitForTimeout(220);
    await page.locator("#gameStage").click();
  }
  await waitForClass(page, "#resultView", "is-active");
  await page.waitForTimeout(120);
  const revealing = await page.evaluate(() => {
    const medal = document.querySelector("#resultStats .hk-result-medal");
    return medal && typeof medal.getAnimations === "function" ? medal.getAnimations().length : -1;
  });
  assert(revealing !== 0, "The result star must fly in when the result first appears");

  // 2. なし: 粒を出さない（押した結果の絵そのものは残る）。
  await setSettings({ fxLevel: "none" });
  await toHome();
  await openBalloon();
  const quietBefore = await emitted();
  await page.locator("#gameStage").click();
  await page.waitForTimeout(450);
  assert((await gone()) === 1, "With effects off, the balloon must still pop");
  assert((await emitted()) === quietBefore, "With effects off, no particles may be drawn");

  // 3. そくていの回: どの強さを選んでいても何も足さない。
  await setSettings({ fxLevel: "big", difficultyMode: "measure" });
  await toHome();
  await openActivity(page, "さかなつり");
  await openActivity(page, "アタリで釣る");
  await waitForClass(page, "#gameView", "is-active");
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  const audioAvailable = await page.evaluate(() => Boolean(window.AudioContext || window.webkitAudioContext));
  if (!audioAvailable) return SKIPPED;
  const measuredBefore = await emitted();
  await page.locator(".fishing-scene.is-bite").waitFor({ timeout: 15000 });
  await page.locator("#gameStage").click();
  await page.waitForTimeout(600);
  assert((await emitted()) === measuredBefore, "A measured run must not add any effects");
  const recorded = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return (state.sessions || []).at(-1)?.config?.fxLevel ?? null;
  }, storageKey);
  assert(recorded === "none", `A measured run must record fxLevel "none", got ${JSON.stringify(recorded)}`);
  await page.locator("#gameExit").click();
  await waitForClass(page, "#homeView", "is-active");
}

/**
 * はじめの遊び「ふうせん わり」「ぬりえ」（docs/design-renewal-2026-09-25.md §1.4）。
 *
 * どちらも失敗が無く、5回で終わる。押すたびにちょうど1つ進むこと、5回で
 * 結果へ行き6回目は数えないこと、研究用の記録（session）を作らないことを見る。
 * あわせて「この遊びの設定」を通す: 開いているあいだの入力では進まない、
 * 「びっくりする音」を選ぶとその場で注意が出る、背景はやり直さずに効く、
 * 設定は遊びごとに保存されてほかの遊びには及ばない、閉じたらフォーカスは
 * 遊びの面へ戻る（設定ボタンに残ると、次のひと押しでまた開いてしまう）。
 */
async function checkBeginnerGamesFlow(page) {
  const presses = BEGINNER_TARGET_PRESSES;
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);

  const plainOf = async (selector) =>
    page.locator(selector).evaluate((element) => {
      const clone = element.cloneNode(true);
      clone.querySelectorAll("rt").forEach((reading) => reading.remove());
      return clone.textContent.trim();
    });
  const savedState = () =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), storageKey);
  const option = (key, value) =>
    page.locator(`.gs-option[data-gs-key="${key}"][data-gs-value='${JSON.stringify(value)}']`);

  // --- ふうせん わり ---
  await openActivity(page, t("tile.balloon.title"));
  await waitForClass(page, "#gameView", "is-active");
  const balloonWord = "#gameStageContent.module-balloon .balloon-word";
  await page.locator(balloonWord).waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  const balloons = () =>
    page.evaluate(() => ({
      total: document.querySelectorAll(".balloon").length,
      gone: document.querySelectorAll(".balloon.is-popping, .balloon.is-popped").length,
      light: document.querySelector("#gameStageContent")?.classList.contains("is-light"),
    }));
  const fresh = await balloons();
  assert(fresh.total === presses, `The balloon game must float ${presses} balloons, got ${fresh.total}`);
  assert(fresh.gone === 0, "No balloon may be popped before the first press");
  assert(fresh.light === true, "The balloon game must start on its own default (light) background");
  assert((await plainOf(balloonWord)) === t("color.prompt"), "A new balloon session must invite the first press");

  const logsBefore = await readLogCount(page);
  await page.locator("#gameStage").click();
  assert((await balloons()).gone === 1, "One press must pop exactly one balloon");
  assert((await plainOf(balloonWord)) === t("balloon.pop"), "A popped balloon must say so");

  await page.locator("#gameSettings").click();
  await page.locator("#gameSettingsDialog").waitFor({ state: "visible" });
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  assert((await balloons()).gone === 1, "A press while the game settings are open must not pop a balloon");
  await option("playPrefs.balloon.sound", "boom").click();
  const notes = await page.locator("#gameSettingsDialog .gs-note").allTextContents();
  assert(
    notes.some((note) => note.includes("びっくりする音")),
    `Choosing the startling sound must warn the supporter on the spot, got ${JSON.stringify(notes)}`
  );
  await option("playPrefs.balloon.background", "dark").click();
  await page.locator("#gameSettingsDialog .gs-apply").click();
  await page.locator("#gameSettingsDialog").waitFor({ state: "hidden" });
  const changed = await balloons();
  assert(changed.light === false, "The background choice must apply without restarting the game");
  assert(changed.gone === 1, "Changing the settings must keep the balloons already popped");
  assert(
    (await page.evaluate(() => document.activeElement?.id)) === "gameStage",
    "Closing the game settings must hand focus back to the game, not to the settings button"
  );
  const prefs = (await savedState()).settings?.playPrefs;
  assert(
    prefs?.balloon?.background === "dark" && prefs?.balloon?.sound === "boom",
    `The balloon settings must be saved for the balloon game, got ${JSON.stringify(prefs?.balloon)}`
  );
  assert(
    prefs?.coloring?.background === "light" && prefs?.coloring?.sound === "instrument",
    `Another game's settings must stay as they were, got ${JSON.stringify(prefs?.coloring)}`
  );

  for (let press = 2; press <= presses; press += 1) {
    await page.waitForTimeout(170);
    await page.locator("#gameStage").click();
    assert((await balloons()).gone === press, `Press ${press} must pop balloon ${press}`);
  }
  assert(
    (await plainOf(balloonWord)) === t("balloon.complete"),
    "The last balloon must announce that every balloon is popped"
  );
  assert(
    (await readLogCount(page)) === logsBefore + presses,
    "A balloon session must log exactly one switch event per press"
  );
  // 最後のふうせんのあと、結果へ移るまでの間の入力は数えない。
  await page.waitForTimeout(180);
  await page.locator("#gameStage").dispatchEvent("click");
  assert(
    (await readLogCount(page)) === logsBefore + presses,
    "The balloon game must ignore presses beyond the fixed goal"
  );
  await waitForClass(page, "#resultView", "is-active");
  await page.locator(".completion-result").waitFor({ state: "visible" });
  assert(
    (await plainOf(".completion-result-summary")) === t("result.balloon.summary", { n: presses }),
    "The balloon result must say how many balloons were popped"
  );
  assert(
    (await page.locator(".hk-result-item.is-burst").count()) === presses,
    "The balloon result must show one burst per balloon"
  );
  await page.locator("#resultHome").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);

  // --- ぬりえ ---
  await openActivity(page, t("tile.coloring.title"));
  await waitForClass(page, "#gameView", "is-active");
  const coloringWord = "#gameStageContent.module-coloring .coloring-word";
  await page.locator(coloringWord).waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  // 絵は押す回数ぶんの「ぬる場所」に分かれている。場所の中の部品は、
  // まとめて塗られる（半分だけ塗られた場所が無い）。
  const picture = () =>
    page.evaluate(() => {
      const groups = new Map();
      document.querySelectorAll(".coloring-art .cl-part").forEach((part) => {
        const group = Number(part.dataset.part);
        const on = part.classList.contains("is-colored");
        const entry = groups.get(group) || { all: true, any: false };
        entry.all = entry.all && on;
        entry.any = entry.any || on;
        groups.set(group, entry);
      });
      const sorted = [...groups].sort(([a], [b]) => a - b);
      return {
        groups: sorted.map(([group]) => group),
        colored: sorted.filter(([, entry]) => entry.all).map(([group]) => group),
        partial: sorted.filter(([, entry]) => entry.any && !entry.all).map(([group]) => group),
        complete: document.querySelector("#gameStageContent")?.classList.contains("is-complete"),
      };
    });
  const blank = await picture();
  const expectedGroups = Array.from({ length: presses }, (_, index) => index);
  assert(
    JSON.stringify(blank.groups) === JSON.stringify(expectedGroups),
    `The picture must be split into one area per press, got ${JSON.stringify(blank.groups)}`
  );
  assert(blank.colored.length === 0 && blank.partial.length === 0, "Nothing may be coloured before the first press");
  assert((await plainOf(coloringWord)) === t("color.prompt"), "A new colouring session must invite the first press");

  for (let press = 1; press <= presses; press += 1) {
    await page.locator("#gameStage").click();
    const now = await picture();
    assert(
      JSON.stringify(now.colored) === JSON.stringify(expectedGroups.slice(0, press)) && now.partial.length === 0,
      `Press ${press} must colour exactly the first ${press} areas, got ${JSON.stringify(now)}`
    );
    assert(
      (await plainOf(coloringWord)) === t(`coloring.word.${press - 1}`),
      `Press ${press} must say "${t(`coloring.word.${press - 1}`)}"`
    );
    if (press < presses) await page.waitForTimeout(170);
  }
  assert((await picture()).complete, "The finished picture must be marked complete before the result");
  await waitForClass(page, "#resultView", "is-active");
  const pictureId = await page.locator(".hk-result-picture").getAttribute("data-picture");
  assert(pictureId, "The colouring result must show the finished picture");
  assert(
    (await plainOf(".completion-result-summary")) ===
      t("result.coloring.summary", { name: t(`animal.${pictureId}`) }),
    "The colouring result must name the picture that was finished"
  );

  // はじめの遊びは測定の課題ではない。研究用の記録を作らない。
  const sessions = (await savedState()).sessions || [];
  assert(
    !sessions.some((session) => session.gameId === "balloon" || session.gameId === "coloring"),
    "Beginner games must not create research sessions"
  );
  await page.locator("#resultHome").click();
  await waitForClass(page, "#homeView", "is-active");
}

/**
 * ボールを打つ遊び（games/baseball.js）。
 *
 * 約束は「振れば必ず当たる」。ボールが出ているあいだの1押しは、いつでも
 * ホームラン・ヒット・ころころのどれかになり、下の5つの印が1つ埋まる。
 * 構えているあいだの押しは素振り（数えない）、振らずに見送った球は数えずに
 * もう一度投げる（へこませない）。5本でけっかへ行き、研究用の記録は作らない。
 */
async function checkBaseballFlow(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  await openActivity(page, t("tile.baseball.title"));
  await waitForClass(page, "#gameView", "is-active");
  // やりかた（レディ画面）のひと押しは、説明を読み終えた合図。
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await assertNoSplitRuby(page, "baseball how-to");
  await page.locator("#gameStage").click();
  await page.locator("#gameStageContent.module-baseball .bb-field").waitFor({ state: "visible" });

  const state = () =>
    page.evaluate(() => {
      const word = document.querySelector(".bb-word")?.dataset.word || "";
      const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(
        document.querySelector(".bb-ball")?.getAttribute("transform") || ""
      );
      return {
        word,
        ballY: match ? Number(match[2]) : null,
        filled: document.querySelectorAll(".bb-slot:not([class='bb-slot'])").length,
      };
    });
  const waitForPitch = () =>
    page.waitForFunction(
      () => {
        const word = document.querySelector(".bb-word")?.dataset.word;
        const match = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(
          document.querySelector(".bb-ball")?.getAttribute("transform") || ""
        );
        return word === "" && match && Number(match[2]) > 420 && Number(match[2]) < 540;
      },
      null,
      { timeout: 10_000 }
    );

  // 構えているあいだの押しは素振り。数えない。
  await page.waitForFunction(() => document.querySelector(".bb-word")?.dataset.word === "baseball.word.ready");
  await page.locator("#gameStage").dispatchEvent("click");
  assert((await state()).filled === 0, "A swing before the pitch must not count as a hit");

  // 見送った球は数えず、もう一度投げる。
  await page.waitForFunction(
    () => document.querySelector(".bb-word")?.dataset.word === "baseball.word.again",
    null,
    { timeout: 10_000 }
  );
  assert((await state()).filled === 0, "A pitch that was let go must not count");

  const outcomes = [];
  for (let swing = 1; swing <= 5; swing += 1) {
    await waitForPitch();
    await page.locator("#gameStage").dispatchEvent("click");
    const after = await state();
    assert(
      ["baseball.word.homerun", "baseball.word.hit", "baseball.word.bunt"].includes(after.word),
      `Swing ${swing} while the ball is out must always hit the ball, got "${after.word}"`
    );
    assert(after.filled === swing, `Swing ${swing} must fill exactly ${swing} marks, got ${after.filled}`);
    outcomes.push(after.word);
  }
  await waitForClass(page, "#resultView", "is-active");
  await page.locator(".completion-result").waitFor({ state: "visible" });
  assert(
    (await page.locator(".hk-result-item.is-ball").count()) === 5,
    "The baseball result must line up the five hits"
  );
  const sessions = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "{}").sessions || [],
    storageKey
  );
  assert(
    !sessions.some((session) => session.gameId === "baseball"),
    "The baseball game must not create research sessions"
  );
  await page.locator("#resultHome").click();
  await waitForClass(page, "#homeView", "is-active");
}

/**
 * 枠が動いたときの音（settings.scanFeedback）。「名前を読む」にすると、枠が
 * 次の項目へ動くたびに、その項目の名前を読む（画面を見続けるのが難しい利用者の
 * ため。打ち合わせ「画面を見なくても、音なら届く」）。既定の「なし」では読まない。
 */
async function checkScanFeedbackSpeaksNames(page) {
  // 読んだ文を数える（アプリの声でも端末の声でも neuronode:speech が出る）。
  // 端末の声は鳴らさない。
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__spokenVia = [];
    if (typeof window.SpeechSynthesisUtterance !== "function") {
      window.SpeechSynthesisUtterance = class {
        constructor(text) {
          this.text = text;
        }
      };
    }
    const synth = window.speechSynthesis || {};
    synth.speak = () => {};
    synth.cancel = () => {};
    if (!window.speechSynthesis) Object.defineProperty(window, "speechSynthesis", { value: synth });
    window.addEventListener("neuronode:speech", (event) => {
      if (event.detail.fallback) return;
      window.__spoken.push(event.detail.text);
      window.__spokenVia.push(event.detail.via);
    });
  });
  // 枠を1つ進めて、そのあいだに読んだ文だけを返す（ホームへ入ったときの案内の
  // 声など、ほかの読み上げは数えない）。
  const stepAndHear = async () => {
    const before = await page.evaluate(() => window.__spoken.length);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    return page.evaluate((from) => ({
      said: window.__spoken.slice(from),
      focused: document.querySelector("#gameTileGrid .scan-focus")?.getAttribute("aria-label") || null,
    }), before);
  };

  // 既定（なし）では、枠が動いても読まない。
  await page.reload();
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  const quiet = await stepAndHear();
  assert(quiet.said.length === 0, `With the default setting the scan must stay silent, but it said ${JSON.stringify(quiet.said)}`);

  // 「名前を読む」にすると、動いた先の名前を読む。
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    saved.settings = { ...(saved.settings || {}), scanFeedback: "speak", speechEnabled: true, autoScan: false };
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  for (let hop = 0; hop < 2; hop += 1) {
    const heard = await stepAndHear();
    assert(heard.focused, "Stepping the scan must focus a home item");
    assert(
      heard.said.at(-1) === spokenJa(heard.focused),
      `Moving the scan frame must speak the focused item's name ("${heard.focused}"), got ${JSON.stringify(heard.said)}`
    );
  }
  // 名前はアプリに入れた声で読む（声のパックにある。鳴らせる環境なら）。
  const canPlay = await page.evaluate(() => Boolean(window.AudioContext || window.webkitAudioContext));
  if (canPlay) {
    const via = await page.evaluate(() => window.__spokenVia);
    assert(
      via.length > 0 && via.every((path) => path === "voice-pack"),
      `Home item names must be read with the app's own voice, got ${JSON.stringify(via)}`
    );
  }
}

/**
 * 読み上げは、アプリに入れた自然な声（声のパック。src/lib/voicePack.js）で鳴らす
 * （2026-09-28「英語でも何でも棒読み」）。パックを読み込み、音にして鳴らし、
 * 端末の声へ戻らないこと。英語の表記でも同じ。設定で「端末の声」を選べば端末の声。
 */
async function checkAppVoiceSpeaks(page) {
  const canPlay = await page.evaluate(() => Boolean(window.AudioContext || window.webkitAudioContext));
  if (!canPlay) return SKIPPED;
  await page.addInitScript(() => {
    window.__speech = [];
    window.__voiceSourcesStarted = 0;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const original = Ctx.prototype.createBufferSource;
    Ctx.prototype.createBufferSource = function createBufferSource() {
      const source = original.call(this);
      const start = source.start.bind(source);
      source.start = (...args) => {
        window.__voiceSourcesStarted += 1;
        return start(...args);
      };
      return source;
    };
    const synth = window.speechSynthesis;
    if (synth) {
      synth.speak = () => {};
    }
    window.addEventListener("neuronode:speech", (event) => window.__speech.push(event.detail));
  });
  const playFirstGame = async () => {
    await page.reload();
    await page.locator("#startStage").click();
    await waitForClass(page, "#homeView", "is-active");
    await page.locator("#gameTileGrid .game-tile:not([disabled])").first().click();
    await waitForClass(page, "#gameView", "is-active");
    await page.locator("#gameStageContent.module-pop .pop-prompt").waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const sourcesBefore = await page.evaluate(() => window.__voiceSourcesStarted);
    await page.locator("#gameStage").click();
    await page.waitForFunction(() => window.__speech.length > 0, null, { timeout: 3_000 });
    // 読み込み（はじめてのときはパックの取得）と音にするのを待つ。
    await page.waitForTimeout(1_200);
    return page.evaluate((before) => ({
      speech: window.__speech,
      started: window.__voiceSourcesStarted - before,
      packs: performance.getEntriesByType("resource").map((entry) => entry.name).filter((name) => /\.bin(\?|$)/.test(name)),
    }), sourcesBefore);
  };
  // 遊びの途中で書きかえると、遊びを閉じるときの保存で上書きされる。ホームへ戻ってから。
  const setSettings = async (settings) => {
    await page.keyboard.press("Escape");
    await waitForClass(page, "#homeView", "is-active");
    await page.evaluate(
      ({ key, settings }) => {
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        saved.settings = { ...(saved.settings || {}), ...settings };
        localStorage.setItem(key, JSON.stringify(saved));
      },
      { key: storageKey, settings }
    );
  };

  const ja = await playFirstGame();
  assert(ja.speech[0]?.via === "voice-pack", `Japanese speech must use the app voice, got ${JSON.stringify(ja.speech)}`);
  assert(!ja.speech.some((detail) => detail.fallback), `The app voice fell back to the device voice: ${JSON.stringify(ja.speech)}`);
  assert(ja.started >= 1, "The app voice must actually start a sound");
  assert(ja.packs.length >= 1, "The voice pack must be loaded");

  await setSettings({ textMode: "en" });
  const en = await playFirstGame();
  assert(en.speech[0]?.via === "voice-pack" && en.speech[0]?.lang === "en-US", `English speech must use the app voice, got ${JSON.stringify(en.speech)}`);
  assert(!en.speech.some((detail) => detail.fallback), `The English app voice fell back: ${JSON.stringify(en.speech)}`);
  assert(en.started >= 1, "The English app voice must actually start a sound");

  await setSettings({ textMode: "ruby", speechVoice: "device" });
  const device = await playFirstGame();
  const deviceCapable = await page.evaluate(
    () => typeof window.SpeechSynthesisUtterance === "function" && typeof window.speechSynthesis?.speak === "function"
  );
  if (deviceCapable) {
    assert(device.speech[0]?.via === "device", `With "device voice" chosen, speech must use the device, got ${JSON.stringify(device.speech)}`);
  }
  assert(device.started === 0, "With \"device voice\" chosen, the app voice must stay silent");
}

/**
 * Regression check for the on-device gap found 2026-07-04 (basic-design.md
 * §3.2): once a switch user (or a supporter) moved from home into the
 * supporter's world (any tab), there was no way back to the user's world
 * short of force-quitting the app. #homeReturn ("← ホームへ") is the fix:
 * it must stay hidden while in the user's world (start/home/game/result) and
 * appear the moment a tab view is entered. Supporter tabs require a tap;
 * learning views also permit scanning. Both must take the user all the way
 * back to #homeView and restart scanning there.
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
  await waitForText(page, "#scanState", "枠が動いています");
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
  if (((await page.locator("#scanState").textContent()) || "").trim() !== "枠が動いています") {
    await page.locator("#toggleScan").click();
  }
  await waitForText(page, "#scanState", "枠が動いています");
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
  // 物理入力代替（画面の「おす」）を確かめるので、出す設定にしておく。
  await enableScreenSwitch(page);
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await openActivity(page, "学ぶ・伝える");
  await page.locator('#gameTileGrid [data-view="voca"]').click();
  await waitForClass(page, "#voca", "is-active");

  // Stop auto scan so an unfocused Space has no selected target and therefore
  // must be a no-op rather than triggering a hidden training action.
  // 「走査停止」は利用者の画面には出さない（docs/design-renewal-2026-09-25.md
  // §3.5）ので、ボタンの配線そのものを呼ぶ。
  if ((await page.locator("#scanState").textContent())?.trim() === "枠が動いています") {
    await page.locator("#toggleScan").evaluate((button) => button.click());
  }
  await waitForText(page, "#scanState", "枠は止まっています");

  const firstPhrase = page.locator("#phraseGrid button").first();
  await firstPhrase.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (empty) => document.querySelector("#currentPhrase")?.textContent?.trim() !== empty,
    t("learn.nothingYet")
  );

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
  await page.locator("#toggleScan").evaluate((button) => button.click());
  await waitForText(page, "#scanState", "枠が動いています");
  // toggleScan の pointerdown と物理入力代替の pointerdown は別入力。
  // Playwrightは人間より速いため、150msの入力dedupe窓を越えてから押す。
  await page.waitForTimeout(200);
  await page.locator("#primarySwitch").click();
  await waitForClass(page, "#homeView", "is-active");
}

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

// 初期表示・ネイティブ開閉・ラベル・保存を通して検証する。表示定義をテストに複製しない。
async function checkSettingsDetails(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  const savedSettings = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).settings, storageKey);
  const original = await savedSettings();
  const visibleIds = await page.locator("#settings input:visible, #settings select:visible").evaluateAll(nodes => nodes.map(node => node.id).sort());
  assert(JSON.stringify(visibleIds) === JSON.stringify(["fxLevel", "speechEnabled", "soundEnabled", "scanInterval", "largeText", "hideVisualTasks"].sort()), "Only six common settings should be visible initially");
  assert(await page.locator("#settings details[open]").count() === 0, "Details should start collapsed");
  const summary = page.locator("#settingsSwitch > summary");
  await page.locator("#hideVisualTasks").focus();
  await page.keyboard.press("Tab");
  assert(await summary.evaluate(node => document.activeElement === node), "Tab must reach the next details summary");
  await page.keyboard.press("Enter");
  await page.locator("#autoScan").waitFor({ state: "visible" });
  await page.keyboard.press("Space");
  await page.locator("#autoScan").waitFor({ state: "hidden" });
  assert(JSON.stringify(await savedSettings()) === JSON.stringify(original), "Opening and closing must never change settings");
  for (const name of ["switch", "senses", "play", "research", "credits"]) await openSettingsDetails(page, name);
  const unnamed = await page.locator("#settings input, #settings select").evaluateAll(nodes => nodes.filter(node => !node.labels?.length || ![...node.labels].some(label => label.textContent.trim())).map(node => node.id));
  assert(unnamed.length === 0, "Every control must have a readable label: " + unnamed.join(", "));
  assert(await page.locator("#settings input, #settings select").count() === 28, "All 28 settings must remain reachable");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 2, `Expanded settings must stay within the viewport, overflow ${overflow}px`);
  await page.locator("#fxLevel").selectOption("subtle");
  await page.locator("#speechEnabled").uncheck();
  await page.locator("#soundEnabled").uncheck();
  await page.locator("#largeText").uncheck();
  await page.locator("#hideVisualTasks").check();
  for (const [id, value] of [["scanInterval", "2200"], ["slotCycleMs", "4800"], ["craneSweepMs", "3200"]]) {
    await page.locator("#" + id).evaluate((node, next) => {
      node.value = next;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  }
  await page.locator("#rhythmBpm").selectOption("40");
  await page.locator("#rhythmTargetBeats").selectOption("10");
  await page.locator("#fishingLimitMs").selectOption("3000");
  await page.locator("#visualGuidance").uncheck();
  await page.locator("#craneAudioGuidance").check();
  const changed = await savedSettings();
  assert(changed.targetBeats === 10 && changed.craneSweepMs === 3200 && changed.fishingLimitMs === 3000, "Typed values and the targetBeats alias must save correctly");
  await page.locator("#difficultyMode").selectOption("measure");
  await page.locator("#settingsResearch > summary").click();
  assert((await page.locator("#settingsModeStatus").textContent()).includes("測定の回"), "Measurement status must remain visible with research collapsed");
  assert(await page.locator("#slotCycleMs").isDisabled(), "Measured settings must remain locked");
  await openSettingsDetails(page, "research");
  await page.locator("#readinessCheck").waitFor({ state: "visible" });
  await page.locator("#difficultyMode").selectOption("practice");
  assert(!(await page.locator("#slotCycleMs").isDisabled()), "Practice must unlock adjustments");
  assert(JSON.stringify(await savedSettings()) === JSON.stringify(changed), "Measurement mode must preserve the saved practice values");
  await page.reload();
  await waitForClass(page, "#startView", "is-active");
  const restored = await savedSettings();
  for (const key of Object.keys(changed)) {
    assert(JSON.stringify(restored[key]) === JSON.stringify(changed[key]), `Setting ${key} must survive reload: expected ${JSON.stringify(changed[key])}, got ${JSON.stringify(restored[key])}`);
  }
  await page.locator("#startStage").click();
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  for (const [id, expected] of [["fxLevel", "subtle"], ["scanInterval", "2200"]]) assert(await page.locator("#" + id).inputValue() === expected, "Restored UI value for " + id);
  assert(await page.locator("#settings details[open]").count() === 0, "Reload must collapse details without resetting values");
  assert(await page.locator("#supporterEditToggle").count() === 0, "The obsolete editing lock must be gone");
}

/**
 * 支援者の世界は輪全体を止める。評価ログ・設定とも帰り道は支援者のタップ。
 * 一瞬だけ枠が復活して消える事故も、class 変更を観測して拾う。
 */
async function assertSupporterScanStopped(page, view) {
  await waitForClass(page, `#${view}`, "is-active");
  await waitForText(page, "#scanState", "枠は止まっています");
  for (const id of ["toggleScan", "primarySwitch"]) {
    assert(await page.locator(`#${id}`).isDisabled(), `${view}: ${id} must be disabled`);
    assert(await page.locator(`#${id}`).getAttribute("aria-disabled") === "true", `${view}: ${id} must expose its disabled state`);
  }
  const savedState = await page.evaluate(() => JSON.stringify(localStorage));
  await page.evaluate(() => {
    document.activeElement?.blur(); // 通常のボタンの Enter 決定とは区別する。
    const probe = { focusAppeared: false, clicks: 0 };
    const observer = new MutationObserver((records) => {
      if (document.querySelector(".scan-focus") || records.some((r) => r.oldValue?.includes("scan-focus"))) {
        probe.focusAppeared = true;
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    const countClick = () => { probe.clicks += 1; };
    const surfaces = [document.querySelector(".tabbar"), document.querySelector(".view.is-active")];
    surfaces.forEach((surface) => surface.addEventListener("click", countClick));
    window.__supporterScanProbe = { probe, cleanup: () => {
      observer.disconnect();
      surfaces.forEach((surface) => surface.removeEventListener("click", countClick));
    } };
    // disabled のネイティブ抑止を迂回しても、エンジン自身が止めること。
    document.querySelector("#toggleScan").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const input = document.querySelector("#primarySwitch");
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, isPrimary: true, button: 0 }));
    input.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.dispatchEvent(new Event("resize")); // refresh() の入口も確認する。
  });
  for (let index = 0; index < 45; index += 1) {
    await page.keyboard.press("ArrowRight");
    assert(await page.locator(".scan-focus").count() === 0, `${view}: scan ring must be empty`);
  }
  for (const key of ["Space", "Enter", "a", "F8"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(170);
  }
  await page.waitForTimeout(1_900); // 既定の自動走査間隔を越えて待つ。
  const probe = await page.evaluate(() => {
    const { probe, cleanup } = window.__supporterScanProbe;
    cleanup();
    delete window.__supporterScanProbe;
    return probe;
  });
  assert(!probe.focusAppeared, `${view}: timer and manual inputs must never create a frame`);
  assert(probe.clicks === 0, `${view}: switch input must not activate any control`);
  assert(await page.locator(".scan-focus").count() === 0, `${view}: no frame may remain`);
  assert(await page.evaluate(() => JSON.stringify(localStorage)) === savedState, `${view}: switch input must not change saved state`);
  await waitForClass(page, `#${view}`, "is-active");
  await waitForText(page, "#scanState", "枠は止まっています");
}

async function assertHomeScanResumed(page) {
  assert(!(await page.locator("#homeReturn").isHidden()), "The supporter must still see the way back");
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForText(page, "#scanState", "枠が動いています");
  assert(await page.locator("#toggleScan").isEnabled(), "Home must re-enable the scan toggle");
  assert(await page.locator("#primarySwitch").isEnabled(), "Home must re-enable the switch");
  await page.waitForFunction(() => Boolean(document.querySelector("#homeView .scan-focus")));
  const first = await page.locator(".scan-focus").getAttribute("data-tile-id");
  await page.waitForFunction((id) => {
    const current = document.querySelector("#homeView .scan-focus");
    return current && current.getAttribute("data-tile-id") !== id;
  }, first);
}

async function checkSupporterMenuStaysOutOfTheScanRing(page) {
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#homeSupporterMenu").click();
  await assertSupporterScanStopped(page, "settings");
  await assertHomeScanResumed(page);
  await page.locator("#homeSupporterMenu").click();
  await page.locator('.tab[data-view="log"]').click();
  await assertSupporterScanStopped(page, "log");
  await assertHomeScanResumed(page);
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
  // 支援者メニューへ入った時点で自前走査は止まる（scan.js の
  // scanningIsOff()）。委譲を用意する画面そのものが、もう走っていない。
  await waitForText(page, "#scanState", "枠は止まっています");

  await openSettingsDetails(page, "switch");
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
  await waitForText(page, "#scanState", "枠は止まっています");
  assert((await page.locator(".scan-focus").count()) === 0, "Stopping app scan must clear its yellow focus");
  await mode.click();
  await page.waitForFunction(() => document.body.classList.contains("switch-control-mode"));
  await page.locator("#switchControlModeNotice").waitFor({ state: "visible" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await waitForText(page, "#scanState", "iPad で操作中");

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
  await waitForText(page, "#scanState", "iPad で操作中");

  // 手動ボタン・右矢印・自動タイマーのどの入口からも黄色い枠を復活させない。
  await page.evaluate(() => {
    document.querySelector("#toggleScan").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  await page.waitForTimeout(1_900);
  assert((await page.locator(".scan-focus").count()) === 0, "No app scan focus may survive in iPad mode");
  await waitForText(page, "#scanState", "iPad で操作中");

  // Reloaded start -> home also uses click-only input. Compare the exact home
  // choice order at full width and a 507px Split View approximation.
  await page.locator("#startStage").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#homeView", "is-active");
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await waitForActivityChoices(page, 9);
  const fullLayout = await collectActivityLayout(page, { checkScrollReach: true });
  const fullWidthTitles = fullLayout.titles;
  assert(
    fullLayout.pages.length === 1,
    `Delegated scanning must not hide choices behind a pager: ${JSON.stringify(fullLayout.pages)}`
  );
  assert(
    fullWidthTitles.length === 9,
    "Expected all nine home choices, got " + fullWidthTitles.join(", ")
  );

  await page.setViewportSize({ width: 507, height: 1194 });
  // Width breakpoints re-render the home list; wait until layout and bounding
  // boxes reflect the Split View dimensions before taking the snapshot.
  await page.waitForTimeout(200);
  const splitLayout = await collectActivityLayout(page, { checkScrollReach: true });
  const splitViewTitles = splitLayout.titles;
  assert(
    splitLayout.pages.length === 1,
    `Split View must not re-introduce a pager while delegating: ${JSON.stringify(splitLayout.pages)}`
  );
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
  // はじめの遊び（おすと でてくる）はレディ画面を挟まない。click-only の
  // ひと押しで、そのまま動物が出ること（Switch Control の入力で遊べること）を見る。
  await page.locator("#gameStageContent.module-pop .pop-prompt").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
  await page.locator("#gameStage").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await page.locator("#gameStageContent .pop-figure").waitFor({ state: "visible" });
  await page.locator("#gameExit").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#homeView", "is-active");
  await page.waitForFunction(() => !document.body.classList.contains("game-mode"));
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await page.waitForTimeout(400);
  assert((await page.locator(".scan-focus").count()) === 0, "Game return must not revive app scan");
  await waitForText(page, "#scanState", "iPad で操作中");

  // OS項目走査が送るclick-only入力相当で支援者画面へ戻れる。
  await page.locator("#homeSupporterMenu").evaluate((target) => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  });
  await waitForClass(page, "#settings", "is-active");

  // 2x2比較用に、モード中でも支援者がアプリTTSを明示的にONへ戻せる。
  await openSettingsDetails(page, "senses");
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
  await openSettingsDetails(page, "switch");
  await mode.click();
  await page.waitForFunction(() => !document.body.classList.contains("switch-control-mode"));
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  assert(!(await page.locator("#autoScan").isDisabled()), "Auto scan control must unlock after delegation ends");
  assert(!(await page.locator("#autoScan").isChecked()), "Auto scan must remain stopped until explicitly enabled");
  await page.locator("#autoScan").click();
  assert(await page.locator("#autoScan").isChecked(), "Explicit ON must take effect");
  // 設定画面では走査しないので、ここではまだ止まったまま。
  await waitForText(page, "#scanState", "枠は止まっています");

  // Safe operating instructions stop app scanning first, but the product
  // invariant must also survive an incorrect order. Exercise the actual UI
  // transition from a really running scan so the mode handler cannot become
  // a no-op. 走っている状態は支援者メニューでは作れないので、ホームで作る。
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForText(page, "#scanState", "枠が動いています");
  await page.waitForFunction(() => document.querySelectorAll(".scan-focus").length > 0);

  // 支援者メニューへ入るだけで、走っていた自前走査は止まり枠も消える。
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  await waitForText(page, "#scanState", "枠は止まっています");
  assert(
    (await page.locator(".scan-focus").count()) === 0,
    "Entering the supporter menu must clear the yellow focus"
  );

  // autoScan=true を保ったまま委譲へ切り替えても、ハンドラは no-op にならない。
  await openSettingsDetails(page, "switch");
  assert(await page.locator("#autoScan").isChecked(), "Auto scan must still be ON before forcing delegation");
  await mode.click();
  await page.waitForFunction(() => document.body.classList.contains("switch-control-mode"));
  assert(!(await page.locator("#autoScan").isChecked()), "Mode activation must force a running app scan off");
  assert(await page.locator("#autoScan").isDisabled(), "Forced delegation must lock the app scan control");
  assert((await page.locator(".scan-focus").count()) === 0, "Forced delegation must leave no yellow focus");
  await waitForText(page, "#scanState", "iPad で操作中");
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
  await waitForActivityChoices(page, 9);

  await openActivity(page, t("tile.slot-corner.title"));
  await waitForActivityChoices(page, 3);
  await openActivity(page, t("tile.slot-l1.title"));

  await waitForClass(page, "#gameView", "is-active");
  await page.waitForFunction(() => document.body.classList.contains("game-mode"));
  await page.locator(".tabbar").waitFor({ state: "hidden" });
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await assertNoSplitRuby(page, "slot-l1 how-to");

  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator(".slot-task[data-game-id='slot-l1']").waitFor({ state: "visible" });
  assert(
    (await page.locator(".slot-reel").count()) === 1,
    "slot-l1 must render exactly one reel"
  );

  // 6つの絵の一覧は、そくていの回にだけ出す（れんしゅうでは「リールの周りの
  // 余計なもの」として外した。docs/design-renewal-2026-09-25.md §1.5）。
  // 画像そのものは そくていの回で使うので、読み込めることは見ておく。
  const imageReady = await page.locator(".slot-symbol-guide img").evaluate(
    (image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  );
  assert(imageReady, "Generated six-symbol guide PNG must load in the actual game");
  assert(
    !(await page.locator(".slot-symbol-guide").isVisible()),
    "The six-symbol list must stay out of a practice run (nothing extra around the reel)"
  );

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
  const { SLOT_ENGINE_VERSION } = await import("../src/lib/games/slotJudge.js");
  assert(
    session?.engineVersion === SLOT_ENGINE_VERSION,
    `slot-l1 must persist the current engineVersion (${SLOT_ENGINE_VERSION})`
  );
  assert(session?.aborted === true && session?.finished === false, "Esc must persist an aborted partial slot session");
  assert(session?.trials?.length === 1, "One accepted L1 input must produce exactly one stop row");
  assert(session?.config?.reelCount === 1, "slot-l1 must persist reelCount=1");
}

/**
 * slot-v1 L2 の逐次停止を最後まで通す。各入力後の保存件数と active reel を
 * 1件ずつ追い、1入力が2本以上を止めないこと、左→右、ラウンド遷移、
 * 300msガード、完了結果のすべてを実ブラウザで固定する。
 */
/**
 * れんしゅうの回のリールは、画面いっぱいに出て、どの画面でもはみ出さない。
 *
 * 利用者側から「スロットとかのゲームを画面全部に見えるように」と言われた
 * （2026-09-28）。直す前は、iPad の横向きでリール（ひとつ）が画面の 34%×55% しか
 * 使っておらず、スマホの横向きではリールの下が切れ、縦向きでは3本がはみ出して
 * スクロールが要った。1コマの高さを、リールの入る場所の縦横に収まるいちばん
 * 大きい値にした（theme-hakkiri.css、engineVersion 4）。
 *
 * 見ること: リールの面がスクロールしない・どのリールも画面の中・3本の窓を
 * 合わせた大きさが、画面の縦か横のどちらかをほとんど使い切っている。
 */
async function checkPracticeReelsFillTheScreen(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  for (const [tileKey, reels] of [["tile.slot-l2.title", 3], ["tile.slot-l1.title", 1]]) {
    await openActivity(page, t("tile.slot-corner.title"));
    await waitForActivityChoices(page, 3);
    await openActivity(page, t(tileKey));
    await waitForClass(page, "#gameView", "is-active");
    await page.locator(".game-ready").waitFor({ state: "visible" });
    await page.locator("#gameStage").click();
    await page.locator(".game-ready").waitFor({ state: "detached" });
    await page.locator(".slot-task[data-difficulty-mode='practice']").waitFor({ state: "visible" });
    await page.waitForTimeout(150);
    const fit = await page.evaluate(() => {
      const stage = document.querySelector("#gameStageContent");
      const windows = [...document.querySelectorAll(".slot-reel-window")].map((el) => el.getBoundingClientRect());
      const reels = [...document.querySelectorAll(".slot-reel")].map((el) => el.getBoundingClientRect());
      const left = Math.min(...windows.map((r) => r.left));
      const right = Math.max(...windows.map((r) => r.right));
      const top = Math.min(...windows.map((r) => r.top));
      const bottom = Math.max(...windows.map((r) => r.bottom));
      return {
        supportsContainerUnits: CSS.supports("height", "1cqh"),
        scrolls: stage.scrollHeight > stage.clientHeight + 1 || stage.scrollWidth > stage.clientWidth + 1,
        outside: reels.filter((r) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).length,
        usedWidth: (right - left) / innerWidth,
        usedHeight: (bottom - top) / innerHeight,
        count: windows.length,
      };
    });
    if (!fit.supportsContainerUnits) return SKIPPED;
    assert(fit.count === reels, `Expected ${reels} reel(s), found ${fit.count}`);
    assert(!fit.scrolls, "The practice reels must fit the screen without scrolling");
    assert(fit.outside === 0, `${fit.outside} reel(s) spill off the screen`);
    // 縦か横のどちらかを、ほとんど使い切っている（余白ばかりの小さなリールにしない）。
    assert(
      fit.usedHeight >= 0.5 || fit.usedWidth >= 0.7,
      `The practice reels must fill the screen, used ${Math.round(fit.usedWidth * 100)}% x ${Math.round(fit.usedHeight * 100)}%`
    );
    await page.locator("#gameExit").click();
    await waitForClass(page, "#homeView", "is-active");
  }
}

/**
 * そくていの回のリールは、決まった大きさ（1コマ 94px、幅 620px 以下は 82px）で出し、
 * 画面に入りきらないときだけ縮めて収める（games/slotFit.js、engineVersion 5）。
 *
 * 直す前は、入りきらない分が上下へはみ出し、上の分はスクロールしても戻せなかった
 * （2026-09-28 に実測: スマホの横向きで目標の札が丸ごと画面の外、縦向きで札が
 * 上の帯の裏）。
 *
 * 見ること: 目標の札・ことば・リール・6つの絵が、どれも画面の中にあって上の帯の
 * 裏に入っていない / 収めたときはスクロールしない / 収めていないときの1コマは
 * 決まった大きさのまま（iPad などの見え方を変えていない）/ 収めたときも決まった
 * 大きさより大きくしない / 画面に出した1コマの高さが回の記録と、止めた1回ごとの
 * 記録に残る。
 */
async function checkMeasuredReelsStayOnScreen(page) {
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    saved.settings = { ...(saved.settings || {}), difficultyMode: "measure" };
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  for (const tileKey of ["tile.slot-l2.title", "tile.slot-l1.title"]) {
    await openActivity(page, t("tile.slot-corner.title"));
    await waitForActivityChoices(page, 3);
    await openActivity(page, t(tileKey));
    await waitForClass(page, "#gameView", "is-active");
    await page.locator(".game-ready").waitFor({ state: "visible" });
    await page.locator("#gameStage").click();
    await page.locator(".game-ready").waitFor({ state: "detached" });
    await page.locator(".slot-task[data-difficulty-mode='measure']").waitFor({ state: "visible" });
    await page.waitForTimeout(150);
    const seen = await page.evaluate((key) => {
      const stage = document.querySelector("#gameStageContent");
      const bars = [...document.querySelectorAll(".game-progress, .game-actions > :not([hidden])")]
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.width > 0 && b.height > 0);
      const parts = [".slot-target", ".slot-status", ".slot-reel", ".slot-symbol-guide"]
        .flatMap((selector) => [...document.querySelectorAll(selector)])
        .map((el) => ({ name: el.className, b: el.getBoundingClientRect() }))
        .filter(({ b }) => b.width > 0 && b.height > 0);
      const outside = parts.filter(({ b }) => b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1);
      const underBar = parts.filter(({ b }) =>
        bars.some((bar) => b.left < bar.right - 1 && bar.left < b.right - 1 && b.top < bar.bottom - 1 && bar.top < b.bottom - 1)
      );
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      const session = (saved.sessions || []).filter((item) => item.taskType === "slot").at(-1);
      return {
        supportsContainerUnits: CSS.supports("height", "1cqh"),
        fitted: stage.classList.contains("is-fitted"),
        scrolls: stage.scrollHeight > stage.clientHeight + 1 || stage.scrollWidth > stage.clientWidth + 1,
        outside: outside.map(({ name }) => name),
        underBar: underBar.map(({ name }) => name),
        cell: document.querySelector(".slot-reel-window").getBoundingClientRect().height / 3,
        fixedCell: innerWidth <= 620 ? 82 : 94,
        recordedCellPx: session?.config?.reelCellPx ?? null,
      };
    }, storageKey);
    if (!seen.supportsContainerUnits) return SKIPPED;
    assert(seen.outside.length === 0, `Measured reels: ${seen.outside.join(", ")} must stay on the screen`);
    assert(seen.underBar.length === 0, `Measured reels: ${seen.underBar.join(", ")} must not hide under the top bar`);
    if (seen.fitted) {
      assert(!seen.scrolls, "The fitted measured reels must not need scrolling");
      assert(seen.cell <= seen.fixedCell + 0.5, `A fitted reel cell must never grow past ${seen.fixedCell}px, got ${seen.cell}`);
    } else {
      assert(Math.abs(seen.cell - seen.fixedCell) < 0.5, `Where the reels fit, the cell must stay ${seen.fixedCell}px, got ${seen.cell}`);
    }
    assert(
      typeof seen.recordedCellPx === "number" && Math.abs(seen.recordedCellPx - seen.cell) <= 0.1,
      `The run must record the shown cell size (${seen.cell}), got ${JSON.stringify(seen.recordedCellPx)}`
    );
    // 止めた1回ごとにも、そのとき出ていた大きさが残る（途中で向きを変えると変わる）。
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
    const stopped = await page.waitForFunction(
      (key) => {
        const saved = JSON.parse(localStorage.getItem(key) || "{}");
        const session = (saved.sessions || []).filter((item) => item.taskType === "slot").at(-1);
        return session?.trials?.length ? session.trials.at(-1).reelCellPx ?? "missing" : null;
      },
      storageKey,
      { timeout: 4000 }
    );
    const trialCellPx = await stopped.jsonValue();
    assert(
      typeof trialCellPx === "number" && Math.abs(trialCellPx - seen.cell) <= 0.1,
      `Each stop must record the shown cell size (${seen.cell}), got ${JSON.stringify(trialCellPx)}`
    );
    await page.locator("#gameExit").click();
    await waitForClass(page, "#homeView", "is-active");
  }
}

async function checkSlotSequentialFlow(page) {
  await waitForClass(page, "#startView", "is-active");
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);

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
  // 利用者に見えるのは一言と「何回のうち何回」。数値の表（.slot-result）は
  // 支援者むけに畳んである（docs/design-renewal-2026-09-25.md §1.6）。
  await page.locator("#resultStats .hk-result").waitFor({ state: "visible" });
  await page.locator("#resultStats .result-details .slot-result").waitFor({ state: "attached" });
  assert(
    !(await page.locator("#resultStats .result-details").evaluate((details) => details.open)),
    "The supporter's numbers must start folded on the child's result screen"
  );

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
  await waitForActivityChoices(page, 9);

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
  await openSettingsDetails(page, "research");
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

// 畳まれた設定は、支援者と同じく見出しから開く。値に影響せず複数開ける。
async function openSettingsDetails(page, name) {
  const ids = { switch: "settingsSwitch", senses: "settingsSenses", play: "settingsPlay", research: "settingsResearch", credits: "soundCredits" };
  const details = page.locator("#" + ids[name]);
  if (!(await details.evaluate(node => node.open))) await details.locator(":scope > summary").click();
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
  await waitForActivityChoices(page, 9);

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
        // 読み上げは切っておく。読み上げはアプリに入れた声（声のパック）を
        // createBufferSource で鳴らすので、効果音と同じ数え方に入ってしまう。
        // 読み上げは「声で読み上げる」の設定で切るもので、効果音の設定とは別。
        value: JSON.stringify({
          version: 3,
          settings: { soundEnabled, speechEnabled: false, craneTargetTrials: 3, craneSweepMs: 800 },
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
        // 結果の4通り: つかんだ／おしい！すべった／もう すこし！（外れ。以前は
        // 「届かなかった」）／取れた。ふりがなも textContent に入るので、かなで見る。
        return /つかんだ|すべった|すこし|とれた/.test(status);
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
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // 支援者が文字を打つ欄は、いまは評価ログの参加者IDだけ（観察メモは
  // 効果測定セッションごと別紙へ移した。2026-08-29）。評価ログも支援者の世界
  // なので、ドックは最初から出ていない（走査を動かさない。2026-09-30）。
  // 打っている最中も、打ち終えたあとも出てこないこと。
  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  await page.locator("#participantId").focus();
  await page.locator(".switch-dock").waitFor({ state: "hidden" });
  await page.locator("#participantId").evaluate((el) => el.blur());
  await page.waitForTimeout(150);
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // 利用者の世界へ戻ったら、支援者の世界の印（ドックを隠す class）は外れる。
  // ドックを出すかどうかは、利用者の世界の決まり（画面の「おす」ボタンの設定）に戻る。
  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  assert(
    !(await page.evaluate(() => document.body.classList.contains("supporter-menu-mode"))),
    "ホームへ戻ったら supporter-menu-mode は外れる"
  );
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
    ["matching", t("tile.matching.title")],
    ["voca", t("tile.voca.title")],
    ["letters", t("tile.letters.title")],
  ];
  for (const [target, name] of activityTargets) {
    await openActivity(page, "学ぶ・伝える");
    await openActivity(page, name);
    await waitForClass(page, `#${target}`, "is-active");
    await page.locator("#homeReturn").click();
    await waitForClass(page, "#homeView", "is-active");
  }

  // 支援者タブは評価ログと設定。旧研究者タブは削除済み。
  await page.locator("#homeSupporterMenu").click();
  await waitForClass(page, "#settings", "is-active");
  const tabTargets = ["log", "settings"];
  for (const target of tabTargets) {
    await page.locator(`.tab[data-view="${target}"]`).click();
    await waitForClass(page, `#${target}`, "is-active");
  }
}

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
  await openSettingsDetails(page, "research");
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

  // 支援者の世界では、研究者モードを入れても走査は再開しない。

  // researcherMode は設定の面（そくてい）の出し分けに使う。効果測定・操作訓練・
  // 研究の3タブは 2026-08-29 に削除したので、ここで確かめるのは「支援者の
  // データ画面が評価ログ1枚にまとまっていること」。
  await openSettingsDetails(page, "research");
  await page.locator("#researcherMode").click();
  await page.waitForFunction(() => document.body.classList.contains("researcher-mode"));

  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");
  await assertSupporterScanStopped(page, "log");
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
  await openSettingsDetails(page, "research");
  await page.locator("#researcherMode").waitFor({ state: "visible" });
  await assertSupporterScanStopped(page, "settings");
  // ホームに出す遊びは、常設の「よく使う設定」で調整する。
  await openSettingsDetails(page, "switch");
  await page.locator("#hideVisualTasks").click();

  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 7);
  // 1ページだけ見て判定すると、ページ分割の入る画面では「2ページ目に居る」
  // だけの項目を「隠れている」と読んでしまう。全ページを巡って確かめる。
  const lobbyTitles = await collectActivityTitles(page);
  assert(
    !lobbyTitles.includes("アームで つかむ"),
    `Visual-task setting must remove the claw corner from the lobby (saw: ${lobbyTitles.join(", ")})`
  );
  assert(
    lobbyTitles.length === 7,
    `Expected seven remaining activities after hiding the claw, got ${lobbyTitles.length}`
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

  // 利用者の画面には、既定で「走査停止」「入力」のドックを出さない
  // （docs/design-renewal-2026-09-25.md §3.5。打ち合わせで名指しされた
  // 分からない言葉・余計なボタンだった）。スイッチ機器とタイルの直接タップは
  // ドックが無くても使える。
  await page.locator(".switch-dock").waitFor({ state: "hidden" });

  // 画面をスイッチ代わりに使う人のために、設定で「おす」だけを出せる。
  // 出しても「走査停止」は出さない（止めたいのは支援者で、設定の自動走査がする）。
  await enableScreenSwitch(page);
  await page.locator("#startStage").click();
  await waitForClass(page, "#homeView", "is-active");
  await page.locator("#primarySwitch").waitFor({ state: "visible" });
  await page.locator("#toggleScan").waitFor({ state: "hidden" });
  assert(
    ((await page.locator("#primarySwitchLabel").textContent()) || "").trim() === "おす",
    "The on-screen switch must speak the user's word, not 入力"
  );
}

/** 利用者の画面に「おす」ボタン（画面のスイッチ）を出す設定を入れて読み直す。 */
async function enableScreenSwitch(page) {
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    saved.settings = { ...(saved.settings || {}), showScreenSwitch: true };
    localStorage.setItem(key, JSON.stringify(saved));
  }, storageKey);
  await page.reload();
  await waitForClass(page, "#startView", "is-active");
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
      const controls = [...document.querySelectorAll("button, select, input, summary, [data-scan]")].filter(
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
  await assertNoSplitRuby(page, "home");

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

  await openSettingsDetails(page, "research");
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
  // 見え方と声の詳細を見出しから開く。
  await openSettingsDetails(page, "senses");
  const ensureChecked = async (id) => {
    const box = page.locator(`#${id}`);
    if (!(await box.isChecked())) await box.click();
    assert(await box.isChecked(), `Expected #${id} to be on for this check`);
  };
  await ensureChecked("largeText");
  await ensureChecked("highContrast");

  await page.locator("#homeReturn").click();
  await waitForClass(page, "#homeView", "is-active");
  await waitForActivityChoices(page, 9);
  const homeLayout = await collectActivityLayout(page, { checkViewport: true });
  assert(
    homeLayout.titles.length === 9,
    "Expected all nine accessible home choices, got " + homeLayout.titles.join(", ")
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
    const dockEl = document.querySelector(".switch-dock");
    // ドックは利用者の画面では既定で出ない。出ていなければ画面の下端が限界
    // （アプリ側の判定 views/home.js の listOverflowsDock と同じ規則）。
    const dockShown = dockEl && getComputedStyle(dockEl).display !== "none";
    const bottoms = rows.map((row) => row.getBoundingClientRect().bottom);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rowWritingModes: rows.map((row) => getComputedStyle(row).writingMode),
      lastBottom: bottoms.length ? Math.max(...bottoms) : null,
      dockTop: dockShown ? dockEl.getBoundingClientRect().top : window.innerHeight,
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
      // 遊びのタイルは「札（難しさ）＋説明」の2つを describedby に持つ
      // （views/home.js）。説明はそのうちの tile-description。
      const describedIds = (tile.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      const description =
        describedIds
          .map((id) => document.getElementById(id))
          .find((element) => element?.classList.contains("tile-description")) || null;
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
        isHero: tile.dataset.hkSlot === "hero",
        badgeVisible: (() => {
          const badge = tile.querySelector(".hk-tile-badge");
          return badge ? badge.getBoundingClientRect().width > 2 : null;
        })(),
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
  // デザイン「はっきりした色」（docs/design-renewal-2026-09-25.md §2.1）:
  // 絵と名前と難しさの札で選ぶ。説明文を画面に出すのは、いちばん簡単な
  // 大きな1番だけ——小さいタイルまで文を並べると、打ち合わせで言われた
  // 「文字が多くて難しそう」に戻る。説明は全タイルで読み上げに乗る。
  // 行の高さの上限（旧 200px）は外した。グリッドは画面の高さに合わせて
  // タイルが伸びるので、守るのは下の「最後の項目まで画面に届く」のほう。
  tileNaming.forEach((tile) => {
    assert(tile.name === tile.heading, `Tile "${tile.name}" name must stay the short heading, got "${tile.heading}"`);
    assert(tile.description.length > 0, `Tile "${tile.name}" must expose its description to AT`);
    if (tile.isHero) {
      assert(
        tile.descriptionIsVisible,
        `The first (easiest) tile "${tile.name}" must show its description on screen`
      );
    }
    if (tile.badgeVisible !== null) {
      assert(tile.badgeVisible, `Tile "${tile.name}" must show how hard it is (its level badge) on screen`);
    }
    if (tile.descriptionIsVisible) {
      assert(
        tile.descriptionFontPx < tile.headingFontPx,
        `Tile "${tile.name}" description must stay subordinate to the heading ` +
          `(description ${tile.descriptionFontPx}px vs heading ${tile.headingFontPx}px)`
      );
    }
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
async function collectActivityLayout(page, { checkViewport = false, checkScrollReach = false } = {}) {
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
    if (checkScrollReach) {
      // iPad Switch Control へ委譲しているあいだは、一覧をページに分けない
      // （src/lib/scanPaging.js）。分けると、載っていない項目がDOMから消えて
      // OSの項目走査から初めから見えなくなるほうが重いため。そのぶん一覧は
      // 画面より縦に長くなりうるので、ここで見る条件は「最初から画面内に
      // 居る」ではなく「届く」になる:
      //   - スクロールすれば全体が画面に入る（OS走査は自分で運ぶ）
      //   - 運んだ先で何にも覆われていない（自前走査のときドックの裏へ
      //     隠れていたのが、そもそもページ分割を入れた理由だった）
      // 委譲していないときの条件は checkViewport のまま変えない。利用者は
      // 自前走査のスクロールを止めることも戻すこともできない。
      const unreachable = await page.evaluate(() => {
        const startY = window.scrollY;
        const bad = [];
        for (const control of document.querySelectorAll("#gameTileGrid .game-tile")) {
          control.scrollIntoView({ block: "nearest" });
          const rect = control.getBoundingClientRect();
          const name = control.getAttribute("aria-label") || control.textContent.trim();
          if (rect.width <= 0 || rect.height <= 0) {
            bad.push(`${name}: no box`);
            continue;
          }
          if (rect.top < -1 || rect.bottom > window.innerHeight + 1) {
            bad.push(`${name}: still off-screen after scrolling`);
            continue;
          }
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!hit || !(hit === control || control.contains(hit))) {
            bad.push(`${name}: covered by ${hit ? hit.id || hit.className : "nothing hittable"}`);
          }
        }
        window.scrollTo(0, startY);
        return bad;
      });
      assert(
        unreachable.length === 0,
        `Delegated scanning cannot reach every activity: ${unreachable.join("; ")}`
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

/**
 * ふりがな（ruby）が flex / grid の子としてばらけていないこと。
 *
 * flex の中に ruby と字がじかに並ぶと、1つずつが別の箱になり、gap のぶん
 * 「上 の 目標 の 絵 を 見 ます」と字のあいだが空く（折り返しも語の途中で起きる）。
 * 総ルビ（i18n.js）にしてから、「やりかた」の手順とけっかのボタンで起きていた。
 */
async function assertNoSplitRuby(page, where) {
  const split = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll("ruby").forEach((ruby) => {
      const parent = ruby.parentElement;
      if (!parent || parent.getClientRects().length === 0) return;
      if (!/flex|grid/.test(getComputedStyle(parent).display)) return;
      const others = [...parent.childNodes].filter(
        (node) => node !== ruby && (node.nodeType === 1 ? node.tagName !== "RT" : node.textContent.trim())
      );
      if (others.length) found.push(parent.id || parent.className || parent.tagName);
    });
    return [...new Set(found)];
  });
  assert(split.length === 0, `${where}: furigana is split apart by a flex/grid parent — ${split.join(", ")}`);
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

async function openSupporterLog(page) {
  await page.locator("#homeSupporterMenu").click();
  await page.locator('.tab[data-view="log"]').click();
  await waitForClass(page, "#log", "is-active");
}

async function checkBackupRevision(page) {
  await page.locator("#startStage").click();
  await openSupporterLog(page);
  await page.locator("#participantId").fill("P:01/test");
  const download = page.waitForEvent("download");
  await page.locator("#exportRawJson").click();
  await download;
  await page.locator("#homeReturn").click();
  await openActivity(page, t("tile.color-legacy.title"));
  await page.waitForTimeout(200);
  await page.locator("#gameStage").click();
  await page.keyboard.press("Escape");
  await openSupporterLog(page);
  const count = await readLogCount(page);
  assert(count > 0, "The new game must add records");
  let dialogs = 0;
  page.on("dialog", dialog => { dialogs++; return dialog.accept(); });
  await page.locator("#handOverParticipant").click();
  assert(dialogs === 0, "New records must require another export before confirmation");
  assert(await readLogCount(page) === count, "Unexported records were deleted");
  await page.locator("#clearLog").click();
  assert(dialogs === 0, "Log deletion also requires a current export");
  await page.locator("#exportCsv").click();
  await page.locator("#clearLog").click();
  assert(dialogs === 1, "Current log CSV permits clearing only the logs");
}

async function checkStorageRecovery(page) {
  for (const name of ["QuotaExceededError", "SecurityError"]) {
    await page.evaluate(({key, name}) => {
      const state = JSON.parse(localStorage.getItem(key));
      state.settings.speechEnabled = false;
      localStorage.setItem(key, JSON.stringify(state));
    }, {key: storageKey, name});
    await page.reload();
    await page.evaluate(name => {
      const original = Storage.prototype.setItem;
      window.__storageBlocked = true;
      Storage.prototype.setItem = function(...args) {
        if (window.__storageBlocked) throw new DOMException("test storage failure", name);
        return original.apply(this, args);
      };
    }, name);
    await page.locator("#startStage").click();
    await page.locator("#storageWarning").waitFor({state: "visible"});
    await page.waitForTimeout(6200);
    assert(await page.locator("#storageWarning").isVisible(), "Warning must survive normal notices");
    await openActivity(page, t("tile.color-legacy.title"));
    assert(await page.locator("#storageWarning").isHidden(), "Warning must not cover a game");
    for (let i=0; i<BEGINNER_TARGET_PRESSES; i++) {
      await page.waitForTimeout(200);
      await page.locator("#gameStage").click();
    }
    await waitForClass(page, "#resultView", "is-active");
    await page.locator("#storageWarning").waitFor({state: "visible"});
    await page.evaluate(() => {
      const original = URL.createObjectURL;
      URL.createObjectURL = blob => { window.__recoveryBlob = blob; return original(blob); };
    });
    const downloaded = page.waitForEvent("download");
    await page.locator("#storageExport").click();
    await downloaded;
    const payload = await page.evaluate(async () => JSON.parse(await window.__recoveryBlob.text()));
    assert(payload.state.logs.some(log => log.view === "game"), "Unsaved game records must be recoverable");
    await page.evaluate(() => { window.__storageBlocked = false; });
    await page.locator("#storageRetry").click();
    assert(await page.locator("#storageWarning").isHidden(), "Successful save clears the warning");
    assert((await readLogCount(page)) === payload.state.logs.length, "Recovered state must be persisted");
  }
}

async function checkDoubleVoiceFailure(page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (url, ...args) => /\.bin(?:\?|$)/.test(String(url))
      ? Promise.reject(new Error("test voice pack unavailable")) : nativeFetch(url, ...args);
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
  });
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    state.settings.speechEnabled = true;
    state.settings.speechVoice = "app";
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await page.locator("#startStage").click();
  await openActivity(page, t("tile.slot-corner.title"));
  await openActivity(page, t("tile.slot-l1.title"));
  await page.locator(".game-ready").waitFor({state:"visible"});
  await page.waitForFunction(text => document.querySelector("#liveRegion").textContent.includes(text), t("howto.slot-l1.1"));
}

async function checkExportFileName(page) {
  await page.locator("#startStage").click();
  await openSupporterLog(page);
  await page.locator("#participantId").fill("P:01/test");
  const download = page.waitForEvent("download");
  await page.locator("#exportRawJson").click();
  const file = await download;
  assert(/^neuronode-raw-P_01_test-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(file.suggestedFilename()),
    `Participant and time missing: ${file.suggestedFilename()}`);
}

// スイッチ1つの利用者と同じ手順で、目的のものまで枠を送って選ぶ。
// ホームがページに分かれる画面（スマホ横など）では、目的のタイルが今のページに
// 無いあいだは「つぎ」（scan-next-page）を選んでページを送る——利用者もそうする。
async function scanTo(page, selector) {
  for (let i = 0; i < 160; i++) {
    if (await page.locator(selector + ".scan-focus").count()) {
      await page.keyboard.press("Space");
      await page.clock.runFor(200);
      return;
    }
    const onThisPage = await page.locator(selector).count();
    if (!onThisPage && (await page.locator('[data-tile-id="scan-next-page"].scan-focus').count())) {
      await page.keyboard.press("Space");
      await page.clock.runFor(200);
      continue;
    }
    await page.clock.runFor(800);
  }
  assert(false, `Single-switch scan cannot reach ${selector}`);
}

async function checkSwitchEndlessExit(page) {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now()+1000));
  for (const game of ["crane", "fishing"]) {
    await page.evaluate(key => {
      const state = JSON.parse(localStorage.getItem(key));
      state.settings.autoScan = true;
      state.settings.scanInterval = 800;
      state.settings.speechEnabled = false;
      state.settings.difficultyMode = "practice";
      localStorage.setItem(key, JSON.stringify(state));
    }, storageKey);
    await page.reload();
    await page.keyboard.press("Space");
    await page.clock.runFor(500);
    await scanTo(page, `[data-tile-id="${game}-corner"]`);
    await scanTo(page, `[data-tile-id="${game}-endless"]`);
    await page.keyboard.press("Space");
    if (await page.locator(".game-unavailable").count()) {
      await page.clock.runFor(200);
      await page.keyboard.press("Space");
      await page.clock.runFor(200);
      assert(await page.locator("#homeView.is-active").count() === 1, "Unavailable endless fishing returns with one switch");
      continue;
    }
    await page.clock.runFor(21_000);
    if (game === "fishing" && await page.locator("#resultView.is-active").count()) {
      // アタリを見送った場合は既存のfailure終了から結果へ進む。そこも1スイッチで抜ける。
      await scanTo(page, "#resultHome");
    } else {
      assert(await page.locator("#gameSwitchMenu").isVisible(), `${game} needs an exit choice`);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
      const run = saved.sessions.filter(s => s.gameId === game).at(-1);
      assert(run?.endReason === "manual", "Waiting uses the existing manual end record");
      if (game === "crane") {
        await scanTo(page, "#gameSwitchAgain");
        assert(await page.locator(".game-ready").isVisible(), "Again starts a new ready screen");
        await page.keyboard.press("Space");
        await page.clock.runFor(21_000);
      }
      await scanTo(page, "#gameSwitchEnd");
    }
    assert(await page.locator("#homeView.is-active").count() === 1, "One switch returns home");
  }
}

async function checkSwitchUnavailableExit(page) {
  await page.addInitScript(() => {
    const NativeAudio = window.AudioContext || window.webkitAudioContext;
    if (sessionStorage.getItem("audio-fault") === "suspended" && NativeAudio) {
      window.AudioContext = class extends NativeAudio {
        get state() { return "suspended"; }
        resume() { return Promise.resolve(); }
      };
      window.webkitAudioContext = window.AudioContext;
    } else {
      window.AudioContext = undefined;
      window.webkitAudioContext = undefined;
    }
  });
  for (const fault of ["missing", "suspended"]) for (const game of ["fishing", "gonogo"]) {
    await page.evaluate(fault => sessionStorage.setItem("audio-fault", fault), fault);
    await page.reload();
    await page.keyboard.press("Space");
    if (game === "fishing") await openActivity(page, t("tile.fishing-corner.title"));
    await openActivity(page, t(`tile.${game}.title`));
    await page.waitForTimeout(180);
    await page.keyboard.press("Space");
    await page.locator(".game-unavailable").waitFor({state:"visible"});
    await page.waitForTimeout(180);
    await page.keyboard.press("Space");
    await waitForClass(page, "#homeView", "is-active");
    const count = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions.length, storageKey);
    assert(count === 0, "Unavailable audio must not create a measurement session");
  }
}
