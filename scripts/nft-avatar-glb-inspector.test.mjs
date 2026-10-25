import assert from 'node:assert/strict';
import { inspectGlbBuffer } from './nft-avatar-glb-inspector.mjs';

function makeGlb(json) {
  const jsonBytes=Buffer.from(JSON.stringify(json));
  const paddedLength=(jsonBytes.length+3)&~3;
  const padded=Buffer.alloc(paddedLength,0x20);
  jsonBytes.copy(padded);
  const total=12+8+paddedLength;
  const header=Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67,0);
  header.writeUInt32LE(2,4);
  header.writeUInt32LE(total,8);
  const chunkHeader=Buffer.alloc(8);
  chunkHeader.writeUInt32LE(paddedLength,0);
  chunkHeader.writeUInt32LE(0x4e4f534a,4);
  return Buffer.concat([header,chunkHeader,padded]);
}
const valid={
 asset:{version:'2.0',generator:'unit-test'},
 scene:0,
 scenes:[{nodes:[0]}],
 nodes:[{name:'AvatarRoot',mesh:0,skin:0}],
 meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],
 materials:[{name:'Base'}],textures:[],images:[],
 accessors:[
  {componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,1]},
  {componentType:5123,count:3,type:'SCALAR'}
 ],
 bufferViews:[],buffers:[],
 skins:[{joints:[0]}],
 animations:[{samplers:[{input:1,output:1}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]
};
const good=inspectGlbBuffer(makeGlb(valid));
assert.equal(good.ok,true);
assert.equal(good.summary.meshCount,1);
assert.equal(good.summary.skinnedMeshNodeCount,1);
assert.equal(good.summary.animationChannelCount,1);
assert.match(good.summary.sha256,/^[a-f0-9]{64}$/);
const badMagic=makeGlb(valid); badMagic.writeUInt32LE(0,0);
assert.ok(inspectGlbBuffer(badMagic).errors.some(e=>e.code==='BAD_MAGIC'));
const badRef=structuredClone(valid); badRef.meshes[0].primitives[0].attributes.POSITION=99;
assert.ok(inspectGlbBuffer(makeGlb(badRef)).errors.some(e=>e.code==='POSITION_ACCESSOR'));
const badSkin=structuredClone(valid); badSkin.skins[0].joints=[9];
assert.ok(inspectGlbBuffer(makeGlb(badSkin)).errors.some(e=>e.code==='SKIN_JOINT_INDEX'));
const badAnimation=structuredClone(valid); badAnimation.animations[0].channels[0].target.path='color';
assert.ok(inspectGlbBuffer(makeGlb(badAnimation)).errors.some(e=>e.code==='ANIMATION_PATH'));
const external=structuredClone(valid); external.images=[{uri:'textures/albedo.png'}];
assert.ok(inspectGlbBuffer(makeGlb(external)).warnings.some(w=>w.code==='EXTERNAL_RESOURCE'));
const truncated=makeGlb(valid).subarray(0,15);
assert.equal(inspectGlbBuffer(truncated).ok,false);
console.log('NFT avatar GLB inspector: 8 assertions passed');
