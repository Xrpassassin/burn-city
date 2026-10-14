// Lake motorboats: walk up to the boat dock, board, drive with walk controls (WASD / joystick), exit at a dock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const W = () => window.__city;
const B = window.__boat = { active: false, pos: new THREE.Vector3(), boats: [], cur: null, peer };
let docks = [], barEl;
function hull(col) { const g = [new THREE.BoxGeometry(2.4, 0.9, 5).translate(0, 0.45, 0), new THREE.ConeGeometry(1.2, 1.8, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4).scale(1, 0.5, 1).translate(0, 0.55, -3.3), new THREE.BoxGeometry(1.8, 0.8, 1.2).translate(0, 1.3, -0.3)];
  const m = new THREE.Mesh(mergeGeometries(g.map(x => x.toNonIndexed())), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.15 }));
  const s = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.12, 5.05), new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false })); s.position.y = 0.75; const o = new THREE.Group(); o.add(m, s); return o }
function peer(p) { const c = W(); if (p.b && !p.boat) { p.boat = hull(0x3a6aa8); c.S.add(p.boat) } if (p.boat) { p.boat.visible = !!p.b; if (p.b) { p.boat.position.set(p.g.position.x, 0.1, p.g.position.z); p.boat.rotation.y = (p.r || 0) + Math.PI } } }
function build() { const c = W(), e = window.__estate, f = window.__fishWorld; const base = f.shoreAt(-95), { dir, side } = f.dock, yaw = Math.atan2(dir.x, dir.z);
  const g = []; for (let z = -2; z < 16; z += 1.1) g.push(new THREE.BoxGeometry(3.6, 0.18, 0.9).translate(0, 1.1, z)); for (let z = 0; z < 16; z += 5) for (const x of [-1.6, 1.6]) g.push(new THREE.BoxGeometry(0.35, 2.2, 0.35).translate(x, 0.3, z));
  const dm = new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ color: 0x7a5636 })); dm.position.copy(base).setY(0); dm.rotation.y = yaw; c.S.add(dm);
  docks = [{ base, tip: base.clone().addScaledVector(dir, 14) }, { base: f.dock.base, tip: f.dock.tip.clone().setY(0) }];
  [0xff5a2a, 0x2ad0ff, 0xffd02a].forEach((col, i) => { const m = hull(col), p = base.clone().addScaledVector(dir, 4 + i * 5).addScaledVector(side, i % 2 ? -4.5 : 4.5); p.y = 0.1; m.position.copy(p); m.rotation.y = yaw + Math.PI; c.S.add(m); B.boats.push({ m, h: yaw + Math.PI, v: 0 }) });
  B.dockPos = base;
  barEl = document.createElement('div'); barEl.id = 'bBar'; barEl.style.cssText = 'position:fixed;right:12px;bottom:calc(330px + env(safe-area-inset-bottom));z-index:31;display:none'; barEl.innerHTML = '<button style="font:700 15px system-ui;padding:11px 16px;border-radius:12px;border:1px solid #2ad0ff88;background:#071822e6;color:#dff6ff"></button>'; document.body.append(barEl);
  barEl.firstChild.onclick = () => B.active ? leave() : board(); window.__boatWorld = { docks, base } }
let near = null;
function board() { if (!near) return; B.cur = near; B.active = true; B.pos.copy(near.m.position) }
function leave() { const d = nearDock(); if (!d) return; const c = W(), b = B.cur; B.active = false; b.v = 0; c.P.pos.copy(d.base).addScaledVector(window.__fishWorld.dock.dir, 3).setY(1.2); c.P.vel.set(0, 0, 0); B.cur = null }
const nearDock = () => docks.find(d => { const p = B.pos; for (let k = 0; k <= 4; k++) { const q = d.base.clone().lerp(d.tip, k / 4); if (Math.hypot(q.x - p.x, q.z - p.z) < 9) return true } return false });
const inside = (x, z) => window.__estate.inLake(x, z);
// called from updExplore while active: f throttle, s steer
B.drive = (dt, f, s) => { const b = B.cur, c = W(), t = performance.now() / 1000; b.v += f * 14 * dt; b.v *= Math.pow(0.55, dt); b.v = Math.max(-4, Math.min(14, b.v));
  b.h -= s * dt * (0.4 + Math.min(1.4, Math.abs(b.v) * 0.18)) * Math.sign(b.v || 1);
  const fx = -Math.sin(b.h), fz = -Math.cos(b.h), nx = b.m.position.x + fx * b.v * dt, nz = b.m.position.z + fz * b.v * dt, sg = Math.sign(b.v || 1);
  if (inside(nx + fx * 3 * sg, nz + fz * 3 * sg) && inside(nx, nz)) { b.m.position.x = nx; b.m.position.z = nz } else b.v *= -0.3;
  b.m.position.y = 0.1 + Math.sin(t * 2.1) * 0.08; b.m.rotation.set(Math.sin(t * 1.7) * 0.03 - b.v * 0.004, b.h, Math.sin(t * 1.3) * 0.04 + s * 0.05, 'YXZ');
  B.pos.copy(b.m.position); const seat = b.m.position.clone().setY(0.9), cam = seat.clone().add(new THREE.Vector3(-fx * 11, 4.5, -fz * 11));
  c.C.position.lerp(cam, 1 - Math.pow(0.002, dt)); c.C.lookAt(seat.clone().add(new THREE.Vector3(fx * 6, 0.5, fz * 6))); return seat };
function tick() { requestAnimationFrame(tick); const c = W(); if (!barEl) return; const walk = c.getMode() === 'explore', t = performance.now() / 1000;
  if (!walk && B.active) { B.active = false; B.cur.v = 0; B.cur = null }
  for (const b of B.boats) if (b !== B.cur) b.m.position.y = 0.1 + Math.sin(t * 2 + b.h) * 0.06;
  let lbl = ''; if (B.active) { if (nearDock()) lbl = '⚓ Exit boat' } else if (walk) { near = B.boats.find(b => Math.hypot(b.m.position.x - c.P.pos.x, b.m.position.z - c.P.pos.z) < 6) || null; if (near) lbl = '🚤 Board boat' }
  barEl.style.display = lbl ? 'block' : 'none'; if (lbl && barEl.firstChild.textContent !== lbl) barEl.firstChild.textContent = lbl }
B.board = () => { const c = W(); near = B.boats[0]; board() }; B.leave = leave;
(function boot() { if (!window.__fishWorld || !W()) return setTimeout(boot, 600); build(); requestAnimationFrame(tick) })();
