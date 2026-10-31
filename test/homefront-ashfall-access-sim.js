'use strict';
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');
const Interiors = require('../server/homefront-interiors');
const Collision = require('../server/homefront-collision');
const Catalog = require('../client/arena/homefront-interior-world.mjs');

const now = 1_820_000_000_000;
const names = ['ashfall_station', 'wrecked_depot', 'old_rail_yard', 'quarantine_shelter'];
for (const id of names) {
  const point = World.POINTS_OF_INTEREST.find(p => p.id === id);
  const interior = Catalog.interiorForLandmark(id);
  assert.ok(point && interior && Interiors.LANDMARKS[id], id + ' is a real server-validated entry');
  assert.deepEqual([point.x, point.z], [Interiors.LANDMARKS[id].x, Interiors.LANDMARKS[id].z],
    'client/server authored coordinates match for ' + id);
  const entry = Collision.findSafePosition(point.x, point.z, { bounds: World.WORLD_SIZE });
  assert.ok(entry && Math.hypot(entry.x - point.x, entry.z - point.z) <= Interiors.ENTRY_RADIUS,
    'collision-aware, walkable entry exists for ' + id);
  const player = { x: entry.x, z: entry.z, inventory: { food: 0, ammo: 0, wood: 0, scrap: 0, meds: 0 } };
  assert.ok(Interiors.enter({}, { account: 'explorer', player, landmarkId: id, now }).interior,
    id + ' can actually be entered using the existing server route');
  assert.throws(() => Interiors.enter({}, {
    account: 'remote', player: { x: 90, z: 80 }, landmarkId: id, now
  }), /too_far_from_interior/, 'remote entry is denied at ' + id);
}
const point = Interiors.LANDMARKS.ashfall_station;
let world = World.enter(World.defaultWorld(), 'explorer-a', now).world;
world = World.enter(world, 'explorer-b', now).world;
for (const id of ['explorer-a', 'explorer-b']) {
  world.players[id].x = point.x;
  world.players[id].z = point.z;
  world.players[id].lastSeen = now;
}
world.interiors = Interiors.enter(world.interiors, {
  account: 'explorer-a', player: world.players['explorer-a'], landmarkId: 'ashfall_station', now
}).state;
world.interiors = Interiors.enter(world.interiors, {
  account: 'explorer-b', player: world.players['explorer-b'], landmarkId: 'ashfall_station', now
}).state;
const before = World.snapshot(world, 'explorer-a', now);
assert.equal(before.interiorInstance.count, 2, 'power station is one shared building instance');
assert.equal(before.interiorInstance.id, World.snapshot(world, 'explorer-b', now).interiorInstance.id);
assert.throws(() => Interiors.action(world.interiors, {
  account: 'explorer-b', player: { ...world.players['explorer-b'], x: 90, z: 80 },
  actionId: 'ashfall_breaker', now
}), /too_far_from_interior/, 'remote client cannot change power from outside');
world.players['explorer-a'].x = point.x - 1.1;
world.players['explorer-a'].z = point.z + 0.7;
const switched = Interiors.action(world.interiors, {
  account: 'explorer-a', player: world.players['explorer-a'], actionId: 'ashfall_breaker',
  now: now + 1, shared: world.sharedInteriors
});
world.interiors = switched.state;
world.sharedInteriors = switched.shared;
assert.ok(Interiors.publicState(world.interiors, 'explorer-b', world.sharedInteriors).flags.includes('ashfall_grid'),
  'another player sees the powered station');
const restored = World.normalizeWorld(JSON.parse(JSON.stringify(world)));
assert.equal(World.snapshot(restored, 'explorer-b', now + 1).interiorInstance.mechanisms.flags[0], 'ashfall_grid',
  'power state survives persistence and world normalization');
console.log('Homefront shared enterable power-station, depot, rail and shelter tests passed.');
