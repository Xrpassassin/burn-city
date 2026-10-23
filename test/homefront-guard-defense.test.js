// Server-authoritative Homefront guard defense regressions.
'use strict';
const assert = require('assert');
const Core = require('../server/homefront-core');

const now = 1800000000000;
const base = Core.createBase('rGuardDefense', now);
base.survivors = [
  { id: 'g1', name: 'Mara', role: 'guard', morale: 100 },
  { id: 'g2', name: 'Rook', role: 'guard', morale: 10 },
  { id: 'm1', name: 'Tess', role: 'medic', morale: 80 }
];
const profile = Core.threatProfile(base);
// High morale guard = 1.25 strength; very low morale guard = 0.5. Each strength adds 2 defense.
assert.equal(profile.guardDefenseBonus, 3.5);
assert.equal(profile.guards, 2);
const withoutGuards = JSON.parse(JSON.stringify(base));
withoutGuards.survivors = withoutGuards.survivors.filter(s => s.role !== 'guard');
const unguarded = Core.threatProfile(withoutGuards);
assert.equal(profile.defense - unguarded.defense, 3.5);
assert.ok(profile.projectedStructureDamage <= unguarded.projectedStructureDamage,
  'guards cannot increase projected structure damage');

const result = Core.applyAction(base, 'rGuardDefense', { type: 'defend' }, now + 1);
const defenseLog = result.log[result.log.length - 1];
assert.equal(defenseLog.kind, 'defense');
assert.match(defenseLog.text, /2 guard\(s\) contributed 3\.5 defense strength/,
  'the authoritative defense report explains the guards contribution');
assert.equal(result.survivors.filter(s => s.role === 'guard').length, 2);
console.log('Homefront authoritative guard-defense regressions passed.');
