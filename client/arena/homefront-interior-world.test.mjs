import assert from 'node:assert/strict';
import {
  INTERIORS, applyInteriorAction, availableInteriorActions, createInteriorState,
  interiorForLandmark, interiorRoom, traverseInteriorDoor, buildInteriorSetPiece
} from './homefront-interior-world.mjs';

assert.equal(INTERIORS.length, 7);
const ids = new Set();
for (const interior of INTERIORS) {
  assert(interiorRoom(interior, interior.entryRoom), interior.landmarkId + ' entry room must exist');
  assert(interior.rooms.length >= 2, interior.landmarkId + ' must have connected rooms');
  for (const room of interior.rooms) {
    assert(room.width >= 4 && room.depth >= 4);
    assert(Number.isFinite(room.elevation), interior.landmarkId + '/' + room.id + ' must define a finite floor elevation');
    for (const exit of room.exits) {
      const destination = interiorRoom(interior, exit.to);
      assert(Number.isFinite(destination.elevation), interior.landmarkId + '/' + exit.to + ' must define a finite floor elevation');
      if (Math.abs(room.elevation - destination.elevation) >= 0.75) {
        assert(/ladder|escape|stairs|stair/i.test(exit.label), 'vertical floor transitions must be explicitly identified as climbable routes');
      }
      assert(interiorRoom(interior, exit.to), interior.landmarkId + '/' + room.id + ' points to missing room');
      assert(interior.rooms.find(other => other.id === exit.to).exits.some(reverse => reverse.id === exit.id && reverse.to === room.id), 'door must connect both rooms');
    }
  }
  for (const item of interior.interactables) {
    assert(!ids.has(item.id), 'interactable IDs must be globally unique: ' + item.id);
    ids.add(item.id);
    assert(interiorRoom(interior, item.roomId), item.id + ' points to missing room');
    assert(Number.isFinite(item.x) && Number.isFinite(item.z));
  }
  const state = createInteriorState(interior.landmarkId);
  assert.equal(state.roomId, interior.entryRoom);
  assert(availableInteriorActions(interior, state).every(item => item.roomId === state.roomId));
}
assert.equal(interiorForLandmark('unknown'), null);
assert.equal(createInteriorState('unknown'), null);

class FakeGroup {
  constructor() { this.children = []; this.position = { set: (...v) => { this.position.values = v; } }; this.rotation = { y: 0 }; this.userData = {}; }
  add(child) { this.children.push(child); }
}
class FakeMesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = { set: (...v) => { this.position.values = v; } }; this.userData = {}; }
}
class FakeBoxGeometry { constructor(...dimensions) { this.dimensions = dimensions; } }
class FakeMaterial { constructor(options) { this.options = options; } }
const fakeThree = { Group: FakeGroup, Mesh: FakeMesh, BoxGeometry: FakeBoxGeometry, MeshStandardMaterial: FakeMaterial };
const apartmentsBlueprint = interiorForLandmark('collapsed_apartments');
const apartmentShell = buildInteriorSetPiece(fakeThree, apartmentsBlueprint, { x: 0, y: 10, z: 0 });
const shellMeshes = [];
const collectMeshes = node => { if (node instanceof FakeMesh) shellMeshes.push(node); for (const child of node.children || []) collectMeshes(child); };
collectMeshes(apartmentShell);
assert(shellMeshes.some(mesh => mesh.geometry.dimensions[1] === 3.2 && mesh.position.values[1] > 10),
  'raised interior transitions render ladder rails spanning the authored floor height');
assert(shellMeshes.some(mesh => Math.abs(mesh.position.values[1] - 13.12) < 0.001),
  'upper apartment floor geometry is placed at its authored elevation');

const hospital = interiorForLandmark('mercy_hospital');
let state = createInteriorState('mercy_hospital');
assert(availableInteriorActions(hospital, state).some(item => item.id === 'generator_switch'));
state = traverseInteriorDoor(hospital, state, 'ward_door');
assert.throws(() => traverseInteriorDoor(hospital, state, 'pharmacy_door'), /interior_door_locked/);
state = traverseInteriorDoor(hospital, state, 'ward_door');
state = applyInteriorAction(hospital, state, 'generator_switch').state;
assert(state.flags.includes('emergency_power'));
state = traverseInteriorDoor(hospital, state, 'ward_door');
assert.equal(state.roomId, 'ward_corridor');
state = applyInteriorAction(hospital, state, 'patient_chart').state;
assert(state.flags.includes('incident_clue'));
state = traverseInteriorDoor(hospital, state, 'pharmacy_door');
assert.equal(state.roomId, 'pharmacy');
assert(availableInteriorActions(hospital, state).some(item => item.id === 'emergency_locker'));
const search = applyInteriorAction(hospital, state, 'emergency_locker');
assert.equal(search.serverRewardRequired, true);
assert(search.state.used.includes('emergency_locker'));
assert.throws(() => applyInteriorAction(hospital, state, 'generator_switch'), /interior_action_unavailable/);

const blackglass = interiorForLandmark('research_annex');
let blackglassState = createInteriorState('research_annex');
blackglassState = applyInteriorAction(blackglass, blackglassState, 'power_bus').state;
blackglassState = traverseInteriorDoor(blackglass, blackglassState, 'containment_door');
assert.throws(() => traverseInteriorDoor(blackglass, blackglassState, 'archive_door'), /interior_door_locked/);
blackglassState = applyInteriorAction(blackglass, blackglassState, 'containment_lock').state;
blackglassState = traverseInteriorDoor(blackglass, blackglassState, 'archive_door');
assert.equal(blackglassState.roomId, 'archive_vault');

const foundry = interiorForLandmark('ironworks');
let foundryState = createInteriorState('ironworks');
foundryState = applyInteriorAction(foundry, foundryState, 'power_isolator').state;
foundryState = traverseInteriorDoor(foundry, foundryState, 'gantry_ladder');
foundryState = traverseInteriorDoor(foundry, foundryState, 'tool_cage');
assert.equal(foundryState.roomId, 'maintenance_shed');
console.log('Homefront interior room graph and interaction tests passed');
