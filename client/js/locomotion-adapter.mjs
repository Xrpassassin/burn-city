// Shared, renderer-independent boundary for experience-specific locomotion.
// This module does not install listeners, own camera/physics, or mutate the server.
import {walkingIntent,locomotionState} from './walking-input.mjs';

export function createLocomotionAdapter({toWorld,applyMovement,onAnimation}={}){
 if(typeof toWorld!=='function'||typeof applyMovement!=='function'){
  throw new TypeError('toWorld and applyMovement callbacks are required');
 }
 let disposed=false;
 return Object.freeze({
  step({keys=new Set(),touch={x:0,z:0},run=false,grounded=true,dt=0}={}){
   if(disposed)throw new Error('Locomotion adapter disposed');
   if(!Number.isFinite(dt)||dt<0||dt>0.25)throw new RangeError('Invalid frame delta');
   const intent=walkingIntent(keys,touch,run);
   const world=toWorld({x:intent.x,z:intent.z});
   if(!world||!Number.isFinite(world.x)||!Number.isFinite(world.z)){
    throw new TypeError('toWorld must return finite x/z coordinates');
   }
   const state=locomotionState(intent,grounded);
   const frame=Object.freeze({intent:Object.freeze({...intent}),world:Object.freeze({x:world.x,z:world.z}),state,dt});
   applyMovement(frame);
   onAnimation?.(state,frame);
   return frame;
  },
  dispose(){disposed=true;},
  get disposed(){return disposed;}
 });
}
