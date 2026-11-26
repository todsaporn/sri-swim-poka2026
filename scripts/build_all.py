"""Build every meet into site/<slug>/ and write the root entry point (redirects to the current meet).

Usage: python scripts/build_all.py            -> build all meets listed in meets/meets.json
       MEETS=surat2026 python scripts/build_all.py -> rebuild only those meets (others keep their last build)
"""
import json, os, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = json.load(open(os.path.join(ROOT, 'meets', 'meets.json')))
only = [m for m in os.environ.get('MEETS', '').split(',') if m]
SITE = os.path.join(ROOT, 'site')
os.makedirs(SITE, exist_ok=True)

for m in CONF['list']:
    if only and m['slug'] not in only and os.path.exists(os.path.join(SITE, m['slug'], 'index.html')):
        continue
    subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build.py')], check=True, env=dict(os.environ, MEET=m['slug']))

cur = CONF['current']
links = ''.join(f'<li><a href="./{m["slug"]}/">{m["name"]}</a> <small>{m["dates"]}</small></li>' for m in CONF['list'])
redirect = f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ศรีอรุโณทัย · ทีมว่ายน้ำ SSC</title>
<link rel="manifest" href="manifest.webmanifest"><link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="theme-color" content="#0b4f8a">
<script>location.replace('./{cur}/' + (location.pathname.endsWith('.html') && !location.pathname.endsWith('index.html') ? location.pathname.split('/').pop() : '') + location.search + location.hash)</script>
<style>body{{font-family:system-ui,sans-serif;padding:24px;color:#0b2a4a}}a{{color:#0b4f8a;font-weight:700}}li{{margin:8px 0}}</style>
</head><body><h3>ทีมว่ายน้ำศรีอรุโณทัย</h3><ul>{links}</ul>
<script>if('serviceWorker' in navigator&&location.protocol==='https:'){{navigator.serviceWorker.register('sw.js').catch(()=>{{}})}}</script>
</body></html>"""
# pages opened before the split poll ./data.json and reload themselves when meet.ts is newer -> keep a stub here
import datetime
ts = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(timespec='seconds')
json.dump({'meet': {'ts': ts, 'moved': cur}}, open(os.path.join(SITE, 'data.json'), 'w'))
for name in ('index.html', 'summary.html', 'team.html'):
    open(os.path.join(SITE, name), 'w').write(redirect)
# root PWA bits (apps installed before the split have the root as start_url and a root-scoped service worker)
for f in ('sw.js', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.png', 'logo.png'):
    src = os.path.join(ROOT, 'scripts', 'static', f)
    if os.path.exists(src): shutil.copy(src, os.path.join(SITE, f))
print('root ->', cur)
