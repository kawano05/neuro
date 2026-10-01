// 画面の合否は tests/ の仕事。ここは目で確認する材料を作る。
// node scripts/capture-screens.mjs [出力先] [--all]
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { storageKey, gameTiles, endlessTiles } from "../src/lib/content.js";
import { defaultState } from "../src/lib/state.js";
import { READY_GUARD_MS } from "../src/lib/games/readyScreen.js";

const args = process.argv.slice(2);
if (args.some((arg) => arg.startsWith("--") && arg !== "--all") || args.filter((arg) => arg !== "--all").length > 1) {
  console.error("Usage: node scripts/capture-screens.mjs [output-directory] [--all]");
  process.exit(1);
}
const outDir = resolve(args.find((arg) => arg !== "--all") || "artifacts/screens");
const allSizes = [[1133,744],[744,1133],[1180,820],[820,1180],[1194,834],[834,1194],[1366,1024],[1024,1366],[590,820],[1366,650],[1920,1080],[844,390],[667,375],[390,844]];
const sizes = args.includes("--all") ? allSizes : [[1180,820],[834,1194],[1366,650],[844,390],[390,844]];
// 支援者の画面で選べる値だけ。測定条件はアプリの固定値を使う。
const settings = {
  autoScan: false, speechEnabled: false, soundEnabled: false, scanFeedback: "none",
  difficultyMode: "practice", fxLevel: "normal", hideVisualTasks: false,
  slotL1Rounds: 3, slotL2Rounds: 2, craneTargetTrials: 3, rhythmBpm: 80, targetBeats: 5,
};
const summary = { browser: "chromium", virtualClock: true, sizes: [], captured: 0, failures: [] };
const started = Date.now();
const basePath = "/neuro-screens/";
let server, browser, baseUrl;
mkdirSync(outDir, { recursive: true });
try {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}${basePath}`;
  server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", String(port)], {
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, BASE_PATH: basePath },
  });
  server.on("error", (error) => console.error(`server: ${error.message}`));
  server.stdout.on("data", () => {});
  server.stderr.on("data", (data) => process.stderr.write(data));
  await waitForServer();
  // 音が必要な課題も実在する AudioContext で開く。端末への出力だけを消音。
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
  for (const [width, height] of sizes) await captureSize(width, height);
} catch (error) { fail("capture", "setup", error); }
finally {
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await Promise.race([exited, delay(2000)]);
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  }
  summary.elapsedSeconds = Number(((Date.now() - started) / 1000).toFixed(2));
  writeFileSync(join(outDir, "capture-summary.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(outDir, "index.html"), gallery());
}
console.log(`\nCaptured: ${summary.captured}; failed: ${summary.failures.length}; elapsed: ${summary.elapsedSeconds}s; output: ${outDir}`);
for (const item of summary.failures) console.error(`FAILED ${item.size}/${item.scene}: ${item.reason}`);
process.exitCode = summary.captured ? 0 : 1;

async function captureSize(width, height) {
  const group = { size: `${width}x${height}`, images: [] };
  summary.sizes.push(group);
  let context, page, sequence = 0;
  // 失敗した場面も番号を使う。欠番は失敗欄で説明する。
  async function scene(name, prepare, { fullPage = false, route = "" } = {}) {
    const number = String(++sequence).padStart(3, "0");
    try {
      await prepare();
      await page.evaluate(() => document.fonts.ready);
      if (fullPage) {
        // summary をクリックした際の自動スクロールを戻し、粘着タブを上端に揃える。
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        await page.clock.runFor(40);
      }
      const file = `${number}-${safeName(name)}.png`;
      await page.screenshot({ path: join(outDir, group.size, file), fullPage, timeout: 10_000 });
      group.images.push({ file, scene: name, route, fullPage });
      summary.captured += 1;
      console.log(`${group.size}/${file}`);
    } catch (error) { fail(group.size, name, error); }
  }
  try {
    mkdirSync(join(outDir, group.size), { recursive: true });
    context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, serviceWorkers: "block" });
    await context.addInitScript(({ key, state }) => {
      if (!sessionStorage.getItem("capture-seeded")) {
        localStorage.setItem(key, JSON.stringify(state));
        sessionStorage.setItem("capture-seeded", "1");
      }
      // 前のページの終了保存より後、アプリの読み込みより前に反映する。
      // window.name は同じオリジンのリロードを越えて残る。
      if (window.name) {
        const patch = JSON.parse(window.name).captureSettings;
        if (patch) {
          const saved = JSON.parse(localStorage.getItem(key));
          Object.assign(saved.settings, patch);
          localStorage.setItem(key, JSON.stringify(saved));
        }
      }
    }, { key: storageKey, state: { ...structuredClone(defaultState), settings: { ...structuredClone(defaultState.settings), ...settings } } });
    // 仮想時計と音の時計を揃える。音の可用性と running 状態は偽装しない。
    await context.addInitScript(() => {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) Object.defineProperty(Audio.prototype, "currentTime", { configurable: true, get: () => performance.now() / 1000 });
    });
    page = await context.newPage();
    page.setDefaultTimeout(5000);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.goto(baseUrl);
    await scene("start", () => page.locator("#startView.is-active").waitFor(), { route: "起動" });
    const routes = new Map(), corners = [];
    await scene("home", () => home(), { route: "はじめる → ホーム" });
    await discover([], "home");
    for (let i = 0; i < corners.length; i += 1) {
      const path = corners[i];
      await scene(`home-${path.join("-")}`, () => navigate(path), { route: path.join(" → ") });
      await discover(path, `home-${path.join("-")}`);
    }
    const beginners = [...routes].filter(([id]) => gameTiles.some((tile) => tile.id === id && !tile.taskType));
    const timing = [...routes].filter(([id]) => gameTiles.some((tile) => tile.id === id && tile.taskType));
    const endless = [...routes].filter(([id]) => endlessTiles.some((tile) => tile.id === id));
    for (const [id, path] of beginners) await scene(`${id}-play`, async () => {
      await openGame(path); await finishReady(); await page.clock.fastForward(700);
      await pressStage(); await page.clock.fastForward(250); await playing();
    }, { route: `${path.join(" → ")} → 入力` });
    for (const [id, path] of [...timing, ...endless]) {
      const engine = endlessTiles.find((tile) => tile.id === id)?.gameId || id;
      for (const phase of ["ready", "play", "result"]) await scene(`${id}-practice-${phase}`, async () => {
        await openGame(path);
        if (phase === "ready") await page.locator(".game-ready").waitFor();
        else {
          await finishReady();
          if (phase === "result") await playToResult(engine);
          else await activeMoment();
        }
      }, { route: `${path.join(" → ")} → れんしゅう → ${phase}${engine !== id ? "（失敗で終了）" : ""}` });
      // 測定の回にはエンドレスの選択肢が無い。同じ通常課題の測定画面を撮る。
      if (engine === id) await scene(`${id}-measure-play`, async () => {
        await openGame(path, { difficultyMode: "measure" }); await finishReady();
        await activeMoment();
      }, { route: `${path.join(" → ")} → そくてい → 遊ぶ` });
    }
    const fxGame = timing.find(([id]) => id === "slot-l1") || timing[0];
    if (fxGame) for (const fxLevel of ["none", "subtle", "normal", "big"]) await scene(`${fxGame[0]}-practice-result-fx-${fxLevel}`, async () => {
      await openGame(fxGame[1], { fxLevel }); await finishReady(); await playToResult(fxGame[0]);
    }, { route: `${fxGame[1].join(" → ")} → 雰囲気 ${fxLevel} → けっか` });
    await scene("supporter-settings", () => supporter("settings"), { fullPage: true, route: "ホーム → 支援者の入口 → 設定" });
    await scene("supporter-log", () => supporter("log"), { fullPage: true, route: "ホーム → 支援者の入口 → 評価ログ" });
    await captureSections();

    async function home(patch = {}) {
      await page.evaluate((settings) => { window.name = JSON.stringify({ captureSettings: settings }); }, { ...settings, ...patch });
      await page.reload(); await page.locator("#startStage").click();
      await page.clock.fastForward(600); // ホームへ跳ね返る押下のガードの後
      await page.locator("#homeView.is-active").waitFor(); await settle();
    }
    async function settle() {
      await page.evaluate(() => document.fonts.ready);
      await page.clock.runFor(80); // ResizeObserver とページ割りを落ち着かせる
    }
    async function signature() {
      return page.locator("#gameTileGrid [data-tile-id]").evaluateAll((tiles) => tiles.map((tile) => tile.dataset.tileId).join(","));
    }
    async function openTile(id) {
      const seen = new Set();
      for (let hop = 0; hop < 30; hop += 1) {
        await settle();
        const tile = page.locator(`[data-tile-id="${id}"]`);
        if (await tile.count()) { await tile.click(); await settle(); return; }
        const key = await signature(); if (seen.has(key)) break; seen.add(key);
        const pager = page.locator(".game-tile.scan-pager");
        if (!(await pager.count())) break;
        await pager.click();
      }
      throw new Error(`タイルが見つからない: ${id}`);
    }
    async function navigate(path, patch = {}) { await home(patch); for (const id of path) await openTile(id); }
    async function discover(path, prefix) {
      try {
        await navigate(path); const seen = new Set();
        for (let hop = 0; hop < 30; hop += 1) {
          const key = await signature(); if (seen.has(key)) return; seen.add(key);
          if (hop) await scene(`${prefix}-page-${hop + 1}`, async () => {}, { route: `${path.join(" → ") || "ホーム"} → 次のページ ${hop + 1}` });
          const ids = await page.locator("#gameTileGrid [data-tile-id]").evaluateAll((tiles) => tiles.map((tile) => tile.dataset.tileId));
          for (const id of ids) {
            if (id.endsWith("-corner")) {
              const next = [...path, id];
              if (!corners.some((existing) => existing.join("/") === next.join("/"))) corners.push(next);
            } else if (gameTiles.some((tile) => tile.id === id) || endlessTiles.some((tile) => tile.id === id)) routes.set(id, [...path, id]);
          }
          const pager = page.locator(".game-tile.scan-pager"); if (!(await pager.count())) return;
          await pager.click(); await settle();
        }
        throw new Error("ホームのページ数が上限30を超えた");
      } catch (error) { fail(group.size, `${prefix}-discover`, error); }
    }
    async function openGame(path, patch = {}) {
      await navigate(path, patch); await page.locator("#gameView.is-active").waitFor();
      const actual = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings, storageKey);
      for (const [key, value] of Object.entries({ ...settings, ...patch })) {
        if (actual[key] !== value) throw new Error(`撮影設定が反映されていない: ${key}=${actual[key]}（期待 ${value}）`);
      }
    }
    async function finishReady() {
      for (let i = 0; i < 3 && await page.locator(".game-ready").count(); i += 1) {
        await page.clock.fastForward(READY_GUARD_MS + 50); await page.locator("#gameReadyStart").click();
      }
      await page.locator(".game-ready").waitFor({ state: "detached" });
      if (await page.locator(".game-unavailable").count()) throw new Error("音の課題を開始できない");
    }
    async function playing() {
      await page.locator("#gameView.is-active").waitFor();
      if (await page.locator(".game-ready, .game-unavailable").count()) throw new Error("遊ぶ画面に進んでいない");
    }
    async function activeMoment() {
      // カウントイン後の動く場面を撮る。説明を抜けた直後の「準備」だけを残さない。
      await page.clock.fastForward(3500);
      await page.clock.runFor(320);
      await playing();
    }
    async function pressStage() { await page.locator("#gameStage").evaluate((stage) => stage.click()); }
    async function playToResult(id) {
      // 入力と時計で完走する。結果HTMLや研究の記録を作り替えない。
      // 音の課題は入力せず見逃しで完走する。
      for (let step = 0; step < 120; step += 1) {
        if (await page.locator("#resultView.is-active").count()) {
          await page.clock.runFor(1200);
          // Web Animations の時計は page.clock と別。星や見出しが透明な途中を避ける。
          // 雲などの無限アニメーションは待たない。
          await Promise.race([page.locator("#resultStats").evaluate((container) => Promise.all(
            container.getAnimations({ subtree: true })
              .filter((animation) => Number.isFinite(animation.effect.getComputedTiming().endTime))
              .map((animation) => animation.finished.catch(() => {}))
          )), delay(5000, undefined, { ref: false }).then(() => { throw new Error("けっかの表示アニメーションが5秒で完了しない"); })]);
          await page.clock.runFor(160);
          return;
        }
        await page.clock.fastForward(id === "crane" || id.startsWith("slot-") ? 700 : 10_000);
        if (id === "crane" || id.startsWith("slot-")) await pressStage();
      }
      throw new Error(`けっかに進まない: ${id}（120ステップ）`);
    }
    async function supporter(view) {
      await home(); await page.locator("#homeSupporterMenu").click();
      await page.locator(`.tab[data-view="${view}"]`).click(); await settle();
      await page.locator(`#${view}.is-active`).waitFor();
      if (await page.locator(".scan-focus").count()) throw new Error("支援者の画面で走査枠が動いている");
    }
    async function captureSections() {
      // 名前や節の数を固定しない。DOM順で実際の details とタブを辿る。
      await supporter("settings"); const count = await page.locator("#settings details").count();
      for (let i = 0; i < count; i += 1) {
        let label = `section-${i + 1}`;
        try {
          await supporter("settings"); const detail = page.locator("#settings details").nth(i);
          label = (await detail.locator(":scope > summary").innerText()).trim();
          const ancestors = await detail.evaluate((element) => {
            const result = [], all = [...document.querySelectorAll("#settings details")];
            for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.matches("details")) result.unshift(all.indexOf(parent));
            return result;
          });
          for (const index of [...ancestors, i]) {
            const item = page.locator("#settings details").nth(index);
            if (await item.getAttribute("open") === null) await item.locator(":scope > summary").click();
          }
          await scene(`supporter-settings-${i + 1}-${label}`, () => settle(), { fullPage: true, route: `設定 → ${label}` });
          await tabs(`supporter-settings-${i + 1}`, label);
        } catch (error) { fail(group.size, `supporter-settings-${i + 1}-${label}`, error); }
      }
      await supporter("settings"); await tabs("supporter-settings", "設定");
    }
    async function tabs(prefix, section) {
      const items = page.locator('#settings [role="tab"], #settings button[data-tab], #settings button[data-settings-tab]');
      for (let i = 0; i < await items.count(); i += 1) {
        const tab = items.nth(i); if (!(await tab.isVisible()) || !(await tab.isEnabled())) continue;
        const label = (await tab.innerText()).trim() || await tab.getAttribute("aria-label") || `tab-${i + 1}`;
        await scene(`${prefix}-tab-${i + 1}-${label}`, async () => { await tab.click(); await settle(); }, { fullPage: true, route: `${section} → ${label}` });
      }
    }
  } catch (error) { fail(group.size, "viewport-setup", error); }
  finally { await context?.close().catch(() => {}); }
}
function fail(size, scene, error) {
  const reason = error.message || String(error); summary.failures.push({ size, scene, reason });
  console.error(`FAILED ${size}/${scene}: ${reason}`);
}
function safeName(value) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").slice(0, 110); }
function html(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function gallery() {
  const failures = summary.failures.map((item) => `<li>${html(item.size)} / ${html(item.scene)}: ${html(item.reason)}</li>`).join("");
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NeuroNode 画面一覧</title>
<style>body{font:16px system-ui;margin:24px;background:#f4f5f7;color:#17202b}h2{margin-top:36px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}figure{margin:0;padding:12px;background:white;border:1px solid #bbb;border-radius:8px}img{width:100%;height:240px;object-fit:contain;object-position:top;background:#e9edf2}figcaption{overflow-wrap:anywhere;margin-top:8px}small{display:block;margin-top:4px}a{color:#164bad}li{white-space:pre-wrap}</style>
<h1>NeuroNode 画面一覧</h1><p>Chromium・仮想時計・消音。${summary.captured}枚 / 失敗${summary.failures.length}件 / ${summary.elapsedSeconds}秒。画像を押すと原寸で開きます。支援者の長い画面はスクロール範囲全体を撮影。</p>
${failures ? `<h2>撮れなかった場面</h2><ul>${failures}</ul>` : ""}
${summary.sizes.map((group) => `<section><h2>${group.size}（${group.images.length}枚）</h2><div class="grid">${group.images.map((item) => {
    const url = `${group.size}/${encodeURIComponent(item.file)}`;
    return `<figure><a href="${url}"><img loading="lazy" src="${url}" alt="${html(item.scene)}"></a><figcaption>${html(item.file)}<small>${html(item.route)}</small></figcaption></figure>`;
  }).join("")}</div></section>`).join("")}</html>`;
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    if (server.exitCode !== null) throw new Error(`撮影サーバーが終了: ${server.exitCode}`);
    try { if ((await fetch(baseUrl)).ok) return; } catch { /* 起動待ち */ }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}
async function availablePort() {
  const probe = createServer(); probe.unref();
  await new Promise((accept, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", accept); });
  const port = probe.address().port;
  await new Promise((accept, reject) => probe.close((error) => error ? reject(error) : accept()));
  return port;
}
