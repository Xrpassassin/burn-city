import assert from 'node:assert/strict';
import {
  decomposeVelocity, composeVelocity, dampLateral, clampHorizontalVelocity,
} from './skate-physics-core.mjs';

const near = (actual, expected, epsilon = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);

// Forward/lateral projection and reconstruction must preserve world velocity at any heading.
for (const heading of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3, 2.4]) {
  for (const [vx, vz] of [[0, 0], [3, -4], [-8.25, 1.75], [0.001, 9]]) {
    const parts = decomposeVelocity(vx, vz, heading);
    const restored = composeVelocity(parts.forward, parts.lateral, heading);
    near(restored.x, vx);
    near(restored.z, vz);
  }
}

// Decomposition is orthonormal: speed is unchanged by changing coordinate frame.
for (const heading of [0, 0.7, -2.2]) {
  const parts = decomposeVelocity(6.5, -3.25, heading);
  near(Math.hypot(parts.forward, parts.lateral), Math.hypot(6.5, -3.25));
}

// Lateral grip always decays drift, remains finite, and is frame-step deterministic.
for (const speed of [0, 2, 8, 17]) {
  const after = dampLateral(4, 1 / 60, speed);
  assert.ok(after > 0 && after < 4, 'positive lateral drift should decay');
  near(dampLateral(-4, 1 / 60, speed), -after);
  assert.ok(Number.isFinite(dampLateral(4, 1 / 60, speed)));
}
near(dampLateral(4, 0, 10), 4);

// Speed limiting must preserve direction and never exceed the cap.
for (const [vx, vz, cap] of [[30, 40, 17], [-8, 6, 10], [0, 0, 17], [2, -1, 17]]) {
  const limited = clampHorizontalVelocity(vx, vz, cap);
  assert.ok(Math.hypot(limited.x, limited.z) <= cap + 1e-10);
  if (Math.hypot(vx, vz) > 0) {
    near(limited.x * vz, limited.z * vx, 1e-9);
    if (Math.hypot(vx, vz) <= cap) {
      near(limited.x, vx);
      near(limited.z, vz);
    }
  }
}

console.log('skate physics core tests passed');
