'use strict';
const assert = require('node:assert/strict');
const Events = require('./homefront-interior-events');
const Interiors = require('./homefront-interiors');
const Catalog = require('../client/arena/homefront-interior-world.mjs');
const World = require('./homefront-world');
const Inventory = require('./homefront-inventory');

const at=1_800_000_000_000;
let state={flags:[],openedDoors:[],updatedAt:0};
let event = Events.record(state,{landmarkId:'exchange_market',actionId:'rolling_shutter',now:at});
state=event.state;
assert.equal(event.event.kind,'alarm');
assert.equal(event.event.noise,70);
assert.equal(event.event.roomId,'market_floor');
assert.equal(event.event.landmarkId,'exchange_market');
assert.equal(event.event.at,at);
assert.equal(event.event.id,'exchange_market:1');
assert.ok(event.event.message.includes('Rolling shutter'));
assert.equal(event.event.message.includes('account'),false);
assert.equal(Events.recent(state,'exchange_market',at).length,1);
assert.deepEqual(Events.recent(state,'exchange_market',at+Events.EVENT_TTL_MS+1),[],
  'old events never remain in live building presence');
assert.deepEqual(Events.recent(state,'mercy_hospital',at),[],
  'a different building cannot replay this event');
assert.throws(()=>Events.record(state,{landmarkId:'fake',actionId:'rolling_shutter',now:at}),/invalid_interior_event/);
assert.throws(()=>Events.record(state,{landmarkId:'exchange_market',actionId:'__proto__',now:at}),/invalid_interior_event/);
assert.throws(()=>Events.record(state,{landmarkId:'exchange_market',actionId:'rolling_shutter',now:Infinity}),/invalid_interior_event/);
const forged=Events.normalize({eventSeq:9,events:[
  {seq:7,actionId:'rolling_shutter',at}, {seq:8,actionId:'not_a_real_action',at},
  {seq:10,actionId:'rolling_shutter',at},{seq:9,actionId:'stockroom_shelves',at:'garbage'}
]},'exchange_market');
assert.equal(forged.events.length,1,'event storage accepts only known, sequenced authored catalog actions');
for(let i=0;i<11;i++)state=Events.record(state,{landmarkId:'exchange_market',actionId:'rolling_shutter',now:at+i+1}).state;
assert.equal(state.events.length,Events.MAX_EVENTS,'older events are bounded in persistent world state');
assert.equal(state.eventSeq,12);

let privateState={}, shared={};
const playerA={x:-39.1,z:32.7,inventory:Inventory.normalize({}),lastSeen:at};
const playerB={x:-39.1,z:32.7,inventory:Inventory.normalize({}),lastSeen:at};
for(const id of ['a','b'])privateState=Interiors.enter(privateState,{
  account:id,player:id==='a'?playerA:playerB,landmarkId:'exchange_market',now:at
}).state;
const first=Interiors.action(privateState,{
  account:'a',player:playerA,actionId:'rolling_shutter',now:at+1,shared
});
privateState=first.state;shared=first.shared;
assert.equal(first.event.kind,'alarm');
assert.equal(first.event.noise,70);
assert.equal(Events.recent(shared.exchange_market,'exchange_market',at+1).length,1);
assert.throws(()=>Interiors.action(privateState,{
  account:'a',player:playerA,actionId:'rolling_shutter',now:at+2,shared
}),/interior_action_unavailable/,'one character cannot reactivate the same alarm for infinite noise');

let world=World.enter(World.defaultWorld(),'a',at).world;
world=World.enter(world,'b',at).world;
world=World.enter(world,'outsider',at).world;
world.interiors=privateState;world.sharedInteriors=shared;
for(const id of ['a','b']){world.players[id].x=-39.1;world.players[id].z=32.7;world.players[id].lastSeen=at+1;}
world.players.outsider.x=55;world.players.outsider.z=55;world.players.outsider.lastSeen=at+1;
assert.equal(World.shareInteriorNoise(world,{
  sourceAccount:'a',landmarkId:'exchange_market',level:70,now:at+1
}),2,'both co-located survivors hear the shared shutter noise');
assert.equal(world.players.a.noiseLevel,70);
assert.equal(world.players.b.noiseLevel,70);
assert.equal(world.players.outsider.noiseLevel||0,0);
assert.equal(World.shareInteriorNoise(world,{
  sourceAccount:'outsider',landmarkId:'exchange_market',level:100,now:at+1
}),0,'unrelated accounts cannot emit cross-building noise');
const aSnapshot=World.snapshot(world,'a',at+1);
const bSnapshot=World.snapshot(world,'b',at+1);
assert.equal(aSnapshot.interiorInstance.mechanisms.events[0].id,bSnapshot.interiorInstance.mechanisms.events[0].id);
assert.equal(aSnapshot.interiorInstance.mechanisms.events[0].kind,'alarm');
assert.equal(World.snapshot(world,'outsider',at+1).interiorInstance,null,
  'outsider receives no internal alarm feed');
assert.equal(World.snapshot(world,'a',at+Events.EVENT_TTL_MS+2).interiorInstance?.mechanisms.events.length||0,0,
  'event expires from building snapshot after TTL');

const clueSite=Interiors.LANDMARKS.north_bus_depot, scout={x:clueSite.x+1.15,z:clueSite.z-1.1,inventory:Inventory.normalize({})};
let privateClues=Interiors.enter({}, {account:'a',player:scout,landmarkId:'north_bus_depot',now:at}).state;
const found=Interiors.action(privateClues,{account:'a',player:scout,actionId:'route_board',now:at+20});
privateClues=found.state;
assert.equal(found.event.kind,'evidence');
assert.equal(found.event.noise,0);
assert.ok(Interiors.evidenceSnapshot(privateClues,'a').some(c=>c.id==='route_board'));
assert.deepEqual(Interiors.evidenceSnapshot(privateClues,'b'),[]);
assert.equal(Catalog.availableInteriorActions(Catalog.interiorForLandmark('north_bus_depot'),
  privateClues.a.interiors.north_bus_depot).some(item=>item.id==='route_board'),false,
  'a discovered note is no longer offered as an indefinitely re-triggerable action');
assert.throws(()=>Interiors.action(privateClues,{account:'a',player:scout,actionId:'route_board',now:at+21}),/interior_action_unavailable/);
const reloaded=Interiors.normalize(JSON.parse(JSON.stringify(privateClues)));
assert.equal(Interiors.evidenceSnapshot(reloaded,'a')[0].id,'route_board');
assert.ok(Interiors.evidenceSnapshot(reloaded,'a')[0].text.includes('River Checkpoint'));
console.log('Homefront server-owned shared alarms, noise, evidence and event privacy tests passed.');
