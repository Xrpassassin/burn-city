// Lightweight, deterministic landmark set pieces for Homefront's existing Three.js scene.
// Geometry only: interaction authority and physical POI coordinates remain server-owned.
const MAT = Object.freeze({
  concrete: 0x5a5a50, concreteDark: 0x373a35, brick: 0x634a3d, metal: 0x454b49,
  rust: 0x87533b, glass: 0x42575a, hazard: 0xc19a43, medical: 0x78977b,
  tarp: 0x625f50, wood: 0x66513c, light: 0xe7ad58, white: 0xb7b6a7,
  red: 0x853d35, black: 0x262b29, blue: 0x536c78, sand: 0x8a806a
});

const RECIPES = Object.freeze({
  bus_depot: [['box',[7,2.8,4],[0,1.4,0],'concrete'],['box',[7.4,.22,4.4],[0,2.85,0],'metal'],['box',[.18,2.1,.18],[-2.8,1.1,2],'metal'],['box',[.18,2.1,.18],[2.8,1.1,2],'metal'],['box',[2.5,.12,.1],[0,2.2,2.06],'hazard'],['box',[1.5,.8,.8],[0,.5,-.8],'wood']],
  road_checkpoint: [['box',[3.8,1.7,2.8],[0,.85,0],'concreteDark'],['box',[4.1,.16,3.1],[0,1.75,0],'metal'],['box',[.18,2.2,.18],[-2.2,1.1,0],'hazard'],['box',[.18,2.2,.18],[2.2,1.1,0],'hazard'],['box',[5,.18,.25],[0,1.7,0],'hazard'],['box',[3.4,.12,.12],[0,2.15,0],'light']],
  freight_depot: [['box',[5.8,2.5,5],[0,1.25,0],'rust'],['box',[6.2,.2,5.4],[0,2.55,0],'metal'],['box',[1.8,1.2,1.6],[-1.5,.6,3],'wood'],['box',[1.8,1.2,1.6],[.5,.6,3],'wood'],['box',[.15,2.1,.15],[2.6,1.05,1.8],'hazard']],
  rail_yard: [['box',[6,.16,1.4],[0,.18,0],'metal'],['box',[5.8,.12,.16],[0,.32,-.55],'rust'],['box',[5.8,.12,.16],[0,.32,.55],'rust'],['box',[2.5,1.7,2.1],[0,.85,0],'brick'],['box',[2.7,.15,2.3],[0,1.75,0],'metal'],['cylinder',[.12,2.2,.12],[-1.1,1.1,-1.1],'hazard'],['cylinder',[.12,2.2,.12],[1.1,1.1,-1.1],'hazard']],
  underpass: [['box',[7,.3,1.1],[0,2.5,0],'concrete'],['box',[.5,3,.7],[-3,1.5,0],'concreteDark'],['box',[.5,3,.7],[3,1.5,0],'concreteDark'],['box',[5,.18,1],[0,.25,0],'concreteDark'],['box',[.2,1.4,.2],[-2.4,.7,.1],'hazard'],['box',[.2,1.4,.2],[2.4,.7,.1],'hazard']],
  evacuation_gate: [['box',[.5,3,.5],[-2.8,1.5,0],'concrete'],['box',[.5,3,.5],[2.8,1.5,0],'concrete'],['box',[6,.35,.55],[0,3,0],'metal'],['box',[4,.12,.12],[0,2.2,.3],'hazard'],['box',[2.2,1.1,1.2],[-1,.55,-1.3],'wood'],['box',[2.2,1.1,1.2],[1.3,.55,-1.3],'wood']],
  reinforced_cache: [['box',[2.3,1.5,1.7],[0,.75,0],'metal'],['box',[2.4,.12,1.8],[0,1.55,0],'hazard'],['box',[.14,1.2,.14],[-.95,.6,.9],'rust'],['box',[.14,1.2,.14],[.95,.6,.9],'rust'],['box',[.8,.65,.08],[0,.75,.9],'light']],
  medical_cache: [['box',[2.5,2,1.8],[0,1,0],'medical'],['box',[2.7,.16,2],[0,2.02,0],'white'],['box',[.5,.9,.12],[0,1,.95],'red'],['box',[.12,.9,.12],[0,1,.95],'red'],['box',[1.4,.55,.7],[1.7,.28,-.5],'white']],
  industrial_cache: [['box',[2.5,1.8,2],[0,.9,0],'rust'],['box',[2.7,.18,2.2],[0,1.85,0],'hazard'],['box',[.2,2,.2],[-1.1,1,0],'metal'],['box',[.2,2,.2],[1.1,1,0],'metal'],['box',[1.6,.2,.2],[0,1.1,1.05],'hazard']],
  rescue_bus: [['box',[2.8,1.8,7],[0,1,0],'blue'],['box',[2.5,.65,4.5],[0,1.85,-.2],'glass'],['box',[2.9,.18,7.1],[0,1.98,0],'white'],['cylinder',[.65,.28,.65],[-1.45,.45,-2.1],'black'],['cylinder',[.65,.28,.65],[1.45,.45,-2.1],'black'],['cylinder',[.65,.28,.65],[-1.45,.45,2.1],'black'],['cylinder',[.65,.28,.65],[1.45,.45,2.1],'black'],['box',[.12,.8,.12],[0,1.1,3.55],'hazard']],
  apartment_ruin: [['box',[5,3.5,4.5],[0,1.75,0],'brick'],['box',[5.2,.2,4.7],[0,3.5,0],'concrete'],['box',[2.5,.18,2.5],[-1.2,3.62,.2],'concreteDark'],['box',[.18,2.1,.18],[-2.1,1.05,1.7],'metal'],['box',[.18,2.1,.18],[2.1,1.05,1.7],'metal'],['box',[4.5,.12,.12],[0,2.4,2.28],'hazard'],['box',[1.1,1.8,.12],[1.5,1,2.31],'glass']],
  triage_shelter: [['box',[5,2.4,4],[0,1.2,0],'tarp'],['box',[5.3,.16,4.3],[0,2.4,0],'medical'],['box',[.15,2.1,.15],[-2.4,1.05,1.9],'metal'],['box',[.15,2.1,.15],[2.4,1.05,1.9],'metal'],['box',[2.1,.1,.12],[0,1.8,2.02],'white'],['box',[.65,.55,.7],[-1,.28,-.8],'medical'],['box',[.65,.55,.7],[1,.28,-.8],'medical']],
  hospital_complex: [['box',[6,4,4],[0,2,0],'concrete'],['box',[6.2,.25,4.2],[0,4,0],'white'],['box',[3.8,1.1,.12],[0,2.8,2.06],'glass'],['box',[.2,1.5,.14],[-1.2,2.7,2.1],'red'],['box',[.2,1.5,.14],[1.2,2.7,2.1],'red'],['box',[2.8,.18,1.2],[4,.1,0],'metal'],['box',[.2,1.2,.2],[3.1,.6,0],'hazard']],
  market_ruin: [['box',[5.5,2.8,4],[0,1.4,0],'brick'],['box',[5.7,.18,4.2],[0,2.82,0],'metal'],['box',[1.2,1.8,.15],[-1.4,.9,2.04],'glass'],['box',[1.2,1.8,.15],[1.4,.9,2.04],'glass'],['box',[3.8,.2,.2],[0,2.1,2.1],'hazard'],['box',[2.2,.9,1.1],[0,.45,-.9],'wood']],
  foundry_yard: [['box',[5.5,2.7,4.5],[0,1.35,0],'metal'],['box',[5.8,.2,4.8],[0,2.75,0],'rust'],['cylinder',[.6,2.4,.6],[-1.7,1.2,-.8],'metal'],['cylinder',[.6,2.4,.6],[1.7,1.2,-.8],'metal'],['box',[4.8,.16,.5],[0,2.25,-.8],'hazard'],['box',[.3,3,.3],[-2.5,1.5,1.6],'rust'],['box',[.3,3,.3],[2.5,1.5,1.6],'rust']],
  subway_entrance: [['box',[5,.25,3.5],[0,1.8,0],'concrete'],['box',[.35,3,.35],[-2.2,1.5,0],'concreteDark'],['box',[.35,3,.35],[2.2,1.5,0],'concreteDark'],['box',[4.7,.22,.25],[0,2.8,0],'hazard'],['box',[2.8,.12,2.3],[0,.1,0],'metal'],['box',[.14,2,.14],[-1.2,1,1.4],'rust'],['box',[.14,2,.14],[1.2,1,1.4],'rust']],
  research_facility: [['box',[5.5,3.4,4.8],[0,1.7,0],'concreteDark'],['box',[5.7,.22,5],[0,3.4,0],'metal'],['box',[4.2,2.2,.12],[0,1.9,2.42],'glass'],['box',[.14,2.4,.16],[-2.2,1.2,2.5],'hazard'],['box',[.14,2.4,.16],[2.2,1.2,2.5],'hazard'],['box',[1.6,1,.12],[0,1.4,2.55],'light'],['box',[.7,.7,.7],[0,.35,-.9],'metal']]
});

export const LANDMARK_ARCHETYPES = Object.freeze(Object.keys(RECIPES));

// One shared material per palette entry (per Three.js namespace) instead of one per mesh:
// 17 landmarks x ~7 pieces would otherwise compile ~120 identical-looking materials on phones.
const SHARED_MATERIALS = new WeakMap();
function sharedMaterial(THREE, materialName) {
  let cache = SHARED_MATERIALS.get(THREE);
  if (!cache) { cache = new Map(); SHARED_MATERIALS.set(THREE, cache); }
  const key = Object.hasOwn(MAT, materialName) ? materialName : 'concrete';
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: MAT[key], roughness: 0.92, metalness: key === 'metal' || key === 'rust' ? 0.32 : 0.04 });
    cache.set(key, material);
  }
  return material;
}

export function buildLandmarkSetPiece(THREE, landmark, terrainY = 0) {
  if (!THREE || typeof THREE.Group !== 'function' || typeof THREE.Mesh !== 'function') throw new TypeError('Three.js namespace is required');
  if (!landmark || typeof landmark.id !== 'string' || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.z)) throw new TypeError('valid landmark descriptor is required');
  const recipe = RECIPES[landmark.archetype];
  if (!recipe) throw new Error('unknown_landmark_archetype:' + landmark.archetype);
  const root = new THREE.Group();
  root.name = 'homefront-landmark:' + landmark.id;
  root.position.set(landmark.x, terrainY, landmark.z);
  root.userData.landmarkId = landmark.id;
  root.userData.archetype = landmark.archetype;
  for (const [shape, size, position, materialName] of recipe) {
    const [a, b, c] = size;
    const geometry = shape === 'cylinder'
      ? new THREE.CylinderGeometry(a, a, b, 8)
      : new THREE.BoxGeometry(a, b, c);
    const material = sharedMaterial(THREE, materialName);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.landmarkId = landmark.id;
    root.add(mesh);
  }
  return root;
}

export function landmarkRecipeSummary() {
  return Object.fromEntries(Object.entries(RECIPES).map(([id, recipe]) => [id, { pieces: recipe.length, hasHazardMarking: recipe.some(piece => piece[3] === 'hazard'), hasReadableLight: recipe.some(piece => piece[3] === 'light') }]));
}
