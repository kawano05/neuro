// 張り替えた文言（レディ画面の手順・crane/fishing の状態表示）が、表記の
// 設定で実際に切り替わるかの実測。辞書にキーがあることと、画面がそれを
// 使っていることは別の話なので、実物を開いて見る。
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 5631;
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
const JAPANESE = /[ぁ-んァ-ヶ一-龠]/;

async function openGame(textMode, corner, tileTitle) {
  const context = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  await context.addInitScript(
    ({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); },
    {
      key: "neuronode-prototype-state-v3",
      value: JSON.stringify({ version: 3, settings: { textMode } }),
    }
  );
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(400);
  await page.locator("#startStage").click();
  await page.waitForTimeout(300);
  if (corner) {
    await page.locator(`.module-button:has-text("${corner}")`).first().click();
    await page.waitForTimeout(300);
  }
  await page.locator(`.module-button:has-text("${tileTitle}")`).first().click();
  await page.waitForTimeout(500);
  return { context, page };
}

async function checkReady(textMode, corner, tileTitle, label) {
  const { context, page } = await openGame(textMode, corner, tileTitle);
  const steps = await page.locator(".game-ready-steps li").allTextContents();
  console.log(`\n【${label} / ${textMode}】レディ画面の手順`);
  steps.forEach((s) => console.log(`  - ${s.trim()}`));
  const leaked = textMode === "en" ? steps.filter((s) => JAPANESE.test(s)) : [];
  const keyish = steps.filter((s) => s.trim().startsWith("howto."));
  await context.close();
  return { count: steps.length, leaked: leaked.length, keyish: keyish.length };
}

async function checkCraneStatus(textMode, craneTile) {
  const { context, page } = await openGame(textMode, null, craneTile);
  // レディ画面のひと押しで開始し、最初の状態表示を読む。
  await page.locator("#gameStage").click();
  await page.waitForTimeout(600);
  const status = (await page.locator(".crane-status").textContent()) || "";
  const score = (await page.locator(".crane-score").textContent()) || "";
  const tray = (await page.locator(".crane-tray-label").textContent()) || "";
  console.log(`\n【アームを とめる / ${textMode}】ゲーム中の表示`);
  console.log(`  状態: ${status.trim()}`);
  console.log(`  スコア: ${score.trim()} / 取り出し口: ${tray.trim()}`);
  await context.close();
  const texts = [status, score, tray];
  return {
    leaked: textMode === "en" ? texts.filter((s) => JAPANESE.test(s)).length : 0,
    keyish: texts.filter((s) => s.trim().startsWith("crane.")).length,
  };
}

// タイルの見出しも表記で変わるので、探す文字列を表記ごとに持つ。
const TILE = {
  kana: { rhythmCorner: "リズム", gonogo: "たかいおとだけ", crane: "アーム" },
  kanji: { rhythmCorner: "リズム", gonogo: "高い音だけ", crane: "アーム" },
  en: { rhythmCorner: "Rhythm", gonogo: "High notes only", crane: "Stop the claw" },
};

const results = [];
for (const mode of ["kana", "kanji", "en"]) {
  const tiles = TILE[mode];
  results.push(await checkReady(mode, tiles.rhythmCorner, tiles.gonogo, "たかいおとだけ"));
  results.push(await checkReady(mode, null, tiles.crane, "アームを とめる"));
  results.push(await checkCraneStatus(mode, tiles.crane));
}

console.log("\n--- 判定 ---");
const ok = results.every((r) => r.leaked === 0 && r.keyish === 0 && (r.count ?? 1) > 0);
console.log(ok ? "期待どおり（英語モードに日本語が残らず、キーも露出しない）" : "期待と違う");

await browser.close();
server.kill();
process.exit(ok ? 0 : 1);
