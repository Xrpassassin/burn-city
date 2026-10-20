// Burn City Arena: Zombie Survival map layer (zones, doors, wall-buys, mystery box, perk machines) + interaction prompts.
// Built once from the server's layout; per-frame work is just visibility toggles + a few transforms. No lights, no textures
// beyond small canvas labels, so it stays cheap on phones and Safari.
import * as THREE from 'three';
function label(text, color = '#ffd9a0', w = 512, scale = 6) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = 96; const x = cv.getContext('2d');
  x.font = 'bold 40px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = color; x.shadowBlur = 14; x.fillStyle = color;
  const lines = String(text).split('\n'); lines.forEach((l, i) => { x.font = (i ? '30px' : 'bold 40px') + ' system-ui'; x.fillText(l, w / 2, lines.length > 1 ? 30 + i * 40 : 48); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })); s.scale.set(scale, scale * 96 / w, 1); return s;
}
const add = THREE.AdditiveBlending;
const TL = new THREE.TextureLoader(), TXC = {};
// CC0 surface textures (ambientCG). Used as detail maps multiplied with the existing colours, so the palette stays the same.
function TEX(n, rep = 1) { if (!TXC[n]) { const t = TL.load(new URL(`./tex/${n}.jpg`, import.meta.url).href); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; TXC[n] = t; }
  if (rep === 1) return TXC[n]; const c = TXC[n].clone(); c.repeat.set(rep, rep); c.needsUpdate = true; return c; }
export function createCodWorld(scene, L, { low = false } = {}) {
  const root = new THREE.Group(); scene.add(root); const mats = [], geos = [];
  const basic = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, ...o }); mats.push(m); return m; };
  const g = x => (geos.push(x), x);
  // ===== refinery geometry from the server grid: everything static is merged into a few draw calls =====
  const G = L.grid, CELL = L.cell, GW = L.gw, GH = L.gh, WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1, H = 3.4;
  const winCell = new Set(L.windows.filter(w => !w.lv).map(w => w.r * GW + w.c)), obstH = new Map(), obstS = new Map();
  const UP = L.up || null, UG = UP ? UP.grid : null, UH = UP ? UP.h : 0, H2 = UH + 3.2, RAMPAT = {}; if (UP) UP.ramps.forEach((rp, i) => { for (let r = rp.r[0]; r <= rp.r[1]; r++) for (let c = rp.c[0]; c <= rp.c[1]; c++) RAMPAT[r * GW + c] = i; });
  for (const [c0, c1, r0, r1, h, st] of L.obst) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { obstH.set(r * GW + c, h); obstS.set(r * GW + c, st); }
  const STY = { support: [0x16120e, 0x3e342c], rail: [0x2a1a08, 0xc8901a], pillar: [0x241c18, 0x55453a], desk: [0x141c24, 0x3a5064], crate: [0x2a1a0c, 0x6a4824], bench: [0x10201a, 0x36604e], furnace: [0x1a0602, 0xc84a10], tank: [0x1a1028, 0x4a3478], pipe: [0x202024, 0x5a5a62] };
  const TS = 3.4, uv = [], pos = [], col = [], C1 = new THREE.Color(), C2 = new THREE.Color();
  function boxV(x0, x1, y0, y1, z0, z1, bot, top) {   // 5 faces (no bottom); vertical gradient + per-face shade = cheap readable "lighting"
    const F = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.85], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.85], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.7],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.7], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1.15]];
    for (const [a, b, c, d, sh] of F) { const ax = sh === 1.15 ? 'top' : Math.abs(a[2] - b[2]) < 1e-6 ? 'z' : 'x'; for (const v of [a, b, c, a, c, d]) { pos.push(...v); uv.push(ax === 'top' ? v[0] / TS : ax === 'z' ? v[0] / TS : v[2] / TS, ax === 'top' ? v[2] / TS : v[1] / TS); const k = sh === 1.15 ? 1 : (v[1] - y0) / (y1 - y0 || 1); C1.copy(bot).lerp(top, sh === 1.15 ? 1 : k).multiplyScalar(sh); col.push(C1.r, C1.g, C1.b); } } }
  const wallBot = new THREE.Color(0x140c08), wallTop = new THREE.Color(0x6e5242);
  for (let r = 0; r < GH; r++) { let c = 0; while (c < GW) { const i = r * GW + c;
      if (G[r][c] !== -1 || obstH.has(i) || winCell.has(i)) { c++; continue; } let e = c; while (e + 1 < GW && G[r][e + 1] === -1 && !obstH.has(r * GW + e + 1) && !winCell.has(r * GW + e + 1)) e++;   // greedy row runs
      boxV(WX(c) - 1, WX(e) + 1, 0, H, WZ(r) - 1, WZ(r) + 1, wallBot, wallTop); c = e + 1; } }
  for (const w of L.windows) { const x = w.x, z = w.z; boxV(x - 1, x + 1, 0, 0.6, z - 1, z + 1, wallBot, wallTop); boxV(x - 1, x + 1, 2.5, H, z - 1, z + 1, wallBot, wallTop);   // window opening 0.6..2.5 m
    if (w.ax === 'x') { boxV(x - 1, x - 0.75, 0.6, 2.5, z - 1, z + 1, wallBot, wallTop); boxV(x + 0.75, x + 1, 0.6, 2.5, z - 1, z + 1, wallBot, wallTop); } else { boxV(x - 1, x + 1, 0.6, 2.5, z - 1, z - 0.75, wallBot, wallTop); boxV(x - 1, x + 1, 0.6, 2.5, z + 0.75, z + 1, wallBot, wallTop); } }
  for (const [c0, c1, r0, r1, h, st] of L.obst) { const [b, t] = STY[st] || STY.pillar; boxV(WX(c0) - (st === 'pillar' ? 0.6 : 0.95), WX(c1) + (st === 'pillar' ? 0.6 : 0.95), 0, h, WZ(r0) - (st === 'pillar' ? 0.6 : 0.95), WZ(r1) + (st === 'pillar' ? 0.6 : 0.95), C2.setHex(b).clone(), new THREE.Color(t)); }
  const wg = g(new THREE.BufferGeometry()); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const wallMat = basic(0xffffff, { vertexColors: true, map: TEX('wall') }); root.add(new THREE.Mesh(wg, wallMat));
  // ===== upper level (the Gantry): taller outer walls with vents, steel catwalk slabs, ramps, guard rails, outside ledges for the vent crawlers =====
  let slabMat = null, upLabel = null; const upFlame = new Set();
  if (UP) { const A = { pos: [], uv: [], col: [] }, S = { pos: [], uv: [], col: [] }, RL = { pos: [], col: [] }, cA = new THREE.Color(), steelB = new THREE.Color(0x1c1a1c), steelT = new THREE.Color(0x4a4448), railC = new THREE.Color(0xd8901c), railD = new THREE.Color(0x5a3a10);
    const quad = (T, a, b, c, d, cb, ct, uvs = true) => { const flat = Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[1] - c[1]) < 1e-6 && Math.abs(a[1] - d[1]) < 1e-6, sx = Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[0] - c[0]) < 1e-6;
      for (const [v, k] of [[a, 0], [b, 0], [c, 1], [a, 0], [c, 1], [d, 1]]) { T.pos.push(...v); if (uvs && T.uv) T.uv.push(flat ? v[0] / TS : sx ? v[2] / TS : v[0] / TS, flat ? v[2] / TS : v[1] / TS); cA.copy(cb).lerp(ct, k); T.col.push(cA.r, cA.g, cA.b); } };
    const box = (T, x0, x1, y0, y1, z0, z1, cb, ct, bottom = false) => { quad(T, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], cb, ct); quad(T, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], cb, ct); quad(T, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], cb, ct); quad(T, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], cb, ct);
      quad(T, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], ct, ct); if (bottom) quad(T, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], cb.clone().multiplyScalar(0.6), cb.clone().multiplyScalar(0.6)); };
    const isVent = new Set(L.windows.filter(w => w.lv).map(w => w.r * GW + w.c));
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (UG[r][c] !== -1) continue; const x = WX(c), z = WZ(r);
      if (!isVent.has(r * GW + c)) { box(A, x - 1, x + 1, H, H2, z - 1, z + 1, wallTop.clone().multiplyScalar(0.5), wallTop); continue; }
      const w = L.windows.find(o => o.lv && o.r === r && o.c === c); box(A, x - 1, x + 1, H, UH + 0.6, z - 1, z + 1, wallBot, wallTop); box(A, x - 1, x + 1, UH + 2.5, H2, z - 1, z + 1, wallBot, wallTop);   // vent opening UH+0.6..UH+2.5
      if (w.ax === 'x') { box(A, x - 1, x - 0.75, UH + 0.6, UH + 2.5, z - 1, z + 1, wallBot, wallTop); box(A, x + 0.75, x + 1, UH + 0.6, UH + 2.5, z - 1, z + 1, wallBot, wallTop); } else { box(A, x - 1, x + 1, UH + 0.6, UH + 2.5, z - 1, z - 0.75, wallBot, wallTop); box(A, x - 1, x + 1, UH + 0.6, UH + 2.5, z + 0.75, z + 1, wallBot, wallTop); }
      // outside maintenance ledge the vent crawlers walk along (so nothing floats in mid-air)
      const ox = w.ox - w.x, oz = w.oz - w.z, l = Math.hypot(ox, oz) || 1, nx = ox / l, nz = oz / l, L0 = 1, L1 = 8.5, hw = 2.4, ex0 = x + nx * L0, ex1 = x + nx * L1, ez0 = z + nz * L0, ez1 = z + nz * L1;
      box(S, Math.min(ex0, ex1) - (nz ? hw : 0), Math.max(ex0, ex1) + (nz ? hw : 0), UH - 0.3, UH, Math.min(ez0, ez1) - (nx ? hw : 0), Math.max(ez0, ez1) + (nx ? hw : 0), steelB, steelT, true);
      for (const sd of [-1, 1]) { const px = nz ? sd * hw : 0, pz = nx ? sd * hw : 0; box(A, Math.min(ex0, ex1) + px - (nz ? 0.06 : 0), Math.max(ex0, ex1) + px + (nz ? 0.06 : 0), UH, UH + 1.0, Math.min(ez0, ez1) + pz - (nx ? 0.06 : 0), Math.max(ez0, ez1) + pz + (nx ? 0.06 : 0), railD, railC); }
      for (const k of [0.25, 0.75]) { const sx = ex0 + (ex1 - ex0) * k, sz = ez0 + (ez1 - ez0) * k; box(A, sx - 0.18, sx + 0.18, 0, UH - 0.3, sz - 0.18, sz + 0.18, steelB, steelT); } }   // two struts down to the ground
    // catwalk slabs (greedy runs per row) with an underside, so the deck reads from below too
    for (let r = 0; r < GH; r++) { let c = 0; while (c < GW) { const ok = cc => UG[r][cc] === UP.zone && RAMPAT[r * GW + cc] === undefined; if (!ok(c)) { c++; continue; } let e = c; while (e + 1 < GW && ok(e + 1)) e++;
      box(S, WX(c) - 1, WX(e) + 1, UH - 0.22, UH, WZ(r) - 1, WZ(r) + 1, steelB, steelT, true); c = e + 1; } }
    // ramps: sloped deck + side skirts + tread lines
    const tread = []; for (const rp of UP.ramps) { const yAt = v => Math.max(0.02, Math.min(UH, (v - rp.lo) / (rp.hi - rp.lo) * UH)), x0 = rp.x0, x1 = rp.x1, z0 = rp.z0, z1 = rp.z1;
      const V = (x, z, dy = 0) => [x, (rp.ax === 'z' ? yAt(z) : yAt(x)) + dy, z]; quad(S, V(x0, z1), V(x1, z1), V(x1, z0), V(x0, z0), steelT, steelT);
      quad(S, V(x0, z0, -0.25), V(x1, z0, -0.25), V(x1, z1, -0.25), V(x0, z1, -0.25), steelB, steelB);
      for (const xs of [x0, x1]) quad(A, [xs, 0, z1], [xs, 0, z0], V(xs, z0), V(xs, z1), steelB, steelT);
      for (let v = Math.min(rp.lo, rp.hi) + 0.5; v < Math.max(rp.lo, rp.hi); v += 0.5) { const y = yAt(v) + 0.03; tread.push(x0 + 0.1, y, v, x1 - 0.1, y, v); } }
    if (tread.length) { const tg_ = g(new THREE.BufferGeometry()); tg_.setAttribute('position', new THREE.Float32BufferAttribute(tread, 3)); const tm = new THREE.LineBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.7 }); mats.push(tm); root.add(new THREE.LineSegments(tg_, tm)); }
    // guard rails where the deck meets open air (and along the ramp sides): posts + top rail + toe board, following the slope on ramps
    const hAt = (x, z) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2), ri = RAMPAT[r * GW + c]; if (ri === undefined) return UH; const rp = UP.ramps[ri], v = rp.ax === 'z' ? z : x; return Math.max(0, Math.min(UH, (v - rp.lo) / (rp.hi - rp.lo) * UH)); };
    const rail = (ax, az, bx, bz, ha, hb) => { const T = 0.05; for (const [y0, hgt] of [[1.0, 0.09], [0.5, 0.05], [0.0, 0.14]]) { const a = [ax, ha + y0, az], b = [bx, hb + y0, bz], at = [ax, ha + y0 + hgt, az], bt = [bx, hb + y0 + hgt, bz]; for (const v of [a, b, bt, a, bt, at]) { RL.pos.push(...v); RL.col.push(railC.r, railC.g, railC.b); } } };
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (UG[r][c] !== UP.zone) continue; const x = WX(c), z = WZ(r);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (UG[r + dr]?.[c + dc] !== -2) continue; const ex = x + dc * 0.98, ez = z + dr * 0.98, ax = dr ? x - 1 : ex, bx = dr ? x + 1 : ex, az = dc ? z - 1 : ez, bz = dc ? z + 1 : ez;
        const ha = hAt(ax - dc * 0.5, az - dr * 0.5), hb = hAt(bx - dc * 0.5, bz - dr * 0.5); rail(ax, az, bx, bz, ha, hb); for (const [px, pz, ph] of [[ax, az, ha], [bx, bz, hb]]) box(A, px - 0.05, px + 0.05, ph, ph + 1.1, pz - 0.05, pz + 0.05, railD, railC); } }
    const ag = g(new THREE.BufferGeometry()); ag.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3)); ag.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3)); ag.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); root.add(new THREE.Mesh(ag, wallMat));
    const sg = g(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(S.col, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(S.uv, 2));
    slabMat = basic(0xffffff, { vertexColors: true, map: TEX('floor'), side: THREE.DoubleSide }); root.add(new THREE.Mesh(sg, slabMat));
    const rg_ = g(new THREE.BufferGeometry()); rg_.setAttribute('position', new THREE.Float32BufferAttribute(RL.pos, 3)); rg_.setAttribute('color', new THREE.Float32BufferAttribute(RL.col, 3)); root.add(new THREE.Mesh(rg_, basic(0xffffff, { vertexColors: true, side: THREE.DoubleSide })));
    const uz = L.zones[UP.zone]; if (uz) { upLabel = label(uz.n, uz.col, 512, low ? 7 : 9); const [c0, c1, r0, r1] = uz.r; upLabel.position.set((WX(c0) + WX(c1)) / 2, H2 + 1.4, (WZ(r0) + WZ(r1)) / 2); upLabel.material.opacity = 0.8; root.add(upLabel); }
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (UG[r][c] === -1) upFlame.add(r * GW + c); }
  // time of day + weather for procedural maps (classic map: env null, unchanged look)
  const ENV = L.env, LF = !ENV ? 1 : ENV.tod === 'day' ? 1.3 : ENV.tod === 'dusk' ? 0.95 : 0.62; wallMat.color.setScalar(LF);
  const SKY = !ENV ? null : ENV.tod === 'day' ? [0x9a8a76, 0x7a6a58, 20, 115] : ENV.tod === 'dusk' ? [0x3a160a, 0x2e140a, 14, 95] : [0x020208, 0x050409, 9, 68];
  // floors: one plane per room, tinted by the room's colour (dark until opened); glowing trim line along the top of every wall
  const floors = L.zones.map((z, i) => { if (z.lv) return null; const [c0, c1, r0, r1] = z.r, fw = (c1 - c0 + 1) * CELL, fh = (r1 - r0 + 1) * CELL, fgeo = new THREE.PlaneGeometry(fw, fh).rotateX(-Math.PI / 2), fu = fgeo.attributes.uv; for (let k = 0; k < fu.count; k++) fu.setXY(k, fu.getX(k) * fw / 6, fu.getY(k) * fh / 6); const m = new THREE.Mesh(g(fgeo), basic(0x101010, { map: TEX('floor') }));
    m.position.set((WX(c0) + WX(c1)) / 2, 0.01, (WZ(r0) + WZ(r1)) / 2); root.add(m); m.userData.c = new THREE.Color(z.col);
    const t = label(z.n, z.col, 512, low ? 7 : 9), under = UP && UP.atrium && c0 >= UP.atrium[0] && c1 <= UP.atrium[1] && r0 >= UP.atrium[2] && r1 <= UP.atrium[3]; t.position.set(m.position.x, under ? H2 + 3.2 : H + 1.4, m.position.z); t.material.opacity = 0.8; root.add(t); return m; });
  const trim = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (G[r][c] < 0) continue; const x = WX(c), z = WZ(r);   // light strip at 2.9 m on every wall face that borders floor
    for (const [dc, dr, ax, az, bx, bz] of [[1, 0, 1, -1, 1, 1], [-1, 0, -1, -1, -1, 1], [0, 1, -1, 1, 1, 1], [0, -1, -1, -1, 1, -1]]) { const n = G[r + dr]?.[c + dc]; if (n !== -1 || obstH.has((r + dr) * GW + c + dc)) continue; trim.push(x + ax * 0.98, 2.9, z + az * 0.98, x + bx * 0.98, 2.9, z + bz * 0.98); } }
  const tg = g(new THREE.BufferGeometry()); tg.setAttribute('position', new THREE.Float32BufferAttribute(trim, 3)); const trimM = new THREE.LineBasicMaterial({ color: 0xff7a2a }); mats.push(trimM); root.add(new THREE.LineSegments(tg, trimM));
  // furnace mouths: flickering emissive slabs (the hall's "light source")
  const furn = L.obst.filter(o => o[5] === 'furnace').map(([c0, c1, r0, r1]) => { const m = new THREE.Mesh(g(new THREE.BoxGeometry((c1 - c0 + 1) * CELL + 0.1, 0.5, (r1 - r0 + 1) * CELL + 0.1)), basic(0xff6a10)); m.position.set((WX(c0) + WX(c1)) / 2, 1.2, (WZ(r0) + WZ(r1)) / 2); root.add(m); return m; });
  // doors: glowing barricade bars across the doorway with a price tag
  const doors = L.doors.map(d => { const grp = new THREE.Group(), len = 4, bm = basic(0xff3a10, { transparent: true, opacity: 0.7, depthWrite: false });
    if (d.deb) {   // rubble pile: tumbled crates, bent beams and a hazard plank (cleared for points like any door)
      const cols = [0x3a2a1a, 0x4a3420, 0x2a2622, 0x5a4a3a]; for (let k = 0; k < 9; k++) { const w_ = 0.5 + ((k * 37) % 7) / 10, h_ = 0.4 + ((k * 53) % 9) / 10, b = new THREE.Mesh(g(new THREE.BoxGeometry(w_, h_, 0.6 + ((k * 29) % 5) / 10)), basic(cols[k % 4]));
        const u = (k / 8 - 0.5) * 3.4; b.position.set(d.ax === 'x' ? u : ((k * 17) % 5 - 2) * 0.25, h_ / 2 + (k % 3 === 2 ? 0.5 : 0), d.ax === 'x' ? ((k * 17) % 5 - 2) * 0.25 : u); b.rotation.set((k % 3) * 0.2, k * 0.7, (k % 2) * 0.25); grp.add(b); }
      for (const [y, rz] of [[1.2, 0.3], [0.7, -0.4]]) { const beam_ = new THREE.Mesh(g(new THREE.BoxGeometry(d.ax === 'x' ? 4.2 : 0.18, 0.18, d.ax === 'x' ? 0.18 : 4.2)), basic(0x6a5a4a)); beam_.position.y = y; beam_.rotation[d.ax === 'x' ? 'z' : 'x'] = rz; grp.add(beam_); }
      const hz = new THREE.Mesh(g(new THREE.BoxGeometry(d.ax === 'x' ? 3.6 : 0.1, 0.25, d.ax === 'x' ? 0.1 : 3.6)), basic(0xffb020)); hz.position.y = 1.6; grp.add(hz);
      const t = label(`Clear debris · ${L.zones[d.b].n} · ${d.cost}`, '#ffd060', 512, 3.6); t.position.y = 2.6; grp.add(t); grp.position.set(d.x, 0, d.z); root.add(grp); return grp; }
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(g(new THREE.BoxGeometry(d.ax === 'x' ? len : 0.14, 0.2, d.ax === 'x' ? 0.14 : len)), k === 2 ? basic(0xffb060) : bm); b.position.y = 0.5 + k * 0.65; grp.add(b); }
    const t = label(`${L.zones[d.b].n} · ${d.cost}`, '#ffb060', 512, 3.6); t.position.y = 3.1; grp.add(t); grp.position.set(d.x, 0, d.z); root.add(grp); return grp; });
  // drifting dust + ash in the furnace light: one Points draw call, wraps around the map
  const DN = low ? 160 : 520, dpos = new Float32Array(DN * 3), dsp = new Float32Array(DN), SX = GW * CELL, SZ = GH * CELL;
  for (let k = 0; k < DN; k++) { dpos[k * 3] = (Math.random() - 0.5) * SX; dpos[k * 3 + 1] = Math.random() * H; dpos[k * 3 + 2] = (Math.random() - 0.5) * SZ; dsp[k] = 0.05 + Math.random() * 0.15; }
  const dg = g(new THREE.BufferGeometry()); dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dm = new THREE.PointsMaterial({ color: 0xffb27a, size: low ? 0.07 : 0.05, transparent: true, opacity: 0.55, depthWrite: false, blending: add, fog: true }); mats.push(dm);
  const dust = new THREE.Points(dg, dm); dust.frustumCulled = false; root.add(dust);
  const zoneOf = (x, z, lv = 0) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); const v = (lv && UG ? UG : G)[r]?.[c]; return v >= 0 && v < 100 ? v : -1; };
  const walkable = (x, z, open, lv = 0) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2), v = (lv && UG ? UG : G)[r]?.[c]; if (v === undefined || v < 0) return false; if (v >= 100) { const d = L.doors[v - 100]; return !!((open >> d.a) & 1 && (open >> d.b) & 1); } return !!((open >> v) & 1); };
  // same floor/height rule as the server (ramps lift you; the floor flips at a ramp's midpoint)
  const lift = e => { if (!UP) { e.lv = 0; e.y = 0; return e; } const c = Math.floor(e.x / CELL + GW / 2), r = Math.floor(e.z / CELL + GH / 2), ri = RAMPAT[r * GW + c];
    if (ri === undefined) { e.lv = e.lv ? 1 : 0; e.y = e.lv * UH; return e; } const rp = UP.ramps[ri], v = rp.ax === 'z' ? e.z : e.x, t = Math.max(0, Math.min(1, (v - rp.lo) / (rp.hi - rp.lo))); e.y = t * UH; e.lv = t > 0.5 ? 1 : 0; return e; };
  const onRamp = (x, z) => !!UP && RAMPAT[Math.floor(z / CELL + GH / 2) * GW + Math.floor(x / CELL + GW / 2)] !== undefined;
  // minimap (2D canvas, redrawn ~6x/s)
  const mm = document.createElement('canvas'), MS = matchMedia('(pointer:coarse)').matches ? 3 : 4; mm.width = GW * MS; mm.height = GH * MS; mm.id = 'minimap'; mm.style.cssText = 'position:fixed;right:calc(8px + env(safe-area-inset-right));top:calc(52px + env(safe-area-inset-top));z-index:3;border:1px solid #f608;border-radius:6px;background:#000a;pointer-events:none;image-rendering:pixelated;width:' + GW * MS + 'px'; document.body.appendChild(mm);
  const mx = mm.getContext('2d'); let mmT = 0;
  function drawMini(open, players, myId, boxSpot, zombies, myY = 0, q = null) { mx.clearRect(0, 0, mm.width, mm.height);
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const v = G[r][c]; if (v < 0) continue; mx.fillStyle = v >= 100 ? (walkable(WX(c), WZ(r), open) ? '#555' : '#ff3a10') : (open >> v) & 1 ? L.zones[v].col + '88' : '#ffffff14'; mx.fillRect(c * MS, r * MS, MS, MS); }
    if (UP) { const on = (open >> UP.zone) & 1, hi = myY > UH * 0.5; mx.strokeStyle = on ? (hi ? '#ffd27a' : '#ffc23a99') : '#ffffff33'; mx.lineWidth = 1;   // upper deck: outlined cells (bright while you're up there)
      for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (UG[r][c] === UP.zone) { if (hi && on) { mx.fillStyle = '#ffc23a55'; mx.fillRect(c * MS, r * MS, MS, MS); } mx.strokeRect(c * MS + 0.5, r * MS + 0.5, MS - 1, MS - 1); } }
    const P = (x, z) => [(x / CELL + GW / 2) * MS, (z / CELL + GH / 2) * MS];
    const bs = L.box[boxSpot]; if (bs) { const [x, y] = P(bs[0], bs[1]); mx.fillStyle = '#9af0ff'; mx.fillRect(x - 2, y - 2, 4, 4); }
    if (q && q[1] && !q[5]) { const [x, y] = P(q[2], q[3]); mx.fillStyle = (performance.now() / 300 | 0) % 2 ? '#7affff' : '#ffffff'; mx.beginPath(); mx.arc(x, y, 2.6, 0, 7); mx.fill(); }   // radio quest item
    if (q && q[0] && q[0] < 6) { const [x, y] = P(q[6], q[7]); mx.strokeStyle = '#7affff'; mx.strokeRect(x - 2.5, y - 2.5, 5, 5); }
    if (zombies) for (const z of zombies) { const [x, y] = P(z.x, z.z), r = z.ty === 3 ? 3.2 : z.ty === 2 ? 2.4 : z.ty === 5 ? 1.2 : 1.6, other = UP && Math.abs((z.y || 0) - myY) > 1.8; mx.fillStyle = '#000a'; mx.fillRect(x - r - 0.6, y - r - 0.6, 2 * r + 1.2, 2 * r + 1.2); mx.fillStyle = other ? '#7a1010' : '#ff1e1e'; mx.fillRect(x - r, y - r, 2 * r, 2 * r); }   // zombies: red dots (brutes bigger; dim = other floor)
    for (const p of players) { if (!p.alive) continue; const [x, y] = P(p.x, p.z); mx.fillStyle = p.id === myId ? '#fff' : '#ffb060'; mx.beginPath(); mx.arc(x, y, p.id === myId ? 3 : 2, 0, 7); mx.fill(); } }
  // wall-buys: chalk-outline pillars
  const wname = id => L.weapons.find(w => w.id === id)?.name || id;
  for (const w of L.wallbuys) { const p = new THREE.Mesh(g(new THREE.BoxGeometry(1.4, 2.2, 0.4).translate(0, 1.1, 0)), basic(0x332218)); p.position.set(w.x, 0, w.z); p.rotation.y = w.face || 0;
    const o = new THREE.Mesh(g(new THREE.BoxGeometry(1.0, 0.3, 0.45).translate(0, 1.4, 0)), basic(0xffe0b0)); o.position.copy(p.position); o.rotation.y = p.rotation.y;
    const t = label(`${wname(w.w)}\n${w.cost} pts · ammo ${Math.round(w.cost / 2)}`, '#ffe0b0', 512, 3.2); t.position.set(w.x, 2.7, w.z); root.add(p, o, t); }
  // perk machines: tall glowing cabinets + additive halo
  const halo = (c, s) => { const m = new THREE.Mesh(g(new THREE.PlaneGeometry(s, s)), basic(c, { transparent: true, opacity: 0.35, blending: add, depthWrite: false })); return m; };
  const perks = L.perks.map(k => { const grp = new THREE.Group(); const cab = new THREE.Mesh(g(new THREE.BoxGeometry(1.3, 2.6, 1).translate(0, 1.3, 0)), basic(new THREE.Color(k.col).multiplyScalar(0.55)));
    const strip = new THREE.Mesh(g(new THREE.BoxGeometry(1.36, 0.5, 1.06).translate(0, 2.1, 0)), basic(k.col)); grp.add(cab, strip); grp.userData.strip = strip; grp.userData.col = k.col;
    if (!low) { const h = halo(k.col, 3.2); h.position.y = 1.4; grp.add(h); grp.userData.h = h; }
    const t = label(`${k.ic ? k.ic + ' ' : ''}${k.name} · ${k.cost}\n${k.desc}`, k.col, 720, 3.9); t.position.y = 3.0; grp.add(t); grp.position.set(k.x, k.lv ? UH : 0, k.z); root.add(grp); return grp; });
  // boarded windows: dark frame + up to 6 planks (one instanced mesh); ripped planks fly off, new ones slam in
  const WN = L.windows || [], NB = L.boards || 6, frameM = new THREE.InstancedMesh(g(new THREE.BoxGeometry(1, 1, 1)), basic(0x120804), Math.max(1, WN.length * 3));
  const plank = new THREE.InstancedMesh(g(new THREE.BoxGeometry(1, 1, 1)), basic(0xffffff), WN.length * NB + 16); plank.frustumCulled = frameM.frustumCulled = false;
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Vp = new THREE.Vector3(), Sc = new THREE.Vector3(), PC = [new THREE.Color(0x8a5a32), new THREE.Color(0x6e4626), new THREE.Color(0x9c6a3c)];
  WN.forEach((w, i) => { const sx = w.ax === 'x' ? 2.6 : 0.5, sz = w.ax === 'x' ? 0.5 : 2.6, yo = w.lv ? UH : 0;
    frameM.setMatrixAt(i * 3, Mx.compose(Vp.set(w.x, 1.4 + yo, w.z), Q.identity(), Sc.set(w.ax === 'x' ? 3.2 : 0.7, 0.25, w.ax === 'x' ? 0.7 : 3.2)));
    frameM.setMatrixAt(i * 3 + 1, Mx.compose(Vp.set(w.x + (w.ax === 'x' ? 1.45 : 0), 1.9 + yo, w.z + (w.ax === 'x' ? 0 : 1.45)), Q.identity(), Sc.set(w.ax === 'x' ? 0.3 : 0.7, 1.6, w.ax === 'x' ? 0.7 : 0.3)));
    frameM.setMatrixAt(i * 3 + 2, Mx.compose(Vp.set(w.x - (w.ax === 'x' ? 1.45 : 0), 1.9 + yo, w.z - (w.ax === 'x' ? 0 : 1.45)), Q.identity(), Sc.set(w.ax === 'x' ? 0.3 : 0.7, 1.6, w.ax === 'x' ? 0.7 : 0.3))); });
  root.add(frameM, plank); const anim = WN.map(() => Array(NB).fill(1));   // per plank 0..1 (1 = nailed)
  let boards = WN.map(() => NB), flying = [];
  // mystery box
  const box = new THREE.Group(), boxBody = new THREE.Mesh(g(new THREE.BoxGeometry(2.2, 1, 1.1).translate(0, 0.5, 0)), basic(0x3a2614)), lid = new THREE.Mesh(g(new THREE.BoxGeometry(2.3, 0.15, 1.2)), basic(0x58e0ff));
  lid.position.y = 1.05; const beam = new THREE.Mesh(g(new THREE.CylinderGeometry(0.5, 0.9, 6, 10, 1, true).translate(0, 3, 0)), basic(0x58e0ff, { transparent: true, opacity: 0.22, blending: add, depthWrite: false, side: THREE.DoubleSide }));
  const btag = label(`Mystery Box · ${L.boxCost}`, '#9af0ff'); btag.position.y = 2.3; btag.scale.multiplyScalar(0.6); box.add(boxBody, lid, beam, btag); root.add(box);
  // fire FX: flickering additive flame tongues + rising embers (shared by the box and the Inferno Forge)
  const flameG = g(new THREE.ConeGeometry(0.16, 1, 6, 1, true).translate(0, 0.5, 0)), flameM = basic(0xff7a1a, { transparent: true, opacity: 0.85, blending: add, depthWrite: false, side: THREE.DoubleSide }), flameC = basic(0xffe08a, { transparent: true, opacity: 0.9, blending: add, depthWrite: false, side: THREE.DoubleSide });
  const fires = [];
  function flames(parent, pts, sz = 1) { pts.forEach(([x, y, z], i) => { const o = new THREE.Mesh(flameG, flameM), c = new THREE.Mesh(flameG, flameC); c.scale.set(0.45, 0.6, 0.45); o.add(c); o.position.set(x, y, z); o.userData = { ph: i * 1.7 + Math.random() * 3, k: 7 + Math.random() * 6, s: sz * (0.75 + Math.random() * 0.5) }; parent.add(o); fires.push(o); });
    if (low) return; const n = 26, eg = g(new THREE.BufferGeometry()), ep = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) { const b = pts[i % pts.length]; seed.push([b[0] + (Math.random() - .5) * .5, b[1], b[2] + (Math.random() - .5) * .5, Math.random(), 0.6 + Math.random() * 0.8]); }
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); const em = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.09, transparent: true, opacity: 0.9, blending: add, depthWrite: false })); mats.push(em.material); em.userData.seed = seed; em.frustumCulled = false; parent.add(em); fires.push(em); }
  function tickFires(dt) { for (const o of fires) { if (o.isPoints) { const P = o.geometry.attributes.position; o.userData.seed.forEach((e, i) => { e[3] = (e[3] + dt * e[4] * 0.6) % 1; P.setXYZ(i, e[0] + Math.sin(t * 2 + i) * 0.15 * e[3], e[1] + e[3] * 2.4, e[2] + Math.cos(t * 1.7 + i) * 0.15 * e[3]); }); P.needsUpdate = true; continue; }
      const u = o.userData, f = 0.65 + 0.35 * Math.abs(Math.sin(t * u.k + u.ph)) + 0.15 * Math.sin(t * 23 + u.ph); o.scale.set(u.s * (1.1 - f * 0.3), u.s * f * 1.1, u.s * (1.1 - f * 0.3)); o.rotation.y = t * 2 + u.ph; } }
  // the box burns: charred body, glowing ember seams, flames licking off every edge, fire-coloured lid and beam
  boxBody.material.color.setHex(0x22120a); lid.material.color.setHex(0xff6a1a); beam.material.color.setHex(0xff7a2a);
  { const seam = basic(0xff5a10); for (const y of [0.18, 0.82]) { const s = new THREE.Mesh(g(new THREE.BoxGeometry(2.24, 0.05, 1.14)), seam); s.position.y = y; box.add(s); } }
  flames(box, [[-1, 1.05, -0.48], [0, 1.08, -0.5], [1, 1.05, -0.48], [-1, 1.05, 0.48], [0, 1.08, 0.5], [1, 1.05, 0.48], [-1.05, 0.95, 0], [1.05, 0.95, 0]], 0.75);
  // Inferno Forge: iron furnace with a molten core, anvil, chimney and a crown of fire
  const F = L.forge, forge = new THREE.Group(), forgeCore = basic(0xff5a10);
  if (F) { const iron = basic(0x24201e), trim = basic(0x5a4a3a);
    const base = new THREE.Mesh(g(new THREE.BoxGeometry(2.6, 2.2, 1.6).translate(0, 1.1, 0)), iron), mouth = new THREE.Mesh(g(new THREE.BoxGeometry(1.5, 0.9, 0.1).translate(0, 1.0, 0.81)), forgeCore);
    const chim = new THREE.Mesh(g(new THREE.CylinderGeometry(0.32, 0.42, 1.6, 8).translate(0.7, 3.0, -0.3)), iron), band = new THREE.Mesh(g(new THREE.BoxGeometry(2.7, 0.18, 1.7).translate(0, 2.2, 0)), trim);
    const anvil = new THREE.Group(); { const a1 = new THREE.Mesh(g(new THREE.BoxGeometry(0.5, 0.6, 0.4).translate(0, 0.3, 0)), trim), a2 = new THREE.Mesh(g(new THREE.BoxGeometry(1.1, 0.25, 0.45).translate(0, 0.72, 0)), iron); anvil.add(a1, a2); anvil.position.set(-1.9, 0, 0.6); }
    forge.add(base, mouth, chim, band, anvil); if (!low) { const h = halo(0xff6a10, 4.5); h.position.set(0, 1.4, 0.9); forge.add(h); forge.userData.h = h; }
    flames(forge, [[0.7, 3.8, -0.3], [-0.6, 2.3, 0.2], [0, 2.3, -0.4], [0.5, 2.3, 0.5], [-0.4, 1.0, 0.86], [0.4, 1.0, 0.86], [0, 1.1, 0.86]], 1.1);
    const ft = label(`${F.name} · ${F.cost}\nUpgrade the weapon in your hands`, '#ff9a3a', 640, 3.6); ft.position.y = 4.4; forge.add(ft);
    forge.position.set(F.x, 0, F.z); forge.rotation.y = F.face || 0; root.add(forge); }
  // ===== atmosphere: sky dome, refinery skyline beyond the walls, smokestacks with smoke, wall-top fire =====
  const TOD = ENV?.tod || 'classic', SKYC = { classic: [0x050309, 0x3a1406], night: [0x020208, 0x1a0c10], dusk: [0x160c2a, 0xff6a2a], day: [0x5a7898, 0xc8a888] }[TOD], storm = !!ENV?.storm;
  const skyG = g(new THREE.SphereGeometry(330, 24, 12)), sc_ = [], cTop = new THREE.Color(SKYC[0]), cHor = new THREE.Color(SKYC[1]); if (storm) { cTop.multiplyScalar(0.45); cHor.lerp(new THREE.Color(0x30343c), 0.7); }
  for (let k = 0, P = skyG.attributes.position; k < P.count; k++) { const y = P.getY(k) / 330, c = cHor.clone().lerp(cTop, Math.min(1, Math.max(0, y * 2.2))); if (y < 0) c.multiplyScalar(0.3); sc_.push(c.r, c.g, c.b); }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(sc_, 3)); const skyM = basic(0xffffff, { vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }); const sky = new THREE.Mesh(skyG, skyM); sky.renderOrder = -10; root.add(sky);
  // Juggernaut rounds: an additive blood-red dome fades in over the sky while one is alive
  const redG = g(new THREE.SphereGeometry(320, 24, 12)), rc_ = []; for (let k = 0, P = redG.attributes.position; k < P.count; k++) { const y = Math.max(0, P.getY(k) / 320), a = Math.max(0, 1 - y * 1.6); rc_.push(0.22 + 0.6 * a, 0.01 + 0.07 * a, 0.01 + 0.03 * a); }
  redG.setAttribute('color', new THREE.Float32BufferAttribute(rc_, 3)); const redM = basic(0xffffff, { vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 }); const redSky = new THREE.Mesh(redG, redM); redSky.renderOrder = -9; redSky.visible = false; root.add(redSky);
  const bloodMoon = new THREE.Mesh(g(new THREE.CircleGeometry(16, 32)), basic(0xff2a10, { fog: false, transparent: true, opacity: 0, depthWrite: false })); bloodMoon.position.set(-120, 75, -240); bloodMoon.lookAt(0, 0, 0); bloodMoon.renderOrder = -8; root.add(bloodMoon);
  let jugOn = false, jr = 0; const RED_BG = new THREE.Color(0x2a0402), RED_FOG = new THREE.Color(0x4a0806);
  // facade texture: dark panels with a scatter of lit windows (one canvas, shared by every building)
  const fac = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#16100e'; x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { const lit = Math.random() < (TOD === 'day' ? 0.06 : 0.16); x.fillStyle = lit ? (Math.random() < 0.75 ? '#d8803a' : '#ffc070') : '#0a0808'; x.fillRect(q * 16 + 4, r * 16 + 5, 8, 7); }
    x.fillStyle = '#2a1e18'; for (let r = 0; r < 8; r++) x.fillRect(0, r * 16, 128, 2); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const bp = [], bu = [], bc = [], skyTint = TOD === 'day' ? 0.75 : TOD === 'dusk' ? 0.85 : 1;
  const bbox = (x0, x1, y1, z0, z1, shade) => { const F = [[[x0, 0, z1], [x1, 0, z1], [x1, y1, z1], [x0, y1, z1], x1 - x0], [[x1, 0, z0], [x0, 0, z0], [x0, y1, z0], [x1, y1, z0], x1 - x0], [[x1, 0, z1], [x1, 0, z0], [x1, y1, z0], [x1, y1, z1], z1 - z0], [[x0, 0, z0], [x0, 0, z1], [x0, y1, z1], [x0, y1, z0], z1 - z0]];
    for (const [a, b, c, d, w] of F) { const U = [[0, 0], [w / 8, 0], [w / 8, y1 / 8], [0, y1 / 8]]; for (const k of [0, 1, 2, 0, 2, 3]) { bp.push(...[a, b, c, d][k]); bu.push(...U[k]); bc.push(shade * skyTint, shade * skyTint, shade * skyTint); } } };
  const HX = GW * CELL / 2, HZ = GH * CELL / 2, stacks = [];
  for (let k = 0; k < (low ? 34 : 60); k++) { const side = k % 4, u = Math.random() * 2 - 1, dist = 14 + Math.random() * 70, w = 6 + Math.random() * 14, d = 6 + Math.random() * 14, h = 6 + Math.random() * (dist > 45 ? 26 : 12);
    const cx = side < 2 ? u * (HX + 60) : (side === 2 ? -1 : 1) * (HX + dist), cz = side < 2 ? (side === 0 ? -1 : 1) * (HZ + dist) : u * (HZ + 60); bbox(cx - w / 2, cx + w / 2, h, cz - d / 2, cz + d / 2, 0.55 + Math.random() * 0.5);
    if (Math.random() < 0.4 && stacks.length < (low ? 7 : 14)) stacks.push([cx + (Math.random() - 0.5) * w * 0.6, cz + (Math.random() - 0.5) * d * 0.6, h + 14 + Math.random() * 26]); }
  const tankM = basic(new THREE.Color(0x2a2420).multiplyScalar(skyTint * 1.3), { fog: false }), bandM = basic(0x5a3018, { fog: false });
  for (let k = 0; k < (low ? 6 : 12); k++) { const a = Math.random() * Math.PI * 2, rr = Math.max(HX, HZ) + 18 + Math.random() * 30, x = Math.cos(a) * (HX + 16 + Math.random() * 30), z = Math.sin(a) * (HZ + 16 + Math.random() * 30), R_ = 4 + Math.random() * 5, h = 5 + Math.random() * 6;
    const tk = new THREE.Mesh(g(new THREE.CylinderGeometry(R_, R_, h, 16).translate(0, h / 2, 0)), tankM), band = new THREE.Mesh(g(new THREE.CylinderGeometry(R_ + 0.08, R_ + 0.08, 0.5, 16)), bandM); tk.position.set(x, 0, z); band.position.set(x, h * 0.7, z); root.add(tk, band); }
  { const bg_ = g(new THREE.BufferGeometry()); bg_.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg_.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg_.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3)); root.add(new THREE.Mesh(bg_, basic(0xffffff, { map: fac, vertexColors: true, fog: false }))); }
  // smokestacks: dark cylinders, a glowing rim, blinking aviation light, and a drifting smoke column (one Points cloud)
  const stackM = basic(new THREE.Color(0x1c1612).multiplyScalar(skyTint * 1.4), { fog: false }), rimM = basic(0xff5a1a, { fog: false }), blinkM = basic(0xff2010, { fog: false }), blinks = [];
  for (const [x, z, h] of stacks) { const st = new THREE.Mesh(g(new THREE.CylinderGeometry(1.6, 2.4, h, 10).translate(0, h / 2, 0)), stackM), rim = new THREE.Mesh(g(new THREE.CylinderGeometry(1.7, 1.7, 0.6, 10)), rimM); st.position.set(x, 0, z); rim.position.set(x, h - 0.3, z);
    const b = new THREE.Mesh(g(new THREE.SphereGeometry(0.45, 6, 4)), blinkM); b.position.set(x, h + 0.6, z); blinks.push(b); root.add(st, rim, b); }
  const SN = stacks.length * (low ? 14 : 30), spos = new Float32Array(SN * 3), sage = new Float32Array(SN), smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  for (let k = 0; k < SN; k++) sage[k] = Math.random();
  const smG = g(new THREE.BufferGeometry()); smG.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const smM = new THREE.PointsMaterial({ color: TOD === 'day' ? 0x8a8278 : TOD === 'dusk' ? 0x5a3a34 : 0x2a2224, size: 9, map: smokeTex, transparent: true, opacity: 0.5, depthWrite: false, fog: false }); mats.push(smM); const smoke = new THREE.Points(smG, smM); smoke.frustumCulled = false; if (SN) root.add(smoke);
  // wall-top fire: wallF burn along the top edge of every wall that borders a room (full blaze once the room is open, embers before), each casting a glow on the floor below
  const flameTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    const lay = (w, h, col) => { const gr = x.createRadialGradient(32, 112, 2, 32, 96, h); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(32 - w, 124); x.quadraticCurveTo(32 - w * 1.1, 70, 32, 128 - h - 10); x.quadraticCurveTo(32 + w * 1.1, 70, 32 + w, 124); x.fill(); };
    lay(26, 110, 'rgba(255,90,10,.9)'); lay(17, 80, 'rgba(255,170,40,.95)'); lay(9, 44, 'rgba(255,240,190,1)'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const isWallC = (r, c) => r >= 0 && c >= 0 && r < GH && c < GW && G[r][c] === -1 && !obstH.has(r * GW + c) && !winCell.has(r * GW + c);
  const wallF = [], FMAX = low ? 220 : 520;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const zi = G[r][c]; if (zi < 0) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isWallC(r + dr, c + dc) && wallF.length < FMAX) wallF.push({ x: WX(c) + dc * (CELL / 2 + 0.08), z: WZ(r) + dr * (CELL / 2 + 0.08), gx: WX(c) + dc * 0.2, gz: WZ(r) + dr * 0.2, zi, ph: Math.random() * 20, s: 0.8 + Math.random() * 0.5, h: upFlame.has((r + dr) * GW + c + dc) ? H2 : H }); }
  const NF = Math.max(1, wallF.length), wfM = new THREE.InstancedMesh(g(new THREE.PlaneGeometry(1, 2).translate(0, 1, 0)), basic(0xffffff, { map: flameTex, transparent: true, blending: add, depthWrite: false, side: THREE.DoubleSide }), NF);
  const fglowM = new THREE.InstancedMesh(g(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), basic(0xffffff, { map: glowTex, transparent: true, blending: add, depthWrite: false }), NF);
  const fsrcM = new THREE.InstancedMesh(g(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), basic(0xffffff, { map: glowTex, transparent: true, blending: add, depthWrite: false }), NF);   // hot spot on the wall top itself
  for (const m of [wfM, fglowM, fsrcM]) { m.count = wallF.length; m.frustumCulled = false; for (let i = 0; i < NF; i++) m.setColorAt(i, new THREE.Color(0)); root.add(m); }
  { const Mx_ = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), V0 = new THREE.Vector3(), S0 = new THREE.Vector3(); wallF.forEach((f, i) => { fglowM.setMatrixAt(i, Mx_.compose(V0.set(f.gx, 0.035, f.gz), Q0, S0.set(3.4, 1, 3.4))); fsrcM.setMatrixAt(i, Mx_.compose(V0.set(f.x, f.h + 0.02, f.z), Q0, S0.set(1.6, 1, 1.6))); }); }
  const FM = new THREE.Matrix4(), FQ = new THREE.Quaternion(), FE = new THREE.Euler(), FV = new THREE.Vector3(), FS = new THREE.Vector3(), FC = new THREE.Color(0xff8a30), FC2 = new THREE.Color(0x6a1a04);
  function tickAtmos(dt, open) { for (let k = 0; k < SN; k++) { const si = k % stacks.length, s_ = stacks[si]; let a = sage[k] + dt * 0.06; if (a > 1) a -= 1; sage[k] = a; spos[k * 3] = s_[0] + a * 28 + Math.sin(a * 9 + k) * 2 * a; spos[k * 3 + 1] = s_[2] + a * 40; spos[k * 3 + 2] = s_[1] + a * 10 + Math.cos(a * 7 + k) * 2 * a; }
    if (SN) smG.attributes.position.needsUpdate = true; const bl = Math.sin(t * 3) > 0.6; blinkM.color.setHex(bl ? 0xff2010 : 0x300404);
    { const cq = scene.userData.camQ, yaw = cq ? FE.setFromQuaternion(cq, 'YXZ').y : 0; FQ.setFromEuler(FE.set(0, yaw, 0));
      wallF.forEach((f, i) => { const on = (open >> f.zi) & 1, n = 0.75 + 0.25 * Math.sin(t * 9 + f.ph) * Math.sin(t * 5.3 + f.ph * 1.7), hgt = (on ? 1.0 : 0.28) * f.s * n;
        FM.compose(FV.set(f.x, f.h - 0.05, f.z), FQ, FS.set((on ? 1.25 : 0.5) * f.s * (0.9 + 0.1 * n), hgt, 1)); wfM.setMatrixAt(i, FM);
        const k = on ? n * (1 + flash * 0.4) : 0.35; wfM.setColorAt(i, FC.setHex(on ? 0xffffff : 0xff6a20).multiplyScalar(k)); fsrcM.setColorAt(i, FC.setHex(0xff7a20).multiplyScalar(on ? 0.7 * n : 0.2));
        fglowM.setColorAt(i, FC2.setHex(0xff6a18).multiplyScalar(on ? (TOD === 'day' ? 0.16 : 0.3) * n : 0.03)); });
      wfM.instanceMatrix.needsUpdate = true; for (const m of [wfM, fglowM, fsrcM]) if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    skyM.color.setScalar(1 + flash * 2.5);
    jr += ((jugOn ? 1 : 0) - jr) * Math.min(1, dt * 0.6); redSky.visible = jr > 0.01; redM.opacity = jr * (0.88 + 0.1 * Math.sin(t * 1.3)); bloodMoon.material.opacity = jr; smM.color.setHex(TOD === 'day' ? 0x8a8278 : TOD === 'dusk' ? 0x5a3a34 : 0x2a2224).lerp(RED_FOG, jr * 0.6);
    if (SKY && jr > 0.01 && scene.background && scene.fog) { scene.background.lerp(RED_BG, jr * 0.8); scene.fog.color.lerp(RED_FOG, jr * (SKY ? 0.7 : 0.08)); } }
  // Power Switch (procedural maps): perks and the Forge stay dark until someone throws it
  const PW = L.power, lever = new THREE.Group(), pwLight = new THREE.Mesh(g(new THREE.SphereGeometry(0.16, 10, 8)), basic(0xff2a10));
  if (PW) { const pg = new THREE.Group(), panel = new THREE.Mesh(g(new THREE.BoxGeometry(1.5, 2.0, 0.35).translate(0, 1.5, 0)), basic(0x2c3036)), stripe = new THREE.Mesh(g(new THREE.BoxGeometry(1.52, 0.18, 0.37).translate(0, 2.2, 0)), basic(0xffc020));
    const arm = new THREE.Mesh(g(new THREE.BoxGeometry(0.12, 0.7, 0.12).translate(0, 0.35, 0)), basic(0x9a9a9a)), knob = new THREE.Mesh(g(new THREE.SphereGeometry(0.13, 8, 6)), basic(0xff3020)); knob.position.y = 0.72; lever.add(arm, knob); lever.position.set(0, 1.3, 0.25);
    pwLight.position.set(0.5, 2.2, 0.22); const tl = label(`Power Switch\nTurn it on for perks + the Forge`, '#ffd050', 640, 3.4); tl.position.y = 3.2; pg.add(panel, stripe, lever, pwLight, tl); pg.position.set(PW.x, 0, PW.z); pg.rotation.y = PW.face || 0; root.add(pg); }
  // storm: falling rain streaks over the whole map + lightning flashes
  let rain = null, rpos = null, flash = 0, nextBolt = 4 + Math.random() * 8; const RN = low ? 500 : 1500;
  if (ENV?.storm) { rpos = new Float32Array(RN * 6); for (let k = 0; k < RN; k++) { const x = (Math.random() - 0.5) * GW * CELL, z = (Math.random() - 0.5) * GH * CELL, y = Math.random() * 14; rpos.set([x, y, z, x + 0.05, y - 0.7, z + 0.05], k * 6); }
    const rg = g(new THREE.BufferGeometry()); rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3)); const rm = new THREE.LineBasicMaterial({ color: 0x9ab4d0, transparent: true, opacity: 0.45, depthWrite: false }); mats.push(rm); rain = new THREE.LineSegments(rg, rm); rain.frustumCulled = false; root.add(rain); }
  function tickEnv(dt) { if (rain) { for (let k = 0; k < RN; k++) { const j = k * 6; let y = rpos[j + 1] - dt * 22; if (y < 0) y += 14; rpos[j + 1] = y; rpos[j + 4] = y - 0.7; } rain.geometry.attributes.position.needsUpdate = true;
      if ((nextBolt -= dt) <= 0) { flash = 1; nextBolt = 5 + Math.random() * 11; } }
    flash = Math.max(0, flash - dt * 4); if (SKY) { const f = flash > 0.05 && Math.sin(flash * 40) > -0.3 ? flash : 0; scene.background.setHex(SKY[0]).lerp(new THREE.Color(0xdfe8ff), f * 0.7); scene.fog.color.setHex(SKY[1]).lerp(new THREE.Color(0xc8d4ff), f * 0.6); wallMat.color.setScalar(LF * (1 + f * 1.4)); } }
  // ===== Night Shift radio quest: the flare console (fixed per map) + the glowing part that's out right now =====
  const QITEM = [null, { n: 'Valve Wheel', c: 0x7affff }, { n: 'Igniter Fuse', c: 0xffe14a }, { n: "Foreman's Key Card", c: 0xff6ad0 }];
  let qState = null, myIdQ = 0, qCon = null, qLit = 0; const qItem = new THREE.Group(), qGlow = basic(0x7affff), qBeamM = basic(0x7affff, { transparent: true, opacity: 0.25, blending: add, depthWrite: false, side: THREE.DoubleSide });
  { const wheel = new THREE.Mesh(g(new THREE.TorusGeometry(0.32, 0.07, 6, 14)), qGlow), hub = new THREE.Mesh(g(new THREE.BoxGeometry(0.62, 0.08, 0.08)), qGlow), hub2 = hub.clone(); hub2.rotation.z = Math.PI / 2; wheel.add(hub, hub2); wheel.position.y = 0.9; qItem.add(wheel); qItem.userData.spin = wheel;
    const col = new THREE.Mesh(g(new THREE.CylinderGeometry(0.35, 0.6, 7, 10, 1, true).translate(0, 3.5, 0)), qBeamM); qItem.add(col); qItem.visible = false; root.add(qItem); }
  function makeConsole(q) { const grp = new THREE.Group(), body = new THREE.Mesh(g(new THREE.BoxGeometry(1.8, 1.3, 0.8).translate(0, 0.65, 0)), basic(0x22262c)), top = new THREE.Mesh(g(new THREE.BoxGeometry(1.8, 0.1, 0.9).translate(0, 1.35, 0.05)), basic(0x3a4048));
    const screen = new THREE.Mesh(g(new THREE.PlaneGeometry(1.2, 0.5)), basic(0x0a3a3a)); screen.position.set(0, 0.95, 0.41); const pipe = new THREE.Mesh(g(new THREE.CylinderGeometry(0.16, 0.16, 3.4, 8).translate(0.7, 1.7, -0.25)), basic(0x5a4a3a));
    const slots = [1, 2, 3].map(k => { const m = new THREE.Mesh(g(new THREE.BoxGeometry(0.28, 0.12, 0.2)), basic(0x301010)); m.position.set(-0.55 + (k - 1) * 0.4, 1.45, 0.1); grp.add(m); return m; });
    const t = label('📻 Flare Console\nNight Shift radio quest', '#7affff', 640, 3.4); t.position.y = 2.5; grp.add(body, top, screen, pipe, t); grp.position.set(q[6], q[8] ? UH : 0, q[7]); grp.rotation.y = q[9] || 0; root.add(grp);
    grp.userData = { screen, slots, flare: null }; return grp; }
  function tickQuest(dt) { const q = qState; if (!q) { qItem.visible = false; return; } if (!qCon) qCon = makeConsole(q);
    const fitted = q[0] >= 6 ? 3 : Math.floor(q[0] / 2); qCon.userData.slots.forEach((m, i) => m.material.color.setHex(i < fitted ? QITEM[i + 1].c : 0x301010)); qCon.userData.screen.material.color.setHex(q[1] && q[5] === myIdQ ? (Math.sin(t * 8) > 0 ? 0x2affff : 0x0a5a5a) : 0x0a3a3a);
    const show = q[1] && !q[5]; qItem.visible = !!show; if (show) { const it = QITEM[q[1]]; qGlow.color.setHex(it.c); qBeamM.color.setHex(it.c); qBeamM.opacity = 0.18 + 0.1 * Math.sin(t * 3); qItem.position.set(q[2], q[4] ? UH : 0, q[3]); qItem.userData.spin.rotation.y = t * 2; qItem.userData.spin.position.y = 0.9 + Math.sin(t * 2.5) * 0.12; }
    if (q[0] >= 6 && !qCon.userData.flare) { const fl = new THREE.Group(); flames(fl, [[0, 3.6, 0], [0.3, 3.9, 0.2], [-0.3, 3.8, -0.2], [0, 4.4, 0]], 2.4); fl.position.set(0.7, 0, -0.25); qCon.add(fl); qCon.userData.flare = fl; } }
  let forgeFlash = 0;
  let roll = null, rollTag = null;
  const near = (me, x, z, r = 3, lv = 0) => Math.hypot(me.x - x, me.z - z) <= r && Math.abs((me.y || 0) - lv * UH) < 1.6;
  let t = 0;
  return {
    wname,
    forged() { forgeFlash = 1.5; },
    applyEnv() { if (!SKY) return; if (!scene.background) scene.background = new THREE.Color(); scene.background.setHex(SKY[0]); scene.fog.color.setHex(SKY[1]); scene.fog.near = SKY[2]; scene.fog.far = SKY[3]; },
    title: () => `${L.name || 'Zombies'}${ENV ? ' · ' + ENV.tod + (ENV.storm ? ' · storm' : '') : ''}`,
    rolling(e) { roll = { until: performance.now() + 2500, w: e.w }; },
    rip(e) { const w = WN[e.i]; if (w) flying.push({ w, k: e.n, t: 0 }); },
    board(e) { if (anim[e.i]) anim[e.i][e.n - 1] = 0; },
    quest(q, myId) { qState = q || null; myIdQ = myId; },
    update(dt, m, b) { t += dt; if (b) boards = b; tickQuest(dt); tickFires(dt); tickEnv(dt); tickAtmos(dt, m ? m[0] : 1); if (F) { forgeFlash = Math.max(0, forgeFlash - dt); forgeCore.color.setRGB(1, 0.33 + 0.12 * Math.sin(t * 7) + forgeFlash * 0.4, 0.06 + forgeFlash * 0.3); if (forge.userData.h) { forge.userData.h.material.opacity = 0.3 + 0.12 * Math.sin(t * 5) + forgeFlash * 0.3; forge.userData.h.quaternion.copy(scene.userData.camQ || forge.userData.h.quaternion); } } for (let k = 0; k < DN; k++) { const j = k * 3; dpos[j + 1] += dsp[k] * dt * 0.6; dpos[j] += Math.sin(t * 0.3 + k) * dt * 0.08; if (dpos[j + 1] > H) dpos[j + 1] = 0; } dg.attributes.position.needsUpdate = true;
      let pi = 0; WN.forEach((w, i) => { for (let k = 0; k < NB; k++) { const on = k < boards[i]; let a = anim[i][k]; if (on && a < 1) a = anim[i][k] = Math.min(1, a + dt * 5);
        const y = 0.75 + k * 0.27 + (w.lv ? UH : 0), tilt = ((k * 7 + i) % 5 - 2) * 0.09, off = on ? (1 - a) * 1.2 : 0;
        Q.setFromEuler(E.set(w.ax === 'z' ? tilt : 0, 0, w.ax === 'x' ? tilt : 0)); const ox = w.ix - w.x, oz = w.iz - w.z, l = Math.hypot(ox, oz) || 1;
        Mx.compose(Vp.set(w.x + ox / l * (0.15 + off), y, w.z + oz / l * (0.15 + off)), Q, on ? Sc.set(w.ax === 'x' ? 2.8 : 0.08, 0.2, w.ax === 'x' ? 0.08 : 2.8) : Sc.set(0, 0, 0));
        plank.setMatrixAt(pi, Mx); plank.setColorAt(pi, PC[(k + i) % 3]); pi++; } });
      for (let j = flying.length - 1; j >= 0; j--) { const f = flying[j]; f.t += dt; if (f.t > 0.9) { flying.splice(j, 1); continue; } if (pi >= WN.length * NB + 16) continue;
        const w = f.w, ox = w.x - w.ix, oz = w.z - w.iz, l = Math.hypot(ox, oz) || 1, u = f.t;   // torn outward, spinning, falling
        Q.setFromEuler(E.set(u * 9, u * 4, u * 6)); Mx.compose(Vp.set(w.x + ox / l * u * 4, 0.75 + f.k * 0.27 + u * 2 - u * u * 6 + (w.lv ? UH : 0), w.z + oz / l * u * 4), Q, Sc.set(w.ax === 'x' ? 2.8 : 0.08, 0.2, w.ax === 'x' ? 0.08 : 2.8)); plank.setMatrixAt(pi, Mx); plank.setColorAt(pi, PC[0]); pi++; }
      plank.count = pi;
      plank.instanceMatrix.needsUpdate = true; if (plank.instanceColor) plank.instanceColor.needsUpdate = true; if (!m) return; const [open, spot, st] = m;
      if (slabMat) slabMat.color.setScalar((((open >> UP.zone) & 1) ? 1 : 0.45) * LF * (1 + flash * 1.5)); floors.forEach((f, i) => f && f.material.color.setHex(0x2a2320).lerp(f.userData.c, 0.18).multiplyScalar(((open >> i) & 1 ? 0.75 : 0.25) * LF * (1 + flash * 1.5)));
      const pw = m[3] ?? 1; if (PW) { lever.rotation.x = pw ? -0.9 : 0.9; pwLight.material.color.setHex(pw ? 0x40ff70 : (Math.sin(t * 6) > 0 ? 0xff2a10 : 0x400804)); }
      for (const p of perks) { p.userData.strip.material.color.set(pw ? p.userData.col : '#222'); if (p.userData.h) p.userData.h.visible = !!pw; }
      for (const [k, f] of furn.entries()) f.material.color.setRGB(1, 0.35 + 0.15 * Math.sin(t * 9 + k * 2) + 0.1 * Math.sin(t * 23 + k), 0.05);
      L.doors.forEach((d, i) => { doors[i].visible = !(((open >> d.a) & 1) && ((open >> d.b) & 1)); });
      for (const p of perks) if (p.userData.h) { p.userData.h.material.opacity = 0.25 + 0.12 * Math.sin(t * 3 + p.position.x); p.userData.h.quaternion.copy(scene.userData.camQ || p.userData.h.quaternion); }
      box.visible = st !== 2; const bs = L.box[spot] || L.box[0]; box.position.set(bs[0], 0, bs[1]); box.rotation.y = (bs[2] || 0) + Math.PI / 2; lid.position.y = st === 1 ? 1.5 + Math.sin(t * 20) * 0.08 : 1.05; beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 2);
      if (roll && performance.now() < roll.until && st === 1) { const names = L.weapons.slice(1), k = Math.floor(t * 12) % names.length, last = performance.now() > roll.until - 500, txt = last ? wname(roll.w) : names[k].name;
        if (!rollTag || rollTag.userData.txt !== txt) { if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); } rollTag = label(txt, '#fff3a0', 512, 4.5); rollTag.userData.txt = txt; rollTag.position.y = 1.9; box.add(rollTag); } }
      else if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); rollTag = null; } },
    // what pressing USE would do here (the server re-checks everything)
    walkable, zoneOf, lift, onRamp, upH: UH, hasUp: !!UP, zoneName: (x, z, lv = 0) => L.zones[zoneOf(x, z, lv)]?.n || (lv ? '' : L.zones[zoneOf(x, z, 1)]?.n) || '',
    mini(st, myId, myY = 0) { jugOn = !!st.zombies?.some(z => z.ty === 3) || !!window.__jugTest; if ((mmT += 1) % 5 || !st.map) return; drawMini(st.map[0], st.players, myId, st.map[1], st.zombies, myY, st.quest); },
    prompt(me, m, pts, guns, perkBits, upBits = 0) { if (!m) return null; const [open, spot, st] = m;
      const op = m[0]; let bw = -1, bd = 2.6; WN.forEach((w, i) => { const on = ((op >> w.zone) & 1) && (w.behind == null || !((op >> w.behind) & 1)) && Math.abs((me.y || 0) - (w.lv ? UH : 0)) < 1.6, d = Math.hypot(me.x - w.ix, me.z - w.iz); if (on && d < bd && boards[i] < NB) { bd = d; bw = i; } });
      if (qState && qState[1] && qState[5] === myIdQ && near(me, qState[6], qState[7], 3, qState[8])) return { t: `Flare console: fit the ${QITEM[qState[1]]?.n || 'part'}`, c: 0 };
      if (bw >= 0) return { t: `🔨 Rebuilding… (${boards[bw]}/${NB})`, c: 0, hold: 1 };
      for (const d of L.doors) { const ua = (open >> d.a) & 1, ub = (open >> d.b) & 1; if (ua === ub) continue; const along = d.ax === 'x' ? Math.abs(me.x - d.x) : Math.abs(me.z - d.z), across = d.ax === 'x' ? Math.abs(me.z - d.z) : Math.abs(me.x - d.x);
        if (along <= 3 && across <= 3 && (me.y || 0) < 1.6) return { t: `${d.deb ? 'Clear the debris to' : 'Open'} ${L.zones[ua ? d.b : d.a].n}`, c: d.cost }; }
      for (const w of L.wallbuys) if (near(me, w.x, w.z)) return guns.includes(w.w) ? { t: `Refill ${wname(w.w)}`, c: Math.round(w.cost / 2) } : { t: `Buy ${wname(w.w)}`, c: w.cost };
      const bs = L.box[spot]; if (st === 0 && bs && near(me, bs[0], bs[1])) return { t: 'Mystery Box: random weapon', c: L.boxCost };
      const pw = m[3] ?? 1; if (PW && near(me, PW.x, PW.z)) return pw ? { t: 'Power is on', c: 0, no: 1 } : { t: 'Power Switch: turn on the power', c: 0 };
      if (!pw && ((F && near(me, F.x, F.z)) || L.perks.some(k => near(me, k.x, k.z, 3, k.lv || 0)))) return { t: 'No power. Find the Power Switch first', c: 0, no: 1 };
      if (F && near(me, F.x, F.z)) return upBits & 1 ? { t: `${F.name}: ${L.weapons.find(w => w.id === guns[0])?.up || 'weapon'} already forged`, c: 0, no: 1 } : { t: `${F.name}: forge ${wname(guns[0])} into ${L.weapons.find(w => w.id === guns[0])?.up || 'something deadlier'}`, c: F.cost };
      let n = 0; for (let v = perkBits; v; v >>= 1) n += v & 1;
      for (let i = 0; i < L.perks.length; i++) { const k = L.perks[i]; if (near(me, k.x, k.z, 3, k.lv || 0)) return perkBits & (1 << i) ? { t: `${k.name} (owned)`, c: 0, no: 1 } : n >= L.maxPerks ? { t: `Max ${L.maxPerks} perks`, c: 0, no: 1 } : { t: `${k.name}: ${k.desc}`, c: k.cost }; }
      return null; },
    dispose() { if (SKY) scene.background.setHex(0x050208); mm.remove(); scene.remove(root); root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); for (const x of mats) x.dispose(); for (const x of geos) x.dispose(); },
  };
}
