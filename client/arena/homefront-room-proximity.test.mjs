import assert from 'node:assert/strict';
import { nearestInteriorInteraction, ROOM_ACTION_RANGE } from './homefront-room-proximity.mjs';
import { createInteriorState, interiorForLandmark } from './homefront-interior-world.mjs';

const depot = interiorForLandmark('north_bus_depot');
const origin = { x: -8, z: -65 };
const initial = createInteriorState('north_bus_depot');
const byDrawer = nearestInteriorInteraction(depot, initial, origin, { x: -9.1, z: -65.7 });
assert.deepEqual([byDrawer.kind, byDrawer.id], ['action', 'dispatch_drawer'],
  'nearby searchable object appears in the real 3D world');
assert.ok(byDrawer.distance < 1e-9);
assert.deepEqual([byDrawer.x, byDrawer.z], [-9.1, -65.7]);
const byDoor = nearestInteriorInteraction(depot, initial, origin, { x: -5.6, z: -65 });
assert.deepEqual([byDoor.kind, byDoor.id], ['door', 'office_door'],
  'nearby door offers its physically connected destination');
assert.equal(byDoor.distance, 0);
assert.equal(nearestInteriorInteraction(depot, initial, origin, { x: -35, z: -65 }), null,
  'no action is offered when the player has left this building');
assert.equal(nearestInteriorInteraction(depot, initial, origin, { x: NaN, z: 0 }), null);
assert.equal(nearestInteriorInteraction(depot, initial, origin, { x: 0, z: 0 }, Infinity), null);
assert.equal(nearestInteriorInteraction(depot, initial, origin, { x: 0, z: 0 }, 30), null,
  'presentation distance can never exceed the server action radius');
assert.equal(ROOM_ACTION_RANGE, 2.8);

const used = { ...initial, used: ['dispatch_drawer'] };
const other = nearestInteriorInteraction(depot, used, origin, { x: -9.1, z: -65.7 });
assert.notEqual(other?.id, 'dispatch_drawer', 'already searched object is never advertised again');
const ward = interiorForLandmark('mercy_hospital');
const wardState = { ...createInteriorState('mercy_hospital'), roomId: 'ward_corridor' };
const hospital = { x: 24, z: 30 };
// Pharmacy is a north-door lock requiring power and the patient's incident clue.
const blocked = nearestInteriorInteraction(ward, wardState, hospital, { x: 28.8, z: 27.6 }, 1.1);
assert.equal(blocked, null, 'locked room does not display an actionable door');
const powered = { ...wardState, flags: ['emergency_power','incident_clue'] };
const unlocked = nearestInteriorInteraction(ward, powered, hospital, { x: 28.8, z: 27.6 }, 1.1);
assert.equal(unlocked?.id, 'pharmacy_door', 'server-provided effective building power unlocks the in-world prompt');
assert.equal(unlocked?.kind, 'door');
const badBlueprint = { ...depot, rooms: [{ ...depot.rooms[0], exits: [
  { id:'forged', to:'nonexistent', side:'east', label:'Teleport' }
] }], interactables: [] };
assert.equal(nearestInteriorInteraction(badBlueprint, initial, origin, { x: -5.6, z: -65 }), null,
  'a bad catalog reference must not create a traversable door');
assert.equal(nearestInteriorInteraction(depot, { ...initial, roomId: 'invented' }, origin, { x: -8, z: -65 }), null);
console.log('Homefront server-backed in-world interior proximity tests passed.');
