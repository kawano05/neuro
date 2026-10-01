/**
 * 見え方の版。session.config.artVersion に残し、CSV の最後の列に出す。
 *
 * 絵が変わった前後の回を解析で分けられるよう、判定の版とは別に残す。
 * この列を持たない古い記録は空欄。
 *   1 … Font Awesome と CSS の輪郭の絵。そくていの回は今もこの見え方
 *   2 … れんしゅうの回だけ SVG の絵と遊園地にした（2026-09-30）。
 *       並び・周期・判定は 1 と同じ。1コマの高さは画面に合わせて変わり、記録の reelCellPx に残る。
 *   記録するのは見せた絵の版: そくていの回は、いつでも 1（src/lib/artVersion.js）。
 */
export const SLOT_ART_VERSION = 2;

// 測定の刺激と分けておくことで、遊びの絵を直してもそくていの見え方を保つ。
const SYMBOL_BODIES = Object.freeze({
  circle: `<circle cx="50" cy="50" r="45" fill="#FF4B00"/><path d="M17 69 Q50 96 83 69" fill="none" stroke="#D93F00" stroke-width="8"/><ellipse cx="32" cy="29" rx="9" ry="14" transform="rotate(35 32 29)" fill="#FFF" stroke="none"/>`,
  square: `<rect x="5" y="5" width="90" height="90" rx="8" fill="#03AF7A"/><path d="M9 72 H91 V87 Q91 91 87 91 H13 Q9 91 9 87Z" fill="#02875E" stroke="none"/><path d="M19 58 V20 H65" fill="none" stroke="#CFF7E6" stroke-width="7"/>`,
  star: `<path d="M50 5 Q53 5 55 10 L65 33 L90 35 Q97 36 92 42 L73 59 L80 86 Q82 94 75 90 L50 75 L25 90 Q18 94 20 86 L27 59 L8 42 Q3 36 10 35 L35 33 L45 10 Q47 5 50 5Z" fill="#F6AA00"/><path d="M50 19 L43 38 L23 40" fill="none" stroke="#FFF2CF" stroke-width="5"/>`,
  fish: `<path d="M70 31 L94 13 L89 49 L95 83 L70 67Z" fill="#1FA2E0"/><path d="M35 30 Q43 9 61 15 L62 35" fill="#1FA2E0"/><path d="M5 50 Q19 19 51 25 Q70 27 78 50 Q68 77 47 77 Q19 78 5 50Z" fill="#4DC4FF"/><path d="M21 62 Q44 77 67 59 Q58 73 43 73Z" fill="#D8F3FF" stroke="none"/><path d="M48 48 Q65 49 58 62Z" fill="#1FA2E0" stroke-width="3"/><circle cx="26" cy="43" r="6" fill="#10222E" stroke="none"/><circle cx="28" cy="41" r="2" fill="#FFF" stroke="none"/><path d="M13 54 Q19 59 25 54" fill="none" stroke="#10222E" stroke-width="3"/>`,
  bird: `<path d="M64 66 L91 53 L86 75 L69 79Z" fill="#004FE0"/><path d="M38 82 L32 94 M55 83 L61 94" fill="none" stroke="#1A1A1A" stroke-width="4"/><path d="M18 44 L5 51 L20 57Z" fill="#F6AA00"/><path d="M18 46 Q15 15 41 9 Q71 2 77 38 Q89 77 59 86 Q24 94 18 65Z" fill="#005AFF"/><ellipse cx="43" cy="65" rx="17" ry="18" fill="#CFE6FF" stroke="none"/><path d="M51 46 Q74 39 70 65 Q57 73 51 46Z" fill="#004FE0" stroke-width="3"/><circle cx="33" cy="35" r="6" fill="#10222E" stroke="none"/><circle cx="35" cy="33" r="2" fill="#FFF" stroke="none"/><path d="M23 52 Q30 57 35 52" fill="none" stroke="#10222E" stroke-width="3"/>`,
  flower: `<path d="M37 22 C32 0 67 0 63 22 C82 6 101 33 81 44 C105 50 94 82 73 73 C75 99 40 105 38 79 C18 96 0 70 20 57 C-3 43 11 16 37 22Z" fill="#D65DB1"/><path d="M17 40 Q17 29 28 30 M49 13 Q56 11 58 19" fill="none" stroke="#FFE4F6" stroke-width="5"/><circle cx="50" cy="51" r="18" fill="#F6AA00" stroke-width="4"/><circle cx="44" cy="48" r="3" fill="#10222E" stroke="none"/><circle cx="57" cy="48" r="3" fill="#10222E" stroke="none"/><circle cx="45" cy="47" r="1" fill="#FFF" stroke="none"/><circle cx="58" cy="47" r="1" fill="#FFF" stroke="none"/><path d="M44 57 Q50 63 57 57" fill="none" stroke="#10222E" stroke-width="2.5"/>`,
});

/** 絵がら1つの <svg>（おおさわぎのびん・パレードの飾り。art/partyThemeArt.js）。 */
export function slotSymbolSvg(symbolId) {
  const id = Object.hasOwn(SYMBOL_BODIES, symbolId) ? symbolId : "circle";
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g stroke="#1A1A1A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${SYMBOL_BODIES[id]}</g></svg>`;
}

/** 目標の名前は既存の札で伝え、SVG自体は読み上げと走査に加えない。 */
export function slotPracticeSymbolHtml(symbolId, { label = "", decorative = true } = {}) {
  const id = Object.hasOwn(SYMBOL_BODIES, symbolId) ? symbolId : "circle";
  const accessibility = decorative
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${String(label).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;
  return `<span class="slot-symbol is-${id} slot-world-symbol" data-symbol="${id}" ${accessibility}><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g stroke="#1A1A1A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${SYMBOL_BODIES[id]}</g></svg></span>`;
}

const cloud = `<path d="M8 48 Q0 22 25 23 Q26 0 51 5 Q73 0 81 24 Q105 19 109 43 Q116 58 94 59 H23 Q7 60 8 48Z" fill="#FFF"/>`;

/** 見て止める課題の追視対象を増やさないため、背景は一度作って静止させる。 */
export function slotWorldHtml() {
  const cabins = Array.from({ length: 8 }, (_, index) => {
    const angle = index * Math.PI / 4;
    const x = 150 + Math.cos(angle) * 103;
    const y = 140 + Math.sin(angle) * 103;
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})"><rect x="-13" y="-9" width="26" height="24" rx="8" fill="#A8CBB8" stroke="#7BAF9F" stroke-width="3"/><path d="M-8 -2 H8" stroke="#FFF" stroke-width="5" stroke-linecap="round"/></g>`;
  }).join("");
  return `<div class="slot-world" aria-hidden="true">
    <svg class="slot-world-cloud slot-world-cloud-one" viewBox="0 0 120 65" aria-hidden="true">${cloud}</svg>
    <svg class="slot-world-cloud slot-world-cloud-two" viewBox="0 0 120 65" aria-hidden="true">${cloud}</svg>
    <svg class="slot-world-cloud slot-world-cloud-three" viewBox="0 0 120 65" aria-hidden="true">${cloud}</svg>
    <svg class="slot-world-landscape" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 539 Q156 365 330 515 Q540 351 764 514 Q982 373 1200 480 V800 H0Z" fill="#B5E9DB"/>
      <path d="M0 623 Q198 481 421 586 Q644 461 824 578 Q1050 458 1200 600 V800 H0Z" fill="#7FD3B3"/>
      <path d="M0 717 Q282 650 600 703 Q947 652 1200 701 V800 H0Z" fill="#D3EBC2"/>
      <path d="M0 776 Q324 723 632 756 Q941 727 1200 758 V800 H0Z" fill="#F3DEC0"/>
    </svg>
    <svg class="slot-world-wheel" viewBox="0 0 300 310" aria-hidden="true">
      <path d="M150 140 L99 295 H201Z" fill="#D3EBC2" stroke="#9ABAA8" stroke-width="7" stroke-linejoin="round"/>
      <g>
        <circle cx="150" cy="140" r="103" fill="none" stroke="#9ABAA8" stroke-width="6"/>
        <circle cx="150" cy="140" r="80" fill="none" stroke="#FFF" stroke-width="3"/>
        <path d="M47 140 H253 M150 37 V243 M77 67 L223 213 M77 213 L223 67" stroke="#9ABAA8" stroke-width="4"/>
        ${cabins}
      </g><circle cx="150" cy="140" r="13" fill="#7BAF9F" stroke="#FFF" stroke-width="4"/>
    </svg>
    <svg class="slot-world-tent" viewBox="0 0 240 190" aria-hidden="true">
      <path d="M120 8 V37 M120 9 L156 19 L120 29" fill="#9ABAA8" stroke="#7BAF9F" stroke-width="3"/>
      <path d="M27 83 H213 L198 179 H42Z" fill="#FFF4E9"/>
      <path d="M120 35 L15 88 H225Z" fill="#A8CBB8"/>
      <path d="M120 35 L85 88 H155Z" fill="#FFF4E9"/>
      <path d="M101 179 V131 Q120 104 139 131 V179" fill="#9ABAA8"/>
      <path d="M15 88 H225 M42 179 H198" stroke="#9ABAA8" stroke-width="6" stroke-linecap="round"/>
    </svg>
    <svg class="slot-world-shrubs" viewBox="0 0 1200 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 100 V52 Q24 17 47 48 Q79 0 113 48 Q140 32 159 70 V100 M1045 100 V64 Q1070 21 1095 49 Q1128 0 1155 48 Q1185 15 1200 54 V100" fill="#03AF7A"/>
      <path d="M180 87 Q221 76 265 89 M915 86 Q960 76 1005 89" fill="none" stroke="#D4B88E" stroke-width="5" stroke-linecap="round"/>
    </svg>
  </div>`;
}
