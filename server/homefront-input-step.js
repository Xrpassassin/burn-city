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
  const elapsedMs = Math.min(MAX_INPUT_DT_MS, now - previousAt);
  const speed = input.sprint ? sprintSpeed : walkSpeed;
  const seconds = elapsedMs / 1000;
  return Object.freeze({ x: input.x * speed * seconds, z: input.z * speed * seconds, elapsedMs });
}

module.exports = { MAX_INPUT_DT_MS, validateInput, displacementForInput };
