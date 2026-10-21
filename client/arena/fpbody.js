// First-person body for Zombies, ported from the Pyretheum tower body (client/js/tower-interior.js makeBody/poseBody):
// capsule torso + chest plate + belt, hip/knee/ankle legs with boots. Arms stay on the view-model gun (sleeves + gloves).
// Phone-light: each rigid segment is merged into one vertex-coloured Lambert mesh -> 7 draws (torso, 2 thighs, 2 shins, 2 boots).
import * as THREE from 'three';
const SUIT = 0x24232a, PANEL = 0x15141a, BOOT = 0x0e0d10, TRIM = 0xc8901a;
function merge(parts) { const pos = [], nor = [], col = [], C = new THREE.Color();
  for (const [geo, c, m] of parts) { if (m) geo.applyMatrix4(m); const n = geo.index ? geo.toNonIndexed() : geo; C.setHex(c);
    pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); for (let i = 0; i < n.attributes.position.count; i++) col.push(C.r, C.g, C.b); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o; }
const T = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 8);
export function createFPBody(scene, { low = false } = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x140a06 });   // faint ember rim so it reads in the dark refinery
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const torso = new THREE.Mesh(merge([[cap(.14, .26), SUIT, T(0, 1.16, 0, 1.12, 1, .66)], [new THREE.BoxGeometry(.24, .2, .02), PANEL, T(0, 1.2, -.094)],
    [cap(.12, .06), SUIT, T(0, .95, 0, 1.2, 1, .75)], [new THREE.CylinderGeometry(.153, .153, .035, 14, 1, true), TRIM, T(0, 1.02, 0, 1.1, 1, .7)]]), mat); g.add(torso);
  const legs = [-1, 1].map(s => { const hip = new THREE.Group(); hip.position.set(s * .085, .93, 0); g.add(hip);
    hip.add(new THREE.Mesh(merge([[cap(.068, .34), SUIT, T(0, -.19, 0)], [new THREE.BoxGeometry(.006, .3, .012), TRIM, T(s * .07, -.2, 0)]]), mat));
    const knee = new THREE.Group(); knee.position.y = -.44; hip.add(knee); knee.add(new THREE.Mesh(merge([[cap(.058, .32), SUIT, T(0, -.177, 0)]]), mat));
    const ankle = new THREE.Group(); ankle.position.y = -.42; knee.add(ankle);
    ankle.add(new THREE.Mesh(merge([[new THREE.BoxGeometry(.11, .075, .26), BOOT, T(0, -.03, -.06)], [new THREE.BoxGeometry(.112, .012, .02), TRIM, T(0, -.04, -.19)], [new THREE.CylinderGeometry(.064, .064, .09, 10), BOOT, T(0, .02, 0)]]), mat));
    return { hip, knee, ankle }; });
  let walk = 0, bodyYaw = 0, lx = null, lz = 0, spd = 0;
  return {
    group: g,
    update(dt, me) { if (!me || low) { g.visible = false; lx = null; return; } g.visible = true;
      if (lx === null) { lx = me.x; lz = me.z; bodyYaw = me.yaw; } const d = Math.hypot(me.x - lx, me.z - lz); lx = me.x; lz = me.z; spd += ((d < 3 ? d / Math.max(dt, 1e-3) : 0) - spd) * Math.min(1, dt * 10);
      const amt = Math.min(1, spd / 6); walk += dt * spd * 3.1; const sw = Math.sin(walk), cw = Math.cos(walk), A = .5 * amt;   // stride follows real ground speed
      legs.forEach((l, i) => { const s = i ? -1 : 1; l.hip.rotation.x = s * sw * A; l.knee.rotation.x = -Math.max(0, -s * cw) * 1.05 * amt - .03; l.ankle.rotation.x = -s * sw * A * .35; });
      let dy = me.yaw - bodyYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); bodyYaw += dy * Math.min(1, dt * (spd > .3 ? 12 : 6));   // hips settle after turning
      const back = .2; g.position.set(me.x - Math.sin(bodyYaw) * back, (me.y || 0) + (me.down ? -0.6 : 0), me.z - Math.cos(bodyYaw) * back); g.rotation.set(0, bodyYaw + Math.PI, me.lean || 0); },   // rig front is -Z; arena forward is +Z
    dispose() { scene.remove(g); g.traverse(o => o.geometry?.dispose()); mat.dispose(); } };
}
