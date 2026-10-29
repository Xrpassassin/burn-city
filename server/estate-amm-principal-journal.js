'use strict';
// Immutable AMM accounting evidence. Staging is not proof of source, value, or profit.
const HASH=/^[A-Fa-f0-9]{64}$/;
const KINDS=new Set(['liquidity_deposit','liquidity_withdrawal','fee_claim','trading_cost']);
function createAmmPrincipalJournal(db) {
 db.exec("CREATE TABLE IF NOT EXISTS estate_amm_accounting_events (event_id TEXT PRIMARY KEY, tx_hash TEXT NOT NULL UNIQUE, pool_id TEXT NOT NULL, event_kind TEXT NOT NULL CHECK(event_kind IN ('liquidity_deposit','liquidity_withdrawal','fee_claim','trading_cost')), img_units TEXT NOT NULL, plx_units TEXT NOT NULL, img_basis_units TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending_verification' CHECK(status = 'pending_verification'), distributable INTEGER NOT NULL DEFAULT 0 CHECK(distributable = 0), recorded_at INTEGER NOT NULL)");
 const insert=db.prepare('INSERT INTO estate_amm_accounting_events (event_id,tx_hash,pool_id,event_kind,img_units,plx_units,img_basis_units,recorded_at) VALUES (?,?,?,?,?,?,?,?)');
 const get=db.prepare('SELECT * FROM estate_amm_accounting_events WHERE event_id=?');
 function stage({eventId,txHash,poolId,eventKind,imgUnits,plxUnits,imgBasisUnits}={}) {
  if(typeof eventId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(eventId)||!HASH.test(txHash||'')||
     typeof poolId!=='string'||!/^[A-Za-z0-9:_-]{1,160}$/.test(poolId)||!KINDS.has(eventKind)||
     ![imgUnits,plxUnits,imgBasisUnits].every(v=>typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)))
   throw new TypeError('invalid_amm_accounting_event');
  insert.run(eventId,txHash.toUpperCase(),poolId,eventKind,imgUnits,plxUnits,imgBasisUnits,Date.now());
  return get.get(eventId);
 }
 return {stage,get:id=>get.get(id)||null};
}
module.exports={createAmmPrincipalJournal};
