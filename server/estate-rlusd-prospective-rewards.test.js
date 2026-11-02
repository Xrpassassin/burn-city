'use strict';
const assert=require('node:assert/strict');
const {planProspectiveRlusdStart:plan,inspectProspectiveRlusdReward:inspect}
 =require('./estate-rlusd-prospective-rewards');
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const hash='A'.repeat(64);
const start=plan({ledgerIndex:150,ledgerHash:hash,ledgerCloseTimeMs:2*3600000+15,
 poolAccount:pool,historicalPrincipalUnits:'1000',openingLiquidationUnits:'1200',
 ledgerValidated:true,fundingSourcesReconciled:true,liabilitiesReviewed:true});
assert.equal(start.firstFullHourMs,3*3600000);
assert.equal(start.protectedBaselineUnits,'1200'); // no distributing pre-start gain
assert.equal(start.distributionsEnabled,false);
assert.throws(()=>plan({ledgerIndex:150,ledgerHash:hash,ledgerCloseTimeMs:15,
 poolAccount:pool,historicalPrincipalUnits:'1000',openingLiquidationUnits:'1200',
 ledgerValidated:true}),/opening_financial_evidence_required/);
const good={start,receiptLedgerIndex:151,receiptTimeMs:start.firstFullHourMs,
 receiptHash:'B'.repeat(64),poolAccount:pool,realizedNetProfitUnits:'100',
 realizedLossCarryUnits:'0',verifiedLiquidSurplusUnits:'100',
 currentLiquidationUnits:'1400',capitalAddedSinceStartUnits:'50',
 outstandingLiabilitiesUnits:'20',operatingReserveUnits:'30',
 receiptValidated:true,realizationVerified:true,evidenceDeduplicated:true,
 valuationFresh:true,ownershipReconciled:true};
assert.equal(inspect(good).distributableUnits,'100');
assert.equal(inspect({...good,receiptTimeMs:start.firstFullHourMs-1}).distributableUnits,'0');
assert.equal(inspect({...good,receiptLedgerIndex:150}).distributableUnits,'0');
assert.equal(inspect({...good,receiptValidated:false}).distributableUnits,'0');
assert.equal(inspect({...good,realizationVerified:false}).distributableUnits,'0');
assert.equal(inspect({...good,evidenceDeduplicated:false}).distributableUnits,'0');
assert.equal(inspect({...good,poolAccount:'rOther'}).distributableUnits,'0');
assert.equal(inspect({...good,currentLiquidationUnits:'1220'}).distributableUnits,'0');
assert.equal(inspect({...good,realizedLossCarryUnits:'80'}).distributableUnits,'20');
assert.equal(inspect({...good,valuationFresh:false}).distributableUnits,'0');
assert.equal(inspect({...good,ownershipReconciled:false}).distributableUnits,'0');
assert.throws(()=>inspect({...good,capitalAddedSinceStartUnits:'-1'}));
assert.equal(inspect(good).immutableHistoricRewardsUnaffected,true);
console.log('IMG/RLUSD prospective-only epoch and principal safety checks passed');
