'use strict';
const assert=require('node:assert/strict');
const {delta}=require('../scripts/estate-legacy-asset-flow-audit.cjs');
const account='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const issue={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const wrap=(kind,prior,after,high=false,flagOnly=false)=>{
 const low=high?issue.issuer:account,highAddress=high?account:issue.issuer;
 const fields={Balance:{currency:issue.currency,value:after},
  LowLimit:{issuer:low},HighLimit:{issuer:highAddress}};
 const node={LedgerEntryType:'RippleState',
  ...(kind==='CreatedNode'?{NewFields:fields}:{FinalFields:fields}),
  ...(kind==='ModifiedNode'&&!flagOnly?{PreviousFields:{Balance:{currency:issue.currency,value:prior}}}:{})};
 return {[kind]:node};
};
const sample=x=>({validated:true,meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[x]}});
assert.equal(delta(sample(wrap('ModifiedNode','5','7')),issue,account),'2');
assert.equal(delta(sample(wrap('ModifiedNode','-5','-7',true)),issue,account),'2');
assert.equal(delta(sample(wrap('CreatedNode','0','7')),issue,account),'7');
assert.equal(delta(sample(wrap('DeletedNode','7','7')),issue,account),'-7');
assert.equal(delta(sample(wrap('ModifiedNode','7','7',false,true)),issue,account),null);
assert.equal(delta(sample({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Account:account,Balance:'100'}}}),issue,account),null);
assert.throws(()=>delta({validated:false,meta:{AffectedNodes:[]}},issue,account),/validated_tx_metadata_required/);
console.log('Legacy asset-flow metadata: balances, flags, created and deleted trustlines passed');
