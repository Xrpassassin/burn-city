import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFile} from 'node:fs/promises';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
// Only CanvasTexture's drop-shadow needs a DOM; no NFT artwork/network is used.
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
const THREE=await import('three');
const {buildNftChar,disposeNftChar}=await import('./nftchar.js');
const {collectionWalkerColors}=await import('./nft-avatar-placeholder.js');
function signature(root){const parts=[];root.traverse(o=>{if(o.isMesh)parts.push([o.geometry.type,o.geometry.attributes.position.count]);});return parts;}
for(const lite of [false,true]) {
 const avatars=['racc','fk','589'].map((key,i)=>buildNftChar({key,id:'verified-'+i,traits:[['Outfit','Golden armour'],['Headwear','Crown']],pal:{body:'#ff00ff'}},{lite}));
 assert.equal(new Set(avatars.map(g=>JSON.stringify(signature(g)))).size,1,'all collections share the same basic geometry');
 assert.equal(new Set(avatars.map(g=>g.userData.chest.material.color.getHex())).size,3,'the loading fallback keeps distinct collection colours');
 for(const g of avatars) {
  assert.equal(g.userData.representation,'gas-mask-guy','NFT holders play as Gas Mask Guy');
  assert.equal(g.name,'burn-city-nft-gas-mask-guy');
  assert.equal(g.userData.avatarSkin?.model,'gas-mask-guy');
  assert.equal(g.userData.avatarSkin?.tint,null,'Gas Mask Guy keeps its own untinted skin for NFT holders');
  assert(g.userData.defaultAvatar&&typeof g.userData.defaultAvatar.setLod==='function','NFT holders mount the shared Gas Mask Guy model with LOD switching');
  assert.equal(g.children[0].rotation.y,Math.PI,'walker front is corrected to the NFT +Z convention');
  assert(!g.userData.card&&!g.userData.artTexture,'portraits stay optional when card is not requested');
  const before=g.userData.legs[0].rotation.x;g.userData.anim(.16,true,false);
  assert.notEqual(g.userData.legs[0].rotation.x,before,'walking animates the existing rig');
  g.userData.anim(.4,false,true);assert.equal(g.userData.arms[0].rotation.x,-1.2);
  g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g);assert(bounds.max.y>1.8&&bounds.max.y<2.2);
  let disposed=false;g.traverse(o=>{o.material?.addEventListener('dispose',()=>disposed=true);o.geometry?.addEventListener('dispose',()=>disposed=true);});
  const scene=new THREE.Scene();scene.add(g);disposeNftChar(g);assert.equal(g.parent,null);assert(!disposed,'shared walker resources must survive avatar removal');
 }
}
const carded=buildNftChar({key:'fk',id:'carded-1',img:'/qa/nft-card.png'},{card:true,srv:'https://invalid.example'});
assert(carded.userData.card&&carded.userData.frame,'card:true attaches the floating NFT art portrait');
assert.equal(carded.userData.card.name,'nft-portrait-card');
const cardY=carded.userData.card.position.y;carded.userData.anim(.4,false,false);
assert.notEqual(carded.userData.card.position.y,cardY,'the portrait card bobs with the shared City animation');
assert.equal(carded.userData.representation,'gas-mask-guy','the art card rides on the Gas Mask Guy body');
let cardFreed=false;carded.userData.card.material.addEventListener('dispose',()=>cardFreed=true);
disposeNftChar(carded);assert(cardFreed,'per-avatar card material is freed on removal');
assert.equal(collectionWalkerColors('unknown'),collectionWalkerColors('generic'));
assert.equal(collectionWalkerColors('RACC'),collectionWalkerColors('racc'));
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
for(const asset of ['js/nft-avatar-placeholder.js','js/walker.js','js/estates-house-design.mjs'])assert(sw.includes(asset),'offline shell includes '+asset);
console.log('NFT Gas Mask Guy avatars: untinted skin, card overhead, geometry parity, colours, animation, orientation, disposal, and offline imports passed');
