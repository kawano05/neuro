# デザイン3案（配色の違い）を、1つのHTMLファイル（外部の実行環境なしで動く）として書き出す
# 比べる基準として、いまのアプリの画面（now/*.jpg、capture_now.mjs で撮影）も「現状」として入れる
import os, sys
import gen
import page_shell

gen.MODE = "html"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(gen.ROOT, "nuro-design-3variants.html")

SHORT = {"U": "ウルトラシンプル", "C": "落ち着いた色", "V": "はっきりした色"}
CONCEPT = {
    "U": "画面に出すものを最小限にした案です。白と黒を基本に、いま選べる場所だけを黄色の枠で示します。",
    "C": "やわらかい緑を基調にした、目にやさしい案です。遊ぶ画面は暗くして、出てくる絵を目立たせます。",
    "V": "遊びごとに色を分けた、見分けやすい案です。色の組み合わせは東京都のユニバーサルデザインガイドラインに沿っています。",
}

sections, meta, variants = [], {}, []
now_sections, now_meta, now_variant = page_shell.now_row(gen)
sections += now_sections
meta["N"] = now_meta
variants.append(now_variant)

for row in gen.ROWS:
    T = gen.V[row]
    meta[row] = {
        "ring": gen.ring(T), "dotOn": T["stage_accent"], "dotOff": T["stage_line"],
        "selBg": T["accent"], "selInk": T["accent_ink"], "selBorder": T["accent"],
        "unsBg": T["surface"], "unsInk": T["ink"], "unsBorder": T["line"],
    }
    variants.append({"id": row, "label": SHORT[row], "name": T["name"], "concept": CONCEPT[row]})
    for scr, label, fn in gen.SCREENS:
        body = fn(T, gen.pfx_for(row))
        sections.append(f'<section class="screen" data-variant="{row}" data-screen="{scr}" aria-label="{SHORT[row]}｜{label}" hidden>{body}</section>')

HTML = page_shell.render(
    title="NURO デザイン3案プロトタイプ",
    brand="NURO デザイン3案",
    brand_sub="画面デザイン案（絵は仮のものです）",
    variants=variants,
    sections=sections,
    meta=meta,
    screens=[{"id": s, "label": l} for s, l, _ in gen.SCREENS],
    default_v="C",
)

with open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(HTML)
print(OUT, len(HTML.encode("utf-8")))
