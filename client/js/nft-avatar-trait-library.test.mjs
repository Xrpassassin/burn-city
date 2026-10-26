import assert from 'node:assert/strict';
import {createNftTraitLibrary,assembleNftTraitLoadout} from './nft-avatar-trait-library.mjs';
const approved={collection:'racc',sourceType:'Ring Tail',sourceValue:'Striped',uri:'assets/nft-avatars/traits/racc/tail-striped.glb',anchor:'tailRoot',approved:true,rightsApproved:true,visualReviewed:true,rigValidated:true,performanceProfiled:true};
const lib=createNftTraitLibrary([approved,{...approved,collection:'fk',approved:false}]);
assert.equal(lib.size,2);
assert.equal(lib.resolve('RACC','ring tail','striped')?.uri,approved.uri);
assert.equal(lib.resolve('589','ring tail','striped'),null);
const spec={identity:{collectionKey:'racc'},normalizedTraits:[
 {sourceType:'Ring Tail',sourceValue:'Striped',renderSlot:'tail'},
 {sourceType:'Top Gear',sourceValue:'Cap',renderSlot:'headwear'},
 {sourceType:'Mystery',sourceValue:'Unknown',renderSlot:'unknown'}
]};
const loadout=assembleNftTraitLoadout(spec,lib);
assert.deepEqual(loadout.parts.map(p=>p.status),['ready-to-load','needs-trait-model','needs-slot-mapping']);
assert.equal(loadout.readyCount,1);
assert.equal(loadout.incompleteCount,2);
assert.equal(loadout.runtimeApproved,false);
assert.throws(()=>createNftTraitLibrary([approved,approved]),/Duplicate/);
assert.throws(()=>createNftTraitLibrary([{...approved,rightsApproved:false}]),/review gates/);
assert.throws(()=>createNftTraitLibrary([{...approved,uri:'https://example.com/asset.glb'}]),/local GLB/);
assert.equal(assembleNftTraitLoadout(spec,createNftTraitLibrary([{...approved,anchor:'head'}])).parts[0].status,'anchor-mismatch');
console.log('NFT trait library tests passed');
