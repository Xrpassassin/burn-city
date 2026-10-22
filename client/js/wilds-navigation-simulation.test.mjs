import assert from 'node:assert/strict';
import { simulateNavigation } from './wilds-navigation-simulation.mjs';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
const open = simulateNavigation({
  start: { x: 1, z: 1 }, goal: { x: 4, z: 1 }, bounds,
  maxTicks: 100, maxStep: 0.5,
});
assert.equal(open.status, 'reached');
assert.deepEqual(open.position, { x: 4, z: 1 });
assert.equal(open.blockedSteps, 0);
assert.ok(open.ticks > 0);
assert.ok(open.maxObservedStep <= 0.5 + 1e-9);
assert.equal(open.routeRequests, 1);

const rejected = simulateNavigation({
  start: { x: 1, z: 1 }, goal: { x: 4, z: 1 }, bounds,
  canMoveTo: () => false,
});
assert.equal(rejected.status, 'replan-requested');
assert.deepEqual(rejected.position, { x: 1, z: 1 });
assert.equal(rejected.blockedSteps, 1);

const unreachable = simulateNavigation({
  start: { x: 1, z: 1 }, goal: { x: 8, z: 1 }, bounds,
  isBlocked: x => x >= 3 && x <= 7,
});
assert.equal(unreachable.status, 'unreachable');
assert.equal(unreachable.ticks, 0);

const limited = simulateNavigation({
  start: { x: 1, z: 1 }, goal: { x: 9, z: 9 }, bounds, maxTicks: 1,
});
assert.equal(limited.status, 'tick-limit');
assert.equal(limited.ticks, 1);

assert.equal(simulateNavigation({ start: { x: NaN, z: 0 }, goal: { x: 1, z: 1 }, bounds }), null);
console.log('navigation simulation tests passed');
