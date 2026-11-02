'use strict';
const assert=require('node:assert/strict');
const {inspectValidatedRlusdWithdrawal:inspect,isRlusdPoolWithdrawal:isCandidate}
 =require('./estate-rlusd-realized-withdrawal-evidence');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const img={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const rlusd={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const lp={currency:'0383CE00506A32900ADE91477C8761466F8D1D65',issuer:pool};
const line=(asset,previous,current,issuer=asset.issuer)=>({
 ModifiedNode:{LedgerEntryType:'RippleState',
  FinalFields:{LowLimit:{issuer:treasury},HighLimit:{issuer},Balance:{currency:asset.currency,value:current}},
  PreviousFields:{Balance:{currency:asset.currency,value:previous}}}
});
const xrp=(before,after)=>({ModifiedNode:{LedgerEntryType:'AccountRoot',
 FinalFields:{Account:treasury,Balance:after},PreviousFields:{Balance:before}}});
const sample={validated:true,ledger_index:108060700,hash:'A'.repeat(64),
 tx_json:{TransactionType:'AMMWithdraw',Account:treasury,Asset:img,Asset2:rlusd,
  LPTokenIn:{...lp,value:'1.5'},Fee:'12'},
 meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[
  line(img,'100','110'),line(rlusd,'20','20.01'),line(lp,'80','78.5'),
  xrp('1000000','999988')
 ]}};
assert.equal(isCandidate(sample),true);
const evidence=inspect(sample);
assert.equal(evidence.imgReturned,'10');
assert.equal(evidence.rlusdReturned,'0.01');
assert.equal(evidence.lpBurned,'1.5');
assert.equal(evidence.distributableProfitUnits,'0');
assert.equal(evidence.realizedProfitVerified,false);
assert.equal(evidence.signingAuthorized,false);
assert.equal(inspect({...sample,tx_json:{...sample.tx_json,Asset:rlusd,Asset2:img}}).lpBurned,'1.5');
assert.equal(isCandidate({...sample,tx_json:{...sample.tx_json,TransactionType:'Payment'}}),false);
assert.throws(()=>inspect({...sample,tx_json:{...sample.tx_json,TransactionType:'Payment'}}),/not_img_rlusd/);
assert.throws(()=>inspect({...sample,validated:false}),/validated_treasury_withdrawal_required/);
assert.throws(()=>inspect({...sample,meta:{...sample.meta,TransactionResult:'tecUNFUNDED_PAYMENT'}}),/validated_treasury_withdrawal_required/);
assert.throws(()=>inspect({...sample,tx_json:{...sample.tx_json,Account:pool}}),/validated_treasury_withdrawal_required/);
assert.throws(()=>inspect({...sample,tx_json:{...sample.tx_json,LPTokenIn:{...lp,value:'2'}}}),/lp_token_in_and_burn_disagree/);
assert.throws(()=>inspect({...sample,tx_json:{...sample.tx_json,LPTokenIn:{...lp,issuer:treasury}}}),/lp_token_in_and_burn_disagree/);
assert.throws(()=>inspect({...sample,meta:{...sample.meta,AffectedNodes:[
 line(img,'100','99'),line(rlusd,'20','20.01'),line(lp,'80','78.5'),xrp('1000000','999988') ]}}),/unexpected_amm_withdrawal_movements/);
assert.throws(()=>inspect({...sample,meta:{...sample.meta,AffectedNodes:[
 line(img,'100','110'),line(rlusd,'20','20.01'),line(lp,'80','81.5'),xrp('1000000','999988') ]}}),/unexpected_amm_withdrawal_movements/);
assert.throws(()=>inspect({...sample,meta:{...sample.meta,AffectedNodes:[
 line(img,'100','110'),line(rlusd,'20','20.01'),line(lp,'80','78.5'),xrp('1000000','999000') ]}}),/unexpected_amm_withdrawal_movements/);
assert.throws(()=>inspect({...sample,tx_json:{...sample.tx_json,Asset2:{...rlusd,issuer:pool}}}),/not_img_rlusd/);
console.log('Validated IMG/RLUSD withdrawal provenance is evidence-only; principal never classified as profit');
