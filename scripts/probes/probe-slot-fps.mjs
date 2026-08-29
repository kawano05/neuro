import { devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4601;
const basePath = "/neuro-smoke/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BASE_PATH: basePath },
});
server.stderr.on("data", (d) => process.stderr.write(d));
await delay(1200);

const iphone = devices["iPhone 14"];
const profiles = [
  ["iphone14 (as CI)", iphone],
  ["iphone14 dsf=1", { ...iphone, deviceScaleFactor: 1 }],
  ["iphone14 dsf=2", { ...iphone, deviceScaleFactor: 2 }],
  ["iphone14 viewport-only dsf=3", { viewport: iphone.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }],
  ["phone-tall (passes)", { viewport: { width: 390, height: 812 }, isMobile: true, hasTouch: true }],
];

const browser = await webkit.launch({ headless: true });
for (const [name, contextOptions] of profiles) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.locator("#startStage").click();
  await page.waitForTimeout(400);
  await page.locator("#gameTileGrid button").filter({ hasText: "リール" }).first().click();
  await page.waitForTimeout(400);
  await page.locator("#gameTileGrid button").first().click();
  await page.locator(".game-ready").waitFor({ state: "visible" });
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  await page.locator(".slot-task").waitFor({ state: "visible" });

  // 実際に --slot-track-offset が書き換わる間隔を、ページ内で観測する
  const result = await page.evaluate(() => new Promise((resolve) => {
    const track = document.querySelector(".slot-reel-track");
    const start = performance.now();
    const changes = [];
    let last = track.style.getPropertyValue("--slot-track-offset");
    let rafTicks = 0;
    const step = () => {
      rafTicks += 1;
      const now = track.style.getPropertyValue("--slot-track-offset");
      if (now !== last) { changes.push(Math.round(performance.now() - start)); last = now; }
      if (performance.now() - start < 1500) requestAnimationFrame(step);
      else {
        const gaps = changes.map((t, i) => t - (i ? changes[i - 1] : 0));
        resolve({ rafTicks, changeCount: changes.length, maxGapMs: Math.max(...gaps), gaps });
      }
    };
    requestAnimationFrame(step);
  }));
  console.log(name.padEnd(30), "rafTicks/1.5s:", String(result.rafTicks).padStart(4),
    "offset changes:", String(result.changeCount).padStart(3),
    "max gap ms:", String(result.maxGapMs).padStart(4),
    "| 140ms窓で必ず動くか:", result.maxGapMs < 140 ? "yes" : "NO");
  await context.close();
}
await browser.close();
server.kill();
process.exit(0);
