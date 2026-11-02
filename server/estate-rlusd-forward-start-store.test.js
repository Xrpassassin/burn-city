'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {createEstateRlusdForwardStartStore:createStore}=require('./estate-rlusd-forward-start-store');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_hourly_payouts(id TEXT PRIMARY KEY,state TEXT);
 INSERT INTO estate_hourly_payouts VALUES('previous-earned-reward','queued');`);
const store=createStore(db);
assert.equal(store.current(),null);
const args={ledgerIndex:160,ledgerHash:'B'.repeat(64),ledgerCloseTimeMs:3600001,
 poolAccount:'rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f',
 historicalPrincipalUnits:'4000',openingLiquidationUnits:'5300',
 ledgerValidated:true,fundingSourcesReconciled:true,liabilitiesReviewed:true};
assert.throws(()=>store.stage({...args,liabilitiesReviewed:false}),/opening_financial_evidence_required/);
assert.equal(store.current(),null);
const start=store.stage(args);
assert.equal(start.firstFullHourMs,7200000);
assert.equal(start.protectedBaselineUnits,'5300');
assert.equal(start.status,'staged');
assert.equal(start.distributionsEnabled,false);
const restarted=createStore(db);
assert.deepEqual(restarted.current(),start);
assert.throws(()=>restarted.stage({...args,ledgerIndex:161}),/already_locked/);
assert.throws(()=>restarted.stage(args),/already_locked/);
assert.equal(db.prepare('SELECT COUNT(*) n FROM estate_rlusd_forward_reward_start').get().n,1);
assert.equal(db.prepare('SELECT state FROM estate_hourly_payouts WHERE id=?').get('previous-earned-reward').state,'queued');
db.close();
console.log('Immutable future-only IMG/RLUSD ledger boundary tests passed');
