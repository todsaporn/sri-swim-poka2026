"""Build site/index.html from startlists (+ results if present)."""
import json, re, collections, os, subprocess, sys, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
CFG = json.load(open('config.json'))
SRI = tuple(CFG['team_names'])
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
            heats=max([x['heats'] for x in byev[no]] or [0]), seeded=len(seeded))
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
                f=r.get('fin'), pts=int(r['pts']) if r.get('pts') else 0, why=r.get('reason', ''))
           for r in rows if r.get('team') in SRI]
    top = [dict(pl=r['pl'], n=r.get('name') or (r['team'] + ' ' + r.get('rel', '')), tm=fixteam(r.get('team', '')), f=r.get('fin'),
                me=r.get('team') in SRI) for r in sorted(fin, key=lambda r: r['pl'])[:3]]
    evres[ev] = dict(nfin=len(fin), our=our, top=top)
nres = 0
for r in races:
    er = evres.get(r['ev'])
    if not er: continue
    key = norm(r.get('name') or 'Sriarunothai SC ' + r['relay'])
    hit = next((o for o in er['our'] if norm(o['n']) == key), None)
    if not hit and r.get('relay'):
        hit = next((o for o in er['our'] if o['n'].strip().endswith(' ' + r['relay'])), None)
    if hit:
        nres += 1
        r['res'] = dict(pl=hit['pl'], f=hit['f'], pts=hit['pts'], why=hit['why'], nfin=er['nfin'])
        s0, s1 = secs(r['seed']), secs(hit['f'])
        if s0 and s1: r['res']['d'] = round(s1 - s0, 2)
    else:
        r['res'] = dict(pending=True) if False else None
        if r['res'] is None: del r['res']
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime('%d/%m %H:%M')
out = dict(events={k: v for k, v in events.items() if k in {r['ev'] for r in races}}, races=races, heats=heats,
           evres={k: dict(nfin=v['nfin'], top=v['top']) for k, v in evres.items() if k in {r['ev'] for r in races}},
           days=CFG['days_meta'], meet=dict(name=CFG['meet_name'], total=total, teams=len(teams), updated=now,
           results_url=CFG['results_url'], nres=nres, nevres=len(RES)))
os.makedirs('site', exist_ok=True)
json.dump(out, open('site/data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
tpl = open('scripts/template.html').read()
open('site/index.html', 'w').write(tpl.replace('__DATA__', json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
print(f'built: {len(races)} races, {nres} with results, {len(RES)} result PDFs, updated {now}')
