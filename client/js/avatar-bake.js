// Avatar baking: collapse a procedural avatar (dozens of small meshes) into a few skinned meshes
// (one per material family) without changing its rig. Every Object3D that is not a mesh (hip, knee,
// shoulder, elbow, head, tail...) becomes a "bone", so existing animation code that rotates those
// groups keeps working unchanged. Each vertex is bound with weight 1 to the group it was built under.
// Technique: static-geometry merging + skinning (see three.js docs / BufferGeometryUtils, MIT).
// Shading: soft rim light added via onBeforeCompile and a cheap per-vertex occlusion term baked in.
import * as THREE from 'three';

const MATS = new Map();
function rim(m, strength) {
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
      `{ float bcRim = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.6);
         outgoingLight += (diffuseColor.rgb * 0.55 + vec3(0.18, 0.15, 0.13)) * bcRim * ${strength.toFixed(2)}; }
       #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'bc-avatar-rim-' + strength.toFixed(2);
  return m;
}
export function avatarMaterial(kind, side = THREE.FrontSide) {
  const k = kind + ':' + side;
  if (MATS.has(k)) return MATS.get(k);
  let m;
  if (kind === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, side });
  else if (kind === 'metal') m = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .36, metalness: .62, side }), .35);
  else if (kind === 'skin') m = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: 0, side }), .55);
  else m = rim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .04, side }), .42);
  m.name = 'bc-avatar-' + kind;
  MATS.set(k, m);
  return m;
}
// NFT avatar shading (v121 nftcolor): per-vertex roughness/metalness (skin soft-gloss, cloth matte, gold bright metal)
// carried in one attribute so the material families / draw calls stay the same, plus a warm ember fresnel rim that
// matches the fire-lit NFT art and a cheap warm sheen for metals. Lite (phones) keeps the attribute but skips the
// fresnel/sheen. The default walker keeps the original rim() above.
const SURF = { skin: [.55, 0], fur: [.82, 0], cloth: [.86, .02], metal: [.24, .95], glow: [1, 0] };
function nftShade(m, kind, lite) {
  const rimK = { skin: .9, cloth: .5, metal: 1.1 }[kind] || .5;
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 bcRM;\nvarying vec2 vBcRM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBcRM = bcRM;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vBcRM;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vBcRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vBcRM.y;')
      // The city's sky/ambient light is strongly blue (hemi 0x4466ff): keep its brightness but neutralise most of its
      // tint for NFT avatars so the art palette (gold, orange fur, red armour) survives instead of turning purple.
      .replace('#include <lights_fragment_end>', 'irradiance = mix(irradiance, vec3(dot(irradiance, vec3(.2126, .7152, .0722))) * vec3(1.04, 1.0, .95), .72);\n#include <lights_fragment_end>');
    // Camera-relative warm fill (the art is lit from the front by fire): keeps faces and palettes readable when a peer
    // stands with the city's sun or moon behind them. One dot product, also kept on phones.
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
      `outgoingLight += diffuseColor.rgb * vec3(1.0, .9, .78) * .34 * max(dot(normalize(normal), normalize(vec3(.35, .45, 1.0))), 0.0)
         * clamp(1.0 - 1.6 * dot(outgoingLight, vec3(.2126, .7152, .0722)), 0.0, 1.0);   // only lifts what the scene left dark
       #include <opaque_fragment>`);
    if (!lite) s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>',
      `{ vec3 bcN = normalize(normal); float bcF = pow(1.0 - clamp(abs(dot(bcN, normalize(vViewPosition))), 0.0, 1.0), 3.4);
         // ember rim: warm orange from below/behind like the art's fire light; a little stronger on metal
         outgoingLight += mix(vec3(1.0, .42, .12), diffuseColor.rgb * 1.6 + vec3(.25, .1, .02), .35) * bcF * ${rimK.toFixed(2)};
         // warm sheen so gold reads bright and metallic even without a strong env map
         outgoingLight += diffuseColor.rgb * vBcRM.y * (.18 + .55 * pow(clamp(bcN.y * .5 + .5, 0.0, 1.0), 2.0)); }
       #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'bc-nft-shade-' + kind + (lite ? '-lite' : '');
  return m;
}
export function nftAvatarMaterial(kind, side = THREE.FrontSide, lite = false) {
  const k = 'nft:' + kind + ':' + side + ':' + (lite ? 1 : 0);
  if (MATS.has(k)) return MATS.get(k);
  const m = kind === 'glow' ? new THREE.MeshBasicMaterial({ vertexColors: true, side })
    : nftShade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, metalness: kind === 'metal' ? .9 : 0, side }), kind, lite);
  m.name = 'bc-nft-avatar-' + kind; MATS.set(k, m); return m;
}
// Tiny deterministic 3D value noise for the molten-skin crack pattern (no texture, baked into vertex colour).
const hash3 = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t, h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return L(L(L(h(0,0,0), h(1,0,0), u), L(h(0,1,0), h(1,1,0), u), v), L(L(h(0,0,1), h(1,0,1), u), L(h(0,1,1), h(1,1,1), u), v), w);
}
const HSL = {};
/** Gentle colour grade toward the art: a touch more saturation, but never toy-pure primaries. */
function grade(c) {
  c.getHSL(HSL);
  if (HSL.l > .04 && HSL.l < .97 && HSL.s < .86) c.setHSL(HSL.h, Math.min(.86, HSL.s * 1.14), HSL.l);
  return c;
}
/** Adds the soft rim term to an existing standard material (used by the default walker). */
export function addAvatarRim(m, strength = .4) { if (m && m.isMeshStandardMaterial && !m.userData.bcRim) { m.userData.bcRim = 1; rim(m, strength); } return m; }

function kindOf(m) {
  if (m.isMeshBasicMaterial) return 'glow';
  const e = m.emissive, c = m.color;
  if (e && (e.r + e.g + e.b) > .45 * Math.max(.05, c.r + c.g + c.b)) return 'glow';
  if ((m.metalness || 0) >= .35) return 'metal';
  if ((m.roughness ?? 1) <= .66) return 'skin';
  return 'cloth';
}
const mergeable = o => o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.visible && o.children.length === 0 &&
  !Array.isArray(o.material) && !o.material.map && !o.material.transparent && !o.material.wireframe && o.material.opacity >= 1 &&
  (o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial) && !o.userData.flame && !o.userData.noBake &&
  o.geometry?.attributes?.position;

/**
 * Bake `root` in place. Returns { before, after } mesh counts. Safe to call once per freshly built avatar.
 * Skipped meshes (textured art panel, transparent, animated flames, sprites) stay as they are.
 */
export function bakeAvatar(root, { ao = true, style = '', lite = false, palette = null } = {}) {
  const nft = style === 'nft', shadowCol = new THREE.Color(palette?.shadow || '#2a1a14'), warm = new THREE.Color(1.07, 1.0, .9);
  const crackK = nft ? +(palette?.crackle || 0) : 0, tmp = new THREE.Color(), crackCol = new THREE.Color(palette?.crack || palette?.shadow || '#2a1a14');
  const saved = root.matrix.clone(), parent = root.parent;
  if (parent) parent.remove(root);
  root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const bones = [], boneIndex = new Map(), groups = new Map(), drop = [];
  let before = 0;
  root.traverse(o => { if (o.isMesh) before++; });
  root.traverse(o => {
    if (!mergeable(o)) return;
    let b = o.parent; while (b && b.isMesh) b = b.parent;
    if (!boneIndex.has(b)) { boneIndex.set(b, bones.length); bones.push(b); }
    const key = kindOf(o.material) + ':' + o.material.side;
    if (!groups.has(key)) groups.set(key, { kind: kindOf(o.material), side: o.material.side, parts: [], shadow: false });
    const gr = groups.get(key); gr.parts.push([o, boneIndex.get(b)]); gr.shadow = gr.shadow || o.castShadow;
    drop.push(o);
  });
  if (!bones.length) { restore(); return { before, after: before }; }
  const inv = bones.map(b => b.matrixWorld.clone().invert());
  const skeleton = new THREE.Skeleton(bones, inv);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3(), col = new THREE.Color();
  const out = [];
  for (const gr of groups.values()) {
    let vc = 0, ic = 0;
    for (const [o] of gr.parts) { const g = o.geometry; vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
    const RM = nft ? new Float32Array(vc * 2) : null;
    const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), C = new Float32Array(vc * 3), SI = new Uint16Array(vc * 4), SW = new Float32Array(vc * 4);
    const I = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const [o, bi] of gr.parts) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, m = o.matrixWorld, vcol = o.material.vertexColors ? g.attributes.color : null;
      nm.getNormalMatrix(m); const flip = m.determinant() < 0;
      const src = o.material.isMeshBasicMaterial || gr.kind !== 'glow' ? o.material.color : (o.material.emissive || o.material.color);
      col.copy(src);
      // Flagged surfaces (skin / fur / metal) use the tuned table; everything else keeps its own material values.
      const surf = o.userData.bcSurf || o.material.userData?.bcSurf || (gr.kind === 'metal' ? 'metal' : '');
      const rm = SURF[surf] || [Math.min(1, Math.max(.3, o.material.roughness ?? .8)), Math.min(1, o.material.metalness || 0)];
      if (nft && gr.kind !== 'glow') grade(col);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        const j = (vo + i) * 3; P[j] = v.x; P[j + 1] = v.y; P[j + 2] = v.z; N[j] = n.x; N[j + 1] = n.y; N[j + 2] = n.z;
        // Cheap baked occlusion: downward-facing surfaces and feet read darker, tops slightly brighter.
        const k = ao && gr.kind !== 'glow' ? (.8 + .2 * (n.y * .5 + .5)) * (.86 + .14 * Math.min(1, Math.max(0, v.y / .55))) : 1;
        // Sculpted heads carry per-vertex colour (fur masks, lips, sockets): multiply it in.
        const vr = vcol ? vcol.getX(i) : 1, vg = vcol ? vcol.getY(i) : 1, vb = vcol ? vcol.getZ(i) : 1;
        if (nft && gr.kind !== 'glow') {
          // Gradients instead of flat parts: darker toward the feet and under the jaw, warmer on the face,
          // and (fire-skinned tokens) a molten crack pattern toward the token's sampled shadow colour.
          tmp.setRGB(col.r * vr, col.g * vg, col.b * vb);
          const head = v.y > 1.38, foot = Math.min(1, Math.max(0, v.y / 1.05));
          let kk = (.62 + .38 * foot) * (.78 + .22 * (n.y * .5 + .5));
          if (head && n.y < -.25) { kk *= .8; tmp.lerp(shadowCol, .25); }
          if (head && n.z > .3 && (tmp.getHSL(HSL), HSL.s > .25)) tmp.multiply(warm);   // grey (ash / Cool Off) skins stay grey
          if (crackK && (surf === 'skin' || surf === 'fur')) {
            // ridged noise -> thin molten veins, plus a soft low-frequency mottling toward the shadow tone
            const f = vnoise(v.x * 11, v.y * 11, v.z * 11) * .7 + vnoise(v.x * 27, v.y * 27, v.z * 27) * .3;
            const ridge = 1 - Math.abs(2 * f - 1), vein = Math.min(1, Math.max(0, (ridge - .86) / .1));
            tmp.lerp(shadowCol, crackK * .22 * vnoise(v.x * 4, v.y * 4, v.z * 4));
            tmp.lerp(crackCol, crackK * (palette?.crack ? .5 : .8) * vein);
          }
          if (vcol) grade(tmp);
          C[j] = tmp.r * kk; C[j + 1] = tmp.g * kk; C[j + 2] = tmp.b * kk;
          RM[(vo + i) * 2] = rm[0]; RM[(vo + i) * 2 + 1] = gr.kind === 'metal' ? Math.max(rm[1], .9) : rm[1];
          if (gr.kind === 'metal') RM[(vo + i) * 2] = Math.min(RM[(vo + i) * 2], .3);
        } else { C[j] = col.r * k * vr; C[j + 1] = col.g * k * vg; C[j + 2] = col.b * k * vb; }
        SI[(vo + i) * 4] = bi; SW[(vo + i) * 4] = 1;
      }
      const idx = g.index;
      const cnt = idx ? idx.count : pos.count;
      for (let t = 0; t < cnt; t += 3) {
        const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
        I[io++] = vo + a; I[io++] = vo + (flip ? c : b); I[io++] = vo + (flip ? b : c);
      }
      vo += pos.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    if (RM) geo.setAttribute('bcRM', new THREE.BufferAttribute(RM, 2));
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere(); geo.userData.bcBaked = true;
    const sm = new THREE.SkinnedMesh(geo, nft ? nftAvatarMaterial(gr.kind, gr.side, lite) : avatarMaterial(gr.kind, gr.side));
    sm.name = 'bc-avatar-baked-' + gr.kind; sm.castShadow = gr.shadow; sm.receiveShadow = true;
    sm.frustumCulled = false; sm.userData.nftAvatarPart = true; sm.userData.bcBaked = true;
    out.push(sm);
  }
  for (const o of drop) o.removeFromParent();
  for (const sm of out) { root.add(sm); sm.bind(skeleton, new THREE.Matrix4()); }
  root.userData.bakedSkeleton = skeleton;
  restore();
  let after = 0; root.traverse(o => { if (o.isMesh || o.isSprite) after++; });
  return { before, after };
  function restore() { saved.decompose(root.position, root.quaternion, root.scale); if (parent) parent.add(root); root.updateMatrixWorld(true); }
}
export function disposeBaked(root) {
  root?.traverse(o => { if (o.userData?.bcBaked && o.geometry?.userData?.bcBaked) o.geometry.dispose(); });
  root?.userData?.bakedSkeleton?.dispose();
}
