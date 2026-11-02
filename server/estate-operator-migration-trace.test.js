'use strict';
const assert=require('node:assert/strict');
const {tokenDelta,xrpNetDelta,inspect}=require('../scripts/estate-operator-migration-trace.cjs');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const RLUSD={currency:'524C555344000000000000000000000000000000',
 issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const PLX={currency:'PLX',issuer:'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q'};
const HASH='A'.repeat(64);
function trustline(asset,before,after,{high=false,flagOnly=false}={}){
 const f={Balance:{currency:asset.currency,value:after},
  LowLimit:{issuer:high?asset.issuer:treasury},HighLimit:{issuer:high?treasury:asset.issuer}};
 return {ModifiedNode:{LedgerEntryType:'RippleState',FinalFields:f,
  ...(flagOnly?{}:{PreviousFields:{Balance:{currency:asset.currency,value:before}}})}};
}
function root(before='20000000',after='17599988'){
 return {ModifiedNode:{LedgerEntryType:'AccountRoot',
  FinalFields:{Account:treasury,Balance:after},PreviousFields:{Balance:before}}};
}
const tx={validated:true,ledger_index:108016020,hash:HASH,
 tx_json:{TransactionType:'Payment',Account:treasury,Destination:treasury,Fee:'12'},
 meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[
 trustline(PLX,'6','6',{flagOnly:true}),trustline(RLUSD,'0','3.106054465'),
 root()]}};
assert.equal(tokenDelta(tx,RLUSD),'3.106054465');
assert.equal(tokenDelta(tx,PLX),'0');
assert.equal(xrpNetDelta(tx),'-2400000');
const e=inspect(tx);
assert.equal(e.candidateXrpToRlusdPurchase,true);
assert.equal(e.independentlyAllocatedToEstate,false);
assert.equal(inspect({...tx,tx_json:{...tx.tx_json,TransactionType:'TrustSet'}}).candidateXrpToRlusdPurchase,false);
assert.equal(tokenDelta({...tx,meta:{...tx.meta,AffectedNodes:[
 trustline(RLUSD,'-10','-13',{high:true}),root()]}},RLUSD),'3');
assert.throws(()=>inspect({...tx,validated:false}),/validated_treasury_transaction_required/);
assert.throws(()=>inspect({...tx,ledger_index:108015968}),/outside_conversion_window/);
assert.throws(()=>xrpNetDelta({...tx,meta:{...tx.meta,AffectedNodes:[]}}),/unique_treasury_xrp_delta_required/);
assert.throws(()=>tokenDelta({...tx,meta:{...tx.meta,AffectedNodes:[
 trustline(RLUSD,'0','1'),trustline(RLUSD,'1','2'),root()]}},RLUSD),/ambiguous_token_delta/);
assert.equal(inspect({...tx,meta:{...tx.meta,AffectedNodes:[
 trustline(PLX,'13330.3455626686','0'),root('20000000','22397649')]}}).changes.PLX,'-13330.3455626686');
console.log('Estates operator-initiated transition: validated RLUSD/XRP swap evidence and trustline edge cases passed');
