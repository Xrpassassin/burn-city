// Burn City Arena: zombie-mode visuals. Low-poly, fully instanced (a handful of draw calls total), no textures/assets.
import * as THREE from 'three';
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
  const MAXZ = 48, Z = rig(scene, MAXZ, [
    ['body', box(0.62, 0.8, 0.36, 0.4), lam(0xffffff)], ['head', box(0.42, 0.42, 0.42, 0.21), lam(0xffffff)],
    ['arm', box(0.16, 0.72, 0.16, -0.36), lam(0xffffff)], ['leg', box(0.2, 0.78, 0.2, -0.39), lam(0xffffff)],
    ['eye', box(0.3, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })]]);
  const arms2 = rig(scene, MAXZ, [['arm', box(0.16, 0.72, 0.16, -0.36), lam(0xffffff)], ['leg', box(0.2, 0.78, 0.2, -0.39), lam(0xffffff)]]);
  const TY = [{ s: 1, skin: [0x6f9a4a, 0x7c8d55, 0x5d8a62], eye: 0xfff26a, speed: 1 }, { s: 0.85, skin: [0xa3b86a, 0x9fae7a], eye: 0xff3b2f, speed: 2 }, { s: 1.45, skin: [0x55704a, 0x4a5f52], eye: 0xff8a00, speed: 0.6 }];
  const zs = new Map(), dying = [];   // id -> {x,z,yaw,ph,var,heat}
  const hit = new THREE.Color(0xffd0a0), burnC = new THREE.Color(0xff5a10), charC = new THREE.Color(0x1a1410), tmp = new THREE.Color(), tmp2 = new THREE.Color();
  function drawZ(i, z, t, fade, burning) {
    const ty = TY[z.ty] || TY[0], s = ty.s * z.v, ph = z.ph, lurch = Math.sin(ph) * 0.12, sw = Math.sin(ph) * 0.6;
    tmp.setHex(ty.skin[z.id % ty.skin.length]); if (burning) tmp.lerp(burnC, 0.45 + 0.3 * Math.sin(t * 30 + z.id)); if (z.flash > 0) tmp.lerp(hit, z.flash);
    if (fade !== undefined) tmp.lerp(charC, Math.min(1, fade * 2));
    const y = fade !== undefined ? -fade * 1.2 * s : Math.abs(Math.cos(ph)) * 0.05 * s, sc = s * (fade !== undefined ? 1 - fade * 0.35 : 1);
    put(Z.body, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, 0, 0, 0, 0.25 + lurch, lurch * 0.5, tmp);
    put(Z.head, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, 0, 0.8, 0.08, 0.35 + lurch, 0.2 * Math.sin(ph * 0.5), tmp);
    put(Z.eye, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, 0, 1.03, 0.31, 0.35, 0, tmp2.setHex(fade !== undefined ? 0x000000 : ty.eye));
    put(Z.arm, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, 0.4, 0.7, 0.05, -1.35 + sw * 0.3, 0.1, tmp);       // arms reach forward
    put(arms2.arm, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, -0.4, 0.7, 0.05, -1.25 - sw * 0.3, -0.1, tmp);
    put(Z.leg, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, 0.16, 0, 0, sw, 0, tmp.multiplyScalar(0.7));
    put(arms2.leg, i, z.x, y + 0.78 * s, z.z, z.yaw, sc, -0.16, 0, 0, -sw, 0, tmp);
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
    const ph = p.ph, moving = p.spd > 0.5, sw = moving ? Math.sin(ph) * 0.7 : Math.sin(ph * 0.25) * 0.04, bob = moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(ph * 0.25) * 0.02, y = 0.78 + bob;
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
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 8).rotateX(Math.PI / 2), steel); barrel.position.set(0, 0, -0.38);
  const body = new THREE.Mesh(box(0.13, 0.15, 0.4), dark); body.position.set(0, -0.03, 0.02);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), lam(0xb33a1a)); tank.position.set(0, -0.14, 0.02); tank.rotation.x = Math.PI / 2;
  const grip = new THREE.Mesh(box(0.06, 0.16, 0.07), dark); grip.position.set(0, -0.12, 0.17); grip.rotation.x = 0.3;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 8).rotateX(Math.PI / 2), steel); nozzle.position.set(0, 0, -0.78);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5ab4ff })); pilot.position.set(0, -0.05, -0.8);
  const accent = new THREE.Mesh(box(0.14, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff })); accent.position.set(0, 0.035, -0.17);   // thin player-colour light band
  gun.add(barrel, body, tank, grip, nozzle, pilot, accent); gun.position.set(0.2, -0.18, -0.34); gun.scale.setScalar(0.36); gun.rotation.y = 0.04; gun.visible = false;
  // fire particles: world-space points with per-particle age, additive; heat light only when firing (skipped in low mode)
  const NP = low ? 70 : 160, pos = new Float32Array(NP * 3), colA = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), age = new Float32Array(NP).fill(9);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fire = new THREE.Points(pg, new THREE.PointsMaterial({ size: low ? 0.7 : 0.7, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.frustumCulled = false; scene.add(fire);
  const heat = low ? null : new THREE.PointLight(0xff6a1a, 0, 14, 1.6); if (heat) scene.add(heat);
  let emitAcc = 0, next = 0;
  const cA = new THREE.Color(0xffc060), cB = new THREE.Color(0xff6a10), cC = new THREE.Color(0x401005), cc = new THREE.Color();
  function particles(dt, firing, ox, oy, oz, fx, fz, flameCol, rate = 1, stepIt = true) {
    if (firing) { emitAcc += dt * (low ? 110 : 220) * rate;
      while (emitAcc >= 1) { emitAcc--; const k = next = (next + 1) % NP, sp = 9 + Math.random() * 4, spr = 0.18;
        pos[k * 3] = ox; pos[k * 3 + 1] = oy; pos[k * 3 + 2] = oz; age[k] = 0;
        const dx = fx + (Math.random() - 0.5) * spr * 2, dz = fz + (Math.random() - 0.5) * spr * 2;
        vel[k * 3] = dx * sp; vel[k * 3 + 1] = (Math.random() - 0.3) * 1.2; vel[k * 3 + 2] = dz * sp; } }
    if (stepIt) for (let k = 0; k < NP; k++) { const a = (age[k] += dt), life = 0.75;
      if (a > life) { pos[k * 3 + 1] = -50; continue; }
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += (vel[k * 3 + 1] + a * 3) * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      vel[k * 3] *= 1 - dt * 1.6; vel[k * 3 + 2] *= 1 - dt * 1.6;
      const u = a / life; if (u < 0.3) cc.copy(cA).lerp(flameCol || cB, u / 0.3); else cc.copy(flameCol || cB).lerp(cC, (u - 0.3) / 0.7);
      const f = (1 - u * 0.8) * (0.16 + u * 0.55); colA[k * 3] = cc.r * f; colA[k * 3 + 1] = cc.g * f; colA[k * 3 + 2] = cc.b * f; }
    if (stepIt) { pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; }
  }
  let t = 0;
  return {
    gun, zs, ps,
    attach(cam) { cam.add(gun); if (!cam.parent) scene.add(cam); },
    zdie(e) { const z = zs.get(e.id); if (z) { dying.push({ ...z, fade: 0 }); zs.delete(e.id); } },
    clear() { zs.clear(); ps.clear(); dying.length = 0; done(Z, 0); done(arms2, 0); done(PL, 0); done(PL2, 0); age.fill(9); gun.visible = false; if (heat) heat.intensity = 0; },
    // st: interpolated state; me: predicted self {x,z,yaw,firing}; colorOf(id) -> THREE.Color
    update(dt, st, me, myId, colorOf, flameCol) {
      t += dt; const seen = new Set();
      for (const s of st.zombies) { seen.add(s.id); let z = zs.get(s.id);
        if (!z) zs.set(s.id, z = { id: s.id, x: s.x, z: s.z, yaw: 0, ph: Math.random() * 6, v: 0.92 + ((s.id * 37) % 17) / 100, ty: s.ty, flash: 0, burnT: 0 });
        const dx = s.x - z.x, dz = s.z - z.z, d = Math.hypot(dx, dz); if (d > 0.01) z.yaw += (((Math.atan2(dx, dz) - z.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        z.x = s.x; z.z = s.z; z.ph += dt * (d / Math.max(dt, 1e-3) * 1.6 * (TY[s.ty]?.speed ? 1 : 1) + 1.5) * 0.9 / (TY[s.ty]?.s || 1); z.ty = s.ty;
        if (s.burn && !z.burnT) z.flash = 1; z.burnT = s.burn ? 0.4 : Math.max(0, z.burnT - dt); z.flash = Math.max(0, z.flash - dt * 5); }
      for (const id of zs.keys()) if (!seen.has(id)) { const z = zs.get(id); dying.push({ ...z, fade: 0 }); zs.delete(id); }
      let i = 0; for (const z of zs.values()) { if (i >= MAXZ) break; drawZ(i++, z, t, undefined, z.burnT > 0); }
      for (let k = dying.length - 1; k >= 0; k--) { const z = dying[k]; z.fade += dt * 0.9; if (z.fade >= 1) { dying.splice(k, 1); continue; } if (i < MAXZ) drawZ(i++, z, t, z.fade, z.fade < 0.5); }
      done(Z, i); done(arms2, i);
      // other players
      let j = 0; for (const p of st.players) { if (p.id === myId || !p.alive || j >= MAXP) continue; let q = ps.get(p.id);
        if (!q) ps.set(p.id, q = { x: p.x, z: p.z, yaw: p.yaw || 0, ph: 0, spd: 0 });
        const d = Math.hypot(p.x - q.x, p.z - q.z); q.spd += (d / Math.max(dt, 1e-3) - q.spd) * Math.min(1, dt * 8); q.x = p.x; q.z = p.z; q.yaw = p.r ?? q.yaw; q.ph += dt * (q.spd > 0.5 ? 9 : 4);
        if (p.firing) particles(dt, true, q.x + Math.sin(q.yaw) * 1.1, 1.25, q.z + Math.cos(q.yaw) * 1.1, Math.sin(q.yaw), Math.cos(q.yaw), flameCol, 0.5, false);   // others' flames (emit only)
        drawP(j++, q, colorOf(p.id)); }
      done(PL, j); done(PL2, j);
      // first-person weapon + flames
      gun.visible = !!me; if (me) { accent.material.color.copy(colorOf(myId)); pilot.scale.setScalar(0.8 + Math.random() * 0.5);
        gun.position.y = -0.18 + Math.sin(t * (me.moving ? 9 : 2)) * (me.moving ? 0.012 : 0.004) + (me.firing ? (Math.random() - 0.5) * 0.008 : 0);
        const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -Math.cos(me.yaw), rz = Math.sin(me.yaw);
        const ox = me.x + fx * 1.5 + rx * 0.2, oz = me.z + fz * 1.5 + rz * 0.2;
        particles(dt, me.firing, ox, 1.38, oz, fx, fz, flameCol);
        if (heat) { heat.position.set(me.x + fx * 3, 1.4, me.z + fz * 3); heat.intensity += ((me.firing ? 18 + Math.random() * 8 : 0) - heat.intensity) * Math.min(1, dt * 12); } }
      else particles(dt, false, 0, 0, 0, 0, 1);
    },
  };
}
