import assert from 'node:assert/strict';
import {pineBarkPixels,pineUnderstorySites,fernGeometry,weatherWall} from './homefront-pine-detail.mjs';
import {pineRouteDistance,PINE_CROSSING_BUILDINGS} from './homefront-pine-crossing.mjs';
import {vehicleCorridorAt} from './homefront-vehicle-corridors.mjs';
import * as THREE from './vendor/three.module.min.js';
const maps=pineBarkPixels();
assert.equal(maps.width*maps.height*8,262144,'shared bark colour and normals stay within a small GPU base-level budget');
assert.deepEqual(maps,pineBarkPixels(),'tree surfaces do not flicker or change on a scene rebuild');
assert.ok(maps.normal.every((v,i)=>i%4!==2||v>=128),'generated normals face out of the surface');
const sites=pineUnderstorySites();
assert.ok(sites.length>80&&sites.length<350,'understory is dense but bounded in this region');
assert.ok(sites.every(s=>pineRouteDistance(s.x,s.z)>=0.85&&!vehicleCorridorAt(s.x,s.z)),
 'decorative foliage keeps walking trails and drivable corridors clear');
assert.ok(sites.every(s=>!PINE_CROSSING_BUILDINGS.some(b=>s.x>=b.x-3.2&&s.x<=b.x+8&&s.z>=b.z-3.2&&s.z<=b.z+3.2)),
 'ferns never appear in building interiors or thresholds');
assert.deepEqual(sites,pineUnderstorySites());
const fern=fernGeometry(THREE);
assert.ok(fern.attributes.position.count<=192,'small instanced fronds have a bounded triangle budget');
assert.ok([...fern.attributes.position.array].every(Number.isFinite));
const wall=new THREE.Mesh(new THREE.BoxGeometry(4,3,0.16),new THREE.MeshStandardMaterial());
const original=wall.geometry.attributes.position.array.slice();
weatherWall(THREE,wall);
assert.deepEqual(wall.geometry.attributes.position.array,original,'weathering never changes physical wall or doorway geometry');
assert.equal(wall.material.vertexColors,true);
const color=wall.geometry.attributes.color;
assert.ok(Math.min(...color.array)<Math.max(...color.array),'wall weathering varies from ground to roof');
fern.dispose();wall.geometry.dispose();wall.material.dispose();
console.log('Pine environment detail: deterministic bark, clear travel lanes, instancing budget and unchanged wall geometry passed');

const {homefrontPixelRatio,homefrontRendererName,homefrontSoftwareRenderer}=await import('./homefront-render-budget.mjs');
assert.equal(homefrontPixelRatio(3,true,'Apple GPU'),1.15,'phone GPUs keep the existing detail cap');
assert.equal(homefrontPixelRatio(2,false,'NVIDIA GPU'),1.6,'desktop GPUs keep the existing detail cap');
assert.equal(homefrontPixelRatio(2,false,'ANGLE SwiftShader'),0.75,'software rendering uses a smaller framebuffer');
assert.equal(homefrontPixelRatio(1,true,'llvmpipe'),0.75);
assert.equal(homefrontPixelRatio(NaN,false,''),1);
assert.equal(homefrontRendererName({getContext(){throw Error('unavailable');}}),'','masked renderer information never prevents startup');

assert.equal(homefrontSoftwareRenderer('ANGLE SwiftShader'),true);
assert.equal(homefrontSoftwareRenderer('Apple GPU'),false);
