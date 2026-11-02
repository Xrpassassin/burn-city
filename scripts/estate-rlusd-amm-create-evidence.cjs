'use strict';
// Independent, read-only evidence for the AMMCreate that minted the Estates LP.
// Asset debits are ledger metadata, not quotes or inferred historical cost.
const {balanceDelta,value}=require('../server/estate-liquidity-ledger');
const {lpDelta}=require('./estate-rlusd-lp-history.cjs');
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const HASH='59FAA96D8EF6A5C35747E22E664A7E0A8FBEA5F373D746B5EF3A58E5558FBE43';
const IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const issuedEq=(a,b)=>a&&typeof a==='object'&&a.currency===b.currency&&a.issuer===b.issuer;
function evidence(tx){
 const body=tx?.tx_json||tx;
 if(tx?.validated!==true||tx.meta?.TransactionResult!=='tesSUCCESS'||body.Account!==TREASURY||body.TransactionType!=='AMMCreate')
  throw Error('validated_treasury_amm_create_required');
 const contributions=[body.Amount,body.Amount2];
 if(!contributions.some(x=>issuedEq(x,IMG))||!contributions.some(x=>issuedEq(x,RLUSD)))
  throw Error('unexpected_amm_create_assets');
 const depositedImg=balanceDelta(tx,TREASURY,IMG);
 const depositedRlusd=balanceDelta(tx,TREASURY,RLUSD);
 if(!depositedImg.lt(0)||!depositedRlusd.lt(0))throw Error('unexpected_treasury_asset_movements');
 const issued=lpDelta({validated:true,meta:tx.meta});
 if(!issued||!issued.gt(0))throw Error('lp_mint_proof_missing');
 return {readOnly:true,hash:HASH,ledger:tx.ledger_index||body.ledger_index,
  transactionType:body.TransactionType,
  requestedImg:contributions.find(x=>issuedEq(x,IMG)).value,
  requestedRlusd:contributions.find(x=>issuedEq(x,RLUSD)).value,
  actualImgDebit:depositedImg.negated().toFixed(),
  actualRlusdDebit:depositedRlusd.negated().toFixed(),
  mintedLp:issued.toFixed(),feeDrops:body.Fee,
  lpMintVerified:true,initialAcquisitionCostBasisVerified:false,
  principalAccountingEligible:false,rewardsApproved:false};
}
async function main(){
 const r=await fetch('https://s1.ripple.com:51234/',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({method:'tx',params:[{transaction:HASH,binary:false}]}),
  signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('xrpl_read_http_'+r.status);
 const data=(await r.json()).result;
 if(data?.error)throw Error('xrpl_read_result_'+data.error);
 console.log('ESTATES_INITIAL_POOL_CONTRIBUTION='+JSON.stringify(evidence(data)));
}
if(require.main===module)main().catch(e=>{console.error('ESTATES_AMM_CREATE_ERROR='+e.message);process.exitCode=1});
module.exports={evidence};
