import assert from 'node:assert/strict';
import { mergeSharedInteriorPresence } from './homefront-shared-presence.mjs';
const make = (id, x, z, roomId = 'yard_floor') =>
  ({ id, x, z, interior: { instanceId: 'homefront:building:ironworks', landmarkId: 'ironworks', roomId } });
const old = {
  interiorInstance: { id: 'homefront:building:ironworks', landmarkId: 'ironworks', occupants: [make('me',1,2)] },
  players: [make('me',1,2), { id: 'outside', x: 90, z: 90, interior: null }],
  interior: { landmarkId: 'ironworks', roomId: 'yard_floor' }
};
const newcomer = make('visitor', 3, 4, 'gantry_catwalk');
const response = {
  interiorInstance: { ...old.interiorInstance, occupants: [make('me',1,2), newcomer], count: 2 },
  players: [make('me',1,2), newcomer]
};
const result = mergeSharedInteriorPresence(old, response);
assert.ok(result?.rosterChanged, 'new occupant triggers the rare full actor construction');
assert.equal(result.world.players.length, 3);
assert.equal(result.world.players.find(p => p.id === 'visitor').interior.roomId, 'gantry_catwalk');
assert.equal(result.world.players.find(p => p.id === 'outside').id, 'outside', 'unrelated world player stays untouched');
const moved = mergeSharedInteriorPresence(result.world, {
  ...response,
  interiorInstance: { ...response.interiorInstance, occupants: [make('me',1,2), make('visitor',4,4)] },
  players: [make('me',1,2), make('visitor',4,4)]
});
assert.equal(moved.rosterChanged, false, 'position-only movement does not rebuild meshes');
assert.equal(moved.world.players.find(p => p.id === 'visitor').x, 4);
const removed = mergeSharedInteriorPresence(moved.world, {
  interiorInstance: { ...old.interiorInstance, occupants: [make('me',1,2)], count: 1 },
  players: [make('me',1,2)]
});
assert.ok(removed.rosterChanged);
assert.equal(removed.world.players.find(p => p.id === 'visitor'), undefined);
assert.equal(mergeSharedInteriorPresence(old, { ...response,
  interiorInstance: { ...response.interiorInstance, id: 'homefront:building:mercy_hospital' } }), null,
  'unrelated building response cannot leak occupants into this instance');
assert.equal(mergeSharedInteriorPresence(old, { ...response,
  players: [{ ...newcomer, x: Infinity }] }).world.players.some(p => p.id === 'visitor'), false,
  'untrusted or corrupted nonfinite coordinates do not enter the 3D scene');
console.log('Homefront building-scoped read-only presence reconciliation tests passed.');
