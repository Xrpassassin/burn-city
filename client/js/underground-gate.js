// BURN City: THE UNDERCROFT — always-loaded entrance stub (small). Loaded by app.js; the hub itself is lazy.
// At startup this draws ONLY the stair entrance (a pale-stone crypt stair with lumen crystals and an ember-lit door) at an open spot
// west-north-west of VEGAS (underground-layout.mjs entranceLot: checked against the live City streets/colliders at load).
//   - within PREFETCH_M of the entrance: quietly import('./underground-hub.js') (module code only)
//   - Enter (compact chip, E or tap): loading veil -> the hub builds (textures, models, lights), the city is hidden + paused
//     (never destroyed: hide + stash, restored exactly), the player stands at the foot of the stair in the Ember Crossroads.
//   - inside: the Descent Gate and the Ember Stair open Eternal Grind (dungeon/?from=crossroads); Eternal Grind's own
//     "Return to the Crossroads" comes back to ?crossroads=1 and lands you in front of the gate. Eternal Grind saves are untouched.
//   - leaving by the stair: city back on, standing at the entrance; UNLOAD_S later the hub is disposed (GPU, DOM, audio, colliders).
// The hub is its own realm off the city map (UG in underground-layout.mjs): players inside see each other (presence + chat bubbles),
// city players never draw them (window.__peerRealm is wrapped, Glassroot Grove keeps working).
import * as THREE from 'three';
import { UG, inUndercroft, SPOTS, toWorld, toLocal, slideLocal, walkableLocal, floorLocal, entranceLot, L } from './underground-layout.mjs';

const Q = new URLSearchParams(location.search);
export const TEST = Q.has('ugtest') || Q.get('debug') === '1';
export const ENABLED = !Q.has('nounder');
const PREFETCH_M = 70, UNLOAD_S = TEST && Q.has('ugunload') ? +Q.get('ugunload') : 45;
const C = () => window.__city;
const G = { state: 'idle', lot: null, root: null, mod: null, p: null, active: false, busy: false, trips: 0, loads: 0, unloads: 0, leftAt: 0, err: null, near: null, texReq: false };
export const tierN = (lo, med, hi) => { const t = C() && C().TIER; return t === 'low' ? lo : t === 'medium' ? med : hi; };

// ---------------------------------------------------------------- shared helpers (also used by underground-hub.js)
// World-scale UVs for any geometry: each triangle is projected on its dominant axis, so stone tiles stay the same size on every face.
export function worldUV(g, tile = 2.5) {
  g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i += 3) {
    const ax = Math.abs(n.getX(i) + n.getX(i + 1) + n.getX(i + 2)), ay = Math.abs(n.getY(i) + n.getY(i + 1) + n.getY(i + 2)), az = Math.abs(n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2));
    for (let k = i; k < i + 3; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (ay >= ax && ay >= az) { uv[k * 2] = x / tile; uv[k * 2 + 1] = z / tile; } else if (ax >= az) { uv[k * 2] = z / tile; uv[k * 2 + 1] = y / tile; } else { uv[k * 2] = x / tile; uv[k * 2 + 1] = y / tile; } }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
export function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
let _glow = null;
export function glowTex() { return _glow || (_glow = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,220,170,.75)'); r.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); })); }
// layered additive flame (white-yellow core, orange body, red tips), animated by flicker()
export const flames = [];
export function flame(scale = 1, tint = 0) {
  const g = new THREE.Group();
  const cols = tint ? [0x2a6cff, 0x7fb4ff, 0xe8f4ff] : [0xff3a08, 0xff8a1a, 0xfff0b0];
  const mk = (r, h, col, o) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); g.add(m); };
  mk(.32 * scale, .95 * scale, cols[0], .5); mk(.22 * scale, .72 * scale, cols[1], .72); mk(.11 * scale, .42 * scale, cols[2], .95);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: tint ? 0x8fbfff : 0xff9a40, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  s.scale.setScalar(2.4 * scale); s.position.y = .35 * scale; g.add(s);
  g.userData.ph = Math.random() * 10; flames.push(g); return g;
}
export function flicker(t, list = flames) { for (const f of list) { if (!f.parent || !f.visible) continue; const ph = f.userData.ph, k = 1 + Math.sin(t * 11 + ph) * .08 + Math.sin(t * 23 + ph * 2) * .05; f.scale.set(1 + Math.sin(t * 7 + ph) * .05, k, 1 + Math.cos(t * 9 + ph) * .05); f.rotation.y = t * .6 + ph; } }
// procedural lumen-stone crystal cluster (the stub can't wait for models): pale blue-white, bloom does the glow
export function crystalGeo() {
  const parts = []; const rs = [[0, 0, 0, .16, .78, 0], [.12, 0, .05, .1, .5, .35], [-.11, 0, .04, .09, .44, -.4], [.03, 0, -.12, .08, .38, .2]];
  for (const [x, y, z, r, h, lean] of rs) { const c = new THREE.ConeGeometry(r, h * .62, 6).translate(0, h * .69, 0), b = new THREE.CylinderGeometry(r, r * .8, h * .38, 6).translate(0, h * .19, 0); for (const g of [c, b]) { g.rotateZ(lean * .5); g.rotateX(lean * .3); g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); } }
  const out = new THREE.BufferGeometry(); let n = 0; for (const g of parts) n += g.attributes.position.count; const pos = new Float32Array(n * 3); let o = 0; for (const g of parts) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
}
export const crystalMat = () => new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x6fb2ff, emissiveIntensity: 1.6, roughness: .15, metalness: 0, flatShading: true, transparent: true, opacity: .92 });
// Ledger veins: branching glowing cracks drawn into a canvas (additive decals on stone); one texture, many uses
export function veinTex(seed = 7, w = 512, h = 512, col = '255,120,40') {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return canvasTex(w, h, (g) => { g.clearRect(0, 0, w, h); g.lineCap = 'round';
    const walk = (x, y, a, len, wd, depth) => { for (let i = 0; i < len; i++) { const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
        for (const [lw, al] of [[wd * 5, .08], [wd * 2.2, .35], [wd, 1]]) { g.strokeStyle = `rgba(${col},${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); }
        x = nx; y = ny; a += (r() - .5) * .9; wd *= .985; if (depth < 3 && r() < .07) walk(x, y, a + (r() < .5 ? -1 : 1) * (.6 + r() * .6), len * .5 | 0, wd * .7, depth + 1); } };
    for (let k = 0; k < 4; k++) walk(r() * w, r() * h, r() * 6.28, 40 + r() * 30 | 0, 2.2, 0); });
}
export function stoneColors(g, base = [.78, .74, .68], k = .1) {   // vertex tint jitter so repeated blocks don't read flat
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const h = Math.sin(p.getX(i) * 12.9 + p.getY(i) * 78.2 + p.getZ(i) * 37.7) * 43758.5, f = 1 + (h - Math.floor(h) - .5) * k; c[i * 3] = base[0] * f; c[i * 3 + 1] = base[1] * f; c[i * 3 + 2] = base[2] * f; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
export function merge(list) {   // non-indexed merge (position/normal/uv/color when all have them)
  const gs = list.map(g => g.index ? g.toNonIndexed() : g); const names = ['position', 'normal', 'uv', 'color'].filter(a => gs.every(g => g.attributes[a]));
  const out = new THREE.BufferGeometry(); for (const a of names) { const sz = gs[0].attributes[a].itemSize; let n = 0; for (const g of gs) n += g.attributes[a].count; const arr = new Float32Array(n * sz); let o = 0; for (const g of gs) { arr.set(g.attributes[a].array, o); o += g.attributes[a].array.length; } out.setAttribute(a, new THREE.BufferAttribute(arr, sz)); }
  if (!out.attributes.normal) out.computeVertexNormals(); return out;
}
// pointed (gothic) arch outline, from left springing point to right, as [x,y] points (apex at x=0)
export function pointedArch(w, spring, apex, seg = 10) {
  const a = apex - spring, R = (w * w + a * a) / (2 * w), cx = -w + R, a0 = Math.PI, a1 = Math.atan2(a, -cx), pts = [];
  for (let i = 0; i <= seg; i++) { const t = a0 + (a1 - a0) * i / seg; pts.push([cx + Math.cos(t) * R, spring + Math.sin(t) * R]); }
  for (let i = seg - 1; i >= 0; i--) pts.push([-pts[i][0], pts[i][1]]);
  return pts;
}
// an arch frame: rectangle (ow x oh) with a pointed-arch hole (w half-span, spring, apex), extruded `depth` (centred on z=0)
export function archFrame(ow, oh, w, spring, apex, depth, seg = 10) {
  const sh = new THREE.Shape(); sh.moveTo(-ow / 2, 0); sh.lineTo(-w, 0); for (const [x, y] of pointedArch(w, spring, apex, seg)) sh.lineTo(x, y); sh.lineTo(w, 0); sh.lineTo(ow / 2, 0); sh.lineTo(ow / 2, oh); sh.lineTo(-ow / 2, oh); sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -depth / 2);
}
// fluted column shaft (radius r, height h), 16 flutes
export function flutedShaft(r, h, flutes = 16, seg = 48) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, seg, 1, true); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 - .045 * Math.max(0, Math.cos(a * flutes)); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals(); return g.translate(0, h / 2, 0);
}
let texLoader = null; const texCache = new Map();
export function loadTex(url, srgb = true, rep = true) {
  const key = url + srgb; if (texCache.has(key)) return texCache.get(key);
  texLoader = texLoader || new THREE.TextureLoader();
  const t = texLoader.load(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; texCache.set(key, t); return t;
}
export const ASSET = 'assets/underground/';

// ---------------------------------------------------------------- the city entrance (the only thing drawn at startup)
const EN = { mats: [], flames: [], crystals: [], glow: null, portal: null };
function portalMat(col1 = 0xff3a0a, col2 = 0xffc060) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide,
    uniforms: { t: { value: 0 }, c1: { value: new THREE.Color(col1) }, c2: { value: new THREE.Color(col2) }, a: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float t,a;uniform vec3 c1,c2;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,s=.5;for(int i=0;i<4;i++){v+=n(p)*s;p*=2.03;s*=.5;}return v;}
      void main(){vec2 q=vUv*2.-1.;q.y*=.82;float r=length(q),ang=atan(q.y,q.x);
        float sw=fbm(vec2(ang*1.6+r*5.-t*1.3,r*3.-t*.7))+.5*fbm(vec2(ang*3.2-t*2.,r*7.));
        float core=smoothstep(.9,.0,r);float m=clamp(sw*core*1.6,0.,1.);
        vec3 col=mix(c1*.55,c1,m);col=mix(col,c2,pow(m,2.5));col+=c2*pow(core,6.)*.8;
        float edge=smoothstep(1.,.78,r);gl_FragColor=vec4(col*(.55+.7*a),edge*a*(.55+.45*m));}` });
}
export { portalMat };
const SC = 1.25;   // entrance scale (colliders + chip spots follow)
function buildEntrance(lot) {
  const c = C(), root = new THREE.Group(); root.name = 'undercroft-entrance'; root.position.set(lot.x, 0, lot.z); root.rotation.y = lot.yaw; root.scale.setScalar(SC); c.S.add(root);
  const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86, metalness: 0, color: 0xffffff });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1412, roughness: .95 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: .55, metalness: .7 });
  EN.mats.push(stone, dark, iron); EN.stone = stone;
  const parts = [], B = (w, h, d, x, y, z, col) => parts.push(stoneColors(worldUV(new THREE.BoxGeometry(w, h, d).translate(x, y, z), 2.2), col || [.82, .78, .71], .12));
  // front: three steps up to a landing, then the stair falls away between two balustrade walls toward the crypt door
  for (let i = 0; i < 3; i++) B(5.2 - i * .2, .3 * (i + 1), .5, 0, .15 * (i + 1), 5.6 - i * .5);
  B(5.6, .9, 1.4, 0, .45, 3.9);
  for (let i = 0; i < 6; i++) { const y = .75 - i * .13; B(3.6, .12, .9, 0, y - .06, 2.75 - i * .9, [.7, .66, .6]); }   // descending treads
  B(3.6, .02, 6, 0, .01, -.4, [.3, .26, .24]);
  for (const s of [-1, 1]) {
    B(.9, 1.5, 8.6, s * 2.25, .75, .3); B(1.1, .22, 8.8, s * 2.25, 1.6, .3, [.88, .84, .77]);           // balustrade wall + coping
    B(1.5, .7, 1.5, s * 3.3, .35, 4.3); B(1.2, .3, 1.2, s * 3.3, 4.75, 4.3, [.88, .84, .77]);            // pillar base + abacus
    B(1.1, .45, 1.1, s * 3.3, 4.4, 4.3, [.86, .82, .75]);
  }
  // the crypt head: a heavy pointed-arch facade over the door
  const fac = stoneColors(worldUV(archFrame(7.4, 5.2, 1.5, 2.3, 3.5, 1.4).translate(0, 0, -3.6), 2.2), [.8, .76, .7], .12); parts.push(fac);
  B(7.8, .5, 2.6, 0, 5.45, -3.6, [.88, .84, .77]); B(7.4, 5.2, 2.2, 0, 2.6, -5.5, [.62, .58, .54]);
  // stepped archivolt (a second, recessed pointed arch), gable, buttresses and corner pinnacles: no flat box silhouettes
  parts.push(stoneColors(worldUV(archFrame(4.6, 4.4, 1.5, 2.3, 3.5, .5, 12).translate(0, 0, -2.75), 1.6), [.9, .86, .79], .1));
  { const gs = new THREE.Shape(); gs.moveTo(-4, 0); gs.lineTo(0, 2.6); gs.lineTo(4, 0); gs.closePath(); parts.push(stoneColors(worldUV(new THREE.ExtrudeGeometry(gs, { depth: 4.4, bevelEnabled: false }).translate(0, 5.7, -6.6), 2), [.84, .8, .73], .1)); }
  { const gs = new THREE.Shape(); gs.moveTo(-3.2, 0); gs.lineTo(0, 2.0); gs.lineTo(3.2, 0); gs.closePath(); parts.push(stoneColors(worldUV(new THREE.ExtrudeGeometry(gs, { depth: .35, bevelEnabled: false }).translate(0, 5.7, -2.25), 1.6), [.92, .88, .81], .08)); }
  for (const s of [-1, 1]) {
    const bt = new THREE.Shape(); bt.moveTo(0, 0); bt.lineTo(1.3, 0); bt.lineTo(.35, 5.4); bt.lineTo(0, 5.4); bt.closePath(); const bg = new THREE.ExtrudeGeometry(bt, { depth: 1, bevelEnabled: false }).translate(0, 0, -.5); if (s < 0) bg.scale(-1, 1, 1); bg.translate(s * 3.7, 0, -4.2); parts.push(stoneColors(worldUV(bg, 2), [.78, .74, .68], .12));
    parts.push(stoneColors(worldUV(new THREE.ConeGeometry(.55, 2.2, 4).rotateY(Math.PI / 4).translate(s * 3.75, 6.8, -3.6), 1.2), [.9, .86, .79], .08));
    parts.push(stoneColors(worldUV(new THREE.ConeGeometry(.5, 1.5, 4).rotateY(Math.PI / 4).translate(s * 3.3, 5.65, 4.3), 1.2), [.9, .86, .79], .08));
  }
  const g = merge(parts); const mesh = new THREE.Mesh(g, stone); root.add(mesh);
  // fluted pillars (separate: they get the shaft geometry)
  const sh = new THREE.Mesh(flutedShaft(.42, 3.5), new THREE.MeshStandardMaterial({ color: 0xd9d1c4, roughness: .8 })); EN.mats.push(sh.material);
  for (const s of [-1, 1]) { const m = sh.clone(); m.position.set(s * 3.3, .7, 4.3); root.add(m); }
  // door: dark recess + swirling ember portal inside the arch
  const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), dark); door.position.set(0, 1.75, -4.35); root.add(door);
  EN.portal = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 3.4), portalMat()); EN.portal.position.set(0, 1.7, -4.25); root.add(EN.portal);
  // lumen crystals on the pillars, ember braziers on the walls, a sign stone over the arch
  const cg = crystalGeo(), cm = crystalMat(); EN.mats.push(cm);
  for (const s of [-1, 1]) { const cr = new THREE.Mesh(cg, cm); cr.scale.setScalar(1.6); cr.position.set(s * 3.3, 6.3, 4.3); root.add(cr); EN.crystals.push(cr);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x9fd0ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); gl.scale.setScalar(3.6); gl.position.set(s * 3.3, 6.9, 4.3); root.add(gl); EN.mats.push(gl.material);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.42, .22, .3, 10), iron); bowl.position.set(s * 2.25, 1.88, -2.6); root.add(bowl);
    const f = flame(.85); f.position.set(s * 2.25, 2.0, -2.6); root.add(f); EN.flames.push(f); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#d8cfbf'; x.fillRect(0, 0, w, h); for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(60,40,30,${Math.random() * .12})`; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }
      x.strokeStyle = '#8a6a4a'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); x.textAlign = 'center'; x.fillStyle = '#3a2416'; x.font = '700 64px Georgia,serif'; x.fillText('UNDERCROFT', w / 2, 120); x.font = 'italic 30px Georgia,serif'; x.fillStyle = '#7a3a18'; x.fillText('Ember Crossroads · Eternal Grind', w / 2, 190); }), roughness: .9, emissive: 0x2a1408, emissiveIntensity: .4 }));
  sign.position.set(0, 6.35, -2.05); sign.scale.setScalar(.95); root.add(sign); EN.mats.push(sign.material);
  // ledger veins: glowing cracks down the facade and along the treads
  const vt = veinTex(19); const vm = new THREE.MeshBasicMaterial({ map: vt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0xff7a2a }); EN.mats.push(vm); EN.veinMat = vm;
  const v1 = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 5), vm); v1.position.set(0, 2.6, -2.88); root.add(v1);
  const v2 = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6), vm); v2.rotation.x = -Math.PI / 2; v2.position.set(0, .04, -.4); root.add(v2);
  // ember glow rising out of the stairwell
  EN.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff5a1a, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); EN.glow.scale.set(6, 4, 1); EN.glow.position.set(0, 1.2, -3); root.add(EN.glow); EN.mats.push(EN.glow.material);
  // colliders (City circles): balustrades, facade, pillars — the stair mouth stays open
  const loc = (lx, lz) => { lx *= SC; lz *= SC; const s = Math.sin(lot.yaw), co = Math.cos(lot.yaw); return { x: lot.x + lx * co + lz * s, z: lot.z - lx * s + lz * co }; };
  for (const s of [-1, 1]) { for (let z = -3.5; z <= 4.2; z += 1.1) { const p = loc(s * 2.25, z); c.colliders.push({ x: p.x, z: p.z, r: .7 * SC, h: 1.7 * SC, ug: 1 }); } const p = loc(s * 3.3, 4.3); c.colliders.push({ x: p.x, z: p.z, r: .85 * SC, h: 5, ug: 1 }); }
  for (let x = -3.2; x <= 3.21; x += 1.6) { const p = loc(x, -4.6); c.colliders.push({ x: p.x, z: p.z, r: 1.1 * SC, h: 8, ug: 1 }); }
  G.door = loc(0, 6.2); G.doorChip = loc(0, 3.2); G.out = loc(0, 9); G.loc = loc;
  return root;
}
function texturize() {   // once you're near: swap the entrance's vertex-coloured stone for the real pale sandstone (512 px, lazy)
  if (G.texReq) return; G.texReq = true;
  const m = EN.stone, map = loadTex(ASSET + 'tex/white_sandstone_blocks_02_diff-512.webp'); m.map = map; m.color.set(0xf2ece2); m.needsUpdate = true;
}

// ---------------------------------------------------------------- compact world chip (same look as the Estates door chip)
const css = `
#bcUgChip{position:fixed;z-index:1180;display:none;transform:translate(-50%,-110%);pointer-events:none;max-width:min(230px,72vw)}
#bcUgChip .c{display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 5px 5px;border-radius:16px;background:#12161cf2;border:1px solid #9fd0ff88;box-shadow:0 4px 14px #0007;color:#f0ecf8;font:11px/1.2 system-ui,sans-serif}
#bcUgChip .t{max-width:210px;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e6f2ff;font-weight:600;letter-spacing:.02em}
#bcUgChip .k{padding:1px 7px;border-radius:999px;background:#3a1a12e8;border:1px solid #ffb08999;color:#ffe7d4;font:700 9px/1.4 system-ui;letter-spacing:.08em;text-transform:uppercase}
#bcUgChip .r{display:flex;gap:4px}
#bcUgChip button{pointer-events:auto;min-width:44px;min-height:40px;padding:0 11px;border:1px solid #ffb45b88;border-radius:999px;background:#2a2118;color:#fff3e3;font:700 12px system-ui;cursor:pointer}
#bcUgChip button.p{background:#ffb45b;color:#241508;border-color:#ffe0b4}
#bcUgVeil{position:fixed;inset:0;z-index:4000;display:flex;align-items:flex-end;justify-content:center;background:#050302 url(${ASSET}veil.webp) center/cover no-repeat;transition:opacity .6s;color:#f1e6d4;font-family:Georgia,'Times New Roman',serif}
#bcUgVeil::before{content:'';position:absolute;inset:0;background:linear-gradient(#0008,#0003 40%,#000d 85%)}
#bcUgVeil.out{opacity:0;pointer-events:none}
#bcUgVeil .b{position:relative;text-align:center;padding:0 24px calc(48px + env(safe-area-inset-bottom));max-width:520px}
#bcUgVeil .tt{font-size:28px;letter-spacing:.22em;font-variant:small-caps;color:#ffe2bf;text-shadow:0 0 18px #ff6a1a88}
#bcUgVeil .st{font-size:14px;letter-spacing:.12em;color:#9fd0ff;margin-top:4px}
#bcUgVeil .lo{font-style:italic;font-size:14px;color:#e8dccb;margin:14px 0 12px;opacity:.9}
#bcUgVeil .bar{height:4px;border-radius:4px;background:#ffffff1c;overflow:hidden;margin:0 auto;width:min(320px,70vw)}
#bcUgVeil .bar>b{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff5a1a,#ffd28a);transition:width .25s}
body.ug-in #minimap,body.ug-in #mm,body.ug-in #labels,body.ug-in .bc-city-only{visibility:hidden}`;
const chip = { el: null, world: null, key: '', acts: [] };
function chipEl() {
  if (chip.el) return chip.el; const el = document.createElement('div'); el.id = 'bcUgChip'; el.setAttribute('role', 'group'); document.body.append(el); chip.el = el; return el;
}
export function chipSet(id, { x, y = 1.6, z, title = '', kicker = '', actions = [] }) {
  const el = chipEl(); chip.world = { x, y, z }; chip.acts = actions; if (chip.key === id) return; chip.key = id;
  el.replaceChildren(); const c = document.createElement('div'); c.className = 'c';
  if (kicker) { const k = document.createElement('div'); k.className = 'k'; k.textContent = kicker; c.append(k); }
  if (title) { const t = document.createElement('div'); t.className = 't'; t.textContent = title; c.append(t); }
  const r = document.createElement('div'); r.className = 'r';
  for (const a of actions) { const b = document.createElement('button'); b.type = 'button'; if (a.primary) b.className = 'p'; b.textContent = (a.icon ? a.icon + ' ' : '') + a.label; b.setAttribute('aria-label', a.label); b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); a.run && a.run(); }); b.addEventListener('pointerdown', ev => ev.stopPropagation()); r.append(b); }
  c.append(r); el.append(c);
}
export function chipHide() { chip.key = ''; chip.world = null; chip.acts = []; if (chip.el) { chip.el.style.display = 'none'; chip.el.replaceChildren(); } }
const _v = new THREE.Vector3();
function chipTick() {
  const el = chip.el; if (!el || !chip.world) return; const c = C(), w = innerWidth, h = innerHeight;
  _v.set(chip.world.x, chip.world.y, chip.world.z).project(c.C);
  if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.15 || _v.y > 1.15 || G.modal) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.left = Math.max(12, Math.min(w - 12, (_v.x * .5 + .5) * w)) + 'px'; el.style.top = Math.max(60, Math.min(h - 12, (-_v.y * .5 + .5) * h)) + 'px';
}
export function chipPrimary() { const a = chip.acts.find(a => a.primary) || chip.acts[0]; if (a && chip.el && chip.el.style.display === 'block') { a.run && a.run(); return true; } return false; }

// ---------------------------------------------------------------- veil
let veil = null;
const LORE = ['Beneath the ash, the old ledgers still burn.', 'The lumen stones were cut before the city had a name.', 'Every vein of fire in these walls remembers a coin that burned.', 'The Gate does not open. It is opened.', 'Mind the drip. The deep keeps its own count.', 'The pale builders left no names, only light.'];
export function showVeil(title, sub, line) {
  if (veil) veil.remove(); veil = document.createElement('div'); veil.id = 'bcUgVeil'; veil.setAttribute('role', 'progressbar'); veil.setAttribute('aria-label', 'Loading ' + title);
  veil.innerHTML = '<div class="b"><div class="tt"></div><div class="st"></div><div class="lo"></div><div class="bar"><b></b></div></div>';
  veil.querySelector('.tt').textContent = title; veil.querySelector('.st').textContent = sub; veil.querySelector('.lo').textContent = line || LORE[Math.floor(Math.random() * LORE.length)];
  veil.addEventListener('pointerdown', e => e.stopPropagation()); document.body.append(veil); G.veilP = 0;
}
export function veilProgress(p) { if (!veil) return; G.veilP = p; veil.querySelector('.bar>b').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; }
export function hideVeil() { const v = veil; veil = null; if (!v) return; v.classList.add('out'); setTimeout(() => v.remove(), 700); }

// ---------------------------------------------------------------- city off / on (never destroys anything: hide + pause + stash, restored exactly)
const CO = { off: false, hid: [], stash: [], lights: [], bg: null, far: 0 };
const keepObj = o => o.isCamera || o === C().avatar || (o.userData && (o.userData.peer || o.userData.ugKeep));
function cityOff() {
  if (CO.off) return; const c = C(); CO.off = true; CO.hid = []; CO.lights = [];
  for (const o of c.S.children) { if (o.isLight) { if (o.visible) { o.visible = false; CO.lights.push(o); } continue; } if (o.visible && !keepObj(o)) { o.visible = false; CO.hid.push(o); } }
  CO.stash = c.colliders.splice(0, c.colliders.length);
  CO.bg = c.S.background; CO.far = c.C.far; c.C.far = 260; c.C.updateProjectionMatrix(); c.S.background = new THREE.Color(0x070504);
  window.__cityPaused = true; window.__exploreLim = 1995; document.body.classList.add('ug-in');
}
function cityOn() {
  if (!CO.off) return; const c = C(); CO.off = false;
  for (const o of CO.hid) o.visible = true; for (const o of CO.lights) o.visible = true; CO.hid = []; CO.lights = [];
  const extra = c.colliders.splice(0, c.colliders.length).filter(o => !o.ugHub);   // keep anything another module added while we were below
  c.colliders.push(...CO.stash, ...extra); CO.stash = [];
  c.S.background = CO.bg; if (CO.far) { c.C.far = CO.far; c.C.updateProjectionMatrix(); }
  window.__cityPaused = false; delete window.__exploreLim; document.body.classList.remove('ug-in');
}
function travelLock(on) { try { if (window.__wildsTravelLock) window.__wildsTravelLock(!!on); } catch (e) { G.err = 'travelLock ' + e; } }

// ---------------------------------------------------------------- the hub (underground-hub.js, lazy)
function prefetch() {
  if (!G.p) G.p = import('./underground-hub.js').then(m => { G.mod = m; return m; }).catch(e => { G.p = null; G.err = String(e).slice(0, 300); throw e; });
  return G.p;
}
function myPos() { const c = C(); return c.getMode() === 'explore' ? c.P.pos : c.C.position; }
function place(spot) {
  const c = C(), P = c.P, [x, z] = toWorld(spot.x, spot.z); P.pos.set(x, floorLocal(spot.x, spot.z) + .02, z); P.vel.set(0, 0, 0); G.prev = null;
  if (spot.face) c.input.yp.yaw = Math.atan2(-(spot.face.x - spot.x), -(spot.face.z - spot.z));
  c.C.position.set(x - Math.sin(c.input.yp.yaw) * -6, P.pos.y + 3, z - Math.cos(c.input.yp.yaw) * -6);
}
const api = { exit: () => exit(), launch: k => launchEG(k), chipHide, toast: (t) => window.__bcToast && window.__bcToast(t, '#9fd0ff'), setModal: m => { G.modal = m; }, get modal() { return G.modal; } };
async function enter(spotName = 'arrive') {
  if (G.active || G.busy || !ENABLED) return false; const c = C(); if (!c) return false;
  if (window.__estatesIslandLive && window.__estatesIslandLive.active) return false;
  G.busy = true; G.modal = 'loading'; chipHide(); travelLock(true); if (c.getMode() !== 'explore') window.__setBurnMode && window.__setBurnMode('explore');
  showVeil('The Undercroft', 'Ember Crossroads · gateway to the Eternal Grind'); veilProgress(.05); const t0 = performance.now();
  try {
    let fake = .05; const tick = setInterval(() => { fake = Math.min(.25, fake + .02); if (G.veilP < fake) veilProgress(fake); }, 120);
    const m = await prefetch(); clearInterval(tick); veilProgress(.28);
    if (!m.isLoaded()) { await m.load(p => veilProgress(.28 + p * .66), api); G.loads++; }
    veilProgress(1); await new Promise(r => setTimeout(r, 180));
    cityOff(); m.enter(); place(SPOTS[spotName] || SPOTS.arrive); G.active = true; G.trips++; G.leftAt = 0; G.enterMs = Math.round(performance.now() - t0);
    hideVeil(); G.modal = null;
    setTimeout(() => api.toast(spotName === 'fromGate' ? 'Back in the Ember Crossroads. The Gate hums behind you.' : spotName === 'fromRuin' ? 'Back up the Ember Stair. Cinder-Scribe Varro looks up from his chronicle.' : 'THE UNDERCROFT · Ember Crossroads. The Descent Gate lies north; the Ledger of Deeds east.'), 500);
  } catch (e) { G.err = 'enter ' + String(e && e.stack || e).slice(0, 400); console.warn('undercroft', e); abort(); }
  G.busy = false; return G.active;
}
function abort() {   // never strand anyone: city back on, standing at the entrance
  try { if (G.mod && G.mod.isLoaded()) G.mod.leave(); } catch (e) { }
  G.active = false; cityOn(); travelLock(false); hideVeil(); G.modal = null; chipHide();
  const c = C(); if (c && inUndercroft(c.P.pos.x, c.P.pos.z) && G.out) { c.P.pos.set(G.out.x, 0, G.out.z); c.P.vel.set(0, 0, 0); }
}
function exit() {
  if (!G.active || G.busy) return; G.busy = true; G.modal = 'loading'; chipHide(); showVeil('Burn City', 'Up the stair, into the open air', 'The ash settles behind you.'); veilProgress(.6);
  setTimeout(() => {
    try { G.mod.leave(); } catch (e) { G.err = 'leave ' + e; }
    G.active = false; cityOn(); travelLock(false);
    const c = C(), P = c.P; P.pos.set(G.out.x, 0, G.out.z); P.vel.set(0, 0, 0); c.input.yp.yaw = G.lot.yaw + Math.PI;   // facing back toward town
    G.leftAt = performance.now(); G.quietUntil = performance.now() + 4000; veilProgress(1); hideVeil(); G.modal = null; G.busy = false;
  }, 450);
}
function launchEG(kind = 'gate') {
  if (G.busy) return; G.busy = true; G.modal = 'loading'; chipHide();
  if (kind === 'ruin') {   // the Undercroft RPG: its own lazy page, returns to ?crossroads=ruin
    showVeil('Ruins of Vael Ithren', 'Down the Ember Stair', 'Cold air, old stone, and a light that should not still be burning.'); veilProgress(.4);
    setTimeout(() => veilProgress(.9), 350); setTimeout(() => { location.href = 'undercroft/?from=crossroads'; }, 900); return;
  }
  showVeil('The Eternal Grind', kind === 'side' ? 'Down the Ember Stair' : 'Through the Descent Gate', 'Fire takes the threshold. Something below takes notice.'); veilProgress(.4);
  try { G.mod && G.mod.sfxGate && G.mod.sfxGate(); } catch (e) { }
  setTimeout(() => veilProgress(.9), 350);
  setTimeout(() => { location.href = 'dungeon/?from=crossroads' + (kind === 'side' ? '&via=ember-stair' : ''); }, 900);
}
function unloadHub() { if (!G.mod || !G.mod.isLoaded() || G.active) return; try { G.mod.unload(); } catch (e) { G.err = 'unload ' + e; } G.unloads++; G.leftAt = 0; }

// ---------------------------------------------------------------- per frame
function wrapHooks() {
  // other players: only draw peers in the same realm as me (Glassroot Grove's check keeps working underneath)
  if (window.__peerRealm !== G.pr) { const prev = window.__peerRealm; G.pr = (x, z) => { const q = myPos(); if (inUndercroft(x, z) !== inUndercroft(q.x, q.z)) return false; return prev ? prev(x, z) : true; }; window.__peerRealm = G.pr; }
  // floor heights in the hub (sunken plaza + steps) through the City's deck hook
  if (window.__deckAt !== G.deck) { const prev = window.__deckAt; G.deck = (x, z) => { if (inUndercroft(x, z)) { const [lx, lz] = toLocal(x, z); return floorLocal(lx, lz); } return prev ? prev(x, z) : null; }; window.__deckAt = G.deck; }
}
function frame(dt, t) {
  const c = C(); if (!c) return; wrapHooks();
  const P = c.P, explore = c.getMode() === 'explore';
  flicker(t, EN.flames); if (EN.portal) EN.portal.material.uniforms.t.value = t; if (EN.veinMat) EN.veinMat.opacity = .55 + .35 * Math.sin(t * 1.3);
  for (const cr of EN.crystals) cr.rotation.y = t * .25;
  if (G.active) {
    if (CO.off) window.__cityPaused = true;   // the Wilds safety net clears this flag whenever its own deep area is off; re-assert while we're below
    if (!inUndercroft(P.pos.x, P.pos.z) && !G.busy) { abort(); return; }   // teleported out by anything else
    // walls: keep the body inside the walkable halls (slide along them)
    const [lx, lz] = toLocal(P.pos.x, P.pos.z);
    if (explore) { const pv = G.prev || [lx, lz]; const s = slideLocal(pv[0], pv[1], lx, lz, .5); if (s) { if (s[0] !== lx || s[1] !== lz) { const [wx, wz] = toWorld(s[0], s[1]); P.pos.x = wx; P.pos.z = wz; } G.prev = s; } else { place(SPOTS.arrive); } }
    // camera: stay inside the stone (pull in toward the player) and under the vault
    if (explore) { const cam = c.C.position, [cx, cz] = toLocal(cam.x, cam.z), [px, pz] = G.prev || [lx, lz];
      if (!walkableLocal(cx, cz, .7)) { let lo = 0, hi = 1; for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (walkableLocal(px + (cx - px) * m, pz + (cz - pz) * m, .7)) lo = m; else hi = m; } const [wx, wz] = toWorld(px + (cx - px) * lo, pz + (cz - pz) * lo); cam.x = wx; cam.z = wz; }
      const [qx, qz] = toLocal(cam.x, cam.z), r = Math.hypot(qx, qz), ceil = r < L.GALLERY_R ? 12 : (Math.abs(qx) < L.HALL_HW + .1 || Math.abs(qz) < L.HALL_HW + .1) && r < L.HALL_OUT ? 1.8 + L.HALL_APEX - .9 : 9; if (cam.y > ceil) cam.y = ceil; }
    try { G.mod.frame(dt, t, lx, lz); } catch (e) { if (!G.ferr) { G.ferr = String(e && e.stack || e).slice(0, 400); console.warn('undercroft frame', e); } }
    // interactables -> chip
    let best = null, bd = 1e9; if (!G.modal && explore) for (const it of G.mod.interactables()) { const d = Math.hypot(lx - it.x, lz - it.z); if (d < it.r && d < bd) { bd = d; best = it; } }
    if (best) { const [wx, wz] = toWorld(best.x, best.z); chipSet(best.id, { x: wx, y: (best.y || 2.2), z: wz, title: best.title, kicker: best.kicker, actions: best.actions }); } else if (chip.key) chipHide();
    chipTick(); return;
  }
  if (G.mod && G.mod.isLoaded() && G.leftAt && performance.now() - G.leftAt > UNLOAD_S * 1000) unloadHub();
  if (!G.root || !G.door) return;
  // near the entrance: texture the stone, prefetch the hub, show the chip
  const q = explore ? P.pos : c.C.position, d = Math.hypot(q.x - G.door.x, q.z - G.door.z);
  if (d < 320) texturize(); G.root.visible = !window.__cityPaused;
  if (explore && d < PREFETCH_M && !G.p) prefetch().catch(() => { });
  if (explore && !G.modal && !G.busy && d < 5.2 && !(G.quietUntil > performance.now()) && Math.abs(P.pos.y) < 2.5) {
    chipSet('enter', { x: G.doorChip.x, y: 3.2, z: G.doorChip.z, kicker: 'Underground', title: 'The Undercroft', actions: [{ label: 'Enter', icon: '⬇', primary: true, run: () => enter('arrive') }] });
    chipTick();
  } else if (chip.key) chipHide();
}

// ---------------------------------------------------------------- boot
(function wait(n = 0) {
  if (!ENABLED) return;
  const c = C();
  if (!(window.__ready && c && c.colliders && c.S && c.streets && c.N && c.P)) { if (n < 400) setTimeout(() => wait(n + 1), 400); return; }
  try {
    const st = document.createElement('style'); st.id = 'bcUgCss'; st.textContent = css; document.head.append(st);
    const nodes = Object.values(c.N);
    const avoid = [{ x: 0, z: 394, r: 40 }];   // the Wilds trailhead
    if (window.__emberBarBuilding && window.__emberBarBuilding.lot) avoid.push({ x: window.__emberBarBuilding.lot.x, z: window.__emberBarBuilding.lot.z, r: 14 });
    G.lot = entranceLot({ colliders: c.colliders, streets: c.streets, nodes, avoid });
    if (!G.lot) { G.err = 'no lot'; return; }
    G.root = buildEntrance(G.lot);
    (window.__preRender = window.__preRender || []).push((dt, t) => { try { frame(dt, t); } catch (e) { if (!G.ferr2) { G.ferr2 = String(e && e.stack || e).slice(0, 400); console.warn('undercroft', e); } } });
    addEventListener('keydown', e => { if (e.code !== 'KeyE' || e.repeat || /INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return; if ((G.active || chip.key === 'enter') && !G.modal && chipPrimary()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    (window.__mmHooks = window.__mmHooks || []).push((mm, sc, cw) => { const px = G.lot.x * sc, pz = G.lot.z * sc; mm.save(); mm.shadowColor = '#9fd0ff'; mm.shadowBlur = 8; mm.fillStyle = '#cfe6ff'; mm.beginPath(); mm.arc(px, pz, Math.max(2.5, 4 * sc), 0, 7); mm.fill(); mm.restore(); mm.fillStyle = '#d8ecff'; mm.font = Math.round(cw / 30) + 'px system-ui'; mm.textAlign = 'center'; mm.fillText('Undercroft', px, pz + 12); });
    (window.__tourHooks = window.__tourHooks || []).push(V3 => { const cam = G.loc(-6, 16); return [V3(cam.x, 5, cam.z), V3(G.lot.x, 2.5, G.lot.z), 'The Undercroft: a pale-stone stair down to the Ember Crossroads, the social hub beneath the city and the way into the Eternal Grind']; });
    G.state = 'ready';
    if (Q.get('crossroads') === 'ruin') { try { const u = new URL(location.href); u.searchParams.delete('crossroads'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { } setTimeout(() => enter('fromRuin'), 600); }
    else if (Q.get('crossroads') === '1') { try { const u = new URL(location.href); u.searchParams.delete('crossroads'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { } setTimeout(() => enter('fromGate'), 600); }
  } catch (e) { G.err = String(e && e.stack || e).slice(0, 400); console.warn('undercroft gate', e); }
})();
const spot = () => G.lot && G.out ? { x: G.out.x, z: G.out.z, face: { x: G.lot.x, z: G.lot.z } } : null;
const face = () => { const c = C(), sp = spot(); if (!c || !sp) return; c.input.yp.yaw = Math.atan2(-(sp.face.x - sp.x), -(sp.face.z - sp.z)); if (c.avatar) c.avatar.rotation.y = c.input.yp.yaw; };
window.__undercroft = { get active() { return G.active; }, get ready() { return G.state === 'ready'; }, spot, face, enter: () => enter('arrive') };
if (TEST) Object.assign(window.__undercroft, { G, enter, exit, abort, unloadHub, prefetch, launchEG, place, cityOff, cityOn, CO, chip, lot: () => G.lot });
