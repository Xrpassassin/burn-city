import assert from 'node:assert/strict';
import { atmosphereAt, nearbyAtmosphereDistrict, ATMOSPHERE_DISTRICTS, AMBIENT_UPDATE_MS } from './homefront-atmosphere.mjs';

assert.equal(AMBIENT_UPDATE_MS,4000);
assert.ok(ATMOSPHERE_DISTRICTS.length >= 7);
assert.equal(nearbyAtmosphereDistrict({x:-42,z:8},'commercial'),'industrial',
  'nearby authored Ashfall site overrides the coarse radial district for scene dressing');
assert.equal(nearbyAtmosphereDistrict({x:24,z:30},'residential'),'hospital');
assert.equal(nearbyAtmosphereDistrict({x:-22,z:48},'industrial'),'residential');
assert.equal(nearbyAtmosphereDistrict({x:80,z:-5},'perimeter'),'outskirts');
assert.equal(nearbyAtmosphereDistrict({x:0,z:0},'graveyard_core'),'research_lab');
const industrial=atmosphereAt({player:{x:-42,z:8},serverDistrict:'commercial',timeMs:180000});
const residential=atmosphereAt({player:{x:-22,z:48},serverDistrict:'residential',timeMs:180000});
const hospital=atmosphereAt({player:{x:24,z:30},serverDistrict:'hospital',timeMs:180000});
assert.equal(industrial.district,'industrial');
assert.equal(residential.district,'residential');
assert.equal(hospital.district,'hospital');
assert.notEqual(industrial.fogColor,hospital.fogColor);
assert.ok(industrial.fogDensity>residential.fogDensity,
  'industrial haze is denser than the quieter residential environment');
for (const district of ATMOSPHERE_DISTRICTS) {
  const out=atmosphereAt({player:{x:80,z:0},serverDistrict:district,timeMs:180000});
  assert.ok(out.ashVisible);
  assert.ok(out.ashOpacity>=0 && out.ashOpacity<=0.40);
  assert.ok(out.fogDensity>=0.003 && out.fogDensity<=0.0055);
  assert.ok(Math.abs(out.windX)<=0.8);
  assert.deepEqual(out,atmosphereAt({player:{x:80,z:0},serverDistrict:district,timeMs:180000}),
    'same player location/time yields consistent cosmetic air conditions');
}
const dark=atmosphereAt({player:{x:-42,z:8},serverDistrict:'industrial',
  interior:{landmarkId:'ashfall_station',roomId:'turbine_gallery',flags:[]},timeMs:180000});
const powered=atmosphereAt({player:{x:-42,z:8},serverDistrict:'industrial',
  interior:{landmarkId:'ashfall_station',roomId:'control_room',flags:['ashfall_grid']},timeMs:180000});
assert.equal(dark.inside,true);
assert.equal(dark.ashVisible,false,'outdoor ash cannot drift through indoor walls');
assert.equal(dark.ashOpacity,0);
assert.equal(dark.windX,0);
assert.equal(powered.ashVisible,false);
assert.notEqual(powered.fogColor,dark.fogColor,
  'authoritative shared station power changes the interior visual mood');
assert.equal(powered.fogDensity,dark.fogDensity,'powered rooms do not change gameplay visibility');
assert.equal(atmosphereAt({player:{x:24,z:30},interior:{landmarkId:'forged',roomId:'x'},timeMs:2}).inside,false,
  'unrecognized client room identifiers cannot spoof an indoor view');
assert.equal(atmosphereAt({player:{x:Infinity,z:0},serverDistrict:'constructor',timeMs:NaN}).district,'outskirts');
assert.notEqual(atmosphereAt({player:{x:-42,z:8},serverDistrict:'industrial',timeMs:90000}).windX,
  atmosphereAt({player:{x:-42,z:8},serverDistrict:'industrial',timeMs:90000*2}).windX,
  'ambient gust direction evolves only across discrete intervals');
console.log('Homefront local district atmosphere and powered interior visuals tests passed.');
