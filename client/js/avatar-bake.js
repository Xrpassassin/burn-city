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
export function bakeAvatar(root, { ao = true } = {}) {
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
    const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), C = new Float32Array(vc * 3), SI = new Uint16Array(vc * 4), SW = new Float32Array(vc * 4);
    const I = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
    let vo = 0, io = 0;
    for (const [o, bi] of gr.parts) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, m = o.matrixWorld;
      nm.getNormalMatrix(m); const flip = m.determinant() < 0;
      const src = o.material.isMeshBasicMaterial || gr.kind !== 'glow' ? o.material.color : (o.material.emissive || o.material.color);
      col.copy(src);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        const j = (vo + i) * 3; P[j] = v.x; P[j + 1] = v.y; P[j + 2] = v.z; N[j] = n.x; N[j + 1] = n.y; N[j + 2] = n.z;
        // Cheap baked occlusion: downward-facing surfaces and feet read darker, tops slightly brighter.
        const k = ao && gr.kind !== 'glow' ? (.8 + .2 * (n.y * .5 + .5)) * (.86 + .14 * Math.min(1, Math.max(0, v.y / .55))) : 1;
        C[j] = col.r * k; C[j + 1] = col.g * k; C[j + 2] = col.b * k;
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
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    geo.computeBoundingSphere(); geo.userData.bcBaked = true;
    const sm = new THREE.SkinnedMesh(geo, avatarMaterial(gr.kind, gr.side));
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
