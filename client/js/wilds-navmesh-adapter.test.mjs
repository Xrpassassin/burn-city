import assert from 'node:assert/strict';
import { findNavmeshRoute } from './wilds-navmesh-adapter.mjs';

class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
const route = [{ x: 1, y: 0, z: 2 }, { x: 2, y: 0, z: 3 }];
const fake = {
  getGroup: (_zone, p) => p.x < 10 ? 0 : 1,
  findPath: () => route,
};
const args = { pathfinding: fake, Vector3: Vec3, start: { x: 1, y: 0, z: 1 }, goal: { x: 2, y: 0, z: 2 } };
const result = findNavmeshRoute(args);
assert.equal(result.ok, true);
assert.equal(result.startGroup, 0);
assert.equal(result.waypointCount, 2);
assert.deepEqual(result.path, route);
assert.notEqual(result.path, route, 'adapter returns a fresh array');
assert.equal(findNavmeshRoute({ ...args, goal: { x: 20, y: 0, z: 2 } }).reason, 'different-navmesh-groups');
assert.equal(findNavmeshRoute({ ...args, start: { x: NaN, y: 0, z: 0 } }).reason, 'invalid-input');
assert.equal(findNavmeshRoute({ ...args, maxWaypoints: 1 }).reason, 'invalid-or-unbounded-route');
assert.equal(findNavmeshRoute({ ...args, pathfinding: { ...fake, getGroup: () => null } }).reason, 'outside-navmesh');
assert.equal(findNavmeshRoute({ ...args, pathfinding: { ...fake, findPath: () => null } }).reason, 'no-route');
assert.equal(findNavmeshRoute({ ...args, pathfinding: { ...fake, findPath: () => { throw Error('test'); } } }).reason, 'pathfinding-error');
assert.equal(findNavmeshRoute({ ...args, pathfinding: null }).reason, 'invalid-input');
console.log('wilds-navmesh-adapter: all tests passed');
