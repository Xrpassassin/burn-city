'use strict';
const assert = require('assert');
const Core = require('../server/homefront-core');

function damagedBase(owner, role = 'mechanic', morale = 100) {
  const base = Core.createBase(owner, 1000);
  base.survivors.push({ id: 'survivor-1', name: 'Rook', role, morale, stats: { engineering: 5, combat: 5 } });
  base.structures.push(
    { id: 'wall-worse', type: 'wall', hp: 30, maxHp: 100, x: 8, z: 0 },
    { id: 'wall-better', type: 'wall', hp: 80, maxHp: 100, x: 6, z: 0 }
  );
  return base;
}

// Mechanics now physically repair the most damaged structure during a work shift.
let base = damagedBase('mechanic-repair');
const woodBefore = base.resources.wood;
const scrapBefore = base.resources.scrap;
base = Core.applyAction(base, 'mechanic-repair', { type: 'workday' }, 2000);
assert.equal(base.structures.find(s => s.id === 'wall-worse').hp, 42,
  'an inspired mechanic restores 12 HP to the most damaged structure');
assert.equal(base.structures.find(s => s.id === 'wall-better').hp, 80,
  'repairs prioritize the structure with the lowest remaining health ratio');
assert.equal(base.resources.wood, woodBefore - 1, 'repair consumes one wood for this repair budget');
assert.equal(base.resources.scrap, scrapBefore - 1, 'repair consumes one scrap for this repair budget');
assert.ok(base.log.at(-1).text.includes('12 structure HP'), 'workday log reports tangible repairs');

// Without a mechanic, a work shift must not repair structures or spend repair materials.
let noMechanic = damagedBase('no-mechanic', 'guard');
const noMechanicWood = noMechanic.resources.wood;
const noMechanicScrap = noMechanic.resources.scrap;
noMechanic = Core.applyAction(noMechanic, 'no-mechanic', { type: 'workday' }, 2000);
assert.equal(noMechanic.structures.find(s => s.id === 'wall-worse').hp, 30);
assert.equal(noMechanic.resources.wood, noMechanicWood);
assert.equal(noMechanic.resources.scrap, noMechanicScrap);

// Low morale reduces repair output, making settlement morale operationally meaningful.
let exhausted = damagedBase('exhausted-mechanic', 'mechanic', 10);
exhausted = Core.applyAction(exhausted, 'exhausted-mechanic', { type: 'workday' }, 2000);
assert.equal(exhausted.structures.find(s => s.id === 'wall-worse').hp, 35,
  'a deeply demoralized mechanic restores less structure HP than a motivated mechanic');

// Mechanics cannot repair for free when either required material is unavailable.
let shortOnWood = damagedBase('short-on-wood');
shortOnWood.resources.wood = 0;
shortOnWood = Core.applyAction(shortOnWood, 'short-on-wood', { type: 'workday' }, 2000);
assert.equal(shortOnWood.structures.find(s => s.id === 'wall-worse').hp, 30);
assert.equal(shortOnWood.resources.scrap, 30);

// Mechanics can restore a breached structure from zero HP, reopening a repair path after a siege.
let breached = damagedBase('breached-repair');
breached.structures[0].hp = 0;
breached = Core.applyAction(breached, 'breached-repair', { type: 'workday' }, 2000);
assert.equal(breached.structures.find(s => s.id === 'wall-worse').hp, 12,
  'a mechanic begins rebuilding a destroyed structure before topping up healthier defenses');
assert.equal(breached.structures.find(s => s.id === 'wall-better').hp, 80);

console.log('Homefront mechanic work-shift repair regressions passed.');
