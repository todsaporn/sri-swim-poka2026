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
  .crop-ov{position:fixed;inset:0;z-index:100;background:rgba(6,20,35,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;font-family:'IBM Plex Sans Thai',system-ui,sans-serif;padding:18px;touch-action:none}
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
  .card-ov .card-img{max-width:min(86vw,420px);max-height:62vh;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
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
  async function shareCard(info) {
    // info: {name,g,age,cat,meet,date,med:[g,s,b],pts,rk,results:[{ev,time,place,nfin,medal,d}],logo}
    try { await document.fonts.ready } catch (e) { }
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#082d50'); gr.addColorStop(.55, '#0b4f8a'); gr.addColorStop(1, '#14b8c4');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // waves
    x.globalAlpha = .08; x.strokeStyle = '#fff'; x.lineWidth = 18;
    for (let k = 0; k < 5; k++) { x.beginPath(); for (let i = 0; i <= W; i += 10) x.lineTo(i, 1180 + k * 40 + Math.sin(i / 70 + k) * 16); x.stroke() }
    x.globalAlpha = 1;
    const F = (w, s) => `${w} ${s}px Prompt, 'IBM Plex Sans Thai', sans-serif`, T = (w, s) => `${w} ${s}px 'IBM Plex Sans Thai', sans-serif`;
    try { const lg = await loadImg(info.logo || 'logo.png'); x.drawImage(lg, 60, 52, 110, 110) } catch (e) { }
    x.fillStyle = '#fff'; x.font = F(700, 44); x.fillText('ทีมว่ายน้ำ ศรีอรุโณทัย', 190, 105);
    x.font = T(500, 28); x.globalAlpha = .85; x.fillText(info.meet || '', 190, 148); x.globalAlpha = 1;
    // photo
    const cx = W / 2, cy = 380, R = 150;
    x.save(); x.beginPath(); x.arc(cx, cy, R + 10, 0, 7); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill(); x.restore();
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
    if (PH[info.name]) { try { const im = await loadImg(PH[info.name]); x.drawImage(im, cx - R, cy - R, R * 2, R * 2) } catch (e) { } }
    else { const g2 = x.createLinearGradient(cx - R, cy - R, cx + R, cy + R); g2.addColorStop(0, info.g === 'F' ? '#f08bb8' : '#5aa2ee'); g2.addColorStop(1, info.g === 'F' ? '#b93374' : '#1f5fb8'); x.fillStyle = g2; x.fillRect(cx - R, cy - R, R * 2, R * 2); x.fillStyle = '#fff'; x.font = F(700, 110); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(initials(info.name), cx, cy + 6); x.textAlign = 'left'; x.textBaseline = 'alphabetic' }
    x.restore();
    x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = F(700, 64); x.fillText(info.name, cx, 610);
    x.font = T(500, 32); x.globalAlpha = .9; x.fillText(info.cat || '', cx, 660); x.globalAlpha = 1;
    // medals + points
    const boxes = [['🥇', info.med[0]], ['🥈', info.med[1]], ['🥉', info.med[2]], ['⭐', info.pts || 0]];
    const bw = 200, gap = 22, bx0 = (W - (bw * 4 + gap * 3)) / 2;
    boxes.forEach(([e, n], i) => { const bx = bx0 + i * (bw + gap); x.fillStyle = 'rgba(255,255,255,.14)'; rr(x, bx, 700, bw, 120, 26); x.fill(); x.font = T(400, 52); x.fillStyle = '#fff'; x.fillText(e, bx + 62, 782); x.font = F(700, 54); x.fillText(String(n), bx + 140, 782) });
    if (info.rk) { x.font = F(700, 34); x.fillStyle = info.rk <= 6 ? '#ffd23f' : '#fff'; x.fillText(`${info.rk <= 6 ? '🏆 ' : ''}อันดับ ${info.rk} คะแนนสะสมรุ่น${info.catShort || ''}`, cx, 878) }
    // results
    x.textAlign = 'left';
    const rs = (info.results || []).slice(0, 5); let y = 905;
    x.fillStyle = 'rgba(255,255,255,.95)'; rr(x, 60, y, W - 120, Math.max(1, rs.length) * 62 + 30, 26); x.fill();
    y += 56;
    if (!rs.length) { x.fillStyle = '#5d7084'; x.font = T(500, 30); x.fillText('รอผลการแข่งขัน', 100, y) }
    rs.forEach(r => {
      x.fillStyle = '#0d2236'; x.font = T(600, 31); x.fillText(r.ev, 100, y);
      x.textAlign = 'right'; x.font = F(700, 34); x.fillText(r.time, W - 250, y);
      x.font = T(600, 28); x.fillStyle = '#5d7084'; x.fillText(r.place, W - 100, y); x.textAlign = 'left';
      if (r.medal) { x.font = T(400, 34); x.fillText(r.medal, W - 240, y) }
      y += 62;
    });
    x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,.85)'; x.font = T(500, 26); x.fillText(info.date || '', cx, H - 40);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .92));
    const url = URL.createObjectURL(blob), file = new File([blob], `SSC-${info.name.split(' ')[0]}.jpg`, { type: 'image/jpeg' });
    const ov = document.createElement('div'); ov.className = 'crop-ov card-ov';
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    ov.innerHTML = `<h3>การ์ดแชร์ ${esc(info.name)}</h3><img class="card-img" src="${url}" alt="">
      <div class="crop-hint">${canShare ? 'กด "แชร์" เพื่อส่งเข้าไลน์/เฟซบุ๊ก หรือบันทึกลงคลังรูป' : 'กดค้างที่รูปเพื่อบันทึก หรือกด "ดาวน์โหลด"'}${PH[info.name] ? '' : '<br>💡 เพิ่มรูปน้องได้โดยแตะที่รูปโปรไฟล์'}</div>
      <div class="crop-btns"><button class="no">ปิด</button>${canShare ? '<button class="ok sh">แชร์</button>' : `<a class="ok" style="flex:1;text-align:center;border-radius:12px;padding:12px;font-weight:700;background:#14b8c4;color:#062033;text-decoration:none" href="${url}" download="${file.name}">ดาวน์โหลด</a>`}</div>`;
    document.body.appendChild(ov);
    ov.querySelector('.no').onclick = () => { ov.remove(); URL.revokeObjectURL(url) };
    const sh = ov.querySelector('.sh'); if (sh) sh.onclick = () => navigator.share({ files: [file], title: info.name }).catch(() => { });
  }

  document.addEventListener('click', e => {
    const p = e.target.closest('[data-photo]'); if (!p) return;
    e.preventDefault(); e.stopPropagation(); editPhoto(p.dataset.photo);
  }, true);

  window.Photos = { avatar, editPhoto, shareCard, has: n => !!PH[n], onChange: f => listeners.push(f), sync: () => syncCloud() };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadAll); else setTimeout(loadAll, 0);
})();
