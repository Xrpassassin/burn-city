'use strict';
// BURN-only launch provenance. Inputs must come from trusted validated-ledger RPC.
// This establishes a denominator, never completeness of later return history.
const { BURN_ISSUER: issuer, BURN_CURRENCY: currency, BURN_LAUNCH_SUPPLY: supply } = require('./issuer-return-history');
const G = require('../client/js/goldlock');
const ISSUANCE_HASH='798EADC17691B5D964DEDC5AFCBC67092026667682D039F7FFC2E4F04FA98C66';
const ISSUANCE_LEDGER=92601097, LOCK_LEDGER=92601106;
function assessBurnLaunchEvidence({issuance,genesis,locked,current,issuerTransactions}={}) {
 const errors=[];
 const receipt=issuance?.result||issuance,tx=receipt?.tx_json||receipt?.tx||receipt;
 const atGenesis=genesis?.result||genesis,atLock=locked?.result||locked,atCurrent=current?.result||current;
 const delivered=receipt?.meta?.delivered_amount??receipt?.meta?.DeliveredAmount;
 if(receipt?.validated!==true||(receipt.hash||tx?.hash)!==ISSUANCE_HASH||receipt.ledger_index!==ISSUANCE_LEDGER||
    tx?.TransactionType!=='Payment'||tx.Account!==issuer||tx.Destination!== 'rr65nLv5bFtEQ7CYNrUqTD2n3zQsHSVWV'||
    receipt.meta?.TransactionResult!=='tesSUCCESS'||delivered?.issuer!==issuer||delivered?.currency!==currency||delivered?.value!==supply)errors.push('validated launch issuance receipt does not match BURN anchor');
 if(atGenesis?.validated!==true||atGenesis.account!==issuer||atGenesis.ledger_index!==ISSUANCE_LEDGER||
    atGenesis.obligations?.[currency]!==supply||Object.keys(atGenesis.assets||{}).length||Object.keys(atGenesis.balances||{}).length||Object.keys(atGenesis.locked||{}).length)errors.push('validated launch ledger does not show the complete 1Q outstanding supply');
 for(const [name,snapshot] of [['lock',atLock],['current',atCurrent]]){
  if(snapshot?.validated!==true||snapshot.account_data?.Account!==issuer||!G.isBlackholedInfo(snapshot)||
     snapshot.account_data?.Sequence!==92601078||snapshot.account_data?.OwnerCount!==0)errors.push(name+' issuer state does not prove the expected locked sequence');
 }
 if(atLock?.ledger_index!==LOCK_LEDGER||!Number.isSafeInteger(atCurrent?.ledger_index)||atCurrent.ledger_index<LOCK_LEDGER)errors.push('invalid issuer snapshot ledger');
 const expected=['Payment','Payment','AccountSet','Payment','SetRegularKey','AccountSet'];
 const signed=Array.isArray(issuerTransactions)?[...issuerTransactions].sort((a,b)=>a.Sequence-b.Sequence):[];
 if(signed.length!==6||signed.some((t,i)=>t.Account!==issuer||t.Sequence!==92601072+i||t.TransactionType!==expected[i]||!Number.isSafeInteger(t.ledger_index)||t.ledger_index>LOCK_LEDGER))errors.push('issuer sequence history is incomplete or includes unexpected operations');
 if(signed[3]?.hash!==ISSUANCE_HASH||signed[4]?.RegularKey!=='rrrrrrrrrrrrrrrrrrrrBZbvji'||signed[5]?.SetFlag!==4)errors.push('issuance and key-lock sequence do not match');
 return {verified:errors.length===0,errors,issuer,currency,launch_supply:supply,launch_ledger:ISSUANCE_LEDGER,
  issuance_hash:ISSUANCE_HASH,issuer_locked_ledger:LOCK_LEDGER,
  note:'Denominator is total outstanding BURN immediately after its initial issuance; it includes AMM holdings and is not a tradable-float estimate.'};
}
module.exports={assessBurnLaunchEvidence,ISSUANCE_HASH,ISSUANCE_LEDGER,LOCK_LEDGER};
