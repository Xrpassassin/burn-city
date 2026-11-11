import assert from 'node:assert/strict';
import {createEstateHomeLayout,HOME_FOOTPRINT} from './estates-home-layout.mjs';
import {createSecretRoomLayout,resolveSecretRoomMotion,secretRoomInteraction} from './estates-secret-layout.mjs';
import {validateHomePlacement,nextFurnitureSlot} from './estates-home-placement.mjs';
const fixtures=[
 {id:'a',type:'sofa',x:-1.5,z:-.5,rotation:0},
 {id:'b',type:'plant',x:1.5,z:-1.5,rotation:0}
];
for(const [tier,[width,depth]]of Object.entries(HOME_FOOTPRINT)){
 const dims={halfX:(width-.8)/2,halfZ:(depth-.8)/2};
 assert(dims.halfX>2&&dims.halfZ>2);
 for(const layoutId of ['cozy','open','split','arcade-suite','maker-suite','bunker-suite']){
  const layout=createSecretRoomLayout('home',{tier,layoutId,furniture:[]});
  assert.equal(layout.roomId,'home');assert.equal(layout.tier,tier);assert.equal(layout.layoutId,layoutId);
  assert(Math.abs(layout.bounds.x-dims.halfX)<1e-6);
  assert(Math.abs(layout.bounds.z-dims.halfZ)<1e-6);
  assert(layout.items.length>20,'authored warm residential shell includes detail');
  assert(layout.items.some(i=>i.mat==='home-wall')&&layout.items.some(i=>i.mat==='home-floor'));
  assert(layout.items.some(i=>i.id==='home-exit-door')===false);
  assert(layout.items.some(i=>i.id==='home-exit-panel'));
  assert(!layout.obstacles.some(o=>Math.abs(o.x-layout.spawn.x)<o.halfX+.35&&Math.abs(o.z-layout.spawn.z)<o.halfZ+.35),'free entry is navigable');
  assert.equal(secretRoomInteraction(layout,{x:0,z:dims.halfZ-.85})?.id,'exit');
  const motion=resolveSecretRoomMotion(layout.spawn,{x:0,z:20},layout);
  assert(motion.z<=layout.bounds.z-.35,'room controller blocks exterior wall traversal');
 }
 const decorated=createEstateHomeLayout({tier,layoutId:'cozy',furniture:[{id:'one',type:'sofa',x:-1.5,z:-.5,rotation:90}]});
 assert(decorated.items.some(i=>i.id==='furnish-one-cushion--1'),'placed sofas have actual cushions');
 assert(decorated.obstacles.some(i=>i.id==='furnish-one-base'),'placed sofas use real collision bounds');
}
assert(validateHomePlacement(fixtures,{halfX:2.6,halfZ:2.1}));
assert(!validateHomePlacement([...fixtures,{...fixtures[0],id:'duplicate'}],{halfX:2.6,halfZ:2.1}),'furniture overlapping is rejected');
assert(!validateHomePlacement([{id:'oops',type:'sofa',x:0,z:1.5,rotation:0}],{halfX:2.6,halfZ:2.1}));
const next=nextFurnitureSlot('chair',fixtures,{halfX:2.6,halfZ:2.1});
assert(next&&validateHomePlacement([...fixtures,next],{halfX:2.6,halfZ:2.1}));
assert.equal(nextFurnitureSlot('invalid',[],{halfX:2.6,halfZ:2.1}),null);
console.log('Estate tier-scaled homes: 5 property sizes, 3 free and 3 verified-premium layouts, 3D furniture and walkable collision passed');
