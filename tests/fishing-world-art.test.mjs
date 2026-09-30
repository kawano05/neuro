// さかなつり（れんしゅうの回）の世界の絵のテスト。
//
// なぜ要るか: この絵は「見た目だけ」を替える約束で、判定・位置・大きさは元のまま。
// 約束を破る壊れ方は、ビルドが通り絵も出るので目で見ても気づきにくい:
//   - 魚・長靴・舟の箱の縦横比が元の PNG とずれると、釣り糸と魚の口の位置、舟の竿の先と
//     糸の位置がずれる（箱の幅は CSS が決め、高さは縦横比が決める）。
//   - 舟の竿の先が糸の x（.fishing-boat の translate(-94%, ...)）とずれると、糸が空中に浮く。
//   - 黄色（#FFC83D）は走査の枠の色。飾りに使うと枠が見分けられなくなる。
//   - CSS が .is-practice の外に漏れると、そくていの回の見え方が変わる。
//   - ずっと続く動きに filter や box-shadow を使うと、古い iPad で重くなる。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fishingBoatSvg, fishingCatchSvg, fishingSeaHtml, fishingSkyHtml } from "../src/lib/art/fishingWorldArt.js";
import { fishingSpecies } from "../src/lib/content.js";

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

const pathOf = (relative) => fileURLToPath(new URL(relative, import.meta.url));

/** PNG の幅と高さ（IHDR）。 */
function pngSize(relative) {
  const buffer = readFileSync(pathOf(relative));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function viewBoxOf(svg) {
  const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(match, "viewBox がない");
  return { width: Number(match[1]), height: Number(match[2]) };
}

const stylesCss = readFileSync(pathOf("../src/styles.css"), "utf8");
const worldCss = readFileSync(pathOf("../src/world-fishing.css"), "utf8");

test("every fish and the boot keep the aspect ratio of the picture they replace", () => {
  fishingSpecies.forEach((species) => {
    const png = pngSize(`../src/assets/fishing/fish-${species.asset}.png`);
    const box = viewBoxOf(fishingCatchSvg(species.id));
    assert.equal(box.width * png.height, box.height * png.width, `${species.id}: 縦横比が元の PNG と違う`);
  });
  const boot = pngSize("../src/assets/fishing/boot.png");
  const bootBox = viewBoxOf(fishingCatchSvg("boot"));
  assert.equal(bootBox.width * boot.height, bootBox.height * boot.width, "boot: 縦横比が元の PNG と違う");
});

test("the boat box is the old boat's, and the thread falls where .fishing-line hangs", () => {
  const png = pngSize("../src/assets/fishing/boat.png");
  const svg = fishingBoatSvg();
  const box = viewBoxOf(svg);
  assert.equal(box.width * png.height, box.height * png.width, "舟の箱の縦横比が元の PNG と違う");

  const shift = stylesCss.match(/\.fishing-boat\s*\{[^}]*transform:\s*translate\(-(\d+)%,\s*-(\d+)%\)/);
  assert.ok(shift, "styles.css の .fishing-boat の translate が見つからない");
  const thread = svg.match(/<path d="M([\d.]+) ([\d.]+) V ([\d.]+)"[^>]*stroke="#5A6B7B"/);
  assert.ok(thread, "竿の先から水面までの糸が見つからない");
  const [x, tipY, waterY] = [Number(thread[1]), Number(thread[2]), Number(thread[3])];
  // 糸は舟の箱の幅の 94% の x に垂れる（.fishing-line は画面の 50% で、箱を 94% 左へずらしている）。
  assert.ok(Math.abs(x / box.width - Number(shift[1]) / 100) < 0.005, `糸の x が箱の ${shift[1]}% と揃っていない（${x}）`);
  // 水面は箱の高さの 78% の y（.fishing-line の top: 30% に当たる）。
  assert.ok(Math.abs(waterY / box.height - Number(shift[2]) / 100) < 0.005, `糸の下端が箱の ${shift[2]}% と揃っていない（${waterY}）`);
  assert.ok(tipY > 0 && tipY < waterY, "竿の先が箱の中にない");
});

test("every decoration is hidden from assistive tech and none uses the scan-frame yellow", () => {
  const parts = [
    fishingBoatSvg(),
    fishingSkyHtml(),
    fishingSeaHtml(),
    ...["small", "medium", "large", "boot"].map((kind) => fishingCatchSvg(kind)),
  ];
  parts.forEach((html) => {
    const svgs = html.match(/<svg\b[^>]*>/g) ?? [];
    assert.ok(svgs.length > 0, "SVG がない");
    svgs.forEach((tag) => assert.match(tag, /aria-hidden="true"/, `aria-hidden がない: ${tag.slice(0, 80)}`));
    assert.doesNotMatch(html, /#FFC83D/i, "走査の枠の黄色 #FFC83D を使っている");
    assert.doesNotMatch(html, /<img\b/i, "画像ファイルを足している");
  });
});

/** コメントを外し、外側から順に { selector, body } を取り出す（@media は中まで）。 */
function rulesOf(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  function walk(text, media) {
    let depth = 0;
    let start = 0;
    let head = "";
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") {
        if (depth === 0) head = text.slice(start, i).trim();
        depth += 1;
        if (depth === 1) start = i + 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const body = text.slice(start, i);
          if (head.startsWith("@media")) walk(body, head);
          else rules.push({ selector: head, body, media });
          start = i + 1;
        }
      }
    }
  }
  walk(source, "");
  return rules;
}

/** 「,」で分ける。:is(a, b) の中の「,」では分けない。 */
function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of selector) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

test("world-fishing.css only styles the practice run", () => {
  const rules = rulesOf(worldCss).filter((rule) => !rule.selector.startsWith("@keyframes"));
  assert.ok(rules.length > 20, "規則が読み取れていない");
  rules.forEach((rule) => {
    splitSelectors(rule.selector).forEach((selector) => {
      assert.match(selector, /\.is-practice/, `.is-practice の下にない規則: ${selector.trim()}`);
    });
  });
});

test("endless motion stays on translate / rotate / scale (opacity only on the small bubbles)", () => {
  const keyframes = [...worldCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(keyframes.length >= 6, "キーフレームが読み取れていない");
  keyframes.forEach(([, name, body]) => {
    const props = new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]));
    props.forEach((prop) => {
      const allowed = ["translate", "rotate", "scale", "transform"].includes(prop) || (prop === "opacity" && name === "fishing-bubble");
      assert.ok(allowed, `${name}: 動かしてはいけない性質 ${prop}`);
    });
  });
  // 広い面の filter / box-shadow の遷移を入れていない。
  assert.doesNotMatch(worldCss.replace(/\/\*[\s\S]*?\*\//g, ""), /transition:[^;]*(filter|box-shadow)/i);
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("fishing world art tests passed");
