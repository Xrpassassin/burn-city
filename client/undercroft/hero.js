// Player heroes: realistic folk built from Quaternius' CC0 Universal Base Characters + Modular Fantasy Outfits,
// animated with the CC0 Universal Animation Library (one shared humanoid skeleton). Each folk gets its own skin,
// build, eyes, hair and procedural features (pointed ears, tusks, cat ears + tail, horns + crest + tail).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';
const MD = new URL('assets/models/folk/', import.meta.url).href;

// ---------------------------------------------------------------- folk looks (original races, not any commercial IP)
export const FOLK = {
  human: { skins: [0xe2b08c, 0xc4865e, 0x8a5636], eye: 0x5a3c22, h: 1, w: 1, hair: { m: ['hair_simpleparted', 'hair_buzzed', 'hair_long'], f: ['hair_long', 'hair_buns', 'hair_buzzedfemale'] }, hairCol: [0x3b2414, 0x6e4a26, 0x16110d], beard: [0, 1, 0], look: 'City folk: every skin tone of the burning city, medium build.' },
  ashenborn: { skins: [0x7a8590, 0x68717c, 0x8c8f96], eye: 0xff2a14, eyeGlow: .9, h: 1, w: .95, ears: 'elf', hair: { m: ['hair_long', 'hair_simpleparted', 'hair_buzzed'], f: ['hair_buns', 'hair_long', 'hair_buzzedfemale'] }, hairCol: [0x0e0d0e, 0x3a1612, 0xd8d4cc], look: 'Ash-grey skin, ember-red eyes and swept, pointed ears; lean.' },
  stonefolk: { skins: [0xc4987a, 0xa97a5e, 0xb4a294], eye: 0x3a5a6a, h: .8, w: 1.18, head: 1.08, hair: { m: ['hair_long', 'hair_buzzed'], f: ['hair_buns', 'hair_long'] }, hairCol: [0x8a3e1c, 0x5a5048, 0x2a1c12], beard: [1, 1], look: 'Short and broad as a boulder, braided beards (men), ruddy stone-flecked skin.' },
  wildkin: { skins: [0xc89048, 0xa8743a, 0xd8b078], eye: 0xf0b818, eyeGlow: .4, h: 1.02, w: .97, cat: 1, pattern: 'stripes', hair: { m: ['hair_buzzed', 'hair_long', 'none'], f: ['hair_buzzedfemale', 'hair_long', 'hair_buns'] }, hairCol: [0x7a4a1e, 0x3a2410, 0xd8c8a8], look: 'Cat-folk: tawny striped fur, tall feline ears, golden eyes and a long tail.' },
  gloomkin: { skins: [0x9c9070, 0x847a5a, 0xa8a088], eye: 0x7ab43a, eyeGlow: .3, h: .88, w: .9, ears: 'long', hair: { m: ['hair_simpleparted', 'hair_long'], f: ['hair_long', 'hair_buns'] }, hairCol: [0x4a3018, 0x1c2410, 0x8a6a3a], look: 'Small, slight tunnel-elves: olive skin, long tapering ears, green night-eyes.' },
  ironhide: { skins: [0x6c8a52, 0x5e7a5a, 0x7a8a6a], eye: 0xe0a020, eyeGlow: .2, h: 1.09, w: 1.2, head: 1.04, tusks: 1, hair: { m: ['hair_buzzed', 'hair_long'], f: ['hair_buzzedfemale', 'hair_buns'] }, hairCol: [0x101010, 0x2a2016, 0x4a4040], beard: [0, 0], look: 'Huge and heavy: green-grey hide, jutting tusks, amber eyes.' },
  skyborn: { skins: [0xe6c47e, 0xd8b46a, 0xefd6a0], eye: 0xf0c838, eyeGlow: .5, h: 1.08, w: .92, ears: 'elf', hair: { m: ['hair_long', 'hair_simpleparted'], f: ['hair_long', 'hair_buns'] }, hairCol: [0xf0e0b0, 0xc8a050, 0xe8e4dc], look: 'Tall, slender high-elves: golden skin, long ears, sunlit eyes and pale hair.' },
  emberkin: { skins: [0x9c4a26, 0x7a5a2a, 0x5a6a34], eye: 0xffb81c, eyeGlow: .8, h: 1.04, w: 1.04, lizard: 1, pattern: 'scales', hair: { m: ['none'], f: ['none'] }, hairCol: [0x000000], look: 'Lizard-folk of the ember clans: scaled hide, swept horns, a dorsal crest and a heavy tail.' },
};
export const SEXES = { m: 'Masculine', f: 'Feminine' };

// armor item -> outfit + colour treatment
const OUTFIT = {
  ragged_robe: { o: 'peasant', tint: 0xb8a890 }, lumenweave_robe: { o: 'peasant', tint: 0x9cb0ff, glow: 0x2040a0 }, scribes_mantle: { o: 'peasant', tint: 0xd07a52 },
  leather_cuirass: { o: 'ranger', tint: 0xffffff }, iron_plate: { o: 'ranger', steel: 0xb8c0cc, pauldron: 1 }, wardens_mail: { o: 'ranger', steel: 0xd8b878, pauldron: 1, glow: 0x302008 },
};

// KayKit clip names used by the game -> UAL clip (+ speed so the timing windows stay the same)
const CLIP = {
  Idle: ['Idle_Loop', 1], '2H_Melee_Idle': ['Sword_Idle', 1], Running_A: ['Jog_Fwd_Loop', 1.05], Walking_A: ['Walk_Loop', 1.1],
  '1H_Melee_Attack_Slice_Diagonal': ['Sword_Regular_A', .52], '1H_Melee_Attack_Slice_Horizontal': ['Sword_Regular_B', .6], '1H_Melee_Attack_Stab': ['Sword_Regular_A', .5],
  '1H_Melee_Attack_Chop': ['Sword_Attack', 1.35], '2H_Melee_Attack_Chop': ['Sword_Attack', 1.25],
  Blocking: ['Sword_Block', 1.4, 'hold'], Block: ['Sword_Block', 1.4, 'hold'], Block_Hit: ['Shield_OneShot', 1.2],
  Hit_A: ['Hit_Head', .9], Hit_B: ['Hit_Chest', .8], Death_A: ['Death01', 1.4], Death_B: ['Death01', 1.4],
  Dodge_Forward: ['Roll', 2.2], Dodge_Backward: ['Roll', 2.2], Dodge_Left: ['Roll', 2.2], Dodge_Right: ['Roll', 2.2],
  Spellcast_Shoot: ['Spell_Simple_Shoot', .8], Spellcast_Raise: ['Spell_Simple_Enter', .8], Spellcast_Long: ['OverhandThrow', 1],
  Interact: ['Interact', 1.9], PickUp: ['Chest_Open', 1.2], Use_Item: ['Consume', 1.1], Cheer: ['Yes', 1], Preview: ['Idle_Loop', 1],
};

let CACHE = {};
export function loadFolk(sexes = ['m', 'f'], onProgress = () => { }) {
  const L = new GLTFLoader(); const want = [...sexes.map(s => 'folk_' + s), 'folk_anims'].filter(k => !CACHE[k]); let done = 0;
  return Promise.all(want.map(k => CACHE[k] = L.loadAsync(MD + k + '.glb').then(g => { onProgress(++done / want.length); prep(k, g); return g; }))).then(async () => {
    const out = {}; for (const k of Object.keys(CACHE)) out[k] = await CACHE[k]; return out; });
}
function prep(k, g) {
  g.parts = {}; for (const c of g.scene.children) g.parts[c.name] = c;
  if (k === 'folk_anims') { g.clips = {}; for (const c of g.animations) g.clips[c.name] = c; }
  g.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
}
export function disposeFolk() { for (const p of Object.values(CACHE)) p.then(g => g.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) o.material[k] && o.material[k].dispose(); o.material.dispose(); } })).catch(() => { }); CACHE = {}; for (const t of Object.values(STEEL)) t.dispose(); STEEL = {}; }

// grey "steel" copy of an outfit texture (one canvas pass, cached)
let STEEL = {};
function steelMap(tex) { if (!tex || !tex.image) return tex; const id = tex.uuid; if (STEEL[id]) return STEEL[id]; const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const l = (a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11) / 255, v = Math.min(255, Math.pow(l, .8) * 330); a[i] = a[i + 1] = a[i + 2] = v; } g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; return STEEL[id] = t; }

// skin pattern (cat stripes / lizard scales) added in the shader from the texture UVs; no extra textures
function patternSkin(m, kind) {
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
    #ifdef USE_MAP
    { vec2 q = vMapUv * ${kind === 'scales' ? '90.0' : '28.0'};
      ${kind === 'scales' ? `vec2 r = vec2(1.0, 1.732); vec2 h = r * .5; vec2 a = mod(q, r) - h; vec2 b = mod(q - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b; float e = smoothstep(.18, .5, length(g)); diffuseColor.rgb *= mix(1.08, .62, e);`
      : `float s = sin(q.x * 1.3 + sin(q.y * .55) * 2.4); diffuseColor.rgb *= mix(1.04, .55, smoothstep(.55, .95, s));`} }
    #endif`); };
  m.customProgramCacheKey = () => 'skin-' + kind;
}

// ---------------------------------------------------------------- the hero actor (same interface as actors.js Actor)
export class Hero {
  // look: { race, sex, skin, hair, hairCol, armor (item id), outfitOnly }
  constructor(F, look) {
    const fk = FOLK[look.race] || FOLK.human, sex = look.sex === 'f' ? 'f' : 'm', src = F['folk_' + sex] || F.folk_m || F.folk_f; this.look = look; this.fk = fk;
    this.root = new THREE.Group(); this.model = new THREE.Group(); this.root.add(this.model); this.mats = []; this.disp = [];
    const head = SU.clone(src.parts.head); this.model.add(head); this.bones = {}; head.traverse(o => { if (o.isBone) this.bones[o.name] = o; });
    const rebind = grp => { const c = grp.clone(true); c.traverse(o => { if (o.isSkinnedMesh) { const sk = new THREE.Skeleton(o.skeleton.bones.map(b => this.bone(b.name)), o.skeleton.boneInverses); o.bind(sk, o.bindMatrix); } }); this.model.add(c); return c; };
    const skinCol = new THREE.Color(fk.skins[(look.skin | 0) % fk.skins.length]).multiplyScalar(1 / .78);
    const own = (o, fn) => { const m = o.material.clone(); fn && fn(m); o.material = m; this.mats.push(m); m.userData.e0 = m.emissive ? m.emissive.clone() : null; m.userData.ei0 = m.emissiveIntensity; return m; };
    const isSkin = m => /Superhero|Regular/.test(m.name);
    const skinMat = m => { m.color.copy(skinCol); m.roughness = 1; if (fk.pattern) patternSkin(m, fk.pattern); if (fk.lizard) { m.roughness = .6; } };
    head.traverse(o => { if (!o.isMesh) return; if (/Eye/i.test(o.material.name) || /^Eyes/.test(o.name)) own(o, m => { m.color.set(fk.eye); if (fk.eyeGlow) { m.emissive = new THREE.Color(fk.eye); m.emissiveIntensity = fk.eyeGlow; } this.eyes = o; }); else if (/Eyebrow/.test(o.name)) own(o, m => m.color.set(fk.hairCol[(look.hairCol | 0) % fk.hairCol.length]).multiplyScalar(.8)); else if (isSkin(o.material)) own(o, skinMat); else own(o); });
    // outfit
    const of = OUTFIT[look.armor] || OUTFIT.leather_cuirass; this.outfit = rebind(src.parts[of.o]);
    this.outfit.traverse(o => { if (!o.isMesh) return; if (/Pauldron/.test(o.name) && !of.pauldron) { o.visible = false; return; } if (isSkin(o.material)) return own(o, skinMat);
      own(o, m => { if (of.steel) { m.map = steelMap(m.map); m.color.set(of.steel); m.metalness = .55; m.roughness = .45; } else m.color.set(of.tint || 0xffffff); if (of.glow) { m.emissive = new THREE.Color(of.glow); m.emissiveIntensity = .5; } }); });
    // hair + beard
    const hl = fk.hair[sex] || ['none'], hname = hl[(look.hair | 0) % hl.length], hc = fk.hairCol[(look.hairCol | 0) % fk.hairCol.length];
    const hairMat = m => { m.color.set(hc); m.roughness = .7; };
    if (hname !== 'none' && src.parts[hname]) rebind(src.parts[hname]).traverse(o => { if (o.isMesh) own(o, hairMat); });
    if (sex === 'm' && fk.beard && fk.beard[(look.hair | 0) % fk.beard.length] && src.parts.hair_beard) rebind(src.parts.hair_beard).traverse(o => { if (o.isMesh) own(o, hairMat); });
    // build: overall height / breadth, head size
    this.model.scale.set(fk.w, fk.h, fk.w); this.baseScale = this.model.scale.clone();
    if (fk.head && this.bones.Head) this.bones.Head.scale.setScalar(fk.head);
    // features in the Head bone frame (built from the rest pose)
    this.model.updateMatrixWorld(true); this.features(fk, skinCol, hc);
    this.handR = this.bones.hand_r; this.handL = this.bones.hand_l;
    this.mixer = new THREE.AnimationMixer(this.model); this.actions = {}; this.clips = F.folk_anims.clips; this.cur = null; this.flash = 0; this.t = 0;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false })); blob.scale.setScalar(1.15 * fk.w); blob.position.y = .03; blob.renderOrder = 2; this.root.add(blob); this.blob = blob; this.disp.push(blob.geometry, blob.material);
  }
  bone(n) { return this.bones[n] || this.bones[n.replace(/_\d+$/, '')] || this.bones.root; }
  mesh(geo, mat, parent, p, r = [0, 0, 0], s = [1, 1, 1]) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.scale.set(...s); m.castShadow = true; parent.add(m); this.disp.push(geo); return m; }
  features(fk, skinCol, hairCol) {
    const H = this.bones.Head; if (!H) return; const inv = new THREE.Matrix4().copy(H.matrixWorld).invert(); const M = this.model.matrixWorld; const at = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M).applyMatrix4(inv);
    // a holder that undoes the head bone's rest rotation so features can be authored in model space (y up, z forward)
    const holder = new THREE.Group(); H.add(holder); const q = new THREE.Quaternion(); H.getWorldQuaternion(q); const mq = new THREE.Quaternion(); this.model.getWorldQuaternion(mq); holder.quaternion.copy(q.invert().multiply(mq)); const hp = new THREE.Vector3(); H.getWorldPosition(hp); hp.applyMatrix4(new THREE.Matrix4().copy(M).invert()); const fem = this.look.sex === 'f'; const o0 = at(0, 1.62 + (hp.y - 1.6) - (fem ? .012 : 0), hp.z + .017 + (fem ? -.004 : 0)); holder.position.copy(o0);
    const ws = new THREE.Vector3(); H.getWorldScale(ws); holder.scale.set(1 / ws.x * this.model.scale.x, 1 / ws.y * this.model.scale.y, 1 / ws.z * this.model.scale.z).multiplyScalar((fk.head || 1) * (fem ? .93 : 1));
    const skin = new THREE.MeshStandardMaterial({ color: skinCol.clone().multiplyScalar(.78), roughness: .85 }); this.mats.push(skin); skin.userData.e0 = skin.emissive.clone(); skin.userData.ei0 = 0;
    const local = (x, y, z) => [x, y - 1.62, z]; // model-space metres -> holder
    // pointed ears: a flattened, curved cone over each ear, tip swept back and up
    if (fk.ears) { const long = fk.ears === 'long'; const g = new THREE.ConeGeometry(.026, long ? .14 : .1, 10, 3); g.translate(0, (long ? .14 : .1) / 2, 0); const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, pos.getZ(i) * .35 - y * y * .9); } g.computeVertexNormals();
      for (const sd of [-1, 1]) this.mesh(g, skin, holder, local(sd * .079, 1.682, -.005), [-.5, 0, -sd * (long ? 1.25 : 1.05)]); }
    if (fk.tusks) { const g = new THREE.ConeGeometry(.0085, .045, 8); g.translate(0, .0225, 0); const ivory = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: .5 }); this.mats.push(ivory); ivory.userData.e0 = ivory.emissive.clone(); ivory.userData.ei0 = 0;
      for (const sd of [-1, 1]) this.mesh(g, ivory, holder, local(sd * .024, 1.628, .086), [-.25, 0, sd * .28]); }
    if (fk.cat) { const g = new THREE.ConeGeometry(.04, .085, 4); g.translate(0, .042, 0); g.scale(1, 1, .45); const inner = new THREE.ConeGeometry(.026, .06, 4); inner.translate(0, .03, .008); inner.scale(1, 1, .3);
      const pink = new THREE.MeshStandardMaterial({ color: 0xc88a7a, roughness: .9 }); this.mats.push(pink); pink.userData.e0 = pink.emissive.clone(); pink.userData.ei0 = 0;
      for (const sd of [-1, 1]) { const e = this.mesh(g, skin, holder, local(sd * .058, 1.79, -.01), [-.1, sd * .3, -sd * .35]); this.mesh(inner, pink, e, [0, 0, .01]); }
      // short muzzle, dark nose and whiskers so the face reads feline from the preview distance
      const cream = new THREE.MeshStandardMaterial({ color: skinCol.clone().multiplyScalar(.78).lerp(new THREE.Color(0xf0e0c0), .25), roughness: .95 }); this.mats.push(cream); cream.userData.e0 = cream.emissive.clone(); cream.userData.ei0 = 0;
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: .6 }); this.mats.push(dark); dark.userData.e0 = dark.emissive.clone(); dark.userData.ei0 = 0;
      const mz = new THREE.SphereGeometry(.024, 12, 8); for (const sd of [-1, 1]) this.mesh(mz, cream, holder, local(sd * .013, 1.632, .083), [0, 0, 0], [1, .8, .75]);
      const nose = new THREE.ConeGeometry(.011, .012, 3); this.mesh(nose, dark, holder, local(0, 1.648, .101), [Math.PI, 0, 0], [1, 1, .6]);
      const wh = new THREE.CylinderGeometry(.0009, .0004, .075, 3); wh.translate(0, .0375, 0); for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) this.mesh(wh, cream, holder, local(sd * .022, 1.636 - i * .004, .095), [0, 0, -sd * (1.45 + (i - 1) * .14)]);
      this.tail(skinCol, .028, .007, .72, 'cat'); }
    if (fk.lizard) { const horn = new THREE.ConeGeometry(.024, .19, 8, 4); horn.translate(0, .095, 0); const p = horn.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) - y * y * 3.2); } horn.computeVertexNormals();
      const bone = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: .55 }); this.mats.push(bone); bone.userData.e0 = bone.emissive.clone(); bone.userData.ei0 = 0;
      for (const sd of [-1, 1]) { this.mesh(horn, bone, holder, local(sd * .045, 1.78, .02), [-.9, 0, -sd * .25]); this.mesh(horn, bone, holder, local(sd * .07, 1.73, -.02), [-1.3, 0, -sd * .5], [.7, .7, .7]); }
      const sp = new THREE.ConeGeometry(.012, .05, 4); sp.translate(0, .025, 0); for (let i = 0; i < 6; i++) this.mesh(sp, bone, holder, local(0, 1.815 - i * .028, .03 - i * .03), [-.5 - i * .25, 0, 0], [1, 1 - i * .08, 1]);
      this.tail(skinCol, .07, .012, .95, 'lizard'); }
  }
  tail(skinCol, r0, r1, len, kind) {
    const P = this.bones.pelvis; if (!P) return;
    const inv = new THREE.Matrix4().copy(P.matrixWorld).invert(); const base = new THREE.Vector3(0, .97, -.11).applyMatrix4(this.model.matrixWorld).applyMatrix4(inv);
    const root = new THREE.Group(); P.add(root); root.position.copy(base); const q = new THREE.Quaternion(); P.getWorldQuaternion(q); const mq = new THREE.Quaternion(); this.model.getWorldQuaternion(mq); root.quaternion.copy(q.invert().multiply(mq)); const ws = new THREE.Vector3(); P.getWorldScale(ws); root.scale.set(this.model.scale.x / ws.x / this.model.scale.x, this.model.scale.y / ws.y / this.model.scale.y, this.model.scale.z / ws.z / this.model.scale.z);
    const sway = new THREE.Group(); root.add(sway); this.tailSway = sway; this.tailKind = kind;
    const pts = kind === 'cat' ? [[0, 0, 0], [0, -.12, -.12], [0, -.3, -.26], [.03, -.36, -.46], [.06, -.24, -.64], [.05, -.02, -.74]] : [[0, 0, 0], [0, -.1, -.16], [0, -.32, -.38], [-.02, -.62, -.62], [.02, -.86, -.86]];
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))); const TS = 28, RS = 10; const g = new THREE.TubeGeometry(curve, TS, 1, RS, false); const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= TS; i++) { const t = i / TS; curve.getPointAt(t, c); const r = kind === 'cat' ? r0 * (1 - t * .55) * (t > .9 ? 1.35 : 1) : r0 * Math.pow(1 - t, 1.1) + r1; for (let k = 0; k <= RS; k++) { const n = i * (RS + 1) + k; v.fromBufferAttribute(pos, n).sub(c).multiplyScalar(r); pos.setXYZ(n, c.x + v.x, c.y + v.y, c.z + v.z); } }
    g.computeVertexNormals(); const m = new THREE.MeshStandardMaterial({ color: skinCol.clone().multiplyScalar(kind === 'cat' ? .62 : .7), roughness: kind === 'cat' ? 1 : .55 }); if (kind === 'lizard') patternSkin(m, 'scales'); this.mats.push(m); m.userData.e0 = m.emissive.clone(); m.userData.ei0 = 0;
    this.mesh(g, m, sway, [0, 0, 0]);
  }
  action(name) { if (!this.actions[name]) { const map = CLIP[name] || [name, 1]; const c = this.clips[map[0]]; if (!c) return null; const a = this.mixer.clipAction(c); a.userData = { k: map[1], hold: map[2] === 'hold' }; this.actions[name] = a; } return this.actions[name]; }
  play(name, { fade = .15, once = false, speed = 1, force = false } = {}) {
    const a = this.action(name); if (!a) return 0; const k = a.userData.k, hold = a.userData.hold, sp = speed * k; if (this.cur === a && !force && !once) { a.timeScale = sp; return a.getClip().duration / sp; }
    a.reset(); a.timeScale = sp; const one = once || hold; a.setLoop(one ? THREE.LoopOnce : THREE.LoopRepeat, one ? 1 : Infinity); a.clampWhenFinished = one; a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false); a.play(); this.cur = a; this.curName = name; return a.getClip().duration / sp;
  }
  attach(obj, right = true, { s = 1, rx = 0, ry = 0, rz = 0, x = 0, y = 0, z = 0 } = {}) {
    const o = obj.clone(); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.material = m.material.clone(); this.mats.push(m.material); m.material.userData.e0 = m.material.emissive.clone(); m.material.userData.ei0 = m.material.emissiveIntensity; } });
    const hand = right ? this.handR : this.handL, ws = new THREE.Vector3(); this.root.updateMatrixWorld(true); hand.getWorldScale(ws); const rs = new THREE.Vector3(); this.root.getWorldScale(rs); ws.divide(rs); const holder = new THREE.Group(); holder.scale.set(this.model.scale.x / ws.x, this.model.scale.y / ws.y, this.model.scale.z / ws.z); hand.add(holder);
    o.scale.multiplyScalar(s); o.rotation.set(rx, ry, rz); o.position.set(x, y, z); holder.add(o); return o; }
  hit(col = 0xffffff, k = 1) { this.flash = .14 * k; this.flashCol = new THREE.Color(col); }
  update(dt) {
    this.t += dt; this.mixer.update(dt);
    if (this.tailSway) { const cat = this.tailKind === 'cat'; this.tailSway.rotation.y = Math.sin(this.t * (cat ? 1.6 : 1)) * (cat ? .35 : .14); this.tailSway.rotation.x = cat ? Math.sin(this.t * .8) * .08 : 0; }
    if (this.flash > 0) { this.flash -= dt; const f = Math.max(0, this.flash / .14); for (const m of this.mats) if (m.emissive && m.userData.e0) { m.emissive.copy(m.userData.e0).lerp(this.flashCol, f); m.emissiveIntensity = (m.userData.ei0 || 0) + f * 1.6; } if (this.flash <= 0) for (const m of this.mats) if (m.emissive && m.userData.e0) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } }
  }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); for (const m of this.mats) m.dispose(); for (const d of this.disp) d.dispose(); }
}
let BLOB = null;
function blobTexture() { if (BLOB) return BLOB; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.6)'); r.addColorStop(.6, 'rgba(0,0,0,.28)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return BLOB = new THREE.CanvasTexture(c); }
