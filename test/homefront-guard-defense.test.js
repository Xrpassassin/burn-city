// Server-authoritative Homefront guard defense regressions.
'use strict';
const assert = require('assert');
const Core = require('../server/homefront-core');

const now = 1800000000000;
const base = Core.createBase('rGuardDefense', now);
base.survivors = [
  { id: 'g1', name: 'Mara', role: 'guard', morale: 100, stats: { combat: 5 } },
  { id: 'g2', name: 'Rook', role: 'guard', morale: 10, stats: { combat: 5 } },
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
assert.equal(result.lastSiege.status, 'repelled', 'each defense action persists a resolved siege incident');
assert.deepEqual(result.lastSiege.phases.map(phase => phase.phase), ['warning', 'guard_response', 'repelled'],
  'incident history records warning, guard response, and resolution in order');
assert.equal(result.lastSiege.guardCount, 2, 'after-action report captures the responding guard count');
assert.equal(result.lastSiege.refugeHpAfter, result.baseHp, 'after-action report matches authoritative refuge health');
assert.ok(result.log.some(item => item.kind === 'siege_warning'), 'the server records the siege warning');
assert.ok(result.log.some(item => item.kind === 'guard_response'), 'the server records guard response');
// Guards also cover an already-damaged perimeter during an actual defend action.
const breachBase = Core.createBase('rGuardBreachCover', now);
breachBase.resources.ammo = 30;
breachBase.structures = [{ id: 'b1', type: 'gate', hp: 90, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
breachBase.survivors = Array.from({ length: 1 }, (_, i) => ({
  id: 'breach-guard-' + i, name: 'Guard ' + i, role: 'guard', morale: 100, stats: { combat: 5 }
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
assert.equal(defended.lastSiege.target.id, 'b1', 'incident records the actual siege priority target');
assert.equal(defended.lastSiege.target.integrityBefore, 50, 'incident records target integrity before the attack');
assert.equal(defended.lastSiege.target.integrityAfter, Math.round(defended.structures[0].hp / 180 * 100),
  'incident records target integrity after the attack');


 // A damaged structure deeper inside the yard must not grant cover if the outermost
 // siege target is still intact. The server uses the same deterministic target order
 // for damage and guard cover, rather than treating any damaged defense as cover.
 const layeredBase = Core.createBase('rGuardLayered', now);
 layeredBase.resources.ammo = 30;
 layeredBase.structures = [
   { id: 'outer-wall', type: 'wall', hp: 100, maxHp: 100, x: 9, z: 0, rotation: 0, trenchLevel: 0, manned: false },
   { id: 'inner-gate', type: 'gate', hp: 90, maxHp: 180, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }
 ];
 layeredBase.survivors = [{ id: 'layer-guard', name: 'Guard', role: 'guard', morale: 100, stats: { combat: 5 } }];
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


const stagedSiege = Core.createBase('rGuardStagedSiege', now);
stagedSiege.resources.ammo = 30;
stagedSiege.structures = [{ id: 'staged-gate', type: 'gate', hp: 180, maxHp: 180, x: 9, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
const initialGateHp = stagedSiege.structures[0].hp;
const initialRefugeHp = stagedSiege.baseHp;
const warning = Core.applyAction(stagedSiege, 'rGuardStagedSiege', { type: 'start_siege' }, now + 7);
assert.equal(warning.lastSiege.status, 'incoming', 'starting a siege creates a pending incident');
assert.equal(warning.structures[0].hp, initialGateHp, 'the warning phase does not apply attack damage');
assert.equal(warning.baseHp, initialRefugeHp, 'the warning phase leaves refuge health unchanged');
assert.deepEqual(warning.lastSiege.phases.map(phase => phase.phase), ['warning', 'guard_response'],
  'warning and guard response are available before the player resolves the attack');
assert.throws(() => Core.applyAction(warning, 'rGuardStagedSiege', { type: 'start_siege' }, now + 8), /siege_already_active/,
  'a second siege cannot overwrite an unresolved incident');
const resolvedStagedSiege = Core.applyAction(warning, 'rGuardStagedSiege', { type: 'defend' }, now + 9);
assert.notEqual(resolvedStagedSiege.lastSiege.status, 'incoming', 'defending resolves the pending incident');
assert.deepEqual(resolvedStagedSiege.lastSiege.phases.map(phase => phase.phase).slice(0, 2), ['warning', 'guard_response'],
  'resolution preserves the original incident phases');
assert.equal(resolvedStagedSiege.lastSiege.startedAt, now + 7, 'incident preserves its original warning time');
assert.equal(resolvedStagedSiege.defenseCount, 1, 'starting and resolving one incident counts as one defense');

const guaranteedBreach = Core.createBase('rGuardIncidentBreach', now);
guaranteedBreach.resources.ammo = 30;
guaranteedBreach.structures = [{ id: 'outer-gate', type: 'gate', hp: 1, maxHp: 180, x: 9, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
const breachOutcome = Core.applyAction(guaranteedBreach, 'rGuardIncidentBreach', { type: 'defend' }, now + 8);
assert.equal(breachOutcome.lastSiege.status, 'breach_opened', 'a destroyed defensive target is recorded as an opened breach');
assert.equal(breachOutcome.lastSiege.target.integrityAfter, 0, 'breach report records zero target integrity');
assert.deepEqual(breachOutcome.lastSiege.breachedStructures, [{ id: 'outer-gate', type: 'gate' }],
  'after-action report identifies the exact structure that was breached');
assert.match(breachOutcome.lastSiege.phases[2].text, /breach opened at gate outer-gate/,
  'final incident phase explains the breach outcome');
assert.equal(Core.validateBase({ ...breachOutcome, lastSiege: undefined }, 'rGuardIncidentBreach').lastSiege, null,
  'older saves without incident history remain valid');


 // Persistent survivor behavior is server-authoritative and saved with each survivor.
 const behaviorBase = Core.createBase('rSurvivorBehavior', now);
 behaviorBase.structures = [{ id: 'behavior-gate', type: 'gate', hp: 80, maxHp: 180, x: 9, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
 behaviorBase.survivors = [
   { id: 'bg1', name: 'Mara', role: 'guard', morale: 80 },
   { id: 'bm1', name: 'Tess', role: 'mechanic', morale: 70 },
   { id: 'bd1', name: 'Ivo', role: 'medic', morale: 60 },
   { id: 'bf1', name: 'Nia', role: 'farmer', morale: 50 }
 ];
 const normalBehavior = Core.validateBase(behaviorBase, 'rSurvivorBehavior');
 assert.equal(normalBehavior.survivors.find(x => x.id === 'bg1').task, 'perimeter_watch');
 assert.equal(normalBehavior.survivors.find(x => x.id === 'bm1').task, 'maintain_structures');
 const behaviorWarning = Core.applyAction(normalBehavior, 'rSurvivorBehavior', { type: 'start_siege' }, now + 20);
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bg1').task, 'defend_perimeter');
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bg1').taskTarget, 'behavior-gate');
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bm1').task, 'emergency_repair');
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bm1').taskTarget, 'behavior-gate');
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bd1').task, 'triage_standby');
 assert.equal(behaviorWarning.survivors.find(x => x.id === 'bf1').task, 'take_shelter');
 const persistedBehavior = Core.validateBase(JSON.parse(JSON.stringify(behaviorWarning)), 'rSurvivorBehavior');
 assert.equal(persistedBehavior.survivors.find(x => x.id === 'bg1').task, 'defend_perimeter', 'siege response tasks survive save validation');
 assert.equal(persistedBehavior.survivors.find(x => x.id === 'bm1').taskUpdatedAt, now + 20, 'task change timestamps persist');
 const behaviorResolved = Core.applyAction(behaviorWarning, 'rSurvivorBehavior', { type: 'defend' }, now + 21);
 assert.equal(behaviorResolved.survivors.find(x => x.id === 'bg1').task, 'perimeter_watch', 'guards return to normal watch after resolution');
 assert.equal(behaviorResolved.survivors.find(x => x.id === 'bd1').task, 'infirmary_duty', 'medics return to infirmary duty after resolution');
 const oldBehaviorSave = Core.validateBase({ ...behaviorResolved, survivors: behaviorResolved.survivors.map(({ task, taskTarget, taskReason, taskUpdatedAt, ...survivor }) => survivor) }, 'rSurvivorBehavior');
 assert.equal(oldBehaviorSave.survivors.find(x => x.id === 'bg1').task, 'perimeter_watch', 'legacy saves receive safe default role behavior');

console.log('Homefront authoritative guard-defense regressions passed.');


// Recruited survivors receive stable, individual skill profiles that affect authoritative defense.
const statSeed = Core.createBase('rSurvivorStats', now);
statSeed.survivors = [
  { id: 'unique-a', name: 'Mara', role: 'guard', morale: 100 },
  { id: 'unique-b', name: 'Rook', role: 'guard', morale: 100 }
];
const normalizedStats = Core.validateBase(statSeed, 'rSurvivorStats');
const repeatedStats = Core.validateBase(JSON.parse(JSON.stringify(normalizedStats)), 'rSurvivorStats');
assert.deepEqual(normalizedStats.survivors.map(s => s.stats), repeatedStats.survivors.map(s => s.stats),
  'individual skill profiles remain stable across save/load validation');
for (const survivor of normalizedStats.survivors) {
  assert.deepEqual(Object.keys(survivor.stats), ['combat', 'scavenging', 'farming', 'medical', 'engineering', 'endurance'],
    'each survivor has the same six defined skill categories');
  assert.ok(Object.values(survivor.stats).every(value => Number.isInteger(value) && value >= 1 && value <= 10),
    'every generated skill stays within the 1–10 range');
}
assert.notDeepEqual(normalizedStats.survivors[0].stats, normalizedStats.survivors[1].stats,
  'different survivor IDs generate different individual profiles');
const clampedStats = Core.validateBase({
  ...statSeed,
  survivors: [{ id: 'bounded', name: 'Cal', role: 'guard', morale: 60, stats: { combat: 99, medical: -4, farming: 6 } }]
}, 'rSurvivorStats');
assert.equal(clampedStats.survivors[0].stats.combat, 10, 'saved stats above range are clamped');
assert.equal(clampedStats.survivors[0].stats.medical, 1, 'saved stats below range are clamped');
assert.equal(clampedStats.survivors[0].stats.farming, 6, 'valid saved skills are preserved');
const weakGuard = Core.validateBase({ ...statSeed, survivors: [{ id: 'guard-skill', name: 'Weak', role: 'guard', morale: 100, stats: { combat: 1 } }] }, 'rSurvivorStats');
const strongGuard = Core.validateBase({ ...statSeed, survivors: [{ id: 'guard-skill', name: 'Strong', role: 'guard', morale: 100, stats: { combat: 10 } }] }, 'rSurvivorStats');
assert.ok(Core.threatProfile(strongGuard).guardDefenseBonus > Core.threatProfile(weakGuard).guardDefenseBonus,
  'combat skill increases server-authoritative guard defense contribution');


// Material-tier upgrades are persistent, server-authoritative and preserve current integrity.
const materialBase = Core.createBase('rMaterialTiers', now);
materialBase.resources.stone = 40; materialBase.resources.steel = 30;
materialBase.structures = [{ id: 'material-wall', type: 'wall', material: 'wood', hp: 50, maxHp: 100, x: 8, z: 0, rotation: 0, trenchLevel: 0, manned: false }];
const stoneWall = Core.applyAction(materialBase, 'rMaterialTiers', { type: 'upgrade_structure_material', target: 'material-wall' }, now + 1);
assert.equal(stoneWall.structures[0].material, 'stone', 'wood structures can be upgraded to stone');
assert.equal(stoneWall.structures[0].maxHp, 175, 'stone tier increases maximum structural health');
assert.equal(stoneWall.structures[0].hp, 88, 'material upgrades preserve approximately the same integrity percentage');
assert.equal(stoneWall.resources.stone, 28, 'stone upgrade consumes its stone cost');
assert.equal(stoneWall.resources.scrap, 24, 'stone upgrade consumes its scrap cost');
const steelWall = Core.applyAction(stoneWall, 'rMaterialTiers', { type: 'upgrade_structure_material', target: 'material-wall' }, now + 2);
assert.equal(steelWall.structures[0].material, 'steel', 'stone structures can be upgraded to steel');
assert.equal(steelWall.structures[0].maxHp, 280, 'steel tier has the highest structural health');
assert.equal(steelWall.resources.steel, 12, 'steel upgrade consumes steel');
assert.throws(() => Core.applyAction(steelWall, 'rMaterialTiers', { type: 'upgrade_structure_material', target: 'material-wall' }, now + 3), /material_tier_maxed/);
const legacyMaterial = Core.validateBase({ ...materialBase, resources: { ...materialBase.resources, stone: undefined, steel: undefined }, structures: [{ id: 'legacy-wall', type: 'wall', hp: 60, maxHp: 100, x: 8, z: 0, rotation: 0 }] }, 'rMaterialTiers');
assert.equal(legacyMaterial.resources.stone, 0, 'legacy saves safely gain empty advanced-material inventories');
assert.equal(legacyMaterial.structures[0].material, 'wood', 'legacy structures default to the original wood tier');


// Facilities turn survivor labor into advanced materials through the authoritative workday.
const facilityBase = Core.createBase('rMaterialFacilities', now);
facilityBase.resources.food = 100;
facilityBase.resources.scrap = 30;
facilityBase.resources.stone = 20;
facilityBase.resources.steel = 0;
facilityBase.survivors = [
  { id: 'facility-mechanic', name: 'Ivo', role: 'mechanic', morale: 100, stats: { engineering: 10 } },
  { id: 'facility-scavenger', name: 'June', role: 'scavenger', morale: 100, stats: { scavenging: 10 } }
];
facilityBase.structures = [
  { id: 'q1', type: 'quarry', material: 'wood', hp: 140, maxHp: 140, x: 7, z: 0 },
  { id: 's1', type: 'smelter', material: 'wood', hp: 160, maxHp: 160, x: -7, z: 0 },
  { id: 's2', type: 'smelter', material: 'wood', hp: 160, maxHp: 160, x: -5, z: 0 },
  { id: 'sy1', type: 'salvage_yard', material: 'wood', hp: 130, maxHp: 130, x: 0, z: 7 }
];
const facilityShift = Core.applyAction(facilityBase, 'rMaterialFacilities', { type: 'workday' }, now + 20);
assert.ok(facilityShift.resources.stone < 20, 'smelter consumes stone as an industrial input after quarry production');
assert.ok(facilityShift.resources.steel > 0, 'smelter produces steel from stored scrap and stone');
assert.ok(facilityShift.resources.scrap < 30, 'steel production consumes scrap');
assert.match(facilityShift.log.at(-1).text, /Facilities: \+\d+ stone, \+\d+ steel/, 'workday report includes processed material output');


// Repairs consume the material appropriate to the structure's current tier.
const stoneRepairBase = Core.createBase('rStoneRepair', now);
stoneRepairBase.resources.stone = 0;
stoneRepairBase.structures = [{ id: 'stone-repair-wall', type: 'wall', material: 'stone', hp: 100, maxHp: 175, x: 8, z: 0 }];
assert.throws(() => Core.applyAction(stoneRepairBase, 'rStoneRepair', { type: 'repair', target: 'stone-repair-wall' }, now + 30), /repair_supplies_required/);
stoneRepairBase.resources.stone = 2;
const stoneRepaired = Core.applyAction(stoneRepairBase, 'rStoneRepair', { type: 'repair', target: 'stone-repair-wall' }, now + 31);
assert.equal(stoneRepaired.structures[0].hp, 150, 'stone repair restores HP when stone and scrap are available');
assert.equal(stoneRepaired.resources.stone, 1, 'stone repair consumes a stone block');
const steelRepairBase = Core.createBase('rSteelRepair', now);
steelRepairBase.resources.steel = 1;
steelRepairBase.structures = [{ id: 'steel-repair-wall', type: 'wall', material: 'steel', hp: 100, maxHp: 280, x: 8, z: 0 }];
const steelRepaired = Core.applyAction(steelRepairBase, 'rSteelRepair', { type: 'repair', target: 'steel-repair-wall' }, now + 32);
assert.equal(steelRepaired.resources.steel, 0, 'steel repair consumes steel stock');
assert.equal(steelRepaired.resources.scrap, 28, 'steel repair consumes extra scrap for reinforcement');
