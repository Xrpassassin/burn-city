// PYRETHEUM — the BURN Tower interior (Phase 1: the Ember Hall).
//
// Integration (see HANDOFF.md):
//  * Opened from the BURN tower's existing explore interaction in app.js (interact() -> window.__openBurnTowerInterior).
//  * No second renderer and no second loop: while open, this module's scene/camera are swapped into the city's
//    EffectComposer (same WebGLRenderer, tone mapping, bloom, OutputPass) and app.js frame() calls window.__towerFrame(dt)
//    instead of updExplore(dt). Input is the city's own input state (keys / joystick / look drag / USE button).
//  * The player's city avatar waits at the tower door, so multiplayer is untouched. The first-person body below
//    exists only in this local scene, so other clients never see a duplicate.
//  * Collision: simplified boxes + cylinders + walkable surfaces (floors, dais, stairs, mezzanine), resolved with
//    sub-stepped, axis-separated sliding against a player cylinder (r 0.35 m, h 1.8 m).
//
// Gallery wings and the concealed destination remain prepared-only. Residential access is checked by the game server
// against current XRPL holdings; room interiors are local scene instances, not shared multiplayer spaces yet.
// The Midnightbluff lift asks the server (/api/tower/midnightbluff); the allowlist never reaches the client.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as NftPick from './nftpick.js';

const Q = new URLSearchParams(location.search);
const SRV = Q.get('citysrv') || 'https://burn-city-game.fly.dev';
const TOUCH = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
// Aegis map: put the approved live map URL here (or set window.BURN_CITY_AEGIS_MAP_URL before this module loads).
// Empty = the Sanctum display says "not connected". Never point this at an unapproved URL.
const AEGIS_MAP_URL = '';
if (AEGIS_MAP_URL && !window.BURN_CITY_AEGIS_MAP_URL) window.BURN_CITY_AEGIS_MAP_URL = AEGIS_MAP_URL;
// Midnightbluff private floor: the game server decides, using the player's XAMAN sign-in token.
if (typeof window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK !== 'function') window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK = async () => {
  let t = ''; try { t = localStorage.bcToken || ''; } catch (e) { }
  if (!t) return { allowed: false, reason: 'signin' };
  const r = await fetch(SRV.replace(/\/$/, '') + '/api/tower/midnightbluff', { headers: { authorization: 'Bearer ' + t } });
  if (r.status === 401) return { allowed: false, reason: 'signin' };
  if (!r.ok) throw new Error('check ' + r.status);
  const j = await r.json(); return { allowed: j.allowed === true };
};
const LINKS = { protocol: 'https://xrp.cafe/collection/burn-589-protocol', firekeepers: 'https://xrp.cafe/collection/burn-the-sacred-20', racc: 'https://xrp.cafe/collection/left-hand-savag3' };
const CREATOR = 'Created by BURN (issuer rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV) · listed on xrp.cafe';

// ---------------------------------------------------------------- dimensions (metres)
const HX = 18, HZ = 26, CEIL = 16, MEZZ = 7, SLAB = .5;      // hall half-width, half-depth, ceiling, mezzanine floor
const EDGE = 13;                                           // inner edge of the side mezzanines / column line
const NZ = -20;                                            // south edge of the north mezzanine
const ST0 = -6, ST1 = -20, STX = 14.5;                     // stairs: z from ST0 (y 0) to ST1 (y 7), |x| from STX to HX
const PR = .35, PH = 1.8, EYE = 1.64, STEP = .45, WALK = 4.2, RUN = 7.5;

// ---------------------------------------------------------------- state
let CITY = null, built = false, active = false, opening = false;
let scene, camera, root, hud, fade, panel = null, msgTimer = 0;
let rpass = null, saved = null, lightMul = 1, reveal = 0;
const stations = [], animated = [], hitProxies = [], boxes = [], cyls = [], rects = [], discs = [], ramps = [];
const lights = []; let REACT = null;   // reactor light (flickers)
const P = { pos: new THREE.Vector3(0, 0, 21.5), vy: 0, onGround: true, walk: 0, speed: 0, bodyYaw: 0, seated: false, bob: 0 };
let body = null, MINE = null, nearSt = null, artMesh = null;
const _v = new THREE.Vector3(), _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

// ---------------------------------------------------------------- textures (generated once, no downloads)
function canvasTex(w, h, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(9);
function stoneTiles(g, w, h, tiles, base, spread, grout, veins) {     // big-format stone: per-slab tone, soft veins, thin joints
  const n = tiles, tw = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = base + (rng() - .5) * spread; g.fillStyle = `rgb(${k * 1.04 | 0},${k | 0},${k * 1.08 | 0})`; g.fillRect(i * tw, j * tw, tw, tw);
  }
  for (let i = 0; i < 9000; i++) { const k = base + (rng() - .5) * spread * 2.2; g.fillStyle = `rgba(${k | 0},${k | 0},${k * 1.06 | 0},.18)`; g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3); }
  g.lineCap = 'round';
  for (let i = 0; i < veins; i++) {
    g.strokeStyle = `rgba(${200 + rng() * 40 | 0},${170 + rng() * 40 | 0},${150 + rng() * 30 | 0},${.05 + rng() * .08})`; g.lineWidth = .6 + rng() * 1.6;
    g.beginPath(); let x = rng() * w, y = rng() * h; g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { const nx = x + (rng() - .3) * w * .25, ny = y + (rng() - .5) * h * .18; g.quadraticCurveTo((x + nx) / 2 + (rng() - .5) * 40, (y + ny) / 2 + (rng() - .5) * 40, nx, ny); x = nx; y = ny; }
    g.stroke();
  }
  g.fillStyle = grout; for (let i = 0; i <= n; i++) { g.fillRect(i * tw - 1, 0, 2, h); g.fillRect(0, i * tw - 1, w, 2); }
}
function roughTiles(g, w, h, tiles, lo, hi) {                            // roughness: polished slabs, matte joints, faint wear
  const n = tiles, tw = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const r = lo + rng() * (hi - lo); const k = r * 255 | 0; g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(i * tw, j * tw, tw, tw); }
  for (let i = 0; i < 2500; i++) { const k = (lo + rng() * (hi - lo) * 2) * 255 | 0; g.fillStyle = `rgba(${k},${k},${k},.25)`; g.beginPath(); g.arc(rng() * w, rng() * h, 2 + rng() * 9, 0, 6.3); g.fill(); }
  g.fillStyle = '#e6e6e6'; for (let i = 0; i <= n; i++) { g.fillRect(i * tw - 1.5, 0, 3, h); g.fillRect(0, i * tw - 1.5, w, 3); }
}
function radial(g, w, h, a) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const k = a * 255 | 0, gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, `rgb(${k},${k},${k})`); gr.addColorStop(.55, `rgb(${k * .45 | 0},${k * .45 | 0},${k * .45 | 0})`); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
function plaqueTex(text, sub, accent = '#d7a65e') {
  return canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#0c0a0d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6f5430'; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = accent; g.font = '600 86px Georgia,"Times New Roman",serif';
    const spaced = text.split('').join(String.fromCharCode(8202)); g.fillText(spaced, w / 2, sub ? 104 : h / 2, w - 70);
    if (sub) { g.fillStyle = '#9b8a76'; g.font = '500 34px system-ui,sans-serif'; g.fillText(sub, w / 2, 190, w - 80); }
  });
}

// ---------------------------------------------------------------- materials (shared, few)
let M = null;
function makeMaterials() {
  const floorMap = canvasTex(1024, 1024, (g, w, h) => stoneTiles(g, w, h, 4, 38, 10, '#0d0b0d', 22), [HX * 2 / 9.6, HZ * 2 / 9.6]);
  const floorRough = canvasTex(1024, 1024, (g, w, h) => roughTiles(g, w, h, 4, .2, .34), [HX * 2 / 9.6, HZ * 2 / 9.6], false);
  const wallMap = canvasTex(512, 512, (g, w, h) => stoneTiles(g, w, h, 2, 34, 7, '#121014', 8), [1, 1]);
  const wallRough = canvasTex(512, 512, (g, w, h) => roughTiles(g, w, h, 2, .5, .7), [1, 1], false);
  const brushed = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { const k = 120 + rng() * 110 | 0; g.fillStyle = `rgba(${k},${k},${k},.35)`; g.fillRect(0, rng() * h, w, 1); } }, [2, 2], false);
  const shadow = canvasTex(128, 128, (g, w, h) => radial(g, w, h, .8), [1, 1], false);
  M = {
    floor: new THREE.MeshStandardMaterial({ map: floorMap, roughnessMap: floorRough, roughness: 1, metalness: 0, envMapIntensity: .55 }),
    floorB: null,
    dais: new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: .16, metalness: .05, envMapIntensity: .8 }),
    wall: new THREE.MeshStandardMaterial({ map: wallMap, roughnessMap: wallRough, roughness: 1, metalness: 0, envMapIntensity: .35 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x2b2629, roughness: .4, metalness: 0, envMapIntensity: .5 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1a171a, roughness: .8, metalness: 0, envMapIntensity: .2 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a063, roughness: .32, metalness: 1, roughnessMap: brushed, envMapIntensity: 1.1 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: .36, metalness: .9, roughnessMap: brushed, envMapIntensity: .9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2c2428, roughness: .08, metalness: .1, transparent: true, opacity: .32, depthWrite: false, envMapIntensity: .6 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0x241a1c, roughness: .9, metalness: 0 }),
    inlay: new THREE.MeshStandardMaterial({ color: 0xb38a52, roughness: .6, metalness: 1, envMapIntensity: .5 }),
    amber: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, .52, .18) }),
    amberDim: new THREE.MeshBasicMaterial({ color: new THREE.Color(.34, .13, .04) }),
    warm: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, .86, .68) }),
    core: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .5, .12) }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .75, alphaMap: shadow, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    aisle: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  { const m = floorMap.clone(), r = floorRough.clone(); m.repeat.set(.5, .5); r.repeat.set(.5, .5); m.needsUpdate = r.needsUpdate = true; M.floorB = new THREE.MeshStandardMaterial({ map: m, roughnessMap: r, roughness: 1, metalness: 0, envMapIntensity: .55 }); }
}

// ---------------------------------------------------------------- geometry helpers
// Static geometry is collected per material and merged once -> a handful of draw calls for the whole hall.
const statics = new Map();
function addStatic(geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(1, 1, 1)); g.applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!statics.has(mat)) statics.set(mat, []); statics.get(mat).push(g); return g;
}
function flushStatics() {
  for (const [mat, list] of statics) { const g = mergeGeometries(list, false); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; if (mat.transparent) m.renderOrder = 2; scene.add(m); }
  statics.clear();
}
// box by its min/max corners; uv scaled in metres (so stone keeps one scale everywhere)
function box(x0, x1, y0, y1, z0, z1, mat, solidBox = true, uvScale = 1 / 4.8) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0, g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {   // world-ish planar UVs per face
    const px = pos.getX(i) + (x0 + x1) / 2, py = pos.getY(i) + (y0 + y1) / 2, pz = pos.getZ(i) + (z0 + z1) / 2, nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (ny > .5) uv.setXY(i, px * uvScale, pz * uvScale); else if (nx > .5) uv.setXY(i, pz * uvScale, py * uvScale); else uv.setXY(i, px * uvScale, py * uvScale);
  }
  addStatic(g, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (solidBox) solid(x0, x1, y0, y1, z0, z1);
}
function solid(x0, x1, y0, y1, z0, z1) { boxes.push({ x0, x1, y0, y1, z0, z1 }); }
function cyl(x, z, r, y0, y1) { cyls.push({ x, z, r, y0, y1 }); }
function floorRect(x0, x1, z0, z1, h) { rects.push({ x0, x1, z0, z1, h }); }
function decal(x, z, y, sx, sz, mat = M.shadow, ry = 0) { const g = new THREE.PlaneGeometry(sx, sz); g.rotateX(-Math.PI / 2); addStatic(g, mat, x, y + .012, z, ry); }
function plaque(text, sub, x, y, z, ry, w = 4, accent) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: plaqueTex(text, sub, accent), roughness: .45, metalness: .5, envMapIntensity: .5 }));
  m.position.set(x, y, z); m.rotation.y = ry; scene.add(m);
  // gold hairline frame drawn as four thin boxes in the plaque's plane
  const fr = new THREE.Group(); fr.position.set(x, y, z); fr.rotation.y = ry; const hw = w / 2 + .05, hh = w / 8 + .05;
  for (const [sx, sy, px, py] of [[hw * 2, .025, 0, hh], [hw * 2, .025, 0, -hh], [.025, hh * 2, hw, 0], [.025, hh * 2, -hw, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, .03), M.gold); b.position.set(px, py, .01); fr.add(b); }
  scene.add(fr); return m;
}
function station(id, label, x, y, z, r = 2.6, hit = null) {
  const s = { id, label, x, y, z, r }; stations.push(s);
  if (hit) { const m = new THREE.Mesh(new THREE.BoxGeometry(...hit), M.hit); m.position.set(x, y + hit[1] / 2, z); m.userData.station = s; scene.add(m); hitProxies.push(m); }
  return s;
}
// fluted shaft: subtle architectural grooves catch the light without extra geometry cost per instance
function flutedShaft(r, h, flutes = 16) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, flutes * 4, 1, false); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z); if (rr < 1e-4) continue; const k = 1 - .045 * Math.pow(Math.abs(Math.sin(a * flutes / 2)), .6); p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals(); return g;
}
function instanced(geo, mat, list) {   // list of [x,y,z,ry]
  const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
  list.forEach((t, i) => { o.position.set(t[0], t[1], t[2]); o.rotation.set(0, t[3] || 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
  m.instanceMatrix.needsUpdate = true; scene.add(m); return m;
}
function bevelBox(w, h, d) {           // cheap chamfer: a box with a slightly smaller box on top (reads as a bevel under light)
  const a = new THREE.BoxGeometry(w, h * .8, d); a.translate(0, -h * .1, 0); const b = new THREE.BoxGeometry(w * .94, h * .2, d * .94); b.translate(0, h * .4, 0);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]);
}

// ---------------------------------------------------------------- the building
function build() {
  makeMaterials();
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x050406); scene.fog = new THREE.Fog(0x0b0807, 30, 88);   // warmer, slightly nearer haze for depth
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .05, 160); camera.rotation.order = 'YXZ';
  envMap();
  // --- lighting hierarchy: soft base, sky from the oculus, warm practicals at circulation, restrained reactor red
  const hemi = new THREE.HemisphereLight(0xffe8d6, 0x2a1d1a, 1.25); scene.add(hemi); lights.push([hemi, 1.25]);   // less flat fill: the practicals carry the room
  const sky = new THREE.DirectionalLight(0xfff1e0, 1.5); sky.position.set(4, 30, 6); scene.add(sky); lights.push([sky, 1.5]);
  const pl = (c, i, d, x, y, z) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); scene.add(l); lights.push([l, i]); return l; };
  const reactorLight = pl(0xff4a1c, 100, 15, 0, 3.4, 0); REACT = reactorLight;
  pl(0xffb27a, 120, 24, 0, 5.2, 21.5);        // entrance
  pl(0xffb27a, 90, 18, 0, 5.4, -22.5);         // north lobby / lifts
  if (!TOUCH) { pl(0xffa868, 70, 14, -15.5, 10.2, 13); pl(0xffa868, 60, 13, 0, 11.5, -30); }   // Ember Bar, Aegis Sanctum (desktop only)

  // --- fake light (2 draws, no extra lights): warm bounce pools on the floor under each practical + a soft oculus shaft
  { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c), pos = [], uv = [], col = [], C = new THREE.Color();
    const pool = (x0, z0, rr, hex, k) => { C.setHex(hex).multiplyScalar(k); const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; for (const i of [0, 2, 1, 0, 3, 2]) { pos.push(x0 + P[i][0] * rr, .015, z0 + P[i][1] * rr); uv.push((P[i][0] + 1) / 2, (P[i][1] + 1) / 2); col.push(C.r, C.g, C.b); } };
    pool(0, 0, 7, 0xff4a1c, .32); pool(0, 21.5, 7, 0xffb27a, .22); pool(0, -22.5, 6, 0xffb27a, .2); if (!TOUCH) { pool(-15.5, 13, 5, 0xffa868, .16); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 })); m.matrixAutoUpdate = false; m.renderOrder = 1; scene.add(m);
    const sg = new THREE.CylinderGeometry(2.6, 3.8, 11, 20, 1, true), su = sg.attributes.uv, sc = []; for (let i = 0; i < su.count; i++) { const v = su.getY(i); sc.push(v * v * .05, v * v * .044, v * v * .034); }   // bright at the oculus, fading to the floor
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3)); const shaft = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    shaft.position.set(0, 5.5, 0); shaft.updateMatrix(); shaft.matrixAutoUpdate = false; scene.add(shaft); }
  // --- floors
  { const g = new THREE.PlaneGeometry(HX * 2, HZ * 2); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.floor); m.matrixAutoUpdate = false; scene.add(m); }
  floorRect(-HX, HX, -HZ, HZ, 0); floorRect(-3.4, 3.4, HZ - .4, HZ + 3.6, 0);   // hall + entrance vestibule
  // --- walls (x = ±HX, z = -HZ / +HZ), with openings: entrance (south), Sanctum arch (north, upper), gallery portals (east/west)
  const T = .6, H = CEIL;
  const sideWall = s => {  // gallery portals: ground and upper openings z∈[0,8], lined niches 1.4 m deep (sealed until the gallery phase)
    const a = s > 0 ? HX : -HX - T, b = a + T, X = (u, v) => [Math.min(u, v), Math.max(u, v)], [n0, n1] = X(s * HX, s * (HX + 1.5));
    box(a, b, 0, H, -HZ - T, 0, M.wall); box(a, b, 0, H, 8, HZ + T, M.wall);
    box(a, b, 4.6, MEZZ, 0, 8, M.wall); box(a, b, MEZZ + 4.6, H, 0, 8, M.wall);
    box(...X(s * (HX + 1.4), s * (HX + 1.7)), 0, H, 0, 8, M.wall, false);
    box(n0, n1, 0, H, -.25, 0, M.wall, false); box(n0, n1, 0, H, 8, 8.25, M.wall, false);
    box(n0, n1, 4.6, MEZZ - SLAB, 0, 8, M.ceiling, false); box(n0, n1, MEZZ - SLAB, MEZZ, 0, 8, M.stone, false); box(n0, n1, MEZZ + 4.6, H, 0, 8, M.ceiling, false);
    box(n0, n1, -.02, 0, 0, 8, M.dais, false);
  };
  sideWall(1); sideWall(-1);
  box(-HX - T, -3.4, 0, H, HZ, HZ + T, M.wall); box(3.4, HX + T, 0, H, HZ, HZ + T, M.wall); box(-3.4, 3.4, 6, H, HZ, HZ + T, M.wall);   // south wall around the entrance
  // north wall: solid at ground (lift lobby), arch to the Aegis Sanctum on the mezzanine level
  box(-HX - T, -2.6, 0, H, -HZ - T, -HZ, M.wall); box(2.6, HX + T, 0, H, -HZ - T, -HZ, M.wall);
  box(-2.6, 2.6, 0, MEZZ, -HZ - T, -HZ, M.wall); box(-2.6, 2.6, MEZZ + 4.8, H, -HZ - T, -HZ, M.wall);
  // ceiling + coffers + oculus
  box(-HX - T, HX + T, CEIL, CEIL + .6, -HZ - T, HZ + T, M.ceiling, false);
  for (let x = -HX + 4.5; x < HX; x += 4.5) box(x - .18, x + .18, CEIL - .55, CEIL, -HZ, HZ, M.metal, false);
  for (let z = -HZ + 4.33; z < HZ; z += 4.33) box(-HX, HX, CEIL - .45, CEIL, z - .15, z + .15, M.metal, false);
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, .12, 8, 72), M.gold); ring.rotation.x = Math.PI / 2; ring.position.set(0, CEIL - .58, 0); scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.4, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(.42, .38, .33) })); disc.rotation.x = Math.PI / 2; disc.position.set(0, CEIL - .5, 0); scene.add(disc); }
  // wall-base contact darkening + skirting
  box(-HX, -HX + .06, 0, .22, -HZ, HZ, M.metal, false); box(HX - .06, HX, 0, .22, -HZ, HZ, M.metal, false); box(-HX, HX, 0, .22, -HZ, -HZ + .06, M.metal, false);
  // pilasters with gold reveals on the long walls
  for (let z = -HZ + 6; z < HZ - 2; z += 6) for (const s of [-1, 1]) { if (z > -1 && z < 9) continue; const x = s * (HX - .25); box(x - .25, x + .25, 0, CEIL, z - .55, z + .55, M.wall, true); box(x - s * .27 - .01, x - s * .27 + .01, .3, CEIL - .6, z - .02, z + .02, M.gold, false); }

  mezzanine(); columns(); stairs(); reactor(); entrance(); lobby(); sanctum(); portals(); barAndLounge(); concealed(); residentialSpaces(); rooftopSkyLounge();
  // floor inlays: brushed gold channels from the dais to each threshold, with a fine amber light line beside them
  for (const [x0, x1, z0, z1] of [[-.06, .06, 6.3, HZ], [-.06, .06, -HZ, -6.3], [6.3, EDGE, -.06, .06], [-EDGE, -6.3, -.06, .06]]) {
    box(x0, x1, 0, .004, z0, z1, M.inlay, false);
    const ax = Math.abs(x1 - x0) < 1, ox = ax ? .22 : 0, oz = ax ? 0 : .22;
    box(x0 + ox - .015, x1 + ox + .015 - (ax ? .09 : 0), 0, .003, z0 + oz - .015, z1 + oz + .015 - (ax ? 0 : .09), M.amberDim, false);
  }
  // aisle shading under the side mezzanines (stands in for baked occlusion; the sun can't reach under the slabs)
  for (const s of [-1, 1]) decal(s * (EDGE + HX) / 2, (ST0 + HZ) / 2, 0, HX - EDGE, HZ - ST0, M.aisle);
  decal(0, (-HZ + NZ) / 2, 0, HX * 2, NZ + HZ, M.aisle);
  flushStatics();
  // embers: a few dozen motes rising from the reactor only
  { const n = TOUCH ? 40 : 90, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rng() * 6.28, r = .3 + rng() * 1.6; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 1.4 + rng() * 9; pos[i * 3 + 2] = Math.sin(a) * r; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(1.6, .55, .2), size: .05, transparent: true, opacity: .75, depthWrite: false }));
    pts.userData.tick = (dt) => { const a = g.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * (.35 + (i % 5) * .08); if (y > 11) y = 1.4; a.setY(i, y); } a.needsUpdate = true; };
    scene.add(pts); animated.push(pts); }
  animated.push({ userData: { tick: (dt, t) => { reactorLight.intensity = 100 * lightMul * (.9 + .1 * Math.sin(t * 1.3)); } } });
  body = makeBody(); scene.add(body);
  built = true;
}

function residentialSpaces() {
  // Prototype rooms sit in a private scene wing outside the public atrium. This tower scene is client-local,
  // so no other player can see this room instance; the server supplies a wallet-derived unit label.
  const room = (x0, x1, z0, z1, name, sub, premium) => {
    const y0 = MEZZ, y1 = MEZZ + 4.45, mid = (z0 + z1) / 2;
    floorRect(x0, x1, z0, z1, y0);
    box(x0, x1, y0 - SLAB, y0, z0, z1, premium ? M.floorB : M.stone, false);
    box(x0, x1, y1, y1 + .18, z0, z1, M.ceiling, false);
    box(x0, x0 + .22, y0, y1, z0, mid - 1.15, M.wall);
    box(x0, x0 + .22, y0, y1, mid + 1.15, z1, M.wall);
    box(x1 - .22, x1, y0, y1, z0, z1, M.wall);
    box(x0, x1, y0, y1, z0, z0 + .22, M.wall);
    box(x0, x1, y0, y1, z1 - .22, z1, M.wall);
    station('residence-exit', 'Return to headquarters lift', x0 + .8, y0, mid, 2.3, [1.4, 2.6, 1.4]);
    box(x0 + .20, x0 + .27, y0, y1 - .05, mid - 1.18, mid - 1.10, M.gold, false);
    box(x0 + .20, x0 + .27, y0, y1 - .05, mid + 1.10, mid + 1.18, M.gold, false);
    box(x0 + .20, x0 + .27, y1 - .12, y1 - .04, mid - 1.18, mid + 1.18, M.gold, false);
    plaque(name, sub, (x0 + x1) / 2, y1 - .55, z0 + .25, 0, Math.min(6.2, x1 - x0 - 1), premium ? '#e6bd74' : '#9e8a72');
    const bx = x1 - (premium ? 5.0 : 4.1), bz = mid;
    box(bx - 1.8, bx + 1.8, y0 + .12, y0 + .34, bz - 2.15, bz + 2.15, M.metal);
    box(bx - 1.65, bx + 1.65, y0 + .34, y0 + .62, bz - 2.0, bz + 2.0, premium ? M.floorB : M.stone);
    box(bx - 1.75, bx + 1.75, y0 + .3, y0 + 1.45, bz + 2.0, bz + 2.22, premium ? M.gold : M.metal);
    for (const side of [-1, 1]) {
      box(bx + side * 2.25 - .35, bx + side * 2.25 + .35, y0, y0 + .55, bz - 1.55, bz - .75, M.metal);
      box(bx + side * 2.25 - .4, bx + side * 2.25 + .4, y0 + .55, y0 + .62, bz - 1.6, bz - .7, M.gold, false);
    }
    if (premium) {
      box(x0 + 2.2, x0 + 5.4, y0 + .18, y0 + .48, z1 - 2.5, z1 - 1.65, M.metal);
      box(x0 + 2.25, x0 + 5.35, y0 + .48, y0 + 1.05, z1 - 2.42, z1 - 1.72, M.floorB);
      box(x0 + 6.1, x0 + 8.6, y0 + .18, y0 + .8, z1 - 2.6, z1 - 1.55, M.stone);
      box(x0 + 2.0, x0 + 5.7, y0 + .95, y0 + 1.02, z1 - 1.62, z1 - 1.48, M.gold, false);
      box(x0 + 2.2, x0 + 4.8, y0 + .2, y0 + .35, z0 + 2.0, z0 + 2.8, M.gold, false);
    } else {
      box(x0 + 2.1, x0 + 4.8, y0 + .2, y0 + .8, z1 - 2.5, z1 - 1.55, M.metal);
      box(x0 + 2.15, x0 + 4.75, y0 + .8, y0 + .88, z1 - 2.48, z1 - 1.57, M.stone, false);
      box(x0 + 2.0, x0 + 4.9, y0 + .18, y0 + .28, z0 + 2.1, z0 + 2.8, M.gold, false);
    }
  };
  room(30, 47, -7, 7, 'FIREKEEPER PENTHOUSE', 'PRIVATE RESIDENCE · VERIFIED FIREKEEPERS', true);
  room(53, 68, -7, 7, 'MEMBERS SUITE', '589 PROTOCOL / RACC · PRIVATE RESIDENCE', false);
  for (const x of [32, 44, 55, 66]) {
    box(x - .08, x + .08, MEZZ + 2.4, MEZZ + 3.2, -6.72, -6.62, M.gold, false);
    box(x - .22, x + .22, MEZZ + 2.3, MEZZ + 2.38, -6.70, -6.6, M.amber, false);
  }
}


function rooftopSkyLounge() {
  // BURN Tower crown: a rooftop sky lounge directly above the main atrium.
  // Built from the existing merged-geometry/collision system; no second renderer or downloaded assets.
  const y = CEIL + 4, xEdge = 17.2, zEdge = 24.5;
  floorRect(-xEdge, xEdge, -zEdge, zEdge, y);
  box(-xEdge, xEdge, y - .45, y, -zEdge, zEdge, M.dais, false);
  box(-xEdge + .3, xEdge - .3, y - .05, y, -zEdge + .3, zEdge - .3, M.floorB, false);
  // Gold/ember perimeter inlay frames the observation deck.
  for (const [x0,x1,z0,z1] of [
    [-xEdge+1,xEdge-1,-zEdge+1,-zEdge+.12],
    [-xEdge+1,xEdge-1,zEdge-.12,zEdge-1],
    [-xEdge+.12,xEdge-1,-zEdge+1,zEdge-1],
    [xEdge-1,xEdge-.12,-zEdge+1,zEdge-1]
  ]) box(x0,x1,y+.012,y+.035,z0,z1,M.amber,false);
  // Glass safety wall with dark-metal top rail and regularly spaced supports.
  for (const [x0,x1,z0,z1] of [
    [-xEdge,xEdge,-zEdge-.12,-zEdge+.12],
    [-xEdge,xEdge,zEdge-.12,zEdge+.12],
    [-xEdge-.12,-xEdge+.12,-zEdge,zEdge],
    [xEdge-.12,xEdge+.12,-zEdge,zEdge]
  ]) {
    box(x0,x1,y,y+1.25,z0,z1,M.glass,true);
    box(x0,x1,y+1.22,y+1.34,z0,z1,M.metal,false);
  }
  for (let x=-15.5;x<=15.5;x+=3.1) for (const z of [-zEdge,zEdge]) {
    box(x-.055,x+.055,y,y+1.34,z-.09,z+.09,M.gold,false);
  }
  for (let z=-22;z<=22;z+=3.1) for (const x of [-xEdge,xEdge]) {
    box(x-.09,x+.09,y,y+1.34,z-.055,z+.055,M.gold,false);
  }
  // Low architectural fins, ember light bands, and a dramatic but safe glass overlook.
  for (const x of [-12,-6,0,6,12]) {
    box(x-.07,x+.07,y,y+3.2,-zEdge+1.1,-zEdge+1.3,M.metal,false);
    box(x-.12,x+.12,y+2.85,y+2.94,-zEdge+1.08,-zEdge+1.32,M.amber,false);
  }
  plaque('BURN TOWER', 'PYRETHEUM · SKY LOUNGE', 0, y+3.05, -zEdge+1.38, 0, 5.6, '#e0704a');
  // Panoramic night skyline. Open-source Three.js InstancedMesh keeps the skyline to two draw calls.
  // Buildings and windows are generated locally; no third-party assets, downloads, or license ambiguity.
  const buildingGeo = new THREE.BoxGeometry(1,1,1);
  const buildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, metalness: .15 });
  const windowGeo = new THREE.BoxGeometry(1,1,1);
  const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const skylineBuildings = new THREE.InstancedMesh(buildingGeo, buildingMat, 34);
  const skylineWindows = new THREE.InstancedMesh(windowGeo, windowMat, 340);
  const darks = [0x17131b,0x201820,0x211b21,0x151821];
  const dummy = new THREE.Object3D();
  let wi = 0;
  for (let i=0;i<34;i++) {
    const a = i * 2.399963, radius = 30 + (i%5)*2.7;
    const sx = Math.cos(a)*radius, sz = Math.sin(a)*radius;
    const w = 2.1 + (i%4)*.8, d = 2.2 + (i%3)*.9, h = 5 + (i%7)*2.1;
    dummy.position.set(sx,y+h/2-1.2,sz); dummy.scale.set(w,h,d); dummy.rotation.set(0,(i%4)*Math.PI/2,0); dummy.updateMatrix();
    skylineBuildings.setMatrixAt(i,dummy.matrix);
    skylineBuildings.setColorAt(i,new THREE.Color(darks[i%darks.length]));
    // Two visible facades per tower, with staggered windows and sparse dark floors for a less uniform skyline.
    const rows = Math.min(5,Math.floor(h/2));
    for (let row=0;row<rows;row++) for (const face of [-1,1]) {
      if (wi >= skylineWindows.count) break;
      dummy.position.set(sx-w*.22+(row%2)*.24,y+1+row*1.35,sz+face*(d/2+.025));
      dummy.scale.set(.12,.22,.035); dummy.rotation.set(0,face < 0 ? Math.PI : 0,0); dummy.updateMatrix();
      skylineWindows.setMatrixAt(wi,dummy.matrix);
      skylineWindows.setColorAt(wi,new THREE.Color((i+row)%5===0?0xff6a28:((i+row)%4===0?0x60402c:0xc9975c)));
      wi++;
    }
  }
  skylineWindows.count = wi;
  skylineBuildings.instanceMatrix.needsUpdate = true; skylineWindows.instanceMatrix.needsUpdate = true;
  if (skylineBuildings.instanceColor) skylineBuildings.instanceColor.needsUpdate = true;
  if (skylineWindows.instanceColor) skylineWindows.instanceColor.needsUpdate = true;
  scene.add(skylineBuildings, skylineWindows);
  // Four compact rooftop planters soften the metal-and-glass architecture without external models.
  const planterGeo = new THREE.BoxGeometry(2.4,.55,1.05);
  const planterMat = M.metal;
  const plantGeo = new THREE.ConeGeometry(.22,1.15,5);
  const plantMat = new THREE.MeshStandardMaterial({color:0x26392a,roughness:.95});
  const planters = new THREE.InstancedMesh(planterGeo,planterMat,4);
  const foliage = new THREE.InstancedMesh(plantGeo,plantMat,20);
  let pi=0, fi=0;
  for (const [px,pz] of [[-13.8,-18],[13.8,-18],[-13.8,18],[13.8,18]]) {
    dummy.position.set(px,y+.3,pz); dummy.scale.set(1,1,1); dummy.rotation.set(0,px<0?0:Math.PI,0); dummy.updateMatrix(); planters.setMatrixAt(pi++,dummy.matrix);
    for(let k=0;k<5;k++) {
      dummy.position.set(px-0.85+(k%3)*.82,y+.9+(k%2)*.12,pz+(k%2?-.18:.18));
      dummy.scale.set(.75,.72+(k%3)*.18,.75); dummy.rotation.set(0,k*.8,0); dummy.updateMatrix(); foliage.setMatrixAt(fi++,dummy.matrix);
    }
  }
  planters.instanceMatrix.needsUpdate=true; foliage.instanceMatrix.needsUpdate=true;
  scene.add(planters,foliage);
  // Social furniture kept in the central circulation zone; all decorative meshes share a few materials.
  const sofa = (x,z,rot=0) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4,.38,1.05),M.metal); base.position.y=.35; g.add(base);
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(3.18,.3,.92),M.fabric); cushion.position.set(0,.68,0); g.add(cushion);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.25,.8,.22),M.fabric); back.position.set(0,1.05,-.39); g.add(back);
    for (const sx of [-1.55,1.55]) { const arm=new THREE.Mesh(new THREE.BoxGeometry(.25,.52,1.02),M.fabric); arm.position.set(sx,.72,0); g.add(arm); }
    // Tailored upholstery: inset seat panels, subtle piping, and contrasting throw cushions.
    for (const sx of [-.92,-.3,.32,.94]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(.018,.012,.78),M.stone);
      seam.position.set(sx,.836,0); g.add(seam);
    }
    for (const [px,pz,pr] of [[-1.08,-.23,-.12],[1.08,-.23,.12]]) {
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(.56,.2,.48),M.stone);
      pillow.position.set(px,.91,pz); pillow.rotation.y=pr; g.add(pillow);
      const accent = new THREE.Mesh(new THREE.BoxGeometry(.36,.012,.025),M.gold);
      accent.position.set(px,1.02,pz); accent.rotation.y=pr; g.add(accent);
    }
    g.position.set(x,y,z); g.rotation.y=rot; scene.add(g);
  };
  const table = (x,z) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.68,.72,.12,12),M.gold); top.position.set(x,y+.82,z); scene.add(top);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.12,.2,.72,8),M.metal); stem.position.set(x,y+.42,z); scene.add(stem);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.025,12),M.amber); glow.position.set(x,y+.9,z); scene.add(glow);
    // Small, low-profile tabletop accents add scale without cluttering the walking path.
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.18,8),M.glass);
    vessel.position.set(x-.19,y+.98,z); scene.add(vessel);
    const coaster = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.018,12),M.stone);
    coaster.position.set(x+.2,y+.89,z+.08); scene.add(coaster);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.12,8),M.amber);
    candle.position.set(x+.2,y+.96,z+.08); scene.add(candle);
  };
  sofa(-9,-5,0); sofa(9,-5,Math.PI); sofa(-9,6,0); sofa(9,6,Math.PI);
  for (const [x,z] of [[-6,-5],[6,-5],[-6,6],[6,6]]) table(x,z);
  // Four restrained bar stools: dark pedestal, foot ring, and upholstered seat.
  for (const x of [-1.8,-.6,.6,1.8]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.055,.09,.58,8),M.metal);
    leg.position.set(x,y+.36,9.75); scene.add(leg);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(.17,.025,6,12),M.gold);
    foot.rotation.x=Math.PI/2; foot.position.set(x,y+.22,9.75); scene.add(foot);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.13,12),M.fabric);
    seat.position.set(x,y+.72,9.75); scene.add(seat);
    const seatTrim = new THREE.Mesh(new THREE.TorusGeometry(.3,.018,5,12),M.gold);
    seatTrim.position.set(x,y+.79,9.75); scene.add(seatTrim);
  }
  // Rooftop bar: decorative counter plus backlit shelving; menu interaction is roleplay-only.
  box(-2.8,2.8,y,y+.16,10.5,11.4,M.metal);
  box(-2.7,2.7,y+.16,y+1.15,10.65,11.35,M.stone);
  box(-2.9,2.9,y+1.12,y+1.2,10.6,11.4,M.gold,false);
  box(-2.4,2.4,y+1.35,y+3.0,12.2,12.35,M.metal,false);
  for (let x=-1.8;x<=1.8;x+=.6) box(x-.025,x+.025,y+1.55,y+2.8,12.14,12.18,M.amber,false);
  const crownLight = new THREE.PointLight(0xff5422,TOUCH?34:55,38,2);
  crownLight.position.set(0,y+4,0); scene.add(crownLight); lights.push([crownLight,TOUCH?34:55]);
  const edgeLight = new THREE.PointLight(0xff7a32,TOUCH?18:28,24,2);
  edgeLight.position.set(0,y+1.4,-17); scene.add(edgeLight); lights.push([edgeLight,TOUCH?18:28]);
  station('rooftop-return','Rooftop lift · return to tower',0,y,20.5,2.8,[2.8,2.8,1.3]);
  station('rooftop-bar','BURN Tower sky bar',0,y,9.2,2.8,[6,2.8,1.6]);
  station('rooftop-view','Panoramic observation deck',0,y,-16.5,3.8,[5,2.8,1.2]);
}

function envMap() {   // tiny procedural environment for plausible metal/glass reflections (no HDR download)
  const s = new THREE.Scene(); s.background = new THREE.Color(0x0c0a0c);
  const add = (c, w, h, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m); };
  add(new THREE.Color(2.2, 2, 1.8), 6, 6, 0, 9, 0, Math.PI / 2);                 // oculus
  add(new THREE.Color(1.4, .7, .3), 14, .6, 0, 3, -9); add(new THREE.Color(1.4, .7, .3), 14, .6, 0, 3, 9);   // warm practicals
  add(new THREE.Color(.9, .5, .3), .6, 10, -9, 3, 0, 0, Math.PI / 2); add(new THREE.Color(1.6, .35, .12), 2, 3, 0, 1, 0, 0, 0);
  add(new THREE.Color(.16, .13, .12), 30, 30, 0, -4, 0, Math.PI / 2);
  const pm = new THREE.PMREMGenerator(CITY.R); scene.environment = pm.fromScene(s, .04).texture; pm.dispose();
}
function mezzanine() {
  const y0 = MEZZ - SLAB, y1 = MEZZ;
  const slab = (x0, x1, z0, z1) => { box(x0, x1, y0, y1 - .01, z0, z1, M.stone, true); box(x0, x1, y1 - .01, y1, z0, z1, M.floorB, false); floorRect(x0, x1, z0, z1, MEZZ); };
  slab(-HX, HX, -HZ, NZ);                 // north gallery (lift lobby ceiling below)
  slab(-HX, -EDGE, ST0, HZ); slab(EDGE, HX, ST0, HZ);   // side galleries
  // fascia: satin-gold band + a concealed amber cove under the edge (the only "glow" up here)
  const fas = (x0, x1, z0, z1) => { box(x0, x1, y0 + .14, y0 + .3, z0, z1, M.gold, false); box(x0, x1, y0 - .03, y0, z0, z1, M.amber, false); };
  fas(-EDGE - .04, -EDGE, ST0, HZ); fas(EDGE, EDGE + .04, ST0, HZ); fas(-EDGE, EDGE, NZ, NZ + .04);
  fas(-HX, -EDGE, ST0 - .04, ST0); fas(EDGE, HX, ST0 - .04, ST0); fas(-HX, -STX, NZ, NZ + .04); fas(STX, HX, NZ, NZ + .04);
  // soffit downlights over the aisles (fixtures that justify the aisle light)
  for (let z = -2; z < HZ; z += 6) for (const s of [-1, 1]) { const d = new THREE.CircleGeometry(.16, 16); d.rotateX(Math.PI / 2); addStatic(d, M.warm, s * 15.6, y0 - .005, z); }
  for (let x = -12; x <= 12; x += 6) { const d = new THREE.CircleGeometry(.16, 16); d.rotateX(Math.PI / 2); addStatic(d, M.warm, x, y0 - .005, -23); }
  // railings: smoked glass, satin-gold cap rail, dark shoe. Collision follows them exactly.
  const rail = (x0, x1, z0, z1) => {
    box(x0, x1, MEZZ, MEZZ + .1, z0, z1, M.metal, false); box(x0, x1, MEZZ + .1, MEZZ + 1.02, z0, z1, M.glass, false);
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = along ? x1 - x0 : z1 - z0;
    const g = new THREE.CylinderGeometry(.035, .035, len, 10); g.rotateZ(Math.PI / 2); if (!along) g.rotateY(Math.PI / 2);
    addStatic(g, M.gold, (x0 + x1) / 2, MEZZ + 1.07, (z0 + z1) / 2); solid(x0 - .05, x1 + .05, MEZZ, MEZZ + 1.1, z0 - .05, z1 + .05);
  };
  rail(-EDGE - .06, -EDGE, ST0, HZ); rail(EDGE, EDGE + .06, ST0, HZ);
  rail(-HX, -EDGE, ST0 - .06, ST0); rail(EDGE, HX, ST0 - .06, ST0);
  rail(-STX, STX, NZ, NZ + .06);
}
function columns() {
  const pos = []; for (const s of [-1, 1]) for (let z = NZ; z <= 22; z += 6) pos.push([s * (EDGE + .4), z]); for (const x of [-7.5, 7.5]) pos.push([x, NZ - .4]);
  const lower = flutedShaft(.48, 5.65), upper = flutedShaft(.38, 8.35);
  instanced(lower, M.stone, pos.map(([x, z]) => [x, .35 + 5.65 / 2, z]));
  instanced(upper, M.stone, pos.map(([x, z]) => [x, MEZZ + .25 + 8.35 / 2, z]));
  instanced(bevelBox(1.25, .35, 1.25), M.stone, pos.map(([x, z]) => [x, .175, z]));
  instanced(bevelBox(1.3, .5, 1.3), M.stone, pos.map(([x, z]) => [x, 6.25, z]));
  instanced(bevelBox(.95, .25, .95), M.stone, pos.map(([x, z]) => [x, MEZZ + .125, z]));
  instanced(bevelBox(1.05, .4, 1.05), M.stone, pos.map(([x, z]) => [x, CEIL - .2, z]));
  const ring = new THREE.TorusGeometry(.5, .028, 6, 32); ring.rotateX(Math.PI / 2);
  instanced(ring, M.gold, pos.map(([x, z]) => [x, 5.98, z])); instanced(ring, M.gold, pos.map(([x, z]) => [x, .37, z]));
  for (const [x, z] of pos) { cyl(x, z, .62, 0, 6.5); cyl(x, z, .5, MEZZ, CEIL); decal(x, z, 0, 2.4, 2.4); }
}
function stairs() {   // two grand flights along the side walls, ground (z = ST0) up to the north gallery (z = ST1, y = 7)
  const n = 40, run = (ST0 - ST1) / n, rise = MEZZ / n;
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? STX : -HX, x1 = s > 0 ? HX : -STX;
    for (let i = 0; i < n; i++) { const z1 = ST0 - i * run, z0 = z1 - run, top = rise * (i + 1); box(x0, x1, 0, top - .03, z0, z1, M.stone, false); box(x0, x1, top - .03, top, z0 - .01, z1, M.dais, false); box(x0, x1, top - .04, top - .02, z1 - .03, z1, M.gold, false); }
    ramps.push({ x0, x1, z0: ST1, z1: ST0, h0: MEZZ, h1: 0 });
    // inner balustrade wall + sloped gold handrail
    const bx = s * STX, bw = .18; box(bx - bw / 2, bx + bw / 2, 0, 1, ST1, ST0, M.metal, false);
    for (let i = 0; i < n; i += 1) { const z1 = ST0 - i * run, top = rise * (i + 1); box(bx - bw / 2, bx + bw / 2, 1, top + 1, z1 - run, z1, M.wall, false); }
    const len = Math.hypot(ST0 - ST1, MEZZ);
    const hr = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, len, 10), M.gold); hr.position.set(bx, MEZZ / 2 + 1.05, (ST0 + ST1) / 2); hr.rotation.x = Math.PI / 2 + Math.atan2(MEZZ, ST0 - ST1); scene.add(hr);
    solid(bx - .12, bx + .12, -1, MEZZ + 2, ST1, ST0);
  }
}
function reactor() {
  // dais: two polished steps with satin-gold nosings
  for (const [r, h] of [[6.2, .2], [5.2, .4]]) {
    const g = new THREE.CylinderGeometry(r, r, .2, 64); addStatic(g, M.dais, 0, h - .1, 0); discs.push({ x: 0, z: 0, r, h });
    const ring = new THREE.TorusGeometry(r, .03, 6, 96); ring.rotateX(Math.PI / 2); addStatic(ring, M.gold, 0, h, 0);
  }
  decal(0, 0, 0, 15, 15);
  const drum = new THREE.CylinderGeometry(2.5, 2.7, .9, 48); addStatic(drum, M.stone, 0, .85, 0);
  const band = new THREE.CylinderGeometry(2.52, 2.52, .12, 48, 1, true); addStatic(band, M.gold, 0, 1.18, 0);
  cyl(0, 0, 2.75, 0, CEIL);
  const grp = new THREE.Group(); scene.add(grp);
  // core: glowing column inside a smoked-glass sleeve, capped in dark metal
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, 4.6, 24), M.core); core.position.y = 3.6; grp.add(core);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, 4.8, 32, 1, true), M.glass); sleeve.position.y = 3.6; grp.add(sleeve);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, .9, .35, 32), M.metal); cap.position.y = 6.15; grp.add(cap);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(.22, .9, 16), M.gold); fin.position.y = 6.75; grp.add(fin);
  // eight anodized fins, leaning in like a crown
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 5.2, .5), M.metal, 8), o = new THREE.Object3D();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; o.position.set(Math.cos(a) * 1.85, 3.75, Math.sin(a) * 1.85); o.rotation.set(0, -a, 0); o.rotateZ(.08); o.updateMatrix(); fins.setMatrixAt(i, o.matrix); }
  grp.add(fins);
  // three satin-gold gimbal rings, turning slowly at different tilts
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.35 + i * .32, .045, 8, 96), M.gold); r.position.y = 2.6 + i * 1.3; r.rotation.x = Math.PI / 2 + (i - 1) * .18;
    const sp = [.12, -.08, .05][i]; r.userData.tick = (dt) => { r.rotation.z += sp * dt; }; grp.add(r); animated.push(r);
  }
  core.userData.tick = (dt, t) => { const k = .85 + .15 * Math.sin(t * 1.3); M.core.color.setRGB(2.2 * k * lightMul, .5 * k * lightMul, .12 * k); }; animated.push(core);
  plaque('PYRETHEUM', 'THE EMBER HALL · A CITY WITHIN THE CITY', 0, 8.6, -HZ + .62, 0, 6);
}
function entrance() {   // portal in the south wall: dark-metal jambs, gold reveal, glass doors to the city
  box(-3.9, -3.4, 0, 6.4, HZ - .2, HZ + .8, M.metal, false); box(3.4, 3.9, 0, 6.4, HZ - .2, HZ + .8, M.metal, false); box(-3.9, 3.9, 6, 6.6, HZ - .2, HZ + .8, M.metal, false);
  box(-3.42, -3.36, .1, 6, HZ - .21, HZ - .19, M.gold, false); box(3.36, 3.42, .1, 6, HZ - .21, HZ - .19, M.gold, false); box(-3.4, 3.4, 5.96, 6.02, HZ - .21, HZ - .19, M.gold, false);
  box(-3.4, -3.3, 0, 6, HZ, HZ + 3.6, M.wall); box(3.3, 3.4, 0, 6, HZ, HZ + 3.6, M.wall); box(-3.4, 3.4, 6, 6.4, HZ, HZ + 3.6, M.ceiling, false);
  box(-3.3, 3.3, 0, 6, HZ + 3.5, HZ + 3.56, M.glass);       // doors (closed glass; the exit is an interaction)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(.22, .15, .1) })); glow.position.set(0, 3, HZ + 3.7); glow.rotation.y = Math.PI; scene.add(glow);
  plaque('RETURN TO BURN CITY', null, 0, 7.4, HZ - .25, Math.PI, 3.2);
  station('exit', 'Return to BURN City', 0, 0, HZ + 1.6, 3.2, [6.4, 5.5, 2]);
  // A discreet, wall-mounted directory near the entrance. It describes real current status rather than
  // implying that prepared-only floors or the Aegis integration are already functional.
  box(-17.86, -17.56, .35, 4.5, 15.2, 21.2, M.metal, false);
  box(-17.55, -17.49, .5, 4.3, 15.35, 21.05, M.gold, false);
  plaque('PYRETHEUM DIRECTORY', 'FLOORS · DESTINATIONS · ACCESS', -17.46, 4.9, 18.2, Math.PI / 2, 3.8, '#d7a65e');
  station('directory', 'Pyretheum directory', -15.8, 0, 18.2, 2.8, [1.2, 3.8, 3.6]);
}
function lobby() {     // lift lobby under the north gallery: two cars in anodized frames with gold reveals
  for (const [x, id, label, t, sub] of [[-5, 'lift', 'Headquarters lift', 'HEADQUARTERS', 'UPPER FLOORS · OPENING LATER'], [5, 'elevator', 'Private lift · Midnightbluff', 'PRIVATE', 'MIDNIGHTBLUFF · MEMBERS ONLY']]) {
    box(x - 1.6, x + 1.6, 0, 3.6, -HZ + .0, -HZ + .35, M.metal, false); box(x - 1.15, x + 1.15, .05, 3.1, -HZ + .35, -HZ + .42, M.metal, false);
    box(x - .02, x + .02, .05, 3.1, -HZ + .42, -HZ + .44, M.gold, false); box(x - 1.2, x + 1.2, 3.1, 3.14, -HZ + .35, -HZ + .45, M.gold, false);
    box(x + 1.4, x + 1.55, 1.1, 1.45, -HZ + .35, -HZ + .42, M.amber, false);
    plaque(t, sub, x, 4.3, -HZ + .37, 0, 2.6);
    station(id, label, x, 0, -HZ + 1.6, 2.6, [3, 3.2, 1.2]);
  }
  solid(-HX, HX, 0, MEZZ, -HZ, -HZ + .45);
}
function sanctum() {   // AEGIS SANCTUM: a chamber behind the north gallery; its display is the integration point
  const z0 = -34, z1 = -HZ - .6, y0 = MEZZ, y1 = MEZZ + 6;
  box(-6, 6, y0 - SLAB, y0, z0, z1 + .6, M.stone, true); floorRect(-6, 6, z0, z1 + .6, MEZZ);
  { const g = new THREE.PlaneGeometry(12, z1 + .6 - z0); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, M.floor); m.position.set(0, y0 + .002, (z0 + z1 + .6) / 2); scene.add(m); }
  box(-6.6, -6, y0, y1, z0, z1, M.wall); box(6, 6.6, y0, y1, z0, z1, M.wall); box(-6.6, 6.6, y0, y1, z0 - .6, z0, M.wall); box(-6.6, 6.6, y1, y1 + .5, z0 - .6, z1, M.ceiling, false);
  // archway with gold reveal
  box(-2.9, -2.6, y0, y0 + 4.8, -HZ - .62, -HZ + .02, M.metal, false); box(2.6, 2.9, y0, y0 + 4.8, -HZ - .62, -HZ + .02, M.metal, false); box(-2.9, 2.9, y0 + 4.5, y0 + 4.8, -HZ - .62, -HZ + .02, M.gold, false);
  plaque('AEGIS SANCTUM', null, 0, y0 + 5.6, -HZ + .04, 0, 3.4, '#a9c4e6');
  // display: anodized bezel, black glass, honest status text
  box(-4.3, 4.3, y0 + 1.2, y0 + 5.6, z0 + .02, z0 + .2, M.metal, false);
  const scr = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#05080c'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,170,230,.08)'; g.lineWidth = 1; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.textAlign = 'center'; g.fillStyle = '#9fc2ea'; g.font = '600 46px system-ui,sans-serif'; g.fillText('AEGIS', w / 2, h / 2 - 30);
    g.fillStyle = '#6e8399'; g.font = '400 26px system-ui,sans-serif'; g.fillText(window.BURN_CITY_AEGIS_MAP_URL ? 'Tap to open the live map' : 'Live map not connected yet', w / 2, h / 2 + 26);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.1), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false })); screen.position.set(0, y0 + 3.4, z0 + .21); scene.add(screen);
  box(-3, 3, y0, y0 + .45, z0 + 2.2, z0 + 3, M.stone);   // a low stone bench facing the display
  station('aegis', 'Aegis Sanctum display', 0, MEZZ, z0 + 1.6, 3.4, [8.2, 4.4, .4]);
}
function portals() {   // gallery portals: architecture + signage now, rooms in the gallery phase (sealed, not faked)
  const P4 = [
    { s: -1, y: 0, id: 'protocol', t: '589 PROTOCOL', sub: 'GALLERY · OPENING NEXT PHASE', acc: '#d9a15a' },
    { s: 1, y: 0, id: 'firekeepers', t: 'HALL OF FIREKEEPERS', sub: 'GALLERY · OPENING NEXT PHASE', acc: '#e0704a' },
    { s: 1, y: MEZZ, id: 'racc', t: 'RACC GALLERY', sub: 'GALLERY · OPENING NEXT PHASE', acc: '#b8b4c8' },
    { s: -1, y: MEZZ, id: 'residences', t: 'RESIDENCES', sub: 'PENTHOUSE FLOORS · FUTURE PHASE', acc: '#c9a063' },
  ];
  for (const p of P4) {
    const xf = p.s * (HX - .02), y = p.y;
    box(Math.min(xf, xf + p.s * .5), Math.max(xf, xf + p.s * .5), y, y + 4.6, -.35, .05, M.metal, false); box(Math.min(xf, xf + p.s * .5), Math.max(xf, xf + p.s * .5), y, y + 4.6, 7.95, 8.35, M.metal, false);
    box(Math.min(xf, xf + p.s * .5), Math.max(xf, xf + p.s * .5), y + 4.3, y + 4.6, -.35, 8.35, M.gold, false);
    // sealed bronze-glass screen inside the portal
    box(p.s * (HX + .5) - .03, p.s * (HX + .5) + .03, y + .05, y + 4.3, 0, 8, M.glass, false);
    plaque(p.t, p.sub, p.s * (HX - .04), y + 5.25, 4, -p.s * Math.PI / 2, 3.6, p.acc);
    station(p.id, p.t, p.s * (HX - 1.2), y, 4, 3, null);
  }
}
function barAndLounge() {
  // THE EMBER BAR (west gallery): stone counter, gold edge, backlit shelving
  const bx0 = -15.4, bx1 = -14.6, bz0 = 9, bz1 = 18;
  box(bx0, bx1, MEZZ, MEZZ + 1.08, bz0, bz1, M.stone); box(bx0 - .06, bx1 + .06, MEZZ + 1.08, MEZZ + 1.13, bz0 - .06, bz1 + .06, M.gold, false);
  box(-HX + .02, -HX + .4, MEZZ + 1.3, MEZZ + 3.6, bz0 + .5, bz1 - .5, M.metal, false); box(-HX + .4, -HX + .42, MEZZ + 1.32, MEZZ + 3.58, bz0 + .5, bz1 - .5, M.amberDim, false);
  for (const y of [MEZZ + 1.9, MEZZ + 2.7]) box(-HX + .05, -HX + .75, y, y + .04, bz0 + .5, bz1 - .5, M.glass, false);
  const bottles = []; for (let i = 0; i < 26; i++) bottles.push([-HX + .5, MEZZ + (i % 2 ? 2.08 : 2.88), bz0 + .8 + (i >> 1) * .6]);
  instanced(new THREE.CylinderGeometry(.07, .08, .32, 10), M.glass, bottles);
  instanced(new THREE.CylinderGeometry(.22, .18, .06, 20), M.gold, [0, 1, 2, 3, 4].map(i => [-14.25, MEZZ + .78, bz0 + 1 + i * 1.7]));
  instanced(new THREE.CylinderGeometry(.04, .04, .75, 8), M.metal, [0, 1, 2, 3, 4].map(i => [-14.25, MEZZ + .38, bz0 + 1 + i * 1.7]));
  for (let i = 0; i < 5; i++) cyl(-14.25, bz0 + 1 + i * 1.7, .25, MEZZ, MEZZ + .8);
  plaque('THE EMBER BAR', 'HOUSE MENU', -HX + .06, MEZZ + 4.4, 13.5, Math.PI / 2, 3.2);
  station('bar', 'The Ember Bar', -14.2, MEZZ, 13.5, 3.2, [1.2, 1.3, 9]);
  // THE DIONYSIAN LOUNGE (east gallery): low sofas facing the atrium, stone table
  const sofa = (x, z, ry) => { const g = new THREE.Group(); g.position.set(x, MEZZ, z); g.rotation.y = ry;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, .42, .9), M.fabric); seat.position.set(0, .3, 0); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, .5, .22), M.fabric); back.position.set(0, .7, .36); g.add(back);
    const plinthM = new THREE.Mesh(new THREE.BoxGeometry(2.5, .1, 1), M.metal); plinthM.position.set(0, .05, 0); g.add(plinthM); scene.add(g); };
  sofa(16.2, 13, -Math.PI / 2); sofa(16.2, 17.5, -Math.PI / 2);
  solid(15.7, HX, MEZZ, MEZZ + 1.1, 11.6, 18.9);
  box(14.4, 15.2, MEZZ, MEZZ + .42, 13.6, 16.9, M.dais); box(14.38, 15.22, MEZZ + .4, MEZZ + .42, 13.58, 16.92, M.gold, false); box(14.4, 15.2, MEZZ + .42, MEZZ + .45, 13.6, 16.9, M.dais, false);
  decal(15.8, 15.25, MEZZ, 3.5, 8.5);
  plaque('THE DIONYSIAN LOUNGE', 'SOCIAL LOUNGE', HX - .06, MEZZ + 4.4, 15.25, -Math.PI / 2, 3.4);
  station('sit', 'Take a seat in the lounge', 14.9, MEZZ, 15.25, 2.4, null);
  P.seatPos = new THREE.Vector3(16.15, MEZZ, 15.25);
}
function concealed() {   // a quiet, unmarked recess behind the west stair: reserved for the hidden destination
  box(-HX + .02, -HX + .05, .3, 2.8, -24.2, -22.8, M.gold, false);
  station('hidden', 'A seam in the stone', -HX + .8, 0, -23.5, 1.4, null);
}

// ---------------------------------------------------------------- first-person body (local only)
function makeBody() {
  const suit = new THREE.MeshStandardMaterial({ color: 0x17161c, roughness: .62, metalness: .15, envMapIntensity: .5 });
  const panelM = new THREE.MeshStandardMaterial({ color: 0x0f0e12, roughness: .4, metalness: .6, envMapIntensity: .7 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x0c0b0d, roughness: .3, metalness: .5, envMapIntensity: .8 });
  const g = new THREE.Group(), L = {};
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .26, 6, 16), suit); torso.scale.set(1.12, 1, .66); torso.position.y = 1.16; g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .02), panelM); chest.position.set(0, 1.2, -.094); g.add(chest);
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(.12, .06, 6, 14), suit); pelvis.scale.set(1.2, 1, .75); pelvis.position.y = .95; g.add(pelvis);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.153, .153, .035, 18, 1, true), M.gold); belt.scale.set(1.1, 1, .7); belt.position.y = 1.02; g.add(belt);
  const limb = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat); m.position.y = -len / 2 - r * .3; return m; };
  L.legs = [-1, 1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s * .085, .93, 0); g.add(hip);
    const thigh = limb(.068, .34, suit); hip.add(thigh);
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(.006, .3, .012), M.gold); pipe.position.set(s * .07, -.2, 0); hip.add(pipe);
    const knee = new THREE.Group(); knee.position.y = -.44; hip.add(knee);
    const shin = limb(.058, .32, suit); knee.add(shin);
    const ankle = new THREE.Group(); ankle.position.y = -.42; knee.add(ankle);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.11, .075, .26), boot); foot.position.set(0, -.03, -.06); ankle.add(foot);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(.112, .012, .02), M.gold); toe.position.set(0, -.04, -.19); ankle.add(toe);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.064, .064, .09, 12), boot); cuff.position.y = .02; ankle.add(cuff);
    return { hip, knee, ankle };
  });
  L.arms = [-1, 1].map(s => {
    const sh = new THREE.Group(); sh.position.set(s * .19, 1.34, .02); g.add(sh);
    const up = limb(.05, .26, suit); sh.add(up);
    const el = new THREE.Group(); el.position.y = -.33; sh.add(el); const fo = limb(.044, .24, suit); el.add(fo);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.047, .047, .02, 12), M.gold); cuff.position.y = -.27; el.add(cuff);
    return { sh, el };
  });
  g.userData = L; return g;
}
function poseBody(dt) {
  const L = body.userData, amt = Math.min(1, P.speed / WALK), air = !P.onGround;
  if (P.seated) {
    for (const l of L.legs) { l.hip.rotation.x = 1.45; l.knee.rotation.x = -1.45; l.ankle.rotation.x = 0; }
    for (const a of L.arms) { a.sh.rotation.x = .5; a.el.rotation.x = .4; }
    return;
  }
  P.walk += dt * P.speed * 3.1;                      // phase follows real ground speed: no moonwalking, stops when still
  const sw = Math.sin(P.walk), cw = Math.cos(P.walk), A = .5 * amt;
  // rig faces -z: +x rotation swings a limb forward; knees bend with negative x
  L.legs.forEach((l, i) => {
    const s = i ? -1 : 1;
    if (air) { l.hip.rotation.x = .35 + (i ? .2 : 0); l.knee.rotation.x = -.8; l.ankle.rotation.x = .25; return; }
    l.hip.rotation.x = s * sw * A;
    l.knee.rotation.x = -Math.max(0, -s * cw) * 1.05 * amt - .03;
    l.ankle.rotation.x = -s * sw * A * .35;
  });
  L.arms.forEach((a, i) => { const s = i ? -1 : 1; a.sh.rotation.x = -s * sw * .3 * amt; a.sh.rotation.z = s * .07; a.el.rotation.x = .15 + .25 * amt; });
}

// ---------------------------------------------------------------- collision / ground
function groundAt(x, z, y) {
  let g = -99;
  for (const r of rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.h <= y + STEP && r.h > g) g = r.h;
  for (const d of discs) if (Math.hypot(x - d.x, z - d.z) <= d.r && d.h <= y + STEP && d.h > g) g = d.h;
  for (const r of ramps) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) { const h = r.h1 + (r.h0 - r.h1) * (r.z1 - z) / (r.z1 - r.z0); if (h <= y + STEP && h > g) g = h; }
  return g;
}
function blocked(x, z, y) {
  const top = y + PH, foot = y + STEP;
  for (const b of boxes) if (x + PR > b.x0 && x - PR < b.x1 && z + PR > b.z0 && z - PR < b.z1 && b.y0 < top && b.y1 > foot) return true;
  for (const c of cyls) if (c.y0 < top && c.y1 > foot && (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + PR) ** 2) return true;
  return groundAt(x, z, y) < -50;   // no floor there (void, outside the building)
}
function moveTo(dx, dz) {          // sub-stepped, axis-separated: slides along walls, never tunnels at run speed
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .12)), sx = dx / n, sz = dz / n;
  for (let i = 0; i < n; i++) {
    if (!blocked(P.pos.x + sx, P.pos.z, P.pos.y)) P.pos.x += sx;
    if (!blocked(P.pos.x, P.pos.z + sz, P.pos.y)) P.pos.z += sz;
    const g = groundAt(P.pos.x, P.pos.z, P.pos.y); if (P.onGround && g > P.pos.y) P.pos.y = g;   // walk up steps/ramps
  }
}

// ---------------------------------------------------------------- per-frame (called from app.js frame())
let lastT = 0;
function towerFrame(dt, t) {
  if (!active) return;
  const I = CITY.input, k = I.keys, joy = I.joy, tb = I.tb, yp = I.yp;
  const B = CITY.bloom; B.strength = .38; B.threshold = .85; B.radius = .3; CITY.R.toneMappingExposure = 1.3;
  if (Math.abs(camera.aspect - innerWidth / innerHeight) > 1e-3) { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  // input (same mapping as the city's explore controller)
  let f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - joy.y, s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + joy.x;
  if (panel || reveal > 0) { f = s = 0; }
  const run = k.ShiftLeft || k.ShiftRight || tb.run, jump = (k.Space || tb.jump) && !panel;
  if (P.seated && (Math.abs(f) + Math.abs(s) > .15 || jump)) standUp();
  const fw = _v.set(-Math.sin(yp.yaw), 0, -Math.cos(yp.yaw)), rx = -fw.z, rz = fw.x;
  let mx = fw.x * f + rx * s, mz = fw.z * f + rz * s; const ml = Math.min(1, Math.hypot(mx, mz));   // diagonals never faster
  let speed = 0;
  if (!P.seated && ml > .05) { const sp = (run ? RUN : WALK) * ml, l = Math.hypot(mx, mz); mx = mx / l * sp; mz = mz / l * sp; const ox = P.pos.x, oz = P.pos.z; moveTo(mx * dt, mz * dt); speed = Math.hypot(P.pos.x - ox, P.pos.z - oz) / Math.max(dt, 1e-4); }
  P.speed += (speed - P.speed) * Math.min(1, dt * 12);
  // vertical: gravity, landing, jump with head clearance
  const g = groundAt(P.pos.x, P.pos.z, P.pos.y);
  if (jump && P.onGround && !P.seated) { P.vy = 5.0; P.onGround = false; }
  if (!P.onGround || P.pos.y > g + .02) { P.vy -= 18 * dt; P.pos.y += P.vy * dt; P.onGround = false;
    for (const b of boxes) if (P.vy > 0 && P.pos.x + PR > b.x0 && P.pos.x - PR < b.x1 && P.pos.z + PR > b.z0 && P.pos.z - PR < b.z1 && b.y0 >= P.pos.y + PH - .2 && b.y0 < P.pos.y + PH) { P.vy = 0; P.pos.y = b.y0 - PH; }
    const g2 = groundAt(P.pos.x, P.pos.z, P.pos.y); if (P.pos.y <= g2) { P.pos.y = g2; P.vy = 0; P.onGround = true; } }
  else { P.pos.y = g; P.vy = 0; P.onGround = true; }
  // body follows the view yaw with a short lag (turning in place shows the hips settling)
  let dy = yp.yaw - P.bodyYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.bodyYaw += dy * Math.min(1, dt * (P.speed > .3 ? 12 : 6));
  poseBody(dt);
  // gentle head motion: 1.5 cm at a walk, none standing still
  P.bob = P.onGround && !P.seated ? Math.abs(Math.sin(P.walk)) * .015 * Math.min(1, P.speed / WALK) : 0;
  const eye = P.seated ? 1.18 : EYE;
  const back = .2;   // body sits a little behind the eye so looking down shows chest, legs and boots, never the inside of the torso
  body.position.set(P.pos.x + Math.sin(P.bodyYaw) * back, P.pos.y, P.pos.z + Math.cos(P.bodyYaw) * back); body.rotation.y = P.bodyYaw;
  camera.position.set(P.pos.x, P.pos.y + eye + P.bob, P.pos.z);
  camera.rotation.set(yp.pitch, yp.yaw, 0);
  if (reveal > 0) {   // entrance reveal: lights come up while the view glides in from the doorway and settles
    reveal = Math.max(0, reveal - dt / 2.6); const e = 1 - Math.pow(reveal, 3);
    lightMul = .15 + .85 * e; camera.position.z += 3.2 * (1 - e); camera.position.y += .5 * (1 - e); camera.rotation.x = yp.pitch + .2 * (1 - e);
    fade.style.opacity = String(Math.max(0, 1 - e * 1.6)); body.visible = reveal < .2;
  } else lightMul = 1;
  for (const [l, i] of lights) l.intensity = i * lightMul;
  if (REACT) { const tt = performance.now() / 1000; REACT.intensity *= .9 + .07 * Math.sin(tt * 7.3) + .03 * Math.sin(tt * 19.1); }   // reactor breathes/flickers
  for (const o of animated) o.userData.tick && o.userData.tick(dt, t);
  // nearest station on this level -> reuse the city's prompt and USE button
  nearSt = null; let bd = 1e9;
  for (const st of stations) { if (Math.abs(st.y - P.pos.y) > 2.5) continue; const d = Math.hypot(st.x - P.pos.x, st.z - P.pos.z); if (d < st.r && d < bd) { bd = d; nearSt = st; } }
  const pr = document.getElementById('prompt');
  if (pr) { pr.style.display = nearSt && !panel ? 'block' : 'none'; if (nearSt) pr.textContent = (TOUCH ? '👆 Tap here · ' : 'E · ') + nearSt.label; }
  document.getElementById('tUse')?.classList.toggle('hot', !!nearSt);
}
function standUp() { P.seated = false; P.pos.set(14.9, MEZZ, 15.25); }

// ---------------------------------------------------------------- stations
function interact(id) {
  panel?.remove(); panel = null;
  switch (id) {
    case 'protocol': case 'firekeepers': case 'racc': {
      const names = { protocol: '589 Protocol', firekeepers: 'Firekeepers', racc: 'RACC' }, key = { protocol: '589', firekeepers: 'fk', racc: 'racc' }[id];
      const mine = MINE && MINE.key === key;
      textPanel(({ protocol: '589 PROTOCOL GALLERY', firekeepers: 'HALL OF FIREKEEPERS', racc: 'RACC GALLERY' })[id],
        `This gallery opens in the next phase, with genuine ${names[id]} artwork from the ledger.` + (id === 'racc' ? '' : ' ' + CREATOR + '.') + (mine ? ` Your verified ${MINE.name} will hang here.` : ''),
        () => window.open(mine && MINE.id ? 'https://xrp.cafe/nft/' + MINE.id : LINKS[id], '_blank', 'noopener,noreferrer'), mine ? 'VIEW MY NFT' : 'VIEW COLLECTION');
      break; }
    case 'residences': openResidences(); break;
    case 'residence-exit': travelTo('lift-ground'); break;
    case 'rooftop-return': travelTo('lift-ground'); break;
    case 'rooftop-bar': textPanel('BURN TOWER SKY BAR', 'Welcome to the rooftop bar. Drinks, service, and currency interactions are decorative roleplay only in this phase.'); break;
    case 'rooftop-view': textPanel('PANORAMIC OBSERVATION DECK', 'Take in the BURN City skyline from the crown of PYRETHEUM. The perimeter is enclosed by glass safety barriers.'); break;
    case 'bar': showBarMenu(); break;
    case 'sit': showLoungeMenu(); break;
    case 'directory': showDirectory(); break;
    case 'aegis': showAegis(); break;
    case 'elevator': privateElevator(); break;
    case 'lift': showLiftMenu(); break;
    case 'hidden': toast('Something is behind this stone. Not yet.'); break;
    case 'exit': close(); break;
  }
}
function showDirectory() {
  panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel burn-tower-directory';
  Object.assign(panel.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    width: 'min(600px,calc(100vw - 24px))', maxHeight: 'min(84dvh,780px)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    padding: '16px', background: 'linear-gradient(145deg,#141016fa,#08070afa)',
    border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a',
    color: '#efe3d2', zIndex: 10, pointerEvents: 'auto'
  });
  const head = document.createElement('div');
  Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' });
  const title = document.createElement('h2'); title.textContent = 'PYRETHEUM DIRECTORY';
  Object.assign(title.style, { margin: '0', fontSize: '16px', letterSpacing: '.12em', color: '#d7a65e', fontFamily: 'Georgia,serif', fontWeight: '600', flex: '1' });
  const close = btn('CLOSE', true); close.addEventListener('click', () => { panel?.remove(); panel = null; });
  head.append(title, close); panel.appendChild(head);
  const intro = document.createElement('p');
  intro.textContent = 'Choose a destination to travel to an existing area, or open a destination’s current interaction. Rooms still under construction are labelled honestly.';
  Object.assign(intro.style, { margin: '0 0 8px', color: '#cbbcaa', lineHeight: '1.45', fontSize: '12px' });
  panel.appendChild(intro);
  const list = document.createElement('div');
  Object.assign(list.style, { overflowY: 'auto', minHeight: '0', paddingRight: '3px', overscrollBehavior: 'contain' });
  const groups = [
    { title: 'GROUND FLOOR', rows: [
      ['hall', 'Ember Hall', 'Main atrium and reactor centerpiece.', 'TRAVEL', '#d7a65e'],
      ['lift-ground', 'Headquarters lift · Ground', 'Return to the lift lobby.', 'TRAVEL', '#d7a65e'],
      ['midnightbluff', 'Midnightbluff private lift', 'Server-checked wallet access; the private floor is not open yet.', 'CHECK ACCESS', '#b8a0d8'],
      ['hidden', 'Concealed destination', 'The hidden entrance is a clue only; its destination is not implemented.', 'VIEW STATUS', '#c9a063']
    ]},
    { title: 'MEZZANINE · SOCIAL & INTELLIGENCE', rows: [
      ['mezz', 'Mezzanine', 'Travel to the upper gallery walkway.', 'TRAVEL', '#d7a65e'],
      ['aegis', 'Aegis Sanctum', 'Visit the display and open the configured live map if available.', 'VISIT', '#9fc2ea'],
      ['bar', 'The Ember Bar', 'Open the roleplay house menu. No currency or inventory is charged.', 'OPEN MENU', '#d7a65e'],
      ['lounge', 'Dionysian Lounge', 'Visit the lounge and use the seating interaction.', 'VISIT', '#d7a65e'],
      ['rooftop', 'BURN Tower Sky Lounge', 'Panoramic rooftop deck, glass safety barriers, night skyline, lounge seating, and sky bar.', 'TRAVEL', '#e0704a']
    ]},
    { title: 'GALLERIES & FUTURE FLOORS', rows: [
      ['protocol', '589 Protocol Gallery', 'Dedicated room is not open yet; its collection link is available.', 'COLLECTION', '#d9a15a'],
      ['firekeepers', 'Hall of Firekeepers', 'Dedicated room is not open yet; its collection link is available.', 'COLLECTION', '#e0704a'],
      ['racc', 'RACC Gallery', 'Dedicated room is not open yet; its collection link is available.', 'COLLECTION', '#b8b4c8'],
      ['residences', 'Residences', 'Private penthouse floors are reserved for a later phase.', 'VIEW STATUS', '#c9a063']
    ]}
  ];
  const actions = {
    hall: () => travelTo('hall'),
    'lift-ground': () => travelTo('lift-ground'),
    mezz: () => travelTo('mezz'),
    aegis: () => travelTo('aegis'),
    bar: () => { travelTo('bar'); showBarMenu(); },
    lounge: () => { travelTo('lounge'); showLoungeMenu(); },
    midnightbluff: () => interact('elevator'),
    hidden: () => interact('hidden'),
    protocol: () => interact('protocol'),
    firekeepers: () => interact('firekeepers'),
    racc: () => interact('racc'),
    residences: () => interact('residences'),
     rooftop: () => travelTo('rooftop')
  };
  for (const group of groups) {
    const h = document.createElement('h3'); h.textContent = group.title;
    Object.assign(h.style, { margin: '12px 0 6px', paddingBottom: '6px', borderBottom: '1px solid #493827', fontSize: '10px', letterSpacing: '.12em', color: '#d7a65e' });
    list.appendChild(h);
    for (const [id, name, detail, actionLabel, color] of group.rows) {
      const row = document.createElement('div');
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid #ffffff12' });
      const copy = document.createElement('div'); Object.assign(copy.style, { minWidth: '0', flex: '1' });
      const label = document.createElement('strong'); label.textContent = name;
      Object.assign(label.style, { display: 'block', color: '#f0e3d2', fontSize: '12px' });
      const desc = document.createElement('p'); desc.textContent = detail;
      Object.assign(desc.style, { margin: '4px 0 0', color: '#bcae9f', fontSize: '11px', lineHeight: '1.4' });
      copy.append(label, desc);
      const action = btn(actionLabel, false);
      Object.assign(action.style, { flexShrink: '0', padding: '8px 9px', fontSize: '9px', maxWidth: '104px', whiteSpace: 'normal' });
      action.addEventListener('click', () => {
        const run = actions[id];
        // Close the directory first; the destination interaction may open its own panel.
        panel?.remove(); panel = null;
        if (run) run();
      });
      action.setAttribute('aria-label', actionLabel + ': ' + name);
      action.style.borderColor = color;
      row.append(copy, action); list.appendChild(row);
    }
  }
  panel.appendChild(list);
  const footer = document.createElement('div');
  Object.assign(footer.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '10px' });
  const lift = btn('OPEN LIFT CONTROLS'); lift.addEventListener('click', () => showLiftMenu());
  const exit = btn('EXIT TO CITY', true); exit.addEventListener('click', close);
  footer.append(lift, exit); panel.appendChild(footer);
  root.appendChild(panel);
}
function showLiftMenu() {
  panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel burn-tower-lift';
  Object.assign(panel.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    width: 'min(420px,calc(100vw - 24px))', maxHeight: 'min(80dvh,680px)',
    overflowY: 'auto', padding: '18px', background: 'linear-gradient(145deg,#141016fa,#08070afa)',
    border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a',
    color: '#efe3d2', zIndex: 10, pointerEvents: 'auto'
  });
  const h = document.createElement('h2'); h.textContent = 'HEADQUARTERS LIFT';
  Object.assign(h.style, { margin: '0 0 8px', fontSize: '16px', letterSpacing: '.12em', color: '#d7a65e', fontFamily: 'Georgia,serif' });
  panel.appendChild(h);
  const p = document.createElement('p'); p.textContent = 'Select an open destination. Private and unfinished floors remain locked until their actual rooms are implemented.';
  Object.assign(p.style, { margin: '0 0 12px', color: '#cbbcaa', fontSize: '12px', lineHeight: '1.45' }); panel.appendChild(p);
  const destinations = [
    ['GROUND FLOOR · EMBER HALL', 'hall'],
    ['GROUND FLOOR · LIFT LOBBY', 'lift-ground'],
    ['MEZZANINE WALKWAY', 'mezz'],
    ['AEGIS SANCTUM', 'aegis'],
    ['THE EMBER BAR', 'bar'],
    ['DIONYSIAN LOUNGE', 'lounge'],
    ['PRIVATE RESIDENCES · CHECK WALLET', 'residences'],
    ['BURN TOWER · ROOFTOP SKY LOUNGE', 'rooftop']
  ];
  for (const [label, destination] of destinations) {
    const b = btn(label); Object.assign(b.style, { display: 'block', width: '100%', margin: '7px 0', textAlign: 'left' });
    b.addEventListener('click', () => destination === 'residences' ? interact('residences') : travelTo(destination)); panel.appendChild(b);
  }
  const privateButton = btn('CHECK MIDNIGHTBLUFF ACCESS', true);
  Object.assign(privateButton.style, { display: 'block', width: '100%', margin: '7px 0', textAlign: 'left' });
  privateButton.addEventListener('click', () => interact('elevator')); panel.appendChild(privateButton);
  const c = btn('CLOSE', true); c.style.marginTop = '8px'; c.addEventListener('click', () => { panel?.remove(); panel = null; }); panel.appendChild(c);
  root.appendChild(panel);
}
function takeLoungeSeat() {
  panel?.remove(); panel = null;
  P.seated = true; P.pos.copy(P.seatPos);
  P.vy = 0; P.onGround = true; P.speed = 0; P.walk = 0;
  CITY.input.yp.yaw = Math.PI / 2; CITY.input.yp.pitch = -.05;
  camera.position.set(P.pos.x, P.pos.y + EYE, P.pos.z);
  camera.rotation.set(CITY.input.yp.pitch, CITY.input.yp.yaw, 0);
  toast('You settle into the Dionysian Lounge. Move to stand up.');
}
function showLoungeMenu() {
  panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel burn-tower-lounge-menu';
  Object.assign(panel.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    width: 'min(400px,calc(100vw - 24px))', padding: '18px',
    background: 'linear-gradient(145deg,#141016fa,#08070afa)',
    border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a',
    color: '#efe3d2', zIndex: 10, pointerEvents: 'auto'
  });
  const h = document.createElement('h2'); h.textContent = 'THE DIONYSIAN LOUNGE';
  Object.assign(h.style, { margin: '0 0 8px', fontSize: '15px', letterSpacing: '.1em', color: '#d7a65e', fontFamily: 'Georgia,serif' });
  const p = document.createElement('p'); p.textContent = 'A quiet overlook above the Ember Hall. Take a seat to pause and look across the atrium.';
  Object.assign(p.style, { margin: '0 0 12px', color: '#cbbcaa', fontSize: '12px', lineHeight: '1.5' });
  const seat = btn('TAKE A SEAT'); seat.style.width = '100%'; seat.addEventListener('click', takeLoungeSeat);
  const closeBtn = btn('KEEP EXPLORING', true); Object.assign(closeBtn.style, { width: '100%', marginTop: '8px' });
  closeBtn.addEventListener('click', () => { panel?.remove(); panel = null; });
  panel.append(h, p, seat, closeBtn); root.appendChild(panel);
}
function showBarMenu() {
  panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel burn-tower-bar-menu';
  Object.assign(panel.style, {
    position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
    width: 'min(430px,calc(100vw - 24px))', maxHeight: 'min(82dvh,700px)', overflowY: 'auto',
    padding: '18px', background: 'linear-gradient(145deg,#141016fa,#08070afa)',
    border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a',
    color: '#efe3d2', zIndex: 10, pointerEvents: 'auto'
  });
  const h = document.createElement('h2'); h.textContent = 'THE EMBER BAR';
  Object.assign(h.style, { margin: '0 0 6px', fontSize: '16px', letterSpacing: '.12em', color: '#d7a65e', fontFamily: 'Georgia,serif' });
  panel.appendChild(h);
  const intro = document.createElement('p');
  intro.textContent = 'Choose a house special for a small roleplay moment. This is a cosmetic interaction only: it does not spend currency, change inventory, or apply gameplay effects.';
  Object.assign(intro.style, { margin: '0 0 12px', color: '#cbbcaa', fontSize: '12px', lineHeight: '1.5' });
  panel.appendChild(intro);
  const specials = [
    ['CINDER TEA', 'Smoked black tea, clove, and a slow amber glow.'],
    ['EMBER FIZZ', 'A bright citrus sparkle with a warm red finish.'],
    ['BLACKGLASS TONIC', 'Dark berry, cool mint, and a shimmer like volcanic glass.']
  ];
  for (const [name, description] of specials) {
    const card = document.createElement('div');
    Object.assign(card.style, { padding: '10px', margin: '8px 0', border: '1px solid #493827', borderRadius: '9px', background: '#ffffff05' });
    const title = document.createElement('strong'); title.textContent = name;
    Object.assign(title.style, { display: 'block', color: '#f0d2a2', fontSize: '12px', letterSpacing: '.08em' });
    const detail = document.createElement('p'); detail.textContent = description;
    Object.assign(detail.style, { margin: '5px 0 10px', color: '#bcae9f', fontSize: '11px', lineHeight: '1.45' });
    const order = btn('CHOOSE SPECIAL');
    order.style.width = '100%';
    order.addEventListener('click', () => {
      panel?.remove(); panel = null;
      toast(name + ' selected · roleplay only, no inventory change.');
    });
    card.append(title, detail, order); panel.appendChild(card);
  }
  const c = btn('CLOSE', true); c.style.marginTop = '8px';
  c.addEventListener('click', () => { panel?.remove(); panel = null; });
  panel.appendChild(c); root.appendChild(panel);
}
function travelTo(destination) {
  const points = {
    hall: { x: 0, y: 0, z: 21.5, yaw: 0, message: 'Arrived at Ember Hall.' },
    'lift-ground': { x: -5, y: 0, z: -22.3, yaw: 0, message: 'Arrived at the ground-floor lift lobby.' },
    mezz: { x: -5, y: MEZZ, z: -22.3, yaw: 0, message: 'Arrived at the mezzanine walkway.' },
    aegis: { x: 0, y: MEZZ, z: -30.2, yaw: 0, message: 'Arrived at Aegis Sanctum.' },
    bar: { x: -13.2, y: MEZZ, z: 13.5, yaw: Math.PI / 2, message: 'Arrived at the Ember Bar.' },
    lounge: { x: 13.6, y: MEZZ, z: 15.25, yaw: -Math.PI / 2, message: 'Arrived at the Dionysian Lounge.' },
    penthouse: { x: 34, y: MEZZ, z: 0, yaw: 0, message: 'Welcome home, Firekeeper.' },
    suite: { x: 57, y: MEZZ, z: 0, yaw: 0, message: 'Welcome to your private members suite.' },
    rooftop: { x: 0, y: CEIL + 4, z: 0, yaw: 0, message: 'Welcome to the BURN Tower Sky Lounge.' }
  };
  const target = points[destination];
  if (!target) { toast('That destination is not open yet.'); return; }

  // Never teleport blindly: use the same collision/ground model as walking. If a furnishing or
  // future geometry blocks the preferred arrival point, try nearby offsets on the same floor.
  const offsets = [[0, 0], [0, 1.25], [1.25, 0], [0, -1.25], [-1.25, 0],
    [1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25], [0, 2.5], [2.5, 0], [-2.5, 0]];
  let arrival = null;
  for (const [ox, oz] of offsets) {
    const x = target.x + ox, z = target.z + oz;
    const floor = groundAt(x, z, target.y);
    if (floor < -50 || Math.abs(floor - target.y) > STEP || blocked(x, z, floor)) continue;
    arrival = { x, y: floor, z };
    break;
  }
  if (!arrival) {
    toast('That arrival point is blocked. Please try another destination.');
    return;
  }

  panel?.remove(); panel = null;
  P.pos.set(arrival.x, arrival.y, arrival.z); P.vy = 0; P.onGround = true; P.seated = false; P.speed = 0; P.walk = 0; P.bodyYaw = target.yaw;
  CITY.input.yp.yaw = target.yaw; CITY.input.yp.pitch = 0;
  camera.position.set(P.pos.x, P.pos.y + EYE, P.pos.z); camera.rotation.set(0, target.yaw, 0);
  toast(target.message);
}


async function fetchMyResidences() {
  let token = ''; try { token = localStorage.bcToken || ''; } catch (e) { }
  if (!token) return { error: 'signin' };
  const response = await fetch(SRV.replace(/\/$/, '') + '/api/tower/residence', {
    headers: { authorization: 'Bearer ' + token }, cache: 'no-store'
  });
  if (response.status === 401) return { error: 'signin' };
  if (response.status === 429) return { error: 'slow_down' };
  if (!response.ok) return { error: response.status === 503 ? 'ledger_unavailable' : 'service_unavailable' };
  return response.json();
}
function openResidences() {
  fetchMyResidences().then(data => {
    if (data.error) {
      const messages = { signin: 'Sign in with Xaman first. The server must verify your current XRPL holdings before granting residence access.', slow_down: 'Please wait a moment before checking your residence access again.', ledger_unavailable: 'The XRPL ownership check is temporarily unavailable. No private access was granted.', service_unavailable: 'Residence verification is not available on the connected server yet. No private access was granted.' };
      textPanel('PRIVATE RESIDENCES', messages[data.error] || messages.service_unavailable);
      return;
    }
    const residences = Array.isArray(data.residences) ? data.residences : [];
    panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel burn-tower-residences';
    Object.assign(panel.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,calc(100vw - 24px))', maxHeight: 'min(82dvh,700px)', overflowY: 'auto', padding: '18px', background: 'linear-gradient(145deg,#141016fa,#08070afa)', border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a', color: '#efe3d2', zIndex: 10, pointerEvents: 'auto' });
    const h = document.createElement('h2'); h.textContent = 'YOUR PRIVATE RESIDENCES'; Object.assign(h.style, { margin: '0 0 8px', fontSize: '16px', color: '#d7a65e', letterSpacing: '.1em' }); panel.appendChild(h);
    const p = document.createElement('p'); p.textContent = 'Access is rechecked by the game server against current wallet holdings each time you enter. Your residence is a private local interior instance in this phase; shared multiplayer persistence is a later integration.'; Object.assign(p.style, { margin: '0 0 14px', fontSize: '12px', lineHeight: '1.5', color: '#cbbcaa' }); panel.appendChild(p);
    if (!residences.length) { const empty = document.createElement('p'); empty.textContent = 'No eligible Firekeepers, 589 Protocol, or RACC NFTs were verified for this wallet.'; Object.assign(empty.style, { fontSize: '13px', lineHeight: '1.5' }); panel.appendChild(empty); }
    for (const residence of residences) {
      const premium = residence.kind === 'penthouse';
      const b = btn((premium ? '✦ PENTHOUSE' : '◇ MEMBERS SUITE') + ' · UNIT ' + residence.unit);
      Object.assign(b.style, { display: 'block', width: '100%', textAlign: 'left', margin: '8px 0', padding: '13px', whiteSpace: 'normal', lineHeight: '1.4' });
      const detail = document.createElement('div'); detail.textContent = residence.name + (premium ? ' · best views, private lounge, premium finishes' : ' · compact private suite, refined finishes'); Object.assign(detail.style, { fontSize: '11px', color: '#cbbcaa', margin: '0 0 10px' });
      b.addEventListener('click', async () => {
        b.disabled = true; b.textContent = 'VERIFYING WALLET…';
        let fresh;
        try { fresh = await fetchMyResidences(); } catch (e) { fresh = { error: 'service_unavailable' }; }
        const authorized = fresh && Array.isArray(fresh.residences) && fresh.residences.some(r => r.key === residence.key && r.unit === residence.unit && r.kind === residence.kind);
        if (!authorized) { panel?.remove(); panel = null; toast(fresh?.error === 'signin' ? 'Sign-in expired. Please sign in again.' : 'Residence access could not be re-verified. Entry denied.'); return; }
        travelTo(premium ? 'penthouse' : 'suite');
        toast('UNIT ' + residence.unit + ' · ' + (premium ? 'FIREKEEPER PENTHOUSE' : residence.name.toUpperCase() + ' SUITE'));
      });
      panel.append(b, detail);
    }
    const closeBtn = btn('CLOSE', true); closeBtn.style.marginTop = '8px'; closeBtn.addEventListener('click', () => { panel?.remove(); panel = null; }); panel.appendChild(closeBtn);
    root.appendChild(panel);
  }).catch(() => textPanel('PRIVATE RESIDENCES', 'The wallet ownership service could not be reached. Entry is denied until verification succeeds.'));
}

function textPanel(title, text, action, buttonLabel) {
  panel?.remove(); panel = document.createElement('div'); panel.className = 'burn-tower-panel';
  Object.assign(panel.style, { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(430px,calc(100vw - 32px))', padding: '22px', background: 'linear-gradient(145deg,#141016f5,#08070af5)', border: '1px solid #7a5a34', borderRadius: '14px', boxShadow: '0 20px 60px #000a', color: '#efe3d2', zIndex: 10, pointerEvents: 'auto' });
  const h = document.createElement('h2'); h.textContent = title; Object.assign(h.style, { margin: '0 0 10px', fontSize: '17px', letterSpacing: '.14em', color: '#d7a65e', fontFamily: 'Georgia,serif', fontWeight: '600' }); panel.appendChild(h);
  const p = document.createElement('p'); p.textContent = text; Object.assign(p.style, { lineHeight: '1.55', margin: '0 0 18px', color: '#cbbcaa' }); panel.appendChild(p);
  if (buttonLabel) { const b = btn(buttonLabel); b.addEventListener('click', () => action && action()); panel.appendChild(b); }
  const c = btn('CLOSE', true); c.style.marginLeft = '8px'; c.addEventListener('click', () => { panel?.remove(); panel = null; }); panel.appendChild(c); root.appendChild(panel);
}
function btn(label, quiet) { const b = document.createElement('button'); b.textContent = label; Object.assign(b.style, { cursor: 'pointer', padding: '10px 13px', border: '1px solid ' + (quiet ? '#4a3d33' : '#b0864e'), borderRadius: '9px', background: quiet ? '#100d12' : '#2a1d12', color: quiet ? '#bfae9c' : '#f2d8ae', fontWeight: '700', letterSpacing: '.08em', pointerEvents: 'auto' }); return b; }
function toast(msg) {
  let el = root.querySelector('.burn-tower-toast'); if (!el) { el = document.createElement('div'); el.className = 'burn-tower-toast'; Object.assign(el.style, { position: 'absolute', left: '50%', top: 'max(84px,calc(env(safe-area-inset-top) + 84px))', transform: 'translateX(-50%)', background: '#0d0a0eed', border: '1px solid #6e5230', borderRadius: '10px', padding: '9px 14px', color: '#efdcbf', zIndex: 5, textAlign: 'center', maxWidth: '88vw', transition: 'opacity .3s' }); root.appendChild(el); }
  el.textContent = msg; el.style.opacity = '1'; clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.style.opacity = '0'; }, 2600);
}
function showAegis() {
  const url = window.BURN_CITY_AEGIS_MAP_URL;
  if (!url) { textPanel('AEGIS SANCTUM', 'The Aegis live map is not connected yet. This display is reserved for it once access is approved.'); return; }
  let u; try { u = new URL(url, location.href); if (u.protocol !== 'https:') throw 0; } catch (e) { textPanel('AEGIS MAP UNAVAILABLE', 'The configured map address is not a valid HTTPS link.'); return; }
  panel?.remove(); panel = document.createElement('div');
  Object.assign(panel.style, { position: 'absolute', inset: 'max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))', zIndex: 10, background: '#08070af5', border: '1px solid #7a5a34', borderRadius: '14px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'auto' });
  const top = document.createElement('div'); Object.assign(top.style, { display: 'flex', alignItems: 'center', gap: '8px', color: '#d7a65e', fontWeight: '700', letterSpacing: '.12em' }); top.textContent = 'AEGIS';
  const ext = btn('OPEN IN NEW TAB', true); ext.style.marginLeft = 'auto'; ext.onclick = () => window.open(u.href, '_blank', 'noopener,noreferrer');
  const c = btn('CLOSE'); c.onclick = () => { panel?.remove(); panel = null; }; top.append(ext, c); panel.appendChild(top);
  const fr = document.createElement('iframe'); fr.src = u.href; fr.title = 'Aegis map'; fr.referrerPolicy = 'strict-origin-when-cross-origin'; Object.assign(fr.style, { flex: '1', width: '100%', border: '1px solid #2b2420', borderRadius: '8px', background: '#050406' }); panel.appendChild(fr); root.appendChild(panel);
}
function privateElevator() {   // UI only: the server is the authority (see /api/tower/midnightbluff)
  Promise.resolve().then(() => window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK()).then(r => {
    if (r === true || r?.allowed === true) textPanel('ACCESS GRANTED', 'Your wallet is approved for the Midnightbluff floor. The floor itself opens in a later phase.');
    else if (r?.reason === 'signin') textPanel('SIGN IN REQUIRED', 'Sign in with XAMAN in BURN City first. The server then checks whether your wallet is approved for the Midnightbluff floor.');
    else textPanel('ACCESS DENIED', 'This wallet is not currently approved for the Midnightbluff floor. Access is decided by the server.');
  }).catch(() => textPanel('ACCESS CHECK FAILED', 'The access service could not be reached. No access was granted. Try again later.'));
}

// ---------------------------------------------------------------- open / close
// While inside, every city overlay is hidden (visibility, so nothing underneath can take a tap) except the canvas,
// the shared prompt, the touch joystick/buttons and multiplayer chat. The exceptions sit inside the hiding selector itself:
// a separate 'visibility:visible' rule loses on specificity ((1,1,1) < (1,1,2)), which hid the joystick and USE on phones.
const TOWER_CSS = 'body.in-tower>*:not(canvas):not(#burnTowerInterior):not(#prompt):not(#touch):not(#chat){visibility:hidden!important}body.in-tower #tUp,body.in-tower #tDown,body.in-tower #tSkate,body.in-tower #minimap{display:none!important}';
let onKey = null, onDown = null, onMove = null, onUp = null, styleEl = null;
function hangMyNft() {
  let mine = null; try { mine = NftPick.current(); } catch (e) { }
  MINE = mine && ['fk', '589', 'racc'].includes(mine.key) ? mine : null;
}
export async function openBurnTowerInterior() {
  if (active || opening) return; opening = true;
  CITY = window.__city; if (!CITY || !CITY.comp) { opening = false; return; }
  // black curtain first, so building/compiling never shows a frozen half-frame
  root = document.createElement('div'); root.id = 'burnTowerInterior';
  Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: '40', pointerEvents: 'none', color: '#efe3d2', font: '14px system-ui,sans-serif' });
  fade = document.createElement('div'); Object.assign(fade.style, { position: 'absolute', inset: '0', background: '#000', opacity: '0', transition: 'opacity .45s', pointerEvents: 'none' }); root.appendChild(fade);
  document.body.appendChild(root); requestAnimationFrame(() => { fade.style.opacity = '1'; });
  await new Promise(r => setTimeout(r, 470));
  try {
    if (!built) build();
    hangMyNft();
    P.pos.set(0, 0, 21.5); P.vy = 0; P.onGround = true; P.seated = false; P.speed = 0; P.walk = 0; P.bodyYaw = 0;
    rpass = CITY.comp.passes[0];
    saved = { scene: rpass.scene, camera: rpass.camera, yaw: CITY.input.yp.yaw, pitch: CITY.input.yp.pitch, bokeh: CITY.bokeh.enabled, bloom: [CITY.bloom.strength, CITY.bloom.threshold, CITY.bloom.radius] };
    CITY.input.yp.yaw = 0; CITY.input.yp.pitch = 0; lightMul = .15;
    camera.position.set(0, EYE, 21.5); camera.rotation.set(0, 0, 0);
    try { if (CITY.R.compileAsync) await CITY.R.compileAsync(scene, camera); else CITY.R.compile(scene, camera); } catch (e) { CITY.R.compile(scene, camera); }
  } catch (e) { console.error('PYRETHEUM', e); root.remove(); root = null; opening = false; return; }
  rpass.scene = scene; rpass.camera = camera; CITY.bokeh.enabled = false;
  styleEl = document.createElement('style'); styleEl.textContent = TOWER_CSS; document.head.appendChild(styleEl); document.body.classList.add('in-tower');
  addHud(); bindInput();
  fade.style.transition = 'none'; active = true; opening = false; reveal = 1; window.__burnTowerOpen = true; dispatchEvent(new Event('burntower:open'));
}
function addHud() {
  hud = document.createElement('div');
  Object.assign(hud.style, { position: 'absolute', left: 'max(12px,env(safe-area-inset-left))', top: 'max(12px,env(safe-area-inset-top))', padding: '10px 12px', background: '#0a080be0', border: '1px solid #4d3b26', borderRadius: '12px', color: '#e9dcc8', zIndex: 3, pointerEvents: 'auto', maxWidth: 'min(330px,calc(100vw - 24px))' });
  hud.innerHTML = '<div style="font:600 13px Georgia,serif;letter-spacing:.24em;color:#d7a65e">BURN TOWER · PYRETHEUM</div><div style="margin-top:3px;font-size:12px;color:#a8998a">' + (TOUCH ? 'Joystick to walk · drag to look · USE near signs' : 'WASD to walk · drag to look · E or click to use · Esc to leave') + '</div>';
  const ex = btn('← EXIT TO CITY'); ex.style.marginTop = '8px'; ex.style.padding = '8px 11px'; ex.addEventListener('click', close); hud.appendChild(ex); root.appendChild(hud);
}
function bindInput() {
  const cv = CITY.R.domElement; let down = null;
  onKey = e => { if (e.code === 'Escape') { if (panel) { panel.remove(); panel = null; } else close(); } };
  // desktop: left-drag looks (right-drag already looks through the city's handler); a click without a drag uses what's under the cursor
  onDown = e => { if (e.pointerType === 'mouse' && e.button === 0) down = { x: e.clientX, y: e.clientY, moved: 0 }; else if (e.pointerType !== 'mouse') down = { x: e.clientX, y: e.clientY, moved: 0 }; };
  onMove = e => { if (!down || e.pointerType !== 'mouse' || !(e.buttons & 1)) return; const yp = CITY.input.yp; yp.yaw -= e.movementX * .0028; yp.pitch = Math.max(-1.45, Math.min(1.3, yp.pitch - e.movementY * .0028)); down.moved += Math.abs(e.movementX) + Math.abs(e.movementY); };
  onUp = e => {
    if (!down) return; const moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y)); down = null; if (moved > 8 || panel) return;
    _ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); _ray.setFromCamera(_ndc, camera);
    const hit = _ray.intersectObjects(hitProxies, false)[0]; if (hit && hit.distance < 9) interact(hit.object.userData.station.id);
  };
  addEventListener('keydown', onKey); cv.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
}
function close() {
  if (!active) return; active = false; window.__burnTowerOpen = false;
  const cv = CITY.R.domElement; removeEventListener('keydown', onKey); cv.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp);
  rpass.scene = saved.scene; rpass.camera = saved.camera; CITY.bokeh.enabled = saved.bokeh;
  [CITY.bloom.strength, CITY.bloom.threshold, CITY.bloom.radius] = saved.bloom;
  CITY.input.yp.yaw = saved.yaw; CITY.input.yp.pitch = saved.pitch;
  for (const k of Object.keys(CITY.input.keys)) CITY.input.keys[k] = 0;
  document.body.classList.remove('in-tower'); styleEl?.remove(); styleEl = null;
  panel = null; root?.remove(); root = null; hud = null;
  const pr = document.getElementById('prompt'); if (pr) pr.style.display = 'none';
  dispatchEvent(new Event('burntower:close'));
}
window.__openBurnTowerInterior = openBurnTowerInterior;
window.__closeBurnTowerInterior = close;
window.__towerFrame = towerFrame;
window.__towerInteract = () => { if (!active) return; if (panel) { panel.remove(); panel = null; return; } if (nearSt) interact(nearSt.id); else toast('Walk up to a sign, a lift or the exit.'); };
if (Q.has('towertest')) window.__towerTest = {
  interact, travelTo, P, get camera() { return camera; }, get panel() { return panel; },
  get near() { return nearSt; }, get scene() { return scene; }, blocked, groundAt, stations,
  body: () => body, close,
  // Quick browser-console diagnostic for directory/lift destination smoke tests.
  checkDestinations() {
    const points = {
      hall: [0, 0, 21.5], 'lift-ground': [-5, 0, -22.3], mezz: [-5, MEZZ, -22.3],
      aegis: [0, MEZZ, -30.2], bar: [-13.2, MEZZ, 13.5], lounge: [13.6, MEZZ, 15.25], rooftop: [0, CEIL + 4, 0]
    };
    return Object.entries(points).map(([id, [x, y, z]]) => {
      const floor = groundAt(x, z, y);
      return { id, floor, expectedFloor: y, hasFloor: floor > -50,
        floorMatches: Math.abs(floor - y) <= STEP, blocked: floor > -50 ? blocked(x, z, floor) : true };
    });
  },
  sim(sec) { for (let i = 0; i < sec * 60; i++) towerFrame(1 / 60, performance.now() / 1000); }
};
