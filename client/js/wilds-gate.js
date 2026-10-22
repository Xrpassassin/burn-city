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
// ---------------------------------------------------------------- KILL SWITCH / config (one place). Flip WILDS_DEEP_ENABLED to false to turn off
// the deep area (threshold arch, city unload, Glassroot Grove) everywhere; ?nodeep=1 turns it off for one visit.
// ?nowildslock turns off the on-foot travel lock + the Return-to-city barrier for one visit (the forest then behaves like M1).
export const WILDS_DEEP_ENABLED = true;
export const CFG = { deep: WILDS_DEEP_ENABLED && !Q.has('nodeep'), travelLock: !Q.has('nowildslock'), exitGate: !Q.has('nowildslock') };
// ---------------------------------------------------------------- shared layout (world metres; the city is south, -z)
export const FC = { x: 0, z: 625 }, RX = 255, RZ = 228;            // forest ellipse: z 397..853
export const ell = (x, z) => Math.hypot((x - FC.x) / RX, (z - FC.z) / RZ);
export const GATE = { x: 0, z: 394 };
export const THRESH = { x: 30, z: 812 };   // the threshold arch at the far (north) end of Fernway Verge -> the deep area
// The deep area (Glassroot Grove) is its own realm: off the city map (the city clamps walkers to ±900, the server keeps ±2000),
// ~3.4x the area of Fernway Verge, so "it's bigger on the inside". Players there send these real coordinates, so they see each other
// exactly; city players never draw them (window.__peerRealm) and they never draw city players.
export const DEEP = { x: 1400, z: 1370, rx: 420, rz: 420 };
export const inDeepRealm = (x, z) => x > 940 && z > 900;
export const dEll = (x, z) => Math.hypot((x - DEEP.x) / DEEP.rx, (z - DEEP.z) / DEEP.rz);
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
function showVeil(title = 'THE CINDERWILDS', sub = 'Fernway Verge · Lv 1–5', cls = '') {
  if (veil) veil.remove(); veil = document.createElement('div'); veil.id = 'wlVeil'; if (cls) veil.className = cls; veil.setAttribute('role', 'progressbar'); veil.setAttribute('aria-label', 'Loading ' + title);
  veil.innerHTML = '<div class="wv-trees"></div><div class="wv-c"><div class="wv-t">' + title + '</div><div class="wv-s">' + sub + '</div><div class="wv-bar"><b></b></div><div class="wv-l">Following the trail…</div></div>';
  document.body.append(veil); veil.addEventListener('pointerdown', e => e.stopPropagation());
}
function veilProgress(p, label) { if (!veil) return; veil.querySelector('.wv-bar>b').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; if (label) veil.querySelector('.wv-l').textContent = label; G.veilP = p; }
function hideVeil() { const v = veil; veil = null; if (!v) return; v.classList.add('out'); setTimeout(() => v.remove(), 700); }
async function proceed() {
  // inside the PROCEED tap: unlock Web Audio now (iOS), even if the module is still downloading
  if (mod) mod.unlockAudio(); else { try { const AC = window.__wildsAC = window.__wildsAC || new (window.AudioContext || window.webkitAudioContext)(); AC.resume().catch(() => { }); } catch (e) { } }
  { const c = C(), P = c.P; c.input.yp.yaw = Math.atan2(-(FC.x - P.pos.x), -(FC.z - P.pos.z)); }   // face into the forest
  if (loaded()) { mod.enter(); shrink('in'); return; }
  G.modal = 'loading'; G.state = 'loading'; showVeil(); veilProgress(.04, 'Following the trail…'); const t0 = performance.now(); note('load start');
  try {
    let fake = .04; const tick = setInterval(() => { fake = Math.min(.3, fake + .02); if (G.veilP < fake) veilProgress(fake); }, 120);
    const m = await prefetch(); clearInterval(tick); veilProgress(.32, 'Reading the trail map…');
    await m.load((p, label) => veilProgress(.32 + p * .66, label));
    veilProgress(1, 'Entering the forest'); G.loads++; G.state = 'loaded'; G.loadMs = Math.round(performance.now() - t0); note('loaded ' + G.loadMs + 'ms');
    await new Promise(r => setTimeout(r, 250));
    G.modal = null; m.enter(); hideVeil(); shrink('in');
  } catch (e) { G.err = String(e && e.stack || e).slice(0, 400); console.warn('wilds load', e); G.state = 'idle'; G.modal = null; hideVeil(); turnBack(); try { mod && mod.unload(); } catch (e2) { } }
}
function unload() { if (!loaded()) return; if (D.active) abortDeep('unload'); unloadDeep(); note('unload'); mod.unload(); G.unloads++; G.state = 'idle'; G.farSince = 0; }
// ---------------------------------------------------------------- the PvP/PvE warning
const css = `
#wlWarn{position:fixed;inset:0;z-index:calc(var(--z-top,130) + 1);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;background:radial-gradient(ellipse at center,rgba(60,4,2,.72),rgba(0,0,0,.92));color:#fff;font-family:system-ui,sans-serif;animation:wlIn .35s ease-out}
#wlWarn h1{font:900 clamp(22px,5.4vw,46px)/1.15 system-ui,sans-serif;letter-spacing:.04em;color:#ff3a1a;text-shadow:0 0 18px #ff2a00,0 0 2px #fff;margin:0 0 14px;max-width:900px}
#wlWarn p{color:#ffd0b8;max-width:520px;font-size:14px;margin:0 0 20px}#wlWarn .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
#wlWarn button{min-width:150px;min-height:52px;border-radius:12px;font:800 17px system-ui,sans-serif;cursor:pointer;border:1px solid #ff8a3a;background:#2a0c06;color:#fff}#wlWarn button.go{background:#c2300c;border-color:#ffb06a;box-shadow:0 0 20px #ff3a0a88}
@keyframes wlIn{from{opacity:0}to{opacity:1}}
body.wl-lock #touch,body.wl-lock #prompt{display:none!important}
body.wl-travel #btns [data-m=orbit],body.wl-travel #btns [data-m=fly],body.wl-travel #tour,body.wl-travel #webBtn,body.wl-travel #jetBtn,body.wl-travel #gbSkate,body.wl-travel #tSkate,body.wl-travel #tUp,body.wl-travel #tDown,body.wl-travel #vMenu button[data-v=orbit],body.wl-travel #vMenu button[data-v=fly],body.wl-travel #vMenu button[data-v=tour],body.wl-travel #tlOpen{display:none!important}
body.wl-cityoff #labels,body.wl-cityoff #minimap,body.wl-cityoff .npcTag,body.wl-cityoff .npcBub,body.wl-cityoff #rChip,body.wl-cityoff .pbub,body.wl-cityoff #hud,body.wl-cityoff #status,body.wl-cityoff #wchip,body.wl-cityoff #live,body.wl-cityoff #evbanner,body.wl-cityoff #tourCap,body.wl-cityoff #info,body.wl-cityoff #tip{display:none!important}
body.wl-forest #labels,body.wl-forest #minimap,body.wl-forest .npcTag,body.wl-forest .npcBub,body.wl-forest #rChip,body.wl-forest .pbub,body.wl-forest #hud,body.wl-forest #status,body.wl-forest #wchip,body.wl-forest #live,body.wl-forest #evbanner,body.wl-forest #tourCap,body.wl-forest #info,body.wl-forest #tip{display:none!important}
body.wl-forest #toasts,body.wl-forest #cityToast,body.wl-forest #whaleToast,body.wl-forest .alertPill,body.wl-forest .toast{display:none!important}
#wlShrink{position:fixed;inset:0;z-index:calc(var(--z-top,130) + 3);pointer-events:none;background:radial-gradient(circle at 50% 55%,transparent 0 18%,rgba(20,60,40,.55) 46%,rgba(2,8,5,.96) 78%);opacity:0;transition:opacity .28s ease-out}
#wlShrink.on{opacity:1}
#wlWarn.ret h1{color:#9bffb0;text-shadow:0 0 18px #2aff6a,0 0 2px #fff}#wlWarn.ret{background:radial-gradient(ellipse at center,rgba(6,40,18,.72),rgba(0,0,0,.92))}#wlWarn.ret p{color:#d0f0d8}#wlWarn.ret button.go{background:#1c7a3a;border-color:#9be37a;box-shadow:0 0 20px #2aff6a66}#wlWarn.ret button{border-color:#7ad07a}
#wlVeil.deep{background:radial-gradient(ellipse at 50% 35%,#0f2a26 0%,#061612 55%,#020806 100%)}#wlVeil.deep .wv-t{white-space:normal;font-size:clamp(22px,5.8vw,40px);color:#a8fff0;text-shadow:0 0 22px #3fe0c0,0 2px 8px #000}#wlVeil.deep .wv-bar>b{background:linear-gradient(90deg,#1a8a7a,#5ff0d0,#c8fff0)}
#wlVeil{position:fixed;inset:0;z-index:calc(var(--z-top,130) + 2);display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 35%,#1f3a22 0%,#0c1a10 55%,#050a06 100%);color:#e8ffd8;font-family:system-ui,sans-serif;animation:wlIn .3s ease-out;transition:opacity .6s}
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
// ---------------------------------------------------------------- "TARDIS" shrink transition: vignette veil + FOV pulse (both ways, every gate)
const SH = { t0: 0, base: 0, dur: 900, k: 0 };
function shrink(dir) {
  try { const c = C(); if (!SH.t0) SH.base = c.C.fov; SH.t0 = performance.now(); SH.k = dir === 'out' ? -.28 : .42; G.shrinks = (G.shrinks || 0) + 1;
    let v = document.getElementById('wlShrink'); if (!v) { v = document.createElement('div'); v.id = 'wlShrink'; document.body.append(v); } v.classList.add('on'); setTimeout(() => v.classList.remove('on'), 420); } catch (e) { }
}
function shrinkFrame() { if (!SH.t0) return; const c = C(), u = (performance.now() - SH.t0) / SH.dur; if (u >= 1) { c.C.fov = SH.base; SH.t0 = 0; } else c.C.fov = SH.base * (1 + SH.k * Math.sin(Math.PI * u) * (1 - u * .3)); c.C.updateProjectionMatrix(); }
// ---------------------------------------------------------------- generic two-button prompt in the entry warning's style (Return to BURN City?)
function prompt2(h1, p, goTxt, backTxt, cls, onGo, onBack) {
  if (G.modal) return false; G.modal = 'prompt'; document.body.classList.add('wl-lock'); clearKeys(); hideCity();
  const w = document.createElement('div'); w.id = 'wlWarn'; if (cls) w.className = cls; w.setAttribute('role', 'alertdialog'); w.setAttribute('aria-label', h1);
  w.innerHTML = `<h1>${h1}</h1><p>${p}</p><div class="row"><button class="back">${backTxt}</button><button class="go">${goTxt}</button></div>`;
  document.body.append(w); w.addEventListener('pointerdown', e => e.stopPropagation());
  const done = go => { G.closePrompt = null; w.remove(); removeEventListener('keydown', key, true); G.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); try { go ? onGo() : onBack(); } catch (e) { G.err = String(e).slice(0, 300); } };
  w.querySelector('.go').onclick = () => done(true); w.querySelector('.back').onclick = () => done(false);
  const key = e => { if (e.code === 'Enter' || e.code === 'KeyE') { e.stopPropagation(); done(true); } else if (e.code === 'Escape' || e.code === 'Backspace') { e.stopPropagation(); done(false); } };
  addEventListener('keydown', key, true); G.closePrompt = () => { G.closePrompt = null; w.remove(); removeEventListener('keydown', key, true); G.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); }; return true;
}
function hideCity() { for (const id of ['info', 'recap']) { const e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') { if (id === 'info') e.style.display = 'none'; else e.remove(); } } }
// ---- the city-side barrier: walking out of Fernway Verge stops at the edge and asks; teleports / respawns are never blocked
const EX = { ok: false, cool: 0, prev: null };
function exitPrompt() {
  G.exitAsked = (G.exitAsked || 0) + 1;
  prompt2('RETURN TO BURN CITY?', 'You are leaving the Cinderwilds. Your Wilds progress is saved on this device. Your companion waits for you at the trailhead.', 'PROCEED', 'Stay', 'ret',
    () => { const c = C(), P = c.P; EX.ok = true; G.exits = (G.exits || 0) + 1; const near = Math.hypot(P.pos.x - GATE.x, P.pos.z - GATE.z) < 30;
      if (near) P.pos.set(GATE.x, 0, GATE.z - 8); else { const dx = P.pos.x - FC.x, dz = P.pos.z - FC.z, e = ell(P.pos.x, P.pos.z) || 1; P.pos.x = FC.x + dx / e * 1.07; P.pos.z = FC.z + dz / e * 1.07; }
      P.vel.set(0, 0, 0); c.input.yp.yaw = near ? 0 : Math.atan2(-(P.pos.x - FC.x), -(P.pos.z - FC.z)) + Math.PI; shrink('out'); },
    () => { const P = C().P, dx = P.pos.x - FC.x, dz = P.pos.z - FC.z, e = ell(P.pos.x, P.pos.z) || 1; P.pos.x = FC.x + dx / e * .955; P.pos.z = FC.z + dz / e * .955; P.vel.set(0, 0, 0); EX.cool = performance.now() + 1500; G.stays = (G.stays || 0) + 1; });
}
function barrier(P, explore) {   // runs before the forest's own frame, so "e > 1.03 -> leave" never fires while the barrier holds
  const prev = EX.prev; EX.prev = { x: P.pos.x, z: P.pos.z };
  if (!CFG.exitGate || EX.ok || !explore || !loaded() || !mod.inForest() || deepActive()) return;
  const e = ell(P.pos.x, P.pos.z); if (e <= .985) return;
  if (prev && Math.hypot(P.pos.x - prev.x, P.pos.z - prev.z) > 8) return;   // a teleport / respawn / fast travel: let it through
  const dx = P.pos.x - FC.x, dz = P.pos.z - FC.z; P.pos.x = FC.x + dx / e * .98; P.pos.z = FC.z + dz / e * .98; P.vel.x = 0; P.vel.z = 0; EX.prev = { x: P.pos.x, z: P.pos.z }; G.blocked = (G.blocked || 0) + 1;
  if (!G.modal && !(mod && mod.locked()) && performance.now() > EX.cool) exitPrompt();
}
// ---------------------------------------------------------------- travel lock: on foot only in the Wilds (app.js owns the toggles: window.__wildsTravelLock)
function travelLock(on) { on = !!on && CFG.travelLock; if (G.tl === on) return; try { if (window.__wildsTravelLock) window.__wildsTravelLock(on); G.tl = on; G.tlFlips = (G.tlFlips || 0) + 1; } catch (e) { G.err = 'travelLock ' + e; } }
// ---------------------------------------------------------------- city off / on (deep area only). Never destroys anything: hide + pause + stash, restored exactly.
const CO = { off: false, hid: [], stash: [], bg: null, far: 0, fogD: 0, offAt: 0 };
const keepObj = o => o.isLight || o.isCamera || o === C().avatar || (o.userData && (o.userData.wildsKeep || o.userData.peer || o.userData.wildsDeep));
function hideNew() { for (const o of C().S.children) if (o.visible && !keepObj(o)) { o.visible = false; CO.hid.push(o); } }
function cityOff() {
  if (CO.off) return; const c = C(); CO.off = true; CO.offAt = performance.now(); CO.hid = []; hideNew();
  const keep = [], stash = []; for (const o of c.colliders) (o.wildsDeep ? keep : stash).push(o); c.colliders.length = 0; c.colliders.push(...keep); CO.stash = stash;   // groundAt / webs walk every collider: keep only the deep area's
  CO.bg = c.S.background; CO.far = c.C.far; window.__cityPaused = true; window.__exploreLim = 1990; document.body.classList.add('wl-cityoff'); G.cityOffs = (G.cityOffs || 0) + 1;
}
function cityOn() {
  if (!CO.off) return; const c = C(); CO.off = false;
  for (const o of CO.hid) o.visible = true; CO.hid = [];
  c.colliders.push(...CO.stash); CO.stash = [];
  c.S.background = CO.bg; if (CO.far) { c.C.far = CO.far; c.C.updateProjectionMatrix(); }
  window.__cityPaused = false; delete window.__exploreLim; document.body.classList.remove('wl-cityoff'); G.cityOns = (G.cityOns || 0) + 1;
}
// ---------------------------------------------------------------- the deep area (wilds-deep.js, lazy)
const D = { mod: null, p: null, active: false, busy: false, leftAt: 0, errs: 0, loads: 0, unloads: 0, trips: 0 };
const deepActive = () => D.active;
function deepPrefetch() {
  if (!CFG.deep) return Promise.reject(new Error('deep off'));
  if (!D.p) { note('deep prefetch'); D.p = import('./wilds-deep.js').then(m => { D.mod = m; return m; }).catch(e => { D.p = null; G.deepErr = String(e).slice(0, 300); throw e; }); }
  return D.p;
}
async function enterDeep() {
  if (D.busy || D.active || !CFG.deep || !loaded()) return; D.busy = true; G.modal = 'deep'; document.body.classList.add('wl-lock'); clearKeys();
  showVeil('DEEPER INTO THE CINDERWILDS', 'Glassroot Grove · Lv 5–12', 'deep'); veilProgress(.05, 'Following the roots…'); const t0 = performance.now(); shrink('in');
  try {
    const m = await deepPrefetch(); veilProgress(.25, 'The trees close in…');
    if (!m.isLoaded()) { await m.load(mod.zoneApi, (p, l) => veilProgress(.25 + p * .65, l), { exit: () => exitDeep() }); D.loads++; }
    veilProgress(.95, 'Glassroot Grove'); await new Promise(r => setTimeout(r, 200));
    cityOff(); m.enter(); D.active = true; D.trips++; D.leftAt = 0; D.errs = 0; G.deepMs = Math.round(performance.now() - t0); note('deep in ' + G.deepMs + 'ms');
  } catch (e) { G.deepErr = String(e && e.stack || e).slice(0, 400); console.warn('wilds deep', e); abortDeep('load'); }
  finally { D.busy = false; G.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); hideVeil(); }
}
function placeAtThreshold() { const c = C(), P = c.P; P.pos.set(THRESH.x, 0, THRESH.z - 5); P.vel.set(0, 0, 0); c.input.yp.yaw = 0; EX.prev = null; c.C.position.set(THRESH.x, 3, THRESH.z - 11); }   // yaw 0 faces -z: back toward the trailhead
function exitDeep() {
  if (!D.active || D.busy) return; D.busy = true; G.modal = 'deep'; showVeil('FERNWAY VERGE', 'Back toward the trailhead', 'deep'); veilProgress(.6, 'The canopy opens…'); shrink('out');
  setTimeout(() => { try { D.mod.leave(); } catch (e) { G.deepErr = 'leave ' + e; } D.active = false; cityOn(); placeAtThreshold(); D.leftAt = performance.now(); veilProgress(1);
    D.busy = false; G.modal = null; hideVeil(); note('deep out'); }, 380);
}
function abortDeep(why) {   // never strand anyone: city back on, zone cleared, standing in Fernway Verge on foot (or the city if the forest is gone)
  G.deepAborts = (G.deepAborts || 0) + 1; G.deepAbortWhy = why; note('deep abort ' + why);
  try { if (D.mod && D.mod.isLoaded()) D.mod.leave(); } catch (e) { } D.active = false; cityOn();
  const c = C(), P = c.P; if (inDeepRealm(P.pos.x, P.pos.z)) { if (loaded()) placeAtThreshold(); else { P.pos.set(GATE.x, 0, GATE.z - 10); P.vel.set(0, 0, 0); } }
  D.leftAt = performance.now();
}
function unloadDeep() { if (!D.mod || !D.mod.isLoaded() || D.active) return; try { D.mod.unload(); } catch (e) { G.deepErr = 'unload ' + e; } D.unloads++; D.leftAt = 0; note('deep unload'); }
function threshInteract(p) {
  if (!CFG.deep || D.active || D.busy) return null; const d = Math.hypot(p.x - THRESH.x, p.z - THRESH.z);
  return d < 6 ? { label: 'Go deeper: Glassroot Grove (Lv 5–12)', d: d * .5, act: () => enterDeep() } : null;
}
// safety net, every frame, separate from everything else: no invisible city, no stuck lock, no stuck barrier
function safety() {
  const c = C(); if (!c || !c.P) return; const P = c.P;
  if (CO.off && !D.active && !D.busy) cityOn();                                       // city hidden but nobody in the deep area
  if (D.active && !D.busy && !inDeepRealm(P.pos.x, P.pos.z)) abortDeep('teleported');  // moved out of the deep realm by anything else
  if (window.__cityPaused && !CO.off) window.__cityPaused = false;
  if (EX.ok && (!loaded() || !mod.inForest())) EX.ok = false;                          // the exit pass is single-use
  const inWilds = (loaded() && mod.inForest()) || D.active;
  travelLock(inWilds);
  if (G.modal === 'prompt' && !(loaded() && mod.inForest())) { if (G.closePrompt) G.closePrompt(); G.staleExit = (G.staleExit || 0) + 1; }   // teleported out while "Return to BURN City?" was open
  if (G.modal && !document.getElementById('wlWarn') && !document.getElementById('wlVeil') && G.modal !== 'loading' && G.modal !== 'deep') G.modal = null;   // a prompt that vanished
}
// ---------------------------------------------------------------- per frame (cheap: a few distance checks)
function frame(dt, t) {
  if (G.horizon && !CO.off) G.horizon.visible = !loaded();   // skyline stands where the real forest loads: show it only while the Cinderwilds is unloaded (deep cityOff/cityOn owns it while off)
  const c = C(), P = c.P, explore = c.getMode() === 'explore' && !window.__burnTowerOpen;
  for (const f of flames) { const k = t * 9 + f.userData.ph; const s = 1 + Math.sin(k) * .08 + Math.sin(k * 2.3) * .05; f.scale.set(s, 1 + Math.sin(k * 1.7) * .14 + Math.sin(k * 3.1) * .06, s); }
  const dGate = Math.hypot(P.pos.x - GATE.x, P.pos.z - GATE.z), e = ell(P.pos.x, P.pos.z);
  if (explore && !modP && (dGate < PREFETCH_M || e < 1.05)) prefetch().catch(() => { });
  const inF = loaded() && mod.inForest();
  // Keep city-wide banners/toasts out of the forest; forest-owned HUD remains available.
  document.body.classList.toggle('wl-forest', inF || D.active);
  if (explore && !inF && e < .99 && !D.active && !G.modal && !(mod && mod.locked()) && !(window.__boat && window.__boat.active)) showWarning();
  if (D.active) {   // deep area: the city is hidden + paused; only the deep world + the shared Wilds systems run
    try { D.mod.frame(dt, t); mod.frame(dt, t); D.errs = 0; } catch (err) { if (++D.errs > 3) { G.deepErr = String(err && err.stack || err).slice(0, 400); abortDeep('error'); } }
    if (CO.off) hideNew(); shrinkFrame(); return;
  }
  if (loaded()) barrier(P, explore);
  if (loaded() && CFG.deep && mod.inForest()) {
    const dT = Math.hypot(P.pos.x - THRESH.x, P.pos.z - THRESH.z);
    if (dT < 70 && !D.p) deepPrefetch().catch(() => { });
    if (explore && !G.modal && !mod.locked() && !D.busy && Math.abs(P.pos.x - THRESH.x) < 3 && P.pos.z > THRESH.z - .4 && P.pos.z < THRESH.z + 2.5 && EX.prev) enterDeep();   // walked through the veil
    if (mod.zoneApi && !mod.zoneApi.W.deepInteract) mod.zoneApi.W.deepInteract = threshInteract;
  }
  if (D.mod && D.leftAt && performance.now() - D.leftAt > UNLOAD_S * 1000) unloadDeep();
  shrinkFrame();
  if (loaded()) {
    mod.frame(dt, t);
    const cam = c.C.position, far = !mod.inForest() && !mod.locked() && dGate > UNLOAD_M && e > 1.1 && ell(cam.x, cam.z) > 1.3;
    const now = performance.now(); if (!far) G.farSince = 0; else if (!G.farSince) G.farSince = now; else if (now - G.farSince > UNLOAD_S * 1000) unload();   // wall-clock (the city clamps dt on slow frames)
  }
}

// ---------------------------------------------------------------- distant forest skyline (visual-only, no colliders / no forest loading)
// Gives the city a readable northern frontier while keeping the actual Cinderwilds lazy-loaded.
// Instancing keeps the horizon to a handful of draw calls, including on phones.
function buildForestHorizon() {
  const c = C(), root = new THREE.Group(); root.name = 'wilds-horizon';
  const ridge = new THREE.Shape();
  ridge.moveTo(-290, 0); ridge.lineTo(-290, 7);
  ridge.lineTo(-245, 13); ridge.lineTo(-205, 10); ridge.lineTo(-162, 23);
  ridge.lineTo(-118, 16); ridge.lineTo(-76, 29); ridge.lineTo(-35, 18);
  ridge.lineTo(12, 25); ridge.lineTo(54, 14); ridge.lineTo(98, 31);
  ridge.lineTo(145, 18); ridge.lineTo(184, 25); ridge.lineTo(226, 12);
  ridge.lineTo(290, 17); ridge.lineTo(290, 0); ridge.closePath();
  const hill = new THREE.Mesh(new THREE.ShapeGeometry(ridge), new THREE.MeshBasicMaterial({ color: 0x101e18, side: THREE.DoubleSide, fog: true }));
  hill.position.set(0, 0, 570); root.add(hill);
  const count = 132;
  const trunkGeo = new THREE.CylinderGeometry(.12, .22, 1, 5);
  const canopyGeo = new THREE.ConeGeometry(.5, 1, 5, 1);
  const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshBasicMaterial({ color: 0x171a15, fog: true }), count);
  const crownMats = [0x14251b, 0x192c20, 0x203526].map(color => new THREE.MeshBasicMaterial({ color, fog: true }));
  const crowns = crownMats.map(mat => new THREE.InstancedMesh(canopyGeo, mat, count));
  const dummy = new THREE.Object3D();
  let seed = 481516;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < count; i++) {
    const x = -260 + (i / (count - 1)) * 520 + (rand() - .5) * 7;
    const z = 485 + rand() * 95;
    const h = 13 + rand() * 24, w = 3.8 + rand() * 5.5;
    const y = 1.5 + rand() * 1.2;
    dummy.position.set(x, y + h * .22, z);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.scale.set(w * .075, h * .72, w * .075); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
    for (let layer = 0; layer < 3; layer++) {
      const f = 1 - layer * .23;
      dummy.position.set(x, y + h * (.42 + layer * .19), z - .15);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w * f, h * (.52 - layer * .035), w * f);
      dummy.updateMatrix(); crowns[layer].setMatrixAt(i, dummy.matrix);
    }
  }
  trunk.instanceMatrix.needsUpdate = true;
  for (const m of crowns) { m.instanceMatrix.needsUpdate = true; root.add(m); }
  root.add(trunk); c.S.add(root);
  return root;
}
// ---------------------------------------------------------------- boot: draw the gate + register the hooks once
(function wait() {
  if (Q.has('nowilds')) return;
  const c = window.__city;
  if (!(window.__ready && c && c.colliders && c.S)) return setTimeout(wait, 400);
  try {
    const st = document.createElement('style'); st.id = 'wlGateCss'; st.textContent = css; document.head.append(st);
    G.gate = buildGate(); G.horizon = buildForestHorizon();
    (window.__preRender = window.__preRender || []).push(() => { try { safety(); } catch (e) { if (!G.serr) { G.serr = String(e && e.stack || e).slice(0, 300); console.warn('wilds safety', e); } } });
    window.__peerRealm = (x, z) => { const c = C(), q = c.getMode() === 'explore' ? c.P.pos : c.C.position; return inDeepRealm(x, z) === inDeepRealm(q.x, q.z); };
    (window.__preRender = window.__preRender || []).push((dt, t) => { try { frame(dt, t); } catch (e) { if (!G.ferr) { G.ferr = String(e && e.stack || e).slice(0, 400); console.warn('wilds frame', e); } } });   // never let the forest break the city's render loop
    (window.__interactors = window.__interactors || []).push(p => loaded() ? mod.interactor(p) : null);
    const prevLock = window.__exploreLock; window.__exploreLock = () => !!G.modal || !!window.__wildsMapOpen || (loaded() && mod.locked()) || (prevLock ? prevLock() : false);
    addEventListener('keydown', e => { if (loaded()) mod.onKey(e); }, true);
    G.state = 'idle'; G.readyAt = performance.now();
  } catch (e) { G.err = String(e && e.stack || e).slice(0, 400); console.warn('wilds gate', e); }
  if (TEST) window.__wildsGate = Object.assign(G, { prefetch, proceed, unload, showWarning, loaded, mod: () => mod, cfg: { PREFETCH_M, UNLOAD_M, UNLOAD_S }, CFG, THRESH, DEEP,
    deep: { D, enterDeep, exitDeep, abortDeep, unloadDeep, cityOff, cityOn, CO, active: deepActive, mod: () => D.mod }, exitPrompt, EX, travelLock, shrink });
})();
