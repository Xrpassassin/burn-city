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
assert.equal(ok,false,'a selected NFT does not replace the current player default');
assert.equal(walker.visible,true,'the player fallback stays visible when no shared model is loaded');
assert(!group.userData.nftCharacter,'no NFT character is instantiated while NFT avatars are paused');
assert(!group.userData.communityActor,'no alternate survivor skin overrides the player default');
art.clearExplorer(group);
assert.equal(walker.visible,true);
console.log('Homefront community art respects the shared default player policy');
