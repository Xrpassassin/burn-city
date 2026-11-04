'use strict';
// Read-only, independently validates recorded confirmed Estate payout receipts.
// Never changes legacy payout state, waives claims, signs or submits payments.
const {isDeepStrictEqual}=require('node:util');
const {splitImgAmount}=require('./estate-img-amount');
const {spentMicro}=require('./estate-payout-executor');
const HASH=/^[A-Fa-f0-9]{64}$/;
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const numeric=s=>typeof s==='string'&&/^(?:0|[1-9][0-9]*)$/.test(s);
function eqAmount(a,b){
 if(typeof a==='string'||typeof b==='string')return a===b;
 if(!a||!b||a.currency!==b.currency||a.issuer!==b.issuer)return false;
 try{return splitImgAmount(a.value).exact===splitImgAmount(b.value).exact;}
 catch{return false;}
}
function verifiedPayout(row,receipt,{treasury,imgIssuer}={}){
 if(!row||row.state!=='confirmed'||!HASH.test(row.tx_hash||'')||
    !ACCOUNT.test(row.owner||'')||!ACCOUNT.test(treasury||'')||
    !ACCOUNT.test(imgIssuer||'')||!numeric(row.img_units))
  throw Error('confirmed_payment_record_required');
 let expected,storedDelivered;
 try{
  expected=JSON.parse(row.tx_json);storedDelivered=JSON.parse(row.delivered);
 }catch{throw Error('historical_payment_journal_missing');}
 const tx=receipt?.tx_json||receipt;
 const hash=receipt?.hash||tx?.hash;
 if(receipt?.validated!==true||receipt.meta?.TransactionResult!=='tesSUCCESS'||
    !HASH.test(hash||'')||hash.toUpperCase()!==row.tx_hash.toUpperCase()||
    !Number.isSafeInteger(Number(receipt.ledger_index))||Number(receipt.ledger_index)<1)
  throw Error('validated_historical_payment_required');
 if(tx.TransactionType!=='Payment'||tx.Account!==treasury||
    tx.Destination!==row.owner||!eqAmount(tx.Amount??tx.DeliverMax,expected.Amount)||
    !eqAmount(receipt.meta.delivered_amount,expected.Amount)||
    !eqAmount(storedDelivered,receipt.meta.delivered_amount)||
    !isDeepStrictEqual(tx.Memos,expected.Memos))
  throw Error('historical_payment_delivery_conflict');
 const spent=spentMicro(receipt.meta,treasury,imgIssuer);
 if(spent>BigInt(row.img_units)||(row.currency==='IMG'&&spent!==BigInt(row.img_units)))
  throw Error('historical_payout_source_debit_conflict');
 if(row.spent_img_units!==null&&row.spent_img_units!==undefined&&
    (!numeric(row.spent_img_units)||BigInt(row.spent_img_units)!==spent))
  throw Error('historical_spend_journal_conflict');
 const remainder=BigInt(row.img_units)-spent;
 if(row.remainder_img_units!==null&&row.remainder_img_units!==undefined&&
    (!numeric(row.remainder_img_units)||BigInt(row.remainder_img_units)!==remainder))
  throw Error('historical_remainder_journal_conflict');
 return Object.freeze({hash:hash.toUpperCase(),ledgerIndex:Number(receipt.ledger_index),
  currency:row.currency,sourceImgUnits:spent.toString(),unspentBudgetUnits:remainder.toString(),
  ownerMatched:true,deliveredMatched:true,onChainValidated:true,readOnly:true,
  payoutLiabilityClosedByThisModule:false,financialActivationAuthorized:false});
}
module.exports={verifiedPayout};
