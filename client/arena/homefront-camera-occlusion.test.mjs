import assert from 'node:assert/strict';
import { clipInteriorCamera, interiorCameraProbeOrigins } from './homefront-camera-occlusion.mjs';

const target={x:0,y:1.8,z:0}, camera={x:0,y:4,z:-7};
assert.deepEqual(clipInteriorCamera(target,camera,Infinity),
  {...camera,occluded:false}, 'unobstructed camera preserves the normal third-person follow pose');
assert.deepEqual(clipInteriorCamera(target,camera,100),
  {...camera,occluded:false}, 'faraway obstacles do not affect the camera');
const nearWall = clipInteriorCamera(target,camera,3.2);
assert.ok(nearWall.occluded);
const length=Math.hypot(nearWall.x-target.x,nearWall.y-target.y,nearWall.z-target.z);
assert.ok(length<3.2 && length>2.8,
  'wall clearance shortens the camera arm without crossing the wall');
const closeWall=clipInteriorCamera(target,camera,0.1);
assert.ok(Math.hypot(closeWall.x,closeWall.y-target.y,closeWall.z)<0.1,
  'an extremely close wall must never push the camera through it');
assert.ok(clipInteriorCamera({x:0,y:0,z:0},{x:0,y:0,z:0},0.5).occluded===false,
  'degenerate first-person eye pose is unaffected');
assert.throws(()=>clipInteriorCamera(target,{x:NaN,y:0,z:0},2),/finite camera/);
assert.throws(()=>clipInteriorCamera(null,camera,2),/finite camera/);
assert.deepEqual(clipInteriorCamera(target,camera,-1),{...camera,occluded:false});

const samples=interiorCameraProbeOrigins(target,camera);
assert.equal(samples.length,5,'desktop volume uses five rays');
assert.deepEqual(samples[0],target,'first ray stays on the original camera line');
assert.equal(samples[1].y,target.y);
assert.equal(samples[2].y,target.y);
assert(Math.abs(samples[1].x+samples[2].x-2*target.x)<1e-9);
assert(Math.abs(samples[1].z+samples[2].z-2*target.z)<1e-9);
assert(samples[3].y>target.y && samples[4].y<target.y,'vertical probes cover the camera body');
const compact=interiorCameraProbeOrigins(target,camera,{compact:true});
assert.equal(compact.length,3,'mobile uses only three rays');
const sideways=interiorCameraProbeOrigins({x:3,y:2,z:4},{x:9,y:4,z:4});
assert(Math.abs(sideways[1].x-3)<1e-9,'lateral probe is perpendicular to horizontal camera arm');
assert(Math.abs(sideways[1].z-4)>0.15,'camera probe covers edge clipping beyond central view ray');
const steep=interiorCameraProbeOrigins({x:0,y:0,z:0},{x:0,y:6,z:0});
assert(steep.every(p=>Object.values(p).every(Number.isFinite)),'vertical camera arms produce finite safe probes');
assert.throws(()=>interiorCameraProbeOrigins(target,{x:NaN,y:0,z:0}),/finite camera/);
assert.deepEqual(target,{x:0,y:1.8,z:0},'probe policy never changes the target');

console.log('Homefront third-person interior camera wall clearance tests passed.');
const {clipActorCamera}=await import('./homefront-camera-occlusion.mjs');
const eye={x:0,y:1.3,z:0},lens={x:0,y:1.8,z:-6};
const crowd=[{id:'behind-player',x:0,y:0,z:-4,hp:10,ty:0}];
const clipped=clipActorCamera(eye,lens,crowd);
assert.ok(clipped.occluded&&clipped.z>-4,'an infected between player and camera pulls the lens in front of its body');
assert.deepEqual(clipActorCamera(eye,lens,[{...crowd[0],z:2}]),{...lens,occluded:false},'enemies in front of the player do not change camera reach');
assert.deepEqual(clipActorCamera(eye,lens,[{...crowd[0],hp:0}]),{...lens,occluded:false},'dead actors do not obstruct the lens');
assert.deepEqual(clipActorCamera(eye,lens,[{...crowd[0],x:4}]),{...lens,occluded:false},'off-axis enemies do not zoom the camera');
assert.deepEqual(crowd,[{id:'behind-player',x:0,y:0,z:-4,hp:10,ty:0}],'camera clearance never moves an infected or changes its health');
console.log('Homefront living-actor camera clearance passed');
