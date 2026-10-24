import assert from 'node:assert/strict';
import { isPositionBlocked, obstacleRadius, separationVector, steeringDirection } from './homefront-navigation.mjs';

const wall = { id: 'w', type: 'wall', hp: 100, x: 0, z: 0 };
assert.ok(obstacleRadius(wall) > 0.7, 'structures have a conservative physical footprint');
assert.equal(isPositionBlocked(0, 0, [wall]), true, 'actors cannot occupy the centre of a solid structure');
assert.equal(isPositionBlocked(2, 0, [wall]), false, 'clear ground remains traversable');
assert.equal(isPositionBlocked(0, 0, [{ ...wall, hp: 0 }]), false, 'destroyed structures stop blocking');

const steer = steeringDirection({ x: -2, z: 0 }, { x: 2, z: 0 }, [wall]);
assert.ok(steer.x > 0, 'steering still makes forward progress around an obstacle');
assert.ok(Math.abs(steer.z) > 0.1, 'steering chooses a lateral route around a blocking obstacle');
const stationTarget = steeringDirection({ x: 1.4, z: 1.4 }, { x: 0.7, z: 0.7 }, [wall]);
assert.ok(Number.isFinite(stationTarget.x) && Number.isFinite(stationTarget.z), 'actors can approach a work target adjacent to a structure');
const crowd = separationVector({ x: 0, z: 0 }, [{ x: 0.2, z: 0 }, { x: 0, z: 0.2 }]);
assert.ok(crowd.x < 0 && crowd.z < 0, 'separation steers away from nearby survivors');
assert.ok(Math.hypot(crowd.x, crowd.z) <= 1.001, 'separation remains bounded');
assert.deepEqual(separationVector({ x: 0, z: 0 }, [{ x: 2, z: 0 }]), { x: 0, z: 0 }, 'distant agents do not repel each other');
console.log('Homefront obstacle steering and survivor separation tests passed');
