import { chromium } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const runFile = promisify(execFile);
// import.meta.dirname は Node 20.11 以降にしか無く、それより古い Node では
// undefined になって resolve() が投げる（テストが起動すらしない）。
// package.json は Node >=22 を要求しているが、テストが「動かない」ではなく
// 「落ちない」で失敗するのは分かりにくいので、全バージョンで動く形にする。
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(join(tmpdir(), "neuro-pwa-update-race-"));
const v1Root = join(tempRoot, "v1");
const v2Root = join(tempRoot, "v2");
const liveRoot = join(tempRoot, "live");
const port = await findAvailablePort();
const basePath = "/pwa-update-race/";
const baseUrl = `http://127.0.0.1:${port}${basePath}`;
const headed = process.argv.includes("--headed");

const [v1CacheVersion, v2CacheVersion] = await Promise.all([
  createFixture(v1Root, "v1"),
  createFixture(v2Root, "v2"),
]);
await cp(v1Root, liveRoot, { recursive: true });

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", liveRoot, String(port)], {
  cwd: projectRoot,
  env: { ...process.env, BASE_PATH: basePath },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
server.stdout.on("data", (data) => process.stdout.write(data));
server.stderr.on("data", (data) => process.stderr.write(data));

let browser;
let context;
let failure;

try {
  await waitForServer();
  browser = await chromium.launch({ headless: !headed });
  context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl);
  await page.locator("#version").waitFor();
  assert((await page.locator("#version").textContent()) === "v1", "Expected the v1 fixture on first load");
  assert((await page.locator("html").getAttribute("data-asset-version")) === "v1", "Expected the v1 JS asset to run");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.waitForFunction(
    (version) => caches.keys().then((names) => names.some((name) => name.endsWith(`:${version}`))),
    v1CacheVersion
  );

  // A connected browser can still receive a transient 404/5xx from the host.
  // Keep serving the complete installed shell instead of surfacing a broken
  // navigation merely because fetch() resolved with a non-success response.
  const unavailableFiles = [
    [join(liveRoot, "index.html"), join(liveRoot, "index.temporarily-unavailable.html")],
    [join(liveRoot, "assets", "app-v1.js"), join(liveRoot, "assets", "app-v1.temporarily-unavailable.js")],
    [join(liveRoot, "assets", "app-v1.css"), join(liveRoot, "assets", "app-v1.temporarily-unavailable.css")],
  ];
  await Promise.all(unavailableFiles.map(([livePath, unavailablePath]) => rename(livePath, unavailablePath)));
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.locator("#version").waitFor();
    assert((await page.locator("#version").textContent()) === "v1", "Expected the v1 shell during a transient online host error");
    assert((await page.locator("html").getAttribute("data-asset-version")) === "v1", "Expected cached v1 assets during a transient online host error");
    assert(
      (await page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--asset-version").trim())) === '"v1"',
      "Expected the cached v1 stylesheet during a transient online host error"
    );
  } finally {
    await Promise.all(unavailableFiles.map(([livePath, unavailablePath]) => rename(unavailablePath, livePath)));
  }

  await deployFixture(v2Root, liveRoot);

  // Reproduce the dangerous boundary without allowing the new SW to install:
  // the old SW sees the deployed v2 index, but none of the v2 hashed assets.
  const onlineIndex = await page.evaluate(async () => {
    const response = await fetch(new URL("index.html", location.href), { cache: "reload" });
    return { status: response.status, text: await response.text() };
  });
  assert(onlineIndex.status === 200 && onlineIndex.text.includes(">v2<"), "Expected the network to return the deployed v2 index");

  const cachedIndex = await page.evaluate(async (version) => {
    const cacheName = (await caches.keys()).find((name) => name.endsWith(`:${version}`));
    if (!cacheName) return null;
    const response = await (await caches.open(cacheName)).match(new URL("index.html", location.href));
    return response ? response.text() : null;
  }, v1CacheVersion);
  assert(cachedIndex?.includes(">v1<"), "The v1 precache must remain immutable after an online v2 index response");
  assert(!cachedIndex?.includes(">v2<"), "The v2 index must not be mixed into the v1 precache");

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.locator("#version").waitFor();
    assert((await page.locator("#version").textContent()) === "v1", "Expected an internally consistent v1 offline fallback");
    assert((await page.locator("html").getAttribute("data-asset-version")) === "v1", "Expected the precached v1 JS offline");
  } finally {
    await context.setOffline(false);
  }

  // Once v2's SW installs, its complete asset set replaces v1 atomically.
  await page.evaluate(async ({ expectedVersion, previousVersion }) => {
    const originalController = navigator.serviceWorker.controller;
    const controllerChanged = new Promise((resolveChange, rejectChange) => {
      const timeout = setTimeout(() => rejectChange(new Error("Timed out waiting for the v2 Service Worker controller")), 10_000);
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => {
          clearTimeout(timeout);
          resolveChange();
        },
        { once: true }
      );
    });
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    if (navigator.serviceWorker.controller === originalController) await controllerChanged;

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const names = await caches.keys();
      if (
        names.some((name) => name.endsWith(`:${expectedVersion}`)) &&
        !names.some((name) => name.endsWith(`:${previousVersion}`))
      ) {
        return;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
    }
    throw new Error("Timed out waiting for the v2 precache activation boundary");
  }, { expectedVersion: v2CacheVersion, previousVersion: v1CacheVersion });

  const currentCacheNames = await page.evaluate(() => caches.keys());
  assert(
    currentCacheNames.some((name) => name.endsWith(`:${v2CacheVersion}`)),
    `Expected the v2 precache after update, got ${currentCacheNames.join(", ")}`
  );
  assert(
    !currentCacheNames.some((name) => name.endsWith(`:${v1CacheVersion}`)),
    `Expected the same-scope v1 precache to be removed, got ${currentCacheNames.join(", ")}`
  );

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 10_000 });
    await page.locator("#version").waitFor();
    assert((await page.locator("#version").textContent()) === "v2", "Expected the complete v2 app shell offline after update");
    assert((await page.locator("html").getAttribute("data-asset-version")) === "v2", "Expected the precached v2 JS offline");
  } finally {
    await context.setOffline(false);
  }

  console.log("ok chromium-desktop: keeps versioned precaches internally consistent across a v1 -> v2 update race");
} catch (error) {
  failure = error;
  console.error("failed chromium-desktop: PWA v1 -> v2 update race");
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await stopServer();
  await rm(tempRoot, { recursive: true, force: true });
}

if (!failure) console.log("\n1 PWA update-race test passed.");

async function createFixture(root, version) {
  await mkdir(join(root, "assets"), { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "index.html"),
      `<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="./icon.svg"><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="./assets/app-${version}.css"></head><body><h1 id="version">${version}</h1><script type="module" src="./assets/app-${version}.js"></script><script>window.addEventListener("load",()=>navigator.serviceWorker?.register("./sw.js"));</script></body></html>`,
      "utf8"
    ),
    writeFile(join(root, "assets", `app-${version}.js`), `document.documentElement.dataset.assetVersion = "${version}";\n`, "utf8"),
    writeFile(join(root, "assets", `app-${version}.css`), `body { --asset-version: "${version}"; }\n`, "utf8"),
    writeFile(
      join(root, "manifest.webmanifest"),
      JSON.stringify({ name: "PWA update fixture", start_url: "./", scope: "./", display: "standalone", icons: [{ src: "./icon.svg", sizes: "any", type: "image/svg+xml" }] }),
      "utf8"
    ),
    writeFile(join(root, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>\n', "utf8"),
  ]);

  await runFile(process.execPath, ["scripts/generate-sw.mjs", root], { cwd: projectRoot });
  const workerSource = await readFile(join(root, "sw.js"), "utf8");
  const match = workerSource.match(/const cacheVersion = "([a-f0-9]{16})";/);
  if (!match) throw new Error(`Could not read generated cache version for ${version}`);
  return match[1];
}

async function deployFixture(source, destination) {
  const next = `${destination}-next`;
  const previous = `${destination}-previous`;
  await rm(next, { recursive: true, force: true });
  await rm(previous, { recursive: true, force: true });
  await cp(source, next, { recursive: true });
  await rename(destination, previous);
  await rename(next, destination);
  await rm(previous, { recursive: true, force: true });
}

async function findAvailablePort() {
  const probe = createNetServer();
  probe.unref();
  await new Promise((resolveProbe, rejectProbe) => {
    probe.once("error", rejectProbe);
    probe.listen(0, "127.0.0.1", resolveProbe);
  });
  const address = probe.address();
  const selectedPort = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose, rejectClose) => probe.close((error) => (error ? rejectClose(error) : resolveClose())));
  if (!selectedPort) throw new Error("Could not allocate an available PWA test port");
  return selectedPort;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    delay(2_000).then(() => {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    }),
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
