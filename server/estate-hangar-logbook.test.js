'use strict';
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const {createEstateTycoonStore}=require('./estate-tycoon');
const {createEstateHangarLogbook}=require('./estate-hangar-logbook');
const owner='rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV',next='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
let now=1800000000000;
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON; CREATE TABLE estate_property_ownership(property_id TEXT PRIMARY KEY,acct TEXT,purchase_tx TEXT UNIQUE,purchase_amount_drops INTEGER,share_units INTEGER,purchased_at INTEGER)');
for(const [id,price,units,prefix] of [['mansion-01',300,100,'A'],['trailer-01',3,1,'B']])
 db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run(id,owner,prefix.repeat(64),price*1000000,units,1);
const store=createEstateTycoonStore(db);
const acl=(acct,id)=>{
 const own=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(id)?.acct===acct;
 return own?{allowed:true,role:'owner',permissions:['enter','inspect','build']}:
   {allowed:false,role:'visitor',permissions:[],reason:'property_owner_required'};
};
const args={db,tycoonStore:store,accessFor:acl,clock:()=>now};
let hangar=createEstateHangarLogbook(args);
assert.equal(hangar.snapshot('trailer-01',owner).error,'helicopter_tier_restricted');
assert.equal(hangar.snapshot('mansion-01',owner).error,'helicopter_not_unlocked');
const orderId='tycoon_'+'c'.repeat(40);
store.reserve({propertyId:'mansion-01',buyer:owner,itemId:'estate-helicopter',orderId,now});
store.settle({orderId,buyer:owner,txHash:'F'.repeat(64),ledgerIndex:142,now:now+30});
const first=hangar.snapshot('mansion-01',owner);
assert.equal(first.ok,true);
assert.deepEqual(first.style,{paint:'obsidian',trim:'brass',callsign:'BURN AIR'});
assert.equal(first.totals.completedFlights,0);
assert.equal(first.financialRewards,false);assert.equal(first.tokenRewards,false);
assert.equal(first.milestones.firstLanding,false);
assert.equal(hangar.snapshot('mansion-01',next).error,'property_owner_required');
assert.equal(hangar.setStyle({propertyId:'mansion-01',acct:next,paint:'royal',trim:'copper',callsign:'TAKEN'}).error,'property_owner_required');
for(const s of [
 {paint:'invalid',trim:'brass',callsign:'BURN AIR'},
 {paint:'royal',trim:'fake',callsign:'BURN AIR'},
 {paint:'royal',trim:'brass',callsign:'<script>bad'},
 {paint:'royal',trim:'brass',callsign:'    '},
 {paint:'royal',trim:'brass',callsign:'X'.repeat(60)},
 {paint:'royal',trim:'brass',callsign:'SPACE  SPACE'}
])assert.equal(hangar.setStyle({propertyId:'mansion-01',acct:owner,...s}).error,'invalid_hangar_style');
const chosen=hangar.setStyle({propertyId:'mansion-01',acct:owner,paint:'royal',trim:'copper',callsign:'DRAGON ONE'});
assert.deepEqual(chosen.style,{paint:'royal',trim:'copper',callsign:'DRAGON ONE'});
const start=hangar.startFlight({propertyId:'mansion-01',acct:owner});
assert.equal(start.ok,true);assert.match(start.sessionId,/^[0-9a-f]{32}$/);
assert.equal(hangar.startFlight({propertyId:'mansion-01',acct:owner}).sessionId,start.sessionId);
assert.equal(hangar.startFlight({propertyId:'mansion-01',acct:next}).error,'property_owner_required');
for(const invalid of [
 {durationSeconds:-1,routeVisited:[],landed:false},
 {durationSeconds:12345,routeVisited:[],landed:false},
 {durationSeconds:99,routeVisited:[],landed:false},
 {durationSeconds:3,routeVisited:['north-lookout','north-lookout'],landed:true},
 {durationSeconds:3,routeVisited:['unauthorized'],landed:true},
 {durationSeconds:3,routeVisited:[],landed:'true'},
 {durationSeconds:3,routeVisited:['north-lookout','east-coast','south-lake','bad'],landed:true}
])assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:owner,sessionId:start.sessionId,...invalid}).ok,false);
assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:owner,sessionId:'0'.repeat(32),durationSeconds:10,routeVisited:[],landed:true}).error,'flight_session_not_found');
now+=44000;
const finished=hangar.finishFlight({propertyId:'mansion-01',acct:owner,sessionId:start.sessionId,durationSeconds:40,routeVisited:['north-lookout','east-coast','south-lake'],landed:true});
assert.equal(finished.ok,true);assert.equal(finished.flights.length,1);
assert.equal(finished.flights[0].verification,'client_reported');
assert.equal(finished.flights[0].landed,true);
assert.equal(finished.milestones.firstLanding,true);
assert.equal(finished.milestones.oneFlightCircuit,true);
assert.equal(finished.milestones.allLookouts,true);
assert.equal(finished.totals.flightSeconds,40);
assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:owner,sessionId:start.sessionId,durationSeconds:999,routeVisited:[],landed:false}).alreadyFinished,true);
assert.equal(hangar.snapshot('mansion-01',owner).flights.length,1);
assert.equal(store.state('mansion-01').liveRewardShareUnits,100,'flight achievements must not increase active payout weights');
assert.equal(store.state('mansion-01').recordedShareUnits,160,'flight achievements must not mint upgrade shares');
hangar=createEstateHangarLogbook(args);
assert.equal(hangar.snapshot('mansion-01',owner).flights.length,1,'journal survives restart');
assert.equal(hangar.snapshot('mansion-01',owner).style.callsign,'DRAGON ONE','appearance survives restart');
const open=hangar.startFlight({propertyId:'mansion-01',acct:owner});
db.prepare("UPDATE estate_property_ownership SET acct=? WHERE property_id='mansion-01'").run(next);
assert.equal(hangar.snapshot('mansion-01',owner).error,'property_owner_required');
assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:owner,sessionId:open.sessionId,durationSeconds:1,routeVisited:[],landed:false}).error,'property_owner_required');
const transferred=hangar.snapshot('mansion-01',next);
assert.equal(transferred.ok,true);assert.equal(transferred.style.callsign,'DRAGON ONE');
assert.equal(transferred.flights.length,1,'estate-scoped records follow property, without leaking previous owner wallet');
assert(!JSON.stringify(transferred).includes(owner));
const fresh=hangar.startFlight({propertyId:'mansion-01',acct:next});
assert.equal(fresh.reused,false);
assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:next,sessionId:open.sessionId,durationSeconds:1,routeVisited:[],landed:false}).error,'flight_session_not_found');
now+=3600001;
const stale=hangar.startFlight({propertyId:'mansion-01',acct:next});
assert.notEqual(stale.sessionId,fresh.sessionId,'expired sessions cannot permanently block the estate');
assert.equal(hangar.finishFlight({propertyId:'mansion-01',acct:next,sessionId:fresh.sessionId,durationSeconds:50,routeVisited:[],landed:false}).error,'flight_session_expired');
db.close();
console.log('Estate Hangar: owner control, custom paint, isolated non-financial flight journal, milestone/replay protection, resale and expiry passed');
