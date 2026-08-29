// crane の演出連鎖が止まることがある（スモークが "もちあげた" のまま
// 10秒待って落ちる）。原因を推測で決めず、実際に繰り返して捕まえる。
// rAF ループの中で例外が出ていれば、そこで連鎖が止まったまま二度と進まない。
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 5633;
const basePath = "/neuro-shots/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  env: { ...process.env, BASE_PATH: basePath },
});
server.stderr.on("data", (d) => process.stderr.write(d));
for (let i = 0; i < 60; i += 1) {
  try { if ((await fetch(baseUrl)).ok) break; } catch {}
  await delay(300);
}

const browser = await chromium.launch();
const ROUNDS = Number(process.argv[2] || 12);
let stalls = 0;

for (let round = 0; round < ROUNDS; round += 1) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await context.addInitScript(
    ({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); },
    {
      key: "neuronode-prototype-state-v3",
      value: JSON.stringify({
        version: 3,
        settings: { craneTargetTrials: 3, craneSweepMs: 800 },
      }),
    }
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto(baseUrl);
  await page.waitForTimeout(300);
  await page.locator("#startStage").click();
  await page.locator('.module-button:has-text("アーム")').first().click();
  await page.locator(".game-ready").waitFor({ state: "visible" });
  // レディ画面のひと押しは、たまに取りこぼされる（この探りの本題ではないので
  // 押し直す。取りこぼしそのものは別に見る）。
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.locator("#gameStage").click();
    try {
      await page.locator(".game-ready").waitFor({ state: "detached", timeout: 1500 });
      break;
    } catch {}
  }

  const statuses = [];
  async function waitFor(text, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    let seen = null;
    while (Date.now() < deadline) {
      const now = await page.evaluate(() => {
        const el = document.querySelector(".crane-status");
        if (!el) return null;
        const copy = el.cloneNode(true);
        copy.querySelectorAll("rt").forEach((rt) => rt.remove());
        return copy.textContent;
      });
      if (now !== seen) { seen = now; statuses.push(now); }
      if (seen === text) return true;
      await delay(60);
    }
    return false;
  }

  let stalled = false;
  for (let trial = 0; trial < 3 && !stalled; trial += 1) {
    if (!(await waitFor("横に動きます"))) { stalled = true; break; }
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
    if (!(await waitFor("奥に動きます"))) { stalled = true; break; }
    await page.waitForTimeout(400);
    await page.locator("#gameStage").click();
  }

  if (stalled) {
    stalls += 1;
    console.log(`\n--- round ${round + 1}: 止まった ---`);
    console.log(`  状態の並び: ${statuses.join(" → ")}`);
    console.log(`  エラー: ${errors.length ? errors.join(" | ") : "なし"}`);
    const dump = await page.evaluate(() => {
      const el = document.querySelector(".crane-status");
      return {
        status: el?.textContent ?? null,
        resultActive: document.querySelector("#resultView")?.classList.contains("is-active"),
        gameActive: document.querySelector("#gameView")?.classList.contains("is-active"),
      };
    });
    console.log(`  画面: ${JSON.stringify(dump)}`);
  } else {
    process.stdout.write(".");
  }
  await context.close();
}

console.log(`\n\n${ROUNDS}回中 ${stalls}回 止まった。`);
await browser.close();
server.kill();
process.exit(0);
