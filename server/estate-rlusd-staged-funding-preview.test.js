'use strict';
const assert=require('node:assert/strict');
const {previewEstateStagedFunding:preview}=require('./estate-rlusd-staged-funding-preview');
const {inspectEstateTierFundingCapacity:inspect}=require('./estate-rlusd-tier-funding-capacity');
const tiers=require('../client/data/estate-catalog.json').tiers;
const report=inspect({tiers,indicativeMaxPurchaseDrops:'9097480'});
assert.equal(report.stagedFundingAvailableOnlyAsReadOnlyPreview,true);
assert.equal(report.tiers.length,5);
const expected=[['trailer','2970000','0','1'],['apartment','9006505','5843495','2'],['starter','9006505','65243495','9'],['family','9006505','139493495','17'],['mansion','9006505','287993495','33']];
for (const [id,first,left,stages] of expected){
 const row=report.tiers.find(t=>t.tier===id);
 assert.equal(row.stagedFundingPreview.illustrativeFirstStageDrops,first,id);
 assert.equal(row.stagedFundingPreview.unallocatedPrincipalAfterFirstStageDrops,left,id);
 assert.equal(row.stagedFundingPreview.illustrativeStageCountAtUnchangedDepth,stages,id);
 assert.equal(BigInt(first)+BigInt(left),BigInt(row.plannedImgRlusdCapitalDrops));
 assert.equal(BigInt(row.plannedImgRlusdCapitalDrops)+BigInt(row.plannedOperatingReserveDrops),BigInt(row.purchaseDrops));
 assert.equal(row.stagedFundingPreview.stageOneTransactionAuthorized,false);
 assert.equal(row.stagedFundingPreview.proportionalDepositsDoNotFixPreexistingPriceDeviation,true);
}
const zero=preview({earmarkedCapitalDrops:'297000000',indicativeMaxPurchaseDrops:'0'});
assert.equal(zero.illustrativeFirstStageDrops,'0');
assert.equal(zero.illustrativeStageCountAtUnchangedDepth,null);
assert.equal(zero.unallocatedPrincipalAfterFirstStageDrops,'297000000');
const tiny=preview({earmarkedCapitalDrops:'1',indicativeMaxPurchaseDrops:'1'});
assert.equal(tiny.illustrativeFirstStageDrops,'0');
assert.equal(tiny.unallocatedPrincipalAfterFirstStageDrops,'1');
for(const v of ['-1','0.1','01','1e6',null,1])assert.throws(()=>preview({earmarkedCapitalDrops:v,indicativeMaxPurchaseDrops:'10'}),/earmarked_capital_drops_required/);
assert.throws(()=>preview({earmarkedCapitalDrops:'100',indicativeMaxPurchaseDrops:'-1'}),/indicative_pool_capacity_drops_required/);
console.log('IMG/RLUSD staged funding read-only previews: integer-drop partitions, capacity guards and no activation passed');
