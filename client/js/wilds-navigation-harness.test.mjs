import assert from 'node:assert/strict';
import { planNavigation, advanceNavigation } from './wilds-navigation-harness.mjs';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
const start = { x: 1, z: 1 };
const goal = { x: 5, z: 1 };

const route = planNavigation({ start, goal, bounds });
assert.equal(route.reached, true);
assert.ok(route.path.length > 1);
assert.deepEqual(route.path[0], start);
assert.deepEqual(route.path.at(-1), goal);

const simplified = planNavigation({
  start, goal, bounds,
  simplifyPath: path => [path[0], path.at(-1)],
});
assert.equal(simplified.reached, true);
assert.equal(simplified.path.length, 2);

const next = advanceNavigation({
  position: start, route, maxStep: 0.5,
});
assert.ok(next);
assert.equal(next.blocked, false);
assert.ok(next.moved <= 0.5 + 1e-9);
assert.equal(next.reached, false);

const denied = advanceNavigation({
  position: start, route, maxStep: 0.5,
  canMoveTo: () => false,
});
assert.equal(denied.blocked, true);
assert.deepEqual(denied.position, start);
assert.equal(denied.waypointIndex, route.waypointIndex);

const unreachable = planNavigation({
  start, goal: { x: 9, z: 9 }, bounds,
  isBlocked: (x, z) => x > 2 && x < 8,
});
assert.equal(unreachable.reached, false);
assert.equal(unreachable.reason, 'goal-unreachable');

assert.equal(planNavigation({ start: { x: NaN, z: 1 }, goal, bounds }), null);
assert.equal(advanceNavigation({ position: start, route, maxStep: -1 }), null);

console.log('navigation harness tests passed');
