import assert from 'node:assert/strict';
import { interiorLampProfile, applyInteriorLampProfile } from './homefront-interior-lamps.mjs';

assert.deepEqual(interiorLampProfile('ashfall_station',[]), { mode:'backup',intensity:0.12 });
assert.deepEqual(interiorLampProfile('ashfall_station',['ashfall_grid']), { mode:'restored',intensity:0.88 });
assert.deepEqual(interiorLampProfile('mercy_hospital',['emergency_power']), { mode:'restored',intensity:0.88 });
assert.deepEqual(interiorLampProfile('research_annex',['blackglass_power']), { mode:'restored',intensity:0.88 });
assert.deepEqual(interiorLampProfile('ironworks',['power_cut']), { mode:'isolated',intensity:0.06 });
assert.equal(interiorLampProfile('ironworks',[]).mode,'backup');
assert.equal(interiorLampProfile('wrecked_depot',[]).mode,'battery');
assert.equal(interiorLampProfile('ashfall_station',['forged_grid']).mode,'backup',
  'unknown or client-spoofed flags do not power server-owned infrastructure');

const light={userData:{homefrontEmergencyLamps:true},material:{emissiveIntensity:0.12}};
const furniture={userData:{environmentalSetDressing:'turbine control cabinets'},
  material:{emissiveIntensity:0.3}};
const root={userData:{interiorLandmarkId:'ashfall_station'},children:[light,furniture]};
const state={landmarkId:'ashfall_station',flags:[]};
assert.deepEqual(applyInteriorLampProfile(root,state),{mode:'backup',intensity:0.12,batches:1});
assert.equal(light.material.emissiveIntensity,0.12);
assert.equal(furniture.material.emissiveIntensity,0.3,'other graphics are not mutated');
const repowered={...state,flags:['ashfall_grid']};
assert.equal(applyInteriorLampProfile(root,repowered).mode,'restored');
assert.equal(light.material.emissiveIntensity,0.88);
assert.equal(furniture.material.emissiveIntensity,0.3);
assert.equal(applyInteriorLampProfile(root,{landmarkId:'mercy_hospital',flags:['emergency_power']}),null,
  'a different building cannot change this shared room light state');
assert.equal(applyInteriorLampProfile(null,repowered),null);
assert.equal(applyInteriorLampProfile(root,null),null);
assert.equal(root.children.length,2,'no additional lights, sprites, meshes or shadow passes are needed');
console.log('Homefront shared building power and instanced lamp visuals tests passed.');
