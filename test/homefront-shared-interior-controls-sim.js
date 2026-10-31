'use strict';
const assert = require('node:assert/strict');
const Interiors = require('../server/homefront-interiors');
const World = require('../server/homefront-world');
const Inventory = require('../server/homefront-inventory');
const now = 1_810_000_000_000;

let privateStates = {}, shared = Interiors.normalizeShared(null);
const a = { x: 24, z: 30, inventory: Inventory.normalize({}) };
const b = { x: 24, z: 30, inventory: Inventory.normalize({}) };
privateStates = Interiors.enter(privateStates, { account: 'alice', player: a, landmarkId: 'mercy_hospital', now }).state;
privateStates = Interiors.enter(privateStates, { account: 'bob', player: b, landmarkId: 'mercy_hospital', now }).state;
assert.equal(Interiors.publicState(privateStates, 'bob', shared).flags.includes('emergency_power'), false);
a.x = 22.9; a.z = 30.7;
const powered = Interiors.action(privateStates, { account: 'alice', player: a, actionId: 'generator_switch', now: now + 1, shared });
privateStates = powered.state; shared = powered.shared;
assert.deepEqual(shared.mercy_hospital.flags, ['emergency_power']);
assert.ok(Interiors.publicState(privateStates, 'bob', shared).flags.includes('emergency_power'),
  'the second player sees the same powered building');
assert.ok(!privateStates.bob.interiors.mercy_hospital.used.includes('generator_switch'),
  'shared environmental power must not copy personal quest action progress');
assert.deepEqual(Interiors.publicState(privateStates, 'alice', shared).flags.includes('emergency_power'), true);

// Bob moves through the powered ward corridor into the pharmacy even though he
// has not individually activated the generator.
b.x = 26.4; b.z = 30;
let door = Interiors.traverse(privateStates, { account: 'bob', player: b, doorId: 'ward_door', now: now + 2, shared });
privateStates = door.state; shared = door.shared;
assert.ok(shared.mercy_hospital.openedDoors.includes('ward_door'),
  'an unlocked building door stays physically open for both clients');
b.x = 28.8; b.z = 28.5;
door = Interiors.traverse(privateStates, { account: 'bob', player: b, doorId: 'pharmacy_door', now: now + 3, shared });
privateStates = door.state; shared = door.shared;
assert.equal(privateStates.bob.interiors.mercy_hospital.roomId, 'pharmacy');
assert.ok(shared.mercy_hospital.openedDoors.includes('pharmacy_door'),
  'powered pharmacy entry is a shared door');
const aliceView = Interiors.publicState(privateStates, 'alice', shared);
assert.ok(aliceView.openedDoors.includes('pharmacy_door'));
assert.equal(aliceView.roomId, 'emergency_lobby', 'other players cannot move your character into their room');

const saved = Interiors.normalizeShared(JSON.parse(JSON.stringify(shared)));
assert.deepEqual(saved.mercy_hospital.openedDoors.sort(), ['pharmacy_door', 'ward_door'].sort());
assert.deepEqual(saved.mercy_hospital.flags, ['emergency_power']);
const poisoned = Interiors.normalizeShared({
  mercy_hospital: { flags: ['emergency_power','invented_admin_access'], openedDoors: ['ward_door','invented_teleport_door'], updatedAt: now },
  __proto__: { flags: ['power_cut'] },
  forged_room: { flags: ['power_cut'], openedDoors: ['all'], updatedAt: now }
});
assert.deepEqual(poisoned.mercy_hospital.flags, ['emergency_power'], 'only catalog power flags persist');
assert.deepEqual(poisoned.mercy_hospital.openedDoors, ['ward_door'], 'only real catalog doors persist');
assert.equal(poisoned.forged_room, undefined, 'non-catalog buildings never become world mechanisms');

// Server-world collision and snapshots consume the same authoritative state.
let world = World.enter(World.defaultWorld(), 'alice', now).world;
world = World.enter(world, 'bob', now).world;
world.players.alice.x = a.x; world.players.alice.z = a.z;
world.players.bob.x = b.x; world.players.bob.z = b.z;
world.interiors = privateStates;
world.sharedInteriors = shared;
const aSnapshot = World.snapshot(world, 'alice', now + 4);
const bSnapshot = World.snapshot(world, 'bob', now + 4);
assert.equal(aSnapshot.interiorInstance.id, bSnapshot.interiorInstance.id);
assert.deepEqual(aSnapshot.interiorInstance.mechanisms.flags, ['emergency_power']);
assert.deepEqual(bSnapshot.interiorInstance.mechanisms.openedDoors.sort(), ['pharmacy_door','ward_door'].sort());
assert.ok(bSnapshot.interior.flags.includes('emergency_power'));
assert.ok(Interiors.sharedOpenedDoors(shared, 'mercy_hospital', []).includes('pharmacy_door'));
assert.equal(Interiors.publicState(privateStates, 'unknown', shared), null,
  'unauthenticated users never gain room access from public environmental state');

// Restart/serialization cannot reset shared infrastructure.
const revived = World.normalizeWorld(JSON.parse(JSON.stringify(world)));
assert.ok(revived.sharedInteriors.mercy_hospital.openedDoors.includes('pharmacy_door'));
assert.equal(World.snapshot(revived, 'alice', now + 4).interiorInstance.mechanisms.flags[0], 'emergency_power');
console.log('Homefront shared power and opened-door instance tests passed.');
