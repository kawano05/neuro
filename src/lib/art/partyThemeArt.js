// =====================================================================
// art/partyThemeArt.js — 遊びごとのお祝いの絵（src/lib/partyThemes.js の欄の名前から描く）
//
//   びんにたまるもの … 星（押すと 出てくる）・ふうせん・絵の具・ボール・リールの絵がら・アームの景品・魚・音符
//   観客            … 魚（海）・小鳥（空）・クレヨン（アトリエ）・応援団（スタジアム）。はじめの遊びだけ
//   パレード        … 動物と魚・ふうせん・クレヨン・ジェット風船・絵がら・景品・魚・音符
//   見せ場          … くす玉（ふうせん）・金の札（ぬりえの額縁）
// リールの絵がら・景品・魚は、その遊びの絵（slotWorldArt・craneWorldArt・fishingWorldArt）を
// そのまま使う。遊んでいたものが、お祝いにも出てくるように。
// 黄色（#FFC83D）は走査の枠だけに使うので、ここでは使わない。
// =====================================================================

import { POP_ANIMALS, artSvg } from "./hakkiriArt.js";
import { cranePrizeSvg } from "./craneWorldArt.js";
import { fishingCatchSvg } from "./fishingWorldArt.js";
import { slotSymbolSvg } from "./slotWorldArt.js";
import { JAR_SLOTS, PARTY_FANS, STAR_COLORS, fishSvg, jarSvg, starSvg } from "./partyArt.js";
import { partyThemeFor } from "../partyThemes.js";

const INK = "#1A1A1A";

function svg(viewBox, body, extra = "") {
  return `<svg viewBox="${viewBox}"${extra} aria-hidden="true" focusable="false">${body}</svg>`;
}

// --- びんにたまるもの（viewBox 24x24） -------------------------------------

/** 小さなふうせん。 */
export function balloonItemSvg(color) {
  return svg(
    "0 0 24 24",
    `<path d="M12 19.6 Q 10.4 21.6 12.6 23.6" stroke="#5A6B7B" stroke-width="1.2" fill="none"/>` +
      `<ellipse cx="12" cy="9.6" rx="7.4" ry="8.6" fill="${color}" stroke="${INK}" stroke-width="1.6"/>` +
      `<path d="M10.5 18.1 L 13.5 18.1 L 12 20.1 Z" fill="${color}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<ellipse cx="9.2" cy="6.6" rx="1.7" ry="2.9" fill="#FFFFFF" opacity="0.6"/>`
  );
}

/** 絵の具のしずく。 */
export function paintItemSvg(color) {
  return svg(
    "0 0 24 24",
    `<path d="M12 2.4 C 12 2.4 4.4 11 4.4 15.3 A 7.6 7.6 0 0 0 19.6 15.3 C 19.6 11 12 2.4 12 2.4 Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M8.5 14.6 Q 8.7 17.7 11.2 18.7" stroke="#FFFFFF" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.7"/>`
  );
}

/** 野球のボール。 */
export function ballItemSvg() {
  return svg(
    "0 0 24 24",
    `<circle cx="12" cy="12" r="9.6" fill="#FFFFFF" stroke="${INK}" stroke-width="1.6"/>` +
      `<path d="M6.3 4.9 Q 9.8 12 6.3 19.1 M17.7 4.9 Q 14.2 12 17.7 19.1" fill="none" stroke="#E03A3A" stroke-width="1.5" stroke-dasharray="1.7 1.3"/>`
  );
}

/** 音符（8分音符）。 */
export function noteSvg(color) {
  return svg(
    "0 0 24 24",
    `<path d="M13 16.4 V 3.4" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<path d="M13 16.4 V 3.4" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>` +
      `<path d="M13 3.2 Q 20 5.6 19 11.6 Q 17.4 8.4 13 8.3 Z" fill="${color}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<ellipse cx="8.8" cy="17.4" rx="5" ry="3.7" transform="rotate(-22 8.8 17.4)" fill="${color}" stroke="${INK}" stroke-width="1.5"/>`
  );
}

const SLOT_SYMBOLS = ["circle", "star", "fish", "flower", "bird", "square"];
const CRANE_PRIZES = ["prize-bear", "prize-rabbit", "prize-star"];
const FISH_KINDS = ["small", "medium", "large"];

/** びんの中身の絵（item の名前 → index 番目の絵）。 */
const ITEM_ART = {
  star: (index) => starSvg(STAR_COLORS[index % STAR_COLORS.length]),
  balloon: (index, colors) => balloonItemSvg(colors[index % colors.length]),
  paint: (index, colors) => paintItemSvg(colors[index % colors.length]),
  ball: () => ballItemSvg(),
  symbol: (index) => slotSymbolSvg(SLOT_SYMBOLS[index % SLOT_SYMBOLS.length]),
  prize: (index) => cranePrizeSvg(CRANE_PRIZES[index % CRANE_PRIZES.length]),
  fish: (index, colors) => fishSvg(colors[index % colors.length]),
  note: (index, colors) => noteSvg(colors[index % colors.length]),
};

/** その遊びの、びんに入る index 番目のもの（型が無ければ星）。 */
export function themeItemSvg(themeId, index) {
  const look = partyThemeFor(themeId) ?? partyThemeFor("pop");
  return (ITEM_ART[look.item] ?? ITEM_ART.star)(index, look.itemColors);
}

/** びん1つぶんの中身の印（index 番目の置き場に、その遊びの絵）。 */
export function jarItemHtml(themeId, index) {
  const slot = JAR_SLOTS[index];
  return `<span class="party-item" style="left:${slot.left.toFixed(2)}%;top:${slot.top.toFixed(2)}%">${themeItemSvg(themeId, index)}</span>`;
}

/** びんの中身（先頭から count 個）。 */
export function jarItemsHtml(count, themeId = "pop") {
  return JAR_SLOTS.slice(0, count)
    .map((_, index) => jarItemHtml(themeId, index))
    .join("");
}

/** 中身の入ったびん1つ（けっかの「きょうの びん」の並び。その日の遊びをまたぐので星）。 */
export function miniJarHtml() {
  return `<span class="party-mini-jar">${jarSvg()}<span class="party-jar-items">${jarItemsHtml(15)}</span></span>`;
}

// --- 観客（viewBox 120x80。左向き。はじめの遊びのおおさわぎ） -------------------

/** 小鳥（ふうせんの空）。 */
export function birdSvg(color) {
  return svg(
    "0 0 120 80",
    `<path d="M86 48 L 114 36 L 110 58 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M50 72 v 7 M66 72 v 7" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      `<ellipse cx="60" cy="46" rx="34" ry="28" fill="${color}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M58 44 Q 74 28 90 44 Q 76 60 58 44 Z" fill="#FFFFFF" fill-opacity="0.5" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M28 39 L 10 46 L 28 51 Z" fill="#F6AA00" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<circle cx="40" cy="36" r="5.5" fill="${INK}"/><circle cx="41.8" cy="34.2" r="1.8" fill="#FFFFFF"/>` +
      `<ellipse cx="44" cy="53" rx="5" ry="3.4" fill="#FF8082" opacity="0.7"/>`
  );
}

/** クレヨン（ぬりえのアトリエ。顔つき）。 */
export function crayonSvg(color) {
  return svg(
    "0 0 120 80",
    `<path d="M18 24 H 88 L 114 40 L 88 56 H 18 Q 8 56 8 40 Q 8 24 18 24 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M100 32 L 114 40 L 100 48" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" opacity="0.45"/>` +
      `<rect x="30" y="24" width="44" height="32" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="45" cy="37" r="3.6" fill="${INK}"/><circle cx="59" cy="37" r="3.6" fill="${INK}"/>` +
      `<path d="M46 45 q 6 6 12 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<ellipse cx="38" cy="45" rx="3.4" ry="2.4" fill="#FF8082" opacity="0.8"/><ellipse cx="66" cy="45" rx="3.4" ry="2.4" fill="#FF8082" opacity="0.8"/>`
  );
}

/** 応援団（スタジアム。帽子とメガホン）。 */
export function fanSvg(color) {
  return svg(
    "0 0 120 80",
    `<path d="M66 50 L 110 30 L 110 70 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<ellipse cx="110" cy="50" rx="5" ry="20" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="42" cy="48" r="25" fill="#F6D2B0" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M17 42 Q 18 18 42 18 Q 66 18 67 42 Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M6 44 Q 26 37 46 42" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M30 52 q 4 -5 8 0 M44 52 q 4 -5 8 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<path d="M37 59 q 5 9 10 0 z" fill="#C9455B" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`
  );
}

const CROWD_ART = { fish: fishSvg, bird: birdSvg, crayon: crayonSvg, fan: fanSvg };

/** 観客1人ぶんの絵（型の crowd。無ければ空）。 */
export function crowdSvg(kind, color) {
  return CROWD_ART[kind]?.(color) ?? "";
}

// --- パレード ------------------------------------------------------------

/** 空へ上がるふうせん（ふうせん わり の絵と同じ形。viewBox 120x190）。 */
export function paradeBalloonSvg(color) {
  return svg(
    "0 0 120 190",
    `<path d="M60 130 C 50 150, 70 166, 60 188" fill="none" stroke="#5A6B7B" stroke-width="2.5"/>` +
      `<ellipse cx="60" cy="62" rx="48" ry="58" fill="${color}"/>` +
      `<path d="M52 118 L 68 118 L 60 130 Z" fill="${color}"/>` +
      `<ellipse cx="44" cy="40" rx="10" ry="17" fill="#FFFFFF" opacity="0.5"/>`
  );
}

/** ジェット風船（スタジアムの応援で空へ飛ばす細長いふうせん。viewBox 40x160）。 */
export function jetBalloonSvg(color) {
  return svg(
    "0 0 40 160",
    `<path d="M20 4 C 32 4 34 30 33 70 C 32 110 28 134 22 146 L 18 146 C 12 134 8 110 7 70 C 6 30 8 4 20 4 Z" fill="${color}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M18 146 L 22 146 L 23.5 155 L 16.5 155 Z" fill="${color}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M14 20 Q 12 60 14 100" stroke="#FFFFFF" stroke-width="4" opacity="0.55" fill="none" stroke-linecap="round"/>`
  );
}

const PARADE_COLORS = ["#FF4B00", "#03AF7A", "#005AFF", "#F6AA00", "#D65DB1", "#4DC4FF", "#990099", "#FF8082"];

/**
 * パレードに出るもの（{html, fish}。fish は白いふちを付けない絵）。押すと 出てくる は元のまま
 * （動物と観客の魚）。ほかは、その遊びの絵が出てくる。
 */
export function paradeItems(themeId) {
  const look = partyThemeFor(themeId) ?? partyThemeFor("pop");
  const plain = (html) => ({ html, fish: false });
  switch (look.id) {
    case "balloon":
      return PARADE_COLORS.map((color) => plain(paradeBalloonSvg(color)));
    case "coloring":
      return PARADE_COLORS.slice(0, 7).map((color) => plain(crayonSvg(color)));
    case "baseball":
      return [...PARADE_COLORS, ...PARADE_COLORS].map((color) => plain(jetBalloonSvg(color)));
    case "slot":
      return [...SLOT_SYMBOLS, ...SLOT_SYMBOLS].map((id) => plain(slotSymbolSvg(id)));
    case "crane":
      return [...CRANE_PRIZES, ...CRANE_PRIZES].map((id) => plain(cranePrizeSvg(id)));
    case "fishing":
      return [...FISH_KINDS, ...FISH_KINDS].map((kind) => ({ html: fishingCatchSvg(kind), fish: true }));
    case "gonogo":
      return PARADE_COLORS.map((color) => plain(noteSvg(color)));
    default:
      return [
        ...POP_ANIMALS.map((animal) => plain(artSvg(animal))),
        ...PARTY_FANS.map((fan) => ({ html: fishSvg(fan.color), fish: true })),
      ];
  }
}

// --- 見せ場 ---------------------------------------------------------------

/**
 * くす玉の半分（viewBox 100x200。左半分。右は CSS で裏返す）。金の玉に花の模様。
 * 上の真ん中（100,0）が ちょうつがい。
 */
export function kusudamaHalfSvg() {
  return svg(
    "0 0 100 200",
    `<path d="M100 4 A 96 96 0 0 0 100 196 Z" fill="#F6AA00" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M100 40 A 60 60 0 0 0 40 100 M100 160 A 60 60 0 0 1 40 100" fill="none" stroke="#D98700" stroke-width="6"/>` +
      `<circle cx="34" cy="62" r="9" fill="#FF8082" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="26" cy="118" r="9" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="60" cy="160" r="9" fill="#D65DB1" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="66" cy="34" r="8" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>` +
      `<circle cx="70" cy="96" r="8" fill="#FF4B00" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M22 70 Q 30 40 60 22" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity="0.5"/>`,
    ' preserveAspectRatio="none"'
  );
}

/** 金の札（ぬりえの額縁に付けるロゼット。viewBox 100x130）。 */
export function rosetteSvg() {
  return svg(
    "0 0 100 130",
    `<path d="M30 66 L 16 124 L 34 112 L 44 128 L 52 72 Z" fill="#FF4B00" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M70 66 L 84 124 L 66 112 L 56 128 L 48 72 Z" fill="#005AFF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="50" cy="48" r="44" fill="#FF8082" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="50" cy="48" r="33" fill="#F6AA00" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M50 24 L 56.5 39.5 L 73 40.5 L 60.5 51.5 L 64.5 68 L 50 59 L 35.5 68 L 39.5 51.5 L 27 40.5 L 43.5 39.5 Z" fill="#FFFFFF" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
  );
}
