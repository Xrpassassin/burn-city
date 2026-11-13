import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
// Walker drop-shadows use a Canvas 2D context; no NFT artwork is fetched here.
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
import * as THREE from './vendor/three.module.min.js';
const {createHomefrontCommunityArt}=await import('./homefront-community-art.mjs');

const art=createHomefrontCommunityArt({mobile:false});
const preloaded=await art.preloadNftArt();
assert(preloaded?.buildNftChar,'NFT character builder preloaded');

const group=new THREE.Group();
const walker=new THREE.Group();
walker.scale.setScalar(.82);
group.add(walker);
group.userData.walker=walker;

assert.equal(art.decorateExplorer(group,walker,{isLocal:true}),false,
  'without a loaded survivor GLB the non-NFT path keeps the walker');
assert.equal(walker.visible,true);

const nft={id:'qa-1',key:'fk',name:'QA Firekeeper',img:'/qa/nft-card.png'};
let thrown=null;
const ok=(()=>{try{return art.decorateExplorer(group,walker,{isLocal:true,nft,srv:'http://127.0.0.1'})}catch(e){thrown=e;return false}})();
assert.equal(thrown,null,thrown?String(thrown):'decorateExplorer should not throw');
assert.equal(ok,true,'a selected NFT uses the shared City collection walker');
assert.equal(group.userData.look,'nft');
assert.equal(walker.visible,false,'the field-gear walker is hidden only while the NFT look is active');
assert.equal(group.userData.nftCharacter.name,'homefront-nft-look');
assert(group.userData.nftCharacter.userData.card,'NFT look includes the floating art card');
assert(!group.userData.communityActor,'licensed survivor is not applied on top of an NFT');
assert.equal(group.userData.nftCharacter.scale.x,.82,'NFT look follows the explorer scale');

art.animateExplorer(group,true,0.016,0,false);
assert(group.userData.nftCharacter.userData.card.position.y>0);

art.clearExplorer(group);
assert.equal(walker.visible,true,'clearing the NFT look restores the default walker');
assert.equal(group.userData.nftCharacter,null);
console.log('Homefront community art: NFT holders keep collection walker + card; survivor stays for everyone else');
