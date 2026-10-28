'use strict';
const assert=require('node:assert/strict');
const {assessBurnLaunchEvidence,ISSUANCE_HASH}=require('../server/burn-launch-evidence');
const {BURN_ISSUER:issuer,BURN_CURRENCY:currency,BURN_LAUNCH_SUPPLY:supply}=require('../server/issuer-return-history');
const account=ledger=>({validated:true,ledger_index:ledger,account_data:{Account:issuer,Flags:0x00100000,RegularKey:'rrrrrrrrrrrrrrrrrrrrBZbvji',Sequence:92601078,OwnerCount:0,signer_lists:[]}});
const base={issuance:{validated:true,hash:ISSUANCE_HASH,ledger_index:92601097,TransactionType:'Payment',Account:issuer,Destination:'rr65nLv5bFtEQ7CYNrUqTD2n3zQsHSVWV',meta:{TransactionResult:'tesSUCCESS',delivered_amount:{issuer,currency,value:supply}}},
 genesis:{validated:true,account:issuer,ledger_index:92601097,obligations:{[currency]:supply}},locked:account(92601106),current:account(107954472),
 issuerTransactions:['Payment','Payment','AccountSet','Payment','SetRegularKey','AccountSet'].map((TransactionType,i)=>({Account:issuer,TransactionType,Sequence:92601072+i,ledger_index:92601091+i,hash:i===3?ISSUANCE_HASH:'test'+i,...(i===4?{RegularKey:'rrrrrrrrrrrrrrrrrrrrBZbvji'}:{}),...(i===5?{SetFlag:4}:{})}))};
assert.equal(assessBurnLaunchEvidence(base).verified,true);
for(const mutate of [
 x=>x.issuance.validated=false,x=>x.issuance.hash='wrong',x=>x.issuance.meta.delivered_amount.value='999',
 x=>x.issuance.meta.delivered_amount.issuer='wrong',x=>x.genesis.ledger_index++,x=>x.genesis.validated=false,
 x=>x.genesis.obligations[currency]='1',x=>x.genesis.balances={excluded:[]},x=>x.current.account_data.Sequence++,
 x=>x.current.account_data.Flags=0,x=>x.current.account_data.signer_lists=[{SignerQuorum:1}],
 x=>x.current.account_data.RegularKey='rUnknown',x=>x.current.account_data.OwnerCount=1,
 x=>x.issuerTransactions.pop(),x=>x.issuerTransactions[0].TransactionType='OfferCreate',
 x=>x.issuerTransactions[4].RegularKey='rUnknown',x=>x.issuerTransactions[5].SetFlag=0]){
 const copy=structuredClone(base);mutate(copy);assert.equal(assessBurnLaunchEvidence(copy).verified,false);
}
assert.equal(assessBurnLaunchEvidence().verified,false);
console.log('BURN launch evidence: anchor, denominator, issuer sequence and fail-closed checks passed');
