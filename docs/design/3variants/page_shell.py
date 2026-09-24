# 単一HTMLの外枠（案の切り替え・並べて比べる・スイッチ操作の再現）と、「現状」の行
# gen_single.py（配色の3案）と gen_concepts.py（構成の3案）が共通で使う
import base64, json, os


def now_row(gen):
    """いまのアプリの画面（now/*.jpg）を「現状」の行にする。"""
    now_dir = os.path.join(gen.ROOT, "now")
    notes = {
        "Start": "「はじめる」の下に、小さく「せってい」があります。",
        "Home": "1ページに2つずつ並び、「次のページ」で残りの遊びを見ます。",
        "Kind": "「リールを止める」の種類をえらぶ画面です。",
        "Play": "「色と音」。押すたびに色と音が変わり、5回で終わります。遊ぶ前に、説明の画面が1枚入ります。",
        "Result": "「色と音」の結果画面です。",
        "Settings": "いまはゲームの中に設定がありません。画像は、ホームの「支援者メニュー」から開く設定画面です。",
        "Resume": "いまのアプリには、この画面はありません。遊びの途中でアプリが裏に回ると、遊びは終わってホームに戻ります。",
    }
    sections = []
    for scr, label, _ in gen.SCREENS:
        path = os.path.join(now_dir, f"{scr}.jpg")
        if os.path.exists(path):
            data = base64.b64encode(open(path, "rb").read()).decode("ascii")
            body = (f'<div style="width: {gen.W}px; height: {gen.H}px; background: #FBFAF7">'
                    f'<img src="data:image/jpeg;base64,{data}" alt="いまのアプリの「{label}」" width="{gen.W}" height="{gen.H}" style="display: block; width: {gen.W}px; height: {gen.H}px"></div>')
        else:
            body = (f'<div style="width: {gen.W}px; height: {gen.H}px; box-sizing: border-box; padding: 80px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; '
                    f'background: #FBFAF7; color: #102B2A; font-family: {gen.FONT_UD}; text-align: center">'
                    f'<span style="font-size: 36px; font-weight: 700">この画面は、いまのアプリにはありません</span>'
                    f'<span style="font-size: 22px; line-height: 1.7; color: #526966; max-width: 760px">{notes[scr]}</span></div>')
        sections.append(f'<section class="screen" data-variant="N" data-screen="{scr}" aria-label="現状｜{label}" hidden>{body}</section>')
    meta = {"ring": "none", "dotOn": "#000000", "dotOff": "#000000", "selBg": "#000000", "selInk": "#FFFFFF",
            "selBorder": "#000000", "unsBg": "#FFFFFF", "unsInk": "#000000", "unsBorder": "#000000"}
    variant = {"id": "N", "label": "現状", "name": "現状（いまのアプリ）",
               "concept": "いまのアプリ（2026年8月28日の版）の画面です。案と比べるための基準として載せています。", "notes": notes}
    return sections, meta, variant


def render(*, title, brand, brand_sub, variants, sections, meta, screens, default_v, overview_first=True):
    variant_buttons = "".join(f'<button type="button" data-variant-btn="{v["id"]}" aria-pressed="false">{v["label"]}</button>' for v in variants)
    screen_buttons = "".join(f'<button type="button" data-screen-btn="{s["id"]}" aria-pressed="false">{s["label"]}</button>' for s in screens)
    return f"""<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDPGothic:wght@400;700&amp;family=Zen+Maru+Gothic:wght@500;700;900&amp;display=swap">
<style>
:root {{
  --page: #EDF2F1;
  --panel: #FFFFFF;
  --ink: #15292A;
  --muted: #4E6361;
  --line: #C3D1CE;
  --accent: #1C7774;
  --accent-ink: #FFFFFF;
  --shadow: 0 10px 30px rgba(21, 41, 42, 0.16);
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    color-scheme: dark;
    --page: #0E1617;
    --panel: #172325;
    --ink: #E4EDEB;
    --muted: #9DB2AE;
    --line: #2E3F41;
    --accent: #6CC3BD;
    --accent-ink: #0E1617;
    --shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }}
}}
:root[data-theme="dark"] {{
  color-scheme: dark;
  --page: #0E1617;
  --panel: #172325;
  --ink: #E4EDEB;
  --muted: #9DB2AE;
  --line: #2E3F41;
  --accent: #6CC3BD;
  --accent-ink: #0E1617;
  --shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}}
[hidden] {{ display: none !important; }}
html, body {{ height: 100%; }}
body {{ margin: 0; background: var(--page); color: var(--ink); font: 14px/1.5 'BIZ UDPGothic', 'Hiragino Sans', 'Yu Gothic UI', sans-serif; }}
.app {{ box-sizing: border-box; min-height: 100%; padding-inline: 16px; display: flex; flex-direction: column; }}
.bar {{ position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--page); padding-block: 12px 10px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid var(--line); }}
.bar-row {{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; }}
.brand {{ font-family: 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 0.04em; margin: 0; }}
.brand small {{ font-family: 'BIZ UDPGothic', sans-serif; font-weight: 400; font-size: 13px; color: var(--muted); letter-spacing: 0; margin-left: 8px; }}
.seg {{ display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel); }}
.seg button {{ border: 0; background: transparent; color: var(--ink); padding: 0 14px; min-height: 40px; font: inherit; font-weight: 700; cursor: pointer; }}
.seg button + button {{ border-left: 1px solid var(--line); }}
.seg button[aria-pressed="true"] {{ background: var(--accent); color: var(--accent-ink); }}
.tabs {{ display: flex; flex-wrap: wrap; gap: 6px; }}
.tabs button {{ border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 0 14px; min-height: 36px; font: inherit; cursor: pointer; }}
.tabs button[aria-pressed="true"] {{ border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); font-weight: 700; }}
.tabs .all {{ border-style: dashed; }}
.opts {{ display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; color: var(--muted); }}
.opts label {{ display: inline-flex; align-items: center; gap: 6px; }}
.opts select {{ font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; min-height: 34px; padding: 0 8px; }}
.press {{ border: 0; border-radius: 10px; background: #FFC83D; color: #111111; font: inherit; font-weight: 700; min-height: 40px; padding: 0 16px; cursor: pointer; box-shadow: inset 0 0 0 2px #111111; }}
.press:disabled {{ opacity: 0.45; cursor: default; }}
.hint {{ margin: 0; font-size: 13px; color: var(--muted); }}
button:focus-visible, select:focus-visible {{ outline: 3px solid var(--accent); outline-offset: 2px; }}
.stage-wrap {{ flex: 1; display: flex; flex-direction: column; align-items: center; padding-block: 16px 28px; gap: 10px; }}
.stage-box {{ position: relative; width: calc(1180px * var(--s, 1)); height: calc(820px * var(--s, 1)); max-width: 100%; }}
.stage {{ position: absolute; left: 0; top: 0; width: 1180px; height: 820px; transform: scale(var(--s, 1)); transform-origin: 0 0; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow); }}
.caption {{ margin: 0; color: var(--muted); font-size: 13px; text-align: center; max-width: 70ch; }}
.overview {{ padding-block: 18px 32px; display: flex; flex-direction: column; gap: 28px; }}
.ov-row h2 {{ margin: 0 0 2px 0; font-family: 'Zen Maru Gothic', sans-serif; font-weight: 700; font-size: 18px; }}
.ov-row p {{ margin: 0 0 10px 0; color: var(--muted); font-size: 13px; }}
.ov-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(212px, 1fr)); gap: 14px; }}
.thumb {{ display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }}
.thumb-box {{ position: relative; width: 100%; aspect-ratio: 1180 / 820; overflow: hidden; border-radius: 8px; box-shadow: 0 0 0 1px var(--line); background: #000; }}
.thumb-inner {{ position: absolute; left: 0; top: 0; width: 1180px; height: 820px; transform-origin: 0 0; pointer-events: none; }}
.thumb:hover .thumb-box, .thumb:focus-visible .thumb-box {{ box-shadow: 0 0 0 3px var(--accent); }}
.thumb span {{ font-size: 13px; }}
.screen a, .thumb-inner a {{ text-decoration: none; color: inherit; }}
.screen button, .thumb-inner button {{ font: inherit; }}
@keyframes nuro-pop {{ 0% {{ transform: scale(.35); opacity: 0; }} 70% {{ transform: scale(1.06); opacity: 1; }} 100% {{ transform: scale(1); opacity: 1; }} }}
.nuro-pop {{ animation: nuro-pop .32s cubic-bezier(.34, 1.36, .64, 1) both; }}
@keyframes nuro-pulse {{ 0% {{ transform: scale(1); opacity: .55; }} 100% {{ transform: scale(1.35); opacity: 0; }} }}
.nuro-pulse {{ animation: nuro-pulse 1.8s ease-out infinite; }}
@media (prefers-reduced-motion: reduce) {{ .nuro-pop, .nuro-pulse {{ animation: none; }} }}
</style>

<div class="app">
  <div class="bar">
    <div class="bar-row">
      <h1 class="brand">{brand}<small>{brand_sub}</small></h1>
      <div class="seg" role="group" aria-label="案">{variant_buttons}</div>
    </div>
    <div class="bar-row">
      <div class="tabs" role="group" aria-label="画面"><button type="button" class="all" data-overview-btn aria-pressed="false">並べて比べる</button>{screen_buttons}</div>
    </div>
    <div class="bar-row opts">
      <label for="scanSpeed">枠が動く速さ
        <select id="scanSpeed"><option value="1000">1.0秒</option><option value="1600" selected>1.6秒</option><option value="2400">2.4秒</option></select>
      </label>
      <label for="holdMode">初級：絵が消えるまで
        <select id="holdMode"><option value="1200" selected>1.2秒</option><option value="3000">3秒</option><option value="keep">残す</option></select>
      </label>
      <button type="button" class="press" id="pressBtn">スイッチを押す（Space）</button>
      <p class="hint">黄色い枠は、スイッチで操作するときの「いま選べる場所」です。枠は自動で動くので、SpaceキーかEnterキー（またはこのボタン）で決定します。画面を直接タップしても操作できます。</p>
    </div>
  </div>

  <main class="stage-wrap" id="stageWrap">
    <div class="stage-box"><div class="stage" id="stage">{''.join(sections)}</div></div>
    <p class="caption" id="caption"></p>
  </main>
  <div class="overview" id="overview" hidden></div>
</div>

<script>
(() => {{
  const META = {json.dumps(meta, ensure_ascii=False)};
  const SCREENS = {json.dumps(screens, ensure_ascii=False)};
  const VARIANTS = {json.dumps(variants, ensure_ascii=False)};
  const SCAN_SCREENS = ['Start', 'Home', 'Kind', 'Result', 'Resume'];
  const cur = {{ v: {json.dumps(default_v)}, s: 'Home', overview: {'true' if overview_first else 'false'} }};
  let scanTimer = null, scanIdx = 0, scanMs = 1600, holdMode = '1200';
  const play = {{ count: 0, idx: -1, visible: false, done: false, timer: null }};

  try {{
    const h = (location.hash || '').slice(1);
    const re = new RegExp('^(' + VARIANTS.map((v) => v.id).join('|') + ')-([A-Za-z]+)$');
    const m = h.match(re);
    if (m && SCREENS.some((s) => s.id === m[2])) {{ cur.v = m[1]; cur.s = m[2]; cur.overview = false; }}
    else if (h === 'all') {{ cur.overview = true; }}
  }} catch (e) {{}}

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const active = () => $(`.screen[data-variant="${{cur.v}}"][data-screen="${{cur.s}}"]`);
  const targets = (sec) => $$('[data-scan]', sec).sort((a, b) => a.dataset.scan - b.dataset.scan);

  function fit() {{
    const wrap = $('#stageWrap');
    const bar = $('.bar');
    const w = wrap.clientWidth;
    const h = window.innerHeight - bar.offsetHeight - 70;
    const s = Math.max(0.2, Math.min(1, w / 1180, Math.max(h, 320) / 820));
    document.documentElement.style.setProperty('--s', s.toFixed(4));
  }}

  // 枠を描く。大きく見せる画面（data-spot）は、枠の当たっている遊びだけを出す
  function paintScan() {{
    const sec = active();
    if (!sec) return;
    const ring = META[cur.v].ring;
    targets(sec).forEach((t, i) => {{ t.style.boxShadow = i === scanIdx ? ring : 'none'; }});
    $$('[data-spot]', sec).forEach((el) => {{ el.hidden = Number(el.dataset.spot) !== scanIdx; }});
  }}

  function restartScan() {{
    clearInterval(scanTimer);
    scanIdx = 0;
    const sec = active();
    if (!sec || cur.overview) return;
    paintScan();
    const ts = targets(sec);
    if (ts.length > 1 && SCAN_SCREENS.includes(cur.s)) {{
      scanTimer = setInterval(() => {{ scanIdx = (scanIdx + 1) % ts.length; paintScan(); }}, scanMs);
    }}
  }}

  function renderPlay() {{
    const sec = active();
    if (!sec || cur.s !== 'Play') return;
    const flags = {{ prompt: play.count === 0 && !play.visible, idle: play.count > 0 && !play.visible && !play.done, done: play.done }};
    for (let i = 0; i < 5; i++) {{
      flags['show' + i] = play.visible && play.idx === i;
      flags['got' + i] = play.count > i;
      flags['empty' + i] = play.count <= i;
    }}
    $$('[data-when]', sec).forEach((el) => {{ el.hidden = !flags[el.dataset.when]; }});
    $$('[data-dot]', sec).forEach((el) => {{ el.style.background = Number(el.dataset.dot) < play.count ? META[cur.v].dotOn : META[cur.v].dotOff; }});
    $$('[data-text="countText"]', sec).forEach((el) => {{ el.textContent = play.count + 'かい あそんだよ'; }});
  }}

  const holdMs = () => (holdMode === 'keep' ? 1200 : Number(holdMode));

  function tap() {{
    if (play.done || play.count >= 5) return;
    play.idx = play.count;
    play.count += 1;
    play.visible = true;
    clearTimeout(play.timer);
    if (play.count >= 5) {{
      play.timer = setTimeout(() => {{ play.done = true; renderPlay(); }}, Math.max(holdMs(), 1200));
    }} else if (holdMode !== 'keep') {{
      play.timer = setTimeout(() => {{ play.visible = false; renderPlay(); }}, holdMs());
    }}
    renderPlay();
  }}

  function resetPlay() {{
    clearTimeout(play.timer);
    Object.assign(play, {{ count: 0, idx: -1, visible: false, done: false }});
    renderPlay();
  }}

  function buildOverview() {{
    const ov = $('#overview');
    if (ov.dataset.built) return;
    VARIANTS.forEach((v) => {{
      const row = document.createElement('section');
      row.className = 'ov-row';
      const h = document.createElement('h2');
      h.textContent = v.name;
      const p = document.createElement('p');
      p.textContent = v.concept;
      const grid = document.createElement('div');
      grid.className = 'ov-grid';
      SCREENS.forEach((s) => {{
        const src = $(`.screen[data-variant="${{v.id}}"][data-screen="${{s.id}}"]`);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb';
        btn.setAttribute('aria-label', `${{v.label}}｜${{s.label}}を開く`);
        const box = document.createElement('div');
        box.className = 'thumb-box';
        const inner = document.createElement('div');
        inner.className = 'thumb-inner';
        inner.innerHTML = src.innerHTML;
        inner.setAttribute('inert', '');
        inner.setAttribute('aria-hidden', 'true');
        box.appendChild(inner);
        const cap = document.createElement('span');
        cap.textContent = s.label;
        btn.append(box, cap);
        btn.addEventListener('click', () => {{ cur.v = v.id; cur.s = s.id; cur.overview = false; show(); window.scrollTo(0, 0); }});
        grid.appendChild(btn);
      }});
      row.append(h, p, grid);
      ov.appendChild(row);
    }});
    ov.dataset.built = '1';
    sizeThumbs();
  }}

  function sizeThumbs() {{
    $$('.thumb-box').forEach((box) => {{
      const inner = box.firstElementChild;
      if (inner) inner.style.transform = `scale(${{box.clientWidth / 1180}})`;
    }});
  }}

  function show() {{
    $$('.screen').forEach((el) => {{ el.hidden = !(el.dataset.variant === cur.v && el.dataset.screen === cur.s); }});
    $$('[data-variant-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.variantBtn === cur.v && !cur.overview)));
    $$('[data-screen-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screenBtn === cur.s && !cur.overview)));
    $('[data-overview-btn]').setAttribute('aria-pressed', String(cur.overview));
    $('#stageWrap').hidden = cur.overview;
    $('#overview').hidden = !cur.overview;
    $('#pressBtn').disabled = cur.overview || cur.v === 'N';
    const v = VARIANTS.find((x) => x.id === cur.v);
    const s = SCREENS.find((x) => x.id === cur.s);
    $('#caption').textContent = `${{v.name}}｜${{s.label}}　—　${{v.notes ? v.notes[s.id] : v.concept}}`;
    if (cur.overview) buildOverview();
    resetPlay();
    restartScan();
    fit();
    if (cur.overview) sizeThumbs();
    try {{ history.replaceState(null, '', '#' + (cur.overview ? 'all' : cur.v + '-' + cur.s)); }} catch (e) {{}}
  }}

  function press() {{
    if (cur.overview) return;
    if (cur.s === 'Play') {{ tap(); return; }}
    const sec = active();
    const ts = sec ? targets(sec) : [];
    if (ts[scanIdx]) ts[scanIdx].click();
  }}

  document.addEventListener('click', (e) => {{
    const t = e.target;
    const vb = t.closest('[data-variant-btn]');
    if (vb) {{ cur.v = vb.dataset.variantBtn; cur.overview = false; show(); return; }}
    const sb = t.closest('[data-screen-btn]');
    if (sb) {{ cur.s = sb.dataset.screenBtn; cur.overview = false; show(); return; }}
    if (t.closest('[data-overview-btn]')) {{ cur.overview = true; show(); return; }}
    if (!t.closest('.stage')) return;
    const a = t.closest('a');
    if (a) e.preventDefault();
    const go = t.closest('[data-go]');
    if (go) {{ cur.s = go.dataset.go; show(); return; }}
    const act = t.closest('[data-action]');
    if (act) {{ if (act.dataset.action === 'tap') tap(); else if (act.dataset.action === 'reset') resetPlay(); return; }}
    const opt = t.closest('[data-group]');
    if (opt) {{
      const m = META[cur.v];
      $$(`[data-group="${{opt.dataset.group}}"]`, active()).forEach((b) => {{
        const on = b === opt;
        b.setAttribute('aria-pressed', String(on));
        b.style.background = on ? m.selBg : m.unsBg;
        b.style.color = on ? m.selInk : m.unsInk;
        b.style.borderColor = on ? m.selBorder : m.unsBorder;
      }});
      return;
    }}
    // 行き先のない選択肢をタップしたら、枠をそこへ移す（大きく見せる画面では中身も切り替わる）
    const sc = t.closest('[data-scan]');
    if (sc) {{
      const i = targets(active()).indexOf(sc);
      if (i >= 0) {{ scanIdx = i; paintScan(); }}
    }}
  }});

  document.addEventListener('keydown', (e) => {{
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.target.closest && e.target.closest('.bar')) return;
    e.preventDefault();
    if (e.repeat) return;
    press();
  }});

  $('#pressBtn').addEventListener('click', press);
  $('#scanSpeed').addEventListener('change', (e) => {{ scanMs = Number(e.target.value); restartScan(); }});
  $('#holdMode').addEventListener('change', (e) => {{ holdMode = e.target.value; resetPlay(); }});
  window.addEventListener('resize', () => {{ fit(); sizeThumbs(); }});
  show();
}})();
</script>
"""
