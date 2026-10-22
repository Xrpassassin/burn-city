import assert from 'node:assert/strict';
import { findGridPath } from './wilds-pathfinding-core.mjs';
import { findWorldPath } from './wilds-pathfinding-world.mjs';

const bounds = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };

// A clear path includes both endpoints and has the shortest four-way route.
const route = findGridPath({ start: { x: 0, z: 0 }, goal: { x: 2, z: 0 }, bounds });
assert.equal(route.reached, true, 'direct route should be reachable');
assert.equal(route.path.length, 3, 'direct route should use three cells');
assert.deepEqual(route.path[0], { x: 0, z: 0 });
assert.deepEqual(route.path.at(-1), { x: 2, z: 0 });

// A blocked column across the bounded area must be unreachable.
const blocked = findGridPath({
  start: { x: 0, z: 0 }, goal: { x: 2, z: 0 }, bounds,
  isBlocked: x => x === 1,
});
assert.equal(blocked.reached, false, 'blocked column should be unreachable');
assert.deepEqual(blocked.path, []);

// Guardrails for malformed input, blocked endpoints, and visit caps.
assert.equal(findGridPath(), null, 'missing arguments should be rejected');
assert.equal(findGridPath({ start: { x: NaN, z: 0 }, goal: { x: 1, z: 0 }, bounds }), null);
assert.equal(findGridPath({ start: { x: 0, z: 0 }, goal: { x: 1, z: 0 }, bounds, maxVisited: 0 }), null);
assert.equal(findGridPath({
  start: { x: 0, z: 0 }, goal: { x: 1, z: 0 }, bounds, isBlocked: (x, z) => x === 0 && z === 0,
}).reached, false);
assert.equal(findGridPath({
  start: { x: 0, z: 0 }, goal: { x: 4, z: 4 }, bounds, maxVisited: 1,
}).reached, false, 'visit cap should bound the search');

// World adapter converts metre coordinates to cells and back using origin + cell size.
const worldBounds = { minX: 0, maxX: 2, minZ: 0, maxZ: 0 };
const worldRoute = findWorldPath({
  start: { x: 100, z: 200 }, goal: { x: 104, z: 200 },
  origin: { x: 100, z: 200 }, cellSize: 2, bounds: worldBounds,
});
assert.equal(worldRoute.reached, true);
assert.deepEqual(worldRoute.path, [{ x: 100, z: 200 }, { x: 102, z: 200 }, { x: 104, z: 200 }]);
assert.deepEqual(worldRoute.cells, [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }]);

let sawWorldCell = false;
const blockedWorldRoute = findWorldPath({
  start: { x: 100, z: 200 }, goal: { x: 104, z: 200 },
  origin: { x: 100, z: 200 }, cellSize: 2, bounds: worldBounds,
  isBlocked: (x, z, cellX) => {
    if (x === 102 && z === 200 && cellX === 1) sawWorldCell = true;
    return x === 102;
  },
});
assert.equal(sawWorldCell, true, 'obstacle callback should receive world and cell coordinates');
assert.equal(blockedWorldRoute.reached, false, 'blocked world cell should stop the route');
assert.equal(findWorldPath({ start: { x: 0, z: 0 }, goal: { x: 1, z: 0 }, bounds, cellSize: 0 }), null);

console.log('pathfinding core + world-adapter tests passed');
