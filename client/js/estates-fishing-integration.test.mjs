import assert from 'node:assert/strict';
import {buildEstatesIslandScene} from './estates-island-scene.mjs';
import {createEstatesIslandNavigation} from './estates-island-navigation.mjs';
import {resolveLakeCast,estatesLakeWaterAt} from './lake-casting-geometry.mjs';
const manifest=buildEstatesIslandScene({catalog:{tiers:[],properties:[]}});
const nav=createEstatesIslandNavigation({manifest});
const directions={
 'estates-public-dock':{x:0.65,z:0.76},
 'estates-north-bank':{x:0,z:-1},
 'estates-west-bank':{x:-1,z:0},
 'estates-outer-bank-east':{x:-1,z:0},
 'estates-outer-bank-west':{x:1,z:0}
};
for(const spot of manifest.fishingSpots.filter(s=>s.access==='public')){
 const origin={x:spot.position.x+650,z:spot.position.z};
 const target=resolveLakeCast({origin,direction:directions[spot.id],power:0.8,inWater:(x,z)=>estatesLakeWaterAt({x,z})});
 assert(target,'public station must have a water cast target: '+spot.id);
 assert(estatesLakeWaterAt({x:target.x,z:target.z}),'target must land in Estates water');
 if(spot.shore==='island'){
  assert(nav.accessibleApproach(spot.position,3),'island fishing spot must have accessible approach: '+spot.id);
 }else{
  assert.equal(nav.isWalkable({x:spot.position.x,y:0,z:spot.position.z}),false,'outer shore is not yet connected to island navigation');
 }
}
console.log('Estates lake public fishing geometry and navigation tests passed');
