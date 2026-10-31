import assert from 'node:assert/strict';
import { clipInteriorCamera } from './homefront-camera-occlusion.mjs';

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
console.log('Homefront third-person interior camera wall clearance tests passed.');
