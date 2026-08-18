// =====================================================================
// capture-screens.mjs — 主要画面を実寸で撮って artifacts/screens/ へ出す
//
// なぜ要るか: 実機（iPad + NeuroNode）が常に手元にあるとは限らず、
// 見た目の確認が CI しかできない期間がある。ビルドとテストが緑でも
// 「画面がどう見えるか」は分からない——余白の破綻、文字の折り返し、
// 暗すぎる対象物は、どれもテストを通り抜ける。
//
// GitHub Actions からこれを走らせて成果物として上げておくと、push のたびに
// 3つの実寸（iPad縦・スマホ縦・スマホ横）の画面が残る。
//
// テストではないので、失敗しても CI 全体は落とさない（撮れなかったことは
// ログに出す）。判定は tests/ 側の仕事で、ここは目で見るための材料を作る。
//
//   node scripts/capture-screens.mjs [出力先]
// =====================================================================

import { chromium, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const outDir = process.argv[2] || "artifacts/screens";
const basePath = "/neuro-screens/";
mkdirSync(outDir, { recursive: true });

const port = await findAvailablePort();
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, BASE_PATH: basePath },
});
server.stderr.on("data", (data) => process.stderr.write(data));

const STORAGE_KEY = "neuronode-prototype-state-v3";

/** 実寸。名前はファイル名になるので、あとから見て分かるものにする。 */
const VIEWPORTS = [
  { name: "ipad-portrait", viewport: { width: 834, height: 1194 } },
  { name: "phone-portrait", viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true },
  { name: "phone-landscape", viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
];

let captured = 0;
let failed = 0;

try {
  await waitForServer();
  for (const target of VIEWPORTS) {
    await captureLayoutScreens(target);
  }
  // リズムとリザルトは AudioContext の時計で拍を進めるので、
  // ヘッドレス WebKit（AudioContext を持たない）では撮れない。
  await captureRhythmScreens();
} finally {
  server.kill("SIGTERM");
}

console.log(`\n${captured} screenshot(s) written to ${outDir}${failed ? `, ${failed} failed` : ""}`);

// 1枚も撮れなかったら、それは「材料が作れなかった」ということ。
//
// もとは常に 0 を返していたので、全滅しても CI のログは成功に見えた
// （`continue-on-error` と合わせると、失敗が完全に隠れる）。判定はしない
// 道具だが、動いたかどうかは正直に返す必要がある。
if (captured === 0) {
  console.error("No screenshots were produced — the capture step did not run.");
  process.exit(1);
}
// 一部だけ失敗した場合は 0 で返す。判定用ではないので、撮れたぶんだけでも
// 残しておくほうが、実機の無い期間には役に立つ。
process.exit(0);

/** 音の要らない画面（レイアウト確認が主目的）。iOS Safari に近い WebKit で撮る。 */
async function captureLayoutScreens(target) {
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({ ...target, deviceScaleFactor: 2 });
    await seed(context, { researcherMode: true });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForTimeout(500);
    await shot(page, target.name, "01-start");

    await page.locator("#startStage").click();
    await page.waitForTimeout(400);
    await shot(page, target.name, "02-home");

    if (await openActivity(page, "アームを とめる")) {
      await page.waitForTimeout(700);
      await page.locator("#gameStage").click();
      await page.waitForTimeout(1400);
      await shot(page, target.name, "03-crane");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    if ((await openActivity(page, "さかなつり")) && (await openActivity(page, "アタリで つる"))) {
      await page.waitForTimeout(800);
      await page.locator("#gameStage").click();
      await page.waitForTimeout(1000);
      await shot(page, target.name, "04-fishing");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    await page.locator("#homeSupporterMenu").click();
    await page.waitForTimeout(400);
    await shot(page, target.name, "05-settings");

    for (const [view, label] of [
      ["log", "06-log"],
      ["research", "07-research"],
      ["evaluation", "08-evaluation"],
    ]) {
      await page.locator(`.tab[data-view="${view}"]`).click();
      await page.waitForTimeout(450);
      await shot(page, target.name, label);
    }
    await context.close();
  } catch (error) {
    failed += 1;
    console.error(`failed to capture ${target.name}:`, error.message);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * リズムとそのリザルト。手がかりを出す条件で撮る（目盛りが見える版面）。
 * 撮影時間を詰めるため、支援者が設定できる範囲でテンポを上げ拍数を減らす。
 */
async function captureRhythmScreens() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 834, height: 1194 },
      deviceScaleFactor: 2,
    });
    await seed(context, { visualGuidance: true, rhythmBpm: 80, targetBeats: 5 });
    const page = await context.newPage();
    await page.goto(baseUrl);
    await page.waitForTimeout(500);
    await page.locator("#startStage").click();
    await page.waitForTimeout(300);
    if (!(await openActivity(page, "リズム"))) return;
    if (!(await openActivity(page, "リズム れんしゅう"))) return;
    await page.waitForTimeout(700);
    await shot(page, "ipad-portrait", "09-rhythm-ready");
    await page.locator("#gameStage").click();

    // bpm 80 → 拍間隔 750ms、カウントイン3拍、試行周期 (3+1.5)*750 = 3375ms。
    // n 回目の押しどころは n*3375 + 2250 ms。毎回ちがうずれで押す。
    const started = Date.now();
    const jitter = [-180, 90, -40, 240, 20];
    for (let index = 0; index < jitter.length; index += 1) {
      const wait = index * 3375 + 2250 + jitter[index] - (Date.now() - started);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.locator("#gameStage").click({ position: { x: 417, y: 300 } });
      if (index === 3) await shot(page, "ipad-portrait", "10-rhythm");
    }
    await page.locator("#resultView.is-active").waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, "ipad-portrait", "11-result");
    await context.close();
  } catch (error) {
    failed += 1;
    console.error("failed to capture rhythm screens:", error.message);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function seed(context, settings) {
  await context.addInitScript(
    ({ key, value }) => {
      localStorage.clear();
      localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify({ version: 3, settings }) }
  );
}

/**
 * 選択肢を名前で開く。画面が短いと一覧はページに分かれるので
 * （src/lib/scanPaging.js）、実際の利用者と同じく「つぎの ページ」を辿る。
 */
async function openActivity(page, name) {
  for (let hop = 0; hop < 6; hop += 1) {
    const target = page.getByRole("button", { name, exact: true });
    if ((await target.count()) > 0) {
      await target.click();
      return true;
    }
    const pager = page.locator(".game-tile.scan-pager");
    if ((await pager.count()) === 0) return false;
    await pager.click();
    await page.waitForTimeout(150);
  }
  return false;
}

async function shot(page, group, name) {
  const file = `${outDir}/${group}-${name}.png`;
  await page.screenshot({ path: file });
  captured += 1;
  console.log(file);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // まだ起動中。
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function findAvailablePort() {
  const probe = createNetServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const selected = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  if (!selected) throw new Error("Could not allocate an available port");
  return selected;
}
