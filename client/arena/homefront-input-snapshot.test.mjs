import assert from 'node:assert/strict';
import { requiresHomefrontSceneRebuild, mergeHomefrontInputSnapshot, playerPositionUpdates } from './homefront-input-snapshot.mjs';

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
console.log('Homefront lightweight movement snapshot tests passed.');
