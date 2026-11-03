'use strict';
const assert=require('node:assert/strict');
const {previewProportionalEstateDeposit:preview}=require('./estate-rlusd-two-asset-deposit-preview');
const big=preview({
 poolImg:'2000',poolRlusd:'4',
 availableImg:'6000',availableRlusd:'12',
 priceDeviationBps:'102.04'
});
assert.equal(big.readOnly,true);
assert.equal(big.depositMode,'tfTwoAsset');
assert.equal(big.maxImg,'6000');
assert.equal(big.maxRlusd,'12');
assert.equal(big.illustrativeUnmatchedImg,'0');
assert.equal(big.illustrativeUnmatchedRlusd,'0');
assert.equal(big.bothAssetsAvailable,true);
assert.equal(big.indicativeDepositMayExceedCurrentPoolReserves,true);
assert.equal(big.marketPriceWarning,true);
assert.equal(big.sourceXrpAcquisitionDepthIsNotAnAmmDepositSizeCap,true);
assert.equal(big.fundingAndPurchaseAuthorization,false);
const low=preview({
 poolImg:'2000',poolRlusd:'4',
 availableImg:'100',availableRlusd:'1'
});
assert.equal(low.maxImg,'100');
assert.equal(low.maxRlusd,'0.2');
assert.equal(low.illustrativeUnmatchedImg,'0');
assert.equal(low.illustrativeUnmatchedRlusd,'0.8');
const half=preview({
 poolImg:'2000',poolRlusd:'4',
 availableImg:'3000',availableRlusd:'3'
});
assert.equal(half.maxImg,'1500');
assert.equal(half.maxRlusd,'3');
assert.equal(half.illustrativeUnmatchedImg,'1500');
assert.equal(half.illustrativeUnmatchedRlusd,'0');
const noImg=preview({
 poolImg:'2000',poolRlusd:'4',
 availableImg:'0',availableRlusd:'2'
});
assert.equal(noImg.bothAssetsAvailable,false);
assert.equal(noImg.maxImg,'0');
assert.equal(noImg.maxRlusd,'0');
assert.equal(noImg.illustrativeUnmatchedRlusd,'2');
const tiny=preview({
 poolImg:'2000',poolRlusd:'4',
 availableImg:'0.000000000000000001',availableRlusd:'1'
});
assert.equal(tiny.bothAssetsAvailable,false);
assert.equal(tiny.maxImg,'0');
assert.equal(tiny.maxRlusd,'0');
for(const invalid of ['-1','01','1e-5','0.1234567890123456789',1,null]){
 assert.throws(()=>preview({poolImg:invalid,poolRlusd:'4',availableImg:'10',availableRlusd:'10'}),/pool_img_decimal_required/);
}
assert.throws(()=>preview({poolImg:'0',poolRlusd:'4',availableImg:'10',availableRlusd:'10'}),/nonempty_img_rlusd_pool_required/);
assert.throws(()=>preview({poolImg:'2',poolRlusd:'4',availableImg:'10',availableRlusd:'10',priceDeviationBps:'-1'}),/price_deviation_bps_decimal_required/);
console.log('Proportional IMG/RLUSD deposit preview: unbounded two-asset capacity, pool ratio, retained inventory and readonly checks passed');
