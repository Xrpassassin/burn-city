// Live refuge siege presentation: approaching hordes, gun-platform / mortar-pit meshes, pooled
// tracers + explosions, guards on posts and the mortar aim marker.
// Presentation only. The server (server/homefront-siege.js) owns positions, hits, damage and the
// outcome; the client extrapolates member positions between polls from the same closed form
// (start point + direction × speed, stopping at the wall) and draws what the server confirmed.
// Mobile caps: every buffer is preallocated (instanced meshes, one LineSegments tracer pool,
// a fixed explosion pool, capped dust particles) so a long siege never allocates per shot.
import { createTracerPool } from './homefront-tracers.mjs';
import { DECK_HEIGHT, DECK_HALF, STAIR_HALF_WIDTH, STAIR_LENGTH, stairPath } from './homefront-platforms.mjs';

export const SIEGE_UI = Object.freeze({ wallRadius: 10.5, pollMs: 1500, fireMs: 950, mortarMinRange: 12, mortarMaxRange: 52, mortarDangerClose: 11, mortarCooldownMs: 3200 });

export function devicePreset(coarse) {
  return coarse
    ? { members: 24, tracers: 12, explosions: 4, dust: 48, guards: 6, fogFar: 70 }
    : { members: 36, tracers: 32, explosions: 8, dust: 128, guards: 8, fogFar: 82 };
}

// Where a snapshot member is at client time `nowMs` (server clock), never past the wall.
export function extrapolate(m, snapNow, nowMs, wallRadius = SIEGE_UI.wallRadius) {
  const dt = Math.max(0, (nowMs - snapNow) / 1000);
  const r0 = Math.hypot(m.x, m.z), remaining = Math.max(0, r0 - wallRadius);
  const travel = Math.min(remaining, (m.speed || 0) * dt);
  return { x: m.x + (m.dx || 0) * travel, z: m.z + (m.dz || 0) * travel };
}

// Aim intent for a gun: a ground point along the camera heading (the only thing the client sends).
export function aimFromHeading(x, z, heading, distance = 30) {
  return { x: Number((x + Math.sin(heading) * distance).toFixed(2)), z: Number((z + Math.cos(heading) * distance).toFixed(2)) };
}

export function mortarAimCheck(pit, x, z) {
  if (!pit) return 'not_at_mortar';
  const r = Math.hypot(x - pit.x, z - pit.z);
  if (r < SIEGE_UI.mortarMinRange) return 'mortar_too_close';
  if (r > SIEGE_UI.mortarMaxRange) return 'mortar_out_of_range';
  if (Math.hypot(x, z) < SIEGE_UI.mortarDangerClose) return 'mortar_danger_close';
  return null;
}

// Meshes for the two emplacements, added to a structure group whose origin/rotation the page set.
export function buildEmplacement(THREE, g, s, block, color) {
  if (s.type === 'gun_platform') {
    for (const [x, z] of [[-DECK_HALF + 0.12, -DECK_HALF + 0.12], [DECK_HALF - 0.12, -DECK_HALF + 0.12], [-DECK_HALF + 0.12, DECK_HALF - 0.12], [DECK_HALF - 0.12, DECK_HALF - 0.12]]) block(g, 0.2, DECK_HEIGHT, 0.2, x, DECK_HEIGHT / 2, z, color);
    block(g, DECK_HALF * 2, 0.16, DECK_HALF * 2, 0, DECK_HEIGHT - 0.08, 0, 0x5b4331);
    // Railings on three sides; the stair side (+z) stays open.
    block(g, DECK_HALF * 2, 0.5, 0.08, 0, DECK_HEIGHT + 0.25, -DECK_HALF, 0x3a2a1f);
    for (const x of [-DECK_HALF, DECK_HALF]) block(g, 0.08, 0.5, DECK_HALF * 2, x, DECK_HEIGHT + 0.25, 0, 0x3a2a1f);
    // Stair ramp: steps along local +z from the deck edge down to the ground.
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps, h = DECK_HEIGHT * (1 - t);
      block(g, STAIR_HALF_WIDTH * 2, Math.max(0.08, h), STAIR_LENGTH / steps, 0, Math.max(0.04, h / 2), DECK_HALF + t * STAIR_LENGTH, 0x6c5039);
    }
    // Pintle mount for the heavy gun on the outward edge.
    block(g, 0.18, 0.55, 0.18, 0, DECK_HEIGHT + 0.27, -DECK_HALF + 0.3, 0x2c3133);
    block(g, 0.14, 0.14, 0.9, 0, DECK_HEIGHT + 0.6, -DECK_HALF - 0.05, 0x23282a);
    return true;
  }
  if (s.type === 'mortar_pit') {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, b = block(g, 0.55, 0.4, 0.3, Math.cos(a) * 0.85, 0.2, Math.sin(a) * 0.85, 0x9a8767); b.rotation.y = -a + Math.PI / 2; }
    block(g, 1.3, 0.06, 1.3, 0, 0.03, 0, 0x30281f);
    const tube = block(g, 0.18, 0.95, 0.18, 0, 0.5, -0.1, 0x2d3335); tube.rotation.x = -0.6;
    block(g, 0.45, 0.06, 0.45, 0, 0.08, 0.05, 0x3a4144);
    for (const x of [-0.45, 0.45]) block(g, 0.3, 0.22, 0.2, x, 0.11, 0.45, 0x5d5a3a);
    return true;
  }
  return false;
}

export function createSiegeView(THREE, scene, { coarse = false } = {}) {
  const cfg = devicePreset(coarse);
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  // Approach ground beyond the yard so hordes are visible 46–58 units out.
  const apron = new THREE.Mesh(new THREE.RingGeometry(13.5, 66, 48, 1), new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, side: THREE.DoubleSide }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -0.01; apron.receiveShadow = false; root.add(apron);
  const lanes = [];
  // Instanced horde: one body + one head mesh for every member (brutes scaled up).
  const bodyGeo = new THREE.BoxGeometry(0.5, 1.1, 0.34), headGeo = new THREE.SphereGeometry(0.2, 6, 5);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.9 }), cfg.members);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0x9fae86, roughness: 0.8 }), cfg.members);
  for (const m of [bodies, heads]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); }
  const tracers = createTracerPool(THREE, root, { max: cfg.tracers });
  // Explosion pool: fixed spheres + rings reused round-robin.
  const booms = [];
  for (let i = 0; i < cfg.explosions; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa04a, transparent: true, opacity: 0.8, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; s.visible = ring.visible = false; root.add(s, ring);
    booms.push({ s, ring, life: 0, radius: 3.2, delay: 0, x: 0, z: 0 });
  }
  let boomNext = 0;
  // Capped dust/debris particles shared by every explosion.
  const dustPos = new Float32Array(cfg.dust * 3), dustVel = new Float32Array(cfg.dust * 3), dustLife = new Float32Array(cfg.dust);
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x8a7a66, size: 0.25, transparent: true, opacity: 0.85, depthWrite: false }));
  dust.frustumCulled = false; root.add(dust);
  for (let i = 0; i < cfg.dust; i++) dustPos[i * 3 + 1] = -50;
  let dustNext = 0;
  // Guards walking up stairs to their posts (pooled figures).
  const guardFigs = [];
  for (let i = 0; i < cfg.guards; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 3, 6), new THREE.MeshStandardMaterial({ color: 0x514b43 }));
    body.position.y = 0.55; const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7e3e2f })); helm.position.y = 1.15;
    g.add(body, helm); g.visible = false; root.add(g);
    guardFigs.push({ g, path: null, t: 0, post: null });
  }
  const marker = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.2, 32), new THREE.MeshBasicMaterial({ color: 0x70df78, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.05; marker.visible = false; root.add(marker);
  const tmp = new THREE.Object3D();
  let snap = null, snapNow = 0, offset = 0, seenImpacts = new Set();
  const byId = new Map();

  function setSnapshot(s, structures = []) {
    snap = s; if (!s) { root.visible = false; return; }
    root.visible = s.status === 'active' || !!s.members?.length;
    offset = (s.serverNow || Date.now()) - Date.now(); snapNow = s.serverNow || Date.now();
    byId.clear(); for (const m of s.members || []) byId.set(m.id, m);
    // Pack approach lanes (cheap lines, rebuilt only when the pack list changes).
    if (lanes.length !== (s.packs || []).length) {
      for (const l of lanes) { root.remove(l); l.geometry.dispose(); l.material.dispose(); }
      lanes.length = 0;
      for (const p of s.packs || []) {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(p.angle) * SIEGE_UI.wallRadius, 0.04, Math.sin(p.angle) * SIEGE_UI.wallRadius), new THREE.Vector3(Math.cos(p.angle) * p.spawnR, 0.04, Math.sin(p.angle) * p.spawnR)]);
        const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc65336, transparent: true, opacity: 0.45 })); root.add(l); lanes.push(l);
      }
    }
    // Guards: one figure per guard on a platform post; it walks the stair path once.
    const posted = (s.guards || []).filter(g => g.post && g.post !== 'ground');
    guardFigs.forEach((f, i) => {
      const g = posted[i], st = g && structures.find(x => x.id === g.post);
      if (!st) { f.g.visible = false; f.post = null; return; }
      if (f.post !== g.post) { f.post = g.post; f.path = stairPath(st); f.t = 0; }
      f.g.visible = true;
    });
    for (const imp of s.impacts || []) { const key = imp.at + ':' + imp.x + ':' + imp.z; if (!seenImpacts.has(key)) { seenImpacts.add(key); if (Date.now() + offset - imp.at < 4000) explode(imp.x, imp.z, 0.2); } }
    if (seenImpacts.size > 40) seenImpacts = new Set([...seenImpacts].slice(-20));
  }
  function memberAt(id, nowMs = Date.now() + offset) { const m = byId.get(id); return m ? extrapolate(m, snapNow, nowMs) : null; }
  function explode(x, z, delay = 0, radius = 3.2) {
    const b = booms[boomNext]; boomNext = (boomNext + 1) % booms.length;
    b.x = x; b.z = z; b.delay = delay; b.life = 0.7; b.radius = radius;
    b.s.visible = b.ring.visible = false;
  }
  function burstDust(x, z, n) {
    for (let k = 0; k < n; k++) {
      const i = dustNext; dustNext = (dustNext + 1) % cfg.dust;
      dustPos[i * 3] = x; dustPos[i * 3 + 1] = 0.3; dustPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 4;
      dustVel[i * 3] = Math.cos(a) * v; dustVel[i * 3 + 1] = 3 + Math.random() * 4; dustVel[i * 3 + 2] = Math.sin(a) * v; dustLife[i] = 1.1;
    }
  }
  // Server-confirmed gun burst: one tracer per round toward the member it struck (or the aim).
  function gunFire(fire, aim, color = 0xffe6a0) {
    if (!fire?.from) return;
    const from = fire.from, rounds = fire.rounds || 1;
    for (let i = 0; i < rounds; i++) {
      const hit = (fire.hits || []).find(h => h.round === i && !h.pierced);
      const p = hit?.memberId ? (memberAt(hit.memberId) || aim) : aim;
      if (!p) continue;
      setTimeout(() => tracers.emit(from, { x: p.x + (Math.random() - 0.5) * 0.3, y: hit?.memberId ? 1 : 0.2, z: p.z + (Math.random() - 0.5) * 0.3 }, color, 0.14), i * 70);
    }
  }
  function mortarFire(fire) { if (fire?.impact) { seenImpacts.add(fire.impact.at + ':' + fire.impact.x + ':' + fire.impact.z); explode(fire.impact.x, fire.impact.z, 1.1, fire.splash || 3.2); } }
  function setMarker(x, z, ok) { if (x == null) { marker.visible = false; return; } marker.position.x = x; marker.position.z = z; marker.material.color.setHex(ok ? 0x70df78 : 0xff5148); marker.visible = true; }
  function update(dt) {
    tracers.update(dt);
    if (!snap) return;
    const nowMs = Date.now() + offset;
    let n = 0;
    for (const m of snap.members || []) {
      if (n >= cfg.members) break;
      const p = extrapolate(m, snapNow, nowMs), s = m.brute ? 1.45 : 1, bob = Math.abs(Math.sin(nowMs / 180 + n)) * 0.06;
      tmp.position.set(p.x, 0.55 * s + bob, p.z); tmp.rotation.set(0, Math.atan2(-(m.dx || 0), -(m.dz || 0)) + Math.PI, 0); tmp.scale.setScalar(s); tmp.updateMatrix(); bodies.setMatrixAt(n, tmp.matrix);
      tmp.position.y = 1.3 * s + bob; tmp.updateMatrix(); heads.setMatrixAt(n, tmp.matrix); n++;
    }
    bodies.count = heads.count = n; bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    for (const b of booms) {
      if (b.life <= 0) continue;
      if (b.delay > 0) { b.delay -= dt; if (b.delay <= 0) { b.s.visible = b.ring.visible = true; b.s.position.set(b.x, 0.4, b.z); b.ring.position.set(b.x, 0.06, b.z); burstDust(b.x, b.z, coarse ? 8 : 16); } continue; }
      b.life -= dt; const k = 1 - Math.max(0, b.life) / 0.7;
      b.s.scale.setScalar(0.3 + k * b.radius * 0.6); b.s.material.opacity = 0.8 * (1 - k);
      b.ring.scale.setScalar(0.2 + k * b.radius); b.ring.material.opacity = 0.6 * (1 - k);
      if (b.life <= 0) b.s.visible = b.ring.visible = false;
    }
    let anyDust = false;
    for (let i = 0; i < cfg.dust; i++) {
      if (dustLife[i] <= 0) continue; anyDust = true; dustLife[i] -= dt;
      dustVel[i * 3 + 1] -= 9.8 * dt;
      dustPos[i * 3] += dustVel[i * 3] * dt; dustPos[i * 3 + 1] = Math.max(0.02, dustPos[i * 3 + 1] + dustVel[i * 3 + 1] * dt); dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -50;
    }
    if (anyDust) dustGeo.attributes.position.needsUpdate = true;
    for (const f of guardFigs) {
      if (!f.g.visible || !f.path) continue;
      f.t = Math.min(f.path.length - 1, f.t + dt * 0.9);
      const i = Math.min(f.path.length - 2, Math.floor(f.t)), u = f.t - i, a = f.path[i], b = f.path[i + 1];
      f.g.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
      f.g.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) || f.g.rotation.y;
    }
  }
  return { root, cfg, setSnapshot, update, gunFire, mortarFire, explode, setMarker, memberAt, tracers, get snapshot() { return snap; }, get serverNow() { return Date.now() + offset; } };
}
