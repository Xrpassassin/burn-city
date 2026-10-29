'use strict';
const {reconcileAmmWithVerifiedIdentity}=require('./estate-amm-verified-reconciliation');
// Read-only verification of stored treasury history entries. Every AMM record
// must be independently fetched and checked against its stored hash and ledger.
async function verifyStoredAmmHistoryEntry(client,entry,{treasury,imgIssuer,plxIssuer}={}){
 if(!entry||typeof entry.hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(entry.hash)||!Number.isSafeInteger(entry.ledgerIndex)||entry.ledgerIndex<1)throw new TypeError('valid_stored_history_entry_required');
 if(entry.validated!==true)throw new Error('stored_entry_not_validated');
 const result=await reconcileAmmWithVerifiedIdentity(client,entry.hash,{treasury,imgIssuer,plxIssuer});
 if(result.hash?.toUpperCase()!==entry.hash.toUpperCase()||result.ledgerIndex!==entry.ledgerIndex)throw new Error('stored_history_transaction_mismatch');
 if(result.distributable!==false||result.realizedProfitVerified!==false)throw new Error('unsafe_accounting_classification');
 return Object.freeze({...result,storedHashVerified:true,storedLedgerVerified:true,historyComplete:false,distributable:false});
}
module.exports={verifyStoredAmmHistoryEntry};
