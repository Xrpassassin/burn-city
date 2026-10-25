import assert from 'node:assert/strict';
import {createNftAvatarAttachmentRig,planNftTraitAttachments} from './nft-avatar-attachment-rig.mjs';
for(const key of ['racc','fk','589','generic']){
 const rig=createNftAvatarAttachmentRig(key);
 assert.equal(rig.collectionKey,key);
 assert.equal(rig.runtimeApproved,false);
 for(const anchor of Object.values(rig.anchors))assert(anchor.length===3&&anchor.every(Number.isFinite));
 for(const name of Object.values(rig.slotAnchors))assert(name in rig.anchors);
}
assert.equal(createNftAvatarAttachmentRig('racc').slotAnchors.tail,'tailRoot');
assert.equal(createNftAvatarAttachmentRig('fk').slotAnchors.flame,'emberMantle');
assert.equal(createNftAvatarAttachmentRig('589').slotAnchors.accessory,'chain');
const result=planNftTraitAttachments({identity:{collectionKey:'racc'},normalizedTraits:[
 {sourceType:'Fits',sourceValue:'Jacket',renderSlot:'outfit'},
 {sourceType:'Top Gear',sourceValue:'Cap',renderSlot:'headwear'},
 {sourceType:'Unknown',sourceValue:'Mystery',renderSlot:'unknown'}
]});
assert.equal(result.attachments.length,3);
assert.equal(result.attachments[0].anchor,'chest');
assert.equal(result.attachments[1].anchor,'head');
assert.equal(result.attachments[2].anchor,null);
assert.equal(result.unresolvedCount,1);
assert.equal(result.runtimeApproved,false);
assert.throws(()=>planNftTraitAttachments({}),TypeError);
console.log('NFT attachment rig contracts passed');
