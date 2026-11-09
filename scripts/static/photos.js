// Athlete photos (stored only on this device, IndexedDB) + crop UI + share card.
(function () {
  const DB = 'sri-photos', ST = 'p';
  const PH = {};                 // name -> dataURL (in-memory cache)
  const META = {};               // name -> {t: cloud updated_at, cloud: bool}
  const listeners = [];
  let db = null;

  function openDB() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ST);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e) }
    });
  }
  async function loadAll() {
    try {
      db = await openDB();
      await new Promise(res => {
        const tx = db.transaction(ST, 'readonly'), st = tx.objectStore(ST), cur = st.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { const v = c.value; if (typeof v === 'string') { PH[c.key] = v; META[c.key] = { t: '', cloud: false } } else { PH[c.key] = v.img; META[c.key] = { t: v.t || '', cloud: !!v.cloud } } c.continue() } else res() };
        cur.onerror = () => res();
      });
    } catch (e) { /* private mode etc: photos just won't persist */ }
    listeners.forEach(f => f());
    await syncCloud();
    setInterval(syncCloud, 120000);
  }
  // ---------- shared cloud (Supabase) ----------
  const CL = () => (typeof DATA !== 'undefined' && DATA.cloud && DATA.cloud.url) ? DATA.cloud : null;
  const hdr = c => ({ apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' });
  function store(name) {
    try { if (!db) return; const tx = db.transaction(ST, 'readwrite'), st = tx.objectStore(ST);
      PH[name] ? st.put({ img: PH[name], t: (META[name] || {}).t || '', cloud: !!(META[name] || {}).cloud }, name) : st.delete(name) } catch (e) { }
  }
  let cloudOK = null;
  async function syncCloud() {
    const c = CL(); if (!c) return;
    try {
      const r = await fetch(c.url + '/rest/v1/photos?select=athlete,updated_at', { headers: hdr(c), cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const list = await r.json(); cloudOK = true;
      const remote = {}; list.forEach(x => remote[x.athlete] = x.updated_at);
      const need = list.filter(x => !META[x.athlete] || !META[x.athlete].cloud || META[x.athlete].t !== x.updated_at).map(x => x.athlete);
      let changed = false;
      // removed in cloud -> remove local cloud copies
      Object.keys(META).forEach(n => { if (META[n].cloud && !remote[n]) { delete PH[n]; delete META[n]; store(n); changed = true } });
      for (let i = 0; i < need.length; i += 8) {
        const chunk = need.slice(i, i + 8), q = chunk.map(n => '"' + n.replace(/"/g, '') + '"').join(',');
        const rr = await fetch(c.url + '/rest/v1/photos?select=athlete,img,updated_at&athlete=in.(' + encodeURIComponent(q) + ')', { headers: hdr(c), cache: 'no-store' });
        if (!rr.ok) continue;
        (await rr.json()).forEach(x => { PH[x.athlete] = x.img; META[x.athlete] = { t: x.updated_at, cloud: true }; store(x.athlete); changed = true });
      }
      if (changed) listeners.forEach(f => f());
      offerUpload();
    } catch (e) { cloudOK = false }
  }
  async function rpc(fn, body) {
    const c = CL(); const r = await fetch(c.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: hdr(c), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('net');
    return r.json().catch(() => null);
  }
  async function upload(name, img) {
    if (!CL()) return 'local';
    try { await rpc('set_photo', { p_athlete: name, p_img: img }); return 'cloud' } catch (e) { return 'fail' }
  }
  function toast(t) { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0d2236;color:#fff;padding:10px 16px;border-radius:12px;z-index:120;font:600 14px IBM Plex Sans Thai,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:90vw;text-align:center'; document.body.appendChild(d); setTimeout(() => d.remove(), 2800) }
  let offered = false;
  function offerUpload() {
    if (offered || !cloudOK) return;
    const local = Object.keys(PH).filter(n => !(META[n] || {}).cloud);
    if (!local.length) return; offered = true;
    let dismissed = false; try { dismissed = sessionStorage.getItem('sri-offer') === '1' } catch (e) { }
    if (dismissed) return;
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:90;background:#0b4f8a;color:#fff;border-radius:16px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 10px 30px rgba(8,45,80,.35);font:14px IBM Plex Sans Thai,sans-serif;max-width:640px;margin:0 auto';
    bar.innerHTML = `<span style="flex:1">📤 มีรูปในเครื่องนี้ ${local.length} รูปที่คนอื่นยังไม่เห็น (${local.map(n => esc(n.split(' ')[0])).join(', ')})</span><button style="border:0;border-radius:10px;padding:8px 12px;font:inherit;font-weight:700;background:#ffd23f;color:#08263f;cursor:pointer">แชร์ให้ทุกคน</button><button aria-label="ปิด" style="border:0;background:none;color:#fff;font-size:18px;cursor:pointer">×</button>`;
    document.body.appendChild(bar);
    const [b1, b2] = bar.querySelectorAll('button');
    b2.onclick = () => { bar.remove(); try { sessionStorage.setItem('sri-offer', '1') } catch (e) { } };
    b1.onclick = async () => {
      b1.disabled = true; b1.textContent = 'กำลังส่ง…'; let ok = 0;
      for (const n of local) { const r = await upload(n, PH[n]); if (r === 'cloud') { META[n] = { t: '', cloud: true }; store(n); ok++ } else if (r === 'local') break }
      bar.remove(); toast(ok ? `✓ แชร์แล้ว ${ok} รูป ทุกเครื่องจะเห็นภายใน 2 นาที` : 'ยังไม่ได้แชร์รูป'); syncCloud();
    };
  }
  async function put(name, url) {
    const prev = PH[name], prevM = META[name];
    if (url) PH[name] = url; else delete PH[name];
    META[name] = { t: '', cloud: false }; store(name); listeners.forEach(f => f());
    if (!CL()) return;
    const r = await upload(name, url || null);
    if (r === 'cloud') { if (url) { META[name] = { t: '', cloud: true }; store(name) } else delete META[name]; toast(url ? '✓ บันทึกรูปแล้ว ทุกเครื่องจะเห็นภายใน 2 นาที' : '✓ ลบรูปแล้ว'); syncCloud() }
    else toast('⚠️ อัปขึ้นไม่สำเร็จ เก็บไว้ในเครื่องก่อน ลองใหม่ภายหลัง');
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = n => { const m = String(n).trim().match(/^[\u0e40-\u0e44]?[\u0e01-\u0e2eA-Za-z][\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]*/); return m ? m[0] : String(n).slice(0, 1) };

  // avatar HTML: photo if we have one, else gender-colored placeholder with initials
  function avatar(name, g, size, opts) {
    opts = opts || {};
    const s = size || 40, url = PH[name];
    const edit = opts.edit ? ` data-photo="${esc(name)}" role="button" tabindex="0" title="เพิ่ม/เปลี่ยนรูป"` : '';
    const badge = opts.edit ? `<span class="ph-cam">${url ? '✎' : '📷'}</span>` : '';
    const age = opts.age && !url ? `<span class="ph-age">${opts.age}</span>` : '';
    if (url) return `<span class="ph ph-${g}" style="width:${s}px;height:${s}px"${edit}><img src="${url}" alt="">${badge}</span>`;
    return `<span class="ph ph-${g} ph-empty" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .36)}px"${edit}><span class="ph-ini">${esc(initials(name))}</span>${age}${badge}</span>`;
  }

  // ---------- crop UI ----------
  const css = `
  .ph{position:relative;display:inline-grid;place-items:center;border-radius:50%;flex:0 0 auto;overflow:visible;vertical-align:middle}
  .ph img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.15)}
  .ph-empty{color:#fff;font-family:'Prompt','IBM Plex Sans Thai',sans-serif;font-weight:600}
  .ph-empty.ph-M{background:linear-gradient(135deg,#5aa2ee,#1f5fb8)}.ph-empty.ph-F{background:linear-gradient(135deg,#f08bb8,#b93374)}
  .ph-ini{line-height:1;letter-spacing:-.02em}
  .ph-age{position:absolute;bottom:-3px;left:-3px;background:#fff;color:#0d2236;font-size:10px;font-weight:700;border-radius:99px;padding:0 5px;line-height:15px;box-shadow:0 1px 3px rgba(0,0,0,.2);font-family:'IBM Plex Sans Thai',sans-serif}
  .ph-cam{position:absolute;right:-4px;bottom:-4px;width:24px;height:24px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.25);color:#0b4f8a}
  [data-photo]{cursor:pointer}
  .crop-ov{position:fixed;inset:0;z-index:400;isolation:isolate;transform:translateZ(0);-webkit-transform:translateZ(0);background:rgba(6,20,35,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;font-family:'IBM Plex Sans Thai',system-ui,sans-serif;padding:18px;touch-action:none}
  .crop-ov h3{margin:0;font-family:'Prompt',sans-serif;font-size:18px}
  .crop-stage{position:relative;width:min(80vw,320px);height:min(80vw,320px);border-radius:18px;overflow:hidden;background:#0b1b2b;touch-action:none}
  .crop-stage canvas{width:100%;height:100%;display:block}
  .crop-mask{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at center,transparent calc(50% - 1px),rgba(6,20,35,.6) 50%);}
  .crop-mask:after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.8)}
  .crop-zoom{width:min(80vw,320px);accent-color:#14b8c4}
  .crop-btns{display:flex;gap:10px;width:min(80vw,320px)}
  .crop-btns button{flex:1;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:700;cursor:pointer}
  .crop-btns .ok{background:#14b8c4;color:#062033}.crop-btns .no{background:rgba(255,255,255,.12);color:#fff}
  .crop-del{background:none;border:0;color:#ffb4b4;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline}
  .crop-hint{font-size:12.5px;opacity:.75;text-align:center;max-width:320px}
  .card-ov .card-img{max-width:min(94vw,900px);max-height:70vh;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function pickFile() {
    return new Promise(res => {
      // iOS Safari only fires 'change' reliably when the input is attached to the document
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
      i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(i);
      const done = f => { i.remove(); res(f) };
      i.addEventListener('change', () => done(i.files && i.files[0]), { once: true });
      i.addEventListener('cancel', () => done(null), { once: true });
      i.click();
    });
  }
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src }) }

  async function editPhoto(name) {
    const has = !!PH[name];
    const f = await pickFile(); if (!f) return;
    const url = URL.createObjectURL(f); let im;
    try { im = await loadImg(url) } catch (e) { URL.revokeObjectURL(url); toast('เปิดรูปนี้ไม่ได้ ลองเลือกรูปอื่น (JPG/PNG)'); return }
    const ov = document.createElement('div'); ov.className = 'crop-ov';
    ov.innerHTML = `<h3>ครอปรูป ${esc(name)}</h3><div class="crop-stage"><canvas width="640" height="640"></canvas><div class="crop-mask"></div></div>
      <input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="1" aria-label="ซูม">
      <div class="crop-hint">ลากเพื่อเลื่อน · ใช้สองนิ้วหรือแถบด้านบนเพื่อซูม<br>รูปจะแชร์ให้ทุกคนในแอปเห็น</div>
      <div class="crop-btns"><button class="no">ยกเลิก</button><button class="ok">บันทึกรูป</button></div>${has ? '<button class="crop-del">ลบรูปเดิม</button>' : ''}`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), cx = cv.getContext('2d'), zoomEl = ov.querySelector('.crop-zoom'), W = cv.width;
    const base = Math.max(W / im.width, W / im.height);
    let z = 1, ox = 0, oy = 0;
    function clamp() {
      const s = base * z, w = im.width * s, h = im.height * s;
      ox = Math.min(0, Math.max(W - w, ox)); oy = Math.min(0, Math.max(W - h, oy));
    }
    function center() { const s = base * z; ox = (W - im.width * s) / 2; oy = (W - im.height * s) / 2 }
    function draw() { clamp(); cx.fillStyle = '#0b1b2b'; cx.fillRect(0, 0, W, W); const s = base * z; cx.drawImage(im, ox, oy, im.width * s, im.height * s) }
    center(); draw();
    function setZoom(nz, px, py) {
      nz = Math.max(1, Math.min(4, nz)); const s0 = base * z, s1 = base * nz;
      px = px ?? W / 2; py = py ?? W / 2;
      ox = px - (px - ox) * s1 / s0; oy = py - (py - oy) * s1 / s0; z = nz; zoomEl.value = z; draw();
    }
    zoomEl.oninput = () => setZoom(+zoomEl.value);
    const pts = new Map(); let pinch0 = null;
    const scale = () => W / cv.getBoundingClientRect().width;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }) });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const p = pts.get(e.pointerId), k = scale();
      if (pts.size === 1) { ox += (e.clientX - p.x) * k; oy += (e.clientY - p.y) * k; draw() }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = cv.getBoundingClientRect();
        if (pinch0) setZoom(pinch0.z * d / pinch0.d, ((a.x + b.x) / 2 - r.left) * k, ((a.y + b.y) / 2 - r.top) * k);
        else pinch0 = { d, z };
      }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.08 : 0.93)) }, { passive: false });
    const close = () => { ov.remove(); URL.revokeObjectURL(url) };
    ov.querySelector('.no').onclick = close;
    const del = ov.querySelector('.crop-del'); if (del) del.onclick = () => { put(name, null); close() };
    ov.querySelector('.ok').onclick = () => {
      const out = document.createElement('canvas'); out.width = out.height = 480;
      out.getContext('2d').drawImage(cv, 0, 0, W, W, 0, 0, 480, 480);
      put(name, out.toDataURL('image/jpeg', 0.86)); close();
    };
  }

  // ---------- share card ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
  function wrap(x, text, maxW) { const words = String(text).split(/(\s+)/), lines = []; let cur = '';
    for (const w of words) { const t = cur + w; if (x.measureText(t).width > maxW && cur.trim()) { lines.push(cur.trim()); cur = w.trimStart() } else cur = t }
    if (cur.trim()) lines.push(cur.trim()); return lines }
  function disc(x, cx, cy, r, c1, c2, label, n, lc) {
    const g = x.createRadialGradient(cx - r * .35, cy - r * .35, r * .1, cx, cy, r); g.addColorStop(0, c1); g.addColorStop(1, c2);
    x.save(); x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 10; x.shadowOffsetY = 4; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fillStyle = g; x.fill(); x.restore();
    x.beginPath(); x.arc(cx, cy, r - 7, 0, 7); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.font = "700 46px Prompt, 'IBM Plex Sans Thai', sans-serif"; x.fillText(String(n), cx, cy + 16);
    x.fillStyle = lc || '#4a5a6a'; x.font = "600 22px 'IBM Plex Sans Thai', sans-serif"; x.fillText(label, cx, cy + r + 32);
  }
  async function shareCard(info) {
    // open the overlay first so the tap always gets visible feedback (iOS paints late)
    const ov = document.createElement('div'); ov.className = 'crop-ov card-ov';
    ov.innerHTML = `<h3>ประกาศนียบัตร ${esc(info.name)}</h3><div class="crop-hint" style="opacity:.9"><span style="display:inline-block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:ptrspin .8s linear infinite;vertical-align:middle;margin-right:6px"></span>กำลังสร้างใบประกาศ…</div><div class="crop-btns"><button class="no">ปิด</button></div>`;
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    let closed = false; ov.querySelector('.no').onclick = () => { closed = true; ov.remove(); document.body.style.overflow = '' };
    if (!document.getElementById('ptrspin-kf')) { const k = document.createElement('style'); k.id = 'ptrspin-kf'; k.textContent = '@keyframes ptrspin{to{transform:rotate(1turn)}}'; document.head.appendChild(k) }
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]) } catch (e) { }
    const W = 1754, H = 1240, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = (w, s) => `${w} ${s}px Prompt, 'IBM Plex Sans Thai', sans-serif`, T = (w, s) => `${w} ${s}px 'IBM Plex Sans Thai', sans-serif`;
    const ST = info.style || 'B', DARK = ST === 'B', SPLIT = ST === 'C';
    const NAVY = DARK ? '#f6e7b8' : '#0b3a66', GOLD = DARK ? '#d9b25a' : '#c99a2e', INK = DARK ? '#e8eef5' : '#33475b', MUT = DARK ? '#b9c6d4' : '#4a5a6a', ACC = DARK ? '#7fd3ff' : '#0e7ac4';
    // paper
    let g = x.createLinearGradient(0, 0, W, H); if (DARK) { g.addColorStop(0, '#071f3a'); g.addColorStop(.6, '#0b3a66'); g.addColorStop(1, '#0e5a8a') } else { g.addColorStop(0, '#fffdf7'); g.addColorStop(1, '#eef6fb') } x.fillStyle = g; x.fillRect(0, 0, W, H);
    if (SPLIT) { g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b4f8a'); g.addColorStop(1, '#14b8c4'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(640, 0); x.bezierCurveTo(560, 400, 700, 800, 600, H); x.lineTo(0, H); x.closePath(); x.fill() }
    // water waves bottom
    for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(0, H); for (let i = 0; i <= W; i += 8) x.lineTo(i, H - 120 + k * 26 + Math.sin(i / 90 + k * 1.3) * 14); x.lineTo(W, H); x.closePath();
      x.fillStyle = ['rgba(20,184,196,.10)', 'rgba(14,122,196,.10)', 'rgba(11,79,138,.10)', 'rgba(11,58,102,.12)'][k]; x.fill() }
    // frame
    if (!SPLIT) { x.strokeStyle = DARK ? '#d9b25a' : NAVY; x.lineWidth = 16; rr(x, 34, 34, W - 68, H - 68, 26); x.stroke() }
    if (!SPLIT) { x.strokeStyle = GOLD; x.lineWidth = 3; rr(x, 62, 62, W - 124, H - 124, 16); x.stroke();
    x.lineWidth = 1.5; rr(x, 72, 72, W - 144, H - 144, 12); x.stroke() }
    // corner ornaments
    (SPLIT ? [] : [[72, 72, 1, 1], [W - 72, 72, -1, 1], [72, H - 72, 1, -1], [W - 72, H - 72, -1, -1]]).forEach(([ox, oy, sx, sy]) => {
      x.save(); x.translate(ox, oy); x.scale(sx, sy); x.strokeStyle = GOLD; x.lineWidth = 3;
      for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(0, 0, 40 + k * 16, 0, Math.PI / 2); x.stroke() } x.restore() });
    // logos
    try { const lg = await loadImg(info.logo || 'logo.png'); x.save(); x.shadowColor = 'rgba(0,0,0,.15)'; x.shadowBlur = 12; x.drawImage(lg, SPLIT ? 235 : 120, SPLIT ? 70 : 105, SPLIT ? 150 : 170, SPLIT ? 150 : 170); x.restore() } catch (e) { }
    try { const ml = await loadImg('meet-logo.png'); const mw = SPLIT ? 260 : 330, mh = mw * ml.height / ml.width; SPLIT ? x.drawImage(ml, 1180 - mw / 2, 882, mw, mh) : x.drawImage(ml, W - 120 - mw, 92, mw, mh) } catch (e) { }
    // heading
    x.textAlign = 'center'; const CX = SPLIT ? 1180 : W / 2;
    x.fillStyle = ACC; x.font = T(600, 30); x.fillText('ชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย', CX, 150);
    x.fillStyle = NAVY; x.font = F(700, 78); x.fillText('ประกาศนียบัตร', CX, 238);
    x.strokeStyle = GOLD; x.lineWidth = 3; x.beginPath(); x.moveTo(CX - 230, 268); x.lineTo(CX - 30, 268); x.moveTo(CX + 30, 268); x.lineTo(CX + 230, 268); x.stroke();
    x.save(); x.translate(CX, 268); x.rotate(Math.PI / 4); x.fillStyle = GOLD; x.fillRect(-8, -8, 16, 16); x.restore();
    x.fillStyle = MUT; x.font = T(500, 30); x.fillText('มอบให้ไว้เพื่อแสดงว่า', CX, 325);
    // photo (left)
    const PX = SPLIT ? 310 : 330, PY = SPLIT ? 440 : 600, PR = SPLIT ? 180 : 165;
    x.save(); x.beginPath(); x.arc(PX, PY, PR + 14, 0, 7); g = x.createLinearGradient(PX - PR, PY - PR, PX + PR, PY + PR); g.addColorStop(0, '#f3d27a'); g.addColorStop(1, '#b8861f'); x.fillStyle = g; x.shadowColor = 'rgba(0,0,0,.2)'; x.shadowBlur = 18; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(PX, PY, PR, 0, 7); x.clip();
    if (PH[info.name]) { try { const im = await loadImg(PH[info.name]); x.drawImage(im, PX - PR, PY - PR, PR * 2, PR * 2) } catch (e) { } }
    else { g = x.createLinearGradient(PX - PR, PY - PR, PX + PR, PY + PR); g.addColorStop(0, info.g === 'F' ? '#f08bb8' : '#5aa2ee'); g.addColorStop(1, info.g === 'F' ? '#b93374' : '#1f5fb8'); x.fillStyle = g; x.fillRect(PX - PR, PY - PR, PR * 2, PR * 2); x.fillStyle = '#fff'; x.font = F(700, 120); x.textBaseline = 'middle'; x.fillText(initials(info.name), PX, PY + 8); x.textBaseline = 'alphabetic' }
    x.restore();
    // name + text (right block)
    const RX = SPLIT ? 1180 : 1060, RW = SPLIT ? 980 : 1060;
    x.fillStyle = DARK ? '#ffffff' : '#0b3a66'; x.font = F(700, 86); let ns = 86; while (x.measureText(info.name).width > RW && ns > 50) { ns -= 4; x.font = F(700, ns) } x.fillText(info.name, RX, 425);
    x.fillStyle = ACC; x.font = T(600, 32); x.fillText(`นักกีฬารุ่น${info.catL || ''} · ทีมว่ายน้ำศรีอรุโณทัย`, RX, 475);
    x.fillStyle = INK; x.font = T(500, 28);
    let y = 530; wrap(x, `ได้เข้าร่วม${info.meet || ''}`, RW - 40).forEach(l => { x.fillText(l, RX, y); y += 40 });
    if (info.dates) { x.fillText(info.dates, RX, y); y += 40 }
    // achievements
    y += 20; const discs = [['เหรียญทอง', info.med[0], '#ffe07a', '#c8901a'], ['เหรียญเงิน', info.med[1], '#eef2f6', '#8b98a6'], ['เหรียญทองแดง', info.med[2], '#f3b58a', '#9a5525']];
    const n = discs.length + 1;
    if (SPLIT) { const gx = [200, 420], gy = [760, 930]; discs.concat([['คะแนนสะสม', info.pts || 0, '#8fb2ff', '#3546b5']]).forEach((d, i) => { disc(x, gx[i % 2], gy[Math.floor(i / 2)], 50, d[2], d[3], '', d[1]); x.fillStyle = '#fff'; x.font = T(600, 22); x.textAlign = 'center'; x.fillText(d[0], gx[i % 2], gy[Math.floor(i / 2)] + 82) }); y += 10 }
    else { const gap = 190, x0 = RX - gap * (n - 1) / 2;
      discs.forEach((d, i) => disc(x, x0 + i * gap, y + 46, 46, d[2], d[3], d[0], d[1], MUT));
      disc(x, x0 + 3 * gap, y + 46, 46, '#8fb2ff', '#3546b5', 'คะแนนสะสม', info.pts || 0, MUT); y += 160 }
    if (info.rk) { x.textAlign = 'center'; x.fillStyle = info.rk <= 6 ? (DARK ? '#ffd23f' : '#8a6300') : MUT; x.font = F(700, 30); x.fillText(`${info.rk <= 6 ? '🏆 ' : ''}อันดับ ${info.rk} คะแนนสะสมรุ่น${info.catL || ''}${info.prov ? ' (ระหว่างแข่ง)' : ''}`, RX, y); y += 20 }
    // best results (two columns)
    const rs = (info.results || []).slice(0, 6);
    if (rs.length) { y += 34; const colW = SPLIT ? 440 : 450, cols = rs.length > 3 ? 2 : 1, rows = Math.ceil(rs.length / cols), bx = RX - (cols * colW + (cols - 1) * 30) / 2;
      x.fillStyle = 'rgba(255,255,255,.85)'; rr(x, bx - 24, y - 14, cols * colW + (cols - 1) * 30 + 48, rows * 42 + 24, 18); x.fill(); x.strokeStyle = 'rgba(11,58,102,.12)'; x.lineWidth = 2; x.stroke();
      rs.forEach((r, i) => { const cx0 = bx + Math.floor(i / rows) * (colW + 30), yy = y + 24 + (i % rows) * 42;
        x.textAlign = 'left'; x.fillStyle = '#0d2236'; x.font = T(600, 24); x.fillText(r.ev, cx0, yy);
        x.textAlign = 'right'; x.font = F(700, 25); x.fillText(r.time, cx0 + colW - 100, yy); x.fillStyle = '#5d7084'; x.font = T(500, 22); x.fillText(r.place, cx0 + colW, yy) });
      x.textAlign = 'center' }
    // signatures
    const SY = H - 150;
    (SPLIT ? [[930, 'หัวหน้าผู้ฝึกสอน'], [1430, 'ประธานชมรมว่ายน้ำฯ']] : [[W * .22, 'หัวหน้าผู้ฝึกสอน'], [W * .78, 'ประธานชมรมว่ายน้ำโรงเรียนศรีอรุโณทัย']]).forEach(([sx, t]) => {
      x.strokeStyle = '#8a98a8'; x.lineWidth = 1.5; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(sx - 190, SY); x.lineTo(sx + 190, SY); x.stroke(); x.setLineDash([]);
      x.fillStyle = MUT; x.font = T(500, 22); x.textAlign = 'center'; x.fillText(t, sx, SY + 34) });
    // organiser credit (small, bottom centre) — club certificate, not an official one
    { const sz = 58, gy = H - 205; x.font = T(500, 19);
      const l1 = 'การแข่งขันจัดโดย องค์การบริหารส่วนจังหวัดกระบี่', l2 = 'สนามแข่งขัน โรงเรียนโภคาพาณิชย์นุกูลมูลนิธิ';
      const tw = Math.max(x.measureText(l1).width, x.measureText(l2).width), gw = sz * 2 + 10 + 18 + tw, gx = CX - gw / 2;
      let k = 0;
      for (const f of ['seal-pao.png', 'seal-school.png']) { try { const im = await loadImg(f); x.save(); x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 6; x.drawImage(im, gx + k * (sz + 10), gy, sz, sz); x.restore() } catch (e) { } k++ }
      x.textAlign = 'left'; x.fillStyle = MUT; x.fillText(l1, gx + sz * 2 + 28, gy + 24); x.fillText(l2, gx + sz * 2 + 28, gy + 50); x.textAlign = 'center' }
    x.fillStyle = DARK ? '#8fa6bd' : '#8a98a8'; x.font = T(400, 18); x.fillText('ข้อมูลผลการแข่งขันจากใบผลทางการ · ใบประกาศนี้จัดทำโดยชมรมว่ายน้ำโรงเรียนศรีอรุโณทัยเพื่อเป็นที่ระลึก', CX, H - 82);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
    const url = URL.createObjectURL(blob), file = new File([blob], `SSC-ประกาศนียบัตร-${info.name.split(' ')[0]}.jpg`, { type: 'image/jpeg' });
    if (closed) { URL.revokeObjectURL(url); return }
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    ov.innerHTML = `<h3>ประกาศนียบัตร ${esc(info.name)}</h3><img class="card-img" src="${url}" alt="">
      <div class="crop-hint">${canShare ? 'กด "แชร์" เพื่อส่งเข้าไลน์/เฟซบุ๊ก หรือบันทึกลงคลังรูป' : 'กดค้างที่รูปเพื่อบันทึก หรือกด "ดาวน์โหลด"'}${PH[info.name] ? '' : '<br>💡 เพิ่มรูปน้องได้โดยแตะที่รูปโปรไฟล์'}</div>
      <div class="crop-btns"><button class="no">ปิด</button>${canShare ? '<button class="ok sh">แชร์</button>' : `<a class="ok" style="flex:1;text-align:center;border-radius:12px;padding:12px;font-weight:700;background:#14b8c4;color:#062033;text-decoration:none" href="${url}" download="${file.name}">ดาวน์โหลด</a>`}</div>`;
    ov.querySelector('.no').onclick = () => { ov.remove(); document.body.style.overflow = ''; URL.revokeObjectURL(url) };
    const sh = ov.querySelector('.sh'); if (sh) sh.onclick = () => navigator.share({ files: [file], title: info.name }).catch(() => { });
  }

  document.addEventListener('click', e => {
    const p = e.target.closest('[data-photo]'); if (!p) return;
    e.preventDefault(); e.stopPropagation(); editPhoto(p.dataset.photo);
  }, true);

  window.Photos = { avatar, editPhoto, shareCard, get: n => PH[n] || null, has: n => !!PH[n], onChange: f => listeners.push(f), sync: () => syncCloud() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll); else setTimeout(loadAll, 0);
})();
