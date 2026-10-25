import assert from 'node:assert/strict';
import {createWalkingPad} from './walking-pad.mjs';
function element(){
 const listeners=new Map();
 return {style:{},hidden:false,children:[],attrs:{},listeners,
  setAttribute(k,v){this.attrs[k]=v;},append(child){this.children.push(child);},
  addEventListener(k,fn){listeners.set(k,fn);},
  removeEventListener(k){listeners.delete(k);},remove(){this.removed=true;},
  getBoundingClientRect(){return {left:0,top:0,width:116,height:116};},
  setPointerCapture(){}};
}
const docListeners=new Map(),winListeners=new Map();
globalThis.document={hidden:false,createElement:element,addEventListener:(k,fn)=>docListeners.set(k,fn),removeEventListener:k=>docListeners.delete(k)};
globalThis.window={matchMedia:()=>({matches:true}),addEventListener:(k,fn)=>winListeners.set(k,fn),removeEventListener:k=>winListeners.delete(k)};
const host=element(),pad=createWalkingPad(host),surface=host.children[0];
pad.setVisible(true);
assert.equal(surface.hidden,false);
const pointer=(pointerId,x,y)=>({pointerId,clientX:x,clientY:y,pointerType:'touch',preventDefault(){}});
surface.listeners.get('pointerdown')(pointer(1,112,58));
assert.ok(pad.vector.x>.9);
surface.listeners.get('pointermove')(pointer(2,58,0));
assert.ok(pad.vector.x>.9,'other pointers cannot hijack movement');
surface.listeners.get('pointercancel')(pointer(1,112,58));
assert.deepEqual(pad.vector,{x:0,z:0});
surface.listeners.get('pointerdown')(pointer(3,58,4));
assert.ok(pad.vector.z>.9);
pad.setVisible(false);
assert.deepEqual(pad.vector,{x:0,z:0});
assert.equal(surface.hidden,true);
pad.setVisible(true);
surface.listeners.get('pointerdown')(pointer(4,58,4));
docListeners.get('visibilitychange')();
assert.ok(pad.vector.z>.9,'visible document does not reset input');
document.hidden=true;docListeners.get('visibilitychange')();
assert.deepEqual(pad.vector,{x:0,z:0});
pad.dispose();
assert.equal(surface.removed,true);
assert.equal(docListeners.size,0);
assert.equal(winListeners.size,0);
console.log('Shared walking pad lifecycle tests passed');
