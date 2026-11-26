// Visual cladding for The Ashen Cosmodrome: Kenney Modular Space Kit (CC0) wall
// tiles, door frames, indoor ceilings, floor plates and lighting. Collision stays
// on the server grid. Low-graphics mode drops garnish and uses fewer instances.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { planCosmodromeArchitecture } from './cosmodrome-architecture-plan.mjs';

const loader = new GLTFLoader();
const ASSET = n => new URL(`./assets/cosmo/modular/kenney-ms-${n}.glb`, import.meta.url).href;
const CACHE = new Map();

function toBasic(src, hex) {
  const m = Array.isArray(src) ? src[0] : src;
  const n = new THREE.MeshBasicMaterial({
    map: m?.map || null,
    color: new THREE.Color(hex),
    side: THREE.FrontSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  return n;
}

function loadKit(name) {
  if (!CACHE.has(name)) {
    CACHE.set(name, loader.loadAsync(ASSET(name)).then(g => {
      const root = g.scene || g.scenes[0];
      root.updateMatrixWorld(true);
      let mesh = null;
      root.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return null;
      const geo = mesh.geometry.clone();
      geo.computeBoundingBox();
      return { geo, srcMat: mesh.material };
    }).catch(() => null));
  }
  return CACHE.get(name);
}

function stripeTex() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32;
  const x = cv.getContext('2d');
  for (let i = 0; i < 16; i++) {
    x.fillStyle = i % 2 ? '#1a1208' : '#e0a020';
    x.fillRect(i * 16, 0, 16, 32);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

function fill(mesh, list, setFn) {
  if (!mesh || !list.length) return;
  const dummy = new THREE.Object3D();
  const n = Math.min(list.length, mesh.count);
  for (let i = 0; i < n; i++) {
    setFn(dummy, list[i], i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function addCosmodromeArchitecture(root, L, { low, g, basic, zones, always, WX, WZ, H = 3.4 }) {
  const plan = planCosmodromeArchitecture(L, { low });
  const group = new THREE.Group();
  group.name = 'ashen-architecture';
  (always || root).add(group);

  const metal = basic(0x4a4540), rust = basic(0x6b3a22), dark = basic(0x1a1614);
  const cool = basic(0x6ec8d0, { transparent: true, opacity: 0.85 });
  const warm = basic(0xff8a3a, { transparent: true, opacity: 0.85 });
  const coolPool = basic(0x4aa8b8, { transparent: true, opacity: 0.16, depthWrite: false });
  const warmPool = basic(0xff6a22, { transparent: true, opacity: 0.18, depthWrite: false });
  const ceilMat = basic(0x161210);
  const treadMat = basic(0x3a332c);
  const curbMat = basic(0x2a261e);
  const frameMat = basic(0x3e3a36);
  const hazardMat = basic(0xffffff, { map: stripeTex() });

  const meshes = [];
  const inst = (geo, mat, count, name) => {
    if (!count) return null;
    const m = new THREE.InstancedMesh(g(geo), mat, count);
    m.name = name;
    m.castShadow = m.receiveShadow = false;
    m.frustumCulled = false;
    group.add(m);
    meshes.push(m);
    return m;
  };

  // Procedural frames, lighting and structure (always available).
  const post = inst(new THREE.BoxGeometry(0.22, 3.4, 0.22), frameMat, plan.frames.length * 2, 'door-post');
  const lintel = inst(new THREE.BoxGeometry(4.3, 0.22, 0.28), frameMat, plan.frames.length, 'door-lintel');
  const hz = inst(new THREE.BoxGeometry(4.2, 0.16, 0.08), hazardMat, plan.hazards.length, 'door-hazard');
  const wPost = inst(new THREE.BoxGeometry(0.12, 1.95, 0.12), metal, plan.windows.length * 2, 'win-post');
  const wSill = inst(new THREE.BoxGeometry(2.05, 0.1, 0.16), metal, plan.windows.length * 2, 'win-sill');
  const beamM = inst(new THREE.BoxGeometry(1, 0.14, 0.2), rust, plan.beams.length, 'beam');
  const ceilM = inst(new THREE.BoxGeometry(2.02, 0.05, 2.02), ceilMat, plan.ceilings.length, 'ceiling');
  const fixH = inst(new THREE.BoxGeometry(0.55, 0.08, 0.55), metal, plan.fixtures.length, 'fixture');
  const fixG = inst(new THREE.SphereGeometry(0.16, low ? 5 : 8, 5), warm, plan.fixtures.length, 'fixture-glow');
  const stripM = inst(new THREE.BoxGeometry(1.95, 0.045, 0.045), warm, plan.strips.length, 'strip');
  const poolM = inst(new THREE.CircleGeometry(2.2, low ? 8 : 14), warmPool, plan.pools.length, 'pool');
  const antP = inst(new THREE.CylinderGeometry(0.045, 0.06, 2.3, low ? 4 : 6), metal, plan.antennae.length, 'antenna');
  const antT = inst(new THREE.BoxGeometry(0.35, 0.08, 0.18), rust, plan.antennae.length, 'antenna-cap');
  const curbM = inst(new THREE.BoxGeometry(1.9, 0.14, 0.2), curbMat, plan.curbs.length, 'curb');
  const treadM = inst(new THREE.BoxGeometry(1, 0.05, 0.85), treadMat, plan.treads.length, 'tread');
  const capM = inst(new THREE.BoxGeometry(2.0, 1, 0.36), rust, plan.caps.length, 'parapet');

  const dummy = new THREE.Object3D();
  const along = (item, dist, y) => {
    const sx = Math.sin(item.yaw), cz = Math.cos(item.yaw);
    // yaw 0 => +Z forward; door ax=x uses yaw 0, opening faces Z, posts go along X
    dummy.position.set(item.x + Math.cos(item.yaw) * dist, y, item.z + Math.sin(item.yaw) * dist);
    dummy.rotation.set(0, item.yaw, 0);
    dummy.scale.set(1, 1, 1);
  };

  if (post) {
    let i = 0;
    for (const f of plan.frames) {
      for (const side of [-2.05, 2.05]) {
        along(f, side, 1.7);
        dummy.updateMatrix();
        post.setMatrixAt(i++, dummy.matrix);
      }
    }
    post.count = i; post.instanceMatrix.needsUpdate = true; post.computeBoundingSphere();
  }
  fill(lintel, plan.frames, (d, f) => { d.position.set(f.x, 3.32, f.z); d.rotation.set(0, f.yaw, 0); d.scale.set(1, 1, 1); });
  fill(hz, plan.hazards, (d, f) => { d.position.set(f.x, 3.15, f.z); d.rotation.set(0, f.yaw, 0); d.scale.set(1, 1, 1); });
  if (wPost) {
    let i = 0;
    for (const w of plan.windows) {
      for (const side of [-0.95, 0.95]) {
        along(w, side, 1.55);
        dummy.updateMatrix();
        wPost.setMatrixAt(i++, dummy.matrix);
      }
    }
    wPost.count = i; wPost.instanceMatrix.needsUpdate = true; wPost.computeBoundingSphere();
  }
  if (wSill) {
    let i = 0;
    for (const w of plan.windows) {
      for (const y of [0.58, 2.52]) {
        dummy.position.set(w.x, y, w.z); dummy.rotation.set(0, w.yaw, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wSill.setMatrixAt(i++, dummy.matrix);
      }
    }
    wSill.count = i; wSill.instanceMatrix.needsUpdate = true; wSill.computeBoundingSphere();
  }
  fill(beamM, plan.beams, (d, b) => { d.position.set(b.x, b.y, b.z); d.rotation.set(0, b.yaw, 0); d.scale.set(b.len, 1, 1); });
  fill(ceilM, plan.ceilings, (d, c) => { d.position.set(c.x, c.y, c.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  fill(fixH, plan.fixtures, (d, f) => { d.position.set(f.x, f.y, f.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  fill(fixG, plan.fixtures, (d, f) => { d.position.set(f.x, f.y - 0.14, f.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  fill(stripM, plan.strips, (d, s) => { d.position.set(s.x, s.y, s.z); d.rotation.set(0, s.yaw, 0); d.scale.set(1, 1, 1); });
  if (poolM) {
    fill(poolM, plan.pools, (d, p) => { d.position.set(p.x, p.y, p.z); d.rotation.set(-Math.PI / 2, 0, 0); d.scale.set(1, 1, 1); });
    // Recolor cool pools via a second mesh if needed — cheap: leave warm in Ember, swap material per instance is hard.
  }
  fill(antP, plan.antennae, (d, a) => { d.position.set(a.x, a.y + 1.15, a.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  fill(antT, plan.antennae, (d, a) => { d.position.set(a.x, a.y + 2.35, a.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  fill(curbM, plan.curbs, (d, c) => { d.position.set(c.x, c.y, c.z); d.rotation.set(0, c.yaw, 0); d.scale.set(1, 1, 1); });
  fill(treadM, plan.treads, (d, t) => { d.position.set(t.x, t.y, t.z); d.rotation.set(0, t.yaw, 0); d.scale.set(t.w, 1, 1); });
  fill(capM, plan.caps, (d, c) => { d.position.set(c.x, c.y + c.h / 2, c.z); d.rotation.set(0, c.yaw, 0); d.scale.set(1, c.h, 1); });

  // Kenney Modular Space Kit tiles (CC0). Failures fall back to the procedural frames already in the scene.
  const kitJobs = [
    { name: 'template-wall', list: plan.walls.filter(w => w.kind === 'wall'), sx: 0.5, sy: 3.4 / 4.25, sz: 0.28, tint: 0x6a4530, push: 0.08 },
    { name: 'template-wall-detail-a', list: plan.walls.filter(w => w.kind === 'wallDetail'), sx: 0.5, sy: 3.4 / 4.25, sz: 0.22, tint: 0x5a3a28, push: 0.08 },
    { name: 'template-wall-corner', list: plan.corners, sx: 0.7, sy: 3.4 / 4.05, sz: 0.7, tint: 0x5a3c2c, push: 0.02 },
    { name: 'gate', list: plan.gates, sx: 4 / 4.2, sy: 3.4 / 4.62, sz: 0.5, tint: 0x6a4a34, push: 0 },
    { name: 'cables', list: plan.cables, sx: 0.85, sy: 1, sz: 0.85, tint: 0x3a3028, push: 0.3 },
    { name: 'template-floor-detail', list: plan.floors, sx: 0.5, sy: 1, sz: 0.5, tint: 0x2a241c, push: 0 },
    { name: 'template-wall-top', list: plan.caps, sx: 0.5, sy: 0, sz: 0.28, tint: 0x5a3a28, push: 0.06, cap: true }
  ];

  const kitMeshes = [];
  Promise.all(kitJobs.map(job => loadKit(job.name).then(kit => ({ job, kit })))).then(rows => {
    for (const { job, kit } of rows) {
      if (!kit || !job.list.length) continue;
      const mat = toBasic(kit.srcMat, job.tint);
      const mesh = new THREE.InstancedMesh(kit.geo, mat, job.list.length);
      mesh.name = 'kenney-' + job.name;
      mesh.frustumCulled = false;
      group.add(mesh);
      kitMeshes.push(mesh);
      fill(mesh, job.list, (d, item) => {
        const sy = job.cap ? (item.h || 0.6) / 4.7 : job.sy;
        const push = job.push || 0;
        d.position.set(item.x + Math.sin(item.yaw || 0) * push, job.cap ? H : (item.y || 0), item.z + Math.cos(item.yaw || 0) * push);
        d.rotation.set(0, item.yaw || 0, 0);
        d.scale.set(job.sx, sy, job.sz);
      });
    }
  }).catch(() => {});

  let pulse = 0;
  return {
    plan,
    update(dt) {
      pulse += dt || 0;
      const k = 0.7 + 0.3 * Math.abs(Math.sin(pulse * 2.2));
      if (fixG) fixG.material.opacity = 0.45 + 0.35 * Math.abs(Math.sin(pulse * 3));
      if (stripM) stripM.material.opacity = 0.65 + 0.25 * Math.abs(Math.sin(pulse * 1.6));
      void k;
    },
    dispose() {
      group.removeFromParent();
      for (const m of kitMeshes) { m.geometry = m.geometry; }
    }
  };
}
