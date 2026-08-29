// ルビの見た目の実測。
//
// 辞書とレンダラが正しくても、画面で読めるかは別。ここで見たいのは3つ:
//   1. ふりがなが上の行と重なっていないか（行の高さが足りているか）
//   2. 拡大表示（largeText）でルビも一緒に大きくなるか
//   3. タイルの高さが伸びて、走査のページ分割が壊れていないか
import { webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync } from "node:fs";
// 許容幅はアプリ側の定数をそのまま使う。ここに数字を書き写すと、実装を
// 直したときにプローブだけが古い基準で「隠れている」と言い続ける
// （実際 8 のまま残って、24 に緩めたあとも警告を出していた）。
import { SCAN_OVERLAP_TOLERANCE_PX } from "../../src/lib/scanPaging.js";

const port = 5637;
const basePath = "/neuro-shots/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const outDir = "test-results/ruby";
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

// **WebKit で測る。** iOS は WebKit なので、ここを Chromium にすると
// 見た目の判断を別のエンジンで下すことになる——実測でルビの乗る見出し行は
// WebKit 61px / Chromium 53px と 30% 違った。
const browser = await webkit.launch();

async function look(label, { viewport, settings }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ({ key, value }) => { localStorage.clear(); localStorage.setItem(key, value); },
    { key: "neuronode-prototype-state-v3", value: JSON.stringify({ version: 3, settings }) }
  );
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(400);
  await page.locator("#startStage").click();
  await page.waitForTimeout(500);

  const metrics = await page.evaluate((tolerance) => {
    const rubies = [...document.querySelectorAll("#homeView ruby")];
    // ふりがなが1つ上の行（や上の要素）と重なっていないか。rt の上端が
    // 親要素の上端より外に出ていたら、はみ出して重なっている。
    let overflowing = 0;
    let minRtFont = Infinity;
    rubies.forEach((r) => {
      const rt = r.querySelector("rt");
      if (!rt) return;
      minRtFont = Math.min(minRtFont, parseFloat(getComputedStyle(rt).fontSize));
      // ふりがなが行ボックスの中で本文の上に出るのは正常。見たいのは
      // 「縦に積まれた上の行と重なっていないか」だけ。横並びの要素
      // （アイコンなど）を上の行と数えると偽陽性になる（実際になった）。
      const desc = r.closest(".tile-description");
      const title = desc?.previousElementSibling;
      if (!desc || !title) return;
      const a = rt.getBoundingClientRect();
      const b = title.getBoundingClientRect();
      // 同じ列に積まれている場合だけ比べる。
      if (Math.abs(a.left - b.left) > 40) return;
      if (a.top < b.bottom - 1) overflowing += 1;
    });
    const tiles = [...document.querySelectorAll(".module-button")];
    // 走査対象がドックの裏に隠れていないか（既存の約束）。
    const dock = document.querySelector(".switch-dock");
    const dockTop = dock && dock.getBoundingClientRect().height > 0
      ? dock.getBoundingClientRect().top : Infinity;
    // 実装と同じ基準で数える（scanPaging.js の SCAN_OVERLAP_TOLERANCE_PX）。
    // 数pxの重なりは「届かない」ではない——そこでページを分けると、分ける
    // 必要のない画面まで走査の1周が伸びる。
    const overflow = tiles.map((t) => t.getBoundingClientRect().bottom - dockTop);
    const hidden = overflow.filter((px) => px > tolerance).length;
    return {
      ruby数: rubies.length,
      はみ出したふりがな: overflowing,
      ふりがなの実寸px: minRtFont === Infinity ? null : +minRtFont.toFixed(1),
      タイル数: tiles.length,
      タイル高さ: tiles.length ? Math.round(tiles[0].getBoundingClientRect().height) : null,
      ドックの裏に隠れたタイル: Number.isFinite(hidden) ? hidden : 0,
      最大はみ出しpx: Math.round(Math.max(...overflow, -Infinity)),
      横はみ出し: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  }, SCAN_OVERLAP_TOLERANCE_PX);

  await page.screenshot({ path: `${outDir}/${label}.png`, fullPage: false });
  console.log(`\n【${label}】`, JSON.stringify(metrics, null, 1));
  await context.close();
  return metrics;
}

const results = [];
results.push(await look("ipad-normal", {
  viewport: { width: 834, height: 1194 }, settings: {},
}));
results.push(await look("ipad-large-text", {
  viewport: { width: 834, height: 1194 }, settings: { largeText: true },
}));
results.push(await look("ipad-high-contrast", {
  viewport: { width: 834, height: 1194 }, settings: { highContrast: true },
}));
results.push(await look("phone-portrait", {
  viewport: { width: 390, height: 812 }, settings: {},
}));
results.push(await look("phone-landscape", {
  viewport: { width: 844, height: 390 }, settings: {},
}));
// ルビが原因かを切り分ける。英語表記にはルビが無いので、同じ画面で
// 隠れる枚数が変わらなければ、隠れるのはルビのせいではない。
const noRuby = await look("phone-portrait-no-ruby", {
  viewport: { width: 390, height: 812 }, settings: { textMode: "en" },
});
console.log(`
切り分け: ルビ有りで隠れた ${results[3].ドックの裏に隠れたタイル} 枚 / ルビ無しで隠れた ${noRuby.ドックの裏に隠れたタイル} 枚`);

console.log("\n--- 判定 ---");
const ok = results.every(
  (r) => r.はみ出したふりがな === 0 && r.ドックの裏に隠れたタイル === 0 && !r.横はみ出し && r.ruby数 > 0
);
console.log(ok ? "期待どおり" : "期待と違う");
console.log(`画像: ${outDir}/`);

await browser.close();
server.kill();
process.exit(ok ? 0 : 1);
