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
TM = r'\d{1,2}:\d\d\.\d\d|\d{1,2}\.\d\d'
# CNX result format: place, place-in-heat, heat, lane, name, age, team, time, points, cumulative, [G|S|B], [standard]
OK = re.compile(rf'^(?P<pl>\d+) (?P<hpl>\d+) (?P<ht>\d+) (?P<ln>\d+) (?P<name>.+?) (?P<age>\d{{1,2}}) (?P<team>\S.*?) (?P<fin>{TM})(?: (?P<pts>\d+))?(?: (?P<cum>\d+))?(?: (?P<pod>[GSB]))?(?: (?P<lvl>ทองแดง|ทอง|เงิน))?(?: (?P<rec>[A-Z]+))?$')
OKR = re.compile(rf'^(?P<pl>\d+) (?P<hpl>\d+) (?P<ht>\d+) (?P<ln>\d+) (?P<name>.+?) (?P<fin>{TM})(?: (?P<pts>\d+))?(?: (?P<cum>\d+))?(?: (?P<pod>[GSB]))?(?: (?P<lvl>ทองแดง|ทอง|เงิน))?(?: (?P<rec>[A-Z]+))?$')
NOR = re.compile(r'^(?P<ht>\d+) (?P<ln>\d+) (?P<name>.+?) (?P<fin>DQ|SC|NS|DNS|DFS|DNF)(?: (?P<pts>\d+))?.*$')
NO = re.compile(rf'^(?P<ht>\d+) (?P<ln>\d+) (?P<name>.+?) (?P<age>\d{{1,2}}) (?P<team>\S.*?) (?P<fin>DQ|SC|NS|DNS|DFS|DNF)(?: (?P<pts>\d+))?.*$')
# HY-TEK relay results: "3 Sriarunothai Swimming Club A NT 2:13.91 [pts]"
HYREL = re.compile(rf'^(?P<pl>\d+|-+) (?P<team>[A-Za-z][A-Za-z .&\'-]+?) (?P<rel>[A-D]) (?P<seed>NT|{TM}) (?P<fin>{TM}|DQ|DNS|NS|DFS|SCR)(?P<rec>#)?(?: (?:{TM}))?(?: (?P<pts>\d+(?:\.\d+)?))?$')
def ntime(t):
    t = re.sub(r'^0+(?=\d)', '', t)          # 01:26.62 -> 1:26.62
    if t.startswith('0:'): t = t[2:]
    t = re.sub(r'^0(?=\d\.)', '', t)          # 09.50 -> 9.50
    return t

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
    L = lines_of(pdf); ev = None; rows = []; last = None; rec = None
    for ln in L:
        m = re.match(r'^รายการ (\d+) (.+)$', ln) or re.match(r'^Event (\d+) (.+)$', ln)
        if m: ev = int(m[1]); continue
        m = re.match(r'^สถิติ\S* \(SCM\) ([\d:.]+) นาที ท\s?ำไว้โดย (.+?) - (.+?) เมื่อ (\d{4}-\d\d-\d\d)', ln)
        if m: rec = dict(t=ntime(m[1]), n=m[2].strip(), tm=m[3].strip(), d=m[4]); continue
        hr = HYREL.match(ln)
        if hr:
            g = {k: v for k, v in hr.groupdict().items() if v}
            g['pl'] = int(g['pl']) if g.get('pl', '').isdigit() else None
            g['name'] = g['team'] + ' ' + g['rel']; g['fin'] = ntime(g['fin'])
            if g.get('rec') == '#': g['rec'] = 'NR'
            if g.get('pts'): g['pts'] = int(float(g['pts']))
            g['raw'] = ln; rows.append(g); last = g; continue
        if last and last.get('rel') and re.match(r'^1\) ', ln):
            last['swimmers'] = re.sub(r' [A-Z] (\d+)', r' (\1)', ln); continue
        r = OK.match(ln) or NO.match(ln) or OKR.match(ln) or NOR.match(ln)
        if r:
            g = {k: v for k, v in r.groupdict().items() if v}
            for k in ('pl', 'hpl', 'ht', 'ln', 'pts', 'cum', 'age'):
                if k in g: g[k] = int(g[k])
            g['fin'] = ntime(g['fin'])
            rm = re.match(r'^(.+?) ([A-D])$', g['name'])     # relay: "Team A"
            if 'age' not in g and rm: g['rel'] = rm[2]
            if 'team' not in g: g['team'] = re.sub(r' [A-D]$', '', g['name'])
            g['raw'] = ln; rows.append(g); last = g; continue
        if last and last.get('fin') in ('DQ', 'DNF') and 'reason' not in last and re.match(r'^\d+\.\d+ ', ln):
            last['reason'] = ln
    return ev, rows, L, rec

if __name__ == '__main__':
    res = {}
    for f in sorted(glob.glob('raw/results/*.pdf'), key=lambda f: int(re.findall(r'\d+', os.path.basename(f))[0])):
        n = int(re.findall(r'\d+', os.path.basename(f))[0])
        try:
            ev, rows, L, rec = parse(f)
        except Exception as e:
            print('fail', f, e); continue
        open(f[:-4] + '.txt', 'w').write('\n'.join(L))
        res[n] = {'ev': ev or n, 'rows': rows, 'rec': rec}
        print(n, 'rows', len(rows))
    json.dump(res, open('data/results.json', 'w'), ensure_ascii=False, indent=0)
