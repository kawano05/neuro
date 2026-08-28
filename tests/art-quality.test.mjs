// 画像素材の品質テスト。
//
// なぜ要るか: 素材の不具合は「ビルドが通り、絵も出るが、なんか変」という形で
// 出るので、目視以外に気づく手段が無かった。実際に一度やらかしている:
//
//   - 最適化でアルファが 0/255 の2値に潰れ、輪郭のアンチエイリアスが全部
//     消えていた（半透明ピクセルが1枚もゼロ個）。拡大すると階段状になる。
//   - crane のアームは掴んだ瞬間に claw-open → claw-closed へ差し替える。
//     画像の下端を掴む点に合わせて配置しているので、2枚の下マージンが違うと
//     その瞬間にアームが跳ね上がって見える。実測で34pxずれていた。
//
// どちらも「ファイルが存在するか」では捕まらない。ここでは中身を見る。
//
// PNG は依存を足さずに自前で読む（node:zlib だけ）。対象は自分たちで作った
// 素材だけなので、8bit の palette / RGBA / gray+alpha に限って対応し、
// それ以外は諦めて明示的に落とす。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { cranePrizes } from "../src/lib/content.js";

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

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** PNG のチャンクを順に取り出す。 */
function readChunks(buffer) {
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), "not a PNG");
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return chunks;
}

/** Paeth 予測子（PNG 仕様 9.4）。 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * PNG を読んで、幅・高さと「各画素のアルファ」だけを返す。
 * 色は見ないのでパレットの RGB は展開しない。
 */
function readPngAlpha(path) {
  const chunks = readChunks(readFileSync(path));
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR").data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  assert.equal(bitDepth, 8, `${path}: 対応していないビット深度 ${bitDepth}`);
  assert.equal(interlace, 0, `${path}: インターレースPNGには対応していない`);
  assert.ok([3, 4, 6].includes(colorType), `${path}: 対応していないカラータイプ ${colorType}`);

  const trns = chunks.find((chunk) => chunk.type === "tRNS")?.data ?? Buffer.alloc(0);
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((c) => c.data));
  const raw = inflateSync(idat);

  const channels = { 3: 1, 4: 2, 6: 4 }[colorType];
  const stride = width * channels;
  const alpha = new Uint8Array(width * height);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const line = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + left) & 0xff;
      else if (filter === 2) line[i] = (line[i] + up) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff;
      else assert.equal(filter, 0, `${path}: 未知のフィルタ ${filter}`);
    }
    for (let x = 0; x < width; x += 1) {
      const base = x * channels;
      if (colorType === 6) alpha[y * width + x] = line[base + 3];
      else if (colorType === 4) alpha[y * width + x] = line[base + 1];
      else alpha[y * width + x] = trns[line[base]] ?? 255;
    }
    previous = line;
  }

  return { width, height, alpha };
}

/** アルファの分布と、透明でない部分の外接矩形。 */
function describeAlpha(path) {
  const { width, height, alpha } = readPngAlpha(path);
  let opaque = 0;
  let semi = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alpha[y * width + x];
      if (a === 0) continue;
      if (a === 255) opaque += 1;
      else semi += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const corners = [
    alpha[0],
    alpha[width - 1],
    alpha[(height - 1) * width],
    alpha[height * width - 1],
  ];
  return {
    width,
    height,
    opaque,
    semi,
    corners,
    marginTop: minY,
    marginBottom: height - 1 - maxY,
    marginLeft: minX,
    marginRight: width - 1 - maxX,
  };
}

const assetPath = (relative) =>
  fileURLToPath(new URL(`../src/assets/${relative}`, import.meta.url));

const CRANE_ART = [
  "crane/claw-open.png",
  "crane/claw-closed.png",
  ...cranePrizes.map((prize) => `crane/${prize.asset}.png`),
];

test("crane art keeps anti-aliased edges (alpha is not collapsed to 0/255)", () => {
  CRANE_ART.forEach((relative) => {
    const info = describeAlpha(assetPath(relative));
    const ratio = info.semi / info.opaque;
    assert.ok(
      ratio >= 0.01,
      `${relative}: 半透明ピクセルが少なすぎる（semi=${info.semi} / opaque=${info.opaque} = ${(ratio * 100).toFixed(2)}%）。` +
        "最適化でアルファが2値に潰れていないか確認する"
    );
  });
});

test("crane art is cut out on a fully transparent background", () => {
  CRANE_ART.forEach((relative) => {
    const info = describeAlpha(assetPath(relative));
    assert.deepEqual(
      info.corners,
      [0, 0, 0, 0],
      `${relative}: 四隅が透明でない（背景が焼き込まれていないか確認する）`
    );
  });
});

test("the two claw frames line up, so swapping them does not move the arm", () => {
  // games/crane.js は画像の下端を掴む点に合わせて置き、掴んだ瞬間に
  // open → closed へ差し替える。ここがずれると、その瞬間にアームが跳ねる。
  const open = describeAlpha(assetPath("crane/claw-open.png"));
  const closed = describeAlpha(assetPath("crane/claw-closed.png"));

  assert.equal(open.width, closed.width, "アームの2枚は同じ幅でなければならない");
  assert.equal(open.height, closed.height, "アームの2枚は同じ高さでなければならない");
  const bottomGap = Math.abs(open.marginBottom - closed.marginBottom);
  const topGap = Math.abs(open.marginTop - closed.marginTop);
  assert.ok(
    bottomGap <= 2,
    `爪先の高さがずれている（下マージン open=${open.marginBottom} closed=${closed.marginBottom}）`
  );
  assert.ok(
    topGap <= 2,
    `シャフトの上端がずれている（上マージン open=${open.marginTop} closed=${closed.marginTop}）`
  );
});


test("generated slot symbol strip is wide, transparent and anti-aliased", () => {
  const info = describeAlpha(assetPath("slot/slot-symbol-strip-v1.png"));
  assert.ok(info.width >= 1200, `slot strip is too small: ${info.width}px`);
  assert.ok(info.width / info.height >= 2.5, "six symbols must stay in a wide strip");
  assert.deepEqual(info.corners, [0, 0, 0, 0], "slot strip background must remain transparent");
  assert.ok(info.opaque + info.semi > 100_000, "slot strip has too little visible art");
  assert.ok(info.semi > 1_000, "slot strip lost anti-aliased edges");
});

console.log(`\n${passed + failed} tests run, ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
console.log("art quality tests passed");
