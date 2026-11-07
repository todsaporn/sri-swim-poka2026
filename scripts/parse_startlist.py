import fitz, re, json, sys, collections, warnings
warnings.filterwarnings('ignore')
d = fitz.open(sys.argv[1])
def clean(t):
    t = t.replace('ํŖา','้ำ').replace('Ŗ','้').replace('ϐ','f').replace('ŕ','่').replace('ř','์')
    t = t.replace('ํ้า','้ำ').replace('ํา','ำ')
    t = re.sub(r'\s+',' ',t).strip()
    t = re.sub(r' ([\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])', r'\1', t)
    return t.replace('ํ้า','้ำ').replace('ํา','ำ')
items=[]
seq=0
for pn,p in enumerate(d):
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines',[]):
            spans=l['spans']
            for s in spans:
                seq+=1
                if not s['text']: continue
                x0,y0,x1,y1=s['bbox']
                col = 0 if x0 < 297 else 1
                items.append(dict(pg=pn, col=col, x=x0-(0 if col==0 else 292), y=(y0+y1)/2, t=s['text'], size=s['size'], seq=seq))
# group into lines: by pg,col then y tolerance
items.sort(key=lambda i:(i['pg'],i['col'],i['y'],i['x']))
lines=[]
for it in items:
    if lines and lines[-1]['pg']==it['pg'] and lines[-1]['col']==it['col'] and abs(lines[-1]['y']-it['y'])<3.2:
        lines[-1]['its'].append(it)
    else:
        lines.append(dict(pg=it['pg'],col=it['col'],y=it['y'],its=[it]))
ev=None; heat=None; out=[]; events={}
for L in lines:
    its=sorted(L['its'],key=lambda i:i['x'])
    full=clean(' '.join(i['t'] for i in its))
    m=re.match(r'Event (\d+) (Boys|Girls) (.+?) (\d+) SC Meter (.+)$',full)
    if m:
        ev=dict(no=int(m[1]),gender=m[2],age=m[3],dist=int(m[4]),stroke=m[5]); events[ev['no']]=ev; heat=None; continue
    m=re.match(r'Heat (\d+) of (\d+) Finals Starts at (.+)$',full)
    if m:
        heat=dict(h=int(m[1]),of=int(m[2]),time=m[3]); continue
    if not ev or not heat: continue
    if full.startswith(('Lane','R4SCM','CNX','HY-TEK','Krabi','Meet')): continue
    relay='Relay' in ev['stroke']
    its=[i for i in its if i['t'].strip() or i['x']<140]
    lane=[i for i in its if i['x']<38 and re.fullmatch(r'\d',i['t'].strip())]
    if not lane: 
        continue
    lane=int(lane[0]['t'])
    rest=[i for i in its if i['x']>=38]
    if not rest: continue
    if relay:
        txt=clean(' '.join(i['t'] for i in rest))
        if set(txt)<=set('_ '): continue
        mm=re.match(r'(.+?) ([A-Z]) (NT|[\d:.]+) ?_*$',txt)
        if not mm: print('RELAY?',txt,file=sys.stderr); continue
        out.append(dict(ev=ev['no'],heat=heat['h'],heats=heat['of'],time=heat['time'],lane=lane,team=mm[1],relay=mm[2],seed=mm[3]))
    else:
        name=clean(''.join(i['t'] for i in sorted([i for i in rest if i['x']<140],key=lambda i:i['seq'])))
        age=clean(' '.join(i['t'] for i in rest if 140<=i['x']<158))
        team=clean(''.join(i['t'] for i in sorted([i for i in rest if 158<=i['x']<225 and not re.fullmatch(r'\s*(NT|[\d:.]+)\s*',i['t'])],key=lambda i:i['seq'])))
        seed=clean(' '.join(i['t'] for i in rest if re.fullmatch(r'\s*(NT|NS|[\d:]*\d+\.\d\d)\s*',i['t'])))
        name=re.sub(r' [A-Z]$','',name)
        out.append(dict(ev=ev['no'],heat=heat['h'],heats=heat['of'],time=heat['time'],lane=lane,name=name,age=age,team=team,seed=seed))
json.dump(dict(events=events,entries=out),open(sys.argv[2],'w'),ensure_ascii=False,indent=0)
print(sys.argv[1],len(out),'entries',len(events),'events')
