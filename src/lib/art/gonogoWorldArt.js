// =====================================================================
// art/gonogoWorldArt.js — 「高い音だけ」（れんしゅうの回）の世界の絵
//
// 夕方の丘の小さな音楽会。紫の台（ホームのタイルと同じ #990099）の中に明るい舞台を置き、
// 音の玉が舞台の太鼓へ降りてくる。絵柄は hakkiriArt.js・ほかの3つの世界とそろえる
// （平たい形・はっきりした色・主役は #1A1A1A の輪郭と白いハイライト）。
// 画像ファイルではなく SVG の文字列で持つ理由も同じ（オフラインで動かすため、色を
// 1か所で変えられるため）。飾りは常に aria-hidden。黄色（#FFC83D）は走査の枠の色なので
// 使わない。
//
// 守る線:
//   - この絵は games/rhythmVisuals.js が、高い音だけの れんしゅうの回にだけ差し込む。
//     そくていの回（と、ほかのリズムの遊び）は今までの見え方のまま。
//   - 合図は音。音の玉の絵に、高い音と低い音を見分ける手がかりを足さない。今までの
//     手がかり（手がかりを出す回の、丸い玉＋星／四角い箱＋立方体、寒い色／暖かい色）と
//     同じ強さの違いだけを描く。顔・上下の矢印・音の高さに見える並び（五線など）は
//     入れない——どちらかを「押す／待つ」と読める絵にすると、課題の中身が変わる。
//   - 背景に音符の飾りを置かない（流れてくる玉と取り違えうる）。背景は動かさない
//     （拍の手がかりとして読めてしまう動きを、合図の外に作らない）。
//   - 玉・太鼓・判定の位置と大きさ、出てくる時刻は styles.css と rhythm.js のまま。
//     ここで変えるのは中身の絵だけ。
// =====================================================================

/**
 * 見え方の版。session.config.artVersion に残し、リズムの CSV の最後の列に出す
 * （決まりは src/lib/artVersion.js。記録するのは「その回に見せた絵の版」）。
 *   1 … Font Awesome と CSS の絵（暗い紺・六角形の網・光る玉）。そくていの回は今もこの見え方。
 *       ほかのリズムの遊び（リズム練習・続けて・そくてい）も 1 のまま
 *   2 … 高い音だけの れんしゅうの回だけ、このファイルの SVG の絵と音楽会の世界にした
 *       （2026-10-01）。玉・太鼓の位置と大きさ、出てくる時刻、判定は 1 と同じ
 */
export const GONOGO_ART_VERSION = 2;

const INK = "#1A1A1A";
const WHITE = "#FFFFFF";

function svg(viewBox, body, className = "") {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** 5つの角の星（中心・外半径・内半径）。 */
function starPoints(cx, cy, outer, inner) {
  const points = [];
  for (let index = 0; index < 10; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (-90 + index * 36) * (Math.PI / 180);
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `M${points.join(" L")} Z`;
}

// --- 看板の印（ホームのタイルの絵と同じ、並んだ木琴の板） -------------------

/** 看板の丸の中の絵。拍とは関係なく、ずっと同じ。 */
export function gonogoIconSvg() {
  const bars = [
    [7, 26, "#FF8082"],
    [17, 21, "#F6AA00"],
    [27, 16, "#03AF7A"],
    [37, 11, "#4DC4FF"],
  ]
    .map(([x, y, fill]) => `<rect class="gi-bar" x="${x}" y="${y}" width="8" height="${40 - y}" rx="3" fill="${fill}" stroke="${INK}" stroke-width="2.5"/>`)
    .join("");
  return svg("0 0 52 48", bars, "gonogo-icon");
}

// --- 音の玉（手がかりを出す回の、流れてくる玉） -----------------------------
// viewBox はどちらも 100x100。箱の大きさは styles.css の .rhythm-note のまま。
// 色は CSS（world-gonogo.css）が部品の class で塗る。当たった・外れた・くっきり表示で
// 塗り替えるため（rn-body 地 / rn-shade 影 / rn-shine 光 / rn-mark 中の印 / rn-edge 輪郭）。

const GO_NOTE =
  `<circle class="rn-body" cx="50" cy="50" r="43"/>` +
  `<path class="rn-shade" d="M11 58 Q50 104 89 58 Q84 88 50 93 Q16 88 11 58 Z"/>` +
  `<ellipse class="rn-shine" cx="31" cy="29" rx="11" ry="6" transform="rotate(-38 31 29)"/>` +
  `<path class="rn-mark" d="${starPoints(50, 52, 23, 10.5)}" stroke-linejoin="round"/>` +
  `<circle class="rn-edge" cx="50" cy="50" r="43"/>`;

const NOGO_NOTE =
  `<rect class="rn-body" x="8" y="8" width="84" height="84" rx="17"/>` +
  `<path class="rn-shade" d="M9 70 H91 V76 Q91 91 76 91 H24 Q9 91 9 76 Z"/>` +
  `<path class="rn-shine" d="M20 30 Q20 20 30 20 H46" fill="none" stroke-linecap="round"/>` +
  // 立方体（上・左・右の面）。今までの手がかりの印と同じ意味のまま、平たい絵にする。
  `<path class="rn-mark rn-mark-top" d="M50 27 L71 38 L50 49 L29 38 Z" stroke-linejoin="round"/>` +
  `<path class="rn-mark rn-mark-left" d="M29 38 L50 49 L50 73 L29 62 Z" stroke-linejoin="round"/>` +
  `<path class="rn-mark rn-mark-right" d="M71 38 L71 62 L50 73 L50 49 Z" stroke-linejoin="round"/>` +
  `<rect class="rn-edge" x="8" y="8" width="84" height="84" rx="17"/>`;

/**
 * 流れてくる玉の中身。kind は "go"（高い音）か "nogo"（低い音）。
 * 形と色の違いは、今までの手がかり（丸＋星 / 四角＋立方体）と同じだけ。
 */
export function gonogoNoteSvg(kind) {
  return svg("0 0 100 100", kind === "nogo" ? NOGO_NOTE : GO_NOTE, "rhythm-note-art");
}

// --- 舞台の太鼓（押すところ。styles.css の .rhythm-pulse の中に描く） ----------

/** 上から見た太鼓。拍で大きさが変わるのは外側の .rhythm-pulse（rhythm.js）。 */
export function gonogoPadSvg() {
  let studs = "";
  for (let index = 0; index < 8; index += 1) {
    const angle = (index * 45 + 22.5) * (Math.PI / 180);
    studs += `<circle cx="${(50 + 40.5 * Math.cos(angle)).toFixed(1)}" cy="${(50 + 40.5 * Math.sin(angle)).toFixed(1)}" r="2.6" fill="${WHITE}"/>`;
  }
  return svg(
    "0 0 100 100",
    `<circle cx="50" cy="50" r="46" fill="#990099" stroke="${INK}" stroke-width="5"/>` +
      studs +
      `<circle cx="50" cy="50" r="34" fill="#FFF8EC" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="50" cy="50" r="22" fill="none" stroke="#F2C4E4" stroke-width="4"/>` +
      `<path d="M30 34 Q36 25 47 22" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/>`,
    "gonogo-pad"
  );
}

// --- 待てたときの盾（押さずに待てた直後だけ出る。styles.css の .rhythm-shield） ------

export function gonogoShieldSvg() {
  return svg(
    "0 0 100 100",
    `<path class="gs-body" d="M50 6 L88 19 V47 Q88 79 50 95 Q12 79 12 47 V19 Z" fill="#03AF7A" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
      `<path class="gs-side" d="M50 17 L78 27 V47 Q78 71 50 84 Z" fill="#02875E"/>` +
      `<path class="gs-check" d="M30 50 L44 64 L70 36" fill="none" stroke="${WHITE}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path class="gs-shine" d="M23 27 V44" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
    "gonogo-shield"
  );
}

// --- 舞台の中（玉の道より奥。幕と、玉の通り道） -------------------------------

function curtainSvg(side) {
  // 左の幕を描き、右は CSS で裏返す。ひだは同じ色の明暗だけで、主役（玉・太鼓）より控えめにする。
  const body =
    `<path d="M0 0 H96 Q84 120 90 250 Q64 262 60 300 Q58 420 70 600 H0 Z" fill="#F4C9E6"/>` +
    `<path d="M26 0 Q20 130 30 250 M54 0 Q46 130 60 262 M34 312 Q30 460 38 600" fill="none" stroke="#E8AAD6" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M50 252 Q76 250 92 244 L96 262 Q78 272 54 274 Z" fill="#D65DB1"/>`;
  return `<svg class="gonogo-curtain is-${side}" viewBox="0 0 100 600" preserveAspectRatio="none" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * .rhythm-main-display の最初の子（玉の道・玉・太鼓より奥）。
 * 幕は画面の左右の端だけ。玉が出てくる上の辺には何も置かない（出てくるところを隠すと、
 * 手がかりの見える長さが変わる）。
 */
export function gonogoStageHtml() {
  return `<span class="gonogo-stage" aria-hidden="true">${curtainSvg("left")}${curtainSvg("right")}</span>`;
}

// --- 台の外の世界（夕方の丘） ---------------------------------------------------

const CLOUD = `<path d="M8 48 Q0 22 25 23 Q26 0 51 5 Q73 0 81 24 Q105 19 109 43 Q116 58 94 59 H23 Q7 60 8 48Z" fill="#FFFFFF"/>`;

function treeSvg(className) {
  return `<svg class="gonogo-trees ${className}" viewBox="0 0 200 180" aria-hidden="true" focusable="false">
    <path d="M52 180 V118 M146 180 V128" stroke="#B98B66" stroke-width="12" stroke-linecap="round"/>
    <circle cx="52" cy="92" r="42" fill="#79C9A0"/><circle cx="30" cy="112" r="26" fill="#79C9A0"/><circle cx="76" cy="114" r="26" fill="#79C9A0"/>
    <circle cx="146" cy="110" r="32" fill="#9BD8B6"/><circle cx="128" cy="128" r="20" fill="#9BD8B6"/><circle cx="166" cy="130" r="20" fill="#9BD8B6"/>
    <path d="M36 78 Q44 64 60 62" fill="none" stroke="#B5E6CB" stroke-width="7" stroke-linecap="round"/>
  </svg>`;
}

/**
 * .rhythm-world の最初の子（紫の台より奥）。空は CSS の地、丘・木・雲は静止した絵。
 * 台が画面のほとんどを使うので、見えるのは台の左右と上下の縁だけ。
 */
export function gonogoSceneryHtml() {
  return `<span class="gonogo-scenery" aria-hidden="true">
    <svg class="gonogo-cloud is-one" viewBox="0 0 120 65" aria-hidden="true" focusable="false">${CLOUD}</svg>
    <svg class="gonogo-cloud is-two" viewBox="0 0 120 65" aria-hidden="true" focusable="false">${CLOUD}</svg>
    <svg class="gonogo-hills" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 560 Q170 420 360 520 Q560 400 780 510 Q990 420 1200 500 V800 H0Z" fill="#EBD2F0"/>
      <path d="M0 640 Q220 540 450 610 Q690 520 900 600 Q1060 560 1200 620 V800 H0Z" fill="#CBEAD8"/>
      <path d="M0 722 Q300 670 610 712 Q930 668 1200 712 V800 H0Z" fill="#B4E0C6"/>
    </svg>
    ${treeSvg("is-left")}
    ${treeSvg("is-right")}
  </span>`;
}
