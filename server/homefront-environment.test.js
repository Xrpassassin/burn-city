import assert from 'node:assert/strict';
import Environment from '../server/homefront-environment.js';

const wall = Environment.STRUCTURES.find(s => s.kind === 'building');
assert.ok(wall, 'deterministic building structures are catalogued');
assert.equal(Environment.isKnown(wall.id), true);
assert.equal(Environment.isKnown('__proto__'), false);
let states = {};
let result = Environment.damage(states, wall.id, 100, 1000);
states = result.states;
assert.equal(result.structure.health, 140);
assert.equal(result.structure.stage, 'damaged');
assert.equal(result.structure.collisionEnabled, true);
assert.throws(() => Environment.damage(states, 'client-invented', 10, 1100), /unknown_environment_structure/);
assert.throws(() => Environment.damage(states, wall.id, 101, 1100), /invalid_environment_damage/);

// Any active player near the structure pauses repair; the timer starts after the area empties.
states = Environment.tick(states, { p: { x: wall.x, z: wall.z, lastSeen: 2000 } }, 2000);
assert.equal(states[wall.id].unoccupiedSince, null);
states = Environment.tick(states, {}, 3000);
assert.equal(states[wall.id].unoccupiedSince, 3000);
states = Environment.tick(states, {}, 47_999);
assert.equal(states[wall.id].health, 140);
states = Environment.tick(states, {}, 58_000);
assert.equal(states[wall.id].health, 190);
states = Environment.tick(states, { p: { x: wall.x, z: wall.z, lastSeen: 58_000 } }, 58_000);
assert.equal(states[wall.id].unoccupiedSince, null);
assert.equal(states[wall.id].health, 190);
states = Environment.tick(states, {}, 60_000);
assert.equal(states[wall.id].unoccupiedSince, 60_000);
states = Environment.tick(states, {}, 105_000);
assert.equal(states[wall.id].health, 190);
states = Environment.tick(states, {}, 115_000);
assert.equal(states[wall.id].health, 215);
states = Environment.tick(states, {}, 125_000);
assert.equal(states[wall.id].health, wall.maxHealth);
assert.equal(states[wall.id].stage, 'intact');
console.log('Homefront environment authority tests passed');
