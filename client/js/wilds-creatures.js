// BURN City: The Wilds — original procedural creature models + animation (no external assets).
// Each creature is a small rig of articulated parts (body, head, legs, tail chain, ears/fins) built from smooth primitives
// with baked vertex colours (back/belly gradient + mottling). One shared lit material + one shared glow material for all,
// so adding creatures adds draw calls but never new shader programs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let MAT = null, GLOW = null, SHADOW = null;
export function mats() {
  if (!MAT) {
    MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 });
    GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    SHADOW = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false });
  }
  return { MAT, GLOW, SHADOW };
}
// hash noise for mottling
const hn = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
// paint: top colour on the back, belly colour underneath, plus soft noise
function paint(g, top, belly, noise = .08, axis = 1) {
  g = g.index ? g.toNonIndexed() : g; g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), A = new THREE.Color(top), B = new THREE.Color(belly ?? top), c = new THREE.Color();
  const lo = axis === 1 ? bb.min.y : bb.min.z, hi = axis === 1 ? bb.max.y : bb.max.z;
  for (let i = 0; i < n; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const t = Math.min(1, Math.max(0, ((axis === 1 ? y : z) - lo) / ((hi - lo) || 1))); c.copy(B).lerp(A, Math.pow(t, .8)); const k = 1 + (hn(Math.round(x * 9), Math.round(y * 9), Math.round(z * 9)) - .5) * noise * 2; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g;
}
const ell = (rx, ry, rz, x = 0, y = 0, z = 0, seg = 14) => new THREE.SphereGeometry(1, seg, Math.max(8, seg * .7 | 0)).scale(rx, ry, rz).translate(x, y, z);
const cone = (r, h, x, y, z, seg = 8) => new THREE.ConeGeometry(r, h, seg).translate(x, y, z);
const cap = (r, l, seg = 8) => new THREE.CapsuleGeometry(r, l, 4, seg);
const M = a => mergeGeometries(a.map(g => g.index ? g.toNonIndexed() : g), false);
function part(geo, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }
// leg geometry with the pivot at the hip (top), hanging down to -len
function legGeo(r, len, col, foot) { return M([paint(cap(r, len - r * 2).translate(0, -len / 2, 0), col, foot ?? col, .05), paint(ell(r * 1.25, r * .7, r * 1.6, 0, -len + r * .4, r * .35), foot ?? col, foot ?? col, .04)]); }
function eyes(g, x, y, z, r, glowCol) {
  const out = [];
  for (const s of [-1, 1]) { out.push(paint(ell(r, r, r * .8, s * x, y, z), 0x0b0d10, 0x0b0d10, 0)); }
  const gl = M([-1, 1].map(s => paint(ell(r * .38, r * .38, r * .3, s * x + s * r * .15, y + r * .3, z + r * .6), glowCol, glowCol, 0)));
  return { dark: M(out), glint: gl };
}

// ---------------------------------------------------------------- species rigs
const BUILD = {
  mosskit(root, L) {   // small moss-furred feline forager with leaf ears and a fern-curl tail
    const { MAT, GLOW } = mats(), body = new THREE.Group(); root.add(body); body.position.y = .36;
    part(M([paint(ell(.26, .2, .38, 0, 0, 0), 0x5f9a3e, 0xd8d2a8, .12), ...[[-.08, .17, -.1], [.09, .16, .05], [0, .19, -.02], [-.05, .15, .17], [.06, .16, -.2]].map(([x, y, z]) => paint(new THREE.DodecahedronGeometry(.075, 0).translate(x, y, z), 0x3f7a2c, 0x2f5f22, .2))]), MAT, body);
    const head = new THREE.Group(); head.position.set(0, .14, .36); body.add(head);
    part(M([paint(ell(.2, .18, .19, 0, .02, 0), 0x6aa846, 0xe4dcb4, .1), paint(ell(.11, .08, .1, 0, -.04, .14), 0xe4dcb4, 0xd8cfa4, .05), paint(ell(.03, .025, .02, 0, -.01, .24), 0x2a1a14, 0x2a1a14, 0)]), MAT, head);
    const e = eyes(head, .085, .05, .14, .045, 0xffc23a); part(e.dark, MAT, head); part(e.glint, GLOW, head);
    L.ears = [-1, 1].map(s => { const ear = new THREE.Group(); ear.position.set(s * .11, .16, -.02); head.add(ear); part(M([paint(new THREE.ConeGeometry(.07, .22, 4).scale(1, 1, .35).translate(0, .11, 0), 0x86c24a, 0x4f8a33, .1), paint(new THREE.ConeGeometry(.012, .2, 3).translate(0, .1, .02), 0x2f6a22, 0x2f6a22, 0)]), MAT, ear); ear.rotation.z = -s * .35; return ear; });
    L.legs = [[-.14, .2], [.14, .2], [-.14, -.22], [.14, -.22]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, -.08, z); body.add(g); part(legGeo(.05, .3, 0x588f39, 0xcfc59a), MAT, g); return g; });
    L.tail = chain(body, 0, .05, -.36, 5, i => paint(ell(.075 - i * .006, .075 - i * .006, .1, 0, 0, -.07), i === 4 ? 0x9bd45a : 0x5a9a3a, 0x3f7a2c, .15), .12, GLOW, i => i === 4 ? paint(new THREE.ConeGeometry(.05, .14, 4).scale(1, .3, 1).rotateX(-1.2).translate(0, .02, -.14), 0x7dffb0, 0x7dffb0, 0) : null);
    L.head = head; L.body = body; L.h = .36; L.gait = 9; L.stride = .5; L.speed = 2.2;
  },
  cinderling(root, L) {   // charcoal ember-lizard: glowing seams, two horn nubs, a flame-tipped tail
    const { MAT, GLOW } = mats(), body = new THREE.Group(); root.add(body); body.position.y = .26;
    part(paint(ell(.2, .15, .4, 0, 0, 0), 0x2c2422, 0x4a3a32, .14), MAT, body);
    part(M([[-.1, .1], [0, .13], [.1, .1]].flatMap(([x, y]) => [-.2, 0, .2].map(z => paint(new THREE.BoxGeometry(.025, .02, .14).translate(x, y, z), 0xff6a1a, 0xff8a2a, .2))).concat([0, .1, .2, -.1, -.2].map(z => paint(new THREE.ConeGeometry(.03, .08, 4).translate(0, .16, z), 0xff9a3a, 0xff5a10, .1)))), GLOW, body);
    const head = new THREE.Group(); head.position.set(0, .07, .4); body.add(head);
    part(M([paint(ell(.14, .11, .2, 0, 0, .05), 0x342a26, 0x55443a, .1), paint(ell(.08, .05, .1, 0, -.03, .22), 0x3c302a, 0x55443a, .05), ...[-1, 1].map(s => paint(new THREE.ConeGeometry(.03, .12, 6).rotateX(-.9).translate(s * .07, .1, -.04), 0x1a1412, 0x5a4a40, .1))]), MAT, head);
    const e = eyes(head, .075, .04, .14, .035, 0xffe060); part(e.dark, MAT, head); part(e.glint, GLOW, head);
    L.legs = [[-.16, .22], [.16, .22], [-.16, -.22], [.16, -.22]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, -.06, z); body.add(g); g.rotation.z = (x > 0 ? -1 : 1) * .35; part(legGeo(.045, .22, 0x2c2422, 0x1a1412), MAT, g); return g; });
    L.tail = chain(body, 0, .02, -.38, 6, i => paint(ell(.07 - i * .009, .06 - i * .007, .11, 0, 0, -.08), 0x2c2422, 0x3c302a, .12), .13, GLOW, i => i === 5 ? paint(new THREE.ConeGeometry(.05, .2, 6).rotateX(-Math.PI / 2 - .5).translate(0, .05, -.16), 0xffb040, 0xff4a10, 0) : null);
    L.flame = L.tail.extra[5]; L.head = head; L.body = body; L.h = .26; L.gait = 12; L.stride = .45; L.speed = 2.8; L.slink = 1;
  },
  rillfin(root, L) {   // pale creek-newt with fan gills, a dorsal fin ribbon and a paddle tail
    const { MAT, GLOW } = mats(), body = new THREE.Group(); root.add(body); body.position.y = .2;
    part(M([paint(ell(.17, .12, .34, 0, 0, 0), 0x77cbd8, 0xe8f6f2, .08), paint(new THREE.BoxGeometry(.012, .1, .5).translate(0, .14, -.02), 0x4ab0d0, 0x9fe4f0, .05)]), MAT, body);
    const head = new THREE.Group(); head.position.set(0, .04, .34); body.add(head);
    part(paint(ell(.15, .1, .15, 0, 0, .04), 0x86d4de, 0xf0faf6, .06), MAT, head);
    const e = eyes(head, .09, .05, .1, .035, 0xaef6ff); part(e.dark, MAT, head); part(e.glint, GLOW, head);
    L.ears = [-1, 1].map(s => { const fan = new THREE.Group(); fan.position.set(s * .13, .03, 0); head.add(fan);
      part(M([0, 1, 2].map(k => paint(new THREE.ConeGeometry(.035, .2, 5).scale(1, 1, .3).rotateZ(-s * (1 + k * .45)).translate(s * .08, .03 + (1 - k) * .05, -.02 - k * .02), 0xff7aa8, 0xffc4dc, .1))), GLOW, fan); return fan; });
    L.legs = [[-.14, .17], [.14, .17], [-.14, -.17], [.14, -.17]].map(([x, z]) => { const g = new THREE.Group(); g.position.set(x, -.05, z); g.rotation.z = (x > 0 ? -1 : 1) * .6; body.add(g); part(legGeo(.04, .17, 0x77cbd8, 0xb8ecf0), MAT, g); return g; });
    L.tail = chain(body, 0, .01, -.32, 6, i => M([paint(ell(.06 - i * .008, .05 - i * .006, .1, 0, 0, -.08), 0x6cc2d2, 0xd8f2ee, .08), paint(new THREE.BoxGeometry(.01, .12 - i * .012, .15).translate(0, .03, -.08), 0x58b8d8, 0xa8e8f4, .05)]), .12);
    L.head = head; L.body = body; L.h = .2; L.gait = 10; L.stride = .35; L.speed = 2.0; L.wiggle = 1;
  },
  shardmole(root, L) {   // stocky burrower: dense dusk fur, star nose, spade claws, crystal ridge that glows
    const { MAT, GLOW } = mats(), body = new THREE.Group(); root.add(body); body.position.y = .34;
    part(M([paint(ell(.34, .28, .42, 0, 0, 0), 0x6e5d52, 0x4a3e38, .16), paint(ell(.22, .16, .2, 0, -.12, .26), 0x8a786a, 0x6a5a50, .1)]), MAT, body);
    const cr = []; [[0, .28, -.05, .09, .3, 0], [.12, .24, .08, .07, .22, -.4], [-.12, .25, -.12, .07, .24, .45], [.06, .22, -.24, .06, .18, -.2], [-.08, .26, .14, .06, .2, .3], [0, .22, .28, .05, .14, .1]].forEach(([x, y, z, r, h, t]) => cr.push(paint(new THREE.OctahedronGeometry(1, 0).scale(r, h, r).rotateZ(t).translate(x, y, z), 0xb48cff, 0x5ad8ff, .1)));
    L.crystals = part(M(cr), GLOW, body);
    const head = new THREE.Group(); head.position.set(0, .02, .4); body.add(head);
    part(M([paint(ell(.2, .17, .18, 0, 0, 0), 0x75645a, 0x5a4a42, .12), ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k / 8 * Math.PI * 2; return paint(new THREE.ConeGeometry(.018, .06, 4).rotateX(Math.PI / 2).translate(Math.cos(a) * .035, Math.sin(a) * .035 - .02, .2), 0xff9ab0, 0xff7a98, 0); })]), MAT, head);
    const e = eyes(head, .09, .06, .14, .022, 0x9fe8ff); part(e.dark, MAT, head); part(e.glint, GLOW, head);
    L.legs = [[-.22, .24], [.22, .24], [-.22, -.22], [.22, -.22]].map(([x, z], i) => { const g = new THREE.Group(); g.position.set(x, -.12, z); body.add(g);
      part(M([legGeo(.07, .24, 0x5e4e46, 0x4a3e38), ...(i < 2 ? [0, 1, 2].map(k => paint(new THREE.ConeGeometry(.022, .12, 4).rotateX(Math.PI / 2 + .5).translate((k - 1) * .035, -.24, .1), 0xece2d0, 0xc8bca8, 0)) : [])]), MAT, g); return g; });
    L.tail = chain(body, 0, -.05, -.42, 2, i => paint(ell(.04, .04, .06, 0, 0, -.04), 0x5e4e46, 0x4a3e38, .1), .07);
    L.head = head; L.body = body; L.h = .34; L.gait = 7; L.stride = .45; L.speed = 1.7; L.waddle = 1;
  },
};
// tail = chain of nested groups (each segment rotates relative to the last => smooth curl), simulated with a spring per joint
function chain(parent, x, y, z, n, geoFn, len, glowMat, extraFn) {
  const { MAT } = mats(); const segs = [], extra = []; let p = parent, px = x, py = y, pz = z;
  for (let i = 0; i < n; i++) { const g = new THREE.Group(); g.position.set(px, py, pz); p.add(g); part(geoFn(i), MAT, g); const ex = extraFn && extraFn(i); extra.push(ex ? part(ex, glowMat, g) : null); segs.push({ g, a: 0, v: 0, b: 0, bv: 0 }); p = g; px = 0; py = 0; pz = -len; }
  segs.extra = extra; return segs;
}

export function buildCreature(sp, lite) {
  const root = new THREE.Group(), L = { sp, ears: [], legs: [], tail: [] };
  (BUILD[sp] || BUILD.mosskit)(root, L);
  const { SHADOW } = mats(); const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), SHADOW); sh.scale.set(.9, 1, 1.3).multiplyScalar(L.h * 2.4); sh.position.y = .04; sh.renderOrder = -1; root.add(sh);
  root.userData.rig = L; L.ph = Math.random() * 10; L.blink = 0; L.twitch = 0; L.look = 0; L.prevYaw = 0; L.bob = 0;
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return root;
}

// procedural animation: speed (m/s) drives gait; yawRate drives tail swing (secondary motion via damped springs)
export function animate(root, dt, speed, t, o = {}) {
  const L = root.userData.rig; if (!L) return;
  const mv = Math.min(1, speed / (L.speed * 1.4)); L.ph += dt * (L.gait * (.35 + mv * .9));
  const s = Math.sin(L.ph), c = Math.cos(L.ph);
  // legs: diagonal pairs (trot), stride scales with speed
  const amp = L.stride * mv;
  L.legs.forEach((g, i) => { const ph = (i === 0 || i === 3) ? s : -s; g.rotation.x = ph * amp; });
  // body: bob, roll, salamander wiggle / mole waddle; idle breathing
  const breathe = Math.sin(t * 2.2 + L.ph * .1) * .012;
  L.body.position.y = L.h + Math.abs(c) * .03 * mv + breathe + (o.lift || 0);
  L.body.rotation.z = (L.waddle ? s * .12 * mv : s * .03 * mv) + (o.lean || 0);
  L.body.rotation.y = L.wiggle ? s * .22 * mv : 0;
  L.body.rotation.x = (o.crouch || 0) + (L.slink ? -.05 * mv : 0);
  // head: looks at a target yaw (relative), sniffs the ground while idle, counter-rotates the wiggle
  const hy = (o.lookYaw || 0) - L.body.rotation.y; L.look += (hy - L.look) * Math.min(1, dt * 6);
  L.head.rotation.y = Math.max(-1, Math.min(1, L.look));
  const sniff = o.sniff ? (Math.sin(t * 9) * .05 + .35) : 0; L.head.rotation.x += ((o.headPitch || 0) + sniff - L.head.rotation.x) * Math.min(1, dt * 5);
  // ears / fins: idle flick + random twitch
  L.twitch -= dt; if (L.twitch < 0) { L.twitch = 1.5 + Math.random() * 4; L.tw = .5; }
  L.tw = Math.max(0, (L.tw || 0) - dt * 3);
  L.ears.forEach((e, i) => { e.rotation.x = Math.sin(t * 3 + i) * .06 + (i === 0 ? L.tw * .6 : 0) + (o.alert ? -.25 : 0); if (L.sp === 'rillfin') e.rotation.y = Math.sin(t * 4 + i * 3) * .25; });
  // tail: each joint is a damped spring chasing (gait sway + turn drag) — reacts to turns and stops with overshoot
  const yawRate = o.yawRate || 0; const k = 60, d = 9;
  L.tail.forEach((sg, i) => { const target = Math.sin(L.ph * (L.wiggle ? 1 : .5) - i * .7) * (L.wiggle ? .35 : .18) * (.4 + mv) - yawRate * .12 + (o.wag ? Math.sin(t * 14) * .5 : 0);
    sg.v += ((target - sg.a) * k - sg.v * d) * dt; sg.a += sg.v * dt; sg.g.rotation.y = sg.a;
    const lift = L.sp === 'mosskit' ? .35 + i * .05 : L.sp === 'cinderling' ? .06 : 0; sg.bv += ((lift - mv * .05 - sg.b) * k - sg.bv * d) * dt; sg.b += sg.bv * dt; sg.g.rotation.x = -sg.b; });
  if (L.flame) { const f = .8 + Math.sin(t * 23) * .12 + Math.sin(t * 37) * .08; L.flame.scale.set(f, f * (1.1 + Math.sin(t * 17) * .15), f); }
  if (L.crystals) { const p = .9 + Math.sin(t * 1.7) * .1; L.crystals.scale.setScalar(p > .99 ? 1 : p * .05 + .95); }
}
