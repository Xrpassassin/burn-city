// BURN City: THE UNDERCROFT — the Ember Crossroads hub (LAZY: imported by underground-gate.js near the entrance or on Enter).
// A sunken crossroads plaza under a ribbed dome: pale fluted pillars crowned with lumen crystals, a great iron brazier on a stepped
// dais, ledger veins (Burn City's glowing lines) cracking through the stone, four vaulted halls lined with skull niches and torches:
//   north: the Descent Gate (jagged black spires around a swirling fire portal) -> Eternal Grind
//   east:  the Ledger Hall: the Ledger of Deeds (daily / weekly Eternal Grind objectives, LOCAL ONLY, no rewards) + Warden Ossia
//   west:  the Ossuary Chapel: Cinder-Scribe Varro + the Ember Stair (a quieter side way into Eternal Grind)
//   south: the stair back up to Burn City
// Textures: Poly Haven (CC0). Models: Sketchfab CC BY (see assets/underground/ATTRIBUTION.md). Everything else is procedural.
// Perf: one texture set per surface (512 px + no normal maps on low), repeated pieces are InstancedMesh, low tier thins fog,
// particles, veins, skulls and lights. unload() disposes every geometry/material/texture, the DOM panels and the audio.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { worldUV, canvasTex, glowTex, flame, flicker, crystalMat, veinTex, merge, pointedArch, archFrame, flutedShaft, ASSET, portalMat, tierN, TEST } from './underground-gate.js';
import { UG, L, SPOTS, pillarSpots, toWorld, floorLocal } from './underground-layout.mjs';
import { board, STORE_KEY } from './underground-quests.mjs';
import { buildWalker, poseWalker } from './walker.js';

const C = () => window.__city;
const S = { loaded: false, active: false, root: null, colliders: [], flames: [], portals: [], veinMats: [], lights: [], npcs: [], ember: null, drips: null, dust: null, audio: null, panel: null, api: null, tex: [], t: 0, stats: {} };
if (TEST) window.__undercroftHub = S;
export const isLoaded = () => S.loaded;
const yieldFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const Y = L.GALLERY_Y;

// ---------------------------------------------------------------- assets
async function loadTexAsync(url, srgb = true) { const t = await new THREE.TextureLoader().loadAsync(url); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = tierN(2, 4, 8); S.tex.push(t); return t; }
async function loadModel(loader, name, h) {   // first mesh, baked to its world transform, base at y=0, centred, scaled to height h
  const g = await loader.loadAsync(ASSET + 'models/' + name + '.glb'); let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox(); const b = geo.boundingBox, s = h / (b.max.y - b.min.y);
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s); geo.computeBoundingBox();
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const mat = mesh.material; if (mat.map) S.tex.push(mat.map); if (mat.normalMap) S.tex.push(mat.normalMap);
  mesh.geometry.dispose(); return { geo, mat };
}
const M = {};
async function materials(progress) {
  const lo = tierN(true, false, false), nm = !lo;
  const set = async (name, color, rough, tile) => {
    const map = await loadTexAsync(ASSET + 'tex/' + name + (lo ? '_diff-512.webp' : '_diff.webp'));
    const normalMap = nm ? await loadTexAsync(ASSET + 'tex/' + name + '_nor.webp', false) : null;
    const m = new THREE.MeshStandardMaterial({ map, normalMap, color, roughness: rough, metalness: 0, side: THREE.DoubleSide }); if (normalMap) m.normalScale.set(1.2, 1.2); m.userData.tile = tile; return m;
  };
  M.wall = await set('medieval_blocks_02', 0xa9a6a2, .95); progress(.12);
  M.pale = await set('white_sandstone_blocks_02', 0xf6efe4, .82); progress(.24);
  M.floor = await set('monastery_stone_floor', 0xb3a594, .9); progress(.34);
  M.rock = await set('rock_wall_08', 0x857a70, .95); progress(.42);
  M.paleSolid = new THREE.MeshStandardMaterial({ color: 0xe9e1d3, roughness: .8, map: M.pale.map, normalMap: M.pale.normalMap });   // instanced pillars/ribs (single side)
  M.iron = new THREE.MeshStandardMaterial({ color: 0x2a2421, roughness: .5, metalness: .75 });
  M.wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: .8 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x0d0907, roughness: 1 });
  M.crystal = crystalMat();
  const crack = veinTex(31, 512, 512, '255,70,20'); S.tex.push(crack); crack.wrapS = crack.wrapT = THREE.RepeatWrapping; crack.repeat.set(1, 2);
  M.basalt = new THREE.MeshStandardMaterial({ color: 0x17110f, roughness: .45, metalness: .3, emissive: 0xff3c12, emissiveMap: crack, emissiveIntensity: .6, flatShading: true, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- geometry builders (local coordinates, root sits at UG)
function hallShell(len, hw, spring, apex, tile = 2.6) {   // a vaulted hall interior along +z from z=0 to z=len (walls + pointed vault)
  const prof = [[-hw, 0], ...pointedArch(hw, spring, apex, 12), [hw, 0]]; const pos = [], uv = []; let acc = [0];
  for (let i = 1; i < prof.length; i++) acc.push(acc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  for (let i = 0; i < prof.length - 1; i++) { const [x0, y0] = prof[i], [x1, y1] = prof[i + 1];
    pos.push(x0, y0, 0, x1, y1, 0, x0, y0, len, x1, y1, 0, x1, y1, len, x0, y0, len);
    const u0 = acc[i] / tile, u1 = acc[i + 1] / tile, v = len / tile; uv.push(u0, 0, u1, 0, u0, v, u1, 0, u1, v, u0, v); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function ribGeo(hw, spring, apex, t = .42, depth = .7) {   // transverse arch rib + pilasters, in the XY plane, extruded along z (centred)
  const sh = new THREE.Shape(); sh.moveTo(-hw, -.05); for (const [x, y] of pointedArch(hw, spring, apex, 12)) sh.lineTo(x, y); sh.lineTo(hw, -.05); sh.closePath();
  const hole = new THREE.Path(); const inner = pointedArch(hw - t, spring, apex - t, 12); hole.moveTo(-hw + t, 0); for (const [x, y] of inner) hole.lineTo(x, y); hole.lineTo(hw - t, 0); hole.closePath(); sh.holes.push(hole);
  return worldUV(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -depth / 2), 2);
}
function profileWall(hw, spring, apex, hole) {   // end wall filling a hall profile, optional pointed-arch doorway hole {w, spring, apex}
  const sh = new THREE.Shape(); sh.moveTo(-hw, 0); for (const [x, y] of pointedArch(hw, spring, apex, 12)) sh.lineTo(x, y); sh.lineTo(hw, 0); sh.closePath();
  if (hole) { const p = new THREE.Path(); p.moveTo(-hole.w, 0.01); for (const [x, y] of pointedArch(hole.w, hole.spring, hole.apex, 10)) p.lineTo(x, y); p.lineTo(hole.w, .01); p.closePath(); sh.holes.push(p); }
  return worldUV(new THREE.ShapeGeometry(sh, 4), 2.6);
}
function cylWall(r, y0, h, t0, tl, seg = 48, tile = 2.6) {   // inward-facing cylinder segment with world-scale UVs (u along arc)
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, t0, tl).translate(0, y0 + h / 2, 0); const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * tl * r / tile, (p.getY(i)) / tile); return g;
}
function disc(r0, r1, y, seg = 72, tile = 3) { const g = (r0 > 0 ? new THREE.RingGeometry(r0, r1, seg, 1) : new THREE.CircleGeometry(r1, seg)).rotateX(-Math.PI / 2).translate(0, y, 0); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile); return g; }
function dome(r, y, k, tile = 4) { const g = new THREE.SphereGeometry(r, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, k, 1).translate(0, y, 0); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r / tile, uv.getY(i) * r * 1.6 / tile); return g; }
const at = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); return g.translate(x, y, z); };
function addMesh(g, m, parent = S.root) { const o = new THREE.Mesh(g, m); parent.add(o); return o; }
function inst(geo, mat, mats4) { const m = new THREE.InstancedMesh(geo, mat, mats4.length); mats4.forEach((x, i) => m.setMatrixAt(i, x)); m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); S.root.add(m); return m; }
const _o = new THREE.Object3D();
const mtx = (x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => { _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(s); _o.updateMatrix(); return _o.matrix.clone(); };
function collider(x, z, r, h = 12) { const [wx, wz] = toWorld(x, z); S.colliders.push({ x: wx, z: wz, r, h: Y + h, ug: 1, ugHub: 1 }); }
function veinDecal(w, h, seed, col, op = .9) {   // additive glowing crack decal (ledger vein)
  const t = veinTex(seed, 512, 512, col); S.tex.push(t); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true, polygonOffset: true, polygonOffsetFactor: -4 });
  m.userData.base = op; S.veinMats.push(m); return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}
function radialVeins(seed) {   // the plaza: veins burst from the dais toward the four halls
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const t = canvasTex(1024, 1024, (g, w, h) => { g.lineCap = 'round';
    const walk = (x, y, a, len, wd, d) => { for (let i = 0; i < len; i++) { const nx = x + Math.cos(a) * 10, ny = y + Math.sin(a) * 10;
        for (const [lw, al] of [[wd * 6, .07], [wd * 2.4, .3], [wd, 1]]) { g.strokeStyle = `rgba(255,${110 + d * 20},40,${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); }
        x = nx; y = ny; a += (r() - .5) * .5; wd *= .99; if (d < 3 && r() < .06) walk(x, y, a + (r() < .5 ? -1 : 1) * (.5 + r() * .7), len * .45 | 0, wd * .65, d + 1); } };
    for (let k = 0; k < 4; k++) walk(512 + Math.cos(k * Math.PI / 2) * 110, 512 + Math.sin(k * Math.PI / 2) * 110, k * Math.PI / 2, 42, 3.2, 0);
    for (let k = 0; k < 6; k++) { const a = r() * 6.28; walk(512 + Math.cos(a) * 120, 512 + Math.sin(a) * 120, a, 18 + r() * 14 | 0, 2, 1); } });
  S.tex.push(t); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }); m.userData.base = 1; S.veinMats.push(m); return m;
}
function stripVeins(seed) { const t = canvasTex(256, 1024, (g, w, h) => { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) { let x = w * (.35 + k * .3), y = 0, a = Math.PI / 2; while (y < h) { const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9; for (const [lw, al] of [[14, .07], [5, .3], [2.2, 1]]) { g.strokeStyle = `rgba(255,120,40,${al})`; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); } x = Math.max(20, Math.min(w - 20, nx)); y = ny; a = Math.PI / 2 + (r() - .5) * 1.2; } } });
  S.tex.push(t); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }); m.userData.base = .85; S.veinMats.push(m); return m; }
function markerTex(ch, col) { return canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 62); r.addColorStop(0, col + 'aa'); r.addColorStop(1, col + '00'); g.fillStyle = r; g.fillRect(0, 0, w, h); g.font = '900 92px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#2a1608'; g.strokeText(ch, 64, 70); g.fillStyle = '#fff2c0'; g.fillText(ch, 64, 70); }); }

// ---------------------------------------------------------------- build
async function build(progress) {
  const c = C(); S.root = new THREE.Group(); S.root.name = 'undercroft'; S.root.userData.ugKeep = 1; S.root.position.set(UG.x, 0, UG.z); S.root.visible = false; c.S.add(S.root);
  S.colliders = []; S.flames = []; S.portals = []; S.veinMats = []; S.lights = []; S.npcs = [];
  await materials(progress);
  const gl = new GLTFLoader(); const mdl = {};
  for (const [k, h, p] of [['torch', .95, .48], ['brazier', 1.5, .54], ['crystal', .85, .58], ['candle', .34, .62], ['skull-lo', .3, .66], ['skullpile', .55, .7]]) { mdl[k] = await loadModel(gl, k, h); progress(p); }
  for (const k of ['skull-lo', 'skullpile']) { const m = mdl[k].mat; m.color && m.color.setRGB(1.9, 1.75, 1.5); m.roughness = .8; }
  const HW = L.HALL_HW, SP = L.HALL_SPRING, AP = L.HALL_APEX;
  // --- plaza: sunken floor, four steps, gallery ring
  addMesh(disc(0, L.STEPS[0], 0, 72), M.floor);
  for (let i = 1; i <= 4; i++) { const r0 = L.STEPS[i - 1], r1 = i < 4 ? L.STEPS[i] : L.GALLERY_R + .3, y = L.STEP_H * i;
    addMesh(disc(r0, r1, y, 96), i < 4 ? M.pale : M.floor); addMesh(cylWall(r0, y - L.STEP_H, L.STEP_H, 0, Math.PI * 2, 96, 1.2), M.pale); }
  { const vg = disc(0, L.STEPS[0] - .02, .02, 64, 24); const p = vg.attributes.position, uv = vg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 24 + .5, -p.getZ(i) / 24 + .5); addMesh(vg, radialVeins(91)); }
  // --- dais + great brazier
  for (const [r, y] of [[L.DAIS_R, 0], [2.2, .45], [1.7, .9]]) { addMesh(worldUV(new THREE.CylinderGeometry(r, r + .08, .45, 40).translate(0, y + .225, 0), 1.6), M.pale); }
  collider(0, 0, L.DAIS_R + .1, 1.4);
  { const b = addMesh(mdl.brazier.geo, mdl.brazier.mat); b.position.y = 1.35; b.scale.setScalar(1.25);
    const top = 1.35 + 1.5 * 1.25 * .82; const f = flame(2.6); f.position.set(0, top - .3, 0); S.root.add(f); S.flames.push(f);
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, f2 = flame(1.2); f2.position.set(Math.cos(a) * .55, top - .35, Math.sin(a) * .55); S.root.add(f2); S.flames.push(f2); }
    const L1 = new THREE.PointLight(0xff8a3c, tierN(70, 90, 110), 46, 1.25); L1.position.set(0, top + .8, 0); S.root.add(L1); S.lights.push(L1); S.brazierLight = L1; S.brazierTop = top; }
  progress(.74); await yieldFrame();
  // --- rotunda wall with four openings + arch frames, dome, ribs, chandelier
  const op = Math.asin((HW + .3) / L.GALLERY_R), WH = 10.2, WT = Y + WH;
  for (let k = 0; k < 4; k++) { addMesh(cylWall(L.GALLERY_R, Y, WH, k * Math.PI / 2 + op, Math.PI / 2 - 2 * op, 32), M.wall); addMesh(cylWall(L.GALLERY_R, Y + AP, WH - AP, k * Math.PI / 2 - op, 2 * op, 6), M.wall);
    const fr = worldUV(archFrame(10.4, WH, HW, SP, AP, 1.3, 12), 2); fr.translate(0, Y, 0); fr.rotateY(k * Math.PI / 2); const off = Math.sqrt(L.GALLERY_R ** 2 - (HW + .3) ** 2) - .2; fr.translate(Math.sin(k * Math.PI / 2) * off, 0, Math.cos(k * Math.PI / 2) * off); addMesh(fr, M.pale); }
  addMesh(dome(L.GALLERY_R, WT, .55), M.rock);
  { const ribs = []; for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4, pts = []; for (let i = 0; i <= 20; i++) { const f = i / 20 * Math.PI / 2; pts.push(new THREE.Vector3(Math.cos(f) * (L.GALLERY_R - .35) * Math.cos(a), WT + Math.sin(f) * (L.GALLERY_R * .55 - .35), Math.cos(f) * (L.GALLERY_R - .35) * Math.sin(a))); }
      ribs.push(worldUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .36, 6, false), 1.6)); }
    addMesh(merge(ribs), M.paleSolid);
    // cornice ring at the dome spring
    addMesh(worldUV(new THREE.TorusGeometry(L.GALLERY_R - .25, .38, 6, 96).rotateX(Math.PI / 2).translate(0, WT, 0), 1.6), M.paleSolid); }
  // chandelier: an iron ring of lumen crystals hanging over the brazier
  { const ringY = 15.5; addMesh(new THREE.TorusGeometry(3.2, .09, 6, 48).rotateX(Math.PI / 2).translate(0, ringY, 0), M.iron);
    const cm = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; cm.push(mtx(Math.cos(a) * 3.2, ringY - .1, Math.sin(a) * 3.2, a, .9, Math.PI)); } inst(mdl.crystal.geo, M.crystal, cm);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; const ch = new THREE.CylinderGeometry(.03, .03, WT + L.GALLERY_R * .55 - ringY - .4, 4).translate(0, (WT + L.GALLERY_R * .55 + ringY) / 2 - .2, 0); ch.rotateZ(0); ch.translate(Math.cos(a) * 3.2 * .5, 0, Math.sin(a) * 3.2 * .5); addMesh(ch, M.iron); }
    const cool = new THREE.PointLight(0xa8d0ff, tierN(0, 120, 150), 46, 1.2); cool.position.set(0, ringY - 1, 0); if (cool.intensity) { S.root.add(cool); S.lights.push(cool); } }
  // --- pillars with lumen crystal sconces
  { const shaft = worldUV(flutedShaft(.72, 8.6), 1.6), base = worldUV(new THREE.BoxGeometry(2, .7, 2).translate(0, .35, 0), 1.6), cap = worldUV(merge([new THREE.CylinderGeometry(1.0, .74, .55, 24).translate(0, 9.6, 0), new THREE.BoxGeometry(2.2, .5, 2.2).translate(0, 10.1, 0)]), 1.6);
    const mm = [], cr = [], br = []; for (const p of pillarSpots()) { const a = Math.atan2(p.z, p.x); mm.push(mtx(p.x, Y, p.z, -a)); collider(p.x, p.z, p.r);
      const ix = p.x - Math.cos(a) * .95, iz = p.z - Math.sin(a) * .95; cr.push(mtx(ix, Y + 5.4, iz, a, 1)); br.push(mtx(ix, Y + 5.3, iz, -a)); }
    inst(shaft, M.paleSolid, mm.map(m => m.clone().multiply(new THREE.Matrix4().makeTranslation(0, .7, 0)))); inst(base, M.paleSolid, mm); inst(cap, M.paleSolid, mm);
    inst(mdl.crystal.geo, M.crystal, cr); inst(merge([new THREE.CylinderGeometry(.34, .18, .22, 10, 1, true), new THREE.BoxGeometry(.7, .08, .08).translate(.35, 0, 0)]), M.iron, br);
  }
  progress(.8); await yieldFrame();
  // --- the four halls: vault shells, floors, ribs, torches, skull niches, veins
  const halls = [ // [name, rotationY, start, end]  (rotation maps the hall's local +z to the world direction)
    ['south', 0, 21.6, L.SOUTH_END + 8], ['north', Math.PI, 21.6, 46.6], ['east', Math.PI / 2, 21.6, 47.2], ['west', -Math.PI / 2, 21.6, 45.7]];
  const ribM = [], torchM = [], skullM = [], frameM = [], backM = [], candleM = [], torchFlames = [];
  const rib = ribGeo(HW, SP, AP), niche = worldUV(archFrame(1.9, 2.1, .62, 1.1, 1.62, .32, 8), 1.2), back = new THREE.PlaneGeometry(1.3, 1.65);
  const stripM = stripVeins(57); const nSk = tierN(1, 2, 3);
  for (const [name, ry, z0, z1] of halls) {
    const g = new THREE.Group(); g.rotation.y = ry; g.position.y = Y; S.root.add(g);
    const shell = hallShell(z1 - z0, HW, SP, AP); shell.translate(0, 0, z0); addMesh(shell, M.wall, g);
    const fl = new THREE.PlaneGeometry(HW * 2, z1 - z0).rotateX(-Math.PI / 2).translate(0, 0, (z0 + z1) / 2); { const p = fl.attributes.position, uv = fl.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3); } addMesh(fl, M.floor, g);
    const sv = new THREE.Mesh(new THREE.PlaneGeometry(2.4, z1 - z0 - 2).rotateX(-Math.PI / 2).translate(0, .025, (z0 + z1) / 2), stripM); g.add(sv);
    const W = new THREE.Matrix4().makeRotationY(ry).premultiply(new THREE.Matrix4().makeTranslation(0, Y, 0));
    let n = 0; for (let z = z0 + 3; z < z1 - 2; z += 6, n++) {
      ribM.push(W.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, z)));
      if (n % 2 === 0) for (const s of [-1, 1]) { const tm = W.clone().multiply(mtx(s * (HW - .42), 2.7, z, s < 0 ? 0 : Math.PI)); torchM.push(tm); const fp = new THREE.Vector3(.33, .93, 0).applyMatrix4(tm); torchFlames.push(fp); }
      if (name === 'south' && z > L.SOUTH_END - 2) continue;
      const zn = z + 3; if (zn > z1 - 3) continue;   // a niche in the bay after each rib, both walls
      for (const s of [-1, 1]) { const ry2 = s < 0 ? Math.PI / 2 : -Math.PI / 2;
        frameM.push(W.clone().multiply(mtx(s * (HW - .16), .55, zn, ry2))); backM.push(W.clone().multiply(mtx(s * (HW - .03), 1.3, zn, ry2)));
        for (let k = 0; k < nSk; k++) skullM.push(W.clone().multiply(mtx(s * (HW - .3), .6, zn + (k - (nSk - 1) / 2) * .34, ry2 + (k - 1) * .25)));
        if ((n + (s > 0 ? 1 : 0)) % 2) candleM.push(W.clone().multiply(mtx(s * (HW - .55), .55, zn + .55, 0))); }
      if (n % 3 === 1) { const vd = veinDecal(3.4, 4.2, 100 + n * 7 + ry * 3 | 0, '255,120,40', tierN(.6, .8, .95)); vd.position.set(-HW + .05, 2.6, z + 3); vd.rotation.y = Math.PI / 2; g.add(vd); }
    }
  }
  inst(rib, M.paleSolid, ribM); inst(mdl.torch.geo, mdl.torch.mat, torchM);
  inst(niche, M.paleSolid, frameM); inst(back, M.dark, backM); inst(mdl['skull-lo'].geo, mdl['skull-lo'].mat, skullM); inst(mdl.candle.geo, mdl.candle.mat, candleM);
  for (const p of torchFlames) { const f = flame(.42); f.position.copy(p); S.root.add(f); S.flames.push(f); }
  for (const m of candleM) { const p = new THREE.Vector3(0, .36, 0).applyMatrix4(m); const f = flame(.11); f.position.copy(p); S.root.add(f); S.flames.push(f); }
  S.stats.skulls = skullM.length; S.stats.torches = torchM.length;
  // hall end walls: the stair up (south)
  { const g = new THREE.Group(); S.root.add(g); g.position.y = Y;
    const steps = []; for (let i = 0; i < 14; i++) steps.push(worldUV(new THREE.BoxGeometry(HW * 2, .36, .58).translate(0, .18 + i * .36, L.SOUTH_END + .3 + i * .55), 1.2)); addMesh(merge(steps), M.pale, g);
    const ew = profileWall(HW, SP, AP, { w: 1.5, spring: 2.6, apex: 3.6 }); ew.translate(0, 5, L.SOUTH_END + 8); addMesh(ew, M.wall, g);
    const lite = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.6), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffe2b0, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); lite.position.set(0, 6.8, L.SOUTH_END + 8.05); lite.rotation.y = Math.PI; g.add(lite);
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(4, 9), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffd7a0, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); shaft.position.set(0, 4, L.SOUTH_END + 4); shaft.rotation.x = -.6; g.add(shaft); }
  progress(.86); await yieldFrame();
  buildGateChamber(mdl); progress(.9); await yieldFrame();
  buildLedgerHall(mdl); buildChapel(mdl); progress(.95);
  // ambient + fog colour live in frame(); a dim cool/warm hemisphere so the stone always reads
  const hemi = new THREE.HemisphereLight(0x9db4dc, 0x3a2418, tierN(2.0, 1.7, 1.6)); S.root.add(hemi); S.lights.push(hemi); S.hemi = hemi;
  particles();
  S.loaded = true;
}
function buildGateChamber(mdl) {
  const N = L.NORTH, g = new THREE.Group(); g.position.set(N.x, Y, N.z); S.root.add(g); const HW = L.HALL_HW;
  const op = Math.asin((HW + .3) / N.r), WH = 13;
  addMesh(disc(0, N.r + .3, 0, 64), M.floor, g);
  addMesh(cylWall(N.r, 0, WH, op, Math.PI * 2 - 2 * op, 48), M.wall, g); addMesh(cylWall(N.r, L.HALL_APEX, WH - L.HALL_APEX, -op, 2 * op, 8), M.wall, g);
  { const fr = worldUV(archFrame(10.4, WH, HW, L.HALL_SPRING, L.HALL_APEX, 1.3, 12), 2); fr.translate(0, 0, Math.sqrt(N.r ** 2 - (HW + .3) ** 2) - .3); addMesh(fr, M.pale, g); }
  addMesh(dome(N.r, WH, .75), M.rock, g);
  // the Descent Gate: stepped basalt base, two great curved horns, lesser spires, a swirling fire portal
  const gz = -10.2; const base = [];
  for (let i = 0; i < 3; i++) base.push(new THREE.BoxGeometry(13 - i * 1.6, .4, 4.6 - i * .8).translate(0, .2 + i * .4, gz));
  addMesh(merge(base), M.basalt, g);
  const horn = (h, r0, lean, twist, spikes, seed) => { let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const segs = [], n = 9; let x = 0, y = 0, z = 0, a = 0;
    for (let i = 0; i < n; i++) { const t = i / n, sh = h / n, rr = r0 * (1 - t * .85), seg = new THREE.CylinderGeometry(rr * .82, rr, sh * 1.08, 5, 1).translate(0, sh / 2, 0); seg.rotateZ(-a); seg.rotateY(twist * i); seg.translate(x, y, z); segs.push(seg.toNonIndexed());
      if (i > 1 && i < n - 1) for (let k = 0; k < spikes; k++) { const sp = new THREE.ConeGeometry(rr * .35, rr * (1.6 + r() * 1.8), 4).translate(0, rr * 1.2, 0); sp.rotateZ(Math.PI / 2 - .5 + r() * .5 + (r() < .5 ? Math.PI : 0)); sp.rotateY(r() * 6.28); sp.translate(x, y + sh * .5, z); segs.push(sp.toNonIndexed()); }
      x += Math.sin(a) * sh; y += Math.cos(a) * sh; a += lean / n; }
    const tip = new THREE.ConeGeometry(r0 * .18, h * .14, 5).translate(0, h * .07, 0); tip.rotateZ(-a); tip.translate(x, y, z); segs.push(tip.toNonIndexed()); return merge(segs); };
  for (const s of [-1, 1]) {
    const hg = horn(13.5, 1.15, 1.05, .12, 2, s > 0 ? 11 : 23); if (s > 0) hg.scale(-1, 1, 1); hg.translate(0, 1.2, gz);
    const m = addMesh(hg, M.basalt, g); m.position.x = s * 4.3;
    for (const [dx, hh, rr, dz] of [[2.6, 9.5, .7, -1.1], [4.6, 7, .55, .4], [1.4, 6, .45, 1.2]]) { const sg = horn(hh, rr, .35, .2, 1, (s > 0 ? 50 : 70) + hh * 3 | 0); if (s > 0) sg.scale(-1, 1, 1); const sm = addMesh(sg, M.basalt, g); sm.position.set(s * (4.3 + dx), 1.2, gz + dz); } }
  const pm = portalMat(0xff2a08, 0xffc25a); pm.uniforms.a.value = .8; const portal = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 10.2), pm); portal.position.set(0, 1.2 + 5.2, gz + .3); g.add(portal); S.portals.push(pm);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff4a14, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.scale.set(11, 13, 1); halo.material.opacity = .2; halo.position.set(0, 6.5, gz + .1); g.add(halo);
  const nF = tierN(6, 10, 14); for (let k = 0; k < nF; k++) { const t = k / (nF - 1), a = Math.PI * (1 - t); const f = flame(.8 + Math.random() * .4); f.position.set(Math.cos(a) * 4.2, 1.2 + .1 + Math.max(0, Math.sin(a)) * .2, gz + .9); if (k % 2 === 0 || nF < 8) { g.add(f); S.flames.push(f); } }
  const red = new THREE.PointLight(0xff4a1a, tierN(13, 17, 21), 22, 1.6); red.position.set(0, 5.5, gz + 4); g.add(red); S.lights.push(red); S.gateLight = red;
  { const cl = new THREE.PointLight(0x9cc8ff, tierN(0, 55, 65), 30, 1.3); cl.position.set(0, 8.5, 6); if (cl.intensity) { g.add(cl); S.lights.push(cl); } }   // pale lumen light keeps the stone cool around the fire
  const vd = veinDecal(12, 12, 77, '255,60,20', 1); vd.rotation.x = -Math.PI / 2; vd.position.set(0, .03, gz + 6); g.add(vd);
  const sp = []; for (const s of [-1, 1]) for (const dz of [-3, 3]) sp.push(mtx(s * 9.5, 0, dz - 2, s * .6)); inst(mdl.skullpile.geo, mdl.skullpile.mat, sp);
  // lumen braziers flanking the approach
  for (const s of [-1, 1]) { const p = addMesh(worldUV(new THREE.CylinderGeometry(.5, .6, 1.4, 12).translate(0, .7, 0), 1.2), M.paleSolid, g); p.position.set(s * 6, 0, 1.5); const cr = new THREE.Mesh(mdl.crystal.geo, M.crystal); cr.scale.setScalar(1.3); cr.position.set(s * 6, 1.4, 1.5); g.add(cr); collider(N.x + s * 6, N.z + 1.5, .7); }
}
function buildLedgerHall(mdl) {
  const E = L.EAST, g = new THREE.Group(); g.position.set(E.x, Y, E.z); S.root.add(g);
  const hw = E.hd, len = E.hw * 2, sp = 4.4, ap = 9.2;
  const shell = hallShell(len, hw, sp, ap); shell.translate(0, 0, -len / 2); shell.rotateY(Math.PI / 2); addMesh(shell, M.wall, g);
  const fl = new THREE.PlaneGeometry(len, hw * 2).rotateX(-Math.PI / 2); { const p = fl.attributes.position, uv = fl.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3); } addMesh(fl, M.floor, g);
  const w1 = profileWall(hw, sp, ap, { w: L.HALL_HW, spring: L.HALL_SPRING, apex: L.HALL_APEX }); w1.rotateY(Math.PI / 2); w1.translate(-len / 2, 0, 0); addMesh(w1, M.wall, g);
  const w2 = profileWall(hw, sp, ap); w2.rotateY(-Math.PI / 2); w2.translate(len / 2, 0, 0); addMesh(w2, M.wall, g);
  const rm = []; for (let x = -len / 2 + 2.5; x < len / 2 - 1; x += 5) rm.push(mtx(x, Y, 0, Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(E.x, 0, E.z))); inst(ribGeo(hw, sp, ap, .45, .8), M.paleSolid, rm);
  // the Ledger of Deeds: a big oak board of pinned notices on the north wall
  const bz = -hw + .18; addMesh(new THREE.BoxGeometry(5.2, 3.2, .22).translate(0, 2.6, bz), M.wood, g);
  S.boardTex = canvasTex(1024, 640, (x, w, h) => drawBoardTex(x, w, h)); S.tex.push(S.boardTex);
  const bp = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.9), new THREE.MeshStandardMaterial({ map: S.boardTex, roughness: .9, emissive: 0x3a2410, emissiveIntensity: .25, emissiveMap: S.boardTex })); bp.position.set(0, 2.6, bz + .13); g.add(bp);
  for (const s of [-1, 1]) { const cr = new THREE.Mesh(mdl.crystal.geo, M.crystal); cr.position.set(s * 3.4, 3.2, bz + .3); g.add(cr); addMesh(new THREE.CylinderGeometry(.3, .16, .2, 10, 1, true).translate(s * 3.4, 3.15, bz + .3), M.iron, g); }
  // long table with candles, benches
  addMesh(merge([new THREE.BoxGeometry(6, .14, 1.4).translate(0, .86, 2), ...[-2.6, 2.6].flatMap(x => [new THREE.BoxGeometry(.18, .8, 1.1).translate(x, .4, 2)])]), M.wood, g);
  addMesh(merge([-1, 1].map(s => new THREE.BoxGeometry(5.6, .12, .45).translate(0, .46, 2 + s * 1.15))), M.wood, g);
  collider(E.x, E.z + 2, 1.2, 1.5); collider(E.x - 2, E.z + 2, 1.2, 1.5); collider(E.x + 2, E.z + 2, 1.2, 1.5);
  const cm = []; for (const x of [-2.2, -.8, .6, 2]) cm.push(mtx(E.x + x, Y + .93, E.z + 2 + (x > 0 ? .3 : -.3)).premultiply(new THREE.Matrix4())); inst(mdl.candle.geo, mdl.candle.mat, cm);
  for (const m of cm) { const p = new THREE.Vector3(0, .36, 0).applyMatrix4(m); const f = flame(.11); f.position.copy(p); S.root.add(f); S.flames.push(f); }
  // banner on the east wall (an original ember sigil)
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .9, map: (S.banTex = canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#4a1410'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a0a08'; x.fillRect(0, h - 70, w, 70); x.strokeStyle = '#d8a050'; x.lineWidth = 6; x.strokeRect(14, 14, w - 28, h - 100);
      x.fillStyle = '#ffb050'; x.beginPath(); x.moveTo(128, 120); x.bezierCurveTo(190, 200, 170, 300, 128, 330); x.bezierCurveTo(86, 300, 66, 200, 128, 120); x.fill(); x.fillStyle = '#ffe9b0'; x.beginPath(); x.moveTo(128, 200); x.bezierCurveTo(154, 250, 150, 300, 128, 318); x.bezierCurveTo(106, 300, 102, 250, 128, 200); x.fill();
      for (let i = 0; i < 6; i++) { x.fillStyle = '#2a0a08'; x.beginPath(); x.moveTo(i * 44, h - 70); x.lineTo(i * 44 + 22, h - 20); x.lineTo(i * 44 + 44, h - 70); x.fill(); } })) }));
  S.tex.push(S.banTex); ban.position.set(len / 2 - .12, 4.2, 0); ban.rotation.y = -Math.PI / 2; g.add(ban);
  const warm = new THREE.PointLight(0xffc890, tierN(0, 70, 90), 28, 1.3); warm.position.set(0, 6, -1); if (warm.intensity) { g.add(warm); S.lights.push(warm); }
  const vd = veinDecal(5, 5, 141, '255,120,40', .8); vd.rotation.x = -Math.PI / 2; vd.position.set(-4, .03, -3); g.add(vd);
  // Warden Ossia (quest giver)
  npc('warden', SPOTS.warden, { suit: 0x2a2f3a, accent: 0x9fd0ff, skin: 1, hair: 0xd8d4cc }, 0x3a4152);
}
function buildChapel(mdl) {
  const W = L.WEST, g = new THREE.Group(); g.position.set(W.x, Y, W.z); S.root.add(g); const HW = L.HALL_HW;
  const op = Math.asin((HW + .3) / W.r), WH = 8.5, east = Math.PI / 2;
  addMesh(disc(0, W.r + .3, 0, 64), M.floor, g);
  addMesh(cylWall(W.r, 0, WH, east + op, Math.PI * 2 - 2 * op, 48), M.wall, g); addMesh(cylWall(W.r, L.HALL_APEX, WH - L.HALL_APEX, east - op, 2 * op, 8), M.wall, g);
  { const fr = worldUV(archFrame(10.4, WH, HW, L.HALL_SPRING, L.HALL_APEX, 1.3, 12), 2); fr.rotateY(Math.PI / 2); fr.translate(Math.sqrt(W.r ** 2 - (HW + .3) ** 2) - .3, 0, 0); addMesh(fr, M.pale, g); }
  addMesh(dome(W.r, WH, .8), M.rock, g);
  // ossuary bands: rows of skulls on stone shelves around the wall, leaving the doorway and the Ember Stair clear
  const rows = tierN(1, 2, 3), sm = [], shelf = [];
  for (let row = 0; row < rows; row++) { const y = 1.15 + row * .52; for (let a = 0; a < Math.PI * 2; a += .052) { const d1 = Math.abs(Math.atan2(Math.sin(a - east), Math.cos(a - east))), d2 = Math.abs(Math.atan2(Math.sin(a + east), Math.cos(a + east))); if (d1 < op + .12 || d2 < .38) continue;
      const r = W.r - .22, x = Math.sin(a) * r, z = Math.cos(a) * r; sm.push(mtx(W.x + x, Y + y, W.z + z, a + Math.PI, 1.05)); } }
  for (let row = 0; row <= rows; row++) shelf.push(worldUV(cylWall(W.r - .2, 1.08 + row * .52 - .06, .06, 0, Math.PI * 2, 64, 1.2), 1.2));
  inst(mdl['skull-lo'].geo, mdl['skull-lo'].mat, sm); addMesh(merge(shelf), M.paleSolid, g); S.stats.chapelSkulls = sm.length;
  // the Ember Stair: a pale arch on the west wall around a smaller ember portal
  const gx = -W.r + .5; { const fr = worldUV(archFrame(5.6, 6.4, 1.9, 2.8, 4.5, .9, 10), 1.6); fr.rotateY(Math.PI / 2); fr.translate(gx, 0, 0); addMesh(fr, M.paleSolid, g);
    const pm = portalMat(0xff4a10, 0xffd890); const p = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 4.4), pm); p.rotation.y = Math.PI / 2; p.position.set(gx - .1, 2.2, 0); g.add(p); S.portals.push(pm); }
  const cm = []; for (let k = 0; k < tierN(8, 14, 20); k++) { const a = -east + (k / 20 - .5) * 2.4 + (k % 2 ? .05 : -.05), r = W.r - 1.1 - (k % 3) * .35; cm.push(mtx(W.x + Math.sin(a) * r, Y, W.z + Math.cos(a) * r, a, .9 + (k % 3) * .2)); } inst(mdl.candle.geo, mdl.candle.mat, cm);
  for (const m of cm) { const p = new THREE.Vector3(0, .36, 0).applyMatrix4(m); const f = flame(.11); f.position.copy(p); S.root.add(f); S.flames.push(f); }
  const sp = []; for (const a of [.9, 2.3, -.9, -2.3]) sp.push(mtx(W.x + Math.sin(a) * (W.r - 1.6), Y, W.z + Math.cos(a) * (W.r - 1.6), a)); inst(mdl.skullpile.geo, mdl.skullpile.mat, sp);
  const warm = new THREE.PointLight(0xffb070, tierN(0, 60, 80), 22, 1.3); warm.position.set(0, 5, 0); if (warm.intensity) { g.add(warm); S.lights.push(warm); }
  const vd = veinDecal(8, 8, 211, '255,110,40', .9); vd.rotation.x = -Math.PI / 2; vd.position.set(-2, .03, 0); g.add(vd);
  npc('scribe', SPOTS.scribe, { suit: 0x3a1c14, accent: 0xff9a40, skin: 2, hair: 0x1a1210 }, 0x4a2418);
}
function npc(id, spot, look, robe) {
  const c = C(), w = buildWalker({ ...look, lite: c.MOBILE }); w.position.set(spot.x, Y, spot.z); w.rotation.y = Math.atan2(-(spot.face.x - spot.x), -(spot.face.z - spot.z)); S.root.add(w);
  const rm = new THREE.MeshStandardMaterial({ color: robe, roughness: .85 }); const r = new THREE.Mesh(new THREE.CylinderGeometry(.24, .5, 1.05, 12, 1, true), rm); r.position.y = .52; w.add(r);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * .62), rm); hood.position.y = 1.62; hood.scale.set(1.1, 1.15, 1.2); w.add(hood);
  const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex('!', '#ffb040'), transparent: true, depthWrite: false, toneMapped: false })); mk.scale.setScalar(.75); mk.position.set(spot.x, Y + 2.55, spot.z); S.root.add(mk);
  S.npcs.push({ id, g: w, mk, spot }); collider(spot.x, spot.z, .55, 2);
}
function particles() {
  const mk = (n, col, size, op) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const m = new THREE.PointsMaterial({ color: col, size, map: glowTex(), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true }); const p = new THREE.Points(g, m); p.frustumCulled = false; S.root.add(p); return p; };
  S.ember = mk(tierN(50, 110, 180), 0xff8a3a, .16, .9); S.ember.userData.v = new Float32Array(S.ember.geometry.attributes.position.count * 4);
  const pa = S.ember.geometry.attributes.position.array, v = S.ember.userData.v; for (let i = 0; i < pa.length / 3; i++) resetEmber(pa, v, i, true);
  if (tierN(0, 1, 1)) { S.drips = mk(tierN(0, 18, 30), 0xbfe0ff, .07, .8); const d = S.drips.geometry.attributes.position.array; S.drips.userData.v = new Float32Array(d.length / 3); for (let i = 0; i < d.length / 3; i++) resetDrip(d, i, true); }
  if (tierN(0, 0, 1)) { S.dust = mk(160, 0xffe0c0, .05, .35); const d = S.dust.geometry.attributes.position.array; for (let i = 0; i < d.length / 3; i++) { const a = Math.random() * 6.28, r = Math.random() * 20; d[i * 3] = Math.cos(a) * r; d[i * 3 + 1] = Math.random() * 14; d[i * 3 + 2] = Math.sin(a) * r; } }
}
function resetEmber(p, v, i, init) {
  const gate = i % 3 === 0; const a = Math.random() * 6.28, r = Math.random() * (gate ? 3.5 : .9);
  if (gate) { p[i * 3] = L.NORTH.x + Math.cos(a) * r; p[i * 3 + 1] = Y + 1.4 + (init ? Math.random() * 10 : 0); p[i * 3 + 2] = L.NORTH.z - 9.4 + Math.sin(a) * .8; }
  else { p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = (S.brazierTop || 3) - .2 + (init ? Math.random() * 9 : 0); p[i * 3 + 2] = Math.sin(a) * r; }
  v[i * 4] = (Math.random() - .5) * .5; v[i * 4 + 1] = .9 + Math.random() * 1.4; v[i * 4 + 2] = (Math.random() - .5) * .5; v[i * 4 + 3] = gate ? 12 : 11;
}
function resetDrip(p, i, init) { const hall = i % 4, t = 24 + Math.random() * 20, s = (Math.random() - .5) * 5; const [x, z] = hall === 0 ? [s, t] : hall === 1 ? [s, -t] : hall === 2 ? [t, s] : [-t, s]; p[i * 3] = x; p[i * 3 + 1] = init ? Y + Math.random() * 6 : Y + L.HALL_APEX - .6; p[i * 3 + 2] = z; }

// ---------------------------------------------------------------- the Ledger of Deeds (board texture + panel)
function readDeeds() {
  let st = null; try { st = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { st = null; }
  let raw = null; try { raw = localStorage.getItem('egSave'); } catch { raw = null; }   // READ ONLY: Eternal Grind's save is never written here
  const b = board(st, raw); try { localStorage.setItem(STORE_KEY, JSON.stringify(b.state)); } catch { } return b;
}
function drawBoardTex(x, w, h) {
  x.fillStyle = '#5a3a22'; x.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(30,16,8,${Math.random() * .25})`; x.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3); }
  x.fillStyle = '#e9dcc0'; x.fillRect(300, 26, 424, 96); x.fillStyle = '#3a2010'; x.font = '700 50px Georgia,serif'; x.textAlign = 'center'; x.fillText('LEDGER OF DEEDS', w / 2, 90);
  let b = null; try { b = readDeeds(); } catch { }
  const notes = b ? [...b.daily.map(r => ['DAILY', r]), ...b.weekly.map(r => ['WEEKLY', r])] : [];
  for (let i = 0; i < 6; i++) { const cx = 40 + (i % 3) * 325, cy = 150 + Math.floor(i / 3) * 235, rot = (Math.random() - .5) * .06; x.save(); x.translate(cx + 150, cy + 105); x.rotate(rot);
    x.fillStyle = i < 3 ? '#efe4c8' : '#e2d2ae'; x.fillRect(-145, -100, 290, 200); x.fillStyle = '#a02810'; x.beginPath(); x.arc(0, -88, 9, 0, 7); x.fill();
    const n = notes[i]; x.textAlign = 'center'; x.fillStyle = '#7a2a10'; x.font = '700 20px Georgia,serif'; x.fillText(n ? n[0] : (i < 3 ? 'DAILY' : 'WEEKLY'), 0, -52);
    x.fillStyle = '#2a1a10'; x.font = '22px Georgia,serif'; const words = (n ? n[1].text : 'Create a hero in the Eternal Grind').split(' '); let line = '', y = -18; for (const wd of words) { if (x.measureText(line + wd).width > 250) { x.fillText(line, 0, y); line = ''; y += 28; } line += wd + ' '; } x.fillText(line, 0, y);
    if (n && n[1].done) { x.strokeStyle = '#a02810'; x.lineWidth = 5; x.strokeRect(-70, 56, 140, 34); x.fillStyle = '#a02810'; x.font = '700 22px Georgia,serif'; x.fillText('DONE', 0, 81); } else if (n) { x.fillStyle = '#5a4030'; x.font = '18px Georgia,serif'; x.fillText(`${Math.round(n[1].got)} / ${n[1].n}`, 0, 82); }
    x.restore(); }
}
const pcss = `#bcUgPanel{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:3000;width:min(420px,94vw);max-height:62vh;overflow:auto;background:#120d0bf4;border:1px solid #c89a6a88;border-radius:16px;box-shadow:0 10px 40px #000a;color:#f1e6d4;font:14px/1.4 system-ui,sans-serif;padding:14px 14px 12px}
#bcUgPanel h3{margin:0 0 2px;font:700 18px Georgia,serif;letter-spacing:.06em;color:#ffe2bf}#bcUgPanel .sub{color:#9fd0ff;font-size:12px;letter-spacing:.06em;margin-bottom:8px}
#bcUgPanel p{margin:6px 0 10px}#bcUgPanel .q{display:flex;align-items:center;gap:8px;margin:6px 0}#bcUgPanel .q .tx{flex:1}#bcUgPanel .q .pg{font-size:12px;color:#d8c8b0;min-width:64px;text-align:right}
#bcUgPanel .q.done .tx{color:#ffcf8a}#bcUgPanel .bar{height:4px;background:#ffffff18;border-radius:3px;overflow:hidden;margin-top:3px}#bcUgPanel .bar b{display:block;height:100%;background:linear-gradient(90deg,#ff5a1a,#ffd28a)}
#bcUgPanel .h{font:700 11px system-ui;letter-spacing:.14em;color:#c89a6a;margin:10px 0 2px;text-transform:uppercase}#bcUgPanel .note{font-size:11px;color:#a89a88;margin-top:8px}
#bcUgPanel .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}#bcUgPanel button{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #ffb45b88;background:#2a2118;color:#fff3e3;font:700 13px system-ui;cursor:pointer}#bcUgPanel button.p{background:#ffb45b;color:#241508;border-color:#ffe0b4}`;
function panel(html, buttons) {
  closePanel(); if (!document.getElementById('bcUgPanelCss')) { const st = document.createElement('style'); st.id = 'bcUgPanelCss'; st.textContent = pcss; document.head.append(st); }
  const el = document.createElement('div'); el.id = 'bcUgPanel'; el.setAttribute('role', 'dialog'); el.innerHTML = html; const row = document.createElement('div'); row.className = 'row';
  for (const b of buttons) { const bt = document.createElement('button'); bt.type = 'button'; if (b.primary) bt.className = 'p'; bt.textContent = b.label; bt.addEventListener('click', e => { e.stopPropagation(); b.run(); }); row.append(bt); }
  el.append(row); el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
  document.body.append(el); S.panel = el; S.api.setModal('panel'); const f = el.querySelector('button.p') || el.querySelector('button'); if (f) f.focus();
}
function closePanel() { if (S.panel) { S.panel.remove(); S.panel = null; if (S.api && S.api.modal === 'panel') S.api.setModal(null); } }
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function showBoard(focus = 'all') {
  const b = readDeeds(); const row = r => `<div class="q${r.done ? ' done' : ''}"><div class="tx">${r.done ? '✔ ' : ''}${esc(r.text)}<div class="bar"><b style="width:${Math.round(r.got / r.n * 100)}%"></b></div></div><div class="pg">${r.done ? 'Done' : `${Math.round(r.got)} / ${r.n}`}</div></div>`;
  const who = b.hasChar ? `Tracking <b>${esc(b.name || 'your hero')}</b>` : 'No Eternal Grind hero on this device yet: descend and create one to start tracking.';
  panel(`<h3>Ledger of Deeds</h3><div class="sub">${who}</div>${focus !== 'weekly' ? `<div class="h">Daily · resets 00:00 UTC</div>${b.daily.map(row).join('')}` : ''}${focus !== 'daily' ? `<div class="h">Weekly · resets Monday UTC</div>${b.weekly.map(row).join('')}` : ''}<div class="note">Tracked on this device only, from your Eternal Grind progress. Deeds are bragging rights: no items, gold or rewards are given.</div>`,
    [{ label: 'Descend', primary: true, run: () => { closePanel(); S.api.launch('gate'); } }, { label: 'Close', run: closePanel }]);
  if (S.boardTex) { drawBoardTex(S.boardTex.image.getContext('2d'), S.boardTex.image.width, S.boardTex.image.height); S.boardTex.needsUpdate = true; }
}
const TALK = {
  warden: { name: 'Warden Ossia', sub: 'Keeper of the Ledger', lines: ['Traveler. The Ledger of Deeds changes with every dawn, and again each week.', 'Read it, then go down through the Descent Gate and make the deep remember your name.'], btn: [['Read the Ledger', () => showBoard('daily')]] },
  scribe: { name: 'Cinder-Scribe Varro', sub: 'Chronicler of the Ossuary', lines: ['The pale builders cut these halls long before the city burned above them. Their lumen stones still answer to the dark.', 'The Ember Stair behind me is the old servants’ way into the Grind: same depths, quieter door. I keep the weekly deeds, they take patience.'], btn: [['Weekly deeds', () => showBoard('weekly')], ['Take the Ember Stair', () => { closePanel(); S.api.launch('side'); }]] },
};
function talk(id) {
  const t = TALK[id]; try { const k = 'bcUgTalked'; const o = JSON.parse(localStorage.getItem(k) || '{}'); o[id] = new Date().toISOString().slice(0, 10); localStorage.setItem(k, JSON.stringify(o)); } catch { }
  markers();
  panel(`<h3>${esc(t.name)}</h3><div class="sub">${esc(t.sub)}</div>${t.lines.map(l => `<p>${esc(l)}</p>`).join('')}`, [...t.btn.map(([label, run], i) => ({ label, primary: i === 0, run })), { label: 'Farewell', run: closePanel }]);
}
function markers() {   // gold "!" until you've talked today, then a dim "?"
  let o = {}; try { o = JSON.parse(localStorage.getItem('bcUgTalked') || '{}'); } catch { } const today = new Date().toISOString().slice(0, 10);
  for (const n of S.npcs) { const seen = o[n.id] === today; if (n.mk.userData.seen === seen) continue; n.mk.userData.seen = seen; const old = n.mk.material.map; n.mk.material.map = markerTex(seen ? '?' : '!', seen ? '#9fb8d0' : '#ffb040'); n.mk.material.needsUpdate = true; if (old) old.dispose(); }
}
export function interactables() {
  return [
    { id: 'stair', x: 0, z: 48.4, r: 3.4, y: Y + 2.4, kicker: 'Stair', title: 'Up to Burn City', actions: [{ label: 'Climb', icon: '⬆', primary: true, run: () => S.api.exit() }] },
    { id: 'gate', x: 0, z: L.NORTH.z - 6.5, r: 4.8, y: Y + 3.2, kicker: 'Descent Gate', title: 'The Eternal Grind', actions: [{ label: 'Descend', icon: '🔥', primary: true, run: () => S.api.launch('gate') }, { label: 'Deeds', run: () => showBoard() }] },
    { id: 'side', x: L.WEST.x - 8.2, z: 0, r: 3.6, y: Y + 2.6, kicker: 'Ember Stair', title: 'Eternal Grind · side way', actions: [{ label: 'Descend', icon: '🔥', primary: true, run: () => S.api.launch('side') }] },
    { id: 'board', x: L.EAST.x, z: -L.EAST.hd + 2.4, r: 3.4, y: Y + 1.4, kicker: 'Quest board', title: 'Ledger of Deeds', actions: [{ label: 'Read', icon: '📜', primary: true, run: () => showBoard() }] },
    { id: 'warden', x: SPOTS.warden.x, z: SPOTS.warden.z, r: 3, y: Y + 2.1, kicker: '!', title: 'Warden Ossia', actions: [{ label: 'Talk', primary: true, run: () => talk('warden') }] },
    { id: 'scribe', x: SPOTS.scribe.x, z: SPOTS.scribe.z, r: 3, y: Y + 2.1, kicker: '!', title: 'Cinder-Scribe Varro', actions: [{ label: 'Talk', primary: true, run: () => talk('scribe') }] },
  ];
}

// ---------------------------------------------------------------- ambient audio (procedural, only when City sound is on)
function audioOn() {
  const a = C().audio && C().audio(); if (!a || !a.on || !a.AC || !a.master || S.audio) return; const AC = a.AC;
  const len = AC.sampleRate * 3, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.2; }
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true; const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; const g = AC.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(.09, AC.currentTime + 1.5);
  src.connect(lp).connect(g).connect(a.master); src.start();
  const crack = AC.createGain(); crack.gain.value = 0; crack.connect(a.master);
  S.audio = { AC, src, g, crack, master: a.master, nextDrip: AC.currentTime + 2, nextCrack: 0, buf };
}
function audioFrame(lx, lz) {
  const A = S.audio; if (!A) return audioOn(); const t = A.AC.currentTime, dB = Math.hypot(lx, lz);
  if (t > A.nextDrip) { A.nextDrip = t + 2.2 + Math.random() * 4.5; const o = A.AC.createOscillator(), g = A.AC.createGain(), f = 900 + Math.random() * 900; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .45, t + .12); g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.0005, t + .25); o.connect(g).connect(A.master); o.start(t); o.stop(t + .3); }
  if (dB < 26 && t > A.nextCrack) { A.nextCrack = t + .04 + Math.random() * .22; const s = A.AC.createBufferSource(); s.buffer = A.buf; const bp = A.AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 2400; bp.Q.value = 3; const g = A.AC.createGain(), v = .12 * (1 - dB / 26) * Math.random();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0005, t + .05); s.connect(bp).connect(g).connect(A.master); s.start(t, Math.random() * 2, .06); }
}
function audioOff() { const A = S.audio; if (!A) return; S.audio = null; try { A.g.gain.cancelScheduledValues(A.AC.currentTime); A.g.gain.linearRampToValueAtTime(0, A.AC.currentTime + .3); setTimeout(() => { try { A.src.stop(); A.src.disconnect(); A.g.disconnect(); A.crack.disconnect(); } catch (e) { } }, 400); } catch (e) { } }
export function sfxGate() { try { const c = C(); c.sfx && c.sfx.whoosh && c.sfx.whoosh(); } catch (e) { } }

// ---------------------------------------------------------------- lifecycle
export async function load(progress, api) {
  if (S.loaded) return; if (S.loading) return S.loading; S.api = api;
  S.loading = (async () => { try { await build(progress); } catch (e) { try { unload(); } catch (e2) { } throw e; } })();
  try { await S.loading; } finally { S.loading = null; }
}
export function enter() { const c = C(); S.root.visible = true; c.colliders.push(...S.colliders); S.active = true; markers(); }
export function leave() {
  const c = C(); S.active = false; if (S.root) S.root.visible = false; closePanel(); audioOff();
  for (const o of S.colliders) { const i = c.colliders.indexOf(o); if (i >= 0) c.colliders.splice(i, 1); }
}
function disposeTree(o) { const seen = new Set(); o.traverse(m => { if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
  for (const mt of [].concat(m.material || [])) { if (seen.has(mt)) continue; seen.add(mt); for (const k of ['map', 'normalMap', 'emissiveMap', 'roughnessMap']) if (mt[k] && mt[k] !== glowTex() && !seen.has(mt[k])) { seen.add(mt[k]); mt[k].dispose(); } mt.dispose(); }
  if (m.isInstancedMesh && m.dispose) m.dispose(); }); }
export function unload() {
  if (S.active) leave(); closePanel(); audioOff();
  if (S.root) { S.root.removeFromParent(); disposeTree(S.root); }
  for (const t of S.tex) t.dispose(); S.tex = []; for (const k in M) { try { M[k].dispose(); } catch (e) { } delete M[k]; }
  const st = document.getElementById('bcUgPanelCss'); if (st) st.remove();
  S.root = null; S.colliders = []; S.flames = []; S.portals = []; S.veinMats = []; S.lights = []; S.npcs = []; S.ember = S.drips = S.dust = null; S.loaded = false; S.unloads = (S.unloads || 0) + 1;
}
const FOG = new THREE.Color(0x140e0b);
export function frame(dt, t, lx, lz) {
  if (!S.active) return; const c = C();
  // atmosphere (runs after the City's own per-frame sky/fog so it wins): warm dark fog, thinner on low graphics
  if (c.S.fog) { c.S.fog.color.copy(FOG); c.S.fog.density = tierN(.016, .024, .028); }
  if (c.R) c.R.toneMappingExposure = 1.0; if (c.bloom) { const k = Math.max(0, Math.min(1, (-lz - 40) / 14)); c.bloom.strength = tierN(.55, .75, .85) * (1 - .5 * k); }   // the Gate chamber would flood the screen with bloom
  flicker(t, S.flames); for (const p of S.portals) p.uniforms.t.value = t;
  const pulse = .7 + .3 * Math.sin(t * 1.1) + .08 * Math.sin(t * 5.3); for (const m of S.veinMats) m.opacity = m.userData.base * pulse;
  if (S.brazierLight) S.brazierLight.intensity = tierN(70, 90, 110) * (1 + Math.sin(t * 13) * .05 + Math.sin(t * 29) * .04);
  if (S.gateLight) S.gateLight.intensity = tierN(22, 28, 34) * (1 + Math.sin(t * 3) * .12);
  // particles
  if (S.ember) { const p = S.ember.geometry.attributes.position.array, v = S.ember.userData.v; for (let i = 0; i < p.length / 3; i++) { p[i * 3] += (v[i * 4] + Math.sin(t * 2 + i) * .2) * dt; p[i * 3 + 1] += v[i * 4 + 1] * dt; p[i * 3 + 2] += v[i * 4 + 2] * dt; if (p[i * 3 + 1] > v[i * 4 + 3] + (i % 3 === 0 ? Y + 3 : 0)) resetEmber(p, v, i, false); } S.ember.geometry.attributes.position.needsUpdate = true; }
  if (S.drips) { const p = S.drips.geometry.attributes.position.array, v = S.drips.userData.v; for (let i = 0; i < p.length / 3; i++) { v[i] += 9.8 * dt; p[i * 3 + 1] -= v[i] * dt; if (p[i * 3 + 1] < Y) { v[i] = 0; resetDrip(p, i, false); } } S.drips.geometry.attributes.position.needsUpdate = true; }
  if (S.dust) S.dust.rotation.y = t * .01;
  // NPCs idle + markers bob
  for (const n of S.npcs) { poseWalker(n.g, t * 1.2, 0, t); n.mk.position.y = Y + 2.55 + Math.sin(t * 2 + n.spot.x) * .08; }
  audioFrame(lx, lz);
}
