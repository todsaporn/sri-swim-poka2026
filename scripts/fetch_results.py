"""Download result PDFs (1_N.pdf) from cnxswimming.com and dump text for parsing.
Only re-downloads when the remote file changed (ETag/Last-Modified)."""
import json, os, sys, urllib.request, concurrent.futures as cf
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEET = os.environ.get('MEET') or (sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].isdigit() else 'poka2026')
MD = os.path.join(ROOT, 'meets', MEET); os.chdir(MD)
CFG = json.load(open('config.json'))
# result PDF URL patterns, tried in order (the organiser's upload folder follows the upload month)
TPLS = CFG.get('pdf_tpls') or ['https://www.cnxswimming.com/wp-content/uploads/2026/11/1_{}.pdf']
OUT = 'raw/results'; os.makedirs(OUT, exist_ok=True)
META = os.path.join(OUT, '_meta.json')
meta = json.load(open(META)) if os.path.exists(META) else {}
import datetime
# Only our team's events whose (our) heat has already started; already-downloaded ones are re-checked cheaply via ETag.
NUMS = [int(x) for x in sys.argv[1:] if x.isdigit()]
if NUMS:
    events = NUMS
else:
    watch = json.load(open('data/watch.json')) if os.path.exists('data/watch.json') else {}
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).strftime('%Y-%m-%dT%H:%M')
    # the meet often runs ahead of the printed program: also probe the next events after the latest result we have
    have = [int(k) for k in meta]
    ahead = max(have or [0]) + 12
    events = [int(k) for k, t in watch.items() if not t or t <= now or int(k) <= ahead]
print('checking events:', events)
UA = {'User-Agent': 'Mozilla/5.0 (sri-swim results bot)'}

def get(n):
    m = meta.get(str(n), {})
    tpls = [m['url']] if m.get('url') else TPLS
    last = None
    for url in tpls:
        url = url.format(n) if '{}' in url else url
        h = dict(UA)
        if m.get('etag'): h['If-None-Match'] = m['etag']
        if m.get('lm'): h['If-Modified-Since'] = m['lm']
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=15) as r:
                body = r.read()
                if not body.startswith(b'%PDF'): last = 'notpdf'; continue
                open(f'{OUT}/{n}.pdf', 'wb').write(body)
                return n, 'new', {'etag': r.headers.get('ETag'), 'lm': r.headers.get('Last-Modified'), 'bytes': len(body), 'url': url}
        except urllib.error.HTTPError as e:
            if e.code == 304: return n, 'unchanged', None
            last = f'http{e.code}'
        except Exception as e:
            last = f'err:{e.__class__.__name__}'
    return n, last, None

changed = []
with cf.ThreadPoolExecutor(24) as ex:
    for n, st, m in ex.map(get, events):
        if m: meta[str(n)] = m; changed.append(n)
json.dump(meta, open(META, 'w'), indent=0, sort_keys=True)
print('downloaded/changed:', changed)
print('available:', sorted(int(k) for k in meta))
