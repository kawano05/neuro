// スロット型課題の絵柄と、生成画像素材のURL。
//
// PNG はゲーム内の絵柄見本として使う。判定に使う個々の絵柄は Font Awesome と
// CSS の輪郭を組み合わせ、色が分からなくても形だけで区別できるようにする。
// new URL(..., import.meta.url) なら Vite と素の Node テストの両方で読める。

export const slotSymbolStripUrl = new URL(
  "../../assets/slot/slot-symbol-strip-v1.png",
  import.meta.url
).href;

export const SLOT_SYMBOL_ART = Object.freeze({
  circle: { iconClass: "", shapeClass: "is-circle" },
  fish: { iconClass: "fa-solid fa-fish", shapeClass: "is-fish" },
  star: { iconClass: "fa-solid fa-star", shapeClass: "is-star" },
  flower: { iconClass: "fa-solid fa-fan", shapeClass: "is-flower" },
  bird: { iconClass: "fa-solid fa-dove", shapeClass: "is-bird" },
  square: { iconClass: "", shapeClass: "is-square" },
});

/** 固定IDだけを受け取るため、innerHTMLへ入れても外部文字列は混ざらない。 */
export function slotSymbolHtml(symbolId, { label = "", decorative = true } = {}) {
  const art = SLOT_SYMBOL_ART[symbolId] || SLOT_SYMBOL_ART.circle;
  const accessibility = decorative
    ? 'aria-hidden="true"'
    : `role="img" aria-label="${String(label).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;
  const icon = art.iconClass ? `<i class="${art.iconClass}" aria-hidden="true"></i>` : "";
  return `<span class="slot-symbol ${art.shapeClass}" data-symbol="${symbolId}" ${accessibility}>${icon}</span>`;
}
