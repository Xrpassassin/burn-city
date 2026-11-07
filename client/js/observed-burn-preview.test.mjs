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

const immKey='rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM';
const immPreview=values=>observedBurnPreview({name:'IMM',tokenKey:immKey,
  outstandingSource:'xrpl_gateway_balances',outstandingSupply:800472463677779.8,
  observedReturns:31310513918336.77,transactionCount:13,scanComplete:false,...values});
const imm=immPreview();
assert.equal(imm.status,'indicative_outstanding_supply');
assert.ok(imm.fraction>.09 && imm.fraction<.11);
assert.equal(imm.baseline,888888888888888);
assert.equal(imm.outstanding,800472463677779.8);
assert.equal(immPreview({outstandingSupply:889000000000000}),null);
assert.equal(immPreview({outstandingSupply:-1}),null);
assert.equal(immPreview({outstandingSource:'market_data'}),null);
assert.equal(immPreview({tokenKey:'wrong'}),null);
assert.equal(immPreview({outstandingSupply:undefined}).status,'indicative_partial_scan');
console.log('Partial scans and ledger-backed XRPyro/IMM supply estimates remain independently labeled and identity-checked');
