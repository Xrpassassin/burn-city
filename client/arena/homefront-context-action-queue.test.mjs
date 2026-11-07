import assert from 'node:assert/strict';
import {queueDoorwayTap} from './homefront-context-action-queue.mjs';
const intent={id:'enter-doorway',targetId:'north_bus_depot'};
function trial({busy=0,target=intent,cancel=false,maxChecks=20}={}){
  const callbacks=[];const entered=[];let reads=0;
  const stop=queueDoorwayTap({intent,isBusy:()=>reads++<busy,
    current:()=>target,commit:id=>entered.push(id),
    schedule:fn=>callbacks.push(fn),maxChecks});
  if(cancel)stop();
  let steps=0;
  while(callbacks.length&&steps++<100)callbacks.shift()();
  return{entered,steps,reads};
}
assert.deepEqual(trial().entered,['north_bus_depot'],'immediate interaction sends exactly one action');
assert.deepEqual(trial({busy:5}).entered,['north_bus_depot'],'mobile tap waits for five movement acknowledgements');
assert.equal(trial({busy:5}).entered.length,1,'no duplicate doorway requests');
assert.deepEqual(trial({busy:5,target:{id:'enter-doorway',targetId:'different_building'}}).entered,[],
  'moving into another doorway cannot execute an old tap');
assert.deepEqual(trial({busy:5,target:null}).entered,[],'leaving reach cancels the action');
assert.deepEqual(trial({busy:21}).entered,[],'a stuck server acknowledgment cannot activate later');
assert.deepEqual(trial({busy:5,cancel:true}).entered,[],'scene teardown cancels deferred interaction');
assert.deepEqual(trial({busy:2,maxChecks:2}).entered,[],'bounded waiting never queues indefinitely');
let count=0;
queueDoorwayTap({intent:{id:'nearby-loot',targetId:'loot_1'},isBusy:()=>false,current:()=>intent,commit:()=>count++});
assert.equal(count,0,'only doorway taps can defer, never loot/rewards/payments');
console.log('Homefront one-tap doorway queue is bounded, single-use and revalidates current interaction');
