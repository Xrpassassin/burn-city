// Near-LOD "life layer" for City citizens, applied after the Walk/Idle clips each frame:
//  * head (neck 40 %, head 60 %) turns toward a player within a few metres in front of them;
//  * idle habits once someone has stood still for a second: look around, read the phone, check the watch,
//    or shift their weight. Each person keeps one habit (a.habit), with their own timing.
// Rotations are about world axes (up, and the person's own right-hand axis), so they work on every scan's rig
// regardless of its bone rolls. The phone and watch use the left arm, which no scan holds anything in.
import { wrap } from './citizens-motion.mjs';

export function makeLifeLayer(THREE) {
  const qa = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion(), right = new THREE.Vector3(), fwd = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const ease = (cur, to, k, dt) => (cur || 0) + (to - (cur || 0)) * (1 - Math.exp(-k * dt));
  // three's mixer skips re-writing a bone whose clip value did not change (a static idle pose), so every bone we
  // touch is restored to its clip value before the next mixer.update; otherwise the offsets would accumulate.
  let saved = null;
  function turn(b, axis, ang) {
    if (!b || !b.parent || Math.abs(ang) < 1e-4) return;
    if (!saved.has(b)) saved.set(b, b.quaternion.clone());
    b.parent.getWorldQuaternion(qp); qa.setFromAxisAngle(axis, ang);
    // local delta = parent⁻¹ · worldRotation · parent
    b.quaternion.premultiply(qi.copy(qp).invert().multiply(qa).multiply(qp));
  }
  function restore(s) {
    if (s.saved) for (const [b, q] of s.saved) b.quaternion.copy(q);
    if (s.saved) s.saved.clear();
  }
  function lifeLayer(s, a, dt, now, P) {
    saved = s.saved || (s.saved = new Map());
    const B = s.bones, t = now / 1000 + a.pace * 37;
    a.idleW = ease(a.idleW, a.still > 1 ? 1 : 0, 2.5, dt);
    let look = 0, pitch = 0;
    if (P) {
      const dx = P.x - a.x, dz = P.z - a.z, d = Math.hypot(dx, dz), rel = wrap(Math.atan2(dx, dz) - a.yaw);
      if (d < 7 * a.curious + 1.5 && Math.abs(rel) < 1.9) look = Math.max(-1.05, Math.min(1.05, rel));
    }
    const w = a.idleW, h = a.habit;
    const glance = h === 2 ? w * Math.max(0, Math.min(1, (Math.sin(t * .6) - .45) * 6)) : 0;
    if (!look && w > .01) {
      if (h === 0) look = .6 * Math.sin(t * .45) * Math.min(1, Math.max(0, Math.sin(t * .17) * 1.6)) * w;   // looking around
      if (h === 1) pitch = .45 * w;                                                                         // reading the phone
      if (h === 2) pitch = .32 * glance;                                                                    // watch glance
    }
    a.look = ease(a.look, look, 3, dt); a.pitch = ease(a.pitch, pitch, 3, dt);
    s.root.updateMatrixWorld(true);
    right.set(-Math.cos(a.yaw), 0, Math.sin(a.yaw)); fwd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    turn(B.neck, Y, a.look * .4); turn(B.head, Y, a.look * .6);
    // about the right-hand axis: a negative angle tips the head down, a positive one swings a hanging arm forward
    if (a.pitch > 1e-3) { turn(B.neck, right, -a.pitch * .4); turn(B.head, right, -a.pitch * .6); }
    if (w > .01) {
      const arm = h === 1 ? w : glance;
      if (arm > .01 && !s.handsBusy) { turn(B.upperarmL, right, .4 * arm); turn(B.forearmL, right, 1.3 * arm); }
      if (h === 3) turn(B.hips, fwd, .045 * Math.sin(t * .35) * w);                                       // weight shift
    }
  }
  lifeLayer.restore = restore;
  return lifeLayer;
}
