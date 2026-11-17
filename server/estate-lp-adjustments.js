'use strict';
// Bookkeeping-only adjustments to the estate's tracked IMG/PLX LP for operator-initiated, on-ledger
// LP movements (e.g. the Nov 17, 2026 1,000 LP "unlock" send to Pollux, tx EDF5C1A5...). Nothing is
// signed here. Each adjustment is keyed by the validated tx hash (idempotent) and must be proven on ledger.
const {N}=require('./estate-liquidity-ledger');
const V=require('./estate-v4-plan');
const HASH=/^[0-9A-F]{64}$/;
function ensure(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_lp_adjustments(
  tx_hash TEXT PRIMARY KEY, pool TEXT NOT NULL, lp_delta TEXT NOT NULL, destination TEXT, ledger_index INTEGER NOT NULL,
  reason TEXT NOT NULL, created_ms INTEGER NOT NULL)`);
}
const has=(db,t)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
// Tracked IMG/PLX LP = migration LP + v4 IMG/PLX deposits + adjustments.
function trackedImgPlxLp(db){
 let n=new N(0);
 if(has(db,'estate_plx_migration'))n=n.plus(db.prepare("SELECT lp_out FROM estate_plx_migration WHERE id='v1' AND state='completed'").get()?.lp_out||'0');
 if(has(db,'estate_v4_deposits'))for(const r of db.prepare("SELECT lp_out FROM estate_v4_deposits WHERE pair='img-plx' AND lp_out IS NOT NULL").all())n=n.plus(r.lp_out||'0');
 if(has(db,'estate_lp_adjustments'))for(const r of db.prepare('SELECT lp_delta FROM estate_lp_adjustments WHERE pool=?').all(V.IMG_PLX_POOL))n=n.plus(r.lp_delta);
 return n;
}
function adjustments(db){return has(db,'estate_lp_adjustments')?db.prepare('SELECT * FROM estate_lp_adjustments ORDER BY created_ms').all():[];}
// Prove an outgoing LP payment from the treasury on the validated ledger.
async function proveLpSend(client,{hash,treasury,pool=V.IMG_PLX_POOL}){
 hash=String(hash||'').toUpperCase();if(!HASH.test(hash))throw Error('tx_hash_required');
 const t=(await client.request({command:'tx',transaction:hash})).result;
 const tx=t.tx_json||t,meta=t.meta,d=meta?.delivered_amount;
 if(t.validated!==true||meta?.TransactionResult!=='tesSUCCESS')throw Error('tx_not_validated_success');
 if(tx.TransactionType!=='Payment'||tx.Account!==treasury||tx.Destination===treasury)throw Error('not_outgoing_treasury_payment');
 const amm=(await client.request({command:'amm_info',amm_account:pool,ledger_index:'validated'})).result.amm;
 if(!d||typeof d!=='object'||d.issuer!==pool||d.currency!==amm.lp_token.currency)throw Error('not_img_plx_lp');
 return {hash,lp:d.value,destination:tx.Destination,ledgerIndex:Number(t.ledger_index||tx.ledger_index),lpCurrency:amm.lp_token.currency};
}
function bookLpSend(db,proof,{reason,now=Date.now}={}){
 ensure(db);
 const r=db.prepare('INSERT OR IGNORE INTO estate_lp_adjustments VALUES(?,?,?,?,?,?,?)')
  .run(proof.hash,V.IMG_PLX_POOL,new N(proof.lp).negated().toFixed(),proof.destination,proof.ledgerIndex,reason||'operator_lp_send',now());
 return {booked:r.changes===1};
}
module.exports={ensure,trackedImgPlxLp,adjustments,proveLpSend,bookLpSend};
