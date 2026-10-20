// BURN City: The Wilds — milestone 1: the Cinderwilds forest at the north edge of the city.
// One expansion inside the existing city (same renderer, scene, Explore controller, colliders/groundAt, input):
//  - forest region north of town: instanced trees/rocks/ferns/grass (wind + the grass bends around you), a creek,
//    fallen logs, glowing fungi, fireflies, falling leaves, light shafts, forest fog that blends in as you walk in
//  - trailhead gate with the "WARNING PVP AND PVE AREA AHEAD. PROCEED?" prompt; main trail, markers and a return path
//  - roaming starter creatures (Mosskit, Cinderling, Rillfin, Shardmole) with procedural animation and simple ecology AI
//  - inspect -> Engage / Calm / Leave; turn-based encounter; Bind with shown odds + failure reasons
//  - roster + one following companion; player/companion XP HUD; Mara Venn at the ruined tram stop with two quests
//  - Derrik's forest + battle music with crossfades (wilds-audio.js)
// Save: localStorage only (see wilds-rules.js) — clearly labelled local-only in the UI.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGame } from './wilds-rules.js';
import { buildCreature, animate, mats } from './wilds-creatures.js';
import { buildWalker, poseWalker } from './walker.js';
import * as AUD from './wilds-audio.js';

const Q = new URLSearchParams(location.search);
const W = window.__wilds = { ready: false, inForest: false, modal: null, creatures: [], test: {} };
const C = () => window.__city;
// ---------------------------------------------------------------- layout (world metres; the city is south, -z)
export const FC = { x: 0, z: 625 }, RX = 255, RZ = 228;            // forest ellipse: z 397..853
const ell = (x, z) => Math.hypot((x - FC.x) / RX, (z - FC.z) / RZ);
const GATE = { x: 0, z: 394 }, TRAM = { x: -28, z: 452 }, FIRE = { x: -17, z: 444 }, MARA = { x: -19.5, z: 441.5 }, CLEAR = { x: 30, z: 630 };
const MAIN = [[0, 312], [0, 350], [0, 394], [4, 420], [-6, 440], [-8, 462], [2, 490], [12, 514], [2, 545], [-20, 566], [-16, 596], [8, 616], [30, 628]];
const RET = [[30, 628], [56, 612], [72, 578], [68, 534], [50, 494], [30, 456], [12, 420], [3, 400], [0, 394]];
const CREEK = [[-235, 512], [-150, 534], [-80, 520], [-30, 532], [8, 528], [52, 541], [110, 560], [170, 546], [240, 562]];
const MARKERS = [{ id: 'fernway_marker_1', x: 9, z: 498 }, { id: 'fernway_marker_2', x: -24, z: 560 }, { id: 'fernway_marker_3', x: 22, z: 622 }];
const SPAWNS = [
  { sp: 'mosskit', x: -32, z: 498, r: 26 }, { sp: 'mosskit', x: 24, z: 470, r: 22 }, { sp: 'mosskit', x: -44, z: 584, r: 28 },
  { sp: 'rillfin', x: -64, z: 524, r: 16, creek: 1 }, { sp: 'rillfin', x: 92, z: 553, r: 16, creek: 1 },
  { sp: 'cinderling', x: 96, z: 606, r: 30 }, { sp: 'cinderling', x: 118, z: 512, r: 26 },
  { sp: 'shardmole', x: -74, z: 646, r: 24 },
];
let rs = 9173; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;   // seeded: the forest is identical every load
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// polyline helpers (trails/creek sampled every ~1.5 m into a hash grid for fast distance queries)
function sampleLine(pts, step = 1.5) { const out = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)); for (let k = 0; k < n; k++) out.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]); } out.push(pts[pts.length - 1]); return out; }
function smooth(pts) { const v = pts.map(([x, z]) => new THREE.Vector3(x, 0, z)); const c = new THREE.CatmullRomCurve3(v, false, 'centripetal'); return c.getSpacedPoints(Math.ceil(c.getLength() / 2)).map(p => [p.x, p.z]); }
function lineGrid(pts) { const G = new Map(), CS = 8; for (const p of pts) { const k = Math.floor(p[0] / CS) + ',' + Math.floor(p[1] / CS); (G.get(k) || G.set(k, []).get(k)).push(p); }
  return (x, z, max = 12) => { let best = 1e9; const r = Math.ceil(max / CS); const cx = Math.floor(x / CS), cz = Math.floor(z / CS); for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) { const a = G.get((cx + i) + ',' + (cz + j)); if (a) for (const p of a) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < best) best = d; } } return Math.sqrt(best); }; }
const mainS = smooth(MAIN), retS = smooth(RET), creekS = smooth(CREEK);
const dTrail = lineGrid(sampleLine(mainS).concat(sampleLine(retS))), dCreek = lineGrid(sampleLine(creekS));
// obstacle grid (trees, rocks, logs, ruins) used by creature steering — same hashing idea as the skate spatial grid
const OB = new Map(), OCS = 8; const okey = (i, j) => i * 73856 + j;
function obAdd(o) { const i0 = Math.floor((o.x - o.r) / OCS), i1 = Math.floor((o.x + o.r) / OCS), j0 = Math.floor((o.z - o.r) / OCS), j1 = Math.floor((o.z + o.r) / OCS); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = okey(i, j); (OB.get(k) || OB.set(k, []).get(k)).push(o); } }
const obAt = (x, z) => OB.get(okey(Math.floor(x / OCS), Math.floor(z / OCS))) || [];
function addCollider(x, z, r, h, nc = true) { const c = { x, z, r, h, nc, wilds: 1 }; C().colliders.push(c); obAdd({ x, z, r }); return c; }

// ---------------------------------------------------------------- shared shader tweak: wind sway + bend-away-from-player
const UNI = { uT: { value: 0 }, uPl: { value: new THREE.Vector3(0, -99, 0) }, uSway: { value: 1 } };
function swayMat(mat, amp, push, key) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, UNI);
    sh.vertexShader = 'uniform float uT;uniform vec3 uPl;uniform float uSway;\n' + sh.vertexShader.replace('#include <project_vertex>', `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
 mvPosition = instanceMatrix * mvPosition;
#endif
{ float hh = clamp(position.y, 0.0, 1.0);
  float w = sin(uT*1.3 + mvPosition.x*.09 + mvPosition.z*.07)*.6 + sin(uT*2.9 + mvPosition.x*.31)*.25;
  mvPosition.x += w * hh * hh * ${amp.toFixed(3)} * uSway; mvPosition.z += w * .6 * hh * hh * ${amp.toFixed(3)} * uSway;
  ${push ? `vec2 d = mvPosition.xz - uPl.xz; float dl = length(d); float k = (1.0 - smoothstep(0.2, 1.5, dl)) * hh * step(abs(mvPosition.y - uPl.y), 2.0);
  mvPosition.xz += d / max(dl, .001) * k * .55; mvPosition.y -= k * .3;` : ''} }
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'wilds-' + key;
  return mat;
}
// vertex colour helpers
function colorize(g, fn) { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), c = new THREE.Color(); g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i), nr.getY(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const solid = (g, hex) => colorize(g, c => c.set(hex));
const jitter = (g, k) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const h = Math.sin(x * 41.3 + y * 17.1 + z * 29.7) * 43758.5; const f = 1 + (h - Math.floor(h) - .5) * k; p.setXYZ(i, x * f, y * (1 + (f - 1) * .5), z * f); } return g; };
const M = a => mergeGeometries(a.map(g => g.index ? g.toNonIndexed() : g), false);

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function signTex(lines, w = 512, h = 256, bg = '#2a1e14', fg = '#ffd9a0', border = '#ff7a1a') {
  return canvasTex(w, h, (g) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1 + Math.random() * 6); }
    g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16); g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length; lines.forEach((ln, i) => { const [txt, size, col] = Array.isArray(ln) ? ln : [ln, 48, fg]; g.font = `800 ${size}px system-ui,sans-serif`; g.fillStyle = col || fg; g.fillText(txt, w / 2, h * (i + 1) / (n + 1)); }); });
}

// ---------------------------------------------------------------- build the forest
let G = null, root, grassIM, fernIM, nearGroup, leaves, flies, shafts, creekMat, flames = [], beams = [], game, ui, maraRig, compMesh = null, compState = null, embers;
const DATA = {};
async function loadData() {
  const get = f => fetch('data/wilds/' + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  [DATA.creatures, DATA.quests, DATA.abilities] = await Promise.all([get('creatures.json'), get('quests.json'), get('abilities.json')]);
}
function tierN(lo, med, hi) { const t = C().TIER; return t === 'low' ? lo : t === 'medium' ? med : hi; }

function buildWorld() {
  const c = C(), S = c.S, { MAT, GLOW } = mats();
  root = new THREE.Group(); root.name = 'wilds'; S.add(root);
  nearGroup = new THREE.Group(); root.add(nearGroup);   // detail only drawn when the camera is near the forest

  // --- forest floor: one grid mesh with baked colour (moss / leaf litter / dirt trail / wet creek banks) + detail texture
  const detail = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 150 + Math.random() * 105 | 0; g.fillStyle = `rgb(${v},${v},${v})`; const s = 1 + Math.random() * 4; g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(Math.random() * 6.3); g.fillRect(-s, -s * .4, s * 2, s * .8); g.restore(); } });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.colorSpace = THREE.NoColorSpace;
  const STEP = tierN(4, 3, 2.5), X0 = -300, X1 = 300, Z0 = 300, Z1 = 880, nx = Math.round((X1 - X0) / STEP) + 1, nz = Math.round((Z1 - Z0) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), keep = new Uint8Array(nx * nz);
  const moss = new THREE.Color(0x24381a), litter = new THREE.Color(0x4a3420), dirt = new THREE.Color(0x6a5238), mud = new THREE.Color(0x2a2418), dark = new THREE.Color(0x0e1410), meadow = new THREE.Color(0x2e4a22), cc = new THREE.Color();
  const nse = (x, z) => Math.sin(x * .05 + Math.sin(z * .07) * 2) * .5 + Math.sin(z * .043 + x * .021) * .3 + Math.sin(x * .19 + z * .23) * .2;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = X0 + i * STEP, z = Z0 + j * STEP, e = ell(x, z) + nse(x * 1.7, z * 1.3) * .05, dt = dTrail(x, z), dc = dCreek(x, z);
    keep[k] = (e < 1.13 || (z > 344 && z < 420 && Math.abs(x) < 270) || (z < 400 && dt < 9)) ? 1 : 0;   // + a meadow strip between the last city block and the tree line
    pos[k * 3] = x; pos[k * 3 + 1] = .035; pos[k * 3 + 2] = z; uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
    cc.copy(moss).lerp(litter, clamp(.5 + nse(x, z) * .7, 0, 1));
    cc.lerp(mud, sstep(5, 1.5, dc) * .8); cc.lerp(dirt, sstep(2.8, 1, dt) * .95); cc.lerp(dark, sstep(1.02, 1.13, e) * (dt < 6 ? .3 : 1) * sstep(392, 430, z)); if (z < 410) cc.lerp(meadow, sstep(400, 372, z) * (1 - sstep(2.8, 1, dt)) * .7);
    col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
  }
  const idx = []; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, d = a + nx, e2 = d + 1; if (keep[a] || keep[b] || keep[d] || keep[e2]) idx.push(a, d, b, b, d, e2); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals();
  const floor = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: .95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); floor.renderOrder = -2; root.add(floor);

  // --- creek: animated water ribbon (custom shader with fog) + plank bridges where the trails cross
  creekMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uDay: { value: 0 } }]),
    vertexShader: `varying vec3 vW;varying vec2 vUv;\n#include <fog_pars_vertex>\nvoid main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mvPosition=viewMatrix*w;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uT,uDay;varying vec3 vW;varying vec2 vUv;\n#include <common>\n#include <fog_pars_fragment>\nfloat h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){vec2 q=vW.xz;float a=n(q*.55+vec2(uT*.7,uT*.25))*.6+n(q*1.7-vec2(uT*.9,-uT*.4))*.4;float sp=pow(n(q*3.1+vec2(uT*1.3,0.)),9.)*2.2;
vec3 deep=mix(vec3(.015,.05,.06),vec3(.07,.2,.21),uDay),sky=mix(vec3(.08,.13,.2),vec3(.55,.7,.72),uDay);vec3 col=mix(deep,sky,.18+.4*a)+sp*mix(vec3(.5,.7,.9),vec3(1.),uDay);
float e=abs(vUv.y-.5)*2.;float al=(1.-smoothstep(.55,1.,e))*.88;col=mix(col,vec3(.75,.8,.8)*(.3+uDay*.7),smoothstep(.62,.9,e)*.35*(.5+.5*sin(vUv.x*80.+uT*3.)));gl_FragColor=vec4(col,al);\n#include <fog_fragment>\n}` });
  { const pts = creekS, cp = [], cu = [], ci = []; let acc = 0; for (let i = 0; i < pts.length; i++) { const [x, z] = pts[i], [x2, z2] = pts[Math.min(pts.length - 1, i + 1)], [x0, z0] = pts[Math.max(0, i - 1)]; let dx = x2 - x0, dz = z2 - z0; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const w = 2.3 + Math.sin(i * .37) * .7; if (i) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      cp.push(x + dz * w, .07, z - dx * w, x - dz * w, .07, z + dx * w); cu.push(acc / 6, 0, acc / 6, 1); if (i) { const a = (i - 1) * 2; ci.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2)); g.setIndex(ci); const m = new THREE.Mesh(g, creekMat); m.renderOrder = 1; root.add(m); }
  for (const tr of [mainS, retS]) { // bridges where a trail meets the creek
    let best = null; for (let i = 1; i < tr.length; i++) { const d = dCreek(tr[i][0], tr[i][1]); if (tr[i][1] > 470 && tr[i][1] < 600 && (!best || d < best.d)) best = { d, i }; }
    if (best && best.d < 3) { const [x, z] = tr[best.i], [x2, z2] = tr[Math.min(tr.length - 1, best.i + 2)], yaw = Math.atan2(x2 - x, z2 - z); const planks = []; for (let k = -4; k <= 4; k++) planks.push(solid(new THREE.BoxGeometry(2.6, .12, .55).translate(0, .22, k * .66), k % 2 ? 0x5a4028 : 0x4e3622)); planks.push(solid(new THREE.BoxGeometry(.14, .14, 6.4).translate(1.25, .12, 0), 0x3a2818), solid(new THREE.BoxGeometry(.14, .14, 6.4).translate(-1.25, .12, 0), 0x3a2818));
      const b = new THREE.Mesh(M(planks), MAT); b.position.set(x, 0, z); b.rotation.y = yaw; root.add(b); for (const k of [-2.2, 0, 2.2]) addCollider(x + Math.sin(yaw) * k, z + Math.cos(yaw) * k, 1.5, .28, true); }
  }

  // --- trees: conifers + broadleaf + a few charred snags with ember seams (it IS the Cinderwilds). Unit-height geometry, scaled per instance.
  const conG = M([colorize(new THREE.CylinderGeometry(.018, .03, .32, 7).translate(0, .16, 0), c => c.set(0x3a2a1e)),
    ...[0, 1, 2, 3, 4].map(k => colorize(jitter(new THREE.ConeGeometry(.2 - k * .032, .3 - k * .025, 9, 2).translate(0, .26 + k * .14, 0), .12), (c, x, y) => c.setRGB(.09 + y * .05, .2 + y * .07, .1 + y * .02)))]);
  const leafG = M([colorize(new THREE.CylinderGeometry(.03, .05, .5, 7).translate(0, .25, 0), c => c.set(0x4a3626)), colorize(new THREE.CylinderGeometry(.012, .02, .3, 5).rotateZ(.8).translate(.09, .48, 0), c => c.set(0x4a3626)), colorize(new THREE.CylinderGeometry(.012, .02, .28, 5).rotateZ(-.9).translate(-.08, .5, .02), c => c.set(0x4a3626)),
    ...[[0, .72, 0, .26], [.16, .62, .05, .19], [-.15, .64, -.06, .2], [.04, .62, .17, .18], [-.03, .6, -.17, .18], [.02, .86, .02, .17]].map(([x, y, z, r]) => colorize(jitter(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), .25), (c, px, py, pz, ny) => c.setRGB(.12 + ny * .04, .25 + ny * .08 + py * .05, .08)))]);
  const snagG = M([colorize(new THREE.CylinderGeometry(.02, .045, .8, 7).translate(0, .4, 0), (c, x, y) => c.setRGB(.08, .065, .06)), colorize(new THREE.CylinderGeometry(.008, .016, .3, 5).rotateZ(1).translate(.1, .62, 0), c => c.setRGB(.08, .065, .06)), colorize(new THREE.CylinderGeometry(.008, .014, .22, 5).rotateZ(-1.1).translate(-.08, .5, 0), c => c.setRGB(.08, .065, .06))]);
  const emberG = M([0, 1, 2, 3].map(k => solid(new THREE.BoxGeometry(.006, .09, .004).translate(0, .14 + k * .14, .03 + (k % 2) * .01).rotateY(k * 1.7), 0xff5a10)));
  const trees = { con: [], leaf: [], snag: [] }, placed = [], TG = new Map(), TCS = 6; const tk = (x, z) => Math.floor(x / TCS) + ',' + Math.floor(z / TCS);
  const clearings = [[TRAM.x, TRAM.z, 20], [CLEAR.x, CLEAR.z, 17], [GATE.x, GATE.z, 11], ...MARKERS.map(m => [m.x, m.z, 6])];
  const nT = tierN(230, 360, 470);
  for (let tries = 0; tries < nT * 14 && placed.length < nT; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 1.08, x = FC.x + Math.cos(a) * r * RX, z = FC.z + Math.sin(a) * r * RZ, e = ell(x, z);
    if (z < 392 || dTrail(x, z) < 4.2 || dCreek(x, z) < 4 || clearings.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    const minD = e > .88 ? 3.4 : 5.2; let bad = false; const ci = Math.floor(x / TCS), cj = Math.floor(z / TCS);
    for (let i = -1; i <= 1 && !bad; i++) for (let j = -1; j <= 1 && !bad; j++) for (const p of TG.get((ci + i) + ',' + (cj + j)) || []) if (Math.hypot(p[0] - x, p[1] - z) < minD) { bad = true; break; }
    if (bad) continue; const p = [x, z]; placed.push(p); (TG.get(tk(x, z)) || TG.set(tk(x, z), []).get(tk(x, z))).push(p);
    const kind = (x > 60 && rnd() < .12) ? 'snag' : rnd() < .58 ? 'con' : 'leaf'; const h = kind === 'con' ? 11 + rnd() * 10 : kind === 'leaf' ? 9 + rnd() * 7 : 6 + rnd() * 5;
    trees[kind].push({ x, z, h, w: h * (.85 + rnd() * .35), yaw: rnd() * 6.3, tint: .8 + rnd() * .35 });
  }
  const swayTree = swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), .35, false, 'tree');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tc = new THREE.Color();
  const inst = (geo, list, mat, scaleFn, colorFn) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); im.count = list.length; list.forEach((t, i) => { q.setFromAxisAngle(up, t.yaw); im.setMatrixAt(i, m4.compose(v.set(t.x, 0, t.z), q, scaleFn(t))); if (colorFn) im.setColorAt(i, colorFn(t)); }); im.computeBoundingSphere(); return im; };
  root.add(inst(conG, trees.con, swayTree, t => sc.set(t.w, t.h, t.w), t => tc.setRGB(t.tint, t.tint * (.95 + (t.x % 7) * .01), t.tint)));
  root.add(inst(leafG, trees.leaf, swayTree, t => sc.set(t.w, t.h, t.w), t => tc.setRGB(t.tint * (1 + (t.z % 5) * .04), t.tint, t.tint * .9)));
  root.add(inst(snagG, trees.snag, MAT, t => sc.set(t.h, t.h, t.h)));
  root.add(inst(emberG, trees.snag, GLOW, t => sc.set(t.h, t.h, t.h)));
  for (const k in trees) for (const t of trees[k]) addCollider(t.x, t.z, k === 'con' ? .022 * t.w + .25 : k === 'leaf' ? .045 * t.w + .2 : .04 * t.h + .15, t.h * .8, true);
  W.treeCount = placed.length;

  // --- boulders (moss on top), fallen logs (hop over them), glowing fungi
  const rockG = colorize(jitter(new THREE.IcosahedronGeometry(1, 1), .35), (c, x, y, z, ny) => { const m = sstep(.35, .8, ny); c.setRGB(lerp(.32, .2, m), lerp(.31, .32, m), lerp(.3, .14, m)); });
  const rocks = []; for (let tries = 0; tries < 600 && rocks.length < tierN(45, 70, 90); tries++) { const a = rnd() * 6.3, r = Math.sqrt(rnd()), x = FC.x + Math.cos(a) * r * RX * .97, z = FC.z + Math.sin(a) * r * RZ * .97; const near = Math.hypot(x + 74, z - 646) < 40; if ((!near && rnd() < .5) || dTrail(x, z) < 3.5 || dCreek(x, z) < 3 || clearings.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 3)) continue; const s = (near ? 1 : .5) * (.5 + rnd() * 1.3); rocks.push({ x, z, sx: s * (1 + rnd() * .6), sy: s * (.55 + rnd() * .4), sz: s * (1 + rnd() * .5), yaw: rnd() * 6.3 }); }
  root.add(inst(rockG, rocks, MAT, t => sc.set(t.sx, t.sy, t.sz)));
  for (const r of rocks) addCollider(r.x, r.z, Math.min(r.sx, r.sz) * .92, r.sy * .82, r.sy > 1.1);
  const logG = M([colorize(new THREE.CylinderGeometry(.42, .5, 7, 10).rotateZ(Math.PI / 2).translate(0, .42, 0), (c, x, y, z, ny) => c.setRGB(.24 + ny * .05, .17 + ny * .08, .1)), solid(new THREE.CylinderGeometry(.36, .36, .02, 10).rotateZ(Math.PI / 2).translate(3.5, .42, 0), 0x8a6a46), solid(new THREE.CylinderGeometry(.44, .44, .02, 10).rotateZ(Math.PI / 2).translate(-3.5, .42, 0), 0x8a6a46),
    ...[-2, -.6, 1.1, 2.4].map(x => solid(new THREE.DodecahedronGeometry(.18, 0).scale(1.6, .5, 1.2).translate(x, .86, 0), 0x3d6a26))]);
  const logs = []; for (let tries = 0; tries < 300 && logs.length < 16; tries++) { const a = rnd() * 6.3, r = Math.sqrt(rnd()) * .9, x = FC.x + Math.cos(a) * r * RX, z = FC.z + Math.sin(a) * r * RZ; if (dTrail(x, z) < 6 || dCreek(x, z) < 5 || clearings.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + 3) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < 5)) continue; logs.push({ x, z, yaw: rnd() * 6.3 }); }
  // a log right beside the main trail so the first thing you can hop over is easy to find
  logs.push({ x: 7.5, z: 470, yaw: .3 });
  root.add(inst(logG, logs, MAT, () => sc.set(1, 1, 1)));
  for (const l of logs) for (const k of [-2.6, -.9, .9, 2.6]) addCollider(l.x + Math.cos(l.yaw) * k, l.z - Math.sin(l.yaw) * k, .62, .84, true);
  const fungG = M([solid(new THREE.CylinderGeometry(.03, .04, .16, 6).translate(0, .08, 0), 0xe8e0d0), solid(new THREE.SphereGeometry(.09, 8, 5, 0, 6.3, 0, 1.4).scale(1, .6, 1).translate(0, .17, 0), 0xffffff)]);
  const fungi = []; for (let i = 0; i < tierN(80, 140, 220); i++) { const p = placed[(rnd() * placed.length) | 0]; if (!p) break; const a = rnd() * 6.3, d = .8 + rnd() * 1.6; fungi.push({ x: p[0] + Math.cos(a) * d, z: p[1] + Math.sin(a) * d, yaw: rnd() * 6, s: .7 + rnd() * 1.4, hot: p[0] > 60 }); }
  nearGroup.add(inst(fungG, fungi, GLOW, t => sc.setScalar(t.s), t => t.hot ? tc.setRGB(1, .45 + rnd() * .2, .12) : tc.setRGB(.25, .9 + rnd() * .1, .75 + rnd() * .2)));

  // --- ground cover: grass tufts + ferns (instanced; wind sway; grass bends away from your feet)
  const blade = []; for (let b = 0; b < 7; b++) { const a = b / 7 * 6.3 + rnd(), r = .05 + rnd() * .12, h = .45 + rnd() * .5, lean = .15 + rnd() * .2; const g = new THREE.BufferGeometry(); const x = Math.cos(a) * r, z = Math.sin(a) * r, tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean, px = -Math.sin(a) * .035, pz = Math.cos(a) * .035;
    g.setAttribute('position', new THREE.Float32BufferAttribute([x - px, 0, z - pz, x + px, 0, z + pz, tx, h, tz], 3)); blade.push(colorize(g, (c, X, Y) => c.setRGB(.1 + Y * .25, .2 + Y * .4, .06 + Y * .08))); }
  const grassGeo = M(blade); grassGeo.computeVertexNormals(); { const n = grassGeo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }   // up-facing normals: tufts light like a soft lawn instead of flickering blades
  const grassMat = swayMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), .22, true, 'grass');
  const gl = []; for (let tries = 0, N = tierN(1400, 2600, 4200); tries < N * 3 && gl.length < N; tries++) { const a = rnd() * 6.3, r = Math.sqrt(rnd()), x = FC.x + Math.cos(a) * r * RX, z = FC.z + Math.sin(a) * r * RZ, dt = dTrail(x, z); if (dt < 1.7 || dCreek(x, z) < 2.4 || (dt > 7 && rnd() < .45)) continue; gl.push({ x, z, yaw: rnd() * 6.3, s: .7 + rnd() * .7 }); }
  grassIM = inst(grassGeo, gl, grassMat, t => sc.set(t.s, t.s * (.8 + rnd() * .5), t.s), t => tc.setRGB(.8 + rnd() * .4, .85 + rnd() * .3, .7 + rnd() * .3)); nearGroup.add(grassIM);
  const frond = []; for (let f = 0; f < 7; f++) { const a = f / 7 * 6.3, pts = []; for (let k = 0; k <= 6; k++) { const u = k / 6, rr = u * .9, y = Math.sin(u * 2.6) * .55, w = Math.sin(u * 3.14) * .12; pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr, w]); }
    const pp = []; for (let k = 0; k < 6; k++) { const [x0, y0, z0, w0] = pts[k], [x1, y1, z1, w1] = pts[k + 1], px = -Math.sin(a), pz = Math.cos(a); pp.push(x0 - px * w0, y0, z0 - pz * w0, x0 + px * w0, y0, z0 + pz * w0, x1 - px * w1, y1, z1 - pz * w1, x0 + px * w0, y0, z0 + pz * w0, x1 + px * w1, y1, z1 + pz * w1, x1 - px * w1, y1, z1 - pz * w1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); frond.push(colorize(g, (c, X, Y) => c.setRGB(.09 + Y * .1, .26 + Y * .25, .07))); }
  const fernGeo = M(frond); const fl = []; for (let tries = 0, N = tierN(220, 420, 650); tries < N * 4 && fl.length < N; tries++) { const p = placed[(rnd() * placed.length) | 0]; const a = rnd() * 6.3, d = 1.4 + rnd() * 4, x = p[0] + Math.cos(a) * d, z = p[1] + Math.sin(a) * d; if (dTrail(x, z) < 2.2 || dCreek(x, z) < 2) continue; fl.push({ x, z, yaw: rnd() * 6.3, s: .7 + rnd() * .8 }); }
  fernIM = inst(fernGeo, fl, grassMat, t => sc.setScalar(t.s), t => tc.setRGB(.8 + rnd() * .3, .85 + rnd() * .3, .8)); nearGroup.add(fernIM);

  buildTrailhead(); buildTram(); buildMarkers(); buildAtmosphere(); buildMara();
}

function flame(scale = 1) {   // layered additive cones: white-yellow core, orange body, red tips
  const { GLOW } = mats(); const g = new THREE.Group();
  const mk = (r, h, col, y, o) => { const m = new THREE.Mesh(solid(new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, h / 2, 0), col), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.position.y = y; g.add(m); return m; };
  mk(.32 * scale, .9 * scale, 0xff3a08, 0, .55); mk(.22 * scale, .7 * scale, 0xff8a1a, 0, .75); mk(.11 * scale, .42 * scale, 0xfff0b0, 0, .95);
  g.userData.ph = Math.random() * 10; flames.push(g); return g;
}
function buildTrailhead() {
  const { MAT, GLOW } = mats(), g = new THREE.Group(); g.position.set(GATE.x, 0, GATE.z); root.add(g);
  const stone = (w, h, d, x, y, z) => colorize(jitter(new THREE.BoxGeometry(w, h, d, 2, 3, 2), .05).translate(x, y, z), (c, X, Y, Z, ny) => c.setRGB(.36 + ny * .04, .33 + ny * .03, .3));
  const parts = []; for (const s of [-1, 1]) { parts.push(stone(1.5, 5.6, 1.5, s * 4.6, 2.8, 0), stone(1.9, .5, 1.9, s * 4.6, 5.8, 0), stone(1.2, .5, 1.2, s * 4.6, 6.3, 0), solid(new THREE.CylinderGeometry(.55, .35, .45, 10).translate(s * 4.6, 6.75, 0), 0x2a2420)); }
  parts.push(solid(new THREE.BoxGeometry(10.8, .5, .6).translate(0, 5.3, 0), 0x3a2a1c), solid(new THREE.BoxGeometry(10.8, .18, .66).translate(0, 5.05, 0), 0xff6a1a));
  g.add(new THREE.Mesh(M(parts), MAT)); for (const s of [-1, 1]) { const f = flame(1); f.position.set(s * 4.6, 6.95, 0); g.add(f); addCollider(GATE.x + s * 4.6, GATE.z, 1.05, 6, false); }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.6), new THREE.MeshBasicMaterial({ map: signTex([['THE CINDERWILDS', 64], ['TRAILHEAD · PVP / PVE ZONE', 34, '#ff9a4a']], 1024, 256), toneMapped: false }));
  sign.position.set(0, 4.2, -.32); sign.rotation.y = Math.PI; g.add(sign); const sign2 = sign.clone(); sign2.position.z = .32; sign2.rotation.y = 0; g.add(sign2);   // readable from both sides
  // warning board beside the path (city side)
  const wb = new THREE.Group(); wb.position.set(-6.5, 0, -8); wb.rotation.y = Math.PI + .35; g.add(wb);
  wb.add(new THREE.Mesh(M([solid(new THREE.BoxGeometry(.18, 2.4, .18).translate(-1.1, 1.2, 0), 0x3a2a1c), solid(new THREE.BoxGeometry(.18, 2.4, .18).translate(1.1, 1.2, 0), 0x3a2a1c)]), MAT));
  const wbs = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: signTex([['⚠ WARNING', 60, '#ffd23a'], ['PVP AND PVE AREA AHEAD', 38, '#ffffff'], ['Wild creatures roam freely', 28, '#ffc8a0']], 512, 256, '#3a0c08', '#fff', '#ffd23a'), toneMapped: false, side: THREE.DoubleSide }));
  wbs.position.set(0, 1.9, .1); wb.add(wbs); addCollider(GATE.x - 6.5, GATE.z - 8, .9, 2.6, true);
  // city-side signpost at the edge of town
  const sp = new THREE.Group(); sp.position.set(3.5, 0, 318); root.add(sp);
  sp.add(new THREE.Mesh(solid(new THREE.CylinderGeometry(.09, .11, 3.2, 8).translate(0, 1.6, 0), 0x3a2a1c), MAT));
  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, .7), new THREE.MeshBasicMaterial({ map: signTex([['THE WILDS  ↑', 70]], 512, 150, '#24361c', '#e8ffd0', '#8ad05a'), toneMapped: false, side: THREE.DoubleSide })); arrow.position.y = 2.7; arrow.rotation.y = Math.PI; sp.add(arrow);
  // lantern posts along both trails (lantern hangs from a hook arm, never floating)
  const posts = []; for (const tr of [mainS, retS]) for (let i = 8; i < tr.length - 4; i += 11) { const [x, z] = tr[i], [x2, z2] = tr[i + 1]; let dx = x2 - x, dz = z2 - z; const L = Math.hypot(dx, dz) || 1; const side = (i / 11) % 2 ? 1 : -1; posts.push({ x: x + dz / L * 2.2 * side, z: z - dx / L * 2.2 * side, yaw: Math.atan2(-dz * side, dx * side) }); }
  const postG = M([solid(new THREE.CylinderGeometry(.07, .09, 2.6, 6).translate(0, 1.3, 0), 0x2e241c), solid(new THREE.BoxGeometry(.6, .06, .06).translate(.28, 2.5, 0), 0x2e241c), solid(new THREE.CylinderGeometry(.015, .015, .2, 4).translate(.52, 2.38, 0), 0x1a1410), solid(new THREE.CylinderGeometry(.12, .1, .06, 8).translate(.52, 2.27, 0), 0x2a2018), solid(new THREE.CylinderGeometry(.1, .12, .06, 8).translate(.52, 1.97, 0), 0x2a2018)]);
  const lampG = solid(new THREE.SphereGeometry(.11, 10, 8).scale(1, 1.3, 1).translate(.52, 2.12, 0), 0xffb050);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const pi = new THREE.InstancedMesh(postG, MAT, posts.length), li = new THREE.InstancedMesh(lampG, GLOW, posts.length);
  posts.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw); m4.compose(v.set(p.x, 0, p.z), q, one); pi.setMatrixAt(i, m4); li.setMatrixAt(i, m4); addCollider(p.x, p.z, .25, 2.6, true); });
  pi.computeBoundingSphere(); li.computeBoundingSphere(); root.add(pi, li);
  // "↩ City" signs on the return path
  for (const i of [Math.floor(retS.length * .3), Math.floor(retS.length * .7)]) { const [x, z] = retS[i]; const s = new THREE.Group(); s.position.set(x + 2.6, 0, z); root.add(s); s.add(new THREE.Mesh(solid(new THREE.CylinderGeometry(.07, .09, 2.2, 6).translate(0, 1.1, 0), 0x2e241c), MAT)); const b = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .5), new THREE.MeshBasicMaterial({ map: signTex([['↩ CITY', 80]], 400, 130, '#2a1e14', '#ffd9a0'), toneMapped: false, side: THREE.DoubleSide })); b.position.y = 1.95; b.rotation.y = .6; s.add(b); }
}
function buildTram() {   // the ruined tram stop: cracked platform, broken shelter, rusted rails into the ground, a derelict bubble-window tram car
  const { MAT, GLOW } = mats(), g = new THREE.Group(); g.position.set(TRAM.x, 0, TRAM.z); root.add(g);
  const conc = (w, h, d, x, y, z, rz = 0, rx = 0) => colorize(jitter(new THREE.BoxGeometry(w, h, d, 3, 1, 2), .03).rotateZ(rz).rotateX(rx).translate(x, y, z), (c, X, Y, Z, ny) => c.setRGB(.42 + ny * .05, .41 + ny * .04, .38 + (ny > .5 ? -.08 : 0)));
  const rust = 0x7a3a1e, cream = 0xc8b48a;
  const parts = [conc(16, .3, 4.5, 0, .15, 0), conc(5, .3, 4.5, 9.5, .1, .4, -.04), conc(.5, 2.8, .5, -5, 1.55, -1.6), conc(.5, 2.8, .5, -.5, 1.55, -1.6), conc(.5, 1.6, .5, 3.6, .95, -1.6, .25), conc(6.4, .22, 3, -2.8, 3, -.9, .06, .08), conc(2.6, .2, 2, 2.3, 1.7, -1.2, .7, .3),
    solid(new THREE.BoxGeometry(3.2, .12, .5).translate(-2.8, .75, -1.5), 0x4a3424), solid(new THREE.BoxGeometry(.12, .45, .4).translate(-4.2, .48, -1.5), 0x2a2420), solid(new THREE.BoxGeometry(.12, .45, .4).translate(-1.4, .48, -1.5), 0x2a2420),
    solid(new THREE.CylinderGeometry(.08, .08, 3.4, 6).translate(6.5, 1.7, -1.8), 0x2a2420)];
  // rails: two rusted rails + sleepers running west past the platform, sinking into the forest floor
  for (const rz of [3.2, 4.6]) parts.push(colorize(new THREE.BoxGeometry(40, .12, .12).translate(-14, .08, rz), (c, x) => c.setRGB(.36 + Math.sin(x) * .04, .2, .12)));
  for (let x = -33; x < 6; x += 1.2) parts.push(solid(new THREE.BoxGeometry(.3, .1, 2.4).translate(x, .05, 3.9), x % 2.4 < 1.2 ? 0x3a2a1c : 0x2e2218));
  // derelict tram: rounded hull, tilted on the rails, rust over cream paint, dark bubble windows, a vine or two
  const hull = colorize(new THREE.CapsuleGeometry(1.45, 7, 6, 14).rotateZ(Math.PI / 2).scale(1, 1, .82), (c, x, y, z, ny) => { const r = (Math.sin(x * 3.1 + y * 5) * .5 + .5) * sstep(-.2, .9, -ny); c.set(cream).lerp(new THREE.Color(rust), .35 + r * .6); });
  const tram = new THREE.Group(); tram.position.set(-17, 1.32, 3.9); tram.rotation.set(.12, .08, .05); g.add(tram);
  tram.add(new THREE.Mesh(M([hull, solid(new THREE.BoxGeometry(9.5, .16, 2.5).translate(0, -1.1, 0), 0x2a2018), ...[-3, -1.5, 0, 1.5, 3].map(x => solid(new THREE.SphereGeometry(.55, 12, 8).scale(1, .8, .3).translate(x, .35, 1.16), 0x101820)), ...[-3, -1.5, 0, 1.5, 3].map(x => solid(new THREE.SphereGeometry(.55, 12, 8).scale(1, .8, .3).translate(x, .35, -1.16), 0x101820)), solid(new THREE.BoxGeometry(9.8, .18, .1).translate(0, -.35, 1.2), 0xff6a1a), solid(new THREE.TorusGeometry(1.2, .08, 6, 16, 3).rotateY(Math.PI / 2).translate(2.2, .1, 0), 0x2f6a22), solid(new THREE.TorusGeometry(1.25, .07, 6, 16, 2.6).rotateY(Math.PI / 2).translate(-2.6, .1, 0), 0x3a7a2a)]), MAT));
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .5), new THREE.MeshBasicMaterial({ map: signTex([['TRAM 9 · FERNWAY', 46, '#e8dcc0']], 512, 140, '#20262a', '#e8dcc0', '#556066'), toneMapped: false })); lbl.position.set(1.5, 3.2, -1.82); lbl.rotation.y = Math.PI; g.add(lbl);
  const lbl2 = lbl.clone(); lbl2.position.z = -1.78; lbl2.rotation.y = 0; g.add(lbl2);
  g.add(new THREE.Mesh(M(parts), MAT));
  // colliders: platform you can step onto, shelter posts, the tram hull (you can climb onto it)
  for (let x = -7; x <= 7; x += 3.5) addCollider(TRAM.x + x, TRAM.z, 2.2, .3, true);
  addCollider(TRAM.x - 5, TRAM.z - 1.6, .4, 2.9, true); addCollider(TRAM.x - .5, TRAM.z - 1.6, .4, 2.9, true);
  for (const x of [-21, -17, -13]) addCollider(TRAM.x + x, TRAM.z + 3.9, 1.6, 2.7, false);
  // Mara's camp: stone ring + logs + a real fire with embers
  const fg = new THREE.Group(); fg.position.set(FIRE.x, 0, FIRE.z); root.add(fg);
  fg.add(new THREE.Mesh(M([...[0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => { const a = k / 9 * 6.3; return colorize(jitter(new THREE.DodecahedronGeometry(.22, 0), .3).translate(Math.cos(a) * .75, .12, Math.sin(a) * .75), c => c.setRGB(.3, .29, .27)); }), solid(new THREE.CylinderGeometry(.09, .1, 1.1, 6).rotateZ(1.3).rotateY(.4).translate(0, .18, 0), 0x3a2414), solid(new THREE.CylinderGeometry(.09, .1, 1.1, 6).rotateZ(1.3).rotateY(2.4).translate(0, .18, 0), 0x3a2414), solid(new THREE.CylinderGeometry(.09, .1, 1.1, 6).rotateZ(1.3).rotateY(4.4).translate(0, .2, 0), 0x2a1a10),
    solid(new THREE.CylinderGeometry(.26, .3, 1.9, 8).rotateZ(Math.PI / 2).translate(0, .3, 2.1), 0x4a3424)]), MAT));
  fg.add(new THREE.Mesh(solid(new THREE.CircleGeometry(.6, 12).rotateX(-Math.PI / 2).translate(0, .05, 0), 0xff5a10), GLOW));
  const f = flame(1.15); f.position.y = .12; fg.add(f); addCollider(FIRE.x, FIRE.z, .9, .5, true);
}
function buildMarkers() {   // fernway markers: stacked-stone cairns with a glowing rune and a light beam until you find them
  const { MAT, GLOW } = mats();
  for (const m of MARKERS) {
    const g = new THREE.Group(); g.position.set(m.x, 0, m.z); root.add(g);
    g.add(new THREE.Mesh(M([[.55, .18], [.45, .5], [.36, .78], [.26, 1.02]].map(([r, y], k) => colorize(jitter(new THREE.DodecahedronGeometry(r, 0), .2).scale(1, .6, 1).rotateY(k).translate(0, y, 0), (c, x, Y, z, ny) => c.setRGB(.34, .34 + ny * .05, .3)))), MAT));
    const rune = new THREE.Mesh(solid(new THREE.TorusGeometry(.2, .03, 6, 20).translate(0, 1.32, 0), 0x7dffb0), GLOW); g.add(rune);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .6, 26, 12, 1, true).translate(0, 13, 0), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); g.add(beam);
    m.rune = rune; m.beam = beam; m.g = g; addCollider(m.x, m.z, .6, 1.1, true); beams.push(m);
  }
}
function buildAtmosphere() {
  // fireflies (night) + forest motes (day)
  const N = tierN(90, 160, 240), fp = new Float32Array(N * 3), fc = new Float32Array(N * 3); W.flyData = [];
  for (let i = 0; i < N; i++) { const a = rnd() * 6.3, r = Math.sqrt(rnd()) * .9; W.flyData.push({ x: FC.x + Math.cos(a) * r * RX, z: FC.z + Math.sin(a) * r * RZ, y: .5 + rnd() * 2.5, p: rnd() * 10, s: .3 + rnd() * .7 }); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3));
  const dot = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
  flies = new THREE.Points(fg, new THREE.PointsMaterial({ size: .32, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); flies.frustumCulled = false; nearGroup.add(flies);
  // falling leaves around the camera
  const LN = tierN(40, 80, 130); const lg = solid(new THREE.PlaneGeometry(.14, .09), 0xffffff);
  leaves = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 }), LN); leaves.frustumCulled = false; W.leafData = [];
  const lc = [0x8a5a20, 0xa86a24, 0x6a7a26, 0x9a3a18, 0x4a6a1e], col = new THREE.Color();
  for (let i = 0; i < LN; i++) { W.leafData.push({ x: 0, y: -50, z: 0, vy: .5 + rnd() * .6, ph: rnd() * 10, spin: rnd() * 3 + 1, sway: .6 + rnd() }); leaves.setColorAt(i, col.set(lc[i % lc.length])); }
  nearGroup.add(leaves);
  // light shafts through the canopy (day: sun, night: faint moonbeams)
  const st = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.25, 'rgba(255,250,220,.55)'); gr.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); });
  const smat = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  shafts = new THREE.Group(); nearGroup.add(shafts);
  for (const [x, z] of [[-6, 452], [18, 488], [-14, 530], [6, 560], [30, 624], [-30, 600], [64, 560], [-50, 500], [40, 470], [86, 610]]) { const s = new THREE.Group(); s.position.set(x, 0, z); for (const r of [0, Math.PI / 2]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 22), smat); p.position.y = 10; p.rotation.set(0, r, .32); s.add(p); } s.userData.ph = rnd() * 6; shafts.add(s); }
  // campfire embers: a small particle pool reused for encounter FX too
  embers = makeParticles(260);
}
function makeParticles(N) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dot = canvasTex(32, 32, (x) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); });
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: .2, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); pts.frustumCulled = false; root.add(pts);
  const P = []; for (let i = 0; i < N; i++) P.push({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, max: 1, grav: 0 }); let next = 0;
  return { pts, emit(x, y, z, n, colr, o = {}) { const c = new THREE.Color(colr); for (let k = 0; k < n; k++) { const p = P[next]; next = (next + 1) % N; const sp = o.speed ?? 2; p.x = x + (Math.random() - .5) * (o.spread ?? .3); p.y = y; p.z = z + (Math.random() - .5) * (o.spread ?? .3); const a = Math.random() * 6.3, u = Math.random(); p.vx = Math.cos(a) * sp * u + (o.vx || 0); p.vz = Math.sin(a) * sp * u + (o.vz || 0); p.vy = (o.up ?? 1.5) * (.5 + Math.random()); p.max = p.life = (o.life ?? .9) * (.6 + Math.random() * .6); p.r = c.r; p.g = c.g; p.b = c.b; p.grav = o.grav ?? 0; } },
    update(dt) { for (let i = 0; i < N; i++) { const p = P[i]; if (p.life <= 0) { pos[i * 3 + 1] = -99; continue; } p.life -= dt; p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= .97; p.vz *= .97; const k = Math.max(0, p.life / p.max); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k; } g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; } };
}
function buildMara() {
  const c = C(); const g = buildWalker({ suit: 0x2c4434, accent: 0x9be37a, skin: 2, hair: 0x4a2a18, lite: c.MOBILE });
  const { MAT, GLOW } = mats();
  // hooded trail cloak + a staff with a lantern (both held/attached — nothing floats)
  g.add(new THREE.Mesh(colorize(new THREE.ConeGeometry(.5, 1.25, 12, 1, true).translate(0, 1.0, .02), (cc, x, y) => cc.setRGB(.2 + y * .03, .28 + y * .02, .18)), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 })));
  g.add(new THREE.Mesh(colorize(new THREE.SphereGeometry(.25, 12, 8, 0, 6.3, 0, 1.9).translate(0, 1.86, .04), cc => cc.setRGB(.22, .3, .2)), MAT));
  const staff = new THREE.Group(); staff.position.set(.42, 0, -.12); g.add(staff);
  staff.add(new THREE.Mesh(M([solid(new THREE.CylinderGeometry(.03, .035, 2.1, 6).translate(0, 1.05, 0), 0x5a3a20), solid(new THREE.BoxGeometry(.22, .04, .04).translate(.09, 2.05, 0), 0x2a2018), solid(new THREE.CylinderGeometry(.08, .07, .04, 8).translate(.18, 1.98, 0), 0x2a2018), solid(new THREE.CylinderGeometry(.07, .08, .04, 8).translate(.18, 1.74, 0), 0x2a2018)]), MAT));
  staff.add(new THREE.Mesh(solid(new THREE.SphereGeometry(.075, 8, 6).scale(1, 1.4, 1).translate(.18, 1.86, 0), 0x9bffb0), GLOW));
  g.position.set(MARA.x, 0, MARA.z); g.rotation.y = Math.atan2(-(0 - MARA.x), -(420 - MARA.z)); root.add(g); maraRig = g; addCollider(MARA.x, MARA.z, .45, 2, true);
  // name tag
  W.maraTag = tag('Mara Venn · Trail Warden', 'npc');
}

// ---------------------------------------------------------------- DOM: css, tags, modals, HUD
const css = `
#wlHud{position:fixed;top:calc(108px + env(safe-area-inset-top));right:12px;z-index:30;display:none;gap:10px;align-items:stretch;font:12px/1.2 system-ui,sans-serif;color:#eaffdc;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none}
#wlHud.on{display:flex}#wlHud .wb{background:rgba(10,18,12,.78);border:1px solid #6ad06a55;border-radius:12px;padding:6px 10px;min-width:118px;backdrop-filter:blur(4px)}
#wlHud .wn{display:flex;justify-content:space-between;gap:8px;font-weight:700}#wlHud .wn i{font-style:normal;color:#ffd27a}
.wlbar{height:5px;border-radius:3px;background:#ffffff1a;margin-top:4px;overflow:hidden}.wlbar>b{display:block;height:100%;background:linear-gradient(90deg,#5fe08a,#c6ff7a);transition:width .4s}.wlbar.hp>b{background:linear-gradient(90deg,#ff5a3a,#ffb43a)}
#wlQuest{position:fixed;top:calc(166px + env(safe-area-inset-top));right:12px;z-index:29;display:none;font:12px system-ui,sans-serif;color:#dfffd0;background:rgba(10,18,12,.6);border-radius:10px;padding:4px 10px;white-space:nowrap;max-width:94vw;overflow:hidden;text-overflow:ellipsis;pointer-events:none}#wlQuest.on{display:block}
.wltag{position:fixed;left:0;top:0;z-index:5;transform:translate(-50%,-100%);font:600 12px system-ui,sans-serif;color:#efffe4;background:rgba(8,14,10,.62);border:1px solid #7ad07a44;padding:2px 8px;border-radius:999px;white-space:nowrap;pointer-events:none;display:none}.wltag.npc{color:#ffe6b0;border-color:#ffb04a66}.wltag .lv{color:#ffd27a;margin-left:4px}
.wlfloat{position:fixed;z-index:46;transform:translate(-50%,-50%);font:900 22px system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000,0 0 12px #ff6a1a;pointer-events:none;animation:wlUp 1.1s ease-out forwards}.wlfloat.heal{text-shadow:0 2px 6px #000,0 0 12px #5fe08a}.wlfloat.info{font-size:15px;text-shadow:0 2px 6px #000}
@keyframes wlUp{0%{opacity:0;margin-top:10px}15%{opacity:1}100%{opacity:0;margin-top:-50px}}
#wlModal{position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;font:14px/1.4 system-ui,sans-serif;color:#efffe6;background:rgba(4,8,6,.35)}
#wlModal.sheet{align-items:flex-end;background:linear-gradient(transparent 40%,rgba(0,0,0,.45))}
#wlModal .wc{width:min(520px,94vw);max-height:88vh;overflow:auto;background:rgba(14,20,16,.94);border:1px solid #7ad07a55;border-radius:16px;box-shadow:0 10px 40px #000a;padding:14px 16px}
#wlModal.sheet .wc{width:min(640px,100vw);border-radius:16px 16px 0 0;padding-bottom:calc(12px + env(safe-area-inset-bottom));max-height:62vh}
#wlModal h2{margin:0 0 6px;font-size:18px;display:flex;justify-content:space-between;align-items:center;gap:8px}#wlModal h2 small{font-size:12px;color:#b8d8b0;font-weight:500}
#wlModal .x{background:none;border:0;color:#cfe;font-size:20px;padding:2px 8px;cursor:pointer}
#wlModal .chips{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0 8px}#wlModal .chip{font-size:11px;padding:2px 8px;border-radius:999px;background:#ffffff14;border:1px solid #ffffff22}
#wlModal .chip.Verdant{background:#2f6a2a88}#wlModal .chip.Ember{background:#8a3a1088}#wlModal .chip.Tide{background:#1a5a8a88}#wlModal .chip.Stone{background:#6a5a4a88}#wlModal .chip.threat-High,#wlModal .chip.threat-Severe{background:#8a1a1a;border-color:#ff5a3a}#wlModal .chip.threat-Low{background:#1a5a2a}
#wlModal .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#wlModal .row button,#wlModal .btn{flex:1 1 30%;min-height:46px;border-radius:12px;border:1px solid #7ad07a66;background:#1c2a1e;color:#efffe6;font:700 14px system-ui,sans-serif;cursor:pointer;padding:6px 10px}
#wlModal .row button:hover:not(:disabled){background:#2c4a2e}#wlModal .row button:disabled{opacity:.45;cursor:default}#wlModal button.pri{background:#3a7a2a;border-color:#9be37a}#wlModal button.warn{background:#7a2a10;border-color:#ff8a3a}#wlModal button small{display:block;font-weight:500;font-size:11px;opacity:.85}
#wlModal .dim{color:#a8c8a0;font-size:12px}#wlModal .say{background:#ffffff0c;border-left:3px solid #9be37a;padding:8px 10px;border-radius:8px;margin:6px 0;font-style:italic}
#wlModal .fx{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}#wlModal .fx .side{background:#ffffff08;border-radius:10px;padding:6px 8px}#wlModal .fx .nm{font-weight:800;display:flex;justify-content:space-between}
#wlModal .st{font-size:11px;color:#ffd27a;min-height:14px}#wlModal .intent{font-size:12px;color:#ffb48a;margin:2px 0 6px}#wlModal .log{font-size:12px;color:#dfe;min-height:36px;max-height:70px;overflow:auto;background:#00000033;border-radius:8px;padding:5px 8px}#wlModal .log div:last-child{color:#fff}
#wlModal .odds{font-size:12px;background:#00000040;border-radius:8px;padding:6px 8px;margin-top:6px}#wlModal .odds div{display:flex;justify-content:space-between}#wlModal .odds .p{color:#7dff9a}#wlModal .odds .n{color:#ff9a7a}
#wlModal .tabs{display:flex;gap:6px;margin:6px 0 10px;overflow-x:auto}#wlModal .tabs button{flex:0 0 auto;border:1px solid #7ad07a44;background:#1c2a1e;color:#dfffd0;border-radius:999px;padding:6px 12px;font-weight:700;cursor:pointer}#wlModal .tabs button.on{background:#9be37a;color:#0e140f}
#wlModal .card{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#ffffff0a;border:1px solid #ffffff14;border-radius:12px;padding:8px 10px;margin-bottom:6px}#wlModal .card.act{border-color:#9be37a}#wlModal .card button{flex:0 0 auto;min-height:36px}
#wlModal .local{font-size:11px;color:#ffd27a;background:#3a2a0a88;border:1px solid #ffb04a55;border-radius:8px;padding:5px 8px;margin-top:8px}
#wlWarn{position:fixed;inset:0;z-index:47;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;background:radial-gradient(ellipse at center,rgba(60,4,2,.72),rgba(0,0,0,.92));color:#fff;font-family:system-ui,sans-serif;animation:wlIn .35s ease-out}
#wlWarn h1{font:900 clamp(22px,5.4vw,46px)/1.15 system-ui,sans-serif;letter-spacing:.04em;color:#ff3a1a;text-shadow:0 0 18px #ff2a00,0 0 2px #fff;margin:0 0 14px;max-width:900px}
#wlWarn p{color:#ffd0b8;max-width:520px;font-size:14px;margin:0 0 20px}#wlWarn .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
#wlWarn button{min-width:150px;min-height:52px;border-radius:12px;font:800 17px system-ui,sans-serif;cursor:pointer;border:1px solid #ff8a3a;background:#2a0c06;color:#fff}#wlWarn button.go{background:#c2300c;border-color:#ffb06a;box-shadow:0 0 20px #ff3a0a88}
@keyframes wlIn{from{opacity:0}to{opacity:1}}
#wlBanner{position:fixed;top:38%;left:50%;transform:translate(-50%,-50%);z-index:48;font:900 clamp(22px,5vw,40px) system-ui,sans-serif;color:#d8ffb0;text-shadow:0 0 18px #5fe08a,0 2px 8px #000;pointer-events:none;opacity:0;transition:opacity .4s;text-align:center;white-space:nowrap}#wlBanner small{display:block;font-size:.45em;color:#fff}
#wlToast{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:44;background:rgba(10,18,12,.88);border:1px solid #7ad07a66;color:#efffe6;border-radius:12px;padding:8px 14px;font:600 13px system-ui,sans-serif;opacity:0;transition:opacity .3s;pointer-events:none;max-width:92vw;text-align:center}
body.wl-lock #touch,body.wl-lock #prompt{display:none!important}
@media (max-width:600px){#wlHud{right:auto;left:10px;top:calc(158px + env(safe-area-inset-top));gap:6px}#wlQuest{right:auto;left:10px;top:calc(210px + env(safe-area-inset-top));max-width:calc(100vw - 110px);white-space:normal}#wlHud .wb{min-width:104px;padding:5px 8px}#wlModal .row button{flex:1 1 45%}}
`;
function el(t, cls, html) { const e = document.createElement(t); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function tag(text, cls) { const t = el('div', 'wltag ' + (cls || ''), text); document.body.append(t); return t; }
let hud, qline, banner, toastEl, toastT;
function buildDom() {
  const st = el('style'); st.id = 'wlCss'; st.textContent = css; document.head.append(st);
  hud = el('div', null); hud.id = 'wlHud'; hud.setAttribute('role', 'button'); hud.setAttribute('aria-label', 'Open Wilds journal'); document.body.append(hud); hud.onclick = e => { e.stopPropagation(); openJournal(); };
  qline = el('div'); qline.id = 'wlQuest'; document.body.append(qline);
  banner = el('div'); banner.id = 'wlBanner'; document.body.append(banner);
  toastEl = el('div'); toastEl.id = 'wlToast'; document.body.append(toastEl);
}
function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => toastEl.style.opacity = 0, ms); }
function bigBanner(txt, sub, ms = 2200) { banner.innerHTML = esc(txt) + (sub ? '<small>' + esc(sub) + '</small>' : ''); banner.style.opacity = 1; setTimeout(() => banner.style.opacity = 0, ms); }
const _p = new THREE.Vector3();
function screenOf(x, y, z) { const c = C(); _p.set(x, y, z).project(c.C); if (_p.z > 1) return null; return [(_p.x * .5 + .5) * innerWidth, (-_p.y * .5 + .5) * innerHeight]; }
function floatText(x, y, z, txt, cls = '') { const s = screenOf(x, y, z); if (!s) return; const f = el('div', 'wlfloat ' + cls, esc(txt)); f.style.left = s[0] + 'px'; f.style.top = s[1] + 'px'; document.body.append(f); setTimeout(() => f.remove(), 1200); }
function renderHud() {
  const S = game.state, ps = game.playerStats(), comp = game.activeComp(), need = game.playerNeed(S.player.lv);
  const show = C().getMode() === 'explore' && (W.inForest || (comp && compMesh)) && !window.__burnTowerOpen;
  hud.classList.toggle('on', !!show); if (!show) { qline.classList.remove('on'); return; }
  let h = `<div class="wb"><div class="wn"><span>You</span><i>Lv ${S.player.lv}</i></div><div class="wlbar hp" title="Health"><b style="width:${100 * S.player.hp / ps.hp}%"></b></div><div class="wlbar" title="XP ${S.player.xp}/${need}"><b style="width:${100 * S.player.xp / need}%"></b></div></div>`;
  if (comp) { const cs = game.stats(comp), cn = game.compNeed(comp.lv); h += `<div class="wb"><div class="wn"><span>${esc(game.SP[comp.sp].name)}</span><i>Lv ${comp.lv}</i></div><div class="wlbar hp"><b style="width:${100 * comp.hp / cs.hp}%"></b></div><div class="wlbar"><b style="width:${100 * comp.xp / cn}%"></b></div></div>`; }
  if (hud.__h !== h) { hud.innerHTML = h; hud.__h = h; }
  const q = Object.keys(S.quests).map(id => [id, S.quests[id]]).find(([id, s]) => s.st !== 'done');
  let t = ''; if (q) { const def = game.QS[q[0]]; t = q[1].st === 'ready' ? '★ ' + def.title + ': return to Mara Venn' : def.title + ': ' + def.objectives.map(o => objLabel(o) + ' ' + Math.min(o.count, q[1].prog[o.id] || 0) + '/' + o.count).join(' · '); }
  else if (W.inForest && !S.quests.first_footfall) t = 'Talk to Mara Venn at the old tram stop';
  qline.textContent = t; qline.classList.toggle('on', !!t && W.inForest);
}
const objLabel = o => ({ follow_markers: 'markers', inspect_creature: 'inspect a creature', calm_or_bind: 'calm or bind a Mosskit/Rillfin' }[o.id] || o.id.replace(/_/g, ' '));

// ---- modal plumbing (one at a time; the Explore controller is paused while one is open)
let modalEl = null;
function hideCityCards() { for (const id of ['info', 'recap']) { const e = document.getElementById(id); if (e && getComputedStyle(e).display !== 'none') { if (id === 'info') e.style.display = 'none'; else e.remove(); } } }
function openModal(kind, html, sheet) { closeModal(); hideCityCards(); modalEl = el('div'); modalEl.id = 'wlModal'; if (sheet) modalEl.className = 'sheet'; modalEl.innerHTML = '<div class="wc">' + html + '</div>'; document.body.append(modalEl); W.modal = kind; document.body.classList.add('wl-lock'); modalEl.addEventListener('pointerdown', e => e.stopPropagation()); modalEl.addEventListener('touchstart', e => e.stopPropagation(), { passive: true }); clearKeys(); return modalEl; }
function closeModal() { if (modalEl) modalEl.remove(); modalEl = null; W.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); }
function clearKeys() { const i = C() && C().input; if (!i) return; for (const k in i.keys) i.keys[k] = 0; if (i.tb) for (const k in i.tb) i.tb[k] = 0; if (i.joy) { i.joy.x = 0; i.joy.y = 0; } }
const $m = s => modalEl && modalEl.querySelector(s);

// ---------------------------------------------------------------- the PvP/PvE warning
function showWarning() {
  if (W.modal) return; W.modal = 'warn'; document.body.classList.add('wl-lock'); clearKeys();
  const w = el('div'); w.id = 'wlWarn'; w.setAttribute('role', 'alertdialog'); w.setAttribute('aria-label', 'Warning');
  w.innerHTML = `<h1>WARNING PVP AND PVE AREA AHEAD. PROCEED?</h1><p>The Cinderwilds: wild creatures roam and may fight back. Other players will be able to challenge you here (PvP switches on in a later update). Your Wilds progress is saved on this device only.</p><div class="row"><button class="back">Turn back</button><button class="go">PROCEED</button></div>`;
  document.body.append(w); w.addEventListener('pointerdown', e => e.stopPropagation());
  const done = go => { w.remove(); W.modal = null; document.body.classList.remove('wl-lock'); clearKeys(); go ? enterForest() : turnBack(); };
  w.querySelector('.go').onclick = () => done(true); w.querySelector('.back').onclick = () => done(false);
  AUD.unlock(); AUD.sfx('warn'); W.warnShown = (W.warnShown || 0) + 1;
  W._warnKey = e => { if (W.modal !== 'warn') return removeEventListener('keydown', W._warnKey, true); if (e.code === 'Enter' || e.code === 'KeyE') { e.stopPropagation(); done(true); } else if (e.code === 'Escape' || e.code === 'Backspace') { e.stopPropagation(); done(false); } };
  addEventListener('keydown', W._warnKey, true);
}
function turnBack() { const P = C().P; const dx = P.pos.x - FC.x, dz = P.pos.z - FC.z, e = ell(P.pos.x, P.pos.z) || 1; P.pos.x = FC.x + dx / e * 1.035; P.pos.z = FC.z + dz / e * 1.035; C().input.yp.yaw = Math.atan2(-dx, -dz); W.inForest = false; }
function enterForest() {
  hideCityCards(); W.inForest = true; W.entered = (W.entered || 0) + 1; AUD.enterForest(); bigBanner('THE CINDERWILDS', 'Fernway Verge · Lv 1–5'); renderHud();
  if (!game.state.quests.first_footfall) setTimeout(() => toast('Mara Venn waits at the old tram stop, just left of the trail.'), 2400);
}
function leaveForest() { W.inForest = false; AUD.leaveForest(); if (W.enc) endEncounter(true); bigBanner('BURN CITY', 'Back on the grid', 1600); renderHud(); }

// ---------------------------------------------------------------- creatures in the world
function spawn(slot) {
  const sp = slot.sp, lv = game.rollLevel(sp, clamp(game.state.player.lv + (sp === 'shardmole' ? 4 : 1), 2, 5)), c = game.wild(sp, lv), mesh = buildCreature(sp, C().MOBILE); root.add(mesh);
  let x, z, k = 0; do { const a = Math.random() * 6.3, r = Math.sqrt(Math.random()) * slot.r; x = slot.x + Math.cos(a) * r; z = slot.z + Math.sin(a) * r; if (slot.creek) { const best = nearestCreek(x, z); x = best[0] + (Math.random() - .5) * 4; z = best[1] + (Math.random() - .5) * 4; } } while (k++ < 20 && blocked(x, z, .6));
  mesh.position.set(x, .035, z); const yaw = Math.random() * 6.3; mesh.rotation.y = yaw;
  const cr = { slot, c, mesh, sp, x, z, yaw, vx: 0, vz: 0, spd: 0, st: 'idle', t: 1 + Math.random() * 3, tx: x, tz: z, tag: tag(''), seen: false, cool: 0 };
  slot.cr = cr; W.creatures.push(cr); return cr;
}
function nearestCreek(x, z) { let b = null, bd = 1e9; for (const p of creekS) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = p; } } return b; }
function blocked(x, z, r) { for (const o of obAt(x, z)) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return o; return null; }
function despawn(cr, delay = 45) { cr.mesh.removeFromParent(); disposeMesh(cr.mesh); cr.tag.remove(); W.creatures.splice(W.creatures.indexOf(cr), 1); cr.slot.cr = null; cr.slot.cool = delay; }
function disposeMesh(m) { m.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
const TEMP = () => DATA.abilities.temperament;
function steer(cr, dt, wantX, wantZ, maxSpd) {
  // desired velocity toward the target, then push away from nearby trees/rocks (look-ahead), keep inside the forest
  let dx = wantX - cr.x, dz = wantZ - cr.z; const d = Math.hypot(dx, dz); let des = d > .3 ? Math.min(maxSpd, d * 1.5) : 0; dx /= d || 1; dz /= d || 1;
  const ax = cr.x + dx * 1.6, az = cr.z + dz * 1.6; for (const o of obAt(ax, az)) { const ox = ax - o.x, oz = az - o.z, od = Math.hypot(ox, oz), m = o.r + 1.1; if (od < m) { dx += ox / (od || 1) * (m - od) * 1.4; dz += oz / (od || 1) * (m - od) * 1.4; } }
  const e = ell(cr.x, cr.z); if (e > .94) { dx += (FC.x - cr.x) / RX * 3; dz += (FC.z - cr.z) / RZ * 3; }
  const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  // inertia: accelerate/brake smoothly, turn at a limited rate (no instant snapping)
  const tyaw = des > .05 ? Math.atan2(dx, dz) : cr.yaw; let dy = Math.atan2(Math.sin(tyaw - cr.yaw), Math.cos(tyaw - cr.yaw)); const turn = clamp(dy, -4 * dt, 4 * dt); cr.yawRate = turn / dt; cr.yaw += turn;
  const face = Math.cos(dy); cr.spd += ((des * Math.max(.15, face)) - cr.spd) * Math.min(1, dt * 3);
  const nx = cr.x + Math.sin(cr.yaw) * cr.spd * dt, nz = cr.z + Math.cos(cr.yaw) * cr.spd * dt; const hit = blocked(nx, nz, .35);
  if (!hit) { cr.x = nx; cr.z = nz; } else { const ox = nx - hit.x, oz = nz - hit.z, od = Math.hypot(ox, oz) || 1; cr.x = hit.x + ox / od * (hit.r + .36); cr.z = hit.z + oz / od * (hit.r + .36); cr.spd *= .6; }
  return d;
}
function updCreature(cr, dt, t, P, distP) {
  const def = game.SP[cr.sp], tp = TEMP()[def.temperament] || {}, L = cr.mesh.userData.rig;
  let maxSpd = L.speed, lookYaw = 0, sniff = false, alert = false, wag = false;
  const toP = Math.atan2(P.pos.x - cr.x, P.pos.z - cr.z); const run = C().input.keys.ShiftLeft || C().input.keys.ShiftRight || (C().input.tb && C().input.tb.run);
  cr.t -= dt; cr.cool = Math.max(0, cr.cool - dt);
  if (cr.st === 'held') { cr.spd *= Math.pow(.02, dt); let dy = Math.atan2(Math.sin(cr.face - cr.yaw), Math.cos(cr.face - cr.yaw)); cr.yaw += dy * Math.min(1, dt * 5); cr.yawRate = dy * 5; alert = true; }
  else if (cr.st === 'flee') { const fx = cr.x - (P.pos.x - cr.x) * 3, fz = cr.z - (P.pos.z - cr.z) * 3; steer(cr, dt, fx, fz, L.speed * 2.2); if (cr.t < 0) { cr.st = 'idle'; cr.t = 2; } if (cr.gone && distP > 30) { despawn(cr, 40); return; } }
  else {
    if (W.inForest && distP < 9 && cr.cool <= 0 && !W.enc) {
      if (tp.flees && distP < (run ? 7 : 3.2) && !cr.calm) { cr.st = 'flee'; cr.t = 2.5; }
      else { alert = true; lookYaw = Math.atan2(Math.sin(toP - cr.yaw), Math.cos(toP - cr.yaw)); if ((tp.approach || cr.calm) && distP > 2.6) { steer(cr, dt, P.pos.x, P.pos.z, L.speed * .6); } else steer(cr, dt, cr.x, cr.z, 0); wag = !!cr.calm; }
    } else if (cr.st === 'idle') { steer(cr, dt, cr.x, cr.z, 0); sniff = true; if (cr.t < 0) { pickWander(cr); } }
    else if (cr.st === 'wander') { const d = steer(cr, dt, cr.tx, cr.tz, L.speed); if (d < .6 || cr.t < 0) { cr.st = 'idle'; cr.t = 1.5 + Math.random() * 4; } }
  }
  cr.mesh.position.set(cr.x, .035, cr.z); cr.mesh.rotation.y = cr.yaw;
  if (distP < 70) animate(cr.mesh, dt, cr.spd, t, { lookYaw, sniff, alert, yawRate: cr.yawRate || 0, wag });
  cr.mesh.visible = distP < 140;
}
function pickWander(cr) { const s = cr.slot; for (let k = 0; k < 8; k++) { let x, z; if (s.creek) { const p = creekS[(Math.random() * creekS.length) | 0]; if (Math.hypot(p[0] - s.x, p[1] - s.z) > s.r * 1.6) continue; x = p[0] + (Math.random() - .5) * 5; z = p[1] + (Math.random() - .5) * 5; } else { const a = Math.random() * 6.3, r = Math.sqrt(Math.random()) * s.r; x = s.x + Math.cos(a) * r; z = s.z + Math.sin(a) * r; } if (!blocked(x, z, .8)) { cr.tx = x; cr.tz = z; cr.st = 'wander'; cr.t = 12; return; } } cr.t = 2; }

// ---------------------------------------------------------------- companion (follows you everywhere in Explore)
function refreshCompanion() {
  const comp = game.activeComp(); const want = comp ? comp.uid + ':' + comp.sp : null;
  if (compState && compState.key === want) return;
  if (compMesh) { compMesh.removeFromParent(); disposeMesh(compMesh); compMesh = null; if (compState && compState.tag) compState.tag.remove(); compState = null; }
  if (!comp) return;
  compMesh = buildCreature(comp.sp, C().MOBILE); C().S.add(compMesh);
  const P = C().P; compState = { key: want, x: P.pos.x + 1.5, z: P.pos.z + 1.5, yaw: 0, spd: 0, yawRate: 0, tag: tag('', 'comp') }; compMesh.position.set(compState.x, P.pos.y, compState.z);
  embers.emit(compState.x, P.pos.y + .4, compState.z, 30, 0x9bffb0, { speed: 2, up: 1.5, life: .9 });
}
function updCompanion(dt, t) {
  if (!compMesh) return; const c = C(), P = c.P, s = compState, explore = c.getMode() === 'explore' && !window.__burnTowerOpen;
  compMesh.visible = explore; if (!explore) return;
  let tx, tz; if (W.enc) { tx = W.enc.stage.cx; tz = W.enc.stage.cz; }
  else { const yaw = c.avatar.rotation.y, bx = Math.sin(yaw) * 1.8, bz = Math.cos(yaw) * 1.8; tx = P.pos.x + bx + Math.cos(yaw) * 1.2; tz = P.pos.z + bz - Math.sin(yaw) * 1.2; }
  let dx = tx - s.x, dz = tz - s.z; const d = Math.hypot(dx, dz);
  if (d > 28 || (window.__jet && window.__jet.fly && d > 10)) { s.x = tx; s.z = tz; s.spd = 0; embers.emit(s.x, P.pos.y + .3, s.z, 20, 0x9bffb0, { speed: 1.6, up: 1.2 }); }
  else { const want = d > .5 ? Math.min(13, d * (d > 4 ? 2.4 : 1.3)) : 0; const tyaw = d > .5 ? Math.atan2(dx, dz) : (W.enc ? W.enc.stage.cface : s.yaw); let dy = Math.atan2(Math.sin(tyaw - s.yaw), Math.cos(tyaw - s.yaw)); const turn = clamp(dy, -6 * dt, 6 * dt); s.yaw += turn; s.yawRate = turn / dt; s.spd += (want * Math.max(.2, Math.cos(dy)) - s.spd) * Math.min(1, dt * 4);
    let nx = s.x + Math.sin(s.yaw) * s.spd * dt, nz = s.z + Math.cos(s.yaw) * s.spd * dt; if (ell(nx, nz) < 1.1) { const h = blocked(nx, nz, .3); if (h) { const ox = nx - h.x, oz = nz - h.z, od = Math.hypot(ox, oz) || 1; nx = h.x + ox / od * (h.r + .31); nz = h.z + oz / od * (h.r + .31); } } s.x = nx; s.z = nz; }
  const gy = Math.min(P.pos.y, c.groundAt(s.x, s.z, P.pos.y + .5)); compMesh.position.set(s.x, Math.max(.035, gy), s.z); compMesh.rotation.y = s.yaw;
  animate(compMesh, dt, s.spd, t, { yawRate: s.yawRate, alert: !!W.enc, lookYaw: 0, wag: !W.enc && s.spd < .3 });
}

// ---------------------------------------------------------------- interactions (USE / E / tap the prompt)
function nearestCreature(p, max = 3.6) { let best = null, bd = max; for (const cr of W.creatures) { if (cr.st === 'flee') continue; const d = Math.hypot(cr.x - p.x, cr.z - p.z); if (d < bd) { bd = d; best = cr; } } return best && { cr: best, d: bd }; }
function interactor(p) {
  if (!W.ready || W.modal || C().getMode() !== 'explore') return null;
  if (ell(p.x, p.z) > 1.05) return null;
  const n = nearestCreature(p); if (n) return { label: 'Inspect ' + game.SP[n.cr.sp].name + ' (Lv ' + n.cr.c.lv + ')', d: n.d * .5, act: () => inspect(n.cr) };
  const dm = Math.hypot(p.x - MARA.x, p.z - MARA.z); if (dm < 3.6) return { label: 'Talk to Mara Venn', d: dm * .5, act: talkMara };
  const df = Math.hypot(p.x - FIRE.x, p.z - FIRE.z); if (df < 2.8) return { label: 'Rest by the fire (heal)', d: df * .5, act: rest };
  return null;
}
function rest() { game.restAll(); toast('You rest by the fire. You and your companions are fully healed.'); embers.emit(FIRE.x, .5, FIRE.z, 30, 0xff9a3a, { up: 2.5, speed: .6, life: 1.6 }); renderHud(); }
function faceEachOther(cr) { const P = C().P; cr.face = Math.atan2(P.pos.x - cr.x, P.pos.z - cr.z); cr.st = 'held'; C().avatar.rotation.y = Math.atan2(-(cr.x - P.pos.x), -(cr.z - P.pos.z)); }
function inspect(cr) {
  if (W.modal) return; faceEachOther(cr); const r = game.inspect(cr.c), def = r.def, co = game.calmOdds(cr.c);
  if (r.first) toast('New creature logged: ' + def.name);
  const html = `<h2>${esc(def.name)} <small>Lv ${cr.c.lv} · ${esc(def.rarity)}</small></h2>
  <div class="chips">${def.affinity.map(a => `<span class="chip ${a}">${a}</span>`).join('')}<span class="chip">${esc(def.temperament)}</span><span class="chip threat-${r.threat}">Threat: ${r.threat}</span></div>
  <div class="dim">${esc(def.passiveTrait)}</div>
  <div class="dim" style="margin-top:4px">HP ${r.stats.hp} · Power ${r.stats.power.toFixed(0)} · Guard ${r.stats.guard.toFixed(0)} · Speed ${r.stats.speed.toFixed(0)} · Moves: ${def.abilities.map(a => esc(game.AB[a].name)).join(', ')}</div>
  <div class="row"><button class="pri" data-a="engage">⚔ Engage<small>turn-based encounter</small></button><button data-a="calm">🌿 Calm<small>${co.pct}% chance</small></button><button data-a="leave">✕ Leave</button></div>
  <div class="odds" hidden>${oddsRows(co)}</div>`;
  openModal('inspect', html);
  $m('[data-a="engage"]').onclick = () => { AUD.unlock(); closeModal(); startEncounter(cr); };
  $m('[data-a="calm"]').onclick = () => { AUD.unlock(); doCalm(cr); };
  $m('[data-a="leave"]').onclick = () => { closeModal(); cr.st = 'idle'; cr.t = 1; cr.cool = 6; };
  $m('[data-a="calm"]').onmouseenter = () => { const o = $m('.odds'); if (o) o.hidden = false; };
  W._modalKeys = { Digit1: 'engage', Digit2: 'calm', Digit3: 'leave', Escape: 'leave' };
  renderHud();
}
function oddsRows(o) { return o.mods.map(m => `<div><span>${esc(m.label)}</span><span class="${m.pp >= 0 ? 'p' : 'n'}">${m.pp >= 0 ? '+' : ''}${m.pp}%</span></div>`).join('') + `<div style="border-top:1px solid #ffffff22;margin-top:3px;padding-top:3px"><b>Chance</b><b>${o.pct}%</b></div>`; }
function doCalm(cr) {
  const r = game.calm(cr.c); closeModal();
  if (r.ok) { AUD.sfx('calm'); cr.calm = true; for (let i = 0; i < 4; i++) setTimeout(() => embers.emit(cr.x, .6, cr.z, 10, 0x9bffb0, { up: 1.8, speed: .6, life: 1.4 }), i * 150);
    floatText(cr.x, 1.2, cr.z, '+' + r.xp + ' XP', 'heal'); if (r.ups && r.ups.length) levelUp('You', r.ups);
    // a calmed creature trusts you: offer a gentle bind with a big calm bonus (it won't attack while calm)
    startEncounter(cr, { calm: true, note: 'Calmed (rolled ' + r.roll + ' under ' + r.pct + '%). It trusts you — try a gentle bind, or let it be.' });
  } else { AUD.sfx('bindfail'); toast('Calm failed (rolled ' + r.roll + ', needed under ' + r.pct + '%): ' + r.reason.join(' · '), 3800);
    if (r.then === 'flee') { cr.st = 'flee'; cr.t = 3; cr.cool = 8; } else startEncounter(cr, { note: 'It bristles and attacks!' }); }
  renderHud();
}

// ---------------------------------------------------------------- encounter: staging, camera, UI, animation
function startEncounter(cr, o = {}) {
  const P = C().P; faceEachOther(cr);
  // stage: creature ~4.5 m in front of you; your companion steps up beside you
  const dx = cr.x - P.pos.x, dz = cr.z - P.pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, want = 4.6;
  cr.x = P.pos.x + ux * want; cr.z = P.pos.z + uz * want; if (blocked(cr.x, cr.z, .3)) { cr.x = P.pos.x + ux * Math.min(d, want); cr.z = P.pos.z + uz * Math.min(d, want); }
  cr.face = Math.atan2(-ux, -uz);
  const E = game.startEncounter(cr.c, { calm: o.calm });
  W.enc = { E, cr, ux, uz, busy: false, note: o.note || '', t0: performance.now(), stage: { cx: P.pos.x + ux * 1.7 + uz * 1.3, cz: P.pos.z + uz * 1.7 - ux * 1.3, cface: Math.atan2(ux, uz) }, cam: null };
  if (!o.calm) { AUD.fight(true); W.enc.fightOn = true; }
  renderEnc(); renderHud();
}
function fighterHtml(f, foe) { const pct = Math.max(0, 100 * f.hp / f.hpMax); const st = Object.keys(f.st).map(k => DATA.abilities.statuses[k].name + ' ' + f.st[k]).join(' · ');
  return `<div class="side"><div class="nm"><span>${esc(f.name)}</span><span>Lv ${f.lv}</span></div><div class="wlbar hp"><b style="width:${pct}%"></b></div><div class="dim">${Math.ceil(f.hp)}/${f.hpMax} HP ${f.aff && f.aff.length ? '· ' + f.aff.join('/') : ''}</div><div class="st">${esc(st)}</div></div>`; }
function renderEnc() {
  const { E, note } = W.enc, AB = game.AB;
  const odds = game.bindOdds(E);
  const intent = E.over ? '' : E.calmLock ? 'It is calm and watching you.' : `${esc(E.foe.name)} ${E.intent.tell}… (next: ${esc(E.intent.name)})`;
  const moveBtns = E.us.moves.map((id, i) => `<button data-m="${id}" ${W.enc.busy || E.over ? 'disabled' : ''}>${i + 1} · ${esc(AB[id].name)}<small>${esc(AB[id].affinity !== 'None' ? AB[id].affinity + ' · ' : '')}${AB[id].kind === 'attack' ? 'Pow ' + AB[id].power : AB[id].kind}</small></button>`).join('');
  const bait = game.state.items.field_bait || 0;
  const html = `<h2>${E.calmLock ? '🌿 Gentle meeting' : '⚔ Encounter'} <small>Round ${E.turn}</small><button class="x" aria-label="Close" ${E.over ? '' : 'hidden'}>✕</button></h2>
  <div class="fx">${fighterHtml(E.us)}${fighterHtml(E.foe, 1)}</div><div class="intent">${intent}</div>
  <div class="log">${(note ? `<div>${esc(note)}</div>` : '') + (E.log || []).map(l => `<div>${esc(l.t)}</div>`).join('')}</div>
  ${E.over ? `<div class="row"><button class="pri" data-a="done">Continue</button></div>` : `<div class="row">${moveBtns}<button data-m="brace" ${W.enc.busy ? 'disabled' : ''}>${E.us.moves.length + 1} · Brace<small>Guarded 2 turns</small></button>
  <button class="pri" data-a="bind" ${W.enc.busy || odds.blocked ? 'disabled' : ''}>B · Bind ${odds.pct}%<small>${odds.blocked ? esc(odds.blocked) : 'tap ⓘ for odds'}</small></button>
  <button data-a="bait" ${W.enc.busy || !bait || E.bait ? 'disabled' : ''}>Field Bait ×${bait}<small>+10% bind</small></button>
  <button class="warn" data-a="flee" ${W.enc.busy ? 'disabled' : ''}>${E.calmLock ? 'Let it go' : 'Flee'}<small>${E.calmLock ? 'peaceful' : 'escape'}</small></button></div>
  <div class="row" style="margin-top:6px"><button data-a="odds" style="flex:0 0 auto;min-height:34px">ⓘ Bind odds</button></div><div class="odds" ${W.enc.showOdds ? '' : 'hidden'}>${oddsRows(odds)}${E.lastFail ? `<div class="n" style="margin-top:4px">Last try failed: ${esc(E.lastFail.why.join(' · '))}</div>` : ''}</div>`}`;
  if (!modalEl || W.modal !== 'enc') openModal('enc', html, true); else modalEl.firstChild.innerHTML = html;
  const lg = $m('.log'); if (lg) lg.scrollTop = 1e6;
  modalEl.querySelectorAll('[data-m]').forEach(b => b.onclick = () => doAct('move', b.dataset.m));
  const on = (a, f) => { const b = $m(`[data-a="${a}"]`); if (b) b.onclick = f; };
  on('bind', () => doAct('bind')); on('bait', () => doAct('bait')); on('flee', () => doAct('flee')); on('done', () => endEncounter()); on('odds', () => { W.enc.showOdds = !W.enc.showOdds; renderEnc(); });
  const x = $m('.x'); if (x) x.onclick = () => endEncounter();
  W._modalKeys = null;
}
function encKey(e) {
  if (W.modal === 'enc' && W.enc) { const E = W.enc.E;
    if (E.over) { if (['Enter', 'Space', 'Escape', 'KeyE'].includes(e.code)) { e.preventDefault(); endEncounter(); } return true; }
    if (W.enc.busy) return true; const n = +e.key;
    if (n >= 1 && n <= E.us.moves.length) doAct('move', E.us.moves[n - 1]); else if (n === E.us.moves.length + 1) doAct('move', 'brace');
    else if (e.code === 'KeyB') doAct('bind'); else if (e.code === 'KeyF' || e.code === 'Escape') doAct('flee'); else if (e.code === 'KeyI') { W.enc.showOdds = !W.enc.showOdds; renderEnc(); } else return false;
    e.preventDefault(); return true; }
  if (modalEl) { const a = W._modalKeys && W._modalKeys[e.code]; const b = a && ($m(`[data-a="${a}"]`) || (a === 'x' && $m('.x'))); if (b) { e.preventDefault(); b.click(); return true; } if (e.code === 'Escape') { closeModal(); return true; } if (a) return true; }
  return false;
}
const AFF_COL = { Verdant: 0x7dff6a, Ember: 0xff7a1a, Tide: 0x5ad8ff, Stone: 0xc89aff, Gale: 0xe0f0ff, Aether: 0xff9aff, None: 0xfff0c0 };
function posOf(kind) { const P = C().P, enc = W.enc; if (kind === 'wild') return [enc.cr.x, .5, enc.cr.z]; if (kind === 'comp' && compMesh) return [compState.x, .5, compState.z]; return [P.pos.x, 1.1, P.pos.z]; }
async function doAct(action, arg) {
  const enc = W.enc; if (!enc || enc.busy || enc.E.over) return; enc.busy = true; enc.note = '';
  const L = game.act(enc.E, action, arg); if (!enc.E.calmLock && !enc.fightOn && !enc.E.over) { enc.fightOn = true; AUD.fight(true); } renderEnc();
  for (const l of L) { await playLine(l); }
  enc.busy = false; if (W.enc === enc) { renderEnc(); if (enc.E.over) onEncOver(enc); } renderHud();
}
function lunge(kind) { const t0 = performance.now(); if (kind === 'wild') W.enc.lunge = { who: 'wild', t0 }; else if (kind === 'comp') W.enc.lunge = { who: 'comp', t0 }; else W.enc.lunge = { who: 'player', t0 }; }
function playLine(l) {
  return new Promise(res => {
    const enc = W.enc; if (!enc) return res();
    const from = l.who ? posOf(l.who) : null, to = l.tgt ? posOf(l.tgt) : l.who === 'wild' ? posOf(enc.E.us.kind) : posOf('wild');
    const col = AFF_COL[l.aff] || 0xffffff;
    if (l.fx === 'hit' || l.fx === 'miss') { lunge(l.who); setTimeout(() => { if (!W.enc) return; if (l.fx === 'hit') { embers.emit(to[0], to[1], to[2], 26, col, { speed: 3.2, up: 1.8, grav: 4, life: .7 }); floatText(to[0], to[1] + .9, to[2], '-' + l.dmg); AUD.sfx('hit'); W.enc.flash = { kind: l.tgt, t0: performance.now() }; if (l.tgt === 'player') window.__shake && window.__shake(.15); } else { floatText(to[0], to[1] + .9, to[2], 'miss', 'info'); AUD.sfx('miss'); } }, 260); }
    else if (l.fx === 'guard') { const p = from || posOf('player'); embers.emit(p[0], p[1], p[2], 24, col, { speed: 1.2, up: .4, life: 1, spread: 1.2 }); AUD.sfx('ui'); }
    else if (l.fx === 'soothe') { const p = posOf('wild'); embers.emit(p[0], p[1] + .3, p[2], 22, 0x9bffb0, { speed: .5, up: 1.4, life: 1.4 }); AUD.sfx('calm'); }
    else if (l.fx === 'burn') { embers.emit(to[0], to[1], to[2], 14, 0xff6a1a, { speed: .8, up: 1.6, life: .8 }); floatText(to[0], to[1] + .9, to[2], '-' + l.dmg); }
    else if (l.fx === 'bind') { bindFx(true); AUD.sfx('bind'); }
    else if (l.fx === 'bindfail') { bindFx(false); AUD.sfx('bindfail'); }
    else if (l.fx === 'win') { AUD.sfx('level'); }
    setTimeout(res, l.fx === 'bind' ? 1400 : l.fx === 'bindfail' ? 900 : l.fx ? 650 : 350);
  });
}
function bindFx(ok) {
  const enc = W.enc; if (!enc) return; const { x, z } = enc.cr; const { GLOW } = mats(); if (enc.bindAnim) { enc.bindAnim.ring.removeFromParent(); enc.bindAnim = null; }
  const ring = new THREE.Mesh(solid(new THREE.TorusGeometry(.9, .04, 6, 40).rotateX(Math.PI / 2), 0x9bffb0), GLOW); ring.position.set(x, .3, z); root.add(ring);
  const t0 = performance.now(); enc.bindAnim = { ring, t0, ok };
  for (let i = 0; i < 6; i++) setTimeout(() => embers.emit(x, .3 + i * .15, z, 12, ok ? 0x9bffb0 : 0xffd27a, { speed: 1.8, up: .6, life: .8, spread: 1.6 }), i * 120);
}
function onEncOver(enc) {
  const r = enc.E.over.result, cr = enc.cr;
  if (r === 'bound') { bigBanner('BOUND!', game.SP[cr.sp].name + ' joined your roster'); }
  if (r === 'won') { floatText(cr.x, 1.4, cr.z, '+' + enc.E.over.xp + ' XP', 'heal'); }
  if (enc.E.over.ups && enc.E.over.ups.length) levelUp('You', enc.E.over.ups);
  if (enc.E.over.cups && enc.E.over.cups.length) levelUp(game.activeComp() ? game.SP[game.activeComp().sp].name : 'Companion', enc.E.over.cups);
}
function levelUp(who, ups) { AUD.sfx('level'); bigBanner('LEVEL UP!', who + ' reached Lv ' + ups[ups.length - 1], 2600); const P = C().P; embers.emit(P.pos.x, 1, P.pos.z, 50, 0xffe07a, { speed: 2.5, up: 3, life: 1.2, grav: 2 }); }
function endEncounter(silent) {
  const enc = W.enc; if (!enc) return; const r = enc.E.over ? enc.E.over.result : 'fled', cr = enc.cr;
  if (enc.bindAnim) { enc.bindAnim.ring.removeFromParent(); }
  W.enc = null; closeModal(); AUD.fight(false);
  if (r === 'bound') { despawn(cr, 40); refreshCompanion(); }
  else if (r === 'won' || r === 'escaped') { cr.st = 'flee'; cr.t = 4; cr.gone = true; cr.c.hp = game.stats(cr.c).hp; }
  else if (r === 'lost') { cr.st = 'idle'; cr.cool = 20; cr.c.hp = game.stats(cr.c).hp; const P = C().P; P.pos.set(FIRE.x + 2, 0, FIRE.z + 2); C().input.yp.yaw = Math.atan2(-(FIRE.x - P.pos.x), -(FIRE.z - P.pos.z)); if (!silent) toast('You wake by Mara\'s fire, rested. Nothing was lost.', 3600); }
  else { cr.st = cr.calm ? 'idle' : 'flee'; cr.t = 3; cr.cool = 10; if (!cr.calm) cr.c.hp = Math.min(game.stats(cr.c).hp, cr.c.hp + 5); }
  renderHud();
}
// cinematic encounter camera: side-on, framing you + the creature, slow drift; hand back smoothly afterwards
const _cam = new THREE.Vector3(), _look = new THREE.Vector3();
function encCamera(dt) {
  const enc = W.enc, c = C(), P = P_(); if (!enc) return; const mx = (P.pos.x + enc.cr.x) / 2, mz = (P.pos.z + enc.cr.z) / 2, px = -enc.uz, pz = enc.ux, k = (performance.now() - enc.t0) / 1000;
  const portrait = innerHeight > innerWidth, sway = Math.sin(k * .25) * .25, side = portrait ? 5.6 : 4.4;
  _cam.set(mx + (px * Math.cos(sway) - enc.ux * Math.sin(sway) * .6) * side - enc.ux * 1.2, P.pos.y + (portrait ? 3.4 : 2.1), mz + (pz * Math.cos(sway) - enc.uz * Math.sin(sway) * .6) * side - enc.uz * 1.2);
  // keep the camera out of tree trunks
  for (const o of obAt(_cam.x, _cam.z)) { const ox = _cam.x - o.x, oz = _cam.z - o.z, od = Math.hypot(ox, oz); if (od < o.r + .6) { _cam.x = o.x + ox / (od || 1) * (o.r + .6); _cam.z = o.z + oz / (od || 1) * (o.r + .6); } }
  if (!enc.cam) enc.cam = c.C.position.clone(); enc.cam.lerp(_cam, 1 - Math.pow(.02, dt));
  c.C.position.copy(enc.cam); _look.set(mx, P.pos.y + (portrait ? -1.5 : -.55), mz);   // aim low so you + the creature sit in the top half, above the action sheet c.C.lookAt(_look);
  // lunges + hit flashes
  const now = performance.now();
  if (enc.lunge) { const u = (now - enc.lunge.t0) / 420; const a = u < 1 ? Math.sin(u * Math.PI) * .9 : 0; if (u >= 1) enc.lunge = null;
    const L = enc.lunge || { who: '' }; if (L.who === 'wild') enc.cr.mesh.position.set(enc.cr.x - enc.ux * a, .035, enc.cr.z - enc.uz * a); else if (L.who === 'comp' && compMesh) compMesh.position.set(compState.x + enc.ux * a, compMesh.position.y, compState.z + enc.uz * a); else if (L.who === 'player') c.avatar.position.set(P.pos.x + enc.ux * a * .7, P.pos.y, P.pos.z + enc.uz * a * .7); }
  if (enc.flash) { const u = (now - enc.flash.t0) / 300, s = u < 1 ? 1 + Math.sin(u * Math.PI) * .12 : 1; if (u >= 1) enc.flash = null; const m = enc.flash && enc.flash.kind === 'wild' ? enc.cr.mesh : enc.flash && enc.flash.kind === 'comp' ? compMesh : null; if (m) m.scale.set(s, 1 / s, s); else { enc.cr.mesh.scale.set(1, 1, 1); compMesh && compMesh.scale.set(1, 1, 1); } }
  if (enc.bindAnim) { const u = (now - enc.bindAnim.t0) / 1000, ring = enc.bindAnim.ring; ring.position.y = .3 + Math.min(1, u) * .6; ring.rotation.y = u * 4; ring.scale.setScalar(enc.bindAnim.ok ? Math.max(.01, 1 - Math.max(0, u - .6) * 1.6) : 1 + Math.max(0, u - .5) * 2);
    if (enc.bindAnim.ok) { const s = Math.max(.01, 1 - Math.max(0, u - .5) * 1.5); enc.cr.mesh.scale.setScalar(s); if (u > 1.2) { ring.visible = false; enc.cr.mesh.visible = false; } }
    else { enc.cr.mesh.rotation.z = Math.sin(u * 40) * .08 * Math.max(0, 1 - u); if (u > .9) { ring.removeFromParent(); enc.bindAnim = null; enc.cr.mesh.rotation.z = 0; } } }
}
const P_ = () => C().P;

// ---------------------------------------------------------------- Mara Venn + quests
const SAY = {
  intro: "Easy, city-walker. Out here the ledger doesn't count — the forest does. I'm Mara Venn, Trail Warden. Follow the three fernway markers (look for the green light), then get close to something wild and just look at it. Inspect it. Come back and I'll trust you with a charm.",
  ff_active: "Three markers, one good look at a wild one. The green beams show the way; the trail loops back here.",
  ff_ready: "You walked it and you looked before you leapt. Good. Take this binding charm — it helps the first time you ask a creature to come with you.",
  gs_offer: "Not every meeting needs a fight. Calm a Mosskit or a Rillfin — or bind one, gently. Wear it down a little or settle it first; the odds show on your sigil.",
  gs_active: "Mosskit nap in the ferns; Rillfin keep to the creek. Soothe them, use bait, and don't rush a healthy one.",
  gs_ready: "I saw that. Gentle hands. Here — field bait, and something for your companion's training.",
  done: "That's all I have for now. The grove past the creek goes deeper — Orrick's survey crew went that way. When the trail opens further, I'll send word.",
};
function talkMara() {
  if (W.modal) return; const S = game.state, ff = S.quests.first_footfall, gs = S.quests.a_gentle_signal;
  const P = C().P; C().avatar.rotation.y = Math.atan2(-(MARA.x - P.pos.x), -(MARA.z - P.pos.z)); maraRig.userData.faceT = Math.atan2(P.pos.x - MARA.x, P.pos.z - MARA.z);
  let say, btns = '', qid = null, mode = null;
  if (!ff) { say = SAY.intro; qid = 'first_footfall'; mode = 'accept'; }
  else if (ff.st === 'active') { say = SAY.ff_active; }
  else if (ff.st === 'ready') { say = SAY.ff_ready; qid = 'first_footfall'; mode = 'claim'; }
  else if (!gs) { say = SAY.gs_offer; qid = 'a_gentle_signal'; mode = 'accept'; }
  else if (gs.st === 'active') { say = SAY.gs_active; }
  else if (gs.st === 'ready') { say = SAY.gs_ready; qid = 'a_gentle_signal'; mode = 'claim'; }
  else say = SAY.done;
  const q = qid && game.QS[qid];
  if (mode === 'accept') btns += `<button class="pri" data-a="accept">Accept: ${esc(q.title)}<small>${q.rewards.playerXp} XP${q.rewards.companionXp ? ' · ' + q.rewards.companionXp + ' companion XP' : ''} · ${q.rewards.items.map(i => game.IT[i].name).join(', ')}</small></button>`;
  if (mode === 'claim') btns += `<button class="pri" data-a="claim">Claim reward<small>${esc(q.title)}</small></button>`;
  btns += `<button data-a="rest">Rest by the fire<small>heal everyone</small></button><button data-a="bye">Goodbye</button>`;
  const prog = Object.keys(S.quests).filter(id => S.quests[id].st !== 'done').map(id => { const d = game.QS[id], s = S.quests[id]; return `<div class="card"><div><b>${esc(d.title)}</b><div class="dim">${d.objectives.map(o => objLabel(o) + ' ' + Math.min(o.count, s.prog[o.id] || 0) + '/' + o.count).join(' · ')}</div></div><span class="chip">${s.st === 'ready' ? 'ready' : 'active'}</span></div>`; }).join('');
  openModal('npc', `<h2>Mara Venn <small>Trail Warden</small><button class="x" aria-label="Close">✕</button></h2><div class="say">“${esc(say)}”</div>${prog}<div class="row">${btns}</div>`);
  const on = (a, f) => { const b = $m(`[data-a="${a}"]`); if (b) b.onclick = f; };
  on('accept', () => { const r = game.accept(qid); if (r.ok) { AUD.sfx('ui'); toast('Quest accepted: ' + q.title); } closeModal(); talkMara(); });
  on('claim', () => { const r = game.claim(qid); closeModal(); if (r.ok) { const rw = r.rewards; AUD.sfx('level'); bigBanner('QUEST COMPLETE', q.title + ' · +' + rw.playerXp + ' XP'); toast('Received: ' + rw.items.map(i => game.IT[i].name).join(', ') + (rw.companionXp ? ' · +' + rw.companionXp + ' companion XP' + (rw.banked ? ' (saved for your first companion)' : '') : ''), 4200); if (rw.ups.length) setTimeout(() => levelUp('You', rw.ups), 1200); } else toast('Nothing to claim: ' + r.reason); renderHud(); });
  on('rest', () => { rest(); closeModal(); }); on('bye', closeModal); const x = $m('.x'); if (x) x.onclick = closeModal;
  W._modalKeys = { Digit1: mode ? mode : 'rest', Escape: 'bye' };
}

// ---------------------------------------------------------------- journal: roster / quests / bag / save
function openJournal(tab = W.jtab || 'roster') {
  if (W.modal && W.modal !== 'journal') return; W.jtab = tab; const S = game.state, ps = game.playerStats();
  let body = '';
  if (tab === 'roster') { body = S.roster.length ? S.roster.map(c => { const d = game.SP[c.sp], s = game.stats(c), act = c.uid === S.active; return `<div class="card ${act ? 'act' : ''}"><div><b>${esc(d.name)}</b> <span class="dim">Lv ${c.lv} · ${d.affinity.join('/')} · ${Math.ceil(c.hp)}/${s.hp} HP · XP ${c.xp}/${game.compNeed(c.lv)} · bond ${(c.bond || 0).toFixed(1)}</span><div class="dim">${d.abilities.map(a => game.AB[a].name).join(', ')}</div></div>${act ? '<span class="chip">Following</span>' : `<button class="btn" data-follow="${c.uid}">Follow me</button>`}</div>`; }).join('') : '<div class="dim">No companions yet. Wear a creature down or calm it, then Bind it. Your first bind becomes your follower.</div>';
    body += `<div class="dim" style="margin-top:6px">Roster ${S.roster.length}/12 · one companion follows you at a time.</div>`; }
  else if (tab === 'quests') { const ids = Object.keys(game.QS).filter(id => S.quests[id] || game.canAccept(id)).slice(0, 4); body = ids.map(id => { const d = game.QS[id], s = S.quests[id]; return `<div class="card"><div><b>${esc(d.title)}</b> <span class="dim">· ${esc(d.giver.replace('_', ' '))}</span><div class="dim">${d.objectives.map(o => objLabel(o) + ' ' + (s ? Math.min(o.count, s.prog[o.id] || 0) : 0) + '/' + o.count).join(' · ')}</div></div><span class="chip">${s ? s.st : 'available'}</span></div>`; }).join('') || '<div class="dim">Talk to Mara Venn at the ruined tram stop inside the trailhead.</div>'; }
  else if (tab === 'bag') { body = Object.keys(S.items).filter(k => S.items[k] > 0).map(k => `<div class="card"><div><b>${esc(game.IT[k].name)}</b> ×${k === 'trail_sigil' ? '∞' : S.items[k]}<div class="dim">${esc(game.IT[k].text)}</div></div></div>`).join(''); }
  else if (tab === 'save') { body = `<div class="card"><div><b>You</b> <span class="dim">Lv ${S.player.lv} · XP ${S.player.xp}/${game.playerNeed(S.player.lv)} · ${Math.ceil(S.player.hp)}/${ps.hp} HP</span><div class="dim">Binds ${S.stats.binds} · Calms ${S.stats.calms} · Wins ${S.stats.wins} · Species seen ${Object.keys(S.seen).length}</div></div></div>
    <div class="local">LOCAL-ONLY SAVE · kept in this browser on this device (save v${S.v}). Not linked to your wallet or account, not sent to the server; clearing site data erases it.</div>
    <div class="row"><button data-a="tp">Travel to the trailhead</button><button data-a="city">Back to the city</button><button class="warn" data-a="reset">Reset Wilds save</button></div>`; }
  const html = `<h2>🌲 Wilds journal <small>Lv ${S.player.lv}</small><button class="x" aria-label="Close">✕</button></h2><div class="tabs">${['roster', 'quests', 'bag', 'save'].map(t => `<button data-t="${t}" class="${t === tab ? 'on' : ''}">${{ roster: 'Roster', quests: 'Quests', bag: 'Bag', save: 'Save & travel' }[t]}</button>`).join('')}</div>${body}`;
  openModal('journal', html);
  modalEl.querySelectorAll('[data-t]').forEach(b => b.onclick = () => openJournal(b.dataset.t));
  modalEl.querySelectorAll('[data-follow]').forEach(b => b.onclick = () => { game.setActive(b.dataset.follow); refreshCompanion(); openJournal('roster'); renderHud(); });
  const on = (a, f) => { const b = $m(`[data-a="${a}"]`); if (b) b.onclick = f; };
  on('tp', () => { closeModal(); travel(0, 378, Math.PI); }); on('city', () => { closeModal(); travel(0, 300, 0); });
  on('reset', () => { if (confirm('Erase your local Wilds save (level, roster, quests)?')) { game.reset(); refreshCompanion(); closeModal(); renderHud(); toast('Wilds save reset.'); } });
  $m('.x').onclick = closeModal; W._modalKeys = { Escape: 'x' };
}
function travel(x, z, yaw) { const c = C(); if (c.getMode() !== 'explore') window.__BC.setMode('explore'); const P = c.P; P.pos.set(x, 0, z); P.vel.set(0, 0, 0); c.input.yp.yaw = yaw; c.input.yp.pitch = -.05; c.C.position.set(x - Math.sin(yaw) * -6, 3, z - Math.cos(yaw) * -6); if (W.inForest && ell(x, z) > 1) leaveForest(); }

// ---------------------------------------------------------------- per-frame
let lastT = performance.now(), hudT = 0, regenT = 0;
const FOGC = new THREE.Color(), FDAY = new THREE.Color(.46, .54, .47), FNIGHT = new THREE.Color(.025, .05, .05);
function frame(dt, t) {
  if (!W.ready) return; const c = C(), P = c.P, explore = c.getMode() === 'explore' && !window.__burnTowerOpen, day = c.U && c.U.day ? c.U.day.value : 0;
  UNI.uT.value = t; UNI.uPl.value.set(P.pos.x, P.pos.y, P.pos.z); creekMat.uniforms.uT.value = t; creekMat.uniforms.uDay.value = day;
  const camD = Math.hypot((c.C.position.x - FC.x) / RX, (c.C.position.z - FC.z) / RZ); nearGroup.visible = camD < 1.6;
  // zone: warning on the way in, music/fog swap on the way out
  const e = ell(P.pos.x, P.pos.z);
  if (explore && !W.inForest && e < .99 && !W.modal && !(window.__boat && window.__boat.active)) showWarning();
  if (W.inForest && (e > 1.03 || !explore)) leaveForest();
  // forest fog + tint (blended over the city's own weather fog so it fades in as you walk under the canopy)
  const fz = sstep(1.12, .9, camD);
  // moonlight/skylight boost under the canopy so creatures stay readable at night (existing lights only: no new shader variants)
  if (!W.lights) W.lights = { hemi: c.S.children.find(o => o.isHemisphereLight), amb: c.S.children.find(o => o.isAmbientLight) };
  if (fz > 0) { if (W.lights.hemi) W.lights.hemi.intensity += fz * (1 - day) * .9; if (W.lights.amb) W.lights.amb.intensity += fz * (1 - day) * .45; }
  // third-person camera never ends up inside a tree trunk or rock: pull it in along the line to the player
  if (explore && !W.enc && fz > 0 && !P.fp) { const cp = c.C.position, hx = P.pos.x, hz = P.pos.z; let f = 1; for (let k = 1; k <= 8; k++) { const u = k / 8, x = hx + (cp.x - hx) * u, z = hz + (cp.z - hz) * u; const o = blocked(x, z, .45); if (o && o.r > .3) { f = Math.max(.25, (k - 1) / 8); break; } } if (f < 1) { cp.x = hx + (cp.x - hx) * f; cp.z = hz + (cp.z - hz) * f; cp.y = Math.max(cp.y, P.pos.y + 1.6); c.C.lookAt(hx, P.pos.y + 1.4, hz); } }
  if (fz > 0 && c.S.fog) { FOGC.copy(FNIGHT).lerp(FDAY, day); c.S.fog.density = lerp(c.S.fog.density, .0085 + (1 - day) * .004, fz); c.S.fog.color.lerp(FOGC, fz * .85); }
  // creatures (respawn empty slots)
  if (camD < 2) { for (const s of SPAWNS) { if (!s.cr) { s.cool = (s.cool || 0) - dt; if (s.cool <= 0 && Math.hypot(P.pos.x - s.x, P.pos.z - s.z) > 25) spawn(s); } }
    for (const cr of W.creatures.slice()) updCreature(cr, dt, t, P, Math.hypot(cr.x - P.pos.x, cr.z - P.pos.z)); }
  updCompanion(dt, t);
  if (W.enc) encCamera(dt);
  // tags
  for (const cr of W.creatures) { const d = Math.hypot(cr.x - P.pos.x, cr.z - P.pos.z); const s = explore && d < 14 && cr.mesh.visible && !W.enc && W.modal !== 'inspect' ? screenOf(cr.x, cr.mesh.userData.rig.h * 2.2 + .5, cr.z) : null; if (s) { cr.tag.style.display = 'block'; cr.tag.style.left = s[0] + 'px'; cr.tag.style.top = s[1] + 'px'; const txt = game.SP[cr.sp].name + ' <span class="lv">Lv ' + cr.c.lv + '</span>'; if (cr.tag.__t !== txt) { cr.tag.innerHTML = txt; cr.tag.__t = txt; } } else cr.tag.style.display = 'none'; }
  { const d = Math.hypot(MARA.x - P.pos.x, MARA.z - P.pos.z), s = explore && d < 18 && !W.modal ? screenOf(MARA.x, 2.5, MARA.z) : null; W.maraTag.style.display = s ? 'block' : 'none'; if (s) { W.maraTag.style.left = s[0] + 'px'; W.maraTag.style.top = s[1] + 'px'; const S = game.state; const mark = !S.quests.first_footfall || (S.quests.first_footfall.st === 'ready') || (S.quests.first_footfall.st === 'done' && !S.quests.a_gentle_signal) || (S.quests.a_gentle_signal && S.quests.a_gentle_signal.st === 'ready'); const txt = (mark ? '❗ ' : '') + 'Mara Venn · Trail Warden'; if (W.maraTag.textContent !== txt) W.maraTag.textContent = txt; } }
  if (compState && compState.tag) { const comp = game.activeComp(); const d = Math.hypot(compState.x - P.pos.x, compState.z - P.pos.z), s = explore && comp && d < 12 && !W.modal ? screenOf(compState.x, .9, compState.z) : null; compState.tag.style.display = s ? 'block' : 'none'; if (s) { compState.tag.style.left = s[0] + 'px'; compState.tag.style.top = s[1] + 'px'; const txt = '♥ ' + game.SP[comp.sp].name + ' Lv ' + comp.lv; if (compState.tag.textContent !== txt) compState.tag.textContent = txt; } }
  if (!nearGroup.visible) { hudT -= dt; if (hudT < 0) { hudT = .5; renderHud(); } return; }
  // Mara idles and turns toward you when you're close
  { const d = Math.hypot(MARA.x - P.pos.x, MARA.z - P.pos.z); const want = d < 10 ? Math.atan2(-(P.pos.x - MARA.x), -(P.pos.z - MARA.z)) : maraRig.userData.home ?? (maraRig.userData.home = maraRig.rotation.y); let dy = Math.atan2(Math.sin(want - maraRig.rotation.y), Math.cos(want - maraRig.rotation.y)); maraRig.rotation.y += dy * Math.min(1, dt * 3); poseWalker(maraRig, t * 2, Math.abs(dy) > .2 ? .25 : 0, t); }
  // markers: discover by walking up to them
  for (const m of beams) { const found = !!game.state.found[m.id]; m.rune.rotation.y = t * 1.5; m.rune.position.y = Math.sin(t * 2 + m.x) * .06; m.beam.material.opacity = found ? 0 : .12 + Math.sin(t * 2.4 + m.z) * .05; m.beam.visible = !found;
    if (!found && W.inForest && Math.hypot(m.x - P.pos.x, m.z - P.pos.z) < 3.4) { if (game.discover(m.id)) { AUD.sfx('discover'); const n = Object.keys(game.state.found).length; toast('Fernway marker found (' + n + '/3) · +10 XP'); embers.emit(m.x, 1.3, m.z, 40, 0x7dffb0, { up: 3, speed: 1.4, life: 1.4 }); floatText(m.x, 2, m.z, '+10 XP', 'heal'); renderHud(); } } }
  // flames flicker, embers rise from the campfire and braziers
  for (const f of flames) { const k = t * 9 + f.userData.ph; const s = 1 + Math.sin(k) * .08 + Math.sin(k * 2.3) * .05; f.scale.set(s, 1 + Math.sin(k * 1.7) * .14 + Math.sin(k * 3.1) * .06, s); f.rotation.y = k * .2; }
  if (Math.random() < dt * 9) embers.emit(FIRE.x, .5, FIRE.z, 1, 0xff8a2a, { up: 1.6, speed: .3, life: 1.8, spread: .4 });
  embers.update(dt);
  // fireflies: blink, drift; brighter at night
  { const a = flies.geometry.attributes.position, cl = flies.geometry.attributes.color, night = 1 - day; let i = 0; for (const f of W.flyData) { const b = Math.max(0, Math.sin(t * 2 * f.s + f.p)) ** 3 * (.15 + night * .9); a.setXYZ(i, f.x + Math.sin(t * .3 + f.p) * 2.5, f.y + Math.sin(t * .7 + f.p * 2) * .6, f.z + Math.cos(t * .27 + f.p) * 2.5); cl.setXYZ(i, b * .9, b, b * .35); i++; } a.needsUpdate = true; cl.needsUpdate = true; }
  // leaves fall around the camera while you're under the canopy
  { const m4 = _m4, q = _q, inF = camD < 1.02; let i = 0; const cp = c.C.position; for (const l of W.leafData) { if (inF && (l.y < 0 || Math.hypot(l.x - cp.x, l.z - cp.z) > 26)) { const a = Math.random() * 6.3, r = 2 + Math.random() * 20; l.x = cp.x + Math.cos(a) * r; l.z = cp.z + Math.sin(a) * r; l.y = 6 + Math.random() * 8; } l.ph += dt; l.y -= l.vy * dt; l.x += (Math.sin(l.ph * l.sway) * .8 + .3) * dt; l.z += Math.cos(l.ph * .7) * .4 * dt; q.setFromEuler(_eu.set(l.ph * l.spin, l.ph * .7, Math.sin(l.ph * 2) * .8)); m4.compose(_v3.set(l.x, inF ? l.y : -50, l.z), q, _one); leaves.setMatrixAt(i++, m4); } leaves.instanceMatrix.needsUpdate = true; }
  // light shafts by time of day
  for (const s of shafts.children) { s.children.forEach(p => p.material.opacity = .05 + day * .2 + Math.sin(t * .4 + s.userData.ph) * .03); s.rotation.y = Math.sin(t * .05 + s.userData.ph) * .2; }
  AUD.update(dt, day);
  regenT += dt; if (regenT > 1 && !W.enc) { game.regen(regenT); regenT = 0; }
  hudT -= dt; if (hudT < 0) { hudT = .25; renderHud(); }
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v3 = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _eu = new THREE.Euler();

// ---------------------------------------------------------------- boot
async function boot() {
  try { await loadData(); } catch (e) { console.warn('wilds data', e); return; }
  game = W.game = createGame(DATA);
  buildDom(); buildWorld();
  (window.__preRender = window.__preRender || []).push((dt, t) => { try { frame(dt, t); } catch (e) { if (!W.err) { W.err = String(e && e.stack || e).slice(0, 400); console.warn('wilds frame', e); } } });   // never let the forest break the city's render loop
  (window.__interactors = window.__interactors || []).push(interactor);
  const prevLock = window.__exploreLock; window.__exploreLock = () => !!W.modal || !!W.enc || (prevLock ? prevLock() : false);
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return; if (W.modal && encKey(e)) { e.stopPropagation(); return; } if (!W.modal && e.code === 'KeyR' && C().getMode() === 'explore') openJournal(); }, true);
  refreshCompanion(); renderHud();
  W.ready = true; W.readyAt = performance.now();
  // test hooks (Playwright): read-only views + a few shortcuts
  Object.assign(W.test, {
    state: () => ({ inForest: W.inForest, modal: W.modal, creatures: W.creatures.map(c => ({ sp: c.sp, lv: c.c.lv, x: +c.x.toFixed(1), z: +c.z.toFixed(1), st: c.st, spd: +c.spd.toFixed(2) })), trees: W.treeCount, save: JSON.parse(JSON.stringify(game.state)), comp: compState && { x: compState.x, z: compState.z, spd: compState.spd }, audio: AUD.state(), enc: W.enc && { turn: W.enc.E.turn, over: W.enc.E.over, us: W.enc.E.us.name, usHp: W.enc.E.us.hp, foeHp: W.enc.E.foe.hp, odds: game.bindOdds(W.enc.E).pct, busy: W.enc.busy } }),
    nearest: sp => { const P = C().P; let b = null; for (const c of W.creatures) if ((!sp || c.sp === sp) && c.st !== 'flee' && (!b || Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < Math.hypot(b.x - P.pos.x, b.z - P.pos.z))) b = c; return b && { sp: b.sp, x: b.x, z: b.z }; },
    walkTo: (x, z) => { const P = C().P; P.pos.set(x, 0, z); }, inspectNearest: () => { const n = nearestCreature(C().P.pos, 6); if (n) inspect(n.cr); return !!n; }, talk: talkMara, journal: openJournal, close: closeModal, travel, FC, RX, RZ, MARA, FIRE, MARKERS, GATE,
    hold: sp => { for (const c of W.creatures) if (!sp || c.sp === sp) { c.st = 'held'; c.face = c.yaw; } },
  });
}
(function wait() {
  if (Q.has('nowilds')) return;
  const c = window.__city;
  W.waitT = W.waitT || performance.now();
  if (window.__ready && c && c.colliders && c.S && ((window.__airport && window.__airport.ready) || Q.has('noairport') || performance.now() - W.waitT > 40000)) { boot().catch(e => console.warn('wilds', e)); }
  else setTimeout(wait, 400);
})();
