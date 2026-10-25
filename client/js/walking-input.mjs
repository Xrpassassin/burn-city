// Shared keyboard/touch locomotion intent contract for on-foot experiences.
// No renderer, physics, camera or avatar dependency; adapters supply input sources.
export function walkingIntent(keys=new Set(), touch={x:0,z:0}, run=false){
 const pressed=k=>keys?.has?.(k)===true;
 const x=Number(pressed('d')||pressed('arrowright'))-Number(pressed('a')||pressed('arrowleft'))+(Number.isFinite(touch?.x)?touch.x:0);
 const z=Number(pressed('w')||pressed('arrowup'))-Number(pressed('s')||pressed('arrowdown'))+(Number.isFinite(touch?.z)?touch.z:0);
 const magnitude=Math.hypot(x,z);
 const scale=magnitude>1?1/magnitude:1;
 return {x:x*scale,z:z*scale,moving:magnitude>.01,run:!!run};
}
export function locomotionState(intent,grounded=true){
 if(!grounded)return 'jump';
 if(!intent?.moving)return 'idle';
 return intent.run?'run':'walk';
}
