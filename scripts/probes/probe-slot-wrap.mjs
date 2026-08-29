import { webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4603;
const basePath = "/neuro-smoke/";
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BASE_PATH: basePath },
});
await delay(1200);
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 812 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}${basePath}`);
await page.locator("#startStage").click();
await page.waitForTimeout(400);
await page.locator("#gameTileGrid button").filter({ hasText: "リール" }).first().click();
await page.waitForTimeout(400);
await page.locator("#gameTileGrid button").first().click();
await page.locator(".game-ready").waitFor({ state: "visible" });
await page.locator("#gameStage").click();
await page.locator(".game-ready").waitFor({ state: "detached" });
await page.locator(".slot-task").waitFor({ state: "visible" });

const out = await page.evaluate(() => new Promise((resolve) => {
  const track = document.querySelector(".slot-reel-track");
  const start = performance.now();
  const values = [];
  const step = () => {
    values.push(parseFloat(track.style.getPropertyValue("--slot-track-offset")));
    if (performance.now() - start < 4000) requestAnimationFrame(step);
    else resolve(values);
  };
  requestAnimationFrame(step);
}));
const outliers = out.filter((v) => Math.abs(v) > 47.1);
console.log("samples:", out.length, "min:", Math.min(...out).toFixed(2), "max:", Math.max(...out).toFixed(2));
console.log("|offset| > 47px (帯の外へ飛んだフレーム):", outliers.length, outliers.slice(0, 8).map((v) => v.toFixed(2)).join(", "));
await browser.close(); server.kill(); process.exit(0);
