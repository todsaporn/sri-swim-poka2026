"""Download result PDFs (1_N.pdf) from cnxswimming.com and dump text for parsing.
Only re-downloads when the remote file changed (ETag/Last-Modified)."""
import json, os, sys, urllib.request, concurrent.futures as cf
BASE = 'https://www.cnxswimming.com/wp-content/uploads/2026/11/1_{}.pdf'
OUT = 'raw/results'; os.makedirs(OUT, exist_ok=True)
META = os.path.join(OUT, '_meta.json')
meta = json.load(open(META)) if os.path.exists(META) else {}
import datetime
# Only our team's events whose (our) heat has already started; already-downloaded ones are re-checked cheaply via ETag.
if sys.argv[1:]:
    events = [int(x) for x in sys.argv[1:]]
else:
    watch = json.load(open('data/watch.json')) if os.path.exists('data/watch.json') else {str(i): '' for i in range(1, 213)}
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime('%Y-%m-%dT%H:%M')
    # the meet often runs ahead of the printed program: also probe the next events after the latest result we have
    have = [int(k) for k in meta]
    ahead = max(have or [0]) + 12
    events = [int(k) for k, t in watch.items() if not t or t <= now or int(k) <= ahead]
print('checking events:', events)
UA = {'User-Agent': 'Mozilla/5.0 (sri-swim results bot)'}

def get(n):
    url = BASE.format(n)
    h = dict(UA); m = meta.get(str(n), {})
    if m.get('etag'): h['If-None-Match'] = m['etag']
    if m.get('lm'): h['If-Modified-Since'] = m['lm']
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=15) as r:
            body = r.read()
            if not body.startswith(b'%PDF'): return n, 'notpdf', None
            open(f'{OUT}/{n}.pdf', 'wb').write(body)
            return n, 'new', {'etag': r.headers.get('ETag'), 'lm': r.headers.get('Last-Modified'), 'bytes': len(body)}
    except urllib.error.HTTPError as e:
        return n, 'unchanged' if e.code == 304 else f'http{e.code}', None
    except Exception as e:
        return n, f'err:{e.__class__.__name__}', None

changed = []
with cf.ThreadPoolExecutor(24) as ex:
    for n, st, m in ex.map(get, events):
        if m: meta[str(n)] = m; changed.append(n)
json.dump(meta, open(META, 'w'), indent=0, sort_keys=True)
print('downloaded/changed:', changed)
print('available:', sorted(int(k) for k in meta))
