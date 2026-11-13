// THE EMBER BAR: its own tavern building on the City street (exterior here; the interior is the 'ember' venue in tower-interior.js).
// - Placed at runtime just outside BURN's outer ring road, on the side facing away from the hub, front door facing the road and the
//   tower. The lot is checked against the City's colliders and streets at load, and steps around the ring if something is in the way.
// - Cheap procedural exterior (no downloads): timber-framed two-storey pirate tavern with a stone plinth, pitched shingle roof,
//   chimney embers, warm windows, a lit "THE EMBER BAR" fascia sign, a hanging anchor sign and lanterns by the door.
//   Static geometry is merged per material (about a dozen draw calls, ~2k triangles), no lights, no extra render passes.
// - Walk up to the door and press E (or tap) to enter: the interior, bartender, Blackbeard and the 1 XRP menu load only then.
//   Leaving puts you back on the street outside the door. Minimap marker, tour stop, and a "Take me there" entry in the menu.
// - ?emberbar=0 removes the building (and so the bar). ?bar3d=0 / ?barpay=0 / EMBER_BAR_PAYMENTS=0 keep working inside.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { emberLot, LOT } from './ember-bar-lot.mjs';
import { PAD } from './city-space-core.mjs';

const Q = new URLSearchParams(location.search);
const EB = window.__emberBarBuilding = { ready: false, error: null };
const { W, D, H } = LOT;   // footprint width (along the street), depth, wall height (metres)

function tex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(1717);

function signTex() {
  return tex(1024, 256, (g, w, h) => {
    g.fillStyle = '#120806'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d58a3a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 118px Georgia,"Times New Roman",serif';
    g.shadowColor = '#ff7a1a'; g.shadowBlur = 34; g.fillStyle = '#ffd08a'; g.fillText('THE EMBER BAR', w / 2, h / 2 + 4, w - 80);
    g.shadowBlur = 0; g.fillStyle = '#fff1d6'; g.fillText('THE EMBER BAR', w / 2, h / 2 + 4, w - 80);
  });
}
function hangTex() {
  return tex(256, 256, (g, w, h) => {
    g.fillStyle = '#1c100a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c98a3a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#ffcf8a'; g.lineWidth = 10; g.lineCap = 'round';   // anchor
    g.beginPath(); g.moveTo(128, 50); g.lineTo(128, 190); g.moveTo(92, 82); g.lineTo(164, 82); g.stroke();
    g.beginPath(); g.arc(128, 150, 50, .15 * Math.PI, .85 * Math.PI); g.stroke();
    g.beginPath(); g.arc(128, 42, 12, 0, 7); g.stroke();
    g.fillStyle = '#ff7a1a'; g.beginPath(); g.moveTo(128, 120); g.quadraticCurveTo(150, 150, 128, 178); g.quadraticCurveTo(106, 150, 128, 120); g.fill();   // ember
    g.font = '700 26px Georgia,serif'; g.textAlign = 'center'; g.fillStyle = '#ffd9a0'; g.fillText('EST. BURN CITY', 128, 226);
  });
}

// City street lights are instanced (window.__lamps: pole + LED bar, plus one glow point each). Any light standing in front of the
// facade slides along the curb to just past the building's corner, so the sign and door stay clear and the street stays lit.
function moveLamps(c, x, z, yaw) {
  const Lm = window.__lamps; if (!Lm || !Lm.pole) return 0;
  const s = Math.sin(yaw), co = Math.cos(yaw), m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const glow = []; c.S.traverse(o => { if (o.isPoints && o.geometry.attributes.position && o.geometry.attributes.position.count === Lm.n) glow.push(o); });
  let moved = 0;
  for (let i = 0; i < Lm.pole.count; i++) {
    Lm.pole.getMatrixAt(i, m); m.decompose(p, q, sc);
    const dx = p.x - x, dz = p.z - z, lx = dx * co - dz * s, lz = dx * s + dz * co;
    if (Math.abs(lx) > W / 2 + 1.5 || lz < D / 2 - 1 || lz > D / 2 + 7) continue;
    const nlx = (lx < 0 ? -1 : 1) * (W / 2 + 2.6), ddx = (nlx - lx) * co, ddz = -(nlx - lx) * s;
    p.x += ddx; p.z += ddz; m.compose(p, q, sc); Lm.pole.setMatrixAt(i, m); if (Lm.bar) Lm.bar.setMatrixAt(i, m);
    for (const g of glow) { const a = g.geometry.attributes.position; a.setXYZ(i, a.getX(i) + ddx, a.getY(i), a.getZ(i) + ddz); a.needsUpdate = true; g.geometry.computeBoundingSphere(); }
    moved++;
  }
  if (moved) { Lm.pole.instanceMatrix.needsUpdate = true; if (Lm.bar) Lm.bar.instanceMatrix.needsUpdate = true; Lm.pole.computeBoundingSphere(); Lm.bar && Lm.bar.computeBoundingSphere(); }
  return moved;
}
function init() {
  const c = window.__city, S = c.S, C = c.C;
  const pk = window.__skate && window.__skate.parkArea, lake = window.__estate && window.__estate.lakeC;
  const avoid = [{ x: PAD.x, z: PAD.z, r: PAD.r + 30 }, ...(pk ? [{ x: pk.x, z: pk.z, r: Math.hypot(pk.hx, pk.hz) }] : []), ...(lake ? [{ x: lake.x, z: lake.z, r: 160 }] : [])];
  const L = emberLot({ N: c.N, nodes: c.E && c.E.nodes, streets: c.streets, colliders: c.colliders }, avoid);
  if (!L) { EB.error = 'no clear lot'; console.warn('ember bar: no clear lot found'); return; }
  const { x, z, yaw } = L, gy = c.groundAt ? Math.max(0, c.groundAt(x, z, 99)) : 0;
  const front = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const loc = (lx, lz) => new THREE.Vector3(x + side.x * lx + front.x * lz, gy, z + side.z * lx + front.z * lz);

  // ---- materials
  const planks = tex(512, 512, (g, w, h) => { for (let i = 0; i < 16; i++) { const k = 132 + rnd() * 28 | 0; g.fillStyle = `rgb(${k + 8},${k * .8 | 0},${k * .6 | 0})`; g.fillRect(0, i * 32, w, 32); g.fillStyle = '#0d0704'; g.fillRect(0, i * 32, w, 3);
    for (let j = 0; j < 30; j++) { g.fillStyle = `rgba(10,5,2,${.1 + rnd() * .15})`; g.fillRect(rnd() * w, i * 32 + 4 + rnd() * 26, 20 + rnd() * 120, 1.5); } } });
  const shingles = tex(256, 256, (g, w, h) => { g.fillStyle = '#140b0a'; g.fillRect(0, 0, w, h); for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const v = 34 + rnd() * 26 | 0; g.fillStyle = `rgb(${v + 22},${v * .5 | 0},${v * .42 | 0})`; g.fillRect(k * 32 + (r % 2) * 16 + 1, r * 32 + 1, 30, 29); g.fillStyle = '#0a0504'; g.fillRect(k * 32 + (r % 2) * 16, r * 32 + 26, 32, 5); } });
  const stoneT = tex(256, 256, (g, w, h) => { g.fillStyle = '#17130f'; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { const v = 52 + rnd() * 30 | 0; g.fillStyle = `rgb(${v},${v * .92 | 0},${v * .84 | 0})`; g.fillRect(k * 64 + (r % 2) * 32 + 3, r * 64 + 3, 58, 58); } });
  const M = {
    wall: new THREE.MeshStandardMaterial({ map: planks, roughness: .8, metalness: 0, emissive: new THREE.Color(0x1c0c04), emissiveIntensity: 0 }),
    beam: new THREE.MeshStandardMaterial({ color: 0x2a190e, roughness: .8, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: shingles, roughness: .9, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: stoneT, roughness: .95, metalness: 0 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1a191b, roughness: .5, metalness: .8 }),
    door: new THREE.MeshStandardMaterial({ color: 0x3a2112, roughness: .7, metalness: 0 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: .75, metalness: 0 }),
    win: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, .78, .32) }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.15, .45) }),
    ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .7, .15) }),
    sign: new THREE.MeshBasicMaterial({ map: signTex(), color: new THREE.Color(1.25, 1.25, 1.25) }),
    hang: new THREE.MeshBasicMaterial({ map: hangTex(), side: THREE.DoubleSide })
  };
  const parts = new Map(); const add = (geo, mat, px, py, pz, ry = 0, rx = 0, rz = 0) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const box = (w, h, d, mat, px, py, pz, ry = 0) => add(new THREE.BoxGeometry(w, h, d), mat, px, py, pz, ry);
  // box with world-scaled UVs (planks/stone keep a constant size on every face)
  const tbox = (w, h, d, mat, px, py, pz, s = 2.4) => { const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal; for (let i = 0; i < uv.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); const [a, b] = ax > .5 ? [d, h] : ay > .5 ? [w, d] : [w, h]; uv.setXY(i, uv.getX(i) * a / s, uv.getY(i) * b / s); } add(g, mat, px, py, pz); };
  const fz = D / 2;   // local front face (+z)
  tbox(W + .6, .7, D + .6, M.stone, 0, .35, 0, 1.6);                         // stone plinth
  tbox(W, H, D, M.wall, 0, .7 + H / 2, 0, 3.2);                              // planked walls
  // half-timber frame on all four faces: corner posts, floor band, eaves band
  for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) box(.42, H, .42, M.beam, px, .7 + H / 2, pz);
  for (const y of [.7 + 3.1, .7 + H - .15]) { box(W + .3, .3, .2, M.beam, 0, y, fz + .06); box(W + .3, .3, .2, M.beam, 0, y, -fz - .06); box(.2, .3, D + .3, M.beam, W / 2 + .06, y, 0); box(.2, .3, D + .3, M.beam, -W / 2 - .06, y, 0); }
  for (const px of [-4.6, -2.2, 2.2, 4.6]) box(.26, H, .16, M.beam, px, .7 + H / 2, fz + .06);
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(.18, 3.6, .14); add(g, M.beam, s * 5.9, .7 + 3.1 + 1.45, fz + .07, 0, 0, s * .62); }   // upper-floor braces
  // pitched shingle roof (ridge along the street), deep overhang, gable ends, chimney with embers
  const RH = 3.2, OV = .7, rw = D / 2 + OV, slope = Math.hypot(rw, RH), ang = Math.atan2(RH, rw), top = .7 + H;
  for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(W + 1.4, .22, slope); const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * (W + 1.4) / 2.2, u.getY(i) * slope / 2.2); add(g, M.roof, 0, top + RH / 2 - .1, s * rw / 2, 0, s * ang); }
  { const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(0, RH - .2); sh.closePath(); const g = new THREE.ShapeGeometry(sh); for (const s of [-1, 1]) add(g, M.wall, s * (W / 2 + .01), top, 0, s * Math.PI / 2); }
  box(W + 1.5, .3, .3, M.beam, 0, top + RH - .05, 0);
  tbox(1.1, 3.4, 1.1, M.stone, W / 2 - 2.2, top + RH - .2, -1.6, 1.2); box(1.0, .12, 1.0, M.ember, W / 2 - 2.2, top + RH + 1.5, -1.6);
  // windows: warm glass, dark frames and mullions (ground floor either side of the door, upper floor across, two per side)
  const win = (lx, ly, lz, w, h, ry, out) => { add(new THREE.PlaneGeometry(w, h), M.win, lx + Math.sin(ry) * out, ly, lz + Math.cos(ry) * out, ry);
    const fx = Math.cos(ry), fzv = -Math.sin(ry), o = out + .04;
    box(w + .3, .14, .2, M.beam, lx + Math.sin(ry) * o, ly - h / 2 - .07, lz + Math.cos(ry) * o, ry); box(w + .3, .14, .2, M.beam, lx + Math.sin(ry) * o, ly + h / 2 + .07, lz + Math.cos(ry) * o, ry);
    box(.08, h, .1, M.beam, lx + Math.sin(ry) * o, ly, lz + Math.cos(ry) * o, ry); box(w, .07, .1, M.beam, lx + Math.sin(ry) * o, ly, lz + Math.cos(ry) * o, ry);
    for (const s of [-1, 1]) box(.12, h + .2, .16, M.beam, lx + fx * s * (w / 2 + .06) + Math.sin(ry) * o, ly, lz + fzv * s * (w / 2 + .06) + Math.cos(ry) * o, ry); };
  for (const px of [-3.4, 3.4]) win(px, .7 + 1.7, fz, 1.6, 1.4, 0, .02);
  for (const px of [-3.4, 3.4]) win(px, .7 + 4.6, fz, 1.1, 1.0, 0, .02);
  for (const s of [-1, 1]) for (const pz of [-2, 2]) { win(s * W / 2, .7 + 1.8, pz, 1.3, 1.2, s * Math.PI / 2, .02); win(s * W / 2, .7 + 4.6, pz, 1.1, 1.0, s * Math.PI / 2, .02); }
  for (const px of [-4, 0, 4]) win(px, .7 + 4.6, -fz, 1.1, 1.0, Math.PI, .02);
  // door: heavy planked door in a timber frame, iron straps, glowing transom; three steps up from the pavement
  box(2.0, 2.7, .18, M.door, 0, .7 + 1.35, fz + .09); for (const y of [1.2, 2.9]) box(1.9, .1, .06, M.iron, 0, y, fz + .2);
  box(2.0, .5, .05, M.win, 0, .7 + 2.95, fz + .04); box(2.6, .3, .32, M.beam, 0, .7 + 3.3, fz + .14);
  for (const s of [-1, 1]) box(.3, 3.4, .32, M.beam, s * 1.15, .7 + 1.7, fz + .14);
  for (let i = 0; i < 3; i++) tbox(2.8, .23, .45, M.stone, 0, .7 - .23 * (i + .5), fz + .3 + .45 * (i + .5) - .45, 1.2);
  // lit fascia sign over the door, hanging anchor sign on a bracket, lanterns, barrels
  add(new THREE.PlaneGeometry(5.2, 1.3), M.sign, 0, .7 + 3.95, fz + .2); box(5.5, .14, .2, M.beam, 0, .7 + 3.25, fz + .16); box(5.5, .14, .2, M.beam, 0, .7 + 4.65, fz + .16);
  box(.12, .12, 1.6, M.iron, 3.0, .7 + 4.0, fz + .8); add(new THREE.PlaneGeometry(1.15, 1.15), M.hang, 3.0, .7 + 3.3, fz + 1.35, Math.PI / 2);
  for (const s of [-1, 1]) { box(.08, .08, .5, M.iron, s * 1.6, .7 + 2.75, fz + .27); box(.26, .38, .26, M.lamp, s * 1.6, .7 + 2.45, fz + .5); box(.32, .06, .32, M.iron, s * 1.6, .7 + 2.67, fz + .5); }
  const barrelG = new THREE.CylinderGeometry(.42, .38, 1.05, 14);
  for (const [px, pz] of [[-2.4, fz + .9], [-3.2, fz + .75], [2.5, fz + .85]]) { add(barrelG, M.barrel, px, .52 + .02, pz); for (const y of [.25, .82]) add(new THREE.CylinderGeometry(.43, .43, .05, 14, 1, true), M.iron, px, y, pz); }
  // merge per material -> one mesh each
  const grp = new THREE.Group(); grp.name = 'ember_bar_building'; grp.position.set(x, gy, z); grp.rotation.y = yaw;
  for (const [mat, list] of parts) { const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.matrixAutoUpdate = false; grp.add(m); }
  // warm light pool on the pavement in front (one additive quad, brighter at night)
  const poolTex = tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xff9a4a, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 6).rotateX(-Math.PI / 2), poolMat); pool.position.set(0, .06, fz + 2.6); pool.renderOrder = 2; grp.add(pool);
  S.add(grp); grp.updateMatrixWorld(true);
  EB.movedLamps = moveLamps(c, x, z, yaw);

  // ---- collision: a row of circles covering the footprint (the City collider is a circle test)
  // ---- collision: the City collider is a circle test, so: small circles along the walls (square-ish corners) + big ones inside
  if (c.colliders) { const ch = .7 + H + RH, push = (lx, lz, r) => { const p = loc(lx, lz); c.colliders.push({ x: p.x, z: p.z, r, h: ch }); };
    const ix = W / 2 - .9, iz = D / 2 - .9;
    for (let lx = -ix; lx <= ix + 1e-6; lx += ix / 5) { push(lx, iz, 1.2); push(lx, -iz, 1.2); }
    for (let lz = -iz + iz / 3; lz < iz - 1e-6; lz += iz / 3) { push(ix, lz, 1.2); push(-ix, lz, 1.2); }
    for (const lx of [-3.5, 0, 3.5]) push(lx, 0, 3);
  }
  const doorIn = loc(0, fz + 1.2), doorOut = loc(0, fz + 4.6), faceOut = loc(14, fz + 5.6);   // step out and turn along the street (the follow camera stays on the pavement)
  EB.lot = { x, z, yaw, w: W, d: D }; EB.door = doorIn; EB.group = grp;
  EB.stats = () => { let tris = 0, draws = 0; grp.traverse(o => { if (o.isMesh) { draws++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { draws, tris, colliders: c.colliders.filter(o => Math.hypot(o.x - x, o.z - z) < 9).length }; };
  EB.spot = () => ({ x: doorOut.x, z: doorOut.z, face: { x: x, z: z } });
  const enter = () => { if (window.__openBurnTowerInterior) window.__openBurnTowerInterior({ venue: 'ember' }); else (window.__bcToast || console.log)('The Ember Bar is opening its doors, try again in a moment.'); };
  EB.enter = enter;
  EB.goToDoor = () => { const s = EB.spot(); const ok = window.__walkTo && window.__walkTo(s.x, s.z, s.face); if (ok && window.__bcToast) window.__bcToast('THE EMBER BAR · walk up to the door and press E (or tap) to go in.', '#ff9b4a'); return ok; };
  let armed = true;   // after leaving, the door prompt stays quiet until the player has stepped away from it
  (window.__interactors = window.__interactors || []).push(p => {
    const d = Math.hypot(p.x - doorIn.x, p.z - doorIn.z);
    if (!armed) { if (d > 5.5 || performance.now() > EB.quietUntil) armed = true; else return null; }
    if (d > 3.2 || p.y > gy + 3) return null;
    return { d: Math.max(0, d - 1), label: 'Enter THE EMBER BAR', act: enter };
  });
  // leaving the bar: back on the pavement outside the door, turned along the street
  EB.quietUntil = 0;
  addEventListener('burntower:close', e => { if (e.detail?.venue !== 'ember') return; armed = false; EB.quietUntil = performance.now() + 8000; setTimeout(() => { if (window.__walkTo) window.__walkTo(doorOut.x, doorOut.z, { x: faceOut.x, z: faceOut.z }); }, 0); });
  (window.__mmHooks = window.__mmHooks || []).push((mm, sc, cw) => {
    const px = x * sc, pz = z * sc, s = Math.max(3, W * sc);
    mm.save(); mm.shadowColor = '#ff7a1a'; mm.shadowBlur = 8; mm.fillStyle = '#ff8a2a'; mm.translate(px, pz); mm.rotate(-yaw); mm.fillRect(-s / 2, -s / 3, s, s * .66); mm.restore();
    mm.fillStyle = '#ffd9a8'; mm.font = Math.round(cw / 30) + 'px system-ui'; mm.textAlign = 'center'; mm.fillText('Ember Bar', px, pz + s + 8);
  });
  (window.__tourHooks = window.__tourHooks || []).push(V3 => { const cam = loc(9, fz + 24); return [V3(cam.x, gy + 8, cam.z), V3(x, gy + 4, z), 'The Ember Bar: a pirate tavern on the BURN ring road. Walk in, meet the bartender and Blackbeard, order a house special'] });
  // front steps: walkable treads (.24 then .47 m). A City collider would push players off before they could stand on it, so the
  // treads lift the walker late in the frame instead (same idea as the dock decks); stepping off drops back to the pavement.
  const tread = (px, pz) => { const dx = px - x, dz = pz - z, lx = dx * Math.cos(yaw) - dz * Math.sin(yaw), lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.abs(lx) > 1.4) return 0; if (lz > fz + .75 && lz < fz + 1.22) return .24; if (lz > fz + .2 && lz <= fz + .75) return .47; return 0; };
  EB.treadAt = (px, pz) => gy + tread(px, pz);
  (window.__preRender = window.__preRender || []).push(() => {
    if (window.__burnTowerOpen || !c.P || (window.__burnMode && window.__burnMode() !== 'explore')) return;
    const P = c.P, h = gy + tread(P.pos.x, P.pos.z); if (h <= gy) return;
    if (P.pos.y < h + .02 && P.pos.y > h - .45 && !(P.vel && P.vel.y > .5)) { P.pos.y = h; if (P.vel) P.vel.y = 0; P.onGround = true; if (c.avatar) c.avatar.position.y = h; }
  });
  // night: walls catch a little of their own window glow; signs and windows a touch brighter after dark
  (window.__preRender = window.__preRender || []).push(() => {
    if (window.__burnTowerOpen) return;
    const day = c.U ? c.U.day.value : .5, nf = 1 - Math.max(0, Math.min(1, (day - .15) / .5));
    grp.visible = C.position.distanceTo(grp.position) < 1100;
    M.wall.emissiveIntensity = .5 * nf; poolMat.opacity = .08 + .32 * nf;
    M.win.color.setRGB(1.0 + .6 * nf, .55 + .3 * nf, .22 + .12 * nf);
  });
  EB.ready = true;
}

if (Q.get('emberbar') !== '0') (function wait(n = 0) {
  const c = window.__city;
  if (c && c.S && c.C && c.N && c.streets && c.colliders && window.__setBurnMode) { try { init(); } catch (e) { EB.error = String(e && e.stack || e).slice(0, 300); console.warn('ember bar building disabled', e); } }
  else if (n < 240) setTimeout(() => wait(n + 1), 500);
})();
