'use strict';

const assert = require('node:assert/strict');
const {
  assignRole, distance2D, hearNoise, chooseBehavior, flankingHint
} = require('./zombie-tactics-core');

assert.equal(assignRole('z1', 'squad-a', 0, 4), 'pursuer');
assert.equal(assignRole('z2', 'squad-a', 1, 4), assignRole('z2', 'squad-a', 1, 4), 'role assignment is deterministic');
assert.notEqual(assignRole('z2', 'squad-a', 1, 4), 'pursuer');
assert.equal(distance2D({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
assert.equal(distance2D(null, { x: 0, z: 0 }), Infinity);

const noise = { x: 4, z: 2, atMs: 1000, ttlMs: 5000, radius: 12, intensity: 0.8 };
assert.equal(hearNoise({ x: 0, z: 0 }, noise, 2000).intensity, 0.8);
assert.equal(hearNoise({ x: 0, z: 0 }, { ...noise, radius: 1 }, 2000), null);
assert.equal(hearNoise({ x: 0, z: 0 }, noise, 7001), null);
assert.equal(hearNoise({ x: 0, z: 0 }, { ...noise, radius: 'not-a-number' }, 2000), null);
assert.equal(hearNoise({ x: 0, z: 0 }, { ...noise, ttlMs: -1 }, 2000), null);

const zombie = { id: 'z1', x: 0, z: 0, hp: 10, alive: true };
assert.equal(chooseBehavior({ zombie, nowMs: 2000, target: { x: 5, z: 0 }, targetVisible: true }).state, 'pursue');
assert.equal(chooseBehavior({ zombie, nowMs: 2000, target: { x: 1, z: 0 }, targetVisible: true }).state, 'attack');
assert.equal(chooseBehavior({ zombie, nowMs: 2000, target: { x: 1, z: 0 }, targetVisible: true, staggered: true }).state, 'stagger');
assert.equal(chooseBehavior({ zombie: { ...zombie, hp: 0 }, nowMs: 2000 }).state, 'dead');
assert.equal(chooseBehavior({ zombie: { ...zombie, hp: -1 }, nowMs: 2000 }).state, 'dead');
assert.equal(chooseBehavior({ zombie, nowMs: 2000, target: { x: NaN, z: 0 }, targetVisible: true }).state, 'wander');
assert.equal(chooseBehavior({ zombie, nowMs: 2000, noise }).state, 'investigate');
assert.equal(chooseBehavior({ zombie, nowMs: 2000, lastKnownTarget: { x: 3, z: 4, untilMs: 2500 } }).state, 'search');
assert.equal(chooseBehavior({ zombie, nowMs: 3000, lastKnownTarget: { x: 3, z: 4, untilMs: 2500 } }).state, 'wander');

const hint = flankingHint({ x: 10, z: 0 }, { x: 0, z: 0 }, 1, 3);
assert.ok(hint && Number.isFinite(hint.x) && Number.isFinite(hint.z));
assert.equal(flankingHint({ x: 0, z: 0 }, { x: 0, z: 0 }), null);

console.log('zombie-tactics-core: all tests passed');
