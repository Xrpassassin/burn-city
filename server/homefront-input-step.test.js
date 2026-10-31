'use strict';
const assert = require('node:assert/strict');
const { validateInput, displacementForInput, MAX_INPUT_DT_MS, slideAlongBlockedStep } = require('./homefront-input-step');

const cmd = validateInput({ sequence: 2, x: 0.6, z: 0.8, sprint: false }, 1);
assert.equal(cmd.magnitude, 1);
assert.throws(() => validateInput({ sequence: 2, x: 0, z: 1, sprint: false }, 2), /sequence/);
assert.throws(() => validateInput({ sequence: 1.2, x: 0, z: 1, sprint: false }), /sequence/);
for (const x of [NaN, Infinity, -Infinity, '1', 2]) assert.throws(() => validateInput({ sequence: 3, x, z: 0, sprint: false }), /vector/);
assert.throws(() => validateInput({ sequence: 3, x: 1, z: 1, sprint: false }), /vector/);
assert.throws(() => validateInput({ sequence: 3, x: 0, z: 0, sprint: 1 }), /mode/);
const speeds = { walkSpeed: 4, sprintSpeed: 7 };
assert.deepEqual(displacementForInput(cmd, { now: 100, previousAt: 0, ...speeds }), { x: 0.24, z: 0.32000000000000006, elapsedMs: 100 });
const stalled = displacementForInput(cmd, { now: 10000, previousAt: 0, ...speeds });
assert.equal(stalled.elapsedMs, 0, 'long disconnects must not bank movement');
assert.equal(stalled.x, 0); assert.equal(stalled.z, 0);
const bounded = displacementForInput(cmd, { now: MAX_INPUT_DT_MS + 50, previousAt: 0, ...speeds });
assert.equal(bounded.elapsedMs, MAX_INPUT_DT_MS, 'moderate scheduling delays are capped');
const idle = displacementForInput(validateInput({ sequence: 3, x: 0, z: 0, sprint: false }, 2), { now: 10000, previousAt: 0, ...speeds });
assert.equal(idle.x, 0); assert.equal(idle.z, 0);
assert.throws(() => displacementForInput(cmd, { now: 10, previousAt: 20, ...speeds }), /server_time/);

// Collision never asks the client for a route: slides are bounded to one axis of
// the short authoritative input step, or stop in place if both axes are blocked.
const from = { x: 4, z: 7 }, diagonal = { x: 4.8, z: 7.6 };
assert.deepEqual(slideAlongBlockedStep(from, diagonal, (x, z) => x === 4.8 && z === 7),
  { x: 4.8, z: 7 }, 'blocked diagonal slides along the cleared X axis');
assert.deepEqual(slideAlongBlockedStep(from, diagonal, (x, z) => x === 4 && z === 7.6),
  { x: 4, z: 7.6 }, 'blocked diagonal slides along the cleared Z axis');
assert.deepEqual(slideAlongBlockedStep(from, diagonal, () => false), from,
  'blocked corner stops without teleporting or taking a detour');
assert.deepEqual(slideAlongBlockedStep(from, { x: 4, z: 7.6 }, (x, z) => x === 4 && z === 7.6),
  { x: 4, z: 7.6 }, 'axis-aligned movement remains allowed');
assert.ok(Math.hypot(diagonal.x - from.x, diagonal.z - from.z) >=
  Math.hypot(slideAlongBlockedStep(from, diagonal, () => true).x - from.x,
    slideAlongBlockedStep(from, diagonal, () => true).z - from.z),
  'sliding cannot exceed original displacement budget');
assert.throws(() => slideAlongBlockedStep(from, { x: Infinity, z: 0 }, () => true),
  /invalid_slide_step/, 'nonfinite travel cannot pass the server helper');

console.log('Homefront input step validator tests passed.');
