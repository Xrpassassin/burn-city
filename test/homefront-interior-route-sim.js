'use strict';
// Moves that turn through an interior doorway must be validated leg by leg, not as one
// straight line from start to the advanced point (which cuts through the wall beside the door).
const assert = require('node:assert/strict');
const World = require('../server/homefront-world');
const Interiors = require('../server/homefront-interiors');
const acct = 'rRouteTester1';
let t = 1_700_000_000_000;
let w = World.enter(World.defaultWorld(), acct, t).world;
w.players[acct].x = -10; w.players[acct].z = -56;
w.interiors = Interiors.enter(w.interiors, { account: acct, player: w.players[acct], landmarkId: 'north_bus_depot', now: t }).state;
t += 1000;
const moved = World.move(w, acct, -9.1, -64.6, t, false);
const p = moved.world.players[acct];
assert.ok(Math.hypot(p.x + 9.1, p.z + 64.6) < 0.6, 'a single move walks through the depot doorway to the drawer: ' + p.x + ',' + p.z);
// The same target from straight outside the side wall still has to route through the door.
let w2 = World.enter(World.defaultWorld(), acct, t).world;
w2.players[acct].x = -14; w2.players[acct].z = -65;
w2.interiors = Interiors.enter(w2.interiors, { account: acct, player: w2.players[acct], landmarkId: 'north_bus_depot', now: t }).state;
const around = World.move(w2, acct, -9.1, -64.6, t + 1000, false).world.players[acct];
const Collision = require('../server/homefront-collision');
assert.equal(Collision.pointBlocked(around.x, around.z, 0.35, Collision.interiorRemovedIds('north_bus_depot', [])), null, 'the walker never ends inside a wall');
console.log('Homefront interior doorway routing passed', JSON.stringify({ through: [p.x, p.z], around: [around.x, around.z] }));
