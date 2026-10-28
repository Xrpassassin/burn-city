import assert from 'node:assert/strict';
import {buildBeachAccessRoute,followBeachRoute,beachTrafficAdvance} from './beach-traffic-route.mjs';
const route=buildBeachAccessRoute({junction:{x:0,z:0},parking:{x:33,z:8},dir:{x:0,z:1},side:{x:1,z:0}});
assert.equal(route.length,5);assert.equal(route[0].x,0);assert.equal(route.at(-1).x,33);assert.equal(route.at(-1).z,8);
assert.deepEqual(followBeachRoute(route,0),{x:0,z:-12,yaw:0});
assert.equal(followBeachRoute(route,1).x,33);
assert.deepEqual(followBeachRoute(route,-1),followBeachRoute(route,0));
assert.deepEqual(followBeachRoute(route,2),followBeachRoute(route,1));
assert.equal(buildBeachAccessRoute({junction:{x:0,z:0},parking:{x:0,z:4},dir:{x:0,z:1},side:{x:1,z:0}}).length,0);
assert.equal(followBeachRoute([],0),null);
console.log('beach access vehicle route tests passed');

for(const lane of [0,1]){
 const car={u:.3,sp:.06,lane},ahead={u:.38,sp:.06,lane},behind={u:.28,sp:.06,lane};
 assert(beachTrafficAdvance(car,[car,ahead],100,.95,.05)<beachTrafficAdvance(car,[car,behind],100,.95,.05),'follow the car ahead in progress order on either lane');
 assert(beachTrafficAdvance(car,[car],100,lane===0?.3:.7,.05)<beachTrafficAdvance(car,[car],100,.05,.05),'slow at the same physical junction on either lane');
 const close={u:.34,sp:.06,lane};
 assert.equal(beachTrafficAdvance(car,[car,close],100,.95,.05),0,'never advance into the minimum gap');
 assert.equal(beachTrafficAdvance(car,[car,{...car}],100,.95,.05),0,'overlapping traffic must stop');
 assert.equal(beachTrafficAdvance(car,[car],100,.95,-1),0);
 const fast={u:.3,sp:100,lane};
 assert(beachTrafficAdvance(fast,[fast,ahead],100,.95,.05)<=.01+1e-12,'a step cannot overtake the lead car');
 const wrap={u:.98,sp:.06,lane},next={u:.04,sp:.06,lane};
 assert.equal(beachTrafficAdvance(wrap,[wrap,next],100,.5,.05),0,'following distance wraps at the route end');
}
console.log('beach traffic: both lane directions, junctions, spacing and wrap passed');
