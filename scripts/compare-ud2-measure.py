"""描画をリセットした測定画面を RGB で比較する。PNG の圧縮・アルファ差は数えない。"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

root = Path("output/playwright/ud2-measure")
rows = []
for before in sorted((root / "0").glob("*.png")):
    after = root / "1" / before.name
    left = np.asarray(Image.open(before).convert("RGB"))
    right = np.asarray(Image.open(after).convert("RGB"))
    if left.shape != right.shape:
        raise ValueError(f"Size mismatch: {before.name}")
    rows.append({
        "name": before.name,
        "rgb_pixels_changed": int(np.any(left != right, axis=2).sum()),
        "rgb_channels_changed": int((left != right).sum()),
        "max_channel_delta": int(np.abs(left.astype(int) - right.astype(int)).max()),
    })
(root / "comparison.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
changed = [row for row in rows if row["rgb_pixels_changed"]]
print(f"pairs={len(rows)} zero={len(rows) - len(changed)} changed={len(changed)}")
for row in changed:
    print(row)
if len(rows) != 90 or changed:
    raise SystemExit(1)
