import assert from 'node:assert/strict';
import { simplifyWorldPath } from './wilds-path-smoothing.mjs';

const route = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 2, z: 0 },
  { x: 2, z: 1 },
  { x: 2, z: 2 },
];
const clear = simplifyWorldPath({ path: route });
assert.deepEqual(clear, [{ x: 0, z: 0 }, { x: 2, z: 2 }]);

const wall = (x, z) => x > 0.8 && x < 1.2 && z > 0.3 && z < 1.7;
const aroundWall = simplifyWorldPath({ path: route, isBlocked: wall, sampleSpacing: 0.1 });
assert.deepEqual(aroundWall[0], route[0]);
assert.deepEqual(aroundWall.at(-1), route.at(-1));
assert.ok(aroundWall.length > 2);
for (let i = 1; i < aroundWall.length - 1; i++) {
  assert.ok(route.some(p => p.x === aroundWall[i].x && p.z === aroundWall[i].z),
    'intermediate points must be retained original waypoints');
}

assert.deepEqual(simplifyWorldPath({ path: [{ x: 1, z: 2 }] }), [{ x: 1, z: 2 }]);
assert.deepEqual(simplifyWorldPath({ path: [{ x: 1, z: 2 }, { x: 3, z: 4 }] }),
  [{ x: 1, z: 2 }, { x: 3, z: 4 }]);
assert.equal(simplifyWorldPath({ path: [{ x: 0, z: 0 }, { x: Infinity, z: 1 }] }), null);
assert.equal(simplifyWorldPath({ path: route, sampleSpacing: 0 }), null);
assert.deepEqual(simplifyWorldPath({ path: route, isBlocked: () => true }), route);

const bounded = simplifyWorldPath({
  path: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 10000, z: 0 }],
  maxSamplesPerSegment: 2,
});
assert.deepEqual(bounded, [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: 10000, z: 0 },
]);

console.log('world path smoothing tests passed');
