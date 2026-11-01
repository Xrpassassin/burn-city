'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditV2Journeys}=require('../server/homefront-v2-journey-audit');
const point=(id,x,z)=>({id,x,z});
const a=point('a',0,0),b=point('b',6,0),c=point('c',12,0),d=point('d',40,0),e=point('e',46,0);
const road=(id,from,to)=>({id,from,to,width:4});
const catalog={version:2,previewOnly:true,obstacles:[],protectedSites:[]};
const connector=(siteId,roadId,from)=>({siteId,roadId,status:'candidate',connector:{from,to:from,width:2}});
test('connected traversable roads yield complete spawn-to-site journey',()=>{
 const result=auditV2Journeys({network:{roads:[road('r1',a,b),road('r2',b,c)]},catalog,
 connectors:[connector('world:spawn','r1',a),connector('landmark:clinic','r2',c)]});
 assert.equal(result.allJourneysPass,true);
 assert.equal(result.previewOnly,true);
});
test('individually safe but disconnected roads cannot certify journey',()=>{
 const result=auditV2Journeys({network:{roads:[road('r1',a,b),road('r2',d,e)]},catalog,
 connectors:[connector('world:spawn','r1',a),connector('landmark:clinic','r2',e)]});
 assert.equal(result.allJourneysPass,false);
 assert.equal(result.failedDestinations[0].reason,'no-traversable-route-from-spawn');
});
test('failed spawn connector prevents all journeys',()=>{
 const result=auditV2Journeys({network:{roads:[road('r1',a,b)]},catalog,
 connectors:[{...connector('world:spawn','r1',a),status:'blocked'},connector('landmark:clinic','r1',b)]});
 assert.equal(result.allJourneysPass,false);
 assert.equal(result.destinations[1].reason,'spawn-connector-failed');
});
