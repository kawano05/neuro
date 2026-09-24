# NURO デザイン3案（ウルトラシンプル／C案／はっきり）を .dc.html として書き出す
import json, os, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.join(ROOT, "project")
os.makedirs(PROJ, exist_ok=True)
W, H = 1180, 820

# ---------------------------------------------------------------- tokens
# キーはアプリの styles.css の変数名に合わせる（focus-outer・thumb-* は新規）
FONT_UD = "'BIZ UDPGothic', 'Hiragino Sans', 'Yu Gothic UI', sans-serif"
FONT_MARU = "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'BIZ UDPGothic', sans-serif"

ACTS = ["shokyu", "reel", "high", "learn", "arm", "fish"]

V = {
    "U": dict(
        name="ウルトラシンプル版", key="ultra",
        bg="#FFFFFF", surface="#FFFFFF", surface_alt="#F2F2F2", ink="#111111", muted="#444444",
        line="#111111", line_w=3, accent="#111111", accent_ink="#FFFFFF",
        focus="#FFC83D", focus_outer="#111111",
        stage_outer="#000000", stage_head="#000000", stage="#000000", stage_ink="#FFFFFF",
        stage_line="#333333", stage_accent="#FFC83D",
        radius=20, font_display=FONT_UD, font_body=FONT_UD, display_weight=700,
        thumb={a: "#000000" for a in ACTS},
        band=None,
    ),
    "C": dict(
        name="C案（落ち着いた版）", key="c",
        bg="#F3FAF5", surface="#FFFFFF", surface_alt="#E8F1EC", ink="#263D40", muted="#486467",
        line="#6E8A82", line_w=2, accent="#247D6C", accent_ink="#FFFFFF",
        focus="#F5AD19", focus_outer="#263D40",
        stage_outer="#0C1320", stage_head="#101927", stage="#030609", stage_ink="#F6F8FC",
        stage_line="#516078", stage_accent="#8BDDC0",
        radius=15, font_display=FONT_MARU, font_body=FONT_UD, display_weight=700,
        thumb={"shokyu": "#0D1B22", "reel": "#2A2344", "high": "#25203B", "learn": "#2B3046", "arm": "#123C38", "fish": "#16395A"},
        band=None,
    ),
    "V": dict(
        name="はっきり版", key="clear",
        bg="#FFFFFF", surface="#FFFFFF", surface_alt="#FFFFFF", ink="#1A1A1A", muted="#3A3A3A",
        line="#1A1A1A", line_w=2, accent="#005AFF", accent_ink="#FFFFFF",
        focus="#FFC83D", focus_outer="#1A1A1A",
        stage_outer="#000814", stage_head="#000814", stage="#000000", stage_ink="#FFFFFF",
        stage_line="#3A4A66", stage_accent="#FFC83D",
        radius=18, font_display=FONT_MARU, font_body=FONT_UD, display_weight=900,
        thumb={"shokyu": "#FFE5DA", "reel": "#DCE8FF", "high": "#F6DDF6", "learn": "#D6F5EA", "arm": "#F3E4D6", "fish": "#D9F3FF"},
        # 活動ごとの色帯と、その上の文字色（コントラスト比4.5以上を確認済み）
        band={"shokyu": ("#FF4B00", "#1A1A1A"), "reel": ("#005AFF", "#FFFFFF"), "high": ("#990099", "#FFFFFF"),
              "learn": ("#03AF7A", "#1A1A1A"), "arm": ("#804000", "#FFFFFF"), "fish": ("#4DC4FF", "#1A1A1A")},
    ),
}
ROWS = ["U", "C", "V"]


def ring(T):
    return f"0 0 0 5px {T['focus']}, 0 0 0 8px {T['focus_outer']}"


# ---------------------------------------------------------------- art (inline SVG)
def creature(i):
    """5種の生き物。viewBox 0 0 300 240"""
    if i == 0:  # イルカ
        return ('<path d="M40 150 C 60 80, 150 50, 225 85 C 250 97, 268 112, 282 124 C 262 124, 250 126, 240 132 C 234 162, 200 186, 150 188 C 110 190, 80 182, 60 172 C 45 190, 30 204, 16 210 C 22 190, 28 172, 40 150 Z" fill="#4DC4FF"></path>'
                '<path d="M138 72 C 148 46, 168 36, 186 32 C 178 50, 176 66, 180 82 Z" fill="#1FA2E0"></path>'
                '<path d="M92 166 C 130 180, 186 174, 228 140 C 206 170, 160 188, 120 186 C 106 185, 98 177, 92 166 Z" fill="#D8F3FF"></path>'
                '<path d="M150 172 C 150 196, 140 210, 124 218 C 128 200, 130 186, 136 174 Z" fill="#1FA2E0"></path>'
                '<circle cx="222" cy="104" r="8" fill="#10222E"></circle><circle cx="225" cy="101" r="2.5" fill="#FFFFFF"></circle>'
                '<path d="M240 126 C 248 131, 257 130, 266 125" fill="none" stroke="#10222E" style="stroke-width: 4; stroke-linecap: round"></path>')
    if i == 1:  # カメ
        return ('<ellipse cx="90" cy="182" rx="24" ry="16" fill="#8FD9A8"></ellipse><ellipse cx="210" cy="182" rx="24" ry="16" fill="#8FD9A8"></ellipse>'
                '<ellipse cx="94" cy="110" rx="22" ry="14" fill="#8FD9A8"></ellipse><ellipse cx="206" cy="110" rx="22" ry="14" fill="#8FD9A8"></ellipse>'
                '<path d="M52 146 L 26 156 L 52 164 Z" fill="#8FD9A8"></path>'
                '<circle cx="266" cy="140" r="32" fill="#8FD9A8"></circle>'
                '<ellipse cx="150" cy="146" rx="102" ry="64" fill="#03AF7A"></ellipse>'
                '<path d="M150 96 L 188 120 L 174 164 L 126 164 L 112 120 Z" fill="#02875E"></path>'
                '<path d="M112 120 L 62 128 M188 120 L 238 128 M126 164 L 104 200 M174 164 L 196 200" fill="none" stroke="#02875E" style="stroke-width: 8; stroke-linecap: round"></path>'
                '<circle cx="276" cy="130" r="7" fill="#10222E"></circle><circle cx="278" cy="128" r="2.2" fill="#FFFFFF"></circle>'
                '<path d="M268 152 C 274 157, 283 156, 290 150" fill="none" stroke="#10222E" style="stroke-width: 4; stroke-linecap: round"></path>')
    if i == 2:  # タコ
        return ('<path d="M96 132 C 70 166, 100 186, 72 218" fill="none" stroke="#D65DB1" style="stroke-width: 24; stroke-linecap: round"></path>'
                '<path d="M124 140 C 112 176, 136 192, 118 226" fill="none" stroke="#D65DB1" style="stroke-width: 24; stroke-linecap: round"></path>'
                '<path d="M152 142 C 150 180, 168 196, 156 228" fill="none" stroke="#D65DB1" style="stroke-width: 24; stroke-linecap: round"></path>'
                '<path d="M180 140 C 194 176, 172 194, 192 226" fill="none" stroke="#D65DB1" style="stroke-width: 24; stroke-linecap: round"></path>'
                '<path d="M206 132 C 232 164, 204 188, 232 216" fill="none" stroke="#D65DB1" style="stroke-width: 24; stroke-linecap: round"></path>'
                '<ellipse cx="150" cy="96" rx="76" ry="70" fill="#D65DB1"></ellipse>'
                '<circle cx="124" cy="100" r="16" fill="#FFFFFF"></circle><circle cx="176" cy="100" r="16" fill="#FFFFFF"></circle>'
                '<circle cx="127" cy="102" r="8" fill="#10222E"></circle><circle cx="173" cy="102" r="8" fill="#10222E"></circle>'
                '<ellipse cx="102" cy="126" rx="12" ry="7" fill="#F29AD5"></ellipse><ellipse cx="198" cy="126" rx="12" ry="7" fill="#F29AD5"></ellipse>'
                '<ellipse cx="150" cy="132" rx="9" ry="7" fill="#8E2E73"></ellipse>')
    if i == 3:  # カニ
        return ('<path d="M92 170 L 50 196 M96 184 L 60 214 M208 170 L 250 196 M204 184 L 240 214" fill="none" stroke="#D93F00" style="stroke-width: 10; stroke-linecap: round"></path>'
                '<path d="M100 130 L 70 96 M200 130 L 230 96" fill="none" stroke="#D93F00" style="stroke-width: 14; stroke-linecap: round"></path>'
                '<ellipse cx="60" cy="84" rx="30" ry="20" fill="#FF4B00" transform="rotate(-35 60 84)"></ellipse>'
                '<ellipse cx="78" cy="58" rx="22" ry="12" fill="#FF4B00" transform="rotate(-70 78 58)"></ellipse>'
                '<ellipse cx="240" cy="84" rx="30" ry="20" fill="#FF4B00" transform="rotate(35 240 84)"></ellipse>'
                '<ellipse cx="222" cy="58" rx="22" ry="12" fill="#FF4B00" transform="rotate(70 222 58)"></ellipse>'
                '<path d="M128 112 L 122 78 M172 112 L 178 78" fill="none" stroke="#D93F00" style="stroke-width: 8; stroke-linecap: round"></path>'
                '<ellipse cx="150" cy="150" rx="84" ry="52" fill="#FF4B00"></ellipse>'
                '<circle cx="122" cy="72" r="14" fill="#FFFFFF"></circle><circle cx="178" cy="72" r="14" fill="#FFFFFF"></circle>'
                '<circle cx="124" cy="74" r="7" fill="#10222E"></circle><circle cx="176" cy="74" r="7" fill="#10222E"></circle>'
                '<path d="M130 160 C 142 170, 158 170, 170 160" fill="none" stroke="#10222E" style="stroke-width: 5; stroke-linecap: round"></path>')
    # クジラ
    return ('<path d="M52 128 C 36 104, 22 94, 8 88 C 20 108, 26 122, 40 136 Z" fill="#004FE0"></path>'
            '<path d="M52 140 C 34 150, 20 164, 10 180 C 30 176, 44 166, 56 152 Z" fill="#004FE0"></path>'
            '<path d="M44 140 C 50 92, 120 64, 190 70 C 250 76, 282 114, 276 150 C 270 186, 214 204, 150 202 C 98 200, 48 184, 44 140 Z" fill="#005AFF"></path>'
            '<path d="M118 186 C 168 198, 232 188, 268 160 C 258 188, 212 204, 154 203 C 136 202, 124 196, 118 186 Z" fill="#9CC3FF"></path>'
            '<path d="M212 64 C 206 42, 194 32, 180 28 M212 64 C 214 42, 226 32, 242 28 M212 64 L 212 30" fill="none" stroke="#4DC4FF" style="stroke-width: 7; stroke-linecap: round"></path>'
            '<circle cx="232" cy="128" r="8" fill="#FFFFFF"></circle><circle cx="233" cy="129" r="4.5" fill="#10222E"></circle>'
            '<path d="M236 154 C 246 160, 258 158, 266 150" fill="none" stroke="#10222E" style="stroke-width: 4; stroke-linecap: round"></path>')


CREATURE_NAMES = ["イルカ", "カメ", "タコ", "カニ", "クジラ"]


def creature_svg(i, w, h, extra_style=""):
    return (f'<svg viewBox="0 0 300 240" width="{w}" height="{h}" aria-hidden="true" style="display: block; {extra_style}">'
            + creature(i) + '</svg>')


def sparkle(x, y, s, color):
    return (f'<path d="M{x} {y - s} L {x + s * 0.25} {y - s * 0.25} L {x + s} {y} L {x + s * 0.25} {y + s * 0.25} L {x} {y + s} '
            f'L {x - s * 0.25} {y + s * 0.25} L {x - s} {y} L {x - s * 0.25} {y - s * 0.25} Z" fill="{color}"></path>')


def thumb_art(act, bg):
    """一覧サムネイル。viewBox 0 0 360 176"""
    body = f'<rect x="0" y="0" width="360" height="176" fill="{bg}"></rect>'
    if act == "shokyu":
        body += f'<svg x="112" y="18" width="150" height="120" viewBox="0 0 300 240">{creature(0)}</svg>'
        body += sparkle(92, 52, 12, "#FFC83D") + sparkle(270, 40, 9, "#FFC83D") + sparkle(262, 128, 7, "#FFFFFF")
    elif act == "reel":
        body += '<rect x="78" y="32" width="204" height="112" rx="16" fill="#6F5BB8"></rect>'
        for k, cx in enumerate([116, 180, 244]):
            body += f'<rect x="{cx - 26}" y="46" width="52" height="84" rx="8" fill="#FFFDF4"></rect>'
        body += '<path d="M100 88 C 110 76, 126 76, 134 88 C 126 100, 110 100, 100 88 Z M134 88 L 142 80 L 142 96 Z" fill="#FF7A2F"></path>'
        body += '<path d="M180 70 L 186 83 L 200 84 L 189 93 L 193 107 L 180 99 L 167 107 L 171 93 L 160 84 L 174 83 Z" fill="#F6AA00"></path>'
        body += '<circle cx="244" cy="88" r="9" fill="#F6AA00"></circle>'
        for a in range(6):
            import math
            ang = a * math.pi / 3
            body += f'<circle cx="{244 + 14 * math.cos(ang):.1f}" cy="{88 + 14 * math.sin(ang):.1f}" r="8" fill="#FF6FA8"></circle>'
        body += '<circle cx="244" cy="88" r="8" fill="#F6AA00"></circle>'
        body += '<path d="M84 88 L 72 80 L 72 96 Z M276 88 L 288 80 L 288 96 Z" fill="#FF4B00"></path>'
    elif act == "high":
        cols = ["#FF8082", "#F6AA00", "#03AF7A", "#4DC4FF", "#B98CFF"]
        for k in range(5):
            hgt = 40 + k * 18
            body += f'<rect x="{88 + k * 40}" y="{150 - hgt}" width="30" height="{hgt}" rx="6" fill="{cols[k]}"></rect>'
        body += '<path d="M90 44 L 90 78" fill="none" stroke="#FFC83D" style="stroke-width: 6; stroke-linecap: round"></path><ellipse cx="82" cy="80" rx="11" ry="8" fill="#FFC83D"></ellipse><path d="M90 44 C 100 48, 106 54, 108 62" fill="none" stroke="#FFC83D" style="stroke-width: 6; stroke-linecap: round"></path>'
        body += '<path d="M260 42 L 260 18 M250 28 L 260 18 L 270 28" fill="none" stroke="#FFC83D" style="stroke-width: 6; stroke-linecap: round; stroke-linejoin: round"></path>'
    elif act == "learn":
        body += '<rect x="96" y="40" width="96" height="120" rx="12" fill="#9BE0B0" transform="rotate(-10 144 100)"></rect>'
        body += '<circle cx="138" cy="100" r="22" fill="#FF7A2F" transform="rotate(-10 144 100)"></circle>'
        body += '<rect x="160" y="44" width="96" height="120" rx="12" fill="#4DC4FF" transform="rotate(8 208 104)"></rect>'
        body += '<rect x="168" y="52" width="80" height="104" rx="8" fill="#FFFFFF" transform="rotate(8 208 104)"></rect>'
        body += '<path d="M208 76 L 232 124 L 184 124 Z" fill="#03AF7A" transform="rotate(8 208 104)"></path>'
        body += '<rect x="222" y="14" width="82" height="46" rx="14" fill="#FFC87A"></rect><path d="M236 58 L 230 72 L 250 58 Z" fill="#FFC87A"></path>'
        body += '<circle cx="246" cy="37" r="5" fill="#FFFFFF"></circle><circle cx="263" cy="37" r="5" fill="#FFFFFF"></circle><circle cx="280" cy="37" r="5" fill="#FFFFFF"></circle>'
    elif act == "arm":
        body += '<rect x="96" y="20" width="168" height="142" rx="16" fill="#FF8A5C"></rect><rect x="108" y="40" width="144" height="110" rx="8" fill="#FFF4E6"></rect>'
        body += '<path d="M108 52 L 252 52" fill="none" stroke="#FF8A5C" style="stroke-width: 6"></path>'
        body += '<path d="M180 52 L 180 84" fill="none" stroke="#5A6B7B" style="stroke-width: 6"></path><circle cx="180" cy="88" r="7" fill="#5A6B7B"></circle>'
        body += '<path d="M174 92 L 160 108 L 166 118 M186 92 L 200 108 L 194 118" fill="none" stroke="#5A6B7B" style="stroke-width: 6; stroke-linecap: round; stroke-linejoin: round"></path>'
        body += '<path d="M180 112 L 187 126 L 202 127 L 190 136 L 195 150 L 180 142 L 165 150 L 170 136 L 158 127 L 173 126 Z" fill="#F6AA00"></path>'
    elif act == "fish":
        body += '<rect x="0" y="118" width="360" height="58" fill="#2C6E9E" opacity="0.55"></rect>'
        body += '<path d="M60 128 C 90 118, 110 138, 140 128 C 170 118, 190 138, 220 128 C 250 118, 270 138, 300 128" fill="none" stroke="#7FD4FF" style="stroke-width: 5; stroke-linecap: round"></path>'
        body += '<path d="M232 16 L 232 70" fill="none" stroke="#FFFFFF" style="stroke-width: 3"></path><path d="M232 70 C 232 82, 222 84, 218 76" fill="none" stroke="#FFFFFF" style="stroke-width: 3; stroke-linecap: round"></path>'
        body += '<path d="M112 92 C 132 60, 190 56, 222 86 C 190 116, 132 116, 112 92 Z" fill="#FF7A2F"></path><path d="M114 92 L 84 70 L 90 92 L 84 114 Z" fill="#FF7A2F"></path>'
        body += '<circle cx="200" cy="84" r="7" fill="#FFFFFF"></circle><circle cx="202" cy="84" r="4" fill="#10222E"></circle>'
        body += '<circle cx="270" cy="44" r="24" fill="#FFC83D"></circle><rect x="266" y="26" width="8" height="24" rx="4" fill="#1A1A1A"></rect><circle cx="270" cy="58" r="4.5" fill="#1A1A1A"></circle>'
    return f'<svg viewBox="0 0 360 176" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display: block">{body}</svg>'


def reel_art(n, bg):
    body = f'<rect x="0" y="0" width="360" height="200" fill="{bg}"></rect>'
    if n == 1:
        body += '<rect x="130" y="30" width="100" height="140" rx="16" fill="#6F5BB8"></rect><rect x="146" y="46" width="68" height="108" rx="10" fill="#FFFDF4"></rect>'
        body += '<path d="M180 72 L 188 90 L 207 91 L 192 103 L 197 122 L 180 111 L 163 122 L 168 103 L 153 91 L 172 90 Z" fill="#F6AA00"></path>'
    else:
        body += '<rect x="60" y="30" width="240" height="140" rx="16" fill="#6F5BB8"></rect>'
        for cx in [110, 180, 250]:
            body += f'<rect x="{cx - 30}" y="46" width="60" height="108" rx="10" fill="#FFFDF4"></rect>'
        body += '<path d="M90 100 C 100 88, 116 88, 124 100 C 116 112, 100 112, 90 100 Z M124 100 L 132 92 L 132 108 Z" fill="#FF7A2F"></path>'
        body += '<path d="M180 80 L 186 94 L 201 95 L 190 104 L 194 119 L 180 110 L 166 119 L 170 104 L 159 95 L 174 94 Z" fill="#F6AA00"></path>'
        body += '<circle cx="250" cy="100" r="16" fill="#03AF7A"></circle>'
    return f'<svg viewBox="0 0 360 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style="display: block">{body}</svg>'


def logo_mark(color, h=30):
    return (f'<svg viewBox="0 0 30 30" width="{h}" height="{h}" aria-hidden="true" style="display: block">'
            f'<rect x="1" y="9" width="7" height="14" rx="3.5" fill="{color}"></rect><rect x="11.5" y="3" width="7" height="24" rx="3.5" fill="{color}"></rect>'
            f'<rect x="22" y="7" width="7" height="17" rx="3.5" fill="{color}"></rect></svg>')


def icon(name, color, size=22):
    s = f'fill="none" stroke="{color}" style="stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round"'
    paths = {
        "sliders": f'<path d="M4 7 L 20 7 M4 17 L 20 17" {s}></path><circle cx="9" cy="7" r="2.6" fill="{color}"></circle><circle cx="15" cy="17" r="2.6" fill="{color}"></circle>',
        "close": f'<path d="M6 6 L 18 18 M18 6 L 6 18" {s}></path>',
        "retry": f'<path d="M19 12 A 7 7 0 1 1 16.5 6.6 M19 4 L 19 9 L 14 9" {s}></path>',
        "grid": f'<rect x="4" y="4" width="7" height="7" rx="1.5" {s}></rect><rect x="13" y="4" width="7" height="7" rx="1.5" {s}></rect><rect x="4" y="13" width="7" height="7" rx="1.5" {s}></rect><rect x="13" y="13" width="7" height="7" rx="1.5" {s}></rect>',
        "back": f'<path d="M15 5 L 8 12 L 15 19" {s}></path>',
        "play": f'<path d="M8 5 L 19 12 L 8 19 Z" fill="{color}"></path>',
        "hand": f'<path d="M9 11 L 9 4.5 A 1.6 1.6 0 0 1 12.2 4.5 L 12.2 10 M12.2 9 L 12.2 7.5 A 1.6 1.6 0 0 1 15.4 7.5 L 15.4 10.5 M15.4 9.5 A 1.6 1.6 0 0 1 18.6 9.5 L 18.6 14 C 18.6 18 16 20.5 12.5 20.5 C 9.8 20.5 8 19 6.8 17 L 4.8 13.6 A 1.6 1.6 0 0 1 7.6 12 L 9 14" {s}></path>',
        "check": f'<path d="M5 12.5 L 10 17 L 19 7" fill="none" stroke="{color}" style="stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round"></path>',
    }
    return f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true" style="display: block; flex-shrink: 0">{paths[name]}</svg>'


# ---------------------------------------------------------------- page shell
HELMET = """<helmet>
<link href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&amp;family=Zen+Maru+Gothic:wght@500;700;900&amp;display=swap" rel="stylesheet">
<style>
body{margin:0}
a{text-decoration:none;color:inherit}
button{font:inherit}
@keyframes nuro-pop{0%{transform:scale(.35);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1);opacity:1}}
.nuro-pop{animation:nuro-pop .32s cubic-bezier(.34,1.36,.64,1) both}
@media (prefers-reduced-motion: reduce){.nuro-pop{animation:none}}
</style>
</helmet>"""


def page(title, body, logic, props=None):
    props = props or {}
    props["$preview"] = {"width": W, "height": H}
    pj = json.dumps(props, ensure_ascii=False).replace("&", "&amp;").replace("'", "&#39;")
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
{HELMET}
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{pj}'>
{logic}
</script>
</body>
</html>
"""


STATIC_LOGIC = """class Component extends DCLogic {
  renderVals() {
    return {};
  }
}"""


def root_open(T, bg=None, extra=""):
    return (f'<div style="width: {W}px; height: {H}px; box-sizing: border-box; position: relative; overflow: hidden; '
            f'display: flex; flex-direction: column; background: {bg or T["bg"]}; color: {T["ink"]}; font-family: {T["font_body"]}; {extra}">')


def light_header(T, right_html, sub=""):
    if T["key"] == "ultra":
        return ""
    sub_html = f'<span style="font-size: 14px; color: {T["muted"]}">{sub}</span>' if sub else ""
    border = f'2px solid {T["line"]}' if T["key"] == "clear" else '2px solid #BFD8CB'
    return (f'<header style="height: 82px; flex-shrink: 0; box-sizing: border-box; padding: 0 29px; display: flex; align-items: center; justify-content: space-between; background: {T["surface"]}; border-bottom: {border}">'
            f'<div style="display: flex; align-items: center; gap: 12px">{logo_mark(T["accent"])}'
            f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 30px; letter-spacing: 0.06em; color: {T["ink"]}">NURO</span>{sub_html}</div>'
            f'{right_html}</header>')


def supporter_button(T, label="支援者の設定", href="#"):
    return (f'<a href="{href}" aria-label="{label}" style="min-height: 48px; box-sizing: border-box; padding: 0 18px; display: flex; align-items: center; gap: 8px; '
            f'border: 2px solid {T["line"]}; border-radius: 12px; background: {T["surface"]}; color: {T["ink"]}; font-size: 16px; font-weight: 700">'
            f'{icon("sliders", T["ink"])}<span>{label}</span></a>')


# ---------------------------------------------------------------- screens
ACT_INFO = {
    "shokyu": ("おすと でてくる", "はじめては ここ", "おすと 絵と 音が でるよ"),
    "reel": ("リールを とめる", "なれたら", "絵を 見て とめよう"),
    "high": ("高い音だけ", "なれたら", "高い 音で おそう"),
    "learn": ("まなぶ・つたえる", "べつの あそび", "えらぶ・つたえる"),
    "arm": ("アームを とめる", "チャレンジ", "じゅんばんに とめよう"),
    "fish": ("さかなつり", "チャレンジ", "あいずで つろう"),
}


def home(T, pfx):
    href = {"shokyu": f"{pfx}Play.dc.html", "reel": f"{pfx}Kind.dc.html"}
    ultra = T["key"] == "ultra"
    cards = []
    for i, act in enumerate(ACTS):
        name, chip, desc = ACT_INFO[act]
        is_learn = act == "learn"
        surface = T["surface_alt"] if is_learn else T["surface"]
        border_style = "dashed" if is_learn else "solid"
        # 名前の帯
        if T["band"]:
            bcol, bink = T["band"][act]
            name_bar = (f'<div style="flex-grow: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; background: {bcol}; color: {bink}">'
                        f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 26px">{name}</span>{icon("play", bink, 20)}</div>')
        else:
            size = 28 if ultra else 23
            name_bar = (f'<div style="flex-grow: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; background: {surface}">'
                        f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {size}px; color: {T["ink"]}">{name}</span>'
                        + ("" if ultra else icon("play", T["accent"], 18)) + '</div>')
        # 段階ラベル
        if act == "shokyu" and not T["band"]:
            chip_style = f"background: {T['accent']}; color: {T['accent_ink']};"
        elif T["band"]:
            chip_style = f"background: #FFFFFF; color: #1A1A1A; border: 2px solid #1A1A1A;"
        else:
            chip_style = f"background: {T['surface']}; color: {T['ink']}; border: 2px solid {T['line']};"
        chip_html = (f'<span style="position: absolute; left: 12px; top: 12px; padding: 5px 12px; border-radius: 999px; font-size: 15px; font-weight: 700; {chip_style}">{chip}</span>')
        cards.append(
            f'<a href="{href.get(act, "#")}" aria-label="{name}。{desc}" style="display: flex; flex-direction: column; min-width: 0; box-sizing: border-box; '
            f'border-radius: {T["radius"]}px; overflow: hidden; background: {surface}; border: {T["line_w"]}px {border_style} {T["line"]}; box-shadow: {{{{ring{i}}}}}">'
            f'<div style="position: relative; height: {204 if ultra else 178}px; flex-shrink: 0; background: {T["thumb"][act]}">{thumb_art(act, T["thumb"][act])}{chip_html}</div>'
            f'{name_bar}</a>')
    grid = (f'<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: {22 if ultra else 18}px; padding: 12px 8px 8px 8px">'
            + "".join(cards) + '</div>')
    if ultra:
        top = (f'<div style="display: flex; align-items: center; justify-content: space-between; padding: 22px 8px 6px 8px">'
               f'<span style="font-family: {T["font_display"]}; font-weight: 700; font-size: 34px">あそびを えらぶ</span>'
               f'{supporter_button(T, "支援者")}</div>')
        body = root_open(T, extra="padding: 0 26px 26px 26px") + top + grid + '</div>'
    else:
        title_size = 34 if T["key"] == "clear" else 31
        top = (f'<div style="display: flex; align-items: flex-end; justify-content: space-between; padding: 18px 8px 4px 8px">'
               f'<div style="display: flex; flex-direction: column; gap: 4px"><span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {title_size}px">あそびを えらぼう</span>'
               f'<span style="font-size: 16px; color: {T["muted"]}">あそびたい 絵を おしてね</span></div>'
               f'<span style="font-size: 14px; color: {T["muted"]}">左上から 右下へ、だんだん むずかしく</span></div>')
        foot = (f'<div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px 0 8px; font-size: 14px; color: {T["muted"]}">'
                f'{icon("hand", T["muted"], 20)}<span>タップ または スイッチで えらぼう</span></div>')
        body = (root_open(T) + light_header(T, supporter_button(T)) +
                f'<div style="flex-grow: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 21px 16px 21px">' + top + grid + foot + '</div></div>')
    logic = """class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { s: 0 };
  }
  componentDidMount() {
    this.timer = setInterval(() => this.setState({ s: (this.state.s + 1) % 6 }), this.props.scanMs ?? 1600);
  }
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  renderVals() {
    const on = '%RING%';
    const v = {};
    for (let i = 0; i < 6; i++) v['ring' + i] = i === this.state.s ? on : 'none';
    return v;
  }
}""".replace("%RING%", ring(T))
    props = {"scanMs": {"editor": "int", "default": 1600, "min": 800, "max": 3200, "step": 100, "unit": "ms", "section": "走査"}}
    return page(f"{T['name']}｜活動一覧", body, logic, props)


def start(T, pfx):
    ultra = T["key"] == "ultra"
    btn_bg, btn_ink = T["accent"], T["accent_ink"]
    button = (f'<a href="{pfx}Home.dc.html" aria-label="はじめる" style="display: flex; align-items: center; justify-content: center; gap: 16px; '
              f'width: {620 if ultra else 470}px; height: {170 if ultra else 96}px; border-radius: {T["radius"] + 6}px; background: {btn_bg}; color: {btn_ink}; '
              f'font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {64 if ultra else 38}px; letter-spacing: 0.08em; box-shadow: {ring(T)}">'
              f'はじめる{icon("play", btn_ink, 40 if ultra else 26)}</a>')
    if ultra:
        body = root_open(T, extra="align-items: center; justify-content: center") + button + '</div>'
    else:
        if T["key"] == "clear":
            art = (f'<div style="width: 260px; height: 260px; border-radius: 999px; background: #D9F3FF; display: flex; align-items: center; justify-content: center">'
                   f'{creature_svg(0, 220, 176)}</div>')
            lead_size = 40
        else:
            art = (f'<div style="width: 250px; height: 200px; border-radius: 28px; background: {T["thumb"]["shokyu"]}; display: flex; align-items: center; justify-content: center">'
                   f'{creature_svg(0, 200, 160)}</div>')
            lead_size = 34
        center = (f'<div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px">'
                  f'{art}<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {lead_size}px">おして、はじめよう。</span>'
                  f'<span style="font-size: 18px; color: {T["muted"]}; margin-top: -10px">あなたの ペースで、ひとつずつ。</span>{button}</div>')
        body = root_open(T) + light_header(T, "") + center + '</div>'
    return page(f"{T['name']}｜開始", body, STATIC_LOGIC)


def kind(T, pfx):
    ultra = T["key"] == "ultra"
    band = T["band"]["reel"] if T["band"] else None
    opts = [(1, "ひとつ とめる", "なれたら", "1本の リールを とめる"), (3, "3つ とめる", "チャレンジ", "3本を じゅんばんに とめる")]
    cards = []
    for k, (n, name, chip, desc) in enumerate(opts):
        bar_bg = band[0] if band else T["surface"]
        bar_ink = band[1] if band else T["ink"]
        chip_style = ("background: #FFFFFF; color: #1A1A1A; border: 2px solid #1A1A1A;" if band
                      else f"background: {T['surface']}; color: {T['ink']}; border: 2px solid {T['line']};")
        cards.append(
            f'<a href="#" aria-label="{name}。{desc}" style="display: flex; flex-direction: column; min-width: 0; box-sizing: border-box; border-radius: {T["radius"]}px; overflow: hidden; '
            f'background: {T["surface"]}; border: {T["line_w"]}px solid {T["line"]}; box-shadow: {{{{ring{k}}}}}">'
            f'<div style="position: relative; height: 330px; background: {T["thumb"]["reel"]}">{reel_art(n, T["thumb"]["reel"])}'
            f'<span style="position: absolute; left: 14px; top: 14px; padding: 6px 14px; border-radius: 999px; font-size: 16px; font-weight: 700; {chip_style}">{chip}</span></div>'
            f'<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 24px; background: {bar_bg}; color: {bar_ink}">'
            f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {34 if ultra else 30}px">{name}</span>'
            + ("" if ultra else f'<span style="font-size: 17px">{desc}</span>') + '</div></a>')
    back = (f'<a href="{pfx}Home.dc.html" aria-label="あそびを えらぶ に もどる" style="align-self: flex-start; min-height: 60px; box-sizing: border-box; padding: 0 24px; display: flex; align-items: center; gap: 8px; '
            f'border: {T["line_w"]}px solid {T["line"]}; border-radius: 14px; background: {T["surface"]}; color: {T["ink"]}; font-size: 20px; font-weight: 700; box-shadow: {{{{ring2}}}}">'
            f'{icon("back", T["ink"], 24)}もどる</a>')
    title = (f'<div style="display: flex; flex-direction: column; gap: 4px"><span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {36 if ultra else 32}px">リールを とめる</span>'
             + ("" if ultra else f'<span style="font-size: 17px; color: {T["muted"]}">どちらで あそぶ？</span>') + '</div>')
    grid = (f'<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px">' + "".join(cards) + '</div>')
    inner = f'<div style="flex-grow: 1; display: flex; flex-direction: column; gap: 18px; min-height: 0; padding: {26 if ultra else 18}px 32px 26px 32px">' + title + grid + back + '</div>'
    body = root_open(T) + light_header(T, supporter_button(T)) + inner + '</div>'
    logic = """class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { s: 0 };
  }
  componentDidMount() {
    this.timer = setInterval(() => this.setState({ s: (this.state.s + 1) % 3 }), this.props.scanMs ?? 1600);
  }
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  renderVals() {
    const on = '%RING%';
    return { ring0: this.state.s === 0 ? on : 'none', ring1: this.state.s === 1 ? on : 'none', ring2: this.state.s === 2 ? on : 'none' };
  }
}""".replace("%RING%", ring(T))
    props = {"scanMs": {"editor": "int", "default": 1600, "min": 800, "max": 3200, "step": 100, "unit": "ms", "section": "走査"}}
    return page(f"{T['name']}｜種類選択（リール）", body, logic, props)


def play_header(T, pfx, dots_live=True):
    ultra = T["key"] == "ultra"
    dots = "".join(f'<span style="width: 18px; height: 18px; border-radius: 999px; background: {{{{dot{i}}}}}"></span>' if dots_live
                    else f'<span style="width: 18px; height: 18px; border-radius: 999px; background: {T["stage_accent"] if i < 3 else T["stage_line"]}"></span>'
                    for i in range(5))
    btn = (f'min-height: 48px; box-sizing: border-box; padding: 0 16px; display: flex; align-items: center; gap: 8px; border: 2px solid {T["stage_line"]}; '
           f'border-radius: 12px; color: {T["stage_ink"]}; font-size: 16px; font-weight: 700; background: {T["stage_head"]}')
    settings = f'<a href="{pfx}Settings.dc.html" aria-label="このあそびの設定" style="{btn}">{icon("sliders", T["stage_ink"])}' + ("" if ultra else '<span>このあそびの設定</span>') + '</a>'
    end = f'<a href="{pfx}Result.dc.html" aria-label="このあそびを おわる" style="{btn}">{icon("close", T["stage_ink"])}' + ("" if ultra else '<span>このあそびを おわる</span>') + '</a>'
    name = "" if ultra else f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 24px; color: {T["stage_ink"]}">おすと でてくる</span>'
    return (f'<div style="height: 76px; flex-shrink: 0; box-sizing: border-box; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; background: {T["stage_head"]}">'
            f'<div style="display: flex; align-items: center; gap: 22px">{name}<div role="img" aria-label="すすみぐあい" style="display: flex; gap: 10px">{dots}</div></div>'
            f'<div style="display: flex; gap: 10px">{settings}{end}</div></div>')


def stage_box_style(T):
    if T["key"] == "c":
        return f"margin: 0 24px 24px 24px; border: 2px solid {T['stage_line']}; border-radius: 16px;"
    return "margin: 0;"


def play(T, pfx):
    creatures = "".join(
        f'<sc-if value="{{{{show{i}}}}}" hint-placeholder-val="{{{{ false }}}}"><span class="nuro-pop" style="display: flex; flex-direction: column; align-items: center; gap: 18px">'
        f'{creature_svg(i, 440, 352)}<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 40px; color: {T["stage_ink"]}">{["でてきた！", "かわった！", "いいね！", "もう いっかい！", "できた！"][i]}</span></span></sc-if>'
        for i in range(5))
    prompt = (f'<sc-if value="{{{{prompt}}}}" hint-placeholder-val="{{{{ true }}}}"><span style="display: flex; flex-direction: column; align-items: center; gap: 16px; color: {T["stage_ink"]}">'
              f'<span style="width: 120px; height: 120px; border-radius: 999px; border: 4px dashed {T["stage_line"]}; display: flex; align-items: center; justify-content: center">{icon("hand", T["stage_ink"], 56)}</span>'
              f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 38px">おしてみよう</span></span></sc-if>')
    idle = (f'<sc-if value="{{{{idle}}}}" hint-placeholder-val="{{{{ false }}}}"><span style="font-size: 22px; color: {T["stage_line"]}">{{{{countText}}}}</span></sc-if>')
    done = (f'<sc-if value="{{{{done}}}}" hint-placeholder-val="{{{{ false }}}}"><div style="position: absolute; left: 0; right: 0; bottom: 28px; display: flex; justify-content: center; gap: 14px">'
            f'<a href="{pfx}Result.dc.html" style="min-height: 64px; padding: 0 30px; display: flex; align-items: center; border-radius: 14px; background: {T["focus"]}; color: #111111; font-size: 22px; font-weight: 700">けっかを みる</a>'
            f'<button onClick="{{{{reset}}}}" style="min-height: 64px; padding: 0 26px; border-radius: 14px; border: 2px solid {T["stage_line"]}; background: transparent; color: {T["stage_ink"]}; font-size: 20px; font-weight: 700; cursor: pointer">さいしょから（見本用）</button></div></sc-if>')
    stage = (f'<div style="position: relative; flex-grow: 1; display: flex; {stage_box_style(T)} overflow: hidden">'
             f'<button onClick="{{{{tap}}}}" aria-label="おして あそぶ" style="flex-grow: 1; border: 0; margin: 0; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; background: {T["stage"]}">'
             f'{prompt}{creatures}{idle}</button>{done}</div>')
    body = root_open(T, bg=T["stage_outer"]) + play_header(T, pfx) + stage + '</div>'
    logic = """class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { count: 0, idx: -1, visible: false, done: false };
  }
  componentWillUnmount() {
    clearTimeout(this.timer);
  }
  renderVals() {
    const st = this.state;
    const hold = this.props.holdMs ?? 1200;
    const keep = this.props.keepPicture ?? false;
    const tap = () => {
      if (this.state.done || this.state.count >= 5) return;
      const idx = this.state.count;
      const count = idx + 1;
      clearTimeout(this.timer);
      this.setState({ count, idx, visible: true });
      if (count >= 5) {
        this.timer = setTimeout(() => this.setState({ done: true }), Math.max(hold, 1200));
      } else if (!keep) {
        this.timer = setTimeout(() => this.setState({ visible: false }), hold);
      }
    };
    const reset = () => {
      clearTimeout(this.timer);
      this.setState({ count: 0, idx: -1, visible: false, done: false });
    };
    const v = {
      tap,
      reset,
      prompt: st.count === 0 && !st.visible,
      idle: st.count > 0 && !st.visible && !st.done,
      done: st.done,
      countText: st.count + 'かい あそんだよ',
    };
    for (let i = 0; i < 5; i++) {
      v['show' + i] = st.visible && st.idx === i;
      v['dot' + i] = i < st.count ? '%ON%' : '%OFF%';
    }
    return v;
  }
}""".replace("%ON%", T["stage_accent"]).replace("%OFF%", T["stage_line"])
    props = {
        "holdMs": {"editor": "int", "default": 1200, "min": 600, "max": 5000, "step": 100, "unit": "ms", "section": "初級の見せ方"},
        "keepPicture": {"editor": "boolean", "default": False, "section": "初級の見せ方"},
    }
    return page(f"{T['name']}｜初級「おすと でてくる」", body, logic, props)


def result(T, pfx):
    ultra = T["key"] == "ultra"
    art = creature_svg(4, 300 if ultra else 260, 240 if ultra else 208)
    if T["key"] == "clear":
        medal = ('<svg viewBox="0 0 120 150" width="96" height="120" aria-hidden="true" style="display: block">'
                 '<path d="M36 0 L 60 50 L 84 0 Z" fill="#005AFF"></path><circle cx="60" cy="92" r="52" fill="#F6AA00"></circle><circle cx="60" cy="92" r="40" fill="#FFC83D"></circle>'
                 '<path d="M60 64 L 68 82 L 88 83 L 72 95 L 78 114 L 60 103 L 42 114 L 48 95 L 32 83 L 52 82 Z" fill="#FF4B00"></path></svg>')
        visual = f'<div style="display: flex; align-items: flex-end; gap: 18px">{art}{medal}</div>'
    elif ultra:
        visual = art
    else:
        badge = (f'<span style="position: absolute; right: -6px; bottom: 6px; width: 54px; height: 54px; border-radius: 999px; background: {T["accent"]}; display: flex; align-items: center; justify-content: center">'
                 f'{icon("check", "#FFFFFF", 32)}</span>')
        visual = f'<div style="position: relative">{art}{badge}</div>'
    head = "できた！" if ultra else "できた！ たのしかったね"
    sub = "" if ultra else f'<span style="font-size: 22px; color: {T["muted"]}">5かい あそべたよ</span>'
    b1 = (f'<a href="{pfx}Play.dc.html" aria-label="もういちど" style="width: {420 if ultra else 360}px; height: {110 if ultra else 84}px; display: flex; align-items: center; justify-content: center; gap: 12px; border-radius: {T["radius"]}px; '
          f'background: {T["accent"]}; color: {T["accent_ink"]}; font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {36 if ultra else 28}px; box-shadow: {ring(T)}">{icon("retry", T["accent_ink"], 30)}もういちど</a>')
    b2 = (f'<a href="{pfx}Home.dc.html" aria-label="あそびを えらぶ" style="width: {420 if ultra else 360}px; height: {110 if ultra else 84}px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 12px; border-radius: {T["radius"]}px; '
          f'background: {T["surface"]}; color: {T["ink"]}; border: {T["line_w"]}px solid {T["line"]}; font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {36 if ultra else 28}px">{icon("grid", T["ink"], 28)}あそびを えらぶ</a>')
    center = (f'<div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px">{visual}'
              f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {72 if ultra else 46}px">{head}</span>{sub}'
              f'<div style="display: flex; gap: 22px; margin-top: 14px">{b1}{b2}</div></div>')
    body = root_open(T) + light_header(T, supporter_button(T)) + center + '</div>'
    return page(f"{T['name']}｜結果", body, STATIC_LOGIC)


def play_backdrop(T, pfx, count_idx=2):
    return (play_header(T, pfx, dots_live=False) +
            f'<div style="flex-grow: 1; display: flex; {stage_box_style(T)} overflow: hidden; align-items: center; justify-content: center; background: {T["stage"]}">'
            f'{creature_svg(count_idx, 380, 304, "opacity: 0.5")}</div>')


def settings(T, pfx):
    groups = [("bg", "あそぶ 画面の 色", ["くらい（ひょうじゅん）", "あかるい"]),
              ("snd", "おしたときの 音", ["がっきの 音", "あかるい 音", "なし"]),
              ("voice", "できたときの 声（やったー）", ["あり", "なし"])]
    rows = []
    for g, label, opts in groups:
        btns = "".join(
            f'<button onClick="{{{{{g}{i}Pick}}}}" aria-pressed="{{{{{g}{i}Pressed}}}}" style="flex-grow: 1; min-height: 54px; border-radius: 12px; font-size: 18px; font-weight: 700; cursor: pointer; {{{{{g}{i}St}}}}">{o}</button>'
            for i, o in enumerate(opts))
        rows.append(f'<div style="display: flex; flex-direction: column; gap: 10px"><span style="font-size: 18px; font-weight: 700">{label}</span><div style="display: flex; gap: 10px">{btns}</div></div>')
    note = (f'<div style="padding: 12px 16px; border-radius: 12px; background: {T["surface_alt"] if T["key"] != "clear" else "#EAF2FF"}; font-size: 16px; color: {T["ink"]}">'
            f'せっていの あいだは、おしても すすみません。あそんだ 回数は のこります。</div>')
    foot = (f'<div style="display: flex; gap: 12px; margin-top: 4px">'
            f'<a href="{pfx}Play.dc.html" style="flex-grow: 1; min-height: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 14px; border: 2px solid {T["line"]}; background: {T["surface"]}; color: {T["ink"]}; font-size: 19px; font-weight: 700">かえないで もどる</a>'
            f'<a href="{pfx}Play.dc.html" style="flex-grow: 1; min-height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: {T["accent"]}; color: {T["accent_ink"]}; font-size: 19px; font-weight: 700">この せっていで もどる</a></div>')
    sheet = (f'<div role="dialog" aria-label="このあそびの せってい" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 600px; box-sizing: border-box; padding: 28px 32px; '
             f'display: flex; flex-direction: column; gap: 20px; border-radius: 22px; background: {T["surface"]}; color: {T["ink"]}; font-family: {T["font_body"]}; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45)">'
             f'<div style="display: flex; align-items: flex-start; justify-content: space-between"><div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 14px; color: {T["muted"]}">支援者の方へ</span>'
             f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: 28px">このあそびの せってい</span></div>'
             f'<a href="{pfx}Play.dc.html" aria-label="とじる" style="width: 52px; height: 52px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 12px; border: 2px solid {T["line"]}">{icon("close", T["ink"], 24)}</a></div>'
             f'{note}{"".join(rows)}{foot}</div>')
    body = (root_open(T, bg=T["stage_outer"]) + play_backdrop(T, pfx) +
            '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.55)"></div>' + sheet + '</div>')
    sel = f"background: {T['accent']}; color: {T['accent_ink']}; border: 2px solid {T['accent']};"
    uns = f"background: {T['surface']}; color: {T['ink']}; border: 2px solid {T['line']};"
    logic = """class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { bg: 0, snd: 0, voice: 0 };
  }
  renderVals() {
    const groups = { bg: 2, snd: 3, voice: 2 };
    const v = {};
    Object.keys(groups).forEach((g) => {
      for (let i = 0; i < groups[g]; i++) {
        const on = this.state[g] === i;
        v[g + i + 'St'] = on ? '%SEL%' : '%UNS%';
        v[g + i + 'Pressed'] = on ? 'true' : 'false';
        v[g + i + 'Pick'] = () => this.setState({ [g]: i });
      }
    });
    return v;
  }
}""".replace("%SEL%", sel).replace("%UNS%", uns)
    return page(f"{T['name']}｜このあそびの設定", body, logic)


def resume(T, pfx):
    ultra = T["key"] == "ultra"
    panel = (f'<div role="dialog" aria-label="とまって います" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: {640 if ultra else 560}px; box-sizing: border-box; padding: 36px; '
             f'display: flex; flex-direction: column; align-items: center; gap: 20px; border-radius: 24px; background: {T["surface"]}; color: {T["ink"]}; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45)">'
             f'<span style="font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {44 if ultra else 36}px">とまって います</span>'
             + ("" if ultra else f'<span style="font-size: 20px; color: {T["muted"]}">3かい あそんだよ。つづきから あそべるよ。</span>') +
             f'<div style="display: flex; flex-direction: column; gap: 14px; width: 100%">'
             f'<a href="{pfx}Play.dc.html" aria-label="つづける" style="height: {100 if ultra else 84}px; display: flex; align-items: center; justify-content: center; gap: 12px; border-radius: {T["radius"]}px; background: {T["accent"]}; color: {T["accent_ink"]}; '
             f'font-family: {T["font_display"]}; font-weight: {T["display_weight"]}; font-size: {36 if ultra else 30}px; box-shadow: {ring(T)}">{icon("play", T["accent_ink"], 28)}つづける</a>'
             f'<a href="{pfx}Result.dc.html" aria-label="おわる" style="height: {84 if ultra else 72}px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: {T["radius"]}px; border: {T["line_w"]}px solid {T["line"]}; '
             f'background: {T["surface"]}; color: {T["ink"]}; font-size: {28 if ultra else 24}px; font-weight: 700">おわる</a></div></div>')
    body = (root_open(T, bg=T["stage_outer"]) + play_backdrop(T, pfx) +
            '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.6)"></div>' + panel + '</div>')
    return page(f"{T['name']}｜再開の確認（UI06）", body, STATIC_LOGIC)


SCREENS = [("Start", "開始", start), ("Home", "活動一覧", home), ("Kind", "種類選択", kind), ("Play", "初級", play),
           ("Result", "結果", result), ("Settings", "このあそびの設定", settings), ("Resume", "再開の確認", resume)]


def fname(row, scr):
    if row == "U" and scr == "Start":
        return "Main.dc.html"
    return f"{row}-{scr}.dc.html"


# 画面間リンクは同じ案の中で閉じる
def pfx_for(row):
    return f"{row}-"


boards, order = {}, []
files = []
GAP_X, ROW_H = 80, H + 120 + 300
for r, row in enumerate(ROWS):
    T = V[row]
    for c, (scr, label, fn) in enumerate(SCREENS):
        html = fn(T, pfx_for(row))
        # U-Start は Main.dc.html として書くため、U行の「開始へ」リンクはない（開始へ戻る導線は作らない）
        name = fname(row, scr)
        with open(os.path.join(PROJ, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(html)
        boards[name] = {"x": c * (W + GAP_X), "y": r * ROW_H, "w": W, "h": H, "title": f"{T['name']}｜{label}", "is_interactive": True}
        order.append(name)
        files.append(name)

ROW_W = len(SCREENS) * W + (len(SCREENS) - 1) * GAP_X
notes = {}
concept = {
    "U": "ウルトラシンプル版\n・1画面1つの操作。開始は「はじめる」だけ\n・白地に黒、差し色は走査枠の黄色だけ\n・文字は大きく、説明文は出さない\n・字体：BIZ UDPゴシック",
    "C": "C案（落ち着いた版）\n・v3.1 §5.1の配色に、追記案の二重の走査枠と濃い境界線を反映\n・一覧は淡い緑、サムネイルは暗い地\n・字体：Zen Maru Gothic＋BIZ UDPゴシック",
    "V": "はっきり版\n・白地に、活動ごとの彩度の高い色帯\n・サムネイルは明るい地。文字色は色帯ごとにコントラスト比4.5以上\n・東京都UDガイドラインと会議13:49「はっきりした色」が根拠",
}
for r, row in enumerate(ROWS):
    y = r * ROW_H
    notes[f"t{row}"] = {"x": 0, "y": y - 260, "text": V[row]["name"], "kind": "title1", "maxW": ROW_W}
    notes[f"s{row}"] = {"x": -760, "y": y, "text": concept[row], "w": 620, "size": "m", "fill": "yellow" if False else "orange"}

canvas = {
    "v": 3,
    "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
    "title": "NURO デザイン3案",
    "launch": {"view": "canvas"},
    "pages": [],
    "boards": boards,
    "order": order,
    "notes": notes,
    "designSystems": [],
}
with open(os.path.join(PROJ, "canvas.json"), "w", encoding="utf-8", newline="\n") as f:
    json.dump(canvas, f, ensure_ascii=False, indent=1)

# アプリへ移すときの変数（styles.css の名前に対応）
css = ["/* NURO デザイン3案の変数。styles.css の :root に対応する名前にしてある。 */"]
for row in ROWS:
    T = V[row]
    css.append(f"\n/* {T['name']} */\n[data-design=\"{T['key']}\"] {{")
    for k, var in [("bg", "--bg"), ("surface", "--surface"), ("surface_alt", "--surface-soft"), ("ink", "--ink"), ("muted", "--muted"),
                   ("line", "--line-strong"), ("accent", "--accent"), ("accent_ink", "--accent-ink"), ("focus", "--focus"),
                   ("focus_outer", "--focus-outer"), ("stage", "--stage-deeper"), ("stage_outer", "--stage-deep"), ("stage_ink", "--stage-ink")]:
        css.append(f"  {var}: {T[k]};")
    css.append(f"  --radius: {T['radius']}px;\n  --line-width: {T['line_w']}px;")
    css.append(f"  --font-round: {T['font_display']};")
    for a in ACTS:
        css.append(f"  --thumb-{a}: {T['thumb'][a]};")
    if T["band"]:
        for a in ACTS:
            css.append(f"  --band-{a}: {T['band'][a][0]};\n  --band-{a}-ink: {T['band'][a][1]};")
    css.append("}")
css.append("\n/* 走査枠（二重枠）。明るい面では外側の濃い枠、暗い面では内側の黄色が見える */\n.scan-focus { box-shadow: 0 0 0 5px var(--focus), 0 0 0 8px var(--focus-outer); }")
with open(os.path.join(ROOT, "nuro-3variants-tokens.css"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(css) + "\n")

print(json.dumps({"files": files, "count": len(files)}, ensure_ascii=False))
