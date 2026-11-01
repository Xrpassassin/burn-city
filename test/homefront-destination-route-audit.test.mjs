import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHomefrontDestinationRoutes } from '../client/arena/homefront-destination-route-audit.mjs';
const road=(id,a,b)=>({id,from:a,to:b,width:4});
const origin={id:'a',x:0,z:0}, end={id:'b',x:10,z:0}, island={id:'c',x:50,z:50}, far={id:'d',x:60,z:50};
const sites=[{id:'world:spawn',x:0,z:0,radius:3},{id:'landmark:outpost',x:10,z:0,radius:3}];
test('connected clean spawn-to-landmark route is a planning candidate',()=>{
 const result=auditHomefrontDestinationRoutes({network:{roads:[road('one',origin,end)]},sites,buildings:[]});
 assert.equal(result.allCandidates,true);
 assert.equal(result.originRoadId,'one');
 assert.equal(result.scope,'preview-only-not-authoritative-traversal');
});
test('disconnected destination graph is not certified',()=>{
 const result=auditHomefrontDestinationRoutes({network:{roads:[road('one',origin,end),road('isolated',island,far)]},
 sites,buildings:[],connectors:[
 {siteId:'world:spawn',roadId:'one',status:'candidate',connector:{from:origin,to:origin,width:2.2}},
 {siteId:'landmark:outpost',roadId:'isolated',status:'candidate',connector:{from:island,to:far,width:2.2}}
 ]});
 assert.equal(result.allCandidates,false);
 assert.equal(result.blockers[0].status,'disconnected-road-graph');
});
test('blocked connecting corridor remains blocked',()=>{
 const result=auditHomefrontDestinationRoutes({network:{roads:[road('one',origin,end)]},
 sites,buildings:[{id:'wall',x:5,z:3,w:3,d:2,rotation:0}],connectors:[
 {siteId:'world:spawn',roadId:'one',status:'candidate',connector:{from:origin,to:origin,width:2.2}},
 {siteId:'landmark:outpost',roadId:'one',status:'candidate',connector:{from:{x:5,z:0},to:{x:5,z:6},width:2.2}}
 ]});
 assert.equal(result.blockers.some(d=>d.siteId==='landmark:outpost' && d.status==='connector-footprint-blocked'),true);
});
