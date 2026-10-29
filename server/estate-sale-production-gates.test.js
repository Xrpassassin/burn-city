'use strict';
// Production safety gate: never accidentally expose real XRP payment flows.
// Any deliberate activation requires an explicit code review and update to this test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
for(const [name,pattern] of [
 ['reservation API',/const estateReservationApi\s*=\s*createEstateReservationApi\(Pay\.sdb,\s*\{\s*enabled:\s*false\s*\}\)/],
 ['Xaman payment session',/const estatePaymentSession\s*=\s*createEstateXamanPaymentSession\(Pay\.sdb,\s*\{\s*enabled:\s*false\s*\}\)/],
 ['ownership finalization',/const estateFinalization\s*=\s*createEstateSaleFinalization\(Pay\.sdb,\s*\{\s*enabled:\s*false\s*\}\)/]
]){
 assert.match(source,pattern,'Production Estates '+name+' must remain explicitly disabled');
}
console.log('Production Estates XRP sale kill switches verified disabled');
