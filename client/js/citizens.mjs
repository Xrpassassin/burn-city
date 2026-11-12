// City citizens: replaces the capsule pedestrians (app.js peds + citylife shoppers) with CC BY 3D people.
//  * FAR LOD: ~1.2k-tri mesh per model, walk cycle baked into a vertex-animation texture, drawn as ONE InstancedMesh
//    per model (4 draw calls for the whole crowd). The capsule simulations keep moving the crowd; we only read
//    their instance matrices, so routes, shop visits and counts are unchanged.
//  * NEAR LOD: <=10k-tri rigged GLB with Walk/Idle clips, swapped in for the few agents closest to the camera
//    (a small pool, see BUDGET in citizens-core.mjs).
//  * NAMED citizens: driven by client/data/citizens/<id>.json life scripts (daily schedule between named places).
// Disable with ?citizens=0 (capsules come back). Credits: city-credits.html.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { validateCitizen, activeEntry, resolvePlace, pickNear, budgetFor } from './citizens-core.mjs';

const Q = new URLSearchParams(location.search);
const ASSETS = new URL('../assets/citizens/', import.meta.url), DATA = new URL('../data/citizens/', import.meta.url);
const gaitAsset = file => new URL(file + '?gait=2', ASSETS);
const CC = window.__cityCitizens = { ready: false, stats: {} };

function farMaterial(meta, tex, vatP, vatN) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: .85, metalness: 0, emissive: 0x101418 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { vatP: { value: vatP }, vatN: { value: vatN } });
    sh.vertexShader = `attribute float vid;\nattribute vec2 aAnim;\nuniform sampler2D vatP;\nuniform sampler2D vatN;\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `float vatF = fract(aAnim.x) * ${meta.walkFrames}.0;
float vf0 = floor(vatF), vft = vatF - vf0, vf1 = mod(vf0 + 1.0, ${meta.walkFrames}.0);
vec2 vu0 = vec2((vid + .5) / ${meta.verts}.0, (vf0 + .5) / ${meta.frames}.0), vu1 = vec2(vu0.x, (vf1 + .5) / ${meta.frames}.0);
vec2 vuIdle = vec2(vu0.x, (${meta.idleFrame}.0 + .5) / ${meta.frames}.0);
vec3 objectNormal = normalize(mix(texture2D(vatN, vuIdle).xyz, mix(texture2D(vatN, vu0).xyz, texture2D(vatN, vu1).xyz, vft), aAnim.y));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = mix(texture2D(vatP, vuIdle).xyz, mix(texture2D(vatP, vu0).xyz, texture2D(vatP, vu1).xyz, vft), aAnim.y);');
  };
  m.customProgramCacheKey = () => 'vat-' + meta.id;
  return m;
}

async function loadFar(m, cap) {
  const [meta, bin, tex] = await Promise.all([
    fetch(gaitAsset(m.id + '.far.json')).then(r => r.json()),
    fetch(gaitAsset(m.id + '.far.bin')).then(r => r.arrayBuffer()),
    new THREE.TextureLoader().loadAsync(new URL(m.id + '.far.webp', ASSETS).href)]);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  const V = meta.verts, Fr = meta.frames;
  const uv = new Float32Array(bin, meta.uvOffset, V * 2), idx = new Uint16Array(bin, meta.idxOffset, meta.indices);
  const qp = new Int16Array(bin.slice(meta.posOffset, meta.posOffset + V * Fr * 6)), qn = new Int8Array(bin, meta.nrmOffset, V * Fr * 3);
  // vertex-animation tables as half floats (~0.5 MB GPU per model instead of ~1 MB)
  const P = new Float32Array(V * Fr * 4), N = new Float32Array(V * Fr * 4), hP = new Uint16Array(V * Fr * 4), hN = new Uint16Array(V * Fr * 4);
  for (let i = 0; i < V * Fr; i++) for (let c = 0; c < 3; c++) {
    P[i * 4 + c] = meta.min[c] + (qp[i * 3 + c] + 32768) / 65535 * meta.size[c]; N[i * 4 + c] = qn[i * 3 + c] / 127;
    hP[i * 4 + c] = THREE.DataUtils.toHalfFloat(P[i * 4 + c]); hN[i * 4 + c] = THREE.DataUtils.toHalfFloat(N[i * 4 + c]);
  }
  const mk = d => { const t = new THREE.DataTexture(d, V, Fr, THREE.RGBAFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; };
  const vatP = mk(hP), vatN = mk(hN), g = new THREE.BufferGeometry(), rest = meta.idleFrame * V;
  const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3), vid = new Float32Array(V);
  for (let i = 0; i < V; i++) { for (let c = 0; c < 3; c++) { pos[i * 3 + c] = P[(rest + i) * 4 + c]; nrm[i * 3 + c] = N[(rest + i) * 4 + c]; } vid[i] = i; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); g.setAttribute('vid', new THREE.BufferAttribute(vid, 1));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2); anim.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aAnim', anim);
  const mesh = new THREE.InstancedMesh(g, farMaterial(meta, tex, vatP, vatN), cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'citizens-far-' + m.id;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  return { meta, mesh, anim, stride: meta.strideMetersPerCycle };
}

async function init() {
  const c = window.__city, L = window.__cityLife;
  const B = budgetFor(c.TIER, c.MOBILE);
  const man = await fetch(new URL('models.json', ASSETS)).then(r => r.json());
  const models = man.models, ids = models.map(m => m.id);
  const peds = c.pedMesh, shop = L && L.shopperMesh;
  const named = [];
  try {
    const idx = await fetch(new URL('index.json', DATA)).then(r => r.json());
    for (const id of idx.citizens || []) {
      const s = await fetch(new URL(id + '.json', DATA)).then(r => r.json());
      const err = validateCitizen(s, ids); if (err.length) { console.warn('citizen', id, err); continue; } named.push(s);
    }
  } catch (e) { console.warn('citizens: life scripts', e); }
  const cap = (peds ? peds.count : 0) + (shop ? shop.count : 0) + named.length;
  const FAR = {}; await Promise.all(models.map(async m => { FAR[m.id] = await loadFar(m, Math.max(1, cap)); }));
  // agents: crowd copies read their source instance; named ones run their own schedule
  const agents = [], rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  const tint = i => new THREE.Color().setHSL(rnd(i, 3) * .1, .06 + rnd(i, 4) * .1, .5).multiplyScalar(1.6 + rnd(i, 5) * .35);
  // even mix: crowd member k uses model k mod N
  const add = (src, i, k) => agents.push({ src, i, model: ids[k % ids.length], tint: tint(k), x: 0, z: 0, yaw: 0, walkWeight: 0, ph: rnd(k, 2), hidden: true });
  let k = 0;
  if (peds) for (let i = 0; i < peds.count; i++) add(peds, i, k++);
  if (shop) for (let i = 0; i < shop.count; i++) add(shop, i, k++);
  const world = () => ({ spawn: L.spawn || { x: 0, z: 52 }, police: L.police, fire: L.fire, ems: L.ems, power: L.power, shops: L.shops, towers: (c.E && c.E.nodes) || [], colliders: c.colliders });
  for (const s of named) {
    const p = resolvePlace(activeEntry(s.schedule, nowMin()).place, world()) || { x: 0, z: 52 };
    agents.push({ named: s, model: s.modelId, tint: new THREE.Color(1.8, 1.8, 1.8), x: p.x + 3, z: p.z + 3, yaw: 0, walkWeight: 0, ph: 0, hidden: false, place: null, tgt: null, stuck: 0, last: 0 });
  }
  for (const id of ids) c.S.add(FAR[id].mesh);
  if (peds) peds.visible = false; if (shop) shop.visible = false;
  // near LOD pool: each model's rigged glTF is fetched only the first time someone of that model comes close.
  // Phones get 512 px textures (<id>-tex-512/) instead of 1024 px.
  const lm = new THREE.LoadingManager(); if (c.MOBILE || c.TIER === 'low') lm.setURLModifier(u => u.replace(/-tex\//, '-tex-512/'));
  const gl = new GLTFLoader(lm), NEAR = {}, loading = {};
  const want = model => { if (!loading[model]) loading[model] = gl.loadAsync(gaitAsset(model + '.gltf').href).then(g => { NEAR[model] = g; }).catch(e => { NEAR[model] = null; console.warn('citizens near', model, e); }); };
  const slots = [];
  const getSlot = model => {
    let s = slots.find(o => !o.agent && o.model === model); if (s) return s;
    if (slots.filter(o => o.model === model).length >= B.near) return null;
    if (!NEAR[model]) { want(model); return null; }   // far LOD keeps drawing them until the near model has loaded
    const g = NEAR[model], root = SkeletonUtils.clone(g.scene); root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(root), clip = n => g.animations.find(a => a.name === n) || g.animations[0];
    const walk = mixer.clipAction(clip('Walk')), idle = mixer.clipAction(clip('Idle')); walk.play(); walk.paused = true; idle.play();
    s = { model, root, mixer, walk, idle, agent: null }; root.visible = false; c.S.add(root); slots.push(s); return s;
  };
  // DOM name tags + dialogue for named citizens
  const css = document.createElement('style'); css.textContent = `.czTag{position:fixed;left:0;top:0;pointer-events:none;z-index:4;font:700 11px system-ui;color:#ffe2b8;text-shadow:0 0 4px #000;white-space:nowrap;transform:translate(-50%,-100%)}
.czBub{position:fixed;left:0;top:0;pointer-events:none;z-index:4;max-width:220px;background:#16101ae6;border:1px solid #ff9b4a88;color:#fff;border-radius:10px;padding:6px 9px;font:12px/1.3 system-ui;opacity:0;transition:opacity .4s}.czBub.on{opacity:1}
@media (max-width:600px){.czBub{max-width:160px;font-size:10.5px}.czTag{font-size:9.5px}}`; document.head.append(css);
  for (const a of agents) if (a.named) { a.tag = document.createElement('div'); a.tag.className = 'czTag'; a.bub = document.createElement('div'); a.bub.className = 'czBub'; document.body.append(a.tag, a.bub); a.next = 0; }
  const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  let nearSet = [], pickT = 0, last = performance.now(), fpsN = 0;
  const vis = a => fr.intersectsSphere(sph.set(v.set(a.x, 1, a.z), 1.2));
  function stepNamed(a, dt, now) {
    const e = activeEntry(a.named.schedule, nowMin());
    if (a.place !== e.place) { a.place = e.place; a.entry = e; a.tgt = resolvePlace(e.place, world()); a.arrived = false; if (e.say) a.pending = e.say; }
    if (!a.tgt || a.arrived) return;
    const dx = a.tgt.x - a.x, dz = a.tgt.z - a.z, d = Math.hypot(dx, dz);
    if (d < 1.2) { a.arrived = true; return; }
    const s = Math.min(d, 1.35 * dt); a.x += dx / d * s; a.z += dz / d * s; a.yaw = Math.atan2(dx, dz);
    for (const o of c.colliders) { if (!o.r) continue; const ex = a.x - o.x, ez = a.z - o.z, mm = o.r + .5; if (Math.abs(ex) > mm || Math.abs(ez) > mm) continue; const ee = Math.hypot(ex, ez); if (ee < mm) { a.x += ex / (ee || 1) * (mm - ee); a.z += ez / (ee || 1) * (mm - ee); } }
    if (now - a.last > 3000) { if (a.lp && Math.hypot(a.x - a.lp.x, a.z - a.lp.z) < .6) { a.x += (Math.random() - .5) * 4; a.z += (Math.random() - .5) * 4; a.stuck++; if (a.stuck > 6) { a.x = a.tgt.x; a.z = a.tgt.z; a.stuck = 0; } } a.lp = { x: a.x, z: a.z }; a.last = now; }
  }
  function tick() {
    requestAnimationFrame(tick); if (window.__cityPaused) return;
    const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now; if (dt <= 0) return;
    const cam = c.C; cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm);
    const cx = cam.position.x, cz = cam.position.z;
    for (const a of agents) {
      const prevX = a.x, prevZ = a.z;
      const wasHidden = a.hidden;
      if (a.named) {
        stepNamed(a, dt, now);
      } else {
        const e = a.src.instanceMatrix.array, o = a.i * 16;
        a.hidden = o >= e.length || e[o] * e[o] + e[o + 1] * e[o + 1] + e[o + 2] * e[o + 2] < 1e-6;
        if (a.hidden) { a.walkWeight = 0; continue; }
        a.x = e[o + 12]; a.z = e[o + 14]; a.yaw = Math.atan2(e[o + 8], e[o + 10]);
      }
      const traveled = wasHidden ? 0 : Math.hypot(a.x - prevX, a.z - prevZ);
      // Route corrections and shop teleports are not steps. A small tolerance
      // allows for the crowd and renderer sampling on separate frame callbacks.
      const distance = traveled <= .08 + 4 * dt ? traveled : 0;
      a.ph = (a.ph + distance / FAR[a.model].stride) % 1;
      a.walkWeight += ((distance > .15 * dt ? 1 : 0) - a.walkWeight) * (1 - Math.exp(-10 * dt));
    }
    if ((pickT -= dt) <= 0) {
      pickT = .25; const sel = new Set(pickNear(agents, cx, cz, B.near, B.nearR, vis));
      for (const s of slots) if (s.agent && !sel.has(agents.indexOf(s.agent))) { s.agent.slot = null; s.agent = null; s.root.visible = false; }
      for (const i of sel) { const a = agents[i]; if (a.slot) continue; let s = null; try { s = getSlot(a.model); } catch (e) { CC.nearError = String(e && e.stack || e); } if (!s) continue; s.agent = a; a.slot = s; s.idle.reset().play(); }
      nearSet = slots.filter(s => s.agent).length;
    }
    for (const s of slots) if (s.agent) {
      const a = s.agent; s.root.position.set(a.x, 0, a.z); s.root.rotation.y = a.yaw;
      s.root.visible = !a.hidden;
      if (a.hidden) continue;
      s.walk.time = a.ph * s.walk.getClip().duration;
      s.walk.setEffectiveWeight(a.walkWeight); s.idle.setEffectiveWeight(1 - a.walkWeight); s.mixer.update(dt);
    }
    for (const id in FAR) FAR[id].mesh.count = 0;
    let drawn = 0;
    for (const a of agents) {
      if (a.hidden || a.slot) continue;
      const dx = a.x - cx, dz = a.z - cz; if (dx * dx + dz * dz > B.farR * B.farR || !vis(a)) continue;
      const F = FAR[a.model], n = F.mesh.count++;
      q.setFromAxisAngle(up, a.yaw); m4.compose(pv.set(a.x, 0, a.z), q, one); F.mesh.setMatrixAt(n, m4); F.mesh.setColorAt(n, a.tint);
      F.anim.array[n * 2] = a.ph; F.anim.array[n * 2 + 1] = a.walkWeight; drawn++;
    }
    for (const id in FAR) { const M = FAR[id].mesh; M.visible = M.count > 0; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; FAR[id].anim.needsUpdate = true; }
    // named-citizen tags & dialogue
    const W = innerWidth, H = innerHeight;
    for (const a of agents) if (a.named) {
      const d = Math.hypot(a.x - cx, a.z - cz); v.set(a.x, 2.15, a.z).project(cam); const on = d < 28 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      a.tag.style.display = a.bub.style.display = on ? '' : 'none'; if (!on) continue;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; a.tag.textContent = a.named.name + (a.entry && a.entry.activity ? ' · ' + a.entry.activity : '');
      a.tag.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; a.bub.style.transform = `translate(${x}px,${y - 16}px) translate(-50%,-100%)`;
      if (d < 10 && now > a.next) { const D = a.named.dialogue || []; const line = a.pending || D[(Math.random() * D.length) | 0]; a.pending = null; if (line) { a.bub.textContent = line; a.bub.classList.add('on'); a.hideAt = now + 5000; } a.next = now + 9000 + Math.random() * 6000; }
      if (a.hideAt && now > a.hideAt) { a.bub.classList.remove('on'); a.hideAt = 0; }
    }
    CC.stats = { agents: agents.length, far: drawn, near: nearSet, named: named.length, budget: B };
  }
  CC.agents = agents; CC.slots = slots; CC.far = FAR; CC.ready = true; tick();
}
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

if (Q.get('citizens') !== '0') (function wait(n = 0) {
  const c = window.__city, L = window.__cityLife;
  if (c && c.pedMesh && c.S && c.C && L && L.ready) init().catch(e => { console.warn('citizens: falling back to capsules', e); if (c.pedMesh) c.pedMesh.visible = true; if (L.shopperMesh) L.shopperMesh.visible = true; CC.error = String(e); });
  else if (n < 240) setTimeout(() => wait(n + 1), 500);
})();
