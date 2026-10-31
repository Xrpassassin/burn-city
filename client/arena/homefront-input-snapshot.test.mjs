import assert from 'node:assert/strict';
import { requiresHomefrontSceneRebuild, mergeHomefrontInputSnapshot, playerPositionUpdates, homefrontInputProximity } from './homefront-input-snapshot.mjs';

const baseline = {
  inputProtocol: { enabled: true, nextSequence: 17 },
  self: { id: 'p1', label: 'You', x: 1, z: 2 },
  selfSurvival: { stamina: 95 },
  selfWeaponMagazine: { weaponId: 'pipe_blade', loaded: 0 },
  players: [{ id: 'p1', label: 'You', x: 1, z: 2 }, { id: 'p2', label: 'Ally', x: 3, z: 4, party: true }],
  encounters: [{ id: 'e1', enemy: 'Walker', x: 6, z: 7, hp: 40, maxHp: 40 }],
  world: { lootNodes: [{ id: 'crate', label: 'Supplies', available: true }] },
  interior: null
};
const moved = {
  ...baseline,
  inputProtocol: undefined,
  self: { ...baseline.self, x: 2 },
  selfSurvival: { stamina: 90 },
  players: [{ ...baseline.players[0], x: 2 }, { ...baseline.players[1], z: 5 }],
  encounters: [{ ...baseline.encounters[0], x: 6.5 }]
};
assert.equal(requiresHomefrontSceneRebuild(baseline, moved), false,
  'movement and survival updates do not rebuild player meshes or props');
const merged = mergeHomefrontInputSnapshot(baseline, moved);
assert.equal(merged.self.x, 2);
assert.equal(merged.selfSurvival.stamina, 90);
assert.deepEqual(merged.inputProtocol, baseline.inputProtocol, 'server feature negotiation survives input acknowledgements');
assert.deepEqual(playerPositionUpdates(merged), [
  { id: 'p1', x: 2, z: 2, isLocalPlayer: true },
  { id: 'p2', x: 3, z: 5, isLocalPlayer: false }
]);
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, players: [moved.players[0]] }), true,
  'missing explorer requires a scene update');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, players: [...moved.players, { id: 'p3', label: 'Newcomer', x: 9, z: 9 }] }), true,
  'new explorer requires a scene update');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, players: [moved.players[0], { ...moved.players[1], party: false }] }), true,
  'party protection/hostility changes redraw the avatar');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, encounters: [] }), true,
  'destroyed enemy actor must be removed');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, encounters: [{ ...moved.encounters[0], hp: 15 }] }), true,
  'enemy damage updates visuals and labels');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, world: { lootNodes: [{ id: 'crate', label: 'Supplies', available: false }] } }), true,
  'looted crates need updated world visuals');
assert.equal(requiresHomefrontSceneRebuild(baseline, { ...moved, selfWeaponMagazine: { weaponId: 'pump_shotgun', loaded: 5 } }), true,
  'equipped weapon shape updates');
assert.equal(requiresHomefrontSceneRebuild(null, moved), true);
assert.strictEqual(mergeHomefrontInputSnapshot(null, moved), null);
assert.deepEqual(playerPositionUpdates({ players: [{ id: 'bad', x: Infinity, z: 3 }] }), [],
  'nonfinite coordinates are not forwarded into Three.js');

const position = {
  self: { x: 0, z: 0 },
  world: {
    lootNodes: [{ id: 'cache', label: 'Cache', x: 8.5, z: 0, available: true }],
    environmentStructures: [{ id: 'door', x: 7.9, z: 0, health: 50, stage: 'damaged', collisionEnabled: true }]
  },
  selfEncounter: { id: 'walker', x: 9, z: 0, hp: 25, range: 10 }
};
const selected = { selectedLootId: 'cache', selectedCombatTargetId: 'walker', selectedEnvironmentId: 'door' };
const near = homefrontInputProximity(position, selected);
assert.equal(near.canLoot, true, 'server-acknowledged position permits loot proximity');
assert.equal(near.canAttack, true, 'active encounter is within its own attack range');
assert.equal(near.canAutoFire, true, 'autofire requires target selection and range');
assert.equal(near.environmentActive, true);
assert.equal(near.canDamageEnvironment, true, 'damaged, live structure can be targeted within range');
const distant = homefrontInputProximity({ ...position, self: { x: 30, z: 30 } }, selected);
assert.equal(distant.canLoot, false);
assert.equal(distant.canAttack, false);
assert.equal(distant.canAutoFire, false);
assert.equal(distant.canDamageEnvironment, false);
assert.equal(homefrontInputProximity(position, { ...selected, selectedCombatTargetId: 'other' }).canAutoFire, false,
  'autofire cannot use an unselected target');
const gone = homefrontInputProximity({
  ...position,
  world: { ...position.world, lootNodes: [{ ...position.world.lootNodes[0], available: false }],
    environmentStructures: [{ ...position.world.environmentStructures[0], health: 0, stage: 'destroyed', collisionEnabled: false }] },
  selfEncounter: { ...position.selfEncounter, hp: 0, defeated: true }
}, selected);
assert.equal(gone.canLoot, false, 'empty crate is not actionable');
assert.equal(gone.canAttack, false, 'dead infected is not actionable');
assert.equal(gone.environmentActive, false, 'destroyed building stops being a target');
assert.equal(gone.canDamageEnvironment, false);
assert.equal(homefrontInputProximity({ self: { x: Infinity, z: 0 } }, selected).canAttack, false,
  'invalid or missing authoritative position cannot enable world actions');

console.log('Homefront lightweight movement snapshot tests passed.');
