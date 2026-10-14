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
export function createCodWorld(scene, L, { low = false } = {}) {
  const root = new THREE.Group(); scene.add(root); const mats = [], geos = [];
  const basic = (c, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, ...o }); mats.push(m); return m; };
  const g = x => (geos.push(x), x);
  // ===== refinery geometry from the server grid: everything static is merged into a few draw calls =====
  const G = L.grid, CELL = L.cell, GW = L.gw, GH = L.gh, WX = c => (c - GW / 2) * CELL + 1, WZ = r => (r - GH / 2) * CELL + 1, H = 3.4;
  const winCell = new Set(L.windows.map(w => w.r * GW + w.c)), obstH = new Map(), obstS = new Map();
  for (const [c0, c1, r0, r1, h, st] of L.obst) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { obstH.set(r * GW + c, h); obstS.set(r * GW + c, st); }
  const STY = { pillar: [0x241c18, 0x55453a], desk: [0x141c24, 0x3a5064], crate: [0x2a1a0c, 0x6a4824], bench: [0x10201a, 0x36604e], furnace: [0x1a0602, 0xc84a10], tank: [0x1a1028, 0x4a3478], pipe: [0x202024, 0x5a5a62] };
  const pos = [], col = [], C1 = new THREE.Color(), C2 = new THREE.Color();
  function boxV(x0, x1, y0, y1, z0, z1, bot, top) {   // 5 faces (no bottom); vertical gradient + per-face shade = cheap readable "lighting"
    const F = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.85], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.85], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.7],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.7], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1.15]];
    for (const [a, b, c, d, sh] of F) for (const v of [a, b, c, a, c, d]) { pos.push(...v); const k = sh === 1.15 ? 1 : (v[1] - y0) / (y1 - y0 || 1); C1.copy(bot).lerp(top, sh === 1.15 ? 1 : k).multiplyScalar(sh); col.push(C1.r, C1.g, C1.b); } }
  const wallBot = new THREE.Color(0x140c08), wallTop = new THREE.Color(0x5a4234);
  for (let r = 0; r < GH; r++) { let c = 0; while (c < GW) { const i = r * GW + c;
      if (G[r][c] !== -1 || obstH.has(i) || winCell.has(i)) { c++; continue; } let e = c; while (e + 1 < GW && G[r][e + 1] === -1 && !obstH.has(r * GW + e + 1) && !winCell.has(r * GW + e + 1)) e++;   // greedy row runs
      boxV(WX(c) - 1, WX(e) + 1, 0, H, WZ(r) - 1, WZ(r) + 1, wallBot, wallTop); c = e + 1; } }
  for (const w of L.windows) { const x = w.x, z = w.z; boxV(x - 1, x + 1, 0, 0.6, z - 1, z + 1, wallBot, wallTop); boxV(x - 1, x + 1, 2.5, H, z - 1, z + 1, wallBot, wallTop);   // window opening 0.6..2.5 m
    if (w.ax === 'x') { boxV(x - 1, x - 0.75, 0.6, 2.5, z - 1, z + 1, wallBot, wallTop); boxV(x + 0.75, x + 1, 0.6, 2.5, z - 1, z + 1, wallBot, wallTop); } else { boxV(x - 1, x + 1, 0.6, 2.5, z - 1, z - 0.75, wallBot, wallTop); boxV(x - 1, x + 1, 0.6, 2.5, z + 0.75, z + 1, wallBot, wallTop); } }
  for (const [c0, c1, r0, r1, h, st] of L.obst) { const [b, t] = STY[st] || STY.pillar; boxV(WX(c0) - (st === 'pillar' ? 0.6 : 0.95), WX(c1) + (st === 'pillar' ? 0.6 : 0.95), 0, h, WZ(r0) - (st === 'pillar' ? 0.6 : 0.95), WZ(r1) + (st === 'pillar' ? 0.6 : 0.95), C2.setHex(b).clone(), new THREE.Color(t)); }
  const wg = g(new THREE.BufferGeometry()); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  root.add(new THREE.Mesh(wg, basic(0xffffff, { vertexColors: true })));
  // floors: one plane per room, tinted by the room's colour (dark until opened); glowing trim line along the top of every wall
  const floors = L.zones.map((z, i) => { const [c0, c1, r0, r1] = z.r, m = new THREE.Mesh(g(new THREE.PlaneGeometry((c1 - c0 + 1) * CELL, (r1 - r0 + 1) * CELL).rotateX(-Math.PI / 2)), basic(0x101010));
    m.position.set((WX(c0) + WX(c1)) / 2, 0.01, (WZ(r0) + WZ(r1)) / 2); root.add(m); m.userData.c = new THREE.Color(z.col);
    const t = label(z.n, z.col, 512, low ? 7 : 9); t.position.set(m.position.x, H + 1.4, m.position.z); t.material.opacity = 0.8; root.add(t); return m; });
  const trim = []; for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { if (G[r][c] < 0) continue; const x = WX(c), z = WZ(r);   // light strip at 2.9 m on every wall face that borders floor
    for (const [dc, dr, ax, az, bx, bz] of [[1, 0, 1, -1, 1, 1], [-1, 0, -1, -1, -1, 1], [0, 1, -1, 1, 1, 1], [0, -1, -1, -1, 1, -1]]) { const n = G[r + dr]?.[c + dc]; if (n !== -1 || obstH.has((r + dr) * GW + c + dc)) continue; trim.push(x + ax * 0.98, 2.9, z + az * 0.98, x + bx * 0.98, 2.9, z + bz * 0.98); } }
  const tg = g(new THREE.BufferGeometry()); tg.setAttribute('position', new THREE.Float32BufferAttribute(trim, 3)); const trimM = new THREE.LineBasicMaterial({ color: 0xff7a2a }); mats.push(trimM); root.add(new THREE.LineSegments(tg, trimM));
  // furnace mouths: flickering emissive slabs (the hall's "light source")
  const furn = L.obst.filter(o => o[5] === 'furnace').map(([c0, c1, r0, r1]) => { const m = new THREE.Mesh(g(new THREE.BoxGeometry((c1 - c0 + 1) * CELL + 0.1, 0.5, (r1 - r0 + 1) * CELL + 0.1)), basic(0xff6a10)); m.position.set((WX(c0) + WX(c1)) / 2, 1.2, (WZ(r0) + WZ(r1)) / 2); root.add(m); return m; });
  // doors: glowing barricade bars across the doorway with a price tag
  const doors = L.doors.map(d => { const grp = new THREE.Group(), len = 4, bm = basic(0xff3a10, { transparent: true, opacity: 0.7, depthWrite: false });
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(g(new THREE.BoxGeometry(d.ax === 'x' ? len : 0.14, 0.2, d.ax === 'x' ? 0.14 : len)), k === 2 ? basic(0xffb060) : bm); b.position.y = 0.5 + k * 0.65; grp.add(b); }
    const t = label(`${L.zones[d.b].n} · ${d.cost}`, '#ffb060', 512, 3.6); t.position.y = 3.1; grp.add(t); grp.position.set(d.x, 0, d.z); root.add(grp); return grp; });
  const zoneOf = (x, z) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2); const v = G[r]?.[c]; return v >= 0 && v < 100 ? v : -1; };
  const walkable = (x, z, open) => { const c = Math.floor(x / CELL + GW / 2), r = Math.floor(z / CELL + GH / 2), v = G[r]?.[c]; if (v === undefined || v < 0) return false; if (v >= 100) { const d = L.doors[v - 100]; return !!((open >> d.a) & 1 && (open >> d.b) & 1); } return !!((open >> v) & 1); };
  // minimap (2D canvas, redrawn ~6x/s)
  const mm = document.createElement('canvas'), MS = matchMedia('(pointer:coarse)').matches ? 3 : 4; mm.width = GW * MS; mm.height = GH * MS; mm.id = 'minimap'; mm.style.cssText = 'position:fixed;right:calc(8px + env(safe-area-inset-right));top:calc(52px + env(safe-area-inset-top));z-index:3;border:1px solid #f608;border-radius:6px;background:#000a;pointer-events:none;image-rendering:pixelated;width:' + GW * MS + 'px'; document.body.appendChild(mm);
  const mx = mm.getContext('2d'); let mmT = 0;
  function drawMini(open, players, myId, boxSpot) { mx.clearRect(0, 0, mm.width, mm.height);
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) { const v = G[r][c]; if (v < 0) continue; mx.fillStyle = v >= 100 ? (walkable(WX(c), WZ(r), open) ? '#555' : '#ff3a10') : (open >> v) & 1 ? L.zones[v].col + '88' : '#ffffff14'; mx.fillRect(c * MS, r * MS, MS, MS); }
    const P = (x, z) => [(x / CELL + GW / 2) * MS, (z / CELL + GH / 2) * MS];
    const bs = L.box[boxSpot]; if (bs) { const [x, y] = P(bs[0], bs[1]); mx.fillStyle = '#9af0ff'; mx.fillRect(x - 2, y - 2, 4, 4); }
    for (const p of players) { if (!p.alive) continue; const [x, y] = P(p.x, p.z); mx.fillStyle = p.id === myId ? '#fff' : '#ffb060'; mx.beginPath(); mx.arc(x, y, p.id === myId ? 3 : 2, 0, 7); mx.fill(); } }
  // wall-buys: chalk-outline pillars
  const wname = id => L.weapons.find(w => w.id === id)?.name || id;
  for (const w of L.wallbuys) { const p = new THREE.Mesh(g(new THREE.BoxGeometry(1.4, 2.2, 0.4).translate(0, 1.1, 0)), basic(0x332218)); p.position.set(w.x, 0, w.z); p.rotation.y = w.face || 0;
    const o = new THREE.Mesh(g(new THREE.BoxGeometry(1.0, 0.3, 0.45).translate(0, 1.4, 0)), basic(0xffe0b0)); o.position.copy(p.position); o.rotation.y = p.rotation.y;
    const t = label(`${wname(w.w)}\n${w.cost} pts · ammo ${Math.round(w.cost / 2)}`, '#ffe0b0', 512, 3.2); t.position.set(w.x, 2.7, w.z); root.add(p, o, t); }
  // perk machines: tall glowing cabinets + additive halo
  const halo = (c, s) => { const m = new THREE.Mesh(g(new THREE.PlaneGeometry(s, s)), basic(c, { transparent: true, opacity: 0.35, blending: add, depthWrite: false })); return m; };
  const perks = L.perks.map(k => { const grp = new THREE.Group(); const cab = new THREE.Mesh(g(new THREE.BoxGeometry(1.3, 2.6, 1).translate(0, 1.3, 0)), basic(new THREE.Color(k.col).multiplyScalar(0.55)));
    const strip = new THREE.Mesh(g(new THREE.BoxGeometry(1.36, 0.5, 1.06).translate(0, 2.1, 0)), basic(k.col)); grp.add(cab, strip);
    if (!low) { const h = halo(k.col, 3.2); h.position.y = 1.4; grp.add(h); grp.userData.h = h; }
    const t = label(`${k.name} · ${k.cost}\n${k.desc}`, k.col, 640, 3.6); t.position.y = 3.0; grp.add(t); grp.position.set(k.x, 0, k.z); root.add(grp); return grp; });
  // boarded windows: dark frame + up to 6 planks (one instanced mesh); ripped planks fly off, new ones slam in
  const WN = L.windows || [], NB = L.boards || 6, frameM = new THREE.InstancedMesh(g(new THREE.BoxGeometry(1, 1, 1)), basic(0x120804), Math.max(1, WN.length * 3));
  const plank = new THREE.InstancedMesh(g(new THREE.BoxGeometry(1, 1, 1)), basic(0xffffff), WN.length * NB + 16); plank.frustumCulled = frameM.frustumCulled = false;
  const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), Vp = new THREE.Vector3(), Sc = new THREE.Vector3(), PC = [new THREE.Color(0x8a5a32), new THREE.Color(0x6e4626), new THREE.Color(0x9c6a3c)];
  WN.forEach((w, i) => { const sx = w.ax === 'x' ? 2.6 : 0.5, sz = w.ax === 'x' ? 0.5 : 2.6;
    frameM.setMatrixAt(i * 3, Mx.compose(Vp.set(w.x, 1.4, w.z), Q.identity(), Sc.set(w.ax === 'x' ? 3.2 : 0.7, 0.25, w.ax === 'x' ? 0.7 : 3.2)));
    frameM.setMatrixAt(i * 3 + 1, Mx.compose(Vp.set(w.x + (w.ax === 'x' ? 1.45 : 0), 1.9, w.z + (w.ax === 'x' ? 0 : 1.45)), Q.identity(), Sc.set(w.ax === 'x' ? 0.3 : 0.7, 1.6, w.ax === 'x' ? 0.7 : 0.3)));
    frameM.setMatrixAt(i * 3 + 2, Mx.compose(Vp.set(w.x - (w.ax === 'x' ? 1.45 : 0), 1.9, w.z - (w.ax === 'x' ? 0 : 1.45)), Q.identity(), Sc.set(w.ax === 'x' ? 0.3 : 0.7, 1.6, w.ax === 'x' ? 0.7 : 0.3))); });
  root.add(frameM, plank); const anim = WN.map(() => Array(NB).fill(1));   // per plank 0..1 (1 = nailed)
  let boards = WN.map(() => NB), flying = [];
  // mystery box
  const box = new THREE.Group(), boxBody = new THREE.Mesh(g(new THREE.BoxGeometry(2.2, 1, 1.1).translate(0, 0.5, 0)), basic(0x3a2614)), lid = new THREE.Mesh(g(new THREE.BoxGeometry(2.3, 0.15, 1.2)), basic(0x58e0ff));
  lid.position.y = 1.05; const beam = new THREE.Mesh(g(new THREE.CylinderGeometry(0.5, 0.9, 6, 10, 1, true).translate(0, 3, 0)), basic(0x58e0ff, { transparent: true, opacity: 0.22, blending: add, depthWrite: false, side: THREE.DoubleSide }));
  const btag = label(`Mystery Box · ${L.boxCost}`, '#9af0ff'); btag.position.y = 2.3; btag.scale.multiplyScalar(0.6); box.add(boxBody, lid, beam, btag); root.add(box);
  let roll = null, rollTag = null;
  const near = (me, x, z, r = 3) => Math.hypot(me.x - x, me.z - z) <= r;
  let t = 0;
  return {
    wname,
    rolling(e) { roll = { until: performance.now() + 2500, w: e.w }; },
    rip(e) { const w = WN[e.i]; if (w) flying.push({ w, k: e.n, t: 0 }); },
    board(e) { if (anim[e.i]) anim[e.i][e.n - 1] = 0; },
    update(dt, m, b) { t += dt; if (b) boards = b;
      let pi = 0; WN.forEach((w, i) => { for (let k = 0; k < NB; k++) { const on = k < boards[i]; let a = anim[i][k]; if (on && a < 1) a = anim[i][k] = Math.min(1, a + dt * 5);
        const y = 0.75 + k * 0.27, tilt = ((k * 7 + i) % 5 - 2) * 0.09, off = on ? (1 - a) * 1.2 : 0;
        Q.setFromEuler(E.set(w.ax === 'z' ? tilt : 0, 0, w.ax === 'x' ? tilt : 0)); const ox = w.ix - w.x, oz = w.iz - w.z, l = Math.hypot(ox, oz) || 1;
        Mx.compose(Vp.set(w.x + ox / l * (0.15 + off), y, w.z + oz / l * (0.15 + off)), Q, on ? Sc.set(w.ax === 'x' ? 2.8 : 0.08, 0.2, w.ax === 'x' ? 0.08 : 2.8) : Sc.set(0, 0, 0));
        plank.setMatrixAt(pi, Mx); plank.setColorAt(pi, PC[(k + i) % 3]); pi++; } });
      for (let j = flying.length - 1; j >= 0; j--) { const f = flying[j]; f.t += dt; if (f.t > 0.9) { flying.splice(j, 1); continue; } if (pi >= WN.length * NB + 16) continue;
        const w = f.w, ox = w.x - w.ix, oz = w.z - w.iz, l = Math.hypot(ox, oz) || 1, u = f.t;   // torn outward, spinning, falling
        Q.setFromEuler(E.set(u * 9, u * 4, u * 6)); Mx.compose(Vp.set(w.x + ox / l * u * 4, 0.75 + f.k * 0.27 + u * 2 - u * u * 6, w.z + oz / l * u * 4), Q, Sc.set(w.ax === 'x' ? 2.8 : 0.08, 0.2, w.ax === 'x' ? 0.08 : 2.8)); plank.setMatrixAt(pi, Mx); plank.setColorAt(pi, PC[0]); pi++; }
      plank.count = pi;
      plank.instanceMatrix.needsUpdate = true; if (plank.instanceColor) plank.instanceColor.needsUpdate = true; if (!m) return; const [open, spot, st] = m;
      floors.forEach((f, i) => f.material.color.setHex(0x2a2320).lerp(f.userData.c, 0.18).multiplyScalar((open >> i) & 1 ? 0.75 : 0.25));
      for (const [k, f] of furn.entries()) f.material.color.setRGB(1, 0.35 + 0.15 * Math.sin(t * 9 + k * 2) + 0.1 * Math.sin(t * 23 + k), 0.05);
      L.doors.forEach((d, i) => { doors[i].visible = !(((open >> d.a) & 1) && ((open >> d.b) & 1)); });
      for (const p of perks) if (p.userData.h) { p.userData.h.material.opacity = 0.25 + 0.12 * Math.sin(t * 3 + p.position.x); p.userData.h.quaternion.copy(scene.userData.camQ || p.userData.h.quaternion); }
      box.visible = st !== 2; const bs = L.box[spot] || L.box[0]; box.position.set(bs[0], 0, bs[1]); box.rotation.y = (bs[2] || 0) + Math.PI / 2; lid.position.y = st === 1 ? 1.5 + Math.sin(t * 20) * 0.08 : 1.05; beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 2);
      if (roll && performance.now() < roll.until && st === 1) { const names = L.weapons.slice(1), k = Math.floor(t * 12) % names.length, last = performance.now() > roll.until - 500, txt = last ? wname(roll.w) : names[k].name;
        if (!rollTag || rollTag.userData.txt !== txt) { if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); } rollTag = label(txt, '#fff3a0', 512, 4.5); rollTag.userData.txt = txt; rollTag.position.y = 1.9; box.add(rollTag); } }
      else if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); rollTag = null; } },
    // what pressing USE would do here (the server re-checks everything)
    walkable, zoneOf, zoneName: (x, z) => L.zones[zoneOf(x, z)]?.n || '',
    mini(st, myId) { if ((mmT += 1) % 10 || !st.map) return; drawMini(st.map[0], st.players, myId, st.map[1]); },
    prompt(me, m, pts, guns, perkBits) { if (!m) return null; const [open, spot, st] = m;
      const op = m[0]; let bw = -1, bd = 2.6; WN.forEach((w, i) => { const on = ((op >> w.zone) & 1) && (w.behind == null || !((op >> w.behind) & 1)), d = Math.hypot(me.x - w.ix, me.z - w.iz); if (on && d < bd && boards[i] < NB) { bd = d; bw = i; } });
      if (bw >= 0) return { t: `🔨 Rebuilding… (${boards[bw]}/${NB})`, c: 0, hold: 1 };
      for (const d of L.doors) { const ua = (open >> d.a) & 1, ub = (open >> d.b) & 1; if (ua === ub) continue; const along = d.ax === 'x' ? Math.abs(me.x - d.x) : Math.abs(me.z - d.z), across = d.ax === 'x' ? Math.abs(me.z - d.z) : Math.abs(me.x - d.x);
        if (along <= 3 && across <= 3) return { t: `Open ${L.zones[ua ? d.b : d.a].n}`, c: d.cost }; }
      for (const w of L.wallbuys) if (near(me, w.x, w.z)) return guns.includes(w.w) ? { t: `Refill ${wname(w.w)}`, c: Math.round(w.cost / 2) } : { t: `Buy ${wname(w.w)}`, c: w.cost };
      const bs = L.box[spot]; if (st === 0 && bs && near(me, bs[0], bs[1])) return { t: 'Mystery Box: random weapon', c: L.boxCost };
      let n = 0; for (let v = perkBits; v; v >>= 1) n += v & 1;
      for (let i = 0; i < L.perks.length; i++) { const k = L.perks[i]; if (near(me, k.x, k.z)) return perkBits & (1 << i) ? { t: `${k.name} (owned)`, c: 0, no: 1 } : n >= L.maxPerks ? { t: `Max ${L.maxPerks} perks`, c: 0, no: 1 } : { t: `${k.name}: ${k.desc}`, c: k.cost }; }
      return null; },
    dispose() { mm.remove(); scene.remove(root); root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); for (const x of mats) x.dispose(); for (const x of geos) x.dispose(); },
  };
}
