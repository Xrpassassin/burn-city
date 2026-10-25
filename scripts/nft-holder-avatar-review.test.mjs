import assert from 'node:assert/strict';
import { compileHolderVisualReview } from './nft-holder-avatar-review.mjs';
const idA='A'.repeat(64), idB='B'.repeat(64);
const result=compileHolderVisualReview({queue:[
 {collection:'racc',tokenId:idA,displayName:'Needs art',spec:{identity:{artworkReference:null},traits:{normalized:[{sourceType:'Fits',sourceValue:'Unrecognized',mapped:false}]}}},
 {collection:'589',tokenId:idB,displayName:'With art',spec:{identity:{artworkReference:'ipfs://example'},traits:{normalized:[{sourceType:'Eye',sourceValue:'Blue',mapped:true}]}}}
]});
assert.equal(result.total,2);
assert.equal(result.needsArtwork,1);
assert.equal(result.withUnmappedTraits,1);
assert.equal(result.rows[0].tokenId,idA);
assert.equal(result.rows[0].runtimeApproved,false);
assert.deepEqual(result.rows[0].unmapped,[{type:'Fits',value:'Unrecognized'}]);
assert.throws(()=>compileHolderVisualReview({}),/Expected/);
console.log('Holder visual-review triage tests passed.');
