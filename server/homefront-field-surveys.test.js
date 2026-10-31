'use strict';
const assert = require('node:assert/strict');
const Surveys = require('./homefront-field-surveys');
const Inventory = require('./homefront-inventory');

assert.equal(Surveys.CONTRACTS.length,4);
assert.ok(Surveys.CONTRACTS.every(c => c.sites.length === 3));
const [evac, industrial, medical, deep] = Surveys.CONTRACTS;
const visited = [...evac.sites];
const progress = Surveys.surveySnapshot({}, 'alice', visited);
assert.equal(progress.find(c=>c.id===evac.id).status,'ready');
assert.equal(progress.find(c=>c.id===industrial.id).status,'incomplete');
assert.equal(progress.find(c=>c.id===industrial.id).remaining.length,3);
let ledger = {};
const alice = {x:1,z:2,inventory:Inventory.normalize({})};
const granted = Surveys.claim(ledger,{account:'alice',player:alice,contractId:evac.id,discoveredIds:visited,now:1234});
ledger = granted.ledger;
assert.deepEqual(granted.supplies,[{item:'food',amount:1},{item:'water',amount:1}]);
assert.equal(alice.inventory.food,1);
assert.equal(alice.inventory.water,1);
assert.equal(Surveys.surveySnapshot(ledger,'alice',visited)[0].status,'claimed');
assert.throws(()=>Surveys.claim(ledger,{account:'alice',player:alice,contractId:evac.id,discoveredIds:visited,now:1235}),/field_survey_already_claimed/,
 'same player cannot claim twice, even on another request');
assert.equal(alice.inventory.food,1,'replay cannot mint a second ration');
assert.throws(()=>Surveys.claim(ledger,{account:'alice',player:alice,contractId:industrial.id,discoveredIds:visited,now:1236}),/field_survey_incomplete/);
assert.throws(()=>Surveys.claim(ledger,{account:'alice',player:alice,contractId:'__proto__',discoveredIds:visited,now:1236}),/unknown_field_survey/);
assert.throws(()=>Surveys.claim(ledger,{account:'alice',player:alice,contractId:medical.id,discoveredIds:medical.sites,now:0}),/invalid_server_time/);
assert.throws(()=>Surveys.claim(ledger,{account:'alice',player:{x:Infinity,z:0},contractId:industrial.id,discoveredIds:industrial.sites,now:1236}),/not_in_expedition/);
const bob = {x:1,z:2,inventory:Inventory.normalize({})};
const second = Surveys.claim(ledger,{account:'bob',player:bob,contractId:evac.id,discoveredIds:visited,now:1237});
assert.equal(second.inventory.food,1,'shared expedition does not consume other players\x27 personal survey rewards');
assert.equal(Surveys.surveySnapshot(second.ledger,'alice',visited)[0].status,'claimed');
assert.equal(Surveys.surveySnapshot(second.ledger,'bob',visited)[0].status,'claimed');
const full = {x:0,z:0,inventory:Inventory.normalize({scrap:8,wood:4})}; // 24/24 weight
const before = JSON.stringify(full.inventory);
const savedBefore=JSON.stringify(second.ledger);
assert.throws(()=>Surveys.claim(second.ledger,{account:'full',player:full,contractId:evac.id,discoveredIds:evac.sites,now:1240}),/inventory_full/);
assert.equal(JSON.stringify(full.inventory),before,'failed capacity check leaves all items untouched');
assert.equal(JSON.stringify(second.ledger),savedBefore,'failed capacity check does not consume claim');
assert.equal(Surveys.surveySnapshot(second.ledger,'full',evac.sites)[0].status,'ready');
const saved = JSON.parse(JSON.stringify(second.ledger));
const cleaned = Surveys.normalize({
  ...saved, invalid: {'bogus':999, 'industrial_feeder_survey':NaN},
  __proto__: {'evacuation_survey':999},
  'danger':{'evacuation_survey':-1,'medical_corridor_survey':'999'}
});
assert.equal(cleaned.invalid,undefined);
assert.equal(cleaned.danger,undefined);
assert.equal(cleaned.alice.evacuation_survey,1234);
assert.equal(Surveys.surveySnapshot(cleaned,'alice',deep.sites).find(c=>c.id===deep.id).status,'ready');
assert.equal(Surveys.surveySnapshot({},'alice',['non_site','constructor']).filter(c=>c.status==='ready').length,0);
console.log('Homefront field survey one-time, capacity and multi-account tests passed.');
