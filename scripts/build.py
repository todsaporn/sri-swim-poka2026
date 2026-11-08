"""Build site/index.html from startlists (+ results if present)."""
import json, re, collections, os, subprocess, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CFG = json.load(open('config.json'))
SRI = tuple(CFG['team_names'])
def is_sri(t): return bool(t) and (t in SRI or 'อรุโณ' in t or 'arunothai' in t.lower())
TH = {'IM':'เดี่ยวผสม','Freestyle':'ฟรีสไตล์','Breaststroke':'กบ','Backstroke':'กรรเชียง','Butterfly':'ผีเสื้อ',
      'Medley Relay 4X25':'ผลัดผสม 4x25','Freestyle Relay 4X25':'ผลัดฟรีสไตล์ 4x25'}
def stroke_th(st):
    k = re.sub(r'\s+', '', st).lower()
    if 'relay' in k: return 'ผลัดผสม 4x25' if 'medley' in k else 'ผลัดฟรีสไตล์ 4x25'
    for en, th in (('butterfly', 'ผีเสื้อ'), ('backstroke', 'กรรเชียง'), ('breaststroke', 'กบ'), ('freestyle', 'ฟรีสไตล์'), ('im', 'เดี่ยวผสม')):
        if k == en: return th
    return TH.get(st, st)
def secs(s):
    if not re.match(r'^(\d+:)?\d+\.\d\d$', s or ''): return None
    p = s.split(':'); return float(p[0])*60+float(p[1]) if len(p) == 2 else float(p[0])
def t24(t):
    h, m, ap = re.match(r'(\d+):(\d+) (AM|PM)', t).groups(); h = int(h) % 12 + (12 if ap == 'PM' else 0); return f'{h:02d}:{m}'
def fixteam(t): return {'ศวมอ':'ศว.ม.อ','ศวมอ . .':'ศว.ม.อ','ทบมหาราช':'ทบ4 มหาราช'}.get(t, t)
norm = lambda s: re.sub(r'[\s.\u200b]', '', s or '')

events, races, heats, total, teams = {}, [], {}, 0, set()
ALL_ENTS = []
day_date = lambda n: CFG['days_meta'][str(n)]['date']
for day in CFG['days']:
    js = day['pdf'].replace('.pdf', '.json')
    if not os.path.exists(js) or os.path.getmtime(js) < os.path.getmtime(day['pdf']):
        subprocess.run([sys.executable, 'scripts/parse_startlist.py', day['pdf'], js], check=True)
    D = json.load(open(js)); E = {int(k): v for k, v in D['events'].items()}
    ents = [e for e in D['entries'] if e.get('team') or e.get('name')]
    ALL_ENTS.extend(dict(e, day=day['n']) for e in ents if e.get('name'))
    total += len(ents); teams |= {e['team'] for e in ents if e.get('name')}
    byev = collections.defaultdict(list); byheat = collections.defaultdict(list)
    for e in ents: byev[e['ev']].append(e); byheat[(e['ev'], e['heat'])].append(e)
    for no, ev in E.items():
        seeded = [secs(x['seed']) for x in byev[no] if secs(x['seed'])]
        events[no] = dict(no=no, day=day['n'], g='M' if ev['gender'] == 'Boys' else 'F',
            age=ev['age'].replace(' Year Olds', '').replace('& Under', 'ปีและต่ำกว่า'), dist=ev['dist'],
            stroke=stroke_th(ev['stroke']), relay='Relay' in ev['stroke'], n=len(byev[no]),
            heats=max([x['heats'] for x in byev[no]] or [0]), seeded=len(seeded),
            rec=ev.get('rec'),
            last=day_date(day['n']) + 'T' + max([t24(x['time']) for x in byev[no]] or ['23:59']))
    for e in ents:
        if e.get('team') not in SRI: continue
        s = secs(e['seed'])
        rank = 1 + sum(1 for x in byev[e['ev']] if secs(x['seed']) and secs(x['seed']) < s) if s else None
        r = dict(ev=e['ev'], day=day['n'], heat=e['heat'], lane=e['lane'], t=t24(e['time']), seed=e['seed'], rank=rank)
        if 'relay' in e: r['relay'] = e['relay']
        else: r['name'] = e['name']; r['age'] = int(e['age'])
        races.append(r)
        k = f"{e['ev']}-{e['heat']}"
        heats[k] = [dict(l=x['lane'], n=x.get('name') or (x['team'] + ' ' + x['relay']), tm=fixteam(x['team']) if x.get('name') else '',
                         a=x.get('age', ''), s=x['seed'], me=x['team'] in SRI) for x in sorted(byheat[(e['ev'], e['heat'])], key=lambda x: x['lane'])]

# ---- results
RES = json.load(open('data/results.json')) if os.path.exists('data/results.json') else {}
evres = {}
for k, v in RES.items():
    ev = v.get('ev') or int(k)
    rows = v['rows']
    fin = [r for r in rows if r.get('pl')]
    our = [dict(pl=r.get('pl'), n=r.get('name') or (r['team'] + ' ' + r.get('rel', '')), tm=fixteam(r.get('team', '')),
                f=r.get('fin'), pts=int(r['pts']) if r.get('pts') else 0, why=r.get('reason', ''), pod=r.get('pod', ''), lv=r.get('lvl', ''), nr=r.get('rec') == 'NR', hpl=r.get('hpl'), ht=r.get('ht'))
           for r in rows if is_sri(r.get('team')) or is_sri(r.get('name'))]
    top = [dict(pl=r['pl'], n=r.get('name') or (r['team'] + ' ' + r.get('rel', '')), tm=fixteam(r.get('team', '')), f=r.get('fin'),
                me=is_sri(r.get('team')), nr=r.get('rec') == 'NR') for r in sorted(fin, key=lambda r: r['pl'])[:3]]
    nr = [r for r in fin if r.get('rec') == 'NR']
    if ev in events:
        if v.get('rec'): events[ev]['rec'] = dict(v['rec'])
        if nr:
            b = min(nr, key=lambda r: secs(r['fin']) or 1e9)
            events[ev]['rec'] = dict(t=b['fin'], n=b.get('name', ''), tm=fixteam(b.get('team', '')), d=CFG['days_meta'][str(events[ev]['day'])]['date'],
                                     new=True, me=is_sri(b.get('team')), old=(v.get('rec') or {}).get('t'))
    srt = sorted(fin, key=lambda r: r['pl'])
    evres[ev] = dict(nfin=len(fin), our=our, top=top, c6=next((r['fin'] for r in srt if r['pl'] >= 6), None) if len(srt) >= 6 else None)
# rule 16: ages 7-11 get medals per heat (last column), ages 12-14 per event place 1-3 (G/S/B column)
def medal_of(h, ev):
    age = int(re.match(r'\d+', ev['age'])[0]) if re.match(r'\d+', ev['age']) else 0
    if ev['relay']: return (h['pl'] - 1) if h.get('pl') and h['pl'] <= 3 else None
    if age >= 12: return {'G': 0, 'S': 1, 'B': 2}.get(h.get('pod'))
    return {'ทอง': 0, 'เงิน': 1, 'ทองแดง': 2}.get(h['lv'])
nres = 0
qa_unmatched = []
for r in races:
    er = evres.get(r['ev'])
    if not er: continue
    key = norm(r.get('name') or 'Sriarunothai SC ' + r['relay'])
    hit = next((o for o in er['our'] if norm(o['n']) == key), None)
    if not hit and r.get('relay'):
        hit = next((o for o in er['our'] if o['n'].strip().endswith(' ' + r['relay']) or o['n'].strip().endswith(r['relay'])), None)
    if hit:
        nres += 1
        r['res'] = dict(pl=hit['pl'], f=hit['f'], pts=hit['pts'], why=hit['why'], nfin=er['nfin'], lv=medal_of(hit, events[r['ev']]), nr=hit['nr'], hpl=hit.get('hpl'), ht=hit.get('ht'))
        s0, s1 = secs(r['seed']), secs(hit['f'])
        if s0 and s1: r['res']['d'] = round(s1 - s0, 2)
    else:
        r['res'] = dict(pending=True) if False else None
        if r['res'] is None: del r['res']
        if er['our'] and r['ev'] in evres: pass
# events to watch: all individual events in categories (gender+age) where we have a swimmer -> needed for
# cumulative-points trophy standings; plus our relay events. Checked once the event's last heat has started.
cats = {(events[r['ev']]['g'], events[r['ev']]['age']) for r in races if not r.get('relay')}
# club standings need every individual event, so watch them all (ETag keeps re-checks cheap)
watch = {no: e['last'] for no, e in events.items() if not e['relay']}
for r in races:
    if r.get('relay'): watch[r['ev']] = events[r['ev']]['last']
json.dump({str(k): v for k, v in sorted(watch.items())}, open('data/watch.json', 'w'), indent=0)

# ---- cumulative points standings per category (trophy race)
stand = {}
for (g, age) in sorted(cats):
    evs = [no for no, e in events.items() if not e['relay'] and e['g'] == g and e['age'] == age]
    tot = {}
    done = 0
    for no in evs:
        rr = RES.get(str(no))
        if not rr: continue
        done += 1
        for x in rr['rows']:
            if not x.get('name'): continue
            k = norm(x['name'])
            t = tot.setdefault(k, dict(n=x['name'], tm=fixteam(x.get('team', '')), p=0, me=is_sri(x.get('team')), ev=0, gsb=[0, 0, 0]))
            t['p'] += int(x.get('pts') or 0); t['ev'] += 1
            if x.get('cum') is not None: t['cum'] = max(t.get('cum', 0), int(x['cum']))  # official cumulative printed on the sheet
            if x.get('pod') in ('G', 'S', 'B'): t['gsb']['GSB'.index(x['pod'])] += 1
    for t in tot.values():
        if t.get('cum') is not None: t['p'] = max(t['p'], t['cum'])   # trust the official 'สะสม' column
    # rules: rank by points, tie -> gold, silver, bronze (event places 1-3)
    key_ = lambda t: (-t['p'], -t['gsb'][0], -t['gsb'][1], -t['gsb'][2])
    rows = sorted([t for t in tot.values() if t['p'] > 0 or t['me']], key=key_)
    rk, prev = 0, None
    for i, t in enumerate(rows):
        if key_(t) != prev: rk, prev = i + 1, key_(t)
        t['rk'] = rk if t['p'] > 0 else None
    key = f"{g}|{age}"
    stand[key] = dict(g=g, age=age, nev=len(evs), done=done,
                      top=[dict(rk=t['rk'], n=t['n'], tm=t['tm'], p=t['p'], me=t['me'], gsb=t['gsb']) for t in rows if t['p'] > 0][:8],
                      our={norm(t['n']): dict(rk=t['rk'], p=t['p']) for t in rows if t['me']})
    # ---- what can still happen: remaining individual events per athlete in this category
    PT = [15, 7, 5, 3, 2, 1]
    rem = {}; who = {}
    for e in ALL_ENTS:
        ev_ = events.get(e['ev'])
        if not ev_ or ev_['relay'] or ev_['g'] != g or ev_['age'] != age or str(e['ev']) in RES: continue
        k = norm(e['name']); who[k] = (e['name'], fixteam(e['team']), is_sri(e['team']))
        rem.setdefault(k, []).append(dict(ev=e['ev'], d=e['day'], t=t24(e['time']), lbl=f"{ev_['dist']}ม. {ev_['stroke']}"))
    allp = {norm(t['n']): t for t in rows}
    for k, (n, tm, me) in who.items():
        if k not in allp: allp[k] = dict(n=n, tm=tm, p=0, me=me, gsb=[0, 0, 0])
    left = {k: len(rem.get(k, [])) for k in allp}
    stand[key]['left'] = {norm(t['n']): left.get(norm(t['n']), 0) for t in stand[key]['top']}
    def place_for(need):
        if need <= 0: return 'เสมอ/ดูเหรียญ'
        if need > 15: return f'ได้ที่ 1 อย่างน้อย {-(-need // 15)} รายการ'
        pl = max(i + 1 for i, v in enumerate(PT) if v >= need); return 'ได้ที่ 1' if pl == 1 else f'ติดท็อป {pl}'
    risk = {}
    for k, o in stand[key]['our'].items():
        me = allp.get(k)
        if not me: continue
        pA, kA = me['p'], left.get(k, 0)
        kme = key_(me) if me['p'] > 0 else (0, 0, 0, 0)
        above = [t for kk, t in allp.items() if kk != k and t['p'] > 0 and key_(t) < kme]
        threats = []
        for kk, t in allp.items():
            if kk == k or t in above: continue
            mx = t['p'] + 15 * left.get(kk, 0)
            if left.get(kk, 0) and (mx > pA or (mx == pA and pA > 0)):
                threats.append(dict(n=t['n'], tm=t['tm'], p=t['p'], left=left[kk], mx=mx, need=place_for(pA - t['p']),
                                    ev=[x['ev'] for x in rem.get(kk, [])]))
        catch = [t for t in above if t['p'] < pA + 15 * kA or (t['p'] == pA + 15 * kA)]
        worst = len(above) + len(threats) + 1
        best = len(above) - len(catch) + 1
        rk = o['rk'] or 999
        status = 'lock' if worst <= 6 else ('risk' if rk <= 6 else ('chance' if best <= 6 else 'out'))
        mine_ev = rem.get(k, [])
        key_ev = []
        for x in mine_ev:
            vs = [t['n'] for t in threats if x['ev'] in t['ev']]
            key_ev.append(dict(x, vs=vs))
        for t in threats:
            for e_ in rem.get(norm(t['n']), []):
                if e_['ev'] not in [y['ev'] for y in key_ev]: key_ev.append(dict(e_, vs=[t['n']], notme=True))
                elif t['n'] not in next(y for y in key_ev if y['ev'] == e_['ev'])['vs']: next(y for y in key_ev if y['ev'] == e_['ev'])['vs'].append(t['n'])
        key_ev.sort(key=lambda x: (x['d'], x['t']))
        sixth = sorted([t for t in allp.values() if t['p'] > 0], key=key_)[5:6]
        risk[k] = dict(status=status, worst=worst, best=best, left=kA, mx=pA + 15 * kA,
                       threats=sorted(threats, key=lambda t: -t['mx'])[:6], keyev=key_ev[:8],
                       need6=(place_for(sixth[0]['p'] - pA) + (' (คะแนนเท่ากันวัดจำนวนเหรียญ)' if sixth[0]['p'] - pA in PT else '') if sixth and rk > 6 else None), p6=(sixth[0]['p'] if sixth else 0))
    stand[key]['risk'] = risk
# ---- data quality checks
raced = {(r['ev'], norm(r.get('name') or 'Sriarunothai SC ' + r.get('relay', ''))) for r in races}
for ev, er in evres.items():
    for o in er['our']:
        k = norm(o['n'])
        if not any(e == ev and (k == n or (o['n'].strip()[-1:] in 'ABCD' and n.startswith('SriarunothaiSC'))) for e, n in raced):
            qa_unmatched.append(dict(ev=ev, n=o['n']))
qa = dict(unparsed=[dict(ev=int(k), l=l) for k, v in RES.items() for l in v.get('unparsed', [])],
          unmatched=[x for x in qa_unmatched if not x['n'].startswith('Sriarunothai')])
# ---- schedule drift: results print time vs. program end of the event (last heat start + 3 min).
# Median of the latest 3 events of each day -> estimated real start of upcoming races.
def _m(iso): return int(iso[11:13]) * 60 + int(iso[14:16])
drift = {}
for d in {e['day'] for e in events.values()}:
    pts = []
    for k, v in RES.items():
        no = int(k); e = events.get(no)
        if not e or e['day'] != d or not v.get('printed') or v['printed'][:10] != e['last'][:10]: continue
        pts.append((no, _m(v['printed']) - (_m(e['last']) + 3), v['printed']))
    pts.sort()
    if pts:
        last3 = sorted(x[1] for x in pts[-3:])
        drift[d] = dict(off=last3[len(last3) // 2], ev=pts[-1][0], at=pts[-1][2][11:])
# ---- club standings (individual events only, per meet rules)
club = {}
for no, e in events.items():
    if e['relay']: continue
    rr = RES.get(str(no))
    if not rr: continue
    for x in rr['rows']:
        t = fixteam(x.get('team', ''))
        if not t: continue
        c = club.setdefault(t, dict(n=t, p=0, me=is_sri(t)))
        c['p'] += int(x.get('pts') or 0)
crow = sorted(club.values(), key=lambda c: -c['p'])
rk, prev = 0, None
for i, c in enumerate(crow):
    if c['p'] != prev: rk, prev = i + 1, c['p']
    c['rk'] = rk
clubs = dict(n=len(crow), done=sum(1 for no, e in events.items() if not e['relay'] and str(no) in RES),
             nev=sum(1 for e in events.values() if not e['relay']), top=crow[:5], our=next((c for c in crow if c['me']), None))
_now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
now = _now.strftime('%d/%m %H:%M')
out = dict(events={k: v for k, v in events.items() if k in {r['ev'] for r in races}}, races=races, heats=heats,
           evres={k: dict(nfin=v['nfin'], top=v['top'], c6=v.get('c6')) for k, v in evres.items() if k in {r['ev'] for r in races}}, stand=stand, clubs=clubs, drift=drift, qa=qa, lastres={d: max([int(k) for k in RES if int(k) in events and events[int(k)]['day'] == d] or [0]) for d in {e['day'] for e in events.values()}},
           days=CFG['days_meta'], cloud=CFG.get('photo_cloud'), meet=dict(ts=_now.isoformat(timespec='seconds'), name=CFG['meet_name'], total=total, teams=len(teams), updated=now,
           results_url=CFG['results_url'], pdf_tpl='https://www.cnxswimming.com/wp-content/uploads/2026/11/1_{}.pdf', resev=sorted(int(k) for k in RES), nres=nres, nevres=len(RES)))
os.makedirs('site', exist_ok=True)
json.dump(out, open('site/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
tpl = open('scripts/template.html').read()
open('site/index.html', 'w').write(tpl.replace('__DATA__', json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
open('site/team.html', 'w').write(open('scripts/team.html').read().replace('__DATA__', json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
open('site/summary.html', 'w').write(open('scripts/summary.html').read().replace('__DATA__', json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
import shutil
for f in os.listdir('scripts/static'): shutil.copy(os.path.join('scripts/static', f), os.path.join('site', f))
print(f'built: {len(races)} races, {nres} with results, {len(RES)} result PDFs, updated {now}')
