// THE EMBER BAR (its own tavern on the City street, js/ember-bar-building.mjs; interior in tower-interior.js): pirate bartender, Blackbeard the bar regular, the upgraded counter and the
// 1 XRP drink checkout UI. Loaded by tower-interior.js; everything here is optional dressing around the existing bar station:
//  * ?bar3d=0   → no characters and no counter upgrade (the original bar).   ?barpay=0 → hide the paid checkout buttons.
//  * Characters (9k tris; 4.5k + 512 px textures on phones) load lazily (first time the player walks into the tavern or opens the menu), share one rig each,
//    and the menu, receipts and cups keep working if a model fails to load.
//  * Payments are server-owned (server/ember-bar.js): the client only names the drink. The bartender's two hops play once per
//    paid order, when the server's /collect says celebrate:true; repeats and reloads just serve the cup.
// Models (CC BY 4.0, credited in city-credits.html): "Pirate Crew" by RYStudio, "3d model inspired of Blackbeard" by FrandProductions.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const Q = new URLSearchParams(location.search);
export const BAR3D = Q.get('bar3d') !== '0';
const PAY_UI = Q.get('barpay') !== '0';
const ASSET = new URL('../assets/bar/', import.meta.url);
const DRINK_COLORS = { 'cinder-tea': 0xc9762a, 'ember-fizz': 0xff5a2a, 'blackglass-tonic': 0x3a2350 };
const DRINKS = [
  ['cinder-tea', 'CINDER TEA', 'Smoked black tea, clove, and a slow amber glow.'],
  ['ember-fizz', 'EMBER FIZZ', 'A bright citrus sparkle with a warm red finish.'],
  ['blackglass-tonic', 'BLACKGLASS TONIC', 'Dark berry, cool mint, and a shimmer like volcanic glass.']
];
const LINES = [
  "I'm not swayin'. The whole tavern's at sea.",
  "Easy there, deckhand. You're makin' the floor roll.",
  "Another round for the hearth. It looks thirsty.",
  "Ye walk like a landlubber... or is that me?",
  "Mind the planks, matey. They keep movin'.",
  "Arr... this tea's stronger than it looks."
];

let X = null;            // tower context from init()
let built = false, loadState = 0, bartender = null, beard = null;
const G = { counterTop: 0, serve: null, beardSeat: null };
let mat = null, cup = null, beardMug = null, slideMug = null;
let serveQ = [], serving = null, sub = null, subT = 0, banterArmed = true, banterNext = 0, lineIx = Math.floor(Math.random() * LINES.length);
let statusCache = null, pollTimer = null, closeHook = null;

const token = () => { try { return localStorage.bcToken || ''; } catch { return ''; } };
async function api(path, method = 'GET', body) {
  const t = token();
  const r = await fetch(X.SRV.replace(/\/$/, '') + path, { method, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { }
  return { status: r.status, data: data || {} };
}

// ---------------------------------------------------------------- scene dressing (called from barAndLounge())
export function init(ctx) {
  X = ctx;
  addEventListener('burntower:close', onTowerClose);
  addEventListener('burntower:open', onTowerOpen);
}
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
export function build() {
  if (!BAR3D || built) return; built = true;
  const { scene, MEZZ, HX, M, instanced } = X;
  const bx0 = -15.4, bx1 = -14.6, bz0 = 9, bz1 = 18, top = MEZZ + 1.13; G.counterTop = top;
  // dark textured counter front (guest side, faces +x): fluted dark panels with a brass kick rail
  const front = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#17110d'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { const k = 18 + (x / 16 % 2) * 6; g.fillStyle = `rgb(${k + 8},${k},${k - 4})`; g.fillRect(x + 1, 6, 13, h - 12); g.fillStyle = '#0a0705'; g.fillRect(x, 0, 1, h); }
    g.fillStyle = '#3a2814'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); });
  front.repeat.set(6, 1);
  const fm = new THREE.MeshStandardMaterial({ map: front, roughness: .7, metalness: .25, envMapIntensity: .6 });
  const fg = new THREE.PlaneGeometry(bz1 - bz0, 1.0); const fp = new THREE.Mesh(fg, fm); fp.rotation.y = Math.PI / 2; fp.position.set(bx1 + .012, MEZZ + .54, (bz0 + bz1) / 2); scene.add(fp);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, bz1 - bz0 - .2, 10), M.gold); rail.rotation.x = Math.PI / 2; rail.position.set(bx1 + .22, MEZZ + .28, (bz0 + bz1) / 2); scene.add(rail);
  // warm under-shelf glow strips on the back bar (emissive only: no extra lights, no extra passes)
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, .55, .2) });
  for (const y of [MEZZ + 1.86, MEZZ + 2.66]) { const s = new THREE.Mesh(new THREE.BoxGeometry(.04, .025, bz1 - bz0 - 1.2), glow); s.position.set(-HX + .7, y, (bz0 + bz1) / 2); scene.add(s); }
  const cglow = new THREE.Mesh(new THREE.BoxGeometry(.03, .02, bz1 - bz0 - .3), glow); cglow.position.set(bx0 - .03, top - .07, (bz0 + bz1) / 2); scene.add(cglow);   // service-side lip
  // grouped bottles (amber, green, smoke) and a row of glassware on the back counter
  const bottleG = new THREE.CylinderGeometry(.055, .065, .3, 8), colors = [0x9a4a12, 0x3d5a2a, 0x5a5048, 0x7a1a12];
  colors.forEach((c, k) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: .15, metalness: .1, transparent: true, opacity: .85 });
    const list = []; for (let i = 0; i < 4; i++) list.push([-HX + .35 + (i % 2) * .12, MEZZ + 1.06 + .15, bz0 + 1.2 + k * 2.1 + (i >> 1) * .14 + (i % 2) * .05]); instanced(bottleG, m, list); });
  const backBar = new THREE.Mesh(new THREE.BoxGeometry(.6, .06, bz1 - bz0 - 1), M.metal); backBar.position.set(-HX + .4, MEZZ + 1.03, (bz0 + bz1) / 2); scene.add(backBar);
  const glassG = new THREE.CylinderGeometry(.045, .035, .11, 10), glassM = new THREE.MeshStandardMaterial({ color: 0xe8ddd0, roughness: .05, metalness: 0, transparent: true, opacity: .45 });
  instanced(glassG, glassM, Array.from({ length: 10 }, (_, i) => [-HX + .62, MEZZ + 1.06 + .055, bz0 + 1.6 + i * .7 + (i > 4 ? .6 : 0)]));
  // the serving spot: a dark rubber mat with a brass edge at the middle of the counter, where paid and preview drinks land
  G.serve = new THREE.Vector3(-15.0, top, 13.5);
  mat = new THREE.Mesh(new THREE.BoxGeometry(.42, .012, .62), new THREE.MeshStandardMaterial({ color: 0x0e0b0a, roughness: .95 })); mat.position.set(G.serve.x, top + .006, G.serve.z); scene.add(mat);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.44, .006, .64), M.gold); edge.position.set(G.serve.x, top + .002, G.serve.z); scene.add(edge);
  cup = makeCup(0xff5a2a); cup.visible = false; scene.add(cup);
  // Blackbeard's mug, and his seat at the far stool
  G.beardSeat = new THREE.Vector3(-14.25, MEZZ, 9 + 1 + 4 * 1.7);
  beardMug = makeMug(); beardMug.position.set(-15.05, top, G.beardSeat.z); scene.add(beardMug);
  X.cyl(-16.4, 13.5, .32, MEZZ, MEZZ + 1.8);   // the bartender's spot behind the counter is solid
}
function makeCup(color) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.055, .045, .14, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2e8dc, roughness: .05, transparent: true, opacity: .4, side: THREE.DoubleSide }));
  glass.position.y = .07; g.add(glass);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(.05, .042, .1, 14), new THREE.MeshStandardMaterial({ color, roughness: .2, emissive: color, emissiveIntensity: .35 }));
  liquid.position.y = .055; g.add(liquid); g.userData.liquid = liquid; return g;
}
function makeMug() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: .6, metalness: .2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .14, 12), m); body.position.y = .07; g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.04, .012, 6, 10, Math.PI), m); handle.rotation.z = -Math.PI / 2; handle.position.set(.065, .07, 0); g.add(handle);
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .012, 12), new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: .9 })); foam.position.y = .14; g.add(foam);
  return g;
}

// ---------------------------------------------------------------- characters (lazy, shared rigs)
function load() {
  if (loadState || !BAR3D) return; loadState = 1;
  const lm = new THREE.LoadingManager(); if (X.TOUCH) lm.setURLModifier(u => u.replace(/-tex\//, '-tex-512/'));
  const gl = new GLTFLoader(lm);
  const one = async (id, setup) => {
    try { const g = await gl.loadAsync(new URL(id + (X.TOUCH ? '-lo' : '') + '.gltf', ASSET).href); setup(rig(g)); }   // phones: ~5-6.5k-tri mesh + 1024 px texture (the folder keeps its -tex-512 name)
    catch (e) { console.warn('ember bar model', id, e); }   // fallback: the bar, menu and cups keep working without her/him
  };
  Promise.all([
    one('pirate', r => { bartender = r; r.root.position.set(-16.4, X.MEZZ, 13.5); r.root.rotation.y = Math.PI / 2; r.base.copy(r.root.position); X.scene.add(r.root); }),
    one('blackbeard', r => { beard = r; const s = G.beardSeat; r.root.position.set(s.x, X.MEZZ - .05, s.z); r.root.rotation.y = -Math.PI / 2; X.scene.add(r.root); beard.sips = 0; beard.next = 4; beard.phase = 'wait'; })
  ]).then(() => { loadState = 2; if (beard && bartender) slideMugToBeard(); else if (beard) handMug(); });
}
function rig(g) {
  const root = g.scene, bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name.replace(/[.:\/\[\]]/g, '')] = o; /* GLTFLoader strips the '.' from 'thigh.L' */ if (o.isMesh) { o.frustumCulled = false; const m = o.material; if (m && m.map) { m.emissive = new THREE.Color(1, .82, .62); m.emissiveMap = m.map; m.emissiveIntensity = .1; m.needsUpdate = true; } } });   // soft warm face light (.1: brighter washed the faces out) from the guest side, without adding a light
  const rest = Object.values(bones).map(b => [b, b.quaternion.clone()]);
  const mixer = new THREE.AnimationMixer(root), idle = g.animations.find(a => a.name === 'Idle') || g.animations[0];
  if (idle) mixer.clipAction(idle).play();
  return { root, bones, mixer, base: root.position.clone(), update(dt) { for (const [b, q] of rest) b.quaternion.copy(q); mixer.update(dt); } };
}
// rotate a bone about an axis given in the character's own space (x = her left/right, y = up, z = forward)
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _ax = new THREE.Vector3();
function bend(r, name, axis, ang) {
  const b = r.bones[name.replace(/[.:\/\[\]]/g, '')]; if (!b || !ang) return;
  r.root.updateMatrixWorld(true);
  b.parent.getWorldQuaternion(_q2); r.root.getWorldQuaternion(_q3); _q2.premultiply(_q3.invert());   // parent relative to the character root
  _ax.copy(axis); _q.setFromAxisAngle(_ax, ang); _q.premultiply(_q2.clone().invert()).multiply(_q2);
  b.quaternion.premultiply(_q);
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function seat(r, sway) {   // Blackbeard on the stool: thighs forward, shins down, a loose sway that grows with every sip
  bend(r, 'thigh.L', AX, -1.45); bend(r, 'thigh.R', AX, -1.45); bend(r, 'shin.L', AX, 1.35); bend(r, 'shin.R', AX, 1.35);
  bend(r, 'spine', AZ, sway * .5); bend(r, 'chest', AX, .12 + Math.abs(sway) * .3);
}
function handMug() { if (beard && beardMug) { beardMug.position.set(0, 0, 0); beardMug.rotation.set(0, 0, 0); const h = beard.bones.handR; if (h) { h.add(beardMug); beardMug.scale.setScalar(1 / (h.getWorldScale(new THREE.Vector3()).x || 1)); beardMug.position.set(0, .06, .04); } beard.hasMug = !!h; } }
function slideMugToBeard() {   // the bartender brings him his mug: she lifts it at the service spot and slides it down the counter
  slideMug = { t: 0, from: new THREE.Vector3(-15.05, G.counterTop, 13.5), to: beardMug.position.clone() };
  beardMug.position.copy(slideMug.from);
}

// ---------------------------------------------------------------- serving + celebration
// Queue a drink. celebrate=true only for the first fulfilment of a confirmed paid order (server-decided).
function serve(drink, { celebrate = false, receipt = null } = {}) {
  serveQ.push({ drink, celebrate, receipt });
}
function startNext() {
  if (serving || !serveQ.length) return;
  const s = serveQ.shift(); serving = { ...s, t: 0, dur: (s.celebrate && bartender ? 1.4 : 0) + (bartender ? 1.1 : 0) + .01 };
  cup.visible = false; cup.userData.liquid.material.color.setHex(DRINK_COLORS[s.drink] || 0xff5a2a); cup.userData.liquid.material.emissive.setHex(DRINK_COLORS[s.drink] || 0xff5a2a);
}
function finishServing() {
  if (!serving) return; const s = serving; serving = null;
  if (cup.parent !== X.scene) X.scene.add(cup);
  cup.position.copy(G.serve).add(new THREE.Vector3(0, .012, 0)); cup.rotation.set(0, 0, 0); cup.scale.setScalar(1); cup.visible = true;
  if (bartender) bartender.root.position.copy(bartender.base);
  if (s.receipt) X.toast(s.receipt);
}
const hop = u => { const k = u < .5 ? u * 2 : (u - .5) * 2; return 4 * k * (1 - k) * .28; };   // two quick hops, ~28 cm, landing between
function updServing(dt) {
  startNext(); if (!serving) return;
  const s = serving; s.t += dt; const B = bartender;
  const hopDur = s.celebrate && B ? 1.4 : 0;
  if (B) {
    B.root.position.copy(B.base);
    if (s.t < hopDur) {   // celebration: two joyful full-body hops behind the counter, arms up on each take-off
      const u = s.t / hopDur; B.root.position.y += hop(u); const arms = Math.sin(Math.min(1, (u % .5) * 2) * Math.PI) * .3;   // small arm lift: her coat tails are skinned to the arms and stretch on bigger raises
      bend(B, 'upperarm.L', AZ, arms); bend(B, 'upperarm.R', AZ, -arms);
      const squash = (u % .5) < .08 || (u % .5) > .44 ? .96 : 1; B.root.scale.set(1, squash, 1);
    } else {              // serve: reach across the counter, set the cup on the mat, settle back
      B.root.scale.set(1, 1, 1);
      const u = Math.min(1, (s.t - hopDur) / 1.1), reach = Math.sin(u * Math.PI);
      bend(B, 'upperarm.R', AX, -1.15 * reach); bend(B, 'forearm.R', AX, -.5 * reach); bend(B, 'spine', AX, .18 * reach);
      const h = B.bones.handR;
      if (h && u < .55) { h.getWorldPosition(cup.position); cup.position.y -= .05; cup.visible = true; }
      else { cup.position.copy(G.serve); cup.position.y += .012; cup.visible = true; }
    }
  }
  if (s.t >= s.dur) finishServing();
}

// ---------------------------------------------------------------- per-frame (called from towerFrame)
const _p = new THREE.Vector3();
export function frame(dt, t, P) {
  if (!BAR3D || !built) return;
  const nearBar = Math.abs(P.pos.y - X.MEZZ) < 2.5 && Math.hypot(P.pos.x + 15, P.pos.z - 13.5) < 22;
  if (nearBar) load();
  if (bartender) bartender.update(dt);
  if (beard) beard.update(dt);
  if (slideMug) { slideMug.t += dt / 1.6; const u = Math.min(1, slideMug.t), e = u * u * (3 - 2 * u); beardMug.position.lerpVectors(slideMug.from, slideMug.to, e); if (bartender && u < .3) bend(bartender, 'upperarm.R', AX, -.9 * Math.sin(u / .3 * Math.PI)); if (u >= 1) { slideMug = null; beard.next = 2.5; } }
  if (beard) {
    const sway = Math.min(.14, beard.sips * .035) * Math.sin(t * 1.3);
    seat(beard, sway);
    if (!slideMug && !beard.hasMug && beard.next <= 0) handMug();
    beard.next -= dt;
    if (beard.hasMug) {   // sip: lift the mug, tip it, set it back down; one sip every ~9 s, getting looser each time
      if (beard.phase === 'wait' && beard.next <= 0) { beard.phase = 'sip'; beard.st = 0; }
      if (beard.phase === 'sip') { beard.st += dt; const u = Math.min(1, beard.st / 2.4), k = Math.sin(u * Math.PI);
        bend(beard, 'upperarm.R', AX, -1.0 * k); bend(beard, 'forearm.R', AX, -1.5 * k); bend(beard, 'head', AX, -.25 * k);
        if (u >= 1) { beard.phase = 'wait'; beard.next = 8 + Math.random() * 4; beard.sips = Math.min(6, beard.sips + 1); } }
      else bend(beard, 'forearm.R', AX, -.7);
    }
    // banter: look at a passing player and mutter a line, with a cooldown and rotation (never the same line back to back)
    beard.root.getWorldPosition(_p); const d = Math.hypot(P.pos.x - _p.x, P.pos.z - _p.z), sameFloor = Math.abs(P.pos.y - X.MEZZ) < 2;
    if (sameFloor && d < 4.2) {
      const look = Math.atan2(P.pos.x - _p.x, P.pos.z - _p.z) - beard.root.rotation.y; const a = Math.atan2(Math.sin(look), Math.cos(look));
      bend(beard, 'head', AY, Math.max(-1.1, Math.min(1.1, a)) * .8); bend(beard, 'neck', AY, Math.max(-.5, Math.min(.5, a)) * .3);
      if (banterArmed && t > banterNext) { say(LINES[lineIx++ % LINES.length]); banterArmed = false; banterNext = t + 22; }
    } else if (!sameFloor || d > 6) banterArmed = true;
  }
  updServing(dt);
  if (sub && (subT -= dt) <= 0) { sub.style.opacity = '0'; }
  // a paid drink that validated while the player was away is served when they come back to the counter
  if (pendingPickup.length && sameFloorNear(P, 5)) { for (const o of pendingPickup.splice(0)) collectAndServe(o); }
}
const sameFloorNear = (P, r) => Math.abs(P.pos.y - X.MEZZ) < 2 && Math.hypot(P.pos.x + 14.6, P.pos.z - 13.5) < r;
function say(line) {
  const root = X.root(); if (!root) return;
  if (!sub || !sub.isConnected) { sub = document.createElement('div'); sub.className = 'ember-sub'; Object.assign(sub.style, { position: 'absolute', left: '50%', bottom: 'max(118px,calc(env(safe-area-inset-bottom) + 118px))', transform: 'translateX(-50%)', maxWidth: 'min(520px,88vw)', background: '#0d0a0ee6', border: '1px solid #6e5230', borderRadius: '10px', padding: '8px 13px', color: '#f0dcbd', font: 'italic 14px Georgia,serif', textAlign: 'center', transition: 'opacity .4s', zIndex: 4, pointerEvents: 'none' }); root.appendChild(sub); }
  sub.textContent = 'Blackbeard: “' + line + '”'; sub.style.opacity = '1'; subT = 4.2;
}

// ---------------------------------------------------------------- checkout
let pendingPickup = [];
async function refreshStatus() { try { const r = await api('/api/ember-bar'); statusCache = r.status === 200 ? r.data : null; } catch { statusCache = null; } return statusCache; }
async function collectAndServe(o) {
  let celebrate = false;
  try { const r = await api('/api/ember-bar/collect', 'POST', { order: o.id }); if (r.status === 200) celebrate = r.data.celebrate === true; else if (r.status !== 409) return; } catch { return; }
  serve(o.drink, { celebrate, receipt: receiptText(o) });
}
const receiptText = o => `Paid · ${o.drinkName || o.drink} · 1 XRP to the BURN City treasury · tx ${String(o.hash || '').slice(0, 10)}…`;
function onTowerOpen() {
  if (!token()) return;
  refreshStatus().then(s => { if (s?.uncollected?.length) { pendingPickup.push(...s.uncollected); X.toast('Your ' + s.uncollected.map(o => o.drinkName).join(', ') + ' is waiting at the Ember Bar.'); } });
}
function onTowerClose() {
  clearTimeout(pollTimer); pollTimer = null;
  if (serving) finishServing(); serveQ.length = 0;   // a confirmed order is never lost: the server keeps it until /collect
  if (sub) { sub.remove(); sub = null; }
  banterArmed = true;
}

// Menu panel: free preview for every drink, plus "Buy for 1 XRP" when the server says paid checkout is available.
export function menu(panel, closePanel) {
  const btn = X.btn;
  const h = document.createElement('h2'); h.textContent = 'THE EMBER BAR';
  Object.assign(h.style, { margin: '0 0 6px', fontSize: '16px', letterSpacing: '.12em', color: '#d7a65e', fontFamily: 'Georgia,serif' }); panel.appendChild(h);
  const intro = document.createElement('p');
  intro.textContent = 'House specials. A free preview serves the drink at the counter. Buy for 1 XRP is a cosmetic purchase: the bartender celebrates and serves your drink. Drinks give no gameplay effects or items.';
  Object.assign(intro.style, { margin: '0 0 8px', color: '#cbbcaa', fontSize: '12px', lineHeight: '1.5' }); panel.appendChild(intro);
  const payNote = document.createElement('p'); Object.assign(payNote.style, { margin: '0 0 8px', color: '#a8998a', fontSize: '11px', lineHeight: '1.45' }); panel.appendChild(payNote);
  const buyBtns = [];
  for (const [id, name, description] of DRINKS) {
    const card = document.createElement('div');
    Object.assign(card.style, { padding: '10px', margin: '8px 0', border: '1px solid #493827', borderRadius: '9px', background: '#ffffff05' });
    const title = document.createElement('strong'); title.textContent = name; Object.assign(title.style, { display: 'block', color: '#f0d2a2', fontSize: '12px', letterSpacing: '.08em' });
    const detail = document.createElement('p'); detail.textContent = description; Object.assign(detail.style, { margin: '5px 0 10px', color: '#bcae9f', fontSize: '11px', lineHeight: '1.45' });
    const row = document.createElement('div'); Object.assign(row.style, { display: 'flex', gap: '8px', flexWrap: 'wrap' });
    const preview = btn('FREE PREVIEW', true); preview.style.flex = '1';
    preview.addEventListener('click', () => { closePanel(); serve(id, { receipt: name + ' · free preview at the counter.' }); });
    row.appendChild(preview);
    if (PAY_UI) { const buy = btn('BUY FOR 1 XRP'); buy.style.flex = '1'; buy.disabled = true; buy.style.opacity = '.5'; buy.dataset.drink = id; buy.addEventListener('click', () => checkout(id, name, panel, closePanel)); row.appendChild(buy); buyBtns.push(buy); }
    card.append(title, detail, row); panel.appendChild(card);
  }
  const c = btn('CLOSE', true); c.style.marginTop = '8px'; c.addEventListener('click', closePanel); panel.appendChild(c);
  if (BAR3D) load();
  if (!PAY_UI) { payNote.textContent = 'Paid drinks are hidden on this link.'; return; }
  payNote.textContent = 'Checking the bar till…';
  refreshStatus().then(s => {
    if (!panel.isConnected) return;
    if (!s || !s.payments) { payNote.textContent = 'Paid drinks are unavailable right now. Free previews still work.'; return; }
    const tr = s.treasury ? s.treasury.slice(0, 6) + '…' + s.treasury.slice(-4) : '';
    payNote.textContent = `Buy for 1 XRP pays exactly 1 XRP to the BURN City treasury (${tr}) through Xaman. The whole 1 XRP goes to the treasury; none of it is burned. Xaman shows the small network fee separately.` + (token() ? '' : ' Sign in with Xaman in BURN City first.');
    for (const b of buyBtns) { b.disabled = false; b.style.opacity = '1'; }
    if (s.pending?.length) { const o = s.pending[0]; const r = btn('RESUME ' + o.drinkName.toUpperCase() + ' CHECKOUT'); r.style.width = '100%'; r.addEventListener('click', () => showCheckout(o, panel, closePanel)); panel.insertBefore(r, payNote.nextSibling); }
    if (s.uncollected?.length) { for (const o of s.uncollected) if (!pendingPickup.some(p => p.id === o.id)) pendingPickup.push(o); }
  });
}
async function checkout(drink, name, panel, closePanel) {
  if (!token()) { X.toast('Sign in with Xaman in BURN City first, then come back to the bar.'); return; }
  const host = sheet(panel, 'BUY ' + name, 'Preparing your order…');
  let r; try { r = await api('/api/ember-bar/order', 'POST', { drink }); } catch { host.say('Could not reach the bar till. Try again.'); return; }
  if (r.status === 401) { host.say('Sign in with Xaman in BURN City first.'); return; }
  if (r.status === 409 || r.status === 503) { host.say('Paid drinks are unavailable right now. The free preview still works.'); return; }
  if (r.status !== 200) { host.say('Could not create the order (' + (r.data.error || r.status) + ').'); return; }
  showCheckout(r.data.order, panel, closePanel, host);
}
function sheet(panel, title, text) {
  panel.replaceChildren();
  const h = document.createElement('h2'); h.textContent = title; Object.assign(h.style, { margin: '0 0 8px', fontSize: '15px', letterSpacing: '.12em', color: '#d7a65e', fontFamily: 'Georgia,serif' });
  const msg = document.createElement('p'); msg.textContent = text; Object.assign(msg.style, { margin: '0 0 8px', color: '#e2d3bf', fontSize: '13px', lineHeight: '1.5' });
  const box = document.createElement('div'); panel.append(h, msg, box);
  return { msg, box, say: t => { msg.textContent = t; } };
}
function showCheckout(o, panel, closePanel, host) {
  host = host || sheet(panel, 'BUY ' + (o.drinkName || o.drink).toUpperCase(), '');
  host.say(`Pay exactly 1 XRP to the BURN City treasury in Xaman. Your ${o.drinkName} is served once the payment validates on the XRP Ledger.`);
  const st = document.createElement('p'); Object.assign(st.style, { margin: '6px 0', color: '#ffc18e', fontSize: '12px', fontWeight: '700' }); st.textContent = 'Status: waiting for Xaman…';
  const x = o.xaman;
  if (x?.deeplink) { const a = document.createElement('a'); a.href = x.deeplink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'OPEN IN XAMAN'; Object.assign(a.style, { display: 'inline-block', margin: '6px 0', padding: '10px 16px', borderRadius: '9px', background: 'linear-gradient(120deg,#a63f16,#63250f)', color: '#ffe0c4', fontWeight: '800', textDecoration: 'none', letterSpacing: '.08em', pointerEvents: 'auto' }); host.box.append(a); }
  if (x?.qr && !X.TOUCH) { const img = document.createElement('img'); img.src = x.qr; img.alt = 'Xaman QR code'; Object.assign(img.style, { display: 'block', width: '170px', height: '170px', margin: '6px 0', borderRadius: '8px', background: '#fff' }); host.box.append(img); }
  const det = document.createElement('p'); Object.assign(det.style, { font: '11px ui-monospace,monospace', color: '#a8998a', wordBreak: 'break-all', margin: '6px 0' }); det.textContent = `To ${o.destination} · tag ${o.destinationTag} · order ${o.id}`;
  const close = X.btn('CLOSE', true); close.style.marginTop = '8px'; close.addEventListener('click', closePanel);
  host.box.append(st, det, close);
  clearTimeout(pollTimer);
  let tries = 0; const poll = async () => {
    pollTimer = null; let r; try { r = await api('/api/ember-bar/claim', 'POST', { order: o.id }); } catch { r = { status: 0, data: {} }; }
    if (r.status === 200 && r.data.paid) {
      const ord = r.data.order || o; if (panel.isConnected) closePanel();   // get out of the way: the celebration plays at the counter
      X.toast(`Payment confirmed on the XRP Ledger. Your ${o.drinkName} is on its way.`);
      collectAndServe(ord); return;
    }
    if (r.status === 410) { st.textContent = r.data.error === 'order_declined' ? 'Status: declined in Xaman. Nothing was charged.' : 'Status: expired. Nothing was charged. Order again any time.'; return; }
    if (r.status === 202 || r.status === 0 || r.status === 503 || r.status === 429) { if (++tries < 180) pollTimer = setTimeout(poll, 4000); else st.textContent = 'Status: still waiting. If you pay later, your drink waits at the bar.'; return; }
    st.textContent = 'Status: payment not accepted (' + (r.data.error || r.status) + '). Nothing is served for it.';
  };
  pollTimer = setTimeout(poll, 3000);
}

// test hooks (only with ?towertest)
export const _test = Q.has('towertest') ? { serve, get bartender() { return bartender; }, get beard() { return beard; }, get cup() { return cup; }, get serving() { return serving; }, say, load, collectAndServe, get pendingPickup() { return pendingPickup; } } : null;
