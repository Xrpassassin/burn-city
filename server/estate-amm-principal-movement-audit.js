'use strict';
// Conservative ordered AMM movement audit. These are token movements, NOT
// independently established cost basis or realized profit.
function auditAmmPrincipalMovements(records,{requireHistoricalIdentity=true}={}){
 if(!Array.isArray(records))throw new TypeError('records_required');
 const seen=new Set();let lastLedger=-1;
 let deposits=0,withdrawals=0,uncertain=0;
 for(const item of records){
  if(!item||typeof item.hash!=='string'||!/^[A-Fa-f0-9]{64}$/.test(item.hash)||!Number.isSafeInteger(item.ledgerIndex)||item.ledgerIndex<0)throw new Error('invalid_movement_identity');
  const hash=item.hash.toUpperCase();
  if(seen.has(hash))throw new Error('duplicate_movement_hash');seen.add(hash);
  if(item.ledgerIndex<lastLedger)throw new Error('out_of_order_movement');lastLedger=item.ledgerIndex;
  if(item.distributable!==false||item.principalBasisVerified!==false)throw new Error('unsafe_movement_accounting_claim');
  if(!['liquidity_deposit','liquidity_withdrawal'].includes(item.eventKind))throw new Error('unsupported_amm_event');
  if(typeof item.imgDelta!=='string'||typeof item.plxDelta!=='string'||typeof item.lpTokenDelta!=='string')throw new Error('missing_movement_deltas');
  for(const delta of [item.imgDelta,item.plxDelta,item.lpTokenDelta])if(!/^-?\d+(?:\.\d+)?$/.test(delta))throw new Error('invalid_movement_delta');
  const uncertainIdentity=requireHistoricalIdentity&&item.historicalAmmIdentityVerified!==true;
  if(uncertainIdentity)uncertain++;
  if(item.eventKind==='liquidity_deposit')deposits++;else withdrawals++;
 }
 return Object.freeze({movements:records.length,deposits,withdrawals,uncertainHistoricalIdentity:uncertain,historyComplete:false,principalBasisVerified:false,realizedProfitVerified:false,distributable:false});
}
module.exports={auditAmmPrincipalMovements};
