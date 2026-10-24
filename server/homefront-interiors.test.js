'use strict';
const assert = require('node:assert/strict');
const Interiors = require('./homefront-interiors');
const Inventory = require('./homefront-inventory');
const Collision = require('./homefront-collision');

const account = 'interior-test-account';
const hospital = Interiors.LANDMARKS.mercy_hospital;
const player = { x: hospital.x, z: hospital.z, inventory: Inventory.normalize({}) };
let state = {};
const entered = Interiors.enter(state, { account, player, landmarkId: 'mercy_hospital', now: 1000 });
state = entered.state;
assert.equal(entered.interior.roomId, 'emergency_lobby');
assert.equal(Interiors.publicState(state, account).landmarkId, 'mercy_hospital');
assert.throws(() => Interiors.enter(state, { account, player: { ...player, x: -80, z: -80 }, landmarkId: 'mercy_hospital', now: 1001 }), /too_far_from_interior/);

const setPlayerAt = (x, z) => { player.x = hospital.x + x; player.z = hospital.z + z; };
setPlayerAt(-1.1, 0.7);
let acted = Interiors.action(state, { account, player, actionId: 'generator_switch', now: 1100 });
state = acted.state;
assert(state[account].interiors.mercy_hospital.flags.includes('emergency_power'));
assert.equal(player.lastNoiseAt, 1100, 'noisy interior power actions publish a server-owned sound source');
assert(player.noiseLevel >= 8);
assert.equal(acted.reward.length, 0);
setPlayerAt(2.4, 0);
let traversed = Interiors.traverse(state, { account, player, doorId: 'ward_door', now: 1200 });
state = traversed.state;
assert.equal(traversed.interior.roomId, 'ward_corridor');
setPlayerAt(6.1, 0.8);
acted = Interiors.action(state, { account, player, actionId: 'patient_chart', now: 1300 });
state = acted.state;
assert(state[account].interiors.mercy_hospital.flags.includes('incident_clue'));
setPlayerAt(4.8, -1.5);
traversed = Interiors.traverse(state, { account, player, doorId: 'pharmacy_door', now: 1400 });
state = traversed.state;
assert.equal(traversed.interior.roomId, 'pharmacy');
setPlayerAt(6.1, -6.2);
const before = player.inventory.meds;
acted = Interiors.action(state, { account, player, actionId: 'emergency_locker', now: 1500 });
state = acted.state;
assert(acted.reward.some(drop => drop.item === 'meds' && drop.amount > 0));
assert(player.inventory.meds > before);
assert(state[account].interiors.mercy_hospital.used.includes('emergency_locker'));
assert.throws(() => Interiors.action(state, { account, player, actionId: 'emergency_locker', now: 1600 }), /interior_action_unavailable/);

const reloaded = Interiors.normalize(JSON.parse(JSON.stringify(state)));
assert.equal(Interiors.publicState(reloaded, account).roomId, 'pharmacy');
assert(reloaded[account].interiors.mercy_hospital.flags.includes('emergency_power'));
const left = Interiors.leave(reloaded, { account, player, now: 1700 });
assert.equal(Interiors.publicState(left.state, account), null);

assert.equal(left.state[account].interiors.mercy_hospital.roomId, 'pharmacy');
player.x = hospital.x; player.z = hospital.z;
const reentered = Interiors.enter(left.state, { account, player, landmarkId: 'mercy_hospital', now: 1800 });
state = reentered.state;
assert.throws(() => Interiors.breachDoor(state, { account, landmarkId: 'mercy_hospital', doorId: 'pharmacy_door', damage: 100, now: 1900 }), /interior_door_secure/);
const depot = Interiors.LANDMARKS.north_bus_depot;
player.x = depot.x; player.z = depot.z;
state = Interiors.enter(state, { account, player, landmarkId: 'north_bus_depot', now: 1950 }).state;
for (let i = 0; i < 4; i++) {
  const breached = Interiors.breachDoor(state, { account, landmarkId: 'north_bus_depot', doorId: 'office_door', damage: 30, now: 2000 + i });
  state = breached.state;
}
assert(state[account].interiors.north_bus_depot.openedDoors.includes('office_door'), 'persistent breach progress eventually opens an ordinary door');
assert.equal(state[account].interiors.north_bus_depot.doorDamage.office_door, 100);


const wall = Collision.OBSTACLES.find(o => o.id === 'interior-wall:mercy_hospital:emergency_lobby:north:0');
assert(wall, 'interior wall collision is included in the static collision index');
assert(Collision.INTERIOR_OBSTACLE_IDS.includes(wall.id));
const doorBlocker = Collision.OBSTACLES.find(o => o.id === 'interior-door:mercy_hospital:ward_door:emergency_lobby');
assert(doorBlocker, 'closed doors block passage');
assert.equal(Collision.canTraverse(doorBlocker.x, doorBlocker.z, doorBlocker.x, doorBlocker.z), false);
const doorIds = Collision.INTERIOR_OBSTACLE_IDS.filter(id => id.startsWith('interior-door:mercy_hospital:ward_door:'));
assert.equal(doorIds.length, 2);
assert(!doorIds.includes(Collision.pointBlocked(doorBlocker.x, doorBlocker.z, 0, doorIds)?.id), 'opened door IDs are removed from collision queries even when other nearby geometry remains');

console.log('Homefront server-authoritative interior persistence, loot, and collision tests passed');
