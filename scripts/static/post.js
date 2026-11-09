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
      const r = await fetch(c.url + '/rest/v1/athlete_info?select=athlete,cls,updated_at', { headers: hdr(c), cache: 'no-store' });
      if (!r.ok) throw 0;
      (await r.json()).forEach(x => { if (x.cls !== null) CLS[x.athlete] = x.cls; if (POSTT[x.athlete] && POSTT[x.athlete] !== x.updated_at) delete POST[x.athlete] });
      cloud = true;
    } catch (e) { cloud = false }
  }
  const ready = sync();

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
    const done = ind.filter(r => r.res && r.res.pl).sort((a, b) => a.ev - b.ev).map(r => ({ pl: r.res.pl, ev: evName(EV[r.ev]), t: r.res.f }));
    return { name: n, disp: dispName(n), g, catL: `รุ่น ${ageL(e0.age)}${G[g]}`, medals, done, rk: me.rk, cls: clsOf(n) };
  }

  // ---------- fonts ----------
  let fontsP = null;
  function fonts() {
    if (fontsP) return fontsP;
    const TH = 'U+0E01-0E5B,U+200C-200D,U+25CC', LA = 'U+0000-00FF,U+2013-2014,U+2018-201E,U+2026';
    const fs = [];
    [['500', 'normal'], ['700', 'normal'], ['800', 'italic']].forEach(([w, s]) => {
      [['thai', TH], ['latin', LA]].forEach(([sub, ur]) => { try { const f = new FontFace('KanitP', `url(kanit-${sub}-${w}-${s}.woff2)`, { weight: w, style: s, unicodeRange: ur }); document.fonts.add(f); fs.push(f.load()) } catch (e) { } });
    });
    fontsP = Promise.race([Promise.all(fs), new Promise(r => setTimeout(r, 4000))]).catch(() => { });
    return fontsP;
  }
  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src });

  // ---------- drawing helpers ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
  const K = (w, s, it) => `${it ? 'italic ' : ''}${w} ${s}px KanitP, 'IBM Plex Sans Thai', sans-serif`;
  function fit(x, t, w0, sz, maxW, it) { let s = sz; x.font = K(w0, s, it); while (x.measureText(t).width > maxW && s > 14) { s -= 2; x.font = K(w0, s, it) } return s }
  function rnd(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647 }
  function medal(x, cx, cy, r, lv) {
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

  async function render(info, photo) {
    await fonts();
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const NAVY = '#0b3d91', GREEN = '#1f9d43', RC = 700;
    // background
    let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#f3fbff'); g.addColorStop(.45, '#d6effd'); g.addColorStop(1, '#9fd6f5'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(260, 760, 40, 260, 760, 620); g.addColorStop(0, 'rgba(56,170,235,.55)'); g.addColorStop(1, 'rgba(56,170,235,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    // pool lane lines (left)
    for (let i = 0; i < 5; i++) { const y = 560 + i * 120; x.save(); x.globalAlpha = .18; for (let k = 0; k < 18; k++) { x.beginPath(); x.arc(-20 + k * 26, y + k * 3, 10, 0, 7); x.fillStyle = k % 3 ? '#ffffff' : '#e23b3b'; x.fill() } x.restore() }
    // corner swooshes
    swoosh(x, [0, 0, 260, 0, 120, 60, 0, 230, 0, 230, 0, 230], '#52c55e', '#1f9d43', 0, 230);
    swoosh(x, [W, 0, W - 260, 0, W - 120, 70, W, 250, W, 250, W, 250], '#52c55e', '#1f9d43', 0, 250);
    x.save(); x.globalAlpha = .55; swoosh(x, [0, 0, 330, 0, 160, 110, 0, 330, 0, 330, 0, 330], '#bfe9a8', 'rgba(255,255,255,0)', 0, 330); x.restore();
    // splash dots
    const rn = rnd(7); for (let i = 0; i < 70; i++) { const px = 330 + rn() * 750, py = 140 + rn() * 900, r = 2 + rn() * 7; x.beginPath(); x.arc(px, py, r, 0, 7); x.fillStyle = `rgba(${rn() > .5 ? '30,150,230' : '255,255,255'},${.25 + rn() * .5})`; x.fill() }
    for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(380, 360 + i * 22); x.bezierCurveTo(600, 280 + i * 30, 820, 420 + i * 10, 1080, 300 + i * 25); x.strokeStyle = `rgba(255,255,255,${.5 - i * .12})`; x.lineWidth = 10 - i * 3; x.stroke() }

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
    const footY = 1205, TOP = 540, BOT = footY - 22;
    const hasMed = info.medals.length > 0, head = hasMed ? 'รางวัลที่ได้ :' : 'ผลงานการแข่งขัน :';
    const rows = hasMed ? info.medals.map(m => ({ k: LV[m.lv], v: m.ev, lv: m.lv })) : info.done.slice(0, 7).map(d => ({ k: d.ev, v: d.t, pl: 0 }));
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
      if (photo.alpha) { const maxH = footY + 60 - 190, maxW = 520, s = Math.min(maxH / im.height, maxW / im.width), w = im.width * s, h = im.height * s;
        x.save(); x.shadowColor = 'rgba(0,30,70,.35)'; x.shadowBlur = 24; x.shadowOffsetX = 6; x.drawImage(im, 230 - w / 2, footY + 60 - h, w, h); x.restore() }
      else { const fw = 340, fh = Math.min(620, BOT - 560), fx = 30, fy = Math.max(545, Math.min(BOT - fh, midY - fh / 2)), s = Math.max(fw / im.width, fh / im.height), w = im.width * s, h = im.height * s;
        x.save(); x.shadowColor = 'rgba(0,30,70,.35)'; x.shadowBlur = 20; rr(x, fx - 8, fy - 8, fw + 16, fh + 16, 34); g = x.createLinearGradient(fx, fy, fx + fw, fy + fh); g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#c58b12'); x.fillStyle = g; x.fill(); x.restore();
        x.save(); rr(x, fx, fy, fw, fh, 28); x.clip(); x.drawImage(im, fx + (fw - w) / 2, fy + (fh - h) * .2, w, h); x.restore() }
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
      if (cols === 1) { x.fillStyle = r.lv === 0 ? '#9a6a00' : r.lv === 1 ? '#3a4f6b' : r.lv === 2 ? '#8a4a1d' : NAVY; x.font = K(800, fs, 1); x.fillText(r.k + (r.lv != null ? ' :' : ''), tx, ry + rh / 2 + fs * .36); vx = r.lv != null ? tx + kw + 18 : tx + x.measureText(r.k).width + 24 }
      x.fillStyle = '#10233f'; fit(x, r.v, cols > 1 ? 700 : 500, fs, x0 + cw - 18 - vx); x.fillText(r.v, vx, ry + rh / 2 + fs * .36); x.textAlign = 'center';
    });

    // footer band
    swoosh(x, [0, footY, 300, footY - 50, 700, footY + 40, W, footY - 30, W, footY - 30, W, footY - 30, W, H, W, H, W, H, 0, H, 0, H, 0, H], '#a6e08a', '#a6e08a', footY, H);
    swoosh(x, [0, footY + 20, 320, footY - 25, 720, footY + 55, W, footY - 5, W, footY - 5, W, footY - 5, W, H, W, H, W, H, 0, H, 0, H, 0, H], '#35b04a', '#0f6e30', footY, H);
    swimmer(x, 175, footY + 75, 46, '#ffffff');
    x.fillStyle = '#fff'; fit(x, 'ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', 800, 50, 720, 1); x.save(); x.shadowColor = 'rgba(0,40,10,.4)'; x.shadowBlur = 6; x.fillText('ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', W / 2 + 70, footY + 82); x.restore();
    x.font = K(500, 24); x.fillText('S R I A R U N O T H A I   S W I M M I N G   C L U B   ( S S C )', W / 2 + 70, footY + 120);
    return c;
  }

  function caption(i) {
    const nm = `${i.g === 'F' ? 'ด.ญ.' : 'ด.ช.'}${i.disp}`, cnt = [0, 0, 0]; i.medals.forEach(m => cnt[m.lv]++);
    const lines = [`🎉 ขอแสดงความยินดีกับ ${nm}${i.cls ? ' ชั้น ' + i.cls : ''} ${i.catL}`, '', 'การแข่งขันว่ายน้ำ อบจ.กระบี่ SWIMMING CHAMPIONSHIP ชิงแชมป์ภาคใต้ ครั้งที่ 16 ประจำปี 2569', '📅 7–8 พฤศจิกายน 2569 · 📍 สระว่ายน้ำ โรงเรียนโภคาพาณิชย์นุกูลมูลนิธิ จ.กระบี่', ''];
    if (i.medals.length) { lines.push(`🏅 รางวัลที่ได้ ${['🥇', '🥈', '🥉'].map((e, k) => cnt[k] ? `${e}${cnt[k]}` : '').filter(Boolean).join(' ')}`); i.medals.forEach(m => lines.push(`${['🥇', '🥈', '🥉'][m.lv]} ${LV[m.lv]} ${m.ev}`)) }
    else { lines.push('🏊 ผลงานการแข่งขัน'); i.done.slice(0, 7).forEach(d => lines.push(`• ${d.ev}  ${d.t}`)) }
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
  @keyframes pfspin{to{transform:rotate(1turn)}}`;
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
    const info = gather(name), c = await render(info, await photoObj(await postOf(name)));
    if (closed) return;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92)), url = URL.createObjectURL(blob);
    const file = new File([blob], `SSC-ยินดี-${info.disp.split(' ')[0]}.jpg`, { type: 'image/jpeg' }), cap = caption(info);
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const miss = [!info.cls && 'ชั้นเรียน', !POST[name] && 'รูปเต็มตัว'].filter(Boolean);
    ov.innerHTML = `<div class="pf-in"><h3>📣 ${esc(prefix(info))}</h3><img class="pf-img" src="${url}" alt="">
      ${miss.length ? `<div class="pf-hint">💡 ยังไม่มี${miss.join('และ')} — เพิ่มได้ที่ <b>👤 ข้อมูลโปรไฟล์</b></div>` : ''}
      <div class="pf-row">${canShare ? '<button class="pf-b ok" id="pf-sh">แชร์รูป</button>' : ''}<a class="pf-b ${canShare ? '' : 'ok'}" style="text-align:center;text-decoration:none" href="${url}" download="${file.name}">ดาวน์โหลด</a></div>
      <div><label>ข้อความสำหรับโพสต์</label><textarea class="pf-cap" id="pf-cap">${esc(cap)}</textarea></div>
      <button class="pf-b" id="pf-copy">📋 คัดลอกข้อความ</button>
      <div class="pf-hint">ขั้นตอนโพสต์: คัดลอกข้อความ → แชร์รูปเข้า Facebook → วางข้อความ</div>
      <div class="pf-row"><button class="pf-b" id="pf-edit">👤 ข้อมูลโปรไฟล์</button><button class="pf-b x">ปิด</button></div></div>`;
    const done = () => { URL.revokeObjectURL(url); close() };
    ov.querySelector('.x').onclick = done;
    ov.querySelector('#pf-edit').onclick = () => { done(); editProfile(name, () => showPost(name)) };
    ov.querySelector('#pf-copy').onclick = async () => { const t = ov.querySelector('#pf-cap').value; try { await navigator.clipboard.writeText(t); toast('✓ คัดลอกข้อความแล้ว') } catch (e) { const ta = ov.querySelector('#pf-cap'); ta.select(); document.execCommand('copy'); toast('✓ คัดลอกแล้ว') } };
    const sh = ov.querySelector('#pf-sh'); if (sh) sh.onclick = async () => { try { await navigator.clipboard.writeText(ov.querySelector('#pf-cap').value) } catch (e) { } navigator.share({ files: [file] }).catch(() => { }) };
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-post]'), p = e.target.closest('[data-profile]'); if (!b && !p) return;
    e.preventDefault(); e.stopPropagation(); b ? showPost(b.dataset.post) : editProfile(p.dataset.profile);
  }, true);
  window.Post = { open: showPost, showPost, editProfile, render, gather, caption, cls: clsOf, ready, onChange: f => listeners.push(f), _photo: photoObj };
})();
