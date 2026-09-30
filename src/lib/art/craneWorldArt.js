// =====================================================================
// art/craneWorldArt.js — 「アームで つかむ」（れんしゅうの回）の世界の絵
//
// おもちゃ屋さんのクレーンゲーム。景品3つ・アーム・箱の中の部屋・床のマット・
// 台の外の飾りを、hakkiriArt.js の描き方（平たい形・はっきりした色・黒目に白い
// ハイライト・#1A1A1A の輪郭）でそろえる。
//
// 画像ファイル（src/assets/crane/*.png）は、そくていの回が今のまま使う。
// そくていの回の見え方は測定の条件なので、この絵は games/crane.js が
// `difficultyMode !== "measure"` のときだけ差し込む（守る線）。
//
// 画像ではなく SVG の文字列で持つ理由は hakkiriArt.js と同じ（オフラインで動かす
// ため、色を1か所で変えられるため）。飾りは常に aria-hidden（artSvg が付ける）。
//
// 大きさ・足元・つかむ点の合わせ方:
//   景品もアームも、PNG と同じ viewBox・同じ足元の余白にしてある。景品の置き場所
//   （craneGeometry.js の project）と、アームの下端＝つかむ点は、絵が変わっても
//   動かないようにするため。アームは開いた絵と閉じた絵で下端（中央の指の先）を
//   そろえる（tests/art-quality.test.mjs の冒頭のコメント: 昔 34px 跳ねた）。
// 黄色（#FFC83D）は走査の枠の色なので、ここでは使わない。
// =====================================================================

import { project } from "../games/craneGeometry.js";
import { artSvg } from "./hakkiriArt.js";

const INK = "#1A1A1A";
const EYE = "#10222E";

// --- 景品（content.js の cranePrizes[].asset をキーにする） -------------

/** 景品の絵。viewBox は PNG（prize-*.png）と同じ縦横比・足元の余白にしてある。 */
export const CRANE_PRIZE_ART = {
  // くま: 明るい茶に、ほっぺとお腹。 viewBox 220x230（足元は下から約16）
  "prize-bear": {
    viewBox: "0 0 220 230",
    body: `<circle cx="58" cy="46" r="26" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><circle cx="162" cy="46" r="26" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><circle cx="58" cy="47" r="12" fill="#F6C9A0"/><circle cx="162" cy="47" r="12" fill="#F6C9A0"/><ellipse cx="52" cy="150" rx="17" ry="26" transform="rotate(14 52 150)" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="168" cy="150" rx="17" ry="26" transform="rotate(-14 168 150)" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="110" cy="158" rx="56" ry="54" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="110" cy="166" rx="32" ry="34" fill="#F6D9B5"/><ellipse cx="74" cy="199" rx="25" ry="14" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="146" cy="199" rx="25" ry="14" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="74" cy="200" rx="12" ry="7" fill="#F6D9B5"/><ellipse cx="146" cy="200" rx="12" ry="7" fill="#F6D9B5"/><circle cx="110" cy="86" r="55" fill="#D08A4E" stroke="${INK}" stroke-width="6"/><ellipse cx="110" cy="104" rx="25" ry="19" fill="#F6D9B5"/><ellipse cx="72" cy="102" rx="9" ry="6" fill="#FF8082" opacity="0.7"/><ellipse cx="148" cy="102" rx="9" ry="6" fill="#FF8082" opacity="0.7"/><circle cx="86" cy="80" r="8" fill="${EYE}"/><circle cx="89" cy="77" r="2.8" fill="#FFFFFF"/><circle cx="134" cy="80" r="8" fill="${EYE}"/><circle cx="137" cy="77" r="2.8" fill="#FFFFFF"/><ellipse cx="110" cy="97" rx="9" ry="6.5" fill="${EYE}"/><path d="M110 103 V109 M110 109 Q102 118 94 111 M110 109 Q118 118 126 111" fill="none" stroke="${EYE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  // うさぎ: 白と桃。 viewBox 210x250（足元は下から約10）
  "prize-rabbit": {
    viewBox: "0 0 210 250",
    body: `<ellipse cx="78" cy="54" rx="21" ry="46" transform="rotate(-9 78 54)" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="132" cy="54" rx="21" ry="46" transform="rotate(9 132 54)" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="79" cy="58" rx="9" ry="30" transform="rotate(-9 79 58)" fill="#FFB3BE"/><ellipse cx="131" cy="58" rx="9" ry="30" transform="rotate(9 131 58)" fill="#FFB3BE"/><ellipse cx="52" cy="176" rx="15" ry="25" transform="rotate(12 52 176)" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="158" cy="176" rx="15" ry="25" transform="rotate(-12 158 176)" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="105" cy="180" rx="54" ry="54" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="105" cy="192" rx="31" ry="30" fill="#E9F0F7"/><ellipse cx="70" cy="226" rx="25" ry="12" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="140" cy="226" rx="25" ry="12" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="70" cy="227" rx="12" ry="6" fill="#FFB3BE"/><ellipse cx="140" cy="227" rx="12" ry="6" fill="#FFB3BE"/><ellipse cx="105" cy="114" rx="55" ry="47" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/><ellipse cx="68" cy="128" rx="10" ry="6.5" fill="#FF8082" opacity="0.6"/><ellipse cx="142" cy="128" rx="10" ry="6.5" fill="#FF8082" opacity="0.6"/><circle cx="82" cy="108" r="8" fill="${EYE}"/><circle cx="85" cy="105" r="2.8" fill="#FFFFFF"/><circle cx="128" cy="108" r="8" fill="${EYE}"/><circle cx="131" cy="105" r="2.8" fill="#FFFFFF"/><ellipse cx="105" cy="122" rx="7" ry="5" fill="#FF8082"/><path d="M105 127 V132 M105 132 Q98 140 91 133 M105 132 Q112 140 119 133" fill="none" stroke="${EYE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  // おほしさま: 橙の星に顔。太い線でふちどってから同じ形を塗ると、角が丸く、ぷくっとなる。
  // viewBox 230x230（下の2つの先は下から約20）
  "prize-star": {
    viewBox: "0 0 230 230",
    body: `${roundedStar(115, 122, 90, 46, INK, 32)}${roundedStar(115, 122, 90, 46, "#F6AA00", 20, "#F6AA00")}<path d="M77 86 Q86 68 106 62" fill="none" stroke="#FFFFFF" stroke-width="8" stroke-linecap="round" opacity="0.75"/><ellipse cx="86" cy="134" rx="10" ry="6.5" fill="#FF8082" opacity="0.75"/><ellipse cx="144" cy="134" rx="10" ry="6.5" fill="#FF8082" opacity="0.75"/><circle cx="97" cy="116" r="8.5" fill="${EYE}"/><circle cx="100" cy="113" r="3" fill="#FFFFFF"/><circle cx="133" cy="116" r="8.5" fill="${EYE}"/><circle cx="136" cy="113" r="3" fill="#FFFFFF"/><path d="M104 130 Q115 142 126 130" fill="none" stroke="${EYE}" stroke-width="4.5" stroke-linecap="round"/>`,
  },
};

/** 5つの角の星（外半径 outer・内半径 inner）。太い線＋丸い角で、ぷくっと見せる。 */
function roundedStar(cx, cy, outer, inner, stroke, width, fill = "none") {
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (-90 + index * 36) * (Math.PI / 180);
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `<path d="M${points.join(" L")} Z" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

/** 景品1つの <svg>（足元を下端にそろえてあるので、置き方は PNG と同じ）。 */
export function cranePrizeSvg(asset) {
  return artSvg(CRANE_PRIZE_ART[asset]);
}

// --- アーム --------------------------------------------------------------
// viewBox 240x280（PNG と同じ）。つかむ点＝下の端は、中央の指の先（y=264 + 線の半分）。
// 開いた絵と閉じた絵で違うのは、左右の指の向きだけ。指の付け根の関節を軸に、
// 開いた絵から回して閉じた絵を作るので、下端は自然にそろう。

const CLAW_FINGER = (
  // 左の指（開いた形）。付け根の関節は (62,146)。
  `<path d="M52 134 C22 148 8 190 20 238 L30 246 C35 208 48 178 78 164 Z" fill="#D9E2EC" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
  `<path d="M42 152 C26 172 22 198 24 222" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`
);

function clawBody(closed) {
  // 閉じるときは、指を付け根の関節のまわりで内側へ回す。
  const angle = closed ? 40 : 0;
  const left = `<g transform="rotate(${-angle} 62 146)">${CLAW_FINGER}</g>`;
  const right = `<g transform="translate(240 0) scale(-1 1)"><g transform="rotate(${-angle} 62 146)">${CLAW_FINGER}</g></g>`;
  return (
    // 上の腕（ハブから関節へ）。太い黒の下地に灰色を重ねて、輪郭つきの棒にする。
    `<path d="M92 126 L62 146 M148 126 L178 146" fill="none" stroke="${INK}" stroke-width="26" stroke-linecap="round"/>` +
    `<path d="M92 126 L62 146 M148 126 L178 146" fill="none" stroke="#CDD8E3" stroke-width="14" stroke-linecap="round"/>` +
    // 中央の指。太めの丸い先にしてあるのは、索（crane.js の .crane-cable）が
    // 下端でのぞかないようにするため。
    `<path d="M101 150 C99 190 103 230 107 250 Q120 278 133 250 C137 230 141 190 139 150 Z" fill="#D9E2EC" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M110 176 C108 202 110 226 114 244" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.8"/>` +
    left +
    right +
    `<circle cx="62" cy="146" r="12" fill="#F6AA00" stroke="${INK}" stroke-width="5"/><circle cx="178" cy="146" r="12" fill="#F6AA00" stroke="${INK}" stroke-width="5"/>` +
    // 軸（赤）
    `<rect x="98" y="12" width="44" height="26" rx="9" fill="#D93F00" stroke="${INK}" stroke-width="6"/>` +
    `<rect x="107" y="34" width="26" height="56" rx="5" fill="#FF4B00" stroke="${INK}" stroke-width="6"/>` +
    `<path d="M115 46 V80" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.55"/>` +
    // ハブ（青）に顔。つかんでも、はずしても、かわらない表情にする。
    `<circle cx="120" cy="116" r="36" fill="#005AFF" stroke="${INK}" stroke-width="6"/>` +
    `<circle cx="120" cy="118" r="25" fill="#D8F3FF"/>` +
    `<circle cx="110" cy="114" r="5" fill="${EYE}"/><circle cx="111.6" cy="112.2" r="1.7" fill="#FFFFFF"/><circle cx="130" cy="114" r="5" fill="${EYE}"/><circle cx="131.6" cy="112.2" r="1.7" fill="#FFFFFF"/>` +
    `<path d="M112 124 Q120 132 128 124" fill="none" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round"/>` +
    `<path d="M96 100 Q101 90 112 87" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.6"/>` +
    `<circle cx="120" cy="156" r="11" fill="#F6AA00" stroke="${INK}" stroke-width="5"/>`
  );
}

/** アーム（開いた絵と閉じた絵を重ねて持つ。切り替えは CSS の .is-closed）。 */
export function clawHtml() {
  return (
    artSvg({ viewBox: "0 0 240 280", body: clawBody(false) }, { className: "claw-open" }) +
    artSvg({ viewBox: "0 0 240 280", body: clawBody(true) }, { className: "claw-closed" })
  );
}

// --- 箱の中の部屋（ガラスの中） -----------------------------------------
// 床の台形と同じ投影（craneGeometry.js）で、天井・奥の壁・左右の壁・手前の縁を描く。
// 面は clip-path の多角形（％はステージに対する比で、床と同じ）。模様は px の
// 放射状グラデーション（丸いまま）と、面ごとに置く星・ハートのシール。

/** 箱の内側の面の座標（ステージに対する％）。 */
function roomShape() {
  const far = project(50, 0); // 床の奥端
  const ceilingFar = 14; // 奥の壁の上端（レールより奥）
  const left = project(0, 0).left; // 奥端の左
  const right = project(100, 0).left; // 奥端の右
  const nearLeft = project(0, 100);
  const nearRight = project(100, 100);
  // 壁と床の境目の線を、ステージの左右の端まで延ばした高さ。
  const slope = (nearLeft.top - far.top) / (nearLeft.left - left);
  const edgeY = far.top + slope * (0 - left);
  return { farTop: far.top, ceilingFar, left, right, nearLeft, nearRight, edgeY };
}

const polygon = (points) => `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;

/** 星・ハートの形（viewBox 24x24）。箱の中のシールと、台の外の壁飾りで使う。 */
function stickerShape(kind, color) {
  return kind === "heart"
    ? `<path d="M12 21 C4 14 2.5 10 2.5 7.5 C2.5 4.8 4.6 3 7 3 C9 3 10.9 4.2 12 6 C13.1 4.2 15 3 17 3 C19.4 3 21.5 4.8 21.5 7.5 C21.5 10 20 14 12 21 Z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    : `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="${color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

/** 箱の中のシール（星・ハート）。位置と大きさはステージに対する％（幅基準）。 */
function sticker(kind, left, top, width, color) {
  return `<svg class="cr-sticker" style="left:${left}%;top:${top}%;width:${width}%" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${stickerShape(kind, color)}</svg>`;
}

/**
 * 箱の中の部屋。.crane-stage の最初の子として入れる（床の台形より奥）。
 * 結果の色（.is-grip などの薄い膜）は、面の上に .crane-tint が重なって出す。
 */
export function craneRoomHtml() {
  const s = roomShape();
  const ceiling = polygon([[0, 0], [100, 0], [s.right, s.ceilingFar], [s.left, s.ceilingFar]]);
  const back = polygon([[s.left, s.ceilingFar], [s.right, s.ceilingFar], [s.right, s.farTop], [s.left, s.farTop]]);
  const leftWall = polygon([[0, 0], [s.left, s.ceilingFar], [s.left, s.farTop], [0, s.edgeY]]);
  const rightWall = polygon([[100, 0], [s.right, s.ceilingFar], [s.right, s.farTop], [100, s.edgeY]]);
  const front = polygon([
    [s.nearLeft.left, s.nearLeft.top],
    [s.nearRight.left, s.nearRight.top],
    [100, s.edgeY],
    [100, 100],
    [0, 100],
    [0, s.edgeY],
  ]);
  return `
    <div class="crane-room" aria-hidden="true">
      <div class="cr-face cr-ceiling" style="clip-path:${ceiling}"></div>
      <div class="cr-face cr-back" style="clip-path:${back}"></div>
      <div class="cr-face cr-wall cr-wall-left" style="clip-path:${leftWall}"></div>
      <div class="cr-face cr-wall cr-wall-right" style="clip-path:${rightWall}"></div>
      <div class="cr-face cr-front" style="clip-path:${front}"></div>
      ${sticker("star", 33, 18.5, 4.4, "#F6AA00")}
      ${sticker("heart", 49, 16.8, 4.2, "#FF8082")}
      ${sticker("star", 64, 19, 3.8, "#FFFFFF")}
      ${sticker("star", 8.5, 42, 2.6, "#FF8082")}
      ${sticker("star", 91, 44, 2.6, "#4DC4FF")}
    </div>`;
}

/**
 * 床のマット。色つきの市松（8列×6段）を、床と同じ投影で描く。
 * 頂点は project() から出すので、床の台形とずれない。角の形だけの図なので、
 * preserveAspectRatio="none"（ステージの縦横比に合わせて伸びる）でよい。
 */
export function craneMatHtml() {
  const cols = 8;
  const rows = 6;
  const at = (x, y) => {
    const p = project(x, y);
    return `${p.left.toFixed(2)} ${p.top.toFixed(2)}`;
  };
  let dark = "";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % 2 === 0) continue;
      const x0 = (col / cols) * 100;
      const x1 = ((col + 1) / cols) * 100;
      const y0 = (row / rows) * 100;
      const y1 = ((row + 1) / rows) * 100;
      dark += `M${at(x0, y0)} L${at(x1, y0)} L${at(x1, y1)} L${at(x0, y1)} Z `;
    }
  }
  const outline = `M${at(0, 0)} L${at(100, 0)} L${at(100, 100)} L${at(0, 100)} Z`;
  return `<svg class="crane-mat" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${outline}" fill="#7FD3FF"/><path d="${dark}" fill="#4DC4FF"/><path d="${outline}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// --- 台の外の飾り（おもちゃ屋さんの店内） --------------------------------
// 色のついた壁・旗・風船・床・紙ふぶき。動きはどれもゆっくりで、明るさは
// 変えない（点滅にならない）。動かすのは translate / rotate だけ（world-crane.css）。

const FLAG_COLORS = ["#FF8082", "#4DC4FF", "#F6AA00", "#03AF7A", "#D65DB1", "#005AFF", "#FF4B00"];

/** 旗（ガーランド）。横幅いっぱいに、たるみを2つ。旗ごとに小さくゆれる。 */
function buntingSvg() {
  const width = 1180;
  const yAt = (x) => 8 + 26 * Math.sin(Math.PI * ((x % (width / 2)) / (width / 2)));
  let rope = "M0 8";
  for (let x = 10; x <= width; x += 10) rope += ` L${x} ${yAt(x).toFixed(1)}`;
  let flags = "";
  for (let index = 0; index < 16; index += 1) {
    const x = 37 + index * 73.75;
    const y = yAt(x);
    const color = FLAG_COLORS[index % FLAG_COLORS.length];
    flags += `<path class="cw-flag" style="--i:${index}" d="M${(x - 24).toFixed(1)} ${y.toFixed(1)} L ${(x + 24).toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${(y + 44).toFixed(1)} Z" fill="${color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  return `<svg class="cw-bunting" viewBox="0 0 ${width} 92" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${rope}" fill="none" stroke="${INK}" stroke-width="3"/>${flags}</svg>`;
}

/** 風船（ひもつき）。viewBox 100x260。ひもの根もとが下の中央（ここを軸にゆれる）。 */
function balloonBunchSvg(className, balloons, base) {
  const strings = balloons
    .map((b) => `<path d="M${b.x} ${b.y + 46} C ${b.x + 8} ${b.y + 90}, 52 190, 50 236" fill="none" stroke="${INK}" stroke-width="2.5"/>`)
    .join("");
  const bodies = balloons
    .map(
      (b) =>
        `<ellipse cx="${b.x}" cy="${b.y}" rx="27" ry="34" fill="${b.color}" stroke="${INK}" stroke-width="3.5"/><path d="M${b.x - 5} ${b.y + 34} L ${b.x + 5} ${b.y + 34} L ${b.x} ${b.y + 42} Z" fill="${b.color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="${b.x - 10}" cy="${b.y - 12}" rx="5" ry="9" fill="#FFFFFF" opacity="0.6"/>`
    )
    .join("");
  return `<svg class="cw-balloons ${className}" viewBox="0 0 100 260" aria-hidden="true" focusable="false">${strings}${bodies}${base}</svg>`;
}

const GIFT_BOX = `<rect x="24" y="226" width="52" height="34" rx="5" fill="#FF8082" stroke="${INK}" stroke-width="3.5"/><rect x="45" y="226" width="10" height="34" fill="#4DC4FF" stroke="${INK}" stroke-width="3"/><path d="M50 226 C 36 208, 26 216, 32 226 M50 226 C 64 208, 74 216, 68 226" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><circle cx="50" cy="226" r="4.5" fill="#4DC4FF" stroke="${INK}" stroke-width="3"/>`;
const BLOCKS = `<rect x="14" y="224" width="36" height="36" rx="5" fill="#4DC4FF" stroke="${INK}" stroke-width="3.5"/><rect x="50" y="224" width="36" height="36" rx="5" fill="#F6AA00" stroke="${INK}" stroke-width="3.5"/><rect x="32" y="190" width="36" height="34" rx="5" fill="#03AF7A" stroke="${INK}" stroke-width="3.5"/><text x="32" y="251" font-size="24" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">A</text><text x="68" y="251" font-size="24" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">B</text><text x="50" y="216" font-size="24" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">C</text>`;

/** 店の床（手前を広く見せた市松）。横は伸び縮みしてよい。 */
function shopFloorSvg() {
  const width = 1180;
  const height = 150;
  const rows = 4;
  const cols = 16;
  const horizon = 40; // 奥の端の高さ
  const yAt = (row) => horizon + ((height - horizon) * row) / rows;
  const xAt = (col, y) => {
    const t = (y - horizon) / (height - horizon);
    const spread = 0.35 + 0.65 * t; // 奥ほど縮む
    return width / 2 + ((col / cols - 0.5) * width * spread * 1.4);
  };
  let dark = "";
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col) % 2 === 0) continue;
      const y0 = yAt(row);
      const y1 = yAt(row + 1);
      dark += `M${xAt(col, y0).toFixed(1)} ${y0} L${xAt(col + 1, y0).toFixed(1)} ${y0} L${xAt(col + 1, y1).toFixed(1)} ${y1} L${xAt(col, y1).toFixed(1)} ${y1} Z `;
    }
  }
  return `<svg class="cw-floor" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="-200" y="${horizon}" width="${width + 400}" height="${height - horizon + 10}" fill="#FFD1D8"/><path d="${dark}" fill="#FFFFFF"/><rect x="-200" y="${horizon - 12}" width="${width + 400}" height="14" fill="#FF8082" stroke="${INK}" stroke-width="3"/></svg>`;
}

// 紙ふぶき（左 %・落ちる秒・大きさ px・遅れ秒・色・形）。壁の上をゆっくり落ちる。
const CONFETTI = [
  [6, 34, 14, -3, "#FF8082", "star"],
  [17, 40, 10, -17, "#4DC4FF", "dot"],
  [29, 46, 12, -9, "#F6AA00", "star"],
  [41, 38, 9, -25, "#03AF7A", "dot"],
  [53, 44, 13, -13, "#D65DB1", "star"],
  [64, 36, 10, -30, "#005AFF", "dot"],
  [75, 48, 12, -5, "#FF8082", "star"],
  [86, 40, 9, -21, "#F6AA00", "dot"],
  [94, 42, 13, -11, "#4DC4FF", "star"],
];

function confettiHtml() {
  return CONFETTI.map(([left, seconds, size, delay, color, shape]) => {
    const inner =
      shape === "star"
        ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="${color}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="${color}" stroke="${INK}" stroke-width="2.4"/></svg>`;
    return `<i style="left:${left}%;--d:${seconds}s;--s:${size}px;animation-delay:${delay}s">${inner}</i>`;
  }).join("");
}

// 壁に貼った飾り（種類・左 %・上 %・大きさ px・色・遅れ秒）。台のわきの余白に出す
// （余白が細い画面では出さない。world-crane.css）。ゆっくり上下にゆれる。
const WALL_DECOS = [
  ["star", 6.2, 30, 46, "#F6AA00", -1],
  ["heart", 3.2, 47, 34, "#FF8082", -3.5],
  ["star", 92.4, 27, 40, "#4DC4FF", -2],
  ["heart", 95.6, 44, 36, "#D65DB1", -4.5],
];

function wallDecosHtml() {
  return WALL_DECOS.map(
    ([kind, left, top, size, color, delay]) =>
      `<svg class="cw-deco" style="left:${left}%;top:${top}%;width:${size}px;animation-delay:${delay}s" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${stickerShape(kind, color)}</svg>`
  ).join("");
}

/**
 * 台の外の店内。stageEl の最初の子として入れる（台より奥）。世界は遊びの始めに
 * 1回だけ作り、試行ごとには作り直さない。
 */
export function craneWorldHtml() {
  const left = balloonBunchSvg(
    "cw-balloons-left",
    [
      { x: 30, y: 46, color: "#FF4B00" },
      { x: 68, y: 44, color: "#4DC4FF" },
      { x: 49, y: 100, color: "#D65DB1" },
    ],
    GIFT_BOX
  );
  const right = balloonBunchSvg(
    "cw-balloons-right",
    [
      { x: 34, y: 44, color: "#03AF7A" },
      { x: 68, y: 84, color: "#F6AA00" },
    ],
    BLOCKS
  );
  return `
    <div class="crane-world" aria-hidden="true">
      <span class="cw-confetti">${confettiHtml()}</span>
      ${wallDecosHtml()}
      ${buntingSvg()}
      ${shopFloorSvg()}
      ${left}
      ${right}
    </div>`;
}
