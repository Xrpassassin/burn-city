// Everyday city furniture along the streets: benches, planters with trees, flame streetlights, bus shelters,
// bins, hydrants, bike racks and small stepped plazas. Each prop type is ONE InstancedMesh (vertex-coloured,
// shared material), so the whole set adds roughly a dozen draw calls. Density follows the quality tier.
// Benches, planters, racks and plaza stairs/handrails are registered with the skate system, so the streets are
// skateable without looking like a skatepark. Placement is deterministic (same layout for every player).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SIDE = 5.3;   // just outside the sidewalk edge (asphalt ±2.5 m, curb, sidewalk to 4.8 m where pedestrians walk)
const COL = { metal: 0x3a3f48, steel: 0xb9c0c8, conc: 0xcfc6bb, wood: 0xa8633a, leaf: 0x3fae7a, leaf2: 0x6fd08c, trunk: 0x5a3a28, glass: 0x9fd8ff, red: 0xe0442a, cyan: 0x5fe6ff, orange: 0xff8a2a, dark: 0x22252b, white: 0xeef2f6 };

function colored(g, hex) {
  g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}
const box = (w, h, d, x, y, z, col) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cyl = (rt, rb, h, x, y, z, col, seg = 10) => colored(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), col);
const ball = (r, x, y, z, col, det = 1) => colored(new THREE.IcosahedronGeometry(r, det).translate(x, y, z), col);
const merge = parts => mergeGeometries(parts, false);

// ---- prop models (local: x = along the street, z = away from the road, y up)
const MODELS = {
  bench: () => merge([box(1.8, .08, .5, 0, .45, 0, COL.wood), box(1.8, .5, .07, 0, .72, .24, COL.wood), box(.08, .45, .45, -.8, .225, 0, COL.metal), box(.08, .45, .45, .8, .225, 0, COL.metal), box(1.82, .02, .03, 0, .49, -.25, COL.cyan)]),
  planter: () => merge([box(2.4, .55, 1.2, 0, .275, 0, COL.conc), box(2.2, .06, 1.0, 0, .55, 0, COL.trunk), cyl(.09, .12, 1.6, 0, 1.3, 0, COL.trunk, 7), ball(.95, 0, 2.45, 0, COL.leaf, 1), ball(.6, .45, 2.05, .25, COL.leaf2, 1), box(2.42, .03, .03, 0, .555, -.6, COL.steel), box(2.42, .03, .03, 0, .555, .6, COL.steel)]),
  bin: () => merge([cyl(.3, .26, .9, 0, .45, 0, COL.dark, 12), cyl(.32, .32, .08, 0, .93, 0, COL.steel, 12), cyl(.305, .305, .05, 0, .7, 0, COL.orange, 12)]),
  hydrant: () => merge([cyl(.16, .2, .62, 0, .31, 0, COL.red, 10), ball(.17, 0, .65, 0, COL.red, 1), colored(new THREE.CylinderGeometry(.07, .07, .42, 8).rotateZ(Math.PI / 2).translate(0, .42, 0), COL.steel), cyl(.21, .21, .05, 0, .05, 0, COL.dark, 10)]),
  rack: () => merge([...[-.7, -.23, .23, .7].map(x => colored(new THREE.TorusGeometry(.3, .03, 6, 12, Math.PI).translate(x, .08, 0), COL.steel)), box(1.7, .04, .04, 0, .38, 0, COL.steel)]),
  lamp: () => merge([cyl(.09, .14, 4.2, 0, 2.1, 0, COL.metal, 8), box(.03, 3, .05, 0, 2.2, -.1, COL.cyan), cyl(.22, .26, .25, 0, .12, 0, COL.dark, 8), cyl(.32, .16, .22, 0, 4.3, 0, COL.dark, 10), cyl(.34, .34, .04, 0, 4.41, 0, COL.orange, 10)]),
  shelterGlass: () => merge([colored(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(2.2, .55, 1.05).translate(0, 2.66, .2), COL.glass), box(4, 2.2, .05, 0, 1.3, 1.05, COL.glass)]),
  shelter: () => merge([box(4.2, .12, 1.8, 0, 2.6, .2, COL.steel),
    box(.08, 2.6, .08, -1.95, 1.3, .9, COL.metal), box(.08, 2.6, .08, 1.95, 1.3, .9, COL.metal), box(3.4, .08, .5, 0, .48, .65, COL.wood), box(.06, .48, .4, -1.5, .24, .65, COL.metal), box(.06, .48, .4, 1.5, .24, .65, COL.metal), box(4.2, .05, .05, 0, 2.53, -.68, COL.orange)]),
  // pocket plaza: 0.6 m raised slab with three steps on the street side and a handrail on each side of the steps
  plaza: () => merge([box(6, .6, 4, 0, .3, .9, COL.conc), ...[0, 1, 2].map(i => box(2.6, .6 - i * .2, .4, 0, (.6 - i * .2) / 2, -1.1 - i * .4 - .2, COL.conc)),
    ...[-1.45, 1.45].flatMap(x => [colored(new THREE.CylinderGeometry(.035, .035, 1.5, 8).rotateX(Math.PI / 2 - Math.atan2(.6, 1.2)).translate(x, .3 + .82, -1.7), COL.steel), cyl(.03, .03, .85, x, .425, -2.3, COL.metal, 6), cyl(.03, .03, .85, x, .6 + .425, -1.1, COL.metal, 6)]),
    box(6.02, .03, .03, 0, .6, -1.1, COL.orange), box(1.8, .08, .5, 1.6, 1.05, 2.0, COL.wood), box(1.8, .45, .5, 1.6, .825, 2.0, COL.metal)]),
};
// flames: two crossed quads, drawn additive by one instanced shader
function flameGeo() { const a = new THREE.PlaneGeometry(.55, .9).translate(0, .45, 0), b = a.clone().rotateY(Math.PI / 2); return mergeGeometries([a, b], false); }
function flameMat(U) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { t: U && U.t ? U.t : { value: 0 } },
    vertexShader: 'varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vec4 w=instanceMatrix*vec4(position,1.);vSeed=fract(instanceMatrix[3].x*.137+instanceMatrix[3].z*.071);gl_Position=projectionMatrix*viewMatrix*modelMatrix*w;}',
    fragmentShader: 'uniform float t;varying vec2 vUv;varying float vSeed;float n(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(n(i),n(i+vec2(1,0)),f.x),mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x),f.y);}void main(){vec2 u=vUv;float h=u.y;float w=1.-abs(u.x-.5)*2.;float tt=t+vSeed*10.;float fl=sn(vec2(u.x*4.,u.y*3.-tt*3.2))*.6+sn(vec2(u.x*9.,u.y*6.-tt*5.))*.4;float a=smoothstep(0.,.35,w-h*.9+fl*.45-.15)*(1.-h);vec3 col=mix(vec3(1.,.25,.03),vec3(1.,.8,.35),a);gl_FragColor=vec4(col*a*1.5,a);}'
  });
}

// deterministic hash
const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function distToStreet(st, x, z, skip) {
  let m = 1e9;
  for (const s of st) {
    if (s === skip) continue;
    if (s.type === 'ring') m = Math.min(m, Math.abs(Math.hypot(x - s.c.x, z - s.c.z) - s.r));
    else { const vx = s.b.x - s.a.x, vz = s.b.z - s.a.z, L = vx * vx + vz * vz; let t = L ? ((x - s.a.x) * vx + (z - s.a.z) * vz) / L : 0; t = Math.max(0, Math.min(1, t)); m = Math.min(m, Math.hypot(x - s.a.x - vx * t, z - s.a.z - vz * t)); }
  }
  return m;
}

function build() {
  const c = window.__city, S = c.S, st = c.streets, SK = window.__skate;
  const tier = (c.TIER || 'medium'); const spacing = tier === 'high' ? 16 : tier === 'low' ? 30 : 21;
  const lists = {}; Object.keys(MODELS).forEach(k => lists[k] = []); const flames = [];
  const taken = [];   // placed footprints {x,z,r}
  const free = (x, z, r) => {
    for (const o of c.colliders) { if (o.r > 0 && Math.abs(x - o.x) < o.r + r + 2 && Math.hypot(x - o.x, z - o.z) < o.r + r + 1.5) return false; }
    for (const o of taken) { if (Math.abs(x - o.x) < o.r + r + 1 && Math.hypot(x - o.x, z - o.z) < o.r + r + .8) return false; }
    const es = window.__estate; if (es && es.inLake && es.inLake(x, z)) return false;
    if (SK && SK.park && Math.abs(x - SK.park.x) < 28 && Math.abs(z - SK.park.z) < 25) return false;
    if (Math.abs(c.groundAt(x, z, 3)) > .15) return false;
    return true;
  };
  let slot = 0;
  for (const s of st) {
    // sample the street as a polyline
    const pts = [];
    if (s.type === 'ring') { const n = Math.max(8, Math.round(2 * Math.PI * s.r / spacing)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push({ x: s.c.x + Math.cos(a) * s.r, z: s.c.z + Math.sin(a) * s.r, tx: -Math.sin(a), tz: Math.cos(a) }); } }
    else { const L = Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z), n = Math.floor(L / spacing), tx = (s.b.x - s.a.x) / L, tz = (s.b.z - s.a.z) / L; for (let i = 1; i < n; i++) pts.push({ x: s.a.x + tx * i * spacing, z: s.a.z + tz * i * spacing, tx, tz }); }
    for (const q of pts) for (const side of [-1, 1]) {
      slot++;
      const nx = -q.tz * side, nz = q.tx * side;   // away from the road
      const x = q.x + nx * SIDE, z = q.z + nz * SIDE;
      if (distToStreet(st, x, z, s) < 7.5) continue;   // keep intersections clear
      const r = hsh(Math.round(x), Math.round(z));
      // lamps on a steady rhythm, the rest from a weighted mix
      const k = (slot % 3 === 0) ? 'lamp' : r < .2 ? 'bench' : r < .38 ? 'planter' : r < .5 ? 'bin' : r < .6 ? 'hydrant' : r < .68 ? 'rack' : r < .72 ? 'shelter' : r < .755 ? 'plaza' : null;
      if (!k) continue;
      const rad = { lamp: .4, bench: 1, planter: 1.3, bin: .4, hydrant: .3, rack: 1, shelter: 2.3, plaza: 3.4 }[k];
      const off = k === 'plaza' ? 2.2 : k === 'shelter' ? .6 : 0;   // big pieces sit a little further back
      const px = x + nx * off, pz = z + nz * off;
      if (!free(px, pz, rad)) continue;
      taken.push({ x: px, z: pz, r: rad });
      const yaw = Math.atan2(q.tx, q.tz) - Math.PI / 2;   // local x along the street, local +z away from the road (sign fixed below)
      const face = Math.atan2(nx, nz);                    // yaw so local +z points away from the road
      lists[k].push({ x: px, z: pz, yaw: face }); if (k === 'shelter') lists.shelterGlass.push({ x: px, z: pz, yaw: face });
      addPhysics(c, SK, k, px, pz, face);
      if (k === 'lamp') flames.push({ x: px, z: pz, y: 4.43 });
    }
  }
  // instanced meshes
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .35, envMapIntensity: 1 });
  const glassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .1, metalness: .2, transparent: true, opacity: .45 });
  const grp = new THREE.Group(); grp.name = 'streetprops'; S.add(grp);
  const m4 = new THREE.Matrix4(), qn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const counts = {};
  for (const k in lists) {
    const L = lists[k]; counts[k] = L.length; if (!L.length) continue;
    const im = new THREE.InstancedMesh(MODELS[k](), k === 'shelterGlass' ? glassMat : mat, L.length);
    L.forEach((o, i) => { qn.setFromAxisAngle(up, o.yaw); m4.compose(v.set(o.x, 0, o.z), qn, one); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere(); im.castShadow = tier === 'high' && (k === 'planter' || k === 'lamp'); im.receiveShadow = false; grp.add(im);
  }
  if (flames.length) {
    const fm = new THREE.InstancedMesh(flameGeo(), flameMat(c.U), flames.length);
    flames.forEach((f, i) => { m4.makeTranslation(f.x, f.y, f.z); fm.setMatrixAt(i, m4); }); fm.computeBoundingSphere(); fm.frustumCulled = false; grp.add(fm);
    // a glowing ember disc under each flame bowl reads at distance with bloom (no real lights: too costly)
  }
  window.__streetProps = { counts, total: Object.values(counts).reduce((a, b) => a + b, 0), flames: flames.length, drawCalls: grp.children.length };
}

// walking collision (small circles) + skate pieces
function addPhysics(c, SK, k, x, z, yaw) {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const W = (lx, lz) => ({ x: x + lx * cs + lz * sn, z: z - lx * sn + lz * cs });
  const col = (lx, lz, r, h) => { const p = W(lx, lz); c.colliders.push({ x: p.x, z: p.z, r, h }); };
  if (k === 'lamp') col(0, 0, .2, 4.4);
  if (k === 'bin') col(0, 0, .32, .95);
  if (k === 'hydrant') col(0, 0, .22, .7);
  if (k === 'shelter') { col(-1.95, .9, .12, 2.7); col(1.95, .9, .12, 2.7); }
  if (k === 'planter') { col(0, 0, .2, 3); }   // trunk only: the box itself is a skate ledge (height field)
  if (!SK) return;
  if (k === 'bench') SK.addPiece({ type: 'box', x, z, w: 1.8, d: .5, h: .48, yaw, grind: true, kind: 'bench' });
  if (k === 'planter') SK.addPiece({ type: 'box', x, z, w: 2.4, d: 1.2, h: .55, yaw, grind: true, kind: 'planter' });
  if (k === 'shelter') { const p = W(0, .65); SK.addPiece({ type: 'box', x: p.x, z: p.z, w: 3.4, d: .5, h: .52, yaw, grind: true, kind: 'bench' }); }
  if (k === 'rack') { const a = W(-.85, 0), b = W(.85, 0); SK.addPiece({ type: 'rail', ax: a.x, az: a.z, bx: b.x, bz: b.z, y: .4, kind: 'rack' }); }
  if (k === 'plaza') {
    const p = W(0, .9); SK.addPiece({ type: 'box', x: p.x, z: p.z, w: 6, d: 4, h: .6, yaw });
    // steps descend toward the road (local -z): stairs piece's +z is "down", so rotate by pi
    const s = W(0, -1.7); SK.addPiece({ type: 'stairs', x: s.x, z: s.z, w: 2.6, d: 1.2, h: .6, top: 0, yaw: yaw + Math.PI });
    for (const lx of [-1.45, 1.45]) { const a = W(lx, -1.1), b = W(lx, -2.3); SK.addPiece({ type: 'rail', ax: a.x, az: a.z, bx: b.x, bz: b.z, y: 1.45, y2: .85, kind: 'handrail' }); }
    const bn = W(1.6, 2.0); SK.addPiece({ type: 'box', x: bn.x, z: bn.z, w: 1.8, d: .5, h: 1.05, yaw, grind: true, kind: 'bench' });
  }
}

(function wait() {
  const c = window.__city;
  if (new URLSearchParams(location.search).has('noprops')) return;   // A/B switch for perf comparisons
  if (window.__ready && c && c.streets && c.streets.length && c.colliders.length) { try { build(); } catch (e) { console.warn('streetprops', e); } }
  else setTimeout(wait, 400);
})();
