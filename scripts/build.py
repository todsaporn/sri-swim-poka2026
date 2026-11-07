"""Build site/index.html from startlists (+ results if present)."""
import json, re, collections, os, subprocess, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CFG = json.load(open('config.json'))
SRI = tuple(CFG['team_names'])
def is_sri(t): return bool(t) and (t in SRI or 'อรุโณ' in t or 'arunothai' in t.lower())
TH = {'IM':'เดี่ยวผสม','Freestyle':'ฟรีสไตล์','Breaststroke':'กบ','Backstroke':'กรรเชียง','Butterfly':'ผีเสื้อ',
      'Medley Relay 4X25':'ผลัดผสม 4x25','Freestyle Relay 4X25':'ผลัดฟรีสไตล์ 4x25'}
def secs(s):
    if not re.match(r'^(\d+:)?\d+\.\d\d$', s or ''): return None
    p = s.split(':'); return float(p[0])*60+float(p[1]) if len(p) == 2 else float(p[0])
def t24(t):
    h, m, ap = re.match(r'(\d+):(\d+) (AM|PM)', t).groups(); h = int(h) % 12 + (12 if ap == 'PM' else 0); return f'{h:02d}:{m}'
def fixteam(t): return {'ศวมอ':'ศว.ม.อ','ศวมอ . .':'ศว.ม.อ','ทบมหาราช':'ทบ4 มหาราช'}.get(t, t)
norm = lambda s: re.sub(r'[\s.]', '', s or '')

events, races, heats, total, teams = {}, [], {}, 0, set()
day_date = lambda n: CFG['days_meta'][str(n)]['date']
for day in CFG['days']:
    js = day['pdf'].replace('.pdf', '.json')
    if not os.path.exists(js) or os.path.getmtime(js) < os.path.getmtime(day['pdf']):
        subprocess.run([sys.executable, 'scripts/parse_startlist.py', day['pdf'], js], check=True)
    D = json.load(open(js)); E = {int(k): v for k, v in D['events'].items()}
    ents = [e for e in D['entries'] if e.get('team') or e.get('name')]
    total += len(ents); teams |= {e['team'] for e in ents if e.get('name')}
    byev = collections.defaultdict(list); byheat = collections.defaultdict(list)
    for e in ents: byev[e['ev']].append(e); byheat[(e['ev'], e['heat'])].append(e)
    for no, ev in E.items():
        seeded = [secs(x['seed']) for x in byev[no] if secs(x['seed'])]
        events[no] = dict(no=no, day=day['n'], g='M' if ev['gender'] == 'Boys' else 'F',
            age=ev['age'].replace(' Year Olds', '').replace('& Under', 'ปีและต่ำกว่า'), dist=ev['dist'],
            stroke=TH.get(ev['stroke'], ev['stroke']), relay='Relay' in ev['stroke'], n=len(byev[no]),
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
                f=r.get('fin'), pts=int(r['pts']) if r.get('pts') else 0, why=r.get('reason', ''), pod=r.get('pod', ''), lv=r.get('lvl', ''), nr=r.get('rec') == 'NR')
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
    evres[ev] = dict(nfin=len(fin), our=our, top=top)
# rule 16: ages 7-11 get medals per heat (last column), ages 12-14 per event place 1-3 (G/S/B column)
def medal_of(h, ev):
    age = int(re.match(r'\d+', ev['age'])[0]) if re.match(r'\d+', ev['age']) else 0
    if age >= 12 or ev['relay']: return {'G': 0, 'S': 1, 'B': 2}.get(h.get('pod'))
    return {'ทอง': 0, 'เงิน': 1, 'ทองแดง': 2}.get(h['lv'])
nres = 0
for r in races:
    er = evres.get(r['ev'])
    if not er: continue
    key = norm(r.get('name') or 'Sriarunothai SC ' + r['relay'])
    hit = next((o for o in er['our'] if norm(o['n']) == key), None)
    if not hit and r.get('relay'):
        hit = next((o for o in er['our'] if o['n'].strip().endswith(' ' + r['relay']) or o['n'].strip().endswith(r['relay'])), None)
    if hit:
        nres += 1
        r['res'] = dict(pl=hit['pl'], f=hit['f'], pts=hit['pts'], why=hit['why'], nfin=er['nfin'], lv=medal_of(hit, events[r['ev']]), nr=hit['nr'])
        s0, s1 = secs(r['seed']), secs(hit['f'])
        if s0 and s1: r['res']['d'] = round(s1 - s0, 2)
    else:
        r['res'] = dict(pending=True) if False else None
        if r['res'] is None: del r['res']
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
            if x.get('pod') in ('G', 'S', 'B'): t['gsb']['GSB'.index(x['pod'])] += 1
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
           evres={k: dict(nfin=v['nfin'], top=v['top']) for k, v in evres.items() if k in {r['ev'] for r in races}}, stand=stand, clubs=clubs,
           days=CFG['days_meta'], meet=dict(ts=_now.isoformat(timespec='seconds'), name=CFG['meet_name'], total=total, teams=len(teams), updated=now,
           results_url=CFG['results_url'], nres=nres, nevres=len(RES)))
os.makedirs('site', exist_ok=True)
json.dump(out, open('site/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
tpl = open('scripts/template.html').read()
open('site/index.html', 'w').write(tpl.replace('__DATA__', json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
import shutil
for f in os.listdir('scripts/static'): shutil.copy(os.path.join('scripts/static', f), os.path.join('site', f))
print(f'built: {len(races)} races, {nres} with results, {len(RES)} result PDFs, updated {now}')
