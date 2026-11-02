'use strict';
// Evidence-only inspection of realized assets from an IMG/RLUSD AMM withdrawal.
// AMM proceeds include returned principal. This module NEVER labels them profit,
// creates rewards, stages an entitlement, builds a transaction, or signs anything.
const {balanceDelta,xrpMovement,value}=require('./estate-liquidity-ledger');
const {lpDelta}=require('../scripts/estate-rlusd-lp-history.cjs');
const HASH=/^[A-Fa-f0-9]{64}$/;
const IMG={currency:'IMG',issuer:'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd'};
const RLUSD={currency:'524C555344000000000000000000000000000000',issuer:'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'};
const TREASURY='rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
const POOL='rhPErqSNp1PzSDTgQpK4F637AEKHfbhR4f';
const LP='0383CE00506A32900ADE91477C8761466F8D1D65';
const matches=(a,b)=>a&&a.currency===b.currency&&a.issuer===b.issuer;
function isRlusdPoolWithdrawal(tx){
 const body=tx?.tx_json||tx;
 return !!body&&body.TransactionType==='AMMWithdraw'&&
  ((matches(body.Asset,IMG)&&matches(body.Asset2,RLUSD))||
   (matches(body.Asset,RLUSD)&&matches(body.Asset2,IMG)));
}
function inspectValidatedRlusdWithdrawal(tx){
 const body=tx?.tx_json||tx;
 if(!isRlusdPoolWithdrawal(tx))throw Error('not_img_rlusd_amm_withdrawal');
 if(tx?.validated!==true||tx?.meta?.TransactionResult!=='tesSUCCESS'||
   !Array.isArray(tx.meta.AffectedNodes)||body.Account!==TREASURY)
  throw Error('validated_treasury_withdrawal_required');
 const ledger=Number(tx.ledger_index??body.ledger_index);
 if(!Number.isSafeInteger(ledger)||ledger<1)throw Error('validated_ledger_required');
 const hash=tx.hash||body.hash;
 if(!HASH.test(hash||''))throw Error('transaction_hash_required');
 if(typeof body.Fee!=='string'||!/^[0-9]+$/.test(body.Fee))
  throw Error('network_fee_required');
 // A dual-asset exit is the only currently supported evidence shape; other
 // withdraw flags/one-sided exits require their own accounting verifier.
 const img=balanceDelta(tx,TREASURY,IMG),rlusd=balanceDelta(tx,TREASURY,RLUSD);
 const burned=lpDelta(tx,TREASURY,POOL,LP);
 const xrp=xrpMovement(tx,TREASURY);
 if(!img.gt(0)||!rlusd.gt(0)||!burned||!burned.lt(0)||
    !xrp.eq(0))throw Error('unexpected_amm_withdrawal_movements');
 // If the submitted LPTokenIn is present, verify the exact pool and size
 // against the observed burn, not simply a transaction request.
 if(body.LPTokenIn&&(body.LPTokenIn.currency!==LP||
  body.LPTokenIn.issuer!==POOL||
  !value(body.LPTokenIn.value).eq(burned.negated())))
   throw Error('lp_token_in_and_burn_disagree');
 return Object.freeze({
  readOnly:true,hash:hash.toUpperCase(),ledgerIndex:ledger,
  treasury:TREASURY,poolAccount:POOL,
  imgReturned:img.toFixed(),rlusdReturned:rlusd.toFixed(),
  lpBurned:burned.negated().toFixed(),networkFeeDrops:body.Fee,
  evidenceKind:'return_of_liquidity_capital_and_assets',
  distributableProfitUnits:'0',
  economicCostBasisVerified:false,realizedProfitVerified:false,
  ownershipAndReserveReconciled:false,signingAuthorized:false
 });
}
module.exports={isRlusdPoolWithdrawal,inspectValidatedRlusdWithdrawal};
