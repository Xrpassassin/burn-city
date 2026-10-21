// Lake motorboats: walk up to the boat dock, board, drive with walk controls (WASD / joystick), exit at a dock.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const W = () => window.__city;
const B = window.__boat = { active: false, pos: new THREE.Vector3(), boats: [], cur: null, peer };
let docks = [], barEl;
function hull(col) {   // pointed bow, rounded stern, cabin + glass windshield, outboard, side stripe; 3 meshes
  const sh = new THREE.Shape(); sh.moveTo(0, -3.5); sh.bezierCurveTo(.9, -2.3, 1.25, -.8, 1.2, .4); sh.lineTo(1.1, 2.4); sh.quadraticCurveTo(1.0, 2.65, .8, 2.65); sh.lineTo(-.8, 2.65); sh.quadraticCurveTo(-1.0, 2.65, -1.1, 2.4); sh.lineTo(-1.2, .4); sh.bezierCurveTo(-1.25, -.8, -.9, -2.3, 0, -3.5);
  const ex = (d, y, k = 1) => { const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 1, curveSegments: 10 }); g.rotateX(Math.PI / 2); g.scale(k, 1, k); g.translate(0, y, 0); return g };
  const parts = [ex(.8, .85), new THREE.BoxGeometry(1.5, .1, .5).translate(0, 1.0, 1.9), new THREE.BoxGeometry(1.5, .6, 1.3).translate(0, 1.2, .55), new THREE.CylinderGeometry(.16, .12, .9, 8).translate(0, .75, 2.9), new THREE.BoxGeometry(.5, .35, .4).translate(0, 1.05, 2.8)];
  const m = new THREE.Mesh(mergeGeometries(parts.map(x => { const n = x.toNonIndexed(); n.deleteAttribute('uv'); return n })), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.15 }));
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .55).rotateX(-.9).translate(0, 1.6, -.15), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: .55, side: 2, depthWrite: false }));
  const st = new THREE.Mesh(ex(.1, .5, 1.03), new THREE.MeshBasicMaterial({ color: 0x7dffb0, toneMapped: false })); const o = new THREE.Group(); o.add(m, gl, st); return o }
function peer(p) { const c = W(); if (p.b && !p.boat) { p.boat = hull(0x3a6aa8); c.S.add(p.boat) } if (p.boat) { p.boat.visible = !!p.b; if (p.b) { p.boat.position.set(p.g.position.x, 0.1, p.g.position.z); p.boat.rotation.y = (p.r || 0) + Math.PI } } }
function build() { const c = W(), e = window.__estate, f = window.__fishWorld; const base = f.shoreAt(-95), { dir, side } = f.dock, yaw = Math.atan2(dir.x, dir.z);
  const g = []; for (let z = -2; z < 16; z += 1.1) g.push(new THREE.BoxGeometry(3.6, 0.18, 0.9).translate(0, 1.1, z)); for (let z = 0; z < 16; z += 5) for (const x of [-1.6, 1.6]) g.push(new THREE.BoxGeometry(0.35, 2.2, 0.35).translate(x, 0.3, z));
  const dm = new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ color: 0x7a5636 })); dm.position.copy(base).setY(0); dm.rotation.y = yaw; c.S.add(dm);
  docks = [{ base, tip: base.clone().addScaledVector(dir, 14) }, { base: f.dock.base, tip: f.dock.tip.clone().setY(0) }];
  [0xff5a2a, 0x2ad0ff, 0xffd02a].forEach((col, i) => { const m = hull(col), p = base.clone().addScaledVector(dir, 4 + i * 5).addScaledVector(side, i % 2 ? -4.5 : 4.5); p.y = 0.1; m.position.copy(p); m.rotation.y = yaw + Math.PI; c.S.add(m); B.boats.push({ m, h: yaw + Math.PI, v: 0 }) });
  B.dockPos = base; (window.__decks = window.__decks || []).push({ base, dir, side, v0: -3, v1: 15.6, hw: 1.8, h: 1.2 });
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
function tick() { requestAnimationFrame(tick); if (window.__cityPaused) return; const c = W(); if (!barEl) return; const walk = c.getMode() === 'explore', t = performance.now() / 1000;
  if (!walk && B.active) { B.active = false; B.cur.v = 0; B.cur = null }
  for (const b of B.boats) if (b !== B.cur) b.m.position.y = 0.1 + Math.sin(t * 2 + b.h) * 0.06;
  let lbl = ''; if (B.active) { if (nearDock()) lbl = '⚓ Exit boat' } else if (walk) { near = B.boats.find(b => Math.hypot(b.m.position.x - c.P.pos.x, b.m.position.z - c.P.pos.z) < 6) || null; if (near) lbl = '🚤 Board boat' }
  barEl.style.display = lbl ? 'block' : 'none'; if (lbl && barEl.firstChild.textContent !== lbl) barEl.firstChild.textContent = lbl }
B.board = () => { const c = W(); near = B.boats[0]; board() }; B.leave = leave;
(function boot() { if (!window.__fishWorld || !W()) return setTimeout(boot, 600); build(); requestAnimationFrame(tick) })();
