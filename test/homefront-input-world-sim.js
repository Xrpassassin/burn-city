'use strict';
// Offline authoritative world integration tests: no live API flag is involved.
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');
const Collision = require('../server/homefront-collision');
const Terrain = require('../server/homefront-terrain');

const enter = World.enter(World.defaultWorld(), 'walker-a', 1000);
let w = enter.world;
const p = w.players['walker-a'];
const start = { x: p.x, z: p.z };

assert.equal(World.inputReadyInMs(p, 1000), 900, 'fresh spawn waits for legacy cooldown');
assert.equal(World.inputReadyInMs(p, 1500), 400);
assert.equal(World.inputReadyInMs(p, 1900), 0);
assert.equal(World.inputReadyInMs(null, 1900), 0);

const directions = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }];
const direction = directions.find(d => Collision.canTraverse(p.x, p.z, p.x + d.x, p.z + d.z, { bounds: World.WORLD_SIZE })
  && Terrain.canTraverse(p.x, p.z, p.x + d.x, p.z + d.z));
assert.ok(direction, 'spawn provides a traversable step');
const input = (sequence, x = direction.x, z = direction.z, sprint = false) => ({ sequence, x, z, sprint });

// New sessions establish a server-time baseline instead of moving on the initial command.
assert.throws(() => World.moveInput(w, 'walker-a', input(1), 1500), /move_cooldown/);
let out = World.moveInput(w, 'walker-a', input(1), 2000); w = out.world;
assert.deepEqual([w.players['walker-a'].x, w.players['walker-a'].z], [start.x, start.z]);
assert.equal(out.result.inputAck.sequence, 1);
assert.equal(out.result.inputAck.elapsedMs, 0);
assert.throws(() => World.moveInput(w, 'walker-a', input(1), 2100), /invalid_movement_sequence/);
assert.throws(() => World.moveInput(w, 'walker-a', input(2, 1, 1), 2100), /invalid_movement_vector/);
assert.throws(() => World.moveInput(w, 'walker-a', { ...input(2), sprint: 'true' }, 2100), /invalid_movement_mode/);
assert.throws(() => World.moveInput(w, 'walker-a', input(2), 2050), /move_cooldown/);
out = World.moveInput(w, 'walker-a', input(2), 2100); w = out.world;
const distance = Math.hypot(w.players['walker-a'].x - start.x, w.players['walker-a'].z - start.z);
assert.ok(distance >= 0.5 && distance <= 0.91, '100ms of walking travels under one world unit');
assert.equal(out.result.inputAck.elapsedMs, 100);
assert.ok(w.players['walker-a'].survival.stamina < enter.world.players['walker-a'].survival.stamina, 'stamina is charged for real movement');
assert.ok(w.players['walker-a'].survival.stamina > 99.5,
  'a one-meter continuous input step does not consume two stamina per packet');
assert.throws(() => World.move(w, 'walker-a', 0, 0, 2150), /move_cooldown/, 'legacy travel cannot be interleaved for extra distance');

// Long stalls and neutral packets do not accumulate distance or drain travel stamina.
const beforeStall = { x: w.players['walker-a'].x, z: w.players['walker-a'].z };
out = World.moveInput(w, 'walker-a', input(3), 2500); w = out.world;
assert.equal(out.result.inputAck.elapsedMs, 0);
assert.deepEqual([w.players['walker-a'].x, w.players['walker-a'].z], [beforeStall.x, beforeStall.z]);
const staminaBeforeIdle = w.players['walker-a'].survival.stamina;
out = World.moveInput(w, 'walker-a', input(4, 0, 0), 2600); w = out.world;
assert.deepEqual([w.players['walker-a'].x, w.players['walker-a'].z], [beforeStall.x, beforeStall.z]);
assert.equal(w.players['walker-a'].survival.stamina, staminaBeforeIdle);
assert.equal(w.players['walker-a'].lastInputSequence, 4, 'sequence survives world normalization and saves');
assert.throws(() => World.moveInput(w, 'walker-a', input(4), 2700), /invalid_movement_sequence/);

// Legacy movement remains supported after a full cooldown; switching back has no teleport credit.
out = World.move(w, 'walker-a', start.x, start.z, 3600); w = out.world;
assert.equal(w.players['walker-a'].lastMoveMode, 'legacy');
out = World.moveInput(w, 'walker-a', input(5), 4600); w = out.world;
assert.equal(out.result.inputAck.elapsedMs, 0);

// Authenticated account selection is enforced by the world function, not a command.account field.
assert.throws(() => World.moveInput(w, 'not-joined', { ...input(6), account: 'walker-a' }, 4700), /not_in_expedition/);
const joined = World.enter(w, 'walker-b', 4650); w = joined.world;
assert.throws(() => World.moveInput(w, 'walker-b', input(6), 4700), /move_cooldown/);
const b = World.moveInput(w, 'walker-b', input(0), 5700);
assert.equal(b.world.players['walker-b'].lastInputSequence, 0, 'input sequences are per authenticated account');
assert.equal(b.world.players['walker-a'].lastInputSequence, 5);

// A follower may not issue movement commands while the leader is active.
let parties = World.createParty(w, 'walker-a', 4750);
parties = World.joinParty(parties.world, 'walker-b', parties.result.party.code, 4800);
assert.throws(() => World.moveInput(parties.world, 'walker-b', input(1), 5800), /party_leader_controls_movement/);
console.log('Homefront authoritative input world integration tests passed.');
