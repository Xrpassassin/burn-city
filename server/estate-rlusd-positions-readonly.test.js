'use strict';
const assert=require('node:assert/strict');
const {inspectVerifiedImgRlusdPositions:inspect}=require('./estate-rlusd-positions-readonly');
const positions=[
 {id:'treasury-a',pair:'img-rlusd',treasuryOwned:true,basisVerified:true,valuationVerified:true,principalBaseline:'400',currentLiquidationValue:'550'},
 {id:'treasury-b',pair:'img-rlusd',treasuryOwned:true,basisVerified:true,valuationVerified:true,principalBaseline:'600',currentLiquidationValue:'750'}
];
const input={positions,expectedPositionCount:2,realizedNetProfit:'200',
 independentlyVerifiedLiquidSurplus:'200',outstandingLiabilities:'50',operatingReserve:'50',
 evidenceValidated:true,valuationFresh:true};
const result=inspect(input);
assert.equal(result.principalBaselineUnits,'1000');
assert.equal(result.liquidationValueUnits,'1300');
assert.equal(result.distributableUnits,'200');
assert.equal(inspect({...input,expectedPositionCount:3}).distributableUnits,'0');
assert.equal(inspect({...input,positions:[{...positions[0],basisVerified:false},positions[1]]}).distributableUnits,'0');
assert.equal(inspect({...input,evidenceValidated:false}).distributableUnits,'0');
assert.equal(inspect({...input,positions:[] ,expectedPositionCount:0}).distributableUnits,'0');
assert.throws(()=>inspect({...input,positions:[positions[0],positions[0]]}));
assert.throws(()=>inspect({...input,positions:[{...positions[0],pair:'img-plx'},positions[1]]}));
console.log('IMG/RLUSD read-only ownership aggregation tests passed');
