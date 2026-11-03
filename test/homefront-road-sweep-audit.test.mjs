import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHomefrontRoadSweeps } from '../client/arena/homefront-road-sweep-audit.mjs';
const road={id:'r',from:{x:-10,z:0},to:{x:10,z:0},width:4};
test('road sweep detects overlapping rotated footprint',()=>{
  const result=auditHomefrontRoadSweeps({roads:[road],buildings:[{id:'b',x:0,z:0,w:3,d:3,rotation:Math.PI/4}]});
  assert.equal(result.clear,false);
  assert.equal(result.conflicts[0].buildingId,'b');
  assert.equal(result.previewOnly,true);
});
test('road sweep detects shoulder obstruction, clear route and invalid dimensions',()=>{
  const shoulder={id:'shoulder',x:0,z:2.5,w:2,d:1,rotation:0};
  assert.equal(auditHomefrontRoadSweeps({roads:[road],buildings:[shoulder]}).clear,false);
  assert.equal(auditHomefrontRoadSweeps({roads:[road],buildings:[{...shoulder,z:20}]}).clear,true);
  assert.throws(()=>auditHomefrontRoadSweeps({roads:[{...road,width:0}],buildings:[]}),TypeError);
});
