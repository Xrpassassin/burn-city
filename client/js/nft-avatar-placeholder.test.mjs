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
 const avatars=['racc','fk','589'].map((key,i)=>buildNftChar({key,id:'verified-'+i,traits:[['Outfit','Golden armour'],['Headwear','Crown']],pal:{body:'#ff00ff'}},{lite,card:true,srv:'https://invalid.example'}));
 assert.equal(new Set(avatars.map(g=>JSON.stringify(signature(g)))).size,1,'all collections share the same basic geometry');
 assert.equal(new Set(avatars.map(g=>g.userData.chest.material.color.getHex())).size,3,'collections have distinct fixed colours');
 for(const g of avatars) {
  assert.equal(g.userData.representation,'collection-placeholder');
  assert.equal(g.children[0].rotation.y,Math.PI,'walker front is corrected to the NFT +Z convention');
  assert(!g.userData.card&&!g.userData.artTexture,'placeholder creates no portrait/artwork downloads');
  const before=g.userData.legs[0].rotation.x;g.userData.anim(.16,true,false);
  assert.notEqual(g.userData.legs[0].rotation.x,before,'walking animates the existing rig');
  g.userData.anim(.4,false,true);assert.equal(g.userData.arms[0].rotation.x,-1.2);
  g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g);assert(bounds.max.y>1.8&&bounds.max.y<2.2);
  let disposed=false;g.traverse(o=>{o.material?.addEventListener('dispose',()=>disposed=true);o.geometry?.addEventListener('dispose',()=>disposed=true);});
  const scene=new THREE.Scene();scene.add(g);disposeNftChar(g);assert.equal(g.parent,null);assert(!disposed,'shared walker resources must survive avatar removal');
 }
}
assert.equal(collectionWalkerColors('unknown'),collectionWalkerColors('generic'));
assert.equal(collectionWalkerColors('RACC'),collectionWalkerColors('racc'));
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
for(const asset of ['js/nft-avatar-placeholder.js','js/walker.js','js/estates-house-design.mjs'])assert(sw.includes(asset),'offline shell includes '+asset);
console.log('NFT collection placeholders: geometry parity, colours, animation, orientation, disposal, and offline imports passed');
