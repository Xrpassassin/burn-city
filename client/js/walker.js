// Shared walker model (own avatar + other players). Shared geometries/materials, ~22 meshes full / ~11 lite (phones, crowds).
// Front is -Z. legs/arms are hip/shoulder pivots (rotation.x swings); userData.legs/arms keep the old API.
import * as THREE from 'three';
const G = {}, M = {}, SK = [0xf1c8a5, 0xd9a47c, 0xb97c54, 0x8a5636, 0x5e3a24];
const geo = (k, f) => G[k] || (G[k] = f());
const std = (c, r = .55, m = .25, e = 0) => { const k = c + '_' + r + '_' + m + '_' + e; return M[k] || (M[k] = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e })) };
const bas = c => { const k = 'b' + c; return M[k] || (M[k] = new THREE.MeshBasicMaterial({ color: c, toneMapped: false })) };
let SHT = null; const shadowTex = () => { if (SHT) return SHT; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return SHT = new THREE.CanvasTexture(c) };
const shMat = () => M.sh || (M.sh = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }));
const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
export function buildWalker({ suit = 0x1b2338, accent = 0x7ee0ff, skin = 0, lite = false, hair = 0x14161c } = {}) {
  const g = new THREE.Group(), sm = std(suit, .5, .3, new THREE.Color(suit).multiplyScalar(.18).getHex()), dk = std(new THREE.Color(suit).lerp(new THREE.Color(0x10131c), .55).getHex(), .6, .25), skn = std(typeof skin === 'number' && skin > 4 ? skin : SK[skin % SK.length], .7, 0), glow = bas(accent);
  const add = (o, p, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); p.add(o); return o };
  const torso = new THREE.Group(); torso.position.y = .9; g.add(torso);
  add(new THREE.Mesh(geo('pel', () => new THREE.BoxGeometry(.34, .2, .2)), dk), torso, 0, 0, 0);
  const chest = add(new THREE.Mesh(geo('chest', () => { const c = cyl(.25, .19, .56, 10); c.scale(1, 1, .68); return c }), sm), torso, 0, .38, 0);
  add(new THREE.Mesh(geo('core', () => new THREE.BoxGeometry(.13, .13, .02)), glow), torso, 0, .5, -.175);
  add(new THREE.Mesh(geo('belt', () => new THREE.BoxGeometry(.36, .04, .22)), glow), torso, 0, .09, 0);
  add(new THREE.Mesh(geo('neck', () => cyl(.06, .07, .12, 8)), skn), torso, 0, .72, 0);
  const head = new THREE.Group(); torso.add(head); head.position.set(0, .93, 0);
  add(new THREE.Mesh(geo('head', () => { const h = new THREE.SphereGeometry(.19, 14, 10); h.scale(1, 1.1, 1.02); return h }), skn), head);
  if (!lite) add(new THREE.Mesh(geo('hair', () => { const h = new THREE.SphereGeometry(.205, 14, 8, 0, Math.PI * 2, 0, Math.PI * .43); h.scale(1, 1.1, 1.04); h.rotateX(.25); return h }), std(hair, .8, 0)), head, 0, .01, .01);
  // Small silhouette and clothing details on the full-quality player model only.
  // All detail geometries/materials are cached just like the base rig.
  if (!lite) {
    for (const side of [-1, 1]) {
      add(new THREE.Mesh(geo('collar', () => new THREE.BoxGeometry(.13, .075, .16)), dk), torso, side * .13, .69, -.035);
      add(new THREE.Mesh(geo('hipPouch', () => new THREE.BoxGeometry(.13, .16, .12)), dk), torso, side * .22, .07, .03);
    }
    add(new THREE.Mesh(geo('chestTrim', () => new THREE.BoxGeometry(.22, .025, .025)), glow), torso, 0, .29, -.166);
  }
  const visor = add(new THREE.Mesh(geo('visor', () => new THREE.BoxGeometry(.34, .07, .06)), glow), head, 0, .02, -.14);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * .33, 1.42, 0); g.add(a);
    add(new THREE.Mesh(geo('shl', () => new THREE.SphereGeometry(.085, 8, 6)), sm), a);
    if (lite) { add(new THREE.Mesh(geo('armL', () => { const c = cyl(.06, .045, .58, 6); return c }), sm), a, 0, -.29); add(new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(.052, 6, 5)), skn), a, 0, -.6) }
    else { add(new THREE.Mesh(geo('ua', () => cyl(.065, .052, .3, 8)), sm), a, 0, -.15); const f = new THREE.Group(); f.position.y = -.3; a.add(f); add(new THREE.Mesh(geo('fa', () => cyl(.05, .042, .27, 8)), sm), f, 0, -.135); add(new THREE.Mesh(geo('hand', () => new THREE.SphereGeometry(.052, 6, 5)), skn), f, 0, -.3); a.userData.elbow = f }
    arms.push(a);
    const l = new THREE.Group(); l.position.set(s * .13, .9, 0); g.add(l);
    if (lite) { add(new THREE.Mesh(geo('legL', () => cyl(.1, .07, .8, 7)), dk), l, 0, -.4); add(new THREE.Mesh(geo('boot', () => new THREE.BoxGeometry(.16, .1, .27)), sm), l, 0, -.85, -.04) }
    else { add(new THREE.Mesh(geo('th', () => cyl(.11, .085, .44, 8)), dk), l, 0, -.22); const k = new THREE.Group(); k.position.y = -.44; l.add(k); add(new THREE.Mesh(geo('sh', () => cyl(.085, .068, .4, 8)), dk), k, 0, -.2); add(new THREE.Mesh(geo('boot', () => new THREE.BoxGeometry(.16, .1, .27)), sm), k, 0, -.43, -.04); l.userData.knee = k }
    legs.push(l);
  }
  const sh = new THREE.Mesh(geo('shd', () => new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2)), shMat()); sh.position.y = .03; sh.renderOrder = -1; g.add(sh);
  g.userData = { legs, arms, head, torso, chest, visor, wk: 1 };
  return g;
}
// pose: ph = walk phase, amp 0..1 (0 = idle), t = seconds. Writes legs/arms rotation.x (compatible with NFT chars: extras apply only if present)
export function poseWalker(g, ph, amp, t = 0) {
  const u = g.userData, L = u.legs, A = u.arms, sw = Math.sin(ph) * .7 * amp;
  L[0].rotation.x = sw; L[1].rotation.x = -sw; A[0].rotation.x = -sw * .8; A[1].rotation.x = sw * .8;
  if (L[0].userData.knee) { L[0].userData.knee.rotation.x = -Math.max(0, Math.cos(ph)) * .9 * amp; L[1].userData.knee.rotation.x = -Math.max(0, -Math.cos(ph)) * .9 * amp }
  if (A[0].userData.elbow) { const b = .25 + .5 * amp; A[0].userData.elbow.rotation.x = -b * (.6 + .4 * Math.max(0, sw)); A[1].userData.elbow.rotation.x = -b * (.6 + .4 * Math.max(0, -sw)) }
  if (u.torso) { u.torso.rotation.y = Math.sin(ph) * .14 * amp; u.torso.rotation.x = -.07 * amp; u.torso.position.y = .9 + Math.abs(Math.sin(ph)) * .03 * amp; if (u.head) { u.head.rotation.y = -u.torso.rotation.y * .8 + Math.sin(t * .6) * .12 * (1 - amp) } if (u.chest) u.chest.scale.y = 1 + Math.sin(t * 1.8) * .012 * (1 - amp) }
  if (amp < .05) { const b = Math.sin(t * 1.8) * .03; A[0].rotation.z = .06 + b; A[1].rotation.z = -.06 - b } else { A[0].rotation.z = .04; A[1].rotation.z = -.04 }
}
