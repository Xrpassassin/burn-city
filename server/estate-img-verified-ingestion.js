'use strict';
// Trusted server-side bridge. Only the verifier may assert a validated receipt.
// Never accept a client-supplied 'verified' flag, delivered amount or source.
const {createImgRewardVerifier}=require('./estate-img-xrpl-receipt-verifier');
const {createImgHourlyRewardLedger}=require('./estate-img-hourly-rewards');
function createVerifiedImgRewardIngestion({client,db,treasury,imgIssuer,allowedSources}={}){
 const config={treasury,imgIssuer,allowedSources};
 const verify=createImgRewardVerifier(client,config);
 const ledger=createImgHourlyRewardLedger(db,config);
 async function ingest(txHash){
  const verifiedReceipt=await verify(txHash);
  const stored=ledger.record(verifiedReceipt);
  return Object.freeze({txHash:verifiedReceipt.txHash,ledgerIndex:verifiedReceipt.ledgerIndex,epochStartMs:stored.epochStartMs,inserted:stored.inserted});
 }
 // Allocation must be called with a server-derived, immutable ownership snapshot.
 // This bridge does not expose an HTTP endpoint or authorize payments.
 function allocateVerified(txHash,holdings){return ledger.allocate({txHash,holdings});}
 return Object.freeze({ingest,allocateVerified});
}
module.exports={createVerifiedImgRewardIngestion};
