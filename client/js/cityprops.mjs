// Burn City street props from CC BY 4.0 Sketchfab models (credits: city-credits.html, build: scripts/city-props/):
// sliding shop doors that open when someone walks up, vending machines, arcade cabinets, pigeons that flutter off
// when a player gets close, ducks paddling on the lake and a fisherman's boat moored at the fishing dock.
// Phone-first: every prop is an InstancedMesh (one draw call per material, untextured materials are baked into
// one vertex-colour material), small textures, distance culling, fewer birds on phones. Disable with ?props=0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { propBudget, layoutShops, doorStep, pigeonHomes, pigeonStep, flyPos, duckPos, hash } from './cityprops-core.mjs';

const Q = new URLSearchParams(location.search);
const ASSETS = new URL('../assets/props/', import.meta.url);
const P = window.__cityProps = { ready: false, stats: null, error: null };
const PIGEON_YAW = Math.PI, DUCK_YAW = 0;   // model forward vs +z

const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75, metalness: .05 });
// one part (node) of a prop glTF -> [{geo, mat}] with untextured opaque materials merged into vertex colours
function bake(root, tint) {
  root.updateMatrixWorld(true);
  const flat = [], byMat = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    let m = o.material; const glass = /glass/i.test(m.name);
    if (tint && !glass) { m = m.clone(); m.map = null; m.color.set(tint); }
    if (!m.map && !glass && !m.emissiveMap) {
      const n = g.attributes.position.count, col = new Float32Array(n * 3), c = m.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', g.attributes.position); out.setAttribute('normal', g.attributes.normal); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      flat.push(out); return;
    }
    if (!glass && m.transparent && m.opacity >= 1) { m.transparent = false; m.alphaTest = .5; }
    // glass: plain alpha blend. A physical/transmission material would make three.js re-render the whole city
    // into a transmission buffer every frame, so it is swapped for a cheap single-sided standard material.
    if (glass) m = new THREE.MeshStandardMaterial({ color: m.color, map: m.map || null, transparent: true, opacity: Math.min(m.opacity, .4), depthWrite: false, roughness: .1, metalness: 0 });
    else if (m.isMeshPhysicalMaterial) m = new THREE.MeshStandardMaterial({ color: m.color, map: m.map, emissive: m.emissive, emissiveMap: m.emissiveMap, roughness: m.roughness, metalness: m.metalness, alphaTest: m.alphaTest });
    if (glass) m.side = THREE.FrontSide;
    const keep = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) if (g.attributes[k]) keep.setAttribute(k, g.attributes[k]);
    (byMat.get(m) || byMat.set(m, []).get(m)).push(keep);
  });
  const out = [];
  if (flat.length) out.push({ geo: mergeGeometries(flat), mat: VC });
  for (const [mat, gs] of byMat) out.push({ geo: mergeGeometries(gs), mat });
  return out.filter(o => o.geo);
}
function kit(root, cap, name, grp, tint) {
  const meshes = bake(root, tint).map(({ geo, mat }) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, cap)); im.count = 0; im.visible = false; im.name = 'prop-' + name; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); grp.add(im); return im; });
  let n = 0, far = false;
  return {
    meshes, get count() { return n; },
    set(i, m) { for (const im of meshes) im.setMatrixAt(i, m); },
    commit(count) { n = count; for (const im of meshes) { im.count = count; im.instanceMatrix.needsUpdate = true; if (count) im.computeBoundingSphere(); im.visible = count > 0 && !far; } },
    cull(cam, dist) { const s = meshes[0] && meshes[0].boundingSphere; if (!s || !n) return; const f = cam.distanceTo(s.center) - s.radius > dist; if (f !== far) { far = f; for (const im of meshes) im.visible = !far && n > 0; } },
  };
}

const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const place = (x, y, z, yaw, sx = 1, sy = sx, sz = sx, roll = 0, pitch = 0) => m4.compose(v3.set(x, y, z), q.setFromEuler(e3.set(pitch, yaw, roll, 'YXZ')), s3.set(sx, sy, sz));

async function init() {
  const c = window.__city, L = window.__cityLife, B = propBudget(c.TIER, c.MOBILE);
  const gl = new GLTFLoader(), load = id => gl.loadAsync(new URL(id + '.gltf', ASSETS).href);
  const meta = id => fetch(new URL(id + '.json', ASSETS)).then(r => r.json());
  const [door, doorMeta, vend, arc, pig, duck, boat] = await Promise.all([load('sliding-door'), meta('sliding-door'), load('vending'), load('arcade'), load('pigeon'), load('duck'), load('fisher-boat')]);
  const grp = new THREE.Group(); grp.name = 'city-props'; c.S.add(grp);
  const part = (g, n) => g.scene.getObjectByName(n) || g.scene;
  const shops = L.shops || [], lay = layoutShops(shops);

  // --- sliding doors (frame + two panels that slide apart)
  const AL = 0xb9c2cc;   // brushed-aluminium frames so the doors read against the dark shop glass
  const DF = kit(part(door, 'frame'), lay.doors.length, 'door', grp, AL), DA = kit(part(door, 'panelA'), lay.doors.length, 'door', grp, AL), DB = kit(part(door, 'panelB'), lay.doors.length, 'door', grp, AL);
  const SA = new THREE.Vector3(...doorMeta.slide.A), SB = new THREE.Vector3(...doorMeta.slide.B);
  const doorM = lay.doors.map(d => place(d.x, 0, d.z, d.yaw, .55, 1.1, 1).clone());
  const drawDoors = () => { lay.doors.forEach((d, i) => { DF.set(i, doorM[i]); DA.set(i, m5.copy(doorM[i]).multiply(m4.makeTranslation(SA.x * d.open, SA.y * d.open, SA.z * d.open))); DB.set(i, m5.copy(doorM[i]).multiply(m4.makeTranslation(SB.x * d.open, SB.y * d.open, SB.z * d.open))); }); for (const k of [DF, DA, DB]) k.commit(lay.doors.length); };
  drawDoors();
  // --- vending machines + arcade cabinets (static)
  const VM = kit(part(vend, 'body'), lay.vending.length, 'vending', grp); lay.vending.forEach((p, i) => VM.set(i, place(p.x, 0, p.z, p.yaw))); VM.commit(lay.vending.length);
  const AM = kit(part(arc, 'body'), lay.arcade.length, 'arcade', grp); lay.arcade.forEach((p, i) => AM.set(i, place(p.x, 0, p.z, p.yaw))); AM.commit(lay.arcade.length);
  for (const p of [...lay.vending, ...lay.arcade]) c.colliders.push({ x: p.x, z: p.z, r: .5, h: 2 });

  // --- pigeons: perched copies + two wing poses for the ones flying off
  const spawn = L.spawn || { x: 0, z: 52 };
  const plaza = [0, 1, 2].map(k => { const a = Math.atan2(spawn.z, spawn.x) + (k - 1) * .32; return { x: Math.cos(a) * 42, z: Math.sin(a) * 42 }; });
  const gy = (x, z) => { try { const y = c.groundAt ? c.groundAt(x, z, 0) : 0; return Number.isFinite(y) && y > -1 && y < .6 ? y : 0; } catch { return 0; } };
  const birds = pigeonHomes(shops, B, plaza).map((h, i) => ({ ...h, y: gy(h.x, h.z), state: 'perch', t: hash(i, 9) * 5, ph: hash(i, 7) * 6, flock: -1 }));
  birds.forEach((b, i) => { b.flock = birds.findIndex(o => Math.hypot(o.x - b.x, o.z - b.z) < 4); b.dir = null; });
  const PP = kit(part(pig, 'perch'), birds.length, 'pigeon', grp), PU = kit(part(pig, 'flapUp'), birds.length, 'pigeon', grp), PD = kit(part(pig, 'flapDown'), birds.length, 'pigeon', grp);

  // --- lake: ducks + the moored fisherman's boat (waits for the fishing dock to exist)
  let ducks = [], DK = null, BT = null, boatAt = null;
  const lake = () => {
    const e = window.__estate, f = window.__fishWorld; if (!e || !e.inLake || !f || !f.dock) return false;
    const { base, dir, side } = f.dock, yaw = Math.atan2(dir.x, dir.z);
    const water = (x, z, r) => [0, 1, 2, 3, 4, 5].every(k => e.inLake(x + Math.cos(k) * r, z + Math.sin(k) * r));
    for (const s of [1, -1]) { const p = base.clone().addScaledVector(dir, 12).addScaledVector(side, 4.2 * s); if (water(p.x, p.z, 2.4)) { boatAt = { x: p.x, z: p.z, yaw }; break; } }
    BT = kit(part(boat, 'body'), 1, 'boat', grp);
    for (let i = 0, k = 0; i < 40 && ducks.length < B.ducks; i++) {
      const p = base.clone().addScaledVector(dir, 26 + hash(i, 1) * 26).addScaledVector(side, (hash(i, 2) - .5) * 34), r = 1.5 + hash(i, 3) * 2.5;
      if (!water(p.x, p.z, r + 1) || ducks.some(d => Math.hypot(d.x - p.x, d.z - p.z) < 3)) continue;
      ducks.push({ x: p.x, z: p.z, r, w: (hash(i, 4) > .5 ? 1 : -1) * (.12 + hash(i, 5) * .1), ph: hash(i, 6) * 6.283 }); k++;
    }
    DK = kit(part(duck, 'body'), ducks.length, 'duck', grp); return true;
  };
  let lakeTry = 0;

  const WATER = .22;   // lake surface height (estate.js)
  const cam = c.C, pp = new THREE.Vector3(); let last = performance.now(), T = 0;
  // nearest person to a door: the player, or a Main Street shopper (who has to be right at the door, +2 m)
  const nearestTo = (x, z) => {
    let d = Infinity; const pos = c.P && c.P.pos; if (pos) d = Math.hypot(pos.x - x, pos.z - z);
    const sm = L.shopperMesh; if (sm) { const a = sm.instanceMatrix.array; for (let i = 0; i < sm.count; i++) { const o = i * 16; if (a[o] * a[o] + a[o + 1] * a[o + 1] + a[o + 2] * a[o + 2] < 1e-6) continue; const e = Math.hypot(a[o + 12] - x, a[o + 14] - z) + 2; if (e < d) d = e; } }
    return d;
  };
  function tick() {
    requestAnimationFrame(tick); if (window.__cityPaused) return;
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now; T += dt;
    cam.getWorldPosition(pp);
    // doors
    let moved = false;
    for (const d of lay.doors) { const o = doorStep(d.open, nearestTo(d.x, d.z), dt); if (o !== d.open) { d.open = o; moved = true; } }
    if (moved) drawDoors();
    for (const k of [DF, DA, DB, VM, AM]) k.cull(pp, B.cullShops);
    // pigeons
    const ppos = c.P && c.P.pos; let np = 0, nu = 0, nd = 0; const spooked = new Set();
    for (const b of birds) { const dn = ppos ? Math.hypot(ppos.x - b.x, ppos.z - b.z) : Infinity; if (pigeonStep(b, dt, dn, spooked.has(b.flock)) === 'spooked') { spooked.add(b.flock); if (ppos) b.dir = Math.atan2(b.x - ppos.x, b.z - ppos.z) + (hash(b.ph, 1) - .5); } }
    for (const b of birds) if (b.state === 'perch' && spooked.has(b.flock)) { pigeonStep(b, 0, Infinity, true); b.dir = b.yaw; }
    for (const b of birds) {
      if (b.state === 'perch') { const peck = Math.max(0, Math.sin(T * 3 + b.ph * 5)) ** 8 * .5; PP.set(np++, place(b.x, b.y, b.z, b.yaw + PIGEON_YAW + Math.sin(T * .4 + b.ph) * .6, 1, 1, 1, 0, peck)); }
      else if (b.state === 'fly') { const p = flyPos(b), k = ((T + b.ph) * 14 | 0) & 1; (k ? PU : PD).set(k ? nu++ : nd++, place(p.x, b.y + p.y, p.z, b.dir + PIGEON_YAW)); }
    }
    PP.commit(np); PU.commit(nu); PD.commit(nd);
    for (const k of [PP, PU, PD]) k.cull(pp, B.cullBirds);
    // lake
    if (!DK && lakeTry < 120 && (T > lakeTry * .5)) { lakeTry++; try { lake(); } catch (e) { lakeTry = 999; console.warn('props: lake', e); } }
    if (DK) { ducks.forEach((d, i) => { const p = duckPos(d, T); DK.set(i, place(p.x, WATER - .08 + p.bob, p.z, p.yaw + DUCK_YAW, 1.4)); }); DK.commit(ducks.length); DK.cull(pp, B.cullLake); }
    if (BT && boatAt) { BT.set(0, place(boatAt.x, WATER - .1 + Math.sin(T * 1.1) * .03, boatAt.z, boatAt.yaw + Math.sin(T * .3) * .04, 1, 1, 1, Math.sin(T * 1.3) * .025)); BT.commit(1); BT.cull(pp, B.cullLake); }
    P.stats = { doors: lay.doors.length, open: lay.doors.filter(d => d.open > .5).length, vending: lay.vending.length, arcade: lay.arcade.length, pigeons: birds.length, perched: np, flying: nu + nd, ducks: ducks.length, boat: !!boatAt, budget: B };
  }
  P.birds = birds; P.doors = lay.doors; P.ducks = () => ducks; P.boat = () => boatAt; P.group = grp; P.ready = true; tick();
}

if (Q.get('props') !== '0') (function wait(n = 0) {
  const c = window.__city, L = window.__cityLife;
  if (c && c.S && c.C && L && L.ready) init().catch(e => { console.warn('city props disabled', e); P.error = String(e); });
  else if (n < 240) setTimeout(() => wait(n + 1), 500);
})();
