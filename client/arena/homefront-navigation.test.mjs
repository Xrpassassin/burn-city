import assert from 'node:assert/strict';
import { isPositionBlocked, isWorkingTask, obstacleRadius, separationVector, steeringDirection } from './homefront-navigation.mjs';

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

assert.equal(isWorkingTask('farmer','tend_crops'), true, 'farmers animate active crop work');
assert.equal(isWorkingTask('mechanic','emergency_repair'), true, 'mechanics animate active repair work');
assert.equal(isWorkingTask('medic','triage_standby'), false, 'medical standby remains an idle posture');
assert.equal(isWorkingTask('scavenger','stockpile_supplies'), true, 'scavengers animate active stockpiling');
assert.equal(isWorkingTask('guard','perimeter_watch'), true, 'guards use an alert posture while on watch');
assert.equal(isWorkingTask('mechanic','stand_by_repairs'), false, 'repair standby does not look like active wrench work');

import { updateRouteRecovery } from './homefront-navigation.mjs';

let route = updateRouteRecovery({}, { x: 0, z: 0 }, { x: 5, z: 0 }, 0);
route = updateRouteRecovery(route, { x: 0.01, z: 0 }, { x: 5, z: 0 }, 1500);
assert.equal(route.stuck, true, 'route recovery detects a survivor that has stopped making progress');
assert.notEqual(route.preferredOffset, 0, 'a stalled survivor receives a deterministic alternate approach');
const firstOffset = route.preferredOffset;
route = updateRouteRecovery(route, { x: 0.01, z: 0 }, { x: 5, z: 0 }, 2500);
assert.notEqual(route.preferredOffset, firstOffset, 'repeated stalls cycle to another approach instead of retrying the same side');
route = updateRouteRecovery(route, { x: 1, z: 0 }, { x: 5, z: 0 }, 2700);
assert.equal(route.preferredOffset, 0, 'real progress clears the temporary route bias');
const changedTarget = updateRouteRecovery(route, { x: 1, z: 0 }, { x: -5, z: 0 }, 2800);
assert.equal(changedTarget.retries, 0, 'a changed destination resets stale route recovery state');
console.log('Homefront survivor route recovery tests passed');
