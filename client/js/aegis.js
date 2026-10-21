// AEGIS City Watch: the live Project AEGIS feed (api.xrpl.fun, built by the BURN dev) woven into the city's own systems.
//  - The feed NEVER touches weather or sky. Threat level drives interactive things instead:
//    NORMAL = cams + command table only. ELEVATED = 1 "signal anomaly" beacon + a drone pair sweeping searchlights, extra patrols.
//    CRITICAL = 3 beacons at once + a drone swarm, units roll from the stations with sirens. Billboards keep their own art.
//  - Everything visible lives at the AEGIS Pyramid HQ (aegis-pyramid.js): cam screens + ticker on its faces, apex glow by level,
//    and the command table, beacons and drones around it.
//  - AEGIS Command: a holographic globe on a table in front of the Pyramid. The feed's cams are glowing pins at their real
//    lat/lng (threat colour), incidents pulse; walk up + USE (or tap it) for the console: threat, ops, cams, incidents, ticker.
//  - AEGIS Response Ops: walk to a beacon and hold USE (E / touch) ~3 s to stabilize it (others nearby make it faster).
//    Beacons are seeded from the wall-clock wave window (8 min, live 5 min), so every client agrees where they are; holds and
//    stabilizations are relayed over the city WebSocket ({t:'ab'}) when it is up. Reward: a local "AEGIS Responder" record
//    (count + rank) only: no coins, no XP, nothing server-side.
//  - Hysteresis: a new level must hold for 2 polls to escalate and 3 polls + 5 min to calm down.
//  - "AEGIS CITY WATCH" screens on the Pyramid faces (4 desktop, 2 phones, 1 low tier); the ticker / alert banner runs in a strip on them.
//    Response Ops notices still use the event-banner queue below gameplay events; the periodic ticker no longer does.
// Direct fetch only (no third-party script in our page); every field validated; any failure = the city exactly as before, and
// no new beacons spawn unless the last poll succeeded.
// Off switch: HUD > Settings > "Live AEGIS feed" (localStorage bc_aegis) or ?aegis=0. Polls pause while the tab is hidden.
// Test hook (?aegistest or ?debug=1): window.__aegis.force('CRITICAL' | 0..2 | null = back to the feed), .tOff (clock offset ms), .ops.
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
function latlng(o) { const la = +o.lat, ln = +(o.lng ?? o.lon); return isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 ? [la, ln] : null; }
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
    const geo = latlng(b), orbit = /orbit/i.test(region + ' ' + name);
    if (b.source_type === 'youtube') { const vid = ytId(b.stream_url); if (!vid) continue;
      cams.push({ id, geo, orbit, type: 'youtube', vid, name, region, city, attribution, clip: clipUrl(b.preview_clip_url), poster: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` }); }
    else if (b.source_type === 'snapshot') { const u = snapUrl(b.stream_url) || snapUrl(b.poster_url); if (!u) continue;
      cams.push({ id, geo, orbit, type: 'snapshot', name, region, city, attribution, poster: u, refresh: Math.max(15e3, Math.min(600e3, +b.refresh_ms || 30e3)) }); }
  }
  const ticker = (Array.isArray(d.ticker_messages) ? d.ticker_messages : []).map(t => clean(t, 140)).filter(Boolean).slice(0, 12);
  const SEVS = { NORMAL: 0, LOW: 0, ELEVATED: 1, MEDIUM: 1, HIGH: 2, CRITICAL: 2 };
  const incidents = (Array.isArray(d.active_incidents) ? d.active_incidents : []).slice(0, 8).filter(x => x && typeof x === 'object').map(x => ({
    title: clean(x.title, 90), cat: clean(x.category, 24).replace(/[^A-Z0-9_ ]/gi, ''), sev: SEVS[clean(x.severity, 12).toUpperCase()] ?? 0, geo: latlng(x), summary: clean(x.summary, 160) })).filter(x => x.title);
  return { level, siren: ts.alert_siren === true, banner: clean(ts.banner_text, 140), reason: clean(ts.reason, 160), cams, ticker, incidents };
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

// ---------------------------------------------------------------- live cams (server/cams.js: real YouTube live streams, ranked by viewers)
// Our server lists them (YouTube Data API behind a server-side key, or a curated fallback); the Pyramid faces show the top streams
// across categories as thumbnails, the cam modal plays one (the only iframe, only inside the modal). /api/cams down = AEGIS cams as before.
const SRV = Q.get('citysrv') || 'https://burn-city-game.fly.dev', CAMS_POLL = 10 * 60e3;
const LC = A.live = { cats: [], top: [], source: null, ok: 0, fails: 0 };
const nfmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K' : String(n | 0);
function liveCam(s, cat) { const vid = s.id; return { id: 'yt-' + vid, live: 1, type: 'youtube', vid, cat, name: clean(s.title, 60) || 'Live cam', city: cat, region: clean(s.channel, 40), attribution: clean(s.channel, 48) || 'YouTube live',
  viewers: Math.max(0, +s.viewers || 0), poster: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` }; }
function liveValidate(d) {
  if (!d || !Array.isArray(d.categories)) return null; const cats = [];
  for (const c of d.categories.slice(0, 12)) { const name = clean(c && c.name, 24); if (!name || !Array.isArray(c.streams)) continue;
    const streams = c.streams.filter(s => s && /^[A-Za-z0-9_-]{11}$/.test(s.id)).slice(0, 12).map(s => liveCam(s, name)).sort((a, b) => b.viewers - a.viewers); if (streams.length) cats.push({ name, streams }); }
  return cats.length ? cats : null;
}
function liveTop() {   // best of every category first (round-robin by rank), then by viewers: the faces show variety, ranked
  const out = [], seen = new Set(); for (let r = 0; r < 3; r++) for (const c of LC.cats.slice().sort((a, b) => (b.streams[r]?.viewers || 0) - (a.streams[r]?.viewers || 0))) { const s = c.streams[r]; if (s && !seen.has(s.vid)) { seen.add(s.vid); out.push(s); } }
  return out.slice(0, 12);
}
const screenList = () => !enabled() ? [] : LC.top.length ? LC.top : (A.data ? A.data.cams : []);
let camT = 0;
async function pollCams() {
  clearTimeout(camT); if (!enabled()) return; if (document.hidden) { camT = setTimeout(pollCams, 30e3); return; }
  try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10e3);
    const r = await fetch(SRV + '/api/cams', { cache: 'no-store', credentials: 'omit', signal: ctl.signal }); clearTimeout(to); if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json(), cats = liveValidate(d); if (!cats) throw new Error('bad payload');
    LC.cats = cats; LC.top = liveTop(); LC.source = d.source === 'youtube' ? 'youtube' : 'fallback'; LC.ok = Date.now(); LC.fails = 0; LC.err = null;
    syncScreens(screenList()); camT = setTimeout(pollCams, CAMS_POLL);
  } catch (e) { LC.fails++; LC.err = String(e && e.message || e); camT = setTimeout(pollCams, Math.min(30 * 60e3, CAMS_POLL * Math.pow(2, Math.min(LC.fails, 2)))); }
}

// ---------------------------------------------------------------- hysteresis -> effective level
let pend = { lv: 0, n: 0 }, changedAt = 0;
function ingest(v) {
  A.data = v; A.raw = v.level;
  if (A.pinned) { }   // test hook: level forced
  else if (!A.everOk) { A.everOk = true; setLevel(v.level, true); }   // first reading: adopt as-is (crossfades in from the normal city)
  else if (v.level === A.level) pend = { lv: v.level, n: 0 };
  else {
    pend = pend.lv === v.level ? { lv: v.level, n: pend.n + 1 } : { lv: v.level, n: 1 };
    const up = v.level > A.level;
    if (up ? pend.n >= 2 : (pend.n >= 3 && Date.now() - changedAt > CALM_DWELL)) setLevel(v.level);
  }
  applyLevel(v); syncScreens(screenList()); syncTable(v);
}
function setLevel(lv, first) { A.level = lv; changedAt = Date.now(); pend = { lv, n: 0 }; A.changes = (A.changes || 0) + (first ? 0 : 1); }
let lastSirenKey = '';
function applyLevel(v) {
  const lv = enabled() ? A.level : 0;
  window.__aegisThreat = lv; window.__aegisLevel = LNAME[lv];
  const EV = window.__cityEvents; if (EV && EV.setThreat) EV.setThreat(lv);
  // siren: once per change into an alert, only if the feed asks for it (or CRITICAL), only with sound on
  const sk = lv > 0 && (v && v.siren || lv === 2) ? lv + '|' + (v ? v.banner : '') : '';
  if (sk && sk !== lastSirenKey) siren(); lastSirenKey = sk;
}
function clearAll() {
  A.data = null; A.level = 0; A.everOk = false; pend = { lv: 0, n: 0 }; lastSirenKey = '';
  applyLevel(null); syncScreens(LC.top.length && enabled() ? LC.top : []); syncTable(null); opsClear(); close(); status();
}

// ---------------------------------------------------------------- screens: diegetic mounts
// Each mount: world group transform + local screen centre; the screen faces local +z. One merged support mesh per mount.
const CW = 512, CH = 320;   // canvas (header strip + 16:9 picture + caption)
function mounts() {   // the Pyramid's faces only (aegis-pyramid.js); no pyramid = no screens, the rest of the city is never touched
  const c = window.__city, PY = window.__aegisPyr; if (!PY || !PY.ready) return [];
  return PY.mounts(c.TIER === 'low' ? 1 : c.MOBILE ? 2 : 4);
}
function towerPose(m) {
  const n = m.node, o = n.name === 'XRP' ? new THREE.Vector3(1, 0, 1).normalize() : n.pos.clone().setY(0).normalize();
  const dir = new THREE.Vector3(-o.z, 0, o.x), dist = n.w * 1.45 + 3, y = Math.max(16, Math.min(n.h * .72, 66));
  return { x: n.pos.x, z: n.pos.z, yaw: Math.atan2(dir.x, dir.z), ly: y, lz: dist, key: n.w.toFixed(2) + '|' + n.h.toFixed(1) };
}
function supportGeo(m, armLen) {
  const parts = [new THREE.BoxGeometry(m.w + .6, m.h + .6, .45).translate(0, 0, -.3)];   // bezel
  if (m.where === 'pyramid') { }   // the pyramid itself is the support: bezel only
  else if (m.where === 'tower') parts.push(new THREE.BoxGeometry(.7, .7, armLen).translate(0, -m.h / 2 + 1, -armLen / 2 - .3), new THREE.BoxGeometry(.5, m.h * .6, .5).translate(0, -m.h * .2, -.6));   // arm back into the tower + spine
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
  // ticker strip (the feed's ticker lines; the banner text at CRITICAL), just under the header
  const tl = A.tickLine; if (tl) { const lv0 = window.__aegisThreat || 0; g.fillStyle = lv0 === 2 ? 'rgba(60,6,4,.82)' : 'rgba(2,12,20,.78)'; g.fillRect(0, py, CW, 26);
    g.fillStyle = lv0 === 2 ? '#ffd0c0' : lv0 === 1 ? '#ffe2a0' : '#bff6ff'; g.font = '700 14px system-ui,sans-serif'; let txt = tl; while (g.measureText(txt).width > CW - 20 && txt.length > 8) txt = txt.slice(0, -2);
    g.fillText(txt === tl ? txt : txt + '…', 10, py + 18); }
  // caption: cam name + credit
  g.fillStyle = 'rgba(2,8,14,.74)'; g.fillRect(0, CH - 40, CW, 40); g.fillStyle = '#e8fbff'; g.font = '700 16px system-ui,sans-serif'; g.fillText(cam.name.slice(0, 46), 12, CH - 22);
  g.fillStyle = '#9fc8d4'; g.font = '500 12px system-ui,sans-serif'; g.fillText(('© ' + (cam.attribution || 'public live camera')).slice(0, 64), 12, CH - 7);
  // header: AEGIS CITY WATCH — <city>, alert-coloured by level
  const lv = window.__aegisThreat || 0, hc = lv === 2 ? '#ff3b2a' : lv === 1 ? '#ffb000' : '#2fe3ff';
  g.fillStyle = lv === 2 ? '#2a0806' : '#071722'; g.fillRect(0, 0, CW, py); g.fillStyle = hc; g.fillRect(0, py - 2, CW, 2);
  g.font = '900 17px system-ui,sans-serif'; g.fillStyle = '#e6fbff'; g.fillText(((cam.live ? 'AEGIS LIVE — ' : 'AEGIS CITY WATCH — ') + cam.city).slice(0, 40), 12, 23);
  const blink = reduced() ? true : s.blink; g.fillStyle = blink ? '#ff3b3b' : '#5a1a1a'; g.beginPath(); g.arc(CW - 62, 17, 7, 0, 7); g.fill();
  g.fillStyle = '#ffd6d6'; g.font = '800 15px system-ui,sans-serif'; g.fillText(cam.type === 'snapshot' ? 'CAM' : 'LIVE', CW - 50, 23); if (cam.viewers) { g.font = '700 13px system-ui,sans-serif'; g.fillStyle = '#bff6ff'; const vt = '👁 ' + nfmt(cam.viewers); g.fillText(vt, CW - 74 - g.measureText(vt).width, 23); }
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
    else { g.position.set(m.x, m.y || 0, m.z); g.rotation.y = m.yaw; screen.position.set(m.lx, m.ly, m.lz); if (m.tilt) screen.rotation.x = -m.tilt; s.sup = new THREE.Mesh(supportGeo(m, 0), supMat); s.sup.position.copy(screen.position); s.sup.rotation.copy(screen.rotation); }
    g.add(s.sup, screen); C.S.add(g); C.pick.push(screen); A.screens.push(s);
  }
}
function reposeTowers() {   // towers reshape live with the market: keep the arm on the face
  for (const s of A.screens) { if (s.m.where !== 'tower') continue; const p = towerPose(s.m); if (p.key === s.key) continue; s.key = p.key;
    s.g.position.set(p.x, 0, p.z); s.g.rotation.y = p.yaw; s.screen.position.set(0, p.ly, p.lz); s.sup.geometry.dispose(); s.sup.geometry = supportGeo(s.m, p.lz); s.sup.position.copy(s.screen.position); }
}

// per-frame upkeep (cheap): response ops + command table, LIVE blink at ~1 Hz, cam rotation, snapshot refresh
let lastT = performance.now(), slowT = 0, lastLv = -1;
function loop() {
  requestAnimationFrame(loop); if (window.__cityPaused) return;   // The Wilds deep area hides the city
  const now = performance.now(), dt = Math.min(.1, (now - lastT) / 1e3); lastT = now;
  const c = window.__city; if (!c || document.hidden) return;
  try { opsFrame(now); } catch (e) { if (!A.opsErr) console.warn('aegis ops', e); A.opsErr = String(e && e.message || e); }
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
let modal = null, snapTimer = 0, conTimer = 0, pushed = false;
function shell(label) {   // one modal at a time; switching (console -> cam) keeps the single history entry
  close(true);
  modal = document.createElement('div'); modal.id = 'aegisModal'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', label);
  const card = document.createElement('div'); card.className = 'am-card'; modal.append(card); document.body.append(modal);
  modal.addEventListener('pointerdown', e => { if (e.target === modal) close(); });
  // game input paused: release held keys/buttons, swallow keys until closed
  try { const k = window.__city && window.__city.input && window.__city.input.keys; if (k) for (const q in k) k[q] = 0; } catch { }
  touchHeld = false; window.__aegisModalOpen = true; for (const s of A.screens) if (s.vid) try { s.vid.el.pause(); } catch { }
  if (!pushed) try { history.pushState({ aegisModal: 1 }, ''); pushed = true; } catch { pushed = false; }
  return card;
}
function open(cam) {
  if (!cam) return openConsole();
  if (cam.live || (cam === 'live')) return openLive(cam === 'live' ? null : cam);
  return openPlain(cam);
}
function openPlain(cam) {
  const card = shell('AEGIS City Watch: ' + cam.name);
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
  card.append(head, box, foot);
  x.focus({ preventScroll: true }); A.modalOpen = cam.id;
}
addEventListener('popstate', () => { if (modal) { pushed = false; close(); } });   // Android/browser back closes the modal instead of leaving the game
const swallow = e => { if (!modal) return; if (e.key === 'Escape') { if (e.type === 'keydown') close(); } e.stopImmediatePropagation(); };
addEventListener('keydown', swallow, true); addEventListener('keyup', swallow, true);
function close(keepHist) { clearInterval(snapTimer); clearInterval(conTimer); clearInterval(comT); const had = !!modal; if (modal) { modal.remove(); modal = null; } A.modalOpen = null; A.consoleOpen = false; window.__aegisModalOpen = false;
  if (had && pushed && keepHist !== true) { pushed = false; try { if (history.state && history.state.aegisModal) history.back(); } catch { } } }

// ---------------------------------------------------------------- live-stream browser: category tabs, list by viewers, one player, comments
let comT = 0;
const myName = () => { try { return (window.__myName || localStorage.getItem('bc_name') || '').toString().slice(0, 24); } catch { return ''; } };
const myPid = () => { try { let p = localStorage.getItem('bc_cpid'); if (!p) { p = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem('bc_cpid', p); } return p; } catch { return ''; } };
function openLive(cam) {
  if (!LC.cats.length) { if (cam) return openPlain(cam); return openConsole(); }
  const card = shell('AEGIS live streams'); card.classList.add('am-live');
  let cat = (cam && LC.cats.find(c => c.name === cam.cat)) || LC.cats[0], cur = cam && cat.streams.find(s => s.vid === cam.vid) || cat.streams[0];
  const head = E('div', 'am-head'), tl = E('div'), hb = E('b'), hs = E('small'); tl.append(hb, hs);
  const x = E('button', 'am-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close; head.append(tl, x);
  const tabs = E('div', 'al-tabs'); tabs.setAttribute('role', 'tablist');
  const box = E('div', 'am-video'), body = E('div', 'al-body'), side = E('div', 'al-list'), com = E('div', 'al-com');
  const cl = E('div', 'al-clist'), form = E('form', 'al-form'), inp = E('input'), sb = E('button', null, 'Post'), msg = E('div', 'ac-dim al-msg');
  inp.maxLength = 200; inp.placeholder = 'Say something about this stream (200 max)'; inp.setAttribute('aria-label', 'Comment'); inp.autocomplete = 'off'; sb.type = 'submit'; form.append(inp, sb);
  com.append(E('h4', null, '💬 Comments'), cl, form, msg);
  // the modal swallows keys for the game, but typing must still reach the input
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') close(); e.stopPropagation(); }); inp.addEventListener('keyup', e => e.stopPropagation());
  function renderTabs() { tabs.replaceChildren(); for (const c of LC.cats) { const b = E('button', 'al-tab' + (c === cat ? ' on' : ''), c.name); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', c === cat ? 'true' : 'false');
    b.onclick = () => { if (c === cat) return; cat = c; renderTabs(); renderList(); play(cat.streams[0]); }; tabs.append(b); } }
  function renderList() { side.replaceChildren(); cat.streams.forEach((s, i) => { const b = E('button', 'al-item' + (s === cur ? ' on' : '')); b.type = 'button'; const im = E('img'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.src = s.poster; im.onerror = () => im.remove();
    const t = E('div'); t.append(E('b', null, (i + 1) + '. ' + s.name), E('small', null, (s.viewers ? '👁 ' + nfmt(s.viewers) + ' watching · ' : '') + (s.region || ''))); b.append(im, t); b.onclick = () => { play(s); renderList(); }; side.append(b); }); }
  function play(s) { cur = s; box.replaceChildren(); hb.textContent = 'AEGIS LIVE — ' + cat.name; hs.textContent = s.name + (s.viewers ? ' · ' + nfmt(s.viewers) + ' watching' : '');
    const f = document.createElement('iframe'); f.src = s.embed; f.title = s.name; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.setAttribute('allowfullscreen', ''); f.referrerPolicy = 'strict-origin-when-cross-origin'; box.append(f);
    A.modalOpen = s.id; loadComments(); }
  async function loadComments() { const vid = cur.vid; try { const r = await fetch(SRV + '/api/cams/' + vid + '/comments', { cache: 'no-store', credentials: 'omit' }); if (!r.ok) throw 0; const d = await r.json(); if (cur.vid !== vid || !modal) return; renderComments(Array.isArray(d.comments) ? d.comments : []); } catch { if (cur.vid === vid) msg.textContent = 'Comments are offline right now.'; } }
  function renderComments(list) { cl.replaceChildren(); if (!list.length) cl.append(E('div', 'ac-dim', 'No comments yet. Be the first.'));
    for (const c of list.slice(-50).reverse()) { const r = E('div', 'al-c'); r.append(E('b', null, clean(c.name, 24) || 'guest'), E('span', null, clean(c.text, 200)), E('small', null, new Date(+c.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))); cl.append(r); } }   // textContent only: never innerHTML
  form.onsubmit = async e => { e.preventDefault(); const text = inp.value.trim(); if (!text) return; sb.disabled = true; msg.textContent = '';
    try { const r = await fetch(SRV + '/api/cams/' + cur.vid + '/comments', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, name: myName(), pid: myPid() }) }); const d = await r.json().catch(() => ({}));
      if (r.ok) { inp.value = ''; loadComments(); } else msg.textContent = d.error === 'slow_down' ? 'One comment every 5 seconds, please.' : d.error === 'too_long' ? 'Max 200 characters.' : 'Could not post that.'; }
    catch { msg.textContent = 'Comments are offline right now.'; } finally { setTimeout(() => sb.disabled = false, 1200); } };
  const foot = E('div', 'am-foot', `Streams: YouTube live (${LC.source === 'youtube' ? 'ranked by live viewers, refreshed by our server' : 'curated 24/7 cams'}) · plays via YouTube privacy-enhanced mode · comments are public, keep it friendly`);
  const main = E('div', 'al-main'); main.append(box, com); body.append(main, side);
  card.append(head, tabs, body, foot); renderTabs(); renderList(); play(cur); comT = setInterval(() => { if (!document.hidden) loadComments(); }, 15e3);
  x.focus({ preventScroll: true }); A.liveOpen = true;
}
A.openLive = openLive;

// ---------------------------------------------------------------- ticker -> the city's event queue (ranked below gameplay)
let tickI = 0, tickNext = 0;
const LEVEL_COL = ['#2fe3ff', '#ffb000', '#ff3b2a'];
function tickerTick() {   // rotates the line shown in the strip on the Pyramid screens (no longer queued as city banners)
  const v = A.data; if (!v || !enabled()) { A.tickLine = ''; return; }
  const now = performance.now(); if (now < tickNext) return; tickNext = now + (FAST ? 4e3 : 8e3);
  const lines = (A.level === 2 && v.banner ? [v.banner] : []).concat(v.ticker); A.tickLine = lines.length ? lines[tickI++ % lines.length] : ''; A.tickerQueued++;
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

// ================================================================ AEGIS Command table + Response Ops
const LCOL = ['#2fe3ff', '#ffb000', '#ff3b2a'], CYAN = new THREE.Color('#2fe3ff');
const WAVE = 8 * 60e3, LIFE = 5 * 60e3, HOLD_S = 3, BEACON_R = 4.5, TABLE_R = 5.5, TS = 1.5;   // TS: table scale
const clock = () => Date.now() + (A.tOff || 0);
const OPS = A.ops = { beacons: [], spawned: 0, stabilized: 0, wave: -1, drones: 0, rec: loadRec() };
let touchHeld = false;
function loadRec() { try { const r = JSON.parse(localStorage.getItem('bc_aegisOps') || 'null'); if (r && typeof r === 'object') return { n: Math.max(0, r.n | 0), done: Array.isArray(r.done) ? r.done.filter(k => typeof k === 'string').slice(-30) : [], last: +r.last || 0 }; } catch { } return { n: 0, done: [], last: 0 }; }
function saveRec() { try { localStorage.setItem('bc_aegisOps', JSON.stringify(OPS.rec)); } catch { } }
const RANKS = [[0, 'Unranked'], [1, 'Recruit'], [3, 'Responder'], [10, 'Sentinel'], [25, 'Warden'], [60, 'Aegis Prime']];
const rankOf = n => RANKS.filter(r => n >= r[0]).pop()[1];
function hash(n) { let h = (n | 0) ^ 0x9e3779b9; h = Math.imul(h ^ h >>> 16, 0x85ebca6b); h = Math.imul(h ^ h >>> 13, 0xc2b2ae35); return (h ^ h >>> 16) >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function toastCity(txt) {   // the city's own toast stack (events.js), so it looks like every other city notice
  const t = $('cityToast'); if (!t) return; const d = document.createElement('div'); d.textContent = txt; t.appendChild(d);
  requestAnimationFrame(() => d.classList.add('on')); setTimeout(() => d.classList.remove('on'), 4800); setTimeout(() => d.remove(), 5400); while (t.children.length > 3) t.firstChild.remove();
}
function tick(text, lv = A.level) { const q = window.__evq; if (q) q.push({ type: 'aegis', text, level: LNAME[lv], col: LEVEL_COL[lv], when: new Date() }); }
function districtAt(x, z) { const c = window.__city; let best = null, bd = 1e9; for (const n of (c && c.E && c.E.nodes) || []) { const d = Math.hypot(x - n.pos.x, z - n.pos.z); if (d < (n.distR || 60) && d < bd) { bd = d; best = n; } } return best ? best.name : 'outer'; }
const isWalk = () => { const c = window.__city; return !!(c && c.getMode && c.getMode() === 'explore' && !window.__burnTowerOpen); };

// ---------------------------------------------------------------- shared additive shaders (cheap, mobile-safe)
let SH = null;
function shaders() {
  if (SH) return SH;
  const beam = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color() }, t: { value: 0 }, a: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 c;uniform float t,a;varying vec2 vU;void main(){float f=pow(1.-vU.y,1.7);float s=.7+.3*sin(t*5.-vU.y*40.);gl_FragColor=vec4(c*(f*s*a),1.);}' });
  const ring = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color('#2fe3ff') }, p: { value: 0 }, t: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 c;uniform float p,t;varying vec2 vU;void main(){vec2 q=vU-.5;float an=fract(atan(q.x,q.y)/6.28318+1.);float on=step(an,p);gl_FragColor=vec4(c*(on*1.4+(1.-on)*.12),1.);}' });
  const cone = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color('#cfe8ff') }, a: { value: .2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 c;uniform float a;varying vec2 vU;void main(){gl_FragColor=vec4(c*(pow(vU.y,1.6)*a),1.);}' });
  const globe = new THREE.ShaderMaterial({ uniforms: { c: { value: new THREE.Color('#2fe3ff') }, t: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vU;varying vec3 vN,vV;void main(){vU=uv;vec4 w=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-w.xyz);gl_Position=projectionMatrix*w;}',
    fragmentShader: 'uniform vec3 c;uniform float t;varying vec2 vU;varying vec3 vN,vV;void main(){float fr=pow(1.-abs(dot(vN,vV)),2.2);vec2 g=abs(fract(vU*vec2(24.,12.))-.5);float gl=step(.46,max(g.x,g.y));float sc=1.-smoothstep(0.,.03,abs(fract(vU.y-t*.12)-.5));gl_FragColor=vec4(c*(fr*.9+gl*.35+.05+sc*.5),1.);}' });
  const add = col => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  SH = { beam, ring, cone, globe, add, pin: new THREE.SphereGeometry(.075, 8, 6), tableMat: new THREE.MeshStandardMaterial({ color: 0x141b24, metalness: .8, roughness: .35, emissive: 0x042a36, emissiveIntensity: .8 }) };
  return SH;
}
function labelSprite(w = 512, h = 128) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); sp.userData.cv = cv; sp.userData.key = ''; return sp;
}
function drawLabel(sp, title, sub, col) {
  const key = title + '|' + sub + '|' + col; if (sp.userData.key === key) return; sp.userData.key = key;
  const cv = sp.userData.cv, g = cv.getContext('2d'), w = cv.width, h = cv.height; g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(3,10,16,.72)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 18) : g.rect(4, 4, w - 8, h - 8); g.fill(); g.strokeStyle = col; g.lineWidth = 4; g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#f0fdff'; g.font = '900 44px system-ui,sans-serif'; g.shadowColor = col; g.shadowBlur = 14; g.fillText(title, w / 2, h * .46); g.shadowBlur = 0;
  g.fillStyle = col; g.font = '700 28px system-ui,sans-serif'; g.fillText(sub, w / 2, h * .82); sp.material.map.needsUpdate = true;
}

// ---------------------------------------------------------------- AEGIS Command: holographic globe table beside the police station
let TB = null;
function tableSpot() {
  const PY = window.__aegisPyr; if (PY && PY.ready) { const yaw = PY.mounts(1)[0].yaw, d = PY.half + 9; return { x: PY.x + Math.sin(yaw) * d, z: PY.z + Math.cos(yaw) * d, yaw, where: 'pyramid' }; }
  const c = window.__city, CL = window.__cityLife || {}, P = CL.police, coll = c.colliders || [];
  const free = (x, z) => coll.every(o => !o || o.h < .5 || Math.hypot(x - o.x, z - o.z) > o.r + 2.4) && !(window.__estate && window.__estate.inLake && window.__estate.inLake(x, z));
  if (P) { const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw), at = (lx, lz) => ({ x: P.x + lx * cs + lz * sn, z: P.z - lx * sn + lz * cs });
    for (const [lx, lz] of [[P.w / 2 + 4, -P.d / 2 - 2], [-P.w / 2 - 4, -P.d / 2 - 2], [P.w / 2 + 4.5, 0], [-P.w / 2 - 4.5, 0], [P.w / 2 + 4, P.d / 2 + 3]]) { const q = at(lx, lz); if (free(q.x, q.z)) return { ...q, yaw: P.yaw, where: 'police' }; } }
  for (let a = 0; a < 6.28; a += .52) { const x = Math.cos(a) * 51, z = Math.sin(a) * 51; if (free(x, z)) return { x, z, yaw: -a, where: 'plaza' }; }   // between the XRP rings
  return { x: 0, z: 51, yaw: 0, where: 'plaza' };
}
const geoVec = (la, ln, r, out = new THREE.Vector3()) => { const ph = (90 - la) * Math.PI / 180, th = (ln + 180) * Math.PI / 180; return out.set(-r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)); };
function buildTable() {
  const c = window.__city; if (!c || TB) return; const S = shaders(), sp = tableSpot();
  const g = new THREE.Group(); g.name = 'aegis_command'; g.position.set(sp.x, c.groundAt ? c.groundAt(sp.x, sp.z, .5) : 0, sp.z); g.rotation.y = sp.yaw;
  const k = new THREE.Group(); k.scale.setScalar(TS); g.add(k);
  const mg = gs => { gs = gs.map(x => x.index ? x.toNonIndexed() : x); let n = 0; gs.forEach(x => n += x.attributes.position.count); const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;   // merge (fewer draws)
    gs.forEach(x => { pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; x.dispose(); });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out; };
  const ped = new THREE.Mesh(mg([new THREE.CylinderGeometry(1.5, 1.9, 1, 20).translate(0, .5, 0), new THREE.CylinderGeometry(1.75, 1.75, .12, 28).translate(0, 1.06, 0)]), S.tableMat);   // pedestal + top
  const rim = new THREE.Mesh(mg([new THREE.TorusGeometry(1.72, .05, 6, 40).rotateX(Math.PI / 2).translate(0, 1.13, 0), new THREE.TorusGeometry(1.62, .012, 4, 64).rotateX(Math.PI / 2 - .4).translate(0, 2.95, 0)]), S.add(0x2fe3ff));   // rim + orbit ring
  const beamM = S.beam.clone(); beamM.uniforms.c.value.set('#2fe3ff'); beamM.uniforms.a.value = .45;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.55, 1.5, 24, 1, true), beamM); beam.position.y = 1.9;
  const globeM = S.globe.clone(); const globe = new THREE.Group(); globe.position.y = 2.95;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 20), globeM); globe.add(shell);
  const orbit = null;
  const label = labelSprite(); label.position.y = 5.1; label.scale.set(3.2, .8, 1);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 2.6; hit.userData = { kind: 'aegis', cam: null, label: 'AEGIS Command · tap to open the console' };
  k.add(ped, rim, beam, globe, label, hit); c.S.add(g); c.pick.push(hit);
  if (c.colliders) { TB = {}; TB.coll = { x: sp.x, z: sp.z, r: 1.9 * TS, h: 1.15 * TS }; c.colliders.push(TB.coll); } else TB = {};
  Object.assign(TB, { g, k, globe, globeM, beamM, rim, label, hit, orbit, ims: [], sig: '', x: sp.x, z: sp.z, where: sp.where });
  A.table = { x: sp.x, z: sp.z, where: sp.where };
}
function killTable() {
  if (!TB) return; const c = window.__city;
  pinsKill();
  const i = c.pick.indexOf(TB.hit); if (i >= 0) c.pick.splice(i, 1); if (TB.coll) { const j = c.colliders.indexOf(TB.coll); if (j >= 0) c.colliders.splice(j, 1); }
  c.S.remove(TB.g); TB.g.traverse(o => { if (o.geometry && o.geometry !== SH.pin) o.geometry.dispose(); }); TB = null; A.table = null;
}
function pinsKill() {   // instanced pins: <= 3 draws (geo cams on the globe, orbit cams, incident rings) instead of one mesh each
  if (!TB || !TB.ims) return; for (const m of TB.ims) { m.parent && m.parent.remove(m); if (m.geometry !== SH.pin) m.geometry.dispose(); m.material.dispose(); m.dispose && m.dispose(); } TB.ims = []; TB.geoN = TB.orbN = TB.incN = 0;
}
function syncTable(v) {
  if (!v || !enabled()) { killTable(); return; }
  if (!TB) buildTable(); if (!TB) return;
  const cams0 = v.cams || [], incs0 = v.incidents || [];
  const sig = cams0.map(c => c.id).join(',') + '|' + incs0.map(i => i.title + i.sev).join(',') + '|' + A.level;
  if (sig === TB.sig) return; TB.sig = sig; const S = shaders(); pinsKill();
  const geo = cams0.filter(c => !c.orbit && c.geo), orb = cams0.filter(c => c.orbit || !c.geo), incs = incs0.filter(i => i.geo);
  const mk = (g, n, parent) => { const m = new THREE.InstancedMesh(g, S.add(0xffffff), n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parent.add(m); TB.ims.push(m); return m; };
  TB.ims = []; TB.geo = geo.map(c => geoVec(c.geo[0], c.geo[1], 1.3)); TB.orbN = orb.length; TB.incs = incs.map((x, i) => ({ p: geoVec(x.geo[0], x.geo[1], 1.27), sev: x.sev, ph: i }));
  TB.geoIM = geo.length ? mk(S.pin, geo.length, TB.globe) : null; TB.orbIM = orb.length ? mk(S.pin, orb.length, TB.k) : null;
  TB.incIM = incs.length ? mk(new THREE.RingGeometry(.07, .12, 16), incs.length, TB.globe) : null;
  if (TB.incIM) { TB.incIM.material.opacity = .8; const cc = new THREE.Color(); TB.incs.forEach((x, i) => TB.incIM.setColorAt(i, cc.set(LCOL[x.sev]))); }
}
const _q = new THREE.Vector3();
function tableFrame(t) {
  if (!TB) return; const lv = A.level, col = LCOL[lv];
  TB.globe.rotation.y = t * .12; TB.globeM.uniforms.t.value = t; TB.globeM.uniforms.c.value.set(col).lerp(CYAN, lv ? .35 : 0); TB.beamM.uniforms.t.value = t; TB.beamM.uniforms.c.value.set(col);
  TB.rim.material.color.set(col);
  const _c = TB._c || (TB._c = new THREE.Color()), o = TB._o || (TB._o = new THREE.Object3D()), lc = _c.set(col);
  if (TB.geoIM) { TB.geo.forEach((p, i) => { o.position.copy(p); o.rotation.set(0, 0, 0); o.scale.setScalar(1.4 + .5 * Math.sin(t * 4 + p.x * 9)); o.updateMatrix(); TB.geoIM.setMatrixAt(i, o.matrix); }); TB.geoIM.material.color.copy(lc); TB.geoIM.instanceMatrix.needsUpdate = true; }
  if (TB.orbIM) { for (let i = 0; i < TB.orbN; i++) { const a = t * .5 + i * 1.7; o.position.set(Math.cos(a) * 1.62, 2.95 - Math.sin(a) * Math.sin(.4) * 1.62, Math.sin(a) * 1.62 * Math.cos(.4)); o.rotation.set(0, 0, 0); o.scale.setScalar(1.6); o.updateMatrix(); TB.orbIM.setMatrixAt(i, o.matrix); } TB.orbIM.material.color.copy(lc); TB.orbIM.instanceMatrix.needsUpdate = true; }
  if (TB.incIM) { TB.incs.forEach((x, i) => { const f = (t * .8 + x.ph * .3) % 1; o.position.copy(x.p); o.lookAt(x.p.x * 2, x.p.y * 2, x.p.z * 2); o.scale.setScalar(1 + f * 2.2); o.updateMatrix(); TB.incIM.setMatrixAt(i, o.matrix); TB.incIM.setColorAt(i, _c.set(LCOL[x.sev])); }); TB.incIM.instanceMatrix.needsUpdate = true; if (TB.incIM.instanceColor) TB.incIM.instanceColor.needsUpdate = true; }
  const live = OPS.beacons.filter(b => !b.done).length;
  drawLabel(TB.label, 'AEGIS COMMAND', LNAME[lv] + (live ? ` · ${live} ANOMAL${live > 1 ? 'IES' : 'Y'}` : ' · USE TO OPEN'), col);
}

// ---------------------------------------------------------------- Response Ops: deterministic beacons
let RMAX = 0;
function cityR() { if (RMAX) return RMAX; const c = window.__city; let m = 200; for (const s of c.streets || []) { if (s.type === 'ring') m = Math.max(m, Math.hypot(s.c.x, s.c.z) + s.r); else m = Math.max(m, Math.hypot(s.a.x, s.a.z), Math.hypot(s.b.x, s.b.z)); } return RMAX = Math.min(380, m * .92); }
function snapStreet(x, z) {
  const c = window.__city; let bx = x, bz = z, bd = 1e9;
  for (const s of c.streets || []) {
    let px, pz; if (s.type === 'ring') { const dx = x - s.c.x, dz = z - s.c.z, d = Math.hypot(dx, dz) || 1; px = s.c.x + dx / d * s.r; pz = s.c.z + dz / d * s.r; }
    else { const ax = s.a.x, az = s.a.z, vx = s.b.x - ax, vz = s.b.z - az, L = vx * vx + vz * vz || 1, u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L)); px = ax + vx * u; pz = az + vz * u; }
    const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; bx = px; bz = pz; }
  }
  return [bx, bz];
}
function spots(w, n) {   // same wave number -> same spots on every client: a ring around the Pyramid (fallback: on the streets)
  const PY = window.__aegisPyr;
  if (PY && PY.ready) { const c = window.__city, coll = c.colliders || [], out = [], r = rng(hash(w * 7919 + 17)), a0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) { let pick = null;
      for (let k = 0; k < 24 && !pick; k++) { const a = a0 + i * Math.PI * 2 / 3 + (r() - .5) * .9, rad = PY.half + 14 + r() * 18, x = PY.x + Math.cos(a) * rad, z = PY.z + Math.sin(a) * rad;
        if (!coll.every(o => !o || o === PY.coll || o.h < .6 || Math.hypot(x - o.x, z - o.z) > o.r + 1.2)) continue;
        if (TB && Math.hypot(TB.x - x, TB.z - z) < 9) continue; if (out.some(o => Math.hypot(o[0] - x, o[1] - z) < 14)) continue; pick = [x, z]; }
      out.push(pick || [PY.x + Math.cos(a0 + i * 2.1) * (PY.half + 20), PY.z + Math.sin(a0 + i * 2.1) * (PY.half + 20)]); }
    return out; }
  const c = window.__city, coll = c.colliders || [], out = [], R = cityR(), es = window.__estate;
  for (let i = 0; i < n; i++) {
    const r = rng(hash(w * 7919 + i * 104729 + 17)); let pick = null;
    for (let k = 0; k < 30 && !pick; k++) {
      const a = r() * Math.PI * 2, rad = 70 + Math.sqrt(r()) * (R - 70); const [x, z] = snapStreet(Math.cos(a) * rad, Math.sin(a) * rad);
      if (Math.hypot(x, z) > 420 || (es && es.inLake && es.inLake(x, z))) continue;
      if (!coll.every(o => !o || o.h < .6 || Math.hypot(x - o.x, z - o.z) > o.r + 1.2)) continue;
      if (out.some(o => Math.hypot(o[0] - x, o[1] - z) < 70) || (TB && Math.hypot(TB.x - x, TB.z - z) < 30)) continue;
      pick = [x, z];
    }
    if (!pick) { const a = (i / n) * Math.PI * 2 + w; pick = snapStreet(Math.cos(a) * 120, Math.sin(a) * 120); }
    out.push(pick);
  }
  return out;
}
function makeBeacon(key, w, i, x, z, exp, lv) {
  const c = window.__city, S = shaders(), col = LCOL[Math.max(1, lv)], g = new THREE.Group(); g.name = 'aegis_beacon'; const y = c.groundAt ? c.groundAt(x, z, .5) : 0; g.position.set(x, y, z);
  const beamM = S.beam.clone(); beamM.uniforms.c.value.set(col);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2, 160, 10, 1, true).translate(0, 80, 0), beamM);
  const ring1 = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.9, 40).rotateX(-Math.PI / 2), S.add(col)); ring1.position.y = .06;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(BEACON_R, BEACON_R + .25, 40, 1, 0, Math.PI * 1.5).rotateX(-Math.PI / 2), S.add(col)); ring2.position.y = .05;
  const progM = S.ring.clone(); const prog = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 48).rotateX(-Math.PI / 2), progM); prog.position.y = .09;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), S.add(col)); core.position.y = 2.6;
  const label = labelSprite(); label.position.y = 6.4; label.scale.set(5.6, 1.4, 1);
  g.add(pillar, ring1, ring2, prog, core, label); c.S.add(g);
  const inc = A.data && A.data.incidents[i % Math.max(1, A.data.incidents.length)];
  const b = { k: key, w, i, x, z, exp, lv, g, beamM, progM, ring1, ring2, core, label, prog: 0, done: false, by: null, peers: new Map(), dname: districtAt(x, z), tag: inc && inc.cat ? inc.cat.replace(/_/g, ' ') : 'SIGNAL ANOMALY', born: performance.now(), fade: 0 };
  return b;
}
function killBeacon(b) { const c = window.__city; c.S.remove(b.g); b.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== SH.cone) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
function opsClear() { for (const b of OPS.beacons) killBeacon(b); OPS.beacons = []; droneSet(0); }
function opsSpawn() {
  const now = clock(), w = Math.floor(now / WAVE), exp = w * WAVE + LIFE, lv = enabled() ? A.level : 0;
  const ok = lv >= 1 && (A.pinned || A.lastOk && A.fails === 0 && A.state === 'ok');
  if (!enabled() || lv === 0) { OPS.prevLv = 0; OPS.alertPend = false; if (OPS.beacons.length) { if (lv === 0 && enabled() && OPS.beacons.some(b => !b.done)) toastCity('🛰 AEGIS stood down: anomaly beacons cleared.'); opsClear(); } return; }
  for (const b of OPS.beacons) if (!b.done && now > b.exp) { b.done = true; b.expired = true; b.fade = .001; }
  // threat rose (or first read at ELEVATED/CRITICAL): beacons now, not at the next 5-of-8-min window. Off-window alert beacons get
  // their own wave-seeded key/spots ('w<N>a-i') and a full LIFE from now; pending until the feed is ok.
  if (lv > (OPS.prevLv || 0)) OPS.alertPend = true; OPS.prevLv = lv;
  if (!ok) return;
  const off = now >= exp - 5e3; if (off && !OPS.alertPend) return;
  const n = lv === 2 ? 3 : 1, pts = spots(off ? w + 100003 : w, 3), aexp = off ? now + LIFE : exp, kw = off ? w + 'a' : w; let fresh = 0;
  if (off && OPS.alertW === w && OPS.alertLv >= lv) { OPS.alertPend = false; return; }
  for (let i = 0; i < n; i++) {
    const key = 'w' + kw + '-' + i; if (OPS.beacons.some(b => b.k === key) || OPS.rec.done.includes(key)) continue;
    OPS.beacons.push(makeBeacon(key, w, i, pts[i][0], pts[i][1], aexp, lv)); OPS.spawned++; fresh++;
  }
  OPS.alertPend = false; if (off) { OPS.alertW = w; OPS.alertLv = lv; }
  if (fresh) { OPS.wave = w; const ds = [...new Set(OPS.beacons.filter(b => !b.done).map(b => b.dname))].join(', ');
    tick(`🛰 AEGIS RESPONSE OPS: ${fresh > 1 ? fresh + ' signal anomalies' : 'signal anomaly'} detected (${ds}). Go there and hold USE to stabilize.`);
    toastCity(`🛰 ${fresh > 1 ? fresh + ' signal anomalies' : 'Signal anomaly'} in ${ds} · check the minimap`); }
}
function nearBeacon(p, r = BEACON_R) { let best = null, bd = r; for (const b of OPS.beacons) { if (b.done) continue; const d = Math.hypot(p.x - b.x, p.z - b.z); if (d < bd) { bd = d; best = b; } } return best; }
function helpers(b, nowP) { let n = 0; const P = window.__peers; for (const [pid, t] of b.peers) { if (nowP - t > 1800) { b.peers.delete(pid); continue; } const q = P && P.get(+pid); if (!q || !q.g || Math.hypot(q.g.position.x - b.x, q.g.position.z - b.z) < 14) n++; } return n; }
let lastHB = 0;
function stabilize(b, by, mine) {
  if (b.done) return; b.done = true; b.by = by; b.fade = .001; b.prog = 1; OPS.stabilized++;
  OPS.rec.done.push(b.k); OPS.rec.done = OPS.rec.done.slice(-30);
  if (mine) { OPS.rec.n++; OPS.rec.last = Date.now(); const r = rankOf(OPS.rec.n), up = rankOf(OPS.rec.n - 1) !== r;
    toastCity(`✅ Anomaly stabilized · AEGIS Responder ×${OPS.rec.n}${up ? ' · rank up: ' + r + '!' : ''}`);
    tick(`✅ Signal anomaly in ${b.dname} stabilized by you · AEGIS Responder ×${OPS.rec.n} (${r})`);
    try { window.__citySend && window.__citySend({ t: 'ab', k: b.k, s: 1 }); } catch { } chime(); }
  else { tick(`✅ Signal anomaly in ${b.dname} stabilized by ${by || 'another responder'}`); toastCity(`✅ ${by || 'A responder'} stabilized the ${b.dname} anomaly`); }
  saveRec(); if (A.consoleOpen) renderOps();
}
addEventListener('bc-aegis', e => {   // relayed by the city WebSocket (city.js): {t:'ab', pid, name, k, h, s}
  const m = e.detail || {}; if (typeof m.k !== 'string') return; const b = OPS.beacons.find(x => x.k === m.k); if (!b || b.done) return;
  if (m.s) stabilize(b, clean(m.name, 24) || 'another responder', false); else if (m.h) b.peers.set(String(m.pid | 0), performance.now());
});
let opsT = 0;
function opsFrame(now) {
  const c = window.__city; if (!c) return; const t = now / 1000, dt = Math.min(.5, Math.max(0, (now - (opsT || now)) / 1e3)); opsT = now;   // wall-clock: holds take ~3 s even on slow phones
  tableFrame(t);
  const me = c.P && c.P.pos, keys = c.input && c.input.keys, walk = isWalk();
  const held = walk && !modal && !!(keys && keys.KeyE || touchHeld), nb = me && walk ? nearBeacon(me) : null;
  OPS.holding = false;
  for (let i = OPS.beacons.length - 1; i >= 0; i--) {
    const b = OPS.beacons[i];
    if (b.fade) {   // stabilized (cyan flash, beam widens) or expired (dims) -> removed
      b.fade += dt / (b.expired ? 2.5 : 1.6); const f = Math.min(1, b.fade);
      b.beamM.uniforms.a.value = 1 - f; if (!b.expired) { b.beamM.uniforms.c.value.lerp(CYAN, .2); b.g.children[0].scale.set(1 + f * 3, 1, 1 + f * 3); b.core.position.y = 2.6 + f * 30; }
      b.ring1.material.opacity = b.ring2.material.opacity = b.core.material.opacity = .85 * (1 - f); b.label.material.opacity = 1 - f; b.progM.uniforms.p.value = b.expired ? 0 : 1;
      if (f >= 1) { killBeacon(b); OPS.beacons.splice(i, 1); } continue;
    }
    const hp = helpers(b, now), mine = b === nb && held;
    if (mine) { OPS.holding = true; b.prog += dt * Math.min(3, 1 + .75 * hp) / HOLD_S;
      if (now - lastHB > 900) { lastHB = now; try { window.__citySend && window.__citySend({ t: 'ab', k: b.k, h: 1 }); } catch { } } }
    else if (hp) b.prog = Math.min(.98, b.prog + dt * hp / HOLD_S);   // others are on it: watch the ring fill (they confirm it)
    else b.prog = Math.max(0, b.prog - dt * .2);
    if (mine && b.prog >= 1) { stabilize(b, 'you', true); continue; }
    b.beamM.uniforms.t.value = t; b.progM.uniforms.p.value = b.prog; b.progM.uniforms.t.value = t;
    b.ring2.rotation.y = t * .8; b.core.rotation.y = t * 2; b.core.position.y = 2.6 + Math.sin(t * 2 + b.i) * .35; const pulse = 1 + (mine ? .25 : .08) * Math.sin(t * (mine ? 14 : 3));
    b.core.scale.setScalar(pulse); b.ring1.scale.setScalar(1 + .06 * Math.sin(t * 3 + b.i));
    const left = Math.max(0, b.exp - clock()), mm = Math.floor(left / 60e3), ss = Math.floor(left / 1e3) % 60;
    drawLabel(b.label, b.prog > .02 ? `STABILIZING ${Math.round(b.prog * 100)}%` : b.tag.slice(0, 18), `${b.dname} · ${mm}:${String(ss).padStart(2, '0')}${hp ? ' · +' + hp + ' helping' : ''}`, LCOL[Math.max(1, b.lv)]);
  }
  dronesFrame(t, dt);
}
// USE: aegis offers its own interactables to app.js's nearest-interaction (hold-to-stabilize, open console)
function nearHook(p) {
  if (!enabled() || !isWalk()) return null;
  const b = nearBeacon(p); if (b) { const hp = helpers(b, performance.now()); return { label: `Hold ${window.__city.MOBILE ? 'USE' : 'E'} to stabilize the anomaly · ${Math.round(b.prog * 100)}%${hp ? ' · +' + hp + ' helping' : ''}`, act: () => { } }; }
  if (TB && Math.hypot(p.x - TB.x, p.z - TB.z) < TABLE_R + 2) return { label: 'AEGIS Command · open the console', act: openConsole };
  return null;
}
function holdInputs() {   // touch/mouse hold on the USE pad or the prompt (keyboard E is read from the city's key map)
  const on = e => { if (OPS.beacons.length && !modal) touchHeld = true; }, off = () => { touchHeld = false; };
  for (const id of ['tUse', 'prompt']) { const el = $(id); if (!el || el.dataset.aegisHold) continue; el.dataset.aegisHold = '1';
    el.addEventListener('touchstart', on, { passive: true }); el.addEventListener('pointerdown', on); }
  for (const ev of ['touchend', 'touchcancel', 'pointerup', 'pointercancel', 'blur']) addEventListener(ev, off, true);
}
// minimap: beacons as pulsing diamonds (edge-clamped), the command table as a cyan dot
function mmHook(mm, sc, cw) {
  if (!enabled()) return; const t = performance.now() / 1000, cl = v => Math.max(-cw / 2 + 6, Math.min(cw / 2 - 6, v));
  if (TB) { mm.fillStyle = '#2fe3ff'; mm.beginPath(); mm.arc(cl(TB.x * sc), cl(TB.z * sc), 3, 0, 7); mm.fill(); }
  for (const b of OPS.beacons) { if (b.done) continue; const x = cl(b.x * sc), z = cl(b.z * sc), r = 5 + 2 * Math.sin(t * 5);
    mm.save(); mm.translate(x, z); mm.rotate(Math.PI / 4); mm.fillStyle = LCOL[Math.max(1, b.lv)]; mm.shadowColor = mm.fillStyle; mm.shadowBlur = 8; mm.fillRect(-r / 2, -r / 2, r, r); mm.restore();
    mm.strokeStyle = LCOL[Math.max(1, b.lv)]; mm.globalAlpha = .6; mm.lineWidth = 1; mm.beginPath(); mm.arc(x, z, 6 + (t * 10 % 8), 0, 7); mm.stroke(); mm.globalAlpha = 1; }
}

// ---------------------------------------------------------------- drone swarm with sweeping searchlights (ELEVATED+)
let DR = null;
function droneSet(n) {
  const c = window.__city; if (!c) return; n = Math.max(0, n | 0); OPS.drones = n;
  if (!n) { if (DR) DR.body.visible = DR.cone.visible = DR.spot.visible = false; return; }
  if (!DR || DR.cap < n) {
    if (DR) { c.S.remove(DR.body, DR.cone, DR.spot); DR.body.geometry.dispose(); DR.cone.geometry.dispose(); DR.spot.geometry.dispose(); }
    const S = shaders(), cap = Math.max(n, 9);
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, .35, 1.6), new THREE.MeshBasicMaterial({ color: 0x1a2430 }), cap);
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(6.5, 30, 14, 1, true).translate(0, -15, 0), S.cone, cap);
    const spot = new THREE.InstancedMesh(new THREE.CircleGeometry(5.5, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), cap);
    for (const m of [body, cone, spot]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); c.S.add(m); }
    DR = { body, cone, spot, cap, lamp: new THREE.Color() };
  }
  DR.body.count = DR.cone.count = DR.spot.count = n; DR.body.visible = DR.cone.visible = DR.spot.visible = true;
}
const _m = new THREE.Matrix4(), _o = new THREE.Object3D(), _d = new THREE.Vector3();
function dronesFrame(t) {
  const c = window.__city, lv = enabled() && (A.lastOk || A.pinned) ? A.level : 0, mob = c.MOBILE || c.TIER === 'low';
  const live = OPS.beacons.filter(b => !b.done), per = mob ? 2 : 3;
  const PY = window.__aegisPyr, targets = live.length ? live : (lv >= 1 && PY && PY.ready ? [{ x: PY.x, z: PY.z, i: 0, hub: 1 }] : lv >= 1 && TB ? [{ x: TB.x, z: TB.z, i: 0 }] : []);
  const n = lv >= 1 ? Math.min(lv === 2 ? 9 : 3, targets.length * per) : 0;   // ELEVATED: a pair/trio over the beacon; CRITICAL: a swarm over all three
  if (n !== OPS.drones) droneSet(n); if (!n || !DR) return;
  const day = c.U && c.U.day ? c.U.day.value : 0; shaders().cone.uniforms.a.value = .26 - .12 * Math.min(1, day); DR.spot.material.opacity = .2 - .1 * Math.min(1, day);
  const k = Math.max(1, Math.round(n / targets.length));
  for (let j = 0; j < n; j++) {
    const tg = targets[Math.floor(j / k) % targets.length], q = j % k, a = t * (.35 + .05 * q) + q * Math.PI * 2 / k + tg.i, rad = (tg.hub ? 19 : 13) + 5 * q, h = (tg.hub ? 40 : 30) + 3 * Math.sin(t * .7 + j);
    const x = tg.x + Math.cos(a) * rad, z = tg.z + Math.sin(a) * rad;
    _o.position.set(x, h, z); _o.rotation.set(0, -a, 0); _o.scale.setScalar(1); _o.updateMatrix(); DR.body.setMatrixAt(j, _o.matrix);
    const tx = .38 * Math.sin(t * .9 + j * 1.3), tz = .38 * Math.cos(t * .7 + j * 2.1);   // the searchlight sweeps
    _o.rotation.set(tx, 0, tz); _o.updateMatrix(); DR.cone.setMatrixAt(j, _o.matrix);
    _d.set(0, -1, 0).applyEuler(_o.rotation); const L = h / Math.max(.2, -_d.y);
    _o.position.set(x + _d.x * L, .12, z + _d.z * L); _o.rotation.set(0, 0, 0); _o.updateMatrix(); DR.spot.setMatrixAt(j, _o.matrix);
    DR.body.setColorAt(j, DR.lamp.set(lv === 2 && Math.floor(t * 3 + j) % 2 ? 0xff3030 : 0x2a6aff));
  }
  DR.body.instanceMatrix.needsUpdate = DR.cone.instanceMatrix.needsUpdate = DR.spot.instanceMatrix.needsUpdate = true; if (DR.body.instanceColor) DR.body.instanceColor.needsUpdate = true;
}
function chime() {   // small confirm tone (sound on only)
  try { const a = window.__city && window.__city.audio && window.__city.audio(); if (!a || !a.AC || !a.on || !a.master) return; const AC = a.AC, t0 = AC.currentTime + .02;
    [660, 990, 1320].forEach((f, i) => { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + i * .09); g.gain.linearRampToValueAtTime(.05, t0 + i * .09 + .02); g.gain.exponentialRampToValueAtTime(.0005, t0 + i * .09 + .5); o.connect(g).connect(a.master); o.start(t0 + i * .09); o.stop(t0 + i * .09 + .55); }); } catch { }
}

// ---------------------------------------------------------------- AEGIS Command console (USE at the table, or tap it)
const E = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
let opsBox = null;
function openConsole() {
  const v = A.data, card = shell('AEGIS Command console'); card.classList.add('am-con');
  const head = E('div', 'am-head'), tl = E('div'); tl.append(E('b', null, 'AEGIS COMMAND'), E('small', null, 'Project AEGIS live feed' + (A.lastOk ? ' · updated ' + new Date(A.lastOk).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')));
  const x = E('button', 'am-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.onclick = close; head.append(tl, x);
  const lv = A.level, thr = E('div', 'ac-thr'); thr.style.setProperty('--lc', LCOL[lv]);
  thr.append(E('span', 'ac-pill', LNAME[lv]), E('div', 'ac-ban', (v && v.banner) || (v ? 'All quiet across the network.' : 'Feed offline · city runs as normal')));
  if (v && v.reason) thr.append(E('div', 'ac-dim', v.reason));
  opsBox = E('div', 'ac-sec'); renderOps();
  const camS = E('div', 'ac-sec'); camS.append(E('h4', null, `📡 Live cams (${v ? v.cams.length : 0}) · tap to watch`));
  if (LC.cats.length) { const lb = E('button', 'ac-cam ac-livebtn', '▶ Browse live streams by category (' + LC.cats.reduce((n, c) => n + c.streams.length, 0) + ')'); lb.type = 'button'; lb.onclick = () => openLive(null); camS.append(lb); } const grid = E('div', 'ac-cams');
  for (const cam of (v ? v.cams : [])) { const b = E('button', 'ac-cam'); b.type = 'button'; const im = E('img'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.src = cam.poster; im.onerror = () => im.remove();
    b.append(im, E('b', null, cam.name), E('small', null, cam.region || cam.city)); b.onclick = () => open(cam); grid.append(b); }
  if (!v || !v.cams.length) grid.append(E('div', 'ac-dim', 'No cams on the feed right now.')); camS.append(grid);
  const incS = E('div', 'ac-sec'); incS.append(E('h4', null, '⚠ Incidents'));
  for (const i of (v ? v.incidents : []).slice(0, 4)) { const r = E('div', 'ac-inc'); r.style.setProperty('--lc', LCOL[i.sev]); r.append(E('b', null, i.title), E('small', null, (i.cat ? i.cat.replace(/_/g, ' ') + ' · ' : '') + i.summary)); incS.append(r); }
  if (!v || !v.incidents.length) incS.append(E('div', 'ac-dim', 'None reported.'));
  const tkS = E('div', 'ac-sec'); tkS.append(E('h4', null, '🛰 Ticker')); for (const l of (v ? v.ticker : []).slice(0, 3)) tkS.append(E('div', 'ac-tk', l));
  const foot = E('div', 'am-foot', 'Feed: Project AEGIS (api.xrpl.fun). Threat level drives Response Ops beacons, drones, patrols and alert billboards; never the weather. Responder record is saved on this device only (no coins, no real value).');
  card.append(head, thr, opsBox, camS, incS, tkS, foot); x.focus({ preventScroll: true }); A.consoleOpen = true; A.modalOpen = 'console';
  conTimer = setInterval(renderOps, 1000);
}
function renderOps() {
  if (!opsBox) return; opsBox.replaceChildren(); opsBox.append(E('h4', null, '🎯 Response Ops'));
  const live = OPS.beacons.filter(b => !b.done), me = window.__city && window.__city.P && window.__city.P.pos, now = clock();
  if (live.length) for (const b of live) { const left = Math.max(0, b.exp - now), d = me ? Math.round(Math.hypot(me.x - b.x, me.z - b.z)) : null;
    const r = E('div', 'ac-op'); r.style.setProperty('--lc', LCOL[Math.max(1, b.lv)]); r.append(E('b', null, `${b.tag} · ${b.dname}`), E('small', null, `${d != null ? d + ' m away · ' : ''}${Math.floor(left / 60e3)}:${String(Math.floor(left / 1e3) % 60).padStart(2, '0')} left · ${Math.round(b.prog * 100)}%`)); opsBox.append(r); }
  else { const w = Math.floor(now / WAVE), nx = (w + 1) * WAVE - now;
    opsBox.append(E('div', 'ac-dim', A.level ? `No active anomaly. Next sweep in ${Math.floor(nx / 60e3)}:${String(Math.floor(nx / 1e3) % 60).padStart(2, '0')}.` : 'Standing by. Anomaly beacons appear when the threat level is ELEVATED (1) or CRITICAL (3 + drone swarm).')); }
  opsBox.append(E('div', 'ac-rec', `🎖 AEGIS Responder · ${OPS.rec.n} stabilized · rank: ${rankOf(OPS.rec.n)}`), E('div', 'ac-dim', 'Walk to a beacon (pillar of light, ◆ on the minimap) and hold USE / E for 3 s. Responders nearby make it faster.'));
}

// ---------------------------------------------------------------- settings switch + status line
function status() {
  const el = $('aegisStatus'); if (!el) return;
  if (!enabled()) { el.textContent = 'Off'; return; }
  if (!A.lastOk) { el.textContent = A.state === 'error' ? 'Feed unreachable · city runs as normal' : 'Connecting…'; return; }
  const t = new Date(A.lastOk).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.textContent = `${LNAME[A.level]}${A.raw != null && A.raw !== A.level ? ' (feed says ' + LNAME[A.raw] + ', confirming)' : ''} · updated ${t}${A.state === 'error' ? ' · retrying' : ''}${OPS.beacons.length ? ' · ' + OPS.beacons.filter(b => !b.done).length + ' anomaly beacon(s) active' : ''}`;
}
function settings() {
  const ss = $('secSettings') || $('hudBody'); if (!ss || $('aegisToggle')) return;
  const row = document.createElement('div'); row.className = 'row feat';
  const l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.id = 'aegisToggle'; i.checked = enabled();
  const st = document.createElement('div'); st.id = 'aegisStatus'; st.className = 'dim'; st.style.cssText = 'font-size:11px;margin:2px 0 0 22px';
  l.append(i, ' 🛰 Live AEGIS feed (city watch cams, command table, response ops, ticker)'); row.append(l, st); ss.append(row);
  i.onchange = () => { try { localStorage.setItem('bc_aegis', i.checked ? '1' : '0'); } catch { }
    if (i.checked) { A.sig = null; schedule(100); camT = setTimeout(pollCams, 200); } else { clearTimeout(timer); clearTimeout(camT); clearAll(); A.state = 'off'; } status(); };
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
#aegisModal .am-foot{padding:8px 14px 12px;opacity:.8;font-size:12px}
#aegisModal .am-con{width:min(720px,100%)}
#aegisModal .ac-thr{margin:0 14px 6px;padding:10px 12px;border-radius:10px;border:1px solid var(--lc);background:linear-gradient(90deg,color-mix(in srgb,var(--lc) 18%,transparent),transparent)}
#aegisModal .ac-pill{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--lc);color:#05080c;font-weight:900;letter-spacing:.08em;font-size:12px;margin-right:8px}
#aegisModal .ac-ban{display:inline;font-weight:700}#aegisModal .ac-dim{opacity:.72;font-size:12px;margin-top:4px}
#aegisModal .ac-sec{padding:6px 14px}#aegisModal .ac-sec h4{margin:6px 0;font-size:13px;letter-spacing:.04em;color:#9feaff}
#aegisModal .ac-op,#aegisModal .ac-inc{border-left:3px solid var(--lc);padding:5px 9px;margin:4px 0;background:#0a1a25;border-radius:0 8px 8px 0}
#aegisModal .ac-op b,#aegisModal .ac-inc b{display:block;font-size:13px}#aegisModal .ac-op small,#aegisModal .ac-inc small{opacity:.75}
#aegisModal .ac-rec{margin-top:6px;font-weight:800;color:#ffe08a}
#aegisModal .ac-cams{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#aegisModal .ac-cam{display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:44px;padding:0 0 7px;border-radius:10px;border:1px solid #2fe3ff44;background:#0b2230;color:#e6fbff;text-align:left;cursor:pointer;overflow:hidden;font:inherit}
#aegisModal .ac-cam img{width:100%;aspect-ratio:16/9;object-fit:cover;background:#000;display:block}#aegisModal .ac-cam b{padding:0 8px;font-size:12px}#aegisModal .ac-cam small{padding:0 8px;opacity:.7;font-size:11px}
#aegisModal .ac-tk{font-size:12px;opacity:.85;padding:2px 0;border-bottom:1px dashed #2fe3ff22}
#aegisModal .ac-livebtn{width:100%;padding:10px;margin-bottom:8px;font-weight:800;align-items:center}
#aegisModal .am-live{width:min(1100px,100%)}
#aegisModal .al-tabs{display:flex;gap:6px;overflow-x:auto;padding:0 12px 8px;scrollbar-width:none}
#aegisModal .al-tab{flex:none;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #2fe3ff55;background:#0b2230;color:#dff8ff;font:700 12px system-ui,sans-serif;cursor:pointer}
#aegisModal .al-tab.on{background:#2fe3ff;color:#04121a}
#aegisModal .al-body{display:flex;gap:10px;padding:0 12px}#aegisModal .al-main{flex:1 1 auto;min-width:0}
#aegisModal .al-list{flex:0 0 300px;max-height:min(560px,62vh);overflow:auto;display:flex;flex-direction:column;gap:6px}
#aegisModal .al-item{display:flex;gap:8px;align-items:center;min-height:44px;padding:4px;border-radius:9px;border:1px solid #2fe3ff33;background:#0a1a25;color:#e6fbff;text-align:left;cursor:pointer;font:inherit}
#aegisModal .al-item.on{border-color:#2fe3ff;background:#0f2a3a}#aegisModal .al-item img{width:96px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;flex:none;background:#000}
#aegisModal .al-item b{display:block;font-size:12px;line-height:1.25;max-height:2.5em;overflow:hidden}#aegisModal .al-item small{opacity:.7;font-size:11px}
#aegisModal .al-com h4{margin:8px 0 4px;font-size:13px;color:#9feaff}#aegisModal .al-clist{max-height:180px;overflow:auto}
#aegisModal .al-c{padding:4px 0;border-bottom:1px dashed #2fe3ff22;font-size:12px;overflow-wrap:anywhere}#aegisModal .al-c b{color:#ffe08a;margin-right:6px}#aegisModal .al-c small{opacity:.5;margin-left:6px}
#aegisModal .al-form{display:flex;gap:6px;margin-top:6px}#aegisModal .al-form input{flex:1;min-width:0;min-height:40px;padding:0 10px;border-radius:9px;border:1px solid #2fe3ff55;background:#04101a;color:#fff;font:500 14px system-ui,sans-serif}
#aegisModal .al-form button{min-height:40px;min-width:64px;border-radius:9px;border:0;background:#2fe3ff;color:#04121a;font-weight:800;cursor:pointer}
body.touch #aegisModal .al-tab,body.touch #aegisModal .al-form button,body.touch #aegisModal .al-form input{min-height:44px}
@media (max-width:760px){#aegisModal .al-body{flex-direction:column}#aegisModal .al-list{flex:none;max-height:none}}`;
  document.head.append(st);
}

// ---------------------------------------------------------------- boot (after the city, its life layer and the airport are up)
(function boot() {
  const c = window.__city, CL = window.__cityLife;
  const PY = window.__aegisPyr; if (!window.__ready || !c || !c.S || (CL && !CL.ready) || (PY && !PY.ready && !PY.failed)) return setTimeout(boot, 600);
  C = c; try { css(); settings(); holdInputs(); } catch (e) { console.warn('aegis ui', e); }
  (window.__nearHooks = window.__nearHooks || []).push(nearHook); (window.__mmHooks = window.__mmHooks || []).push(mmHook);
  if (Q.has('aegistest') || Q.get('debug') === '1') A.force = name => {   // test hook: pin a level (null = back to the feed); never touches weather
    if (name == null) { A.pinned = false; if (A.raw != null) setLevel(A.raw); applyLevel(A.data); syncTable(A.data); opsSpawn(); status(); return null; }
    const lv = Math.max(0, Math.min(2, LEVELS[name] ?? (+name | 0))); A.pinned = true; A.everOk = true; setLevel(lv); applyLevel(A.data); syncTable(A.data || { cams: [], incidents: [], ticker: [] }); opsSpawn(); status(); return lv; };
  loop(); setInterval(() => { try { tickerTick(); } catch { } }, 2e3); setInterval(() => { try { if (!document.hidden) opsSpawn(); } catch (e) { A.opsErr = String(e && e.message || e); } }, 1000); setInterval(status, 30e3);
  if (enabled()) { schedule(FAST ? 300 : 4000); camT = setTimeout(pollCams, FAST ? 200 : 1500); } else A.state = 'off';
})();
