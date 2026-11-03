'use strict';
const assert=require('node:assert/strict');
const {planEstateRlusdAcquisitionSplit:plan}=require('./estate-rlusd-acquisition-ratio-preview');
const {splitEstateCapital}=require('./estate-capital-allocation');
const priceBase={
 poolImg:'1000',poolRlusd:'10',
 referenceXrpPerImg:'0.002',referenceXrpPerRlusd:'0.2'
};
const mansion=splitEstateCapital('300000000');
assert.equal(mansion.imgRlusdDrops,'297000000');
assert.equal(mansion.operatingReserveDrops,'3000000');
const equal=plan({...priceBase,earmarkedCapitalDrops:mansion.imgRlusdDrops});
assert.equal(equal.readOnly,true);
assert.equal(equal.indicativeImgAcquisitionBudgetDrops,'148500000');
assert.equal(equal.indicativeRlusdAcquisitionBudgetDrops,'148500000');
assert.equal(equal.indicativeImgSpendingBps,'5000');
assert.equal(equal.referencePriceMismatchBps,'0');
assert.equal(equal.referencePoolValueSidesExactlyEqual,true);
assert.equal(equal.budgetConserved,true);
assert.equal(equal.purchaseAuthorized,false);
assert.equal(equal.tradingAuthorized,false);
assert.equal(equal.ammDepositAuthorized,false);
assert.equal(equal.rewardsAuthorized,false);
assert.equal(equal.independentExecutableQuotesAndDepthChecksRequired,true);
const drift=plan({...priceBase,earmarkedCapitalDrops:mansion.imgRlusdDrops,
 referenceXrpPerImg:'0.0020204'});
assert.equal(drift.indicativeImgAcquisitionBudgetDrops,
  (297000000n*20204n/(20204n+20000n)).toString());
assert.equal(drift.indicativeRlusdAcquisitionBudgetDrops,
  (297000000n-BigInt(drift.indicativeImgAcquisitionBudgetDrops)).toString());
assert.equal(drift.referencePoolValueSidesExactlyEqual,false);
assert.ok(Number(drift.referencePriceMismatchBps)>0);
assert.ok(BigInt(drift.indicativeImgAcquisitionBudgetDrops)>148500000n);
assert.ok(BigInt(drift.indicativeRlusdAcquisitionBudgetDrops)<148500000n);
const reversed=plan({...priceBase,earmarkedCapitalDrops:'297000000',
 referenceXrpPerImg:'0.00198'});
assert.ok(BigInt(reversed.indicativeImgAcquisitionBudgetDrops)<148500000n);
const dust=plan({...priceBase,earmarkedCapitalDrops:'1'});
assert.equal(dust.bothAcquisitionBudgetsNonzero,false);
assert.equal(dust.indicativeImgAcquisitionBudgetDrops,'0');
assert.equal(dust.indicativeRlusdAcquisitionBudgetDrops,'1');
for(const budget of ['0','2','100000000000000000000000']){
 const p=plan({...priceBase,earmarkedCapitalDrops:budget});
 assert.equal(BigInt(p.indicativeImgAcquisitionBudgetDrops)+BigInt(p.indicativeRlusdAcquisitionBudgetDrops),BigInt(budget));
}
const trailer=splitEstateCapital('3000000');
const smaller=plan({...priceBase,earmarkedCapitalDrops:trailer.imgRlusdDrops});
assert.equal(smaller.indicativeImgAcquisitionBudgetDrops,'1485000');
assert.equal(smaller.indicativeRlusdAcquisitionBudgetDrops,'1485000');
for(const bad of [undefined,null,1,'-1','1e3','01','0.000001']){
 assert.throws(()=>plan({...priceBase,earmarkedCapitalDrops:bad}),/earmarked_capital_integer_drops_required/);
}
for(const bad of ['0','-1','1e-5','01','0.0000000000000000001',null,1]){
 assert.throws(()=>plan({...priceBase,earmarkedCapitalDrops:'297000000',referenceXrpPerImg:bad}),/reference_xrp_per_img_positive_decimal_required/);
}
assert.throws(()=>plan({...priceBase,earmarkedCapitalDrops:'297000000',poolRlusd:'0'}),/pool_rlusd_positive_decimal_required/);
console.log('Estates reference-price acquisition split: full capital conservation, aligned and drifting spot, precision, no-activation controls passed');
