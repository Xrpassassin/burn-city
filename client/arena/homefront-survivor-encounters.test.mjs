import assert from 'node:assert/strict';
import {closestStrandedSurvivor,survivorApproachCue,survivorInteraction,SURVIVOR_SCENES} from './homefront-survivor-encounters.mjs';
const now=300000;
const world={
 pointsOfInterest:[
  {id:'stranded_bus',type:'rescue',x:35,z:-42},
  {id:'quarantine_shelter',type:'rescue',x:36,z:38},
  {id:'collapsed_apartments',type:'rescue',x:-22,z:48},
  {id:'test_unknown',type:'rescue',x:0,z:0},
  {id:'cache_exchange',type:'cache',x:37,z:-42}
 ],
 rescues:{stranded_bus:{readyAt:0},quarantine_shelter:{readyAt:0},collapsed_apartments:{readyAt:0}}
};
assert.equal(Object.keys(SURVIVOR_SCENES).length,3,'encounters use three distinct authored survivors');
const self={x:35,z:-42};
const scene=closestStrandedSurvivor(world,self,now);
assert.equal(scene?.id,'stranded_bus');
assert.equal(scene?.role,'Stranded driver');
assert.equal(survivorInteraction(scene)?.targetId,'stranded_bus');
assert.equal(survivorInteraction({...scene,reachable:false}),null,'server-obstructed survivors never offer a rescue prompt');
assert.equal(survivorInteraction({...scene,distance:5.1}),null,'faraway survivors cannot offer an interaction prompt');
const cue=survivorApproachCue(scene,undefined,now);
assert.match(cue.message,/survivor/i);
assert.equal(survivorApproachCue(scene,cue.at,now+5000),null,'persistent proximity must not spam dialogue');
assert.equal(survivorApproachCue(scene,cue.at,now+90001)?.id,'stranded_bus');
world.rescues.stranded_bus.readyAt=now+60000;
assert.equal(closestStrandedSurvivor(world,self,now),null,'rescued NPCs disappear for all clients until shared cooldown');
assert.equal(closestStrandedSurvivor(world,{x:34,z:38},now)?.id,'quarantine_shelter',
 'quarantine survivor is a different source of environmental storytelling');
assert.equal(closestStrandedSurvivor(world,{x:-24,z:48},now)?.id,'collapsed_apartments');
assert.equal(closestStrandedSurvivor(world,{x:0,z:0},now),null,'unregistered client-side NPCs cannot be invented from other map data');
assert.equal(closestStrandedSurvivor(world,{x:999,z:999},now),null);
assert.equal(closestStrandedSurvivor(world,{x:NaN,z:0},now),null);
assert.equal(closestStrandedSurvivor(world,null,now),null);
console.log('Homefront survivor encounters: shared rescue presence, distinct voices, bounded E action, no repeated dialogue');
