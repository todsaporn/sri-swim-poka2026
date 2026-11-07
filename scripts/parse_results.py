"""Parse HY-TEK result PDFs in raw/results/*.pdf -> data/results.json (+ .txt dumps for debugging)."""
import fitz, re, json, glob, os, sys, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(__file__))
def clean(t):
    t = t.replace('ํŖา','้ำ').replace('Ŗ','้').replace('ϐ','f').replace('ŕ','่').replace('ř','์')
    t = t.replace('ํ้า','้ำ').replace('ํา','ำ')
    t = re.sub(r'\s+',' ',t).strip()
    t = re.sub(r' ([\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])', r'\1', t)
    return t.replace('ํ้า','้ำ').replace('ํา','ำ')
FIN = r'(?:\d+:)?\d{1,2}\.\d\d[A-Za-z]?|DQ|DNS|NS|DFS|SCR|NT'
IND = re.compile(rf'^(?P<pl>\d+|-+|\*\d+)?\s*(?P<name>\D+?)\s+(?:[A-Z]\s+)?(?P<age>\d{{1,2}})\s+(?P<team>.+?)\s+(?P<seed>NT|NS|(?:\d+:)?\d+\.\d\d)\s+(?P<fin>{FIN})(?:\s+[a-zA-Z]+)?(?:\s+(?P<pts>\d+))?$')
REL = re.compile(rf'^(?P<pl>\d+|-+|\*\d+)?\s*(?P<team>[A-Za-z][A-Za-z .&\'-]+?)\s+(?P<rel>[A-Z])\s+(?P<seed>NT|NS|(?:\d+:)?\d+\.\d\d)\s+(?P<fin>{FIN})(?:\s+(?P<pts>\d+))?$')

def lines_of(pdf):
    d = fitz.open(pdf); out = []; seq = 0
    two = False
    for p in d:
        for b in p.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                if l['bbox'][0] > 290 and ''.join(s['text'] for s in l['spans']).startswith('Event'): two = True
    for pn, p in enumerate(d):
        its = []
        for b in p.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    seq += 1
                    if not s['text']: continue
                    x0, y0, x1, y1 = s['bbox']
                    col = 1 if (two and x0 >= 297) else 0
                    its.append((pn, col, (y0+y1)/2, x0, seq, s['text']))
        its.sort(key=lambda i: (i[1], i[2], i[3]))
        rows = []
        for it in its:
            if rows and rows[-1][0] == it[1] and abs(rows[-1][1] - it[2]) < 3.2: rows[-1][2].append(it)
            else: rows.append([it[1], it[2], [it]])
        for col, y, xs in rows:
            # keep stream order inside a run of spans that belong to the same text line, x order otherwise
            xs.sort(key=lambda i: i[3])
            groups = []
            for i in xs:
                if groups and i[3] - groups[-1][-1][3] < 6: groups[-1].append(i)
                else: groups.append([i])
            txt = '  '.join(''.join(j[5] for j in sorted(g, key=lambda j: j[4])) for g in groups)
            out.append(clean(txt))
    return out

def parse(pdf):
    L = lines_of(pdf); ev = None; rows = []; last = None
    for ln in L:
        m = re.match(r'Event (\d+) (Boys|Girls|Mixed) (.+?) (\d+) SC Meter (.+)$', ln)
        if m: ev = int(m[1]); continue
        r = IND.match(ln) or REL.match(ln)
        if r:
            g = r.groupdict(); g = {k: v for k, v in g.items() if v}
            g['pl'] = int(g['pl']) if g.get('pl', '').isdigit() else None
            g['raw'] = ln; rows.append(g); last = g; continue
        if last and last.get('fin') == 'DQ' and 'reason' not in last and not re.match(r'^(Event|Lane|Name|Team|Heat|Finals|R4SCM)', ln):
            last['reason'] = ln
    return ev, rows, L

if __name__ == '__main__':
    res = {}
    for f in sorted(glob.glob('raw/results/*.pdf'), key=lambda f: int(re.findall(r'\d+', os.path.basename(f))[0])):
        n = int(re.findall(r'\d+', os.path.basename(f))[0])
        try:
            ev, rows, L = parse(f)
        except Exception as e:
            print('fail', f, e); continue
        open(f[:-4] + '.txt', 'w').write('\n'.join(L))
        res[n] = {'ev': ev or n, 'rows': rows}
        print(n, 'rows', len(rows))
    json.dump(res, open('data/results.json', 'w'), ensure_ascii=False, indent=0)
