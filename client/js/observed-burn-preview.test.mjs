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

const pyrok='rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000';
const supplyPreview=values=>observedBurnPreview({name:'XRPyro',tokenKey:pyrok,
  outstandingSource:'xrpl_gateway_balances',outstandingSupply:0.6054112530289129,
  observedReturns:0.0005958474732607322,transactionCount:19,scanComplete:false,...values});
const live=supplyPreview();
assert.equal(live.status,'indicative_outstanding_supply');
assert.ok(Math.abs(live.fraction-0.3945887469710871)<1e-12);
assert.ok(live.fraction>.39 && live.fraction<.40);
assert.equal(live.outstanding,0.6054112530289129);
assert.equal(supplyPreview({outstandingSupply:1.2}),null);
assert.equal(supplyPreview({outstandingSupply:-.001}),null);
assert.equal(supplyPreview({outstandingSupply:Infinity}),null);
assert.equal(supplyPreview({outstandingSupply:'0.6054'}),null);
assert.equal(supplyPreview({outstandingSource:'user_input'}),null);
assert.equal(supplyPreview({tokenKey:'XRPYRO'}),null);
assert.equal(supplyPreview({outstandingSupply:1}),null);
assert.equal(supplyPreview({outstandingSupply:0}).fraction,1);
const fallback=supplyPreview({outstandingSupply:undefined});
assert.equal(fallback.status,'indicative_partial_scan');
console.log('Partial scans and live XRPyro supply preview remain independently labeled and identity-checked');
