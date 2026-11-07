import assert from 'node:assert/strict';
import {observedBurnPreview} from './observed-burn-preview.mjs';
const cases = [
 ['IMM','rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM',31310513918336.77,13],
 ['XRPyro','rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000',0.0005958474732607322,19]
];
for (const [name,tokenKey,observedReturns,transactionCount] of cases) {
 const result=observedBurnPreview({name,tokenKey,observedReturns,transactionCount,scanComplete:false});
 assert.ok(result && result.fraction>0 && result.fraction<1);
 assert.equal(result.status,'indicative_partial_scan');
 assert.equal(observedBurnPreview({name,tokenKey:'wrong',observedReturns,transactionCount,scanComplete:false}),null);
 assert.equal(observedBurnPreview({name,tokenKey,observedReturns,transactionCount,scanComplete:true}),null);
 assert.equal(observedBurnPreview({name,tokenKey,observedReturns:result.baseline*1.1,transactionCount,scanComplete:false}),null);
 assert.equal(observedBurnPreview({name,tokenKey,observedReturns,transactionCount:0,scanComplete:false}),null);
}
console.log('Partial observation stays explicitly unverified and identity-checked');
