// network-first, bypassing the HTTP cache (GitHub Pages sends max-age=600) so results are always fresh online;
// cached copy is only used when offline.
const C = 'sri-swim-v26';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const key = u.origin + u.pathname;
  e.respondWith(fetch(u.href, {cache: 'no-store', credentials: 'same-origin'}).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(key, cp)); }
    return r;
  }).catch(() => caches.match(key)));
});
