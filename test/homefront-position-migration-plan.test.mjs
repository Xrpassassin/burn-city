import test from 'node:test';
import assert from 'node:assert/strict';
import { planHomefrontPositionMigration } from '../client/arena/homefront-position-migration-plan.mjs';
const building={id:'ruin',x:0,z:0,w:4,d:4,rotation:0};
test('retains safe coordinates and proposes deterministic nearby relocation',()=>{
 const positions=[{id:'safe',x:20,z:20},{id:'trapped',x:0,z:0}];
 const before=JSON.stringify(positions);
 const args={positions,buildings:[building],safeAnchors:[{x:40,z:40}]};
 const one=planHomefrontPositionMigration(args);
 assert.deepEqual(one,planHomefrontPositionMigration(args));
 assert.equal(one.retained,1);
 assert.equal(one.relocatedCandidates,1);
 assert.equal(one.proposals[0].status,'retain');
 assert.ok(Math.hypot(one.proposals[1].to.x,one.proposals[1].to.z)<10);
 assert.equal(JSON.stringify(positions),before);
 assert.equal(one.requiresServerApproval,true);
});
test('invalid saved position falls back only to safe anchor',()=>{
 const result=planHomefrontPositionMigration({positions:[{id:'invalid',x:NaN,z:0}],buildings:[building],safeAnchors:[{x:0,z:0},{x:40,z:40}]});
 assert.deepEqual(result.proposals[0].to,{x:40,z:40});
});
test('no valid fallback becomes manual review, never silent forced spawn',()=>{
 const result=planHomefrontPositionMigration({positions:[null],buildings:[],safeAnchors:[]});
 assert.equal(result.blocked,1);
 assert.equal(result.proposals[0].to,null);
 assert.throws(()=>planHomefrontPositionMigration({positions:[],buildings:[],step:0}),RangeError);
});
