import assert from 'node:assert/strict';
import { bootstrapApprovedCrew } from './nft-crew-bootstrap.mjs';
const runtime={ok:true,mode:'blacktide',runtime:{sharedAsset:true},asset:{uri:'/assets/avatars/racc/42.glb'}};
let attached=0;const model={};
const success=await bootstrapApprovedCrew({runtime,loader:{loadAsync:async()=>({scene:model})},attach:(m,r)=>{assert.equal(m,model);assert.equal(r,runtime);attached++;return {ok:true};}});
assert.equal(success.ok,true);assert.equal(attached,1);
assert.equal((await bootstrapApprovedCrew({runtime:{...runtime,ok:false},loader:{loadAsync:async()=>{throw Error('must not load');}},attach:()=>{throw Error('must not attach');}})).reason,'unapproved-asset-path');
assert.equal((await bootstrapApprovedCrew({runtime,loader:{loadAsync:async()=>({scene:model})},attach:()=>({ok:false,reason:'invalid-three-object'})})).reason,'invalid-three-object');
console.log('BlackTide NFT crew bootstrap tests passed');
