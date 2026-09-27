// =====================================================================
// render-icons.mjs — public/icon.svg から、アプリのアイコンと起動画面の PNG を作る
//
//   node scripts/render-icons.mjs
//
// 出すもの:
//   public/apple-touch-icon.png（180）… iPhone / iPad の「ホーム画面に追加」。SVG は使われない
//   public/icon-192.png / icon-512.png … ウェブアプリの一覧（manifest.webmanifest）
//   resources/icon.png（1024）… App Store とアプリ版のアイコンの元（@capacitor/assets で各大きさへ）
//   resources/splash.png / splash-dark.png（2732）… アプリ版の起動画面の元
// App Store のアイコンは透明を使えないので、どれも地を塗った正方形のまま書き出す。
// Playwright（テストで使っているもの）で SVG を描いて撮る。
// =====================================================================

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const svg = readFileSync("public/icon.svg", "utf8");
mkdirSync("resources", { recursive: true });

const ICONS = [
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["resources/icon.png", 1024],
];

// 起動画面: アプリの地（白・theme-hakkiri.css の --hk-paper）の真ん中にアイコン。
const SPLASHES = [
  ["resources/splash.png", "#FFFFFF"],
  ["resources/splash-dark.png", "#12305E"],
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [path, size] of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
  }
  for (const [path, background] of SPLASHES) {
    const size = 2732;
    const icon = 640;
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:${background}}` +
        `div{position:absolute;left:${(size - icon) / 2}px;top:${(size - icon) / 2}px;width:${icon}px;height:${icon}px;` +
        `border-radius:${icon * 0.22}px;overflow:hidden}svg{display:block;width:100%;height:100%}</style><div>${svg}</div>`
    );
    await page.screenshot({ path, clip: { x: 0, y: 0, width: size, height: size } });
  }
} finally {
  await browser.close();
}
console.log("icons written");
