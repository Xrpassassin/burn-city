import assert from 'node:assert/strict';
import { buildPowerStationSkyline, POWER_STATION_SITE } from './homefront-power-station.mjs';
import { chunkKey, chunkCoords, visibleChunkSet } from './homefront-world-streaming.mjs';

class FakeVector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; }
}
class FakeGroup {
  constructor() { this.children = []; this.position = new FakeVector(); this.userData = {}; }
  add(child) { this.children.push(child); }
}
class FakeGeometry {
  constructor(...args) { this.args = args; }
}
class FakeLatheGeometry extends FakeGeometry {}
class FakeMaterial {
  constructor(options) { this.options = options; }
}
class FakeMesh {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.position = new FakeVector();
    this.userData = {};
  }
}
const THREE = {
  Group: FakeGroup, Mesh: FakeMesh, Vector2: FakeVector,
  BoxGeometry: FakeGeometry, CylinderGeometry: FakeGeometry,
  LatheGeometry: FakeLatheGeometry, MeshStandardMaterial: FakeMaterial
};

const station = buildPowerStationSkyline(THREE, 3.25);
assert.equal(station.name, 'homefront-skyline:ashfall-thermal-station');
assert.deepEqual([station.position.x, station.position.y, station.position.z],
  [POWER_STATION_SITE.x, 3.25, POWER_STATION_SITE.z]);
assert.equal(station.userData.visualOnly, true);
assert.equal(station.userData.collision, false, 'skyline must never affect authoritative traversal');
assert.equal(station.userData.interactive, false, 'backdrop must not create a false loot or mission promise');
assert.ok(station.children.length >= 30, 'cooling towers, stacks, reactor and service equipment are present');
assert.ok(station.children.length <= 48, 'low-poly skyline stays within the mobile draw-call budget');
const labels = station.children.map(child => child.userData.part);
for (const part of ['cooling-east-shell', 'cooling-west-shell', 'reactor-hall',
  'smokestack-0', 'smokestack-1', 'maintenance-gantry', 'walkway-guardrail']) {
  assert.ok(labels.includes(part), part + ' contributes to the silhouette');
}
assert.equal(station.children.filter(child => child.geometry instanceof FakeLatheGeometry).length, 2,
  'exactly two low-poly curved cooling towers');
const materials = new Set(station.children.map(child => child.material));
assert.ok(materials.size <= 9, 'palette material cache avoids unique shaders per building piece');
for (const part of station.children) {
  assert.equal(part.userData.visualOnly, true);
  assert.equal(part.userData.collision, false);
  assert.equal(part.userData.interactive, false);
  assert.equal(part.castShadow, false);
  assert.equal(part.receiveShadow, false);
  const easternmostEdge = station.position.x + part.position.x + part.userData.halfWidthX;
  assert.ok(easternmostEdge < -100,
    part.userData.part + ' must remain outside the circular playable radius');
  assert.ok(Math.hypot(easternmostEdge, station.position.z + part.position.z) > POWER_STATION_SITE.playableRadius);
}

const chunk = chunkCoords(POWER_STATION_SITE.x, POWER_STATION_SITE.z);
assert.deepEqual(chunk, { x: -2, z: 0 }, 'station uses the industrial-facing horizon chunk');
assert.ok(visibleChunkSet(-16, 22, 1).has(chunkKey(chunk.x, chunk.z)),
  'station is chunk-visible from the authored Ironworks landmark');
assert.ok(!visibleChunkSet(24, 30, 1).has(chunkKey(chunk.x, chunk.z)),
  'station is culled from the distant hospital district');
assert.throws(() => buildPowerStationSkyline(THREE, NaN), /finite terrain/);
assert.throws(() => buildPowerStationSkyline({ Group: FakeGroup }, 0), /lathe support/);
console.log('Homefront Ashfall power-station visual and collision-boundary checks passed.');
