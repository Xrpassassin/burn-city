'use strict';
const assert=require('node:assert/strict');
const {evidence}=require('../scripts/estate-rlusd-amm-create-evidence.cjs');
const treasury='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const pool='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const img={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const rlusd={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const lp={currency:'0383CE00506A32900ADE91477C8761466F8D1D65',issuer:pool};
const line=(issue,amount)=>({CreatedNode:{LedgerEntryType:'RippleState',NewFields:{
 Balance:{currency:issue.currency,value:amount},
 LowLimit:{issuer:treasury},HighLimit:{issuer:issue.issuer}
}}});
const sample={validated:true,ledger_index:108016045,
 tx_json:{Account:treasury,TransactionType:'AMMCreate',Amount:{...img,value:'3100'},Amount2:{...rlusd,value:'3.106054465'},Fee:'200000'},
 meta:{TransactionResult:'tesSUCCESS',AffectedNodes:[line(img,'-3100'),line(rlusd,'-3.106054465'),line(lp,'98.1262902666762')]}};
const r=evidence(sample);
assert.equal(r.actualImgDebit,'3100');
assert.equal(r.actualRlusdDebit,'3.106054465');
assert.equal(r.mintedLp,'98.1262902666762');
assert.equal(r.initialAcquisitionCostBasisVerified,false);
assert.equal(r.rewardsApproved,false);
assert.throws(()=>evidence({...sample,validated:false}));
assert.throws(()=>evidence({...sample,tx_json:{...sample.tx_json,Amount:{...img,value:'3101'}}}),/amm_creation_debit_mismatch/);
assert.throws(()=>evidence({...sample,meta:{...sample.meta,AffectedNodes:[line(img,'-3100'),line(rlusd,'-3.106054465') ]}}),/lp_mint_proof_missing/);
console.log('AMMCreate exact debit and LP mint evidence tests passed');
