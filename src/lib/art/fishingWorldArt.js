// =====================================================================
// art/fishingWorldArt.js — さかなつり（れんしゅうの回）の世界の絵
//
// 「押すと 出てくる」の海（partyArt.js の seaSceneHtml）とつながる海に、ラッコの舟を
// 浮かべる。空・雲・島、水の中の光・泡・海藻・砂・サンゴ、釣り人（ラッコ）、
// 魚3種と長靴。画像ファイルではなく SVG の文字列で持つのは hakkiriArt.js と同じ理由
// （オフラインで動かすため、色を1か所で変えられるため）。
// 黄色（#FFC83D）は走査の枠だけに使うので、ここでは使わない。
//
// 変えているのは絵だけ。位置・大きさ・時刻は games/fishing.js と styles.css のまま:
//   - 舟の箱は元の boat.png と同じ 720x444。竿の先（糸が出る点）は、箱の幅の 94%
//     （= .fishing-line の left: 50% と揃う x）に置く。
//   - 魚と長靴の箱は元の PNG と同じ縦横比（small 400x306 / medium 520x358 /
//     large 640x480 / boot 400x466）。表示の幅は styles.css の .fishing-swimmer が決める。
//
// そくていの回は、この絵を一切使わない（games/fishing.js の decoratePractice を通らない）。
// =====================================================================

import { SEA_RAYS_HTML, seaBubblesHtml, seaSurfaceSvg, seaWeedsHtml } from "./partyArt.js";

/**
 * 見え方の版。session.config.artVersion に残し、CSV の最後の列に出す。
 *
 * 釣り人・魚・長靴・海の絵は、れんしゅうの回に画面へ出る刺激そのもの。絵が変わった前後の回を
 * 同じ分布に混ぜないよう、どの版で走った回かを残す（リールの SLOT_ENGINE_VERSION と
 * 同じ考え方。測定条件は禁止せず記録する）。この列を持たない古い記録は空欄。
 *   1 … 画像ファイル（PNG）の絵。そくていの回は今もこの見え方
 *   2 … れんしゅうの回だけ、このファイルの SVG の絵と世界にした（2026-09-30）。
 *       位置・大きさ・時刻は 1 と同じ。そくていの回の見え方は 1 と同じ
 */
export const FISHING_ART_VERSION = 2;

const INK = "#10222E";
const WHITE = "#FFFFFF";

/**
 * 場面に沈まないための白いふち。押すと 出てくる の動物は CSS の drop-shadow を4方向に
 * 重ねているが、魚は毎フレーム動く（left を書き換える）ので、絵の中に描き込む。
 * 同じ形を白い太い線で1枚下に敷くだけ。
 */
function stickered(shapes, edge) {
  const under = shapes.map((shape) => `<path d="${shape.d}"/>`).join("");
  const over = shapes.map((shape) => `<path d="${shape.d}" fill="${shape.fill}"/>`).join("");
  return `<g fill="${WHITE}" stroke="${WHITE}" stroke-width="${edge}" stroke-linejoin="round">${under}</g>${over}`;
}

/** 目（黒目＋白いハイライト）。 */
function eye(cx, cy, r) {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}"/>` +
    `<circle cx="${cx + r * 0.36}" cy="${cy - r * 0.4}" r="${(r * 0.34).toFixed(1)}" fill="${WHITE}"/>`
  );
}

function smile(d, width) {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/** 魚・長靴の外側の <svg>。はみ出す白いふちは切らない。 */
function catchSvg(viewBox, inner) {
  return `<svg viewBox="${viewBox}" style="overflow:visible" aria-hidden="true" focusable="false">${inner}</svg>`;
}

// --- 魚（左向き）。色で大きさが分かる: 小=桃 / 中=橙 / 大=紫 ------------------

// 小: 丸くてちいさい桃色の魚（400x306）
function smallFish() {
  const shapes = [
    { d: "M276 160 C 300 130 340 90 388 62 C 372 112 372 208 388 258 C 340 230 300 190 276 160 Z", fill: "#E5585C" },
    { d: "M100 66 C 118 6 182 -2 226 58 C 190 50 140 52 100 66 Z", fill: "#E5585C" },
    { d: "M16 160 C 16 96 78 50 158 50 C 236 50 286 104 292 160 C 286 216 236 270 158 270 C 78 270 16 224 16 160 Z", fill: "#FF8082" },
    { d: "M34 190 C 60 250 150 278 240 240 C 262 226 278 208 288 184 C 270 236 216 270 158 270 C 100 270 50 240 34 190 Z", fill: "#FFD2D3" },
    { d: "M176 178 C 208 170 246 184 254 214 C 220 226 188 212 176 178 Z", fill: "#E5585C" },
  ];
  const detail =
    `<path d="M126 108 C 138 138 138 178 124 206" fill="none" stroke="#E5585C" stroke-width="6" stroke-linecap="round"/>` +
    `<ellipse cx="112" cy="180" rx="19" ry="12" fill="#FF4B00" opacity="0.3"/>` +
    eye(84, 128, 24) +
    smile("M34 184 C 46 200 70 204 88 192", 7);
  return catchSvg("0 0 400 306", stickered(shapes, 18) + detail);
}

// 中: ふつうの橙色の魚。しま模様（520x358）
function mediumFish() {
  const shapes = [
    { d: "M384 182 C 410 150 452 108 504 68 C 486 120 466 156 456 182 C 466 208 486 244 504 296 C 452 256 410 214 384 182 Z", fill: "#D98700" },
    { d: "M130 74 C 156 14 250 4 312 74 C 262 60 190 60 130 74 Z", fill: "#D98700" },
    { d: "M230 292 C 250 330 290 340 316 334 C 306 312 284 296 258 290 Z", fill: "#D98700" },
    { d: "M18 182 C 26 110 110 58 214 58 C 318 58 388 112 402 182 C 388 250 318 306 214 306 C 110 306 26 254 18 182 Z", fill: "#F6AA00" },
    { d: "M40 214 C 80 288 200 316 320 268 C 350 254 376 232 392 204 C 372 262 300 306 214 306 C 120 306 56 262 40 214 Z", fill: "#FFE2A6" },
    { d: "M200 200 C 236 192 280 210 288 246 C 246 256 208 240 200 200 Z", fill: "#D98700" },
  ];
  const stripes =
    `<path d="M262 82 C 280 132 280 232 262 284" fill="none" stroke="#FFF1CC" stroke-width="22" stroke-linecap="round"/>` +
    `<path d="M330 104 C 342 142 342 222 330 260" fill="none" stroke="#FFF1CC" stroke-width="18" stroke-linecap="round"/>`;
  const detail =
    `<ellipse cx="134" cy="206" rx="21" ry="13" fill="#FF4B00" opacity="0.3"/>` +
    eye(96, 146, 26) +
    smile("M40 208 C 54 226 84 230 106 216", 8);
  return catchSvg("0 0 520 358", stickered(shapes, 20) + stripes + detail);
}

// 大: どっしりした紫色の魚。背びれが高く、水玉（640x480）
function largeFish() {
  const shapes = [
    { d: "M488 260 C 518 216 566 152 626 100 C 606 172 600 220 614 260 C 600 300 606 348 626 420 C 566 368 518 304 488 260 Z", fill: "#B14A97" },
    { d: "M150 104 C 178 20 320 0 410 100 C 340 78 240 76 150 104 Z", fill: "#B14A97" },
    { d: "M280 424 C 304 466 356 476 396 466 C 384 438 350 420 318 416 Z", fill: "#B14A97" },
    { d: "M20 260 C 26 152 132 84 264 84 C 398 84 490 150 506 260 C 490 370 398 436 264 436 C 132 436 26 368 20 260 Z", fill: "#D65DB1" },
    { d: "M46 310 C 96 412 250 450 400 386 C 448 362 484 326 500 286 C 480 386 390 436 264 436 C 140 436 66 380 46 310 Z", fill: "#F6C4E8" },
    { d: "M240 290 C 290 278 350 302 362 352 C 304 366 252 344 240 290 Z", fill: "#B14A97" },
  ];
  const spots =
    `<circle cx="252" cy="166" r="17" fill="#F29AD5"/><circle cx="332" cy="150" r="12" fill="#F29AD5"/>` +
    `<circle cx="404" cy="196" r="15" fill="#F29AD5"/><circle cx="318" cy="222" r="10" fill="#F29AD5"/>`;
  const detail =
    `<ellipse cx="170" cy="282" rx="28" ry="16" fill="#FF8082" opacity="0.5"/>` +
    eye(134, 206, 34) +
    smile("M42 296 C 60 322 102 328 134 308", 9);
  return catchSvg("0 0 640 480", stickered(shapes, 22) + spots + detail);
}

// --- 長靴（400x466）。色をくすませて、魚ではなく「拾いもの」に見せる -----------

function boot() {
  const shapes = [
    {
      d: "M152 16 L 352 16 Q 384 16 384 48 L 384 396 Q 384 452 328 452 L 98 452 Q 14 452 14 386 Q 14 340 70 330 Q 146 318 146 250 L 146 48 Q 146 16 152 16 Z",
      fill: "#A8683D",
    },
    { d: "M152 16 L 352 16 Q 384 16 384 48 L 384 92 L 146 92 L 146 48 Q 146 16 152 16 Z", fill: "#8A5431" },
    { d: "M15 392 L 384 392 L 384 396 Q 384 452 328 452 L 98 452 Q 14 452 14 392 Z", fill: "#6F4326" },
  ];
  const detail =
    `<path d="M178 122 L 178 300" stroke="#C48A5C" stroke-width="14" stroke-linecap="round" fill="none"/>` +
    `<g transform="rotate(8 270 234)"><rect x="232" y="196" width="76" height="76" rx="10" fill="#F6AA00"/>` +
    `<rect x="240" y="204" width="60" height="60" rx="6" fill="none" stroke="#6F4326" stroke-width="4" stroke-dasharray="8 7"/></g>` +
    `<path d="M60 372 L 112 362 M88 388 L 134 380" stroke="#8A5431" stroke-width="8" stroke-linecap="round" fill="none"/>` +
    `<path d="M338 16 C 372 60 330 104 358 156" fill="none" stroke="#1FB57A" stroke-width="13" stroke-linecap="round"/>`;
  return catchSvg("0 0 400 466", stickered(shapes, 18) + detail);
}

const CATCH_ART = { small: smallFish, medium: mediumFish, large: largeFish, boot };

/**
 * 泳いでくるもの1つ。kind は content.js の fishingSpecies の id（small / medium / large）か
 * "boot"（長靴）。
 */
export function fishingCatchSvg(kind) {
  const draw = CATCH_ART[kind] ?? CATCH_ART.medium;
  return draw();
}

// --- 舟とラッコ（720x444） -----------------------------------------------------
//
// 竿の先 T=(677,40)。.fishing-line は舟の箱の幅の 94% = 676.8 に垂れるので、ここから
// 水面 (y=346 = 箱の高さの 78%) まで細い糸を描いておくと、竿の先から水の中まで
// 1本の糸に見える。舟は箱の中で左に寄せてあり、糸は船首から十分離れている。
//
// 舟は元の絵と同じく、水面（箱の高さの 78%）をまたいで手前に浮かぶ。船底に白い波を
// 敷いて、水に浮かんでいることを見せる。

const OTTER = { body: "#A8683D", dark: "#8A5431", darker: "#6F4326", belly: "#ECD0AA", face: "#F3E0C4", nose: "#3A2418" };

const HULL =
  "M28 288 Q 316 336 606 268 C 596 366 520 418 414 420 L 232 420 C 118 418 44 372 28 290 Z";
const HULL_CLIP_ID = "fishing-hull-clip";
const TAIL = "M108 304 Q 58 304 46 252";
// ラッコは胴のふち（300,316）を中心に少し大きくして、舟に乗せる。
const OTTER_XF = "translate(300 316) scale(1.15) translate(-300 -316)";
const HAT = "M226 118 C 226 58 374 58 374 118 Z";

/** 船底の白い波（丸い泡の連なり）。 */
function foam(x0, x1, y) {
  let dots = "";
  let i = 0;
  for (let x = x0; x <= x1; x += 21) {
    const lift = i % 2 === 0 ? 0 : 4;
    dots += `<circle cx="${x}" cy="${y + lift}" r="${i % 3 === 0 ? 14 : 12}"/>`;
    i += 1;
  }
  return `<g fill="${WHITE}" opacity="0.95">${dots}</g>`;
}

/**
 * 釣り人（ラッコ）の体の部品。partyArt.js の otterSvg と同じ色・同じ描き方。
 * 竿を持つ手は、竿の線（下の rod）の上に来るように置いてある。
 */
function otterParts() {
  const { body, dark, darker, belly, face, nose } = OTTER;
  return (
    // 胴と、おなか
    `<ellipse cx="300" cy="330" rx="96" ry="84" fill="${body}"/>` +
    `<ellipse cx="300" cy="340" rx="62" ry="62" fill="${belly}"/>` +
    // 舟のふちに置いた左手
    `<ellipse cx="226" cy="298" rx="22" ry="34" fill="${dark}" transform="rotate(20 226 298)"/>` +
    `<path d="M214 312 l 2 -8 M224 316 l 1 -9 M234 314 l -1 -8" stroke="${darker}" stroke-width="3.5" stroke-linecap="round"/>` +
    // 耳
    `<circle cx="222" cy="154" r="22" fill="${dark}"/><circle cx="378" cy="154" r="22" fill="${dark}"/>` +
    `<circle cx="222" cy="154" r="11" fill="${darker}"/><circle cx="378" cy="154" r="11" fill="${darker}"/>` +
    // 頭・口のまわり・ほお
    `<circle cx="300" cy="176" r="88" fill="${body}"/>` +
    `<ellipse cx="300" cy="212" rx="66" ry="46" fill="${face}"/>` +
    `<circle cx="240" cy="216" r="11" fill="#FF8082" opacity="0.5"/><circle cx="360" cy="216" r="11" fill="#FF8082" opacity="0.5"/>` +
    // 目（まばたきは CSS の .fishing-otter-eyes）
    `<g class="fishing-otter-eyes"><circle cx="270" cy="168" r="12" fill="#1A1A1A"/><circle cx="330" cy="168" r="12" fill="#1A1A1A"/>` +
    `<circle cx="274.5" cy="163.5" r="4" fill="${WHITE}"/><circle cx="334.5" cy="163.5" r="4" fill="${WHITE}"/></g>` +
    `<ellipse cx="300" cy="196" rx="15" ry="11" fill="${nose}"/>` +
    `<path d="M300 206 v8 M300 214 q -11 12 -22 2 M300 214 q 11 12 22 2" stroke="${nose}" stroke-width="4.5" fill="none" stroke-linecap="round"/>` +
    `<path d="M250 208 l -32 -6 M250 218 l -32 4 M350 208 l 32 -6 M350 218 l 32 4" stroke="${nose}" stroke-width="3" stroke-linecap="round"/>` +
    // つばのある青い帽子（元の男の子の青い帽子と同じ青）
    `<path d="${HAT}" fill="#005AFF"/>` +
    `<ellipse cx="300" cy="120" rx="92" ry="16" fill="#004FE0"/>` +
    `<path d="M232 106 Q 300 122 368 106 L 370 116 Q 300 134 230 116 Z" fill="${WHITE}"/>` +
    // 竿を持つ右手
    `<path d="M370 288 Q 398 302 427 270" fill="none" stroke="${dark}" stroke-width="40" stroke-linecap="round"/>` +
    `<circle cx="427" cy="263" r="22" fill="${dark}"/>` +
    `<path d="M438 250 l 8 -6 M442 262 l 10 -2 M440 274 l 9 2" stroke="${darker}" stroke-width="4" stroke-linecap="round"/>`
  );
}

/**
 * 舟にすわるラッコ。.fishing-boat の箱（min(280px, 30%)、720x444）にそのまま入る。
 * @returns {string}
 */
export function fishingBoatSvg() {
  // 竿と糸は、白いふちの下敷きに入れない（細いので、ふちを付けると太って見える）。
  const rod = `<path d="M406.3 284 L 676.2 39.1 L 677.8 40.9 L 413.7 292 Z" fill="${OTTER.darker}"/>`;
  // 糸は空の上でも見えるように灰青にする（水の中は CSS の白い糸）。
  const line = `<path d="M677 40 V 346" stroke="#5A6B7B" stroke-width="2" fill="none" vector-effect="non-scaling-stroke"/>`;
  const halo =
    `<g fill="${WHITE}" stroke="${WHITE}" stroke-width="16" stroke-linejoin="round">` +
    `<path d="${HULL}"/>` +
    `<g transform="${OTTER_XF}"><ellipse cx="300" cy="330" rx="96" ry="84"/><circle cx="300" cy="176" r="88"/>` +
    `<circle cx="222" cy="154" r="22"/><circle cx="378" cy="154" r="22"/><path d="${HAT}"/><ellipse cx="300" cy="120" rx="92" ry="16"/></g>` +
    `<path d="${TAIL}" fill="none" stroke-width="58"/>` +
    `</g>`;
  return `<svg class="fishing-boat" viewBox="0 0 720 444" aria-hidden="true" focusable="false">
    <defs><clipPath id="${HULL_CLIP_ID}"><path d="${HULL}"/></clipPath></defs>
    ${halo}
    <path d="${TAIL}" fill="none" stroke="${OTTER.dark}" stroke-width="42" stroke-linecap="round"/>
    <path d="M32 286 Q 316 334 606 268 L 596 250 Q 316 296 40 268 Z" fill="#B23200"/>
    <g transform="${OTTER_XF}">${otterParts()}</g>
    ${rod}
    <path d="${HULL}" fill="#FF4B00"/>
    <g clip-path="url(#${HULL_CLIP_ID})">
      <path d="M0 326 Q 316 376 640 304 L 640 328 Q 316 400 0 352 Z" fill="${WHITE}"/>
      <path d="M0 362 Q 316 410 640 346 V 444 H 0 Z" fill="#D93F00"/>
    </g>
    ${foam(78, 580, 414)}
    ${line}
  </svg>`;
}

// --- 空（雲・島） --------------------------------------------------------------

function cloudSvg(className) {
  return `<svg class="fishing-cloud ${className}" viewBox="0 0 200 80" aria-hidden="true" focusable="false"><g fill="#FFFFFF"><circle cx="58" cy="48" r="26"/><circle cx="96" cy="34" r="32"/><circle cx="136" cy="46" r="28"/><rect x="34" y="46" width="128" height="28" rx="14"/></g><path d="M40 62 Q 100 72 160 62 L 160 66 Q 100 82 40 66 Z" fill="#D8F0FF"/></svg>`;
}

function islandSvg() {
  return `<svg class="fishing-island" viewBox="0 0 300 120" aria-hidden="true" focusable="false">
    <path d="M0 120 C 30 84 70 64 120 66 C 170 70 200 90 232 100 C 262 108 288 112 300 120 Z" fill="#02875E"/>
    <path d="M22 120 C 52 90 100 76 150 86 C 190 94 222 108 262 120 Z" fill="#03AF7A"/>
    <path d="M0 120 C 60 110 200 110 300 120 Z" fill="#E3C98D"/>
    <path d="M108 92 Q 116 62 104 34" fill="none" stroke="#8A5431" stroke-width="6" stroke-linecap="round"/>
    <path d="M104 34 Q 84 18 60 34 Q 86 30 104 34 Z M104 34 Q 124 16 150 30 Q 124 30 104 34 Z M104 34 Q 96 12 106 2 Q 112 20 104 34 Z" fill="#1FB57A"/>
    <path d="M160 96 Q 164 76 156 58" fill="none" stroke="#8A5431" stroke-width="5" stroke-linecap="round"/>
    <path d="M156 58 Q 140 46 122 58 Q 142 52 156 58 Z M156 58 Q 172 44 190 56 Q 170 52 156 58 Z" fill="#02875E"/>
  </svg>`;
}

/** .fishing-sky の中身（夕暮れの空・遠くの島・ゆっくり流れる雲）。 */
export function fishingSkyHtml() {
  return (
    `<span class="fishing-dusk-sky"></span>` +
    `<svg class="fishing-island-far" viewBox="0 0 300 120" aria-hidden="true" focusable="false"><path d="M0 120 C 40 86 90 72 150 80 C 210 88 260 104 300 120 Z" fill="#A8DCCB"/></svg>` +
    islandSvg() +
    cloudSvg("fishing-cloud-a") +
    cloudSvg("fishing-cloud-b") +
    cloudSvg("fishing-cloud-c")
  );
}

// --- 水の中 -------------------------------------------------------------------

// 泡・海藻の置き場。糸のまわり（アタリの起きる場所。画面の中央付近）は空けてある。
// 周期は 13 / 17 / 23 秒だけ（styles.css の環境の動きの決まりと同じ。前刺激間隔と
// 同期して見える周期を避ける）。
const FISHING_BUBBLES = [
  [7, 13, 12, -2], [15, 17, 9, -9], [24, 23, 16, -14], [33, 13, 8, -6],
  [68, 17, 14, -4], [77, 23, 10, -17], [86, 13, 16, -8], [94, 17, 9, -11],
];
// 高さは水の高さに対する %。背が低い画面でも魚の道筋（水の中の45%あたり）にかからない。
const FISHING_WEEDS = [
  [3, 26, "#0F8A5F", -1], [8, 20, "#1FB57A", -3], [13, 13, "#0F8A5F", -5],
  [83, 15, "#1FB57A", -2], [88, 27, "#0F8A5F", -4.5], [94, 19, "#1FB57A", -6],
];

/** 遠くの魚の小さな群れ。明るい海に溶ける水色で、狙う魚（色つき・白いふち）と見分けがつく。 */
function schoolSvg(className) {
  const fish = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="17" ry="9"/><path d="M14 0 L 30 -9 L 30 9 Z"/></g>`;
  return `<svg class="fishing-school ${className}" viewBox="0 0 130 64" aria-hidden="true" focusable="false"><g fill="#BFE8FF">${fish(30, 14, 1)}${fish(78, 32, 0.85)}${fish(46, 50, 0.7)}${fish(104, 12, 0.6)}</g></svg>`;
}

function floorSvg() {
  return `<svg class="sea-floor" viewBox="0 0 1180 120" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M0 52 C 160 32 300 62 460 46 S 760 30 900 48 S 1100 58 1180 42 V120 H0 Z" fill="#E3C98D"/>
    <path d="M90 92 q 30 -9 60 0 M 400 100 q 30 -9 60 0 M 700 96 q 30 -9 60 0 M 1000 102 q 30 -9 60 0" stroke="#CDB073" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="190" cy="56" rx="48" ry="22" fill="#4F6784"/><ellipse cx="236" cy="64" rx="26" ry="14" fill="#5D7796"/>
    <ellipse cx="1010" cy="52" rx="40" ry="18" fill="#56708F"/>
    <path d="M860 54 v-34 M860 34 l-14 -14 M860 28 l12 -16 M872 54 v-22 M872 40 l10 -10" stroke="#FF8082" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M320 58 C 296 40 300 18 316 8 C 322 26 336 30 350 22 C 356 40 350 52 336 58 Z" fill="#D65DB1"/>
    <path d="M330 58 V 30" stroke="#A83F8F" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(-160 0)"><path d="M560 84 L 570 66 L 580 84 L 598 88 L 584 100 L 588 118 L 570 108 L 552 118 L 556 100 L 542 88 Z" fill="#FF4B00"/>
    <circle cx="570" cy="90" r="4" fill="#FF8082"/></g>
    <path d="M748 100 q 22 -30 44 0 z" fill="#FFFFFF"/><path d="M770 70 v30 M758 78 l6 22 M782 78 l-6 22" stroke="#FF8082" stroke-width="3" stroke-linecap="round"/>
    <path d="M1090 62 q 12 -14 24 0 q -2 12 -12 12 q -10 0 -12 -12 z" fill="#F6AA00"/>
  </svg>`;
}

/** .fishing-deep の中身（水の中の世界。押すと 出てくる の海と同じ部品・同じ色）。 */
export function fishingSeaHtml() {
  return `<span class="fishing-sea">
    ${SEA_RAYS_HTML}
    <span class="sea-spot"></span>
    ${seaSurfaceSvg()}
    <span class="sea-bubbles">${seaBubblesHtml(FISHING_BUBBLES)}</span>
    ${schoolSvg("fishing-school-a")}${schoolSvg("fishing-school-b")}${schoolSvg("fishing-school-c")}${schoolSvg("fishing-school-d")}
    ${seaWeedsHtml(FISHING_WEEDS, "%")}
    ${floorSvg()}
  </span>`;
}
