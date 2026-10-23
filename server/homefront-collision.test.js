'use strict';
const assert = require('node:assert/strict');
const Collision = require('./homefront-collision');
const Terrain = require('./homefront-terrain');

assert.ok(Collision.OBSTACLES.length > 100, 'deterministic map occupancy includes buildings and environmental props');
const building = Collision.OBSTACLES.find(o => o.type === 'rect' && o.id.startsWith('building:') && Math.hypot(o.x, o.z) < 65 &&
  Collision.isSafePosition(o.x - o.halfX - 3, o.z) && Collision.isSafePosition(o.x + o.halfX + 3, o.z) &&
  Collision.canTraverse(o.x - o.halfX - 2, o.z, o.x + o.halfX + 2, o.z, { removedObstacleIds: [o.id] }));
assert.ok(building, 'procedural ruined buildings have authoritative footprints');
assert.equal(Collision.canTraverse(building.x - building.halfX - 2, building.z, building.x + building.halfX + 2, building.z), false,
  'a movement segment cannot pass through a generated building');
assert.equal(Collision.isSafePosition(building.x, building.z), false, 'a spawn cannot be placed inside a building');
assert.equal(Collision.canTraverse(building.x - building.halfX - 2, building.z, building.x + building.halfX + 2, building.z, {
  removedObstacleIds: [building.id]
}), true, 'destroyed structures can be removed from authoritative collision so routes open through the breach');
assert.equal(Collision.isSafePosition(100, 100), false, 'collision placement also enforces world bounds');

const water = Collision.OBSTACLES.find(o => o.id.startsWith('water:') && Math.hypot(o.x, o.z) < 85 &&
  Collision.canTraverse(o.x - 3, o.z + 3, o.x - 3, o.z + 3) && Collision.canTraverse(o.x + 3, o.z + 3, o.x + 3, o.z + 3));
if (water) {
  assert.equal(Collision.canTraverse(water.x - 3, water.z, water.x + 3, water.z), false,
    'generated standing-water pools block movement');
  assert.equal(Collision.isSafePosition(water.x, water.z), false, 'spawn placement rejects standing water');
}

// Verify the terrain A* API composes a collision gate and never returns an edge through a blocker.
const route = Collision.findPath(building.x - building.halfX - 3, building.z,
  building.x + building.halfX + 3, building.z, { bounds: 100, spacing: 2, maxExpanded: 2600 });
assert.ok(Array.isArray(route) && route.length > 1, 'collision-aware pathfinder finds a route around a building');
let previous = { x: building.x - building.halfX - 3, z: building.z };
for (const point of route) {
  assert.equal(Collision.canTraverse(previous.x, previous.z, point.x, point.z), true,
    'each path edge clears collision geometry');
  assert.equal(Terrain.canTraverse(previous.x, previous.z, point.x, point.z), true,
    'each path edge also respects terrain grade');
  previous = point;
}
assert.ok(Math.abs(route[0].z - building.z) > 0.1 || route.some(p => Math.abs(p.z - building.z) > 0.1),
  'route bends away from the building footprint');
assert.throws(() => Collision.canTraverse(0, 0, 1, 1, { radius: -1 }), TypeError);
console.log('Homefront authoritative collision and occupancy tests passed.');
