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
assert.ok(profile.defense - unguarded.defense >= profile.guardDefenseBonus,
  'guard assignment contributes defense, in addition to its ammunition commitment');
assert.ok(profile.projectedStructureDamage <= unguarded.projectedStructureDamage,
  'guards cannot increase projected structure damage');

const result = Core.applyAction(base, 'rGuardDefense', { type: 'defend' }, now + 1);
const defenseLog = result.log[result.log.length - 1];
assert.equal(defenseLog.kind, 'defense');
assert.match(defenseLog.text, /2 guard\(s\) contributed 3\.5 defense strength/,
  'the authoritative defense report explains the guards contribution');
assert.equal(result.survivors.filter(s => s.role === 'guard').length, 2);
// Guards also cover an already-damaged perimeter during an actual defend action.
const breachBase = Core.createBase('rGuardBreachCover', now);
breachBase.resources.ammo = 30;
breachBase.structures = [{ id: 'b1', type: 'gate', hp: 90, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
breachBase.survivors = Array.from({ length: 1 }, (_, i) => ({
  id: 'breach-guard-' + i, name: 'Guard ' + i, role: 'guard', morale: 100
}));
const expectedRawDamage = Core.threatProfile(breachBase).projectedStructureDamage;
const defended = Core.applyAction(breachBase, 'rGuardBreachCover', { type: 'defend' }, now + 2);
const breachLog = defended.log[defended.log.length - 1].text;
const actualDamageMatch = breachLog.match(/with (\d+) structure damage/);
assert.ok(actualDamageMatch, 'defense log reports actual mitigated structure damage');
assert.ok(Number(actualDamageMatch[1]) < expectedRawDamage,
  'high-morale guards reduce damage while covering a damaged gate');
assert.match(breachLog, /reduced perimeter damage by 6%/,
  'guard cover is capped at 25 percent');
assert.equal(defended.structures[0].hp, 90 - Number(actualDamageMatch[1]),
  'mitigated siege damage is applied to the real structure state');


 // A damaged structure deeper inside the yard must not grant cover if the outermost
 // siege target is still intact. The server uses the same deterministic target order
 // for damage and guard cover, rather than treating any damaged defense as cover.
 const layeredBase = Core.createBase('rGuardLayered', now);
 layeredBase.resources.ammo = 30;
 layeredBase.structures = [
   { id: 'outer-wall', type: 'wall', hp: 100, maxHp: 100, x: 9, z: 0, rotation: 0, trenchLevel: 0, manned: false },
   { id: 'inner-gate', type: 'gate', hp: 90, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }
 ];
 layeredBase.survivors = [{ id: 'layer-guard', name: 'Guard', role: 'guard', morale: 100 }];
 const layeredRawDamage = Core.threatProfile(layeredBase).projectedStructureDamage;
 const layeredResult = Core.applyAction(layeredBase, 'rGuardLayered', { type: 'defend' }, now + 3);
 const layeredLog = layeredResult.log[layeredResult.log.length - 1].text;
 const layeredDamageMatch = layeredLog.match(/with (\d+) structure damage/);
 assert.ok(layeredDamageMatch, 'layered defense log reports actual structure damage');
 assert.equal(Number(layeredDamageMatch[1]), layeredRawDamage,
   'guards do not mitigate damage to an intact outer target because another structure is damaged deeper inside');
 assert.doesNotMatch(layeredLog, /reduced perimeter damage/,
   'cover is not reported when the actual first target is intact');


 // The defense result should expose a useful, deterministic condition for the priority
 // target so the UI can later render matching damage states without guessing locally.
 const integrityBase = Core.createBase('rGuardIntegrity', now);
 integrityBase.resources.ammo = 30;
 integrityBase.structures = [{ id: 'outer-gate', type: 'gate', hp: 20, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
 const integrityResult = Core.applyAction(integrityBase, 'rGuardIntegrity', { type: 'defend' }, now + 4);
 const integrityLog = integrityResult.log[integrityResult.log.length - 1].text;
 assert.match(integrityLog, /Priority target gate outer-gate is (CRITICAL|BREACHED) \(\d+% integrity\)/,
   'defense reports priority-target condition and integrity after siege damage');


 const repairBase = Core.createBase('rGuardRepairReport', now);
 repairBase.structures = [{ id: 'repair-gate', type: 'gate', hp: 100, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
 const repaired = Core.applyAction(repairBase, 'rGuardRepairReport', { type: 'repair', target: 'repair-gate' }, now + 5);
 const repairLog = repaired.log[repaired.log.length - 1].text;
 assert.match(repairLog, /Repaired gate repair-gate: \+50 HP \(83% integrity\)/,
   'repair logs report restored HP and the resulting structure integrity');
 assert.equal(repaired.structures[0].hp, 150, 'repair outcome is persisted in authoritative structure HP');


const emergencyBase = Core.createBase('rGuardEmergencyRepair', now);
emergencyBase.resources.wood = 8;
emergencyBase.resources.scrap = 4;
emergencyBase.structures = [{ id: 'breached-gate', type: 'gate', hp: 0, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
const emergencyResult = Core.applyAction(emergencyBase, 'rGuardEmergencyRepair', { type: 'emergency_repair', target: 'breached-gate' }, now + 6);
assert.equal(emergencyResult.structures[0].hp, 100, 'emergency repair reopens a destroyed gate with 100 HP');
assert.equal(emergencyResult.resources.wood, 4, 'emergency repair spends four wood');
assert.equal(emergencyResult.resources.scrap, 2, 'emergency repair spends two scrap');
assert.match(emergencyResult.log[emergencyResult.log.length - 1].text, /Emergency repair: gate breached-gate restored \+100 HP \(56% integrity\)/,
  'emergency repair reports the restored integrity');
assert.throws(() => Core.applyAction({ ...emergencyBase, structures: [{ ...emergencyBase.structures[0], type: 'garden' }] }, 'rGuardEmergencyRepair', { type: 'emergency_repair', target: 'breached-gate' }, now + 7), /not_a_defensive_structure/);

console.log('Homefront authoritative guard-defense regressions passed.');
