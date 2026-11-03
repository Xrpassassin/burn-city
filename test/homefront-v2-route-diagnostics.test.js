'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {diagnoseV2Routes}=require('../server/homefront-v2-route-diagnostics');
const a={id:'a',x:-5,z:0},b={id:'b',x:5,z:0};
const road={id:'arterial',from:a,to:b,width:4};
const connector=(siteId)=>({siteId,roadId:'arterial',status:'candidate',connector:{from:a,to:a,width:2}});
test('blocked route exposes obstruction identifier without mutating inputs',()=>{
 const catalog={version:2,previewOnly:true,obstacles:[{id:'ruin',x:0,z:0,halfX:1,halfZ:1,rotation:0}],protectedSites:[]};
 const args={network:{roads:[road]},catalog,connectors:[connector('world:spawn'),connector('landmark:clinic')]};
 const snapshot=JSON.stringify(args),report=diagnoseV2Routes(args);
 assert.equal(report.allJourneysPass,false);
 assert.equal(report.roadFailures[0].kind,'building');
 assert.equal(report.roadFailures[0].obstacleId,'ruin');
 assert.equal(JSON.stringify(args),snapshot);
});
test('clear route reports no road failures',()=>{
 const report=diagnoseV2Routes({network:{roads:[road]},catalog:{version:2,previewOnly:true,obstacles:[],protectedSites:[]},
 connectors:[connector('world:spawn')]});
 assert.equal(report.roadFailures.length,0);
 assert.equal(report.allJourneysPass,true);
});
