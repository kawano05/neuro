// =====================================================================
// art/musicRoomArt.js — 音あそび（音楽室）の絵（2026-11-25）
//
// 11/25 の打ち合わせで「黒い背景に星が落ちてくる形は、子どもには何をするのか伝わりにくい」
// 「楽器の絵を出して、押すと楽器の音が鳴る形に」「押したら派手に」と言われた。音あそびの
// れんしゅうの回は、音楽室に楽器が並ぶ遊びにした（games/musicRoom.js）。
//
// 絵柄は hakkiriArt.js・ほかの世界とそろえる（平たい形・はっきりした色・主役は #1A1A1A の輪郭と
// 白いハイライト）。画像ファイルではなく SVG の文字列で持つ（オフラインで動かすため）。
// 飾りは常に aria-hidden。黄色（#FFC83D）は走査の枠と、この遊びの枠（いま鳴らせる楽器）の色
// なので、絵には使わない。
// =====================================================================

const INK = "#1A1A1A";
const WHITE = "#FFFFFF";

function svg(viewBox, body, className = "") {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;
}

function tacks(points) {
  return points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="${WHITE}" stroke="${INK}" stroke-width="1.5"/>`).join("");
}

/**
 * 並べる楽器（左上から右下の順）。id は音の名前（src/assets/sounds/instrument-<id>.wav）と同じ。
 * 幼稚園や学校の音楽室で見かける楽器にした。
 */
export const MUSIC_INSTRUMENTS = Object.freeze(["piano", "taiko", "bell", "xylophone", "castanets", "trumpet"]);

const INSTRUMENT_ART = {
  // ピアノ: 黒い胴に白い鍵盤と黒い鍵盤、上に譜面台。
  piano:
    `<rect x="12" y="18" width="76" height="64" rx="6" fill="#3A2A28" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="30" y="24" width="40" height="14" rx="2" fill="#FFF3DC" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M36 29 H64 M36 33 H58" stroke="#3A2A28" stroke-width="2" stroke-linecap="round"/>` +
    `<rect x="16" y="50" width="68" height="24" rx="2" fill="${WHITE}" stroke="${INK}" stroke-width="4"/>` +
    [27, 38, 49, 60, 71].map((x) => `<path d="M${x} 50 V74" stroke="${INK}" stroke-width="2"/>`).join("") +
    [23, 34, 54, 65, 76].map((x) => `<rect x="${x - 3}" y="50" width="6" height="14" fill="${INK}"/>`).join("") +
    `<path d="M18 22 Q30 19 40 20" fill="none" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`,
  // 太鼓: 朱色の胴に鋲、上に皮。
  taiko:
    `<path d="M17 30 Q11 56 18 79 Q50 93 82 79 Q89 56 83 30 Z" fill="#E6402F" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
    `<path d="M24 46 Q22 60 26 72" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>` +
    tacks([[24, 40], [37, 43], [50, 44], [63, 43], [76, 40], [26, 74], [38, 79], [50, 81], [62, 79], [74, 74]]) +
    `<ellipse cx="50" cy="30" rx="33" ry="11" fill="#FFF3DC" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M30 27 Q38 22 50 21" fill="none" stroke="${WHITE}" stroke-width="4" stroke-linecap="round"/>`,
  // すず: 丸い鈴と赤いひも。枠の黄色と分けるため、だいだいに寄せる。
  bell:
    `<path d="M40 22 Q50 4 60 22" fill="none" stroke="#D93A3A" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="50" cy="56" r="32" fill="#F0A13C" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M19 50 Q50 62 81 50" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="50" cy="69" r="5.5" fill="${INK}"/>` +
    `<path d="M50 73 V84" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M31 40 Q37 31 47 29" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/>`,
  // もっきん: 色の板が左から右へ短くなる。右上にばち。
  xylophone:
    `<path d="M10 40 L88 34 M10 72 L88 66" stroke="#9A6234" stroke-width="6" stroke-linecap="round"/>` +
    [
      [12, 22, 64, "#E6402F"],
      [28, 25, 58, "#F08A24"],
      [44, 28, 52, "#03AF7A"],
      [60, 31, 46, "#3C7BF0"],
    ]
      .map(([x, y, height, fill]) => `<rect x="${x}" y="${y}" width="13" height="${height}" rx="3" fill="${fill}" stroke="${INK}" stroke-width="4"/>`)
      .join("") +
    `<path d="M78 84 L92 46" stroke="#9A6234" stroke-width="5" stroke-linecap="round"/>` +
    `<circle cx="93" cy="42" r="7" fill="#E6402F" stroke="${INK}" stroke-width="4"/>`,
  // カスタネット: 上から見た赤い1枚の下に青い1枚がのぞき、左の端を黒いゴムがとめて、指を通す輪になる。
  castanets:
    `<circle cx="56" cy="56" r="34" fill="#3C7BF0" stroke="${INK}" stroke-width="5"/>` +
    `<circle cx="52" cy="50" r="32" fill="#E6402F" stroke="${INK}" stroke-width="5"/>` +
    `<ellipse cx="13" cy="51" rx="9" ry="14" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M21 42 H30 M21 60 H30" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M30 40 Q26 51 30 62" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M44 30 Q54 24 66 27" fill="none" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/>`,
  // ラッパ: 横向き。左に吹き口、右に大きく開いた口、上にピストン。だいだい色。
  trumpet:
    `<path d="M14 54 H58" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M14 54 H58" stroke="#F0A13C" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M30 54 Q30 70 44 70 H62 Q70 70 70 62" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M30 54 Q30 70 44 70 H62 Q70 70 70 62" fill="none" stroke="#F0A13C" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M56 46 L90 26 V82 L56 62 Z" fill="#F0A13C" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
    `<ellipse cx="90" cy="54" rx="6" ry="28" fill="#FFD9A0" stroke="${INK}" stroke-width="5"/>` +
    [36, 44, 52].map((x) => `<rect x="${x - 3}" y="36" width="6" height="16" rx="2" fill="#F0A13C" stroke="${INK}" stroke-width="3"/>`).join("") +
    `<rect x="8" y="49" width="8" height="10" rx="2" fill="#F0A13C" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M62 42 L80 32" stroke="${WHITE}" stroke-width="4" stroke-linecap="round"/>`,
};

/** 楽器の絵（viewBox 100×100）。知らない id は ピアノ。 */
export function musicInstrumentSvg(id, className = "") {
  const known = Object.hasOwn(INSTRUMENT_ART, id) ? id : "piano";
  return svg("0 0 100 100", INSTRUMENT_ART[known], `music-instrument-art is-${known}${className ? ` ${className}` : ""}`);
}

/**
 * 先生（せんせいと の遊び）。顔を上げて、手で前を指す。言うことは吹き出しに出す（絵の外、HTML）。
 * 肌・髪・服は はっきりした色。黄色は使わない。
 */
export function musicTeacherSvg() {
  return svg(
    "0 0 120 140",
    // 体（みどりの上着）と、前へ出した手
    `<path d="M26 136 Q26 92 60 90 Q94 92 94 136 Z" fill="#03AF7A" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
      `<path d="M60 92 L52 112 L60 106 L68 112 Z" fill="${WHITE}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M90 104 Q106 98 112 82" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M90 104 Q106 98 112 82" fill="none" stroke="#03AF7A" stroke-width="6" stroke-linecap="round"/>` +
      `<circle cx="113" cy="78" r="7" fill="#FFD9B8" stroke="${INK}" stroke-width="4"/>` +
      // 顔と髪
      `<path d="M30 52 Q28 14 60 12 Q92 14 90 52 Q92 66 84 72 L36 72 Q28 66 30 52 Z" fill="#4A3426" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
      `<circle cx="60" cy="54" r="26" fill="#FFD9B8" stroke="${INK}" stroke-width="5"/>` +
      `<path d="M36 44 Q48 26 70 30 Q80 32 84 44 Q70 36 56 40 Q44 42 36 44 Z" fill="#4A3426"/>` +
      `<circle cx="50" cy="56" r="3.6" fill="${INK}"/>` +
      `<circle cx="70" cy="56" r="3.6" fill="${INK}"/>` +
      `<path d="M50 66 Q60 74 70 66" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="43" cy="64" r="4" fill="#FF9BA8" opacity="0.8"/>` +
      `<circle cx="77" cy="64" r="4" fill="#FF9BA8" opacity="0.8"/>`,
    "music-teacher-art"
  );
}

/**
 * 音楽室の背景（壁・黒板と音符・床）。動かさない（拍や合図と取り違える動きを置かない、の決まりは
 * この遊びには無いが、見る先を楽器に集めるため）。主役より控えめな淡い色。
 */
export function musicRoomBackdropSvg() {
  const notes = [
    [22, 26, 0],
    [40, 18, 1],
    [58, 28, 0],
    [76, 20, 1],
  ]
    .map(
      ([x, y, flag]) =>
        `<ellipse cx="${x}" cy="${y + 10}" rx="4" ry="3" fill="#EAF4EC" transform="rotate(-20 ${x} ${y + 10})"/>` +
        `<path d="M${x + 3.6} ${y + 9} V${y - 4}${flag ? ` L${x + 10} ${y}` : ""}" stroke="#EAF4EC" stroke-width="1.6" fill="none"/>`
    )
    .join("");
  return svg(
    "0 0 100 60",
    `<rect width="100" height="60" fill="#FFF4E6"/>` +
      `<rect x="12" y="6" width="76" height="34" rx="2" fill="#2F6B4F" stroke="#8A5A36" stroke-width="2.4"/>` +
      `<path d="M14 16 H86 M14 20 H86 M14 24 H86 M14 28 H86 M14 32 H86" stroke="#4E8A6C" stroke-width="0.6"/>` +
      notes +
      `<rect y="46" width="100" height="14" fill="#E9C9A0"/>` +
      `<path d="M0 46 H100" stroke="#C99A6A" stroke-width="1.2"/>` +
      `<path d="M10 50 H30 M44 54 H70 M80 51 H96" stroke="#DDB688" stroke-width="0.8" stroke-linecap="round"/>`,
    "music-room-backdrop"
  );
}
