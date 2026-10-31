'use strict';

// Pure validation/math for a future opt-in authoritative Homefront input endpoint.
// This module does NOT move players, persist state, or bypass the legacy move cooldown.
const MAX_INPUT_DT_MS = 125;
const MAX_INPUT_MAGNITUDE = 1;
const INPUT_EPSILON = 1e-6;

function validateInput(command, lastSequence = -1) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('invalid_movement_input');
  const { sequence, x, z, sprint } = command;
  if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isSafeInteger(lastSequence) || sequence <= lastSequence) throw new Error('invalid_movement_sequence');
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error('invalid_movement_vector');
  const magnitude = Math.hypot(x, z);
  if (magnitude > MAX_INPUT_MAGNITUDE + INPUT_EPSILON) throw new Error('invalid_movement_vector');
  if (typeof sprint !== 'boolean') throw new Error('invalid_movement_mode');
  return Object.freeze({ sequence, x, z, sprint, magnitude: Math.min(1, magnitude) });
}

// Only a server-side clock may supply now/previousAt. Long gaps never bank movement.
function displacementForInput(input, { now, previousAt, walkSpeed, sprintSpeed }) {
  if (!Number.isFinite(now) || !Number.isFinite(previousAt) || now < previousAt) throw new Error('invalid_server_time');
  if (!Number.isFinite(walkSpeed) || !Number.isFinite(sprintSpeed) || walkSpeed < 0 || sprintSpeed < walkSpeed) throw new Error('invalid_movement_speed');
  // No distance credit is earned on the first packet or after a stalled connection.
  // A resumed stream must establish a fresh server-time baseline before moving.
  const gapMs = now - previousAt;
  const elapsedMs = gapMs > MAX_INPUT_DT_MS * 2 ? 0 : Math.min(MAX_INPUT_DT_MS, gapMs);
  const speed = input.sprint ? sprintSpeed : walkSpeed;
  const seconds = elapsedMs / 1000;
  return Object.freeze({ x: input.x * speed * seconds, z: input.z * speed * seconds, elapsedMs });
}


/**
 * Attempt one axis at a time when a small continuous-input diagonal hits a
 * blocking obstacle. No path search: the player can only advance within the
 * input's original displacement and only on server-cleared segments.
 * Returns the starting position if neither axis is traversable.
 */
function slideAlongBlockedStep(from, desired, canTraverse) {
  if (typeof canTraverse !== 'function' || !Number.isFinite(from?.x) || !Number.isFinite(from?.z) ||
      !Number.isFinite(desired?.x) || !Number.isFinite(desired?.z)) throw new Error('invalid_slide_step');
  const dx = desired.x - from.x, dz = desired.z - from.z;
  const axes = [
    { x: desired.x, z: from.z, distance: Math.abs(dx) },
    { x: from.x, z: desired.z, distance: Math.abs(dz) }
  ].sort((a, b) => b.distance - a.distance);
  for (const axis of axes) {
    if (axis.distance > 0 && canTraverse(axis.x, axis.z)) return Object.freeze({ x: axis.x, z: axis.z });
  }
  return Object.freeze({ x: from.x, z: from.z });
}

module.exports = { MAX_INPUT_DT_MS, validateInput, displacementForInput, slideAlongBlockedStep };
