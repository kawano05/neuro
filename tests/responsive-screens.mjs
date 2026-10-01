// 遊ぶ前の説明の画面（レディ画面）と、けっかの画面の検査。
//
// 説明の画面の押し方は games/readyScreen.js: 声が鳴っていれば止めるだけ、止まって
// いればひと押しで始まる。前後の説明は支援者のタップ用で、始める条件ではない。
// ここに置くのは、その押し方の検査と、画面の大きさを変えても説明とけっかが
// 画面に収まることの検査。web-smoke.mjs の checks から呼ぶ。

import assert from "node:assert/strict";
import { storageKey } from "../src/lib/content.js";
import { finishReady, openTile, patchSettings } from "./helpers.mjs";
import { READY_GUARD_MS } from "../src/lib/games/readyScreen.js";

// 押下を受けない時間（READY_GUARD_MS）を越えるのに待つ長さ。
const PAST_GUARD_MS = READY_GUARD_MS + 50;
const VIEWPORTS = [
  [667, 375],
  [844, 390],
  [390, 844],
  [834, 1194],
  [1180, 820],
  [1366, 650],
  [1920, 1080],
];

/**
 * 端末の読み上げが「読んでいる／いない」状態を作る。止める（cancel）と「いない」に戻る
 * のも本物と同じにする。speechSynthesis の無い環境（Windows の WebKit）でも同じ形で置く。
 */
async function setDeviceSpeaking(page, speaking) {
  await page.evaluate((speaking) => {
    const fake = window.__fakeSpeech || { speaking: false, pending: false, speak() {}, getVoices: () => [] };
    fake.speaking = speaking;
    fake.cancel = () => {
      fake.speaking = false;
    };
    window.__fakeSpeech = fake;
    Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => fake });
  }, speaking);
}

const sessionCount = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).sessions.length, storageKey);

/**
 * 説明の画面の押し方（点検 U15 と、押す回数の両立）。
 * - 開いた直後の押下（タイルを選んだ押下の跳ね返り）では始まらない
 * - 声が鳴っているあいだの押下は声を止めるだけで、記録も作らない
 * - 声が止まっていれば、ひと押しで始まる
 * - 走査では「はじめる」と「おわる」だけを回り、スイッチコントロールにも両方が見える
 * - 始まったら走査は止まる
 */
export async function checkReadyInputSafety(page) {
  await patchSettings(page, { speechEnabled: true, autoScan: false, textMode: "ruby" });
  await page.locator("#startStage").click();
  await openTile(page, "slot-corner");
  await openTile(page, "slot-l1");
  await page.locator(".game-ready").waitFor();
  const before = await sessionCount(page);

  // 開いた直後の押下は受けない。
  await page.locator("#gameStage").click();
  assert(await page.locator(".game-ready").count(), "開いた直後の押下で始まらない");

  // 声が鳴っているあいだの押下は、声を止めるだけ。端末の声が「読んでいる」状態を作る
  // （audio.isSpeaking は speechSynthesis.speaking を見る）。止める（cancel）と、本物と
  // 同じく「読んでいない」に戻る。
  await page.waitForTimeout(PAST_GUARD_MS);
  await setDeviceSpeaking(page, true);
  await page.locator("#gameStage").click();
  assert(await page.locator(".game-ready").count(), "声が鳴っているあいだの押下で始まらない");
  assert.equal(await sessionCount(page), before, "説明の押下は記録しない");

  // 声が止まっていれば、ひと押しで始まる。
  await setDeviceSpeaking(page, false);
  await page.waitForTimeout(PAST_GUARD_MS);
  await page.locator("#gameStage").click();
  await page.locator(".game-ready").waitFor({ state: "detached" });
  assert(await page.locator(".slot-task").count(), "声が止まっていれば、ひと押しで始まる");
  await page.locator("#gameExit").click();

  // 自前の走査では、説明の画面に枠を出さず、ひと押しで始まる（「はじめる」と「おわる」を
  // 交互に回すと、押す時刻がずれただけでホームへ戻ってしまう）。iPad のスイッチコントロール
  // （OS）には、「はじめる」と「おわる」が本物のボタンとして見える。
  for (const switchControlMode of [false, true]) {
    await patchSettings(page, { speechEnabled: false, autoScan: true, scanInterval: 500, switchControlMode });
    await page.locator("#startStage").click();
    await openTile(page, "slot-corner");
    await openTile(page, "slot-l1");
    await page.locator(".game-ready").waitFor();
    if (switchControlMode) {
      const start = page.getByRole("button", { name: /始める|はじめる/ });
      const exit = page.locator("#gameExit");
      assert(await start.isVisible(), "スイッチコントロールから「はじめる」が見える");
      assert(await exit.isVisible(), "スイッチコントロールから「おわる」が見える");
      await finishReady(page);
    } else {
      await page.waitForTimeout(1200);
      assert.equal(await page.locator("#gameView .scan-focus").count(), 0, "説明の画面では枠を回さない");
      await page.keyboard.press("Space");
    }
    await page.locator(".game-ready").waitFor({ state: "detached" });
    assert.equal(await page.locator("#gameView .scan-focus").count(), 0, "課題を始めたら走査を止める");
    await page.locator("#gameExit").click();
  }
}

/** Windows のヘッドレス WebKit には Web Audio が無い。版面の検査のために時計だけを用意する。 */
function installLayoutAudio() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    const parameter = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      cancelScheduledValues() {},
      setTargetAtTime() {},
    });
    const node = () => ({
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
      addEventListener() {},
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      detune: parameter(),
      playbackRate: parameter(),
    });
    window.AudioContext = class {
      sampleRate = 44100;
      destination = node();
      get currentTime() {
        return performance.now() / 1000;
      }
      resume() {
        return Promise.resolve();
      }
      createGain() {
        return node();
      }
      createOscillator() {
        return node();
      }
      createBufferSource() {
        return node();
      }
      createBiquadFilter() {
        return node();
      }
      createBuffer(channels, length) {
        return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) };
      }
      decodeAudioData() {
        return Promise.resolve(this.createBuffer(1, 4410));
      }
    };
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    // 版面の検査の時計を WebKit でも進める。実際に音が出るかは別の検査が見る。
    Object.defineProperty(AudioContextClass.prototype, "currentTime", {
      get: () => performance.now() / 1000,
      configurable: true,
    });
    Object.defineProperty(AudioContextClass.prototype, "state", { get: () => "running", configurable: true });
  }
}

const CORNER_OF = {
  "slot-l1": "slot-corner",
  "slot-l2": "slot-corner",
  crane: "crane-corner",
  fishing: "fishing-corner",
  "fishing-gonogo": "fishing-corner",
  gonogo: null,
};

/**
 * 説明とけっかが、画面の大きさを変えても収まる（大きい文字＋くっきり表示で、
 * 日本語と英語）。アームの状態札が隠れないことも見る。
 * 画面の大きさは自分で変えるので、実寸の数だけ同じ仕事を繰り返さないよう、
 * 呼び出し側（web-smoke）はエンジンごとに1実寸だけで呼ぶ。
 */
export async function checkResponsiveScreens(page) {
  await page.addInitScript(installLayoutAudio);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  for (const [width, height] of VIEWPORTS) {
    for (const textMode of ["ruby", "en"]) {
      await page.setViewportSize({ width, height });
      await patchSettings(page, {
        textMode,
        largeText: true,
        highContrast: true,
        speechEnabled: false,
        autoScan: false,
        fxLevel: "none",
        difficultyMode: "practice",
      });
      await page.locator("#startStage").click({ force: true });
      for (const [game, corner] of Object.entries(CORNER_OF)) {
        const where = `${game} ${width}x${height} ${textMode}`;
        if (corner) await openTile(page, corner);
        await openTile(page, game);
        await page.clock.fastForward(PAST_GUARD_MS);
        await assertReadyFits(page, where);
        await finishReady(page, { virtualClock: true });
        if (game === "crane") await assertCraneStatusVisible(page, where);
        await playToResult(page, game, where);
        await assertResultFits(page, where);
        await page.locator("#resultHome").evaluate((button) => button.click());
      }
    }
  }
}

/** 説明の題名・見えている手順・案内・はじめる・おわる が画面の中にあり、手順が切れていない。 */
async function assertReadyFits(page, where) {
  const pages = (await page.locator("#gameReadyPage").textContent()) || "";
  const total = Number(pages.split("/")[1] || 1);
  for (let shown = 0; shown < total; shown += 1) {
    const found = await page.evaluate(() => {
      const selectors = [
        ".game-ready-title",
        ".game-ready-steps li:not([hidden])",
        ".game-ready-go",
        "#gameReadyStart",
        "#gameExit",
      ];
      const stage = document.querySelector(".game-ready").getBoundingClientRect();
      return selectors
        .flatMap((selector) => [...document.querySelectorAll(selector)])
        .filter((element) => element.getBoundingClientRect().width)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            name: element.id || element.className,
            inside: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
            clipped: element.matches("li") && (rect.top < stage.top - 1 || rect.bottom > stage.bottom + 1),
          };
        });
    });
    assert(found.every((item) => item.inside && !item.clipped), `説明が収まらない ${where}: ${JSON.stringify(found)}`);
    assert.equal(
      await page.locator("#gameReadyPage").evaluate((element) => getComputedStyle(element).color),
      "rgb(255, 255, 255)",
      "くっきり表示の説明ページ番号を白くする"
    );
    if (total > 1) await page.locator("#gameReadyForward").evaluate((button) => button.click());
  }
}

async function assertCraneStatusVisible(page, where) {
  const hidden = await page.locator(".crane-status").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return !center?.closest(".crane-console") || rect.bottom > innerHeight || rect.top < 60;
  });
  assert(!hidden, `アームの状態札が隠れる: ${where}`);
}

/** 経過時計で終わりまで進める（途中の描画フレームは再生しない）。 */
async function playToResult(page, game, where) {
  for (let step = 0; step < 100 && !(await page.locator("#resultView.is-active").count()); step += 1) {
    await page.clock.fastForward(500);
    if (game === "crane") await page.locator("#gameStage").evaluate((stage) => stage.click());
    else await page.clock.fastForward(10_000);
  }
  assert(await page.locator("#resultView.is-active").count(), `けっかに進まない: ${where}`);
  await page.clock.fastForward(1000);
}

/** けっかのボタンが画面の中にあり 44px 以上、中身がスクロールなしで収まる。 */
async function assertResultFits(page, where) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("#resultRetry, #resultHome")].map((button) => {
      const rect = button.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.bottom <= innerHeight + 1 &&
        rect.width >= 44 &&
        rect.height >= 44
      );
    });
    const stats = document.querySelector("#resultStats");
    return { controls, overflow: stats.scrollHeight - stats.clientHeight };
  });
  assert(result.controls.every(Boolean), `けっかのボタン: ${where}`);
  assert(result.overflow <= 2, `けっかが切れる: ${where} ${result.overflow}px`);
  for (const title of await page.locator("#resultView .hk-result-title").all()) {
    assert.equal(await title.evaluate((element) => getComputedStyle(element).color), "rgb(255, 255, 255)", "くっきり表示の結果見出しを白くする");
  }
}
