'use strict';
const assert=require('node:assert/strict');
const {inspectImgRlusdRewardCapacity:capacity}=require('./estate-rlusd-reward-capacity');
const base={realizedNetProfit:'200',realizedLossCarry:'0',independentlyVerifiedLiquidSurplus:'200',
 principalBaseline:'1000',currentLiquidationValue:'1300',outstandingLiabilities:'50',
 operatingReserve:'50',verified:true,valuationFresh:true,ownershipReconciled:true};
assert.equal(capacity(base).distributableUnits,'200');
assert.equal(capacity({...base,currentLiquidationValue:'1150'}).distributableUnits,'50');
assert.equal(capacity({...base,currentLiquidationValue:'990'}).distributableUnits,'0');
assert.equal(capacity({...base,currentLiquidationValue:'990'}).capitalShortfallUnits,'110');
assert.equal(capacity({...base,realizedLossCarry:'150'}).distributableUnits,'50');
assert.equal(capacity({...base,realizedLossCarry:'300'}).distributableUnits,'0');
assert.equal(capacity({...base,verified:false}).distributableUnits,'0');
assert.equal(capacity({...base,valuationFresh:false}).distributableUnits,'0');
assert.equal(capacity({...base,ownershipReconciled:false}).distributableUnits,'0');
assert.equal(capacity({...base,independentlyVerifiedLiquidSurplus:'0'}).distributableUnits,'0');
assert.throws(()=>capacity({...base,principalBaseline:'-1'}));
assert.throws(()=>capacity({...base,currentLiquidationValue:'1.5'}));
console.log('IMG/RLUSD reward capacity fail-closed tests passed');
