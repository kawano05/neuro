import glob, re, os, json, html.parser
class P(html.parser.HTMLParser):
    VOID = {'meta','link','br','img','input','hr','source','area','base','col','embed','param','track','wbr'}
    def __init__(s):
        super().__init__(convert_charrefs=True); s.st=[]; s.err=[]
    def handle_starttag(s, t, a):
        if t not in s.VOID: s.st.append(t)
    def handle_endtag(s, t):
        if t in s.VOID: return
        if not s.st or s.st[-1] != t: s.err.append((t, s.st[-3:]))
        else: s.st.pop()
for f in sorted(glob.glob('project/*.dc.html')):
    src = open(f, encoding='utf-8').read()
    body = src.split('<x-dc>')[1].split('</x-dc>')[0]
    p = P(); p.feed(body)
    holes = re.findall(r'\{\{\s*([^}]+?)\s*\}\}', body)
    bad = [h for h in holes if not re.fullmatch(r'[A-Za-z_$][\w$]*(\.[\w$]+)*|true|false', h)]
    props = re.search(r"data-props='([^']*)'", src).group(1)
    json.loads(props.replace('&amp;', '&').replace('&#39;', "'"))
    print(os.path.basename(f), 'unclosed:' + ','.join(p.st) if p.st else 'ok', p.err[:2], 'badholes', bad[:3], len(src))
c = json.load(open('project/canvas.json', encoding='utf-8'))
print('boards', len(c['boards']), 'order', len(c['order']), 'notes', len(c['notes']))
