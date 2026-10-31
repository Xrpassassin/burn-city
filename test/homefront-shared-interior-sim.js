'use strict';
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');
const Interiors = require('../server/homefront-interiors');
const Collision = require('../server/homefront-collision');

const t = 1_800_000_000_000;
const a = 'survivor-a', b = 'survivor-b', outsider = 'survivor-outside';
let w = World.enter(World.defaultWorld(), a, t).world;
w = World.enter(w, b, t).world;
w = World.enter(w, outsider, t).world;
const pos = Collision.findSafePosition(-16, 22, { bounds: World.WORLD_SIZE });
assert.ok(pos && Math.hypot(pos.x + 16, pos.z - 22) <= Interiors.ENTRY_RADIUS,
  'Ironworks has an accessible entry position for both players');
for (const id of [a,b]) {
  w.players[id].x = pos.x; w.players[id].z = pos.z;
  w.players[id].lastSeen = t;
}
w.interiors = Interiors.enter(w.interiors, { account: a, player: w.players[a], landmarkId: 'ironworks', now: t }).state;
w.interiors = Interiors.enter(w.interiors, { account: b, player: w.players[b], landmarkId: 'ironworks', now: t }).state;

let alice = World.snapshot(w, a, t), bob = World.snapshot(w, b, t);
assert.equal(alice.interiorInstance.id, 'homefront:building:ironworks');
assert.equal(bob.interiorInstance.id, alice.interiorInstance.id,
  'the same building resolves to the same public world instance for everyone');
assert.equal(alice.interiorInstance.count, 2, 'both players share one building');
assert.equal(bob.interiorInstance.count, 2);
assert.equal(alice.interiorInstance.occupants.filter(x => x.roomId === 'yard_floor').length, 2);
assert.deepEqual(alice.interiorInstance.occupants.map(x => x.id).sort(),
  bob.interiorInstance.occupants.map(x => x.id).sort(), 'clients see consistent identities');
assert.ok(alice.players.some(p => p.label !== 'You' && p.interior?.instanceId === alice.interiorInstance.id),
  'existing world avatars identify co-located interior occupants');
assert.equal(alice.players.find(p => p.label === 'You').interior.roomId, 'yard_floor');
assert.equal(World.snapshot(w, outsider, t).interiorInstance, null,
  'players outdoors do not receive a foreign building occupancy feed');

// Room changes remain server-validated and visible to both peers.
w.interiors[b].interiors.ironworks.roomId = 'gantry_catwalk';
alice = World.snapshot(w, a, t);
bob = World.snapshot(w, b, t);
assert.equal(alice.interiorInstance.occupants.find(p => p.label !== 'You').roomId, 'gantry_catwalk');
assert.equal(bob.interiorInstance.occupants.find(p => p.label === 'You').roomId, 'gantry_catwalk');
assert.equal(alice.interiorInstance.count, 2, 'different floors share the building instance');

// Leaving one player must not evict or reset the other player's room or progress.
w.interiors = Interiors.leave(w.interiors, { account: b, player: w.players[b], now: t + 10 }).state;
alice = World.snapshot(w, a, t + 10);
bob = World.snapshot(w, b, t + 10);
assert.equal(alice.interiorInstance.count, 1);
assert.equal(bob.interiorInstance, null);
assert.equal(alice.interiorInstance.occupants[0].roomId, 'yard_floor');

// Expired players and stale / geographically impossible room assignments fail closed.
w.interiors = Interiors.enter(w.interiors, { account: b, player: w.players[b], landmarkId: 'ironworks', now: t + 20 }).state;
w.players[b].lastSeen = t - World.PRESENCE_TTL - 1;
assert.equal(World.snapshot(w, a, t + 20).interiorInstance.count, 1,
  'expired presence is not exposed after disconnection');
w.players[b].lastSeen = t + 20;
w.players[b].x = 90; w.players[b].z = 0;
assert.equal(Interiors.roomPresence(w.interiors, w.players, b, t + 20, World.PRESENCE_TTL), null,
  'stale interior state cannot fake occupancy from across the map');
assert.equal(World.snapshot(w, a, t + 20).interiorInstance.count, 1);
assert.equal(Interiors.roomPresence(w.interiors, w.players, 'forged', t), null);
console.log('Homefront shared multi-account building presence and room snapshots passed.');
