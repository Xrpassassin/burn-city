// Temporary collection colours on the shared walker. Verified NFT metadata is
// identity only here: token traits do not invent a collection's future 3D model.
import * as THREE from 'three';
import { buildWalker, poseWalker } from './walker.js';
export const COLLECTION_WALKER_COLORS=Object.freeze({
  racc:Object.freeze({suit:0x647383,accent:0xd9e2e9}),
  fk:Object.freeze({suit:0x71361f,accent:0xff9c38}),
  '589':Object.freeze({suit:0x713746,accent:0xffd477}),
  generic:Object.freeze({suit:0x36475c,accent:0x9cb9d1})
});
export function collectionWalkerColors(key) {
  return COLLECTION_WALKER_COLORS[String(key||'').toLowerCase()]||COLLECTION_WALKER_COLORS.generic;
}
export function buildCollectionPlaceholder(n,opts={}) {
  const colors=collectionWalkerColors(n?.key), walker=buildWalker({...colors,lite:!!opts.lite,skin:0});
  // NFT callers face +Z; the shared walker faces -Z. Keep that correction on
  // the child, leaving the existing city/arena heading and rig references intact.
  const root=new THREE.Group();root.name='burn-city-nft-collection-placeholder';
  walker.rotation.y=Math.PI;root.add(walker);
  root.userData={...walker.userData,nftId:n?.id,representation:'collection-placeholder',
    nftAvatarProfile:{collectionKey:n?.key||'generic',exactReconstruction:false},
    anim(t,moving,armsUp){
      poseWalker(walker,t*9,moving?1:0,t);
      if(armsUp) for(const arm of walker.userData.arms) {arm.rotation.x=-1.2;if(arm.userData.elbow)arm.userData.elbow.rotation.x=-.45;}
    }};
  return root;
}
