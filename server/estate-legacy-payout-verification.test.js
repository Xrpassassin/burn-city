'use strict';
const assert=require('node:assert/strict');
const {verifiedPayout:check}=require('./estate-legacy-payout-verification');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const imgIssuer='rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const owner='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ',hash='A'.repeat(64);
const amount={currency:'IMG',issuer:imgIssuer,value:'0.01'};
const tx={Account:treasury,Destination:owner,TransactionType:'Payment',Amount:amount,Memos:[{Memo:{MemoData:'455354415445'}}]};
const row={state:'confirmed',owner,tx_hash:hash,currency:'IMG',img_units:'10000',
 tx_json:JSON.stringify(tx),delivered:JSON.stringify(amount),
 spent_img_units:'10000',remainder_img_units:'0'};
const meta={TransactionResult:'tesSUCCESS',delivered_amount:amount,AffectedNodes:[
 {ModifiedNode:{LedgerEntryType:'RippleState',
 FinalFields:{Balance:{currency:'IMG',value:'4.99'},LowLimit:{issuer:treasury},HighLimit:{issuer:imgIssuer}},
 PreviousFields:{Balance:{currency:'IMG',value:'5'}}}}
]};
const receipt={validated:true,ledger_index:101,hash,tx_json:tx,meta};
const context={treasury,imgIssuer};
const verified=check(row,receipt,context);
assert.equal(verified.sourceImgUnits,'10000');
assert.equal(verified.onChainValidated,true);
assert.equal(verified.payoutLiabilityClosedByThisModule,false);
assert.equal(verified.financialActivationAuthorized,false);
assert.throws(()=>check({...row,state:'queued'},receipt,context),/confirmed_payment_record_required/);
assert.throws(()=>check({...row,tx_hash:'B'.repeat(64)},receipt,context),/validated_historical_payment_required/);
assert.throws(()=>check(row,{...receipt,validated:false},context),/validated_historical_payment_required/);
assert.throws(()=>check(row,{...receipt,meta:{...meta,TransactionResult:'tecNO_LINE'}},context),/validated_historical_payment_required/);
assert.throws(()=>check(row,{...receipt,tx_json:{...tx,Destination:imgIssuer}},context),/historical_payment_delivery_conflict/);
assert.throws(()=>check(row,{...receipt,meta:{...meta,delivered_amount:{...amount,value:'0.009'}}},context),/historical_payment_delivery_conflict/);
assert.throws(()=>check({...row,delivered:JSON.stringify({...amount,value:'0.02'})},receipt,context),/historical_payment_delivery_conflict/);
assert.throws(()=>check(row,{...receipt,tx_json:{...tx,Memos:[]}},context),/historical_payment_delivery_conflict/);
assert.throws(()=>check(row,{...receipt,meta:{...meta,AffectedNodes:[]}},context),/source_debit_proof_required/);
assert.throws(()=>check({...row,spent_img_units:'9999'},receipt,context),/historical_spend_journal_conflict/);
assert.throws(()=>check({...row,remainder_img_units:'1'},receipt,context),/historical_remainder_journal_conflict/);
const xrp={...row,currency:'XRP',img_units:'10001',remainder_img_units:'1'};
assert.equal(check(xrp,receipt,context).unspentBudgetUnits,'1');
console.log('Independent validated historic Estate payout proofs: delivery, memo, debit and journal tests passed');
