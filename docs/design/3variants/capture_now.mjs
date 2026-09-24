// =====================================================================
// capture_now.mjs — いまのアプリの画面を撮る（デザイン案の「現状」用）
//
// 先に `npm run build` で dist/ を作ってから、リポジトリの直下で動かす:
//   node docs/design/3variants/capture_now.mjs
// iPad 横向き（1180×820）で撮り、このフォルダーの now/ に JPEG で置く。
// gen_single.py がこれを読んで、単一HTMLの「現状」に埋め込む。
// =====================================================================

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const OUT = join(here, "now");
mkdirSync(OUT, { recursive: true });

const PORT = 4391;
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(PORT)], {
  cwd: repo,
  stdio: "ignore",
  windowsHide: true,
});
const base = `http://127.0.0.1:${PORT}/`;
const log = [];

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 82 });
  log.push(name);
}

/** 保存データを消した状態（初めて開いたとき）で開く。 */
async function fresh(browser) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
    } catch (e) {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log.push("pageerror: " + e.message));
  await page.goto(base);
  await page.waitForTimeout(700);
  return { context, page };
}

/** 一覧から名前で開く。1画面に収まらないときは「次のページ」をたどる。 */
async function openByName(page, pattern) {
  for (let hop = 0; hop < 6; hop += 1) {
    const target = page.getByRole("button", { name: pattern }).filter({ visible: true });
    if ((await target.count()) > 0) {
      await target.first().click();
      return true;
    }
    const pager = page.locator(".game-tile.scan-pager").filter({ visible: true });
    if ((await pager.count()) === 0) return false;
    await pager.first().click();
    await page.waitForTimeout(200);
  }
  return false;
}

try {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(base);
      if (r.ok) break;
    } catch (e) {}
    await delay(150);
  }
  const browser = await chromium.launch();

  let { context, page } = await fresh(browser);
  await shot(page, "Start");
  await page.locator("#startStage").click();
  await page.waitForTimeout(600);
  await shot(page, "Home");
  await page.locator("#homeSupporterMenu").click();
  await page.waitForTimeout(600);
  await shot(page, "Settings");
  await context.close();

  ({ context, page } = await fresh(browser));
  await page.locator("#startStage").click();
  await page.waitForTimeout(500);
  log.push("reel: " + (await openByName(page, /リール/)));
  await page.waitForTimeout(600);
  await shot(page, "Kind");
  await context.close();

  ({ context, page } = await fresh(browser));
  await page.locator("#startStage").click();
  await page.waitForTimeout(500);
  log.push("color: " + (await openByName(page, /色と音|いろと おと/)));
  await page.waitForTimeout(800);
  await shot(page, "Play-ready");
  const stage = page.locator("#gameStage");
  await stage.click();
  await page.waitForTimeout(700);
  await stage.click();
  await page.waitForTimeout(700);
  await shot(page, "Play");
  for (let k = 0; k < 6; k += 1) {
    if ((await page.locator("#resultView.is-active").count()) > 0) break;
    await stage.click();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(900);
  await shot(page, "Result");
  await context.close();
  await browser.close();
} catch (e) {
  log.push("error: " + e.message);
} finally {
  server.kill();
  console.log(JSON.stringify(log));
}
