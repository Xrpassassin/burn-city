'use strict';
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');

function state(now = 10000) {
  const w = World.defaultWorld();
  w.players.tester = {
    x: 0, z: 0, lastMove: now, lastSeen: now, spawnedAt: now,
    inventory: {}, partyCode: null, weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 },
    aiming: false, aimStartedAt: 0, lastSprintAt: 0, accuracyRecoverUntil: 0
  };
  return w;
}
function move(world, x, z, at, sprint = false) {
  return World.move(world, 'tester', x, z, at, sprint);
}
const t = 10000;
assert.throws(() => move(state(t), 1, 0, t + 249), /move_cooldown/);
assert.throws(() => move(state(t), 1, 0, t - 1), /move_cooldown/);
assert.throws(() => move(state(t), NaN, 0, t + 300), /invalid_movement_destination/);
assert.throws(() => move(state(t), Infinity, 0, t + 300), /invalid_movement_destination/);
assert.throws(() => move(state(t), '5', 0, t + 300), /invalid_movement_destination/);
assert.throws(() => move(state(t), 0, 0, t + 300, 'yes'), /invalid_movement_mode/);

// Compare accepted travel over the same time window: rapid updates must not
// grant more movement than one 900ms request. The world still validates terrain.
const rapid0 = state(t);
const rapid1 = move(rapid0, 30, 0, t + 300).world;
const rapid2 = move(rapid1, 30, 0, t + 600).world;
const rapid3 = move(rapid2, 30, 0, t + 900).world;
const legacy = move(state(t), 30, 0, t + 900).world;
const rapidDistance = Math.hypot(rapid3.players.tester.x, rapid3.players.tester.z);
const legacyDistance = Math.hypot(legacy.players.tester.x, legacy.players.tester.z);
assert.ok(rapidDistance <= legacyDistance + 0.3, 'three rapid movement steps cannot exceed a single 900ms travel budget');
assert.ok(rapidDistance > 0, 'rapid movement advances the explorer');
assert.throws(() => move(rapid3, 30, 0, t + 1000), /move_cooldown/);
console.log('Homefront authoritative movement regression checks passed.');
