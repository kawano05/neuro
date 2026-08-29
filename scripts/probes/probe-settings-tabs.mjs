// 設定のタブ分けの実測。
//
// 見たいのは「目的の項目にスクロールなしで届くか」。1面が1画面に収まって
// いれば探す動作が要らない。実機（iPad）と、いちばん厳しいスマホで測る。
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync } from "node:fs";

const port = 5641;
const basePath = "/neuro-shots/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const outDir = "test-results/settings-tabs";
mkdirSync(outDir, { recursive: true });

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

async function measure(label, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); },
    { key: "neuronode-prototype-state-v3", value: JSON.stringify({ version: 3, settings: {} }) }
  );
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(400);
  await page.locator("#startStage").click();
  await page.waitForTimeout(300);
  await page.locator("#homeSupporterMenu").click();
  await page.waitForTimeout(500);

  const tabs = await page.locator(".settings-tab").count();
  const rows = [];
  for (let i = 0; i < tabs; i += 1) {
    await page.locator(".settings-tab").nth(i).click();
    await page.waitForTimeout(200);
    rows.push(
      await page.evaluate(() => {
        const s = document.querySelector("#settings");
        const active = document.querySelector(".settings-tab.is-active");
        // 走査対象がドックの裏に隠れていないか（このアプリの約束）。
        const dock = document.querySelector(".switch-dock");
        const dockTop =
          dock && dock.getBoundingClientRect().height > 0
            ? dock.getBoundingClientRect().top
            : Infinity;
        const targets = [...s.querySelectorAll("[data-scan]")].filter(
          (el) => el.getBoundingClientRect().width > 0
        );
        return {
          タブ: active?.textContent.trim() ?? "?",
          画面ぶん: +(s.scrollHeight / window.innerHeight).toFixed(2),
          スクロール不要: s.scrollHeight <= window.innerHeight,
          走査対象: targets.length,
          ドックの裏: targets.filter((el) => el.getBoundingClientRect().top > dockTop).length,
        };
      })
    );
  }
  await page.locator(".settings-tab").first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${label}.png` });
  console.log(`\n【${label} ${viewport.width}x${viewport.height}】`);
  rows.forEach((r) =>
    console.log(
      `  ${r.タブ.padEnd(8)} ${String(r.画面ぶん).padStart(5)}画面  走査${String(r.走査対象).padStart(3)}  ` +
        `${r.スクロール不要 ? "スクロール不要" : "要スクロール"}${r.ドックの裏 ? `  ⚠ドックの裏 ${r.ドックの裏}` : ""}`
    )
  );
  await context.close();
  return rows;
}

const ipad = await measure("ipad-portrait", { width: 834, height: 1194 });
const phone = await measure("phone-portrait", { width: 390, height: 812 });
const land = await measure("phone-landscape", { width: 844, height: 390 });

console.log("\n--- 判定 ---");
const hidden = [...ipad, ...phone, ...land].filter((r) => r.ドックの裏 > 0);
const ipadScroll = ipad.filter((r) => !r.スクロール不要);
console.log(`ドックの裏に隠れた走査対象: ${hidden.length}件`);
console.log(`iPad でスクロールが要る面: ${ipadScroll.length}/${ipad.length}（${ipadScroll.map(r=>r.タブ).join(",") || "なし"}）`);
console.log(`画像: ${outDir}/`);

await browser.close();
server.kill();
process.exit(hidden.length === 0 ? 0 : 1);
