import { devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4599;
const basePath = "/neuro-smoke/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BASE_PATH: basePath },
});
server.stderr.on("data", (d) => process.stderr.write(d));
await delay(1200);

const profiles = [
  ["mobile-webkit-like", devices["iPhone 14"]],
  ["phone-tall", { viewport: { width: 390, height: 812 }, isMobile: true, hasTouch: true }],
];

const browser = await webkit.launch({ headless: true });
for (const [name, contextOptions] of profiles) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}\n${e.stack}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text()}`); });
  await page.goto(baseUrl);

  await page.locator("#startStage").click();
  await page.waitForTimeout(400);
  // open slot corner then slot-l1 by visible text
  const tiles = await page.locator("#gameTileGrid button").allInnerTexts();
  console.log(`[${name}] tiles:`, JSON.stringify(tiles));
  await page.locator("#gameTileGrid button").filter({ hasText: "リール" }).first().click();
  await page.waitForTimeout(400);
  const sub = await page.locator("#gameTileGrid button").allInnerTexts();
  console.log(`[${name}] sub tiles:`, JSON.stringify(sub));
  await page.locator("#gameTileGrid button").first().click();
  await page.waitForTimeout(600);
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator(".slot-task").waitFor({ state: "visible" });

  const samples = [];
  for (let i = 0; i < 10; i += 1) {
    const s = await page.evaluate(() => ({
      t: Math.round(performance.now()),
      offs: [...document.querySelectorAll(".slot-reel-track")].map((el) => el.style.getPropertyValue("--slot-track-offset")),
      rafCount: window.__rafProbe ?? null,
      hidden: document.hidden,
      visibility: document.visibilityState,
    }));
    samples.push(s);
    await delay(60);
  }
  console.log(`[${name}] samples:`, JSON.stringify(samples, null, 1));
  console.log(`[${name}] problems:`, problems.length ? problems : "none");

  // does rAF tick at all?
  const rafTicks = await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const start = performance.now();
    const step = () => { n += 1; if (performance.now() - start < 500) requestAnimationFrame(step); else resolve(n); };
    requestAnimationFrame(step);
  }));
  console.log(`[${name}] rAF ticks in 500ms:`, rafTicks);
  await context.close();
}
await browser.close();
server.kill();
process.exit(0);
