// CC BY sci-fi street buildings around the district towers (brief: docs/burn-city-street-building-models.md, layout: citybuildings2-core.mjs).
// Each assigned token district swaps its ordinary filler lots, plus the shared infill blocks that clearly sit just outside it (never holder
// buildings, shops, Estates or anything with a door), from the procedural facade to its own model by Scarecrow_original (CC BY 4.0, see city-credits.html). Lot position, footprint, height and
// collision are reused, the front faces the nearest street, and each copy gets a subtle tint so the repeats don't read as clones.
// Cost: one small glTF per assigned district (two LODs sharing one 512px material), loaded after the City is up; two InstancedMeshes
// per model (near / far LOD) re-partitioned a few times a second. A district whose model fails to load keeps its procedural lots.
// Kill switch: ?buildings2=0. Preview the four unassigned models: ?b2next=TOKEN,TOKEN,...
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assignment, pickLots, budget, hash, infillOwner } from './citybuildings2-core.mjs';
import { PAD } from './city-space-core.mjs';

const Q = new URLSearchParams(location.search);
const ASSETS = new URL('../assets/buildings/', import.meta.url);
const B2 = window.__buildings2 = { ready: false, error: null, stats: null, failed: [] };

async function loadModel(id, low) {
  const g = await new GLTFLoader().loadAsync(new URL('scifi-' + id + '.gltf', ASSETS).href);
  let lod0 = null, lod1 = null; g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); if (/lod1/i.test(o.name)) lod1 = { geo, mat: o.material }; else if (!lod0) lod0 = { geo, mat: o.material }; });
  if (!lod0) throw new Error('no mesh in ' + id);
  // The source is fully metallic (metalness 1), which renders near-black under the City's sky light (no env map), and its normal map
  // turns into NaN on degenerate UV islands (per-pixel tangent frames), which the bloom pass spreads over the whole frame. So: no normal
  // map, a semi-metal finish, the baked AO kept for depth on desktop, the window emission kept everywhere.
  const mat = lod0.mat; mat.side = THREE.FrontSide; mat.normalMap = null; mat.metalnessMap = null; mat.metalness = .25; mat.roughness = .6;
  if (low) { mat.roughnessMap = null; mat.aoMap = null; }
  mat.needsUpdate = true;
  // centre on the footprint, ground at y=0 (the build already did this; repeat in case of float drift)
  const bb = new THREE.Box3().setFromBufferAttribute(lod0.geo.attributes.position), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  for (const p of [lod0, lod1]) if (p) p.geo.translate(-cx, -bb.min.y, -cz);
  const pos = lod0.geo.attributes.position; let rXZ = 0; for (let i = 0; i < pos.count; i++) rXZ = Math.max(rXZ, Math.hypot(pos.getX(i), pos.getZ(i)));
  const tris = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  return { id, lod0: lod0.geo, lod1: (lod1 || lod0).geo, mat, dims: { rXZ, H: bb.max.y - bb.min.y }, tris: [tris(lod0.geo), tris((lod1 || lod0).geo)] };
}

async function init() {
  const c = window.__city, sats = window.__sats || [], hide = window.__satHide;
  const low = c.TIER === 'low', B = budget(c.TIER, c.MOBILE);
  const names = [...new Set([...sats.filter(s => s.n && !s.infill).map(s => s.n.name), ...(window.__districtR ? window.__districtR().map(d => d[0]) : [])])].filter(n => n !== 'XRP');
  const map = assignment(names, Q.get('b2next'));
  const ids = [...new Set(Object.values(map))];
  const models = {};
  await Promise.all(ids.map(id => loadModel(id, low).then(m => { models[id] = m; }).catch(e => { B2.failed.push(id); console.warn('buildings2: ' + id + ' failed, district stays procedural', e); })));
  // keep clear of the CB1 pad and the Ember Bar's front (wait briefly for the bar to pick its lot)
  for (let i = 0; i < 30 && window.__emberBarBuilding && !window.__emberBarBuilding.ready && !window.__emberBarBuilding.error && Q.get('emberbar') !== '0'; i++) await new Promise(r => setTimeout(r, 500));
  const avoid = [{ x: PAD.x, z: PAD.z, r: PAD.r + 6 }];
  const EB = window.__emberBarBuilding; if (EB && EB.lot) avoid.push({ x: EB.lot.x, z: EB.lot.z, r: 14 });
  const hubs = (window.__districtR ? window.__districtR() : []).map(([name, R]) => { const n = c.N[name]; return n && n.pos ? { name, x: n.pos.x, z: n.pos.z, R } : null; }).filter(Boolean);
  const { lots, per, skipped } = pickLots(sats, map, id => models[id] && models[id].dims, c.streets, B, avoid, hubs.length ? (s => infillOwner(s.x, s.z, hubs)) : null);
  const grp = new THREE.Group(); grp.name = 'buildings2'; grp.userData.noBatch = 1; c.S.add(grp);
  const kits = {};
  for (const id of Object.keys(models)) {
    const m = models[id], mine = lots.filter(l => l.model === id); if (!mine.length) continue;
    const mk = geo => { const im = new THREE.InstancedMesh(geo, m.mat, mine.length); im.count = 0; im.userData.noBatch = 1; im.name = 'bldg2-' + id; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; grp.add(im); return im; };
    kits[id] = { lots: mine, near: mk(m.lod0), far: mk(m.lod1), mats: [], cols: [] };
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const l of mine) {
      mm.compose(v.set(l.x, 0, l.z), q.setFromAxisAngle(up, l.yaw), sc.set(l.k, l.sy, l.k)); kits[id].mats.push(mm.clone());
      const h = hash(l.x, l.z); col.setRGB(1, 1, 1).lerp(c.N[l.name].col || col.setRGB(1, 1, 1), .14).multiplyScalar(1.7 + h * .3); kits[id].cols.push(col.clone());
      hide(l.s, true);
      const cl = c.colliders.find(o => Math.abs(o.x - l.x) < 1e-6 && Math.abs(o.z - l.z) < 1e-6); if (cl) { l.colH = cl.h; cl.h = l.h; }
    }
  }
  let last = -1; const cam = new THREE.Vector3();
  function part() {
    c.C.getWorldPosition(cam);
    for (const k of Object.values(kits)) {
      let nn = 0, nf = 0;
      k.lots.forEach((l, i) => { const near = Math.hypot(cam.x - l.x, cam.z - l.z) < B.lod + l.h; const im = near ? k.near : k.far, j = near ? nn++ : nf++; im.setMatrixAt(j, k.mats[i]); im.setColorAt(j, k.cols[i]); });
      for (const [im, n] of [[k.near, nn], [k.far, nf]]) { im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
  }
  (function loop(t) { if (B2.disposed) return; if (t - last > 300) { last = t; try { part(); } catch (e) { console.warn('buildings2', e); } } requestAnimationFrame(loop); })(0);
  B2.group = grp; B2.lots = lots;
  B2.stats = () => { const o = { districts: per, skipped, models: {}, near: 0, far: 0, failed: B2.failed }; for (const [id, k] of Object.entries(kits)) { o.models[id] = { lots: k.lots.length, tris: models[id].tris, near: k.near.count, far: k.far.count }; o.near += k.near.count; o.far += k.far.count; } return o; };
  B2.disable = () => { B2.disposed = true; c.S.remove(grp); for (const l of lots) { hide(l.s, false); const cl = c.colliders.find(o => o.x === l.x && o.z === l.z); if (cl && l.colH != null) cl.h = l.colH; } };
  B2.ready = true;
}

if (Q.get('buildings2') !== '0') (function wait(n = 0) {
  const c = window.__city;
  if (c && c.S && c.C && window.__satHide && window.__sats) { const go = () => init().catch(e => { console.warn('buildings2 disabled', e); B2.error = String(e); }); (window.requestIdleCallback || setTimeout)(go, { timeout: 2500 }); }
  else if (n < 240) setTimeout(() => wait(n + 1), 500);
})();
