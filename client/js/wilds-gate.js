// BURN City: The Wilds — always-loaded trailhead stub (small). Loaded by app.js; everything else is lazy.
// At startup this draws ONLY the trailhead gate, its signs and the city-side signpost at the north edge of town.
// No forest geometry, creature data, JSON or music is fetched until you walk up to the gate:
//   - within PREFETCH_M of the gate in Explore: quietly import('./wilds.js') + its data JSON (no music)
//   - crossing into the forest: "WARNING PVP AND PVE AREA AHEAD. PROCEED?" -> PROCEED shows a forest loading veil,
//     builds the forest (trees, creatures, colliders...), fades in; forest music starts streaming only now
//   - leave by the return path and stay > UNLOAD_M from the gate for UNLOAD_S seconds: the forest is unloaded
//     (meshes removed, GPU resources disposed, its colliders removed, audio stopped + released). The save (localStorage) stays.
// This file owns every hook into the city (window.__preRender / __interactors / __exploreLock / keydown) and forwards
// them to the forest module while it is loaded, so the city behaves the same whether or not the forest ever loaded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
export const TEST = Q.has('wildstest') || Q.get('debug') === '1';   // test hooks only with ?wildstest or ?debug=1
// ---------------------------------------------------------------- shared layout (world metres; the city is south, -z)
export const FC = { x: 0, z: 625 }, RX = 255, RZ = 228;            // forest ellipse: z 397..853
export const ell = (x, z) => Math.hypot((x - FC.x) / RX, (z - FC.z) / RZ);
export const GATE = { x: 0, z: 394 };
const PREFETCH_M = 60, UNLOAD_M = 150, UNLOAD_S = TEST && Q.has('wildsunload') ? +Q.get('wildsunload') : 30;
// ---------------------------------------------------------------- shared geometry helpers (also used by wilds.js)
export function colorize(g, fn) { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), c = new THREE.Color(); g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), nr.getY(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
export const solid = (g, hex) => colorize(g, c => c.set(hex));
export const jitter = (g, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const h = Math.sin(x * 41.3 + y * 17.1 + z * 29.7) * 43758.5; const f = 1 + (h - Math.floor(h) - .5) * k; p.setXYZ(i, x * f, y * (1 + (f - 1) * .5), z * f); } return g; };
export const M = a => mergeGeometries(a.map(g => g.index ? g.toNonIndexed() : g), false);
export function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
export function signTex(lines, w = 512, h = 256, bg = '#2a1e14', fg = '#ffd9a0', border = '#ff7a1a') {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1 + Math.random() * 6); }
    g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length; lines.forEach((ln, i) => { const [txt, size, col] = Array.isArray(ln) ? ln : [ln, 48, fg]; g.font = `800 ${size}px system-ui,sans-serif`; g.fillStyle = col || fg; g.fillText(txt, w / 2, h * (i + 1) / (n + 1)); }); });
}
const C = () => window.__city;
// ---------------------------------------------------------------- the gate (the only thing drawn at startup)
const flames = [];
function flame(scale = 1) {   // layered additive cones: white-yellow core, orange body, red tips
  const g = new THREE.Group();
  const mk = (r, h, col, o) => g.add(new THREE.Mesh(solid(new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, h / 2, 0), col), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
  mk(.32 * scale, .9 * scale, 0xff3a08, .55); mk(.22 * scale, .7 * scale, 0xff8a1a, .75); mk(.11 * scale, .42 * scale, 0xfff0b0, .95);
  g.userData.ph = Math.random() * 10; flames.push(g); return g;
}
function buildGate() {
  const c = C(), MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 });
  const root = new THREE.Group(); root.name = 'wilds-gate'; c.S.add(root);
  const g = new THREE.Group(); g.position.set(GATE.x, 0, GATE.z); root.add(g);
  const stone = (w, h, d, x, y, z) => colorize(jitter(new THREE.BoxGeometry(w, h, d, 2, 3, 2), .05).translate(x, y, z), (cc, X, Y, Z, ny) => cc.setRGB(.36 + ny * .04, .33 + ny * .03, .3));
  const parts = []; for (const s of [-1, 1]) parts.push(stone(1.5, 5.6, 1.5, s * 4.6, 2.8, 0), stone(1.9, .5, 1.9, s * 4.6, 5.8, 0), stone(1.2, .5, 1.2, s * 4.6, 6.3, 0), solid(new THREE.CylinderGeometry(.55, .35, .45, 10).translate(s * 4.6, 6.75, 0), 0x2a2420));
  parts.push(solid(new THREE.BoxGeometry(10.8, .5, .6).translate(0, 5.3, 0), 0x3a2a1c), solid(new THREE.BoxGeometry(10.8, .18, .66).translate(0, 5.05, 0), 0xff6a1a));
  // warning board beside the path (city side) + the city-side signpost at the edge of town, merged into the same mesh
  const wbT = new THREE.Matrix4().makeRotationY(Math.PI + .35).setPosition(-6.5, 0, -8);
  parts.push(...[-1.1, 1.1].map(x => solid(new THREE.BoxGeometry(.18, 2.4, .18).translate(x, 1.2, 0), 0x3a2a1c).applyMatrix4(wbT)));
  parts.push(solid(new THREE.CylinderGeometry(.09, .11, 3.2, 8).translate(3.5, 1.6, 318 - GATE.z), 0x3a2a1c));
  g.add(new THREE.Mesh(M(parts), MAT));
  for (const s of [-1, 1]) { const f = flame(1); f.position.set(s * 4.6, 6.95, 0); g.add(f); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.6), new THREE.MeshBasicMaterial({ map: signTex([['THE CINDERWILDS', 64], ['TRAILHEAD · PVP / PVE ZONE', 34, '#ff9a4a']], 1024, 256), toneMapped: false }));
  sign.position.set(0, 4.2, -.32); sign.rotation.y = Math.PI; g.add(sign); const sign2 = sign.clone(); sign2.position.z = .32; sign2.rotation.y = 0; g.add(sign2);   // readable from both sides
  const wbs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: signTex([['⚠ WARNING', 60, '#ffd23a'], ['PVP AND PVE AREA AHEAD', 38, '#ffffff'], ['Wild creatures roam freely', 28, '#ffc8a0']], 512, 256, '#3a0c08', '#fff', '#ffd23a'), toneMapped: false, side: THREE.DoubleSide }));
  wbs.position.set(0, 1.9, .1).applyMatrix4(wbT); wbs.rotation.y = Math.PI + .35; g.add(wbs);
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .7), new THREE.MeshBasicMaterial({ map: signTex([['THE WILDS  ↑', 70]], 512, 150, '#24361c', '#e8ffd0', '#8ad05a'), toneMapped: false, side: THREE.DoubleSide }));
  arrow.position.set(3.5, 2.7, 318 - GATE.z); arrow.rotation.y = Math.PI; g.add(arrow);
  // permanent colliders (gate pillars, warning board, signpost): tagged wildsGate so the forest's unload never touches them
  for (const [x, z, r, h, nc] of [[GATE.x - 4.6, GATE.z, 1.05, 6, false], [GATE.x + 4.6, GATE.z, 1.05, 6, false], [GATE.x - 6.5, GATE.z - 8, .9, 2.6, true], [3.5, 318, .2, 3.2, true]]) c.colliders.push({ x, z, r, h, nc, wildsGate: 1 });
  return root;
}
// ---------------------------------------------------------------- lazy forest module
const G = { state: 'idle', prefetched: false, loads: 0, unloads: 0, modal: null, farSince: 0, err: null, log: [] };
let mod = null, modP = null;
const note = s => { G.log.push(Math.round(performance.now()) + ' ' + s); if (G.log.length > 40) G.log.shift(); };
function prefetch() {   // module code + data JSON only (no music); safe to call any number of times
  if (!modP) { note('prefetch'); G.prefetched = true; modP = import('./wilds.js').then(m => { mod = m; m.prefetch(); return m; }).catch(e => { modP = null; G.prefetched = false; G.err = String(e); console.warn('wilds prefetch', e); throw e; }); }
  return modP;
}
const loaded = () => !!(mod && mod.isLoaded());
let veil = null;
function showVeil() {
  veil = document.createElement('div'); veil.id = 'wlVeil'; veil.setAttribute('role', 'progressbar'); veil.setAttribute('aria-label', 'Loading The Cinderwilds');
  veil.innerHTML = '<div class="wv-trees"></div><div class="wv-c"><div class="wv-t">THE CINDERWILDS</div><div class="wv-s">Fernway Verge · Lv 1–5</div><div class="wv-bar"><b></b></div><div class="wv-l">Following the trail…</div></div>';
  document.body.append(veil); veil.addEventListener('pointerdown', e => e.stopPropagation());
}
function veilProgress(p, label) { if (!veil) return; veil.querySelector('.wv-bar>b').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; if (label) veil.querySelector('.wv-l').textContent = label; G.veilP = p; }
function hideVeil() { const v = veil; veil = null; if (!v) return; v.classList.add('out'); setTimeout(() => v.remove(), 700); }
async function proceed() {
  // inside the PROCEED tap: unlock Web Audio now (iOS), even if the module is still downloading
  if (mod) mod.unlockAudio(); else { try { const AC = window.__wildsAC = window.__wildsAC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume().catch(() => { }); } catch (e) { } }
  { const c = C(), P = c.P; c.input.yp.yaw = Math.atan2(-(FC.x - P.pos.x), -(FC.z - P.pos.z)); }   // face into the forest
  if (loaded()) { mod.enter(); return; }
  G.modal = 'loading'; G.state = 'loading'; showVeil(); veilProgress(.04, 'Following the trail…'); const t0 = performance.now(); note('load start');
  try {
    let fake = .04; const tick = setInterval(() => { fake = Math.min(.3, fake + .02); if (G.veilP < fake) veilProgress(fake); }, 120);
    const m = await prefetch(); clearInterval(tick); veilProgress(.32, 'Reading the trail map…');
    await m.load((p, label) => veilProgress(.32 + p * .66, label));
    veilProgress(1, 'Entering the forest'); G.loads++; G.state = 'loaded'; G.loadMs = Math.round(performance.now() - t0); note('loaded ' + G.loadMs + 'ms');
    await new Promise(r => setTimeout(r, 250));
    G.modal = null; m.enter(); hideVeil();
  } catch (e) { G.err = String(e && e.stack || e).slice(0, 400); console.warn('wilds load', e); G.state = 'idle'; G.modal = null; hideVeil(); turnBack(); try { mod && mod.unload(); } catch (e2) { } }
}
function unload() { if (!loaded()) return; note('unload'); mod.unload(); G.unloads++; G.state = 'idle'; G.farSince = 0; }
// ---------------------------------------------------------------- the PvP/PvE warning
const css = `
#wlWarn{position:fixed;inset:0;z-index:47;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;background:radial-gradient(ellipse at center,rgba(60,4,2,.72),rgba(0,0,0,.92));color:#fff;font-family:system-ui,sans-serif;animation:wlIn .35s ease-out}
#wlWarn h1{font:900 clamp(22px,5.4vw,46px)/1.15 system-ui,sans-serif;letter-spacing:.04em;color:#ff3a1a;text-shadow:0 0 18px #ff2a00,0 0 2px #fff;margin:0 0 14px;max-width:900px}
#wlWarn p{color:#ffd0b8;max-width:520px;font-size:14px;margin:0 0 20px}#wlWarn .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
#wlWarn button{min-width:150px;min-height:52px;border-radius:12px;font:800 17px system-ui,sans-serif;cursor:pointer;border:1px solid #ff8a3a;background:#2a0c06;color:#fff}#wlWarn button.go{background:#c2300c;border-color:#ffb06a;box-shadow:0 0 20px #ff3a0a88}
@keyframes wlIn{from{opacity:0}to{opacity:1}}
body.wl-lock #touch,body.wl-lock #prompt{display:none!important}
#wlVeil{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 35%,#1f3a22 0%,#0c1a10 55%,#050a06 100%);color:#e8ffd8;font-family:system-ui,sans-serif;animation:wlIn .3s ease-out;transition:opacity .6s}
#wlVeil.out{opacity:0;pointer-events:none}
#wlVeil .wv-trees{position:absolute;left:0;right:0;bottom:0;height:46%;opacity:.85;background:
 linear-gradient(transparent 0 0),
 conic-gradient(from 160deg at 8% 0%,transparent 0 40deg,#081209 40deg 80deg,transparent 80deg) 0 100%/18% 100% repeat-x,
 conic-gradient(from 155deg at 50% 0%,transparent 0 50deg,#0b170d 50deg 100deg,transparent 100deg) 4% 100%/13% 80% repeat-x;pointer-events:none}
#wlVeil .wv-c{position:relative;text-align:center;width:min(560px,88vw)}
#wlVeil .wv-t{white-space:nowrap;font:900 clamp(24px,7.4vw,46px)/1.1 system-ui,sans-serif;letter-spacing:.06em;color:#d8ffb0;text-shadow:0 0 22px #5fe08a,0 2px 8px #000}
#wlVeil .wv-s{font-size:14px;color:#b8e0a8;margin:6px 0 22px}
#wlVeil .wv-bar{height:8px;border-radius:5px;background:#ffffff18;overflow:hidden;box-shadow:inset 0 0 0 1px #7ad07a44}#wlVeil .wv-bar>b{display:block;height:100%;width:0;background:linear-gradient(90deg,#3fae5a,#9be37a,#ffd27a);transition:width .25s;box-shadow:0 0 12px #9be37a}
#wlVeil .wv-l{font-size:13px;color:#cfe8c4;margin-top:12px;min-height:18px}
`;
function clearKeys() { const i = C() && C().input; if (!i) return; for (const k in i.keys) i.keys[k] = 0; if (i.tb) for (const k in i.tb) i.tb[k] = 0; if (i.joy) { i.joy.x = 0; i.joy.y = 0; } }
function warnTone() { try { const a = C().audio && C().audio(); if (!a || !a.on || !a.AC || !a.master) return; const AC = a.AC, t0 = AC.currentTime; for (const [f, f2, v] of [[220, 180, .1], [330, 260, .06]]) { const o = AC.createOscillator(), g = AC.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + .5); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .5); o.connect(g).connect(a.master); o.start(t0); o.stop(t0 + .55); } } catch (e) { } }
function showWarning() {
  if (G.modal) return; G.modal = 'warn'; document.body.classList.add('wl-lock'); clearKeys(); prefetch().catch(() => { });
  for (const id of ['info', 'recap']) { const e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') { if (id === 'info') e.style.display = 'none'; else e.remove(); } }
  const w = document.createElement('div'); w.id = 'wlWarn'; w.setAttribute('role', 'alertdialog'); w.setAttribute('aria-label', 'Warning');
  w.innerHTML = `<h1>WARNING PVP AND PVE AREA AHEAD. PROCEED?</h1><p>The Cinderwilds: wild creatures roam and may fight back. Other players will be able to challenge you here (PvP switches on in a later update). Your Wilds progress is saved on this device only.</p><div class="row"><button class="back">Turn back</button><button class="go">PROCEED</button></div>`;
  document.body.append(w); w.addEventListener('pointerdown', e => e.stopPropagation());
  const done = go => { w.remove(); removeEventListener('keydown', key, true); G.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); go ? proceed() : turnBack(); };
  w.querySelector('.go').onclick = () => done(true); w.querySelector('.back').onclick = () => done(false);
  const key = e => { if (e.code === 'Enter' || e.code === 'KeyE') { e.stopPropagation(); done(true); } else if (e.code === 'Escape' || e.code === 'Backspace') { e.stopPropagation(); done(false); } };
  addEventListener('keydown', key, true); G.warnShown = (G.warnShown || 0) + 1; warnTone();
}
function turnBack() { const c = C(), P = c.P; const dx = P.pos.x - FC.x, dz = P.pos.z - FC.z, e = ell(P.pos.x, P.pos.z) || 1; P.pos.x = FC.x + dx / e * 1.035; P.pos.z = FC.z + dz / e * 1.035; c.input.yp.yaw = Math.atan2(-dx, -dz); }
// ---------------------------------------------------------------- per frame (cheap: a few distance checks)
function frame(dt, t) {
  const c = C(), P = c.P, explore = c.getMode() === 'explore' && !window.__burnTowerOpen;
  for (const f of flames) { const k = t * 9 + f.userData.ph; const s = 1 + Math.sin(k) * .08 + Math.sin(k * 2.3) * .05; f.scale.set(s, 1 + Math.sin(k * 1.7) * .14 + Math.sin(k * 3.1) * .06, s); }
  const dGate = Math.hypot(P.pos.x - GATE.x, P.pos.z - GATE.z), e = ell(P.pos.x, P.pos.z);
  if (explore && !modP && (dGate < PREFETCH_M || e < 1.05)) prefetch().catch(() => { });
  const inF = loaded() && mod.inForest();
  if (explore && !inF && e < .99 && !G.modal && !(mod && mod.locked()) && !(window.__boat && window.__boat.active)) showWarning();
  if (loaded()) {
    mod.frame(dt, t);
    const cam = c.C.position, far = !mod.inForest() && !mod.locked() && dGate > UNLOAD_M && e > 1.1 && ell(cam.x, cam.z) > 1.3;
    const now = performance.now(); if (!far) G.farSince = 0; else if (!G.farSince) G.farSince = now; else if (now - G.farSince > UNLOAD_S * 1000) unload();   // wall-clock (the city clamps dt on slow frames)
  }
}
// ---------------------------------------------------------------- boot: draw the gate + register the hooks once
(function wait() {
  if (Q.has('nowilds')) return;
  const c = window.__city;
  if (!(window.__ready && c && c.colliders && c.S)) return setTimeout(wait, 400);
  try {
    const st = document.createElement('style'); st.id = 'wlGateCss'; st.textContent = css; document.head.append(st);
    G.gate = buildGate();
    (window.__preRender = window.__preRender || []).push((dt, t) => { try { frame(dt, t); } catch (e) { if (!G.ferr) { G.ferr = String(e && e.stack || e).slice(0, 400); console.warn('wilds frame', e); } } });   // never let the forest break the city's render loop
    (window.__interactors = window.__interactors || []).push(p => loaded() ? mod.interactor(p) : null);
    const prevLock = window.__exploreLock; window.__exploreLock = () => !!G.modal || (loaded() && mod.locked()) || (prevLock ? prevLock() : false);
    addEventListener('keydown', e => { if (loaded()) mod.onKey(e); }, true);
    G.state = 'idle'; G.readyAt = performance.now();
  } catch (e) { G.err = String(e && e.stack || e).slice(0, 400); console.warn('wilds gate', e); }
  if (TEST) window.__wildsGate = Object.assign(G, { prefetch, proceed, unload, showWarning, loaded, mod: () => mod, cfg: { PREFETCH_M, UNLOAD_M, UNLOAD_S } });
})();
