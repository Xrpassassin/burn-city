// The ISS and the CB1 spaceship inside the main BURN City scene (credits: city-credits.html, assets: assets/space/).
// - The ISS orbits high over the City on a slow game-scale orbit (same clock for every player), lit to match the
//   City's real-time Phoenix sun: white by day, warm at sunrise/sunset, a bright moving point just after dusk.
//   Far away it is ONE baked, untextured draw call; the textured LOD loads only when a camera gets within ~420 m,
//   and the full model only while docking. 512 px textures everywhere except the near models on desktop.
// - CB1 is parked on a pad on the airport apron (east of the ATC tower); it loads only when a camera is near.
// - Board it (E / tap at the pad, or the airport terminal) to fly up into the same sky, dock with the ISS using the
//   shared flight rules (../space/flight.mjs) and fly back down to the pad. No page change, no extra render pass:
//   the flight only moves the City camera from a late __preRender hook. Disable everything with ?space=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { advanceFlight, beginFlight, dockingStatus, DOCKING_TOLERANCE } from '../space/flight.mjs';
import { issOrbit, ascentPoint, issSunTint, issLevel, shipLevel, PAD, ASCENT_S, RETURN_S } from './city-space-core.mjs';

const Q = new URLSearchParams(location.search);
const ASSETS = new URL('../assets/space/', import.meta.url);
const ISS_SCALE = 10, SHIP_SCALE = 14;
const FILL = { value: .3 };   // CB1 self-light (base colour added to emissive) so it never renders black in the dim City env
const SP = window.__citySpace = { ready: false, error: null, levels: { iss: 'none', ship: 'none' }, loads: [] };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

let GLTF = null;
async function load(file, hi, fill) {
  if (!GLTF) GLTF = (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader;
  const manager = new THREE.LoadingManager();
  if (!hi) manager.setURLModifier(u => u.replace(/-tex\//, '-tex-512/'));
  SP.loads.push(file + (hi ? '' : '@512'));
  const { scene } = await new GLTF(manager).loadAsync(new URL(file, ASSETS).href);
  scene.traverse(o => {
    if (!o.isMesh) return; const m = o.material; m.fog = false;
    // the City's env map is a dim night studio: metallic panels would render near-black, so keep them mostly dielectric
    if (m.isMeshStandardMaterial) { m.metalness = Math.min(m.metalness, .25); m.roughness = Math.max(m.roughness, .45); }
    if (fill && m.isMeshStandardMaterial && !m.userData.fill) {   // cheap rim + fill light in the same pass: no extra lights, no extra render
      m.userData.fill = 1; m.customProgramCacheKey = () => 'cb1fill';
      m.onBeforeCompile = sh => {
        sh.uniforms.uFill = FILL;
        sh.fragmentShader = 'uniform float uFill;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n float rim = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 2.0);\n totalEmissiveRadiance += diffuseColor.rgb * uFill + vec3(.55, .8, 1.0) * rim * uFill * .9;');
      };
    }
  });
  return scene;
}
// average colour of a texture (8x8 downsample) for the one-draw-call far ISS
function avgColor(tex) {
  try {
    const img = tex && tex.image; if (!img) return null;
    const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4 * 255; return new THREE.Color().setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace);
  } catch { return null; }
}
function bakeFar(root) {
  root.updateMatrixWorld(true); const parts = [];
  const toRootParent = root.parent ? root.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh) return;
    const src = o.geometry, g = new THREE.BufferGeometry();
    g.setAttribute('position', src.attributes.position.clone()); if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(toRootParent.clone().multiply(o.matrixWorld));
    const col = o.material.color.clone(), avg = avgColor(o.material.map); if (avg) col.multiply(avg);
    col.setRGB(col.r ** 1.5, col.g ** 1.5, col.b ** 1.5);   // extra contrast so the tiny far ISS reads against a bright day sky
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g);
  });
  const merged = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.name = 'iss_far_baked'; return m;
}
function glintTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(.2, 'rgba(255,250,235,.8)'); g.addColorStop(1, 'rgba(255,240,220,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function poolTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,236,200,1)'); g.addColorStop(.55, 'rgba(255,220,170,.55)'); g.addColorStop(1, 'rgba(255,210,160,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function css() {
  const s = document.createElement('style');
  s.textContent = `#bcSpaceHud{position:fixed;inset:0;pointer-events:none;z-index:45;font:600 14px system-ui;color:#e7fbff;display:none}
#bcSpaceHud.on{display:block}#bcSpaceHud .top{position:absolute;left:50%;top:calc(env(safe-area-inset-top) + 64px);transform:translateX(-50%);text-align:center;background:#04121dcc;border:1px solid #43eaff66;border-radius:12px;padding:8px 14px;max-width:88vw}
#bcSpaceHud .top b{display:block;font-size:15px}#bcSpaceHud .top small{display:block;opacity:.8;font-weight:500;margin-top:2px}
#bcSpaceHud .bot{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 18px);display:flex;justify-content:center;align-items:flex-end;gap:14px;flex-wrap:wrap}
#bcSpaceHud button{pointer-events:auto;min-height:44px;min-width:44px;border-radius:10px;border:1px solid #43eaff;background:#082433e6;color:#e7fbff;font:700 14px system-ui;padding:8px 14px;touch-action:none;user-select:none;-webkit-user-select:none}
#bcSpaceHud .pad{display:grid;grid-template-columns:repeat(3,48px);grid-template-rows:repeat(2,48px);gap:6px}#bcSpaceHud .pad [data-c=up]{grid-column:2}#bcSpaceHud .pad [data-c=left]{grid-column:1;grid-row:2}#bcSpaceHud .pad [data-c=down]{grid-column:2;grid-row:2}#bcSpaceHud .pad [data-c=right]{grid-column:3;grid-row:2}
#bcSpaceHud .target{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:14px;border:1px solid #43eaff80;background:#04121d99}
#bcSpaceHud .target::before,#bcSpaceHud .dot{content:'';position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%)}
#bcSpaceHud .target::before{width:var(--corridor);height:var(--corridor);border:2px solid #a1f5ff;box-sizing:border-box}
#bcSpaceHud .target.aligned::before{border-color:#94ffb6;background:#94ffb633}
#bcSpaceHud .dot{left:var(--dot-x,50%);top:var(--dot-y,50%);width:8px;height:8px;background:#fff;box-shadow:0 0 0 2px #082433}
#bcSpaceHud [hidden]{display:none!important}#bcSpaceHud .ret{border-color:#ffffff55;background:#0d1620e6}`;
  document.head.append(s);
  const h = document.createElement('div'); h.id = 'bcSpaceHud'; h.setAttribute('role', 'region'); h.setAttribute('aria-label', 'CB1 flight');
  h.innerHTML = `<div class="top"><b id="bcSpStatus" role="status">Ready</b><small id="bcSpRange"></small></div><div class="target" id="bcSpTarget" aria-hidden="true" hidden><i class="dot"></i></div><div class="bot"><div class="pad" id="bcSpPad" hidden>
<button type="button" data-c="up" aria-label="Align up">↑</button><button type="button" data-c="left" aria-label="Align left">←</button><button type="button" data-c="down" aria-label="Align down">↓</button><button type="button" data-c="right" aria-label="Align right">→</button></div>
<button type="button" data-c="approach" id="bcSpGo" hidden>Hold to approach</button><button type="button" class="ret" id="bcSpRet">Return to BURN City</button></div>`;
  document.body.append(h); return h;
}

function init() {
  const c = window.__city, BC = window.__BC, S = c.S, C = c.C;
  const hud = css(), $ = id => document.getElementById(id);
  const KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'approach' };
  const pressed = new Set(), held = new Map();
  const on = k => [...pressed].some(code => KEYS[code] === k) || [...held.values()].includes(k);
  const clearControls = () => { pressed.clear(); held.clear(); };
  const isApproaching = () => fs?.stage === 'dock' && fs.f.phase === 'approach';
  addEventListener('keydown', e => {
    if (!isApproaching() || !Object.hasOwn(KEYS, e.code) || e.altKey || e.ctrlKey || e.metaKey ||
        e.target.closest?.('input, textarea, select, button, a, [contenteditable]')) return;
    pressed.add(e.code);
    e.preventDefault();
    e.stopPropagation();
  }, true);
  addEventListener('keyup', e => pressed.delete(e.code), true);
  addEventListener('blur', clearControls);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearControls(); });
  hud.querySelectorAll('[data-c]').forEach(b => {
    b.addEventListener('pointerdown', e => {
      if (!isApproaching() || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch {}
      held.set(e.pointerId, b.dataset.c);
    });
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(n, e => held.delete(e.pointerId));
  });
  const target = $('bcSpTarget'), padControl = $('bcSpPad'), approachControl = $('bcSpGo');
  // Reserve the outer 8% for the marker at full deflection.
  const targetTravel = 42;
  target.style.setProperty('--corridor', `${2 * targetTravel * DOCKING_TOLERANCE}%`);
  function showDockingControls(show) {
    target.hidden = padControl.hidden = approachControl.hidden = !show;
    if (!show) clearControls();
  }
  $('bcSpRet').addEventListener('click', e => { e.stopPropagation(); startReturn(); });

  // ---- launch pad (one merged vertex-colour mesh, one draw call)
  const padY = c.groundAt ? c.groundAt(PAD.x, PAD.z, 0) : 0;
  const tint = (g, hex) => { const col = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const padGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(PAD.r, PAD.r + .6, .5, 32).translate(0, .25, 0).toNonIndexed(), 0x5d636b),
    tint(new THREE.RingGeometry(PAD.r - 2.2, PAD.r - 1.4, 40).rotateX(-Math.PI / 2).translate(0, .52, 0).toNonIndexed(), 0xff7a1a),
    tint(new THREE.RingGeometry(3.4, 4.2, 28).rotateX(-Math.PI / 2).translate(0, .52, 0).toNonIndexed(), 0x43eaff)
  ].map(g => { if (!g.attributes.normal) g.computeVertexNormals(); g.deleteAttribute('uv'); return g; }), false);
  const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .1 }));
  pad.position.set(PAD.x, padY, PAD.z); pad.name = 'cb1_launch_pad'; S.add(pad);
  const padTop = V(PAD.x, padY + .5, PAD.z);
  // pad floodlights, faked: 4 masts (lit pad mesh), unlit lamp heads + rim lights (1 draw), additive beam cones (1 draw)
  // and an additive light pool on the deck (1 draw). Night-only opacity, no real lights, no extra pass.
  const padFx = new THREE.Group(); padFx.name = 'cb1_pad_lights'; padFx.position.copy(pad.position); S.add(padFx);
  const MAST = PAD.r + 3, MH = 17, masts = [], heads = [], beams = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * MAST, z = Math.sin(a) * MAST;
    masts.push(tint(new THREE.CylinderGeometry(.35, .5, MH, 6).translate(x, MH / 2, z).toNonIndexed(), 0x8a9099));
    heads.push(tint(new THREE.BoxGeometry(2.2, 1, 1.4).translate(x * .97, MH + .3, z * .97).toNonIndexed(), 0xfff2d6));
    const top = V(x * .95, MH, z * .95), bot = V(x * .25, .6, z * .25), len = top.distanceTo(bot);
    const cone = new THREE.CylinderGeometry(.8, 7.5, len, 14, 1, true).toNonIndexed();
    const n = cone.attributes.position.count, col = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const f = .5 - cone.attributes.position.getY(k) / len; const v = .5 * (1 - f) ** 2 + .02; col[k * 3] = v; col[k * 3 + 1] = v * .93; col[k * 3 + 2] = v * .8; }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, top.clone().sub(bot).normalize())); cone.translate((top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2);
    beams.push(cone);
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; heads.push(tint(new THREE.BoxGeometry(.7, .35, .7).translate(Math.cos(a) * (PAD.r + .1), .62, Math.sin(a) * (PAD.r + .1)).toNonIndexed(), i % 2 ? 0x43eaff : 0xffa040)); }
  const clean = g => { if (!g.attributes.normal) g.computeVertexNormals(); if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
  const mastMesh = new THREE.Mesh(mergeGeometries(masts.map(clean), false), pad.material); padFx.add(mastMesh);
  padFx.add(new THREE.Mesh(mergeGeometries(heads.map(clean), false), new THREE.MeshBasicMaterial({ vertexColors: true })));
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, opacity: .5 });
  const beamMesh = new THREE.Mesh(mergeGeometries(beams.map(g => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }), false), beamMat); beamMesh.renderOrder = 2; padFx.add(beamMesh);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(PAD.r * 2.4, PAD.r * 2.4).rotateX(-Math.PI / 2).translate(0, .56, 0), poolMat); pool.renderOrder = 2; padFx.add(pool);

  // ---- CB1
  const ship = new THREE.Group(); ship.name = 'cb1_ship'; S.add(ship);
  const shipViews = { lod: null, near: null }; let shipLoading = null, shipBottom = .19;
  const parkPos = () => V(padTop.x, padTop.y + shipBottom * SHIP_SCALE, padTop.z);
  ship.position.copy(parkPos()); ship.rotation.y = -Math.PI / 2;   // parked nose toward the runway/east
  const engine = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), color: 0x7fe6ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .6 }));
  engine.scale.setScalar(7); engine.position.set(0, .2 * SHIP_SCALE, .62 * SHIP_SCALE); engine.visible = false; ship.add(engine);   // CB1 nose is -z, engines at +z
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), color: 0xff3a2a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  beacon.scale.setScalar(4); beacon.visible = false; ship.add(beacon);
  function wantShip(level) {
    if (level === 'none' || shipViews[level] || shipLoading === level) return;
    shipLoading = level;
    const hi = level === 'near' && !c.MOBILE && c.TIER !== 'low';
    load(level === 'near' ? 'cb1.gltf' : 'cb1-lod.gltf', hi, true).then(m => {
      m.scale.setScalar(SHIP_SCALE); const b = new THREE.Box3().setFromObject(m); if (b.isEmpty()) return;
      shipBottom = -b.min.y / SHIP_SCALE; engine.position.set(0, (b.min.y + b.max.y) / 2, b.max.z * .97); beacon.position.set(0, b.max.y + .4, 0); engine.visible = beacon.visible = true; shipViews[level] = m; ship.add(m); if (!fs) ship.position.copy(parkPos());
    }).catch(e => { SP.error = 'cb1: ' + e; }).finally(() => { if (shipLoading === level) shipLoading = null; });
  }
  function showShip(level) {
    const have = level === 'near' ? (shipViews.near || shipViews.lod) : level === 'lod' ? (shipViews.lod || shipViews.near) : null;
    for (const k in shipViews) if (shipViews[k]) shipViews[k].visible = shipViews[k] === have;
    SP.levels.ship = have ? (have === shipViews.near ? 'near' : 'lod') : 'none';
  }

  // ---- ISS
  const iss = new THREE.Group(); iss.name = 'iss'; S.add(iss);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(), color: 0xfff4e0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false }));
  glint.scale.setScalar(.026); glint.renderOrder = 1; iss.add(glint);
  // blinking nav lights (red strobe, white strobe) on the far ISS, screen-sized so they read at any distance
  const nav = [0xff3424, 0xffffff].map(col => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint.material.map, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, sizeAttenuation: false })); sp.scale.setScalar(.012); sp.renderOrder = 1; iss.add(sp); return sp; });
  let issHalf = 4;   // half span of the ISS in model units (set when the LOD loads)
  const issViews = { far: null, lod: null, near: null }; let issLoading = null, dockZ = 2.9; const issLit = new Set();
  function loadIss(level) {
    if (issViews[level] || issLoading) return;
    if (level === 'far') { if (issViews.lod) { issViews.far = bakeFar(issViews.lod); issViews.far.visible = false; iss.add(issViews.far); return; } level = 'lod'; }
    issLoading = level;
    const hi = level === 'near' && !c.MOBILE && c.TIER !== 'low';
    load(level === 'near' ? 'iss.gltf' : 'iss-lod.gltf', hi).then(m => {
      m.scale.setScalar(ISS_SCALE); m.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(m); if (b.isEmpty()) return;
      m.traverse(o => { if (o.isMesh && o.material.map && !o.material.emissiveMap) { o.material.emissiveMap = o.material.map; o.material.emissive = new THREE.Color(0); issLit.add(o.material); } });
      dockZ = b.max.z / ISS_SCALE; m.visible = false; issViews[level] = m; if (level === 'lod') issHalf = Math.max(b.max.x, -b.min.x) / ISS_SCALE;
      if (level === 'lod' && !issViews.far) { issViews.far = bakeFar(m); issViews.far.visible = false; iss.add(issViews.far); }
      iss.add(m);
    }).catch(e => { SP.error = 'iss: ' + e; }).finally(() => { issLoading = null; });
  }
  // the ISS is always in the sky, so its cheap LOD loads once the City has settled (idle), not at boot
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1));
  setTimeout(() => idle(() => loadIss('far'), { timeout: 5000 }), Q.has('iss') || Q.get('spacePreview') === '1' ? 0 : 6000);

  // ---- flight
  let fs = null; const tmp = V(), tmp2 = V(), look = V(), camPos = V(), facing = V();
  const frame = { pos: V(), dir: V(0, 0, 1), right: V(1, 0, 0), up: V(0, 1, 0) };
  function setFrame(o) { frame.pos.set(o.pos.x, o.pos.y, o.pos.z); frame.dir.set(o.dir.x, o.dir.y, o.dir.z).normalize(); frame.right.crossVectors(frame.dir, UP).normalize(); frame.up.crossVectors(frame.right, frame.dir).normalize(); }
  const dockPort = () => tmp2.copy(frame.pos).addScaledVector(frame.dir, dockZ * ISS_SCALE);
  const shipHalf = () => .62 * SHIP_SCALE;
  // The station’s right vector points left from the trailing camera.
  function approachPos(f, out) { return out.copy(dockPort()).addScaledVector(frame.dir, f.distance + shipHalf()).addScaledVector(frame.right, -f.x * 14).addScaledVector(frame.up, f.y * 10); }
  function blocked() { return !!(window.__estatesIslandLive?.active || window.__burnTowerOpen || window.__cityPaused || document.body.classList.contains('wl-travel')); }
  SP.launch = function launch(opts = {}) {
    if (fs || !SP.ready || blocked()) return false;
    const mode = window.__burnMode ? window.__burnMode() : 'orbit';
    fs = { stage: 'ascent', t: 0, prevMode: mode, from: opts.from || 'pad', camFrom: C.position.clone() };
    const info = document.getElementById('info');
    document.activeElement?.blur?.();
    if (info) info.style.display = 'none';
    window.__setBurnMode && window.__setBurnMode('orbit'); if (BC && BC.orbit) BC.orbit.enabled = false;
    setFrame(issOrbit(Date.now() / 1000)); fs.rdv = approachPos(beginFlight(), V());
    camPos.copy(C.position); look.copy(padTop); wantShip('near'); loadIss('near');
    hud.classList.add('on'); showDockingControls(false); $('bcSpRet').textContent = 'Abort · return to BURN City';
    return true;
  };
  function startReturn() { if (!fs || fs.stage === 'return') return; fs.stage = 'return'; fs.t = 0; fs.from3 = ship.position.clone(); showDockingControls(false); $('bcSpRet').hidden = true; }
  function finish() {
    const prev = fs.prevMode; fs = null; hud.classList.remove('on'); $('bcSpRet').hidden = false;
    ship.position.copy(parkPos()); ship.rotation.set(0, -Math.PI / 2, 0);
    if (prev === 'explore' && c.P && c.P.pos) { c.P.pos.set(PAD.x, c.groundAt ? c.groundAt(PAD.x, PAD.z + PAD.r + 5, 0) : padY, PAD.z + PAD.r + 5); c.P.vel && c.P.vel.set(0, 0, 0); window.__setBurnMode('explore'); }
    else { window.__setBurnMode && window.__setBurnMode('orbit'); if (BC && BC.orbit) { BC.orbit.enabled = true; BC.orbit.target.copy(padTop); C.position.set(PAD.x + 70, padY + 45, PAD.z + 70); C.lookAt(padTop); } }
  }
  const status = (a, b = '') => { if ($('bcSpStatus').textContent !== a) $('bcSpStatus').textContent = a; if ($('bcSpRange').textContent !== b) $('bcSpRange').textContent = b; };
  function faceAlong(obj, dir) { obj.lookAt(facing.copy(obj.position).sub(dir)); }   // CB1 nose is model -z
  const camGoal = V();
  function camTo(pos, at, dt, k = 4) { const a = 1 - Math.exp(-dt * k); camPos.lerp(pos, a); C.position.copy(camPos); look.lerp(at, a); C.lookAt(look); if (BC && BC.orbit) BC.orbit.target.copy(at); }

  function stepFlight(dt) {
    fs.t += dt; const prevPos = ship.position.clone();
    if (fs.stage === 'ascent') {
      const u = Math.min(1, fs.t / ASCENT_S); const p = ascentPoint(padTop, fs.rdv, u); ship.position.set(p.x, p.y + shipBottom * SHIP_SCALE * (1 - u), p.z);
      const vel = tmp.subVectors(ship.position, prevPos); if (vel.lengthSq() > 1e-6) faceAlong(ship, vel.clone().normalize());
      if (u < .18) camTo(camGoal.set(padTop.x + 46, padTop.y + 14 + u * 90, padTop.z + 46), ship.position, dt, 3);
      else { const back = vel.lengthSq() > 1e-6 ? vel.clone().normalize() : frame.dir; camTo(camGoal.copy(ship.position).addScaledVector(back, -38).addScaledVector(UP, 10), ship.position, dt, 2.5); }
      status('CB1 ascending', `Altitude ${Math.round(ship.position.y - padTop.y)} m · ISS rendezvous ahead`);
      if (u >= 1) { fs.stage = 'dock'; fs.f = beginFlight(); }
    } else if (fs.stage === 'dock') {
      fs.f = advanceFlight(fs.f, dt, { x: Number(on('right')) - Number(on('left')), y: Number(on('up')) - Number(on('down')), approach: on('approach') });
      const f = fs.f; approachPos(f, ship.position); faceAlong(ship, tmp.copy(frame.dir).negate());
      camTo(camGoal.copy(ship.position).addScaledVector(frame.dir, 34).addScaledVector(frame.up, 9), dockPort().clone(), dt, 3);
      const app = f.phase === 'approach';
      showDockingControls(app);
      if (app) {
        target.style.setProperty('--dot-x', `${50 + f.x * targetTravel}%`);
        target.style.setProperty('--dot-y', `${50 - f.y * targetTravel}%`);
        target.classList.toggle('aligned', Math.hypot(f.x, f.y) <= DOCKING_TOLERANCE);
      }
      const help = c.MOBILE ? 'Use the arrows to steer' : 'WASD / arrows to steer · Space to approach';
      status(f.phase === 'launch' ? 'Matching orbit with the ISS' : dockingStatus(f),
        app ? `Range ${Math.round(f.distance)} m · ${help}` : '');
      if (f.phase === 'docked') { fs.stage = 'docked'; fs.t = 0; $('bcSpRet').textContent = 'Undock · return to BURN City'; }
    } else if (fs.stage === 'docked') {
      approachPos(fs.f, ship.position); const a = fs.t * .12;
      camTo(camGoal.copy(frame.pos).addScaledVector(frame.dir, 95 * Math.cos(a)).addScaledVector(frame.right, 95 * Math.sin(a)).addScaledVector(frame.up, 34), frame.pos, dt, 1.5);
      status('Docked at the ISS', 'BURN City below · Return when ready');
    } else if (fs.stage === 'return') {
      const u = Math.min(1, fs.t / RETURN_S), p = ascentPoint(padTop, fs.from3, 1 - u);
      ship.position.set(p.x, p.y + shipBottom * SHIP_SCALE * u, p.z);
      const vel = tmp.subVectors(ship.position, prevPos); if (vel.lengthSq() > 1e-6 && u < .97) faceAlong(ship, vel.clone().normalize());
      if (u > .8) { const k = (u - .8) / .2; ship.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), k); }
      if (u < .85) camTo(camGoal.copy(ship.position).addScaledVector(vel.lengthSq() > 1e-6 ? vel.clone().normalize() : UP, -40).addScaledVector(UP, 14), ship.position, dt, 2.5);
      else camTo(camGoal.set(padTop.x + 46, padTop.y + 20, padTop.z + 46), ship.position, dt, 2);
      status('Returning to BURN City', `Altitude ${Math.round(ship.position.y - padTop.y)} m`);
      if (u >= 1) finish();
    }
  }

  let lodTimer = 0; const sunTint = new THREE.Color();
  (window.__preRender = window.__preRender || []).push(dt => {
    try {
      if (window.__burnTowerOpen) return;
      if (!fs) setFrame(issOrbit(Date.now() / 1000));
      iss.position.copy(frame.pos); iss.lookAt(tmp.copy(frame.pos).add(frame.dir));
      const sunY = c.U ? c.U.sunD.value.y : .5, st = issSunTint(sunY), day = c.U ? c.U.day.value : .5, storm = c.U ? c.U.storm.value : 0;
      sunTint.setRGB(st.r, st.g, st.b);
      const di = C.position.distanceTo(frame.pos), lvl = issLevel(di);
      const have = lvl === 'near' ? (issViews.near || issViews.lod) : lvl === 'lod' ? (issViews.lod || issViews.far) : issViews.far;
      for (const k in issViews) if (issViews[k]) issViews[k].visible = issViews[k] === have;
      // far ISS drawn up to ~3.6x larger with distance (continuous, so no pop at the 420 m LOD switch) so it reads from the street
      const boost = 1 + 2.6 * Math.max(0, Math.min(1, (di - 420) / 600)), tNow = performance.now() / 1000;
      if (issViews.far) { issViews.far.scale.setScalar(boost); const fc = issViews.far.material.color.copy(sunTint).multiplyScalar(day > .5 ? .8 : 1); if (day < .5) { fc.r = Math.max(fc.r, .5); fc.g = Math.max(fc.g, .48); fc.b = Math.max(fc.b, .44); } }   // night: catches the last sunlight / city glow, never a black hole
      if (have && have !== issViews.far) for (const m of issLit) m.emissive.copy(sunTint).multiplyScalar(.5);   // sunlit panels, matching the sky's sun
      SP.levels.iss = have ? Object.keys(issViews).find(k => issViews[k] === have) : 'glint';
      // sunlit glint: steady glow plus a slow flare as the panels catch the sun; nav lights strobe red/white
      const flare = .75 + .25 * Math.max(0, Math.sin(tNow * .9)) ** 6;
      glint.visible = di > 260; glint.material.opacity = Math.min(1, Math.max(have ? 0 : .75, st.glint * (1 - day * .4)) * flare) * (1 - storm * .9);
      glint.scale.setScalar(.026 * (.9 + .35 * flare));
      const span = issHalf * ISS_SCALE * (have === issViews.far ? boost : 1) * .95, navA = (1 - day * .35) * (1 - storm * .8);
      nav[0].position.set(span, 0, 0); nav[1].position.set(-span, 0, 0);
      nav[0].visible = tNow % 1.6 < .2; nav[1].visible = (tNow + .7) % 2.2 < .1; nav[0].material.opacity = nav[1].material.opacity = navA;
      // CB1 + pad lighting: night factor from the City's day uniform
      const nf = 1 - Math.max(0, Math.min(1, (day - .15) / .5)), nearPad = C.position.distanceTo(padTop) < 1600;
      padFx.visible = nearPad; FILL.value = .3 + .35 * nf;
      beamMat.opacity = .16 * nf; beamMesh.visible = nf > .03; poolMat.opacity = .15 + .3 * nf;
      engine.material.opacity = fs ? 1 : .35 + .5 * nf; engine.scale.setScalar(fs && fs.stage !== 'docked' ? 16 : 7);
      beacon.material.opacity = (tNow % 1.2 < .15) ? 1 : .08;
      if (fs) stepFlight(Math.min(dt, .05));
      if ((lodTimer -= dt) <= 0) {
        lodTimer = .4; const ds = C.position.distanceTo(ship.position), sl = shipLevel(ds, !!fs);
        wantShip(sl); if (sl === 'none' && !fs) wantShip('none');
        if (lvl === 'lod') loadIss('lod'); if (lvl === 'near' || (fs && fs.stage !== 'return')) loadIss('near');
        SP._ship = sl;
      }
      showShip(SP._ship || 'none');
    } catch (e) { if (!SP.error) { SP.error = String(e && e.stack || e).slice(0, 300); console.warn('city space', e); } }
  });
  (window.__interactors = window.__interactors || []).push(p => {
    const d = Math.hypot(p.x - PAD.x, p.z - PAD.z) - PAD.r; if (d > 6 || fs) return null;
    return { d: Math.max(0, d), label: 'Board CB1 · fly to the ISS', act: () => SP.launch({ from: 'pad' }) };
  });
  SP.state = () => ({ stage: fs ? fs.stage : 'parked', flight: fs && fs.f ? { ...fs.f } : null, iss: frame.pos.toArray().map(Math.round), levels: { ...SP.levels }, ship: ship.position.toArray().map(Math.round), loads: [...SP.loads], error: SP.error });
  SP.pad = padTop; SP.issPos = () => frame.pos.clone(); SP.ready = true;
  if (Q.has('iss') || Q.get('spacePreview') === '1') setTimeout(() => SP.launch({ from: 'link' }), 2500);
}

if (Q.get('space') !== '0') (function wait(n = 0) {
  const c = window.__city;
  if (c && c.S && c.C && window.__BC && window.__setBurnMode) { try { init(); } catch (e) { SP.error = String(e); console.warn('city space disabled', e); } }
  else if (n < 240) setTimeout(() => wait(n + 1), 500);
})();
