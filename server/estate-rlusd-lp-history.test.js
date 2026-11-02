'use strict';
const assert=require('node:assert/strict');
const {lpDelta}=require('../scripts/estate-rlusd-lp-history.cjs');
const treasury='t',pool='p',currency='lp';
const balance=v=>({currency,value:v});
const node=(type,before,after,{high=false,flagOnly=false}={})=>{
 const low=high?pool:treasury,highAccount=high?treasury:pool;
 const f={LowLimit:{issuer:low},HighLimit:{issuer:highAccount},Balance:balance(after)};
 const n={LedgerEntryType:'RippleState',
   ...(type==='CreatedNode'?{NewFields:f}:{FinalFields:f}),
   ...(type==='ModifiedNode'&&!flagOnly?{PreviousFields:{Balance:balance(before)}}:{})};
 return {[type]:n};
};
const entry=x=>({validated:true,meta:{AffectedNodes:[x],TransactionResult:'tesSUCCESS'}});
assert.equal(lpDelta(entry(node('CreatedNode','0','8.5')),treasury,pool,currency).toFixed(),'8.5');
assert.equal(lpDelta(entry(node('ModifiedNode','8.5','3.25')),treasury,pool,currency).toFixed(),'-5.25');
assert.equal(lpDelta(entry(node('DeletedNode','2','2')),treasury,pool,currency).toFixed(),'-2');
assert.equal(lpDelta(entry(node('CreatedNode','0','-7',{high:true})),treasury,pool,currency).toFixed(),'7');
assert.equal(lpDelta(entry(node('ModifiedNode','-7','-4',{high:true})),treasury,pool,currency).toFixed(),'-3');
assert.equal(lpDelta(entry(node('ModifiedNode','8','8',{flagOnly:true})),treasury,pool,currency),null);
assert.equal(lpDelta(entry({ModifiedNode:{LedgerEntryType:'AccountRoot',FinalFields:{Balance:'1'}}}),treasury,pool,currency),null);
assert.throws(()=>lpDelta({validated:false,meta:{AffectedNodes:[]}},treasury,pool,currency));
console.log('Estates validated LP trustline history tests passed');
