"""さかなつりの絵（src/assets/fishing/*.png）を2倍の細かさにする（2026-09-27 に1度だけ行った）。

  python scripts/upscale-fishing-art.py

元の絵は小さく（船 360px、魚 200〜320px）、iPad の2倍密度の画面では 1.3〜1.6 倍に
引き伸ばされて、輪郭がぼやけていた（2026-09-27 に測った）。絵そのもの（形・色）は
変えない——測定の遊びの見え方を変えないため。2倍に拡大（Lanczos）してから、
輪郭だけ少し締める（アンシャープマスク）。透明の縁が黒ずまないように、色に透明度を
掛けた状態（premultiplied）で拡大し、元と同じ 256 色のパレットで保存する。

元の大きさ（ORIGINAL_WIDTH）のファイルだけを拡大する。すでに拡大してあるものは
飛ばす（くり返し走らせても、拡大を重ねない）。元の絵は git の履歴にある。
"""
from pathlib import Path

from PIL import Image, ImageFilter

ART = Path("src/assets/fishing")
ORIGINAL_WIDTH = {
    "boat.png": 360,
    "boot.png": 200,
    "fish-large.png": 320,
    "fish-medium.png": 260,
    "fish-small.png": 200,
}

for name, width0 in ORIGINAL_WIDTH.items():
    path = ART / name
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    if width != width0:
        print(f"{name}: {width}x{height}（拡大ずみ。飛ばす）")
        continue
    big = image.convert("RGBa").resize((width * 2, height * 2), Image.Resampling.LANCZOS).convert("RGBA")
    red, green, blue, alpha = big.split()
    rgb = Image.merge("RGB", (red, green, blue)).filter(ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
    result = Image.merge("RGBA", (*rgb.split(), alpha))
    result.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    print(f"{name}: {width}x{height} -> {width * 2}x{height * 2}, {path.stat().st_size // 1024} KB")
