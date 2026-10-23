'use strict';
const assert = require('node:assert/strict');
const W = require('../server/homefront-world');

let world = W.defaultWorld();
const a = W.enter(world, 'acct-a', 1000); world = a.world;
const b = W.enter(world, 'acct-b', 1000); world = b.world;
assert.notDeepEqual([a.result.self.x, a.result.self.z], [b.result.self.x, b.result.self.z], 'solo players spawn at different perimeter locations');
assert.equal(b.result.players.length, 2, 'both active players appear in the shared map');
assert.equal(a.result.self.risk, 1, 'perimeter spawn is low risk');

const party = W.createParty(world, 'acct-a', 1100); world = party.world;
const code = party.result.party.code;
const joined = W.joinParty(world, 'acct-b', code, 1200); world = joined.world;
assert.equal(joined.result.party.members.length, 2, 'party roster is shared');
assert.deepEqual([joined.result.self.x, joined.result.self.z], [joined.result.party.members[0].x, joined.result.party.members[0].z], 'party members spawn together');
assert.throws(() => W.joinParty(world, 'acct-c', 'NOPE00', 1300), /party_not_found/);

const before = world.players['acct-a'];
const moved = W.move(world, 'acct-a', -100, -100, 2200);
world = moved.world;
assert.ok(Math.hypot(world.players['acct-a'].x - before.x, world.players['acct-a'].z - before.z) <= W.MOVE_STEP + 0.01, 'movement is server-clamped to a short step');
assert.ok(Math.hypot(world.players['acct-b'].x - world.players['acct-a'].x, world.players['acct-b'].z - world.players['acct-a'].z) < 6, 'leader movement carries party members with the group');
assert.equal(W.districtAt(0, 0).risk, 5, 'deep city core is high risk');
assert.equal(W.districtAt(-8, -82).risk, 1, 'outer spawn is low risk');

const absent = W.snapshot(world, 'acct-a', 50000);
assert.equal(absent.players.length, 0, 'stale explorers expire from shared presence');
console.log('Homefront shared Graveyard world simulation passed.');
