// Burn City Arena: zombie-mode visuals. Low-poly, fully instanced (a handful of draw calls total), no textures/assets.
import * as THREE from 'three';
import { buildNftChar, disposeNftChar } from '../js/nftchar.js';
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
const P = new THREE.Vector3(), Pt = new THREE.Matrix4();
// one instanced mesh per body part; each part has a pivot offset (shoulder/hip) so limbs swing naturally
function rig(scene, max, parts) {
  const out = {};
  for (const [k, geo, mat] of parts) { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < max; i++) m.setColorAt(i, C.set(0xffffff)); scene.add(m); out[k] = m; }
  return out;
}
const box = (w, h, d, py = 0) => new THREE.BoxGeometry(w, h, d).translate(0, py, 0);
// write a part: base transform (pos x/z, yaw, scale) * local offset * local rotation
function put(mesh, i, x, y, z, yaw, sc, ox, oy, oz, rx = 0, rz = 0, col) {
  Q.setFromEuler(E.set(0, yaw, 0)); M.compose(V.set(x, y, z), Q, S.set(sc, sc, sc));
  Q.setFromEuler(E.set(rx, 0, rz)); Pt.compose(P.set(ox, oy, oz), Q, S.set(1, 1, 1)); M.multiply(Pt);
  mesh.setMatrixAt(i, M); if (col) mesh.setColorAt(i, col);
}
const done = (r, n) => { for (const m of Object.values(r)) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };

export function createZombieFX(scene, { low = false } = {}) {
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  // ---------- zombies ----------
  // torn-cloth canvas texture: ragged hem + holes (alphaTest), grime streaks; tinted per instance -> one material, instanced
  const rag = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, 64); for (let x = 0; x <= 64; x += 4) g.lineTo(x, 46 + Math.random() * 18); g.lineTo(64, 64); g.fill();
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(Math.random() * 64, 8 + Math.random() * 36, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over'; for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(40,20,10,${0.2 + Math.random() * 0.35})`; g.fillRect(Math.random() * 64, Math.random() * 40, 2 + Math.random() * 6, 6 + Math.random() * 18); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const cloth = new THREE.MeshLambertMaterial({ color: 0xffffff, map: rag, alphaTest: 0.5, side: THREE.DoubleSide });
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const MAXZ = 48, Z = rig(scene, MAXZ, [
    ['body', box(0.62, 0.8, 0.36, 0.4), lam(0xffffff)], ['head', box(0.42, 0.42, 0.42, 0.21), lam(0xffffff)],
    ['jaw', box(0.3, 0.1, 0.22), lam(0xffffff)], ['shirt', box(0.68, 0.62, 0.42, 0.47), cloth], ['belly', box(0.78, 0.5, 0.56, 0.25), lam(0xffffff)],
    ['arm', box(0.16, 0.72, 0.16, -0.36), lam(0xffffff)], ['leg', box(0.2, 0.78, 0.2, -0.39), lam(0xffffff)],
    ['eye', box(0.09, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    ['glow', new THREE.PlaneGeometry(0.55, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })]]);
  const arms2 = rig(scene, MAXZ, [['arm', box(0.16, 0.72, 0.16, -0.36), lam(0xffffff)], ['leg', box(0.2, 0.78, 0.2, -0.39), lam(0xffffff)], ['eye', box(0.09, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })]]);
  // body variants: 0 walker, 1 runner (lean, hunched forward), 2 brute (huge, belly), 3 crawler-looking (walker id%4==0: bent double, dragging)
  const TY = [{ s: 1, skin: [0x6f9a4a, 0x7c8d55, 0x5d8a62, 0x8a9a6a], eye: 0xfff26a, speed: 1 }, { s: 0.85, skin: [0xa3b86a, 0x9fae7a, 0xb0a888], eye: 0xff3b2f, speed: 2 }, { s: 1.45, skin: [0x55704a, 0x4a5f52, 0x6a6a50], eye: 0xff8a00, speed: 0.6 }];
  const CLOTH = [0x5a3a2a, 0x2f3d55, 0x6a6a6a, 0x7a2a22, 0x3e4a2e, 0x8a7a5a, 0x40304a], PANTS = [0x2a2a33, 0x3a3226, 0x23324a, 0x4a3a2a];
  const zs = new Map(), dying = [];   // id -> {x,z,yaw,ph,var,heat}
  const hit = new THREE.Color(0xffd0a0), burnC = new THREE.Color(0xff5a10), charC = new THREE.Color(0x1a1410), tmp = new THREE.Color(), tmp2 = new THREE.Color(), tmp3 = new THREE.Color(), tmp4 = new THREE.Color();
  const HID = 0.0001;
  function drawZ(i, z, t, fade, burning) {
    const ty = TY[z.ty] || TY[0], crawl = z.ty === 0 && z.id % 4 === 0, brute = z.ty === 2, runner = z.ty === 1;
    const s = ty.s * z.v, ph = z.ph, lurch = Math.sin(ph) * 0.12, sw = Math.sin(ph) * (runner ? 0.9 : 0.6), fl = z.fl || 0, dead = fade !== undefined;
    const tint = (c, base) => { c.setHex(base); if (burning) c.lerp(burnC, 0.45 + 0.3 * Math.sin(t * 30 + z.id)); if (z.flash > 0) c.lerp(hit, z.flash); if (dead) c.lerp(charC, Math.min(1, fade * 2)); return c; };
    const skin = tint(tmp, ty.skin[(z.id * 7) % ty.skin.length]), shirt = tint(tmp3, CLOTH[(z.id * 5 + z.ty) % CLOTH.length]);
    // death: topple forward over 0.35 of the fade, then sink + char. flinch: snap back + small twist.
    const fall = dead ? Math.min(1, fade / 0.35) : 0, pitch = (crawl ? 0.9 : runner ? 0.45 : 0.25) - fl * 0.55 + fall * (1.45 - (crawl ? 0.6 : 0.25));
    const y0 = dead ? Math.max(0, 1 - fall) * 0.78 * s - Math.max(0, fade - 0.5) * 0.9 * s + 0.15 * s * fall : (crawl ? 0.45 : 0.78) * s + Math.abs(Math.cos(ph)) * 0.05 * s;
    const sc = s * (dead ? 1 - Math.max(0, fade - 0.5) * 0.5 : 1), twist = fl * 0.35 * Math.sin(z.id), yaw = z.yaw + twist;
    put(Z.body, i, z.x, y0, z.z, yaw, sc, 0, 0, 0, pitch + lurch, lurch * 0.5, skin);
    put(Z.shirt, i, z.x, y0, z.z, yaw, sc, 0, 0, 0, pitch + lurch, lurch * 0.5, shirt);
    put(Z.belly, i, z.x, y0, z.z, yaw, brute ? sc : HID, 0, 0.02, 0.06, pitch + lurch, 0, tmp2.copy(skin).multiplyScalar(0.85));
    const hp = pitch + 0.1 + lurch, hy = 0.8 * Math.cos(pitch), hz = 0.8 * Math.sin(pitch) + 0.08;
    put(Z.head, i, z.x, y0, z.z, yaw, sc, 0, hy, hz, hp, 0.2 * Math.sin(ph * 0.5) + (crawl ? 0.3 : 0), skin);
    const jawOpen = 0.25 + 0.2 * Math.sin(t * 5 + z.id);
    put(Z.jaw, i, z.x, y0, z.z, yaw, sc, 0, hy + 0.03 - Math.sin(hp) * 0.05, hz + 0.18 + Math.cos(hp) * 0.04, hp + jawOpen, 0, tmp2.copy(skin).multiplyScalar(0.7));
    const eyeC = dead ? tmp4.setHex(0x000000) : tmp4.setHex(ty.eye), ey = hy + 0.25 * Math.cos(hp), ez = hz + 0.22 + 0.25 * Math.sin(hp);
    put(Z.eye, i, z.x, y0, z.z, yaw, sc, 0.1, ey, ez, hp, 0, eyeC); put(arms2.eye, i, z.x, y0, z.z, yaw, sc, -0.1, ey, ez, hp, 0, eyeC);
    put(Z.glow, i, z.x, y0, z.z, yaw, dead || low ? HID : sc, 0, ey, ez + 0.03, hp, 0, eyeC);
    const reach = crawl ? -1.6 : runner ? -0.6 - sw * 0.5 : -1.35, ay = 0.7 * Math.cos(pitch), az = 0.7 * Math.sin(pitch) + 0.05;
    put(Z.arm, i, z.x, y0, z.z, yaw, sc * (brute ? 1.25 : 1), brute ? 0.27 : 0.4, ay, az, reach + sw * 0.3 + fall * 1.2, 0.1, skin);
    put(arms2.arm, i, z.x, y0, z.z, yaw, sc * (brute ? 1.25 : 1), brute ? -0.27 : -0.4, ay, az, (runner ? -0.6 + sw * 0.5 : reach + 0.1) - sw * 0.3 + fall * 1.2, -0.1, skin);
    const pants = tint(tmp2, PANTS[z.id % PANTS.length]), lp = crawl ? 0.9 : 0;
    put(Z.leg, i, z.x, y0, z.z, yaw, sc, 0.16, 0, 0, (crawl ? sw * 0.3 : sw) + lp - fall * 0.3, 0, pants);
    put(arms2.leg, i, z.x, y0, z.z, yaw, sc, -0.16, 0, 0, -(crawl ? sw * 0.3 : sw) + lp - fall * 0.3, 0, pants);
  }
  // ---------- players (third person): suited pyromaniacs, gas-mask helmet, fuel tanks, accent lights in player color ----------
  const MAXP = 16, PL = rig(scene, MAXP, [
    ['body', box(0.62, 0.78, 0.36, 0.39), lam(0x2b2b30)], ['head', box(0.44, 0.44, 0.44, 0.22), lam(0x1d1d22)],
    ['visor', box(0.36, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })], ['mask', box(0.18, 0.18, 0.16), lam(0x3a3a3a)],
    ['tank', new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), lam(0xb33a1a)], ['arm', box(0.17, 0.7, 0.17, -0.35), lam(0x2b2b30)],
    ['leg', box(0.21, 0.78, 0.21, -0.39), lam(0x1f1f24)], ['belt', box(0.66, 0.08, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    ['gun', box(0.1, 0.1, 0.7, 0), lam(0x555555)]]);
  const PL2 = rig(scene, MAXP, [['tank', new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), lam(0xb33a1a)], ['arm', box(0.17, 0.7, 0.17, -0.35), lam(0x2b2b30)], ['leg', box(0.21, 0.78, 0.21, -0.39), lam(0x1f1f24)]]);
  const ps = new Map();
  function drawP(i, p, col) {
    const ph = p.ph, moving = p.spd > 0.5, sw = moving ? Math.sin(ph) * 0.7 : Math.sin(ph * 0.25) * 0.04, bob = moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(ph * 0.25) * 0.02, y = p.down ? 0.25 : 0.78 + bob;
    put(PL.body, i, p.x, y, p.z, p.yaw, 1, 0, 0, 0); put(PL.head, i, p.x, y, p.z, p.yaw, 1, 0, 0.8, 0);
    put(PL.visor, i, p.x, y, p.z, p.yaw, 1, 0, 1.06, 0.22, 0, 0, col); put(PL.mask, i, p.x, y, p.z, p.yaw, 1, 0, 0.9, 0.26);
    put(PL.belt, i, p.x, y, p.z, p.yaw, 1, 0, 0.06, 0, 0, 0, col);
    put(PL.tank, i, p.x, y, p.z, p.yaw, 1, 0.14, 0.42, -0.3); put(PL2.tank, i, p.x, y, p.z, p.yaw, 1, -0.14, 0.42, -0.3);
    put(PL.arm, i, p.x, y, p.z, p.yaw, 1, 0.41, 0.72, 0, -1.2, 0.15); put(PL2.arm, i, p.x, y, p.z, p.yaw, 1, -0.41, 0.72, 0, -1.3, -0.2);   // both hands on the flamethrower
    put(PL.gun, i, p.x, y, p.z, p.yaw, 1, 0.1, 0.45, 0.55);
    put(PL.leg, i, p.x, y, p.z, p.yaw, 1, 0.16, 0, 0, sw); put(PL2.leg, i, p.x, y, p.z, p.yaw, 1, -0.16, 0, 0, -sw);
  }
  // ---------- first-person flamethrower ----------
  const gun = new THREE.Group(), steel = lam(0xa8aeb8), dark = lam(0x4a4a58);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8).rotateX(Math.PI / 2), lam(0xa8aeb8)); barrel.position.set(0, 0, -0.38);
  const body = new THREE.Mesh(box(0.13, 0.15, 0.4), dark); body.position.set(0, -0.03, 0.02);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), lam(0xb33a1a)); tank.position.set(0, -0.14, 0.02); tank.rotation.x = Math.PI / 2;
  const grip = new THREE.Mesh(box(0.06, 0.16, 0.07), dark); grip.position.set(0, -0.12, 0.17); grip.rotation.x = 0.3;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 8).rotateX(Math.PI / 2), steel); nozzle.position.set(0, 0, -0.78);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5ab4ff })); pilot.position.set(0, -0.05, -0.8);
  const accent = new THREE.Mesh(box(0.14, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff })); accent.position.set(0, 0.035, -0.17);   // thin player-colour light band
  gun.add(barrel, body, tank, grip, nozzle, pilot, accent); gun.position.set(0.2, -0.18, -0.34); gun.scale.setScalar(0.36); gun.rotation.y = 0.04; gun.visible = false;
  // fire particles: world-space points with per-particle age, additive; heat light only when firing (skipped in low mode)
  const NP = low ? 90 : 220, pos = new Float32Array(NP * 3), colA = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), age = new Float32Array(NP).fill(9), lifeA = new Float32Array(NP).fill(0.75), pcol = new Array(NP).fill(null);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fire = new THREE.Points(pg, new THREE.PointsMaterial({ size: low ? 0.7 : 0.7, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.frustumCulled = false; scene.add(fire);
  const heat = low ? null : new THREE.PointLight(0xff6a1a, 0, 14, 1.6); if (heat) scene.add(heat);
  let emitAcc = 0, next = 0;
  const cA = new THREE.Color(0xffc060), cB = new THREE.Color(0xff6a10), cC = new THREE.Color(0x401005), cc = new THREE.Color();
  // per-weapon flame profiles: speed, spread, particle life, emit rate, colour (null = player's flame colour / default orange)
  const WP = [{ sp: 9, spr: 0.18, life: 0.75, rate: 1 }, { sp: 10, spr: 0.34, life: 0.85, rate: 1.5, col: new THREE.Color(0xff2a00) }, { sp: 16, spr: 0.45, life: 0.35, rate: 0 }, { sp: 0, spr: 0, life: 0.6, rate: 0, col: new THREE.Color(0xff8a00) }, { sp: 30, spr: 0.015, life: 0.55, rate: 1.3, col: new THREE.Color(0xfff0b0) }];
  function emit(k, ox, oy, oz, dx, dz, sp, life, col) { pos[k * 3] = ox; pos[k * 3 + 1] = oy; pos[k * 3 + 2] = oz; age[k] = 0; lifeA[k] = life; pcol[k] = col; vel[k * 3] = dx * sp; vel[k * 3 + 1] = (Math.random() - 0.3) * 1.2; vel[k * 3 + 2] = dz * sp; }
  function burst(ox, oy, oz, fx, fz, n, pr) { for (let i = 0; i < n; i++) { const k = next = (next + 1) % NP; emit(k, ox, oy, oz, fx + (Math.random() - 0.5) * pr.spr * 2, fz + (Math.random() - 0.5) * pr.spr * 2, pr.sp * (0.7 + Math.random() * 0.6), pr.life, pr.col || null); } }
  function particles(dt, firing, ox, oy, oz, fx, fz, flameCol, rate = 1, stepIt = true, pr = WP[0]) {
    if (firing && pr.rate) { emitAcc += dt * (low ? 110 : 220) * rate * pr.rate;
      while (emitAcc >= 1) { emitAcc--; const k = next = (next + 1) % NP, sp = pr.sp + Math.random() * 4, spr = pr.spr;
        pos[k * 3] = ox; pos[k * 3 + 1] = oy; pos[k * 3 + 2] = oz; age[k] = 0; lifeA[k] = pr.life; pcol[k] = pr.col || null;
        const dx = fx + (Math.random() - 0.5) * spr * 2, dz = fz + (Math.random() - 0.5) * spr * 2;
        vel[k * 3] = dx * sp; vel[k * 3 + 1] = (Math.random() - 0.3) * 1.2; vel[k * 3 + 2] = dz * sp; } }
    if (stepIt) for (let k = 0; k < NP; k++) { const a = (age[k] += dt), life = lifeA[k], fc = pcol[k] || flameCol;
      if (a > life) { pos[k * 3 + 1] = -50; continue; }
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += (vel[k * 3 + 1] + a * 3) * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      vel[k * 3] *= 1 - dt * 1.6; vel[k * 3 + 2] *= 1 - dt * 1.6;
      const u = a / life; if (u < 0.3) cc.copy(cA).lerp(fc || cB, u / 0.3); else cc.copy(fc || cB).lerp(cC, (u - 0.3) / 0.7);
      const f = (1 - u * 0.8) * (0.16 + u * 0.55); colA[k * 3] = cc.r * f; colA[k * 3 + 1] = cc.g * f; colA[k * 3 + 2] = cc.b * f; }
    if (stepIt) { pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; }
  }
  // napalm: lobbed blobs (0.6 s arc) then burning pools; inferno beam: additive cylinders
  const blobs = [], pools = [], NB = 12, NPO = 16, NBM = 8;
  const blobM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a10 }), NB); blobM.count = 0; blobM.frustumCulled = false; scene.add(blobM);
  const poolM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), NPO); poolM.count = 0; poolM.frustumCulled = false; scene.add(poolM);
  const beamM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.16, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), NBM); beamM.count = 0; beamM.frustumCulled = false; scene.add(beamM);
  let nb = 0; const beamAt = (x, y, z, yaw, len) => { if (nb >= NBM) return; Q.setFromEuler(E.set(0, yaw, 0)); M.compose(V.set(x, y, z), Q, S.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, len)); beamM.setMatrixAt(nb++, M); };
  // first-person weapon look per weapon: barrel colour, length, thickness
  const LOOKW = [[0xa8aeb8, 1, 1], [0xb02010, 1.25, 1.1], [0x6a4a2a, 0.6, 2.2], [0x3a4a2a, 0.85, 2.8], [0x9af0ff, 1.15, 0.8]];
  let curW = -1; const setW = w => { if (w === curW) return; curW = w; const [c, l, th] = LOOKW[w] || LOOKW[0]; barrel.material.color.setHex(c); barrel.scale.set(th, th, l); barrel.position.z = -0.38 * l; nozzle.position.z = -0.78 * l; pilot.position.z = -0.8 * l; };
  let t = 0;
  return {
    gun, zs, ps,
    attach(cam) { cam.add(gun); if (!cam.parent) scene.add(cam); },
    shot(e, isMe, meX, meZ) { const pr = WP[e.w === 'napalm' ? 3 : 2], fx = Math.sin(e.y || 0), fz = Math.cos(e.y || 0);
      if (e.w === 'shotgun') { const ox = (isMe ? meX : e.x) + fx * 1.4, oz = (isMe ? meZ : e.z) + fz * 1.4; burst(ox, isMe ? 1.38 : 1.25, oz, fx, fz, low ? 22 : 45, pr); }
      if (e.w === 'napalm' && blobs.length < NB) blobs.push({ x0: isMe ? meX : e.x, z0: isMe ? meZ : e.z, x1: e.tx, z1: e.tz, t: 0 }); },
    zdie(e) { const z = zs.get(e.id); if (z) { dying.push({ ...z, fade: 0 }); zs.delete(e.id); } },
    clear() { for (const q of ps.values()) if (q.nc) disposeNftChar(q.nc); zs.clear(); ps.clear(); dying.length = 0; done(Z, 0); done(arms2, 0); done(PL, 0); done(PL2, 0); age.fill(9); gun.visible = false; blobs.length = pools.length = 0; blobM.count = poolM.count = beamM.count = 0; if (heat) heat.intensity = 0; },
    // st: interpolated state; me: predicted self {x,z,yaw,firing}; colorOf(id) -> THREE.Color
    update(dt, st, me, myId, colorOf, flameCol, nftOf, srv) {
      t += dt; const seen = new Set(); nb = 0;
      for (const s of st.zombies) { seen.add(s.id); let z = zs.get(s.id);
        if (!z) zs.set(s.id, z = { id: s.id, x: s.x, z: s.z, yaw: 0, ph: Math.random() * 6, v: 0.92 + ((s.id * 37) % 17) / 100, ty: s.ty, flash: 0, burnT: 0 });
        const dx = s.x - z.x, dz = s.z - z.z, d = Math.hypot(dx, dz); if (d > 0.01) z.yaw += (((Math.atan2(dx, dz) - z.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        z.x = s.x; z.z = s.z; z.ph += dt * (d / Math.max(dt, 1e-3) * 1.6 * (TY[s.ty]?.speed ? 1 : 1) + 1.5) * 0.9 / (TY[s.ty]?.s || 1); z.ty = s.ty;
        if (s.burn && !z.burnT) { z.flash = 1; z.fl = 1; } z.burnT = s.burn ? 0.4 : Math.max(0, z.burnT - dt); z.flash = Math.max(0, z.flash - dt * 5); z.fl = Math.max(0, (z.fl || 0) - dt * 6); }
      for (const id of zs.keys()) if (!seen.has(id)) { const z = zs.get(id); dying.push({ ...z, fade: 0 }); zs.delete(id); }
      let i = 0; for (const z of zs.values()) { if (i >= MAXZ) break; drawZ(i++, z, t, undefined, z.burnT > 0); }
      for (let k = dying.length - 1; k >= 0; k--) { const z = dying[k]; z.fade += dt * 0.8; z.fl = 0; if (z.fade >= 1) { dying.splice(k, 1); continue; } if (i < MAXZ) drawZ(i++, z, t, z.fade, z.fade < 0.5); }
      done(Z, i); done(arms2, i);
      // other players
      let j = 0; for (const p of st.players) { if (p.id === myId || !p.alive || j >= MAXP) continue; let q = ps.get(p.id);
        if (!q) ps.set(p.id, q = { x: p.x, z: p.z, yaw: p.yaw || 0, ph: 0, spd: 0 });
        const d = Math.hypot(p.x - q.x, p.z - q.z); q.spd += (d / Math.max(dt, 1e-3) - q.spd) * Math.min(1, dt * 8); q.x = p.x; q.z = p.z; q.yaw = p.r ?? q.yaw; q.ph += dt * (q.spd > 0.5 ? 9 : 4);
        if (p.firing && (p.w === 0 || p.w === 1 || p.w === 4)) particles(dt, true, q.x + Math.sin(q.yaw) * 1.1, 1.25, q.z + Math.cos(q.yaw) * 1.1, Math.sin(q.yaw), Math.cos(q.yaw), flameCol, 0.5, false, WP[p.w]);   // others' flames (emit only)
        if (p.firing && p.w === 4) beamAt(q.x + Math.sin(q.yaw) * 1.1, 1.25, q.z + Math.cos(q.yaw) * 1.1, q.yaw, 22);
        const n = nftOf && nftOf(p.id);   // verified NFT holder: their own character instead of the stock pyro
        if (!n && q.nc) { disposeNftChar(q.nc); q.nc = null; }   // ownership lapsed -> back to the stock pyro
        if (n && (!q.nc || q.nc.userData.nftId !== n.id)) { if (q.nc) disposeNftChar(q.nc); try { q.nc = buildNftChar(n, { srv, card: !low }); scene.add(q.nc); } catch (e) { q.nc = null; } }
        if (q.nc) { q.nc.visible = true; q.nc.position.set(q.x, 0, q.z); q.nc.rotation.y = q.yaw; q.nc.rotation.x = 0; if (p.down) { q.nc.rotation.x = -1.3; q.nc.position.y = 0.25; } q.nc.userData.anim(t + p.id, q.spd > 0.5, true); q.seenT = t; continue; }
        q.down = p.down; const blink = p.inv && !p.down && Math.sin(t * 40) > 0; if (q.nc && p.inv && !p.down) q.nc.visible = !blink; drawP(j++, q, blink ? tmp2.setHex(0xffffff) : p.down ? tmp2.setHex(Math.sin(t * 8) > 0 ? 0xff2020 : 0x400000) : colorOf(p.id)); }
      for (const [id, q] of ps) if (q.nc && q.seenT !== t) { if (!st.players.some(p => p.id === id)) { disposeNftChar(q.nc); ps.delete(id); } else q.nc.visible = false; }
      done(PL, j); done(PL2, j);
      // first-person weapon + flames
      gun.visible = !!me; if (me) { setW(me.w || 0); accent.material.color.copy(colorOf(myId)); pilot.scale.setScalar(0.8 + Math.random() * 0.5);
        gun.position.y = -0.18 + Math.sin(t * (me.moving ? 9 : 2)) * (me.moving ? 0.012 : 0.004) + (me.firing ? (Math.random() - 0.5) * 0.008 : 0);
        const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -Math.cos(me.yaw), rz = Math.sin(me.yaw);
        const ox = me.x + fx * 1.5 + rx * 0.2, oz = me.z + fz * 1.5 + rz * 0.2;
        const pr = WP[me.w || 0]; particles(dt, me.firing && (me.w === 0 || me.w === 1 || me.w === 4 || !me.w), ox, 1.38, oz, fx, fz, flameCol, 1, true, pr); if (me.firing && me.w === 4) beamAt(ox, 1.36, oz, me.yaw, 22);
        if (heat) { heat.position.set(me.x + fx * 3, 1.4, me.z + fz * 3); heat.intensity += ((me.firing ? 18 + Math.random() * 8 : 0) - heat.intensity) * Math.min(1, dt * 12); } }
      else particles(dt, false, 0, 0, 0, 0, 1);
      // napalm arcs -> pools (pools emit a few embers)
      let bi = 0; for (let k = blobs.length - 1; k >= 0; k--) { const b = blobs[k]; b.t += dt / 0.6; if (b.t >= 1) { blobs.splice(k, 1); if (pools.length < NPO) pools.push({ x: b.x1, z: b.z1, t: 0 }); burst(b.x1, 0.5, b.z1, 0, 0, low ? 10 : 24, { sp: 3, spr: 1, life: 0.6, col: WP[3].col }); continue; }
        M.makeTranslation(b.x0 + (b.x1 - b.x0) * b.t, 1.3 + Math.sin(b.t * Math.PI) * 4 - b.t * 1.2, b.z0 + (b.z1 - b.z0) * b.t); blobM.setMatrixAt(bi++, M); }
      blobM.count = bi; blobM.instanceMatrix.needsUpdate = true;
      let pi = 0; for (let k = pools.length - 1; k >= 0; k--) { const p = pools[k]; p.t += dt; if (p.t > 4) { pools.splice(k, 1); continue; } const r = 3.2 * Math.min(1, p.t * 4) * (p.t > 3.5 ? (4 - p.t) * 2 : 1);
        M.compose(V.set(p.x, 0.05, p.z), Q.identity(), S.set(r, 1, r)); poolM.setMatrixAt(pi++, M); if (Math.random() < (low ? 0.3 : 0.8)) burst(p.x + (Math.random() - 0.5) * r * 1.4, 0.2, p.z + (Math.random() - 0.5) * r * 1.4, 0, 0, 1, { sp: 0.5, spr: 1, life: 0.7, col: WP[3].col }); }
      poolM.count = pi; poolM.instanceMatrix.needsUpdate = true; beamM.count = nb; beamM.instanceMatrix.needsUpdate = true;
    },
  };
}
