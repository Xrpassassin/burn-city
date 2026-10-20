// BURN City skateboarding: a ride mode on top of the normal explore controller (same pattern as the boat).
// - Skate pieces live in one registry (box/ledge, ramp/bank, quarter pipe, stairs, rail). Each piece feeds the
//   board's height field and grind lines, so the same pieces can later be placed across the whole city.
// - Board physics: substepped, frame-rate independent; momentum, carving, slope gravity, ollie, air control,
//   flip tricks, grabs, spins, grinds, manuals; landing checks board orientation vs. travel direction.
// - Score/combo is local only (nothing consequential is sent to the server).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { poseWalker } from './walker.js';

const G = 22, PUSH_MAX = 9.5, MAX_V = 17, STEP_UP = .28, SUB = .2;
const C = () => window.__city;
const SK = window.__skate = { active: false, pieces: [], rails: [], addPiece, drive, toggle, state: null, test: {} };
let built = false, root, board, hud, btns, tut;

// ---------------------------------------------------------------- registry
// all coordinates world-space metres; yaw rotates the piece about its centre (local +z = "up the ramp" / "down the stairs")
function addPiece(p) {
  p.yaw = p.yaw || 0; p.c = Math.cos(p.yaw); p.s = Math.sin(p.yaw);
  p.r = Math.hypot(p.w || 1, p.d || 1) / 2 + 1;
  SK.pieces.push(p);
  // grind lines along the long top edges of ledges and along quarter-pipe coping
  if (p.type === 'box' && p.grind) for (const sz of [-1, 1]) {   // the two long top edges
    const long = p.d > p.w;
    const a = long ? toWorld(p, sz * p.w / 2, -p.d / 2 + .1) : toWorld(p, -p.w / 2 + .1, sz * p.d / 2), b = long ? toWorld(p, sz * p.w / 2, p.d / 2 - .1) : toWorld(p, p.w / 2 - .1, sz * p.d / 2);
    SK.rails.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: p.h, kind: 'ledge' });
  }
  if (p.type === 'quarter') {
    const a = toWorld(p, -p.w / 2 + .1, p.d / 2), b = toWorld(p, p.w / 2 - .1, p.d / 2);
    SK.rails.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: p.h, kind: 'coping' });
  }
  if (p.type === 'rail') SK.rails.push({ ax: p.ax, az: p.az, bx: p.bx, bz: p.bz, y: p.y, y2: p.y2 ?? p.y, kind: 'rail' });
  return p;
}
function toLocal(p, x, z) { const dx = x - p.x, dz = z - p.z; return { x: dx * p.c - dz * p.s, z: dx * p.s + dz * p.c }; }
function toWorld(p, lx, lz) { return { x: p.x + lx * p.c + lz * p.s, z: p.z - lx * p.s + lz * p.c }; }

// height of skate geometry at (x,z) for a rider at height y (only surfaces at or below y+reach count)
function pieceH(p, x, z) {
  if (Math.abs(x - p.x) > p.r || Math.abs(z - p.z) > p.r) return null;
  const l = toLocal(p, x, z), hw = p.w / 2, hd = p.d / 2;
  if (Math.abs(l.x) > hw) return null;
  if (p.type === 'box') return Math.abs(l.z) <= hd ? p.h : null;
  if (p.type === 'ramp' || p.type === 'quarter') {
    const deck = p.deck || 0;
    if (l.z < -hd || l.z > hd + deck) return null;
    if (l.z > hd) return p.h;
    const t = (l.z + hd) / p.d;
    return p.type === 'quarter' ? p.h * (1 - Math.sqrt(Math.max(0, 1 - t * t))) : p.h * t;
  }
  if (p.type === 'stairs') {   // top landing at local -z, descending to 0 at +z (smooth for the board, stepped visually)
    const top = p.top || 0;
    if (l.z < -hd - top || l.z > hd) return null;
    if (l.z < -hd) return p.h;
    return p.h * (1 - (l.z + hd) / p.d);
  }
  return null;
}
function heightAt(x, z, y) {
  const c = C(); let g = c.groundAt(x, z, y);
  for (const p of SK.pieces) { const h = pieceH(p, x, z); if (h != null && h <= y + STEP_UP && h > g) g = h; }
  return g;
}
function solidAbove(x, z, y, ox, oz) {   // a wall: some surface here rises more than a step above the board
  for (const p of SK.pieces) {
    const h = pieceH(p, x, z); if (h == null || h <= y + STEP_UP) continue;
    // ramps and quarter pipes are only walls from the sides or the back; from the front you ride up them
    if ((p.type === 'ramp' || p.type === 'quarter' || p.type === 'stairs') && ox !== undefined) {
      const lo = toLocal(p, ox, oz); if (Math.abs(lo.x) <= p.w / 2 && lo.z <= p.d / 2 && (pieceH(p, ox, oz) != null || lo.z < -p.d / 2)) continue;
    }
    return true;
  }
  for (const o of C().colliders) { if (o.r > 0 && o.h > y + STEP_UP && Math.hypot(x - o.x, z - o.z) < o.r + .3) return true; }
  return false;
}

// ---------------------------------------------------------------- state & input
const st = SK.state = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), h: 0, air: false, airT: 0, grind: null, manual: 0,
  flip: null, grab: 0, spin: 0, bail: 0, crouch: 0, pushT: 0, popHeld: false, lastPop: 0,
  combo: [], base: 0, mult: 0, total: +(localStorage.getItem('bc_skate_best') || 0) * 0, best: +(localStorage.getItem('bc_skate_best') || 0), rollT: 0,
  assist: localStorage.getItem('bc_skate_pro') ? 0 : 1, msg: '', msgT: 0,
};
const K = () => C().input.keys, TB = () => C().input.tb;
const touchSK = { flip: 0, heel: 0, grab: 0, grind: 0 };
let prevJ = 0, prevK = 0, prevPop = 0, prevB = 0;

function toggle(on) {
  const c = C(); if (!c) return;
  if (on === undefined) on = !SK.active;
  if (on && (c.getMode && c.getMode() !== 'explore')) return;
  if (on && window.__burnTowerOpen) return;
  if (on && window.__boat && window.__boat.active) return;
  if (!built) build();
  SK.active = on;
  if (on) {
    st.pos.copy(c.P.pos); st.vel.set(0, 0, 0); st.h = c.input.yp.yaw; st.air = false; st.grind = null; st.flip = null; st.bail = 0; st.base = 0; st.mult = 0; st.combo = [];
    board.visible = true; hud.style.display = 'block'; if (btns) btns.style.display = c.MOBILE ? 'grid' : 'none';
    tutorial(true);
  } else {
    c.P.pos.copy(st.pos); c.P.vel.set(0, 0, 0); board.visible = false; hud.style.display = 'none'; if (btns) btns.style.display = 'none';
    c.avatar.rotation.x = c.avatar.rotation.z = 0;
  }
  const sb = document.getElementById('tSkate'); if (sb) sb.classList.toggle('on', on);
}
addEventListener('keydown', e => {
  if (e.repeat) return; const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
  if (e.code === 'KeyB' && C() && C().getMode && C().getMode() === 'explore') toggle();
});

// ---------------------------------------------------------------- scoring
const NAMES = { ollie: 'Ollie', kick: 'Kickflip', heel: 'Heelflip', grab: 'Ember Grab', manual: 'Manual', grind: { rail: '50-50', ledge: '5-0 Ledge', coping: 'Coping Grind' } };
function addTrick(name, pts) { st.combo.push(name); st.base += pts; st.mult = Math.max(1, st.combo.length); flash(name); }
function bank() {
  if (!st.combo.length) return;
  const got = Math.round(st.base * st.mult); st.total += got; SK.test.lastBank = { combo: [...st.combo], base: st.base, mult: st.mult, got };
  if (st.total > st.best) { st.best = st.total; localStorage.setItem('bc_skate_best', st.best); }
  flash(`+${got}${st.mult > 1 ? `  (${st.base} × ${st.mult})` : ''}`, 1.6, true);
  st.combo = []; st.base = 0; st.mult = 0;
  tutStep('combo', got > 0 && SK.test.lastBank.combo.length >= 2);
}
function bail(why) {
  st.bail = 1.1; st.combo = []; st.base = 0; st.mult = 0; st.flip = null; st.grab = 0; st.grind = null; st.manual = 0;
  st.vel.multiplyScalar(.15); flash('Bail! ' + (why || ''), 1.2); SK.test.lastBail = why; SK.test.bails = (SK.test.bails || 0) + 1;
}
function flash(t, dur = .9, big) { st.msg = t; st.msgT = dur; st.msgBig = !!big; }

// ---------------------------------------------------------------- physics
function drive(dt, f, s) {
  const c = C(), k = K(), tb = TB();
  if (!built) build();
  const pop = !!(k.Space || tb.jump), jK = !!(k.KeyJ || touchSK.flip), kK = !!(k.KeyK || touchSK.heel), grabK = !!(k.KeyL || touchSK.grab);
  const grindK = !!(k.ShiftLeft || k.ShiftRight || touchSK.grind);
  const popDown = pop && !prevPop, popUp = !pop && prevPop, jDown = jK && !prevJ, kDown = kK && !prevK;
  prevPop = pop; prevJ = jK; prevK = kK;

  if (st.bail > 0) { st.bail -= dt; s = 0; f = 0; }
  // substeps: never move more than SUB metres per step (no tunnelling through rails, ledges or walls)
  const spd = st.vel.length(), n = Math.min(12, Math.max(1, Math.ceil(spd * dt / SUB)));
  const h = dt / n;
  for (let i = 0; i < n; i++) step(h, f, s, i === 0 ? { popDown, popUp, jDown, kDown } : {}, pop, grabK, grindK);

  // write back to the shared player
  c.P.pos.copy(st.pos); c.P.vel.copy(st.vel); c.P.onGround = !st.air; c.P.climb = null;
  // camera follows the board heading unless the player is looking around (mouse/touch drag sets yaw directly)
  const yp = c.input.yp; let dy = st.h - yp.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  if (st.vel.lengthSq() > 1 && !st.air) yp.yaw += dy * Math.min(1, dt * 2.6);
  pose(dt);
  updHud(dt);
  SK.test.snap = { x: +st.pos.x.toFixed(2), y: +st.pos.y.toFixed(2), z: +st.pos.z.toFixed(2), v: +st.vel.length().toFixed(2), air: st.air, grind: st.grind ? st.grind.r.kind : null, manual: st.manual > 0, total: st.total, combo: [...st.combo], mult: st.mult };
}

function step(dt, f, s, ev, pop, grabK, grindK) {
  const p = st.pos, v = st.vel, fx = -Math.sin(st.h), fz = -Math.cos(st.h);
  if (st.railCD > 0) st.railCD -= dt;
  st.crouch += ((pop && !st.air) ? 1 : 0 - st.crouch) * Math.min(1, dt * 14);

  // ---- grinding: locked to the line, sliding along it
  if (st.grind) {
    const g = st.grind, r = g.r; const L = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / L, uz = (r.bz - r.az) / L;
    g.sp = Math.max(2.2, g.sp - dt * (r.kind === 'rail' ? .5 : 1.1));
    g.t += g.dir * g.sp * dt / L;
    const ry = r.y + ((r.y2 ?? r.y) - r.y) * Math.min(1, Math.max(0, g.t));
    p.set(r.ax + (r.bx - r.ax) * g.t, ry + .02, r.az + (r.bz - r.az) * g.t);
    st.h = Math.atan2(-ux * g.dir, -uz * g.dir); v.set(ux * g.dir * g.sp, ((r.y2 ?? r.y) - r.y) / L * g.sp * g.dir, uz * g.dir * g.sp);
    g.time += dt; if (g.time - g.scored > .1) { st.base += 10; g.scored = g.time; }
    // balance: steering too hard throws you off (assist widens the window)
    if (ev.popDown || g.t < -.02 || g.t > 1.02) {
      const pv = ev.popDown ? 5.6 : 2.4; st.lastRail = r; st.railCD = .45; st.grind = null; st.air = true; st.airT = 0; v.y = Math.max(v.y, pv); p.y += .05;
      SK.test.grinds = (SK.test.grinds || 0) + 1; tutStep('grind', true);
    }
    return;
  }

  const ground = heightAt(p.x, p.z, p.y);
  if (!st.air) {
    // slope from the height field (finite differences)
    const e = .25, gx = (heightAt(p.x + e, p.z, p.y + .5) - heightAt(p.x - e, p.z, p.y + .5)) / (2 * e), gz = (heightAt(p.x, p.z + e, p.y + .5) - heightAt(p.x, p.z - e, p.y + .5)) / (2 * e);
    // forward speed along heading (signed: negative = rolling fakie/back)
    let fwd = v.x * fx + v.z * fz;
    // push / brake / rolling resistance
    if (f > .1 && st.bail <= 0 && st.manual <= 0) { st.pushT += dt; if (fwd < PUSH_MAX) fwd += 11 * f * dt; }
    else if (f < -.1) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 12 * -f * dt);
    fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), (.35 + .012 * fwd * fwd) * dt);
    // gravity along the slope
    fwd -= G * (gx * fx + gz * fz) / Math.sqrt(1 + gx * gx + gz * gz) * dt;
    fwd = Math.max(-MAX_V, Math.min(MAX_V, fwd));
    // carving: heading turns with steering; tighter when slow
    const turn = 2.6 / (1 + Math.abs(fwd) * .06);
    st.h -= s * turn * dt;
    // full grip: velocity follows the heading
    v.x = fx * fwd; v.z = fz * fwd;
    v.y = -(gx * v.x + gz * v.z) * -1;   // vertical rate implied by the slope under the wheels
    // ollie (press = crouch, release = pop; quick tap still pops)
    if (ev.popUp && st.bail <= 0) { ollie(); return; }
    // manual: Shift on open ground, no rail in reach
    if (grindK && !nearRail(p, 1.1)) { if (st.manual <= 0) { st.manual = .0001; } st.manual += dt; if (Math.floor((st.manual) * 10) > Math.floor((st.manual - dt) * 10)) st.base += 5; if (st.manual > .4 && !st.combo.includes('Manual')) { addTrick('Manual', 40); tutStep('manual', true); } st.rollT = 0; }
    else { if (st.manual > 0) st.manual = 0; }
    // ledge/rail grind from the ground with Shift (curbs, low ledges)
    if (grindK && tryGrind(true)) return;
    // vert: going up the top of a quarter pipe launches straight up and brings you back down the ramp
    const q = onQuarterTop(p);
    if (q && fwd > 1 && (gx * fx + gz * fz) > 2.2) {
      st.air = true; st.airT = 0; st.vert = q; const up = Math.abs(fwd) * .92;
      v.set(0, up, 0); p.y += .05; st.spin = 0; return;
    }
    // move with wall checks (axis separated; walls stop that axis = slide along them)
    moveXZ(dt);
    const g2 = heightAt(p.x, p.z, p.y + .3);
    if (g2 < p.y - .35 && Math.abs(fwd) > 3) {   // rolled off an edge -> airborne
      st.air = true; st.airT = 0; v.y = 0; st.spin = 0;
    } else p.y = g2;
    // combo ends after rolling normally for a moment
    if (st.combo.length && st.manual <= 0) { st.rollT += dt; if (st.rollT > .75) bank(); }
    if (Math.abs(fwd) > 1.5) tutStep('push', true);
    return;
  }

  // ---- airborne
  st.airT += dt;
  v.y -= G * dt;
  // air control: a little steering of travel direction, and spins rotate the board
  const ah = s * 5.2 * dt; st.h -= ah; st.spin += ah;
  if (!st.vert) { const sp = Math.hypot(v.x, v.z); if (sp > .1) { const a = Math.atan2(v.x, v.z) - s * .6 * dt; v.x = Math.sin(a) * sp; v.z = Math.cos(a) * sp; } }
  if (ev.jDown && !st.flip) st.flip = { kind: 'kick', t: 0, dir: 1 };
  if (ev.kDown && !st.flip) st.flip = { kind: 'heel', t: 0, dir: -1 };
  if (st.flip) { st.flip.t += dt / .42; if (st.flip.t >= 1) { addTrick(NAMES[st.flip.kind], 100); tutStep('flip', true); st.flip = null; } }
  if (grabK && !st.flip) { st.grab += dt; if (st.grab > .35 && !st.grabbed) { st.grabbed = 1; addTrick(NAMES.grab, 60); } } else st.grab = 0;
  if (grindK || st.assist) { if (tryGrind(false)) return; }
  const ox = p.x, oz = p.z; moveXZ(dt); p.y += v.y * dt;
  const g = heightAt(p.x, p.z, p.y + Math.max(0, -v.y * dt) + .05);
  if (p.y <= g && v.y <= 0) land(g);
  else if (st.vert && v.y < 0) {   // coming back down from vert: steer back over the ramp
    const q = st.vert; const l = toLocal(q, p.x, p.z); if (l.z > q.d / 2 - .25) { const w = toWorld(q, l.x, q.d / 2 - .3); p.x = w.x; p.z = w.z; }
  }
}

function ollie() {
  const p = st.pos, v = st.vel; const charge = Math.min(1, st.pushT * 0 + st.crouch);
  v.y = 5.2 + 1.4 * charge; st.air = true; st.airT = 0; st.spin = 0; st.grabbed = 0; p.y += .05;
  addTrick('Ollie', 25); tutStep('ollie', true); st.rollT = 0; st.manual = 0; SK.test.ollies = (SK.test.ollies || 0) + 1;
}

function land(g) {
  const p = st.pos, v = st.vel; p.y = g; st.air = false;
  const wasVert = st.vert; st.vert = null;
  // landing check: board heading vs. travel direction (forward or fakie), flip finished, not grabbing
  let ok = true, why = '';
  const sp = Math.hypot(v.x, v.z);
  if (st.flip) {
    const done = st.flip.t; if (done > (st.assist ? .62 : .85)) { addTrick(NAMES[st.flip.kind], 100); st.flip = null; }
    else { ok = false; why = 'flip not finished'; }
  }
  if (ok && sp > 1.5 && !wasVert) {
    const vh = Math.atan2(-v.x, -v.z); let d = Math.atan2(Math.sin(vh - st.h), Math.cos(vh - st.h));
    const tol = st.assist ? 1.15 : .8;   // ~66° (assist) / ~46°
    if (Math.abs(d) < tol) st.h = vh;                                   // forward: snap to travel line
    else if (Math.PI - Math.abs(d) < tol) { st.h = vh + Math.PI; }      // fakie: ride it out backwards
    else { ok = false; why = 'sideways'; }
  }
  if (wasVert && ok) { st.h += Math.PI; const sp2 = Math.max(4, Math.abs(v.y) * .8); v.set(-Math.sin(st.h) * sp2, 0, -Math.cos(st.h) * sp2); }   // drop back in
  const spins = Math.round(Math.abs(st.spin) / Math.PI); if (ok && spins >= 1) addTrick(`${spins * 180}`, 100 * spins);
  st.spin = 0; st.grab = 0; st.grabbed = 0; st.rollT = 0;
  if (!ok) { bail(why); return; }
  SK.test.landings = (SK.test.landings || 0) + 1;
  // keep the speed along the board, lose a little on impact
  const fwd = (v.x * -Math.sin(st.h) + v.z * -Math.cos(st.h)) * .94; v.set(-Math.sin(st.h) * fwd, 0, -Math.cos(st.h) * fwd);
}

function moveXZ(dt) {
  const p = st.pos, v = st.vel;
  const nx = p.x + v.x * dt; if (solidAbove(nx, p.z, p.y, p.x, p.z)) { v.x *= -.15; SK.test.walls = (SK.test.walls || 0) + 1; } else p.x = nx;
  const nz = p.z + v.z * dt; if (solidAbove(p.x, nz, p.y, p.x, p.z)) { v.z *= -.15; SK.test.walls = (SK.test.walls || 0) + 1; } else p.z = nz;
  // round city colliders (buildings) push the rider out, like walking
  C().colliders.length && pushOut(p);
}
function pushOut(p) {
  for (const o of C().colliders) {
    if (!(o.r > 0) || p.y >= o.h - .05) continue; const dx = p.x - o.x, dz = p.z - o.z, m = o.r + .38;
    if (Math.abs(dx) > m || Math.abs(dz) > m) continue; const d = Math.hypot(dx, dz); if (d < m) { const k = (m - d) / (d || 1); p.x += dx * k; p.z += dz * k; }
  }
}

function nearRail(p, rad) { for (const r of SK.rails) { const q = closest(r, p.x, p.z); if (q.d < rad && Math.abs(q.y - p.y) < 1) return r; } return null; }
function closest(r, x, z) {
  const vx = r.bx - r.ax, vz = r.bz - r.az, L2 = vx * vx + vz * vz; let t = ((x - r.ax) * vx + (z - r.az) * vz) / L2; t = Math.max(0, Math.min(1, t));
  const y = r.y + ((r.y2 ?? r.y) - r.y) * t; return { t, d: Math.hypot(x - r.ax - vx * t, z - r.az - vz * t), y };
}
function tryGrind(fromGround) {
  const p = st.pos, v = st.vel; const sp = Math.hypot(v.x, v.z); if (sp < 2) return false;
  const reach = st.assist ? .75 : .45;
  for (const r of SK.rails) {
    if (r === st.lastRail && st.railCD > 0) continue;   // no instant re-lock onto the rail you just left
    const q = closest(r, p.x, p.z); if (q.d > reach || q.t <= .01 || q.t >= .99) continue;
    const dyy = p.y - q.y; if (fromGround ? (dyy < -.55 || dyy > .1) : (dyy < -.15 || dyy > .6 || v.y > 1.5)) continue;
    const L = Math.hypot(r.bx - r.ax, r.bz - r.az), ux = (r.bx - r.ax) / L, uz = (r.bz - r.az) / L, along = (v.x * ux + v.z * uz) / sp;
    if (Math.abs(along) < (st.assist ? .62 : .8)) continue;   // must be roughly lined up with the rail
    if (fromGround && dyy < -.05) { /* pop up onto a low ledge */ }
    st.grind = { r, t: q.t, dir: Math.sign(along), sp: Math.max(3, sp * Math.abs(along)), time: 0, scored: 0 };
    st.air = false; st.flip = null; st.vert = null; st.rollT = 0; st.manual = 0;
    addTrick(typeof NAMES.grind === 'object' ? NAMES.grind[r.kind] : 'Grind', 50);
    return true;
  }
  return false;
}
function onQuarterTop(p) {
  for (const q of SK.pieces) { if (q.type !== 'quarter') continue; if (Math.abs(p.x - q.x) > q.r || Math.abs(p.z - q.z) > q.r) continue; const l = toLocal(q, p.x, p.z); if (Math.abs(l.x) < q.w / 2 && l.z > q.d / 2 - .45 && l.z <= q.d / 2) return q; }
  return null;
}

// ---------------------------------------------------------------- rider pose + board
function pose(dt) {
  const c = C(), av = c.avatar, t = performance.now() / 1000;
  const pushing = !st.air && !st.grind && st.vel.length() < PUSH_MAX - .2 && K() && (K().KeyW || K().ArrowUp || c.input.joy.y < -.3);
  poseWalker(av, (st.pushT) * 7, pushing ? .45 : 0, t);
  const L = av.userData;
  if (L && L.legs && !pushing) { const cr = .35 + st.crouch * .5 + (st.air ? .35 : 0) + (st.grab > 0 ? .5 : 0); L.legs[0].rotation.x = cr * .6; L.legs[1].rotation.x = -cr * .3; if (L.arms) { L.arms[0].rotation.z = .9; L.arms[1].rotation.z = -.9; } }
  const bh = .11;
  av.position.set(st.pos.x, st.pos.y + bh - st.crouch * .12 - (st.grab > 0 ? .2 : 0), st.pos.z);
  av.rotation.y = st.h + Math.PI * .5 * (st.grind ? .35 : .22);   // sideways stance on the board
  av.rotation.z = st.air ? 0 : -(C().input.joy.x + ((K().KeyD ? 1 : 0) - (K().KeyA ? 1 : 0))) * .12 * Math.min(1, st.vel.length() / 6);
  if (st.bail > 0) { av.rotation.x = Math.min(1.3, (1.1 - st.bail) * 3); } else av.rotation.x = 0;
  av.visible = !c.P.fp;
  board.position.set(st.pos.x, st.pos.y + .06, st.pos.z);
  board.rotation.set(0, st.h, 0);
  const fl = st.flip ? st.flip.t * Math.PI * 2 * st.flip.dir : 0;
  board.children[0].rotation.z = fl;
  board.children[0].position.y = st.flip ? Math.sin(st.flip.t * Math.PI) * .35 : 0;
  board.children[0].rotation.x = st.manual > 0 ? -.22 : 0;
}

// ---------------------------------------------------------------- HUD, tutorial, touch buttons
function updHud(dt) {
  if (st.msgT > 0) st.msgT -= dt;
  const combo = st.combo.length ? `${st.combo.slice(-4).join(' + ')}<b>${Math.round(st.base)} × ${st.mult}</b>` : '';
  hud.innerHTML = `<div class="sk-score">${st.total.toLocaleString()}<small>best ${st.best.toLocaleString()}</small></div>` +
    `<div class="sk-combo">${combo}</div>` + (st.msgT > 0 ? `<div class="sk-msg${st.msgBig ? ' big' : ''}">${st.msg}</div>` : '') +
    (tut && tut.el ? '' : '');
}
const TUT = [
  ['push', 'Push off', 'W · or joystick up'], ['ollie', 'Ollie', 'Hold & release Space · OLLIE'],
  ['flip', 'Kickflip in the air', 'Ollie, then J (K = heelflip) · FLIP'], ['grind', 'Grind the ember rail', 'Ollie onto a rail · Shift / GRIND helps'],
  ['combo', 'Land a combo', 'Chain two tricks, roll away clean'],
];
function tutorial(show) {
  if (!tut) { const el = document.createElement('div'); el.id = 'skTut'; document.body.appendChild(el); tut = { el, i: 0, done: localStorage.getItem('bc_skate_tut') === '1' }; }
  if (tut.done) { tut.el.style.display = 'none'; return; }
  tut.el.style.display = show ? 'block' : 'none'; renderTut();
}
function renderTut() {
  if (!tut) return; const C2 = C(); const m = C2 && C2.MOBILE;
  if (tut.i >= TUT.length) { tut.done = true; localStorage.setItem('bc_skate_tut', '1'); tut.el.innerHTML = '<b>You\'re skating.</b> Every ledge, stair and rail in the plaza is yours.'; setTimeout(() => tut.el.style.display = 'none', 3200); return; }
  const [, title, hint] = TUT[tut.i]; const parts = hint.split(' · ');
  tut.el.innerHTML = `<small>SKATE ${tut.i + 1}/${TUT.length}</small><b>${title}</b><span>${m ? (parts[1] || parts[0]) : parts[0]}</span><button id="skTutSkip">skip</button>`;
  const b = document.getElementById('skTutSkip'); if (b) b.onclick = () => { tut.i = TUT.length; renderTut(); };
}
function tutStep(key, ok) { if (!ok || !tut || tut.done) return; if (TUT[tut.i] && TUT[tut.i][0] === key) { tut.i++; renderTut(); } }

function css() {
  const s = document.createElement('style'); s.textContent = `
#skHud{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 64px);transform:translateX(-50%);z-index:7;text-align:center;pointer-events:none;color:#ffe2c0;font:600 13px/1.3 system-ui,sans-serif;text-shadow:0 0 12px #ff5a1a99,0 1px 2px #000}
#skHud .sk-score{font-size:24px;font-weight:800;letter-spacing:.04em}#skHud .sk-score small{display:block;font-size:10px;opacity:.65;font-weight:600}
#skHud .sk-combo{margin-top:4px;font-size:13px;color:#ffd08a}#skHud .sk-combo b{display:block;font-size:18px;color:#ff8a2a}
#skHud .sk-msg{margin-top:6px;font-size:16px;color:#fff}#skHud .sk-msg.big{font-size:22px;color:#ffb347}
#skTut{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 26px);transform:translateX(-50%);z-index:8;background:rgba(14,8,6,.86);border:1px solid #ff7a1877;border-radius:12px;padding:8px 14px 8px;color:#ffe9d2;font:13px/1.35 system-ui,sans-serif;text-align:center;box-shadow:0 0 24px #ff4a1a44;min-width:220px}
#skTut small{display:block;font-size:10px;color:#ffb36baa;letter-spacing:.08em}#skTut b{display:block;font-size:15px;color:#ffb36b}#skTut button{margin-top:4px;background:none;border:0;color:#ffffff77;font:11px system-ui;pointer-events:auto}
#skBtns{position:fixed;right:16px;bottom:calc(120px + 58px*3 + 30px);display:none;grid-template-columns:repeat(2,64px);gap:10px;z-index:7}
#skBtns button{height:64px;border-radius:50%;border:1px solid #ff7a1888;background:radial-gradient(circle at 40% 35%,#3a1a0ccc,#120806dd);color:#ffd2a8;font:700 12px system-ui;touch-action:none;-webkit-user-select:none;user-select:none}
#skBtns button.on,#skBtns button:active{background:radial-gradient(circle,#ff7a18,#7a2a08);color:#140600}
#tSkate.on{background:#ff7a18!important;color:#140600!important}
@media (max-height:520px){#skBtns{bottom:20px;right:calc(16px + 58px*2 + 26px)}}`;
  document.head.appendChild(s);
}
function touchButtons() {
  const c = C();
  // a skate toggle beside the existing touch buttons, and trick buttons that only show while skating
  const tb = document.getElementById('tbtns');
  if (tb && !document.getElementById('tSkate')) { const b = document.createElement('button'); b.id = 'tSkate'; b.setAttribute('aria-label', 'Skate'); b.textContent = '🛹'; tb.appendChild(b); b.addEventListener('click', e => { e.preventDefault(); toggle(); }); }
  btns = document.createElement('div'); btns.id = 'skBtns';
  const mk = (id, label, key) => { const b = document.createElement('button'); b.id = id; b.textContent = label; const on = e => { e.preventDefault(); touchSK[key] = 1; b.classList.add('on'); }, off = e => { e.preventDefault(); touchSK[key] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); btns.appendChild(b); };
  mk('skFlip', 'FLIP', 'flip'); mk('skHeel', 'HEEL', 'heel'); mk('skGrab', 'GRAB', 'grab'); mk('skGrind', 'GRIND', 'grind');
  document.body.appendChild(btns);
  // while skating, the existing jump button reads OLLIE
  const j = document.getElementById('tJump'); if (j) { const orig = j.textContent; setInterval(() => { j.textContent = SK.active ? 'OLLIE' : orig; j.style.fontSize = SK.active ? '12px' : ''; }, 250); }
}

// ---------------------------------------------------------------- the skatepark (Ember Yard) + board mesh
function concreteTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#7d7772'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 100 + Math.random() * 60 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 8},${Math.random() * .25})`; g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  g.strokeStyle = 'rgba(40,36,34,.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function build() {
  if (built) return; built = true; css();
  const c = C(); root = new THREE.Group(); root.name = 'skate'; c.S.add(root);
  hud = document.createElement('div'); hud.id = 'skHud'; hud.style.display = 'none'; document.body.appendChild(hud);
  touchButtons(); if (btns) btns.style.display = 'none';
  // board
  board = new THREE.Group(); const deckG = new THREE.Group(); board.add(deckG);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(.22, .025, .8), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: .7, metalness: .1 })); deckG.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(.06, .027, .62), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, .55, .12) })); deckG.add(stripe);
  const wM = new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: .4, emissive: 0x3a1500 }), tM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .9, roughness: .3 });
  for (const z of [-.28, .28]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(.2, .03, .05), tM); tr.position.set(0, -.03, z); deckG.add(tr); for (const x of [-.1, .1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .03, 10).rotateZ(Math.PI / 2), wM); w.position.set(x, -.055, z); deckG.add(w); } }
  board.visible = false; c.S.add(board);
  buildPark(c);
}

// Ember Yard: one compact park. Everything is a registry piece, so the same pieces can dress streets later.
const PARK = { x: -106, z: 54, yaw: 0 };
function buildPark(c) {
  const cx = PARK.x, cz = PARK.z;
  const geo = { con: [], steel: [], ember: [], dark: [] };
  const conM = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: .86, metalness: 0, color: 0xe2dad2, emissive: 0x2a2018, emissiveIntensity: 1 });
  const steelM = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: .95, roughness: .28 });
  const emberM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, .62, .14) });
  const darkM = new THREE.MeshStandardMaterial({ color: 0x241a17, roughness: .55, metalness: .4 });
  const put = (list, g, x, y, z, yaw = 0) => { g.rotateY(yaw); g.translate(x, y, z); list.push(g); };
  const W = (lx, lz) => ({ x: cx + lx, z: cz + lz });
  // slab
  put(geo.con, planeUV(46, 40), cx, .03, cz); addPiece({ type: 'box', x: cx, z: cz, w: 46, d: 40, h: .03 });
  // ember trim around the slab
  for (const [w, d, x, z] of [[46, .14, 0, -20], [46, .14, 0, 20], [.14, 40, -23, 0], [.14, 40, 23, 0]]) put(geo.ember, new THREE.BoxGeometry(w, .05, d), cx + x, .05, cz + z);

  // quarter pipes at the north and south ends, facing each other
  for (const [lz, yaw] of [[-15.5, Math.PI], [15.5, 0]]) {
    const p = W(0, lz); const q = addPiece({ type: 'quarter', x: p.x, z: p.z, w: 16, d: 3.2, h: 2.4, deck: 1.6, yaw });
    put(geo.con, quarterGeo(16, 3.2, 2.4, 14), p.x, 0, p.z, yaw);
    const deckBack = new THREE.BoxGeometry(16, 2.4, 1.6); deckBack.translate(0, 1.2, 3.2 / 2 + .8); put(geo.dark, deckBack, p.x, 0, p.z, yaw);
    const cop = new THREE.CylinderGeometry(.06, .06, 16, 10).rotateZ(Math.PI / 2); cop.translate(0, 2.42, 1.6); put(geo.steel, cop, p.x, 0, p.z, yaw);
    const strip = new THREE.BoxGeometry(16, .08, .05); strip.translate(0, 2.3, 1.62); put(geo.ember, strip, p.x, 0, p.z, yaw);
    // flame braziers on the deck corners
    for (const sx of [-7.4, 7.4]) brazier(c, toWorld(q, sx, 3.2 / 2 + .8), 2.4);
  }
  // funbox: banks up to a 0.8 m table with a hubba ledge on top
  { const p = W(-8, 0); addPiece({ type: 'box', x: p.x, z: p.z, w: 4.5, d: 5, h: .8, grind: true });
    put(geo.con, new THREE.BoxGeometry(4.5, .8, 5).translate(0, .4, 0), p.x, 0, p.z);
    for (const [s, yaw] of [[-1, 0], [1, Math.PI]]) { const rz = s * (2.5 + 1.25); const r = addPiece({ type: 'ramp', x: p.x, z: p.z + rz, w: 4.5, d: 2.5, h: .8, yaw }); put(geo.con, wedgeGeo(4.5, 2.5, .8), p.x, 0, p.z + rz, yaw); }
    for (const sx of [-1, 1]) put(geo.steel, new THREE.BoxGeometry(.06, .06, 5).translate(sx * 2.25, .82, 0), p.x, 0, p.z);
  }
  // flat ember rail (centre)
  { const a = W(1, -6), b = W(1, 6); addPiece({ type: 'rail', ax: a.x, az: a.z, bx: b.x, bz: b.z, y: .42 });
    put(geo.steel, new THREE.CylinderGeometry(.04, .04, 12, 10).rotateX(Math.PI / 2).translate(0, .42, 0), a.x, 0, (a.z + b.z) / 2);
    for (const t of [-5.5, 0, 5.5]) put(geo.dark, new THREE.CylinderGeometry(.035, .035, .42, 8).translate(0, .21, t), a.x, 0, (a.z + b.z) / 2);
    put(geo.ember, new THREE.BoxGeometry(.02, .02, 11.8).translate(0, .465, 0), a.x, 0, (a.z + b.z) / 2);
  }
  // stair set with handrail: landing 1.05 m high at the east side, descending west
  { const p = W(14, 0), yaw = -Math.PI / 2, top = 3, d = 3.2, h = 1.05, steps = 4, w = 5;
    addPiece({ type: 'stairs', x: p.x, z: p.z, w, d, h, top, yaw });
    for (let i = 0; i < steps; i++) { const sh = h * (1 - i / steps), lz = -d / 2 + (i + .5) * d / steps; put(geo.con, new THREE.BoxGeometry(w, sh, d / steps).translate(0, sh / 2, lz), p.x, 0, p.z, yaw); }
    put(geo.con, new THREE.BoxGeometry(w, h, top).translate(0, h / 2, -d / 2 - top / 2), p.x, 0, p.z, yaw);
    // down rail along the stairs (one side)
    const a = toWorld({ x: p.x, z: p.z, c: Math.cos(yaw), s: Math.sin(yaw) }, w / 2 - .4, -d / 2 - .2), b = toWorld({ x: p.x, z: p.z, c: Math.cos(yaw), s: Math.sin(yaw) }, w / 2 - .4, d / 2 + .3);
    addPiece({ type: 'rail', ax: a.x, az: a.z, bx: b.x, bz: b.z, y: h + .85, y2: .85 - .05 });
    const len = Math.hypot(b.x - a.x, b.z - a.z), dy = (h + .85) - .8, ang = Math.atan2(dy, len);
    const rg = new THREE.CylinderGeometry(.04, .04, Math.hypot(len, dy), 10).rotateX(Math.PI / 2).rotateX(ang); rg.rotateY(Math.atan2(b.x - a.x, b.z - a.z)); rg.translate((a.x + b.x) / 2, (h + .85 + .8) / 2, (a.z + b.z) / 2); geo.steel.push(rg);
    for (const t of [0, .5, 1]) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = (h + .85) + ((.8) - (h + .85)) * t, base = t === 0 ? h : t === 1 ? 0 : h * .5; geo.dark.push(new THREE.CylinderGeometry(.035, .035, y - base, 8).translate(x, base + (y - base) / 2, z)); }
  }
  // ledges/curbs along the west edge, and a bank in the south-west corner
  { const p = W(-19, -6); addPiece({ type: 'box', x: p.x, z: p.z, w: 1, d: 9, h: .45, grind: true }); put(geo.con, new THREE.BoxGeometry(1, .45, 9).translate(0, .225, 0), p.x, 0, p.z); put(geo.steel, new THREE.BoxGeometry(1.02, .03, 9.02).translate(0, .45, 0), p.x, 0, p.z);
    const p2 = W(-19, 7); addPiece({ type: 'box', x: p2.x, z: p2.z, w: 1, d: 6, h: .3, grind: true }); put(geo.con, new THREE.BoxGeometry(1, .3, 6).translate(0, .15, 0), p2.x, 0, p2.z); put(geo.ember, new THREE.BoxGeometry(1.02, .02, 6.02).translate(0, .31, 0), p2.x, 0, p2.z);
    const p3 = W(9, 10); addPiece({ type: 'ramp', x: p3.x, z: p3.z, w: 6, d: 3.5, h: 1.1, yaw: -Math.PI / 2, deck: 1.2 }); put(geo.con, wedgeGeo(6, 3.5, 1.1, 1.2), p3.x, 0, p3.z, -Math.PI / 2);
  }
  // fire pillars around the yard: steel posts topped with flame bowls (the BURN signature)
  for (const [lx, lz] of [[-23, -20], [23, -20], [-23, 20], [23, 20], [-23, 0], [23, -8]]) { const w = W(lx, lz); put(geo.dark, new THREE.CylinderGeometry(.18, .26, 2.2, 10).translate(0, 1.1, 0), w.x, 0, w.z); put(geo.ember, new THREE.BoxGeometry(.05, 1.6, .4).translate(0, 1.1, 0), w.x + (lx < 0 ? -.2 : .2), 0, w.z); brazier(c, w, 2.2); }
  // merge per material: the whole park is a handful of draw calls
  for (const [k, m] of [['con', conM], ['steel', steelM], ['ember', emberM], ['dark', darkM]]) {
    const gs = geo[k].map(g => (g.index ? g.toNonIndexed() : g)); gs.forEach(g => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
    const mg = mergeGeometries(gs, false); const mesh = new THREE.Mesh(mg, m); mesh.receiveShadow = true; mesh.castShadow = k !== 'ember'; root.add(mesh);
  }
  // a warm light over the park so it reads at night without adding bloom everywhere
  const L = new THREE.PointLight(0xff8a3a, 60, 46, 1.6); L.position.set(cx, 9, cz); root.add(L);
  SK.park = { x: cx, z: cz };
}
function planeUV(w, d) { const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4); return g; }
function quarterGeo(w, d, h, seg) {
  // curved transition + vertical back; local z from -d/2 (floor) to +d/2 (lip)
  const pos = [], uv = [];
  const prof = []; for (let i = 0; i <= seg; i++) { const t = i / seg; prof.push([-d / 2 + t * d, h * (1 - Math.sqrt(Math.max(0, 1 - t * t)))]); }
  for (let i = 0; i < seg; i++) { const [z0, y0] = prof[i], [z1, y1] = prof[i + 1]; const v0 = i / seg * 2, v1 = (i + 1) / seg * 2;
    pos.push(-w / 2, y0, z0, w / 2, y0, z0, w / 2, y1, z1, -w / 2, y0, z0, w / 2, y1, z1, -w / 2, y1, z1); uv.push(0, v0, w / 4, v0, w / 4, v1, 0, v0, w / 4, v1, 0, v1);
    for (const sx of [-1, 1]) { pos.push(sx * w / 2, 0, z0, sx * w / 2, y0, z0, sx * w / 2, y1, z1, sx * w / 2, 0, z0, sx * w / 2, y1, z1, sx * w / 2, 0, z1); uv.push(0, 0, 0, y0 / 4, 0, y1 / 4, 0, 0, 0, y1 / 4, 0, 0); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
function wedgeGeo(w, d, h, deck = 0) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, h); if (deck) s.lineTo(d / 2 + deck, h), s.lineTo(d / 2 + deck, 0); else s.lineTo(d / 2, 0); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2);   // shape x -> world z
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4); return g;
}
// animated flame (one tiny shader, additive) on a steel bowl
let flameMat = null;
function brazier(c, at, y) {
  if (!flameMat) flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { t: c.U ? c.U.t : { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float t;varying vec2 vUv;float n(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(n(i),n(i+vec2(1,0)),f.x),mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x),f.y);}void main(){vec2 u=vUv;float h=u.y;float w=1.-abs(u.x-.5)*2.;float fl=sn(vec2(u.x*4.,u.y*3.-t*3.2))*.6+sn(vec2(u.x*9.,u.y*6.-t*5.))*.4;float a=smoothstep(0.,.35,w-h*.9+fl*.45-.15)*(1.-h);vec3 col=mix(vec3(1.,.25,.03),vec3(1.,.8,.35),a);gl_FragColor=vec4(col*a*1.6,a);}'
  });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(.42, .28, .32, 14), new THREE.MeshStandardMaterial({ color: 0x2a2220, metalness: .85, roughness: .35 })); bowl.position.set(at.x, y + .16, at.z); root.add(bowl);
  for (const r of [0, Math.PI / 2]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(.8, 1.3), flameMat); f.position.set(at.x, y + .32 + .62, at.z); f.rotation.y = r; root.add(f); }
}

// test hooks (headless QA only)
SK.test.teleport = (x, z, h = 0) => { st.pos.set(x, heightAt(x, z, 50), z); st.vel.set(0, 0, 0); st.h = h; st.air = false; st.grind = null; st.bail = 0; };
SK.test.heightAt = (x, z, y = 50) => heightAt(x, z, y);
SK.test.state = st;
