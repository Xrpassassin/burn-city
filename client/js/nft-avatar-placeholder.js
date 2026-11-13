// Temporary collection colours on the shared walker. Verified NFT metadata is
// identity only here: token traits do not invent a collection's future 3D model.
import * as THREE from 'three';
import { buildWalker, buildPlayerWalker, poseWalker } from './walker.js';
export const COLLECTION_WALKER_COLORS=Object.freeze({
  racc:Object.freeze({suit:0x647383,accent:0xd9e2e9}),
  fk:Object.freeze({suit:0x71361f,accent:0xff9c38}),
  '589':Object.freeze({suit:0x713746,accent:0xffd477}),
  generic:Object.freeze({suit:0x36475c,accent:0x9cb9d1})
});
export function collectionWalkerColors(key) {
  return COLLECTION_WALKER_COLORS[String(key||'').toLowerCase()]||COLLECTION_WALKER_COLORS.generic;
}
export function nftPortraitUrl(srv, n) {
  return n && n.img && srv ? String(srv).replace(/\/$/, '') + String(n.img).replace(/\.webp$/, '.jpg') : '';
}
export function attachFloatingNftCard(root, n, opts={}) {
  const url=opts.card ? nftPortraitUrl(opts.srv, n) : '';
  if (!url || !root) return null;
  // TextureLoader needs a real DOM Image. Tests and other non-browser
  // runtimes still get the floating card sprite; the artwork fills in in-game.
  let map=null;
  if (typeof document!=='undefined' && typeof document.createElementNS==='function') {
    map=new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, x => { x.needsUpdate = true; }, undefined, () => {});
    if (map && 'colorSpace' in map) map.colorSpace = THREE.SRGBColorSpace;
    if (map) { map.generateMipmaps = false; map.minFilter = THREE.LinearFilter; }
  }
  const accent=collectionWalkerColors(n?.key).accent;
  const card=new THREE.Sprite(new THREE.SpriteMaterial({map, depthWrite:false}));
  card.name='nft-portrait-card'; card.scale.set(.62,.62,1); card.position.set(0,2.55,0); root.add(card);
  const frame=new THREE.Sprite(new THREE.SpriteMaterial({color:accent, depthWrite:false}));
  frame.name='nft-portrait-frame'; frame.scale.set(.7,.7,1); frame.position.set(0,2.55,-.01); frame.renderOrder=-1; root.add(frame);
  root.userData.card=card; root.userData.frame=frame; root.userData.artTexture=map;
  return {card, frame};
}
export function buildCollectionPlaceholder(n,opts={}) {
  const colors=collectionWalkerColors(n?.key), walker=buildPlayerWalker({...colors,lite:!!opts.lite,skin:0});
  // NFT callers face +Z; the shared walker faces -Z. Keep that correction on
  // the child, leaving the existing city/arena heading and rig references intact.
  const root=new THREE.Group();root.name='burn-city-nft-collection-placeholder';
  walker.rotation.y=Math.PI;root.add(walker);
  root.userData={...walker.userData,nftId:n?.id,representation:'collection-placeholder',
    nftAvatarProfile:{collectionKey:n?.key||'generic',exactReconstruction:false},
    anim(t,moving,armsUp){
      poseWalker(walker,t*9,moving?1:0,t);
      if(armsUp) for(const arm of walker.userData.arms) {arm.rotation.x=-1.2;if(arm.userData.elbow)arm.userData.elbow.rotation.x=-.45;}
      if(root.userData.card) root.userData.card.position.y=root.userData.frame.position.y=2.55+Math.sin(t*2)*.045;
    }};
  attachFloatingNftCard(root, n, opts);
  return root;
}
