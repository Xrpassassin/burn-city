import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier==='three')return {url:new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,shortCircuit:true};return next(specifier,context);}});
const THREE=await import('three');
const {ESTATE_INTERIOR_MODEL_IDS,createEstateInteriorModelCache}=await import('./estates-interior-models.mjs');
const {createEstatesSecretInteriorRenderer}=await import('./estates-secret-interior-renderer.mjs');
const {INTERIOR_MODEL_SIZE}=await import('./estates-home-plans.mjs');
const {homeDoorSpots,createHomeDoorPrompt}=await import('./estates-home-door.mjs');
const {buildEstatesIslandScene}=await import('./estates-island-scene.mjs');
const dir=new URL('../assets/estates-interiors/',import.meta.url);
// 1. Licensing + credits: every shipped model is CC BY 4.0 or CC0 (never NC/ND/Standard) and credited.
const sources=JSON.parse(await readFile(new URL('../../scripts/estates-interior-models/sources.json',import.meta.url),'utf8'));
const credits=await readFile(new URL('../city-credits.html',import.meta.url),'utf8');
const assetCredits=await readFile(new URL('CREDITS.md',dir),'utf8');
assert.deepEqual(Object.keys(sources).sort(),[...ESTATE_INTERIOR_MODEL_IDS].sort());
assert.deepEqual(Object.keys(INTERIOR_MODEL_SIZE).sort(),[...ESTATE_INTERIOR_MODEL_IDS].sort(),'plans only reference shipped models');
for(const [id,s] of Object.entries(sources)){
 assert(['by','cc0'].includes(s.licslug),id+' must be CC BY or CC0');
 assert(!/nc|nd|standard|editorial/i.test(s.licslug+' '+s.license.replace('Attribution','')),id+' no NC/ND/Standard');
 assert(credits.includes(s.uid)&&credits.includes(s.title.replace(/&/g,'&amp;'))&&credits.includes(s.creator),id+' credited in city-credits.html');
 assert(assetCredits.includes(s.url)&&assetCredits.includes(s.creator),id+' credited next to the asset');
}
// 2. Mobile budget: low poly, 256 px WebP colour maps only, small total download (loaded only inside homes).
let bytes=0;
for(const id of ESTATE_INTERIOR_MODEL_IDS){
 const info=JSON.parse(await readFile(new URL(id+'.json',dir),'utf8'));
 assert(info.tris>0&&info.tris<=1600,id+' stays low poly ('+info.tris+')');
 const gltf=JSON.parse(await readFile(new URL(id+'.gltf',dir),'utf8'));
 for(const img of gltf.images||[])assert(img.uri.endsWith('.webp')||img.mimeType==='image/webp',id+' textures are WebP');
 assert(!(gltf.materials||[]).some(m=>m.normalTexture||m.occlusionTexture||m.pbrMetallicRoughness?.metallicRoughnessTexture),id+' colour maps only');
 bytes+=(await stat(new URL(id+'.bin',dir))).size+(await stat(new URL(id+'.gltf',dir))).size;
}
for(const f of await readdir(dir,{recursive:true}))if(f.endsWith('.webp')){
 const b=await readFile(new URL(f,dir));bytes+=b.length;
 // VP8/VP8L/VP8X header width check (<= 256 px)
 const t=b.toString('ascii',12,16);let w=0;
 if(t==='VP8 ')w=b.readUInt16LE(26)&0x3fff;else if(t==='VP8L')w=1+((b[21]|(b[22]<<8))&0x3fff);else if(t==='VP8X')w=1+b.readUIntLE(24,3);
 assert(w>0&&w<=256,f+' texture is at most 256 px ('+w+')');
}
assert(bytes<1100*1024,'all interior models together stay under 1.1 MB ('+bytes+')');
// 3. Loader never rejects; a failing loader leaves the primitive fallback; dispose frees everything.
const failing={loadAsync:async()=>{throw Error('offline');}};
assert.equal((await createEstateInteriorModelCache(THREE,{loader:failing}).load(['sofa'])).size,0);
let calls=0,disposed=0;
const fakeScene=()=>{const s=new THREE.Scene(),m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 m.material.dispose=()=>{disposed++;};s.add(m);return {scene:s};};
const okLoader={loadAsync:async()=>{calls++;return fakeScene();}};
const cache=createEstateInteriorModelCache(THREE,{loader:okLoader});
assert.equal((await cache.load(['sofa','bed','not-a-model'])).size,2);
await cache.load(['sofa']);assert.equal(calls,2,'each model is fetched once per visit');
cache.dispose();assert.equal(cache.size,0);assert(disposed>=2,'materials released on exit');
// 4. Lazy: the renderer loads nothing until a home is entered, swaps fallbacks for models, unloads on exit.
calls=0;const scene=new THREE.Scene();
const interior=createEstatesSecretInteriorRenderer({THREE,scene,origin:{x:0,y:0,z:0},modelLoader:okLoader});
assert.equal(calls,0,'no interior downloads while walking the island');
const layout=interior.setRoom('home',{tier:'starter',layoutId:'cozy',furniture:[],reveal:true});
assert(interior.revealing,'entrance reveal brings the lights up');
await new Promise(r=>setTimeout(r,30));
const room0=scene.getObjectByName('estates-secret-private-room');const wanted=new Set(layout.items.filter(i=>i.model).map(i=>i.model.id));
assert.equal(calls,wanted.size,'only the models this home uses are fetched');
assert(room0.children.some(c=>c.name.startsWith('home-model-')),'models placed in the room');
assert(room0.children.filter(c=>c.name.startsWith('secret-model-')).every(c=>!c.visible),'box fallbacks hidden once models arrive');
const draws=room0.children.filter(c=>c.isMesh&&c.visible).length;
assert(draws<80,'merged static furniture keeps draw calls low ('+draws+')');
{const cam=new THREE.PerspectiveCamera();for(let i=0;i<40;i++)interior.tickCamera({camera:cam,localPosition:layout.spawn,yaw:0,dt:1/30});}
assert(!interior.revealing);
interior.hide();assert.equal(interior.loadedModels,0,'models unloaded on exit');assert.equal(room0.children.length,0);
// 5. Enter/exit: walk-up front door prompt (Ember Bar pattern) and collision.
const manifest=buildEstatesIslandScene({catalog:JSON.parse(await readFile(new URL('../data/estate-catalog.json',import.meta.url),'utf8')),seed:20261024});
const spots=homeDoorSpots(manifest.lots);
assert.equal(spots.length,manifest.lots.filter(l=>l.propertyId&&l.buildingFootprint).length,'every catalogued home has a front door');
const lot=manifest.lots.find(l=>l.tier==='starter'),spot=spots.find(s=>s.propertyId===lot.propertyId);
assert(Math.abs(spot.x-(lot.position.x-(lot.buildingFootprint.width-.6)*.24))<1e-9,'door spot sits at the exterior door');
let t=0;const prompt=createHomeDoorPrompt({now:()=>t});
assert.equal(prompt.update({x:spot.x,z:spot.z+5},spots).spot,null,'no prompt from the street');
let r=prompt.update({x:spot.x,z:spot.z+.4},spots);assert.equal(r.spot.propertyId,lot.propertyId);assert(r.changed,'prompt appears at the door');
assert.equal(prompt.update({x:spot.x,z:spot.z+.3},spots).changed,false,'no repeated prompt while standing there');
prompt.exitedThrough(spot);t+=10000;
assert.equal(prompt.update(spot.outside,spots).spot,null,'leaving never re-triggers entry while still at the door');
prompt.update({x:spot.x,z:spot.z+3},spots);
assert.equal(prompt.update({x:spot.x,z:spot.z+.2},spots).spot.propertyId,lot.propertyId,'door re-arms after stepping away');
const t2=createHomeDoorPrompt({now:()=>0});t2.exitedThrough(spot);t2.update({x:spot.x,z:spot.z+3},spots);
assert.equal(t2.update({x:spot.x,z:spot.z},spots).spot,null,'short quiet period after exiting');
const room=interior.setRoom('home',{tier:'mansion',floor:1});
let p=room.spawn;for(let i=0;i<120;i++)p=interior.move(p,{x:-.05,z:.04});
assert(!room.obstacles.some(o=>Math.abs(p.x-o.x)<o.halfX+.34&&Math.abs(p.z-o.z)<o.halfZ+.34),'player never ends inside the stair well or furniture');
interior.hide();
// 6. Live wiring: door entry, show-home tours, stairs, exit re-arm, fade, owner-only editing preserved.
const live=await readFile(new URL('./estates-island-live.mjs',import.meta.url),'utf8');
for(const [needle,why] of [["doorPrompt.update({x:player.pos.x-OFFSET_X,z:player.pos.z},doorSpots)",'island tick checks front doors'],
 ["if(door.spot&&edge){void enterHomeDoor(door.spot);return true;}",'E/tap at the door enters'],
 ["doorPrompt.exitedThrough(previous.returnAt.door)",'exit through the door re-arms only after stepping away'],
 ["changeHomeFloor(trigger.id==='stairs-up'?1:0)",'stairs switch floors'],
 ["const showHomeAllowed=propertyId=>ownershipKnown&&!ownedPropertyIds.has(propertyId);",'tours only for known-unowned homes'],
 ["upgrades:session?.tour?[]:Array.isArray(unlocked)?unlocked:[]",'installed upgrades come from verified Tycoon state'],
 ["if(session.tour){showPanel('SHOW HOME TOUR'",'visitors cannot open the furnishing editor'],
 ["privateRoomRequest('interior-access',propertyId,roomId)",'owned homes still need server-verified access'],
 ["if(trigger?.id!=='exit')secretExitArmed=true;else if(!secretExitArmed)trigger=null;",'arriving at the door never pops the leave prompt']])
 assert(live.includes(needle),why);
console.log('Estates walk-in homes: CC BY credits, mobile budget, lazy load/unload, door enter/exit and collision passed');
