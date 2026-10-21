// Refinery environment dressing (High tier only; Low keeps the old cost): floor AO along wall bases + grime decals (1 draw),
// pipes along the wall tops (1), lamp housings (1) + flickering lamp glow (1), barrels and crates (2 instanced), steam vents (1 Points).
// Everything is static, merged or instanced, unlit (MeshBasic + vertex colours) like the rest of the map, and visual only (server collision unchanged).
import * as THREE from 'three';
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(9157);   // seeded, so every client sees the same dressing
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
export function addRefineryEnv(root, L, { low = false, g = x => x, basic, plank } = {}) {
  if (low) return () => {};
  const G = L.grid, CELL = L.cell, GW = L.gw, GH = L.gh, WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1;
  const obst = new Set(); for (const [c0, c1, r0, r1] of L.obst || []) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) obst.add(r * GW + c);   // low desks/crates/pillars are not walls
  const wall = (r, c) => r < 0 || r >= GH || c < 0 || c >= GW || (G[r][c] === -1 && !obst.has(r * GW + c)), floor = (r, c) => r >= 0 && r < GH && c >= 0 && c < GW && G[r][c] >= 0 && G[r][c] < 100;
  const winSet = new Set(L.windows.map(w => w.r * GW + w.c)), busy = new Set();
  for (const w of L.windows) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) busy.add((w.r + dr) * GW + w.c + dc);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (G[r][c] >= 100) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) busy.add((r + dr) * GW + c + dc);
  const near = (x, z, list) => list && list.some(o => Math.hypot((o.x ?? o[0]) - x, (o.z ?? o[1]) - z) < 2.6);
  const keepOut = [...(L.perks || []), ...(L.wallbuys || []), ...((L.box || []).map(b => ({ x: b[0], z: b[1] })))];
  if (L.forge) keepOut.push(L.forge); if (L.power) keepOut.push(L.power); if (L.quest?.console) keepOut.push({ x: L.quest.console[0], z: L.quest.console[1] });
  // wall edges that border a ground floor cell: [x, z, nx, nz, r, c] (n points from the wall into the room)
  const edges = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (!floor(r, c)) continue;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (wall(r + dr, c + dc) && !winSet.has((r + dr) * GW + c + dc)) edges.push([WX(c) + dc, WZ(r) + dr, -dc, -dr, r, c]); }
  // ---- 1) floor AO strips + decals: one mesh, one atlas (AO gradient | blood | scorch | oil) ----
  const atlas = canvasTex(256, 64, (x) => { const gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(0,0,0,.78)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const blot = (ox, col, n, rr) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = rnd() * 18; x.fillStyle = col; x.globalAlpha = 0.25 + rnd() * 0.5; x.beginPath(); x.arc(ox + 32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 2 + rnd() * rr, 0, 6.28); x.fill(); } x.globalAlpha = 1; };
    blot(64, '#4a0606', 40, 7); blot(64, '#2a0202', 14, 4);
    const sg = x.createRadialGradient(160, 32, 2, 160, 32, 30); sg.addColorStop(0, 'rgba(8,6,4,.95)'); sg.addColorStop(.6, 'rgba(20,12,6,.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = sg; x.fillRect(128, 0, 64, 64);
    blot(192, '#050608', 30, 9); x.fillStyle = 'rgba(60,40,90,.18)'; x.beginPath(); x.arc(224, 30, 10, 0, 6.28); x.fill(); });
  const dp = [], du = [], Y = 0.03;
  const quad = (p, u) => { for (const i of [0, 1, 2, 0, 2, 3]) { dp.push(...p[i]); du.push(...u[i]); } };
  for (const [x, z, nx, nz] of edges) { const tx = -nz, tz = nx, w = 0.95 * 1.04, d = 0.9;   // strip lying on the floor along the wall base, dark at the wall
    const a = [x + tx * w, Y, z + tz * w], b = [x - tx * w, Y, z - tz * w], c2 = [x - tx * w + nx * d, Y, z - tz * w + nz * d], e = [x + tx * w + nx * d, Y, z + tz * w + nz * d];
    quad([a, b, c2, e], [[0, 1], [0.25, 1], [0.25, 0], [0, 0]]); }
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (!floor(r, c) || rnd() > 0.16) continue; const k = 1 + Math.floor(rnd() * 3), s = 0.7 + rnd() * 1.4, a = rnd() * 6.28, x = WX(c) + (rnd() - 0.5), z = WZ(r) + (rnd() - 0.5);
    const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + (u * Math.cos(a) - v * Math.sin(a)) * s, Y + 0.002 * k, z + (u * Math.sin(a) + v * Math.cos(a)) * s]);
    quad(P, [[k / 4, 0], [(k + 1) / 4, 0], [(k + 1) / 4, 1], [k / 4, 1]]); }
  const dg = g(new THREE.BufferGeometry()); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2));
  root.add(new THREE.Mesh(dg, basic(0xffffff, { map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  // ---- 2) pipes along wall tops + 3) lamp housings (merged, vertex-shaded) ----
  const merge = (list) => { const pos = [], col = []; for (const [geo, c0, c1] of list) { const n = geo.toNonIndexed(), P = n.attributes.position, N = n.attributes.normal, A = new THREE.Color(c0), B = new THREE.Color(c1), T = new THREE.Color();
      for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); T.copy(A).lerp(B, Math.max(0, N.getY(i)) * 0.6 + 0.4 * (0.5 + 0.5 * N.getX(i))); col.push(T.r, T.g, T.b); } n.dispose(); }
    const o = g(new THREE.BufferGeometry()); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o; };
  const pipes = [], lamps = [], lampPos = [];
  edges.forEach(([x, z, nx, nz], i) => { const tx = -nz, tz = nx, along = Math.abs(nz) > 0;
    const hue = i % 7 === 0 ? [0x3a1206, 0x8a3a12] : [0x1c1c20, 0x5a5660];   // a few rust-red pipes among the steel ones
    pipes.push([new THREE.CylinderGeometry(0.09, 0.09, 2.02, 5, 1, true).rotateZ(along ? Math.PI / 2 : 0).rotateX(along ? 0 : Math.PI / 2).translate(x + nx * 0.16, 3.0, z + nz * 0.16), ...hue]);
    if (i % 3 === 0) pipes.push([new THREE.CylinderGeometry(0.05, 0.05, 2.02, 3, 1, true).rotateZ(along ? Math.PI / 2 : 0).rotateX(along ? 0 : Math.PI / 2).translate(x + nx * 0.14, 2.78, z + nz * 0.14), 0x101012, 0x3a3a40]);   // cable
    if (i % 5 === 2) { const lx = x + nx * 0.22, lz = z + nz * 0.22; lamps.push([new THREE.BoxGeometry(along ? 0.5 : 0.22, 0.16, along ? 0.22 : 0.5).translate(lx, 2.55, lz), 0x2a2018, 0x6a5a40]); lampPos.push([lx + nx * 0.05, 2.45, lz + nz * 0.05, nx, nz, rnd()]); } });
  root.add(new THREE.Mesh(merge(pipes.concat(lamps)), basic(0xffffff, { vertexColors: true })));   // pipes, cables and lamp housings: one draw
  // ---- 4) lamp glow: bulb + soft warm pool on the wall/floor (one additive mesh, vertex alpha via colour), flicker by group ----
  const glowTex = canvasTex(64, 64, (x) => { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,160,1)'); gr.addColorStop(.25, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); });
  const gp = [], gu = [], gc = [], FL = []; const gq = (P, k) => { for (const i of [0, 1, 2, 0, 2, 3]) { gp.push(...P[i]); gu.push(...[[0, 0], [1, 0], [1, 1], [0, 1]][i]); gc.push(k, k, k); } };
  for (const [x, y, z, nx, nz, f] of lampPos) { const tx = -nz, tz = nx, s = 0.9, fs = 2.2, k = f < 0.25 ? 0.6 : 1;   // vertical glow on the wall + a pool on the floor
    gq([[x - tx * s, y - s, z - tz * s], [x + tx * s, y - s, z + tz * s], [x + tx * s, y + s, z + tz * s], [x - tx * s, y + s, z - tz * s]], k);
    const cx = x + nx * 1.2, cz = z + nz * 1.2; gq([[cx - fs, 0.04, cz - fs], [cx + fs, 0.04, cz - fs], [cx + fs, 0.04, cz + fs], [cx - fs, 0.04, cz + fs]], k * 0.45); FL.push(f); }
  const glG = g(new THREE.BufferGeometry()); glG.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); glG.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2)); glG.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
  const glM = basic(0xffc890, { map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }); root.add(new THREE.Mesh(glG, glM));
  // ---- 5) barrels + crates against the walls (instanced) ----
  const spots = edges.filter(([x, z, , , r, c]) => !busy.has(r * GW + c) && !near(x, z, keepOut) && rnd() < 0.13);
  const NB = spots.length, bar = new THREE.InstancedMesh(g(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10)), basic(0xffffff), Math.max(1, NB)), cra = new THREE.InstancedMesh(g(new THREE.BoxGeometry(0.8, 0.8, 0.8)), basic(0xffffff, { map: canvasTex(64, 64, (x) => { x.fillStyle = '#5a3a1c'; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#2a180a'; x.lineWidth = 6; x.strokeRect(3, 3, 58, 58); x.beginPath(); x.moveTo(3, 3); x.lineTo(61, 61); x.stroke(); for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, i * 11, 64, 2); } }) }), Math.max(1, NB));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), C = new THREE.Color(); let nb = 0, nc = 0;
  for (const [x, z, nx, nz] of spots) { const tx = -nz, tz = nx, o = (rnd() - 0.5) * 1.2, px = x + nx * 0.45 + tx * o, pz = z + nz * 0.45 + tz * o;
    if (rnd() < 0.55) { Q.setFromAxisAngle(V.set(0, 1, 0), rnd() * 6); M.compose(V.set(px, 0.45, pz), Q, S); bar.setMatrixAt(nb, M); bar.setColorAt(nb++, C.setHex([0x7a2a10, 0x2a4a6a, 0x6a6a20, 0x3a3a3a][Math.floor(rnd() * 4)]).multiplyScalar(0.8)); }
    else { const st = rnd() < 0.35; Q.setFromAxisAngle(V.set(0, 1, 0), (rnd() - 0.5) * 0.5); M.compose(V.set(px, 0.4, pz), Q, S); cra.setMatrixAt(nc, M); cra.setColorAt(nc++, C.setRGB(1, 1, 1));
      if (st) { Q.setFromAxisAngle(V.set(0, 1, 0), rnd()); M.compose(V.set(px, 1.2, pz), Q, S.set(0.8, 0.8, 0.8)); cra.setMatrixAt(nc, M); cra.setColorAt(nc++, C.setRGB(0.85, 0.85, 0.85)); S.set(1, 1, 1); } } }
  bar.count = nb; cra.count = nc; root.add(bar, cra);
  // ---- 6) steam vents: a few floor grates puffing (one Points cloud) ----
  const vents = edges.filter(() => rnd() < 0.04).slice(0, 10), SP = vents.length * 14, sp = new Float32Array(SP * 3), sa = new Float32Array(SP).map(() => rnd() * 2.5);
  const sg = g(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const steamTex = canvasTex(32, 32, (x) => { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(220,220,225,.55)'); gr.addColorStop(1, 'rgba(220,220,225,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); });
  const steam = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.1, map: steamTex, transparent: true, depthWrite: false, opacity: 0.35, color: 0xb8b0a8 })); steam.frustumCulled = false; if (SP) root.add(steam);
  let t = 0;
  return dt => { t += dt;
    glM.opacity = 0.5 + 0.06 * Math.sin(t * 2.1) + (Math.sin(t * 23) > 0.93 ? -0.25 : 0);   // hum + the odd brown-out flicker
    for (let i = 0; i < SP; i++) { const v = vents[(i / 14) | 0]; let a = (sa[i] += dt); if (a > 2.5) a = sa[i] = 0; sp[i * 3] = v[0] + v[2] * 0.7 + Math.sin(i * 7.1 + a) * 0.15 * a; sp[i * 3 + 1] = 0.1 + a * 0.9; sp[i * 3 + 2] = v[1] + v[3] * 0.7 + Math.cos(i * 3.3 + a) * 0.15 * a; }
    if (SP) sg.attributes.position.needsUpdate = true; };
}
// planks that read as wood: grain, knots, nail heads (tiny canvas, shared)
export function woodTex() { return canvasTex(128, 32, (x, w, h) => { x.fillStyle = '#7a5430'; x.fillRect(0, 0, w, h); for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(${40 + rnd() * 30},${22 + rnd() * 15},8,${0.25 + rnd() * 0.35})`; x.lineWidth = 1 + rnd() * 1.5; x.beginPath(); const y = rnd() * h; x.moveTo(0, y); x.bezierCurveTo(w * .3, y + (rnd() - .5) * 6, w * .7, y + (rnd() - .5) * 6, w, y + (rnd() - .5) * 4); x.stroke(); }
  x.fillStyle = 'rgba(40,20,6,.7)'; x.beginPath(); x.ellipse(w * (0.3 + rnd() * 0.4), h / 2, 5, 3, 0, 0, 6.28); x.fill(); x.fillStyle = '#2a2a2e'; for (const nx of [6, w - 8]) for (const ny of [8, h - 9]) x.fillRect(nx, ny, 3, 3); }); }
