import assert from 'node:assert/strict';
import { stepWaypointPath } from './wilds-waypoint-follower.mjs';

const path = [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 4 }];

// Start point is consumed, then movement advances by no more than maxStep.
const first = stepWaypointPath({ position: { x: 0, z: 0 }, path, maxStep: 1 });
assert.deepEqual(first.position, { x: 1, z: 0 });
assert.equal(first.waypointIndex, 1);
assert.equal(first.reached, false);
assert.ok(first.moved <= 1);

// The step cannot overshoot the target, including the final waypoint.
const second = stepWaypointPath({ position: { x: 2.5, z: 0 }, path, waypointIndex: 1, maxStep: 5 });
assert.deepEqual(second.position, { x: 3, z: 0 });
assert.equal(second.waypointIndex, 2);
const final = stepWaypointPath({ position: second.position, path, waypointIndex: second.waypointIndex, maxStep: 9 });
assert.deepEqual(final.position, { x: 3, z: 4 });
assert.equal(final.reached, true);

// Duplicate/nearby waypoints are skipped without producing NaN or infinite loops.
const duplicates = stepWaypointPath({
  position: { x: 2, z: 2 },
  path: [{ x: 2, z: 2 }, { x: 2, z: 2 }, { x: 3, z: 2 }],
  maxStep: 0.5,
});
assert.deepEqual(duplicates.position, { x: 2.5, z: 2 });
assert.equal(duplicates.waypointIndex, 2);

// Invalid input is rejected, and a zero step never moves.
assert.equal(stepWaypointPath(), null);
assert.equal(stepWaypointPath({ position: { x: NaN, z: 0 }, path, maxStep: 1 }), null);
assert.equal(stepWaypointPath({ position: { x: 0, z: 0 }, path, maxStep: -1 }), null);
assert.equal(stepWaypointPath({ position: { x: 0, z: 0 }, path, maxStep: 0 }).moved, 0);

// Work per update can be bounded for long runs of already-reached points.
const capped = stepWaypointPath({
  position: { x: 0, z: 0 },
  path: Array.from({ length: 20 }, () => ({ x: 0, z: 0 })),
  maxStep: 1,
  maxWaypointsPerStep: 3,
});
assert.equal(capped.waypointIndex, 3);
assert.equal(capped.reached, false);

console.log('waypoint follower core tests passed');
