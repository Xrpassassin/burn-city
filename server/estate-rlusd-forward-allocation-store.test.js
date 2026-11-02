'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {CATALOG,propertyWeight}=require('./estate-economy');
const {createEstateRlusdForwardStartStore}=require('./estate-rlusd-forward-start-store');
const {createEstateRlusdForwardAllocationStore}=require('./estate-rlusd-forward-allocation-store');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE estate_property_ownership(
 property_id TEXT PRIMARY KEY,acct TEXT NOT NULL,share_units INTEGER NOT NULL,purchased_at INTEGER NOT NULL
);
CREATE TABLE estate_hourly_payouts(id TEXT PRIMARY KEY,state TEXT);
INSERT INTO estate_hourly_payouts VALUES('legacy-not-waived','queued');`);
const props=CATALOG.properties.filter(p=>propertyWeight(p.id)>0);
assert.ok(props.length>=2);
const ownerA='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const ownerB='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V';
const insert=db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?)');
insert.run(props[0].id,ownerA,propertyWeight(props[0].id),1000000);
insert.run(props[1].id,ownerB,propertyWeight(props[1].id),1000000);
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
createEstateRlusdForwardStartStore(db).stage({
 ledgerIndex:1000,ledgerHash:'A'.repeat(64),ledgerCloseTimeMs:3600001,
 poolAccount:pool,historicalPrincipalUnits:'1000',openingLiquidationUnits:'1200',
 ledgerValidated:true,fundingSourcesReconciled:true,liabilitiesReviewed:true
});
const ledger=createEstateRlusdForwardAllocationStore(db);
const first={receiptHash:'B'.repeat(64),receiptLedgerIndex:1001,
 receiptTimeMs:7200000,poolAccount:pool,accountingUnit:'micro_RLUSD',
 cumulativeRealizedProfitUnits:'500',cumulativeRealizedLossUnits:'0',
 verifiedLiquidSurplusUnits:'500',currentLiquidationUnits:'2000',
 capitalAddedSinceStartUnits:'0',otherOutstandingLiabilitiesUnits:'100',
 operatingReserveUnits:'100',receiptValidated:true,realizationVerified:true,
 evidenceDeduplicated:true,valuationFresh:true,ownershipReconciled:true};
assert.throws(()=>ledger.stageVerifiedRealization({...first,receiptTimeMs:7199999}),/unverified_or_prestart_realization/);
assert.throws(()=>ledger.stageVerifiedRealization({...first,receiptLedgerIndex:1000}),/unverified_or_prestart_realization/);
assert.throws(()=>ledger.stageVerifiedRealization({...first,receiptValidated:false}),/unverified_or_prestart_realization/);
assert.throws(()=>ledger.stageVerifiedRealization({...first,accountingUnit:'IMG'}),/reporting_unit_mismatch/);
assert.throws(()=>ledger.stageVerifiedRealization({...first,poolAccount:'rOther'}),/unverified_or_prestart_realization/);
assert.equal(ledger.totalHeldUnits(),'0');
const a=ledger.stageVerifiedRealization(first);
assert.equal(a.receipt.drafted_units,'500');
assert.equal(a.receipt.state,'held');
assert.equal(a.allocations.reduce((x,y)=>x+BigInt(y.amount_units),0n),500n);
assert.ok(a.allocations.every(r=>r.state==='held'));
assert.equal(ledger.totalHeldUnits(),'500');
assert.throws(()=>ledger.stageVerifiedRealization(first),/duplicate_realization_receipt/);
assert.throws(()=>ledger.stageVerifiedRealization({...first,receiptHash:'C'.repeat(64),receiptLedgerIndex:1002,receiptTimeMs:7200001}),/no_verified_unreserved_profit/);
assert.equal(ledger.totalHeldUnits(),'500');
assert.throws(()=>ledger.stageVerifiedRealization({...first,receiptHash:'C'.repeat(64),receiptLedgerIndex:999,receiptTimeMs:7200001}),/nonmonotonic_realization_order/);
const later={...first,receiptHash:'D'.repeat(64),receiptLedgerIndex:1003,
 receiptTimeMs:10800000,cumulativeRealizedProfitUnits:'900',
 verifiedLiquidSurplusUnits:'900',currentLiquidationUnits:'2600'};
const b=ledger.stageVerifiedRealization(later);
assert.equal(b.receipt.already_reserved_units,'500');
assert.equal(b.receipt.drafted_units,'400');
assert.equal(ledger.totalHeldUnits(),'900');
assert.equal(a.receipt.epoch_start_ms,7200000);
assert.equal(b.receipt.epoch_start_ms,10800000);
assert.throws(()=>ledger.previewClosedHour(7200000,10799999),/complete_verified_hour_required/);
assert.throws(()=>ledger.previewClosedHour(7200001,10800000),/invalid_utc_hour/);
const hour1=ledger.previewClosedHour(7200000,10800000);
assert.equal(hour1.receiptCount,1);
assert.equal(hour1.totalUnits,'500');
assert.equal(hour1.allocations.reduce((n,r)=>n+BigInt(r.amountUnits),0n),500n);
assert.equal(hour1.executionEnabled,false);
const hour2=ledger.previewClosedHour(10800000,14400000);
assert.equal(hour2.totalUnits,'400');
assert.equal(hour2.allocations.reduce((n,r)=>n+BigInt(r.amountUnits),0n),400n);
assert.equal(ledger.previewClosedHour(14400000,18000000).totalUnits,'0');

assert.equal(b.allocations.reduce((x,y)=>x+BigInt(y.amount_units),0n),400n);
assert.equal(createEstateRlusdForwardAllocationStore(db).totalHeldUnits(),'900');
assert.equal(db.prepare('SELECT state FROM estate_hourly_payouts WHERE id=?').get('legacy-not-waived').state,'queued');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM estate_rlusd_forward_allocation_drafts').get().n,2);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM estate_rlusd_forward_owner_drafts WHERE state='held'").get().n,4);
assert.throws(()=>ledger.stageVerifiedRealization({...later,receiptHash:'E'.repeat(64),
 receiptLedgerIndex:1004,receiptTimeMs:10800001,currentLiquidationUnits:'1000'}),/no_verified_unreserved_profit/);
db.close();
console.log('Forward-only held RLUSD drafts, owner snapshots, replay safety and cumulative reserves passed');
