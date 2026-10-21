// AEGIS City Watch: the live Project AEGIS feed (api.xrpl.fun, built by the BURN dev) woven into the city's own systems.
//  - Threat level drives the city: NORMAL changes nothing. ELEVATED = rain (Auto weather only), amber sky cast, police patrols,
//    a little more crime, searchlights + drones work harder. CRITICAL = storm, red-amber sky, units roll from the stations with
//    sirens, a siren cue (sound on only), street + tower billboards switch to alert graphics.
//  - Hysteresis: a new level must hold for 2 polls to escalate and 3 polls + 5 min to calm down; weather/sky crossfade ~25 s.
//  - "AEGIS CITY WATCH" screens live where they make sense: on the police station roof, over the airport terminal, and on
//    bracket arms off the tallest towers. Cams rotate every 45 s; tap a screen for the live embed (youtube-nocookie) + credit.
//  - Ticker lines join the city's event-banner queue below every gameplay event.
// Direct fetch only (no third-party script in our page); every field validated; any failure = the city exactly as before.
// Off switch: HUD > Settings > "Live AEGIS feed" (localStorage bc_aegis) or ?aegis=0. Polls pause while the tab is hidden.
import * as THREE from 'three';

const API = 'https://api.xrpl.fun/v1/aegis/city';
const Q = new URLSearchParams(location.search), $ = id => document.getElementById(id);
const FAST = Q.has('aegisfast');   // test hook: quicker first poll, ticker, rotation and calm-down dwell
const POLL = 60e3, MAX_BACKOFF = 15 * 60e3, STALE = 10 * 60e3, ROTATE = 45e3, CALM_DWELL = FAST ? 5e3 : 5 * 60e3;
const LEVELS = { NORMAL: 0, ELEVATED: 1, CRITICAL: 2 }, LNAME = ['NORMAL', 'ELEVATED', 'CRITICAL'];
const SNAP_HOSTS = ['cwwp2.dot.ca.gov'];
const YT_EMBED_HOSTS = ['www.youtube-nocookie.com', 'youtube-nocookie.com'];
const CLIP_HOSTS = ['api.xrpl.fun', 'xrpl.fun', 'cdn.xrpl.fun'];   // where AEGIS-supplied preview clips may live (plus our own origin)
function clipUrl(u) { try { const x = new URL(u, location.href); if (x.origin === location.origin && /^\/aegis\/clip\/[a-z0-9-]{1,64}\.mp4$/i.test(x.pathname)) return x.href;
  if (x.protocol !== 'https:' || !CLIP_HOSTS.includes(x.hostname) || !/\.(mp4|webm)$/i.test(x.pathname)) return null; return x.href; } catch { return null; } }
const RM = matchMedia && matchMedia('(prefers-reduced-motion: reduce)'); const reduced = () => !!(RM && RM.matches); window.__reducedMotion = reduced();
RM && RM.addEventListener && RM.addEventListener('change', () => window.__reducedMotion = reduced());

const A = window.__aegis = { state: 'idle', data: null, fails: 0, lastOk: 0, level: 0, raw: null, screens: [], polls: 0, tickerQueued: 0, open, close, pollNow: () => poll() };
const enabled = () => { if (Q.get('aegis') === '0') return false; try { return localStorage.getItem('bc_aegis') !== '0'; } catch { return true; } };

// ---------------------------------------------------------------- validation
const clean = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '';
function ytId(u) { try { const x = new URL(u); if (x.protocol !== 'https:' || !YT_EMBED_HOSTS.includes(x.hostname)) return null; const m = x.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/); return m ? m[1] : null; } catch { return null; } }
function snapUrl(u) { try { const x = new URL(u); if (x.protocol !== 'https:' || !SNAP_HOSTS.includes(x.hostname) || !/\.(jpe?g|png)$/i.test(x.pathname)) return null; return x.origin + x.pathname; } catch { return null; } }
function validate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const ts = d.threat_status && typeof d.threat_status === 'object' ? d.threat_status : null; if (!ts) return null;
  const level = Object.prototype.hasOwnProperty.call(LEVELS, ts.level) ? LEVELS[ts.level] : 0;
  const rec = ['clear', 'rain', 'storm'].includes(d.recommended_city_weather) ? d.recommended_city_weather : null;
  const sky = typeof ts.sky_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(ts.sky_color) ? ts.sky_color : null;
  const cams = [];
  for (const b of (Array.isArray(d.billboards) ? d.billboards : []).slice(0, 12)) {
    if (!b || typeof b !== 'object') continue;
    const name = clean(b.name, 48) || 'AEGIS camera', region = clean(b.region, 48), attribution = clean(b.attribution, 70);
    const city = clean((region.split(/[,/]/)[0] || ''), 24) || name.split(' ')[0];
    const id = typeof b.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(b.id) ? b.id : 'cam' + cams.length;
    if (b.source_type === 'youtube') { const vid = ytId(b.stream_url); if (!vid) continue;
      cams.push({ id, type: 'youtube', vid, name, region, city, attribution, clip: clipUrl(b.preview_clip_url), poster: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` }); }
    else if (b.source_type === 'snapshot') { const u = snapUrl(b.stream_url) || snapUrl(b.poster_url); if (!u) continue;
      cams.push({ id, type: 'snapshot', name, region, city, attribution, poster: u, refresh: Math.max(15e3, Math.min(600e3, +b.refresh_ms || 30e3)) }); }
  }
  const ticker = (Array.isArray(d.ticker_messages) ? d.ticker_messages : []).map(t => clean(t, 140)).filter(Boolean).slice(0, 12);
  return { level, rec, sky, siren: ts.alert_siren === true, banner: clean(ts.banner_text, 140), reason: clean(ts.reason, 160), cams, ticker };
}

// ---------------------------------------------------------------- polling: 60 s, exponential backoff on error, paused while hidden
let timer = 0, inflight = false;
const schedule = ms => { clearTimeout(timer); timer = setTimeout(poll, ms); };
async function poll() {
  clearTimeout(timer);
  if (!enabled()) { clearAll(); A.state = 'off'; return; }
  if (document.hidden) { A.state = 'paused'; return; }
  if (inflight) return; inflight = true; A.polls++;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10e3);
    const r = await fetch(API, { cache: 'no-store', credentials: 'omit', mode: 'cors', referrerPolicy: 'origin', signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) throw new Error('http ' + r.status);
    const txt = await r.text(); if (txt.length > 300e3) throw new Error('too big');
    const v = validate(JSON.parse(txt)); if (!v) throw new Error('bad payload');
    A.fails = 0; A.lastOk = Date.now(); A.state = 'ok';
    try { ingest(v); } catch (e) { console.warn('aegis apply', e); }
    schedule(POLL);
  } catch (e) {
    A.fails++; A.state = 'error'; A.lastErr = String(e && e.message || e);
    if (A.lastOk && Date.now() - A.lastOk > STALE) clearAll();   // feed gone a while: drift back to the normal city
    const back = Math.min(MAX_BACKOFF, POLL * Math.pow(2, Math.min(A.fails, 4))) * (.85 + Math.random() * .3);
    schedule(back);
  } finally { inflight = false; status(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && enabled() && (A.state === 'paused' || Date.now() - A.lastOk > POLL)) schedule(800); });

// ---------------------------------------------------------------- hysteresis -> effective level
let pend = { lv: 0, n: 0 }, changedAt = 0;
function ingest(v) {
  A.data = v; A.raw = v.level;
  if (!A.everOk) { A.everOk = true; setLevel(v.level, true); }   // first reading: adopt as-is (crossfades in from the normal city)
  else if (v.level === A.level) pend = { lv: v.level, n: 0 };
  else {
    pend = pend.lv === v.level ? { lv: v.level, n: pend.n + 1 } : { lv: v.level, n: 1 };
    const up = v.level > A.level;
    if (up ? pend.n >= 2 : (pend.n >= 3 && Date.now() - changedAt > CALM_DWELL)) setLevel(v.level);
  }
  applyLevel(v); syncScreens(v.cams); queueTicker(v);
}
function setLevel(lv, first) { A.level = lv; changedAt = Date.now(); pend = { lv, n: 0 }; A.changes = (A.changes || 0) + (first ? 0 : 1); }
let lastSirenKey = '', tintTarget = 0; const tintCol = new THREE.Color(1, 1, 1), AMBER = new THREE.Color('#ffb000'), REDAMBER = new THREE.Color('#ff5a1e');
function applyLevel(v) {
  const lv = enabled() ? A.level : 0;
  window.__aegisThreat = lv; window.__aegisLevel = LNAME[lv];
  const weather = lv === 2 ? 'storm' : lv === 1 ? 'rain' : null;   // storm only after CRITICAL is confirmed by the hysteresis
  A.weatherApplied = window.setAegisWeather ? !!window.setAegisWeather(weather) && !!weather : false;
  tintTarget = lv === 2 ? .24 : lv === 1 ? .12 : 0;
  const sky = v && v.sky ? new THREE.Color(v.sky) : AMBER; tintCol.copy(lv === 2 ? sky.clone().lerp(REDAMBER, .6) : sky);
  const EV = window.__cityEvents; if (EV && EV.setThreat) EV.setThreat(lv);
  const CL = window.__cityLife; if (CL && CL.setAlert) CL.setAlert(lv >= 2);
  // siren: once per change into an alert, only if the feed asks for it (or CRITICAL), only with sound on
  const sk = lv > 0 && (v && v.siren || lv === 2) ? lv + '|' + (v ? v.banner : '') : '';
  if (sk && sk !== lastSirenKey) siren(); lastSirenKey = sk;
}
function clearAll() {
  A.data = null; A.level = 0; A.everOk = false; pend = { lv: 0, n: 0 }; lastSirenKey = '';
  applyLevel(null); syncScreens([]); close(); status();
}

// ---------------------------------------------------------------- screens: diegetic mounts
// Each mount: world group transform + local screen centre; the screen faces local +z. One merged support mesh per mount.
const CW = 512, CH = 320;   // canvas (header strip + 16:9 picture + caption)
function mounts() {
  const c = window.__city, CL = window.__cityLife || {}, out = [];
  const mob = c.MOBILE, low = c.TIER === 'low';
  // 1) police station: roof-mounted screen on two posts, facing the street
  const P = CL.police; if (P) out.push({ where: 'police', x: P.x, z: P.z, yaw: P.yaw + Math.PI, w: 8, h: 5, lx: 0, ly: 8.1 + .6 + 2.5 + .3, lz: P.d / 2 - 1.6, base: 8.1, legs: [-3, 3] });
  // 2) airport terminal: big screens on the roof either side of the terminal sign, facing town (+z)
  const AP = window.__airport; if (AP && AP.ready) for (const sx of (mob || low ? [-62] : [-62, 62])) out.push({ where: 'airport', x: 0, z: -560, yaw: 0, w: 20, h: 12.5, lx: sx, ly: 21.2, lz: 25.5, base: 6.75, legs: [-7, 7] });   // stands on the curb canopy, in front of the curved roof
  // 3) tallest towers: a bracket arm off the tower face, a quarter turn from the token's own hologram
  const nodes = (c.E && c.E.nodes ? c.E.nodes : Object.values(c.N || {})).filter(n => n && n.pos && n.h > 30 && !n.minor).sort((a, b) => b.h - a.h);
  const nt = low ? 1 : mob ? 2 : 3; for (const n of nodes.slice(0, nt)) out.push({ where: 'tower', node: n, w: 16, h: 10 });
  return out.slice(0, low ? 2 : mob ? 4 : 6);
}
function towerPose(m) {
  const n = m.node, o = n.name === 'XRP' ? new THREE.Vector3(1, 0, 1).normalize() : n.pos.clone().setY(0).normalize();
  const dir = new THREE.Vector3(-o.z, 0, o.x), dist = n.w * 1.45 + 3, y = Math.max(16, Math.min(n.h * .72, 66));
  return { x: n.pos.x, z: n.pos.z, yaw: Math.atan2(dir.x, dir.z), ly: y, lz: dist, key: n.w.toFixed(2) + '|' + n.h.toFixed(1) };
}
function supportGeo(m, armLen) {
  const parts = [new THREE.BoxGeometry(m.w + .6, m.h + .6, .45).translate(0, 0, -.3)];   // bezel
  if (m.where === 'tower') parts.push(new THREE.BoxGeometry(.7, .7, armLen).translate(0, -m.h / 2 + 1, -armLen / 2 - .3), new THREE.BoxGeometry(.5, m.h * .6, .5).translate(0, -m.h * .2, -.6));   // arm back into the tower + spine
  else for (const lx of m.legs) { const L = m.ly - m.h / 2 - m.base; parts.push(new THREE.BoxGeometry(.35, L + .3, .35).translate(lx, -m.h / 2 - L / 2, -.4)); }
  const g = parts.reduce((acc, p) => { const a = acc || []; a.push(p.toNonIndexed()); return a; }, null);
  // merge by hand (avoid another import): concatenate positions + normals
  let n = 0; g.forEach(p => n += p.attributes.position.count); const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  g.forEach(p => { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; p.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
const imgCache = new Map();   // poster url -> {img, ok}
function poster(cam, cb) {
  const key = cam.poster, hit = imgCache.get(key);
  if (hit && cam.type !== 'snapshot') { if (hit.done) cb(hit.ok ? hit.img : null); else hit.cbs.push(cb); return; }
  const e = { img: new Image(), done: false, ok: false, cbs: [cb] }; imgCache.set(key, e);
  e.img.crossOrigin = 'anonymous'; e.img.decoding = 'async'; e.img.referrerPolicy = 'no-referrer';
  const fin = ok => { e.done = true; e.ok = ok; e.cbs.splice(0).forEach(f => { try { f(ok ? e.img : null); } catch { } }); };
  e.img.onload = () => fin(true); e.img.onerror = () => fin(false);
  e.img.src = key + (cam.type === 'snapshot' ? '?t=' + Date.now() : '');
}
function drawScreen(s) {
  const g = s.ctx, cam = s.cam; if (!cam) return; const py = 34, ph = CH - py;
  g.fillStyle = '#03070d'; g.fillRect(0, 0, CW, CH);
  if (s.vidOn) { g.clearRect(0, py, CW, ph); }
  else if (s.img) { const iw = s.img.naturalWidth, ih = s.img.naturalHeight, sh = cam.type === 'youtube' ? iw * 9 / 16 : ih, sy = (ih - sh) / 2;   // hqdefault is 4:3 letterboxed: crop the 16:9 centre
    try { g.drawImage(s.img, 0, Math.max(0, sy), iw, Math.min(ih, sh), 0, py, CW, ph); } catch { s.img = null; } }
  if (!s.img && !s.vidOn) {   // no poster (offline / blocked): radar card with the cam name
    const gr = g.createLinearGradient(0, py, 0, CH); gr.addColorStop(0, '#062033'); gr.addColorStop(1, '#020a12'); g.fillStyle = gr; g.fillRect(0, py, CW, ph);
    g.strokeStyle = '#2fe3ff22'; g.lineWidth = 1; for (let x = 0; x < CW; x += 32) { g.beginPath(); g.moveTo(x, py); g.lineTo(x, CH); g.stroke(); } for (let y = py; y < CH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(CW, y); g.stroke(); }
    g.strokeStyle = '#2fe3ff66'; g.beginPath(); g.arc(CW / 2, py + ph / 2 - 10, 80, 0, 7); g.stroke();
    g.fillStyle = '#bff6ff'; g.textAlign = 'center'; g.font = '800 28px system-ui,sans-serif'; g.fillText(cam.name.slice(0, 30), CW / 2, py + ph / 2 - 4);
    g.font = '600 17px system-ui,sans-serif'; g.fillStyle = '#7fd8ee'; g.fillText(s.loading ? 'acquiring signal…' : 'tap for the live feed', CW / 2, py + ph / 2 + 24); g.textAlign = 'left';
  }
  g.fillStyle = s.vidOn ? 'rgba(0,0,0,.14)' : 'rgba(0,0,0,.2)'; for (let y = py; y < CH; y += 3) g.fillRect(0, y, CW, 1);   // scanlines
  const vg = g.createRadialGradient(CW / 2, py + ph / 2, ph * .35, CW / 2, py + ph / 2, CW * .62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, s.vidOn ? 'rgba(0,10,20,.35)' : 'rgba(0,10,20,.55)'); g.fillStyle = vg; g.fillRect(0, py, CW, ph);
  // caption: cam name + credit
  g.fillStyle = 'rgba(2,8,14,.74)'; g.fillRect(0, CH - 40, CW, 40); g.fillStyle = '#e8fbff'; g.font = '700 16px system-ui,sans-serif'; g.fillText(cam.name.slice(0, 46), 12, CH - 22);
  g.fillStyle = '#9fc8d4'; g.font = '500 12px system-ui,sans-serif'; g.fillText(('© ' + (cam.attribution || 'public live camera')).slice(0, 64), 12, CH - 7);
  // header: AEGIS CITY WATCH — <city>, alert-coloured by level
  const lv = window.__aegisThreat || 0, hc = lv === 2 ? '#ff3b2a' : lv === 1 ? '#ffb000' : '#2fe3ff';
  g.fillStyle = lv === 2 ? '#2a0806' : '#071722'; g.fillRect(0, 0, CW, py); g.fillStyle = hc; g.fillRect(0, py - 2, CW, 2);
  g.font = '900 17px system-ui,sans-serif'; g.fillStyle = '#e6fbff'; g.fillText(('AEGIS CITY WATCH — ' + cam.city).slice(0, 40), 12, 23);
  const blink = reduced() ? true : s.blink; g.fillStyle = blink ? '#ff3b3b' : '#5a1a1a'; g.beginPath(); g.arc(CW - 62, 17, 7, 0, 7); g.fill();
  g.fillStyle = '#ffd6d6'; g.font = '800 15px system-ui,sans-serif'; g.fillText(cam.type === 'snapshot' ? 'CAM' : 'LIVE', CW - 50, 23);
  g.strokeStyle = hc + '99'; g.lineWidth = 4; g.strokeRect(2, 2, CW - 4, CH - 4);
  s.tex.needsUpdate = true;
}
function showCam(s, cam) {
  if (s.cam !== cam) stopVideo(s);
  s.cam = cam; s.img = null; s.loading = true; drawScreen(s); const tok = s.tok = (s.tok || 0) + 1;
  poster(cam, img => { if (s.dead || s.tok !== tok) return; s.loading = false; s.img = img; drawScreen(s); });
}
let C = null, cams = [], rot = 0, rotT = 0, supMat = null;
function syncScreens(list) {
  C = C || window.__city; if (!C) return;
  const sig = list.map(c => c.id + ':' + (c.vid || c.poster) + ':' + (c.clip || '')).join(',');
  if (sig === A.sig) return; A.sig = sig; cams = list;
  if (!list.length) { for (const s of A.screens) killScreen(s); A.screens = []; return; }
  if (!A.screens.length) buildScreens();
  A.screens.forEach((s, i) => showCam(s, cams[(i + rot) % cams.length]));
}
function killScreen(s) { stopVideo(s); s.pic.geometry.dispose(); s.pic.material.dispose(); s.dead = true; C.S.remove(s.g); const i = C.pick.indexOf(s.screen); if (i >= 0) C.pick.splice(i, 1); s.tex.dispose(); s.screen.material.dispose(); s.screen.geometry.dispose(); s.sup.geometry.dispose(); }
function buildScreens() {
  supMat = supMat || new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: .75, roughness: .4, emissive: 0x06303c, emissiveIntensity: .7 });
  for (const m of mounts()) {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), new THREE.MeshBasicMaterial({ map: tex, color: 0xdedede, toneMapped: false, transparent: true }));
    const ph = m.h * (CH - 34) / CH, pic = new THREE.Mesh(new THREE.PlaneGeometry(m.w, ph), new THREE.MeshBasicMaterial({ color: 0xd8d8d8, toneMapped: false })); pic.position.set(0, -(m.h - ph) / 2, -.03); pic.visible = false; screen.add(pic);
    const g = new THREE.Group(); g.name = 'aegis_' + m.where; const s = { m, g, screen, pic, tex, ctx: cv.getContext('2d'), blink: true, cam: null };
    screen.userData = { kind: 'aegis', get cam() { return s.cam; } };
    if (m.where === 'tower') { const p = towerPose(m); s.key = p.key; g.position.set(p.x, 0, p.z); g.rotation.y = p.yaw; screen.position.set(0, p.ly, p.lz); s.sup = new THREE.Mesh(supportGeo(m, p.lz), supMat); s.sup.position.copy(screen.position); }
    else { g.position.set(m.x, 0, m.z); g.rotation.y = m.yaw; screen.position.set(m.lx, m.ly, m.lz); s.sup = new THREE.Mesh(supportGeo(m, 0), supMat); s.sup.position.copy(screen.position); }
    g.add(s.sup, screen); C.S.add(g); C.pick.push(screen); A.screens.push(s);
  }
}
function reposeTowers() {   // towers reshape live with the market: keep the arm on the face
  for (const s of A.screens) { if (s.m.where !== 'tower') continue; const p = towerPose(s.m); if (p.key === s.key) continue; s.key = p.key;
    s.g.position.set(p.x, 0, p.z); s.g.rotation.y = p.yaw; s.screen.position.set(0, p.ly, p.lz); s.sup.geometry.dispose(); s.sup.geometry = supportGeo(s.m, p.lz); s.sup.position.copy(s.screen.position); }
}

// per-frame upkeep (cheap): sky tint crossfade (~25 s), LIVE blink at ~1 Hz, cam rotation, snapshot refresh
let lastT = performance.now(), slowT = 0, lastLv = -1;
function loop() {
  requestAnimationFrame(loop); if (window.__cityPaused) return;   // The Wilds deep area hides the city
  const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1e3); lastT = now;
  const c = window.__city; if (!c || document.hidden) return;
  const U = c.U; if (U && U.aegisA) { const k = Math.min(1, dt * .12), tgt = enabled() ? tintTarget : 0; U.aegisA.value += (tgt - U.aegisA.value) * k; U.aegisTint.value.lerp(tintCol, k); }
  if (now - slowT < 1100 || !A.screens.length) return; slowT = now;   // wall-clock (frame dt is capped, so it would stretch on slow devices)
  const lv = window.__aegisThreat || 0, lvChanged = lv !== lastLv; lastLv = lv;
  const anyClip = cams.some(c => clipFor(c));
  if (cams.length > A.screens.length && now - rotT > (FAST ? 8e3 : anyClip ? 3 * ROTATE : ROTATE)) { rotT = now; rot = (rot + 1) % cams.length; A.rotations = (A.rotations || 0) + 1; A.screens.forEach((s, i) => showCam(s, cams[(i + rot) % cams.length])); }
  for (const s of A.screens) {
    if (s.cam && s.cam.type === 'snapshot' && now - (s.snapT || 0) > s.cam.refresh) { s.snapT = now; imgCache.delete(s.cam.poster); showCam(s, s.cam); continue; }
    if (!reduced() || lvChanged) { s.blink = !s.blink; drawScreen(s); }
  }
  reposeTowers(); videoSchedule(now);
}

// ---------------------------------------------------------------- looping preview clips (VideoTexture)
// Source: the cam's AEGIS-supplied preview_clip_url (preferred), else our server's /aegis/clip/<id>.mp4 when that job is on.
// Only the nearest visible screens decode (2 on phones, 3 elsewhere); everything pauses when off-screen, hidden, or a modal is up.
let srvClips = {}, srvChecked = 0, srvOn = null;
const clipFor = cam => cam && cam.type === 'youtube' ? (cam.clip || (srvClips[cam.id] ? `/aegis/clip/${cam.id}.mp4?v=${srvClips[cam.id].t}` : null)) : null;
async function checkServerClips() {
  if (srvOn === false && Date.now() - srvChecked < 30 * 60e3) return; srvChecked = Date.now();
  try { const r = await fetch('/aegis/clips', { cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw 0; const j = await r.json();
    srvOn = !!(j && j.enabled); const o = {}; if (srvOn && j.clips && typeof j.clips === 'object') for (const k in j.clips) if (/^[a-z0-9-]{1,64}$/i.test(k) && j.clips[k] && isFinite(+j.clips[k].t)) o[k] = { t: +j.clips[k].t };
    srvClips = o; } catch { srvOn = false; srvClips = {}; }
}
const MAXDEC = () => (window.__city && window.__city.MOBILE) ? 2 : 3, CLIP_REFRESH = 3 * 60e3;
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _wp = new THREE.Vector3(), _sph = new THREE.Sphere();
function stopVideo(s) {
  for (const v of [s.vid, s.vidNext]) if (v) { try { v.el.pause(); v.el.removeAttribute('src'); v.el.load(); } catch { } v.tex && v.tex.dispose(); }
  s.vid = s.vidNext = null; if (s.vidOn) { s.vidOn = false; s.pic.visible = false; drawScreen(s); }
}
function loadClip(s, url) {   // loads in the background; swaps in only once a frame is decodable
  const el = document.createElement('video'); el.muted = true; el.defaultMuted = true; el.loop = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.setAttribute('muted', '');
  el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.disablePictureInPicture = true;
  const v = { el, url, t: Date.now(), tex: null }; s.vidNext = v; A.clipLoads = (A.clipLoads || 0) + 1;
  el.addEventListener('loadeddata', () => {
    if (s.dead || s.vidNext !== v) return; v.tex = new THREE.VideoTexture(el); v.tex.colorSpace = THREE.SRGBColorSpace; v.tex.generateMipmaps = false; v.tex.minFilter = THREE.LinearFilter;
    const old = s.vid; s.vid = v; s.vidNext = null; s.pic.material.map = v.tex; s.pic.material.needsUpdate = true;
    if (old) { try { old.el.pause(); old.el.removeAttribute('src'); old.el.load(); } catch { } old.tex && old.tex.dispose(); }
    if (s.wantPlay) el.play().catch(() => { });
  }, { once: true });
  el.addEventListener('playing', () => { if (s.vid === v && !s.vidOn) { s.vidOn = true; s.pic.visible = true; A.clipsPlaying = (A.clipsPlaying || 0) + 1; drawScreen(s); } });
  el.addEventListener('error', () => { if (s.vidNext === v) s.vidNext = null; v.failed = true; A.clipErrors = (A.clipErrors || 0) + 1; }, { once: true });
  el.src = url;
}
let vsT = 0;
function videoSchedule(now) {
  if (now - vsT < 500) return; vsT = now;
  if (now - srvChecked > CLIP_REFRESH) checkServerClips();
  const c = window.__city; if (!c) return; const cam = c.C;
  const block = document.hidden || !!modal || !enabled() || window.__burnTowerOpen;
  _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
  const cand = [];
  for (const s of A.screens) { const url = clipFor(s.cam); s.clipUrl = url; if (!url || block) continue;
    s.screen.getWorldPosition(_wp); _sph.set(_wp, s.m.w * .6); const d = _wp.distanceTo(cam.position);
    if (d < 320 && _fr.intersectsSphere(_sph)) cand.push({ s, d }); }
  cand.sort((a, b) => a.d - b.d); const on = new Set(cand.slice(0, MAXDEC()).map(o => o.s));
  for (const s of A.screens) {
    s.wantPlay = on.has(s);
    if (!s.clipUrl) { if (s.vid || s.vidNext) stopVideo(s); continue; }
    const base = s.clipUrl.split('?')[0], curBase = s.vid ? s.vid.url.split('?')[0] : null;
    if (s.wantPlay) {
      // first load, a new cam/clip URL, or a periodic refresh (latest ~10 s of the stream)
      const stale = s.vid && (s.vid.url !== s.clipUrl || now - s.vid.t > CLIP_REFRESH);
      if ((!s.vid || stale || curBase !== base) && !s.vidNext && !(s.vid && s.vid.failed)) loadClip(s, s.clipUrl.includes('?') || !s.vid ? s.clipUrl : s.clipUrl + '?v=' + Math.floor(Date.now() / CLIP_REFRESH));
      if (s.vid && s.vid.el.paused && s.vid.tex) s.vid.el.play().catch(() => { });
    } else if (s.vid && !s.vid.el.paused) s.vid.el.pause();   // keeps its last frame, stops decoding
  }
  A.decoding = A.screens.filter(s => s.vid && !s.vid.el.paused).length;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) for (const s of A.screens) if (s.vid) try { s.vid.el.pause(); } catch { } });

// ---------------------------------------------------------------- live-cam modal (tap a screen)
let modal = null, snapTimer = 0;
function open(cam) {
  if (!cam) return; close();
  modal = document.createElement('div'); modal.id = 'aegisModal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'AEGIS City Watch: ' + cam.name);
  const card = document.createElement('div'); card.className = 'am-card';
  const head = document.createElement('div'); head.className = 'am-head';
  const tl = document.createElement('div'); const b = document.createElement('b'); b.textContent = 'AEGIS CITY WATCH — ' + cam.city; const sm = document.createElement('small'); sm.textContent = cam.name + (cam.region ? ' · ' + cam.region : ''); tl.append(b, sm);
  const x = document.createElement('button'); x.className = 'am-x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '✕'; x.onclick = close;
  head.append(tl, x);
  const box = document.createElement('div'); box.className = 'am-video'; if (cam.type === 'snapshot') box.style.aspectRatio = '4 / 3';
  if (cam.type === 'youtube') {
    const f = document.createElement('iframe'); f.src = cam.embed; f.title = cam.name; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('allowfullscreen', ''); f.referrerPolicy = 'strict-origin-when-cross-origin'; f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups'); box.append(f);
  } else { const im = document.createElement('img'); im.alt = cam.name; im.referrerPolicy = 'no-referrer'; const load = () => im.src = cam.poster + '?t=' + Date.now(); load(); snapTimer = setInterval(load, cam.refresh); box.append(im); }
  const foot = document.createElement('div'); foot.className = 'am-foot';
  foot.textContent = `Feed: ${cam.attribution || 'public live camera'} · listed by Project AEGIS (api.xrpl.fun)${cam.type === 'youtube' ? ' · plays via YouTube privacy-enhanced mode' : ' · still image, refreshes every ' + Math.round(cam.refresh / 1000) + ' s'}`;
  card.append(head, box, foot); modal.append(card); document.body.append(modal);
  modal.addEventListener('pointerdown', e => { if (e.target === modal) close(); });
  x.focus({ preventScroll: true }); A.modalOpen = cam.id;
  // game input paused: release held keys/buttons, swallow keys until closed
  try { const k = window.__city && window.__city.input && window.__city.input.keys; if (k) for (const q in k) k[q] = 0; } catch { }
  window.__aegisModalOpen = true; for (const s of A.screens) if (s.vid) try { s.vid.el.pause(); } catch { }
  try { history.pushState({ aegisModal: 1 }, ''); pushed = true; } catch { pushed = false; }
}
let pushed = false;
addEventListener('popstate', () => { if (modal) { pushed = false; close(); } });   // Android/browser back closes the modal instead of leaving the game
const swallow = e => { if (!modal) return; if (e.key === 'Escape') { if (e.type === 'keydown') close(); } e.stopImmediatePropagation(); };
addEventListener('keydown', swallow, true); addEventListener('keyup', swallow, true);
function close() { clearInterval(snapTimer); const had = !!modal; if (modal) { modal.remove(); modal = null; } A.modalOpen = null; window.__aegisModalOpen = false; if (had && pushed) { pushed = false; try { if (history.state && history.state.aegisModal) history.back(); } catch { } } }

// ---------------------------------------------------------------- ticker -> the city's event queue (ranked below gameplay)
let tickI = 0, tickNext = 0;
const LEVEL_COL = ['#2fe3ff', '#ffb000', '#ff3b2a'];
function queueTicker() {}   // lines are fed on a timer below, not per poll
function tickerTick() {
  const v = A.data, q = window.__evq; if (!v || !v.ticker.length || !q || !enabled() || document.hidden || modal) return;
  const now = performance.now(); if (now < tickNext) return;
  if (q.some(e => e && e.type === 'aegis')) return;            // one line waiting at a time
  if (q.some(e => e && e.type !== 'trade')) { tickNext = now + 6e3; return; }   // gameplay first
  const c = window.__city; if (c && c.isTour && c.isTour()) return;
  const lv = A.level; q.push({ type: 'aegis', text: v.ticker[tickI++ % v.ticker.length], level: LNAME[lv], col: LEVEL_COL[lv], when: new Date() });
  A.tickerQueued++; tickNext = now + (FAST ? 9e3 : lv === 2 ? 25e3 : lv === 1 ? 40e3 : 60e3);
}

// ---------------------------------------------------------------- siren cue (WebAudio; respects the city mute)
function siren() {
  try {
    const a = window.__city && window.__city.audio && window.__city.audio(); if (!a || !a.AC || !a.on || !a.master) return;
    const AC = a.AC, t0 = AC.currentTime + .05, o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1600;
    for (let i = 0; i < 4; i++) { o.frequency.setValueAtTime(620, t0 + i * .7); o.frequency.linearRampToValueAtTime(940, t0 + i * .7 + .35); o.frequency.linearRampToValueAtTime(620, t0 + i * .7 + .7); }
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.06, t0 + .25); g.gain.setValueAtTime(.06, t0 + 2.5); g.gain.exponentialRampToValueAtTime(.0005, t0 + 2.9);
    o.connect(f).connect(g).connect(a.master); o.start(t0); o.stop(t0 + 3); A.sirens = (A.sirens || 0) + 1;
  } catch { }
}

// ---------------------------------------------------------------- settings switch + status line
function status() {
  const el = $('aegisStatus'); if (!el) return;
  if (!enabled()) { el.textContent = 'Off'; return; }
  if (!A.lastOk) { el.textContent = A.state === 'error' ? 'Feed unreachable · city runs as normal' : 'Connecting…'; return; }
  const t = new Date(A.lastOk).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.textContent = `${LNAME[A.level]}${A.raw != null && A.raw !== A.level ? ' (feed says ' + LNAME[A.raw] + ', confirming)' : ''} · updated ${t}${A.state === 'error' ? ' · retrying' : ''}${A.level && !A.weatherApplied ? ' · weather manual' : ''}`;
}
function settings() {
  const ss = $('secSettings') || $('hudBody'); if (!ss || $('aegisToggle')) return;
  const row = document.createElement('div'); row.className = 'row feat';
  const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.id = 'aegisToggle'; i.checked = enabled();
  const st = document.createElement('div'); st.id = 'aegisStatus'; st.className = 'dim'; st.style.cssText = 'font-size:11px;margin:2px 0 0 22px';
  l.append(i, ' 🛰 Live AEGIS feed (city watch cams, threat mood, ticker)'); row.append(l, st); ss.append(row);
  i.onchange = () => { try { localStorage.setItem('bc_aegis', i.checked ? '1' : '0'); } catch { }
    if (i.checked) { A.sig = null; schedule(100); } else { clearTimeout(timer); clearAll(); A.state = 'off'; } status(); };
  status();
}
function css() {
  const st = document.createElement('style'); st.textContent = `
#aegisModal{position:fixed;inset:0;z-index:120;background:rgba(2,6,12,.8);display:flex;align-items:center;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}
#aegisModal .am-card{width:min(960px,100%);max-height:100%;overflow:auto;background:#06121b;border:1px solid #2fe3ff66;border-radius:14px;box-shadow:0 0 40px #2fe3ff33;color:#dff8ff;font:500 13px system-ui,sans-serif}
#aegisModal .am-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 10px 8px 14px}
#aegisModal .am-head b{display:block;font-weight:800;letter-spacing:.04em;font-size:15px}#aegisModal .am-head small{opacity:.75}
#aegisModal .am-x{flex:none;width:44px;height:44px;border-radius:10px;border:1px solid #2fe3ff66;background:#0b2230;color:#fff;font-size:20px;cursor:pointer}
#aegisModal .am-video{position:relative;width:100%;aspect-ratio:16/9;background:#000}#aegisModal .am-video iframe,#aegisModal .am-video img{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:contain}
#aegisModal .am-foot{padding:8px 14px 12px;opacity:.8;font-size:12px}`;
  document.head.append(st);
}

// ---------------------------------------------------------------- boot (after the city, its life layer and the airport are up)
(function boot() {
  const c = window.__city, CL = window.__cityLife;
  if (!window.__ready || !c || !c.S || (CL && !CL.ready)) return setTimeout(boot, 600);
  C = c; try { css(); settings(); } catch (e) { console.warn('aegis ui', e); }
  loop(); setInterval(() => { try { tickerTick(); } catch { } }, 2e3); setInterval(status, 30e3);
  if (enabled()) schedule(FAST ? 300 : 4000); else A.state = 'off';
})();
