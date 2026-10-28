import assert from 'node:assert/strict';
import {createShoreWalk} from './shore-walk.mjs';

const listeners=new Map();
function vector(x=0,y=0,z=0){
 return {x,y,z,set(x,y,z){Object.assign(this,{x,y,z});return this;},clone(){return vector(this.x,this.y,this.z);},add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}};
}
function el(){
 const node={children:[],style:{},hidden:false,listeners:new Map(),position:vector(),rotation:{y:0},add(child){this.children.push(child);},append(child){this.children.push(child);},remove(){this.removed=true;},setAttribute(){},addEventListener(k,fn){this.listeners.set(k,fn);},removeEventListener(k){this.listeners.delete(k);},getBoundingClientRect(){return {left:0,top:0,width:116,height:116};},setPointerCapture(){}};
 return node;
}
globalThis.document={hidden:false,createElement:el,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k)};
const win=new Map();
globalThis.window={matchMedia:()=>({matches:true}),addEventListener:(k,fn)=>win.set(k,fn),removeEventListener:k=>win.delete(k)};
class Group {constructor(){Object.assign(this,el());}}
class Mesh extends Group {}
class Vector3 {constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}}
const THREE={Group,Mesh,Vector3,MeshStandardMaterial:class{},CapsuleGeometry:class{},SphereGeometry:class{}};
const scene=el(),game=el();
const camera={position:{lerp(){}},lookAt(){}};
let docked='cinder-cove',shore=false;
const trade={test:{state:()=>({docked})},setShoreMode(v){shore=v;}};
const walk=createShoreWalk({THREE,scene,camera,game,ship:{},trade});
const button=game.children[0],pad=game.children[1];
walk.update(1/60,new Set());
assert.equal(button.hidden,false);
button.listeners.get('click')();
assert.equal(walk.ashore,true);
assert.equal(shore,true);
assert.equal(pad.hidden,false);
const startX=walk.position.x;
const event={pointerId:1,clientX:112,clientY:58,pointerType:'touch',preventDefault(){}};
pad.listeners.get('pointerdown')(event);
walk.update(0.1,new Set());
assert.ok(walk.position.x>startX,'touch should move the avatar');
pad.listeners.get('pointercancel')(event);
const afterCancel=walk.position.x;
walk.update(0.1,new Set());
assert.equal(walk.position.x,afterCancel,'cancelled pointer must stop movement');
docked=null;
walk.update(1/60,new Set());
assert.equal(walk.ashore,false);
assert.equal(pad.hidden,true);
assert.equal(shore,false);
walk.dispose();
assert.equal(button.removed,true);
assert.equal(pad.removed,true);
assert.equal(listeners.size,0);
assert.equal(win.size,0);
console.log('Cinder Cove touch controls integration passed');
