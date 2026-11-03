'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {auditV2TravelPreview}=require('../server/homefront-v2-travel-audit');
const catalog={version:2,previewOnly:true,obstacles:[],protectedSites:[]};
test('v2 travel audit evaluates road and connector segments without activation',()=>{
 const network={roads:[{id:'road',from:{x:0,z:0},to:{x:6,z:0},width:4}]};
 const connectors=[{siteId:'world:spawn',roadId:'road',status:'candidate',connector:{from:{x:0,z:0},to:{x:0,z:0}}}];
 const a=auditV2TravelPreview({network,catalog,connectors});
 assert.equal(a.allPass,true);assert.equal(a.previewOnly,true);
});
test('v2 travel audit refuses building-obstructed roads and destinations',()=>{
 const network={roads:[{id:'road',from:{x:-5,z:0},to:{x:5,z:0},width:4}]};
 const blocked={...catalog,obstacles:[{id:'b',x:0,z:0,halfX:1,halfZ:1,rotation:0}]};
 const connectors=[{siteId:'site',roadId:'road',status:'candidate',connector:{from:{x:5,z:0},to:{x:6,z:0}}}];
 const a=auditV2TravelPreview({network,catalog:blocked,connectors});
 assert.equal(a.failedRoads.length,1);assert.equal(a.failedDestinations.length,1);
 assert.equal(a.destinations[0].reason,'road-impassable');
});
