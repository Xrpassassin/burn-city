'use strict';

const assert = require('node:assert/strict');
const {
  assignRole, distance2D, hearNoise, chooseBehavior, flankingHint, selectApproachTarget, validateApproachTarget, roleTuning
} = require('./zombie-tactics-core');

assert.equal(assignRole('z1', 'squad-a', 0, 4), 'pursuer');
assert.equal(roleTuning('runner').pursuitSpeed, 1.12, 'runner closes distance faster');
assert.equal(roleTuning('bruiser').staggerFactor, 0.3, 'bruiser recovers movement better under stagger');
assert.equal(roleTuning('straggler').hearingScale, 1.25, 'straggler detects sounds at extended range');
assert.deepEqual(roleTuning('unknown'), roleTuning('pursuer'), 'unknown role safely falls back to pursuer tuning');
assert.equal(assignRole('z2', 'squad-a', 1, 4), assignRole('z2', 'squad-a', 1, 4), 'role assignment is deterministic');
assert.notEqual(assignRole('z2', 'squad-a', 1, 4), 'pursuer');
assert.deepEqual(new Set([0, 1, 2, 3, 4].map(i => assignRole('z' + i, 'squad-balanced', i, 5))), new Set(['pursuer', 'flanker', 'bruiser', 'straggler', 'runner']), 'five-member squad deterministically receives each role');
assert.equal(distance2D({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
assert.equal(distance2D(null, { x: 0, z: 0 }), Infinity);

const noise = { x: 4, z: 2, atMs: 1000, ttlMs: 5000, radius: 12, intensity: 0.8 };
assert.equal(hearNoise({ x: 0, z: 0 }, noise, 2000).intensity, 0.8);
assert.equal(hearNoise({ x: 0, z: 0 }, { ...noise, radius: 1 }, 2000), null);
assert.ok(hearNoise({ x: 0, z: 0 }, { ...noise, radius: 4 }, 2000, 1.5), 'expanded hearing radius supports role-specific hearing');
assert.equal(hearNoise({ x: 0, z: 0 }, noise, 2000, -1), null, 'negative hearing scale is rejected');
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
const flankA = selectApproachTarget({ role: 'flanker', zombie: { id: 20, x: 0, z: 0 }, target: { x: 10, z: 0 }, targetVisible: true });
const flankB = selectApproachTarget({ role: 'flanker', zombie: { id: 20, x: 0, z: 0 }, target: { x: 10, z: 0 }, targetVisible: true });
assert.deepEqual(flankA, flankB, 'flanking side is deterministic');
assert.ok(flankA && Math.hypot(flankA.x - 10, flankA.z) >= 3.9, 'flanker chooses an offset approach point');
assert.deepEqual(selectApproachTarget({ role: 'pursuer', zombie: { id: 21, x: 0, z: 0 }, target: { x: 10, z: 2 }, targetVisible: true }), { x: 10, z: 2, role: 'pursuer' }, 'pursuer keeps direct pressure');
assert.equal(selectApproachTarget({ role: 'flanker', zombie: { id: 20, x: 0, z: 0 }, target: { x: 10, z: 0 }, targetVisible: false }), null, 'flanker never invents a target without visibility');
assert.deepEqual(selectApproachTarget({ role: 'flanker', zombie: { id: 20, x: 7, z: 0 }, target: { x: 10, z: 0 }, targetVisible: true }), { x: 10, z: 0, role: 'flanker' }, 'close flanker rejoins the direct approach');
assert.deepEqual(validateApproachTarget({ approach: flankA, sameFloor: true, isWalkable: () => true, hasLineOfSight: () => true }), { x: flankA.x, z: flankA.z }, 'valid open-space flank is accepted');
assert.equal(validateApproachTarget({ approach: flankA, sameFloor: true, isWalkable: () => false, hasLineOfSight: () => true }), null, 'blocked flank point is rejected');
assert.equal(validateApproachTarget({ approach: flankA, sameFloor: true, isWalkable: () => true, hasLineOfSight: () => false }), null, 'wall-blocked flank route is rejected');
assert.equal(validateApproachTarget({ approach: flankA, sameFloor: false, isWalkable: () => true, hasLineOfSight: () => true }), null, 'cross-floor flank is rejected');
assert.equal(validateApproachTarget({ approach: flankA, sameFloor: true, isWalkable: () => { throw new Error('bad map'); }, hasLineOfSight: () => true }), null, 'navigation errors fail closed');
assert.equal(validateApproachTarget({ approach: flankA, sameFloor: true }), null, 'missing route validators fail closed');

console.log('zombie-tactics-core: all tests passed');
