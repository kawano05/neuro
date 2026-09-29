// =====================================================================
// art/partyArt.js — おおさわぎの絵（ラッコ・観客の魚・旗）と、海の背景
//
// このアプリで描いたもの（参考にしたドリルのキャラクターは使っていない）。
// 画像ファイルではなく SVG の文字列で持つのは hakkiriArt.js と同じ理由
// （オフラインで動かすため、色を1か所で変えられるため）。
// 黄色（#FFC83D）は走査の枠だけに使うので、ここでは使わない。
// =====================================================================

/**
 * なかまのラッコ（viewBox 200x240）。動かす部品に class を付けてある:
 *   o-jump（跳ねる・回る）/ o-all（息をする）/ o-arm-l・o-arm-r（手をたたく・上げる）
 *   o-eyes（まばたき）/ o-happy（笑った目）/ o-mouth・o-open（口）
 * 服（acc-hat・acc-bow・acc-crown）は、親に has-hat などを付けると出る（CSS）。
 */
export function otterSvg() {
  return `<svg class="party-otter-svg" viewBox="0 0 200 240" aria-hidden="true" focusable="false"><g class="o-jump"><g class="o-all">
    <path d="M140 204 q 44 -8 48 -48 q -22 22 -52 30 z" fill="#8A5431"/>
    <ellipse cx="100" cy="166" rx="56" ry="62" fill="#A8683D"/>
    <ellipse cx="100" cy="176" rx="36" ry="44" fill="#ECD0AA"/>
    <ellipse cx="78" cy="228" rx="19" ry="9" fill="#6F4326"/><ellipse cx="122" cy="228" rx="19" ry="9" fill="#6F4326"/>
    <g class="o-arm o-arm-l"><ellipse cx="58" cy="152" rx="12" ry="27" fill="#8A5431"/></g>
    <g class="o-arm o-arm-r"><ellipse cx="142" cy="152" rx="12" ry="27" fill="#8A5431"/></g>
    <circle cx="62" cy="56" r="14" fill="#8A5431"/><circle cx="138" cy="56" r="14" fill="#8A5431"/>
    <circle cx="62" cy="56" r="7" fill="#6F4326"/><circle cx="138" cy="56" r="7" fill="#6F4326"/>
    <circle cx="100" cy="82" r="52" fill="#A8683D"/>
    <ellipse cx="100" cy="100" rx="40" ry="29" fill="#F3E0C4"/>
    <circle cx="72" cy="104" r="7" fill="#FF8082" opacity="0.5"/><circle cx="128" cy="104" r="7" fill="#FF8082" opacity="0.5"/>
    <g class="o-eyes"><circle cx="80" cy="78" r="7" fill="#1A1A1A"/><circle cx="120" cy="78" r="7" fill="#1A1A1A"/><circle cx="82.5" cy="75.5" r="2.4" fill="#FFFFFF"/><circle cx="122.5" cy="75.5" r="2.4" fill="#FFFFFF"/></g>
    <g class="o-happy"><path d="M72 81 q 8 -11 16 0 M112 81 q 8 -11 16 0" stroke="#1A1A1A" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>
    <ellipse cx="100" cy="92" rx="9" ry="6.5" fill="#3A2418"/>
    <path class="o-mouth" d="M100 98 v5 M100 103 q -7 7 -13 1 M100 103 q 7 7 13 1" stroke="#3A2418" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="o-open" d="M89 101 q 11 20 22 0 z" fill="#C9455B" stroke="#3A2418" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M58 96 l -18 -4 M58 102 l -18 2 M142 96 l 18 -4 M142 102 l 18 2" stroke="#3A2418" stroke-width="2" stroke-linecap="round"/>
    <g class="acc acc-bow"><path d="M100 140 L 78 128 L 78 152 Z M100 140 L 122 128 L 122 152 Z" fill="#FF8082" stroke="#1A1A1A" stroke-width="2.5" stroke-linejoin="round"/><circle cx="100" cy="140" r="6" fill="#D65DB1" stroke="#1A1A1A" stroke-width="2"/></g>
    <g class="acc acc-hat"><path d="M100 4 L 126 46 L 74 46 Z" fill="#005AFF" stroke="#1A1A1A" stroke-width="3" stroke-linejoin="round"/><path d="M88 26 L 112 26 M82 36 L 118 36" stroke="#FFFFFF" stroke-width="4"/><circle cx="100" cy="5" r="7" fill="#FF8082" stroke="#1A1A1A" stroke-width="2.5"/></g>
    <g class="acc acc-crown"><path d="M70 42 L 76 16 L 89 32 L 100 10 L 111 32 L 124 16 L 130 42 Z" fill="#F6AA00" stroke="#1A1A1A" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="30" r="4.5" fill="#FF4B00"/><circle cx="84" cy="36" r="3.5" fill="#03AF7A"/><circle cx="116" cy="36" r="3.5" fill="#03AF7A"/></g>
  </g></g></svg>`;
}

/** 持っている服の class（親の要素に付ける）。 */
export function outfitClasses(outfits) {
  const have = new Set(Array.isArray(outfits) ? outfits : []);
  return ["hat", "bow", "crown"].filter((id) => have.has(id)).map((id) => `has-${id}`).join(" ");
}

// --- キラキラびん（押すたびに星がたまる。数ではなく目で見て分かるように） ---

/** びんの中の星の置き場（下の段から。びんの絵の中の %）。15個でいっぱい。 */
const JAR_ROWS = [
  [126, [30, 50, 70, 90]],
  [106, [40, 60, 80]],
  [86, [30, 50, 70, 90]],
  [66, [40, 60, 80]],
  [48, [60]],
];
export const JAR_SLOTS = Object.freeze(
  JAR_ROWS.flatMap(([y, xs]) => xs.map((x) => Object.freeze({ left: (x / 120) * 100, top: (y / 150) * 100 })))
);
/** 星の色（黄色＝走査の枠の色は使わない）。 */
export const STAR_COLORS = Object.freeze(["#F6AA00", "#FF8082", "#03AF7A", "#4DC4FF", "#D65DB1", "#FF4B00", "#FFFFFF"]);

/** 星1つ（viewBox 24x24）。 */
export function starSvg(color) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="${color}" stroke="#1A1A1A" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/** びん（viewBox 120x150）。ふた（jar-lid）は、あふれるときに飛ぶ。 */
export function jarSvg() {
  return `<svg class="party-jar-svg" viewBox="0 0 120 150" aria-hidden="true" focusable="false">
    <path d="M30 34 L 90 34 Q 106 34 106 52 L 106 128 Q 106 146 88 146 L 32 146 Q 14 146 14 128 L 14 52 Q 14 34 30 34 Z" fill="rgba(255,255,255,0.32)" stroke="#1A1A1A" stroke-width="3.5"/>
    <path d="M25 58 Q 22 92 26 126" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.75"/>
    <g class="jar-lid"><rect x="26" y="15" width="68" height="20" rx="6" fill="#FF8082" stroke="#1A1A1A" stroke-width="3.5"/><rect x="36" y="7" width="48" height="10" rx="4" fill="#D65DB1" stroke="#1A1A1A" stroke-width="3"/></g>
  </svg>`;
}

/** びんの中の星（先頭から count 個）。 */
export function jarStarsHtml(count) {
  return JAR_SLOTS.slice(0, count)
    .map((slot, index) => `<span class="party-star" style="left:${slot.left.toFixed(2)}%;top:${slot.top.toFixed(2)}%">${starSvg(STAR_COLORS[index % STAR_COLORS.length])}</span>`)
    .join("");
}

/** 星の入ったびん1つ（けっかの「きょうの びん」の並び）。 */
export function miniJarHtml() {
  return `<span class="party-mini-jar">${jarSvg()}<span class="party-jar-stars">${jarStarsHtml(15)}</span></span>`;
}

/** 観客の魚（左向き。viewBox 120x80）。 */
export function fishSvg(color) {
  return `<svg viewBox="0 0 120 80" aria-hidden="true" focusable="false"><path d="M92 40 L 118 20 L 113 40 L 118 60 Z" fill="${color}" stroke="#1A1A1A" stroke-width="3" stroke-linejoin="round"/><ellipse cx="54" cy="40" rx="44" ry="30" fill="${color}" stroke="#1A1A1A" stroke-width="3"/><circle cx="34" cy="34" r="8" fill="#FFFFFF" stroke="#1A1A1A" stroke-width="2.5"/><circle cx="32" cy="34" r="4" fill="#1A1A1A"/><path d="M22 50 q 10 8 20 0" stroke="#1A1A1A" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M58 40 q 10 -16 22 -6" fill="none" stroke="#1A1A1A" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/** 観客の並び（右下から。right・bottom は画面の割合 %）。 */
export const PARTY_FANS = Object.freeze([
  { right: 3, bottom: 7, color: "#FF8082" },
  { right: 14, bottom: 6, color: "#03AF7A" },
  { right: 7.5, bottom: 19, color: "#D65DB1" },
  { right: 19, bottom: 17, color: "#FF4B00" },
  { right: 2.5, bottom: 31, color: "#F6AA00" },
  { right: 13.5, bottom: 30, color: "#4DC4FF" },
]);

const BUNTING_COLORS = ["#FF8082", "#03AF7A", "#005AFF", "#F6AA00", "#D65DB1", "#4DC4FF", "#FF4B00"];

/** 旗（ガーランド）。横幅いっぱいに2つのたるみ。 */
export function buntingSvg() {
  const width = 1180;
  const yAt = (x) => 8 + 30 * Math.sin(Math.PI * ((x % (width / 2)) / (width / 2)));
  let rope = "M0 8";
  for (let x = 10; x <= width; x += 10) rope += ` L${x} ${yAt(x).toFixed(1)}`;
  let flags = "";
  for (let i = 0; i < 16; i += 1) {
    const x = 37 + i * 73.75;
    const y = yAt(x);
    flags += `<path d="M${(x - 24).toFixed(1)} ${y.toFixed(1)} L ${(x + 24).toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${(y + 44).toFixed(1)} Z" fill="${BUNTING_COLORS[i % BUNTING_COLORS.length]}" stroke="#1A1A1A" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  return `<svg class="party-bunting" viewBox="0 0 ${width} 96" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${rope}" fill="none" stroke="#1A1A1A" stroke-width="3"/>${flags}</svg>`;
}

// 海の背景の泡と海藻（左 %・秒・大きさ px・遅れ秒 / 左 %・高さ px・色・遅れ秒）。
const BUBBLES = [
  [8, 11, 14, -2], [17, 9, 10, -7], [26, 13, 18, -4], [38, 10, 12, -9], [47, 12, 8, -1],
  [58, 9, 16, -6], [66, 14, 12, -3], [74, 11, 10, -8], [83, 10, 14, -5], [92, 12, 11, -10],
];
const WEEDS = [
  [3, 150, "#0F8A5F", -1], [7.5, 120, "#1FB57A", -3], [88, 130, "#1FB57A", -2], [93, 160, "#0F8A5F", -4.5],
];

/**
 * 海の背景（「押すと 出てくる」の背景「海」）。水面の波・差し込む光・泡・海藻・砂。
 * 動きはどれもゆっくりで、明るさは変えない（点滅にならない）。
 */
export function seaSceneHtml() {
  const bubbles = BUBBLES.map(
    ([left, seconds, size, delay]) => `<i style="left:${left}%;--d:${seconds}s;--s:${size}px;animation-delay:${delay}s"></i>`
  ).join("");
  const weeds = WEEDS.map(
    ([left, height, color, delay]) =>
      `<svg class="sea-weed" style="left:${left}%;height:${height}px;animation-delay:${delay}s" viewBox="0 0 60 160" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M30 160 C 8 128, 52 104, 30 76 S 48 28, 30 4" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/></svg>`
  ).join("");
  return `
    <span class="sea-rays"><i></i><i></i><i></i><i></i></span>
    <span class="sea-spot"></span>
    <svg class="sea-surface" viewBox="0 0 1340 60" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 34 Q 67 16 134 34 T 268 34 T 402 34 T 536 34 T 670 34 T 804 34 T 938 34 T 1072 34 T 1206 34 T 1340 34 V0 H0 Z" fill="rgba(255,255,255,0.2)"/></svg>
    <span class="sea-bubbles">${bubbles}</span>
    ${weeds}
    <svg class="sea-floor" viewBox="0 0 1180 110" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 52 C 160 34, 300 62, 460 48 S 760 34, 900 50 S 1100 58, 1180 44 V110 H0 Z" fill="#E3C98D"/>
      <path d="M90 86 q 30 -9 60 0 M 400 92 q 30 -9 60 0 M 700 88 q 30 -9 60 0 M 1000 94 q 30 -9 60 0" stroke="#CDB073" stroke-width="4" fill="none" stroke-linecap="round"/>
      <ellipse cx="190" cy="54" rx="48" ry="22" fill="#4F6784"/><ellipse cx="236" cy="62" rx="26" ry="14" fill="#5D7796"/>
      <ellipse cx="1000" cy="50" rx="40" ry="18" fill="#56708F"/>
      <path d="M860 52 v-34 M860 32 l-14 -14 M860 26 l12 -16 M872 52 v-22 M872 38 l10 -10" stroke="#FF8082" stroke-width="7" stroke-linecap="round" fill="none"/>
    </svg>`;
}
