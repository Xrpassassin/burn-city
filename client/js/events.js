// City life, dynamic layer: a road graph for routing, police cars and fire trucks that leave their stations,
// drive real streets with lights flashing, crews that step out at the scene, crimes (more frequent in districts
// whose market is red), fires lit by large sells on the live XRPL feed, ambulance calls, street shows and
// fireworks over strongly green districts. All client-side visuals; nothing is sent to the server.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EV = window.__cityEvents = { active: [], log: [], trigger: null, yieldAt: () => false };
const Q = new URLSearchParams(location.search);
const RATE = +(Q.get('eventrate') || 1);   // test hook: ?eventrate=10 makes incidents more frequent
function colored(g, hex) { g = g.index ? g.toNonIndexed() : g; const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }
const box = (w, h, d, x, y, z, col) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), col);
const cylZ = (r, w, x, y, z, col) => colored(new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, y, z), col);
const merge = a => mergeGeometries(a, false);
const wheels = (xs, zs, r = .36) => xs.flatMap(x => zs.map(z => cylZ(r, .28, x, r, z, 0x0c0c0e)));

// ------------------------------------------------------------ road graph
function streetLen(s) { return s.type === 'ring' ? 2 * Math.PI * s.r : Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z); }
function at(s, u) { if (s.type === 'ring') { const a = u * Math.PI * 2; return { x: s.c.x + Math.cos(a) * s.r, z: s.c.z + Math.sin(a) * s.r }; } return { x: s.a.x + (s.b.x - s.a.x) * u, z: s.a.z + (s.b.z - s.a.z) * u }; }
function buildGraph(st, X) {
  const nodes = [], adj = [];
  const node = (x, z) => { nodes.push({ x, z, id: nodes.length }); adj.push([]); return nodes.length - 1; };
  const xNode = new Map(); X.forEach(p => xNode.set(p, node(p.x, p.z)));
  for (const s of st) {
    const len = streetLen(s), ring = s.type === 'ring', marks = [];
    for (const p of X) if (p.s.includes(s)) marks.push({ u: p.u.get(s), id: xNode.get(p) });
    const step = 32; for (let m = ring ? 0 : 0; m <= len; m += step) { const u = Math.min(1, m / len); if (ring && u >= 1) break; if (marks.some(k => Math.abs(k.u - u) * len < 10 || (ring && Math.abs(Math.abs(k.u - u) - 1) * len < 10))) continue; const p = at(s, u); marks.push({ u, id: node(p.x, p.z) }); }
    if (!ring && !marks.some(k => k.u > .98)) { const p = at(s, 1); marks.push({ u: 1, id: node(p.x, p.z) }); }
    marks.sort((a, b) => a.u - b.u);
    const link = (A, B, u0, u1) => {
      const pts = [], segs = Math.max(1, Math.ceil(Math.abs(u1 - u0) * len / 5)); for (let i = 0; i <= segs; i++) pts.push(at(s, u0 + (u1 - u0) * i / segs));
      let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      adj[A.id].push({ to: B.id, pts, L }); adj[B.id].push({ to: A.id, pts: [...pts].reverse(), L });
    };
    for (let i = 0; i + 1 < marks.length; i++) link(marks[i], marks[i + 1], marks[i].u, marks[i + 1].u);
    if (ring && marks.length > 1) link(marks[marks.length - 1], marks[0], marks[marks.length - 1].u, marks[0].u + 1);
  }
  return { nodes, adj };
}
function mainComponent(G) {   // routing only starts/ends on the largest connected piece of the network
  const comp = new Int32Array(G.nodes.length).fill(-1); let best = 0, bestN = 0, k = 0;
  for (let i = 0; i < G.nodes.length; i++) { if (comp[i] >= 0) continue; let n = 0; const st = [i]; comp[i] = k; while (st.length) { const u = st.pop(); n++; for (const e of G.adj[u]) if (comp[e.to] < 0) { comp[e.to] = k; st.push(e.to); } } if (n > bestN) { bestN = n; best = k; } k++; }
  G.main = comp.map(c => c === best ? 1 : 0); G.comps = k; G.mainN = bestN;
}
function nearestNode(G, x, z) { let b = 0, bd = 1e18; for (const n of G.nodes) { if (G.main && !G.main[n.id]) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; b = n.id; } } return b; }
function route(G, a, b) {   // Dijkstra -> polyline of points
  const N = G.nodes.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), pe = new Array(N), done = new Uint8Array(N);
  dist[a] = 0; const open = [a];
  while (open.length) { let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i; const u = open.splice(bi, 1)[0]; if (done[u]) continue; done[u] = 1; if (u === b) break;
    for (const e of G.adj[u]) { const nd = dist[u] + e.L; if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; pe[e.to] = e; open.push(e.to); } } }
  if (!isFinite(dist[b])) return null; const chain = []; for (let v = b; v !== a; v = prev[v]) chain.push(pe[v]); chain.reverse();
  const pts = [G.nodes[a]]; for (const e of chain) for (let i = 1; i < e.pts.length; i++) pts.push(e.pts[i]); return pts;
}
// offset a polyline to the right-hand lane
function lane(pts, off) { return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: p.x - dz / l * off, z: p.z + dx / l * off }; }); }

// ------------------------------------------------------------ models
const MODELS = {
  police: () => merge([box(1.85, .55, 4.6, 0, .55, 0, 0xf2f4f6), box(1.87, .3, 1.6, 0, .6, 0, 0x14161a), box(1.6, .5, 2.2, 0, 1.05, -.2, 0x10141c), box(1.62, .05, 2.1, 0, 1.31, -.2, 0xf2f4f6), box(1.9, .12, .12, 0, .45, 2.33, 0x222222), ...wheels([-.9, .9], [-1.45, 1.45])]),
  fire: () => merge([box(2.4, 1.6, 2.6, 0, 1.3, 3.2, 0xc8201a), box(2.3, .7, 2.4, 0, 2.4, 3.3, 0x14181f), box(2.5, 2.0, 6.2, 0, 1.5, -1.3, 0xc8201a), box(2.52, .14, 6.22, 0, 1.0, -1.3, 0xf2f0e6), box(.5, .3, 6.6, -.45, 2.7, -1.1, 0xc0c4ca), box(.5, .3, 6.6, .45, 2.7, -1.1, 0xc0c4ca), ...Array.from({ length: 9 }, (_, i) => box(1.3, .08, .08, 0, 2.86, -4.1 + i * .75, 0xc0c4ca)), ...wheels([-1.15, 1.15], [3.2, -2.6, -3.6], .5)]),
  ambulance: () => merge([box(2.1, 1.0, 1.8, 0, 1.0, 2.2, 0xf4f4f2), box(2.0, .6, 1.4, 0, 1.75, 2.3, 0x10141c), box(2.2, 2.3, 3.8, 0, 1.45, -.6, 0xf4f4f2), box(2.22, .3, 3.82, 0, 1.1, -.6, 0xd8241a), box(2.22, .3, 1.82, 0, 1.1, 2.2, 0xd8241a), ...wheels([-1, 1], [2.1, -1.6], .42)]),
};
const LIGHTBAR = { police: [.95, 1.42, -.2, 1.3], fire: [1.0, 3.25, 3.4, 2.1], ambulance: [.9, 2.65, 1.1, 1.8] };
function person(kind) {
  const P = { cop: [0x1a2a4a, 0x10182a, 0x1a2a4a, 0x0c0e14], fire: [0xc8a24a, 0x2a2a2a, 0xffd23a, 0x14100a], medic: [0x2a6ad8, 0x1a2a4a, 0xf4f4f2, 0x14161a], suspect: [0x3a3a3a, 0x202020, 0x202020, 0x101010], fan: [0xe0a030, 0x22252b, 0x22252b, 0x16181e] }[kind];
  return merge([colored(new THREE.CapsuleGeometry(.21, .5, 2, 6).translate(0, 1.12, 0), P[0]), colored(new THREE.SphereGeometry(.15, 8, 6).translate(0, 1.66, 0), 0xc89a78), colored(new THREE.SphereGeometry(.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.72, 0), P[2]), box(.13, .7, .15, .1, .38, 0, P[1]), box(.13, .7, .15, -.1, .38, 0, P[1]), box(.36, .08, .2, 0, .85, 0, P[3])]);
}

// ------------------------------------------------------------ fire visuals (shader flames + smoke + light)
function flameMaterial(U) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { t: U && U.t ? U.t : { value: 0 }, k: { value: 1 } },
    vertexShader: 'varying vec2 vUv;varying float vS;void main(){vUv=uv;vec4 w=instanceMatrix*vec4(position,1.);vS=fract(instanceMatrix[3].x*.31+instanceMatrix[3].z*.17);gl_Position=projectionMatrix*viewMatrix*modelMatrix*w;}',
    fragmentShader: 'uniform float t,k;varying vec2 vUv;varying float vS;float n(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(n(i),n(i+vec2(1,0)),f.x),mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x),f.y);}void main(){vec2 u=vUv;float h=u.y;float w=1.-abs(u.x-.5)*2.;float tt=t*1.3+vS*20.;float fl=sn(vec2(u.x*3.5,u.y*2.5-tt*2.6))*.6+sn(vec2(u.x*8.,u.y*5.-tt*4.4))*.4;float a=smoothstep(0.,.3,w-h*.85+fl*.5-.12)*(1.-h)*k;vec3 col=mix(vec3(1.,.2,.02),vec3(1.,.78,.3),a);gl_FragColor=vec4(col*a*1.7,a);}' });
}

// ------------------------------------------------------------ main
function build() {
  const c = window.__city, CL = window.__cityLife, S = c.S;
  const G = buildGraph(c.streets, CL.signals || []); mainComponent(G); EV.graph = { nodes: G.nodes.length, comps: G.comps, main: G.mainN };
  const grp = new THREE.Group(); grp.name = 'cityevents'; S.add(grp);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .45 });
  const pmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, emissive: 0x0c1014 });
  const geos = { police: MODELS.police(), fire: MODELS.fire(), ambulance: MODELS.ambulance() }, pgeo = {};
  const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(.25, .45, 2.4), toneMapped: false }), red = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .15, .1), toneMapped: false });

  // ---------- toast
  const tst = document.createElement('div'); tst.id = 'cityToast'; document.body.appendChild(tst);
  const css = document.createElement('style'); css.textContent = '#cityToast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 108px);transform:translateX(-50%);z-index:6;pointer-events:none;display:flex;flex-direction:column;gap:6px;align-items:center}#cityToast div{background:rgba(12,10,14,.86);border:1px solid #ff7a1a66;color:#ffe9d2;font:600 12px/1.3 system-ui,sans-serif;padding:6px 11px;border-radius:10px;opacity:0;transition:opacity .4s;white-space:nowrap}#cityToast div.on{opacity:1}';
  document.head.appendChild(css);
  const toast = txt => { EV.log.push({ t: Date.now(), txt }); if (EV.log.length > 40) EV.log.shift(); const d = document.createElement('div'); d.textContent = txt; tst.appendChild(d); requestAnimationFrame(() => d.classList.add('on')); setTimeout(() => d.classList.remove('on'), 5200); setTimeout(() => d.remove(), 5800); while (tst.children.length > 3) tst.firstChild.remove(); };

  // ---------- vehicles parked at stations
  const vehicles = [];
  function vehicle(kind, home) {
    const g = new THREE.Group(); const body = new THREE.Mesh(geos[kind], mat); g.add(body);
    const [lx, ly, lz, w] = LIGHTBAR[kind]; const lb = new THREE.Mesh(new THREE.BoxGeometry(w / 2, .16, .3), blue), lr = new THREE.Mesh(new THREE.BoxGeometry(w / 2, .16, .3), red); lb.position.set(-w / 4, ly, lz); lr.position.set(w / 4, ly, lz); g.add(lb, lr);
    const v = { kind, g, lb, lr, home, state: 'parked', path: null, i: 0, sp: kind === 'fire' ? 15 : 18, crew: [], siren: false };
    park(v); grp.add(g); vehicles.push(v); return v;
  }
  function park(v) { const h = v.home; v.g.position.set(h.x, .02, h.z); v.g.rotation.y = h.yaw; v.state = 'parked'; v.siren = false; v.lb.visible = v.lr.visible = false; }
  const homes = [];
  // vehicles park nose-out on their station's apron, never on the street
  const bay = (st, i, fb) => st && st.bays && st.bays[i] ? { ...st.bays[i], st } : fb;
  if (CL.police) for (let i = 0; i < 2; i++) homes.push(['police', bay(CL.police, i)]);
  if (CL.fire) homes.push(['fire', bay(CL.fire, 0)]);
  if (CL.ems) { homes.push(['ambulance', bay(CL.ems, 0)]); homes.push(['ambulance', bay(CL.ems, 1)]); }
  else if (CL.fire) homes.push(['ambulance', bay(CL.fire, 1)]);
  homes.forEach(([k, h]) => vehicle(k, h));

  // ---------- people (individual small meshes, pooled)
  const people = [];
  function spawnPerson(kind, x, z) { if (!pgeo[kind]) pgeo[kind] = person(kind); const m = new THREE.Mesh(pgeo[kind], pmat); m.position.set(x, 0, z); grp.add(m); const p = { kind, m, tgt: null, sp: 1.6, ph: Math.random() * 6 }; people.push(p); return p; }
  function removePerson(p) { grp.remove(p.m); const i = people.indexOf(p); if (i >= 0) people.splice(i, 1); }

  // ---------- scene props: fires, crime markers, crowds, fireworks
  const fireMat = flameMaterial(c.U), flameGeo = (() => { const a = new THREE.PlaneGeometry(1, 1.6).translate(0, .8, 0), b = a.clone().rotateY(Math.PI / 2); return mergeGeometries([a, b]); })();
  const smokeTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(70,64,60,.9)'); gr.addColorStop(1, 'rgba(70,64,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  function makeFire(x, z, size) {
    const n = 14, im = new THREE.InstancedMesh(flameGeo, fireMat.clone(), n), m4 = new THREE.Matrix4(), scl = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = Math.random() * size, s = (1.2 + Math.random() * 1.8) * (1 - r / size * .5); scl.push(s); m4.compose(new THREE.Vector3(x + Math.cos(a) * r, 0, z + Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 3), new THREE.Vector3(s * 1.3, s * 1.6, s * 1.3)); im.setMatrixAt(i, m4); }
    im.frustumCulled = false; grp.add(im);
    const smoke = []; for (let i = 0; i < 10; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: .5 })); sp.position.set(x, 2 + i * 2.2, z); sp.userData.o = i * 2.2; grp.add(sp); smoke.push(sp); }
    const light = new THREE.PointLight(0xff6a1a, 120, 40, 1.8); light.position.set(x, 3, z); grp.add(light);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(size + 1.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0a0806, transparent: true, opacity: .7, depthWrite: false })); scorch.position.set(x, .13, z); grp.add(scorch);
    return { im, smoke, light, scorch, k: 1, x, z };
  }
  function removeFire(f) { [f.im, f.light, f.scorch, ...f.smoke].forEach(o => grp.remove(o)); f.im.material.dispose(); }
  function water(from, to) {   // hose stream: short-lived points arc
    const n = 60, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fd8ff, size: .35, transparent: true, opacity: .8, depthWrite: false })); pts.frustumCulled = false; grp.add(pts);
    return { pts, from, to, t: 0 };
  }
  function ring(x, z, col) { const m = new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .8, depthWrite: false, toneMapped: false })); m.position.set(x, .15, z); grp.add(m); return m; }

  // ---------- dispatch: route a vehicle to a scene and back
  function dispatch(v, x, z, onArrive) {
    const a = nearestNode(G, v.home.x, v.home.z), b = nearestNode(G, x, z); const pts = route(G, a, b); if (!pts) return false;
    const path = [{ x: v.home.x, z: v.home.z }, ...lane(pts, 1.3)];
    // pull up beside the scene
    const last = path[path.length - 1], dx = x - last.x, dz = z - last.z, d = Math.hypot(dx, dz); if (d > 3) path.push({ x: last.x + dx / d * Math.min(d - 4, 3.2), z: last.z + dz / d * Math.min(d - 4, 3.2) });
    v.path = path; v.i = 0; v.state = 'out'; v.siren = true; v.onArrive = onArrive; v.scene = { x, z }; v.trips = (v.trips || 0) + 1; return true;
  }
  function goHome(v) { const a = nearestNode(G, v.g.position.x, v.g.position.z), b = nearestNode(G, v.home.x, v.home.z), pts = route(G, a, b); v.path = [{ x: v.g.position.x, z: v.g.position.z }, ...(pts ? lane(pts, 1.3) : []), { x: v.home.x, z: v.home.z }]; v.i = 0; v.state = 'back'; v.siren = false; v.lb.visible = v.lr.visible = false; }
  function drive(v, dt) {
    if (!v.path) return;
    let move = v.sp * dt * (v.state === 'back' ? .8 : 1);
    while (move > 0 && v.i < v.path.length - 1) {
      const a = v.g.position, b = v.path[v.i + 1], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d <= move) { a.x = b.x; a.z = b.z; v.i++; move -= d; }
      else { a.x += dx / d * move; a.z += dz / d * move; move = 0; }
      if (d > .05) { const want = Math.atan2(dx, dz); let dy = want - v.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); v.g.rotation.y += dy * Math.min(1, dt * 8); }
    }
    if (v.i >= v.path.length - 1) { v.path = null; if (v.state === 'out') { v.state = 'scene'; v.onArrive && v.onArrive(v); } else if (v.state === 'back') park(v); }
  }
  EV.yieldAt = (x, z) => { for (const v of vehicles) if (v.siren && v.state === 'out') { const p = v.g.position; if (Math.abs(p.x - x) < 28 && Math.abs(p.z - z) < 28) return true; } return false; };

  // ---------- incident location: a sidewalk spot near a district (or a given point)
  const districts = () => Object.values(c.N || {}).filter(n => n && n.pos && n.name !== 'XRP');
  function spotNear(x0, z0, maxR = 110) {
    const cand = [];
    for (const s of c.streets) { const len = streetLen(s); for (let m = 4; m < len - 4; m += 8) { const u = m / len, p = at(s, u); if (Math.hypot(p.x - x0, p.z - z0) > maxR) continue; cand.push({ s, u, p, len }); } }
    for (let k = 0; k < 30 && cand.length; k++) {
      const { s, u, p, len } = cand[(Math.random() * cand.length) | 0], p2 = at(s, Math.min(1, u + 1 / len)), tx = p2.x - p.x, tz = p2.z - p.z, l = Math.hypot(tx, tz) || 1, side = Math.random() < .5 ? 1 : -1;
      const x = p.x - tz / l * 5.2 * side, z = p.z + tx / l * 5.2 * side; let bad = false; for (const o of c.colliders) if (o.r > 0 && Math.hypot(x - o.x, z - o.z) < o.r + 1.2) { bad = true; break; } if (!bad) return { x, z };
    }
    return null;
  }
  function weightedDistrict(fn) { const ds = districts(); if (!ds.length) return null; const w = ds.map(fn), tot = w.reduce((a, b) => a + b, 0); let r = Math.random() * tot; for (let i = 0; i < ds.length; i++) { r -= w[i]; if (r <= 0) return ds[i]; } return ds[ds.length - 1]; }
  const chg = n => (typeof n.pro24h === 'number' ? n.pro24h : 0);

  // ---------- incident types
  const CRIMES = ['Robbery', 'Car break-in', 'Shoplifting', 'Vandalism', 'Pickpocket', 'Street fight'];
  function crime(dist) {
    const v = vehicles.find(x => x.kind === 'police' && x.state === 'parked'); if (!v) return false;
    const d = dist || weightedDistrict(n => 1 + Math.max(0, -chg(n)) * 1.6); if (!d) return false;
    const sp = spotNear(d.pos.x, d.pos.z); if (!sp) return false;
    const what = CRIMES[(Math.random() * CRIMES.length) | 0];
    const inc = { type: 'crime', x: sp.x, z: sp.z, t: 0, mark: ring(sp.x, sp.z, 0x4a7aff), suspect: spawnPerson('suspect', sp.x + 1, sp.z), v, dname: d.name };
    if (!dispatch(v, sp.x, sp.z, veh => { inc.phase = 'scene'; inc.t = 0; const p = veh.g.position; veh.crew = [spawnPerson('cop', p.x + 1.2, p.z), spawnPerson('cop', p.x - 1.2, p.z)]; veh.crew.forEach((cp, i) => cp.tgt = { x: sp.x + (i ? -1 : 1) * .9, z: sp.z + .8 }); })) { removePerson(inc.suspect); grp.remove(inc.mark); return false; }
    inc.phase = 'enroute'; EV.active.push(inc); toast(`🚨 ${what} reported in ${d.name}${chg(d) < 0 ? ` (red market ${chg(d).toFixed(1)}%)` : ''}. Units responding.`); return true;
  }
  function fire(dist, why) {
    if (EV.active.some(a => a.type === 'fire')) return false;
    const v = vehicles.find(x => x.kind === 'fire' && x.state === 'parked'); if (!v) return false;
    const d = dist || weightedDistrict(n => 1); if (!d) return false; const sp = spotNear(d.pos.x, d.pos.z); if (!sp) return false;
    const inc = { type: 'fire', x: sp.x, z: sp.z, t: 0, f: makeFire(sp.x, sp.z, 2.4), v, dname: d.name, hoses: [] };
    if (!dispatch(v, sp.x, sp.z, veh => { inc.phase = 'scene'; inc.t = 0; const p = veh.g.position; veh.crew = [spawnPerson('fire', p.x + 1.5, p.z + 1), spawnPerson('fire', p.x - 1.5, p.z + 1)]; veh.crew.forEach((cp, i) => cp.tgt = { x: sp.x + (i ? -1 : 1) * 3.2, z: sp.z + 3.2 }); })) { removeFire(inc.f); return false; }
    inc.phase = 'enroute'; EV.active.push(inc); toast(`🔥 Fire in ${d.name}${why ? ' · ' + why : ''}. Engine 1 responding.`); lastFire = performance.now(); return true;
  }
  function medical() {
    const v = vehicles.find(x => x.kind === 'ambulance' && x.state === 'parked'); if (!v) return false;
    const d = weightedDistrict(() => 1); const sp = d && spotNear(d.pos.x, d.pos.z, 120); if (!sp) return false;
    const inc = { type: 'medical', x: sp.x, z: sp.z, t: 0, patient: spawnPerson('fan', sp.x, sp.z), v, dname: d.name, mark: ring(sp.x, sp.z, 0xff3a3a) };
    inc.patient.m.rotation.z = Math.PI / 2; inc.patient.m.position.y = .22;
    if (!dispatch(v, sp.x, sp.z, veh => { inc.phase = 'scene'; inc.t = 0; const p = veh.g.position; veh.crew = [spawnPerson('medic', p.x + 1.2, p.z), spawnPerson('medic', p.x - 1.2, p.z)]; veh.crew.forEach((cp, i) => cp.tgt = { x: sp.x + (i ? -.8 : .8), z: sp.z + .6 }); })) { removePerson(inc.patient); grp.remove(inc.mark); return false; }
    inc.phase = 'enroute'; EV.active.push(inc); toast(`🚑 Medical call in ${d.name}. Ambulance on the way.`); return true;
  }
  function show() {   // a street performer draws a crowd for a minute
    if (EV.active.some(a => a.type === 'show')) return false;
    const d = weightedDistrict(n => 1 + Math.max(0, chg(n))); const sp = d && spotNear(d.pos.x, d.pos.z, 120); if (!sp) return false;
    const perf = spawnPerson('fan', sp.x, sp.z), crowd = []; for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, p = spawnPerson('fan', sp.x + Math.cos(a) * 9, sp.z + Math.sin(a) * 9); p.m.material = pmat; p.tgt = { x: sp.x + Math.cos(a) * 2.6, z: sp.z + Math.sin(a) * 2.6 }; p.sp = .9 + Math.random() * .4; crowd.push(p); }
    EV.active.push({ type: 'show', x: sp.x, z: sp.z, t: 0, perf, crowd, dname: d.name }); toast(`🎸 Street show drawing a crowd in ${d.name}.`); return true;
  }
  // fireworks over a strongly green district
  const fwPool = []; function fireworks(dist) {
    const d = dist || weightedDistrict(n => Math.max(0, chg(n)) ** 2 + .01); if (!d) return false;
    for (let k = 0; k < 5; k++) setTimeout(() => {
      const n = 80, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = []; const cx = d.pos.x + (Math.random() - .5) * 40, cy = 55 + Math.random() * 25, cz = d.pos.z + (Math.random() - .5) * 40;
      for (let i = 0; i < n; i++) { pos.set([cx, cy, cz], i * 3); const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1), s = 9 + Math.random() * 5; vel.push(Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s, Math.sin(ph) * Math.sin(th) * s); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const col = new THREE.Color().setHSL(Math.random(), 1, .6).multiplyScalar(2);
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 1.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); p.frustumCulled = false; grp.add(p); fwPool.push({ p, vel, t: 0 });
    }, k * 700);
    toast(`🎆 Fireworks over ${d.name}${chg(d) > 0 ? ` · market +${chg(d).toFixed(1)}%` : ''}`); EV.fireworks = (EV.fireworks || 0) + 1; return true;
  }
  EV.trigger = (type, name) => { const d = name && c.N ? c.N[name] : null; return ({ crime: () => crime(d), fire: () => fire(d, 'test'), medical, show, fireworks: () => fireworks(d) })[type]?.(); };

  // ---------- live feed: large sells start fires in the sold token's district
  let lastFire = 0;
  window.__cityEvent = (type, e, kind) => {
    if (type !== 'swap' || !e) return;
    const big = kind === 'big' || kind === 'whale'; if (!big) return;
    const sold = e.to === 'XRP' && e.from && e.from !== 'XRP' ? e.from : null; if (!sold) return;
    if (performance.now() - lastFire < 90000 / RATE) return;
    const d = c.N && c.N[sold]; if (d) fire(d, `large ${sold} sell (${Math.round(e.xrp).toLocaleString()} XRP)`);
  };

  // ---------- scheduler: crimes weighted by red markets, occasional medical calls, shows, fireworks
  let nextCrime = 25 + Math.random() * 40, nextMed = 90 + Math.random() * 120, nextShow = 60 + Math.random() * 90, nextFw = 150 + Math.random() * 200, nextFallbackFire = 420;
  const redness = () => { const ds = districts(); if (!ds.length) return 0; return ds.filter(n => chg(n) < 0).length / ds.length; };
  const clk = new THREE.Clock(); let T = 0;
  function update() {
    const dt = Math.min(clk.getDelta(), .05) * RATE; T += dt; const t = performance.now() / 1000;
    if (T > nextCrime) { crime(); nextCrime = T + (70 + Math.random() * 90) * (1.2 - redness() * .7); }
    if (T > nextMed) { medical(); nextMed = T + 160 + Math.random() * 200; }
    if (T > nextShow) { show(); nextShow = T + 180 + Math.random() * 240; }
    if (T > nextFw) { const green = districts().filter(n => chg(n) > 4); if (green.length) fireworks(green[(Math.random() * green.length) | 0]); nextFw = T + 240 + Math.random() * 300; }
    if (T > nextFallbackFire) { if (performance.now() - lastFire > 480000 / RATE) fire(null, null); nextFallbackFire = T + 300; }
    // vehicles
    const flash = Math.floor(t * 6) % 2;
    for (const v of vehicles) { drive(v, dt); if (v.siren) { v.lb.visible = !!flash; v.lr.visible = !flash; } }
    // people walk to their targets
    for (const p of people) { if (!p.tgt) continue; const dx = p.tgt.x - p.m.position.x, dz = p.tgt.z - p.m.position.z, d = Math.hypot(dx, dz); if (d > .08) { const s = Math.min(d, p.sp * dt); p.m.position.x += dx / d * s; p.m.position.z += dz / d * s; p.m.rotation.y = Math.atan2(dx, dz); p.m.position.y = Math.abs(Math.sin(t * 9 + p.ph)) * .05; } else { p.tgt = null; p.m.position.y = 0; if (p.done) p.done(); } }
    // incidents
    for (let i = EV.active.length - 1; i >= 0; i--) {
      const a = EV.active[i]; a.t += dt;
      if (a.mark) { a.mark.material.opacity = .45 + .4 * Math.sin(t * 6); a.mark.material.color.setHex(Math.floor(t * 3) % 2 ? 0xff3a3a : 0x3a6aff); }
      if (a.type === 'crime') {
        if (a.phase === 'enroute' && a.suspect && Math.random() < dt * .5) { a.suspect.m.rotation.y += 1; }
        if (a.phase === 'scene') { if (a.suspect) { const l = a.suspect.m; l.rotation.y = Math.atan2(a.v.g.position.x - l.position.x, a.v.g.position.z - l.position.z); } if (a.t > 14 && !a.leaving) { a.leaving = 1; const p = a.v.g.position; a.v.crew.forEach((cp, j) => { cp.tgt = { x: p.x + (j ? -1.2 : 1.2), z: p.z }; }); if (a.suspect) a.suspect.tgt = { x: p.x, z: p.z + .6 }; }
          if (a.leaving && a.t > 22) { a.v.crew.forEach(removePerson); a.v.crew = []; if (a.suspect) removePerson(a.suspect); grp.remove(a.mark); goHome(a.v); EV.active.splice(i, 1); EV.done = (EV.done || 0) + 1; toast(`🚓 ${a.dname}: suspect in custody.`); } }
      } else if (a.type === 'fire') {
        const f = a.f; f.smoke.forEach(sp => { sp.userData.o = (sp.userData.o + dt * 2.6) % 22; sp.position.y = 2 + sp.userData.o; const s = 2 + sp.userData.o * .5; sp.scale.set(s, s, s); sp.material.opacity = .55 * (1 - sp.userData.o / 22) * Math.max(.15, f.k); });
        f.light.intensity = 90 * f.k * (.8 + .4 * Math.sin(t * 17) * Math.sin(t * 7)); f.im.material.uniforms.k.value = f.k;
        if (a.phase === 'scene') {
          if (a.t > 3 && !a.hoses.length) a.hoses = a.v.crew.map(cp => water(cp.m.position, { x: a.x, z: a.z }));
          a.hoses.forEach(h => { h.t += dt; const P = h.pts.geometry.attributes.position; for (let j = 0; j < 60; j++) { const u = ((h.t * 1.6 + j / 60) % 1), sx = h.from.x, sz = h.from.z, ex = h.to.x + Math.sin(j) * .6, ez = h.to.z + Math.cos(j) * .6; P.setXYZ(j, sx + (ex - sx) * u, 1.2 + Math.sin(u * Math.PI) * 2.2 - u * .9, sz + (ez - sz) * u); } P.needsUpdate = true; });
          if (a.t > 3) f.k = Math.max(0, f.k - dt / 22);
          if (f.k <= 0 && !a.out) { a.out = 1; a.t2 = a.t; a.hoses.forEach(h => grp.remove(h.pts)); a.hoses = []; const p = a.v.g.position; a.v.crew.forEach((cp, j) => cp.tgt = { x: p.x + (j ? -1.5 : 1.5), z: p.z + 1 }); toast(`🧯 ${a.dname}: fire's out.`); }
          if (a.out && a.t - a.t2 > 6) { a.v.crew.forEach(removePerson); a.v.crew = []; removeFire(f); goHome(a.v); EV.active.splice(i, 1); EV.done = (EV.done || 0) + 1; }
        }
      } else if (a.type === 'medical') {
        if (a.phase === 'scene' && a.t > 12 && !a.loaded) { a.loaded = 1; removePerson(a.patient); a.patient = null; const p = a.v.g.position; a.v.crew.forEach((cp, j) => cp.tgt = { x: p.x + (j ? -1.2 : 1.2), z: p.z }); }
        if (a.loaded && a.t > 18) { a.v.crew.forEach(removePerson); a.v.crew = []; grp.remove(a.mark); goHome(a.v); EV.active.splice(i, 1); EV.done = (EV.done || 0) + 1; }
      } else if (a.type === 'show') {
        a.perf.m.rotation.y += dt * 2; a.perf.m.position.y = Math.abs(Math.sin(t * 6)) * .25;
        if (a.t > 70) { a.crowd.forEach(removePerson); removePerson(a.perf); EV.active.splice(i, 1); }
      }
    }
    // fireworks particles
    for (let i = fwPool.length - 1; i >= 0; i--) { const f = fwPool[i]; f.t += dt; const P = f.p.geometry.attributes.position; for (let j = 0; j < f.vel.length / 3; j++) { f.vel[j * 3 + 1] -= 9.8 * dt * .4; P.setXYZ(j, P.getX(j) + f.vel[j * 3] * dt, P.getY(j) + f.vel[j * 3 + 1] * dt, P.getZ(j) + f.vel[j * 3 + 2] * dt); } P.needsUpdate = true; f.p.material.opacity = Math.max(0, 1 - f.t / 2.2); if (f.t > 2.2) { grp.remove(f.p); f.p.geometry.dispose(); fwPool.splice(i, 1); } }
  }
  (function tick() { requestAnimationFrame(tick); if (!document.hidden) update(); })();
  EV.vehicles = () => vehicles.map(v => ({ kind: v.kind, state: v.state, x: +v.g.position.x.toFixed(1), z: +v.g.position.z.toFixed(1), trips: v.trips || 0, crew: v.crew.length }));
  EV.ready = true;
}

(function wait() {
  const CL = window.__cityLife;
  if (new URLSearchParams(location.search).has('nolife')) return;
  if (window.__ready && CL && CL.ready && window.__city) { try { build(); } catch (e) { console.warn('cityevents', e); } }
  else setTimeout(wait, 400);
})();
