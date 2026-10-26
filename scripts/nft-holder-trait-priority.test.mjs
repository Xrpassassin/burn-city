import assert from 'node:assert/strict';
import {buildHolderTraitPriority} from './nft-holder-trait-priority.mjs';
const id='A'.repeat(64),other='B'.repeat(64);
const item=(tokenId,collection,traits)=>({collection,tokenId,spec:{identity:{collectionKey:collection},normalizedTraits:traits}});
const outfit={sourceType:'Fits',sourceValue:'Jacket',renderSlot:'outfit',mapped:true};
const unknown={sourceType:'Rare Pattern',sourceValue:'Nebula',renderSlot:'unknown',mapped:false};
const result=buildHolderTraitPriority({queue:[
 item(id,'racc',[outfit,outfit,unknown]),item(id,'racc',[outfit]),
 item(other,'racc',[outfit]),item('invalid','racc',[outfit]),
 item('C'.repeat(64),'fk',[{sourceType:'Cowl',sourceValue:'Ember',renderSlot:'headwear',mapped:true}]),
 item('D'.repeat(64),'other',[outfit])
]});
assert.equal(result.tokenCount,3);
assert.deepEqual(result.collections.map(c=>c.collection),['fk','racc']);
const racc=result.collections[1];
assert.equal(racc.connectedHolderTokenCount,2);
assert.equal(racc.priorityTraits[0].holderTokenCount,2);
assert.equal(racc.unmappedTraits[0].holderTokenCount,1);
assert.equal(racc.baseModelStatus,'needs_visual_approval');
assert(!JSON.stringify(result).includes('wallet'));
assert.throws(()=>buildHolderTraitPriority({}),TypeError);
console.log('Holder trait prioritization tests passed');
