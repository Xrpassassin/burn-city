'use strict';
// Deterministic two-account movement smoke test against the actual
// server-authoritative Homefront world. No production feature flag or wallet.
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');
const Collision = require('../server/homefront-collision');
const Terrain = require('../server/homefront-terrain');

const A = 'preview-multiplayer-a';
const B = 'preview-multiplayer-b';
let world = World.enter(World.defaultWorld(), A, 1000).world;
world = World.enter(world, B, 1010).world;
const start = { x: world.players[A].x, z: world.players[A].z };
const candidates = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
const forward = candidates.find(dir =>
  Terrain.canTraverse(start.x, start.z, start.x + dir.x * 1.25, start.z + dir.z * 1.25) &&
  Collision.canTraverse(start.x, start.z, start.x + dir.x * 1.25, start.z + dir.z * 1.25,
    { bounds: World.WORLD_SIZE }));
assert(forward, 'test spawn offers an unobstructed movement leg');

// Stage nearby test actors so both are visible via the real world interest
// filter. This fixture positioning is not a client movement capability.
world.players[B].x = start.x;
world.players[B].z = start.z;
const command = (sequence, magnitude = 1, account = undefined) =>
  ({ sequence, x: forward.x * magnitude, z: forward.z * magnitude, sprint: false, account });

let packet = World.moveInput(world, A, command(0), 2000);
world = packet.world;
assert.equal(packet.result.inputAck.elapsedMs, 0, 'A receives fresh server time baseline');
packet = World.moveInput(world, B, command(0), 2010);
world = packet.world;
assert.equal(packet.result.inputAck.elapsedMs, 0, 'B receives separate server baseline');
assert.equal(world.players[A].lastInputSequence, 0);
assert.equal(world.players[B].lastInputSequence, 0);

packet = World.moveInput(world, A, command(1, 1), 2100);
world = packet.world;
const aMoved = { x: world.players[A].x, z: world.players[A].z };
assert(Math.abs(Math.hypot(aMoved.x - start.x, aMoved.z - start.z) - 0.8) < 1e-6,
  'A has one bounded 100ms walking step');
assert.equal(packet.result.inputAck.sequence, 1);
const beforeB = { x: world.players[B].x, z: world.players[B].z };
packet = World.moveInput(world, B, command(1, 0.2, A), 2110);
world = packet.world;
const bMoved = { x: world.players[B].x, z: world.players[B].z };
assert(Math.abs(Math.hypot(bMoved.x - beforeB.x, bMoved.z - beforeB.z) - 0.16) < 1e-6,
  'B keeps independent 20% analog speed despite a forged account field');
assert.deepEqual({ x: world.players[A].x, z: world.players[A].z }, aMoved,
  'B cannot move or modify A while moving itself');
assert.equal(world.players[A].lastInputSequence, 1);
assert.equal(world.players[B].lastInputSequence, 1);

const viewA = World.snapshot(world, A, 2120);
const viewB = World.snapshot(world, B, 2120);
const remoteA = viewA.players.find(p => p.id !== viewA.self.id);
const remoteB = viewB.players.find(p => p.id !== viewB.self.id);
assert(remoteA && remoteB, 'both players are in the shared multiplayer interest set');
assert.equal(remoteA.x, bMoved.x, 'A receives B authoritative world position');
assert.equal(remoteA.z, bMoved.z);
assert.equal(remoteB.x, aMoved.x, 'B receives A authoritative world position');
assert.equal(remoteB.z, aMoved.z);
assert.notEqual(viewA.self.id, viewB.self.id, 'account identities remain distinct');

assert.throws(() => World.moveInput(world, A, command(1), 2200), /invalid_movement_sequence/,
  'A cannot replay its last input');
assert.throws(() => World.moveInput(world, 'not-joined', command(2, 1, A), 2200),
  /not_in_expedition/, 'forged account fields cannot grant an expedition session');
assert.deepEqual({ x: world.players[A].x, z: world.players[A].z }, aMoved,
  'rejected input leaves authoritative movement unchanged');

const party = World.createParty(world, A, 2400);
const joined = World.joinParty(party.world, B, party.result.party.code, 2410);
assert.throws(() => World.moveInput(joined.world, B, command(2), 2510),
  /party_leader_controls_movement/, 'server prevents follower direct-walk override');
console.log('Homefront two-account direct movement: independent analog steps, shared presence, replay/auth and party authority passed.');
