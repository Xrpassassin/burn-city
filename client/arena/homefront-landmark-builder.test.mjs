import assert from 'node:assert/strict';
import { buildLandmarkSetPiece, LANDMARK_ARCHETYPES, landmarkRecipeSummary } from './homefront-landmark-builder.mjs';
import { LANDMARKS } from './homefront-exploration-content.mjs';

class FakeVector {
  set(x, y, z) { Object.assign(this, { x, y, z }); }
}
class FakeGroup {
  constructor() { this.children = []; this.position = new FakeVector(); this.userData = {}; this.name = ''; }
  add(child) { this.children.push(child); }
}
class FakeGeometry { constructor(...args) { this.args = args; } }
class FakeMaterial { constructor(options) { Object.assign(this, options); } }
class FakeMesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new FakeVector(); this.userData = {}; }
}
const THREE = {
  Group: FakeGroup, Mesh: FakeMesh, BoxGeometry: FakeGeometry,
  CylinderGeometry: FakeGeometry, MeshStandardMaterial: FakeMaterial
};

assert.equal(LANDMARK_ARCHETYPES.length, 18, 'each authored POI archetype has a dedicated set-piece recipe');
const summaries = landmarkRecipeSummary();
for (const landmark of LANDMARKS) {
  assert.ok(LANDMARK_ARCHETYPES.includes(landmark.archetype), 'missing 3D recipe for ' + landmark.id);
  const piece = buildLandmarkSetPiece(THREE, landmark, 12.5);
  assert.equal(piece.name, 'homefront-landmark:' + landmark.id);
  assert.equal(piece.userData.landmarkId, landmark.id);
  assert.equal(piece.userData.archetype, landmark.archetype);
  assert.deepEqual([piece.position.x, piece.position.y, piece.position.z], [landmark.x, 12.5, landmark.z]);
  assert.ok(piece.children.length >= 5, 'landmark needs a recognizable silhouette: ' + landmark.id);
  assert.ok(piece.children.every(mesh => mesh.geometry && mesh.material && mesh.userData.landmarkId === landmark.id));
  assert.ok(summaries[landmark.archetype].pieces >= 5);
}
// New urban/industrial details are rooftop-only: never introduce extra, fake
// ground-level blockers when the server collision catalog has not changed.
for (const [archetype, originalPieces, minimum] of [
  ['foundry_yard', 7, 15],
  ['apartment_ruin', 7, 14],
  ['market_ruin', 6, 13],
  ['hospital_complex', 7, 12]
]) {
  const landmark = LANDMARKS.find(point => point.archetype === archetype);
  assert.ok(landmark, 'missing authored ' + archetype);
  const view = buildLandmarkSetPiece(THREE, landmark);
  assert.ok(view.children.length >= minimum, archetype + ' now has distinctive rooftop details');
  for (const mesh of view.children.slice(originalPieces)) {
    const height = mesh.geometry.args.length === 4 ? mesh.geometry.args[2] : mesh.geometry.args[1];
    assert.ok(mesh.position.y - height / 2 > 1.7,
      archetype + ' decoration must remain above normal player walking height');
    assert.equal(mesh.castShadow, false, 'extra scenery must not enable shadow passes');
  }
}

assert.throws(() => buildLandmarkSetPiece(THREE, { id: 'broken', x: NaN, z: 0, archetype: 'bus_depot' }), /valid landmark descriptor/);
assert.throws(() => buildLandmarkSetPiece(THREE, { id: 'unknown', x: 0, z: 0, archetype: 'not-real' }), /unknown_landmark_archetype/);
console.log('Homefront landmark builder checks passed.');
