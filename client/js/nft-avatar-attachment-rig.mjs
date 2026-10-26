// Collection-aware attachment anchors in model-local metres.
// Contract for authored base meshes and separately modeled traits, not a runtime rig or finished asset.
import { getNftAvatarCollectionRecipe } from './nft-avatar-collection-recipes.js';

const v=(x,y,z)=>Object.freeze([x,y,z]);
const common = p => ({
 root:v(0,0,0), pelvis:v(0,.98,0), chest:v(0,1.35*p.torsoHeight,0),
 neck:v(0,p.headY-.18,0), head:v(0,p.headY,0),
 leftHand:v(-.57*p.armScale,1.02,0),rightHand:v(.57*p.armScale,1.02,0),
 leftFoot:v(-.18,.10,0),rightFoot:v(.18,.10,0),
 back:v(0,1.32*p.torsoHeight,.20), waist:v(0,.99,0)
});
const collectionAnchors={
 racc:p=>({muzzle:v(0,p.headY-.06,-.24),eyeMask:v(0,p.headY+.08,-.20),
  tailRoot:v(0,.94,.22),tailTip:v(0,.66,.88),leftEar:v(-.24,p.headY+.31,0),rightEar:v(.24,p.headY+.31,0)}),
 fk:p=>({cowl:v(0,p.headY+.14,0),robeHem:v(0,.22,0),sigil:v(0,1.42,-.16),emberMantle:v(0,1.60,.08)}),
 '589':p=>({chain:v(0,1.45,-.16),insignia:v(0,1.33,-.18),headwear:v(0,p.headY+.23,0),techPack:v(0,1.34,.25)})
};
const slotAnchors={
 headwear:'head',outfit:'chest',accessory:'chest',weapon:'rightHand',
 mask:'head',tail:'tailRoot',flame:'emberMantle', 'body effect':'chest',
 'eye appearance':'head',expression:'head',armor:'chest',wing:'back',
 'eye wear':'head',horns:'head', 'hair style':'head', 'facial hair':'head',
 markings:'head','body pattern':'chest'
};
const overrides={
 racc:{headwear:'head',mask:'eyeMask',tail:'tailRoot',weapon:'rightHand'},
 fk:{headwear:'cowl',outfit:'chest',accessory:'sigil',flame:'emberMantle'},
 '589':{headwear:'headwear',accessory:'chain',outfit:'chest','body effect':'chest'}
};
export function createNftAvatarAttachmentRig(collectionKey) {
 const recipe=getNftAvatarCollectionRecipe(collectionKey);
 const key=recipe.key,p=recipe.proportions;
 const anchors={...common(p),...(collectionAnchors[key]?.(p)||{})};
 const slots={...slotAnchors,...(overrides[key]||{})};
 for(const [slot,anchor] of Object.entries(slots))if(!anchors[anchor])throw new Error('Unresolved attachment anchor: '+slot+' -> '+anchor);
 return Object.freeze({schemaVersion:1,collectionKey:key,rigProfile:recipe.rig,units:'meters',
   anchors:Object.freeze(anchors),slotAnchors:Object.freeze(slots),
   status:'authoring-contract-only',runtimeApproved:false});
}
export function planNftTraitAttachments(spec) {
 if(!spec?.identity?.collectionKey || !Array.isArray(spec.normalizedTraits))throw new TypeError('NFT build spec with normalizedTraits required');
 const rig=createNftAvatarAttachmentRig(spec.identity.collectionKey);
 const entries=spec.normalizedTraits.map((trait,index)=>{
   const slot=String(trait.renderSlot||'unknown');
   const anchor=rig.slotAnchors[slot]||null;
   return Object.freeze({index,sourceType:String(trait.sourceType||''),sourceValue:String(trait.sourceValue||''),
     slot,anchor,requiresAuthoring:!anchor,assetApproved:false});
 });
 return Object.freeze({collectionKey:rig.collectionKey,rig,attachments:Object.freeze(entries),
   unresolvedCount:entries.filter(e=>e.requiresAuthoring).length,runtimeApproved:false});
}
