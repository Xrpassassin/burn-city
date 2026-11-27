// Weapons for the folk heroes: models + how each kind is held, aimed and swung.
// Models: Quaternius "Medieval Weapons Pack" (CC0), baked into assets/models/arsenal.glb (vertex colours, one draw call each).
// The staff, crossbow, bolt, quiver and throwing knife are procedural low-poly pieces made in the same flat style (original).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const URL_ARSENAL = new URL('assets/models/arsenal.glb', import.meta.url).href;

// Quaternius palette (linear) so procedural pieces match the pack
const PAL = { dark: [.13, .06, .03], wood: [.19, .08, .04], steel: [.30, .32, .35], lsteel: [.37, .39, .43], dsteel: [.21, .21, .18], gold: [.46, .37, .13], red: [.35, .03, .05], white: [.64, .64, .64], leather: [.16, .07, .035], black: [.02, .02, .02] };

// model id -> grip data. g: grip point along +Y (m) for the main hand; g2: second hand (two-handed); str: bowstring tips.
export const MODELS = {
  sword: { g: -.02 }, sabre: { g: -.01 }, goldsword: { g: -.01 }, claymore: { g: .24, g2: .07 }, greatsword: { g: .21, g2: .04 },
  axe: { g: -.2 }, battleaxe: { g: -.21 }, greataxe: { g: -.2, g2: -.47 }, hammer: { g: -.15 }, maul: { g: -.12, g2: -.36 },
  dagger: { g: -.02, a: -1.15 }, dagger2: { g: -.03, a: -1.15 }, knife: { g: -.035 }, spear: { g: -.18, g2: .26 }, staff: { g: .05, g2: -.32, a: .3, aIdle: 1.12 },
  bow: { g: 0, str: .243, tip: .609 }, bow2: { g: 0, str: .249, tip: .609 }, goldbow: { g: 0, str: .251, tip: .619 }, evilbow: { g: 0, str: .247, tip: .605 },
  crossbow: { g: 0, g2: .26 }, arrow: { g: 0 }, bolt: { g: 0 }, quiver: { g: 0 },
  shield_round: {}, shield_round2: {}, shield_heater: {}, shield_heater2: {}, shield_celtic: {},
};

let LIB = null;
export function loadArsenal() {
  if (LIB) return LIB;
  return LIB = new GLTFLoader().loadAsync(URL_ARSENAL).then(g => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .62, metalness: .25 });
    const src = {}; for (const c of g.scene.children) { c.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; } }); src[c.name] = c; }
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3aa0ff, emissiveIntensity: 1.6, flatShading: true, roughness: .2, toneMapped: false });
    const geos = [];
    proc(src, mat, glowMat, geos);
    const lib = {
      mat, glowMat, src,
      // a clone wrapped in a group whose origin is the model origin (the quantized node keeps its own offset)
      make(id) { const s = src[id]; if (!s) return null; const w = new THREE.Group(); w.name = id; w.add(s.clone(true)); return w; },
      dispose() { mat.dispose(); glowMat.dispose(); g.scene.traverse(o => o.geometry && o.geometry.dispose()); for (const x of geos) x.dispose(); LIB = null; },
    };
    return lib;
  });
}

// --------------------------------------------------------------- procedural pieces (flat, vertex-coloured)
function col(geo, c) { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); return geo.index ? geo.toNonIndexed() : geo; }
const cyl = (r0, r1, h, c, seg = 6) => col(new THREE.CylinderGeometry(r1, r0, h, seg, 1), c);
const box = (x, y, z, c) => col(new THREE.BoxGeometry(x, y, z), c);
function at(geo, x, y, z, rx = 0, ry = 0, rz = 0) { geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))); return geo; }
function node(name, parts, mat) { const g = mergeGeometries(parts); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = true; const n = new THREE.Group(); n.name = name; n.add(m); return { n, g }; }
function proc(src, mat, glowMat, geos) {
  const add = (name, parts, extra) => { const { n, g } = node(name, parts, mat); geos.push(g); if (extra) extra(n); src[name] = n; };
  // staff: dark shaft with leather wraps, a forked head cradling a glowing crystal
  add('staff', [at(cyl(.014, .02, 1.62, PAL.dark, 7), 0, .02, 0), at(cyl(.024, .024, .16, PAL.leather, 7), 0, .03, 0), at(cyl(.022, .022, .05, PAL.leather, 7), 0, .5, 0), at(cyl(.021, .016, .07, PAL.lsteel, 7), 0, -.79, 0),
    ...[0, 1, 2].map(i => at(cyl(.012, .004, .2, PAL.wood, 5), Math.sin(i * 2.09) * .03, .9, Math.cos(i * 2.09) * .03, Math.cos(i * 2.09) * .45, 0, -Math.sin(i * 2.09) * .45)), at(cyl(.03, .018, .05, PAL.wood, 7), 0, .82, 0)],
    n => { const c = new THREE.Mesh(new THREE.OctahedronGeometry(.045, 0), glowMat); c.scale.set(1, 1.6, 1); c.position.y = .93; c.name = 'crystal'; n.add(c); geos.push(c.geometry); });
  // crossbow: stock along +Y (forward), top +Z; prod across X; string drawn back when loaded (separate mesh)
  add('crossbow', [at(box(.045, .62, .05, PAL.wood), 0, .06, 0), at(box(.05, .2, .075, PAL.wood), 0, -.27, -.01), at(box(.03, .04, .11, PAL.dark), 0, -.03, -.06, .35), at(box(.012, .5, .012, PAL.dsteel), 0, .14, .03),
    at(cyl(.012, .016, .34, PAL.steel, 6), .17, .34, .01, 0, 0, 1.25), at(cyl(.012, .016, .34, PAL.steel, 6), -.17, .34, .01, 0, 0, -1.25), at(box(.07, .05, .04, PAL.lsteel), 0, .37, .01),
    at(col(new THREE.TorusGeometry(.04, .006, 4, 10, Math.PI), PAL.steel), 0, .4, .01, 0, 0, 0), at(box(.06, .02, .03, PAL.lsteel), 0, .16, .035)],
    n => { const s = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xd8d0c0 })); n.userData.tips = [new THREE.Vector3(.33, .29, .01), new THREE.Vector3(-.33, .29, .01)]; const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([n.userData.tips[0], new THREE.Vector3(0, .16, .04), n.userData.tips[1]]), new THREE.LineBasicMaterial({ color: 0xd8d0c0 })); ln.name = 'string'; n.add(ln); geos.push(ln.geometry, s.geometry); });
  // crossbow bolt: short, stubby fletching
  add('bolt', [at(cyl(.006, .006, .34, PAL.wood, 5), 0, .17, 0), at(col(new THREE.ConeGeometry(.012, .045, 4), PAL.steel), 0, .36, 0), at(box(.002, .06, .03, PAL.black), 0, .04, 0), at(box(.03, .06, .002, PAL.black), 0, .04, 0)]);
  // quiver: leather tube with a band and a fan of red fletchings (worn on the back)
  add('quiver', [at(cyl(.05, .06, .5, PAL.leather, 8), 0, .25, 0), at(cyl(.063, .063, .035, PAL.wood, 8), 0, .46, 0), at(cyl(.062, .062, .03, PAL.wood, 8), 0, .08, 0), at(cyl(.03, .03, .01, PAL.dark, 8), 0, 0, 0),
    ...[[-.02, .015], [.022, -.01], [0, -.025], [.02, .022], [-.025, -.018]].flatMap(([x, z], i) => [at(cyl(.004, .004, .14, PAL.wood, 4), x, .55, z), at(box(.003, .07, .03, i % 2 ? PAL.white : PAL.red), x, .6, z, 0, i, 0)])]);
  // throwing knife: leaf blade, short wrapped handle, ring pommel
  add('knife', [at(col(new THREE.ConeGeometry(.018, .14, 4), PAL.lsteel), 0, .08, 0, 0, Math.PI / 4, 0), at(box(.05, .01, .012, PAL.steel), 0, .008, 0), at(cyl(.008, .008, .07, PAL.leather, 5), 0, -.03, 0), at(col(new THREE.TorusGeometry(.012, .004, 4, 8), PAL.steel), 0, -.075, 0)]);
}

// --------------------------------------------------------------- weapon kinds: grip, stance and the clip set they use
// clips are UAL names (see hero.js CLIP), speeds keep the hit timing readable on phones
export const KINDS = {
  one: { n: 'One-handed', hand: 'r', light: [['Sword_Regular_A', 1.25, .36], ['Sword_Regular_B', 1.2, .36], ['Sword_Regular_C', 1.15, .38]], heavy: ['Sword_Attack', 1.15, .45], idle: 'Idle', ready: 'Sword_Idle', parry: 'Sword_Block' },
  two: { n: 'Two-handed', hand: 'r', two: 1, light: [['Sword_Regular_A', .95, .38], ['Sword_Regular_B', .9, .38]], heavy: ['TreeChopping_Loop', 1.0, .42, .62], idle: 'Idle', ready: 'Sword_Idle', parry: 'Sword_Block' },
  dagger: { n: 'Dagger', hand: 'r', light: [['Punch_Jab', 1.5, .34], ['Punch_Cross', 1.45, .36]], heavy: ['Melee_Hook', 1.25, .42], idle: 'Idle', ready: 'Sword_Idle', parry: 'Sword_Block' },
  spear: { n: 'Spear', hand: 'r', proc: 'spear', light: [['Punch_Cross', 1.25, .4]], heavy: ['Sword_Attack', 1.0, .47], idle: 'Idle', ready: 'Sword_Idle', parry: 'Sword_Block' },
  staff: { n: 'Staff', hand: 'r', two: 1, light: [['Sword_Regular_A', 1.0, .38], ['Sword_Regular_B', 1.0, .38]], heavy: ['Sword_Attack', 1.0, .45], idle: 'Idle', ready: 'Spell_Simple_Idle_Loop', parry: 'Sword_Block', cast: 1 },
  bow: { n: 'Bow', hand: 'l', proc: 'bow', ranged: 'arrow', idle: 'Idle', ready: 'Pistol_Aim_Neutral', parry: 'Sword_Block' },
  crossbow: { n: 'Crossbow', hand: 'r', proc: 'crossbow', ranged: 'bolt', idle: 'Idle', ready: 'Pistol_Aim_Neutral', parry: 'Sword_Block', reload: 'Pistol_Reload' },
  thrown: { n: 'Throwing', hand: 'r', ranged: 'knife', light: [['OverhandThrow', 1.5, .42]], idle: 'Idle', ready: 'Sword_Idle', parry: 'Sword_Block' },
};

// --------------------------------------------------------------- the rig: puts weapons in hands every frame (after the mixer)
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), UP = new THREE.Vector3(0, 1, 0);
export class Rig {
  // hero: Hero; lib: arsenal; o: { model, kind, shield, quiver }
  constructor(hero, lib, o) {
    this.h = hero; this.lib = lib; this.kind = KINDS[o.kind] || KINDS.one; this.kindId = o.kind; this.modelId = o.model; this.M = MODELS[o.model] || {};
    this.pose = { draw: 0, aim: 0, thrust: 0, two: 0, loaded: 1, nock: 1, carry: 1 }; this.objs = [];
    this.w = lib.make(o.model); this.objs.push(this.w);
    if (o.tint) this.w.traverse(m => { if (m.isMesh && m.material === lib.mat) { m.material = lib.mat.clone(); m.material.emissive = new THREE.Color(o.tint); m.material.emissiveIntensity = .55; hero.mats.push(m.material); } });
    this.holder = { r: hero.handHolder('r'), l: hero.handHolder('l') };
    this.place('hand');
    if (o.shield) { this.sh = lib.make(o.shield); this.objs.push(this.sh); this.holder.l.add(this.sh); this.sh.rotation.set(0, -Math.PI / 2, 0); this.sh.position.set(-.075, .03, 0); }
    if (this.kind.ranged === 'arrow' || o.quiver) { this.qv = lib.make('quiver'); this.objs.push(this.qv); const sp = hero.bone('spine_03'); const hq = hero.boneHolder(sp); hq.add(this.qv); this.qv.position.set(.1, -.18, -.16); this.qv.rotation.set(-.25, 0, -.35); }
    if (this.kind.ranged === 'arrow') { this.ammo = lib.make('arrow'); this.objs.push(this.ammo); hero.root.add(this.ammo); this.ammo.visible = false;
      this.str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V(), V()]), new THREE.LineBasicMaterial({ color: 0xe8e0d0 })); this.str.frustumCulled = false; hero.root.add(this.str); this.objs.push(this.str); }
    if (this.kindId === 'crossbow') { const st = this.w.getObjectByName('string'); if (st) { st.geometry = st.geometry.clone(); this.objs.push({ parent: null }); this._sg = st.geometry; } }
    if (this.kind.ranged === 'bolt') { this.ammo = lib.make('bolt'); this.objs.push(this.ammo); this.w.add(this.ammo); this.ammo.position.set(0, .03, .045); }
  }
  // hand: weapon parented to the main hand bone (grip point on the palm); proc: weapon placed in body space by pose()
  place(mode) {
    this.mode = mode; const w = this.w, M = this.M;
    if (mode === 'hand') {
      const side = this.kind.hand; this.holder[side].add(w);
      if (this.kindId === 'bow') { const a = M.a != null ? M.a : .9; w.rotation.set(Math.PI / 2 + a, 0, 0); w.rotateY(M.ry != null ? M.ry : Math.PI / 2); w.position.set(.03, .085, .015); }
      else if (this.kindId === 'crossbow') { const a = M.a != null ? M.a : -.5, g = -.06; w.rotation.set(Math.PI / 2 + a, 0, 0); w.position.set(-.03, .085 + Math.sin(a) * g, .015 - g * Math.cos(a)); }
      else { const a = this.M.aIdle != null && !this.pose.atk ? this.M.aIdle : this.M.a != null ? this.M.a : .75; this._a = a; w.rotation.set(Math.PI / 2 + a, 0, 0); w.position.set(-.03, .085 - Math.sin(a) * (-(M.g || 0)), .015 - (M.g || 0) * Math.cos(a)); }
    } else this.h.root.add(w);
  }
  apply() {
    const h = this.h, p = this.pose, k = this.kind; h.root.updateMatrixWorld(true);
    const wantProc = k.proc && (p.aim > .01 || p.thrust > .01 || k.proc === 'spear');
    if (wantProc && this.mode !== 'proc') this.place('proc'); else if (!wantProc && this.mode !== 'hand') this.place('hand');
    if (this.mode === 'hand' && this.M.aIdle != null && this._a !== (this.pose.atk ? this.M.a : this.M.aIdle)) this.place('hand');
    if (this.mode === 'proc') this[k.proc]();
    else if ((k.two || p.two > .01) && this.M.g2 != null) { // second hand on the haft
      const w = this.w; w.updateMatrixWorld(true); const t = w.localToWorld(_v1.set(0, this.M.g2, 0)); const ax = _v2.set(0, 1, 0).transformDirection(w.matrixWorld);
      h.grip('l', t, ax, null, k.two ? 1 : p.two); }
    if (this.str) this.string();
  }
  // body-space helpers
  bp(name, out) { return this.h.root.worldToLocal(this.h.bone(name).getWorldPosition(out)); }
  setW(pos, fwd, up) { // weapon +Y along fwd, +X towards `up` side (for bows: string faces the archer)
    const w = this.w, y = fwd.clone().normalize(), x = up.clone().sub(_v4.copy(y).multiplyScalar(up.dot(y))).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    _m.makeBasis(x, y, z); w.quaternion.setFromRotationMatrix(_m); w.position.copy(pos); w.updateMatrixWorld(true); }
  W(x, y, z) { return this.w.localToWorld(new THREE.Vector3(x, y, z)); }
  spear() {
    const p = this.pose, h = this.h, sR = this.bp('upperarm_r', V()), pel = this.bp('pelvis', V()), t = p.thrust;
    const rear = V().set(sR.x + .06, pel.y + .1 + t * .22, sR.z + .2 + t * .5);
    const fwd = V().set(.16 - t * .12, .2 - t * .2 + p.aim * .3, 1).normalize();
    const pos = rear.clone().addScaledVector(fwd, -this.M.g);
    this.setW(pos, fwd, V(0, 1, 0)); const wq = this.w.getWorldQuaternion(new THREE.Quaternion());
    const ax = V(0, 1, 0).applyQuaternion(wq);
    h.grip('r', this.W(0, this.M.g, 0), ax, V(0, -1, 0).applyQuaternion(h.root.getWorldQuaternion(_q)), 1);
    h.grip('l', this.W(0, this.M.g2, 0), ax, V(0, -1, 0).applyQuaternion(h.root.getWorldQuaternion(_q)), 1);
  }
  bow() {
    const p = this.pose, h = this.h, sL = this.bp('upperarm_l', V()), sR = this.bp('upperarm_r', V()), head = this.bp('Head', V());
    const pitch = p.aimPitch || 0, D = V(0, Math.sin(pitch), Math.cos(pitch)); const arm = h.armLen('l');
    const grip = sL.clone().addScaledVector(D, arm * .93 * p.aim + .25 * (1 - p.aim)).add(V(-.1 * p.aim, -.05, 0));
    const cant = V(.18, 1, 0).normalize(); const towardArcher = D.clone().negate();
    // bow +Y up (canted), +X (string side) towards the archer
    const w = this.w, y = cant.clone().sub(D.clone().multiplyScalar(cant.dot(D))).normalize(), x = towardArcher, z = new THREE.Vector3().crossVectors(x, y);
    _m.makeBasis(x, y, z); w.quaternion.setFromRotationMatrix(_m); w.position.copy(grip); w.updateMatrixWorld(true);
    const rq = h.root.getWorldQuaternion(new THREE.Quaternion()), Dw = D.clone().applyQuaternion(rq), yw = y.clone().applyQuaternion(rq);
    h.grip('l', this.W(0, 0, 0), yw, Dw, p.aim);
    const anchor = head.clone().add(V(-.05, -.07, .1)); const rest = grip.clone().addScaledVector(D, -this.M.str);
    const S = rest.lerp(anchor, p.draw); this.S = S;
    h.grip('r', h.root.localToWorld(S.clone()), V(0, 1, 0).applyQuaternion(rq), Dw, p.aim);
    if (this.ammo) { this.ammo.visible = p.nock > 0 && p.aim > .3; this.ammo.position.copy(S); this.ammo.quaternion.setFromUnitVectors(UP, D); }
  }
  string() { // bowstring: tip -> nock point -> tip (straight when slack)
    const w = this.w, M = this.M, a = this.h.root.worldToLocal(w.localToWorld(_v1.set(M.str, M.tip, 0))), b = this.h.root.worldToLocal(w.localToWorld(_v2.set(M.str, -M.tip, 0)));
    const mid = this.mode === 'proc' && this.pose.draw > .02 && this.S ? this.S : _v3.copy(a).lerp(b, .5); const pa = this.str.geometry.attributes.position; pa.setXYZ(0, a.x, a.y, a.z); pa.setXYZ(1, mid.x, mid.y, mid.z); pa.setXYZ(2, b.x, b.y, b.z); pa.needsUpdate = true; }
  crossbow() {
    const p = this.pose, h = this.h, sR = this.bp('upperarm_r', V()), pitch = p.aimPitch || 0, D = V(0, Math.sin(pitch), Math.cos(pitch));
    const grip = sR.clone().add(V(.1, .07, 0)).addScaledVector(D, .22 * p.aim + .1);
    this.setW(grip, D, V(0, 0, 0).add(V(0, 1, 0))); // +X toward up -> we want +Z up: rotate after
    const w = this.w; const y = D.clone().normalize(), zUp = V(0, 1, 0).sub(y.clone().multiplyScalar(y.y)).normalize(), x = new THREE.Vector3().crossVectors(y, zUp);
    _m.makeBasis(x, y, zUp); w.quaternion.setFromRotationMatrix(_m); w.position.copy(grip); w.updateMatrixWorld(true);
    const rq = h.root.getWorldQuaternion(new THREE.Quaternion()), Dw = D.clone().applyQuaternion(rq), down = V(0, -1, 0).applyQuaternion(rq);
    h.grip('r', this.W(0, 0, -.03), Dw, down, p.aim); h.grip('l', this.W(0, this.M.g2, -.03), Dw, down, p.aim);
    if (this.ammo) this.ammo.visible = !!p.loaded;
    const s = w.getObjectByName('string'); if (s) { const pa = s.geometry.attributes.position; pa.setXYZ(1, 0, p.loaded ? .16 : .29, p.loaded ? .04 : .01); pa.needsUpdate = true; }
  }
  muzzle(out = V()) { // world position + direction of the shot
    if (this.kindId === 'bow') return { pos: this.h.root.localToWorld(this.S ? this.S.clone() : V()), dir: V(0, 0, 1).applyQuaternion(this.h.root.getWorldQuaternion(new THREE.Quaternion())) };
    const w = this.w; return { pos: w.localToWorld(V(0, .4, .04)), dir: V(0, 1, 0).transformDirection(w.matrixWorld) };
  }
  dispose() { for (const o of this.objs) { o.parent && o.parent.remove(o); } if (this.str) { this.str.geometry.dispose(); this.str.material.dispose(); } if (this._sg) this._sg.dispose(); }
}
