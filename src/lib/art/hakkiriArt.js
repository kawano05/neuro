// =====================================================================
// art/hakkiriArt.js — 利用者の世界の絵（デザイン案「はっきりした色」から）
//
// デザイン案 nuro-design-hakkiri.html の仮の絵をそのまま部品にしたもの。
// 案にも「絵は仮のもの」とあるので、差し替えるときはこのファイルだけを直す。
//
// 画像ファイルではなくSVGの文字列で持つのは、オフラインで動かすため
// （Service Worker の事前キャッシュを増やさない）と、色を1か所で変えられるため。
// 外側の <svg> は artSvg() が組む。大きさと aria-hidden を呼び出し側で
// ばらばらに書くと、どこか1枚だけ読み上げに乗る。
// =====================================================================

/** ホームのサムネイルと遊びかたカードの背景（viewBox 360x176 / 360x200）。 */
export const SCENE_ART = {
  pop: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#12305E"></rect><svg x="112" y="18" width="150" height="120" viewBox="0 0 300 240"><path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path><path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path><path d="M92 166 C 130 180, 186 174, 228 140 C 206 170, 160 188, 120 186 C 106 185, 98 177, 92 166 Z" fill="#D8F3FF"></path><path d="M150 172 C 150 196, 140 210, 124 218 C 128 200, 130 186, 136 174 Z" fill="#1FA2E0"></path><circle cx="222" cy="104" r="8" fill="#10222E"></circle><circle cx="225" cy="101" r="2.5" fill="#FFFFFF"></circle><path d="M240 126 C 248 131, 257 130, 266 125" fill="none" stroke="#10222E" stroke-width="4" stroke-linecap="round"></path></svg><path d="M92 40 L 95.0 49.0 L 104 52 L 95.0 55.0 L 92 64 L 89.0 55.0 L 80 52 L 89.0 49.0 Z" fill="#FFC83D"></path><path d="M270 31 L 272.25 37.75 L 279 40 L 272.25 42.25 L 270 49 L 267.75 42.25 L 261 40 L 267.75 37.75 Z" fill="#FFC83D"></path><path d="M262 121 L 263.75 126.25 L 269 128 L 263.75 129.75 L 262 135 L 260.25 129.75 L 255 128 L 260.25 126.25 Z" fill="#FFFFFF"></path>`,
  },
  reel: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#FFE5DA"></rect><rect x="78" y="32" width="204" height="112" rx="16" fill="#6F5BB8"></rect><rect x="90" y="46" width="52" height="84" rx="8" fill="#FFFDF4"></rect><rect x="154" y="46" width="52" height="84" rx="8" fill="#FFFDF4"></rect><rect x="218" y="46" width="52" height="84" rx="8" fill="#FFFDF4"></rect><path d="M100 88 C 110 76, 126 76, 134 88 C 126 100, 110 100, 100 88 Z M134 88 L 142 80 L 142 96 Z" fill="#FF7A2F"></path><path d="M180 70 L 186 83 L 200 84 L 189 93 L 193 107 L 180 99 L 167 107 L 171 93 L 160 84 L 174 83 Z" fill="#F6AA00"></path><circle cx="244" cy="88" r="9" fill="#F6AA00"></circle><circle cx="258.0" cy="88.0" r="8" fill="#FF6FA8"></circle><circle cx="251.0" cy="100.1" r="8" fill="#FF6FA8"></circle><circle cx="237.0" cy="100.1" r="8" fill="#FF6FA8"></circle><circle cx="230.0" cy="88.0" r="8" fill="#FF6FA8"></circle><circle cx="237.0" cy="75.9" r="8" fill="#FF6FA8"></circle><circle cx="251.0" cy="75.9" r="8" fill="#FF6FA8"></circle><circle cx="244" cy="88" r="8" fill="#F6AA00"></circle><path d="M84 88 L 72 80 L 72 96 Z M276 88 L 288 80 L 288 96 Z" fill="#FF4B00"></path>`,
  },
  high: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#F6DDF6"></rect><rect x="88" y="110" width="30" height="40" rx="6" fill="#FF8082"></rect><rect x="128" y="92" width="30" height="58" rx="6" fill="#F6AA00"></rect><rect x="168" y="74" width="30" height="76" rx="6" fill="#03AF7A"></rect><rect x="208" y="56" width="30" height="94" rx="6" fill="#4DC4FF"></rect><rect x="248" y="38" width="30" height="112" rx="6" fill="#B98CFF"></rect><path d="M90 44 L 90 78" fill="none" stroke="#FFC83D" stroke-width="6" stroke-linecap="round"></path><ellipse cx="82" cy="80" rx="11" ry="8" fill="#FFC83D"></ellipse><path d="M90 44 C 100 48, 106 54, 108 62" fill="none" stroke="#FFC83D" stroke-width="6" stroke-linecap="round"></path><path d="M260 42 L 260 18 M250 28 L 260 18 L 270 28" fill="none" stroke="#FFC83D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path>`,
  },
  arm: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#F3E4D6"></rect><rect x="96" y="20" width="168" height="142" rx="16" fill="#FF8A5C"></rect><rect x="108" y="40" width="144" height="110" rx="8" fill="#FFF4E6"></rect><path d="M108 52 L 252 52" fill="none" stroke="#FF8A5C" stroke-width="6"></path><path d="M180 52 L 180 84" fill="none" stroke="#5A6B7B" stroke-width="6"></path><circle cx="180" cy="88" r="7" fill="#5A6B7B"></circle><path d="M174 92 L 160 108 L 166 118 M186 92 L 200 108 L 194 118" fill="none" stroke="#5A6B7B" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"></path><path d="M180 112 L 187 126 L 202 127 L 190 136 L 195 150 L 180 142 L 165 150 L 170 136 L 158 127 L 173 126 Z" fill="#F6AA00"></path>`,
  },
  fish: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#D9F3FF"></rect><rect x="-360" y="118" width="1080" height="120" fill="#2C6E9E" opacity="0.55"></rect><path d="M60 128 C 90 118, 110 138, 140 128 C 170 118, 190 138, 220 128 C 250 118, 270 138, 300 128" fill="none" stroke="#7FD4FF" stroke-width="5" stroke-linecap="round"></path><path d="M232 16 L 232 70" fill="none" stroke="#FFFFFF" stroke-width="3"></path><path d="M232 70 C 232 82, 222 84, 218 76" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"></path><path d="M112 92 C 132 60, 190 56, 222 86 C 190 116, 132 116, 112 92 Z" fill="#FF7A2F"></path><path d="M114 92 L 84 70 L 90 92 L 84 114 Z" fill="#FF7A2F"></path><circle cx="200" cy="84" r="7" fill="#FFFFFF"></circle><circle cx="202" cy="84" r="4" fill="#10222E"></circle><circle cx="270" cy="44" r="24" fill="#FFC83D"></circle><rect x="266" y="26" width="8" height="24" rx="4" fill="#1A1A1A"></rect><circle cx="270" cy="58" r="4.5" fill="#1A1A1A"></circle>`,
  },
  learn: {
    viewBox: "0 0 360 176",
    body: `<rect x="0" y="0" width="360" height="176" fill="#D6F5EA"></rect><rect x="96" y="40" width="96" height="120" rx="12" fill="#9BE0B0" transform="rotate(-10 144 100)"></rect><circle cx="138" cy="100" r="22" fill="#FF7A2F" transform="rotate(-10 144 100)"></circle><rect x="160" y="44" width="96" height="120" rx="12" fill="#4DC4FF" transform="rotate(8 208 104)"></rect><rect x="168" y="52" width="80" height="104" rx="8" fill="#FFFFFF" transform="rotate(8 208 104)"></rect><path d="M208 76 L 232 124 L 184 124 Z" fill="#03AF7A" transform="rotate(8 208 104)"></path><rect x="222" y="14" width="82" height="46" rx="14" fill="#FFC87A"></rect><path d="M236 58 L 230 72 L 250 58 Z" fill="#FFC87A"></path><circle cx="246" cy="37" r="5" fill="#FFFFFF"></circle><circle cx="263" cy="37" r="5" fill="#FFFFFF"></circle><circle cx="280" cy="37" r="5" fill="#FFFFFF"></circle>`,
  },
  balloon: {
    viewBox: "0 0 360 176",
    body: `<rect x="-360" y="0" width="1080" height="176" fill="#FFF3CC"></rect><ellipse cx="62" cy="146" rx="54" ry="16" fill="#FFFFFF"></ellipse><ellipse cx="300" cy="152" rx="60" ry="15" fill="#FFFFFF"></ellipse><path d="M128 118 C 122 136, 136 150, 130 170" fill="none" stroke="#5A6B7B" stroke-width="2"></path><path d="M188 104 C 194 128, 180 146, 188 170" fill="none" stroke="#5A6B7B" stroke-width="2"></path><path d="M246 116 C 240 136, 254 152, 248 170" fill="none" stroke="#5A6B7B" stroke-width="2"></path><ellipse cx="128" cy="80" rx="28" ry="36" fill="#FF4B00"></ellipse><path d="M122 114 L 134 114 L 128 121 Z" fill="#FF4B00"></path><ellipse cx="118" cy="66" rx="6" ry="10" fill="#FFFFFF" opacity="0.55"></ellipse><ellipse cx="188" cy="64" rx="30" ry="38" fill="#03AF7A"></ellipse><path d="M182 100 L 194 100 L 188 107 Z" fill="#03AF7A"></path><ellipse cx="177" cy="50" rx="6" ry="10" fill="#FFFFFF" opacity="0.55"></ellipse><ellipse cx="246" cy="80" rx="27" ry="35" fill="#005AFF"></ellipse><path d="M240 113 L 252 113 L 246 120 Z" fill="#005AFF"></path><ellipse cx="237" cy="66" rx="6" ry="10" fill="#FFFFFF" opacity="0.55"></ellipse><path d="M300 40 L 306 56 L 322 52 L 312 64 L 326 74 L 308 74 L 306 90 L 298 76 L 284 84 L 290 68 L 276 58 L 294 58 Z" fill="#F6AA00"></path>`,
  },
  coloring: {
    viewBox: "0 0 360 176",
    body: `<rect x="-360" y="0" width="1080" height="176" fill="#FFF6E0"></rect><path d="M168 20 L 187 68 L 238 70 L 198 102 L 212 152 L 168 124 L 124 152 L 138 102 L 98 70 L 149 68 Z" fill="#FFFFFF"></path><path d="M168 20 L 187 68 L 238 70 L 198 102 L 212 152 L 168 124 Z" fill="#F6AA00"></path><path d="M168 20 L 187 68 L 238 70 L 198 102 L 212 152 L 168 124 L 124 152 L 138 102 L 98 70 L 149 68 Z" fill="none" stroke="#1A1A1A" stroke-width="4" stroke-linejoin="round"></path><g transform="rotate(32 286 92)"><rect x="272" y="34" width="28" height="92" rx="6" fill="#FF4B00"></rect><rect x="272" y="52" width="28" height="10" fill="#FFFFFF" opacity="0.5"></rect><path d="M272 126 L 300 126 L 286 150 Z" fill="#F5D6B8"></path><path d="M281 142 L 291 142 L 286 150 Z" fill="#FF4B00"></path></g><path d="M84 122 L 88 134 L 100 138 L 88 142 L 84 154 L 80 142 L 68 138 L 80 134 Z" fill="#4DC4FF"></path>`,
  },
  reelOne: {
    viewBox: "0 0 360 200",
    body: `<rect x="0" y="0" width="360" height="200" fill="#FFE5DA"></rect><rect x="130" y="30" width="100" height="140" rx="16" fill="#6F5BB8"></rect><rect x="146" y="46" width="68" height="108" rx="10" fill="#FFFDF4"></rect><path d="M180 72 L 188 90 L 207 91 L 192 103 L 197 122 L 180 111 L 163 122 L 168 103 L 153 91 L 172 90 Z" fill="#F6AA00"></path>`,
  },
  reelThree: {
    viewBox: "0 0 360 200",
    body: `<rect x="0" y="0" width="360" height="200" fill="#FFE5DA"></rect><rect x="60" y="30" width="240" height="140" rx="16" fill="#6F5BB8"></rect><rect x="80" y="46" width="60" height="108" rx="10" fill="#FFFDF4"></rect><rect x="150" y="46" width="60" height="108" rx="10" fill="#FFFDF4"></rect><rect x="220" y="46" width="60" height="108" rx="10" fill="#FFFDF4"></rect><path d="M90 100 C 100 88, 116 88, 124 100 C 116 112, 100 112, 90 100 Z M124 100 L 132 92 L 132 108 Z" fill="#FF7A2F"></path><path d="M180 80 L 186 94 L 201 95 L 190 104 L 194 119 L 180 110 L 166 119 L 170 104 L 159 95 L 174 94 Z" fill="#F6AA00"></path><circle cx="250" cy="100" r="16" fill="#03AF7A"></circle>`,
  },
};

/** 「おすと でてくる」で出てくる動物（viewBox 300x240）。出てくる順。 */
export const POP_ANIMALS = [
  {
    id: "dolphin",
    viewBox: "0 0 300 240",
    body: `<path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path><path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path><path d="M92 166 C 130 180, 186 174, 228 140 C 206 170, 160 188, 120 186 C 106 185, 98 177, 92 166 Z" fill="#D8F3FF"></path><path d="M150 172 C 150 196, 140 210, 124 218 C 128 200, 130 186, 136 174 Z" fill="#1FA2E0"></path><circle cx="222" cy="104" r="8" fill="#10222E"></circle><circle cx="225" cy="101" r="2.5" fill="#FFFFFF"></circle><path d="M240 126 C 248 131, 257 130, 266 125" fill="none" stroke="#10222E" stroke-width="4" stroke-linecap="round"></path>`,
  },
  {
    id: "turtle",
    viewBox: "0 0 300 240",
    body: `<ellipse cx="90" cy="182" rx="24" ry="16" fill="#8FD9A8"></ellipse><ellipse cx="210" cy="182" rx="24" ry="16" fill="#8FD9A8"></ellipse><ellipse cx="94" cy="110" rx="22" ry="14" fill="#8FD9A8"></ellipse><ellipse cx="206" cy="110" rx="22" ry="14" fill="#8FD9A8"></ellipse><path d="M52 146 L 26 156 L 52 164 Z" fill="#8FD9A8"></path><circle cx="266" cy="140" r="32" fill="#8FD9A8"></circle><ellipse cx="150" cy="146" rx="102" ry="64" fill="#03AF7A"></ellipse><path d="M150 96 L 188 120 L 174 164 L 126 164 L 112 120 Z" fill="#02875E"></path><path d="M112 120 L 62 128 M188 120 L 238 128 M126 164 L 104 200 M174 164 L 196 200" fill="none" stroke="#02875E" stroke-width="8" stroke-linecap="round"></path><circle cx="276" cy="130" r="7" fill="#10222E"></circle><circle cx="278" cy="128" r="2.2" fill="#FFFFFF"></circle><path d="M268 152 C 274 157, 283 156, 290 150" fill="none" stroke="#10222E" stroke-width="4" stroke-linecap="round"></path>`,
  },
  {
    id: "octopus",
    viewBox: "0 0 300 240",
    body: `<path d="M96 132 C 70 166, 100 186, 72 218" fill="none" stroke="#D65DB1" stroke-width="24" stroke-linecap="round"></path><path d="M124 140 C 112 176, 136 192, 118 226" fill="none" stroke="#D65DB1" stroke-width="24" stroke-linecap="round"></path><path d="M152 142 C 150 180, 168 196, 156 228" fill="none" stroke="#D65DB1" stroke-width="24" stroke-linecap="round"></path><path d="M180 140 C 194 176, 172 194, 192 226" fill="none" stroke="#D65DB1" stroke-width="24" stroke-linecap="round"></path><path d="M206 132 C 232 164, 204 188, 232 216" fill="none" stroke="#D65DB1" stroke-width="24" stroke-linecap="round"></path><ellipse cx="150" cy="96" rx="76" ry="70" fill="#D65DB1"></ellipse><circle cx="124" cy="100" r="16" fill="#FFFFFF"></circle><circle cx="176" cy="100" r="16" fill="#FFFFFF"></circle><circle cx="127" cy="102" r="8" fill="#10222E"></circle><circle cx="173" cy="102" r="8" fill="#10222E"></circle><ellipse cx="102" cy="126" rx="12" ry="7" fill="#F29AD5"></ellipse><ellipse cx="198" cy="126" rx="12" ry="7" fill="#F29AD5"></ellipse><ellipse cx="150" cy="132" rx="9" ry="7" fill="#8E2E73"></ellipse>`,
  },
  {
    id: "crab",
    viewBox: "0 0 300 240",
    body: `<path d="M92 170 L 50 196 M96 184 L 60 214 M208 170 L 250 196 M204 184 L 240 214" fill="none" stroke="#D93F00" stroke-width="10" stroke-linecap="round"></path><path d="M100 130 L 70 96 M200 130 L 230 96" fill="none" stroke="#D93F00" stroke-width="14" stroke-linecap="round"></path><ellipse cx="60" cy="84" rx="30" ry="20" fill="#FF4B00" transform="rotate(-35 60 84)"></ellipse><ellipse cx="78" cy="58" rx="22" ry="12" fill="#FF4B00" transform="rotate(-70 78 58)"></ellipse><ellipse cx="240" cy="84" rx="30" ry="20" fill="#FF4B00" transform="rotate(35 240 84)"></ellipse><ellipse cx="222" cy="58" rx="22" ry="12" fill="#FF4B00" transform="rotate(70 222 58)"></ellipse><path d="M128 112 L 122 78 M172 112 L 178 78" fill="none" stroke="#D93F00" stroke-width="8" stroke-linecap="round"></path><ellipse cx="150" cy="150" rx="84" ry="52" fill="#FF4B00"></ellipse><circle cx="122" cy="72" r="14" fill="#FFFFFF"></circle><circle cx="178" cy="72" r="14" fill="#FFFFFF"></circle><circle cx="124" cy="74" r="7" fill="#10222E"></circle><circle cx="176" cy="74" r="7" fill="#10222E"></circle><path d="M130 160 C 142 170, 158 170, 170 160" fill="none" stroke="#10222E" stroke-width="5" stroke-linecap="round"></path>`,
  },
  {
    id: "whale",
    viewBox: "0 0 300 240",
    body: `<path d="M52 128 C 36 104, 22 94, 8 88 C 20 108, 26 122, 40 136 Z" fill="#004FE0"></path><path d="M52 140 C 34 150, 20 164, 10 180 C 30 176, 44 166, 56 152 Z" fill="#004FE0"></path><path d="M44 140 C 50 92, 120 64, 190 70 C 250 76, 282 114, 276 150 C 270 186, 214 204, 150 202 C 98 200, 48 184, 44 140 Z" fill="#005AFF"></path><path d="M118 186 C 168 198, 232 188, 268 160 C 258 188, 212 204, 154 203 C 136 202, 124 196, 118 186 Z" fill="#9CC3FF"></path><path d="M212 64 C 206 42, 194 32, 180 28 M212 64 C 214 42, 226 32, 242 28 M212 64 L 212 30" fill="none" stroke="#4DC4FF" stroke-width="7" stroke-linecap="round"></path><circle cx="232" cy="128" r="8" fill="#FFFFFF"></circle><circle cx="233" cy="129" r="4.5" fill="#10222E"></circle><path d="M236 154 C 246 160, 258 158, 266 150" fill="none" stroke="#10222E" stroke-width="4" stroke-linecap="round"></path>`,
  },
];

/**
 * 絵1枚を <svg> に組む。
 *
 * 絵は飾りなので常に aria-hidden。同じ意味は、タイルの名前や
 * 読み上げの文で別に伝えている。
 *
 * @param {{viewBox: string, body: string}} art
 * @param {{className?: string, slice?: boolean}} [options]
 *   slice=true は枠いっぱいに敷く（はみ出しを切る）。既定は絵を全部見せる
 *   （meet）。場面の絵は自分の地の色を塗ってあり、タイル側も同じ色を
 *   --tile-thumb で敷くので、余白が出ても継ぎ目にならない。背の低いタイルで
 *   slice にすると、イルカが背びれしか見えなくなった。
 */
export function artSvg(art, { className = "", slice = false } = {}) {
  if (!art) return "";
  const ratio = slice ? "xMidYMid slice" : "xMidYMid meet";
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="${art.viewBox}" preserveAspectRatio="${ratio}" aria-hidden="true" focusable="false">${art.body}</svg>`;
}

/**
 * ふうせん1つ（viewBox 120x190）。色は CSS の --balloon で塗る（.balloon-body）。
 * ふうせん わり（games/balloon.js）とけっかで使う。
 */
export const BALLOON_ART = {
  viewBox: "0 0 120 190",
  body:
    '<ellipse class="balloon-body" cx="60" cy="62" rx="48" ry="58"></ellipse>' +
    '<path class="balloon-body" d="M52 118 L 68 118 L 60 130 Z"></path>' +
    '<ellipse cx="44" cy="40" rx="10" ry="17" fill="#FFFFFF" opacity="0.5"></ellipse>' +
    '<path d="M60 130 C 50 150, 70 166, 60 188" fill="none" stroke="#5A6B7B" stroke-width="2.5"></path>',
};

/** はじけたあと（けっかに並べる星形）。色だけ変える。 */
export function burstSvg(color, { className = "" } = {}) {
  const cls = className ? ` class="${className}"` : "";
  return `<svg${cls} viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path d="M30 4 L 36 20 L 54 16 L 42 30 L 56 42 L 38 42 L 34 58 L 28 44 L 12 52 L 18 36 L 4 26 L 22 24 Z" fill="${color}" stroke="#1A1A1A" stroke-width="2.5" stroke-linejoin="round"></path></svg>`;
}
