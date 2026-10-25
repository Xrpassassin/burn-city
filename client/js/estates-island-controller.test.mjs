import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandController} from './estates-island-controller.mjs';

const catalog={tiers:[{id:'trailer'},{id:'apartment'},{id:'starter'},{id:'family'},{id:'mansion'}],properties:[
 {id:'starter-01',tier:'starter',address:'Starter Lane 01'}
]};
const manifest=buildEstatesIslandScene({catalog,seed:123});
const actor={position:{x:0,y:0,z:0}};
const camera={position:{x:0,y:3,z:8},lookAt(x,y,z){this.target={x,y,z};}};
const prompts=[],clears=[],exits=[];
const controller=createEstatesIslandController({
 manifest,actor,camera,input:({dt,moveX,moveZ})=>({delta:{x:moveX*dt,z:moveZ*dt}}),
 onPropertyPrompt:p=>prompts.push(p),onPropertyPromptClear:()=>clears.push(true),onExitPrompt:p=>exits.push(p)
});
let r=controller.update({dt:.1,moveX:10,moveZ:0,yaw:0});
assert(Math.abs(actor.position.x-1)<1e-8);
assert.equal(r.active,true);
assert(camera.target&&camera.target.y>1);
const lot=manifest.lots.find(l=>l.propertyId==='starter-01');
actor.position.x=lot.position.x;actor.position.z=lot.position.z+5;
r=controller.update({dt:.016,interactPressed:true});
assert.equal(r.property.propertyId,'starter-01');
assert(prompts.some(p=>p.propertyId==='starter-01'));
assert(prompts.some(p=>p.confirmedInteraction===true));
actor.position.x=-205;actor.position.z=188;
r=controller.update({dt:.016});
assert.equal(r.nearGate,true);
assert(exits.some(e=>e.visible===true&&e.requiresConfirmation));
r=controller.update({dt:.016,exitPressed:true});
assert(exits.some(e=>e.confirmedInteraction===true&&e.action==='return-to-city'),'E-key interaction at the city gate must emit an actionable return event');
assert.equal(controller.dispose(),true);
assert.equal(controller.dispose(),false);
assert.equal(controller.isActive,false);
assert.throws(()=>createEstatesIslandController({manifest,actor,camera}),/input callback/);

const entrance={x:lot.position.x,y:0,z:lot.position.z-lot.buildingFootprint.depth/2-2.5};
actor.position.x=entrance.x;actor.position.z=entrance.z;
r=controller.update({dt:.016,interactPressed:true});
assert.equal(r.property?.interaction,'inspect-entrance');
assert.equal(r.property?.lotId,lot.id);
assert(prompts.some(p=>p.interaction==='inspect-entrance'&&p.confirmedInteraction===true));

console.log('estates-island-controller: all tests passed');
