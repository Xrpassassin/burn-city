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

assert.equal(LANDMARK_ARCHETYPES.length, 17, 'each authored POI archetype has a dedicated set-piece recipe');
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
assert.throws(() => buildLandmarkSetPiece(THREE, { id: 'broken', x: NaN, z: 0, archetype: 'bus_depot' }), /valid landmark descriptor/);
assert.throws(() => buildLandmarkSetPiece(THREE, { id: 'unknown', x: 0, z: 0, archetype: 'not-real' }), /unknown_landmark_archetype/);
console.log('Homefront landmark builder checks passed.');
