// The ruin of Vael Ithren: geometry, PBR stone, lumen crystals and torches, fog shafts, dust, traps, gates, chests, props.
// Everything created here is tracked in W.disposables and released by dispose().
import * as THREE from 'three';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as MAP from './ruin-map.mjs';
const T = MAP.TILE;
export const wx = v => v * T;   // tile -> world

// ------------------------------------------------------------------ small fx helpers
export function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
let GLOW = null; export function glowTex() { return GLOW || (GLOW = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.22, 'rgba(255,255,255,.55)'); r.addColorStop(.55, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); })); }
export function glow(color, size, opacity = .8) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })); s.scale.set(size, size, 1); return s; }
export function flame(scale = 1, blue = false) {
  const g = new THREE.Group(), cols = blue ? [0x2a6cff, 0x7fb4ff, 0xe8f4ff] : [0xff3a08, 0xff8a1a, 0xfff0b0];
  const mk = (r, h, col, o) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1, true).translate(0, h / 2, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); g.add(m); };
  mk(.16 * scale, .5 * scale, cols[0], .55); mk(.11 * scale, .38 * scale, cols[1], .75); mk(.055 * scale, .22 * scale, cols[2], .95);
  const gl = glow(blue ? 0x8fc0ff : 0xffa040, 1.5 * scale, .55); gl.position.y = .2 * scale; g.add(gl); g.userData.seed = Math.random() * 100; return g;
}
function triUV(geo, s = 1) {   // world-space box-projected UVs
  geo = geo.index ? geo.toNonIndexed() : geo; geo.computeVertexNormals(); const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv[i * 2] = u / s; uv[i * 2 + 1] = v / s; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
function fluted(r, h, flutes = 16, seg = 48) { const g = new THREE.CylinderGeometry(r, r * 1.04, h, seg, 1, false).translate(0, h / 2, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z); if (rr < .01) continue; const k = 1 - .06 * Math.max(0, Math.cos(a * flutes)) ** 2; p.setX(i, x * k); p.setZ(i, z * k); } g.computeVertexNormals(); return g; }
function pointedArchShape(w, spring, apex, thick) {   // ring between outer and inner pointed arch, as an extrudable Shape
  const s = new THREE.Shape(), o = w / 2 + thick, i = w / 2, arc = (hw, sp, ap, rev) => { const pts = []; const R = ((ap - sp) ** 2 + hw * hw) / (2 * hw); for (let k = 0; k <= 12; k++) { const t = k / 12, ang = Math.asin(Math.min(1, (ap - sp) / R)) * t; pts.push([-(hw - R + R * Math.cos(ang)) , sp + R * Math.sin(ang)]); } const right = pts.map(([x, y]) => [-x, y]).reverse(); const all = [...pts, ...right]; return rev ? all.reverse() : all; };
  const outer = arc(o, spring, apex + thick * .8), inner = arc(i, spring, apex, true);
  s.moveTo(-o, 0); for (const [x, y] of outer) s.lineTo(x, y); s.lineTo(o, 0); s.lineTo(i, 0); for (const [x, y] of inner) s.lineTo(x, y); s.lineTo(-i, 0); s.lineTo(-o, 0); return s;
}

// ------------------------------------------------------------------ build
export async function buildWorld(ctx) {
  const { scene, tier, gltf, loadTex, onProgress = () => { } } = ctx;
  const W = { disposables: [], flames: [], sources: [], interact: [], chests: {}, peds: [], traps: [], shafts: [], crystals: [], t: 0 };
  const keep = o => { W.disposables.push(o); return o; };
  const root = new THREE.Group(); root.name = 'ruin'; scene.add(root); W.root = root;
  const g = MAP.buildGrid(); W.grid = g; W.block = MAP.pillarSet();
  for (const t of [...MAP.GATE.tiles]) W.block.add(t.join(','));
  const low = tier === 'low', hi = tier === 'high';
  // ---- materials (Poly Haven PBR: diffuse + normal + ARM; low tier: 512 diffuse only)
  const TX = 'assets/tex/';
  async function pbr(name, rep, o = {}) {
    const [map, nor, arm] = await Promise.all([loadTex(TX + name + (low ? '_diff-512' : '_diff') + '.webp', true), low ? null : loadTex(TX + name + '_nor.webp', false), low ? null : loadTex(TX + name + '_arm.webp', false)]);
    const m = keep(new THREE.MeshStandardMaterial({ map, normalMap: nor, aoMap: arm, roughnessMap: arm, roughness: o.rough ?? 1, metalness: 0, color: o.color ?? 0xffffff, side: o.side ?? THREE.FrontSide }));
    if (nor) m.normalScale.set(o.ns ?? 1.3, o.ns ?? 1.3); if (arm) m.aoMapIntensity = .8; m.userData.rep = rep; return m;
  }
  const M = W.M = {};
  M.wall = await pbr('white_sandstone_blocks_02', 3, { color: 0xe8ddcc }); onProgress(.08);
  M.floor = await pbr('stone_tiles_02', 3, { color: 0xd6cfc4, ns: 1 }); onProgress(.12);
  M.rock = await pbr('rock_wall_08', 4, { color: 0x6a625a, side: THREE.DoubleSide }); onProgress(.16);
  M.marble = await pbr('marble_01', 2, { color: 0xf2ece2, rough: .85 }); onProgress(.2);
  M.marbleD = M.marble.clone(); M.marbleD.side = THREE.DoubleSide; keep(M.marbleD);
  M.iron = keep(new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: .5, metalness: .8 }));
  M.gilt = keep(new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: .35, metalness: 1 }));
  M.crystal = keep(new THREE.MeshStandardMaterial({ color: 0xcfe6ff, emissive: 0x7fb8ff, emissiveIntensity: 1.6, roughness: .15, metalness: 0, transparent: true, opacity: .92 }));
  M.crystalDim = keep(new THREE.MeshStandardMaterial({ color: 0x5a6a80, emissive: 0x1a2a44, emissiveIntensity: .6, roughness: .3, metalness: 0 }));
  M.heart = keep(new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff5a20, emissiveIntensity: 1.2, roughness: .2 }));
  const wallM = M.wall, floorM = M.floor;

  // ---- floor, ceiling, walls, lintels from the grid
  const fl = [], ce = [], wl = [], trim = [], pil = [], doorEdges = [], wallEdges = [];
  const quad = (arr, a, b, c, d, n, uv) => arr.push([a, b, c, d, n, uv]);
  const isArena = i => MAP.ROOMS[g.room[i]] && MAP.ROOMS[g.room[i]].id === 'arena';
  const DIRS = [[0, -1, 0, 0, 1, 0, 0, 1], [0, 1, 0, 1, 1, 1, 0, -1], [-1, 0, 0, 0, 0, 1, 1, 0], [1, 0, 1, 0, 1, 1, -1, 0]];  // dx,dz, edge p0(x,z), p1(x,z), normal(x,z)
  for (let z = 0; z < MAP.H; z++) for (let x = 0; x < MAP.W; x++) {
    const i = z * MAP.W + x; if (!g.floor[i]) continue; const h = g.ceil[i], X = x * T, Z = z * T, arena = isArena(i), R = MAP.ROOMS[g.room[i]];
    quad(fl, [X, 0, Z], [X, 0, Z + T], [X + T, 0, Z + T], [X + T, 0, Z], [0, 1, 0]);
    if (!arena) quad(ce, [X, h, Z], [X + T, h, Z], [X + T, h, Z + T], [X, h, Z + T], [0, -1, 0]);
    for (const [dx, dz, ax, az, bx, bz, nx, nz] of DIRS) {
      const xx = x + dx, zz = z + dz, j = zz * MAP.W + xx, nfloor = MAP.inside(xx, zz) && g.floor[j];
      const p0 = [X + ax * T, Z + az * T], p1 = [X + bx * T, Z + bz * T];
      if (!nfloor) { if (arena) continue; wallEdges.push({ p0, p1, n: [nx, nz], h, room: R.id, corr: !!R.corr, x, z }); }
      else if (g.ceil[j] < h - .01 && !arena) { const lo = g.ceil[j]; quad(wl, [p0[0], lo, p0[1]], [p0[0], h, p0[1]], [p1[0], h, p1[1]], [p1[0], lo, p1[1]], [nx, 0, nz]); if (!R.corr && MAP.ROOMS[g.room[j]].corr) doorEdges.push({ p0, p1, n: [nx, nz], lo, room: R.id }); }
    }
  }
  for (const e of wallEdges) { const { p0, p1, n, h } = e; quad(wl, [p0[0], 0, p0[1]], [p0[0], h, p0[1]], [p1[0], h, p1[1]], [p1[0], 0, p1[1]], [n[0], 0, n[1]]); }
  function quadsToGeo(qs, rep) {
    const pos = [], nor = [], uv = [], idx = []; let v = 0;
    for (const [a, b, c, d, n] of qs) { for (const p of [a, b, c, d]) { pos.push(...p); nor.push(...n); const ay = Math.abs(n[1]) > .5; uv.push(ay ? p[0] / rep : (Math.abs(n[0]) > .5 ? p[2] : p[0]) / rep, ay ? p[2] / rep : p[1] / rep); } 
      // winding: make the face front side point along n
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], dot = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2];
      if (dot > 0) idx.push(v, v + 1, v + 2, v, v + 2, v + 3); else idx.push(v, v + 2, v + 1, v, v + 3, v + 2); v += 4; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); return keep(geo);
  }
  const add = (geo, mat, cast = false, recv = true) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = recv; m.castShadow = cast; root.add(m); return m; };
  add(quadsToGeo(fl, 3), floorM); add(quadsToGeo(ce, 4), M.rock); add(quadsToGeo(wl, 3), wallM);
  onProgress(.26);
  // ---- trim: plinth + cornice along walls, pilasters, ribbed vaults, door arches
  for (const e of wallEdges) {
    const { p0, p1, n, h } = e, len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2, along = Math.abs(n[0]) > .5 ? 'z' : 'x';
    const box = (w, hh, d, y, off) => { const b = along === 'x' ? new THREE.BoxGeometry(w, hh, d) : new THREE.BoxGeometry(d, hh, w); b.translate(cx + n[0] * off, y, cz + n[1] * off); return b; };
    trim.push(box(len + .02, .42, .16, .21, .08)); trim.push(box(len + .02, .1, .24, .47, .1));
    if (!e.corr) { trim.push(box(len + .02, .32, .26, h - .5, .13)); trim.push(box(len + .02, .14, .34, h - .3, .17)); }
    if (!e.corr && ((e.x * 7 + e.z * 3) % 3 === 0)) { const pw = .72; const b = box(pw, h - .9, .3, (h - .9) / 2 + .42, .15); pil.push(b); }
  }
  // ribs across tall rooms
  for (const R of MAP.ROOMS) { if (!R.r || R.corr || R.h < 7) continue; const [x0, z0, x1, z1] = R.r, w = (x1 - x0 + 1) * T, d = (z1 - z0 + 1) * T, alongX = w < d;
    const n = Math.floor((alongX ? d : w) / 4); for (let k = 1; k < n; k++) { const b = alongX ? new THREE.BoxGeometry(w, .5, .55) : new THREE.BoxGeometry(.55, .5, d); b.translate(alongX ? x0 * T + w / 2 : x0 * T + k * 4, R.h - .25, alongX ? z0 * T + k * 4 : z0 * T + d / 2); trim.push(b); } }
  // pointed arches on the room side of every corridor mouth (group the 2-tile openings)
  const arches = []; const seen = new Set();
  for (const e of doorEdges) { const key = e.room + (Math.abs(e.n[0]) > .5 ? 'x' + e.p0[0] : 'z' + e.p0[1]); if (seen.has(key)) continue; const grp = doorEdges.filter(o => o.room === e.room && o.n[0] === e.n[0] && o.n[1] === e.n[1] && (Math.abs(e.n[0]) > .5 ? o.p0[0] === e.p0[0] : o.p0[1] === e.p0[1])); seen.add(key);
    const xs = grp.flatMap(o => [o.p0[0], o.p1[0]]), zs = grp.flatMap(o => [o.p0[1], o.p1[1]]); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, wid = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const geo = new THREE.ExtrudeGeometry(pointedArchShape(wid - .2, e.lo - 1.7, e.lo - .05, .5), { depth: .45, bevelEnabled: false, curveSegments: 4 }); geo.translate(0, 0, -.05); geo.rotateY(Math.atan2(e.n[0], e.n[1])); geo.translate(cx, 0, cz); arches.push(triUV(geo, 1.6));
    for (const s of [-1, 1]) { const side = Math.abs(e.n[0]) > .5 ? [0, s] : [s, 0]; const col = fluted(.26, e.lo - 1.7, 12, 24); col.translate(cx + side[0] * (wid / 2 + .05) + e.n[0] * .2, 0, cz + side[1] * (wid / 2 + .05) + e.n[1] * .2); arches.push(triUV(col, 1.6)); }
  }
  const tGeo = keep(BGU.mergeGeometries([...trim.map(b => triUV(b, 2)), ...pil.map(b => triUV(b, 2)), ...arches], false)); add(tGeo, M.marble);
  onProgress(.32);
  // ---- free-standing fluted pillars (marble shaft, base, capital, lumen sconce on some)
  const pg = []; for (const [px, pz] of MAP.PILLARS) { const [tx, tz] = [Math.floor(px), Math.floor(pz)], h = g.ceil[tz * MAP.W + tx] || 8, X = wx(tx + .5), Z = wx(tz + .5); const isPed = MAP.PEDESTALS.some(p => Math.floor(p[0]) === tx && Math.floor(p[1]) === tz); if (isPed) continue;
    const hh = Math.min(h, 9); pg.push(triUV(fluted(.52, hh - 1.1, 18, 36).translate(X, .55, Z), 1.5)); pg.push(triUV(new THREE.BoxGeometry(1.4, .55, 1.4).translate(X, .275, Z), 1.5)); pg.push(triUV(new THREE.CylinderGeometry(.62, .7, .3, 24).translate(X, .7, Z), 1.5)); pg.push(triUV(new THREE.CylinderGeometry(.85, .55, .45, 24).translate(X, hh - .55 + .22, Z), 1.5)); pg.push(triUV(new THREE.BoxGeometry(1.5, .3, 1.5).translate(X, hh - .15, Z), 1.5));
    W.sources.push({ x: X, y: 3.3, z: Z, col: 0x9cc8ff, I: 14, d: 11, kind: 'crystal', fl: 0 }); const cr = crystalAt(X, 3.3, Z + .62, .55); cr.rotation.x = .3; }
  add(keep(BGU.mergeGeometries(pg, false)), M.marble, true);
  // ---- arena: drum wall with an opening to the south corridor, a ribbed dome, and the throne dais
  { const [cx, cz, rr] = MAP.ROOMS.find(r => r.id === 'arena').circle, X = wx(cx), Z = wx(cz), R = wx(rr) + .1, H = 12, gap = Math.asin(2.2 / R);
    const drum = new THREE.CylinderGeometry(R, R, H, 72, 1, true, gap, Math.PI * 2 - gap * 2).translate(X, H / 2, Z); const dm = add(keep(triUV(drum, 3)), M.wall.clone()); dm.material.side = THREE.BackSide; keep(dm.material);
    const lint = new THREE.CylinderGeometry(R, R, H - 4.6, 12, 1, true, -gap, gap * 2).translate(X, 4.6 + (H - 4.6) / 2, Z); const lm = add(keep(triUV(lint, 3)), dm.material);
    const dome = new THREE.SphereGeometry(R, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .5, 1).translate(X, H, Z); add(keep(dome), M.rock);
    const ribs = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, c = new THREE.EllipseCurve(0, 0, R - .2, R * .5 - .2, 0, Math.PI / 2); const pts = c.getPoints(16).map(p => new THREE.Vector3(Math.sin(a) * p.x, H + p.y, Math.cos(a) * p.x).add(new THREE.Vector3(X, 0, Z))); ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, .22, 6)); }
    for (const y of [.25, H - .4]) ribs.push(new THREE.TorusGeometry(R - .15, y < 1 ? .25 : .32, 6, 72).rotateX(Math.PI / 2).translate(X, y, Z));
    // dais + throne
    const tx = wx(MAP.THRONE.x), tz = wx(MAP.THRONE.z), ax = wx(MAP.ALTAR.x), az = wx(MAP.ALTAR.z);
    for (let s = 0; s < 3; s++) ribs.push(new THREE.CylinderGeometry(5.6 - s * 1.2, 5.7 - s * 1.2, .26, 48, 1, false, Math.PI / 2, Math.PI).translate(tx, .13 + s * .26, tz + .4));
    ribs.push(new THREE.BoxGeometry(2.4, .7, 1.8).translate(tx, 1.13, tz)); ribs.push(new THREE.BoxGeometry(2.4, 4.2, .5).translate(tx, 2.8, tz - .7)); for (const s of [-1, 1]) { ribs.push(new THREE.BoxGeometry(.4, 1.6, 1.8).translate(tx + s * 1.2, 1.6, tz)); ribs.push(new THREE.ConeGeometry(.35, 1.4, 4).translate(tx + s * 1.1, 5.6, tz - .7)); }
    ribs.push(new THREE.ConeGeometry(.5, 2, 4).translate(tx, 5.9, tz - .7));
    ribs.push(new THREE.CylinderGeometry(.5, .65, 1.15, 16).translate(ax, .78 + .575, az)); ribs.push(new THREE.CylinderGeometry(.75, .75, .14, 16).translate(ax, .78 + 1.2, az));
    add(keep(BGU.mergeGeometries(ribs.map(r => triUV(r, 1.6)), false)), M.marble, true);
    // ring of lumen columns (crystals on iron cups) + braziers
    for (let k = 0; k < 8; k++) { const a = (k + .5) / 8 * Math.PI * 2; if (Math.abs(Math.cos(a)) > .92 && Math.cos(a) > 0) continue; const px = X + Math.sin(a) * (R - 1.2), pz = Z + Math.cos(a) * (R - 1.2);
      W.sources.push({ x: px, y: 4.2, z: pz, col: k % 2 ? 0xff9a4a : 0x9cc8ff, I: k % 2 ? 22 : 18, d: 14, kind: k % 2 ? 'torch' : 'crystal', fl: k % 2 }); if (k % 2) { const f = flame(1.6); f.position.set(px, 3.4, pz); root.add(f); W.flames.push(f); brazierAt(px, pz, 3.4); } else crystalAt(px, 4.2, pz, .9, true); }
    // the heartstone (dim until the King falls)
    const hs = new THREE.Mesh(keep(new THREE.OctahedronGeometry(.42, 0)), M.heart); hs.position.set(ax, 2.55, az); hs.scale.y = 1.5; root.add(hs); W.heart = hs; const hg = glow(0xff6a20, 2.6, .5); hg.position.copy(hs.position); root.add(hg); W.heartGlow = hg;
    W.sources.push({ x: ax, y: 2.6, z: az, col: 0xff6a30, I: 14, d: 10, kind: 'heart', fl: 0 });
    W.arena = { x: X, z: Z, r: R };
  }
  onProgress(.4);

  // ---- lights on walls: torches (warm) + lumen crystals (cool) along room walls; torches in corridors
  function crystalAt(x, y, z, s = .7, big = false) { const m = new THREE.Mesh(gltf.crystal.geo, M.crystal); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = Math.random() * 6; root.add(m); W.crystals.push(m); const gl = glow(0x9cc8ff, big ? 3.6 : 2.4 * s / .7, .5); gl.position.set(x, y + .1, z); root.add(gl); m.userData.glow = gl; return m; }
  function brazierAt(x, z, y) { const b = new THREE.Mesh(keep(new THREE.CylinderGeometry(.55, .3, .45, 12, 1, true).translate(0, y - .2, 0)), M.iron); b.position.set(x, 0, z); root.add(b); const st = new THREE.Mesh(keep(new THREE.CylinderGeometry(.09, .14, y - .4, 8).translate(0, (y - .4) / 2, 0)), M.iron); st.position.set(x, 0, z); root.add(st); }
  const torchProto = gltf.props.torch_mounted;
  let k = 0; const byRoom = {};
  for (const e of wallEdges) (byRoom[e.room] = byRoom[e.room] || []).push(e);
  for (const [rid, edges] of Object.entries(byRoom)) { const R = MAP.ROOMS.find(r => r.id === rid); const step = R.corr ? 3 : rid === 'gallery' ? 3 : 3;
    edges.forEach((e, idx) => { if ((e.x * 5 + e.z * 11) % step !== 1) return; const cx = (e.p0[0] + e.p1[0]) / 2, cz = (e.p0[1] + e.p1[1]) / 2, yaw = Math.atan2(e.n[0], e.n[1]), cool = !R.corr && (k++ % 3 === 2);
      if (cool) { const y = Math.min(3.4, e.h - 1.2); const cr = crystalAt(cx + e.n[0] * .45, y, cz + e.n[1] * .45, .55); const cup = new THREE.Mesh(keep(new THREE.CylinderGeometry(.28, .14, .2, 10, 1, true)), M.gilt); cup.position.set(cx + e.n[0] * .45, y - .25, cz + e.n[1] * .45); root.add(cup); W.sources.push({ x: cx + e.n[0] * .9, y, z: cz + e.n[1] * .9, col: 0x9cc8ff, I: 12, d: 10, kind: 'crystal', fl: 0 }); }
      else { const t = torchProto.clone(); t.scale.setScalar(.85); t.position.set(cx + e.n[0] * .02, 2.35, cz + e.n[1] * .02); t.rotation.y = yaw; root.add(t); const f = flame(.9); f.position.set(cx + e.n[0] * .5, 2.35 + .55, cz + e.n[1] * .5); root.add(f); W.flames.push(f); W.sources.push({ x: cx + e.n[0] * .7, y: 3.1, z: cz + e.n[1] * .7, col: 0xff9a4a, I: 16, d: 11, kind: 'torch', fl: 1 }); }
    }); }
  onProgress(.46);

  // ---- props (KayKit Dungeon, CC0) and ossuary bits
  const P = gltf.props, placeProp = (name, tx, tz, yaw = 0, s = .72, y = 0) => { const src = P[name]; if (!src) return null; const o = src.clone(); o.position.set(wx(tx), y, wx(tz)); o.rotation.y = yaw; o.scale.setScalar(s); o.traverse(m => { if (m.isMesh) { m.castShadow = hi; m.receiveShadow = true; } }); root.add(o); return o; };
  const PR = [
    ['barrel_large', 16.6, 54.8, .3], ['barrel_small_stack', 23.2, 55, -.2], ['rubble_half', 16.3, 60.6, 0, .45], ['candle_triple', 22.8, 60.4, 0], ['box_stacked', 23, 57.6, 1.6, .5],
    ['banner_patternB_white', 18.1, 54, 0, .8], ['banner_patternB_white', 21.9, 54, 0, .8],
    ['banner_thin_white', 14.2, 36, 0, .9], ['banner_thin_white', 25.8, 36, 0, .9], ['sword_shield_broken', 12.3, 40, Math.PI / 2], ['rubble_large', 26.6, 46.8, Math.PI, .4], ['shelf_small_candles', 12.05, 43.5, Math.PI / 2, .9, 1.6], ['table_medium_decorated_A', 20, 38.2, .2, .7], ['stool', 21.4, 38.6, .5], ['plate_food_A', 20, 37.9, 0, .5, 1.36],
    ['coin_stack_large', 34.7, 44.6, .4], ['coin_stack_small', 33.5, 44.8, 1.1], ['trunk_medium_A', 30.6, 38.5, .4], ['box_stacked', 30.8, 44.6, 0, .5], ['keyring', 33, 38.6, .6, .7, 0],
    ['rubble_half', 6.1, 33, Math.PI / 2, .35], ['rubble_half', 9.9, 37, -Math.PI / 2, .35], ['sword_shield_broken', 6.1, 42.5, Math.PI / 2],
    ['banner_thin_white', 18.6, 24, 0, 1.1], ['banner_thin_white', 21.4, 24, 0, 1.1], ['candle_lit', 15.3, 29.4, 0], ['candle_lit', 23.8, 29.4, 0], ['candle_lit', 19.2, 26.5, 0],
    ['barrel_large', 14.6, 21.3, 0], ['barrel_small_stack', 25.4, 16.6, Math.PI], ['shelf_small_candles', 14.05, 18.5, Math.PI / 2, .9, 1.6],
    ['banner_patternB_white', 17.4, 0.9, 0, 1.2], ['banner_patternB_white', 21.6, 0.9, 0, 1.2], ['coin_stack_large', 22.2, 3.6, -.4], ['coin_stack_small', 17, 3.2, .7], ['candle_triple', 18.2, 4.6, 0, .8, .8], ['candle_triple', 20.8, 4.6, 1, .8, .8],
  ];
  for (const [n, x, z, yaw, s, y] of PR) placeProp(n, x, z, yaw || 0, s || .72, y || 0);
  // banners: gilt-tint the white cloth so they read as old elder silk
  root.traverse(o => { if (o.isMesh && o.parent && /banner/.test(o.parent.name || o.name) && o.material && !o.material.userData.tinted) { o.material = o.material.clone(); o.material.color.set(0xe8d8b0); o.material.userData.tinted = 1; keep(o.material); } });
  // skull piles + skulls in the ossuary corners
  const sk = gltf.skullpile, skl = gltf.skull; if (sk) { const at = [[12.6, 46.6, .8], [26.4, 36.6, 2.4], [6.4, 44.4, .2], [9.6, 25.4, 3], [13.6, 33.4, .5], [25.6, 24.4, 2.2], [14.4, 16.4, 1], [25.4, 21.2, 4], [16, 12, 1.2], [23, 12, 2.4]]; const im = new THREE.InstancedMesh(sk.geo, sk.mat, at.length); const m4 = new THREE.Matrix4(); at.forEach(([x, z, r], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(wx(x), 0, wx(z)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(1.1, 1.1, 1.1)))); im.castShadow = hi; root.add(im); }
  if (skl) { const at = []; for (let k2 = 0; k2 < 26; k2++) at.push([6.2 + Math.random() * 3.6, 30 + Math.random() * 10, Math.random() * 6]); const im = new THREE.InstancedMesh(skl.geo, skl.mat, at.length); const m4 = new THREE.Matrix4(); at.forEach(([x, z, r], i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(wx(x), 0, wx(z)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * .6, r, Math.random() * .6)), new THREE.Vector3(1, 1, 1)))); root.add(im); }
  onProgress(.52);

  // ---- chests
  for (const C of MAP.CHESTS) { const src = P[C.id === 'ante' || C.id === 'throne' ? 'chest_gold' : 'chest']; const o = src.clone(); o.scale.setScalar(.62); o.position.set(wx(C.x), 0, wx(C.z)); o.rotation.y = C.rot; o.traverse(m => { if (m.isMesh) { m.castShadow = hi; m.receiveShadow = true; } }); root.add(o); let lid = null; o.traverse(m => { if (/lid/.test(m.name)) lid = m; });
    const ch = W.chests[C.id] = { ...C, obj: o, lid, open: false, wx: wx(C.x), wz: wx(C.z) }; if (C.afterBoss) o.visible = false; W.block.add(Math.floor(C.x) + ',' + Math.floor(C.z));
    W.interact.push({ id: 'chest:' + C.id, kind: 'chest', x: wx(C.x), z: wx(C.z), r: 2.7, verb: C.locked ? 'Pick lock' : 'Open', label: C.locked ? 'Locked chest' : 'Chest', chest: C.id, when: () => !ch.open && o.visible }); }
  // ---- pedestals (sanctum puzzle)
  MAP.PEDESTALS.forEach(([px, pz], i) => { const X = wx(px), Z = wx(pz), grp = new THREE.Group(); grp.position.set(X, 0, Z); root.add(grp);
    const col = new THREE.Mesh(keep(triUV(fluted(.38, 1.05, 12, 24), 1)), M.marble); col.castShadow = hi; grp.add(col); const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(.55, .4, .22, 16).translate(0, 1.16, 0)), M.gilt); grp.add(cap);
    const cr = new THREE.Mesh(gltf.crystal.geo, M.crystalDim); cr.position.y = 1.6; cr.scale.setScalar(.8); grp.add(cr); const gl = glow(0x9cc8ff, 3.2, 0); gl.position.y = 1.7; grp.add(gl);
    const ped = { i, grp, cr, gl, on: false, x: X, z: Z }; W.peds.push(ped); W.sources.push({ x: X, y: 2.2, z: Z, col: 0xaad4ff, I: 0, d: 9, kind: 'ped', fl: 0, ped });
    W.interact.push({ id: 'ped:' + i, kind: 'ped', x: X, z: Z, r: 1.9, verb: 'Touch', label: 'Lumen pedestal', ped: i, when: () => !W.gateOpen }); });
  // ---- the sealed lumen gate + the boss portcullis (iron bars that slide into the lintel)
  function bars(cx, cz, wid, hgt) { const gp = new THREE.Group(); const parts = []; for (let k2 = 0; k2 <= 8; k2++) parts.push(new THREE.BoxGeometry(.09, hgt, .09).translate(-wid / 2 + k2 * wid / 8, hgt / 2, 0)); for (const y of [.5, hgt * .45, hgt - .3]) parts.push(new THREE.BoxGeometry(wid, .12, .12).translate(0, y, 0)); for (let k2 = 0; k2 <= 8; k2++) parts.push(new THREE.ConeGeometry(.08, .3, 4).rotateX(Math.PI).translate(-wid / 2 + k2 * wid / 8, -.12, 0)); const m = new THREE.Mesh(keep(BGU.mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p))), M.iron); m.castShadow = hi; gp.add(m); gp.position.set(cx, 0, cz); root.add(gp); return gp; }
  W.gate = bars(wx(20), wx(23.5), 4, 4.5); W.gateOpen = false;
  { const glyph = new THREE.Mesh(keep(new THREE.CircleGeometry(1.5, 48)), new THREE.MeshBasicMaterial({ map: keep(canvasTex(256, 256, (c) => { c.translate(128, 128); c.strokeStyle = '#bfe0ff'; c.shadowColor = '#7fb8ff'; c.shadowBlur = 10; c.lineWidth = 3; for (const r of [116, 96]) { c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); } for (let k2 = 0; k2 < 12; k2++) { c.save(); c.rotate(k2 / 12 * Math.PI * 2); c.beginPath(); c.moveTo(0, -94); c.lineTo(8, -78); c.lineTo(0, -66); c.lineTo(-8, -78); c.closePath(); c.stroke(); c.restore(); } c.beginPath(); for (let k2 = 0; k2 < 3; k2++) { const a = k2 / 3 * Math.PI * 2 - Math.PI / 2; c.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); } c.closePath(); c.stroke(); c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke(); })), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    glyph.position.set(0, 2.3, .2); W.gate.add(glyph); W.glyph = glyph; keep(glyph.material); }
  W.interact.push({ id: 'gate', kind: 'gate', x: wx(20), z: wx(24.4), r: 2.2, verb: 'Examine', label: 'Sealed lumen gate', when: () => !W.gateOpen });
  W.door = bars(wx(20), wx(15.5), 4, 4.5); W.door.position.y = 4.4; W.doorClosed = false;
  // ---- spike traps (iron grates with instanced spikes)
  const spikeGeo = keep(new THREE.ConeGeometry(.07, .62, 5).translate(0, .31, 0)), grate = keep(new THREE.BoxGeometry(T * 4, .06, T));
  for (const tr of MAP.TRAPS) { const plate = new THREE.Mesh(grate, M.iron); plate.position.set(wx(tr.x0) + T * 2, .03, wx(tr.z) + T / 2); plate.receiveShadow = true; root.add(plate);
    const n = 8 * 3, im = new THREE.InstancedMesh(spikeGeo, M.iron, n), m4 = new THREE.Matrix4(); let c = 0; for (let a = 0; a < 8; a++) for (let b = 0; b < 3; b++) im.setMatrixAt(c++, m4.makeTranslation(wx(tr.x0) + .5 + a * 1, 0, wx(tr.z) + .4 + b * .6)); im.position.y = -.6; root.add(im); W.traps.push({ ...tr, im, y: -.6 }); }
  // ---- the stair up (exit) with a warm shaft of city light
  { const ex = wx(MAP.EXIT.x), ez = wx(MAP.EXIT.z), st = []; for (let s = 0; s < 7; s++) st.push(new THREE.BoxGeometry(3.6, .3 * (s + 1), .5).translate(ex, .15 * (s + 1), ez + .3 + s * .5)); add(keep(BGU.mergeGeometries(st.map(b => triUV(b, 2)))), M.marble, false);
    W.interact.push({ id: 'exit', kind: 'exit', x: ex, z: ez - .4, r: 2.4, verb: 'Climb', label: 'Stair to the Ember Crossroads' }); W.sources.push({ x: ex, y: 3.5, z: ez - 1, col: 0xffc890, I: 10, d: 10, kind: 'torch', fl: 0 }); }
  W.interact.push({ id: 'heart', kind: 'heart', x: wx(MAP.ALTAR.x), z: wx(MAP.ALTAR.z) + .9, r: 2.2, verb: 'Take', label: 'The Heartstone', when: () => W.heartFree });
  onProgress(.58);

  // ---- fog shafts (light pouring from ceiling crystals) and dust
  const shaftMat = keep(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { t: { value: 0 }, col: { value: new THREE.Color(0x9cc8ff) }, k: { value: low ? .08 : .12 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float t; uniform vec3 col; uniform float k; varying vec2 vUv; varying vec3 vN; varying vec3 vV; float h(float n){return fract(sin(n)*43758.5453);} float n1(float x){float i=floor(x),f=fract(x);return mix(h(i),h(i+1.),f*f*(3.-2.*f));} void main(){ float edge=pow(abs(dot(vN,vV)),1.6); float v=smoothstep(0.,.35,vUv.y)*smoothstep(1.,.55,vUv.y); float st=.55+.45*n1(vUv.x*22.+t*.25)*n1(vUv.x*7.-t*.12+vUv.y*2.); gl_FragColor=vec4(col*k*edge*v*st,1.); }' }));
  const shaft = (x, z, top, r0, r1, col) => { const m = shaftMat.clone(); m.uniforms.col.value = new THREE.Color(col); m.uniforms.k.value = shaftMat.uniforms.k.value; const s = new THREE.Mesh(keep(new THREE.CylinderGeometry(r0, r1, top, 24, 1, true).translate(0, top / 2, 0)), m); s.position.set(x, 0, z); s.renderOrder = 5; root.add(s); W.shafts.push(m); keep(m); return s; };
  if (!low || true) { shaft(wx(19.5), wx(28.6), 9, .9, 3.2, 0x9cc8ff); shaft(wx(19.5), wx(9), 12, 1.2, 4.2, 0xffb070); shaft(wx(19.5), wx(41.5), 8, .8, 2.6, 0xffd8a8); shaft(wx(19.5), wx(60.8), 7, .7, 2.4, 0xffd8a0); if (!low) { shaft(wx(15), wx(18.6), 7, .6, 2, 0x9cc8ff); shaft(wx(33), wx(41), 6, .5, 1.8, 0xffc890); } }
  { const N = low ? 90 : tier === 'medium' ? 200 : 340, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 26; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - .5) * 26; }
    const dg = keep(new THREE.BufferGeometry()); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const dm = keep(new THREE.PointsMaterial({ size: .05, map: glowTex(), color: 0xffd8a0, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    W.dust = new THREE.Points(dg, dm); W.dust.frustumCulled = false; root.add(W.dust); }
  onProgress(.62);

  // ---- pooled point lights: the nearest sources get a real light, the rest stay emissive + glow
  const NL = low ? 4 : tier === 'medium' ? 7 : 10; W.pool = [];
  for (let i = 0; i < NL; i++) { const L = new THREE.PointLight(0xffffff, 0, 10, 2); L.userData.src = null; root.add(L); W.pool.push(L); }
  W.hemi = new THREE.HemisphereLight(0x8aa0c8, 0x4a3424, low ? .8 : .62); root.add(W.hemi);
  if (hi) { const sp = new THREE.SpotLight(0xffd0a0, 60, 22, .7, .6, 1.6); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -.0006; sp.shadow.radius = 4; sp.shadow.camera.near = .5; sp.shadow.camera.far = 24; root.add(sp); root.add(sp.target); W.spot = sp; }
  return W;
}

// ------------------------------------------------------------------ per frame
const _v = new THREE.Vector3();
export function updateWorld(W, t, dt, focus, cam) {
  W.t = t;
  for (const f of W.flames) { const s = f.userData.seed, k = 1 + Math.sin(t * 13 + s) * .08 + Math.sin(t * 23 + s * 2) * .06; f.scale.set(1, k, 1); f.rotation.y = t * 1.3 + s; }
  for (const c of W.crystals) { c.rotation.y += dt * .2; if (c.userData.glow) c.userData.glow.material.opacity = .42 + Math.sin(t * 1.4 + c.position.x) * .08; }
  for (const m of W.shafts) m.uniforms.t.value = t;
  // light pool: assign nearest sources every 0.15 s
  W.acc = (W.acc || 0) + dt; if (W.acc > .15) { W.acc = 0; const live = W.sources.filter(s => s.I > 0 || (s.ped && s.ped.on)); live.forEach(s => s.dd = (s.x - focus.x) ** 2 + (s.z - focus.z) ** 2 + (s.y - 2) ** 2 * .2); live.sort((a, b) => a.dd - b.dd); const want = live.slice(0, W.pool.length);
    for (const L of W.pool) if (L.userData.src && !want.includes(L.userData.src)) L.userData.src = null;
    for (const s of want) if (!W.pool.some(L => L.userData.src === s)) { const L = W.pool.find(L => !L.userData.src); if (L) { L.userData.src = s; L.position.set(s.x, s.y, s.z); L.color.set(s.col); L.distance = s.d * 1.45; L.intensity = 0; } } }
  for (const L of W.pool) { const s = L.userData.src; const target = s ? (s.ped ? (s.ped.on ? 8 : 0) : s.I) * 1.9 * (s.fl ? 1 + Math.sin(t * 11 + s.x) * .07 + Math.sin(t * 17.3 + s.z) * .05 : 1) : 0; L.intensity += (target - L.intensity) * Math.min(1, dt * 6); }
  // dust follows the focus
  if (W.dust) { W.dust.position.set(focus.x, 0, focus.z); const p = W.dust.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * .05; if (y > 6) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * .3 + i) * dt * .05); } p.needsUpdate = true; }
  // traps
  for (const tr of W.traps) { const up = MAP.trapUp(tr, t), rise = MAP.trapRise(tr, t), target = up ? 0 : rise ? -.42 + Math.sin(t * 60) * .03 : -.6; tr.y += (target - tr.y) * Math.min(1, dt * (up ? 30 : 8)); tr.im.position.y = tr.y; }
  // gates
  if (W.gateOpen && W.gate.position.y < 4.4) { W.gate.position.y = Math.min(4.4, W.gate.position.y + dt * 1.6); }
  if (W.glyph) W.glyph.material.opacity = W.gateOpen ? Math.max(0, W.glyph.material.opacity - dt) : .7 + Math.sin(t * 2) * .15;
  const dTarget = W.doorClosed ? 0 : 4.4; W.door.position.y += (dTarget - W.door.position.y) * Math.min(1, dt * (W.doorClosed ? 6 : 1.5));
  // chests
  for (const c of Object.values(W.chests)) if (c.lid) { const tgt = c.open ? -1.2 : 0; c.lid.rotation.x += (tgt - c.lid.rotation.x) * Math.min(1, dt * 5); }
  // pedestals
  for (const p of W.peds) { p.gl.material.opacity += ((p.on ? .7 : 0) - p.gl.material.opacity) * Math.min(1, dt * 4); p.cr.rotation.y += dt * (p.on ? 1 : .2); }
  if (W.heart) { W.heart.rotation.y += dt * (W.heartFree ? 1.2 : .3); W.heart.position.y = 2.55 + Math.sin(t * 1.5) * .06; }
  if (W.spot && focus) { W.spot.position.set(focus.x + 2.5, 8, focus.z + 2); W.spot.target.position.set(focus.x, 0, focus.z); }
}
export function setPedestal(W, i, on, M) { const p = W.peds[i]; p.on = on; p.cr.material = on ? W.M.crystal : W.M.crystalDim; }
export function openGate(W) { W.gateOpen = true; W.block.delete('19,23'); W.block.delete('20,23'); }
export function setBossDoor(W, closed) { W.doorClosed = closed; for (const k of ['19,15', '20,15']) closed ? W.block.add(k) : W.block.delete(k); }
export function freeHeart(W) { W.heartFree = true; W.heart.material.emissive.set(0xfff0c0); W.heart.material.color.set(0xffffff); W.heart.material.emissiveIntensity = 2.4; W.heartGlow.material.color.set(0xfff0d0); W.heartGlow.scale.set(4, 4, 1); const s = W.sources.find(s => s.kind === 'heart'); if (s) { s.col = 0xfff0d0; s.I = 26; } }
export function takeHeart(W) { W.heartFree = false; W.heart.visible = false; W.heartGlow.visible = false; const s = W.sources.find(s => s.kind === 'heart'); if (s) s.I = 0; }
export function disposeWorld(W, scene) {
  scene.remove(W.root); const seen = new Set();
  W.root.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (!seen.has(m)) { seen.add(m); for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'emissiveMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); } m.dispose(); } if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
  for (const d of W.disposables) if (d && d.dispose && !seen.has(d)) d.dispose();
  if (GLOW) { GLOW.dispose(); GLOW = null; }
}
