// 効果音が測定の合図音を覆わないこと。
//
// クレーン（モーター・把持・落下）とさかなつり（水音・リール）の音を足した。
// これらは「押した結果」を伝えるためのもので、測定の合図——リズムの
// 440Hz/880Hz、さかなつりのアタリ音——より目立ってはいけない。合図が
// 聴き取りにくくなると、聴覚キューへの同期/反応という測定そのものが変わる。
//
// 音は耳で確かめられないので、少なくとも「合図より大きくならない」という
// 安全弁だけは機械で固定する。呼び出し側が大きな値を書いても頭が押さえられる。
//
//   node tests/effect-gain.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TONE_GAIN,
  EFFECT_GAIN_CEILING,
  clampEffectGain,
} from "../src/lib/audio.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    failed += 1;
  }
}

test("the effect ceiling stays below the cue tone", () => {
  assert.ok(
    EFFECT_GAIN_CEILING < DEFAULT_TONE_GAIN,
    `効果音の上限 ${EFFECT_GAIN_CEILING} は合図音 ${DEFAULT_TONE_GAIN} より小さくなければならない`
  );
});

test("clamps anything a caller passes", () => {
  assert.equal(clampEffectGain(0.02), 0.02);
  assert.equal(clampEffectGain(EFFECT_GAIN_CEILING), EFFECT_GAIN_CEILING);
  // 合図音と同じ大きさを渡されても、合図より下へ落とす。
  assert.equal(clampEffectGain(DEFAULT_TONE_GAIN), EFFECT_GAIN_CEILING);
  assert.equal(clampEffectGain(1), EFFECT_GAIN_CEILING);
  // 負や不正な値は無音に倒す（鳴らさないほうが安全側）。
  assert.equal(clampEffectGain(-1), 0);
  assert.equal(clampEffectGain(Number.NaN), 0);
  assert.equal(clampEffectGain(undefined), 0);
  assert.equal(clampEffectGain("0.03"), 0);
});

test("every effect call site asks for less than the cue tone", () => {
  // 上限で丸めてはいるが、丸めに頼って大きな値を書き散らすと、上限を
  // 動かした瞬間に全部が跳ね上がる。呼び出し側の値そのものを見ておく。
  const sources = ["../src/lib/games/crane.js", "../src/lib/games/fishing.js"];
  const found = [];
  sources.forEach((relative) => {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    const text = readFileSync(path, "utf8");
    // playNoise / playSweep へ渡している gain の実引数を拾う。
    const calls = text.matchAll(/play(?:Noise|Sweep)\(\{[^}]*?gain:\s*([0-9.]+)/gs);
    for (const match of calls) found.push({ relative, gain: Number(match[1]) });
  });

  assert.ok(found.length >= 6, `効果音の呼び出しが見つからない（${found.length}件）`);
  found.forEach(({ relative, gain }) => {
    assert.ok(
      gain <= EFFECT_GAIN_CEILING,
      `${relative} の gain ${gain} が効果音の上限 ${EFFECT_GAIN_CEILING} を超えている`
    );
    assert.ok(
      gain < DEFAULT_TONE_GAIN,
      `${relative} の gain ${gain} が合図音 ${DEFAULT_TONE_GAIN} 以上になっている`
    );
  });
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("effect gain tests passed");
