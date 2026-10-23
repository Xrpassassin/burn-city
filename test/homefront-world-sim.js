'use strict';
const assert = require('node:assert/strict');
const W = require('../server/homefront-world');
const Combat = require('../server/homefront-combat');

let world = W.defaultWorld();
const a = W.enter(world, 'acct-a', 1000); world = a.world;
const b = W.enter(world, 'acct-b', 1000); world = b.world;
assert.notDeepEqual([a.result.self.x, a.result.self.z], [b.result.self.x, b.result.self.z], 'solo players spawn at different perimeter locations');
assert.equal(b.result.players.length, 2, 'both active players appear in the shared map');
assert.equal(a.result.self.risk, 1, 'perimeter spawn is low risk');
assert.ok(a.result.world.pointsOfInterest.some(p => p.type === 'cache'), 'shared world includes physical supply-cache landmarks');
assert.ok(Object.values(a.result.world.caches).every(cache => cache.readyAt === 0), 'shared supply caches begin available');
assert.ok(a.result.world.pointsOfInterest.some(p => p.type === 'rescue'), 'shared world includes survivor rescue sites');
assert.ok(Object.values(a.result.world.rescues).every(site => site.readyAt === 0), 'shared rescue sites begin available');

const party = W.createParty(world, 'acct-a', 1100); world = party.world;
const code = party.result.party.code;
const joined = W.joinParty(world, 'acct-b', code, 1200); world = joined.world;
assert.equal(joined.result.party.members.length, 2, 'party roster is shared');
assert.deepEqual([joined.result.self.x, joined.result.self.z], [joined.result.party.members[0].x, joined.result.party.members[0].z], 'party members spawn together');
const c = W.enter(world, 'acct-c', 1250); world = c.world;
assert.throws(() => W.joinParty(world, 'acct-c', 'NOPE00', 1300), /party_not_found/);

assert.throws(() => W.move(world, 'acct-b', 0, 0, 2200), /party_leader_controls_movement/);
const before = world.players['acct-a'];
const needsBeforeMove = { hunger: before.survival.hunger, thirst: before.survival.thirst, stamina: before.survival.stamina };
const moved = W.move(world, 'acct-a', -100, -100, 2200);
world = moved.world;
assert.ok(Math.hypot(world.players['acct-a'].x - before.x, world.players['acct-a'].z - before.z) <= W.MOVE_STEP + 0.2, 'movement is server-clamped to a short step');
assert.ok(world.players['acct-a'].survival.hunger < needsBeforeMove.hunger, 'accepted travel consumes food reserves');
assert.ok(world.players['acct-a'].survival.thirst < needsBeforeMove.thirst, 'accepted travel consumes water reserves');
assert.ok(world.players['acct-a'].survival.stamina < needsBeforeMove.stamina, 'accepted travel consumes stamina');
assert.equal(world.players['acct-a'].inventory.food,0,'legacy active explorers do not receive duplicated starter rations');
assert.ok(Math.hypot(world.players['acct-b'].x - world.players['acct-a'].x, world.players['acct-b'].z - world.players['acct-a'].z) < 6, 'leader movement carries party members with the group');
assert.equal(W.districtAt(0, 0).risk, 5, 'deep city core is high risk');
assert.equal(W.districtAt(-8, -82).risk, 1, 'outer spawn is low risk');

const absent = W.snapshot(world, 'acct-a', 50000);
assert.equal(absent.players.length, 0, 'stale explorers expire from shared presence');

const aiNow = Date.now();
world.players['acct-a'].lastMove = aiNow - 1000;
world.players['acct-a'].lastSeen = aiNow;
const threat = Combat.spawn({ encounters: world.encounters, account: 'acct-a', player: world.players['acct-a'], now: aiNow });
world.encounters = threat.encounters;
const enemyBefore = world.encounters['acct-a'];
enemyBefore.x = world.players['acct-a'].x + 10;
enemyBefore.z = world.players['acct-a'].z;
enemyBefore.lastAiAt = aiNow;
const distanceBefore = Math.hypot(world.players['acct-a'].x - enemyBefore.x, world.players['acct-a'].z - enemyBefore.z);
const chased = W.move(world, 'acct-a', world.players['acct-a'].x - 8, world.players['acct-a'].z, aiNow + 1500);
world = chased.world;
const enemyAfter = world.encounters['acct-a'];
const distanceAfter = Math.hypot(world.players['acct-a'].x - enemyAfter.x, world.players['acct-a'].z - enemyAfter.z);
assert.ok(enemyAfter.x !== enemyBefore.x || enemyAfter.z !== enemyBefore.z, 'authoritative movement advances infected AI');
assert.ok(distanceAfter < distanceBefore + 8, 'infected movement tracks the updated player position');
console.log('Homefront shared Graveyard world simulation passed.');
