// Focused settlement-economy regression checks. Kept standalone until Hark reconciles the active Homefront branches and wires this into test:homefront.
'use strict';

const assert = require('node:assert/strict');
const H = require('../server/homefront-core');

function baseWithSurvivors(owner, survivors, resources = {}) {
  const base = H.createBase(owner, 1000);
  base.survivors = survivors.map((s, i) => ({
    id: s.id || 'survivor-' + i,
    name: s.name || 'Survivor ' + i,
    role: s.role || 'idle',
    morale: s.morale ?? 70
  }));
  Object.assign(base.resources, resources);
  return base;
}

// Same authoritative snapshot and action produce the same resource/day/morale result.
{
  const seed = baseWithSurvivors('economy-determinism', [
    { role: 'farmer', morale: 90 },
    { role: 'scavenger', morale: 70 },
    { role: 'mechanic', morale: 30 },
    { role: 'medic', morale: 90 }
  ]);
  seed.structures = [
    { id: 'b1', type: 'garden', hp: 70, x: 3, z: 0, rotation: 0 },
    { id: 'b2', type: 'storage', hp: 100, x: 5, z: 0, rotation: 0 },
    { id: 'b3', type: 'workshop', hp: 120, x: 7, z: 0, rotation: 0 },
    { id: 'b4', type: 'infirmary', hp: 100, x: 8, z: 2, rotation: 0 }
  ];
  const a = H.applyAction(seed, 'economy-determinism', { type: 'workday' }, 1001);
  const b = H.applyAction(seed, 'economy-determinism', { type: 'workday' }, 1001);
  for (const key of ['day', 'level']) assert.equal(a[key], b[key], key + ' is deterministic');
  for (const key of ['wood', 'scrap', 'food', 'water', 'meds', 'ammo', 'seeds']) {
    assert.equal(a.resources[key], b.resources[key], key + ' is deterministic');
  }
  assert.deepEqual(a.survivors.map(s => s.morale), b.survivors.map(s => s.morale));
  assert.equal(a.log.at(-1).text, b.log.at(-1).text);
}

// Intact production facilities contribute; destroyed facilities do not.
{
  const workers = [
    { role: 'farmer', morale: 90 },
    { role: 'scavenger', morale: 90 },
    { role: 'mechanic', morale: 90 },
    { role: 'medic', morale: 90 }
  ];
  const intact = baseWithSurvivors('intact-facilities', workers, { food: 50, scrap: 0, meds: 0 });
  intact.farmPlots = [];
  intact.structures = [
    { id: 'b1', type: 'garden', hp: 70, x: 3, z: 0, rotation: 0 },
    { id: 'b2', type: 'storage', hp: 100, x: 5, z: 0, rotation: 0 },
    { id: 'b3', type: 'workshop', hp: 120, x: 7, z: 0, rotation: 0 },
    { id: 'b4', type: 'infirmary', hp: 100, x: 8, z: 2, rotation: 0 }
  ];
  const damaged = JSON.parse(JSON.stringify(intact));
  for (const structure of damaged.structures) structure.hp = 0;
  const good = H.applyAction(intact, 'intact-facilities', { type: 'workday' }, 1002);
  const poor = H.applyAction(damaged, 'intact-facilities', { type: 'workday' }, 1002);
  assert.ok(good.resources.food > poor.resources.food, 'intact garden improves food output');
  assert.ok(good.resources.scrap > poor.resources.scrap, 'intact storage/workshop improve scrap output');
  assert.ok(good.resources.meds > poor.resources.meds, 'intact infirmary enables medic output');
}

// Failed work shifts must not mutate the caller's saved snapshot.
{
  const short = baseWithSurvivors('short-rations', [
    { role: 'farmer', morale: 40 },
    { role: 'guard', morale: 40 },
    { role: 'medic', morale: 40 },
    { role: 'mechanic', morale: 40 }
  ], { food: 0 });
  const before = JSON.stringify(short);
  assert.throws(() => H.applyAction(short, 'short-rations', { type: 'workday' }), /not_enough_food_for_shift/);
  assert.equal(JSON.stringify(short), before, 'failed work shift leaves input state unchanged');
}

// Unknown/foreign survivor IDs and invalid roles fail without changing the input state.
{
  const base = baseWithSurvivors('assignment-validation', [{ id: 'owned-survivor', role: 'guard' }]);
  const before = JSON.stringify(base);
  assert.throws(() => H.applyAction(base, 'assignment-validation', {
    type: 'assign', survivorId: 'not-owned', role: 'medic'
  }), /unknown_survivor/);
  assert.throws(() => H.applyAction(base, 'assignment-validation', {
    type: 'assign', survivorId: 'owned-survivor', role: 'admin'
  }), /unknown_role/);
  assert.equal(JSON.stringify(base), before, 'rejected assignments leave input state unchanged');
}

// Resource totals and morale remain bounded across a full roster and repeated shifts.
{
  const base = baseWithSurvivors('economy-bounds', Array.from({ length: H.MAX_SURVIVORS }, (_, i) => ({
    id: 'worker-' + i,
    role: ['farmer', 'scavenger', 'mechanic', 'medic', 'guard', 'idle'][i % 6],
    morale: i % 2 ? 0 : 100
  })), { food: 999999, scrap: 999999, meds: 999999 });
  base.structures = [
    { id: 'b1', type: 'garden', hp: 70, x: 3, z: 0, rotation: 0 },
    { id: 'b2', type: 'storage', hp: 100, x: 5, z: 0, rotation: 0 },
    { id: 'b3', type: 'workshop', hp: 120, x: 7, z: 0, rotation: 0 },
    { id: 'b4', type: 'infirmary', hp: 100, x: 8, z: 2, rotation: 0 }
  ];
  let state = base;
  for (let i = 0; i < 20; i++) {
    state = H.applyAction(state, 'economy-bounds', { type: 'workday' }, 1100 + i);
    for (const [resource, value] of Object.entries(state.resources)) {
      if (typeof value === 'number') assert.ok(value >= 0 && value <= 999999, resource + ' stays bounded');
    }
    for (const survivor of state.survivors) assert.ok(survivor.morale >= 0 && survivor.morale <= 100);
  }
}

console.log('Homefront survivor economy checks passed.');
