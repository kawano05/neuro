// =====================================================================
// scripts/compare-measure-screens.mjs — そくていの回の画面が、変更の前後で1画素も変わらないかを比べる
//
//   npx vite build --outDir <前のビルド>     （変更の前のコミットで）
//   npx vite build --outDir <後のビルド>     （変更のあとで）
//   node scripts/compare-measure-screens.mjs --before <前のビルド> --after <後のビルド> [--out <撮った画像の置き場>] [--quick]
//     [--games slot-l2,crane] [--sizes 820x1180,844x390]   … 違いが出た場面だけを撮り直して確かめるとき
//
// 決まり（docs/rules/measurement-invariance.md）: そくていの回（settings.difficultyMode = "measure"）の遊ぶ画面は、
// 刺激の見え方を含めて1pxも変えない。この道具は、タイミングの遊び7つ × 画面の大きさ（14、--quick なら 5）×
// 遊んでいる最中の3つの時刻を、前後のビルドで同じ条件で撮り、RGB で比べる（遊ぶ前の説明の画面は、まだ
// 計測が始まっていないので比べない）。
//
// 同じ条件にするために:
//   - 乱数（Math.random）を同じ種で固定し、時計（Playwright の clock）と音の時計（AudioContext の currentTime）を
//     performance.now に結ぶ
//   - 撮る直前に描画の履歴をリセットする（body を一度隠して戻す）。動く層のラスタライズの履歴が残ると、同じ版を
//     2回撮っても画素がずれる（2026-09-30 に GPT の検証で分かった。RGBA のまま比べる道具は、この差も本当の差も
//     見落としていた）
//   - CSS のアニメーションを同じ位相（1000ms）で止める
// 比べるのは RGB だけ（不透明な画面のアルファ・PNG の圧縮の違いは数えない）。比較はブラウザの canvas で行う
// （Python などの追加の道具が要らない）。
//
// 違う場面では、遊ぶ面の中の全部の要素の「中身」（タグ・属性・字・計算済みスタイル。大きさから決まる値と
// CSS 変数を除く）が前後で同じかも比べる。中身が同じなら、違いは描いた順による揺れで、コードの変更ではない:
// 同じ字・同じ大きさでも、ページで最初にその字を組んだときの状態で幅が 1/16px ほど変わる（2026-10-01 に
// 確かめた。前の版でも、はじめに試しの字を置くと今の版と同じ幅になった。遊ぶ前の説明の画面の字が変わると起きる）。
// 判定: 中身の違う場面が1つでもあれば exit 1。中身が同じで画素だけ違う場面は、知らせるだけ。
//
// 上の帯の「のこり」の札（#gameProgress）は、遊びの面の外にある支援者のための札で、2026-09-30 から
// 「そくてい／れんしゅう」の名前を出している（とり違えを防ぐため。docs/rules/ud-checklist.md の B3）。
// ここの違いは別に数えて知らせ、判定には入れない。
//
// 以前は、この比べ方が作業ごとに5つの使い捨ての道具に分かれ、リポジトリに残っていたのは Python の要る1つだけ
// だった（scripts/verify-ud2-measure.mjs と compare-ud2-measure.py。これで置き換えた）。
// =====================================================================

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { findAvailablePort, waitForServer, stopServer, openTile } from "../tests/helpers.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.before || !args.after) {
  console.error(
    "使い方: node scripts/compare-measure-screens.mjs --before <前のビルド> --after <後のビルド> [--out <置き場>] [--quick] [--games a,b] [--sizes WxH,WxH]"
  );
  process.exit(2);
}
const outDir = args.out || "test-results/measure-compare";

/** 14 の大きさ（docs/rules/screen-sizes.md）。--quick は代表の5つ。 */
const ALL_SIZES = [
  [1133, 744], [744, 1133], [1180, 820], [820, 1180], [1194, 834], [834, 1194], [1366, 1024], [1024, 1366],
  [590, 820], [1366, 650], [1920, 1080], [844, 390], [667, 375], [390, 844],
];
const QUICK_SIZES = [[1180, 820], [834, 1194], [1366, 650], [844, 390], [667, 375]];
const SIZES = args.sizes
  ? args.sizes.split(",").map((size) => size.split("x").map(Number))
  : args.quick
    ? QUICK_SIZES
    : ALL_SIZES;
/** そくていの回のあるタイミングの遊び（calibration は いつも そくてい）。 */
const ALL_GAMES = ["slot-l1", "slot-l2", "crane", "fishing", "fishing-gonogo", "gonogo", "calibration"];
const GAMES = args.games ? args.games.split(",") : ALL_GAMES;
const CORNER = { "slot-l1": "slot-corner", "slot-l2": "slot-corner", crane: "crane-corner", fishing: "fishing-corner", "fishing-gonogo": "fishing-corner" };
/** 始めてから撮る時刻（ms）。 */
const MOMENTS = [256, 768, 4608];
const STORAGE_KEY = "neuronode-prototype-state-v4";

function parseArgs(list) {
  const parsed = {};
  for (let i = 0; i < list.length; i += 1) {
    const name = list[i].replace(/^--/, "");
    if (name === "quick") parsed.quick = true;
    else parsed[name] = list[(i += 1)];
  }
  return parsed;
}

/** 同じ条件のページを作る（乱数・時計・音の時計・保存を固定）。 */
async function openFixedPage(browser, port, [width, height]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    serviceWorkers: "block",
  });
  await context.addInitScript((key) => {
    let seed = 20260930;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      Object.defineProperty(AudioContextClass.prototype, "currentTime", {
        get: () => performance.now() / 1000,
        configurable: true,
      });
    }
    localStorage.clear();
    localStorage.setItem(
      key,
      JSON.stringify({ version: 4, settings: { difficultyMode: "measure", speechEnabled: false, autoScan: false } })
    );
  }, STORAGE_KEY);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator("#startStage").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.install({ time: new Date("2026-09-30T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-30T00:00:01Z"));
  return { context, page, errors };
}

/** 描画の履歴をリセットし、CSS の動きを同じ位相で止めてから撮る。札の場所と、スタイルの指紋も返す。 */
async function settledShot(page) {
  const { band, styles } = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    const display = document.body.style.display;
    document.body.style.display = "none";
    void document.body.offsetHeight;
    document.body.style.display = display;
    void document.body.offsetHeight;
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 1000;
    }
    const box = document.getElementById("gameProgress")?.getBoundingClientRect();
    // 要素ごとの中身の指紋（FNV-1a）。大きさから決まる値は字の幅の揺れで動くので除く。
    const sizeDerived = new Set(["width", "height", "inline-size", "block-size", "transform-origin", "perspective-origin"]);
    const hash = (text) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
      return (h >>> 0).toString(16);
    };
    const styles = [...document.querySelectorAll("#gameStageContent, #gameStageContent *")].map((element) => {
      const computed = getComputedStyle(element);
      // 変数（--で始まる）は除く。使われていれば、使った先の本当の値に出る。
      const values = [...computed]
        .filter((name) => !name.startsWith("--") && !sizeDerived.has(name))
        .map((name) => `${name}:${computed.getPropertyValue(name)}`);
      const name = `${element.tagName.toLowerCase()}.${String(element.className?.baseVal ?? element.className).trim().replace(/\s+/g, ".")}`;
      const attributes = element.getAttributeNames().map((attribute) => `${attribute}=${element.getAttribute(attribute)}`);
      const ownText = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.data);
      return `${name}=${hash([...values, ...attributes, ...ownText].join(";"))}`;
    });
    return { band: box?.width ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null, styles };
  });
  return { png: await page.screenshot(), band, styles };
}

/** 前後で中身の違う要素（最初の数個）。同じなら空。 */
function styleDifferences(before, after) {
  if (before.styles.length !== after.styles.length) return [`要素の数 ${before.styles.length} → ${after.styles.length}`];
  return before.styles.filter((entry, index) => entry !== after.styles[index]).slice(0, 5).map((entry) => entry.split("=")[0]);
}

/** 1つのビルドで、遊び × 大きさ × 場面を撮る。 */
async function captureBuild(browser, port, label) {
  const shots = new Map();
  for (const game of GAMES) {
    for (const size of SIZES) {
      const { context, page, errors } = await openFixedPage(browser, port, size);
      try {
        const tick = (ms) => page.clock.runFor(ms);
        const open = (id) => openTile(page, id, {
          attempts: 8,
          first: true,
          stopWithoutPager: true,
          afterOpen: () => tick(550),
          afterPage: () => tick(300)
        });
        await page.keyboard.press("Space");
        await tick(550);
        if (game === "calibration") {
          // 押すタイミングの基準をとる回は、ホームではなく支援者の設定の研究の欄から始める。
          await page.locator("#startCalibration").evaluate((element) => element.click());
          await tick(550);
        } else {
          if (CORNER[game]) await open(CORNER[game]);
          await open(game);
        }
        await page.locator(".game-ready").waitFor({ timeout: 5000 });
        await tick(600);
        const name = `${game}-${size[0]}x${size[1]}`;
        await page.keyboard.press("Space");
        await tick(32);
        let elapsed = 0;
        for (const moment of MOMENTS) {
          await tick(moment - elapsed);
          elapsed = moment;
          shots.set(`${name}-${moment}ms`, await settledShot(page));
        }
        if (errors.length) console.warn(`${label} ${name}: ページのエラー`, errors);
      } catch (error) {
        // 1つの場面で失敗しても、ほかの場面は撮り続ける（撮れなかった場面は「撮れていない」として数える）。
        const reason = error.message.split(/\r?\n/)[0];
        console.warn(`${label} ${game}-${size[0]}x${size[1]}: 撮れなかった（${reason}）`);
      } finally {
        await context.close();
      }
    }
    console.log(`${label}: ${game} を撮った`);
  }
  return shots;
}

/**
 * 2枚の RGB の違う画素の数（ブラウザの canvas で数える）。札（前後の札の場所を合わせた箱。影の
 * ぶん 4px 広げる）の中の違いは band に分けて数える。大きさが違えば null。
 */
async function countRgbDiff(page, before, after) {
  if (before.png.equals(after.png)) return { changed: 0, band: 0 };
  const boxes = [before.band, after.band].filter(Boolean);
  const band = boxes.length
    ? {
        left: Math.min(...boxes.map((box) => box.left)) - 4,
        top: Math.min(...boxes.map((box) => box.top)) - 4,
        right: Math.max(...boxes.map((box) => box.right)) + 4,
        bottom: Math.max(...boxes.map((box) => box.bottom)) + 4,
      }
    : null;
  return page.evaluate(
    async ([a, b, band]) => {
      const load = async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height);
      };
      const [left, right] = await Promise.all([load(a), load(b)]);
      if (left.width !== right.width || left.height !== right.height) return null;
      const counts = { changed: 0, band: 0 };
      for (let i = 0; i < left.data.length; i += 4) {
        if (left.data[i] === right.data[i] && left.data[i + 1] === right.data[i + 1] && left.data[i + 2] === right.data[i + 2]) {
          continue;
        }
        const x = (i / 4) % left.width;
        const y = Math.floor(i / 4 / left.width);
        const inBand = band && x >= band.left && x < band.right && y >= band.top && y < band.bottom;
        counts[inBand ? "band" : "changed"] += 1;
      }
      return counts;
    },
    [before.png.toString("base64"), after.png.toString("base64"), band]
  );
}

const ports = [await findAvailablePort(), await findAvailablePort()];
const servers = [args.before, args.after].map((root, index) =>
  spawn(process.execPath, ["scripts/serve-dist.mjs", root, String(ports[index])], { windowsHide: true, stdio: "ignore" })
);
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--disable-gpu", "--disable-threaded-animation", "--disable-threaded-scrolling"],
});
try {
  for (const [index, root] of [args.before, args.after].entries()) {
    const expected = (await readFile(`${root}/index.html`, "utf8")).match(/assets\/[^" ]+\.js/)?.[0];
    await waitForServer(`http://127.0.0.1:${ports[index]}/`, {
      attempts: 100,
      intervalMs: 100,
      accept: async (response) => (await response.text()).match(/assets\/[^" ]+\.js/)?.[0] === expected,
      timeoutMessage: `配信が立ち上がらない: ${root}`
    });
  }
  const before = await captureBuild(browser, ports[0], "前");
  const after = await captureBuild(browser, ports[1], "後");
  const comparePage = await browser.newPage();
  const results = [];
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const shot = before.get(name);
    const other = after.get(name);
    const counts = shot && other ? await countRgbDiff(comparePage, shot, other) : null;
    const styleChanges = counts?.changed ? styleDifferences(shot, other) : [];
    results.push({ name, changed: counts ? counts.changed : null, band: counts ? counts.band : null, styleChanges });
    if (!counts || counts.changed || counts.band) {
      await mkdir(`${outDir}/before`, { recursive: true });
      await mkdir(`${outDir}/after`, { recursive: true });
      if (shot) await writeFile(`${outDir}/before/${name}.png`, shot.png);
      if (other) await writeFile(`${outDir}/after/${name}.png`, other.png);
    }
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/results.json`, JSON.stringify(results, null, 2));
  const changedContent = results.filter((row) => row.changed === null || row.styleChanges.length);
  const jitter = results.filter((row) => row.changed > 0 && !row.styleChanges.length);
  const bandOnly = results.filter((row) => row.changed === 0 && row.band > 0);
  console.log(`そくていの回: ${results.length} 場面のうち、遊ぶ画面の中身が違う ${changedContent.length}`);
  changedContent.forEach((row) =>
    console.log(`  ${row.name}: ${row.changed === null ? "大きさが違う・撮れていない" : `${row.changed} 画素。中身の違う要素: ${row.styleChanges.join(", ")}`}`)
  );
  if (jitter.length) {
    console.log(`（中身は同じで画素だけ違う場面: ${jitter.length}。描いた順による字の揺れ。判定には入れない）`);
    jitter.forEach((row) => console.log(`    ${row.name}: ${row.changed} 画素`));
  }
  if (bandOnly.length) console.log(`（上の帯の「のこり」の札だけが違う場面: ${bandOnly.length}。判定には入れない）`);
  process.exitCode = changedContent.length ? 1 : 0;
} finally {
  await browser.close();
  await Promise.all(servers.map((server) => stopServer(server)));
}
