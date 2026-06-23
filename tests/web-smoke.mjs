import { chromium, devices, webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = "http://127.0.0.1:4173";
const headed = process.argv.includes("--headed");

const projects = [
  {
    name: "chromium-desktop",
    browserType: chromium,
    contextOptions: { viewport: { width: 1280, height: 900 } },
  },
  {
    name: "mobile-webkit-like",
    browserType: webkit,
    contextOptions: devices["iPhone 14"],
  },
];

const checks = [
  ["loads the main learning app", checkMainApp],
  ["records switch input from stage and keyboard fallback", checkSwitchInput],
  ["moves between visible feature tabs", checkFeatureTabs],
  ["keeps the mobile layout inside the viewport", checkMobileLayout],
];

const server = spawn(process.execPath, ["scripts/serve-dist.mjs", "dist", "4173"], {
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (data) => process.stdout.write(data));
server.stderr.on("data", (data) => process.stderr.write(data));

const failures = [];

try {
  await waitForServer();

  for (const project of projects) {
    const browser = await project.browserType.launch({ headless: !headed });
    try {
      for (const [name, check] of checks) {
        const context = await browser.newContext(project.contextOptions);
        await context.addInitScript(() => localStorage.clear());
        const page = await context.newPage();
        try {
          await page.goto(baseUrl);
          await check(page);
          console.log(`ok ${project.name}: ${name}`);
        } catch (error) {
          failures.push({ project: project.name, name, error });
          console.error(`failed ${project.name}: ${name}`);
          console.error(error);
        } finally {
          await context.close().catch(() => {});
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }
} finally {
  server.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} smoke test(s) failed.`);
  process.exit(1);
}

console.log(`\n${projects.length * checks.length} smoke tests passed.`);
process.exit(0);

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function checkMainApp(page) {
  await waitForText(page, "h1", "neuro trainer");
  await waitForCount(page, ".tab", 4);
  await waitForClass(page, "#training", "is-active");
  await page.locator(".training-stage").waitFor({ state: "visible" });
}

async function checkSwitchInput(page) {
  await waitForText(page, ".metric-tile.primary strong", "0");

  await page.locator(".training-stage").click();
  await waitForText(page, ".metric-tile.primary strong", "1");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  await page.locator(".training-stage").click();
  await waitForText(page, ".metric-tile.primary strong", "2");
}

async function checkFeatureTabs(page) {
  const tabTargets = ["voca", "records", "settings", "training"];

  for (const target of tabTargets) {
    await page.locator(`.tab[data-view="${target}"]`).click();
    await waitForClass(page, `#${target}`, "is-active");
  }
}

async function checkMobileLayout(page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return document.documentElement.scrollWidth - width;
  });

  assert(overflow <= 2, `Expected horizontal overflow <= 2px, got ${overflow}px`);
  await page.locator(".switch-dock").waitFor({ state: "visible" });
  await page.locator(".primary-switch").waitFor({ state: "visible" });
}

async function waitForText(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, expected: text }) => document.querySelector(target)?.textContent?.trim() === text,
    { selector, expected },
    { timeout: 5_000 }
  );
}

async function waitForCount(page, selector, expected) {
  await page.waitForFunction(
    ({ selector: target, expected: count }) => document.querySelectorAll(target).length === count,
    { selector, expected },
    { timeout: 5_000 }
  );
}

async function waitForClass(page, selector, className) {
  await page.waitForFunction(
    ({ selector: target, className: expectedClass }) =>
      document.querySelector(target)?.classList.contains(expectedClass),
    { selector, className },
    { timeout: 5_000 }
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
