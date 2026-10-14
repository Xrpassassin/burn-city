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
  // floors: unlocked zones lit, locked zones dark until opened
  const floors = L.zones.map((z, i) => { const [x0, x1, z0, z1] = z.r, m = new THREE.Mesh(g(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)), basic(0x1a0c06));
    m.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2); root.add(m); if (!low) { const t = label(z.n, '#ff9a50', 512, 10); t.position.set(m.position.x, 6, m.position.z); t.material.opacity = 0.45; root.add(t); } return m; });
  // outer walls (every zone side that isn't a door edge), one instanced mesh
  const isDoor = (ax, c, a0, a1) => L.doors.some(d => d.ax === ax && (ax === 'x' ? Math.abs(d.z - c) < 0.1 && d.x >= a0 && d.x <= a1 : Math.abs(d.x - c) < 0.1 && d.z >= a0 && d.z <= a1));
  const segs = []; for (const z of L.zones) { const [x0, x1, z0, z1] = z.r;
    for (const zz of [z0, z1]) if (!isDoor('x', zz, x0, x1)) segs.push([(x0 + x1) / 2, zz, x1 - x0, 0.6]);
    for (const xx of [x0, x1]) if (!isDoor('z', xx, z0, z1)) segs.push([xx, (z0 + z1) / 2, 0.6, z1 - z0]); }
  const wall = new THREE.InstancedMesh(g(new THREE.BoxGeometry(1, 2.6, 1).translate(0, 1.3, 0)), basic(0x2a1408), segs.length * 2);
  const M = new THREE.Matrix4(); segs.forEach(([x, z, sx, sz], i) => { wall.setMatrixAt(i * 2, M.makeScale(sx, 1, sz).setPosition(x, 0, z)); wall.setMatrixAt(i * 2 + 1, M.makeScale(sx + 0.05, 0.06, sz + 0.05).setPosition(x, 2.6, z)); });
  wall.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(segs.length * 6), 3); for (let i = 0; i < segs.length; i++) { wall.setColorAt(i * 2, new THREE.Color(0x3a1c0c)); wall.setColorAt(i * 2 + 1, new THREE.Color(0xff6a10)); }
  root.add(wall);
  // doors: glowing barricades with a price tag
  const doors = L.doors.map(d => { const grp = new THREE.Group(), len = 40, bm = basic(0xff3a10, { transparent: true, opacity: 0.5, depthWrite: false });
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(g(new THREE.BoxGeometry(d.ax === 'x' ? len : 0.12, 0.22, d.ax === 'x' ? 0.12 : len)), k === 1 ? basic(0xffb060, { transparent: true, opacity: 0.6, depthWrite: false }) : bm); b.position.y = 0.6 + k * 0.8; grp.add(b); }
    const t = label(`Open ${L.zones[d.b].n}\n${d.cost} points`, '#ffb060'); t.position.y = 3.6; grp.add(t); grp.position.set(d.x, 0, d.z); root.add(grp); return grp; });
  // wall-buys: chalk-outline pillars
  const wname = id => L.weapons.find(w => w.id === id)?.name || id;
  for (const w of L.wallbuys) { const p = new THREE.Mesh(g(new THREE.BoxGeometry(1.4, 2.2, 0.4).translate(0, 1.1, 0)), basic(0x332218)); p.position.set(w.x, 0, w.z);
    const o = new THREE.Mesh(g(new THREE.BoxGeometry(1.0, 0.3, 0.45).translate(0, 1.4, 0)), basic(0xffe0b0)); o.position.copy(p.position);
    const t = label(`${wname(w.w)}\n${w.cost} pts · ammo ${Math.round(w.cost / 2)}`, '#ffe0b0', 512, 5); t.position.set(w.x, 3, w.z); root.add(p, o, t); }
  // perk machines: tall glowing cabinets + additive halo
  const halo = (c, s) => { const m = new THREE.Mesh(g(new THREE.PlaneGeometry(s, s)), basic(c, { transparent: true, opacity: 0.35, blending: add, depthWrite: false })); return m; };
  const perks = L.perks.map(k => { const grp = new THREE.Group(); const cab = new THREE.Mesh(g(new THREE.BoxGeometry(1.3, 2.6, 1).translate(0, 1.3, 0)), basic(new THREE.Color(k.col).multiplyScalar(0.55)));
    const strip = new THREE.Mesh(g(new THREE.BoxGeometry(1.36, 0.5, 1.06).translate(0, 2.1, 0)), basic(k.col)); grp.add(cab, strip);
    if (!low) { const h = halo(k.col, 3.2); h.position.y = 1.4; grp.add(h); grp.userData.h = h; }
    const t = label(`${k.name} · ${k.cost}\n${k.desc}`, k.col, 640, 6.5); t.position.y = 3.5; grp.add(t); grp.position.set(k.x, 0, k.z); root.add(grp); return grp; });
  // mystery box
  const box = new THREE.Group(), boxBody = new THREE.Mesh(g(new THREE.BoxGeometry(2.2, 1, 1.1).translate(0, 0.5, 0)), basic(0x3a2614)), lid = new THREE.Mesh(g(new THREE.BoxGeometry(2.3, 0.15, 1.2)), basic(0x58e0ff));
  lid.position.y = 1.05; const beam = new THREE.Mesh(g(new THREE.CylinderGeometry(0.5, 0.9, 40, 10, 1, true).translate(0, 20, 0)), basic(0x58e0ff, { transparent: true, opacity: 0.22, blending: add, depthWrite: false, side: THREE.DoubleSide }));
  const btag = label(`Mystery Box · ${L.boxCost}`, '#9af0ff'); btag.position.y = 2.6; box.add(boxBody, lid, beam, btag); root.add(box);
  let roll = null, rollTag = null;
  const near = (me, x, z, r = 3) => Math.hypot(me.x - x, me.z - z) <= r;
  let t = 0;
  return {
    wname,
    rolling(e) { roll = { until: performance.now() + 2500, w: e.w }; },
    update(dt, m) { t += dt; if (!m) return; const [open, spot, st] = m;
      floors.forEach((f, i) => f.material.color.setHex((open >> i) & 1 ? 0x2a1206 : 0x0a0503));
      L.doors.forEach((d, i) => { doors[i].visible = !(((open >> d.a) & 1) && ((open >> d.b) & 1)); });
      for (const p of perks) if (p.userData.h) { p.userData.h.material.opacity = 0.25 + 0.12 * Math.sin(t * 3 + p.position.x); p.userData.h.quaternion.copy(scene.userData.camQ || p.userData.h.quaternion); }
      box.visible = st !== 2; const bs = L.box[spot] || L.box[0]; box.position.set(bs[0], 0, bs[1]); lid.position.y = st === 1 ? 1.5 + Math.sin(t * 20) * 0.08 : 1.05; beam.material.opacity = 0.16 + 0.08 * Math.sin(t * 2);
      if (roll && performance.now() < roll.until && st === 1) { const names = L.weapons.slice(1), k = Math.floor(t * 12) % names.length, last = performance.now() > roll.until - 500, txt = last ? wname(roll.w) : names[k].name;
        if (!rollTag || rollTag.userData.txt !== txt) { if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); } rollTag = label(txt, '#fff3a0', 512, 4.5); rollTag.userData.txt = txt; rollTag.position.y = 1.9; box.add(rollTag); } }
      else if (rollTag) { box.remove(rollTag); rollTag.material.map.dispose(); rollTag.material.dispose(); rollTag = null; } },
    // what pressing USE would do here (the server re-checks everything)
    prompt(me, m, pts, guns, perkBits) { if (!m) return null; const [open, spot, st] = m;
      for (const d of L.doors) { const ua = (open >> d.a) & 1, ub = (open >> d.b) & 1; if (ua === ub) continue; const along = d.ax === 'x' ? Math.abs(me.x - d.x) : Math.abs(me.z - d.z), across = d.ax === 'x' ? Math.abs(me.z - d.z) : Math.abs(me.x - d.x);
        if (along <= 20 && across <= 3) return { t: `Open ${L.zones[ua ? d.b : d.a].n}`, c: d.cost }; }
      for (const w of L.wallbuys) if (near(me, w.x, w.z)) return guns.includes(w.w) ? { t: `Refill ${wname(w.w)}`, c: Math.round(w.cost / 2) } : { t: `Buy ${wname(w.w)}`, c: w.cost };
      const bs = L.box[spot]; if (st === 0 && bs && near(me, bs[0], bs[1])) return { t: 'Mystery Box: random weapon', c: L.boxCost };
      let n = 0; for (let v = perkBits; v; v >>= 1) n += v & 1;
      for (let i = 0; i < L.perks.length; i++) { const k = L.perks[i]; if (near(me, k.x, k.z)) return perkBits & (1 << i) ? { t: `${k.name} (owned)`, c: 0, no: 1 } : n >= L.maxPerks ? { t: `Max ${L.maxPerks} perks`, c: 0, no: 1 } : { t: `${k.name}: ${k.desc}`, c: k.cost }; }
      return null; },
    dispose() { scene.remove(root); root.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); for (const x of mats) x.dispose(); for (const x of geos) x.dispose(); wall.dispose(); },
  };
}
