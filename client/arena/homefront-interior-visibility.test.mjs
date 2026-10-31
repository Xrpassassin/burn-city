import assert from 'node:assert/strict';
import { applyInteriorVisualLayers } from './homefront-interior-visibility.mjs';

const interior = new Map([
  ['ashfall_station',{visible:false}],
  ['mercy_hospital',{visible:false}],
  ['ironworks',{visible:false}]
]);
const exterior = new Map([
  ['ashfall_station',{visible:true}],
  ['mercy_hospital',{visible:true}],
  ['ironworks',{visible:true}],
  ['nonenterable_ruin',{visible:true}]
]);
assert.equal(applyInteriorVisualLayers(null,interior,exterior),null);
assert.ok([...interior.values()].every(group=>!group.visible),
  'outside, none of the room geometry overlaps the opaque building facade');
assert.ok([...exterior.values()].every(group=>group.visible),
  'facades remain visible and clickable from the street');
assert.equal(applyInteriorVisualLayers('ashfall_station',interior,exterior),'ashfall_station');
assert.ok(interior.get('ashfall_station').visible,'the active building exposes its shared interior rooms');
assert.equal(exterior.get('ashfall_station').visible,false,
  'the opaque exterior does not hide the playable room geometry');
assert.equal(interior.get('mercy_hospital').visible,false);
assert.equal(exterior.get('mercy_hospital').visible,true);
assert.equal(exterior.get('nonenterable_ruin').visible,true,
  'unrelated skyline and ruins are never hidden');
assert.equal(applyInteriorVisualLayers('mercy_hospital',interior,exterior),'mercy_hospital');
assert.equal(interior.get('ashfall_station').visible,false,'other rooms are culled when changing building');
assert.equal(exterior.get('ashfall_station').visible,true,'previous building facade is restored');
assert.equal(interior.get('mercy_hospital').visible,true);
assert.equal(applyInteriorVisualLayers(null,interior,exterior),null);
assert.ok([...interior.values()].every(group=>!group.visible),'leaving restores outside render budget');
assert.ok([...exterior.values()].every(group=>group.visible),'street world facades are restored');
assert.equal(applyInteriorVisualLayers('forged_room',interior,exterior),null,
  'unknown or unregistered buildings cannot enable an interior render layer');
assert.throws(()=>applyInteriorVisualLayers('ashfall_station',[],exterior),/building mesh index/);
console.log('Homefront shared-world exterior/interior visual layer switching tests passed.');
