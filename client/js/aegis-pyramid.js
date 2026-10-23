// AEGIS Pyramid HQ: a glass/metal pyramid landmark on open ground north-east of the centre (x 84, z 214), between the inner districts
// and the Wilds trailhead. It is the only place the live AEGIS feed shows up in the city (aegis.js mounts its cam screens on the
// faces, the command table + Response Ops beacons + drones gather around it). The feed never touches weather, sky or billboards.
//  - idle (feed off / down / not yet read): dim cyan, standby posters on the faces.
//  - NORMAL: cyan apex glow + faint beam, slow breathe.  ELEVATED: amber, beam brightens, ~1 Hz pulse.  CRITICAL: red, strong fast pulse.
//  - Cheap: 4 draw calls (merged body, merged glow edges + apex, beam, standby faces). Top-level scene group, so the deep Wilds
//    city-hide (wilds-gate.js cityOff/hideNew) hides it like every other city group; its collider is stashed with the rest.
//  - ?debug=1: window.__aegisPyr.force('NORMAL'|'ELEVATED'|'CRITICAL'|'idle'|null) forces the look (and, through aegis.js, the
//    table/beacons/drones); null hands control back to the feed.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search), DEBUG = Q.get('debug') === '1';
const X = 84, Z = 214, HB = 13, H = 30, TILT = Math.atan2(HB, H);   // half base, height, face angle from vertical
const COL = [new THREE.Color('#2fe3ff'), new THREE.Color('#ffb000'), new THREE.Color('#ff3b2a')], IDLE = new THREE.Color('#1f7f95');
const P = window.__aegisPyr = { x: X, z: Z, half: HB, h: H, ready: false, failed: false, level: -1, forced: undefined, mounts, force: DEBUG ? force : undefined };

// faces: local +z of each mount points out of that face. Order: the faces that look toward the town centre first (phones show 2).
function faceYaws() { const toC = Math.atan2(-X, -Z); const all = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const d = a => Math.abs(Math.atan2(Math.sin(a - toC), Math.cos(a - toC))); return all.sort((a, b) => d(a) - d(b)); }
// screen mounts for aegis.js (screen centre ~30% up each face, lying on the face, a hair proud of the glass)
function mounts(n) {
  const f = .3, ly = 1.2 + f * H + .25 * Math.sin(TILT), lz = HB * (1 - f) + .25 * Math.cos(TILT);
  return faceYaws().slice(0, n).map(yaw => ({ where: 'pyramid', x: X, z: Z, y: P.gy || 0, yaw, w: 12, h: 7.2, lx: 0, ly, lz, tilt: TILT }));
}

function merge(list) {   // non-indexed position/normal(/uv) merge, no addon import
  const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; gs.forEach(g => n += g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); if (!g.attributes.normal) g.computeVertexNormals(); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
const bar = (a, b, t) => { const len = a.distanceTo(b), g = new THREE.BoxGeometry(t, len, t), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.compose(a.clone().add(b).multiplyScalar(.5), q, new THREE.Vector3(1, 1, 1)); return g.applyMatrix4(m); };

function standbyTex() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#04121c'); gr.addColorStop(1, '#010509'); g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
  g.strokeStyle = '#2fe3ff22'; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 320); g.stroke(); } for (let y = 0; y < 320; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = '#2fe3ff88'; g.lineWidth = 3; g.beginPath(); g.moveTo(256, 60); g.lineTo(330, 190); g.lineTo(182, 190); g.closePath(); g.stroke();
  g.textAlign = 'center'; g.fillStyle = '#d8f8ff'; g.font = '900 40px system-ui,sans-serif'; g.fillText('PROJECT AEGIS', 256, 240);
  g.fillStyle = '#7fd8ee'; g.font = '700 22px system-ui,sans-serif'; g.fillText('CITY WATCH HQ · STANDBY', 256, 276);
  g.strokeStyle = '#2fe3ff66'; g.lineWidth = 4; g.strokeRect(2, 2, 508, 316);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

let G = null;
function build() {
  const c = window.__city; P.gy = c.groundAt ? c.groundAt(X, Z, 0) : 0;
  const g = new THREE.Group(); g.name = 'aegis_pyramid'; g.position.set(X, P.gy, Z);
  // body: plinth + 4 glass faces (one opaque metallic-glass material) + a lighter cap band
  const pyr = new THREE.ConeGeometry(HB * Math.SQRT2, H, 4, 1, true).rotateY(Math.PI / 4).translate(0, H / 2 + 1.2, 0);
  const plinth = new THREE.BoxGeometry(2 * HB + 4, 1.2, 2 * HB + 4).translate(0, .6, 0);
  const steps = new THREE.BoxGeometry(10, .6, 3).translate(0, .3, -(HB + 3.2));
  const body = new THREE.Mesh(merge([pyr, plinth, steps.rotateY(faceYaws()[0] + Math.PI)]), new THREE.MeshStandardMaterial({ color: 0x0b1824, metalness: .92, roughness: .16, emissive: 0x03141e, emissiveIntensity: 1, flatShading: true }));
  // glow: 4 slanted edges, base frame, two horizontal bands, apex crystal (additive, colour = threat)
  const apex = new THREE.Vector3(0, H + 1.2, 0), cor = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * HB, 1.2, sz * HB));
  const parts = cor.map(v => bar(v, apex, .35));
  for (let i = 0; i < 4; i++) parts.push(bar(cor[i], cor[(i + 1) % 4], .3));
  for (const f of [.62, .8]) { const y = 1.2 + f * H, r = HB * (1 - f); const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(sx * r, y, sz * r)); for (let i = 0; i < 4; i++) parts.push(bar(cs[i], cs[(i + 1) % 4], .18)); }
  parts.push(new THREE.OctahedronGeometry(1.6, 0).scale(1, 1.6, 1).translate(0, H + 3.4, 0));
  const glowM = new THREE.MeshBasicMaterial({ color: IDLE.clone(), transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(merge(parts), glowM);
  // apex beam: open cylinder, fades with height
  const beamM = new THREE.ShaderMaterial({ uniforms: { c: { value: IDLE.clone() }, a: { value: .08 }, t: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 c;uniform float a,t;varying vec2 vU;void main(){float f=pow(1.-vU.y,1.6);float s=.8+.2*sin(t*4.-vU.y*30.);gl_FragColor=vec4(c*(f*s*a),1.);}' });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.6, 140, 12, 1, true).translate(0, 70 + H + 3, 0), beamM); beam.frustumCulled = false;
  // standby posters on every face (one merged mesh, one texture): shown until aegis.js puts live screens there
  const sb = mounts(4).map(m => new THREE.PlaneGeometry(m.w, m.h).applyMatrix4(new THREE.Matrix4().makeRotationX(-m.tilt)).translate(0, m.ly, m.lz - .12).applyMatrix4(new THREE.Matrix4().makeRotationY(m.yaw)));
  const standby = new THREE.Mesh(merge(sb), new THREE.MeshBasicMaterial({ map: standbyTex(), color: 0xbfbfbf, toneMapped: false }));
  body.userData = standby.userData = { kind: 'aegis', cam: null, label: 'AEGIS Pyramid HQ · tap for the AEGIS console' };
  g.add(body, glow, beam, standby); c.S.add(g); c.pick.push(body, standby);
  if (c.colliders) c.colliders.push(P.coll = { x: X, z: Z, r: HB + .5, h: H * .5 });
  // Dedicated Light Cycles launch kiosk beside the Pyramid. It is a physical sign/pad, not a floating portal.
  {
    const plaza = new THREE.Group();
    plaza.name = 'aegis_light_cycles_launch';
    plaza.position.set(X + 20, P.gy, Z);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x07131f, metalness: .85, roughness: .28, emissive: 0x063b52, emissiveIntensity: 1.1 });
    const neon = new THREE.MeshBasicMaterial({ color: 0x36f3ff, toneMapped: false });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(5.2, .22, 4.2), padMat);
    pad.position.y = .11; plaza.add(pad);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(5.4, .07, .12), neon);
    trim.position.set(0, .25, 2.05); plaza.add(trim);
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 320;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#030b14'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.strokeStyle = '#36f3ff'; cx.lineWidth = 10; cx.strokeRect(8, 8, cv.width - 16, cv.height - 16);
    cx.fillStyle = '#36f3ff'; cx.font = 'bold 36px system-ui,sans-serif'; cx.textAlign = 'center';
    cx.fillText('AEGIS TRANSIT', 320, 75);
    cx.fillStyle = '#ffffff'; cx.font = 'bold 52px system-ui,sans-serif'; cx.fillText('LIGHT CYCLES', 320, 155);
    cx.fillStyle = '#9baeff'; cx.font = 'bold 26px system-ui,sans-serif'; cx.fillText('NEON GRID  ·  ENTER ARENA', 320, 230);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    sign.position.set(0, 2.6, 1.25); plaza.add(sign);
    c.S.add(plaza);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(6.5, 5.5, 5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false }));
    hit.position.set(X + 20, P.gy + 2.7, Z);
    hit.userData = { kind: 'experience', experienceId: 'light-cycles', label: 'Light Cycles · Neon Grid', description: 'Enter the Light Cycles arena. Your city return point will be this Aegis Pyramid plaza.', returnTo: 'aegis-pyramid-plaza', returnX: X + 23, returnZ: Z, returnYaw: -Math.PI / 2 };
    c.S.add(hit); c.pick.push(hit);
    if (c.colliders) c.colliders.push({ x: X + 20, z: Z, r: 2.2, h: 1.1 });
    P.lightCyclesPlaza = plaza;
  }
  G = { g, body, glow, glowM, beam, beamM, standby, col: IDLE.clone() };
  P.group = g; P.ready = true;
}

// level: forced (debug) > feed (aegis.js ok/ready) > idle. Idle = feed off, unreachable or not yet read.
function liveLevel() {
  if (P.forced !== undefined && P.forced !== null) return P.forced;
  const A = window.__aegis; if (!A || !A.lastOk || A.state === 'off' || A.state === 'error' && !A.data) return -1;
  return Math.max(0, Math.min(2, window.__aegisThreat | 0));
}
function force(name) {
  const lv = name === 'idle' ? -1 : name == null ? null : ({ NORMAL: 0, ELEVATED: 1, CRITICAL: 2 })[name] ?? Math.max(-1, Math.min(2, +name | 0));
  P.forced = lv === null ? undefined : lv;
  const A = window.__aegis; try { if (A && A.force) A.force(lv === null ? null : Math.max(0, lv)); } catch (e) { console.warn('aegis force', e); }
  return lv;
}
let lt = 0;
function frame() {
  requestAnimationFrame(frame); if (!G || window.__cityPaused || document.hidden) return;   // the deep Wilds hides + pauses the city
  const now = performance.now(), t = now / 1000, dt = Math.min(.1, (now - (lt || now)) / 1000); lt = now;
  const lv = liveLevel(); P.level = lv; const rm = !!window.__reducedMotion;
  const tgt = lv < 0 ? IDLE : COL[lv]; G.col.lerp(tgt, Math.min(1, dt * 3));
  const pulse = rm ? .5 : lv === 2 ? .5 + .5 * Math.sin(t * 2 * Math.PI * 1.6) : lv === 1 ? .5 + .5 * Math.sin(t * 2 * Math.PI * .9) : .5 + .5 * Math.sin(t * .9);
  const gA = lv < 0 ? .35 : lv === 0 ? .55 + .1 * pulse : lv === 1 ? .6 + .3 * pulse : .45 + .55 * pulse;
  const bA = lv < 0 ? .06 : lv === 0 ? .22 + .05 * pulse : lv === 1 ? .45 + .2 * pulse : .55 + .45 * pulse;
  G.glowM.color.copy(G.col); G.glowM.opacity = gA; G.beamM.uniforms.c.value.copy(G.col); G.beamM.uniforms.a.value = bA; G.beamM.uniforms.t.value = t;
  const bw = lv === 2 ? 1 + .35 * pulse : 1; G.beam.scale.set(bw, 1, bw);
  const A = window.__aegis, live = !!(A && A.screens && A.screens.some(s => s.m && s.m.where === 'pyramid'));
  G.standby.visible = !live; P.screensLive = live; P.beamA = +bA.toFixed(3); P.glowA = +gA.toFixed(3); P.colHex = '#' + G.col.getHexString();
}

(function boot(n = 0) {
  const c = window.__city;
  if (!window.__ready || !c || !c.S) { if (n > 400) { P.failed = true; return; } return setTimeout(() => boot(n + 1), 500); }
  try { build(); frame(); } catch (e) { P.failed = true; console.warn('aegis pyramid', e); }
})();
