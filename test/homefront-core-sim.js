'use strict';
const assert = require('node:assert/strict');
const H = require('../server/homefront-core');
const a = H.createBase('acct-a', 1000);
assert.equal(a.owner, 'acct-a');
assert.equal(a.resources.wood, 40);
assert.equal(a.visibility, 'private', 'new refuges are private by default');
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'visibility', value: 'world' }), /invalid_visibility/);
const publicBase = H.applyAction(a, 'acct-a', { type: 'visibility', value: 'public' }, 1050);
assert.equal(publicBase.visibility, 'public');
assert.equal(H.validateBase({ ...publicBase, visibility: 'invalid' }, 'acct-a').visibility, 'private', 'unknown visibility values fail closed');
assert.throws(() => H.applyAction(a, 'acct-b', { type: 'build', building: 'wall' }), /invalid_or_foreign_base/);
const wall = H.applyAction(a, 'acct-a', { type: 'build', building: 'wall' }, 1100);
assert.equal(wall.structures.length, 1);
assert.equal(wall.structures[0].type, 'wall');
assert.equal(wall.resources.wood, 32);
assert.ok(Number.isFinite(wall.structures[0].x) && Number.isFinite(wall.structures[0].z));
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: wall.structures[0].x, z: wall.structures[0].z }), /placement_occupied/);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: 11, z: 0 }), /placement_out_of_bounds/);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: 0, z: 0 }), /placement_occupied/);
assert.equal(wall.revision, a.revision + 1);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'not-a-building' }), /unknown_building/);
const tower = H.applyAction(wall, 'acct-a', { type: 'build', building: 'watchtower' });
assert.equal(tower.structures.at(-1).type, 'watchtower');
let expedition = H.applyAction(tower, 'acct-a', { type: 'expedition' }, 1200);
assert.equal(expedition.expeditionCount, 1);
assert.equal(expedition.resources.food, 22);
assert.equal(expedition.resources.ammo, 17);
assert.ok(expedition.resources.scrap >= tower.resources.scrap);
assert.ok(expedition.resources.wood >= tower.resources.wood);
expedition.resources.food = 1000; expedition.resources.ammo = 1000;
for (let i = 0; i < 100 && expedition.survivors.length === 0; i++) expedition = H.applyAction(expedition, 'acct-a', { type: 'expedition' });
assert.ok(expedition.survivors.length > 0, 'seeded expeditions can recruit survivors');
const survivor = expedition.survivors[0];
expedition = H.applyAction(expedition, 'acct-a', { type: 'assign', survivorId: survivor.id, role: 'farmer' });
assert.equal(expedition.survivors[0].role, 'farmer');
expedition = H.applyAction(expedition, 'acct-a', { type: 'build', building: 'garden' });
const beforeFood = expedition.resources.food;
expedition = H.applyAction(expedition, 'acct-a', { type: 'workday' });
assert.ok(expedition.resources.food >= beforeFood - 1, 'farmer and garden contribute food after upkeep');
// Zombie breach composition escalates deterministically and introduces a boss every tenth wave.
const waveOne = H.waveProfile(1);
assert.equal(waveOne.boss, false);
assert.deepEqual(waveOne.enemies.map(x => x.type), ['walker']);
const waveTen = H.waveProfile(10);
assert.equal(waveTen.boss, true, 'every tenth breach includes a juggernaut');
assert.ok(waveTen.enemies.some(x => x.type === 'runner'), 'later waves add runners');
assert.ok(waveTen.enemies.some(x => x.type === 'brute'), 'later waves add armored brutes');
assert.ok(waveTen.enemies.some(x => x.type === 'screamer'), 'later waves add screamers');
assert.ok(waveTen.enemies.some(x => x.type === 'bloater'), 'later waves add bloaters');
assert.ok(waveTen.threatBonus > H.waveProfile(1).threatBonus, 'special enemy mix raises breach pressure');
assert.deepEqual(H.waveProfile(10), H.waveProfile(10), 'the same wave always produces the same profile');

// A campfire rally trades food for a server-authoritative morale recovery.
const rallyBase = H.createBase('rally-test', 2040);
rallyBase.resources.food = 10;
rallyBase.survivors = [
  { id: 's1', name: 'Mara', role: 'guard', morale: 10 },
  { id: 's2', name: 'Rook', role: 'farmer', morale: 90 },
  { id: 's3', name: 'Tess', role: 'idle', morale: 100 }
];
const rallied = H.applyAction(rallyBase, 'rally-test', { type: 'rally' }, 2041);
assert.equal(rallied.resources.food, 6, 'rally consumes four food');
assert.deepEqual(rallied.survivors.map(s => s.morale), [25, 100, 100], 'rally raises morale by up to fifteen without exceeding one hundred');
assert.throws(() => H.applyAction({ ...rallyBase, resources: { ...rallyBase.resources, food: 3 } }, 'rally-test', { type: 'rally' }), /rally_food_required/);
assert.throws(() => H.applyAction({ ...rallyBase, survivors: rallyBase.survivors.map(s => ({ ...s, morale: 100 })) }, 'rally-test', { type: 'rally' }), /morale_already_max/);
assert.throws(() => H.applyAction({ ...rallyBase, survivors: [] }, 'rally-test', { type: 'rally' }), /no_survivors_to_rally/);

// Guard morale changes defensive strength against the same first breach.
const steadyGuards = H.createBase('steady-guards', 2050);
steadyGuards.survivors = [{ id: 'g1', name: 'Rook', role: 'guard', morale: 90 }];
const shakenGuards = H.createBase('shaken-guards', 2050);
shakenGuards.survivors = [{ id: 'g1', name: 'Rook', role: 'guard', morale: 10 }];
const steadyDefense = H.applyAction(steadyGuards, 'steady-guards', { type: 'defend' });
const shakenDefense = H.applyAction(shakenGuards, 'shaken-guards', { type: 'defend' });
assert.ok(steadyDefense.baseHp > shakenDefense.baseHp, 'high-morale guards preserve more refuge integrity');

// Storage sheds improve scavenger output; destroyed sheds do not contribute.
const scavengerBase = H.createBase('scavenger-test', 2100);
scavengerBase.resources.food = 100;
scavengerBase.survivors = [{ id: 's1', name: 'Rook', role: 'scavenger', morale: 60 }];
const scavengerPlain = H.applyAction(scavengerBase, 'scavenger-test', { type: 'workday' });
const scavengerWithStorage = { ...scavengerBase, structures: [{ id: 'b1', type: 'storage', hp: 100, maxHp: 100, x: 4, z: 4 }] };
const scavengerStored = H.applyAction(scavengerWithStorage, 'scavenger-test', { type: 'workday' });
assert.ok(scavengerStored.resources.scrap > scavengerPlain.resources.scrap, 'an intact storage shed boosts scavenger scrap output');
const scavengerWithBrokenStorage = { ...scavengerBase, structures: [{ id: 'b1', type: 'storage', hp: 0, maxHp: 100, x: 4, z: 4 }] };
const scavengerBroken = H.applyAction(scavengerWithBrokenStorage, 'scavenger-test', { type: 'workday' });
assert.equal(scavengerBroken.resources.scrap, scavengerPlain.resources.scrap, 'destroyed storage gives no scavenging bonus');

// Morale changes actual production, so survivor care has a gameplay consequence.
const rested = H.createBase('rested', 2000);
rested.resources.food = 100;
rested.survivors = [{ id: 's1', name: 'Mara', role: 'farmer', morale: 90 }];
const tired = H.createBase('tired', 2000);
tired.resources.food = 100;
tired.survivors = [{ id: 's1', name: 'Mara', role: 'farmer', morale: 10 }];
const restedShift = H.applyAction(rested, 'rested', { type: 'workday' });
const tiredShift = H.applyAction(tired, 'tired', { type: 'workday' });
assert.ok(restedShift.resources.food > tiredShift.resources.food, 'high-morale workers produce more food than demoralized workers');
assert.ok(restedShift.resources.food >= 100 && tiredShift.resources.food >= 100, 'work shift charges upkeep before production');

const damaged = H.applyAction(expedition, 'acct-a', { type: 'defend' });
assert.equal(damaged.wave, 1);
assert.ok(damaged.baseHp <= damaged.baseMaxHp);
const damagedBase = { ...damaged, baseHp: 200 };
const repaired = H.applyAction(damagedBase, 'acct-a', { type: 'repair', target: 'base' });
assert.equal(repaired.baseHp, 275);
assert.throws(() => H.applyAction({ ...a, owner: 'acct-b' }, 'acct-a', { type: 'workday' }), /invalid_or_foreign_base/);
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'build', building: '../pause.json' }), /unknown_building/);
const corrupted = { ...a, resources: { wood: -500, scrap: Infinity, food: 1, meds: 0, ammo: 0 } };
const normalized = H.validateBase(corrupted, 'acct-a');
assert.equal(normalized.resources.wood, 0);
assert.equal(normalized.resources.scrap, 0);
console.log('Zombie Homefront settlement core simulation passed.');
