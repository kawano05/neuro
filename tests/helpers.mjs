// 検査と画面撮影で使う下ごしらえをまとめる。
// 説明画面の押し方が変わっても、道具ごとに古い手順を残さないための共通入口。
// 入力そのものを検査する処理は各検査に残し、時計・待ち時間・撮影用の操作は引数で保つ。

import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { storageKey } from "../src/lib/content.js";
import { READY_GUARD_MS } from "../src/lib/games/readyScreen.js";

/** OS に空きポートを割り当ててもらう。固定ポート同士の取り合いを避ける。 */
export async function findAvailablePort() {
  const probe = createServer();
  probe.unref();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error("Could not allocate an available test port");
  return port;
}

/** 配信を待つ。HTML の版まで照合する道具は accept で応答の判定を渡す。 */
export async function waitForServer(
  baseUrl,
  {
    attempts = 60,
    intervalMs = 500,
    accept = (response) => response.ok,
    server,
    exitMessage = (code) => `Server exited: ${code}`,
    timeoutMessage = `Timed out waiting for ${baseUrl}`,
    allowTimeout = false
  } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (server && server.exitCode !== null) throw new Error(exitMessage(server.exitCode));
    try {
      if (await accept(await fetch(baseUrl))) return;
    } catch {
      // 配信がまだ始まっていない。既存の検査と同じ間隔で再試行する。
    }
    await delay(intervalMs);
  }
  // 演出撮影の既存版は、待ち切れなくても次の page.goto へ進む。その契約も明示して保つ。
  if (!allowTimeout) throw new Error(timeoutMessage);
}

/** 子サーバーを止め、2秒で終了しなければ強制終了する。終了済みの子には触れない。 */
export async function stopServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  await Promise.race([
    exited,
    delay(2_000).then(() => {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
    })
  ]);
}

/** 開始画面からホームへ跳ね返る入力のガードを越える（web-smoke の実時計）。 */
export async function settleStartGuard(page) {
  await page.waitForTimeout(550);
}

/** 表示名でタイルを開く。スモーク検査と同じ実入力・6ページ・120ms の待ち方。 */
export async function openActivity(page, name) {
  await settleStartGuard(page);
  const target = page.getByRole("button", { name, exact: true });
  const pager = page.locator(".game-tile.scan-pager");
  for (let hop = 0; hop < 6; hop += 1) {
    if ((await target.count()) > 0) {
      await target.click();
      return;
    }
    assert((await pager.count()) > 0, `Activity "${name}" is not on this page and there is no way to page forward`);
    await pager.click();
    await page.waitForTimeout(120);
  }
  assert(false, `Activity "${name}" never appeared while paging through the scan list`);
}

/** ホームのページを識別する。撮影では同じページに戻ったら探索を終える。 */
export async function tilePageSignature(page) {
  return page
    .locator("#gameTileGrid [data-tile-id]")
    .evaluateAll((tiles) => tiles.map((tile) => tile.dataset.tileId).join(","));
}

/**
 * ID でタイルを開く。既定は responsive-screens の DOM 入力・10ページ。
 * 撮影は pointer と settle、画面比較は first と afterOpen/afterPage で元の手順を保つ。
 */
export async function openTile(
  page,
  id,
  {
    attempts = 10,
    pointer = false,
    first = false,
    settle,
    afterOpen,
    afterPage,
    trackPages = false,
    stopWithoutPager = false,
    missingMessage = `見つからない遊び: ${id}`
  } = {}
) {
  const seen = new Set();
  const press = async (locator) => {
    const target = first ? locator.first() : locator;
    if (pointer) await target.click();
    else await target.evaluate((element) => element.click());
  };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (settle) await settle();
    const tile = page.locator(`[data-tile-id="${id}"]`);
    if (await tile.count()) {
      await press(tile);
      if (afterOpen) await afterOpen();
      return;
    }
    if (trackPages) {
      const signature = await tilePageSignature(page);
      if (seen.has(signature)) break;
      seen.add(signature);
    }
    const pager = page.locator(".game-tile.scan-pager");
    if (stopWithoutPager && !(await pager.count())) break;
    await press(pager);
    if (afterPage) await afterPage();
  }
  throw new Error(missingMessage);
}

/**
 * 現行の説明画面は、声が鳴っていれば止めるだけ、止まっていればひと押しで開始する。
 * responsive-screens の手順を基準に、ガードを越えて「はじめる」を3回まで押す。
 * 撮影の fastForward とポインター入力、スイッチ入力の検査では press/wait を指定する。
 */
export async function finishReady(
  page,
  {
    virtualClock = false,
    advance = "runFor",
    pointer = false,
    waitMs = READY_GUARD_MS + 50,
    press,
    recheck = true
  } = {}
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await page.locator(".game-ready").count())) break;
    if (virtualClock) await page.clock[advance](waitMs);
    else await page.waitForTimeout(waitMs);
    if (recheck && !(await page.locator(".game-ready").count())) break;
    if (press) await press();
    else if (pointer) await page.locator("#gameReadyStart").click();
    else await page.locator("#gameReadyStart").evaluate((button) => button.click());
  }
  await page.locator(".game-ready").waitFor({ state: "detached" });
}

/**
 * 設定を書き換えて読み込み直す。既定は responsive-screens の保存済み settings を更新する。
 * allowMissing は web-smoke の空保存へのフォールバック、reload:false は既存の再読込位置を保つ。
 * afterUnload は撮影用。終了時のアプリ保存に上書きされないよう、window.name に予約する。
 */
export async function patchSettings(page, patch, { afterUnload = false, allowMissing = false, reload = true } = {}) {
  if (afterUnload) {
    await page.evaluate((settings) => {
      window.name = JSON.stringify({ captureSettings: settings });
    }, patch);
  } else {
    await page.evaluate(
      ({ key, patch, allowMissing }) => {
        const state = JSON.parse(allowMissing ? localStorage.getItem(key) || "{}" : localStorage.getItem(key));
        if (allowMissing) state.settings = { ...(state.settings || {}), ...patch };
        else Object.assign(state.settings, patch);
        localStorage.setItem(key, JSON.stringify(state));
      },
      { key: storageKey, patch, allowMissing }
    );
  }
  if (reload) await page.reload();
}

/**
 * 撮影の予約設定を、前のページの終了保存より後・アプリの読み込みより前に反映する。
 * 初回seedも同じコールバックに置く。別々のaddInitScriptの実行順には依存しない。
 */
export async function installSettingsPatch(context, initialState) {
  await context.addInitScript(
    ({ key, state }) => {
      if (!sessionStorage.getItem("capture-seeded")) {
        localStorage.setItem(key, JSON.stringify(state));
        sessionStorage.setItem("capture-seeded", "1");
      }
      if (window.name) {
        const patch = JSON.parse(window.name).captureSettings;
        if (patch) {
          const saved = JSON.parse(localStorage.getItem(key));
          Object.assign(saved.settings, patch);
          localStorage.setItem(key, JSON.stringify(saved));
        }
      }
    },
    { key: storageKey, state: initialState }
  );
}

/** 支援者の入口から指定のタブを開く。画面の待ち方は呼び出し側の検査に合わせる。 */
export async function openSupporterView(page, view, { settle, waitForView } = {}) {
  await page.locator("#homeSupporterMenu").click();
  await page.locator(`.tab[data-view="${view}"]`).click();
  if (settle) await settle();
  if (waitForView) await waitForView();
  else await page.locator(`#${view}.is-active`).waitFor();
}

/** 評価ログを開く（web-smoke でいちばん多く使う支援者画面）。 */
export async function openSupporterLog(page) {
  await openSupporterView(page, "log", {
    waitForView: () =>
      page.waitForFunction(
        ({ selector, className }) => document.querySelector(selector)?.classList.contains(className),
        { selector: "#log", className: "is-active" },
        { timeout: 5_000 }
      )
  });
}
