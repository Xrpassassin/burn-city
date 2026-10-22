import assert from 'node:assert/strict';
import { planNavigation } from './wilds-navigation-harness.mjs';
import { updateNavigation } from './wilds-navigation-controller.mjs';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
const start = { x: 1, z: 1 };
const goal = { x: 5, z: 1 };
const route = planNavigation({ start, goal, bounds });
assert.equal(route.reached, true);

const moving = updateNavigation({ position: start, route, nowMs: 1000, maxStep: 0.5 });
assert.ok(moving);
assert.equal(moving.blocked, false);
assert.ok(moving.moved <= 0.5 + 1e-9);
assert.equal(moving.replan.shouldReplan, false);

const rejected = updateNavigation({ position: start, route, nowMs: 2000, maxStep: 0.5, canMoveTo: () => false });
assert.equal(rejected.blocked, true);
assert.equal(rejected.replan.shouldReplan, true);
assert.deepEqual(rejected.position, start);

const cooldown = updateNavigation({ position: start, route, nowMs: 1500, lastAttemptMs: 1000, cooldownMs: 1000, attempts: 1, maxStep: 0.5, canMoveTo: () => false });
assert.equal(cooldown.replan.reason, 'cooldown');
assert.equal(cooldown.replan.waitMs, 500);

const missing = updateNavigation({ position: start, route: null, nowMs: 1000 });
assert.equal(missing.replan.shouldReplan, true);
assert.equal(missing.replan.reason, 'route-missing');

const completeRoute = { reached: true, path: [start], waypointIndex: 1 };
const complete = updateNavigation({ position: start, route: completeRoute, nowMs: 1000 });
assert.equal(complete.reached, true);
assert.equal(complete.replan.shouldReplan, false);
assert.equal(complete.replan.reason, 'route-complete');

assert.equal(updateNavigation({ position: { x: NaN, z: 1 }, route, nowMs: 1, maxStep: 1 }), null);
assert.equal(updateNavigation({ position: start, route, nowMs: 1, maxStep: -1 }), null);
console.log('navigation controller tests passed');