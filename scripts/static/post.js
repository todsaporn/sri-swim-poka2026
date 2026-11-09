// Facebook congratulation post: class + full-body photo (shared via Supabase athlete_info), form UI, canvas renderer.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nrm = s => String(s).replace(/[\s.​]/g, '');
  const CL = () => (typeof DATA !== 'undefined' && DATA.cloud && DATA.cloud.url) ? DATA.cloud : null;
  const hdr = c => ({ apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' });
  const DEFo = () => (typeof DATA !== 'undefined' && DATA.info) || {};
  const CLS = {};          // name -> class from cloud ('' = cleared)
  const POST = {};         // name -> dataURL (cloud or local)
  const POSTT = {};        // name -> cloud updated_at of POST
  let cloud = null;        // null unknown, true table ok, false missing/offline
  const OPTS = {};         // name -> {layout:'full'|'center', only:'all'|'medal'}
  let optsCloud = false;

  // ---------- local fallback ----------
  const LS = 'sri-info';
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch (e) { return {} } };
  const lsSet = o => { try { localStorage.setItem(LS, JSON.stringify(o)) } catch (e) { } };
  let idb = null;
  function openDB() {
    return new Promise(res => {
      try { const r = indexedDB.open('sri-post', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => res(null) } catch (e) { res(null) }
    });
  }
  async function idbGet(k) { idb = idb || await openDB(); if (!idb) return null; return new Promise(res => { try { const q = idb.transaction('p').objectStore('p').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null) } catch (e) { res(null) } }) }
  async function idbPut(k, v) { idb = idb || await openDB(); if (!idb) return; try { const s = idb.transaction('p', 'readwrite').objectStore('p'); v ? s.put(v, k) : s.delete(k) } catch (e) { } }

  async function sync() {
    const c = CL(); if (!c) { cloud = false; return }
    try {
      let r = await fetch(c.url + '/rest/v1/athlete_info?select=athlete,cls,opts,updated_at', { headers: hdr(c), cache: 'no-store' });
      optsCloud = r.ok;
      if (!r.ok) r = await fetch(c.url + '/rest/v1/athlete_info?select=athlete,cls,updated_at', { headers: hdr(c), cache: 'no-store' });
      if (!r.ok) throw 0;
      (await r.json()).forEach(x => { if (x.cls !== null) CLS[x.athlete] = x.cls; if (x.opts) OPTS[x.athlete] = x.opts; if (POSTT[x.athlete] && POSTT[x.athlete] !== x.updated_at) delete POST[x.athlete] });
      cloud = true;
    } catch (e) { cloud = false }
  }
  // push anything saved only on this device (while the cloud was unreachable) up to the shared store
  let pushing = false;
  async function pushLocal() {
    if (!cloud || pushing) return; pushing = true;
    try {
      const l = lsGet(); let ch = false;
      for (const n of Object.keys(l)) {
        const e = l[n];
        if ('cls' in e) { try { await rpc('set_class', { p_athlete: n, p_cls: e.cls }); CLS[n] = e.cls; delete e.cls; ch = true } catch (er) { } }
        if (e.opts && optsCloud) { try { await rpc('set_post_opts', { p_athlete: n, p_opts: e.opts }); OPTS[n] = e.opts; delete e.opts; ch = true } catch (er) { } }
        if (!Object.keys(e).length) delete l[n];
      }
      if (ch) lsSet(l);
      idb = idb || await openDB();
      if (idb) {
        const keys = await new Promise(res => { try { const q = idb.transaction('p').objectStore('p').getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]) } catch (er) { res([]) } });
        for (const n of keys) { const v = await idbGet(n); if (!v) continue; try { await rpc('set_post_photo', { p_athlete: n, p_img: v }); await idbPut(n, null); POST[n] = v } catch (er) { } }
      }
    } finally { pushing = false }
  }
  // DATA is declared by the page's inline script, which runs after this file: sync once the DOM is ready
  const ready = new Promise(res => { const go = () => sync().then(() => { pushLocal(); res() }, res); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : setTimeout(go, 0) });
  setInterval(() => sync(), 120000);

  function clsOf(n) { if (n in CLS) return CLS[n]; const l = lsGet()[n]; if (l && 'cls' in l) return l.cls; return (DEFo()[n] || {}).cls || '' }
  const dispName = n => (DEFo()[n] || {}).nm || n;
  async function postOf(n) {
    if (POST[n] !== undefined) return POST[n];
    await ready;
    const c = CL();
    if (cloud && c) {
      try { const r = await fetch(c.url + '/rest/v1/athlete_info?select=post_img,updated_at&athlete=eq.' + encodeURIComponent(n), { headers: hdr(c), cache: 'no-store' });
        const j = r.ok ? await r.json() : []; if (j[0] && j[0].post_img) { POST[n] = j[0].post_img; POSTT[n] = j[0].updated_at; return POST[n] } } catch (e) { }
    }
    POST[n] = await idbGet(n); return POST[n];
  }
  async function rpc(fn, body) { const c = CL(); const r = await fetch(c.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: hdr(c), body: JSON.stringify(body) }); if (!r.ok) throw new Error(r.status) }
  async function saveCls(n, v) {
    v = v.trim(); if (v === clsOf(n)) return true;
    if (cloud) { try { await rpc('set_class', { p_athlete: n, p_cls: v }); CLS[n] = v; return true } catch (e) { } }
    const o = lsGet(); o[n] = Object.assign(o[n] || {}, { cls: v }); lsSet(o); return false;
  }
  async function savePost(n, url) {
    POST[n] = url || null; delete POSTT[n];
    if (cloud) { try { await rpc('set_post_photo', { p_athlete: n, p_img: url || null }); return true } catch (e) { } }
    await idbPut(n, url || null); return false;
  }

  function optsOf(n) { return Object.assign({}, (lsGet()[n] || {}).opts || {}, OPTS[n] || {}) }
  async function saveOpts(n, o) {
    OPTS[n] = o;
    if (cloud && optsCloud) { try { await rpc('set_post_opts', { p_athlete: n, p_opts: o }); return true } catch (e) { } }
    const l = lsGet(); l[n] = Object.assign(l[n] || {}, { opts: o }); lsSet(l); return false;
  }

  // ---------- data ----------
  const G = { M: 'ชาย', F: 'หญิง' }, LV = ['เหรียญทอง', 'เหรียญเงิน', 'เหรียญทองแดง'];
  const ageL = a => /ปี/.test(a) ? a : a + ' ปี';
  const evName = e => e.relay ? `${e.stroke.replace(/\s*4x25$/, '')} 4x25 เมตร` : `${e.stroke} ${e.dist} เมตร`;
  function gather(n) {
    const EV = DATA.events, R = DATA.races;
    const ind = R.filter(r => r.name === n && !EV[r.ev].relay), rel = R.filter(r => EV[r.ev].relay && r.res && (r.res.sw || []).includes(n));
    const e0 = EV[ind[0].ev], g = e0.g, cat = g + '|' + e0.age;
    const st = ((DATA.stand || {})[cat] || {}).our || {}, me = st[nrm(n)] || {};
    const all = ind.concat(rel).map(r => ({ r, e: EV[r.ev] }));
    const medals = all.filter(x => x.r.res && x.r.res.lv != null).sort((a, b) => a.r.res.lv - b.r.res.lv || a.e.relay - b.e.relay || a.r.ev - b.r.ev).map(x => ({ lv: x.r.res.lv, ev: evName(x.e) }));
    const part = all.filter(x => !(x.r.res && x.r.res.lv != null)).sort((a, b) => a.r.ev - b.r.ev).map(x => ({ ev: evName(x.e) }));
    const done = ind.filter(r => r.res && r.res.pl).sort((a, b) => a.ev - b.ev).map(r => ({ pl: r.res.pl, ev: evName(EV[r.ev]), t: r.res.f }));
    return { name: n, disp: dispName(n), g, catL: `รุ่น ${ageL(e0.age)}${G[g]}`, medals, part, done, rk: me.rk, cls: clsOf(n) };
  }

  // ---------- fonts ----------
  let fontsP = null; const MEDIMG = [], BGIMG = {};
  function fonts() {
    if (fontsP) return fontsP;
    const TH = 'U+0E01-0E5B,U+200C-200D,U+25CC', LA = 'U+0000-00FF,U+2013-2014,U+2018-201E,U+2026';
    const fs = [];
    [['500', 'normal'], ['700', 'normal'], ['800', 'italic']].forEach(([w, s]) => {
      [['thai', TH], ['latin', LA]].forEach(([sub, ur]) => { try { const f = new FontFace('KanitP', `url(kanit-${sub}-${w}-${s}.woff2)`, { weight: w, style: s, unicodeRange: ur }); document.fonts.add(f); fs.push(f.load()) } catch (e) { } });
    });
    ['gold', 'silver', 'bronze'].forEach((n, i) => fs.push(loadImg(`medal-${n}.png`).then(im => { MEDIMG[i] = im }, () => { })));
    ['a', 'b'].forEach(k => fs.push(loadImg(`bg-${k}.jpg`).then(im => { BGIMG[k] = im }, () => { })));
    fontsP = Promise.race([Promise.all(fs), new Promise(r => setTimeout(r, 6000))]).catch(() => { });
    return fontsP;
  }
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src });

  // ---------- photo crop (zoom / pan) per poster variant ----------
  let CROP = [1, 0, 0], SLOT = null;
  function drawCrop(x, im, sx, sy, sw, sh, ay) {
    const [z, dx, dy] = CROP, b = Math.max(sw / im.width, sh / im.height) * z, w = im.width * b, h = im.height * b;
    x.drawImage(im, sx + (sw - w) / 2 + dx * sw, sy + (sh - h) * (ay == null ? .5 : ay) + dy * sh, w, h); SLOT = { w: sw, h: sh };
  }
  // ---------- drawing helpers ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
  const K = (w, s, it) => `${it ? 'italic ' : ''}${w} ${s}px KanitP, 'IBM Plex Sans Thai', sans-serif`;
  function fit(x, t, w0, sz, maxW, it) { let s = sz; x.font = K(w0, s, it); while (x.measureText(t).width > maxW && s > 14) { s -= 2; x.font = K(w0, s, it) } return s }
  function rnd(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647 }
  function medal(x, cx, cy, r, lv) {
    const im = MEDIMG[lv];
    if (im) { const w = r * 2.15, h = w * im.height / im.width; x.save(); x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = r * .35; x.shadowOffsetY = r * .1; x.drawImage(im, cx - w / 2, cy - h * .64, w, h); x.restore(); return }
    const C = [['#fff2a8', '#f1b81c', '#b07a0a'], ['#ffffff', '#c9d2dc', '#7d8a98'], ['#ffd2ad', '#d98a4e', '#8a4a1d']][lv];
    const RB = [['#d42a2a', '#a01616'], ['#2f5fcf', '#1c3d93'], ['#2f9b48', '#1d6b30']][lv];
    // ribbon tails
    [[-1], [1]].forEach(([s]) => { x.beginPath(); x.moveTo(cx + s * r * .25, cy + r * .5); x.lineTo(cx + s * r * .85, cy + r * 1.45); x.lineTo(cx + s * r * .55, cy + r * 1.3); x.lineTo(cx + s * r * .4, cy + r * 1.6); x.lineTo(cx, cy + r * .6); x.closePath(); x.fillStyle = RB[0]; x.fill() });
    const g = x.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r); g.addColorStop(0, C[0]); g.addColorStop(.6, C[1]); g.addColorStop(1, C[2]);
    x.save(); x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 6; x.shadowOffsetY = 2; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle = g; x.fill(); x.restore();
    x.beginPath(); x.arc(cx, cy, r * .72, 0, 7); x.strokeStyle = 'rgba(255,255,255,.65)'; x.lineWidth = r * .1; x.stroke();
    x.beginPath(); x.arc(cx, cy, r * .72, 0, 7); x.strokeStyle = C[2] + '88'; x.lineWidth = r * .04; x.stroke();
  }
  function trophy(x, cx, cy, s) {
    const g = x.createLinearGradient(cx - s, cy - s, cx + s, cy + s); g.addColorStop(0, '#fff1a1'); g.addColorStop(.5, '#f2b51d'); g.addColorStop(1, '#a8700b');
    x.save(); x.fillStyle = g; x.strokeStyle = '#8a5a06'; x.lineWidth = s * .06;
    x.beginPath(); x.moveTo(cx - s * .7, cy - s * .8); x.lineTo(cx + s * .7, cy - s * .8); x.quadraticCurveTo(cx + s * .7, cy + s * .15, cx, cy + s * .3); x.quadraticCurveTo(cx - s * .7, cy + s * .15, cx - s * .7, cy - s * .8); x.fill(); x.stroke();
    [-1, 1].forEach(k => { x.beginPath(); x.arc(cx + k * s * .72, cy - s * .45, s * .3, k > 0 ? -Math.PI / 2 : Math.PI / 2, k > 0 ? Math.PI / 2 : Math.PI * 1.5, k < 0); x.lineWidth = s * .13; x.strokeStyle = '#d99a14'; x.stroke() });
    x.fillStyle = g; x.fillRect(cx - s * .12, cy + s * .28, s * .24, s * .3); rr(x, cx - s * .45, cy + s * .55, s * .9, s * .28, s * .06); x.fill(); x.restore();
  }
  function laurel(x, cx, cy, s, dir) {
    x.save(); x.translate(cx, cy); x.scale(dir, 1); x.fillStyle = '#d9a520'; x.strokeStyle = '#b8860b'; x.lineWidth = s * .05;
    x.beginPath(); x.arc(s * .9, 0, s, Math.PI * .72, Math.PI * 1.28); x.stroke();
    for (let i = 0; i < 6; i++) { const a = Math.PI * (.75 + i * .1), px = s * .9 + Math.cos(a) * s, py = Math.sin(a) * s;
      x.save(); x.translate(px, py); x.rotate(a + Math.PI * .35); x.beginPath(); x.ellipse(0, -s * .16, s * .07, s * .17, 0, 0, 7); x.fill(); x.restore() }
    x.restore();
  }
  function swoosh(x, pts, c1, c2, y0, y1) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c1); g.addColorStop(1, c2); x.fillStyle = g; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 6) x.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]); x.closePath(); x.fill() }
  function swimmer(x, cx, cy, s, col) { // freestyle swimmer, facing right
    x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = col; x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.arc(.62, -.2, .16, 0, 7); x.fill();                                   // head
    x.lineWidth = .24; x.beginPath(); x.moveTo(-.85, .02); x.quadraticCurveTo(-.2, -.12, .38, -.1); x.stroke(); // torso
    x.lineWidth = .13; x.beginPath(); x.moveTo(-.85, .02); x.lineTo(-1.3, -.16); x.stroke();  // legs
    x.lineWidth = .12; x.beginPath(); x.moveTo(.3, -.14); x.quadraticCurveTo(-.05, -.95, -.62, -.42); x.stroke(); // arm over
    x.lineWidth = .1; x.beginPath(); x.moveTo(.36, -.06); x.lineTo(1.12, .04); x.stroke();  // reaching arm
    x.lineWidth = .07; [.3, .48].forEach((yy, i) => { x.beginPath(); for (let k = 0; k <= 30; k++) { const px = -1.45 + k * .1 + i * .15, py = yy + Math.sin(k * .9 + i) * .05; k ? x.lineTo(px, py) : x.moveTo(px, py) } x.globalAlpha = i ? .6 : 1; x.stroke() });
    x.restore();
  }

  // ---------- centred layout (no full-body photo: round portrait in the middle) ----------
  async function centered(x, info, W, H, NAVY, GREEN) {
    const CX = W / 2; let g;
    const footY = 1205, BOT = footY - 22;
    // title: compact, centred
    { // "[swimmer] การแข่งขันว่ายน้ำ อบจ.กระบี่" as one centred unit, kept clear of the seals
      let k = 1; const unit = () => { x.font = K(800, 44 * k, 1); const a = x.measureText('การแข่งขันว่ายน้ำ').width; x.font = K(800, 72 * k, 1); const b = x.measureText('อบจ.กระบี่').width; return [a, b, 110 * k + a + 18 * k + b] };
      let [a, b, t] = unit(); while (t > 640 && k > .6) { k -= .03;[a, b, t] = unit() }
      const x0 = CX - t / 2, by = 196; swimmer(x, x0 + 50 * k, by - 22 * k, 42 * k, '#1565c0');
      x.textAlign = 'left'; x.fillStyle = NAVY; x.font = K(800, 44 * k, 1); x.fillText('การแข่งขันว่ายน้ำ', x0 + 110 * k, by);
      x.font = K(800, 72 * k, 1); g = x.createLinearGradient(0, by - 60, 0, by + 6); g.addColorStop(0, '#1e6fd8'); g.addColorStop(1, '#0a2f78');
      const bx = x0 + 110 * k + a + 18 * k; x.save(); x.lineWidth = 9; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.strokeText('อบจ.กระบี่', bx, by); x.restore(); x.fillStyle = g; x.fillText('อบจ.กระบี่', bx, by); x.textAlign = 'center' }
    { const y = 214, w = 780, t = 'SWIMMING CHAMPIONSHIP · ชิงแชมป์ภาคใต้ ครั้งที่ 16 ประจำปี 2569'; x.save(); x.shadowColor = 'rgba(0,0,0,.2)'; x.shadowBlur = 8; x.shadowOffsetY = 3; g = x.createLinearGradient(0, y, 0, y + 48); g.addColorStop(0, '#3dbb4f'); g.addColorStop(1, '#16803a'); x.fillStyle = g;
      x.beginPath(); x.moveTo(CX - w / 2 + 16, y); x.lineTo(CX + w / 2 + 6, y); x.lineTo(CX + w / 2 - 16, y + 48); x.lineTo(CX - w / 2 - 6, y + 48); x.closePath(); x.fill(); x.restore();
      x.fillStyle = '#fff'; fit(x, t, 800, 28, w - 50, 1); x.fillText(t, CX, y + 34) }
    // date | venue, centred as one unit
    { const y = 298, t1 = 'วันที่ 7-8 พฤศจิกายน 2569', t2 = 'สระว่ายน้ำ โรงเรียนโภคาพาณิชย์นุกูลมูลนิธิ จ.กระบี่';
      x.font = K(700, 23, 1); const w1 = x.measureText(t1).width; x.font = K(500, 20); const w2 = x.measureText(t2).width;
      const tot = 40 + w1 + 34 + 30 + w2, x0 = CX - tot / 2; x.textAlign = 'left';
      x.strokeStyle = NAVY; x.lineWidth = 3; rr(x, x0, y - 25, 30, 28, 5); x.stroke(); x.fillStyle = NAVY; x.fillRect(x0, y - 25, 30, 8); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) x.fillRect(x0 + 5 + i * 8, y - 12 + j * 7, 4, 4);
      x.font = K(700, 23, 1); x.fillText(t1, x0 + 40, y);
      const sx = x0 + 40 + w1 + 17; x.strokeStyle = '#8aa0b4'; x.lineWidth = 2; x.beginPath(); x.moveTo(sx, y - 26); x.lineTo(sx, y + 6); x.stroke();
      const px = sx + 28; x.fillStyle = '#e0312b'; x.beginPath(); x.arc(px, y - 14, 10, Math.PI, 0); x.lineTo(px, y + 6); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(px, y - 14, 4, 0, 7); x.fill();
      x.fillStyle = NAVY; x.font = K(500, 20); x.fillText(t2, px + 18, y); x.textAlign = 'center' }

    // ---- measure the lower block ----
    const hasMed = info.medals.length > 0, head = hasMed ? 'รางวัลที่ได้' : 'รายการที่เข้าร่วมแข่งขัน';
    const rows = info.medals.map(m => ({ v: m.ev, lv: m.lv })).concat(info.part.map(d => ({ v: d.ev, p: 1 })));
    if (!rows.length) rows.push({ v: 'ร่วมแข่งขันด้วยความมุ่งมั่น' });
    const cols = rows.length <= 3 ? 1 : rows.length <= 8 ? 2 : 3, nr = Math.ceil(rows.length / cols);
    const troph = info.rk && info.rk <= 6, TOP = 318;
    // the portrait gets the space first (target ≈ 1.5/4 of the poster height), the list adapts
    const restNoList = 64 + 12 + 80 + 14 + 54 + (troph ? 14 + 48 : 0) + 22 + 50 + 12 + 24;
    let r = 250, rh = cols === 1 ? 54 : 46;
    const fitList = () => BOT - TOP - 16 - 2 * r - restNoList;
    while (nr * rh > fitList() && r > 150) r -= 5;
    while (nr * rh > fitList() && rh > 34) rh -= 1;
    const listH = nr * rh + 24, rest = restNoList - 24 + listH;
    const used = 2 * r + 16 + rest, y0 = TOP + Math.max(0, (BOT - TOP - used) / 2);
    // portrait
    const cy = y0 + r + 8;
    const sunburst = () => { x.save(); x.translate(CX, cy); for (let k = 0; k < 24; k++) { x.rotate(Math.PI / 12); x.beginPath(); x.moveTo(0, 0); x.lineTo(r * 2.1, -r * .14); x.lineTo(r * 2.1, r * .14); x.closePath(); x.fillStyle = 'rgba(255,255,255,.22)'; x.fill() } x.restore() };
    sunburst();
    x.save(); x.shadowColor = 'rgba(0,30,70,.3)'; x.shadowBlur = 22; x.beginPath(); x.arc(CX, cy, r + 14, 0, 7); g = x.createLinearGradient(CX - r, cy - r, CX + r, cy + r); g.addColorStop(0, '#ffe58a'); g.addColorStop(.5, '#f2b51d'); g.addColorStop(1, '#b67c0c'); x.fillStyle = g; x.fill(); x.restore();
    x.beginPath(); x.arc(CX, cy, r + 4, 0, 7); x.fillStyle = '#fff'; x.fill();
    x.save(); x.beginPath(); x.arc(CX, cy, r, 0, 7); x.clip();
    const prof = window.Photos && Photos.get && Photos.get(info.name); let ok = false;
    if (prof) { try { const im = await loadImg(prof); drawCrop(x, im, CX - r, cy - r, r * 2, r * 2); ok = true } catch (e) { } }
    if (!ok) { g = x.createLinearGradient(CX - r, cy - r, CX + r, cy + r); g.addColorStop(0, info.g === 'F' ? '#f6a3c8' : '#6fb2f2'); g.addColorStop(1, info.g === 'F' ? '#c2407f' : '#1f5fb8'); x.fillStyle = g; x.fillRect(CX - r, cy - r, r * 2, r * 2); swimmer(x, CX, cy + 8, r * .5, 'rgba(255,255,255,.95)') }
    x.restore();
    laurel(x, CX - r - 46, cy + 10, r * .62, 1); laurel(x, CX + r + 46, cy + 10, r * .62, -1);
    // congrats ribbon overlapping the portrait bottom
    let y = cy + r - 26;
    x.save(); x.shadowColor = 'rgba(120,70,0,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4; g = x.createLinearGradient(0, y, 0, y + 64); g.addColorStop(0, '#fff3b0'); g.addColorStop(.45, '#f6c637'); g.addColorStop(1, '#c98a0c'); x.fillStyle = g;
    x.beginPath(); x.moveTo(CX - 250, y); x.lineTo(CX + 250, y); x.lineTo(CX + 228, y + 32); x.lineTo(CX + 250, y + 64); x.lineTo(CX - 250, y + 64); x.lineTo(CX - 228, y + 32); x.closePath(); x.fill(); x.restore();
    x.fillStyle = '#7a1010'; x.font = K(800, 42, 1); x.fillText('ขอแสดงความยินดี', CX, y + 47);
    // name bar (full width, centred)
    y += 76; const nm = `${info.g === 'F' ? 'ด.ญ.' : 'ด.ช.'}${info.disp}`, NW = 760;
    x.save(); x.shadowColor = 'rgba(0,20,60,.35)'; x.shadowBlur = 12; x.shadowOffsetY = 4; g = x.createLinearGradient(0, y, 0, y + 80); g.addColorStop(0, '#1f63c6'); g.addColorStop(1, '#0a2c72'); x.fillStyle = g;
    x.beginPath(); x.moveTo(CX - NW / 2 + 24, y); x.lineTo(CX + NW / 2 + 6, y); x.lineTo(CX + NW / 2 - 24, y + 80); x.lineTo(CX - NW / 2 - 6, y + 80); x.closePath(); x.fill(); x.restore();
    x.fillStyle = GREEN; [[-1], [1]].forEach(([k]) => { const ex = CX + k * (NW / 2 + 22); x.beginPath(); x.moveTo(ex - 8 + (k > 0 ? 6 : 24) - 14, y); x.lineTo(ex + 8 + (k > 0 ? 6 : 24) - 14, y); x.lineTo(ex + 8 - (k > 0 ? 24 : 6) + 14 - 14, y + 80); x.lineTo(ex - 8 - (k > 0 ? 24 : 6) + 14 - 14, y + 80); x.closePath(); x.fill() });
    x.fillStyle = '#fff'; fit(x, nm, 800, 54, NW - 70, 1); x.fillText(nm, CX + 4, y + 57);
    // pills
    y += 94;
    const pill = (cx, w, t, bg, fg) => { x.save(); x.shadowColor = 'rgba(0,30,70,.2)'; x.shadowBlur = 8; x.shadowOffsetY = 2; rr(x, cx - w / 2, y, w, 54, 27); x.fillStyle = bg; x.fill(); x.restore(); if (bg === '#fff') { x.strokeStyle = '#9cc7ec'; x.lineWidth = 2; rr(x, cx - w / 2, y, w, 54, 27); x.stroke() } x.fillStyle = fg; fit(x, t, 700, 32, w - 30, 0); x.fillText(t, cx, y + 38) };
    g = x.createLinearGradient(0, y, 0, y + 54); g.addColorStop(0, '#36b54c'); g.addColorStop(1, '#16803a');
    if (info.cls) { pill(CX - 160, 290, `ชั้น ${info.cls}`, '#fff', NAVY); pill(CX + 160, 290, info.catL, g, '#fff') } else pill(CX, 380, info.catL, g, '#fff');
    y += 54;
    if (troph) { y += 14; const t = `ถ้วยนักกีฬายอดเยี่ยมประเภทบุคคล อันดับที่ ${info.rk}`; x.font = K(700, 26); const tw = x.measureText(t).width + 90;
      x.save(); x.shadowColor = 'rgba(120,70,0,.3)'; x.shadowBlur = 8; g = x.createLinearGradient(0, y, 0, y + 48); g.addColorStop(0, '#fff7cf'); g.addColorStop(1, '#ffe07a'); x.fillStyle = g; rr(x, CX - tw / 2, y, tw, 48, 24); x.fill(); x.restore();
      x.strokeStyle = '#d9a520'; x.lineWidth = 2; rr(x, CX - tw / 2, y, tw, 48, 24); x.stroke(); trophy(x, CX - tw / 2 + 34, y + 21, 20); x.fillStyle = '#7a4b00'; x.fillText(t, CX + 22, y + 33); y += 48 }
    // section header: thin rules + title
    y += 22; x.font = K(800, 38, 1); const hw = x.measureText(head).width;
    x.strokeStyle = GREEN; x.lineWidth = 3; x.beginPath(); x.moveTo(CX - hw / 2 - 210, y + 24); x.lineTo(CX - hw / 2 - 62, y + 24); x.moveTo(CX + hw / 2 + 30, y + 24); x.lineTo(CX + hw / 2 + 178, y + 24); x.stroke();
    trophy(x, CX - hw / 2 - 30, y + 22, 22); x.fillStyle = '#14783a'; x.fillText(head, CX + 0, y + 38);
    if (hasMed) { const cnt = [0, 0, 0]; info.medals.forEach(m => cnt[m.lv]++); }
    y += 50 + 12;
    // award grid
    const GW = cols === 1 ? 640 : 920, cw = GW / cols, gx = CX - GW / 2;
    x.save(); x.shadowColor = 'rgba(0,40,90,.16)'; x.shadowBlur = 14; rr(x, gx - 14, y, GW + 28, listH, 24); x.fillStyle = 'rgba(255,255,255,.85)'; x.fill(); x.restore();
    x.strokeStyle = 'rgba(80,150,220,.45)'; x.lineWidth = 2; rr(x, gx - 14, y, GW + 28, listH, 24); x.stroke();
    const fs = Math.min(cols === 3 ? 25 : 30, rh * .55), mr = Math.min(rh * .32, 20);
    rows.forEach((it, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, rows.length - row * cols), col = i % cols;
      const off = (cols - inRow) * cw / 2, cx0 = gx + off + col * cw, ry = y + 12 + row * rh;
      g = x.createLinearGradient(cx0, 0, cx0 + cw, 0); g.addColorStop(0, 'rgba(225,240,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,.45)'); rr(x, cx0 + 6, ry + 4, cw - 12, rh - 8, (rh - 8) / 2); x.fillStyle = g; x.fill();
      const mx = cx0 + 18 + mr; if (it.lv != null) medal(x, mx, ry + rh / 2 - mr * .15, mr, it.lv); else { x.beginPath(); x.arc(mx, ry + rh / 2, mr, 0, 7); x.fillStyle = '#1f63c6'; x.fill(); swimmer(x, mx, ry + rh / 2 + mr * .1, mr * .62, '#fff') }
      x.textAlign = 'left'; const tx = mx + mr + 12; x.font = K(500, fs * .72); const maxw = cx0 + cw - 16 - tx - (it.t ? x.measureText(it.t).width + 16 : 0);
      x.fillStyle = it.lv === 0 ? '#7a5200' : it.lv === 1 ? '#2f4560' : it.lv === 2 ? '#7a3e14' : '#10233f'; fit(x, it.v, 700, fs, maxw, 0); x.fillText(it.v, tx, ry + rh / 2 + fs * .36);
      if (it.t) { x.textAlign = 'right'; x.fillStyle = '#4f7fb8'; x.font = K(500, fs * .72); x.fillText(it.t, cx0 + cw - 22, ry + rh / 2 + fs * .3) }
      x.textAlign = 'center';
    });
  }

  // ---------- style B: dark "athlete card" (navy / cyan / gold) ----------
  async function renderB(info, photo, opts) {
    opts = opts || {}; await fonts(); CROP = opts.crop || [1, 0, 0]; SLOT = null;
    if (opts.only === 'medal' && info.medals.length) info = Object.assign({}, info, { part: [] });
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const CY = '#26d0f0', GOLD = '#f6c945', WHITE = '#ffffff', FULL = !!(photo && photo.im) && opts.layout !== 'center';
    let g;
    // background plate (Canva art) + left-side shade for legibility
    if (BGIMG.b) x.drawImage(BGIMG.b, 0, 0, W, H); else { g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, '#04122a'); g.addColorStop(1, '#0a4c86'); x.fillStyle = g; x.fillRect(0, 0, W, H) }
    g = x.createLinearGradient(0, 0, W * .75, 0); g.addColorStop(0, 'rgba(2,10,28,.72)'); g.addColorStop(.6, 'rgba(2,10,28,.25)'); g.addColorStop(1, 'rgba(2,10,28,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createLinearGradient(0, 0, 0, 190); g.addColorStop(0, 'rgba(2,10,28,.7)'); g.addColorStop(1, 'rgba(2,10,28,0)'); x.fillStyle = g; x.fillRect(0, 0, W, 190);

    // top bar: seals + meet
    const seal = async (src, cx, cy, r, clip) => { x.save(); x.beginPath(); x.arc(cx, cy, r + 4, 0, 7); x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 10; x.fill(); x.restore();
      try { const im = await loadImg(src); x.save(); if (clip) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip() } x.drawImage(im, cx - r, cy - r, r * 2, r * 2); x.restore() } catch (e) { } };
    await seal('seal-sri.png', 92, 92, 50, true); await seal('logo.png', 210, 92, 50, false);
    x.save(); x.shadowColor = 'rgba(0,8,25,.95)'; x.shadowBlur = 14;
    x.textAlign = 'right'; x.fillStyle = WHITE; x.font = K(800, 30, 1); x.fillText('อบจ.กระบี่ SWIMMING CHAMPIONSHIP', W - 50, 78);
    x.fillStyle = CY; x.font = K(500, 22); x.fillText('ชิงแชมป์ภาคใต้ ครั้งที่ 16 · 7–8 พ.ย. 2569 · จ.กระบี่', W - 50, 112); x.restore();
    x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(50, 160, W - 100, 2);

    // photo (right)
    const PCX = 790;
    if (FULL) {
      const im = photo.im;
      if (photo.alpha) { const maxH = 1040, maxW = 560, sc = Math.min(maxH / im.height, maxW / im.width) * CROP[0], w = im.width * sc, h = im.height * sc, ox = CROP[1] * maxW, oy = CROP[2] * maxH; SLOT = { w: maxW, h: maxH };
        x.beginPath(); x.ellipse(PCX, 1215, w * .5, 34, 0, 0, 7); g = x.createRadialGradient(PCX, 1215, 10, PCX, 1215, w * .5); g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fill();
        x.save(); x.shadowColor = 'rgba(38,208,240,.55)'; x.shadowBlur = 40; x.drawImage(im, PCX - w / 2 + ox, 1222 - h + oy, w, h); x.restore() }
      else { const fw = 430, fx = PCX - fw / 2 + 20, fy = 196, fh = 1222 - fy, sc = Math.max(fw / im.width, fh / im.height), w = im.width * sc, h = im.height * sc;
        x.save(); x.translate(fx + fw / 2, fy + fh / 2); x.rotate(.012); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 30; rr(x, -fw / 2 - 10, -fh / 2 - 10, fw + 20, fh + 20, 30); g = x.createLinearGradient(-fw / 2, -fh / 2, fw / 2, fh / 2); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#b8860b'); x.fillStyle = g; x.fill(); x.shadowBlur = 0;
          rr(x, -fw / 2, -fh / 2, fw, fh, 22); x.clip(); drawCrop(x, im, -fw / 2, -fh / 2, fw, fh, .2); x.restore() }
    } else {
      const cy = 470, r = 190;
      for (let k = 3; k >= 1; k--) { x.beginPath(); x.arc(PCX, cy, r + k * 26, 0, 7); x.strokeStyle = `rgba(38,208,240,${.1 + (3 - k) * .08})`; x.lineWidth = 3; x.stroke() }
      x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 30; x.beginPath(); x.arc(PCX, cy, r + 12, 0, 7); g = x.createLinearGradient(PCX - r, cy - r, PCX + r, cy + r); g.addColorStop(0, '#fff1a1'); g.addColorStop(.5, GOLD); g.addColorStop(1, '#a8700b'); x.fillStyle = g; x.fill(); x.restore();
      x.save(); x.beginPath(); x.arc(PCX, cy, r, 0, 7); x.clip();
      const prof = window.Photos && Photos.get && Photos.get(info.name); let ok = false;
      if (prof) { try { const im = await loadImg(prof); drawCrop(x, im, PCX - r, cy - r, r * 2, r * 2); ok = true } catch (e) { } }
      if (!ok) { g = x.createLinearGradient(PCX - r, cy - r, PCX + r, cy + r); g.addColorStop(0, info.g === 'F' ? '#ff8fc0' : '#3fb7ff'); g.addColorStop(1, info.g === 'F' ? '#9b2c68' : '#0d4c9a'); x.fillStyle = g; x.fillRect(PCX - r, cy - r, r * 2, r * 2); swimmer(x, PCX, cy + 10, r * .5, 'rgba(255,255,255,.95)') }
      x.restore();
    }

    // headline + name (left column)
    const LX = 56, LW = FULL ? 520 : 500;
    x.textAlign = 'left';
    g = x.createLinearGradient(0, 200, 0, 270); g.addColorStop(0, '#fff3b0'); g.addColorStop(.5, GOLD); g.addColorStop(1, '#c48a10'); x.fillStyle = g;
    fit(x, 'ขอแสดงความยินดี', 800, 64, LW, 1); x.fillText('ขอแสดงความยินดี', LX, 258);
    x.fillStyle = CY; x.font = K(700, 28); x.fillText(info.g === 'F' ? 'เด็กหญิง' : 'เด็กชาย', LX, 316);
    const sp = info.disp.indexOf(' '), first = sp > 0 ? info.disp.slice(0, sp) : info.disp, last = sp > 0 ? info.disp.slice(sp + 1) : '';
    x.fillStyle = WHITE; x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 12; fit(x, first, 800, 104, LW, 1); x.fillText(first, LX - 4, 418); x.restore();
    x.fillStyle = 'rgba(255,255,255,.85)'; fit(x, last, 700, 52, LW, 1); x.fillText(last, LX, 482);
    // chips
    let cx0 = LX; const chip = (t, fill) => { x.font = K(700, 26); const w = x.measureText(t).width + 40; rr(x, cx0, 512, w, 48, 24); if (fill) { x.fillStyle = CY; x.fill(); x.fillStyle = '#04223f' } else { x.strokeStyle = CY; x.lineWidth = 2.5; x.stroke(); x.fillStyle = CY } x.fillText(t, cx0 + 20, 545); cx0 += w + 14 };
    if (info.cls) chip(`ชั้น ${info.cls}`, false); chip(info.catL, true);

    // medal tally
    let y = 600; const cnt = [0, 0, 0]; info.medals.forEach(m => cnt[m.lv]++);
    if (info.medals.length) {
      [0, 1, 2].filter(lv => cnt[lv]).forEach((lv, i) => { const mx = LX + 44 + i * 172; medal(x, mx, y + 74, 40, lv);
        x.textAlign = 'left'; x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 8; x.fillStyle = [GOLD, '#e6edf5', '#e9a46f'][lv]; x.font = K(800, 64, 1); x.fillText('×' + cnt[lv], mx + 44, y + 98); x.restore();
        x.fillStyle = 'rgba(255,255,255,.75)'; x.font = K(500, 19); x.fillText(['เหรียญทอง', 'เหรียญเงิน', 'เหรียญทองแดง'][lv], mx + 48, y + 128) });
      y += 170;
    } else { x.fillStyle = WHITE; x.font = K(800, 40, 1); x.textAlign = 'left'; x.fillText(`ลงแข่ง ${info.part.length} รายการ`, LX, y + 52); y += 80 }
    x.textAlign = 'left';
    if (info.rk && info.rk <= 6) { const t = `ถ้วยนักกีฬายอดเยี่ยม อันดับที่ ${info.rk}`; x.font = K(700, 26); const w = Math.min(LW, x.measureText(t).width + 80);
      g = x.createLinearGradient(LX, 0, LX + w, 0); g.addColorStop(0, '#f6c945'); g.addColorStop(1, '#d99a14'); rr(x, LX, y, w, 50, 12); x.fillStyle = g; x.fill(); trophy(x, LX + 32, y + 22, 18); x.fillStyle = '#3a2500'; fit(x, t, 700, 26, w - 70); x.fillText(t, LX + 60, y + 35); y += 66 }

    // event list
    const rows = info.medals.map(m => ({ v: m.ev, lv: m.lv })).concat(info.part.map(d => ({ v: d.ev })));
    const top = Math.max(y + 6, FULL ? 0 : 720), PW = FULL ? 510 : W - 2 * LX, avail = 1206 - top;
    let cols = FULL ? (rows.length > 9 ? 2 : 1) : (rows.length <= 5 ? 1 : rows.length <= 12 ? 2 : 3);
    const per = Math.ceil(rows.length / cols); const rh = Math.min(64, (avail - 20) / per);
    const ph2 = per * rh + 20, py = top + Math.max(0, (avail - ph2) / 2) * (FULL ? 0 : .5);
    x.save(); rr(x, LX - 16, py, PW + 32, ph2, 20); x.fillStyle = 'rgba(4,20,45,.55)'; x.fill(); x.strokeStyle = 'rgba(38,208,240,.35)'; x.lineWidth = 1.5; x.stroke(); x.restore();
    const cw = PW / cols, fs = Math.min(cols === 3 ? 23 : cols === 1 ? 32 : 27, rh * .56), mr = Math.min(rh * .3, 16);
    rows.forEach((it, i) => { const col = Math.floor(i / per), ry = py + 10 + (i % per) * rh, x0 = LX + col * cw;
      if (i % per) { x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(x0 + 6, ry, cw - 22, 1) }
      const mx = x0 + 6 + mr; if (it.lv != null) medal(x, mx, ry + rh / 2 - mr * .15, mr, it.lv); else { x.beginPath(); x.arc(mx, ry + rh / 2, mr, 0, 7); x.fillStyle = 'rgba(38,208,240,.25)'; x.fill(); swimmer(x, mx, ry + rh / 2 + mr * .1, mr * .62, CY) }
      x.fillStyle = it.lv != null ? WHITE : 'rgba(220,240,255,.8)'; fit(x, it.v, it.lv != null ? 700 : 500, fs, cw - mr * 2 - 34); x.fillText(it.v, mx + mr + 14, ry + rh / 2 + fs * .36) });

    // footer band over the plate
    g = x.createLinearGradient(0, 1236, 0, H); g.addColorStop(0, 'rgba(2,10,28,0)'); g.addColorStop(.4, 'rgba(2,10,28,.7)'); g.addColorStop(1, 'rgba(2,10,28,.9)'); x.fillStyle = g; x.fillRect(0, 1236, W, H - 1236);
    x.fillStyle = 'rgba(38,208,240,.6)'; x.fillRect(W / 2 - 60, 1262, 120, 3);
    x.textAlign = 'center'; x.fillStyle = WHITE; x.font = K(800, 34, 1); x.fillText('ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', W / 2, 1298);
    x.fillStyle = CY; x.font = K(500, 18); x.fillText('S R I A R U N O T H A I   S W I M M I N G   C L U B   ·   S S C', W / 2, 1328);
    return c;
  }

  async function render(info, photo, opts) {
    opts = opts || {}; CROP = opts.crop || [1, 0, 0]; SLOT = null;
    if (opts.only === 'medal' && info.medals.length) info = Object.assign({}, info, { part: [] });
    await fonts();
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const NAVY = '#0b3d91', GREEN = '#1f9d43', RC = 700;
    // background plate (Canva art) + soft light veil for text areas
    let g;
    if (BGIMG.a) x.drawImage(BGIMG.a, 0, 0, W, H); else { g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f3fbff'); g.addColorStop(1, '#9fd6f5'); x.fillStyle = g; x.fillRect(0, 0, W, H) }
    g = x.createRadialGradient(W / 2, 520, 60, W / 2, 520, 620); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, 170);

    // header seals
    const seal = async (src, cx, cy, r, clip) => { x.save(); x.shadowColor = 'rgba(0,0,0,.22)'; x.shadowBlur = 14; x.beginPath(); x.arc(cx, cy, r + 6, 0, 7); x.fillStyle = '#fff'; x.fill(); x.restore();
      try { const im = await loadImg(src); x.save(); if (clip) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip() } x.drawImage(im, cx - r, cy - r, r * 2, r * 2); x.restore() } catch (e) { } };
    await seal('seal-sri.png', 112, 108, 86, true);
    await seal('logo.png', W - 112, 108, 86, false);
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.fillStyle = GREEN; fit(x, 'โรงเรียนศรีอรุโณทัย จังหวัดระนอง', 700, 46, 620); x.fillText('โรงเรียนศรีอรุโณทัย จังหวัดระนอง', W / 2, 82);
    x.fillStyle = '#4f6475'; x.font = K(500, 21); const sub = 'S R I A R U N O T H A I   S C H O O L   R A N O N G'; x.fillText(sub, W / 2, 122);
    const sw = x.measureText(sub).width / 2; x.strokeStyle = '#7d93a5'; x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - sw - 70, 115); x.lineTo(W / 2 - sw - 14, 115); x.moveTo(W / 2 + sw + 14, 115); x.lineTo(W / 2 + sw + 70, 115); x.stroke();
    x.font = K(700, 46); const hw = x.measureText('โรงเรียนศรีอรุโณทัย จังหวัดระนอง').width / 2 + 18;
    [W / 2 - hw, W / 2 + hw].forEach(px => { x.strokeStyle = GREEN; x.lineWidth = 3; x.beginPath(); x.moveTo(px, 50); x.lineTo(px, 100); x.stroke() });

    const FULL = !!(photo && photo.im) && opts.layout !== 'center', footY = 1205;
    if (!FULL) { await centered(x, info, W, H, NAVY, GREEN) } else {
    // meet title (right column)
    swimmer(x, RC - 262, 214, 52, '#1565c0');
    x.fillStyle = NAVY; fit(x, 'การแข่งขันว่ายน้ำ', 800, 52, 330, 1); x.textAlign = 'left'; x.fillText('การแข่งขันว่ายน้ำ', RC - 178, 226);
    x.textAlign = 'center'; x.font = K(800, 92, 1);
    g = x.createLinearGradient(0, 230, 0, 320); g.addColorStop(0, '#1e6fd8'); g.addColorStop(1, '#0a2f78'); x.fillStyle = g;
    x.save(); x.shadowColor = 'rgba(255,255,255,.9)'; x.shadowBlur = 0; x.lineWidth = 10; x.strokeStyle = '#fff'; x.lineJoin = 'round'; x.strokeText('อบจ.กระบี่', RC + 40, 310); x.restore(); x.fillText('อบจ.กระบี่', RC + 40, 310);
    x.fillStyle = '#0d4fb0'; fit(x, 'SWIMMING CHAMPIONSHIP', 800, 50, 640, 1); x.fillText('SWIMMING CHAMPIONSHIP', RC, 372);
    // green ribbon
    const rb = (y, h, w) => { x.save(); x.shadowColor = 'rgba(0,0,0,.2)'; x.shadowBlur = 8; x.shadowOffsetY = 3; g = x.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#3dbb4f'); g.addColorStop(1, '#16803a'); x.fillStyle = g;
      x.beginPath(); x.moveTo(RC - w / 2 + 18, y); x.lineTo(RC + w / 2 + 6, y); x.lineTo(RC + w / 2 - 18, y + h); x.lineTo(RC - w / 2 - 6, y + h); x.closePath(); x.fill(); x.restore() };
    rb(392, 60, 640); x.fillStyle = '#fff'; fit(x, 'ชิงแชมป์ภาคใต้ ครั้งที่ 16 ประจำปี 2569', 800, 38, 590, 1); x.fillText('ชิงแชมป์ภาคใต้ ครั้งที่ 16 ประจำปี 2569', RC, 436);
    // date & venue
    { const y = 492; x.textAlign = 'left';
      // calendar icon
      x.strokeStyle = NAVY; x.lineWidth = 3; rr(x, 380, y - 28, 34, 32, 5); x.stroke(); x.fillStyle = NAVY; x.fillRect(380, y - 28, 34, 9); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) x.fillRect(386 + i * 9, y - 14 + j * 8, 5, 4);
      x.fillStyle = NAVY; x.font = K(700, 25, 1); x.fillText('วันที่ 7-8 พฤศจิกายน 2569', 424, y);
      x.strokeStyle = '#8aa0b4'; x.lineWidth = 2; x.beginPath(); x.moveTo(722, y - 34); x.lineTo(722, y + 30); x.stroke();
      // pin
      x.fillStyle = '#e0312b'; x.beginPath(); x.arc(752, y - 16, 12, Math.PI, 0); x.lineTo(752, y + 8); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(752, y - 16, 4.5, 0, 7); x.fill();
      x.fillStyle = NAVY; x.font = K(500, 19); x.fillText('สระว่ายน้ำ โรงเรียนโภคาพาณิชย์นุกูล', 774, y - 8); x.fillText('มูลนิธิ อำเภอเมือง จังหวัดกระบี่', 774, y + 18); x.textAlign = 'center' }

    // ---- layout of lower block (computed first so it can be centred) ----
    const TOP = 540, BOT = footY - 22;
    const hasMed = info.medals.length > 0, head = hasMed ? 'รางวัลที่ได้ :' : 'รายการที่เข้าร่วม :';
    const rows = info.medals.map(m => ({ k: LV[m.lv], v: m.ev, lv: m.lv })).concat(info.part.map(d => ({ k: 'เข้าร่วม', v: d.ev, pl: 0 })));
    if (!rows.length) rows.push({ k: 'ร่วมแข่งขัน :', v: 'ด้วยความมุ่งมั่นตั้งใจ', pl: 0 });
    const troph = info.rk && info.rk <= 6;
    const fixedH = 74 + 18 + 84 + 20 + 56 + 18 + (troph ? 64 : 0) + 62 + 16;
    const availL = BOT - TOP - fixedH - 20;
    let cols = 1, rh = Math.min(66, availL / rows.length);
    if (rh < 42) { cols = 2; rh = Math.min(60, availL / Math.ceil(rows.length / 2)) }
    const per = Math.ceil(rows.length / cols), listH = per * rh + 20;
    const spare = availL - per * rh, y0 = TOP + Math.max(0, spare) * .45;
    const midY = (y0 + y0 + fixedH + listH) / 2;

    // kid photo / placeholder (left), drawn before the lower content
    if (photo && photo.im) {
      const im = photo.im;
      if (photo.alpha) { const maxH = footY + 60 - 190, maxW = 520, s = Math.min(maxH / im.height, maxW / im.width) * CROP[0], w = im.width * s, h = im.height * s, ox = CROP[1] * maxW, oy = CROP[2] * maxH; SLOT = { w: maxW, h: maxH };
        x.save(); x.shadowColor = 'rgba(0,30,70,.35)'; x.shadowBlur = 24; x.shadowOffsetX = 6; x.drawImage(im, 230 - w / 2 + ox, footY + 60 - h + oy, w, h); x.restore() }
      else { const fw = 352, fx = 24, fy = 236, fh = footY + 30 - fy, s = Math.max(fw / im.width, fh / im.height), w = im.width * s, h = im.height * s;
        x.save(); x.shadowColor = 'rgba(0,30,70,.35)'; x.shadowBlur = 20; rr(x, fx - 8, fy - 8, fw + 16, fh + 16, 34); g = x.createLinearGradient(fx, fy, fx + fw, fy + fh); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#c58b12'); x.fillStyle = g; x.fill(); x.restore();
        x.save(); rr(x, fx, fy, fw, fh, 28); x.clip(); drawCrop(x, im, fx, fy, fw, fh, .2); x.restore() }
    } else {
      const cx = 205, cy = Math.max(740, Math.min(midY, 900)), r = 165;
      x.save(); x.shadowColor = 'rgba(0,30,70,.3)'; x.shadowBlur = 22; x.beginPath(); x.arc(cx, cy, r + 16, 0, 7); g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#c58b12'); x.fillStyle = g; x.fill(); x.restore();
      x.beginPath(); x.arc(cx, cy, r + 4, 0, 7); x.fillStyle = '#fff'; x.fill();
      x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
      const prof = window.Photos && Photos.get && Photos.get(info.name);
      let ok = false; if (prof) { try { const im = await loadImg(prof); x.drawImage(im, cx - r, cy - r, r * 2, r * 2); ok = true } catch (e) { } }
      if (!ok) { g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, info.g === 'F' ? '#f6a3c8' : '#6fb2f2'); g.addColorStop(1, info.g === 'F' ? '#c2407f' : '#1f5fb8'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); swimmer(x, cx, cy + 10, 82, 'rgba(255,255,255,.95)') }
      x.restore();
      [[cx - r - 22, cy - r + 40], [cx + r + 14, cy - r + 6], [cx + r + 22, cy + r - 40], [cx - r - 4, cy + r - 6]].forEach(([px, py], i) => { x.save(); x.translate(px, py); x.rotate(.4 * i); x.fillStyle = ['#ffd23f', '#ffffff', '#ffd23f', '#5ec8ff'][i]; x.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr2 = k % 2 ? 7 : 17; x.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) } x.closePath(); x.fill(); x.restore() });
    }

    // congrats ribbon
    let y = y0; const LW = 640, LX = RC - LW / 2 + 10;
    x.save(); x.shadowColor = 'rgba(120,70,0,.35)'; x.shadowBlur = 10; x.shadowOffsetY = 4;
    g = x.createLinearGradient(0, y, 0, y + 74); g.addColorStop(0, '#fff3b0'); g.addColorStop(.45, '#f6c637'); g.addColorStop(1, '#c98a0c'); x.fillStyle = g; rr(x, RC - 230, y, 460, 74, 37); x.fill(); x.restore();
    x.strokeStyle = '#a86f06'; x.lineWidth = 3; rr(x, RC - 230, y, 460, 74, 37); x.stroke();
    laurel(x, RC - 285, y + 30, 60, 1); laurel(x, RC + 285, y + 30, 60, -1);
    x.fillStyle = '#7a1010'; x.font = K(800, 48, 1); x.fillText('ขอแสดงความยินดี', RC, y + 54);
    // name bar
    y += 92; const nm = `${info.g === 'F' ? 'ด.ญ.' : 'ด.ช.'}${info.disp}`;
    x.save(); x.shadowColor = 'rgba(0,20,60,.35)'; x.shadowBlur = 12; x.shadowOffsetY = 4; g = x.createLinearGradient(0, y, 0, y + 84); g.addColorStop(0, '#1f63c6'); g.addColorStop(1, '#0a2c72'); x.fillStyle = g;
    x.beginPath(); x.moveTo(LX + 26, y); x.lineTo(LX + LW + 6, y); x.lineTo(LX + LW - 20, y + 84); x.lineTo(LX - 6, y + 84); x.closePath(); x.fill(); x.restore();
    x.fillStyle = GREEN; x.beginPath(); x.moveTo(LX + LW + 14, y); x.lineTo(LX + LW + 30, y); x.lineTo(LX + LW + 4, y + 84); x.lineTo(LX + LW - 12, y + 84); x.closePath(); x.fill();
    x.fillStyle = '#fff'; fit(x, nm, 800, 54, LW - 50, 1); x.fillText(nm, RC + 6, y + 60);
    // class + category pills
    y += 104;
    const pill = (cx, w, t, bg, fg) => { x.save(); x.shadowColor = 'rgba(0,30,70,.2)'; x.shadowBlur = 8; x.shadowOffsetY = 2; rr(x, cx - w / 2, y, w, 56, 28); x.fillStyle = bg; x.fill(); x.restore(); if (bg === '#fff') { x.strokeStyle = '#9cc7ec'; x.lineWidth = 2; rr(x, cx - w / 2, y, w, 56, 28); x.stroke() } x.fillStyle = fg; fit(x, t, 700, 34, w - 30, 0); x.fillText(t, cx, y + 40) };
    if (info.cls) { pill(RC - 165, 290, `ชั้น ${info.cls}`, '#fff', NAVY); g = x.createLinearGradient(0, y, 0, y + 56); g.addColorStop(0, '#36b54c'); g.addColorStop(1, '#16803a'); pill(RC + 165, 300, info.catL, g, '#fff') }
    else { g = x.createLinearGradient(0, y, 0, y + 56); g.addColorStop(0, '#36b54c'); g.addColorStop(1, '#16803a'); pill(RC, 360, info.catL, g, '#fff') }
    y += 74;
    // individual trophy
    if (troph) {
      const t = `ถ้วยนักกีฬายอดเยี่ยมประเภทบุคคล อันดับที่ ${info.rk}`;
      x.save(); x.shadowColor = 'rgba(120,70,0,.3)'; x.shadowBlur = 8; g = x.createLinearGradient(0, y, 0, y + 50); g.addColorStop(0, '#fff7cf'); g.addColorStop(1, '#ffe07a'); x.fillStyle = g; rr(x, LX, y, LW, 50, 25); x.fill(); x.restore();
      x.strokeStyle = '#d9a520'; x.lineWidth = 2; rr(x, LX, y, LW, 50, 25); x.stroke(); trophy(x, LX + 36, y + 22, 22);
      x.fillStyle = '#7a4b00'; fit(x, t, 700, 28, LW - 90); x.fillText(t, RC + 20, y + 35); y += 64 }
    // header
    x.save(); x.shadowColor = 'rgba(0,60,20,.3)'; x.shadowBlur = 8; g = x.createLinearGradient(0, y, 0, y + 62); g.addColorStop(0, '#42c255'); g.addColorStop(1, '#14783a'); x.fillStyle = g; rr(x, RC - 210, y, 420, 62, 31); x.fill(); x.restore();
    laurel(x, RC - 250, y + 26, 50, 1); laurel(x, RC + 250, y + 26, 50, -1);
    x.font = K(800, 44, 1); const hwid = x.measureText(head).width; trophy(x, RC - hwid / 2 - 14, y + 26, 24); x.fillStyle = '#fff'; fit(x, head, 800, 44, 330, 1); x.fillText(head, RC + 24, y + 47);
    y += 78;
    // list
    const boxTop = y;
    x.save(); x.shadowColor = 'rgba(0,40,90,.18)'; x.shadowBlur = 14; rr(x, LX - 14, boxTop, LW + 28, listH, 26); x.fillStyle = 'rgba(255,255,255,.85)'; x.fill(); x.restore();
    x.strokeStyle = 'rgba(80,150,220,.5)'; x.lineWidth = 2; rr(x, LX - 14, boxTop, LW + 28, listH, 26); x.stroke();
    const cw = (LW + 4) / cols, fs = Math.min(cols > 1 ? 27 : 34, rh * .56);
    x.font = K(800, fs, 1); const kw = x.measureText('เหรียญทองแดง :').width;
    rows.forEach((r, i) => {
      const col = Math.floor(i / per), ry = boxTop + 10 + (i % per) * rh, x0 = LX - 2 + col * cw, mr = Math.min(rh * .34, 22);
      g = x.createLinearGradient(x0, 0, x0 + cw, 0); g.addColorStop(0, 'rgba(225,240,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,.4)'); rr(x, x0 + 8, ry + 4, cw - 16, rh - 8, (rh - 8) / 2); x.fillStyle = g; x.fill();
      if (r.lv != null) medal(x, x0 + 20 + mr, ry + rh / 2 - mr * .15, mr, r.lv);
      else { x.beginPath(); x.arc(x0 + 20 + mr, ry + rh / 2, mr, 0, 7); x.fillStyle = '#1f63c6'; x.fill(); x.fillStyle = '#fff'; x.font = K(700, mr * 1.1); swimmer(x, x0 + 20 + mr, ry + rh / 2 + mr * .1, mr * .62, '#fff') }
      x.textAlign = 'left'; const tx = x0 + 34 + mr * 2; let vx = tx;
      if (cols === 1 && r.lv != null) { x.fillStyle = r.lv === 0 ? '#9a6a00' : r.lv === 1 ? '#3a4f6b' : r.lv === 2 ? '#8a4a1d' : NAVY; x.font = K(800, fs, 1); x.fillText(r.k + ' :', tx, ry + rh / 2 + fs * .36); vx = tx + kw + 18 }
      const tagW = 0;
      x.fillStyle = '#10233f'; fit(x, r.v, cols > 1 ? 700 : 500, fs, x0 + cw - 18 - vx - tagW); x.fillText(r.v, vx, ry + rh / 2 + fs * .36); x.textAlign = 'center';
    });

    }
    // footer: text on the plate's wave band
    g = x.createLinearGradient(0, footY + 10, 0, H); g.addColorStop(0, 'rgba(10,80,160,0)'); g.addColorStop(.45, 'rgba(10,80,160,.35)'); g.addColorStop(1, 'rgba(8,60,130,.55)'); x.fillStyle = g; x.fillRect(0, footY + 10, W, H - footY);
    swimmer(x, 175, footY + 75, 46, '#ffffff');
    x.save(); x.shadowColor = 'rgba(0,30,80,.55)'; x.shadowBlur = 10; x.fillStyle = '#fff'; fit(x, 'ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', 800, 50, 720, 1); x.fillText('ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', W / 2 + 70, footY + 82);
    x.font = K(500, 24); x.fillText('S R I A R U N O T H A I   S W I M M I N G   C L U B   ( S S C )', W / 2 + 70, footY + 120); x.restore();
    return c;
  }

  function caption(i) {
    const nm = `${i.g === 'F' ? 'ด.ญ.' : 'ด.ช.'}${i.disp}`, cnt = [0, 0, 0]; i.medals.forEach(m => cnt[m.lv]++);
    const lines = [`🎉 ขอแสดงความยินดีกับ ${nm}${i.cls ? ' ชั้น ' + i.cls : ''} ${i.catL}`, '', 'การแข่งขันว่ายน้ำ อบจ.กระบี่ SWIMMING CHAMPIONSHIP ชิงแชมป์ภาคใต้ ครั้งที่ 16 ประจำปี 2569', '📅 7–8 พฤศจิกายน 2569 · 📍 สระว่ายน้ำ โรงเรียนโภคาพาณิชย์นุกูลมูลนิธิ จ.กระบี่', ''];
    if (i.medals.length) { lines.push(`🏅 รางวัลที่ได้ ${['🥇', '🥈', '🥉'].map((e, k) => cnt[k] ? `${e}${cnt[k]}` : '').filter(Boolean).join(' ')}`); i.medals.forEach(m => lines.push(`${['🥇', '🥈', '🥉'][m.lv]} ${LV[m.lv]} ${m.ev}`)) }
    if (i.part.length) { lines.push('', '🏊 รายการที่เข้าร่วมแข่งขัน'); i.part.forEach(d => lines.push(`• ${d.ev}`)) }
    if (i.rk && i.rk <= 6) lines.push(`🏆 ถ้วยนักกีฬายอดเยี่ยมประเภทบุคคล อันดับที่ ${i.rk} ${i.catL}`);
    lines.push('', 'ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย (SSC)', '#SSC #ศรีอรุโณทัย #ว่ายน้ำ');
    return lines.join('\n');
  }

  // ---------- photo input ----------
  function pickFile() {
    return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'; document.body.appendChild(i);
      const done = f => { i.remove(); res(f) }; i.addEventListener('change', () => done(i.files && i.files[0]), { once: true }); i.addEventListener('cancel', () => done(null), { once: true }); i.click() });
  }
  function hasAlpha(im) {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); x.drawImage(im, 0, 0, s, s);
    const d = x.getImageData(0, 0, s, s).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 200) n++; return n > s * s * .04;
  }
  function trimAlpha(im) { // crop transparent margins
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y += 2) for (let xx = 0; xx < c.width; xx += 2) if (d[(y * c.width + xx) * 4 + 3] > 20) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 <= x0 || y1 <= y0) return c; const o = document.createElement('canvas'); o.width = x1 - x0 + 2; o.height = y1 - y0 + 2; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
  }
  async function prepPhoto(f) {
    const u = URL.createObjectURL(f); let im; try { im = await loadImg(u) } finally { URL.revokeObjectURL(u) }
    const a = hasAlpha(im); let src = a ? trimAlpha(im) : im;
    const maxH = a ? 1100 : 1000, s = Math.min(1, maxH / src.height, 800 / src.width), c = document.createElement('canvas');
    c.width = Math.round(src.width * s); c.height = Math.round(src.height * s); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    let url = a ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .88);
    if (a && url.length > 2800000) { const k = Math.sqrt(2600000 / url.length), c2 = document.createElement('canvas'); c2.width = Math.round(c.width * k); c2.height = Math.round(c.height * k); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); url = c2.toDataURL('image/png') }
    return url;
  }
  async function photoObj(url) { if (!url) return null; try { const im = await loadImg(url); return { im, alpha: /^data:image\/png/.test(url) && hasAlpha(im) } } catch (e) { return null } }

  // ---------- UI ----------
  const css = `.pf-ov{position:fixed;inset:0;z-index:400;isolation:isolate;transform:translateZ(0);background:#081a2b;overflow-y:auto;-webkit-overflow-scrolling:touch;color:#fff;font-family:'IBM Plex Sans Thai',system-ui,sans-serif}
  .pf-in{max-width:460px;margin:0 auto;padding:22px 18px 40px;display:flex;flex-direction:column;gap:14px}
  .pf-in h3{margin:0;font-family:'Prompt',sans-serif;font-size:19px}
  .pf-in label{font-size:13.5px;opacity:.85;display:block;margin-bottom:6px}
  .pf-in input[type=text]{width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:12px 14px;font:600 17px 'IBM Plex Sans Thai',sans-serif;background:#fff;color:#0d2236}
  .pf-ph{display:flex;gap:14px;align-items:center}
  .pf-th{width:96px;height:128px;border-radius:14px;background:repeating-conic-gradient(#2a3d52 0 25%,#1d2f42 0 50%) 0 0/16px 16px;display:grid;place-items:center;overflow:hidden;flex:0 0 auto;font-size:30px}
  .pf-th img{max-width:100%;max-height:100%}
  .pf-b{border:0;border-radius:12px;padding:12px 14px;font:700 15px 'IBM Plex Sans Thai',sans-serif;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
  .pf-b.ok{background:#14b8c4;color:#062033}.pf-b.gold{background:#ffd23f;color:#3a2a00}.pf-b.del{background:none;color:#ffb4b4;text-decoration:underline;padding:6px 0}
  .pf-row{display:flex;gap:10px}.pf-row>*{flex:1}
  .pf-hint{font-size:12.5px;line-height:1.55;opacity:.78;background:rgba(255,255,255,.06);border-radius:12px;padding:10px 12px}
  .pf-img{width:100%;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5);display:block}
  .pf-cap{width:100%;box-sizing:border-box;min-height:150px;border-radius:12px;border:0;padding:10px 12px;font:14px 'IBM Plex Sans Thai',sans-serif;background:#0f2a40;color:#e8eef5}
  .pf-spin{display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:pfspin .8s linear infinite;vertical-align:middle;margin-right:6px}
  @keyframes pfspin{to{transform:rotate(1turn)}}
  .pf-seg{display:flex;background:rgba(255,255,255,.08);border-radius:12px;padding:4px;gap:4px}
  .pf-seg button{flex:1;border:0;border-radius:9px;padding:10px 6px;font:600 14.5px 'IBM Plex Sans Thai',sans-serif;background:none;color:#cfe0ef;cursor:pointer}
  .pf-seg button.on{background:#fff;color:#0b3d91;box-shadow:0 2px 6px rgba(0,0,0,.25)}
  .pf-seg button:disabled{opacity:.35;cursor:not-allowed}
  .pf-stage{position:relative;min-height:200px;display:grid;place-items:center}
  .pf-stage.busy .pf-img{opacity:.45;transition:opacity .15s}
  .pf-ld{opacity:.85}
  .pf-stage.adj .pf-cv{touch-action:none;cursor:grab;outline:3px dashed #ffd23f;outline-offset:3px;width:min(100%,38vh);margin:0 auto}
  .pf-adj{display:flex;flex-direction:column;gap:10px;background:rgba(255,210,63,.08);border:1px solid rgba(255,210,63,.35);border-radius:14px;padding:12px}
  .pf-adj-h{font-size:13.5px;line-height:1.5}.pf-adj-h small{opacity:.7}
  .pf-zoom{display:flex;align-items:center;gap:10px;font-size:20px}.pf-zoom input{flex:1;accent-color:#ffd23f}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0d2236;color:#fff;padding:10px 16px;border-radius:12px;z-index:500;font:600 14px IBM Plex Sans Thai,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center'; document.body.appendChild(d); setTimeout(() => d.remove(), 2800) }

  function shell() {
    const ov = document.createElement('div'); ov.className = 'pf-ov'; document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    const close = () => { ov.remove(); document.body.style.overflow = ''; listeners.forEach(f => f()) };
    return [ov, close];
  }
  const listeners = [];
  const prefix = i => (i.g === 'F' ? 'ด.ญ.' : 'ด.ช.') + i.disp;

  // ---- profile information (class, profile photo, poster photo) with explicit save ----
  async function editProfile(name, after) {
    fonts();
    const [ov, close] = shell();
    ov.innerHTML = `<div class="pf-in"><h3>👤 ข้อมูลโปรไฟล์</h3><div><span class="pf-spin"></span>กำลังโหลด…</div><button class="pf-b x">ปิด</button></div>`;
    ov.querySelector('.x').onclick = close;
    await ready;
    const info0 = gather(name), saved = await postOf(name);
    let cls = clsOf(name), post = saved, dirty = false;
    const prof = () => (window.Photos && Photos.get && Photos.get(name)) || null;
    const draw = () => {
      const pp = prof();
      ov.innerHTML = `<div class="pf-in"><h3>👤 ข้อมูลโปรไฟล์<br><span style="font-size:15px;opacity:.85">${esc(prefix(info0))} · ${esc(info0.catL)}</span></h3>
        <div><label>รูปโปรไฟล์ (วงกลม ใช้ทั่วแอป)</label><div class="pf-ph"><div class="pf-th" style="width:96px;height:96px;border-radius:50%">${pp ? `<img src="${pp}" alt="" style="width:100%;height:100%;object-fit:cover">` : '🙂'}</div>
          <div style="flex:1"><button class="pf-b gold" id="pf-prof" style="width:100%">${pp ? 'เปลี่ยนรูปโปรไฟล์' : 'เพิ่มรูปโปรไฟล์'}</button></div></div></div>
        <div><label>ชั้นเรียน (เว้นว่างได้ ถ้าไม่ต้องการแสดง)</label><input type="text" id="pf-cls" maxlength="16" placeholder="เช่น ป.5/1" value="${esc(cls)}"></div>
        <div><label>รูปสำหรับโพสต์ Facebook (รูปยืนเต็มตัว)</label><div class="pf-ph"><div class="pf-th">${post ? `<img src="${post}" alt="">` : '🧒'}</div>
          <div style="display:flex;flex-direction:column;gap:6px;flex:1"><button class="pf-b gold" id="pf-pick">${post ? 'เปลี่ยนรูป' : 'เลือกรูป'}</button>${post ? '<button class="pf-b del" id="pf-del">ลบรูปนี้</button>' : ''}</div></div></div>
        <div class="pf-hint">✨ <b>สวยที่สุด:</b> รูปตัดพื้นหลังแล้ว (PNG พื้นใส)<br>iPhone: เปิดรูปในแอปรูปภาพ → กดค้างที่ตัวน้องจนมีขอบเรืองแสง → <b>แชร์ → บันทึกภาพ</b> แล้วกลับมาเลือกรูปนั้น<br>รูปธรรมดาก็ใช้ได้ จะแสดงในกรอบมุมโค้ง · ไม่มีรูป จะใช้รูปโปรไฟล์แทน<br>ข้อมูลเป็นของชมรม ใครก็แก้ให้กันได้ · บันทึกแล้วทุกเครื่องเห็น</div>
        <div class="pf-row"><button class="pf-b x">ยกเลิก</button><button class="pf-b ok" id="pf-save">💾 บันทึก</button></div></div>`;
      const ci = ov.querySelector('#pf-cls'); ci.oninput = () => { cls = ci.value; dirty = true };
      ov.querySelector('.x').onclick = () => { if (dirty && !confirmLeave()) return; close() };
      ov.querySelector('#pf-prof').onclick = () => { cls = ci.value; if (window.Photos) Photos.editPhoto(name) };
      ov.querySelector('#pf-pick').onclick = async () => { cls = ci.value; const f = await pickFile(); if (!f) return; const b = ov.querySelector('#pf-pick'); b.disabled = true; b.innerHTML = '<span class="pf-spin"></span>กำลังเตรียมรูป';
        try { post = await prepPhoto(f); dirty = true } catch (e) { toast('เปิดรูปนี้ไม่ได้ ลองรูปอื่น (JPG/PNG)') } draw() };
      const d = ov.querySelector('#pf-del'); if (d) d.onclick = () => { cls = ci.value; post = null; dirty = true; draw() };
      ov.querySelector('#pf-save').onclick = async () => {
        cls = ci.value; const b = ov.querySelector('#pf-save'); b.disabled = true; b.innerHTML = '<span class="pf-spin"></span>กำลังบันทึก';
        let okAll = true;
        okAll = (await saveCls(name, cls)) && okAll;
        if (post !== saved) okAll = (await savePost(name, post)) && okAll;
        toast(okAll || !cloud ? '✓ บันทึกข้อมูลโปรไฟล์แล้ว' : '⚠️ บันทึกไว้ในเครื่องนี้ ยังไม่ขึ้นระบบ ลองใหม่ภายหลัง');
        close(); if (after) after();
      };
    };
    const confirmLeave = () => confirm('ยังไม่ได้บันทึก ต้องการปิดหรือไม่?');
    // refresh the profile-photo thumbnail after the crop dialog saves
    if (window.Photos) Photos.onChange(() => { if (document.body.contains(ov)) draw() });
    draw();
  }

  // ---- poster: rendered straight away, like the old certificate ----
  async function showPost(name) {
    fonts();
    const [ov, close] = shell();
    ov.innerHTML = `<div class="pf-in"><h3>📣 โพสต์แสดงความยินดี</h3><div><span class="pf-spin"></span>กำลังสร้างภาพ…</div><button class="pf-b x">ปิด</button></div>`;
    let closed = false; ov.querySelector('.x').onclick = () => { closed = true; close() };
    await ready;
    const info = gather(name), ph = await photoObj(await postOf(name)), cap0 = { v: null };
    const hasFull = !!ph, hasMed = info.medals.length > 0, hasPart = info.part.length > 0;
    const o = optsOf(name);
    let layout = hasFull ? (o.layout === 'center' ? 'center' : 'full') : 'center';
    let only = hasMed && hasPart && o.only === 'medal' ? 'medal' : 'all', style = o.style === 'B' ? 'B' : 'A';
    const crops = Object.assign({}, o.c || {});
    const vkey = () => style + (layout === 'full' && hasFull ? 'f' : 'c');
    const hasImg = () => (layout === 'full' && hasFull) || !!(window.Photos && Photos.get && Photos.get(name));
    const cur = () => crops[vkey()] || [1, 0, 0];
    const persist = () => saveOpts(name, { layout, only, style, c: crops });
    let url = null, file = null, adjusting = false, busy = false, pending = false, blobT = null, saveT = null, slot = null;
    const seg = (id, items, cv) => `<div class="pf-seg" id="${id}">${items.map(([v, l, dis]) => `<button data-v="${v}" class="${v === cv ? 'on' : ''}" ${dis ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
    const miss = [!info.cls && 'ชั้นเรียน', !hasFull && 'รูปเต็มตัว'].filter(Boolean);
    ov.innerHTML = `<div class="pf-in"><h3>📣 ${esc(prefix(info))}</h3>
      ${seg('pf-sty', [['A', '🌿 แบบ A · สดใส'], ['B', '🌊 แบบ B · เข้ม']], style)}
      ${seg('pf-lay', [['full', '🧍 รูปเต็มตัว', !hasFull], ['center', '⭕ วงกลมกลาง']], layout)}
      ${hasMed && hasPart ? seg('pf-only', [['all', 'ทุกรายการ'], ['medal', 'เฉพาะที่ได้เหรียญ']], only) : ''}
      <div class="pf-stage"><canvas class="pf-img pf-cv" width="1080" height="1350"></canvas><img class="pf-img pf-pic" alt="" style="display:none"><div class="pf-ld" style="position:absolute"><span class="pf-spin"></span>กำลังสร้างภาพ…</div></div>
      <div class="pf-adj" style="display:none"><div class="pf-adj-h">✋ ลากรูปเพื่อเลื่อน · ปรับขนาดด้วยแถบด้านล่าง<br><small>ค่าที่ปรับจะจำแยกตามแบบโพสต์</small></div>
        <div class="pf-zoom"><span>－</span><input type="range" id="pf-z" min="0.5" max="3" step="0.01"><span>＋</span></div>
        <div class="pf-row"><button class="pf-b" id="pf-reset">↺ รีเซ็ต</button><button class="pf-b ok" id="pf-done">✓ เสร็จ</button></div></div>
      <button class="pf-b" id="pf-adjbtn">✂️ ปรับตำแหน่ง/ขนาดรูปในโพสต์</button>
      ${miss.length ? `<div class="pf-hint">💡 ยังไม่มี${miss.join('และ')} · เพิ่มได้ที่ <b>👤 ข้อมูลโปรไฟล์</b>${!hasFull ? ' (แบบรูปเต็มตัวจะเลือกได้เมื่อมีรูป)' : ''}</div>` : ''}
      <div class="pf-row" id="pf-act"></div>
      <div><label>ข้อความสำหรับโพสต์</label><textarea class="pf-cap" id="pf-cap"></textarea></div>
      <button class="pf-b" id="pf-copy">📋 คัดลอกข้อความ</button>
      <div class="pf-hint">ขั้นตอนโพสต์: คัดลอกข้อความ → แชร์รูปเข้า Facebook → วางข้อความ</div>
      <div class="pf-row"><button class="pf-b" id="pf-edit">👤 ข้อมูลโปรไฟล์</button><button class="pf-b x">ปิด</button></div></div>`;
    const stage = ov.querySelector('.pf-stage'), cv = ov.querySelector('.pf-cv'), pic = ov.querySelector('.pf-pic'), act = ov.querySelector('#pf-act'), capEl = ov.querySelector('#pf-cap');
    const adjBox = ov.querySelector('.pf-adj'), adjBtn = ov.querySelector('#pf-adjbtn'), zEl = ov.querySelector('#pf-z');
    function showPic(on) { pic.style.display = on ? '' : 'none'; cv.style.display = on ? 'none' : '' }
    async function makeBlob(c) {
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92)); if (closed) return;
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob);
      file = new File([blob], `SSC-ยินดี-${info.disp.split(' ')[0]}.jpg`, { type: 'image/jpeg' });
      pic.src = url; if (!adjusting) showPic(true);
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
      act.innerHTML = `${canShare ? '<button class="pf-b ok" id="pf-sh">แชร์รูป</button>' : ''}<a class="pf-b ${canShare ? '' : 'ok'}" style="text-align:center;text-decoration:none" href="${url}" download="${file.name}">ดาวน์โหลด</a>`;
      const sh = act.querySelector('#pf-sh'); if (sh) sh.onclick = async () => { try { await navigator.clipboard.writeText(capEl.value) } catch (e) { } navigator.share({ files: [file] }).catch(() => { }) };
    }
    async function draw() {
      if (busy) { pending = true; return } busy = true;
      try {
        do {
          pending = false;
          const inf = only === 'medal' ? Object.assign({}, info, { part: [] }) : info;
          const c = await (style === 'B' ? renderB : render)(info, ph, { layout, only, crop: cur() });
          slot = SLOT; if (closed) return;
          cv.getContext('2d').drawImage(c, 0, 0); const ld = stage.querySelector('.pf-ld'); if (ld) ld.remove();
          if (!adjusting) showPic(false);
          clearTimeout(blobT); blobT = setTimeout(() => makeBlob(c), adjusting ? 500 : 0);
          if (cap0.v === null || capEl.value === cap0.v) { cap0.v = caption(inf); capEl.value = cap0.v }
        } while (pending && !closed);
      } finally { busy = false }
      adjBtn.style.display = hasImg() && !adjusting ? '' : 'none';
    }
    const changed = () => { draw(); clearTimeout(saveT); saveT = setTimeout(persist, 700) };
    const setCrop = (z, dx, dy) => { crops[vkey()] = [Math.round(z * 100) / 100, Math.round(dx * 1000) / 1000, Math.round(dy * 1000) / 1000]; changed() };
    // adjust mode
    function setAdjust(on) { adjusting = on; adjBox.style.display = on ? '' : 'none'; adjBtn.style.display = on || !hasImg() ? 'none' : ''; stage.classList.toggle('adj', on); showPic(!on && !!url); zEl.value = cur()[0]; if (on) setTimeout(() => stage.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30) }
    adjBtn.onclick = () => setAdjust(true);
    ov.querySelector('#pf-done').onclick = () => { setAdjust(false); clearTimeout(saveT); persist(); draw() };
    ov.querySelector('#pf-reset').onclick = () => { delete crops[vkey()]; zEl.value = 1; changed() };
    zEl.oninput = () => { const [, dx, dy] = cur(); setCrop(+zEl.value, dx, dy) };
    const pts = new Map(); let pinch = null;
    cv.addEventListener('pointerdown', e => { if (!adjusting) return; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }) });
    cv.addEventListener('pointermove', e => {
      if (!adjusting || !pts.has(e.pointerId) || !slot) return;
      const p0 = pts.get(e.pointerId), k = 1080 / cv.getBoundingClientRect().width; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) { const [, dx, dy] = cur(); const z = Math.max(.5, Math.min(3, pinch.z * d / pinch.d)); zEl.value = z; setCrop(z, dx, dy) } else pinch = { d, z: cur()[0] }; return }
      const [z, dx, dy] = cur(); setCrop(z, dx + (e.clientX - p0.x) * k / slot.w, dy + (e.clientY - p0.y) * k / slot.h);
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const bindSeg = (id, set) => { const el = ov.querySelector('#' + id); if (!el) return; el.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (b.disabled || b.classList.contains('on')) return; el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); set(b.dataset.v); zEl.value = cur()[0]; persist(); draw() }) };
    bindSeg('pf-sty', v => style = v); bindSeg('pf-lay', v => layout = v); bindSeg('pf-only', v => only = v);
    const done = () => { closed = true; clearTimeout(saveT); if (url) URL.revokeObjectURL(url); close() };
    ov.querySelectorAll('.x').forEach(b => b.onclick = () => { if (saveT) persist(); done() });
    ov.querySelector('#pf-edit').onclick = () => { done(); editProfile(name, () => showPost(name)) };
    ov.querySelector('#pf-copy').onclick = async () => { try { await navigator.clipboard.writeText(capEl.value); toast('✓ คัดลอกข้อความแล้ว') } catch (e) { capEl.select(); document.execCommand('copy'); toast('✓ คัดลอกแล้ว') } };
    draw();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-post]'), p = e.target.closest('[data-profile]'); if (!b && !p) return;
    e.preventDefault(); e.stopPropagation(); b ? showPost(b.dataset.post) : editProfile(p.dataset.profile);
  }, true);
  window.Post = { renderB, open: showPost, showPost, editProfile, render, gather, caption, cls: clsOf, ready, onChange: f => listeners.push(f), _photo: photoObj };
})();
