'use strict';
// Independently verify a validated XRPL Payment before creating an accounting receipt.
// The caller supplies the transaction hash; all payment details are read from XRPL.
const ACCOUNT=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH=/^[A-Fa-f0-9]{64}$/;
const DECIMAL=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
function canonicalUnits(value){
 if(typeof value!=='string'||!DECIMAL.test(value))throw new Error('invalid_delivered_img');
 const [whole,fraction='']=value.split('.');
 if(fraction.length>6&&/[1-9]/.test(fraction.slice(6)))throw new Error('img_precision_exceeds_six_decimals');
 const units=BigInt(whole)*1000000n+BigInt(fraction.slice(0,6).padEnd(6,'0'));
 if(units<=0n)throw new Error('zero_img_delivery');
 return (units/1000000n).toString()+(units%1000000n?'.'+(units%1000000n).toString().padStart(6,'0').replace(/0+$/,''):'');
}
function createImgRewardVerifier(client,{treasury,imgIssuer,allowedSources}={}){
 if(!client||typeof client.request!=='function')throw new TypeError('xrpl_client_required');
 if(!ACCOUNT.test(treasury||'')||!ACCOUNT.test(imgIssuer||'')||!Array.isArray(allowedSources)||!allowedSources.length||allowedSources.some(s=>!ACCOUNT.test(s)))throw new TypeError('trusted_img_config_required');
 const sources=new Set(allowedSources);
 return async function verifyImgReward(txHash){
  if(typeof txHash!=='string'||!HASH.test(txHash))throw new TypeError('invalid_transaction_hash');
  const response=await client.request({command:'tx',transaction:txHash,binary:false});
  const r=response?.result;
  if(!r||r.validated!==true||r.meta?.TransactionResult!=='tesSUCCESS'||(r.tx_json||r).TransactionType!=='Payment'||!Number.isSafeInteger(r.ledger_index)||r.ledger_index<=0)throw new Error('unvalidated_or_failed_payment');
  const tx=r.tx_json||r;
  const hash=r.hash||tx.hash;
  if(typeof hash!=='string'||hash.toUpperCase()!==txHash.toUpperCase())throw new Error('transaction_hash_mismatch');
  if(!sources.has(tx.Account)||tx.Destination!==treasury)throw new Error('unexpected_img_payment_source_or_destination');
  const delivered=r.meta.delivered_amount;
  if(!delivered||typeof delivered!=='object'||delivered.currency!=='IMG'||delivered.issuer!==imgIssuer)throw new Error('unexpected_delivered_asset');
  const amount=canonicalUnits(delivered.value);
  // XRPL close_time is seconds since 2000-01-01; this timestamp is ledger-derived.
  const date=r.date??tx.date;
  const iso=r.close_time_iso;
  if(date!==undefined&&(!Number.isSafeInteger(date)||date<0))throw new Error('invalid_ledger_close_time');
  if(date===undefined&&typeof iso!=='string')throw new Error('missing_ledger_close_time');
  const receivedAtMs=date!==undefined?(date+946684800)*1000:Date.parse(iso);
  if(typeof iso==='string'&&Date.parse(iso)!==receivedAtMs)throw new Error('conflicting_ledger_close_times');
  if(!Number.isSafeInteger(receivedAtMs))throw new Error('invalid_ledger_close_time');
  return Object.freeze({txHash:txHash.toUpperCase(),ledgerIndex:r.ledger_index,source:tx.Account,destination:tx.Destination,issuer:imgIssuer,amount,receivedAtMs,verified:true});
 };
}
module.exports={createImgRewardVerifier,canonicalUnits};
