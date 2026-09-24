# 画面構成の3案（海の世界／大きく1つずつ／すごろく）を、1つのHTMLファイルとして書き出す
# 配色だけを変えた gen_single.py の3案と違い、一覧の並べ方・操作の流れ・初級の遊び方から変える
import os, sys
import gen
import page_shell

gen.MODE = "html"
W, H = gen.W, gen.H
UD, MARU = gen.FONT_UD, gen.FONT_MARU
icon, creature, thumb_art, reel_art = gen.icon, gen.creature, gen.thumb_art, gen.reel_art
when, hole_text = gen.when, gen.hole_text
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(gen.ROOT, "nuro-design-concepts.html")

NAMES = {a: gen.ACT_INFO[a][0] for a in gen.ACTS}
DESCS = {a: gen.ACT_INFO[a][2] for a in gen.ACTS}
GAMES = ["shokyu", "reel", "high", "arm", "fish"]          # やさしい → むずかしい
LEVEL = {"shokyu": "はじめて", "reel": "なれたら", "high": "なれたら", "arm": "チャレンジ", "fish": "チャレンジ", "learn": "べつの あそび"}
NAV = {"shokyu": "Play", "reel": "Kind"}
MESSAGES = ["でてきた！", "かわった！", "いいね！", "もう いっかい！", "できた！"]


# ---------------------------------------------------------------- 共通の部品
def ring(T):
    return f"0 0 0 5px {T['focus']}, 0 0 0 8px {T['focus_outer']}"


def nav(act):
    return f'href="#" data-go="{NAV[act]}"' if act in NAV else 'href="#"'


def go(scr):
    return f'href="#" data-go="{scr}"'


def root(style):
    return f'<div style="width: {W}px; height: {H}px; box-sizing: border-box; position: relative; overflow: hidden; {style}">'


def csvg(i, w, h, style=""):
    return gen.creature_svg(i, w, h, style)


def logo(T, color_mark, color_text, size=28):
    return (f'<div style="display: flex; align-items: center; gap: 10px">{gen.logo_mark(color_mark, 28)}'
            f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: {size}px; letter-spacing: 0.06em; color: {color_text}">NURO</span></div>')


def supporter(bg, ink, border, label="支援者の設定"):
    return (f'<a href="#" aria-label="{label}" style="min-height: 48px; box-sizing: border-box; padding: 0 18px; display: flex; align-items: center; gap: 8px; '
            f'border: 2px solid {border}; border-radius: 12px; background: {bg}; color: {ink}; font-size: 16px; font-weight: 700; font-family: {UD}">'
            f'{icon("sliders", ink)}<span>{label}</span></a>')


def star(size, fill):
    return (f'<svg viewBox="0 0 24 24" width="{size}" height="{size}" aria-hidden="true" style="display: block">'
            f'<path d="M12 2 L 14.9 8.6 L 22 9.3 L 16.6 14 L 18.2 21 L 12 17.3 L 5.8 21 L 7.4 14 L 2 9.3 L 9.1 8.6 Z" fill="{fill}"></path></svg>')


def wave_path(y, amp=8, period=120, width=1180):
    d = f"M 0 {y}"
    x = 0
    while x < width + period:
        d += f" q {period / 4} {-amp}, {period / 2} 0 t {period / 2} 0"
        x += period
    return d


def smooth(pts):
    """点を通るなめらかな曲線（Catmull-Rom を 3 次ベジェに直す）"""
    d = f"M {pts[0][0]} {pts[0][1]}"
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C {c1[0]:.1f} {c1[1]:.1f}, {c2[0]:.1f} {c2[1]:.1f}, {p2[0]} {p2[1]}"
    return d


def play_core(T, big, msg, ink, soft):
    """初級の中身：入力前の案内、5種の絵、あいだの表示"""
    creatures = "".join(
        when(f"show{i}", f'<span class="nuro-pop" style="display: flex; flex-direction: column; align-items: center; gap: 14px">'
                          f'{csvg(i, big, int(big * 0.8))}<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: {msg}px; color: {ink}">{MESSAGES[i]}</span></span>')
        for i in range(5))
    prompt = when("prompt", f'<span style="display: flex; flex-direction: column; align-items: center; gap: 16px; color: {ink}">'
                            f'<span style="width: 120px; height: 120px; border-radius: 999px; border: 4px dashed {soft}; display: flex; align-items: center; justify-content: center">{icon("hand", ink, 56)}</span>'
                            f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px">おしてみよう</span></span>', True)
    idle = when("idle", f'<span style="font-size: 22px; color: {soft}">{hole_text("countText")}</span>')
    return prompt + creatures + idle


def tap_area(inner, style):
    return (f'<button data-action="tap" aria-label="おして あそぶ" style="border: 0; margin: 0; padding: 0; cursor: pointer; display: flex; align-items: center; '
            f'justify-content: center; background: transparent; {style}">{inner}</button>')


def done_overlay(bottom):
    return when("done", f'<div style="position: absolute; left: 0; right: 0; bottom: {bottom}px; display: flex; justify-content: center; gap: 14px">'
                        f'<a {go("Result")} style="min-height: 64px; padding: 0 30px; display: flex; align-items: center; border-radius: 14px; background: #FFD23F; color: #111111; font-size: 22px; font-weight: 700">けっかを みる</a>'
                        f'<button data-action="reset" style="min-height: 64px; padding: 0 26px; border-radius: 14px; border: 2px solid rgba(255, 255, 255, 0.6); background: rgba(0, 0, 0, 0.4); color: #FFFFFF; font-size: 20px; font-weight: 700; cursor: pointer">さいしょから（見本用）</button></div>')


def settings_panel(T, layout):
    """支援者だけが使う画面なので、漢字かな混じりで書く"""
    sel = f"background: {T['acc']}; color: {T['acc_ink']}; border: 2px solid {T['acc']};"
    uns = f"background: #FFFFFF; color: {T['sink']}; border: 2px solid {T['sline']};"
    groups = [("bg", "遊ぶ画面の背景", ["暗い（標準）", "明るい"]),
              ("snd", "押したときの音", ["楽器の音", "明るい効果音", "なし"]),
              ("voice", "できたときの声（「やったー」）", ["あり", "なし"])]
    rows = "".join(
        f'<div style="display: flex; flex-direction: column; gap: 10px"><span style="font-size: 18px; font-weight: 700">{label}</span><div style="display: flex; gap: 10px">'
        + "".join(f'<button data-group="{g}" data-idx="{i}" aria-pressed="{"true" if i == 0 else "false"}" style="flex-grow: 1; min-height: 54px; border-radius: 12px; font-size: 18px; font-weight: 700; cursor: pointer; {sel if i == 0 else uns}">{o}</button>'
                  for i, o in enumerate(opts))
        + '</div></div>' for g, label, opts in groups)
    note = (f'<div style="padding: 12px 16px; border-radius: 12px; background: {T["note_bg"]}; font-size: 16px; line-height: 1.6">'
            f'設定中は、スイッチを押しても遊びは進みません。ここまでの回数はそのまま残ります。</div>')
    head = (f'<div style="display: flex; align-items: flex-start; justify-content: space-between"><div style="display: flex; flex-direction: column; gap: 2px">'
            f'<span style="font-size: 14px; color: {T["sline"]}">支援者の方へ</span><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 28px">この遊びの設定</span></div>'
            f'<a {go("Play")} aria-label="閉じる" style="width: 52px; height: 52px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 12px; border: 2px solid {T["sline"]}">{icon("close", T["sink"], 24)}</a></div>')
    foot = (f'<div style="display: flex; gap: 12px; margin-top: auto">'
            f'<a {go("Play")} style="flex-grow: 1; min-height: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 14px; border: 2px solid {T["sline"]}; background: #FFFFFF; color: {T["sink"]}; font-size: 19px; font-weight: 700">変更せずに戻る</a>'
            f'<a {go("Play")} style="flex-grow: 1; min-height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 14px; background: {T["acc"]}; color: {T["acc_ink"]}; font-size: 19px; font-weight: 700">この設定で戻る</a></div>')
    if layout == "drawer":
        box = (f'position: absolute; right: 0; top: 0; bottom: 0; width: 480px; box-sizing: border-box; padding: 32px; display: flex; flex-direction: column; gap: 22px; '
               f'border-radius: 26px 0 0 26px; background: #FFFFFF; color: {T["sink"]}; font-family: {UD}; box-shadow: -18px 0 50px rgba(0, 0, 0, 0.5)')
    else:
        box = (f'position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 600px; box-sizing: border-box; padding: 28px 32px; display: flex; flex-direction: column; gap: 20px; '
               f'border-radius: 24px; background: #FFFFFF; color: {T["sink"]}; font-family: {UD}; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45)')
    return f'<div role="dialog" aria-label="この遊びの設定" style="{box}">{head}{note}{rows}{foot}</div>'


DIM = '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.55)"></div>'


# ================================================================ 案1：海の世界（海の深さ＝むずかしさ）
O = dict(id="O", label="海の世界", name="海の世界の案",
         concept="海の深さで、遊びのむずかしさを表す案です。浅いところほどやさしく、深いところほどチャレンジ。すべての画面を海の世界でそろえます。",
         fd=MARU, fw=900, ink="#0B2A45", muted="#2E5470", acc="#FF6B3D", acc_ink="#1A1A1A", focus="#FFD23F", focus_outer="#0B2A45",
         sink="#0B2A45", sline="#5B7A93", note_bg="#E3F5FC", dotOn="#BDEBFF", dotOff="rgba(255, 255, 255, 0.12)")
O_DEPTH = {"shokyu": "#BFEAFF", "reel": "#2F86CC", "high": "#2F86CC", "arm": "#0E3F7A", "fish": "#0E3F7A"}


def o_topbar(T):
    return (f'<div style="position: absolute; left: 0; top: 0; right: 0; height: 90px; box-sizing: border-box; padding: 0 28px; display: flex; align-items: center; justify-content: space-between">'
            f'{logo(T, "#1B6FB6", T["ink"])}{supporter("#FFFFFF", T["ink"], "#5B7A93")}</div>')


def o_wave(y, color="#FFFFFF", opacity=0.85):
    return (f'<svg width="1180" height="{y + 16}" viewBox="0 0 1180 {y + 16}" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
            f'<path d="{wave_path(y)}" fill="none" stroke="{color}" style="stroke-width: 4; opacity: {opacity}"></path></svg>')


def o_start(T):
    body = root("background: linear-gradient(180deg, #D4F4FF 0%, #A6E6FB 52%, #56BDE8 52.1%, #1F74B8 80%, #0C3D75 100%); font-family: " + UD)
    body += '<div style="position: absolute; left: 980px; top: 60px; width: 120px; height: 120px; border-radius: 999px; background: #FFE27A"></div>'
    body += f'<div style="position: absolute; left: 28px; top: 26px">{logo(T, "#1B6FB6", T["ink"])}</div>'
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 116px; text-align: center; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 54px; color: {T["ink"]}">うみで あそぼう</div>')
    body += o_wave(426)
    body += f'<div style="position: absolute; left: 420px; top: 236px; transform: rotate(-14deg)">{csvg(0, 330, 264)}</div>'
    body += ('<svg width="1180" height="820" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
             + gen.sparkle(400, 420, 14, "#FFFFFF") + gen.sparkle(780, 400, 10, "#FFFFFF") + gen.sparkle(740, 452, 8, "#FFFFFF") + '</svg>')
    body += (f'<a {go("Home")} data-scan="0" aria-label="はじめる" style="position: absolute; left: 360px; top: 600px; width: 460px; height: 112px; border-radius: 999px; '
             f'background: {T["acc"]}; color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 14px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 46px; box-shadow: none">'
             f'はじめる{icon("play", T["acc_ink"], 30)}</a>')
    return body + '</div>'


def o_card(T, act, i, x, y, w, h, wide=False):
    name, desc = NAMES[act], DESCS[act]
    chip_style = (f"background: {T['ink']}; color: #FFFFFF;" if act == "shokyu" else f"background: #FFFFFF; color: {T['ink']}; border: 2px solid {T['ink']};")
    chip = f'<span style="padding: 5px 12px; border-radius: 999px; font-size: 15px; font-weight: 700; {chip_style}">{"はじめては ここ" if act == "shokyu" else LEVEL[act]}</span>'
    art = thumb_art(act, O_DEPTH[act])
    base = (f'<a {nav(act)} data-scan="{i}" aria-label="{name}。{desc}" style="position: absolute; left: {x}px; top: {y}px; width: {w}px; height: {h}px; box-sizing: border-box; '
            f'border-radius: 26px; overflow: hidden; background: #FFFFFF; border: 3px solid rgba(255, 255, 255, 0.95); display: flex; box-shadow: none; color: {T["ink"]}; ')
    if wide:
        return (base + 'flex-direction: row">'
                f'<div style="width: 400px; flex-shrink: 0; background: {O_DEPTH[act]}">{art}</div>'
                f'<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 0 30px">'
                f'<div style="display: flex">{chip}</div><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 38px">{name}</span>'
                f'<span style="font-size: 19px; color: {T["muted"]}">{desc}</span></div></a>')
    return (base + 'flex-direction: column">'
            f'<div style="position: relative; flex-grow: 1; background: {O_DEPTH[act]}">{art}<div style="position: absolute; left: 12px; top: 12px">{chip}</div></div>'
            f'<div style="height: 62px; flex-shrink: 0; display: flex; align-items: center; padding: 0 20px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 25px">{name}</div></a>')


def o_home(T):
    body = root("background: linear-gradient(180deg, #D4F4FF 0px, #D4F4FF 92px, #86DAF6 92px, #3FAAE0 300px, #1B6FB6 520px, #0C3D75 690px, #071C42 820px); font-family: " + UD)
    body += o_wave(92) + o_topbar(T)
    # 深さの目盛り（むずかしさ）
    body += ('<div style="position: absolute; left: 48px; top: 118px; width: 4px; height: 676px; border-radius: 2px; background: rgba(255, 255, 255, 0.7)"></div>')
    for label, level, cy in [("あさい", "はじめて", 207), ("ちょっと ふかい", "なれたら", 430), ("ふかい", "チャレンジ", 679)]:
        body += (f'<div style="position: absolute; left: 6px; top: {cy - 34}px; width: 88px; box-sizing: border-box; padding: 8px 4px; border-radius: 14px; background: #FFFFFF; '
                 f'color: {T["ink"]}; text-align: center; display: flex; flex-direction: column; gap: 2px"><span style="font-size: 14px; font-weight: 700; line-height: 1.3">{label}</span>'
                 f'<span style="font-size: 12px; color: {T["muted"]}">{level}</span></div>')
    body += o_card(T, "shokyu", 0, 112, 112, 780, 190, wide=True)
    body += o_card(T, "reel", 1, 112, 320, 381, 220)
    body += o_card(T, "high", 2, 511, 320, 381, 220)
    body += o_card(T, "arm", 3, 112, 558, 381, 242)
    body += o_card(T, "fish", 4, 511, 558, 381, 242)
    # 陸：学ぶ・伝える（海とは別の遊び）
    island = ('<svg viewBox="0 0 244 150" width="244" height="150" aria-hidden="true" style="display: block">'
              '<path d="M0 150 C 40 104, 204 104, 244 150 Z" fill="#F2D492"></path>'
              '<path d="M150 118 L 150 30" fill="none" stroke="#8A5A36" style="stroke-width: 8; stroke-linecap: round"></path>'
              '<path d="M150 32 C 120 20, 100 28, 88 44 C 112 36, 130 38, 150 32 Z M150 32 C 176 16, 200 24, 214 40 C 190 32, 170 34, 150 32 Z M150 32 C 146 10, 132 2, 116 4 C 132 12, 142 22, 150 32 Z" fill="#2FA36B"></path>'
              '<rect x="44" y="92" width="52" height="30" rx="6" fill="#FFFFFF"></rect><path d="M70 92 L 70 122" stroke="#4DC4FF" style="stroke-width: 3"></path></svg>')
    body += (f'<a href="#" data-scan="5" aria-label="まなぶ・つたえる。べつの あそび" style="position: absolute; left: 910px; top: 112px; width: 250px; height: 688px; box-sizing: border-box; '
             f'border-radius: 26px; overflow: hidden; background: linear-gradient(180deg, #FFF8E4 0%, #F7E3AE 100%); border: 3px solid #FFFFFF; display: flex; flex-direction: column; box-shadow: none; color: {T["ink"]}">'
             f'<div style="padding: 18px 18px 0 18px; display: flex; flex-direction: column; gap: 6px"><span style="align-self: flex-start; padding: 5px 12px; border-radius: 999px; background: #FFFFFF; border: 2px solid {T["ink"]}; font-size: 15px; font-weight: 700">りく・べつの あそび</span></div>'
             f'<div style="margin-top: 10px">{island}</div>'
             f'<div style="margin: 16px 16px 0 16px; height: 150px; border-radius: 18px; overflow: hidden; background: #D6F5EA">{thumb_art("learn", "#D6F5EA")}</div>'
             f'<div style="padding: 18px; display: flex; flex-direction: column; gap: 6px"><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 28px; line-height: 1.25">まなぶ・<br>つたえる</span>'
             f'<span style="font-size: 17px; color: {T["muted"]}">{DESCS["learn"]}</span></div></a>')
    return body + '</div>'


def o_kind(T):
    body = root("background: linear-gradient(180deg, #D4F4FF 0px, #D4F4FF 92px, #6FCDF2 92px, #2E8FD0 480px, #145696 820px); font-family: " + UD)
    body += o_wave(92) + o_topbar(T)
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 112px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: {T["ink"]}">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 42px">リールを とめる</span><span style="font-size: 20px">どちらで あそぶ？</span></div>')
    for k, (n, name, lv, cx) in enumerate([(1, "ひとつ とめる", "なれたら", 360), (3, "3つ とめる", "チャレンジ", 820)]):
        body += (f'<a href="#" data-scan="{k}" aria-label="{name}" style="position: absolute; left: {cx - 165}px; top: 240px; width: 330px; height: 330px; box-sizing: border-box; '
                 f'border-radius: 999px; overflow: hidden; border: 6px solid #FFFFFF; background: #DCE8FF; box-shadow: none">{reel_art(n, "#DCE8FF")}</a>')
        body += (f'<div style="position: absolute; left: {cx - 150}px; top: 592px; width: 300px; display: flex; flex-direction: column; align-items: center; gap: 8px">'
                 f'<span style="padding: 8px 24px; border-radius: 999px; background: #FFFFFF; color: {T["ink"]}; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 28px">{name}</span>'
                 f'<span style="font-size: 16px; color: #FFFFFF; font-weight: 700">{lv}</span></div>')
    body += (f'<a {go("Home")} data-scan="2" aria-label="あそびを えらぶ に もどる" style="position: absolute; left: 40px; top: 704px; min-height: 72px; box-sizing: border-box; padding: 0 28px; '
             f'display: flex; align-items: center; gap: 8px; border-radius: 999px; background: #FFFFFF; color: {T["ink"]}; font-size: 22px; font-weight: 700; box-shadow: none">{icon("back", T["ink"], 26)}もどる</a>')
    return body + '</div>'


def o_sea_deep(T, dim_creature=None):
    body = root("background: linear-gradient(180deg, #0C3D75 0%, #06193A 55%, #020B1E 100%); font-family: " + UD)
    body += ('<svg width="1180" height="820" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
             '<path d="M300 0 L 420 0 L 260 820 L 60 820 Z" fill="#FFFFFF" opacity="0.05"></path>'
             '<path d="M640 0 L 720 0 L 820 820 L 600 820 Z" fill="#FFFFFF" opacity="0.04"></path>'
             '<circle cx="120" cy="620" r="14" fill="none" stroke="#FFFFFF" opacity="0.25" style="stroke-width: 3"></circle>'
             '<circle cx="150" cy="560" r="8" fill="none" stroke="#FFFFFF" opacity="0.25" style="stroke-width: 3"></circle>'
             '<circle cx="1040" cy="660" r="18" fill="none" stroke="#FFFFFF" opacity="0.2" style="stroke-width: 3"></circle>'
             '<circle cx="1010" cy="590" r="9" fill="none" stroke="#FFFFFF" opacity="0.2" style="stroke-width: 3"></circle></svg>')
    if dim_creature is not None:
        body += f'<div style="position: absolute; left: 400px; top: 240px">{csvg(dim_creature, 380, 304, "opacity: 0.45")}</div>'
    return body


def o_play_header(T, live=True):
    dots = "".join((f'<span data-dot="{i}" style="width: 24px; height: 24px; box-sizing: border-box; border-radius: 999px; border: 2px solid rgba(255, 255, 255, 0.75); background: {T["dotOff"]}"></span>' if live else
                    f'<span style="width: 24px; height: 24px; box-sizing: border-box; border-radius: 999px; border: 2px solid rgba(255, 255, 255, 0.75); background: {T["dotOn"] if i < 3 else T["dotOff"]}"></span>')
                   for i in range(5))
    btn = 'min-height: 48px; box-sizing: border-box; padding: 0 16px; display: flex; align-items: center; gap: 8px; border: 2px solid rgba(255, 255, 255, 0.6); border-radius: 12px; color: #FFFFFF; font-size: 16px; font-weight: 700; background: rgba(0, 0, 0, 0.25)'
    return (f'<div style="position: absolute; left: 0; top: 0; right: 0; height: 76px; box-sizing: border-box; padding: 0 24px; display: flex; align-items: center; justify-content: space-between">'
            f'<div style="display: flex; align-items: center; gap: 22px"><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 24px; color: #FFFFFF">おすと でてくる</span>'
            f'<div role="img" aria-label="すすみぐあい" style="display: flex; gap: 10px">{dots}</div></div>'
            f'<div style="display: flex; gap: 10px"><a {go("Settings")} aria-label="この遊びの設定" style="{btn}">{icon("sliders", "#FFFFFF")}<span>この遊びの設定</span></a>'
            f'<a {go("Result")} aria-label="このあそびを おわる" style="{btn}">{icon("close", "#FFFFFF")}<span>このあそびを おわる</span></a></div></div>')


def o_play(T):
    body = o_sea_deep(T) + o_play_header(T)
    body += tap_area(play_core(T, 440, 42, "#FFFFFF", "#7FA7CF"), "position: absolute; left: 0; top: 76px; width: 1180px; height: 744px")
    body += done_overlay(40)
    return body + '</div>'


def o_result(T):
    body = root("background: linear-gradient(180deg, #D4F4FF 0px, #D4F4FF 92px, #86DAF6 92px, #4BB3E4 820px); font-family: " + UD)
    body += o_wave(92) + o_topbar(T)
    body += f'<div style="position: absolute; left: 0; right: 0; top: 118px; text-align: center; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 58px; color: {T["ink"]}">5ひき あえたよ！</div>'
    names = ["イルカ", "カメ", "タコ", "カニ", "クジラ"]
    row = "".join(f'<div style="display: flex; flex-direction: column; align-items: center; gap: 6px">{csvg(i, 170, 136)}<span style="font-size: 18px; font-weight: 700; color: {T["ink"]}">{names[i]}</span></div>' for i in range(5))
    body += (f'<div style="position: absolute; left: 90px; top: 222px; width: 1000px; height: 250px; box-sizing: border-box; border-radius: 30px; background: rgba(255, 255, 255, 0.75); '
             f'display: flex; align-items: center; justify-content: space-around; padding: 0 20px">{row}</div>')
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 520px; display: flex; justify-content: center; gap: 24px">'
             f'<a {go("Play")} data-scan="0" aria-label="もういちど" style="width: 380px; height: 100px; border-radius: 999px; background: {T["acc"]}; color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("retry", T["acc_ink"], 30)}もういちど</a>'
             f'<a {go("Home")} data-scan="1" aria-label="あそびを えらぶ" style="width: 380px; height: 100px; box-sizing: border-box; border-radius: 999px; background: #FFFFFF; border: 3px solid {T["ink"]}; color: {T["ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("grid", T["ink"], 28)}あそびを えらぶ</a></div>')
    return body + '</div>'


def o_settings(T):
    return o_sea_deep(T, 2) + o_play_header(T, live=False) + DIM + settings_panel(T, "modal") + '</div>'


def o_resume(T):
    panel = (f'<div role="dialog" aria-label="とまって います" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 580px; box-sizing: border-box; padding: 38px; '
             f'display: flex; flex-direction: column; align-items: center; gap: 18px; border-radius: 30px; background: #FFFFFF; color: {T["ink"]}; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45)">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px">とまって います</span><span style="font-size: 20px; color: {T["muted"]}">3かい あそんだよ。つづきから あそべるよ。</span>'
             f'<a {go("Play")} data-scan="0" aria-label="つづける" style="width: 100%; height: 96px; border-radius: 999px; background: {T["acc"]}; color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("play", T["acc_ink"], 28)}つづける</a>'
             f'<a {go("Result")} data-scan="1" aria-label="おわる" style="width: 100%; height: 76px; box-sizing: border-box; border-radius: 999px; border: 3px solid {T["ink"]}; background: #FFFFFF; color: {T["ink"]}; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; box-shadow: none">おわる</a></div>')
    return o_sea_deep(T, 2) + DIM + panel + '</div>'


# ================================================================ 案2：大きく1つずつ（スイッチ操作に合わせる）
F = dict(id="F", label="大きく1つずつ", name="大きく1つずつの案",
         concept="いま選べる遊びを、画面いっぱいに大きく見せる案です。下の列で全部の遊びも見えます。スイッチで1つずつ選ぶ人に合わせた形です。",
         fd=MARU, fw=900, ink="#FFFFFF", muted="#B8C4CE", acc="#FFD23F", acc_ink="#111111", focus="#FFD23F", focus_outer="#FFFFFF",
         sink="#15202B", sline="#6B7B8C", note_bg="#F1F4F7", dotOn="#FFD23F", dotOff="#3A4450")
F_BG = {"shokyu": "#0E2233", "reel": "#2A2344", "high": "#3A1F3F", "learn": "#3B3320", "arm": "#123C38", "fish": "#16395A"}
F_ORDER = GAMES + ["learn"]
F_LEVELNUM = {"shokyu": 1, "reel": 2, "high": 3, "arm": 4, "fish": 5}


def f_topbar(T, right=True):
    return (f'<div style="position: absolute; left: 0; top: 0; right: 0; height: 66px; box-sizing: border-box; padding: 0 32px; display: flex; align-items: center; justify-content: space-between">'
            f'{logo(T, "#FFD23F", "#FFFFFF", 26)}' + (supporter("transparent", "#FFFFFF", "#6B7B8C") if right else "") + '</div>')


def f_start(T):
    body = root("background: radial-gradient(circle at 50% 46%, #1E2630 0%, #101418 62%); font-family: " + UD)
    body += f'<div style="position: absolute; left: 32px; top: 20px">{logo(T, "#FFD23F", "#FFFFFF", 26)}</div>'
    body += '<div class="nuro-pulse" style="position: absolute; left: 380px; top: 140px; width: 420px; height: 420px; box-sizing: border-box; border-radius: 999px; border: 8px solid #FFD23F"></div>'
    body += (f'<a {go("Home")} data-scan="0" aria-label="はじめる" style="position: absolute; left: 380px; top: 140px; width: 420px; height: 420px; border-radius: 999px; background: #FFD23F; color: #111111; '
             f'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 68px; box-shadow: none">'
             f'はじめる{icon("play", "#111111", 44)}</a>')
    body += f'<div style="position: absolute; left: 0; right: 0; top: 612px; text-align: center; font-size: 24px; color: {T["muted"]}">スイッチを おすと はじまります</div>'
    return body + '</div>'


def f_home(T):
    body = root("background: #101418; font-family: " + UD) + f_topbar(T)
    for k, act in enumerate(F_ORDER):
        if act == "shokyu":
            chip = '<span style="padding: 6px 16px; border-radius: 999px; background: #FFD23F; color: #111111; font-size: 18px; font-weight: 700">はじめては ここ</span>'
        else:
            chip = f'<span style="padding: 6px 16px; border-radius: 999px; border: 2px solid #FFFFFF; color: #FFFFFF; font-size: 18px; font-weight: 700">{LEVEL[act]}</span>'
        if act in F_LEVELNUM:
            lv = F_LEVELNUM[act]
            meter = ('<div style="display: flex; align-items: center; gap: 10px; font-size: 16px; color: #B8C4CE"><span>やさしい</span>'
                     + "".join(f'<span style="width: 18px; height: 18px; border-radius: 999px; background: {"#FFD23F" if n < lv else "#3A4450"}"></span>' for n in range(5))
                     + '<span>むずかしい</span></div>')
        else:
            meter = '<div style="font-size: 16px; color: #B8C4CE">ほかの 5つとは べつの あそびです</div>'
        body += (f'<div data-spot="{k}"{"" if k == 0 else " hidden"} style="position: absolute; left: 32px; top: 80px; width: 1116px; height: 468px; display: flex; gap: 40px">'
                 f'<div style="width: 640px; height: 468px; flex-shrink: 0; border-radius: 30px; overflow: hidden; background: {F_BG[act]}">{thumb_art(act, F_BG[act])}</div>'
                 f'<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center; gap: 18px; color: #FFFFFF">'
                 f'<div style="display: flex">{chip}</div><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 54px; line-height: 1.2">{NAMES[act]}</span>'
                 f'<span style="font-size: 24px; color: #B8C4CE">{DESCS[act]}</span>{meter}'
                 f'<span style="font-size: 17px; color: #8C99A6">スイッチで えらぶと はじまります</span></div></div>')
    # 全部の遊びの列
    body += ('<svg width="1180" height="40" aria-hidden="true" style="position: absolute; left: 0; top: 566px">'
             '<path d="M150 20 L 860 20" stroke="#3A4450" style="stroke-width: 3"></path><path d="M852 12 L 866 20 L 852 28" fill="none" stroke="#3A4450" style="stroke-width: 3; stroke-linejoin: round"></path></svg>')
    body += '<span style="position: absolute; left: 54px; top: 574px; font-size: 15px; color: #B8C4CE">やさしい</span>'
    body += '<span style="position: absolute; left: 876px; top: 574px; font-size: 15px; color: #B8C4CE">むずかしい</span>'
    for k, act in enumerate(F_ORDER):
        x = 54 + k * 178 if act != "learn" else 974
        body += (f'<a {nav(act)} data-scan="{k}" aria-label="{NAMES[act]}。{DESCS[act]}" style="position: absolute; left: {x}px; top: 612px; width: 160px; height: 188px; box-sizing: border-box; padding: 6px; '
                 f'border-radius: 20px; background: #1B2128; display: flex; flex-direction: column; gap: 6px; box-shadow: none">'
                 f'<div style="height: 132px; border-radius: 14px; overflow: hidden; background: {F_BG[act]}">{thumb_art(act, F_BG[act])}</div>'
                 f'<span style="text-align: center; font-size: 16px; font-weight: 700; color: #FFFFFF; line-height: 1.3">{NAMES[act]}</span></a>')
    body += '<div style="position: absolute; left: 948px; top: 620px; width: 3px; height: 172px; background: #3A4450"></div>'
    return body + '</div>'


def f_kind(T):
    body = root("background: #101418; font-family: " + UD) + f_topbar(T)
    body += f'<div style="position: absolute; left: 50px; top: 80px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px; color: #FFFFFF">リールを とめる</div>'
    for k, (n, name, lv, x) in enumerate([(1, "ひとつ とめる", "なれたら", 50), (3, "3つ とめる", "チャレンジ", 610)]):
        body += (f'<a href="#" data-scan="{k}" aria-label="{name}" style="position: absolute; left: {x}px; top: 150px; width: 520px; height: 510px; box-sizing: border-box; border-radius: 30px; '
                 f'overflow: hidden; background: #2A2344; display: flex; flex-direction: column; box-shadow: none">'
                 f'<div style="height: 380px">{reel_art(n, "#2A2344")}</div>'
                 f'<div style="flex-grow: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; background: #1B2128; color: #FFFFFF">'
                 f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px">{name}</span><span style="font-size: 18px; color: #B8C4CE">{lv}</span></div></a>')
    body += (f'<a {go("Home")} data-scan="2" aria-label="あそびを えらぶ に もどる" style="position: absolute; left: 50px; top: 690px; width: 240px; height: 90px; box-sizing: border-box; border-radius: 22px; '
             f'border: 3px solid #6B7B8C; color: #FFFFFF; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 26px; font-weight: 700; box-shadow: none">{icon("back", "#FFFFFF", 28)}もどる</a>')
    return body + '</div>'


def f_play_chrome(T, live=True):
    btn = 'width: 60px; height: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border-radius: 16px; border: 2px solid #3A4450; background: #101418'
    chrome = (f'<span style="position: absolute; left: 28px; top: 24px; font-size: 20px; color: #8C99A6">おすと でてくる</span>'
              f'<div style="position: absolute; right: 24px; top: 16px; display: flex; gap: 12px">'
              f'<a {go("Settings")} aria-label="この遊びの設定" style="{btn}">{icon("sliders", "#FFFFFF", 26)}</a>'
              f'<a {go("Result")} aria-label="このあそびを おわる" style="{btn}">{icon("close", "#FFFFFF", 26)}</a></div>')
    dots = "".join((f'<span data-dot="{i}" style="width: 30px; height: 30px; border-radius: 999px; background: {T["dotOff"]}"></span>' if live else
                    f'<span style="width: 30px; height: 30px; border-radius: 999px; background: {T["dotOn"] if i < 3 else T["dotOff"]}"></span>') for i in range(5))
    chrome += f'<div role="img" aria-label="すすみぐあい" style="position: absolute; left: 0; right: 0; top: 756px; display: flex; justify-content: center; gap: 20px">{dots}</div>'
    return chrome


def f_play(T):
    body = root("background: #000000; font-family: " + UD)
    body += tap_area(play_core(T, 600, 54, "#FFFFFF", "#4A5663"), "position: absolute; left: 0; top: 80px; width: 1180px; height: 660px")
    body += f_play_chrome(T) + done_overlay(110)
    return body + '</div>'


def f_result(T):
    body = root("background: #101418; font-family: " + UD) + f_topbar(T)
    stars = "".join(star(58, "#FFD23F") for _ in range(5))
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 90px; display: flex; flex-direction: column; align-items: center; gap: 6px; color: #FFFFFF">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 104px; color: #FFD23F; line-height: 1.1">できた！</span>'
             f'<div style="display: flex; align-items: baseline; gap: 10px"><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 170px; line-height: 1">5</span>'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 56px">かい</span></div>'
             f'<div style="display: flex; gap: 10px; margin-top: 6px">{stars}</div></div>')
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 626px; display: flex; justify-content: center; gap: 28px">'
             f'<a {go("Play")} data-scan="0" aria-label="もういちど" style="width: 420px; height: 116px; border-radius: 26px; background: #FFD23F; color: #111111; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px; box-shadow: none">{icon("retry", "#111111", 34)}もういちど</a>'
             f'<a {go("Home")} data-scan="1" aria-label="あそびを えらぶ" style="width: 420px; height: 116px; box-sizing: border-box; border-radius: 26px; border: 3px solid #FFFFFF; color: #FFFFFF; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px; box-shadow: none">{icon("grid", "#FFFFFF", 32)}あそびを えらぶ</a></div>')
    return body + '</div>'


def f_settings(T):
    body = root("background: #000000; font-family: " + UD)
    body += f'<div style="position: absolute; left: 260px; top: 150px">{csvg(2, 520, 416, "opacity: 0.5")}</div>'
    body += f_play_chrome(T, live=False) + DIM + settings_panel(T, "drawer")
    return body + '</div>'


def f_resume(T):
    body = root("background: #101418; font-family: " + UD)
    body += f'<div style="position: absolute; left: 380px; top: 250px">{csvg(2, 420, 336, "opacity: 0.18")}</div>'
    body += f'<div style="position: absolute; left: 0; right: 0; top: 96px; text-align: center; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 46px; color: #FFFFFF">とまって います</div>'
    body += f'<div style="position: absolute; left: 0; right: 0; top: 166px; text-align: center; font-size: 22px; color: {T["muted"]}">3かい あそんだよ</div>'
    body += (f'<a {go("Play")} data-scan="0" aria-label="つづける" style="position: absolute; left: 210px; top: 240px; width: 760px; height: 230px; border-radius: 36px; background: #FFD23F; color: #111111; '
             f'display: flex; align-items: center; justify-content: center; gap: 20px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 80px; box-shadow: none">{icon("play", "#111111", 60)}つづける</a>')
    body += (f'<a {go("Result")} data-scan="1" aria-label="おわる" style="position: absolute; left: 210px; top: 510px; width: 760px; height: 110px; box-sizing: border-box; border-radius: 30px; '
             f'border: 3px solid #6B7B8C; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 42px; font-weight: 700; box-shadow: none">おわる</a>')
    return body + '</div>'


# ================================================================ 案3：すごろく（道のりと、たまっていく成果）
M = dict(id="M", label="すごろく", name="すごろくの案",
         concept="遊びを1本の道にならべた案です。やさしい遊びから順に進み、遊ぶとスタンプがたまります。初級では押すたびにシールが増え、やったことが目に見えて残ります。",
         fd=MARU, fw=900, ink="#1F3A1F", muted="#3F5A3F", acc="#1A64C8", acc_ink="#FFFFFF", focus="#FFD23F", focus_outer="#1F3A1F",
         sink="#1F3A1F", sline="#6E8A6E", note_bg="#EEF7E8", dotOn="#FFD23F", dotOff="#3A3A3A")
M_RIM = {"shokyu": "#FF4B00", "reel": "#005AFF", "high": "#990099", "arm": "#804000", "fish": "#0A7A55"}
M_TINT = {"shokyu": "#FFE5DA", "reel": "#DCE8FF", "high": "#F6DDF6", "arm": "#F3E4D6", "fish": "#D9F3FF"}
M_POS = {"shokyu": (200, 250), "reel": (440, 320), "high": (670, 400), "arm": (860, 520), "fish": (1040, 630)}


def m_decor(path_pts, flags=True):
    s = '<svg width="1180" height="820" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
    for (x, y, r) in [(600, 170, 34), (636, 190, 26), (990, 250, 38), (1030, 280, 26), (360, 560, 30), (396, 586, 22), (760, 720, 34), (1120, 430, 30), (90, 380, 26)]:
        s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#6FB85A"></circle>'
    d = smooth(path_pts)
    s += f'<path d="{d}" fill="none" stroke="#E4BE5E" style="stroke-width: 74; stroke-linecap: round; stroke-linejoin: round"></path>'
    s += f'<path d="{d}" fill="none" stroke="#FFE7A3" style="stroke-width: 60; stroke-linecap: round; stroke-linejoin: round"></path>'
    s += f'<path d="{d}" fill="none" stroke="#FFFFFF" style="stroke-width: 4; stroke-dasharray: 14 18; opacity: 0.8"></path>'
    if flags:
        s += ('<path d="M62 150 L 62 70" stroke="#5A3B22" style="stroke-width: 6; stroke-linecap: round"></path><path d="M64 72 L 112 88 L 64 104 Z" fill="#FF4B00"></path>'
              '<path d="M1150 790 L 1150 700" stroke="#5A3B22" style="stroke-width: 6; stroke-linecap: round"></path><path d="M1148 702 L 1100 718 L 1148 734 Z" fill="#005AFF"></path>')
    return s + '</svg>'


def m_plate(inner, extra=""):
    return f'<div style="display: flex; align-items: center; gap: 12px; padding: 8px 16px; border-radius: 16px; background: #FFFFFF; {extra}">{inner}</div>'


def m_topbar(T, stamps=True):
    left = m_plate(f'{logo(T, "#1A64C8", T["ink"], 24)}<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 20px; color: {T["ink"]}">あそびの すごろく</span>')
    mid = ""
    if stamps:
        mid = m_plate(f'<span style="width: 30px; height: 30px; box-sizing: border-box; border-radius: 999px; border: 4px solid #E0301E"></span><span style="font-size: 18px; font-weight: 700; color: {T["ink"]}">スタンプ 1こ</span>')
    return (f'<div style="position: absolute; left: 20px; top: 16px; right: 20px; display: flex; align-items: center; justify-content: space-between">'
            f'<div style="display: flex; gap: 12px">{left}{mid}</div>{supporter("#FFFFFF", T["ink"], "#6E8A6E")}</div>')


def m_stamp(x, y, size=86, rot=-14, font=22):
    return (f'<div style="position: absolute; left: {x}px; top: {y}px; width: {size}px; height: {size}px; box-sizing: border-box; border-radius: 999px; border: 5px solid #E0301E; '
            f'color: #E0301E; background: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; font-family: {MARU}; font-weight: 900; font-size: {font}px; transform: rotate({rot}deg)">できた</div>')


def m_start(T):
    body = root("background: #A6DB8C; font-family: " + UD)
    body += m_decor([(60, 760), (300, 700), (560, 740), (820, 690), (1120, 720)], flags=False)
    body += (f'<div style="position: absolute; left: 240px; top: 96px; width: 700px; box-sizing: border-box; padding: 34px; border-radius: 30px; background: #FFFFFF; border: 5px solid #E4BE5E; '
             f'display: flex; flex-direction: column; align-items: center; gap: 10px; color: {T["ink"]}">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 58px">あそびの すごろく</span>'
             f'<span style="font-size: 22px; color: {T["muted"]}">やさしい あそびから、じゅんばんに すすもう</span></div>')
    body += f'<div style="position: absolute; left: 110px; top: 470px">{csvg(0, 260, 208)}</div>'
    body += (f'<a {go("Home")} data-scan="0" aria-label="はじめる" style="position: absolute; left: 420px; top: 500px; width: 460px; height: 112px; border-radius: 999px; background: {T["acc"]}; '
             f'color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 14px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 46px; box-shadow: none">'
             f'はじめる{icon("play", T["acc_ink"], 30)}</a>')
    return body + '</div>'


def m_home(T):
    body = root("background: #A6DB8C; font-family: " + UD)
    pts = [(62, 150)] + [M_POS[a] for a in GAMES] + [(1150, 760)]
    body += m_decor(pts)
    for k, act in enumerate(GAMES):
        cx, cy = M_POS[act]
        body += (f'<a {nav(act)} data-scan="{k}" aria-label="{k + 1}ばんめ。{NAMES[act]}。{DESCS[act]}" style="position: absolute; left: {cx - 76}px; top: {cy - 76}px; width: 152px; height: 152px; '
                 f'box-sizing: border-box; border-radius: 999px; border: 8px solid {M_RIM[act]}; background: {M_TINT[act]}; overflow: hidden; box-shadow: none">{thumb_art(act, M_TINT[act])}</a>')
        body += (f'<div style="position: absolute; left: {cx - 92}px; top: {cy + 84}px; width: 184px; box-sizing: border-box; padding: 6px 8px; border-radius: 14px; background: #FFFFFF; '
                 f'border: 2px solid {T["ink"]}; display: flex; flex-direction: column; align-items: center; gap: 0; color: {T["ink"]}">'
                 f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 19px; line-height: 1.3">{NAMES[act]}</span><span style="font-size: 13px; color: {T["muted"]}">{LEVEL[act]}</span></div>')
        body += (f'<div style="position: absolute; left: {cx - 88}px; top: {cy - 88}px; width: 38px; height: 38px; border-radius: 999px; background: {T["ink"]}; color: #FFFFFF; '
                 f'display: flex; align-items: center; justify-content: center; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 20px">{k + 1}</div>')
    body += m_stamp(M_POS["shokyu"][0] + 34, M_POS["shokyu"][1] - 92)
    house = ('<svg viewBox="0 0 210 160" width="210" height="160" aria-hidden="true" style="display: block">'
             '<path d="M14 76 L 105 8 L 196 76 Z" fill="#B5502E"></path><rect x="32" y="72" width="146" height="86" rx="8" fill="#FFF3D6"></rect>'
             '<rect x="92" y="104" width="32" height="54" rx="4" fill="#8A5A36"></rect><rect x="46" y="92" width="34" height="30" rx="4" fill="#4DC4FF"></rect>'
             '<rect x="138" y="90" width="28" height="38" rx="3" fill="#03AF7A"></rect><rect x="143" y="96" width="18" height="26" fill="#FFFFFF"></rect></svg>')
    body += (f'<a href="#" data-scan="5" aria-label="まなぶ・つたえる。べつの あそび" style="position: absolute; left: 70px; top: 520px; width: 230px; height: 176px; box-sizing: border-box; padding: 8px 10px; '
             f'border-radius: 20px; background: rgba(255, 255, 255, 0.35); display: flex; align-items: center; justify-content: center; box-shadow: none">{house}</a>')
    body += (f'<div style="position: absolute; left: 70px; top: 704px; width: 230px; box-sizing: border-box; padding: 6px 8px; border-radius: 14px; background: #FFFFFF; border: 2px dashed {T["ink"]}; '
             f'display: flex; flex-direction: column; align-items: center; color: {T["ink"]}"><span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 19px">まなぶ・つたえる</span>'
             f'<span style="font-size: 13px; color: {T["muted"]}">べつの あそび（おうち）</span></div>')
    body += m_topbar(T)
    return body + '</div>'


def m_kind(T):
    body = root("background: #A6DB8C; font-family: " + UD)
    s = '<svg width="1180" height="820" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
    for d in [smooth([(590, 840), (590, 640), (420, 470), (330, 380)]), smooth([(590, 640), (760, 560), (720, 460), (850, 380)])]:
        s += f'<path d="{d}" fill="none" stroke="#E4BE5E" style="stroke-width: 74; stroke-linecap: round; stroke-linejoin: round"></path>'
        s += f'<path d="{d}" fill="none" stroke="#FFE7A3" style="stroke-width: 60; stroke-linecap: round; stroke-linejoin: round"></path>'
    body += s + '</svg>' + m_topbar(T, stamps=False)
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 96px; display: flex; justify-content: center">'
             + m_plate(f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 32px; color: {T["ink"]}">リールを とめる</span><span style="font-size: 18px; color: {T["muted"]}">どちらの みちに する？</span>')
             + '</div>')
    for k, (n, name, sub, x) in enumerate([(1, "ひとつ とめる", "みじかい みち", 150), (3, "3つ とめる", "ながい みち", 670)]):
        body += (f'<a href="#" data-scan="{k}" aria-label="{name}。{sub}" style="position: absolute; left: {x}px; top: 176px; width: 360px; height: 300px; box-sizing: border-box; border-radius: 24px; '
                 f'overflow: hidden; background: #FFFFFF; border: 5px solid #E4BE5E; display: flex; flex-direction: column; box-shadow: none; color: {T["ink"]}">'
                 f'<div style="height: 190px; background: #DCE8FF">{reel_art(n, "#DCE8FF")}</div>'
                 f'<div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px">'
                 f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 30px">{name}</span><span style="font-size: 16px; color: {T["muted"]}">{sub}</span></div></a>')
    body += (f'<a {go("Home")} data-scan="2" aria-label="あそびを えらぶ に もどる" style="position: absolute; left: 40px; top: 712px; min-height: 72px; box-sizing: border-box; padding: 0 28px; '
             f'display: flex; align-items: center; gap: 8px; border-radius: 999px; background: #FFFFFF; border: 3px solid {T["ink"]}; color: {T["ink"]}; font-size: 22px; font-weight: 700; box-shadow: none">{icon("back", T["ink"], 26)}もどる</a>')
    return body + '</div>'


def m_play_header(T):
    btn = 'min-height: 48px; box-sizing: border-box; padding: 0 16px; display: flex; align-items: center; gap: 8px; border: 2px solid #555555; border-radius: 12px; color: #FFFFFF; font-size: 16px; font-weight: 700; background: #111111'
    return (f'<div style="position: absolute; left: 0; top: 0; right: 0; height: 72px; box-sizing: border-box; padding: 0 24px; display: flex; align-items: center; justify-content: space-between; background: #111111">'
            f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 24px; color: #FFFFFF">おすと でてくる</span>'
            f'<div style="display: flex; gap: 10px"><a {go("Settings")} aria-label="この遊びの設定" style="{btn}">{icon("sliders", "#FFFFFF")}<span>この遊びの設定</span></a>'
            f'<a {go("Result")} aria-label="このあそびを おわる" style="{btn}">{icon("close", "#FFFFFF")}<span>このあそびを おわる</span></a></div></div>')


def m_shelf(T, live=True, filled=3):
    slots = ""
    for i in range(5):
        pic = f'<span style="display: flex">{csvg(i, 124, 99)}</span>'
        num = f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px; color: #555555">{i + 1}</span>'
        inner = (when(f"got{i}", pic) + when(f"empty{i}", num, True)) if live else (pic if i < filled else num)
        slots += (f'<div style="width: 150px; height: 150px; box-sizing: border-box; border-radius: 22px; border: 3px dashed #5A5A5A; background: #1F1F1F; '
                  f'display: flex; align-items: center; justify-content: center">{inner}</div>')
    return (f'<div style="position: absolute; left: 0; top: 596px; width: 1180px; height: 224px; box-sizing: border-box; background: #161616; border-top: 2px solid #333333">'
            f'<span style="position: absolute; left: 40px; top: 12px; font-size: 18px; font-weight: 700; color: #DDDDDD">シールちょう</span>'
            f'<div style="position: absolute; left: 0; right: 0; top: 48px; display: flex; justify-content: center; gap: 24px">{slots}</div></div>')


def m_play(T):
    body = root("background: #000000; font-family: " + UD) + m_play_header(T)
    body += tap_area(play_core(T, 380, 36, "#FFFFFF", "#666666"), "position: absolute; left: 0; top: 72px; width: 1180px; height: 524px")
    body += m_shelf(T) + done_overlay(250)
    return body + '</div>'


def m_result(T):
    body = root("background: #A6DB8C; font-family: " + UD)
    body += m_decor([(40, 800), (400, 760), (800, 790), (1160, 750)], flags=False) + m_topbar(T)
    row = "".join(f'<div style="width: 140px; height: 140px; border-radius: 20px; background: #F4F8F1; display: flex; align-items: center; justify-content: center">{csvg(i, 120, 96)}</div>' for i in range(5))
    body += (f'<div style="position: absolute; left: 170px; top: 120px; width: 840px; height: 440px; box-sizing: border-box; padding: 36px; border-radius: 30px; background: #FFFFFF; border: 5px solid #E4BE5E; '
             f'display: flex; flex-direction: column; align-items: center; gap: 26px; color: {T["ink"]}">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 48px">シールが そろったよ！</span>'
             f'<div style="display: flex; gap: 18px">{row}</div>'
             f'<span style="font-size: 22px; color: {T["muted"]}">すごろくに スタンプを 1こ おしたよ</span></div>')
    body += m_stamp(900, 92, size=150, rot=12, font=40)
    body += (f'<div style="position: absolute; left: 0; right: 0; top: 600px; display: flex; justify-content: center; gap: 24px">'
             f'<a {go("Play")} data-scan="0" aria-label="もういちど" style="width: 380px; height: 100px; border-radius: 999px; background: {T["acc"]}; color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("retry", T["acc_ink"], 30)}もういちど</a>'
             f'<a {go("Home")} data-scan="1" aria-label="あそびを えらぶ" style="width: 380px; height: 100px; box-sizing: border-box; border-radius: 999px; background: #FFFFFF; border: 3px solid {T["ink"]}; color: {T["ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("grid", T["ink"], 28)}あそびを えらぶ</a></div>')
    return body + '</div>'


def m_settings(T):
    body = root("background: #000000; font-family: " + UD) + m_play_header(T)
    body += f'<div style="position: absolute; left: 420px; top: 150px">{csvg(2, 340, 272, "opacity: 0.5")}</div>'
    body += m_shelf(T, live=False) + DIM + settings_panel(T, "modal")
    return body + '</div>'


def m_resume(T):
    body = root("background: #A6DB8C; font-family: " + UD)
    body += m_decor([(62, 150)] + [M_POS[a] for a in GAMES] + [(1150, 760)])
    body += '<div style="position: absolute; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.35)"></div>'
    body += (f'<div role="dialog" aria-label="とまって います" style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 580px; box-sizing: border-box; padding: 38px; '
             f'display: flex; flex-direction: column; align-items: center; gap: 18px; border-radius: 30px; background: #FFFFFF; border: 5px solid #E4BE5E; color: {T["ink"]}">'
             f'<span style="font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 40px">とまって います</span><span style="font-size: 20px; color: {T["muted"]}">シールは 3まい。つづきから あそべるよ。</span>'
             f'<a {go("Play")} data-scan="0" aria-label="つづける" style="width: 100%; height: 96px; border-radius: 999px; background: {T["acc"]}; color: {T["acc_ink"]}; display: flex; align-items: center; justify-content: center; gap: 12px; font-family: {T["fd"]}; font-weight: {T["fw"]}; font-size: 34px; box-shadow: none">{icon("play", T["acc_ink"], 28)}つづける</a>'
             f'<a {go("Result")} data-scan="1" aria-label="おわる" style="width: 100%; height: 76px; box-sizing: border-box; border-radius: 999px; border: 3px solid {T["ink"]}; background: #FFFFFF; color: {T["ink"]}; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; box-shadow: none">おわる</a></div>')
    return body + '</div>'


# ================================================================ 書き出し
CONCEPTS = [
    (O, {"Start": o_start, "Home": o_home, "Kind": o_kind, "Play": o_play, "Result": o_result, "Settings": o_settings, "Resume": o_resume}),
    (F, {"Start": f_start, "Home": f_home, "Kind": f_kind, "Play": f_play, "Result": f_result, "Settings": f_settings, "Resume": f_resume}),
    (M, {"Start": m_start, "Home": m_home, "Kind": m_kind, "Play": m_play, "Result": m_result, "Settings": m_settings, "Resume": m_resume}),
]

if __name__ == "__main__":
    sections, meta, variants = [], {}, []
    now_sections, now_meta, now_variant = page_shell.now_row(gen)
    sections += now_sections
    meta["N"] = now_meta
    variants.append(now_variant)
    for T, fns in CONCEPTS:
        meta[T["id"]] = {"ring": ring(T), "dotOn": T["dotOn"], "dotOff": T["dotOff"], "selBg": T["acc"], "selInk": T["acc_ink"], "selBorder": T["acc"],
                         "unsBg": "#FFFFFF", "unsInk": T["sink"], "unsBorder": T["sline"]}
        variants.append({"id": T["id"], "label": T["label"], "name": T["name"], "concept": T["concept"]})
        for scr, label, _ in gen.SCREENS:
            sections.append(f'<section class="screen" data-variant="{T["id"]}" data-screen="{scr}" aria-label="{T["label"]}｜{label}" hidden>{fns[scr](T)}</section>')
    html = page_shell.render(
        title="NURO 画面構成3案",
        brand="NURO 画面構成の3案",
        brand_sub="画面デザイン案（絵は仮のものです）",
        variants=variants,
        sections=sections,
        meta=meta,
        screens=[{"id": s, "label": l} for s, l, _ in gen.SCREENS],
        default_v="O",
    )
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print(OUT, len(html.encode("utf-8")))
