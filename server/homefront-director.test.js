'use strict';
const assert = require('node:assert/strict');
const { ARCHETYPES, resolveDirectorLoot } = require('./homefront-director');

assert.equal(ARCHETYPES.research_lab.special, 'Containment Warden');
const quiet = resolveDirectorLoot({ event: 'quiet', zoneId: 'research_lab', risk: 5, seed: 1 });
assert.equal(quiet.enemy, null);
assert.equal(quiet.scrap, 0);
const wandering = resolveDirectorLoot({ event: 'wandering_infected', zoneId: 'hospital', risk: 3, seed: 42 });
assert.equal(wandering.enemy, 'Pale Orderly');
assert.equal(wandering.quality, null);
assert.equal(wandering.scrap, 0);
const ambush = resolveDirectorLoot({ event: 'special_infected', zoneId: 'industrial', risk: 4, rewardMultiplier: 1.55, combatPower: 4, seed: 99 });
assert.equal(ambush.enemy, 'Ironhide Brute');
assert.ok(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].includes(ambush.quality));
assert.ok(ambush.scrap > 0 && ambush.embers >= 0);
assert.deepEqual(
  resolveDirectorLoot({ event: 'infected_horde', zoneId: 'subway', risk: 5, rewardMultiplier: 2.35, combatPower: 5, seed: 77 }),
  resolveDirectorLoot({ event: 'infected_horde', zoneId: 'subway', risk: 5, rewardMultiplier: 2.35, combatPower: 5, seed: 77 }),
  'loot generation is deterministic for the same encounter seed'
);
console.log('Homefront Director archetypes and salvage tests passed.');

const { planHorde } = require('./homefront-director');
const quietPack = planHorde({ event: 'wandering_infected', risk: 4, seed: 'quiet' });
assert.equal(quietPack.count, 1, 'wandering infected remain a solo encounter');
const specialPack = planHorde({ event: 'special_infected', risk: 5, seed: 'boss' });
assert.equal(specialPack.members[0].role, 'leader', 'special infected receive a leader role');
const packA = planHorde({ event: 'infected_horde', risk: 5, seed: 'rail-yard' });
const packB = planHorde({ event: 'infected_horde', risk: 5, seed: 'rail-yard' });
assert.equal(packA.count, 4, 'high-risk horde plans use a bounded squad size');
assert.deepEqual(packA, packB, 'formation and role selection are deterministic');
assert.ok(new Set(packA.members.map(m => m.id)).size === packA.count, 'every planned squad member has a unique identity');
assert.ok(packA.members.some(m => m.role === 'flanker') && packA.members.some(m => m.role === 'bruiser'), 'hordes mix tactical roles');
assert.ok(packA.members.every(m => Number.isFinite(m.offsetX) && Number.isFinite(m.offsetZ)), 'all members receive finite formation offsets');
console.log('Homefront horde composition tests passed.');
