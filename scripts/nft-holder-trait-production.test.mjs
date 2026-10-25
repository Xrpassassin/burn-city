import assert from 'node:assert/strict';
import {planHolderTraitProduction} from './nft-holder-trait-production.mjs';
const priority={source:'verified-holder-avatar-queue',collections:[{collection:'racc',connectedHolderTokenCount:3,priorityTraits:[
 {sourceType:'Ring Tail',sourceValue:'Striped',renderSlot:'tail',holderTokenCount:3},
 {sourceType:'Fits',sourceValue:'Jacket',renderSlot:'outfit',holderTokenCount:2}
],unmappedTraits:[{sourceType:'Unmapped',sourceValue:'Rune',renderSlot:'unknown',holderTokenCount:1}]}]};
const result=planHolderTraitProduction(priority);
assert.equal(result.collections.length,1);
const group=result.collections[0];
assert.equal(group.baseModel.rigProfile,'humanoid-plus-tail');
assert.deepEqual(group.traitJobs.map(j=>j.status),['needs-3d-authoring','needs-3d-authoring','needs-trait-mapping']);
assert.equal(group.traitJobs[0].anchor,'tailRoot');
assert.equal(group.traitJobs[0].holderTokenCount,3);
assert.equal(group.traitJobs[0].requiredReviews.length,4);
const approved={collection:'racc',sourceType:'Ring Tail',sourceValue:'Striped',uri:'assets/nft-avatars/traits/racc/tail-striped.glb',anchor:'tailRoot',approved:true,rightsApproved:true,visualReviewed:true,rigValidated:true,performanceProfiled:true};
assert.equal(planHolderTraitProduction(priority,[approved]).collections[0].traitJobs[0].status,'approved-asset');
assert.throws(()=>planHolderTraitProduction({collections:[]}),TypeError);
console.log('NFT holder trait production planning tests passed');
