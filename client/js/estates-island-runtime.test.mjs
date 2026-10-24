import assert from 'node:assert/strict';
import {createEstatesIslandRuntime} from './estates-island-runtime.mjs';

class Geometry { constructor(...args){this.args=args;this.disposed=false;} dispose(){this.disposed=true;} }
class Group { constructor(){this.children=[];this.position={set(){}};this.rotation={x:0};this.scale={set(){}};this.name='';} add(x){this.children.push(x);x.parent=this;} remove(x){this.children=this.children.filter(y=>y!==x);} traverse(fn){fn(this);for(const x of this.children)x.traverse?x.traverse(fn):fn(x);} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set:(x,y,z)=>{this.xyz=[x,y,z];}};this.rotation={x:0};this.scale={set(){}};this.userData={};this.name='';} }
class LineSegments extends Mesh {}
class Mat { constructor(options){this.options=options;} dispose(){} }
const THREE={Group,Mesh,LineSegments,MeshStandardMaterial:Mat,LineBasicMaterial:Mat,BoxGeometry:Geometry,CylinderGeometry:Geometry,ConeGeometry:Geometry,CircleGeometry:Geometry,RingGeometry:Geometry,EdgesGeometry:Geometry,DoubleSide:2};
const hostScene=new Group();
const catalog={
 tiers:[{id:'trailer'},{id:'apartment'},{id:'starter'},{id:'family'},{id:'mansion'}],
 properties:[{id:'starter-01',tier:'starter',address:'Starter Lane 01'}]
};
let creates=0, transitions=0, returns=0, states=[];
const instancePool={async acquire(key,playerId){creates++;return {instance:{key},release(){}};}};
const runtime=createEstatesIslandRuntime({
 THREE,scene:hostScene,catalog,instancePool,
 authenticatePlayer:async()=>({id:'player-1'}),
 authorizeEntry:async()=>true,
 transitionToInstance:async()=>{transitions++;},
 returnToCity:async()=>{returns++;},
 onState:event=>states.push(event),
 seed:123
});
assert.equal(hostScene.children.length,1);
assert.equal(runtime.manifest.lots.length,21);
assert.equal(runtime.manifest.lots.filter(l=>l.propertyId).length,1);
assert.equal(runtime.entryAdapter.state.inside,false);
assert.deepEqual(runtime.updateProximity({x:0,y:0,z:132}),{near:true,promptVisible:true,requiresConfirmation:true});
assert.equal(creates,0,'proximity must not create/acquire an instance');
const gate=runtime.renderer.getObject('island-gate')[0];
gate.userData.interact();
assert.equal(runtime.entryAdapter.state.promptVisible,true,'gate interaction shows a prompt');
assert.equal(creates,0,'interacting with the gate must not auto-enter');
const result=await runtime.confirmEntry({source:'test-confirm-button'});
assert.equal(result.ok,true);
assert.equal(creates,1);
assert.equal(transitions,1);
assert.equal(runtime.entryAdapter.state.inside,true);
assert.equal((await runtime.exit()).ok,true);
assert.equal(returns,1);
assert.equal(runtime.dispose(),true);
assert.equal(runtime.dispose(),false);
assert.equal(hostScene.children.length,0);
assert.equal(runtime.isDisposed,true);
assert.equal((await runtime.confirmEntry()).reason,'runtime-disposed');
assert.ok(states.some(s=>s.state==='disposed'));
assert.throws(()=>createEstatesIslandRuntime({catalog}),/instancePool.acquire is required/);
console.log('estates-island-runtime: all tests passed');
