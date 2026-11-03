'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateHomefrontMigrationCandidates:validate}=require('../server/homefront-migration-preflight');
test('migration preflight cannot approve or apply v2 candidates',()=>{
  const result=validate([{id:'player1',to:{x:0,z:0}}]);
  assert.equal(result.canApply,false);
  assert.equal(result.previewOnly,true);
  assert.equal(result.results[0].approved,false);
});
test('migration preflight rejects missing target and snapshot-occupied target',()=>{
  assert.equal(validate([{id:'p',to:null}]).results[0].reason,'missing_or_invalid_destination');
  const occupied=validate([{id:'p',to:{x:0,z:0}}],{positions:[{id:'other',x:0,z:0}]});
  // Whether v1 geometry is safe or not, this must never approve.
  assert.equal(occupied.results[0].approved,false);
});
test('migration preflight does not mutate positions or proposals',()=>{
  const proposals=[{id:'p',to:{x:30,z:30}}], positions=[{id:'p',x:0,z:0}];
  const before=JSON.stringify([proposals,positions]);
  validate(proposals,{positions});
  assert.equal(JSON.stringify([proposals,positions]),before);
  assert.throws(()=>validate(null),TypeError);
});
